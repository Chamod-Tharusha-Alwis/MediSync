'use strict';
jest.mock('dotenv', () => ({ config: jest.fn(() => ({ parsed: {} })) }));
jest.mock('mongodb', () => ({ ...jest.requireActual('mongodb'), MongoClient: jest.fn() }));
const { selectOperatorDatabase, verifyOperatorIdentity } = require('../scripts/operatorDatabaseMode');
const { production, qa, identity } = require('./helpers/gate3OperatorEnvironment');
const { MongoClient } = require('mongodb');
const { runProvisioning } = require('../scripts/provisionProductionStorage');
const { storageFixture } = require('./helpers/gate3StorageFixture');

test.each([false, true])('mode %s pins URI source, database and secure driver options', isQa => {
  const env = isQa ? qa() : production(), result = selectOperatorDatabase(env, isQa);
  expect(result.uri).toBe(isQa ? env.MONGO_URI_TEST : env.MONGO_URI);
  expect(result.database).toBe(isQa ? 'medisync_automated_test' : 'medisync_prod');
  expect(result.connectionOptions).toMatchObject({ dbName: result.database, tls: true, authSource: 'admin', authMechanism: 'SCRAM-SHA-256', readPreference: 'primary', writeConcern: { w: 'majority' } });
});

test.each([null, 'qa', 1, 0])('incorrect mode %j is rejected', mode => expect(() => selectOperatorDatabase(production(), mode)).toThrow('MODE_INVALID'));
test.each([false, true])('mode %s rejects missing intended URI instead of fallback', isQa => {
  const env = isQa ? qa() : production(); delete env[isQa ? 'MONGO_URI_TEST' : 'MONGO_URI'];
  expect(() => selectOperatorDatabase(env, isQa)).toThrow();
  env[isQa ? 'MONGO_URI' : 'MONGO_URI_TEST'] = 'must-not-be-read';
  expect(() => selectOperatorDatabase(env, isQa)).toThrow('MIXED_ENVIRONMENT');
});
test.each([false, true])('mixed mode %s is rejected before any URI getter can run', isQa => {
  const env = isQa ? qa() : production();
  Object.defineProperty(env, isQa ? 'MONGO_URI' : 'MONGO_URI_TEST', { get() { throw Error('CREDENTIAL_READ_FORBIDDEN'); } });
  expect(() => selectOperatorDatabase(env, isQa)).toThrow('MIXED_ENVIRONMENT');
});
test.each(['MONGODB_URI', 'DATABASE_URL', 'MONGO_URI_STAGING', 'mongo_uri', 'MONGODB_URI_TEST'])('ambiguous URI alias %s is rejected even when empty', name => {
  expect(() => selectOperatorDatabase({ ...production(), [name]: '' })).toThrow('MIXED_ENVIRONMENT');
});
test('an intended URI accessor cannot swap credentials after policy validation', () => {
  const env = production();
  Object.defineProperty(env, 'MONGO_URI', { get() { throw Error('CREDENTIAL_GETTER_MUST_NOT_RUN'); } });
  expect(() => selectOperatorDatabase(env)).toThrow('URI_REQUIRED');
});
test.each([
  ['test mode', e => { e.NODE_ENV = 'test'; }],
  ['missing mode', e => { delete e.NODE_ENV; }],
  ['QA bootstrap false', e => { e.MEDISYNC_QA_BOOTSTRAPPED = 'false'; }],
  ['QA seed material', e => { e.SEED_TEST_PASSWORD = ''; }]
])('production rejects %s', (_name, mutate) => { const env = production(); mutate(env); expect(() => selectOperatorDatabase(env)).toThrow(); });
test.each([
  ['production mode', e => { e.NODE_ENV = 'production'; }],
  ['missing bootstrap', e => { delete e.MEDISYNC_QA_BOOTSTRAPPED; }],
  ['missing rotation', e => { delete e.MEDISYNC_QA_CREDENTIALS_ROTATED; }],
  ['production flag', e => { e.MEDISYNC_LIVE_START_APPROVED = 'false'; }]
])('QA rejects %s', (_name, mutate) => { const env = qa(); mutate(env); expect(() => selectOperatorDatabase(env, true)).toThrow(); });

const invalidOptions = ['tls=false', 'ssl=false', 'sslValidate=false', 'tlsInsecure=true', 'tlsAllowInvalidCertificates=true', 'tlsAllowInvalidHostnames=true', 'dbName=other', 'authSource=other', 'authMechanism=PLAIN', 'readPreference=secondary', 'w=0', 'directConnection=true', 'loadBalanced=true', 'tls=true&TLS=false', 'unknownOption=true'];
test.each([false, true].flatMap(isQa => invalidOptions.map(option => [isQa, option])))('mode %s denies URI options %s', (isQa, option) => {
  const env = isQa ? qa() : production(), key = isQa ? 'MONGO_URI_TEST' : 'MONGO_URI';
  env[key] = env[key].split('?')[0] + '?' + option;
  expect(() => selectOperatorDatabase(env, isQa)).toThrow();
});
test.each([false, true].flatMap(isQa => ['test', 'admin', isQa ? 'medisync_prod' : 'medisync_automated_test'].map(db => [isQa, db])))('mode %s rejects database %s', (isQa, db) => {
  const env = isQa ? qa() : production(), key = isQa ? 'MONGO_URI_TEST' : 'MONGO_URI';
  env[key] = env[key].replace(isQa ? '/medisync_automated_test' : '/medisync_prod', '/' + db);
  expect(() => selectOperatorDatabase(env, isQa)).toThrow();
});
test.each([
  [false, 'other.mongodb.net'],
  [false, '127.0.0.1'],
  [false, 'localhost'],
  [false, 'medisync.p7hjket.mongodb.net.attacker.invalid'],
  [false, '*.mongodb.net'],
  [true, 'other.mongodb.net'],
  [true, '127.0.0.1'],
  [true, 'medisync.p7hjket.mongodb.net.attacker.invalid'],
  [true, 'medisync.p7hjket.mongodb.net']
])('mode %s rejects host %s', (isQa, host) => {
  const env = isQa ? qa() : production(), key = isQa ? 'MONGO_URI_TEST' : 'MONGO_URI';
  env[key] = env[key].replace(isQa ? 'qa-project-medisync.gwprp27.mongodb.net' : 'medisync.p7hjket.mongodb.net', host);
  expect(() => selectOperatorDatabase(env, isQa)).toThrow();
});
test('production mode accepts generalized valid Atlas SRV host', () => {
  const env = production();
  env.MONGO_URI = env.MONGO_URI.replace('medisync.p7hjket.mongodb.net', 'newcluster.abc12.mongodb.net');
  expect(selectOperatorDatabase(env, false)).toMatchObject({ database: 'medisync_prod' });
});

const badProofs = [
  ['read-only role', db => ({ authenticatedUsers: [{}], authenticatedUserRoles: [{ role: 'read', db }] })],
  ['wrong database', () => ({ authenticatedUsers: [{}], authenticatedUserRoles: [{ role: 'readWrite', db: 'other' }] })],
  ['extra role', db => ({ authenticatedUsers: [{}], authenticatedUserRoles: [{ role: 'readWrite', db }, { role: 'dbAdmin', db }] })],
  ['no user', db => ({ authenticatedUsers: [], authenticatedUserRoles: [{ role: 'readWrite', db }] })],
  ['two users', db => ({ authenticatedUsers: [{}, {}], authenticatedUserRoles: [{ role: 'readWrite', db }] })],
  ['no metadata', () => ({})],
  ['non-array metadata', db => ({ authenticatedUsers: { length: 1 }, authenticatedUserRoles: { 0: { role: 'readWrite', db }, length: 1 } })]
];
test.each([false, true])('mode %s accepts exactly the restricted role', async isQa => {
  const target = selectOperatorDatabase(isQa ? qa() : production(), isQa);
  await expect(verifyOperatorIdentity({ databaseName: target.database, command: async () => identity(target.database) }, target)).resolves.toMatchObject({ dbName: target.database });
});
test.each([false, true].flatMap(isQa => badProofs.map(([name, proof]) => [isQa, name, proof])))('mode %s denies %s before provisioning writes', async (isQa, _name, proof) => {
  const priorEnv = process.env; process.env = isQa ? qa() : production();
  const fixture = storageFixture(); fixture.db.databaseName = isQa ? 'medisync_automated_test' : 'medisync_prod';
  fixture.db.command.mockResolvedValue({ authInfo: proof(fixture.db.databaseName) });
  const close = jest.fn(async () => {});
  MongoClient.mockImplementation(() => ({ connect: async () => {}, db: () => fixture.db, close }));
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    await expect(runProvisioning({ isApply: true, isQa })).rejects.toThrow(/ROLE/);
    expect(fixture.writes).toEqual([]); expect(fixture.db.listCollections).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledTimes(1);
  } finally { process.env = priorEnv; log.mockRestore(); }
});
test.each([false, true])('mode %s fails closed on role-command or database identity failure', async isQa => {
  const target = selectOperatorDatabase(isQa ? qa() : production(), isQa);
  await expect(verifyOperatorIdentity({ databaseName: target.database, command: async () => { throw Error('inert'); } }, target)).rejects.toThrow(/ROLE/);
  await expect(verifyOperatorIdentity({ databaseName: 'other', command: async () => identity(target.database) }, target)).rejects.toThrow(/IDENTITY/);
});

const entrypoints = [
  ['provision', options => runProvisioning(options)],
  ['bootstrap', options => require('../scripts/bootstrapSyntheticAccounts').bootstrapSyntheticData(options)]
];
const wrongModes = [
  ['QA-only environment in default mode', () => qa(), false],
  ['production environment in explicit QA mode', () => production(), true],
  ['both URI names', () => ({ ...production(), MONGO_URI_TEST: qa().MONGO_URI_TEST }), false],
  ['production URI targeting QA database', () => ({ ...production(), MONGO_URI: production().MONGO_URI.replace('/medisync_prod', '/medisync_automated_test') }), false],
  ['QA URI targeting production database', () => ({ ...qa(), MONGO_URI_TEST: qa().MONGO_URI_TEST.replace('/medisync_automated_test', '/medisync_prod') }), true]
];
test.each(entrypoints.flatMap(([entry, run]) => wrongModes.map(([name, environment, isQa]) => [entry, name, run, environment, isQa])))('%s entrypoint denies %s before constructing a client or connecting', async (_entry, _name, run, environment, isQa) => {
  const priorEnv = process.env; process.env = environment();
  const mongoose = require('mongoose'), connect = jest.spyOn(mongoose, 'connect');
  MongoClient.mockClear();
  try {
    await expect(run({ isApply: true, isQa })).rejects.toThrow(/OPERATOR_|PRODUCTION_|QA_/);
    expect(MongoClient).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
  } finally { process.env = priorEnv; connect.mockRestore(); }
});
