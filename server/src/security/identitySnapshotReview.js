'use strict';
// Offline snapshot reconciliation only. This neither creates an index nor reserves
// an identity against concurrent registrations in a live database.
const crypto = require('crypto'), { BSON } = require('mongodb');
const { normalizeNic } = require('./nicBlindIndex');
const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value;
const contentHash = value => crypto.createHash('sha256').update(JSON.stringify(sort(BSON.EJSON.serialize(value, { relaxed: false })))).digest('hex');
const objectId = value => { const id = String(value).toLowerCase(); if (!/^[a-f0-9]{24}$/.test(id)) throw new Error('IDENTITY_SNAPSHOT_ID_INVALID'); return id; };
const version = value => {
  if (!(typeof value === 'number' || ['Int32', 'Double', 'Long'].includes(value?._bsontype)) || !Number.isSafeInteger(Number(value)) || Number(value) < 0) throw new Error('IDENTITY_SNAPSHOT_VERSION_INVALID');
  return Number(value);
};
function createIdentitySnapshotReview({ expectedRecords, snapshotId, codec } = {}) {
  if (typeof snapshotId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(snapshotId) || !Array.isArray(expectedRecords) || !expectedRecords.length || expectedRecords.length > 100000 || typeof codec?.index !== 'function' || typeof codec?.matches !== 'function' || typeof codec?.candidates !== 'function') throw new Error('IDENTITY_SNAPSHOT_CONTRACT_INVALID');
  const expected = new Map();
  for (const row of expectedRecords) {
    const id = objectId(row?.recordId);
    if (expected.has(id) || !/^[a-f0-9]{64}$/.test(row?.contentSha256)) throw new Error('IDENTITY_SNAPSHOT_MANIFEST_INVALID');
    expected.set(id, { version: version(row.version), hash: row.contentSha256 });
  }
  let state = 'REVIEWING', reviewed = 0, legacyIndexes = 0, missingHmac = 0;
  const groups = new Map(), seen = new Set(), versions = new Map();
  function addBatch(records) {
    if (state !== 'REVIEWING') throw new Error('IDENTITY_SNAPSHOT_REVIEW_CLOSED');
    try {
      if (!Array.isArray(records) || !records.length || records.length > 1000) throw new Error('IDENTITY_SNAPSHOT_BATCH_INVALID');
      let bytes = 0; const pending = [], local = new Set();
      for (const row of records) {
        const id = objectId(row?._id), prior = expected.get(id);
        if (!prior || seen.has(id) || local.has(id)) throw new Error('IDENTITY_SNAPSHOT_MEMBERSHIP_INVALID');
        if (version(row.__v) !== prior.version || contentHash(row) !== prior.hash) throw new Error('IDENTITY_SNAPSHOT_CONTENT_CHANGED');
        const serialized = BSON.EJSON.stringify(row, { relaxed: false });
        if (Buffer.byteLength(serialized) > 128 * 1024 || (bytes += Buffer.byteLength(serialized)) > 4 * 1024 * 1024) throw new Error('IDENTITY_SNAPSHOT_BATCH_LIMIT');
        const nic = normalizeNic(row.nic), digest = codec.index(nic), candidates = codec.candidates(nic).hmac;
        if (!/^hmac-sha256:[1-9][0-9]{0,5}:[a-f0-9]{64}$/.test(digest) || !Array.isArray(candidates) || !candidates.includes(digest)) throw new Error('IDENTITY_SNAPSHOT_CODEC_INVALID');
        if (row.patientNic_hmac !== undefined && !codec.matches(nic, row.patientNic_hmac)) throw new Error('IDENTITY_SNAPSHOT_HMAC_MISMATCH');
        if (row.patientNic_bi !== undefined) {
          const legacy = [row.nic.trim(), nic].map(value => crypto.createHash('sha256').update(value).digest('hex'));
          if (!legacy.includes(row.patientNic_bi)) throw new Error('IDENTITY_SNAPSHOT_LEGACY_MISMATCH');
        }
        local.add(id); pending.push({ id, digest, oldVersion: row.patientNic_hmac?.split(':')[1], legacy: row.patientNic_bi !== undefined });
      }
      // Commit a batch to the ephemeral review only after every row verifies.
      for (const row of pending) {
        seen.add(row.id); if (!groups.has(row.digest)) groups.set(row.digest, []); groups.get(row.digest).push(row.id);
        if (row.oldVersion) versions.set(row.oldVersion, (versions.get(row.oldVersion) || 0) + 1); else missingHmac++;
        if (row.legacy) legacyIndexes++;
      }
      reviewed += pending.length;
      return { reviewed, expected: expected.size, writes: 0, complete: false };
    } catch (_) { state = 'FAILED'; throw new Error('IDENTITY_SNAPSHOT_BATCH_REJECTED'); }
  }
  function finish() {
    if (state !== 'REVIEWING') throw new Error('IDENTITY_SNAPSHOT_REVIEW_CLOSED');
    if (seen.size !== expected.size) { state = 'FAILED'; throw new Error('IDENTITY_SNAPSHOT_INCOMPLETE'); }
    state = 'FINISHED';
    const collisions = [...groups.values()].filter(ids => ids.length > 1).map(recordIds => ({ recordIds: recordIds.sort() }));
    const manifestRows = [...expected].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([recordId, value]) => ({ recordId, version: value.version, contentSha256: value.hash }));
    return { schema: 1, mode: 'OFFLINE_PATIENT_SNAPSHOT_RECONCILIATION', snapshotId, expected: expected.size, reviewed, complete: true,
      manifestSha256: contentHash(manifestRows), uniqueWithinSuppliedSnapshot: collisions.length === 0, collisions, retainedHmacVersionCounts: Object.fromEntries(versions),
      missingHmac, plaintextNicRecords: reviewed, legacyIndexRecords: legacyIndexes, writes: 0, liveDatabaseVerified: false,
      atomicSnapshotProvenanceVerified: false, concurrentRegistrationUniquenessEnforced: false, plaintextRetired: false, indexStateVerified: false, referenceIntegrityVerified: false };
  }
  return Object.freeze({ addBatch, finish });
}
module.exports = { createIdentitySnapshotReview };
