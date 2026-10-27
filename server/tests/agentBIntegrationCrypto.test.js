'use strict';
const crypto = require('crypto');
const { createSecurityRuntime } = require('../src/security/securityRuntime');
const { nicFilter, writeNicFields, boundNicFilter } = require('../src/security/nicPersistence');
const nic = '900000001V';
const configuration = () => ({ schema: 1, nicMode: 'dual', fieldMode: 'gcm', nicKeys: { 1: crypto.randomBytes(32).toString('base64') }, nicActiveVersion: 1, fieldKeys: { 1: crypto.randomBytes(32).toString('base64') }, fieldActiveVersion: 1 });

test('HMAC-only cutover is held while canonical Patient still requires its plaintext NIC field', () => {
  jest.isolateModules(() => {
    const runtime = require('../src/security/securityRuntime'); runtime.initialize({ ...configuration(), nicMode: 'hmac' });
    const model = { schema: { path: field => field === 'nic' ? { options: { unique: true, required: true } } : {} } };
    expect(() => runtime.assertProtectedCompatibility({ Patient: model, Consultation: model, fieldPlugin: { securityFormat: 'gcm1' }, doctorCreate: { securityCommandVersion: 1 } })).toThrow('PROTECTED_PATIENT_NIC_STORAGE_MIGRATION_REQUIRED');
  });
});

test('partial dual/GCM compatibility does not incorrectly claim the unencrypted Patient NIC index is removed', () => {
  jest.isolateModules(() => {
    const runtime = require('../src/security/securityRuntime'); runtime.initialize(configuration());
    const model = { schema: { path: field => field === 'nic' ? { options: { unique: true, required: true } } : {} } };
    expect(() => runtime.assertProtectedCompatibility({ Patient: model, Consultation: model, fieldPlugin: { securityFormat: 'gcm1' }, doctorCreate: { securityCommandVersion: 1 } })).not.toThrow();
    expect(runtime.current().status().requiresMigration).toBe(true);
  });
});

test('integrated dual reads/writes preserve authorization scope and explicit legacy compatibility', () => {
  const codec = createSecurityRuntime(configuration());
  expect(writeNicFields(nic, { codec })).toMatchObject({ patientNic_hmac: expect.stringMatching(/^hmac-sha256:1:/), patientNic_bi: expect.any(String), nicHash: expect.any(String) });
  const query = boundNicFilter(nic, { doctorId: 'owned-actor', status: 'pending' }, { codec });
  expect(query.$and[1]).toEqual({ doctorId: 'owned-actor', status: 'pending' });
  expect(query.$and[0].$or[0]).toHaveProperty('patientNic_hmac');
  expect(() => boundNicFilter(nic, {}, { codec })).toThrow('NIC_AUTHORIZATION_SCOPE_REQUIRED');
});
test('HMAC-only reader and writer cannot fall back to plaintext or unkeyed SHA', () => {
  const codec = createSecurityRuntime({ ...configuration(), nicMode: 'hmac' });
  expect(Object.keys(writeNicFields(nic, { codec }))).toEqual(['patientNic_hmac']);
  const query = nicFilter(nic, { codec, plainFields: ['nic'], legacyFields: ['nicHash', 'patientNic_bi'] });
  expect(Object.keys(query)).toEqual(['patientNic_hmac']);
});
test.each(['schema', 'nicMode', 'fieldMode', 'nicKey', 'fieldKey', 'purposeReuse', 'jwtReuse'])('security bootstrap rejects %s configuration', variant => {
  const c = configuration(); const options = {};
  if (variant === 'schema') c.schema = 2;
  if (variant === 'nicMode') c.nicMode = 'fallback';
  if (variant === 'fieldMode') c.fieldMode = 'cbc-write';
  if (variant === 'nicKey') c.nicKeys[1] = 'not-base64';
  if (variant === 'fieldKey') c.fieldKeys[1] = Buffer.alloc(32).toString('base64');
  if (variant === 'purposeReuse') c.fieldKeys[1] = c.nicKeys[1];
  if (variant === 'jwtReuse') { options.otherSecrets = ['synthetic-other-purpose-secret']; c.nicKeys[1] = crypto.createHash('sha256').update(options.otherSecrets[0]).digest('base64'); }
  expect(() => createSecurityRuntime(c, options)).toThrow();
});
test('configuration and returned key buffers cannot mutate an admitted runtime', () => {
  const c = configuration(), runtime = createSecurityRuntime(c), initial = runtime.index(nic);
  c.nicMode = 'legacy'; c.nicActiveVersion = 2; c.nicKeys[1] = crypto.randomBytes(32).toString('base64');
  runtime.fieldConfiguration().keys[1].fill(0);
  expect(runtime.index(nic)).toBe(initial); expect(runtime.fieldConfiguration().keys[1].every(x => x === 0)).toBe(false);
});
test('migration modes remain held until separately protected schemas/plugin are compatible', () => {
  jest.isolateModules(() => {
    const runtime = require('../src/security/securityRuntime'); runtime.initialize(configuration());
    const schema = { path: () => undefined };
    expect(() => runtime.assertProtectedCompatibility({ Patient: { schema }, Consultation: { schema }, fieldPlugin: {} })).toThrow('PROTECTED_NIC_MIGRATION_APPROVAL_REQUIRED');
    const compatible = { schema: { path: () => ({}) } };
    expect(() => runtime.assertProtectedCompatibility({ Patient: compatible, Consultation: compatible, fieldPlugin: {} })).toThrow('PROTECTED_FIELD_MIGRATION_APPROVAL_REQUIRED');
    expect(() => runtime.initialize(configuration())).toThrow('SECURITY_RUNTIME_ALREADY_INITIALIZED');
  });
});
test('nonprotected model integration selects GCM, binds identity/AAD and emits keyed indexes', async () => {
  jest.isolateModules(() => {
    const runtime = require('../src/security/securityRuntime'); runtime.initialize(configuration());
    const methods = {}, hooks = {}, paths = {};
    const schema = { path: field => field === 'patientNic' || paths[field], add: values => Object.assign(paths, values), methods,
      plugin(fn, options) { fn(this, options); }, pre(event, fn) { (hooks[event] ||= []).push(fn); }, post() {} };
    require('../src/security/fieldEncryption')(schema, { fields: ['patientNic', 'notes'] });
    const doc = { _id: '000000000000000000000001', patientNic: nic, notes: 'synthetic-only', constructor: { collection: { name: 'labtests' } } };
    for (const hook of hooks.save) hook.call(doc);
    expect(doc.patientNic_hmac).toMatch(/^hmac-sha256:1:/); expect(doc.__enc_notes_d).toMatch(/^gcm1\./); expect(doc.notes).toBeUndefined();
    methods.decryptFieldsSync.call(doc); expect(doc.notes).toBe('synthetic-only');
    methods.encryptFieldsSync.call(doc); doc._id = '000000000000000000000002'; expect(() => methods.decryptFieldsSync.call(doc)).toThrow();
  });
});
