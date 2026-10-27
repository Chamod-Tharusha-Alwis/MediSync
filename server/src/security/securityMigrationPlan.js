'use strict';
const crypto = require('crypto');
const { createAuthenticatedFields } = require('./authenticatedFields');
const { normalizeNic } = require('./nicBlindIndex');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function bounded(records) {
  if (!Array.isArray(records) || records.length > 1000) throw new Error('BOUNDED_MIGRATION_BATCH_REQUIRED');
  const ids = new Set();
  for (const row of records) {
    if (!row || !/^[a-f0-9]{24}$/i.test(String(row._id)) || !Number.isSafeInteger(row.__v) || row.__v < 0 || ids.has(String(row._id).toLowerCase())) throw new Error('MIGRATION_IDENTITY_INVALID');
    ids.add(String(row._id).toLowerCase());
  }
}
function planNicMigration(records, codec) {
  bounded(records);
  return records.map(row => {
    const next = codec.index(row.nic), previous = row.patientNic_hmac;
    return { _id: String(row._id), beforeHash: hash(row),
      update: { filter: { _id: row._id, __v: row.__v, patientNic_hmac: previous === undefined ? { $exists: false } : previous }, change: { $set: { patientNic_hmac: next }, $inc: { __v: 1 } } },
      rollback: { filter: { _id: row._id, __v: row.__v + 1, patientNic_hmac: next }, change: { ...(previous === undefined ? { $unset: { patientNic_hmac: 1 } } : { $set: { patientNic_hmac: previous } }), $inc: { __v: 1 } } } };
  });
}
function planFieldMigration(records, { collection, field, oldConfiguration, newConfiguration, reviewLegacy }) {
  bounded(records);
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,80}$/.test(field)) throw new Error('MIGRATION_FIELD_INVALID');
  const oldCodec = createAuthenticatedFields(oldConfiguration), nextCodec = createAuthenticatedFields(newConfiguration);
  return records.map(row => {
    const context = { collection, recordId: String(row._id), field }, stored = row.ciphertext;
    let plain, legacy = false;
    if (typeof stored !== 'string') throw new Error('MIGRATION_CIPHERTEXT_REQUIRED');
    if (stored.startsWith('gcm1.')) plain = oldCodec.decrypt(stored, context);
    else {
      const decoded = oldCodec.readLegacy(stored, row.keyVersion, { allowUnauthenticatedLegacy: true });
      if (typeof reviewLegacy !== 'function' || reviewLegacy({ recordId: String(row._id), field, plaintext: decoded.plaintext }) !== true) throw new Error('LEGACY_SEMANTIC_REVIEW_REQUIRED');
      legacy = true; plain = decoded.plaintext;
    }
    const next = nextCodec.encrypt(plain, context);
    if (nextCodec.decrypt(next, context) !== plain) throw new Error('MIGRATION_READBACK_FAILED');
    return { _id: String(row._id), beforeHash: hash(row), unauthenticatedLegacyInput: legacy,
      update: { filter: { _id: row._id, __v: row.__v, ciphertext: stored }, change: { $set: { ciphertext: next }, $inc: { __v: 1 } } },
      // Rollback requires the exact new ciphertext/version, never just an ID.
      rollback: { filter: { _id: row._id, __v: row.__v + 1, ciphertext: next }, change: { $set: { ciphertext: stored }, $inc: { __v: 1 } } } };
  });
}
// A patient identity review is different from clinical rows, which may validly
// reference one patient many times. Never claims uniqueness outside this batch.
function reviewPatientIdentityBatch(records, codec) {
  bounded(records);
  if (typeof codec?.index !== 'function' || typeof codec?.matches !== 'function') throw new Error('PATIENT_IDENTITY_CODEC_REQUIRED');
  const groups = new Map();
  for (const row of records) {
    const normalized = normalizeNic(row.nic);
    if (row.patientNic_hmac !== undefined && !codec.matches(normalized, row.patientNic_hmac)) throw new Error('PATIENT_IDENTITY_SIDECAR_MISMATCH');
    const digest = codec.index(normalized);
    if (!groups.has(digest)) groups.set(digest, []);
    groups.get(digest).push(String(row._id));
  }
  const collisions = [...groups.values()].filter(ids => ids.length > 1).map(ids => ({ recordIds: ids }));
  return { mode: 'READ_ONLY_SYNTHETIC_REVIEW', reviewed: records.length, writes: 0, collisions,
    batchUnique: collisions.length === 0, databaseUniquenessVerified: false,
    oldAndNewNicEquivalenceVerified: false, externalIndexStateVerified: false };
}
module.exports = { planNicMigration, planFieldMigration, reviewPatientIdentityBatch };
