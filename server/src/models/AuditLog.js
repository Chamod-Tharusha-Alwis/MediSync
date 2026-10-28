const mongoose = require('mongoose');

// Capping bounds retention; it does not prevent all MongoDB updates and is not
// immutable archival storage. Application model operations are append-only.
const auditSchema = new mongoose.Schema({
  actorId: String,
  actorRole: String,
  action: String,
  accessedNic: String,
  deviceModel: String,
  timestamp: { type: Date, default: Date.now }
}, {
  capped: { size: 104857600, max: 100000 } // Capped at 100MB / 100,000 documents
});

function rejectAuditMutation() { throw new Error('AUDIT_APPEND_ONLY'); }
auditSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'], rejectAuditMutation);
auditSchema.pre('deleteOne', { document: true, query: false }, rejectAuditMutation);
auditSchema.pre('save', function () { if (!this.isNew) rejectAuditMutation(); });
// Model bulkWrite skips ordinary query middleware; reject the batch if ANY
// operation is not an insert, before the driver can execute a partial batch.
auditSchema.pre('bulkWrite', function (operations) {
  if (!Array.isArray(operations) || operations.some(operation => !operation || Object.keys(operation).length !== 1 || !operation.insertOne)) rejectAuditMutation();
});

const AuditLog = mongoose.model('AuditLog', auditSchema, 'auditlogs');

module.exports = AuditLog;
