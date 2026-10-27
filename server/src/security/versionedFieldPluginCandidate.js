'use strict';
// GCM implementation selected only by the reviewed runtime encryption mode.
const { createAuthenticatedFields } = require('./authenticatedFields');
function createVersionedFieldPlugin({ getKeyConfiguration, getLegacyKeys = () => ({}), allowLegacyReads = false }) {
  if (typeof getKeyConfiguration !== 'function') throw new Error('FIELD_KEY_PROVIDER_REQUIRED');
  return function versionedFieldPlugin(schema, { fields = [] } = {}) {
    if (!fields.every(field => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(field))) throw new Error('FIELD_NAMES_INVALID');
    for (const field of fields) schema.add({ [`__enc_${field}`]: { type: Boolean, default: false }, [`__enc_${field}_d`]: { type: String, default: '' } });
    const config = () => { const c = getKeyConfiguration(); return { ...c, legacyKeys: getLegacyKeys() }; };
    const context = (doc, field) => ({ collection: doc.constructor.collection.name, recordId: String(doc._id), field });
    const read = (doc, field, codec) => {
      if (!doc[`__enc_${field}`]) return doc[field];
      const sidecar = doc[`__enc_${field}_d`];
      const stored = sidecar || doc[field];
      if (typeof stored !== 'string') throw new Error('FIELD_CIPHERTEXT_MISSING');
      if (stored.startsWith('gcm1.')) {
        const payload = JSON.parse(codec.decrypt(stored, context(doc, field)));
        if (!payload || payload.schema !== 1 || !Object.hasOwn(payload, 'value')) throw new Error('FIELD_PAYLOAD_INVALID');
        return payload.value;
      }
      const legacy = codec.readLegacy(stored, doc.keyVersion || 1, { allowUnauthenticatedLegacy: allowLegacyReads });
      return sidecar ? JSON.parse(legacy.plaintext) : legacy.plaintext;
    };
    function decryptFieldsSync() {
      const codec = createAuthenticatedFields(config());
      const changes = fields.filter(field => this[`__enc_${field}`]).map(field => [field, read(this, field, codec)]);
      for (const [field, value] of changes) { this[field] = value; this[`__enc_${field}`] = false; this[`__enc_${field}_d`] = ''; }
    }
    function encryptFieldsSync() {
      const c = config(), codec = createAuthenticatedFields(c);
      const changes = fields.map(field => [field, read(this, field, codec)]).filter(([, value]) => value !== undefined && value !== null)
        .map(([field, value]) => [field, codec.encrypt(JSON.stringify({ schema: 1, value }), context(this, field))]);
      for (const [field, encrypted] of changes) { this[field] = undefined; this[`__enc_${field}`] = true; this[`__enc_${field}_d`] = encrypted; }
      this.keyVersion = Number(c.activeVersion);
    }
    schema.methods.decryptFieldsSync = decryptFieldsSync;
    schema.methods.encryptFieldsSync = encryptFieldsSync;
    schema.post('init', function (doc) { decryptFieldsSync.call(doc); });
    schema.pre('save', function () { encryptFieldsSync.call(this); });
    // Query/replacement/bulk writes skip document hydration and save encryption.
    // Until a typed read/modify/save CAS adapter is approved, fail closed rather
    // than persisting plaintext or stale authenticated sidecars through these APIs.
    for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'insertMany', 'bulkWrite']) {
      schema.pre(operation, function () { throw new Error('FIELD_QUERY_WRITE_REQUIRES_DOCUMENT_CAS'); });
    }
  };
}
module.exports = { createVersionedFieldPlugin };
