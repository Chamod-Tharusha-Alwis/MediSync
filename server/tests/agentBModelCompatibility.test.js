'use strict';
const mongoose = require('mongoose'), crypto = require('crypto');
const { createVersionedFieldPlugin } = require('../src/security/versionedFieldPluginCandidate');
const legacyPlugin = require('../src/security/legacyFieldEncryption');
const FIELDS = ['notes', 'allergies', 'contactInfo', 'recordedAt', 'count', 'flag'];
const names = [], previous = { keys: global.ENCRYPTION_KEYS, active: global.ACTIVE_KEY_VERSION };
afterEach(() => { for (const name of names.splice(0)) mongoose.deleteModel(name); global.ENCRYPTION_KEYS = previous.keys; global.ACTIVE_KEY_VERSION = previous.active; });
function model(name, plugin, collection = 'synthetic_compatibility_only') {
  const schema = new mongoose.Schema({ keyVersion: { type: Number, default: 1 }, notes: String, allergies: [String], contactInfo: mongoose.Schema.Types.Mixed, recordedAt: Date, count: Number, flag: Boolean }, { collection, autoCreate: false, autoIndex: false });
  schema.plugin(plugin, { fields: FIELDS }); names.push(name); return mongoose.model(name, schema);
}
function sample() { return { _id: new mongoose.Types.ObjectId('000000000000000000000001'), notes: 'Synthetic clinical note', allergies: ['Synthetic allergen'], contactInfo: { district: 'Synthetic district', nested: [1, false] }, recordedAt: new Date('2026-01-01T12:00:00.000Z'), count: 0, flag: false }; }
function expectPlain(doc) {
  expect(doc.notes).toBe('Synthetic clinical note'); expect([...doc.allergies]).toEqual(['Synthetic allergen']); expect(doc.contactInfo).toEqual(sample().contactInfo);
  expect(doc.recordedAt).toBeInstanceOf(Date); expect(doc.recordedAt.toISOString()).toBe(sample().recordedAt.toISOString()); expect(doc.count).toBe(0); expect(doc.flag).toBe(false); expect(doc.validateSync()).toBeUndefined();
}
test('detached actual Mongoose types restore original CBC representation and candidate GCM sidecars without storage', () => {
  const legacySecret = 'synthetic-model-legacy-key-only'; global.ENCRYPTION_KEYS = { 1: legacySecret }; global.ACTIVE_KEY_VERSION = 1;
  const Legacy = model('SyntheticLegacyCompatibility', legacyPlugin), original = new Legacy(sample()); original.encryptFieldsSync();
  const archived = original.toObject(), archiveHash = crypto.createHash('sha256').update(JSON.stringify(archived)).digest('hex');
  expect(archived.notes).toMatch(/^[a-f0-9]{32}:/); expect(archived.__enc_allergies_d).toMatch(/^[a-f0-9]{32}:/); expect(archived.__enc_count).toBe(true);
  const configuration = { keys: { 2: crypto.randomBytes(32) }, activeVersion: 2 };
  const Candidate = model('SyntheticGcmCompatibility', createVersionedFieldPlugin({ getKeyConfiguration: () => configuration, getLegacyKeys: () => ({ 1: legacySecret }), allowLegacyReads: true }));
  const decoded = Candidate.hydrate(archived); expectPlain(decoded); decoded.encryptFieldsSync();
  const gcm = decoded.toObject(); expect(gcm.keyVersion).toBe(2); for (const field of FIELDS) expect(gcm[`__enc_${field}_d`]).toMatch(/^gcm1\.2\./);
  expectPlain(Candidate.hydrate(gcm)); expectPlain(Legacy.hydrate(archived));
  expect(crypto.createHash('sha256').update(JSON.stringify(archived)).digest('hex')).toBe(archiveHash); expect(mongoose.connection.readyState).toBe(0);
});
test('candidate hydration rejects CBC when compatibility reads are not explicitly enabled', () => {
  const legacySecret = 'synthetic-model-legacy-key-only'; global.ENCRYPTION_KEYS = { 1: legacySecret }; global.ACTIVE_KEY_VERSION = 1;
  const Legacy = model('SyntheticDeniedLegacy', legacyPlugin), source = new Legacy(sample()); source.encryptFieldsSync();
  const configuration = { keys: { 2: crypto.randomBytes(32) }, activeVersion: 2 };
  const Candidate = model('SyntheticDeniedCandidate', createVersionedFieldPlugin({ getKeyConfiguration: () => configuration, getLegacyKeys: () => ({ 1: legacySecret }) }));
  expect(() => Candidate.hydrate(source.toObject())).toThrow('LEGACY_FIELD_REJECTED');
});
test.each(['collection', 'record', 'key', 'tag'])('actual GCM hydration rejects %s mismatch without CBC fallback', variant => {
  const configuration = { keys: { 2: crypto.randomBytes(32) }, activeVersion: 2 }, plugin = createVersionedFieldPlugin({ getKeyConfiguration: () => configuration });
  const Candidate = model('SyntheticTamperCandidate', plugin), doc = new Candidate(sample()); doc.encryptFieldsSync(); const raw = doc.toObject();
  if (variant === 'record') raw._id = new mongoose.Types.ObjectId('000000000000000000000002');
  if (variant === 'key') configuration.keys[2] = crypto.randomBytes(32);
  if (variant === 'tag') { const parts = raw.__enc_notes_d.split('.'); parts[3] = Buffer.alloc(16, 7).toString('base64url'); raw.__enc_notes_d = parts.join('.'); }
  const Target = variant === 'collection' ? model('SyntheticDifferentCollection', plugin, 'different_synthetic_collection') : Candidate;
  expect(() => Target.hydrate(raw)).toThrow('FIELD_AUTH_FAILED'); expect(raw.notes).toBeUndefined();
});
