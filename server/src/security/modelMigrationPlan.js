'use strict';
// Offline-only raw BSON planning. No models, environment, database or transport.
const crypto = require('crypto');
const { BSON } = require('mongodb');
const { createAuthenticatedFields } = require('./authenticatedFields');
const { normalizeNic } = require('./nicBlindIndex');
const MODELS = Object.freeze(Object.fromEntries(Object.entries({
  Patient: ['patients', { fullName: 'string', contactInfo: 'string', allergies: 'strings' }, 'nic'],
  Consultation: ['consultations', { patientNic: 'string', diagnosis: 'string', notes: 'string' }, 'patientNic'],
  Prescription: ['prescriptions', { patientNic: 'string', drugName: 'string', dosage: 'string' }, 'patientNic'],
  LabTest: ['labtests', { patientNic: 'string', patientName: 'string', patientEmail: 'string' }, 'patientNic'],
  TestOrder: ['testorders', { patientNic: 'string', resultNotes: 'string' }, 'patientNic'],
  Doctor: ['doctors', { licenseNo: 'string' }, null],
  Dispensing: ['dispensings', {}, 'patientNic'],
  ConsultationRating: ['consultationratings', {}, 'patientNic']
}).map(([model, [collection, fields, identityField]]) => [model, Object.freeze({ collection, fields: Object.freeze(fields), identityField })])));
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
const encode = value => JSON.stringify(sorted(BSON.EJSON.serialize(value, { relaxed: false })));
const decode = value => BSON.EJSON.parse(value, { relaxed: false });
const clone = value => decode(encode(value));
const hash = value => crypto.createHash('sha256').update(encode(value)).digest('hex');
const own = (value, key) => Object.hasOwn(value, key);
function descriptor(model) { if (!own(MODELS, model)) throw new Error('MODEL_MIGRATION_MODEL_INVALID'); return MODELS[model]; }
function boundedRows(records) {
  if (!Array.isArray(records) || !records.length || records.length > 100) throw new Error('MODEL_MIGRATION_BATCH_INVALID');
  const seen = new Set(); let size = 0;
  for (const row of records) {
    const id = String(row?._id).toLowerCase();
    const numericVersion = typeof row?.__v === 'number' || ['Int32', 'Double', 'Long'].includes(row?.__v?._bsontype);
    if (!/^[a-f0-9]{24}$/.test(id) || seen.has(id) || !numericVersion || !Number.isSafeInteger(Number(row.__v)) || Number(row.__v) < 0 || Number(row.__v) > Number.MAX_SAFE_INTEGER - 2) throw new Error('MODEL_MIGRATION_IDENTITY_INVALID');
    seen.add(id); const bytes = Buffer.byteLength(encode(row));
    if (bytes > 128 * 1024 || (size += bytes) > 4 * 1024 * 1024) throw new Error('MODEL_MIGRATION_BATCH_LIMIT');
  }
}
function checkType(value, type) {
  if (!(value === null || (type === 'string' ? typeof value === 'string' : Array.isArray(value) && value.every(item => typeof item === 'string')))) throw new Error('MODEL_MIGRATION_FIELD_TYPE_INVALID');
}
function noJournalKeyReuse(journal, ...configurations) {
  const others = configurations.flatMap(config => Object.values(config?.keys || {}));
  for (const key of Object.values(journal?.keys || {})) if (others.some(other => Buffer.isBuffer(other) && Buffer.isBuffer(key) && other.length === key.length && crypto.timingSafeEqual(other, key))) throw new Error('MODEL_MIGRATION_JOURNAL_KEY_REUSE');
}
function parsePayload(value) { try { return JSON.parse(value); } catch (_) { throw new Error('MODEL_MIGRATION_PAYLOAD_INVALID'); } }
function reviewed(fn, value) { try { return typeof fn === 'function' && fn(value) === true; } catch (_) { throw new Error('MODEL_MIGRATION_REVIEW_FAILED'); } }
function exactFilter(row, keys) {
  return Object.fromEntries(['_id', '__v', ...keys].map(key => [key, own(row, key) ? { $eq: clone(row[key]) } : { $exists: false }]));
}
function changeTo(row, keys) {
  const $set = {}, $unset = {};
  for (const key of keys) { if (own(row, key)) $set[key] = clone(row[key]); else $unset[key] = 1; }
  return { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}), $inc: { __v: 1 } };
}
function buildModelPlans(records, { model, runId, oldConfiguration, newConfiguration, journalConfiguration, identityCodec, reviewLegacy, reviewPlaintext, validateDocument, reviewFieldChanges } = {}, fieldChanges = null) {
  const spec = descriptor(model); boundedRows(records);
  if (typeof runId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(runId) || typeof validateDocument !== 'function') throw new Error('MODEL_MIGRATION_REVIEW_REQUIRED');
  noJournalKeyReuse(journalConfiguration, oldConfiguration, newConfiguration);
  const oldCodec = createAuthenticatedFields(oldConfiguration), nextCodec = createAuthenticatedFields(newConfiguration), journal = createAuthenticatedFields(journalConfiguration);
  const identities = new Map();
  const plans = records.map(row => {
    const recordId = String(row._id).toLowerCase(), next = clone(row), plain = clone(row), beforePlain = clone(row), legacyFields = [], plaintextFields = [];
    const keys = new Set(['keyVersion']);
    for (const name of Object.keys(row).filter(name => name.startsWith('__enc_'))) {
      if (!Object.keys(spec.fields).some(field => name === '__enc_' + field || name === '__enc_' + field + '_d')) throw new Error('MODEL_MIGRATION_UNKNOWN_ENCRYPTED_FIELD');
    }
    for (const [field, type] of Object.entries(spec.fields)) {
      const marker = '__enc_' + field, sidecar = marker + '_d', stored = row[sidecar] || row[field];
      [field, marker, sidecar].forEach(key => keys.add(key));
      if (own(row, marker) && typeof row[marker] !== 'boolean') throw new Error('MODEL_MIGRATION_MARKER_INVALID');
      if (own(row, sidecar) && typeof row[sidecar] !== 'string') throw new Error('MODEL_MIGRATION_MARKER_INVALID');
      let value;
      if (row[marker] === true) {
        if (typeof stored !== 'string' || (row[sidecar] && own(row, field))) throw new Error('MODEL_MIGRATION_CIPHERTEXT_AMBIGUOUS');
        const context = { collection: spec.collection, recordId, field };
        if (stored.startsWith('gcm1.')) {
          const payload = parsePayload(oldCodec.decrypt(stored, context));
          if (!payload || payload.schema !== 1 || !own(payload, 'value')) throw new Error('MODEL_MIGRATION_PAYLOAD_INVALID');
          value = payload.value;
        } else {
          const decoded = oldCodec.readLegacy(stored, Number(row.keyVersion || 1), { allowUnauthenticatedLegacy: true });
          value = row[sidecar] ? parsePayload(decoded.plaintext) : decoded.plaintext;
          if (!reviewed(reviewLegacy, { model, recordId, field, value })) throw new Error('MODEL_MIGRATION_LEGACY_REVIEW_REQUIRED');
          legacyFields.push(field);
        }
      } else {
        if (row[sidecar]) throw new Error('MODEL_MIGRATION_CIPHERTEXT_AMBIGUOUS');
        if (!own(row, field) && !own(fieldChanges || {}, field)) continue;
        value = row[field];
        if (own(row, field)) {
          if (value !== null && !reviewed(reviewPlaintext, { model, recordId, field, value })) throw new Error('MODEL_MIGRATION_PLAINTEXT_REVIEW_REQUIRED');
          plaintextFields.push(field);
        }
      }
      if (value !== undefined) { checkType(value, type); beforePlain[field] = value; }
      beforePlain[marker] = false; beforePlain[sidecar] = '';
      if (own(fieldChanges || {}, field)) value = fieldChanges[field];
      checkType(value, type); plain[field] = value; plain[marker] = false; plain[sidecar] = '';
      if (value === null) { next[field] = null; next[marker] = false; next[sidecar] = ''; continue; }
      const context = { collection: spec.collection, recordId, field }, payload = JSON.stringify({ schema: 1, value });
      const encrypted = nextCodec.encrypt(payload, context);
      if (nextCodec.decrypt(encrypted, context) !== payload) throw new Error('MODEL_MIGRATION_READBACK_FAILED');
      delete next[field]; next[marker] = true; next[sidecar] = encrypted;
    }
    if (identityCodec && spec.identityField) {
      if (typeof identityCodec.index !== 'function' || typeof identityCodec.matches !== 'function') throw new Error('MODEL_MIGRATION_IDENTITY_CODEC_INVALID');
      const nic = normalizeNic(plain[spec.identityField]);
      if (row.patientNic_hmac !== undefined && !identityCodec.matches(nic, row.patientNic_hmac)) throw new Error('MODEL_MIGRATION_IDENTITY_SIDECAR_MISMATCH');
      next.patientNic_hmac = identityCodec.index(nic); keys.add('patientNic_hmac');
      if (model === 'Patient') {
        if (identities.has(next.patientNic_hmac)) throw new Error('MODEL_MIGRATION_PATIENT_DUPLICATE');
        identities.set(next.patientNic_hmac, recordId);
      }
    }
    if (model === 'LabTest' && row.encryptedFileKey) {
      ['fileKeyVersion', 'encryptedFileKey', 'fileIV', 'reportEnvelopeVersion'].forEach(key => keys.add(key));
      if (row.reportEnvelopeVersion !== undefined && ![1, 2].includes(Number(row.reportEnvelopeVersion))) throw new Error('MODEL_MIGRATION_FILE_VERSION_INVALID');
      if (Number(row.reportEnvelopeVersion) !== 2 && row.fileKeyVersion == null) next.fileKeyVersion = Number(row.keyVersion || 1);
    }
    if (fieldChanges && !reviewed(reviewFieldChanges, { model, recordId, before: clone(beforePlain), after: clone(plain), fields: Object.keys(fieldChanges) })) throw new Error('MODEL_FIELD_UPDATE_REVIEW_REQUIRED');
    if (!reviewed(validateDocument, { model, recordId, document: clone(plain) })) throw new Error('MODEL_MIGRATION_SCHEMA_REVIEW_REQUIRED');
    if (Object.keys(spec.fields).length) next.keyVersion = Number(newConfiguration.activeVersion);
    next.__v = Number(row.__v) + 1;
    const restored = clone(row); restored.__v = Number(row.__v) + 2;
    const changedKeys = [...keys];
    const intent = fieldChanges ? 'FIELD_UPDATE' : 'MIGRATION', changedFields = fieldChanges ? Object.keys(fieldChanges) : [];
    const operation = { schema: 1, intent, changedFields, model, runId, recordId, beforeHash: hash(row), afterHash: hash(next), restoredHash: hash(restored),
      update: { filter: exactFilter(row, changedKeys), change: changeTo(next, changedKeys) }, rollback: { filter: exactFilter(next, changedKeys), change: changeTo(row, changedKeys) } };
    return { schema: 1, intent, changedFields, model, runId, recordId, beforeHash: operation.beforeHash, afterHash: operation.afterHash, restoredHash: operation.restoredHash,
      legacyFields, plaintextFields, operationEnvelope: journal.encrypt(encode(operation), { collection: spec.collection, recordId, field: 'migration-plan-' + runId }) };
  });
  return { schema: 1, mode: fieldChanges ? 'OFFLINE_MODEL_FIELD_UPDATE_PLAN' : 'OFFLINE_MODEL_MIGRATION_PLAN', model, collection: spec.collection, runId, plans, writes: 0,
    liveExecutionAuthorized: false, databaseUniquenessVerified: false, identityPlaintextRetirementImplemented: false, backupRestoreVerified: false };
}
function planModelMigration(records, options) { return buildModelPlans(records, options); }
function planModelFieldUpdate(record, changes, options) {
  const spec = descriptor(options?.model), prototype = changes && Object.getPrototypeOf(changes);
  if (!changes || ![Object.prototype, null].includes(prototype) || !Object.keys(changes).length || Object.keys(changes).some(field => !own(spec.fields, field) || field === spec.identityField)) throw new Error('MODEL_FIELD_UPDATE_FIELDS_INVALID');
  for (const [field, value] of Object.entries(changes)) checkType(value, spec.fields[field]);
  return buildModelPlans([record], options, clone(changes));
}
function openMigrationOperation(plan, journalConfiguration) {
  const spec = descriptor(plan?.model);
  const operation = decode(createAuthenticatedFields(journalConfiguration).decrypt(plan.operationEnvelope, { collection: spec.collection, recordId: plan.recordId, field: 'migration-plan-' + plan.runId }));
  if (Number(operation.schema) !== 1 || ['intent', 'model', 'runId', 'recordId', 'beforeHash', 'afterHash', 'restoredHash'].some(key => operation[key] !== plan[key]) || JSON.stringify(operation.changedFields) !== JSON.stringify(plan.changedFields)) throw new Error('MODEL_MIGRATION_JOURNAL_MISMATCH');
  return operation;
}
function verifyMigrationReceipt(plan, record, phase) {
  if (!['before', 'after', 'restored'].includes(phase) || String(record?._id).toLowerCase() !== plan.recordId || hash(record) !== plan[phase + 'Hash']) throw new Error('MODEL_MIGRATION_PRESERVATION_FAILED');
  return { recordId: plan.recordId, phase, hash: hash(record), verified: true, liveDatabaseVerified: false };
}
module.exports = { MODELS, planModelMigration, planModelFieldUpdate, openMigrationOperation, verifyMigrationReceipt };
