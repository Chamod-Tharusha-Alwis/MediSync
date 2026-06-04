require('dotenv').config();

// ---------------------------------------------------------------------------
// ONLY third-party / Node built-ins at the top level.
// Internal requires (routes, db, cronJobs) are deferred inside startServer()
// so they NEVER run before global.ENCRYPTION_KEY is set by initializeVault().
// ---------------------------------------------------------------------------
const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit  = require('express-rate-limit');
const http       = require('http');
const { Server } = require('socket.io');
const nodeVault  = require('node-vault');

// ---------------------------------------------------------------------------
// HashiCorp Vault – AES-256 key bootstrap
// ---------------------------------------------------------------------------

/**
 * initializeVault()
 *
 * Fetches the AES-256 encryption key from HashiCorp Vault's KV-v2 engine and
 * stores it on `global.ENCRYPTION_KEY` so that every Mongoose model's
 * field-level encryption plugin resolves the correct key at startup.
 *
 * Must complete before any internal require() that could pull in a Mongoose
 * model — because mongoose-field-encryption captures the secret synchronously
 * at plugin-registration time.
 *
 * Falls back to process.env.ENCRYPTION_KEY when Vault is unreachable.
 */
async function initializeVault() {
  const vault = nodeVault({
    apiVersion: 'v1',
    endpoint: 'http://127.0.0.1:8200',
    token: process.env.VAULT_TOKEN,
  });

  if (!process.env.VAULT_TOKEN) {
    throw new Error('FATAL: VAULT_TOKEN environment variable is not defined.');
  }

  try {
    // Write the dev key into Vault (idempotent – safe on every restart).
    await vault.write('secret/data/medisync', {
      data: {
        AES_ENCRYPTION_KEY:
          process.env.ENCRYPTION_KEY || 'your-fallback-32-byte-secret-key-here',
      },
    });

    // Read the key back from Vault.
    const secret = await vault.read('secret/data/medisync');

    // Publish the key globally so every model sees it when require()'d below.
    global.ENCRYPTION_KEY = secret.data.data.AES_ENCRYPTION_KEY;

    console.log('[Vault] Successfully retrieved AES encryption key.');
  } catch (err) {
    // Vault is offline or misconfigured – degrade gracefully.
    console.error('');
    console.error('╔══════════════════════════════════════════════════════════════╗');
    console.error('║  ⚠️  [SECURITY WARNING] Vault offline.                        ║');
    console.error('║     Falling back to insecure .env encryption key.            ║');
    console.error('║     DO NOT use this configuration in production!             ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
    console.error('');
    console.error('[Vault] Error details:', err.message);

    global.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

    if (!global.ENCRYPTION_KEY) {
      throw new Error(
        '[FATAL] No encryption key available: Vault is offline AND ENCRYPTION_KEY is not set in .env'
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Async server bootstrap  –  strict order: Vault → DB → routes → listen
// ---------------------------------------------------------------------------
async function startServer() {
  // ── Step 1: Set global.ENCRYPTION_KEY ────────────────────────────────────
  // This MUST finish before any require() that could transitively load a
  // Mongoose model, because fieldEncryption() reads `secret` synchronously.
  await initializeVault();

  // ── Step 2: Internal requires (safe now — key is in global scope) ─────────
  // connectDB  → pure mongoose.connect(), no model imports
  // initCronJobs → imports models at the top of cronJobs.js; they will now
  //                see global.ENCRYPTION_KEY already populated
  const connectDB    = require('./config/db');
  const initCronJobs = require('./utils/cronJobs');

  // ── Step 3: Connect to MongoDB ────────────────────────────────────────────
  await connectDB();

  // ── Step 3.1: Initialize Redis OTP store (non-blocking) ───────────────────
  const { initRedis } = require('./config/redis');
  await initRedis();

  // ── Step 3.5: Auto-seed Super Admin ───────────────────────────────────────
  const bcrypt = require('bcryptjs');
  const Admin = require('./models/Admin');
  const adminEmail = 'superadmin@medisync.com';
  const existingAdmin = await Admin.findOne({ email: adminEmail });
  if (!existingAdmin) {
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      throw new Error('FATAL: ADMIN_PASSWORD environment variable is not defined.');
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminPassword, salt);
    await Admin.create({
      fullName: 'Super Administrator',
      name: 'SuperAdmin',
      email: adminEmail,
      password: hashedPassword,
      role: 'admin',
      isSuperAdmin: true,
      isActive: true
    });
    console.log('✅ [DB] Super Admin account automatically seeded.');
  }

  // ── Step 4: Start background cron jobs ───────────────────────────────────
  initCronJobs();

  // ── Step 5: Build the Express app ────────────────────────────────────────
  const app = express();
  const httpServer = http.createServer(app);

  // Socket.IO – real-time outbreak alerts & broadcasts
  const jwt = require('jsonwebtoken');
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      credentials: true,
    },
  });
  app.set('io', io);

  // Map userId → socketId for targeted real-time pushes
  io.userSocketMap = new Map();

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Attempt JWT authentication (graceful – unauthenticated sockets still connect)
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId || decoded.id;
        if (userId) {
          io.userSocketMap.set(userId.toString(), socket.id);
          console.log(`[Socket] Mapped user ${userId} → ${socket.id}`);
        }
      } catch (err) {
        console.warn('[Socket] Invalid JWT on connection:', err.message);
      }
    }

    socket.on('disconnect', () => {
      // Remove any mapping that pointed to this socket
      for (const [uid, sid] of io.userSocketMap.entries()) {
        if (sid === socket.id) {
          io.userSocketMap.delete(uid);
          console.log(`[Socket] Unmapped user ${uid}`);
          break;
        }
      }
      console.log('Client disconnected:', socket.id);
    });
  });

  // Core middleware
  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(cookieParser());

  // Rate limiting: strict in production, relaxed in development
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 10 : 100,
    message: { error: 'Too many requests from this IP, please try again later.' },
    skip: () => process.env.NODE_ENV !== 'production',
  });

  // ── Step 6: Register routes ───────────────────────────────────────────────
  // All route files are require()'d here — AFTER global.ENCRYPTION_KEY is
  // set — so the Mongoose models they pull in (directly or transitively) are
  // always registered with the correct encryption secret.
  app.use('/api/auth',     authLimiter, require('./routes/authRoutes'));
  app.use('/api/public',               require('./routes/publicRoutes'));
  app.use('/api/doctor',               require('./routes/doctorRoutes'));
  app.use('/api/hospital',             require('./routes/hospitalRoutes'));
  app.use('/api/pharmacy',             require('./routes/pharmacyRoutes'));
  app.use('/api/patient',              require('./routes/patientRoutes'));
  app.use('/api/admin',                require('./routes/adminRoutes'));
  app.use('/api/drugs',                require('./routes/drugRoutes'));
  app.use('/api/alerts',               require('./routes/alertRoutes'));
  app.use('/api/tests',                require('./routes/testRoutes'));
  app.use('/api/prescription',         require('./routes/prescriptionRoutes'));
  app.use('/api/lab',                  require('./routes/labRoutes'));
  app.use('/api/notifications',        require('./routes/notificationRoutes'));

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  // Global error handler
  app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  });

  const PORT = process.env.PORT || 5000;
  httpServer.listen(PORT, () => console.log(`[Server] Running on port ${PORT}`));
}

startServer().catch((err) => {
  console.error('[FATAL] Server failed to start:', err.message);
  process.exit(1);
});