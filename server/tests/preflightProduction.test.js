'use strict';

const { runOfflinePreflight } = require('../scripts/preflightProduction');
jest.mock('dotenv', () => ({ config: jest.fn(() => ({ parsed: {} })) }));
jest.mock('mongodb', () => ({ ...jest.requireActual('mongodb'), MongoClient: jest.fn() }));
jest.mock('redis', () => ({ createClient: jest.fn() }));

describe('Production Preflight Offline Policy Gates', () => {
  const validProductionEnv = () => ({
    NODE_ENV: 'production',
    MEDISYNC_LIVE_START_APPROVED: 'true',
    MEDISYNC_ATLAS_ROTATION_CONFIRMED: 'true',
    MEDISYNC_DEPLOYMENT_MODE: 'clinical',
    MEDISYNC_PROTOTYPE_MODE: 'true',
    MEDISYNC_ALLOW_OPERATOR_KEYS: 'true',
    CLIENT_URL: 'https://medisync.chamodtharusha.com.lk',
    REDIS_URL: 'rediss://:strong-pass-xyz@red-cxxxxxx.render.com:6379/0',
    MONGO_URI: 'mongodb+srv://user:pass@medisync.p7hjket.mongodb.net/medisync_prod?tls=true&w=majority&readPreference=primary&authSource=admin&authMechanism=SCRAM-SHA-256',
    ACTIVE_KEY_VERSION: '1',
    ENCRYPTION_KEYS: '{"1":"a8f4c2b9e1d03756a8f4c2b9e1d03756a8f4c2b9e1d03756a8f4c2b9e1d03756"}',
    JWT_SECRET: 'dummy-production-jwt-secret-min-32-chars-long-abc',
    JWT_REFRESH_SECRET: 'dummy-production-jwt-refresh-secret-min-32-chars',
    SESSION_SECRET: 'dummy-session-secret-min-32-chars-long',
    INTERNAL_API_KEY: 'dummy-internal-api-key-32-chars-xyz'
  });

  test('passes all 8 offline gates when valid production environment is provided', () => {
    const results = runOfflinePreflight(validProductionEnv());
    expect(results).toHaveLength(8);
    for (const r of results) {
      expect(r.status).toBe('PASS');
    }
  });

  test('fails if MONGO_URI uses wrong cluster or non-admin authSource', () => {
    const env = validProductionEnv();
    env.MONGO_URI = 'mongodb+srv://user:pass@p7hjket.mongodb.net/medisync_prod?tls=true&w=majority&authSource=admin';
    const results = runOfflinePreflight(env);
    const atlasGate = results.find(r => r.gate.includes('Production Atlas'));
    expect(atlasGate.status).toBe('FAIL');
  });

  test('fails if forbidden QA material is detected', () => {
    const env = validProductionEnv();
    env.MONGO_URI_TEST = 'mongodb+srv://...';
    const results = runOfflinePreflight(env);
    const qaGate = results.find(r => r.gate.includes('Forbidden QA'));
    expect(qaGate.status).toBe('FAIL');
  });

  test('fails if operator keys are missing or invalid', () => {
    const env = validProductionEnv();
    delete env.ENCRYPTION_KEYS;
    const results = runOfflinePreflight(env);
    const keysGate = results.find(r => r.gate.includes('Operator Key'));
    expect(keysGate.status).toBe('FAIL');
  });
});

describe('Read-only preflight uses real runtime policies with inert transports', () => {
  const { runLiveConnectivityPreflight } = require('../scripts/preflightProduction');
  const { MongoClient } = require('mongodb');
  const { createClient } = require('redis');
  const { storageFixture } = require('./helpers/gate3StorageFixture');
  let fixture, findAdmin, close, redis, environment;
  beforeEach(() => {
    environment = { ...require('./helpers/gate3OperatorEnvironment').production(), REDIS_URL: 'rediss://:inert@redis.example.invalid:6379' };
    fixture = storageFixture({ complete: true });
    findAdmin = jest.fn(async () => ({ _id: 'inert-owned-admin-id' }));
    const collection = fixture.db.collection;
    fixture.db.collection = name => name === 'admins' ? { ...collection(name), findOne: findAdmin } : collection(name);
    close = jest.fn(async () => {});
    MongoClient.mockImplementation(() => ({ connect: jest.fn(async () => {}), db: () => fixture.db, close }));
    redis = { isOpen: true, on: jest.fn(), connect: jest.fn(async () => {}), ping: jest.fn(async () => 'PONG'), destroy: jest.fn(() => { redis.isOpen = false; }) };
    createClient.mockReturnValue(redis);
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); jest.useRealTimers(); });
  test('strict real storage verification, boot filter and TLS PING all pass without data writes', async () => {
    await expect(runLiveConnectivityPreflight(environment)).resolves.toMatchObject({ storage: { verifiedCollections: 28, verifiedRequiredIndexes: 65, transactionTopologyVerified: true }, operator: { activeSuperAdminVerified: true }, redis: { tls: true, ping: 'PONG' } });
    expect(MongoClient).toHaveBeenCalledWith(environment.MONGO_URI, expect.objectContaining({ tls: true, authSource: 'admin', authMechanism: 'SCRAM-SHA-256', socketTimeoutMS: 5000 }));
    expect(fixture.db.command.mock.calls.map(([c]) => c)).toEqual([{ connectionStatus: 1 }, { hello: 1 }]);
    expect(findAdmin).toHaveBeenCalledWith({ isActive: true, isSuperAdmin: true }, { projection: { _id: 1 }, maxTimeMS: 5000 });
    expect(createClient).toHaveBeenCalledWith({ url: environment.REDIS_URL, disableOfflineQueue: true, socket: { tls: true, rejectUnauthorized: true, connectTimeout: 5000, reconnectStrategy: false } });
    expect(redis.ping).toHaveBeenCalledTimes(1); expect(redis.destroy).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1); expect(fixture.writes).toEqual([]);
  });
  test('wrong role fails before storage, admin or Redis', async () => {
    fixture.db.command.mockResolvedValue({ authInfo: { authenticatedUsers: [{}], authenticatedUserRoles: [{ role: 'read', db: 'medisync_prod' }] } });
    await expect(runLiveConnectivityPreflight(environment)).rejects.toThrow('PRODUCTION_AUTHENTICATED_ROLE_DENIED');
    expect(fixture.db.listCollections).not.toHaveBeenCalled(); expect(findAdmin).not.toHaveBeenCalled(); expect(createClient).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledTimes(1);
  });
  test.each(['audit options', 'TTL', 'topology', 'missing collection', 'index metadata'])('runtime verifier denies %s before admin or Redis', async kind => {
    if (kind === 'audit options') fixture.rows.get('auditlogs').options.size = 1;
    if (kind === 'TTL') delete fixture.rows.get('otpsessions').indexes.find(i => i.key.expiresAt).expireAfterSeconds;
    if (kind === 'topology') fixture.db.command.mockImplementation(async cmd => cmd.connectionStatus ? require('./helpers/gate3OperatorEnvironment').identity('medisync_prod') : { isWritablePrimary: false });
    if (kind === 'missing collection') fixture.rows.delete('doctors');
    if (kind === 'index metadata') fixture.db.collection = () => ({ listIndexes: () => { throw Error('INERT_METADATA_FAILURE'); } });
    await expect(runLiveConnectivityPreflight(environment)).rejects.toThrow('PRODUCTION_STORAGE_PREREQUISITES_NOT_VERIFIED');
    expect(findAdmin).not.toHaveBeenCalled(); expect(createClient).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledTimes(1); expect(fixture.writes).toEqual([]);
  });
  test.each([null, {}])('missing usable active super-admin %j fails before Redis', async result => {
    findAdmin.mockResolvedValue(result);
    await expect(runLiveConnectivityPreflight(environment)).rejects.toThrow('PREFLIGHT_ACTIVE_SUPER_ADMIN_REQUIRED');
    expect(createClient).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledTimes(1); expect(fixture.writes).toEqual([]);
  });
  test('admin metadata error is sanitized and closes MongoDB', async () => {
    findAdmin.mockRejectedValue(Error('INERT_UNSAFE_DRIVER_DIAGNOSTIC'));
    await expect(runLiveConnectivityPreflight(environment)).rejects.toThrow('PREFLIGHT_BOOT_ADMIN_UNVERIFIED'); expect(close).toHaveBeenCalledTimes(1);
  });
  test.each(['connect', 'PING error', 'wrong PING'])('Redis %s failure disconnects both clients without writes', async kind => {
    if (kind === 'connect') redis.connect.mockRejectedValue(Error('INERT_FAILURE'));
    if (kind === 'PING error') redis.ping.mockRejectedValue(Error('INERT_FAILURE'));
    if (kind === 'wrong PING') redis.ping.mockResolvedValue('not-PONG');
    await expect(runLiveConnectivityPreflight(environment)).rejects.toThrow('PREFLIGHT_REDIS_UNAVAILABLE');
    expect(redis.destroy).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1); expect(fixture.writes).toEqual([]);
  });
  test('hung Redis PING times out and disconnects without leaving timers', async () => {
    jest.useFakeTimers(); redis.ping.mockImplementation(() => new Promise(() => {}));
    const work = expect(runLiveConnectivityPreflight(environment)).rejects.toThrow('PREFLIGHT_REDIS_UNAVAILABLE');
    await jest.runAllTimersAsync(); await work;
    expect(redis.destroy).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
  });
  test('cleanup failure cannot become a passing preflight', async () => {
    close.mockRejectedValue(Error('INERT_CLOSE_FAILURE'));
    await expect(runLiveConnectivityPreflight(environment)).rejects.toThrow('PREFLIGHT_DISCONNECT_UNVERIFIED'); expect(redis.destroy).toHaveBeenCalledTimes(1);
  });
  test.each(['redis://:inert@127.0.0.1:6379', 'rediss://redis.example.invalid:6379'])('insecure Redis configuration fails before either transport', async url => {
    environment.REDIS_URL = url;
    await expect(runLiveConnectivityPreflight(environment)).rejects.toThrow(/PREFLIGHT_REDIS_TLS_REQUIRED|REDIS_AUTHENTICATION_REQUIRED/);
    expect(MongoClient).not.toHaveBeenCalled(); expect(createClient).not.toHaveBeenCalled();
  });
  test('QA material fails before either transport', async () => {
    environment.MONGO_URI_TEST = 'inert-not-a-connection-string';
    await expect(runLiveConnectivityPreflight(environment)).rejects.toThrow('MIXED_ENVIRONMENT');
    expect(MongoClient).not.toHaveBeenCalled(); expect(createClient).not.toHaveBeenCalled();
  });
});

describe('Bootstrap/operator encryption contract — real model hooks, inert repositories', () => {
  let priorEnv, priorGlobals, mongoose, bootstrap, models, rows, environment, policy, runtime, nicFilter;
  const passwords = Object.fromEntries(['admin','doctor','hospital','pharmacy','patient'].map(role => [role, 'Synthetic-Only-Password-For-Key-Contract!']));
  beforeEach(() => {
    priorEnv = process.env;
    priorGlobals = { keys: global.ENCRYPTION_KEYS, version: global.ACTIVE_KEY_VERSION, key: global.ENCRYPTION_KEY };
    environment = { ...require('./helpers/gate3OperatorEnvironment').production(), MEDISYNC_PROTOTYPE_MODE: 'true', MEDISYNC_ALLOW_OPERATOR_KEYS: 'true', ENCRYPTION_KEYS: JSON.stringify({ '1': require('crypto').randomBytes(32).toString('hex') }), ACTIVE_KEY_VERSION: '1' };
    process.env = environment;
    delete global.ENCRYPTION_KEYS; delete global.ACTIVE_KEY_VERSION; delete global.ENCRYPTION_KEY;
    rows = new Map();
    jest.isolateModules(() => {
      mongoose = require('mongoose');
      bootstrap = require('../scripts/bootstrapSyntheticAccounts');
      models = Object.values(mongoose.models);
      policy = require('../src/security/operatorKeyPolicy');
      runtime = require('../src/security/securityRuntime');
      nicFilter = require('../src/security/nicPersistence').nicFilter;
    });
    const { BSON } = jest.requireActual('mongodb');
    const copy = value => BSON.deserialize(BSON.serialize(value));
    const sift = require('sift').default;
    for (const Model of models) {
      // Driver methods only: actual Model.save validation/encryption middleware
      // and actual Query casting/hydration execute, without a live connection.
      jest.spyOn(Model.collection, 'findOne').mockImplementation(async filter => {
        const row = rows.get(Model.modelName);
        return row && sift(filter)(row) ? copy(row) : null;
      });
      jest.spyOn(Model.collection, 'insertOne').mockImplementation(async document => {
        if (rows.has(Model.modelName)) throw Error('INERT_DUPLICATE_FORBIDDEN');
        rows.set(Model.modelName, copy(document));
        return { acknowledged: true, insertedId: document._id };
      });
    }
    mongoose.connection.db = { databaseName: 'medisync_prod', command: jest.fn(async () => require('./helpers/gate3OperatorEnvironment').identity('medisync_prod')) };
    jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
    jest.spyOn(mongoose, 'disconnect').mockResolvedValue();
    jest.spyOn(mongoose, 'startSession').mockResolvedValue({ startTransaction() {}, async commitTransaction() {}, inTransaction() { return true; }, async abortTransaction() { rows.clear(); }, async endSession() {} });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = priorEnv;
    global.ENCRYPTION_KEYS = priorGlobals.keys; global.ACTIVE_KEY_VERSION = priorGlobals.version; global.ENCRYPTION_KEY = priorGlobals.key;
    jest.restoreAllMocks();
  });
  test('bootstrap-created prescription decrypts through backend lookup under the same operator keys but cannot recover plaintext with a different key', async () => {
    await bootstrap.bootstrapSyntheticData({ isApply: true, passwords });
    const raw = rows.get('Prescription');
    expect(raw.__enc_patientNic).toBe(true); expect(raw.patientNic).not.toBe('199512345678');
    const keys = policy.validateAndLoadOperatorKeys(environment);
    global.ENCRYPTION_KEYS = keys.keys; global.ACTIVE_KEY_VERSION = keys.activeVersion; global.ENCRYPTION_KEY = keys.keys[keys.activeVersion];
    // Same operator-mode runtime initialization as app.js, without its server,
    // providers or network boundaries. No HMAC/GCM migration is enabled.
    runtime.initialize(null, { legacyKeys: keys.keys, otherSecrets: [] });
    expect(runtime.current().status()).toMatchObject({ nicMode: 'legacy', fieldMode: 'legacy' });
    const Prescription = mongoose.model('Prescription');
    const filter = { $and: [nicFilter('199512345678', { legacyFields: ['nicHash','patientNic_bi'], plainFields: ['patientNic'] }), { patientId: raw.patientId }] };
    const found = await Prescription.findOne(filter);
    expect(found).not.toBeNull(); found.decryptFieldsSync();
    expect(found.patientNic).toBe('199512345678'); expect(found.drugName).toBe('Amoxicillin 500mg');
    await expect(Prescription.findOne({ $and: [nicFilter('199512345679'), { patientId: raw.patientId }] })).resolves.toBeNull();
    global.ENCRYPTION_KEYS = { '1': require('crypto').randomBytes(32).toString('hex') };
    const wrong = new Prescription(raw);
    expect(wrong.__enc_patientNic).toBe(true);
    expect(wrong.patientNic).not.toBe('199512345678');
    // The installed legacy CBC helper returns empty text on a bad key instead
    // of throwing. Assert failure to recover data, not an invented exception.
    wrong.decryptFieldsSync();
    expect(wrong.patientNic).not.toBe('199512345678');
    expect(wrong.drugName).not.toBe('Amoxicillin 500mg');
    global.ENCRYPTION_KEYS = { '2': require('crypto').randomBytes(32).toString('hex') };
    expect(() => new Prescription(raw).decryptFieldsSync()).toThrow('Missing encryption key for version 1');
    expect(mongoose.connect).toHaveBeenCalledTimes(1); expect(mongoose.disconnect).toHaveBeenCalledTimes(1);
  });
  test.each(['ENCRYPTION_KEYS', 'ACTIVE_KEY_VERSION'])('production bootstrap rejects missing %s even with stale valid globals', async name => {
    global.ENCRYPTION_KEYS = JSON.parse(environment.ENCRYPTION_KEYS); global.ACTIVE_KEY_VERSION = '1';
    delete environment[name];
    await expect(bootstrap.bootstrapSyntheticData({ isApply: true, passwords })).rejects.toThrow('OPERATOR_KEY_ERROR');
    expect(mongoose.connect).not.toHaveBeenCalled(); expect(rows.size).toBe(0);
  });
  test('production bootstrap rejects a known default key before connecting', async () => {
    environment.ENCRYPTION_KEYS = JSON.stringify({ '1': '0'.repeat(64) });
    await expect(bootstrap.bootstrapSyntheticData({ isApply: true, passwords })).rejects.toThrow('OPERATOR_KEY_ERROR');
    expect(mongoose.connect).not.toHaveBeenCalled(); expect(rows.size).toBe(0);
  });
  test.each(['admin','doctor','hospital','pharmacy','patient'])('production apply rejects an 11-character %s password before connection', async role => {
    await expect(bootstrap.bootstrapSyntheticData({ isApply: true, passwords: { ...passwords, [role]: 'x'.repeat(11) } })).rejects.toThrow('minimum 12 characters each');
    expect(mongoose.connect).not.toHaveBeenCalled(); expect(rows.size).toBe(0);
  });
  test('production apply accepts all five passwords at the 12-character boundary', async () => {
    await expect(bootstrap.bootstrapSyntheticData({ isApply: true, passwords: Object.fromEntries(Object.keys(passwords).map(role => [role, 'Aa1!Bb2@Cc3#'])) })).resolves.toMatchObject({ updated: [] });
    expect(rows.size).toBe(10); expect(mongoose.connect).toHaveBeenCalledTimes(1);
  });
  test('production dry-run still permits absent passwords and creates no records', async () => {
    await expect(bootstrap.bootstrapSyntheticData({ passwords: {} })).resolves.toMatchObject({ created: [], updated: [] });
    expect(rows.size).toBe(0); expect(mongoose.startSession).not.toHaveBeenCalled(); expect(mongoose.disconnect).toHaveBeenCalledTimes(1);
  });
});

describe('COLD START — production bootstrap with no pre-set key globals', () => {
  test.each(['2', '1'])('cold CLI-shaped environment with two keys and ACTIVE_KEY_VERSION=%s uses the selected version', async activeVersion => {
    const priorEnv = process.env, priorArgv = process.argv;
    const before = { keys: global.ENCRYPTION_KEYS, version: global.ACTIVE_KEY_VERSION, key: global.ENCRYPTION_KEY };
    const keys = { '1': require('crypto').randomBytes(32).toString('hex'), '2': require('crypto').randomBytes(32).toString('hex') };
    const records = new Map(); let coldMongoose, coldBootstrap, coldModels, policy;
    const passwordNames = ['ADMIN','DOCTOR','HOSPITAL','PHARMACY','PATIENT'].map(role => 'BOOTSTRAP_'+role+'_PASSWORD');
    process.env = { ...require('./helpers/gate3OperatorEnvironment').production(), ENCRYPTION_KEYS: JSON.stringify(keys), ACTIVE_KEY_VERSION: activeVersion, ...Object.fromEntries(passwordNames.map(name => [name, 'Synthetic-Cold-Start-Only-Password!'])) };
    process.argv = [priorArgv[0], require('path').resolve(__dirname, '../scripts/bootstrapSyntheticAccounts.js'), '--apply'];
    delete global.ENCRYPTION_KEYS; delete global.ACTIVE_KEY_VERSION; delete global.ENCRYPTION_KEY;
    try {
      expect(Object.keys(process.env).some(name => /^(?:JEST_|MEDISYNC_QA_|MEDISYNC_TEST_)/.test(name))).toBe(false);
      jest.isolateModules(() => {
        coldMongoose = require('mongoose');
        expect(global.ENCRYPTION_KEYS).toBeUndefined(); expect(global.ACTIVE_KEY_VERSION).toBeUndefined(); expect(global.ENCRYPTION_KEY).toBeUndefined();
        coldBootstrap = require('../scripts/bootstrapSyntheticAccounts');
        // Bootstrap does not seed TestOrder. Compile it in the same cold
        // registry to cover all six schemas named in the load-order review.
        require('../src/models/TestOrder');
        coldModels = Object.values(coldMongoose.models);
        policy = require('../src/security/operatorKeyPolicy');
        // Requiring the models registers lazy defaults and encryption hooks.
        // It does not capture a key version or consume encryption material.
        expect(global.ENCRYPTION_KEYS).toBeUndefined(); expect(global.ACTIVE_KEY_VERSION).toBeUndefined(); expect(global.ENCRYPTION_KEY).toBeUndefined();
      });
      const { BSON } = jest.requireActual('mongodb'), sift = require('sift').default;
      const copy = value => BSON.deserialize(BSON.serialize(value));
      for (const Model of coldModels) {
        jest.spyOn(Model.collection, 'findOne').mockImplementation(async filter => {
          const row = records.get(Model.modelName); return row && sift(filter)(row) ? copy(row) : null;
        });
        jest.spyOn(Model.collection, 'insertOne').mockImplementation(async document => {
          if (records.has(Model.modelName)) throw Error('INERT_DUPLICATE_FORBIDDEN');
          records.set(Model.modelName, copy(document)); return { acknowledged: true, insertedId: document._id };
        });
      }
      coldMongoose.connection.db = { databaseName: 'medisync_prod', command: jest.fn(async () => require('./helpers/gate3OperatorEnvironment').identity('medisync_prod')) };
      jest.spyOn(coldMongoose, 'connect').mockResolvedValue(coldMongoose);
      jest.spyOn(coldMongoose, 'disconnect').mockResolvedValue();
      jest.spyOn(coldMongoose, 'startSession').mockResolvedValue({ startTransaction() {}, async commitTransaction() {}, inTransaction() { return true; }, async abortTransaction() { records.clear(); }, async endSession() {} });
      jest.spyOn(console, 'log').mockImplementation(() => {});
      await coldBootstrap.bootstrapSyntheticData({ isApply: true });
      expect(records.size).toBe(10);
      expect(global.ENCRYPTION_KEYS).toEqual(keys); expect(String(global.ACTIVE_KEY_VERSION)).toBe(activeVersion); expect(global.ENCRYPTION_KEY).toBe(keys[activeVersion]);
      for (const name of ['Patient','Consultation','Doctor','Prescription','LabTest','TestOrder']) {
        const Model = coldMongoose.model(name);
        expect(typeof Model.schema.path('keyVersion').defaultValue).toBe('function');
        // Constructor default must read the NOW-loaded version, independently
        // of the encryption save hook assigning a version later.
        expect(new Model({}).keyVersion).toBe(Number(activeVersion));
      }
      const checks = [['Patient','fullName','Kamal Gunaratne'],['Consultation','diagnosis','Seasonal Viral Pyrexia'],['Doctor','licenseNo','SLMC-SYNTH-001'],['Prescription','drugName','Amoxicillin 500mg'],['LabTest','patientName','Kamal Gunaratne']];
      const config = policy.validateAndLoadOperatorKeys(process.env);
      // Retain ONLY the selected version to prove the other key is not needed.
      global.ENCRYPTION_KEYS = { [activeVersion]: config.keys[activeVersion] };
      for (const [name,field,plain] of checks) {
        const raw = records.get(name), Model = coldMongoose.model(name);
        expect(raw.keyVersion).toBe(Number(activeVersion)); expect(raw[field]).not.toBe(plain);
        const decoded = new Model(copy(raw)); decoded.decryptFieldsSync(); expect(decoded[field]).toBe(plain);
      }
      // TestOrder is an explicit extra inert fixture, NOT a bootstrap-created
      // record. Its actual save hook must also use the selected cold version.
      const TestOrder = coldMongoose.model('TestOrder');
      const order = new TestOrder({ consultationId: records.get('Consultation')._id, doctorId: records.get('Doctor')._id, patientNic: '199512345678', testName: 'Synthetic cold test', testCategory: 'blood' });
      await order.save();
      const orderRaw = records.get('TestOrder'); expect(orderRaw.keyVersion).toBe(Number(activeVersion)); expect(orderRaw.patientNic).not.toBe('199512345678');
      const decodedOrder = new TestOrder(copy(orderRaw)); decodedOrder.decryptFieldsSync(); expect(decodedOrder.patientNic).toBe('199512345678');
      // Mapping the other version's KEY VALUE into the selected slot must not
      // recover the prescription. Legacy CBC may return empty rather than throw.
      const otherVersion = activeVersion === '2' ? '1' : '2';
      global.ENCRYPTION_KEYS = { [activeVersion]: keys[otherVersion] };
      const wrong = new (coldMongoose.model('Prescription'))(copy(records.get('Prescription')));
      wrong.decryptFieldsSync(); expect(wrong.patientNic).not.toBe('199512345678'); expect(wrong.drugName).not.toBe('Amoxicillin 500mg');
      global.ENCRYPTION_KEYS = { [otherVersion]: keys[otherVersion] };
      expect(() => new (coldMongoose.model('Prescription'))(copy(records.get('Prescription'))).decryptFieldsSync()).toThrow('Missing encryption key for version '+activeVersion);
      expect(coldMongoose.connect).toHaveBeenCalledTimes(1); expect(coldMongoose.disconnect).toHaveBeenCalledTimes(1);
    } finally {
      process.env = priorEnv; process.argv = priorArgv;
      global.ENCRYPTION_KEYS = before.keys; global.ACTIVE_KEY_VERSION = before.version; global.ENCRYPTION_KEY = before.key;
      jest.restoreAllMocks();
    }
  });
});
