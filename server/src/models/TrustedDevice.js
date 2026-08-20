const mongoose = require('mongoose');

const trustedDeviceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  userModel: { type: String, required: true },
  deviceFingerprint: { type: String, required: true },
  deviceModel: { type: String },
  deviceInfo: { type: String },
  trustedAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  isRevoked: { type: Boolean, default: false },
  revokedAt: { type: Date },
  deviceLabel: { type: String, default: null }
});

trustedDeviceSchema.index({ userId: 1, deviceFingerprint: 1 }, { unique: true });

module.exports = mongoose.model('TrustedDevice', trustedDeviceSchema);
