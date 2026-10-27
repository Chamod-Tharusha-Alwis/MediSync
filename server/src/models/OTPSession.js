const mongoose = require('mongoose');

const otpSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  userModel: {
    type: String,
    enum: ['Doctor', 'Patient', 'PharmacyStaff', 'Hospital', 'Admin'],
    required: true
  },
  otp: {
    type: String,
    required: true // bcrypt-hashed OTP
  },
  expiresAt: {
    type: Date,
    required: true
  },
  used: {
    type: Boolean,
    default: false
  },
  failedAttempts: {
    type: Number,
    default: 0
  },
  purpose: {
    type: String,
    enum: ['login', 'password-reset', 'email-verify', 'verification', '2fa-setup', 'patient-access', 'device-trust'],
    required: true
  },
  // Used for patient-access OTPs to track who requested access and consent lifecycle
  metadata: {
    deviceId: String,
    deviceFingerprint: String,
    sessionId: String,
    requesterId: String,
    requesterRole: String,
    requesterName: String,
    accessNic: String,
    accessGrantedAt: Date,
    accessExpiresAt: Date,
    commitVersion: { type: Number, default: 0 },
    revoked: { type: Boolean, default: false }
  }
}, { timestamps: true });

// Explicit TTL index — MongoDB automatically deletes documents when expiresAt passes
otpSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OTPSession', otpSessionSchema);

