const mongoose = require('mongoose');

const banRecordSchema = new mongoose.Schema({
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  targetModel: {
    type: String,
    enum: ['Doctor', 'Patient', 'PharmacyStaff', 'Pharmacy', 'Hospital'],
    required: true
  },
  targetName: { type: String },
  targetEmail: { type: String },
  banType: { type: String, enum: ['temporary', 'permanent'], required: true },
  reason: { type: String, required: true },
  reportedBy: { type: String },          // patient complaint or admin reason
  bannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' }, // admin who banned
  bannedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },             // null if permanent
  isActive: { type: Boolean, default: true },
  liftedAt: { type: Date },
  liftedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
  liftReason: { type: String },
}, { timestamps: true });

// Indexes for fast lookups
banRecordSchema.index({ targetId: 1, isActive: 1 });
banRecordSchema.index({ isActive: 1, expiresAt: 1 });

module.exports = mongoose.model('BanRecord', banRecordSchema);
