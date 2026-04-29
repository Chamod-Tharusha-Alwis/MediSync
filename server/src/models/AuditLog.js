const mongoose = require('mongoose');

// Capped collection = append-only, cannot be deleted or updated
const auditSchema = new mongoose.Schema({
  actorId: String,
  actorRole: String,
  action: String,
  accessedNic: String,
  ipAddress: String,
  timestamp: { type: Date, default: Date.now }
});

// Capped at 100MB — no deletions allowed
const AuditLog = mongoose.model('AuditLog', auditSchema, 'auditlogs');

// Create capped collection on first run
mongoose.connection.once('open', async () => {
  const collections = await mongoose.connection.db.listCollections({ name: 'auditlogs' }).toArray();
  if (collections.length === 0) {
    await mongoose.connection.db.createCollection('auditlogs', { capped: true, size: 104857600 });
    console.log('Capped audit collection created');
  }
});

module.exports = AuditLog;