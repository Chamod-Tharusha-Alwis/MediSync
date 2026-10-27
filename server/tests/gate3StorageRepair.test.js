'use strict';
jest.mock('dotenv', () => ({ config: jest.fn(() => ({ parsed: {} })) }));
jest.mock('mongodb', () => ({ ...jest.requireActual('mongodb'), MongoClient: jest.fn() }));
const { MongoClient } = require('mongodb');
const { runProvisioning, compareStorageWithManifest } = require('../scripts/provisionProductionStorage');
const { verifyProductionStorage, manifest } = require('../src/security/productionStorageAdmission');
const { storageFixture } = require('./helpers/gate3StorageFixture');
const flags = Object.fromEntries(manifest.collections.flatMap(row => (row.whenAll || []).map(flag => [flag, 'true'])));
const syntheticUri = 'mongodb+srv://inert:inert@medisync.p7hjket.mongodb.net/medisync_prod?tls=true';
let close, fixture, priorEnv;

beforeEach(() => {
  priorEnv = { ...process.env };
  process.env = require('./helpers/gate3OperatorEnvironment').production();
  for (const flag of Object.keys(flags)) delete process.env[flag];
  fixture = storageFixture();
  close = jest.fn(async () => {});
  MongoClient.mockImplementation(() => ({ connect: jest.fn(async () => {}), db: () => fixture.db, close }));
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { process.env = priorEnv; jest.restoreAllMocks(); });

test('apply creates exact audit capped options and OTP TTL; actual strict verifier accepts the resulting metadata', async () => {
  const plan = await runProvisioning({ isApply: true });
  expect(plan.isCompliant).toBe(true);
  expect(fixture.writes).toContainEqual({ operation: 'createCollection', name: 'auditlogs', options: { capped: true, size: 104857600, max: 100000 } });
  expect(fixture.writes).toContainEqual({ operation: 'createIndex', collection: 'otpsessions', key: { expiresAt: 1 }, options: { name: 'expiresAt_1', expireAfterSeconds: 0 } });
  await expect(verifyProductionStorage(fixture.db, {})).resolves.toMatchObject({ verifiedCollections: 28, verifiedRequiredIndexes: 65 });
  expect(close).toHaveBeenCalledTimes(1);
});

test('dry-run on an empty store performs zero DDL and omits optional reminder storage', async () => {
  const plan = await runProvisioning();
  expect(plan.totalRequiredCollections).toBe(28);
  expect(plan.totalRequiredIndexes).toBe(65);
  expect(plan.collectionsToCreate).not.toContain(manifest.collections.find(row => row.whenAll).name);
  expect(fixture.writes).toEqual([]);
});

test.each([{}, { [Object.keys(flags)[0]]: 'true' }, flags])('optional storage follows all flags: %j', async enabled => {
  Object.assign(process.env, enabled);
  const plan = await runProvisioning({ isApply: true });
  const optional = manifest.collections.find(row => row.whenAll);
  expect(fixture.rows.has(optional.name)).toBe(Object.keys(enabled).length === Object.keys(flags).length);
  if (fixture.rows.has(optional.name)) expect(fixture.rows.get(optional.name).options.validator).toEqual(optional.validator);
  await expect(verifyProductionStorage(fixture.db, enabled)).resolves.toBeDefined();
  expect(plan.isCompliant).toBe(true);
});

test('valid metadata verify and repeat apply write nothing; unrelated collection and metadata remain untouched', async () => {
  fixture = storageFixture({ complete: true });
  fixture.rows.set('phase5x_audit_qa', { name: 'phase5x_audit_qa', type: 'collection', options: {}, indexes: [{ name: '_id_', key: { _id: 1 } }] });
  const before = structuredClone([...fixture.rows]);
  await expect(runProvisioning({ isVerify: true })).resolves.toMatchObject({ isCompliant: true });
  await expect(runProvisioning({ isApply: true })).resolves.toMatchObject({ isCompliant: true });
  expect([...fixture.rows]).toEqual(before);
  expect(fixture.writes).toEqual([]);
});

const wrongMetadata = [
  ['uncapped audit', f => { f.rows.get('auditlogs').options = {}; }],
  ['wrong audit size', f => { f.rows.get('auditlogs').options.size = 1; }],
  ['wrong audit max', f => { f.rows.get('auditlogs').options.max = 1; }],
  ['unexpected capped collection', f => { f.rows.get('patients').options.capped = true; }],
  ['collection collation', f => { f.rows.get('patients').options.collation = { locale: 'en' }; }],
  ['collection validator', f => { f.rows.get('patients').options.validator = { forbidden: true }; }],
  ['view', f => { f.rows.get('patients').type = 'view'; }],
  ['wrong unique', f => { f.rows.get('patients').indexes.find(i => i.name === 'nic_1').unique = false; }],
  ['wrong sparse', f => { f.rows.get('patients').indexes.find(i => i.name === 'nic_1').sparse = true; }],
  ['missing sparse', f => { delete f.rows.get('labtests').indexes.find(i => i.name === 'reportId_1').sparse; }],
  ['missing TTL', f => { delete f.rows.get('otpsessions').indexes.find(i => i.key.expiresAt).expireAfterSeconds; }],
  ['wrong TTL', f => { f.rows.get('otpsessions').indexes.find(i => i.key.expiresAt).expireAfterSeconds = 60; }],
  ['compound order', f => { const i = f.rows.get('trusteddevices').indexes.find(i => Object.keys(i.key).length > 1); i.key = Object.fromEntries(Object.entries(i.key).reverse()); }],
  ['duplicate pattern', f => { f.rows.get('patients').indexes.push({ ...f.rows.get('patients').indexes[1], name: 'duplicate' }); }],
  ['hidden index', f => { f.rows.get('patients').indexes[1].hidden = true; }],
  ['partial index', f => { f.rows.get('patients').indexes[1].partialFilterExpression = { isActive: true }; }],
  ['extra unique constraint', f => { f.rows.get('patients').indexes.push({ name: 'extra', key: { fullName: 1 }, unique: true }); }]
];
test.each(wrongMetadata)('incompatible %s fails comparator and both verify/apply without writes', async (_name, corrupt) => {
  fixture = storageFixture({ complete: true }); corrupt(fixture);
  const before = structuredClone([...fixture.rows]);
  const plan = compareStorageWithManifest(fixture.metadata(), fixture.indexes(), manifest, {});
  expect(plan.isCompliant).toBe(false); expect(plan.incompatibilities.length).toBeGreaterThan(0);
  await expect(runProvisioning({ isVerify: true })).rejects.toThrow('EXISTING_STORAGE_INCOMPATIBLE');
  await expect(runProvisioning({ isApply: true })).rejects.toThrow('EXISTING_STORAGE_INCOMPATIBLE');
  await expect(verifyProductionStorage(fixture.db, {})).rejects.toThrow('PREREQUISITES_NOT_VERIFIED');
  expect(fixture.writes).toEqual([]); expect([...fixture.rows]).toEqual(before);
  expect(console.log.mock.calls.flat().join(' ')).not.toContain('[VERIFY PASS]');
});

test('missing compatible index can be created additively with its required unique/sparse metadata', async () => {
  fixture = storageFixture({ complete: true });
  const spec = manifest.collections.find(c => c.name === 'labtests').indexes.find(i => i.name === 'reportId_1');
  fixture.rows.get('labtests').indexes = fixture.rows.get('labtests').indexes.filter(i => i.name !== spec.name);
  await runProvisioning({ isApply: true });
  expect(fixture.writes).toEqual([{ operation: 'createIndex', collection: 'labtests', key: spec.key, options: { name: spec.name, unique: true, sparse: true } }]);
});

test.each(['collection metadata', 'index metadata', 'topology'])('%s failure never produces VERIFY PASS and closes the client', async where => {
  fixture = storageFixture({ complete: true });
  if (where === 'collection metadata') fixture.db.listCollections = () => { throw Error('INERT_METADATA_FAILURE'); };
  if (where === 'index metadata') fixture.db.collection = () => ({ indexes: async () => { throw Error('INERT_METADATA_FAILURE'); } });
  if (where === 'topology') fixture.db.command = async command => command.connectionStatus ? require('./helpers/gate3OperatorEnvironment').identity(fixture.db.databaseName) : { isWritablePrimary: false };
  await expect(runProvisioning({ isVerify: true })).rejects.toThrow();
  expect(fixture.writes).toEqual([]); expect(close).toHaveBeenCalledTimes(1);
  expect(console.log.mock.calls.flat().join(' ')).not.toContain('[VERIFY PASS]');
});

test('post-apply incompatible server metadata fails without attempting repairs', async () => {
  fixture.db.createCollection.mockImplementation(async (name, options) => {
    fixture.writes.push({ operation: 'createCollection', name });
    fixture.rows.set(name, { name, type: 'collection', options: name === 'auditlogs' ? {} : options, indexes: [{ name: '_id_', key: { _id: 1 } }] });
  });
  await expect(runProvisioning({ isApply: true })).rejects.toThrow('EXISTING_STORAGE_INCOMPATIBLE');
  expect(console.log.mock.calls.flat().join(' ')).not.toContain('[APPLY COMPLETE]');
});

test('name-only metadata cannot claim compliance', () => {
  fixture = storageFixture({ complete: true });
  expect(compareStorageWithManifest(fixture.metadata().map(row => row.name), fixture.indexes(), manifest, {}).isCompliant).toBe(false);
});

test('read-only preflight supplies full collection metadata and refuses incompatible options', async () => {
  fixture = storageFixture({ complete: true });
  fixture.rows.get('auditlogs').options = {};
  fixture.db.command.mockResolvedValue({ authInfo: { authenticatedUsers: [{ user: 'inert', db: 'admin' }], authenticatedUserRoles: [{ role: 'readWrite', db: 'medisync_prod' }] } });
  const { runLiveConnectivityPreflight } = require('../scripts/preflightProduction');
  await expect(runLiveConnectivityPreflight({ MONGO_URI: syntheticUri })).rejects.toThrow('PREFLIGHT_STORAGE_INCOMPATIBLE');
  expect(fixture.db.listCollections).toHaveBeenCalledWith({}, expect.objectContaining({ nameOnly: false, authorizedCollections: false }));
  expect(fixture.writes).toEqual([]); expect(close).toHaveBeenCalledTimes(1);
});

test('incompatibility blocks all additions even when another required collection is missing', async () => {
  fixture = storageFixture({ complete: true });
  fixture.rows.delete('doctors');
  fixture.rows.get('auditlogs').options.capped = false;
  await expect(runProvisioning({ isApply: true })).rejects.toThrow('EXISTING_STORAGE_INCOMPATIBLE');
  expect(fixture.writes).toEqual([]);
  expect(fixture.rows.has('doctors')).toBe(false);
});
