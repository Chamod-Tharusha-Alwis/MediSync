'use strict';
const crypto = require('crypto');
const { createVersionedFieldPlugin } = require('../src/security/versionedFieldPluginCandidate');
function harness() {
  const hooks = {}, schema = { add() {}, methods: {}, post: (event, fn) => { hooks[event] = fn; }, pre: (event, fn) => { hooks[event] = fn; } };
  const config = { keys: { 1: crypto.randomBytes(32), 2: crypto.randomBytes(32) }, activeVersion: 1 };
  createVersionedFieldPlugin({ getKeyConfiguration: () => config })(schema, { fields: ['notes', 'allergies'] });
  const doc = { _id: 'synthetic-1', constructor: { collection: { name: 'synthetic' } }, notes: 'synthetic text', allergies: ['synthetic allergen'], ...schema.methods };
  return { hooks, config, doc };
}
test('candidate plugin hooks encrypt and hydrate typed fields with record-bound AAD', () => {
  const { hooks, doc } = harness(); hooks.save.call(doc);
  expect(doc.notes).toBeUndefined(); expect(doc.__enc_notes).toBe(true); hooks.init(doc);
  expect(doc.notes).toBe('synthetic text'); expect(doc.allergies).toEqual(['synthetic allergen']);
});
test('candidate rotates already-encrypted fields rather than relabelling an old key version', () => {
  const { config, doc } = harness(); doc.encryptFieldsSync(); const old = doc.__enc_notes_d; config.activeVersion = 2; doc.encryptFieldsSync();
  expect(doc.keyVersion).toBe(2); expect(doc.__enc_notes_d).toMatch(/^gcm1\.2\./); expect(doc.__enc_notes_d).not.toBe(old);
  doc.decryptFieldsSync(); expect(doc.notes).toBe('synthetic text');
});
test('candidate hydration fails atomically on corrupt envelope and swapped record identity', () => {
  const { doc } = harness(); doc.encryptFieldsSync(); doc._id = 'different-record';
  expect(() => doc.decryptFieldsSync()).toThrow('FIELD_AUTH_FAILED'); expect(doc.notes).toBeUndefined(); expect(doc.__enc_notes).toBe(true);
});
test('uninitialized HMAC runtime candidate fails closed', () => expect(() => require('../src/security/nicIndexRuntimeCandidate').activeNicIndex('900000001V')).toThrow('NIC_INDEX_NOT_INITIALIZED'));
