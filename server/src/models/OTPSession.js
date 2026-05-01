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
    required: true // hashed OTP
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: '10m' } // TTL index to auto-delete after 10 minutes
  },
  used: {
    type: Boolean,
    default: false
  },
  purpose: {
    type: String,
    enum: ['login', 'password-reset', 'email-verify'],
    required: true
  }
}, { timestamps: true });

// Ensure TTL index works properly by creating it explicitly in some setups, but mongoose index: {expires: '10m'} is usually enough
module.exports = mongoose.model('OTPSession', otpSessionSchema);
