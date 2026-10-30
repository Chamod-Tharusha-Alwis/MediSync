const mongoose = require('mongoose');

const recoveryTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  userModel: {
    type: String,
    required: true,
    enum: ['Admin', 'Doctor', 'Patient', 'PharmacyStaff', 'Hospital']
  },
  tokenHash: {
    type: String,
    required: true
  },
  used: {
    type: Boolean,
    default: false
  },
  consumedAt: {
    type: Date,
    default: null
  },
  purpose: {
    type: String,
    required: true,
    default: 'password-reset'
  },
  expiresAt: {
    type: Date,
    required: true
  },
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('RecoveryToken', recoveryTokenSchema);

