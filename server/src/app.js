require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const http = require('http');
const { Server } = require('socket.io');

connectDB();
const app = express();
const httpServer = http.createServer(app);

// Socket.IO for real-time outbreak alerts
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL, credentials: true }
});
app.set('io', io); // make io accessible in controllers

// Security middleware
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Rate limiting on auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Too many login attempts. Try again later.' }
});

// Routes (added in later steps)
app.use('/api/auth',    authLimiter, require('./routes/authRoutes'));
app.use('/api/patient', require('./routes/patientRoutes'));
app.use('/api/prescription', require('./routes/prescriptionRoutes'));
app.use('/api/pharmacy', require('./routes/pharmacyRoutes'));
app.use('/api/alerts',  require('./routes/alertRoutes'));

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));