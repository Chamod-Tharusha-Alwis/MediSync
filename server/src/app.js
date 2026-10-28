require('./security/clinicalEntryPolicy').assertClinicalEntry(process.env);

if (process.env.MEDISYNC_QA_BOOTSTRAPPED !== 'true') {
  require('dotenv').config({ quiet: true });
}
require('./security/clinicalEntryPolicy').assertClinicalEntry(process.env);

// ---------------------------------------------------------------------------
// ONLY third-party / Node built-ins at the top level.
// Internal requires (routes, db, cronJobs) are deferred inside startServer()
// so they NEVER run before global.ENCRYPTION_KEY is set by initializeVault().
// ---------------------------------------------------------------------------
const express        = require('express');
const helmet         = require('helmet');
const cors           = require('cors');
const cookieParser   = require('cookie-parser');
const rateLimit      = require('express-rate-limit');
const mongoSanitize  = require('express-mongo-sanitize');
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
  if (process.env.MEDISYNC_QA_BROWSER_RUN === 'true') {
    const bootstrap = global.__MEDISYNC_QA_BROWSER_BOOTSTRAP;
    if (!bootstrap || typeof bootstrap.initializeEncryption !== 'function') throw new Error('Guarded QA encryption bootstrap required');
    return bootstrap.initializeEncryption();
  }
  if (process.env.VAULT_TOKEN === 'bypass') {
    if (process.env.NODE_ENV !== 'test' && process.env.MEDISYNC_TEST_MODE !== 'true') {
      console.error('[FATAL] Vault bypass is only allowed in NODE_ENV=test or MEDISYNC_TEST_MODE=true.');
      process.exit(1);
    }
    if (!process.env.ENCRYPTION_KEY) throw new Error('[FATAL] Missing QA encryption key.');
    global.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
    global.ENCRYPTION_KEYS = { "1": global.ENCRYPTION_KEY };
    global.ACTIVE_KEY_VERSION = 1;
    console.log('[Vault] Bypassed (test mode). Using configured test encryption key.');
    return;
  }

  // Operator-key opt-in for prototype release (no hosted Vault required)
  if (process.env.MEDISYNC_PROTOTYPE_MODE === 'true' && process.env.MEDISYNC_ALLOW_OPERATOR_KEYS === 'true') {
    if (process.env.VAULT_TOKEN === 'bypass') {
      console.error('[FATAL] VAULT_TOKEN=bypass is forbidden in production operator-key mode.');
      process.exit(1);
    }
    const { validateAndLoadOperatorKeys } = require('./security/operatorKeyPolicy');
    const operatorConfig = validateAndLoadOperatorKeys(process.env);
    global.ENCRYPTION_KEYS = operatorConfig.keys;
    global.ACTIVE_KEY_VERSION = operatorConfig.activeVersion;
    global.ENCRYPTION_KEY = operatorConfig.keys[operatorConfig.activeVersion];
    console.warn('[SECURITY WARNING] MEDISYNC_PROTOTYPE_MODE active: Booting with operator-supplied encryption keys. Vault bypassed for prototype only.');
    return;
  }

  const vault = nodeVault({
    apiVersion: 'v1',
    endpoint: process.env.VAULT_URL || 'http://127.0.0.1:8200',
    token: process.env.VAULT_TOKEN,
  });

  if (!process.env.VAULT_TOKEN) {
    throw new Error('FATAL: VAULT_TOKEN environment variable is not defined.');
  }

  try {
    if (!process.env.ENCRYPTION_KEY) {
      throw new Error('FATAL: ENCRYPTION_KEY environment variable is not set.');
    }

    // Ensure the new versioned keys structure exists
    // Startup reads existing provisioned secrets; it never creates key material.
    const keysSecret = await vault.read('secret/data/medisync/keys');

    // Publish the keys globally so every model sees it when require()'d below.
    global.ENCRYPTION_KEYS = keysSecret.data.data.versions;
    global.ACTIVE_KEY_VERSION = keysSecret.data.data.activeVersion;
    // Keep ENCRYPTION_KEY for backward compatibility if any script still relies on it directly
    global.ENCRYPTION_KEY = global.ENCRYPTION_KEYS[global.ACTIVE_KEY_VERSION];

    console.log(`[Vault] Successfully retrieved AES encryption keys (Active version: ${global.ACTIVE_KEY_VERSION}).`);
    return keysSecret.data.data.security || null;
  } catch (err) {
    // Vault is offline or misconfigured – degrade gracefully.
    console.error('');
    console.error('╔══════════════════════════════════════════════════════════════╗');
    console.error('║  ⚠️  [SECURITY WARNING] Vault offline.                        ║');
    console.error('║     Falling back to insecure .env encryption key.            ║');
    console.error('║     DO NOT use this configuration in production!             ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
    console.error('');
    console.error('[Vault] Initialization failed.');

    global.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
    global.ENCRYPTION_KEYS = { "1": process.env.ENCRYPTION_KEY };
    global.ACTIVE_KEY_VERSION = 1;

    // Fail-closed enforcement for Vault in production.
    if (process.env.NODE_ENV === 'production') {
      console.error('[FATAL] Vault is required in production environments.');
      process.exit(1);
    }

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
  require('./security/clinicalEntryPolicy').assertClinicalEntry(process.env);
  const { isAutomatedTestEnvironment, TEST_DB_NAME } = require('./config/dbGuard');
  const qaMode = isAutomatedTestEnvironment();
  const clientOrigin = require('./security/clientOriginPolicy').clientOrigin();
  if (qaMode && (process.env.MEDISYNC_QA_BOOTSTRAPPED !== 'true' || process.env.MONGO_URI)) {
    throw new Error('[FATAL] Test server requires the isolated QA bootstrap and no loaded MONGO_URI.');
  }
  if (!qaMode && process.env.NODE_ENV !== 'production') {
    throw new Error('[FATAL] Live startup requires NODE_ENV=production.');
  }
  // ── Step 1: Set global.ENCRYPTION_KEY ────────────────────────────────────
  // This MUST finish before any require() that could transitively load a
  // Mongoose model, because fieldEncryption() reads `secret` synchronously.
  const securityConfiguration = await initializeVault();
  const securityRuntime = require('./security/securityRuntime');
  securityRuntime.initialize(securityConfiguration, {
    legacyKeys: global.ENCRYPTION_KEYS,
    otherSecrets: [process.env.JWT_SECRET, process.env.JWT_REFRESH_SECRET]
  });

  // ── Step 2: Internal requires (safe now — key is in global scope) ─────────
  // connectDB  → pure mongoose.connect(), no model imports
  // initCronJobs → imports models at the top of cronJobs.js; they will now
  //                see global.ENCRYPTION_KEY already populated
  const connectDB    = require('./config/db');
  const initCronJobs = require('./utils/cronJobs');
  securityRuntime.assertProtectedCompatibility({
    Patient: require('./models/Patient'), Consultation: require('./models/Consultation'),
    fieldPlugin: require('./utils/versionedEncryption'),
    doctorCreate: require('./controllers/doctorController').createConsultation
  });

  // ── Step 3: Connect to MongoDB ────────────────────────────────────────────
  const dbInfo = await connectDB();
  if (process.env.MEDISYNC_QA_BROWSER_RUN === 'true') {
    global.__MEDISYNC_QA_BROWSER_BOOTSTRAP.verifyRuntime(dbInfo);
  }
  if (qaMode && (dbInfo?.dbName !== TEST_DB_NAME ||
    dbInfo?.authenticatedRoles?.length !== 1 ||
    dbInfo.authenticatedRoles[0]?.role !== 'readWrite' ||
    dbInfo.authenticatedRoles[0]?.db !== TEST_DB_NAME)) {
    throw new Error('[FATAL] QA database name or authenticated role was not verified.');
  }

  // The separately guarded browser child retains its existing drain protocol.
  const lifecycle = qaMode ? null : require('./security/applicationShutdown').createApplicationShutdown({
    disconnect: () => require('mongoose').disconnect(),
    closeRedis: () => require('./config/redis').closeRedis()
  });
  try {

  // ── Step 3.1: Initialize Redis OTP store (non-blocking) ───────────────────
  const { initRedis } = require('./config/redis');
  if (process.env.MEDISYNC_QA_BROWSER_RUN !== 'true') await initRedis();

  // ── Step 3.5: Auto-seed Super Admin (skip in automated test mode to preserve IR-03 dataset) ─
  if (!isAutomatedTestEnvironment()) {
    const Admin = require('./models/Admin');
    if (!await Admin.exists({ isActive: true, isSuperAdmin: true })) throw new Error('Approved operator account provisioning is required before live startup');

    // ── Step 4: Start background cron jobs (disabled in automated test mode) ─
    lifecycle?.bind({ jobs: initCronJobs() });
  } else {
    console.log('🛡️ [Test Mode] Skipped superadmin auto-seeding and background cron jobs to preserve IR-03 dataset.');
  }

  // ── Step 5: Build the Express app ────────────────────────────────────────
  const app = express();
  if (process.env.MEDISYNC_QA_BROWSER_RUN === 'true') app.use(global.__MEDISYNC_QA_BROWSER_LIFECYCLE.request);
  app.set('trust proxy', 1);
  const httpServer = http.createServer(app);
  lifecycle?.bind({ httpServer });
  if (lifecycle) app.use((req,res,next) => lifecycle.stopping ? res.status(503).json({error:'Service shutting down'}) : next());

  // Socket.IO – real-time outbreak alerts & broadcasts
  const io = process.env.MEDISYNC_QA_BROWSER_RUN === 'true' ? global.__MEDISYNC_QA_BROWSER_BOOTSTRAP.socket : qaMode ? {
    userSocketMap: new Map(),
    emit() {},
    to() { return this; },
    on() {},
  } : new Server(httpServer, {
    allowRequest: (request, callback) => callback(null, !request.headers.origin || request.headers.origin === clientOrigin),
    cors: {
      origin: clientOrigin,
      credentials: true,
    },
  });
  app.set('io', io);
  lifecycle?.bind({ io });

  // Map userId → socketId for targeted real-time pushes
  io.userSocketMap = new Map();

  if (!qaMode && typeof io.use === 'function') {
    require('./security/socketAuthorization').installSocketAuthorization(io);
  }

  // Core middleware
  app.use(helmet());
  app.use((req, res, next) => {
    res.setHeader('Accept-CH', 'Sec-CH-UA-Model, Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version, Sec-CH-UA, Sec-CH-UA-Mobile');
    res.setHeader('Permissions-Policy', 'ch-ua-model=*, ch-ua-platform=*, ch-ua-platform-version=*');
    next();
  });
  app.use(
    cors({
      origin: clientOrigin,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Only the separately approved browser entry point installs this guard.
  // Ordinary QA startup does not qualify for clinical browser testing.
  if (process.env.MEDISYNC_QA_BROWSER_RUN === 'true') {
    const guard = global.__MEDISYNC_QA_BROWSER_GUARD;
    if (!qaMode || !guard || guard.owner !== process.env.MEDISYNC_QA_BROWSER_OWNER) throw new Error('Missing browser ownership guard');
    const lifecycle = global.__MEDISYNC_QA_BROWSER_LIFECYCLE;
    if(!lifecycle || !global.__MEDISYNC_QA_BROWSER_SHUTDOWN)throw new Error('Missing browser lifecycle');
    require('../tests/helpers/browserQaControls').registerBrowserQaControls(app, {
      guard, lifecycle, dbInfo,
      config: global.__MEDISYNC_QA_BROWSER_BOOTSTRAP.config,
      shutdown: () => global.__MEDISYNC_QA_BROWSER_SHUTDOWN(httpServer),
      readOwnedRecipient: email => require('mongoose').connection.db.collection('patients').findOne({ email, phase5xOwner: guard.owner, isSynthetic: true }),
      capturedEmails: () => global.__MEDISYNC_CAPTURED_TEST_EMAILS || []
    });
  }

  // Express 5 compatible MongoDB operator sanitizer (mutates req.body/query/params in-place)
  const sanitizeInPlace = (obj) => {
    if (!obj || typeof obj !== 'object') return false;
    if (Array.isArray(obj)) {
      let arrayStripped = false;
      for (let i = 0; i < obj.length; i++) {
        if (typeof obj[i] === 'object' && obj[i] !== null) {
          if (sanitizeInPlace(obj[i])) {
            arrayStripped = true;
          }
        }
      }
      return arrayStripped;
    }
    let stripped = false;
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete obj[key];
        stripped = true;
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        const childStripped = sanitizeInPlace(obj[key]);
        if (childStripped && !Array.isArray(obj[key]) && Object.keys(obj[key]).length === 0) {
          delete obj[key];
          stripped = true;
        }
      }
    }
    return stripped;
  };

  app.use((req, res, next) => {
    if (req.body) sanitizeInPlace(req.body);
    if (req.params) sanitizeInPlace(req.params);
    if (req.query) sanitizeInPlace(req.query);
    next();
  });

  // Rate limiting: strict in production, relaxed in development
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 10 : 100,
    message: { error: 'Too many requests from this IP, please try again later.' },
    skip: () => process.env.NODE_ENV !== 'production',
    validate: { trustProxy: false }
  });

  // ── Step 6: Register routes ───────────────────────────────────────────────
  // All route files are require()'d here — AFTER global.ENCRYPTION_KEY is
  // set — so the Mongoose models they pull in (directly or transitively) are
  // always registered with the correct encryption secret.
  // E1 Minimal Profile Check: Exclude ordinary clinical routes during E1 zero-write lifecycle probe
  const isE1ProbeAttempt = Boolean(qaMode && process.env.MEDISYNC_QA_ATTEMPT_ID?.startsWith('5X-E1'));
  if (isE1ProbeAttempt) {
    app.use('/api/qa', require('./routes/qaRoutes'));
    app.get('/api/patient/e1-denied', (req, res) => {
      res.status(423).json({
        error: 'E1 read-only lifecycle lockdown. Patient routes locked.',
        code: 'QA_E1_ROUTE_LOCKED'
      });
    });
  } else {
    app.use('/api/auth',     authLimiter, require('./routes/authRoutes'));
    app.use('/api/public',               require('./routes/publicRoutes'));
    app.use('/api/doctor',               require('./routes/doctorRoutes'));
    app.use('/api/hospital',             require('./routes/hospitalRoutes'));
    app.use('/api/pharmacy',             require('./routes/pharmacyRoutes'));
    if (qaMode) {
      app.use('/api/qa', require('./routes/qaRoutes'));
      app.get('/api/patient/e1-denied', (req, res) => {
        res.status(423).json({
          error: 'E1 read-only lifecycle lockdown. Patient routes locked.',
          code: 'QA_E1_ROUTE_LOCKED'
        });
      });
    }
    app.use('/api/patient',              require('./routes/patientRoutes'));
    app.use('/api/admin',                require('./routes/adminRoutes'));
    app.use('/api/drugs',                require('./routes/drugRoutes'));
    app.use('/api/alerts',               require('./routes/alertRoutes'));
    app.use('/api/tests',                require('./routes/testRoutes'));
    app.use('/api/prescription',         require('./routes/prescriptionRoutes'));
    app.use('/api/prescriptions',        require('./routes/prescriptionRoutes'));
    app.use('/api/lab',                  require('./routes/labRoutes'));
    app.use('/api/notifications',        require('./routes/notificationRoutes'));
    app.use('/api/users',                require('./routes/userRoutes'));
    app.use('/api/support',              require('./routes/supportRoutes'));
    app.use('/api/reviews',              require('./routes/reviewRoutes'));
    app.use('/api/devices',              require('./routes/deviceRoutes'));
  }

  // Health check endpoints for Docker / Render / orchestrator
  app.get(['/health', '/api/health'], require('./security/runtimeHealth').createRuntimeHealth({
    requireRedis: !qaMode || process.env.MEDISYNC_LOCAL_REAL_STACK === 'true',
    requireAdmission: !qaMode,
    admissionReady: () => require('./security/runtimeHealth').hasProductionAdmission(dbInfo),
    stopping: () => lifecycle?.stopping === true
  }));

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  // Global error handler
  app.use(require('./security/apiErrorHandler').apiErrorHandler);

  // Seal only the dedicated QA child, after controls, all routes, 404 and errors.
  if (process.env.MEDISYNC_QA_BROWSER_RUN === 'true') global.__MEDISYNC_QA_BROWSER_LIFECYCLE.instrument(app);

  // ── Step 7: Background ML Engine check (disabled in automated test mode) ──
  const PORT = process.env.PORT || 5000;
  if (process.env.MEDISYNC_QA_BROWSER_RUN === 'true') {
    await global.__MEDISYNC_QA_BROWSER_BOOTSTRAP.listen(httpServer, Number(PORT));
    return { app, httpServer, dbInfo };
  }
  const host = qaMode ? '127.0.0.1' : undefined;
  await require('./security/listenReady').listenReady(httpServer, PORT, host);
  if (lifecycle) {
    lifecycle.installSignals();
    const monitor = require('./security/mlHealthMonitor').createMlHealthMonitor({
      request: require('axios').get,
      url: `${(process.env.ML_ENGINE_URL || 'http://127.0.0.1:5001').replace(/\/$/,'')}/health`
    });
    lifecycle.bind({ monitor }); monitor.start();
  }
  if (qaMode) console.log(`[QA_READY] http://127.0.0.1:${PORT} | db=${dbInfo.dbName} | role=readWrite@${TEST_DB_NAME} | external providers disabled`);
  else console.log(`[Server] Running on port ${PORT}`);
  return { app, httpServer, dbInfo, shutdown: lifecycle?.stop };
  } catch (error) {
    if (lifecycle) await lifecycle.stop();
    throw error;
  }
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('[FATAL] Server failed to start:', err.stack);
    process.exit(1);
  });
}

module.exports = { startServer };
