'use strict';
const crypto = require('crypto');
const { normalizeNic } = require('./nicBlindIndex');
const runtime = require('./securityRuntime');

function legacyDigest(value) { return crypto.createHash('sha256').update(String(value).trim()).digest('hex'); }
function writeNicFields(value, { legacyFields = ['patientNic_bi', 'nicHash'], codec = runtime.current() } = {}) {
  normalizeNic(value);
  const result = {};
  if (codec.nicMode !== 'hmac') for (const field of legacyFields) result[field] = legacyDigest(value);
  if (codec.nicMode !== 'legacy') result.patientNic_hmac = codec.index(value);
  return result;
}
function nicFilter(value, { legacyFields = ['patientNic_bi'], plainFields = [], codec = runtime.current() } = {}) {
  normalizeNic(value);
  const clauses = [];
  if (codec.nicMode !== 'legacy') clauses.push({ patientNic_hmac: { $in: codec.candidates(value).hmac } });
  if (codec.nicMode !== 'hmac') {
    const hashes = codec.nicMode === 'legacy' ? [...new Set([legacyDigest(value), legacyDigest(normalizeNic(value))])] : codec.candidates(value).legacy;
    for (const field of legacyFields) clauses.push({ [field]: hashes.length === 1 ? hashes[0] : { $in: hashes } });
    for (const field of plainFields) {
      const values = [...new Set([String(value).trim(), normalizeNic(value)])];
      clauses.push({ [field]: values.length === 1 ? values[0] : { $in: values } });
    }
  }
  if (!clauses.length) throw new Error('NIC_LOOKUP_CONFIGURATION_INVALID');
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}
function boundNicFilter(value, scope, options) {
  if (!scope || typeof scope !== 'object' || !Object.keys(scope).length) throw new Error('NIC_AUTHORIZATION_SCOPE_REQUIRED');
  return { $and: [nicFilter(value, options), scope] };
}
function nicIndexPlugin(schema, { field = 'patientNic' } = {}) {
  if (!schema.path('patientNic_hmac')) schema.add({ patientNic_hmac: { type: String, index: true } });
  schema.pre('save', function () {
    const codec = runtime.current();
    if (codec.nicMode === 'legacy') return;
    if (!this[field]) throw new Error('NIC_PLAINTEXT_REQUIRED_FOR_WRITE');
    this.patientNic_hmac = codec.index(this[field]);
    if (codec.nicMode === 'hmac') {
      if (schema.path('patientNic_bi')) this.patientNic_bi = undefined;
      if (schema.path('nicHash')) this.nicHash = undefined;
    }
  });
}
module.exports = { writeNicFields, nicFilter, boundNicFilter, nicIndexPlugin, legacyDigest };
