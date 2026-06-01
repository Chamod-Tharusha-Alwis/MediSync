const mongoose = require('mongoose');

// Capped collection = append-only, cannot be deleted or updated
const auditSchema = new mongoose.Schema({
  actorId: String,
  actorRole: String,
  action: String,
  accessedNic: String,
  ipAddress: String,
  timestamp: { type: Date, default: Date.now }
}, {
  capped: { size: 104857600, max: 100000 } // Capped at 100MB / 100,000 documents
});

const AuditLog = mongoose.model('AuditLog', auditSchema, 'auditlogs');

module.exports = AuditLog;