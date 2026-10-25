'use strict';
const crypto = require('crypto'), { BSON } = require('mongodb');
const { createIdentitySnapshotReview } = require('../src/security/identitySnapshotReview');
const { createNicBlindIndex } = require('../src/security/nicBlindIndex');
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(sorted(BSON.EJSON.serialize(value, { relaxed: false })))).digest('hex');
function fixture(duplicate = false) {
  const codec = createNicBlindIndex({ keys: { 1: crypto.randomBytes(32), 2: crypto.randomBytes(32) }, activeVersion: 2 });
  const rows = [1, 2].map((n, i) => { const nic = duplicate ? i ? ' 900000001V ' : '900000001v' : '90000000' + n + 'V'; return { _id: new BSON.ObjectId(String(n).padStart(24, '0')), __v: i, nic, patientNic_hmac: codec.index(nic, i + 1), patientNic_bi: crypto.createHash('sha256').update(nic.trim()).digest('hex'), unrelated: BSON.Long.fromString('9007199254740993') }; });
  const expectedRecords = rows.map(row => ({ recordId: String(row._id), version: row.__v, contentSha256: hash(row) }));
  return { rows, options: { snapshotId: 'synthetic_snapshot_01', expectedRecords, codec } };
}
test('identity review detects normalized duplicates across batches and retained HMAC versions without exposing NIC/digests', () => {
  const f = fixture(true), before = hash(f.rows), review = createIdentitySnapshotReview(f.options);
  review.addBatch([f.rows[0]]); review.addBatch([f.rows[1]]); const result = review.finish();
  expect(result).toMatchObject({ reviewed: 2, complete: true, uniqueWithinSuppliedSnapshot: false, retainedHmacVersionCounts: { 1: 1, 2: 1 }, writes: 0, plaintextRetired: false, concurrentRegistrationUniquenessEnforced: false });
  expect(result.collisions).toEqual([{ recordIds: f.rows.map(row => String(row._id)) }]);
  expect(JSON.stringify(result)).not.toMatch(/900000001|hmac-sha256:/); expect(hash(f.rows)).toBe(before);
});
test('unique complete snapshot receipt is independent of batch order, with live/index/registration caveats', () => {
  const f = fixture(), first = createIdentitySnapshotReview(f.options), second = createIdentitySnapshotReview(f.options);
  first.addBatch(f.rows); second.addBatch([f.rows[1]]); second.addBatch([f.rows[0]]);
  const a = first.finish(), b = second.finish(); expect(a.manifestSha256).toBe(b.manifestSha256);
  expect(a).toMatchObject({ uniqueWithinSuppliedSnapshot: true, liveDatabaseVerified: false, atomicSnapshotProvenanceVerified: false, indexStateVerified: false, referenceIntegrityVerified: false, plaintextNicRecords: 2, legacyIndexRecords: 2 });
});
test('incomplete snapshot cannot be finalized or resumed as a green receipt', () => {
  const f = fixture(), review = createIdentitySnapshotReview(f.options); review.addBatch([f.rows[0]]);
  expect(() => review.finish()).toThrow('INCOMPLETE'); expect(() => review.addBatch([f.rows[1]])).toThrow('REVIEW_CLOSED');
});
test.each(['hash', 'version', 'unknown-id', 'duplicate', 'hmac', 'legacy', 'nic', 'oversized'])('identity snapshot rejects %s and poisons the review after failure', variant => {
  const f = fixture();
  if (variant === 'hash') f.rows[0].unrelated = BSON.Long.fromString('9007199254740994');
  if (variant === 'version') f.rows[0].__v = '0';
  if (variant === 'unknown-id') f.rows[0]._id = new BSON.ObjectId('000000000000000000000009');
  if (variant === 'hmac') f.rows[0].patientNic_hmac = f.options.codec.index('900000009V');
  if (variant === 'legacy') f.rows[0].patientNic_bi = '0'.repeat(64);
  if (variant === 'nic') f.rows[0].nic = { $ne: null };
  if (['hmac', 'legacy', 'nic'].includes(variant)) f.options.expectedRecords[0].contentSha256 = hash(f.rows[0]);
  const review = createIdentitySnapshotReview(f.options), rows = variant === 'duplicate' ? [f.rows[0], f.rows[0]] : variant === 'oversized' ? Array(1001).fill(f.rows[0]) : f.rows;
  expect(() => review.addBatch(rows)).toThrow('BATCH_REJECTED'); expect(() => review.finish()).toThrow('REVIEW_CLOSED');
});
test('duplicate across batches fails membership rather than counting it as another patient', () => {
  const f = fixture(), review = createIdentitySnapshotReview(f.options); review.addBatch([f.rows[0]]);
  expect(() => review.addBatch([f.rows[0]])).toThrow('BATCH_REJECTED'); expect(() => review.finish()).toThrow('REVIEW_CLOSED');
});
test('caller mutation of expected manifest cannot rebaseline a running review', () => {
  const f = fixture(), review = createIdentitySnapshotReview(f.options); f.rows[0].nic = '900000009V'; f.options.expectedRecords[0].contentSha256 = hash(f.rows[0]);
  expect(() => review.addBatch(f.rows)).toThrow('BATCH_REJECTED');
});
test('missing HMAC sidecars remain explicit migration work rather than an implied cutover', () => {
  const f = fixture(); delete f.rows[0].patientNic_hmac; f.options.expectedRecords[0].contentSha256 = hash(f.rows[0]);
  const review = createIdentitySnapshotReview(f.options); review.addBatch(f.rows); expect(review.finish()).toMatchObject({ missingHmac: 1, plaintextNicRecords: 2, plaintextRetired: false });
});
test.each(['empty', 'duplicate-id', 'malformed-hash', 'version-string'])('invalid expected snapshot %s is rejected before reading records', variant => {
  const f = fixture(); if (variant === 'empty') f.options.expectedRecords = [];
  if (variant === 'duplicate-id') f.options.expectedRecords[1].recordId = f.options.expectedRecords[0].recordId;
  if (variant === 'malformed-hash') f.options.expectedRecords[0].contentSha256 = 'invalid';
  if (variant === 'version-string') f.options.expectedRecords[0].version = '0';
  expect(() => createIdentitySnapshotReview(f.options)).toThrow(/^IDENTITY_SNAPSHOT_/);
});
