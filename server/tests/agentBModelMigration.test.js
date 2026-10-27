'use strict';
const crypto = require('crypto'), mongoose = require('mongoose'), { BSON } = require('mongodb');
const { MODELS, planModelMigration, planModelFieldUpdate, openMigrationOperation, verifyMigrationReceipt } = require('../src/security/modelMigrationPlan');
const { createAuthenticatedFields } = require('../src/security/authenticatedFields');
const { createNicBlindIndex } = require('../src/security/nicBlindIndex');
const { createVersionedFieldPlugin } = require('../src/security/versionedFieldPluginCandidate');
const canonical = value => JSON.stringify(BSON.EJSON.serialize(value, { relaxed: false }));
const clone = value => BSON.EJSON.parse(canonical(value), { relaxed: false });
const names = [];
afterEach(() => names.splice(0).forEach(name => mongoose.deleteModel(name)));
function fixture(model = 'Patient') {
  const oldConfiguration = { keys: { 1: crypto.randomBytes(32) }, activeVersion: 1 };
  const newConfiguration = { keys: { ...oldConfiguration.keys, 2: crypto.randomBytes(32) }, activeVersion: 2 };
  const journalConfiguration = { keys: { 9: crypto.randomBytes(32) }, activeVersion: 9 };
  const identityCodec = createNicBlindIndex({ keys: { 1: crypto.randomBytes(32), 2: crypto.randomBytes(32) }, activeVersion: 2 });
  const row = { _id: new BSON.ObjectId('000000000000000000000001'), __v: 7, keyVersion: 1, recordedAt: new Date('2026-01-01T00:00:00Z'), unrelatedInt64: BSON.Long.fromString('9007199254740993') };
  const values = {}, spec = MODELS[model], codec = createAuthenticatedFields(oldConfiguration);
  for (const [field, type] of Object.entries(spec.fields)) {
    const value = type === 'strings' ? ['Synthetic allergen'] : field === 'patientNic' ? '900000001V' : 'PRIVATE_SYNTHETIC_' + field;
    values[field] = value; row['__enc_' + field] = true;
    row['__enc_' + field + '_d'] = codec.encrypt(JSON.stringify({ schema: 1, value }), { collection: spec.collection, recordId: String(row._id), field });
  }
  if (spec.identityField && !Object.hasOwn(spec.fields, spec.identityField)) row[spec.identityField] = '900000001v';
  if (spec.identityField) row.patientNic_hmac = identityCodec.index('900000001V', 1);
  if (model === 'LabTest') Object.assign(row, { encryptedFileKey: 'ab'.repeat(48), fileIV: '01'.repeat(12), reportEnvelopeVersion: 1 });
  return { row, values, options: { model, runId: 'synthetic_run_01', oldConfiguration, newConfiguration, journalConfiguration, identityCodec, reviewLegacy: () => true, reviewPlaintext: () => true, validateDocument: () => true } };
}
// An in-memory synthetic CAS emulator. No collection, client or executor is imported.
function apply(row, action) {
  for (const [key, predicate] of Object.entries(action.filter)) {
    if (Object.hasOwn(predicate, '$exists')) expect(Object.hasOwn(row, key)).toBe(predicate.$exists);
    else expect(canonical(row[key])).toBe(canonical(predicate.$eq));
  }
  const next = clone(row);
  for (const [key, value] of Object.entries(action.change.$set || {})) next[key] = clone(value);
  for (const key of Object.keys(action.change.$unset || {})) delete next[key];
  next.__v = Number(next.__v) + action.change.$inc.__v;
  return next;
}
test.each(Object.keys(MODELS))('%s raw BSON migration and rollback preserve types, exact identity and unrelated fields', model => {
  const f = fixture(model), original = canonical(f.row), result = planModelMigration([f.row], f.options), plan = result.plans[0];
  const operation = openMigrationOperation(plan, f.options.journalConfiguration);
  expect(operation.update.filter._id.$eq).toBeInstanceOf(BSON.ObjectId);
  expect(verifyMigrationReceipt(plan, f.row, 'before').verified).toBe(true);
  const after = apply(f.row, operation.update), restored = apply(after, operation.rollback);
  expect(verifyMigrationReceipt(plan, after, 'after').verified).toBe(true);
  expect(verifyMigrationReceipt(plan, restored, 'restored').verified).toBe(true);
  expect(after.recordedAt).toBeInstanceOf(Date); expect(after.unrelatedInt64.toString()).toBe('9007199254740993');
  expect(Number(after.__v)).toBe(8); expect(Number(restored.__v)).toBe(9); expect(canonical(f.row)).toBe(original);
  const codec = createAuthenticatedFields(f.options.newConfiguration);
  for (const [field, value] of Object.entries(f.values)) {
    expect(after[field]).toBeUndefined(); expect(after['__enc_' + field + '_d']).toMatch(/^gcm1\.2\./);
    expect(JSON.parse(codec.decrypt(after['__enc_' + field + '_d'], { collection: MODELS[model].collection, recordId: String(f.row._id), field })).value).toEqual(value);
  }
  if (model === 'LabTest') { expect(Number(after.fileKeyVersion)).toBe(1); expect(restored.fileKeyVersion).toBeUndefined(); }
  if (model === 'Patient') expect(after.nic).toBe('900000001v');
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE_SYNTHETIC_|900000001/);
  expect(result).toMatchObject({ writes: 0, liveExecutionAuthorized: false, databaseUniquenessVerified: false, identityPlaintextRetirementImplemented: false, backupRestoreVerified: false });
});
test('migrated Patient sidecars hydrate through detached actual Mongoose plugin', () => {
  const f = fixture(), plan = planModelMigration([f.row], f.options).plans[0];
  const raw = apply(f.row, openMigrationOperation(plan, f.options.journalConfiguration).update);
  const schema = new mongoose.Schema({ keyVersion: Number, fullName: String, contactInfo: String, allergies: [String] }, { collection: 'patients', autoCreate: false, autoIndex: false });
  schema.plugin(createVersionedFieldPlugin({ getKeyConfiguration: () => f.options.newConfiguration }), { fields: Object.keys(MODELS.Patient.fields) });
  names.push('SyntheticMigrationPatient'); const Model = mongoose.model(names[0], schema), doc = Model.hydrate(raw);
  expect(doc.fullName).toBe(f.values.fullName); expect(doc.contactInfo).toBe(f.values.contactInfo); expect([...doc.allergies]).toEqual(f.values.allergies);
  expect(doc.validateSync()).toBeUndefined(); expect(mongoose.connection.readyState).toBe(0);
});
test('plaintext requires explicit review and recovery preimage stays encrypted in public manifest', () => {
  const f = fixture(); delete f.row.__enc_fullName; delete f.row.__enc_fullName_d; f.row.fullName = f.values.fullName;
  expect(() => planModelMigration([f.row], { ...f.options, reviewPlaintext: undefined })).toThrow('PLAINTEXT_REVIEW_REQUIRED');
  const result = planModelMigration([f.row], f.options), plan = result.plans[0];
  expect(JSON.stringify(result)).not.toContain(f.values.fullName);
  expect(openMigrationOperation(plan, f.options.journalConfiguration).rollback.change.$set.fullName).toBe(f.values.fullName);
});
test('actual legacy CBC string and JSON sidecar require semantic approval', () => {
  const f = fixture(), secret = 'synthetic-legacy-migration-only';
  const key = crypto.createHash('sha256').update(secret).digest('hex').substring(0, 32);
  const encrypt = value => { const iv = crypto.randomBytes(16), cipher = crypto.createCipheriv('aes-256-cbc', key, iv); return iv.toString('hex') + ':' + Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]).toString('hex'); };
  delete f.row.__enc_fullName_d; f.row.fullName = encrypt(f.values.fullName); f.row.__enc_allergies_d = encrypt(JSON.stringify(f.values.allergies));
  f.options.oldConfiguration.legacyKeys = { 1: secret };
  expect(() => planModelMigration([f.row], { ...f.options, reviewLegacy: undefined })).toThrow('LEGACY_REVIEW_REQUIRED');
  const plan = planModelMigration([f.row], f.options).plans[0]; expect(plan.legacyFields.sort()).toEqual(['allergies', 'fullName']);
  expect(verifyMigrationReceipt(plan, apply(f.row, openMigrationOperation(plan, f.options.journalConfiguration).update), 'after').verified).toBe(true);
});
test.each(['key', 'recordId', 'model', 'afterHash'])('journal rejects tampered %s', variant => {
  const f = fixture(), plan = planModelMigration([f.row], f.options).plans[0]; let journal = f.options.journalConfiguration;
  if (variant === 'key') journal = { keys: { 9: crypto.randomBytes(32) }, activeVersion: 9 };
  else plan[variant] = variant === 'recordId' ? '000000000000000000000002' : variant === 'model' ? 'Doctor' : '0'.repeat(64);
  expect(() => openMigrationOperation(plan, journal)).toThrow();
});
test.each(['marker', 'ambiguous', 'unknown', 'type', 'schema', 'version', 'keyReuse'])('planner rejects %s before any write', variant => {
  const f = fixture();
  if (variant === 'marker') f.row.__enc_fullName = 'true';
  if (variant === 'ambiguous') f.row.fullName = 'unexpected';
  if (variant === 'unknown') f.row.__enc_unreviewed = true;
  if (variant === 'type') { delete f.row.__enc_allergies_d; f.row.__enc_allergies = false; f.row.allergies = [7]; }
  if (variant === 'schema') f.options.validateDocument = () => false;
  if (variant === 'version') f.row.__v = '7';
  if (variant === 'keyReuse') f.options.journalConfiguration.keys[9] = f.options.newConfiguration.keys[2];
  expect(() => planModelMigration([f.row], f.options)).toThrow(/^MODEL_MIGRATION_/);
});
test('normalized cross-version Patient duplicates and duplicate BSON IDs are rejected', () => {
  const f = fixture(), second = clone(f.row); second._id = new BSON.ObjectId('000000000000000000000002');
  for (const field of Object.keys(MODELS.Patient.fields)) { delete second['__enc_' + field + '_d']; second['__enc_' + field] = false; second[field] = f.values[field]; }
  second.nic = ' 900000001V '; second.patientNic_hmac = f.options.identityCodec.index(second.nic, 2);
  expect(() => planModelMigration([f.row, second], f.options)).toThrow('PATIENT_DUPLICATE');
  expect(() => planModelMigration([f.row, clone(f.row)], f.options)).toThrow('IDENTITY_INVALID');
});
test('receipt catches unrelated BSON mutation and swapped identity', () => {
  const f = fixture(), plan = planModelMigration([f.row], f.options).plans[0], after = apply(f.row, openMigrationOperation(plan, f.options.journalConfiguration).update);
  after.unrelatedInt64 = BSON.Long.fromString('9007199254740994'); expect(() => verifyMigrationReceipt(plan, after, 'after')).toThrow('PRESERVATION_FAILED');
  after._id = new BSON.ObjectId('000000000000000000000002'); expect(() => verifyMigrationReceipt(plan, after, 'after')).toThrow('PRESERVATION_FAILED');
});

test.each([['Patient', 'allergies', ['Synthetic updated allergen']], ['Consultation', 'diagnosis', 'Synthetic revised diagnosis'], ['Prescription', 'dosage', 'Synthetic revised dose'], ['LabTest', 'patientEmail', 'qa@example.invalid'], ['TestOrder', 'resultNotes', 'Synthetic revised notes'], ['Doctor', 'licenseNo', 'SYNTHETIC-ONLY']])('%s typed field change plans encrypted CAS and exact original rollback', (model, field, value) => {
  const f = fixture(model), input = canonical(f.row), reviewFieldChanges = jest.fn(() => true);
  const result = planModelFieldUpdate(f.row, { [field]: value }, { ...f.options, reviewFieldChanges });
  const plan = result.plans[0], operation = openMigrationOperation(plan, f.options.journalConfiguration);
  const after = apply(f.row, operation.update), restored = apply(after, operation.rollback);
  const context = { collection: MODELS[model].collection, recordId: String(f.row._id), field };
  expect(JSON.parse(createAuthenticatedFields(f.options.newConfiguration).decrypt(after['__enc_' + field + '_d'], context)).value).toEqual(value);
  expect(after[field]).toBeUndefined(); expect(verifyMigrationReceipt(plan, after, 'after').verified).toBe(true);
  expect(verifyMigrationReceipt(plan, restored, 'restored').verified).toBe(true); expect(canonical(f.row)).toBe(input);
  expect(reviewFieldChanges.mock.calls[0][0]).toMatchObject({ before: { [field]: f.values[field] }, after: { [field]: value }, fields: [field] });
  expect(result).toMatchObject({ mode: 'OFFLINE_MODEL_FIELD_UPDATE_PLAN', writes: 0, liveExecutionAuthorized: false });
  expect(plan.intent).toBe('FIELD_UPDATE'); expect(JSON.stringify(result)).not.toContain('Synthetic revised');
});
test('adding an absent optional typed field and clearing it to null never writes a plaintext string', () => {
  const f = fixture(); delete f.row.__enc_contactInfo; delete f.row.__enc_contactInfo_d;
  const plan = planModelFieldUpdate(f.row, { contactInfo: 'Synthetic contact' }, { ...f.options, reviewFieldChanges: () => true }).plans[0];
  const after = apply(f.row, openMigrationOperation(plan, f.options.journalConfiguration).update);
  expect(after.contactInfo).toBeUndefined(); expect(after.__enc_contactInfo_d).toMatch(/^gcm1\.2\./);
  const clear = planModelFieldUpdate(after, { contactInfo: null }, { ...f.options, oldConfiguration: f.options.newConfiguration, reviewFieldChanges: () => true }).plans[0];
  const cleared = apply(after, openMigrationOperation(clear, f.options.journalConfiguration).update);
  expect(cleared.contactInfo).toBeNull(); expect(cleared.__enc_contactInfo).toBe(false); expect(cleared.__enc_contactInfo_d).toBe('');
});
test.each(['$set', '__enc_fullName_d', 'keyVersion', '_id', '__v', 'nic', 'fullName.nested'])('field-update planner rejects query/metadata/identity path %s', field => {
  const f = fixture(); expect(() => planModelFieldUpdate(f.row, { [field]: 'Synthetic-only' }, f.options)).toThrow('MODEL_FIELD_UPDATE_FIELDS_INVALID');
});
test('field-update planner never changes the patient identity used for ownership or consent', () => {
  const f = fixture('Prescription'); expect(() => planModelFieldUpdate(f.row, { patientNic: '900000002V' }, { ...f.options, reviewFieldChanges: () => true })).toThrow('MODEL_FIELD_UPDATE_FIELDS_INVALID');
});
test.each([undefined, () => false, () => { throw new Error('private reviewer details'); }])('field-update planner requires affirmative scoped review', reviewFieldChanges => {
  const f = fixture(); expect(() => planModelFieldUpdate(f.row, { fullName: 'Synthetic replacement' }, { ...f.options, reviewFieldChanges })).toThrow(/^MODEL_(?:FIELD_UPDATE_REVIEW_REQUIRED|MIGRATION_REVIEW_FAILED)$/);
});
test('field-update intent and field-list tampering cannot relabel the encrypted recovery operation', () => {
  const f = fixture(), plan = planModelFieldUpdate(f.row, { fullName: 'Synthetic replacement' }, { ...f.options, reviewFieldChanges: () => true }).plans[0];
  expect(() => openMigrationOperation({ ...plan, intent: 'MIGRATION' }, f.options.journalConfiguration)).toThrow('JOURNAL_MISMATCH');
  expect(() => openMigrationOperation({ ...plan, changedFields: ['allergies'] }, f.options.journalConfiguration)).toThrow('JOURNAL_MISMATCH');
});
