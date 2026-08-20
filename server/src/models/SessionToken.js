const mongoose = require('mongoose');

const sessionTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  userModel: {
    type: String,
    required: true
  },
  tokenHash: {
    type: String,
    required: true
  },
  deviceInfo: {
    type: String
  },
  deviceFingerprint: {
    type: String
  },
  deviceModel: {
    type: String
  },
  isTrusted: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUsed: {
    type: Date,
    default: Date.now
  },
  isValid: {
    type: Boolean,
    default: true
  },
  expiredAt: {
    type: Date
  },
  logoutAt: {
    type: Date
  }
});

module.exports = mongoose.model('SessionToken', sessionTokenSchema);
