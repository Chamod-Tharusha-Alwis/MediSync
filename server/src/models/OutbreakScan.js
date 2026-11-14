'use strict';

const mongoose = require('mongoose');

const outbreakScanSchema = new mongoose.Schema({
  scannedAt: { type: Date, default: Date.now },
  casesScanned: { type: Number, default: 0 },
  outbreaksDetected: { type: Number, default: 0 },
  signalsSuppressed: { type: Number, default: 0 },
  mode: { type: String, enum: ['real', 'simulation'], default: 'real' },
  triggeredBy: { type: String, default: 'admin_manual' }
}, {
  timestamps: true
});

outbreakScanSchema.index({ mode: 1, scannedAt: -1 });

module.exports = mongoose.models.OutbreakScan || mongoose.model('OutbreakScan', outbreakScanSchema);
