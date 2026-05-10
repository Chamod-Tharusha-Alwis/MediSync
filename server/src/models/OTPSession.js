const mongoose = require('mongoose');

const otpSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  userModel: {
    type: String,
    enum: ['Doctor', 'Patient', 'PharmacyStaff'],
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
  purpose: {
    type: String,
    enum: ['login', 'password-reset', 'email-verify', 'verification', '2fa-setup', 'patient-access'],
    required: true
  },
  // Used for patient-access OTPs to track who requested access
  metadata: {
    requesterRole: String,
    requesterName: String,
    accessNic: String
  }
}, { timestamps: true });

// Explicit TTL index — MongoDB automatically deletes documents when expiresAt passes
otpSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OTPSession', otpSessionSchema);

