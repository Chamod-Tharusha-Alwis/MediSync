const mongoose = require('mongoose');
const {
  PROD_DB_NAME,
  TEST_DB_NAME,
  DatabaseIsolationError,
  DestructiveOperationBlockedError,
  maskMongoUri,
  parseAndValidateAtlasUri,
  installDestructiveOpGuards,
  validateAutomatedTestConfig,
  connectProductionDB
} = require('../src/config/dbGuard');

describe('IR-02 MongoDB Atlas Free (M0) Database Isolation & Destructive-Op Safeguards', () => {
  beforeAll(() => {
    installDestructiveOpGuards();
  });

  test('1. Rejects missing or empty MongoDB URI immediately (no implicit fallback)', () => {
    expect(() => parseAndValidateAtlasUri('', 'MONGO_URI_TEST', TEST_DB_NAME)).toThrow(DatabaseIsolationError);
    expect(() => parseAndValidateAtlasUri(null, 'MONGO_URI', PROD_DB_NAME)).toThrow(DatabaseIsolationError);
  });

  test('2. Strictly prohibits local MongoDB (127.0.0.1 / localhost) per Atlas-Only policy', () => {
    expect(() =>
      parseAndValidateAtlasUri(
        'mongodb://user:pass@127.0.0.1:27017/medisync_automated_test',
        'MONGO_URI_TEST',
        TEST_DB_NAME
      )
    ).toThrow(/Local MongoDB host.*MediSync is strictly MongoDB Atlas Free/i);

    expect(() =>
      parseAndValidateAtlasUri(
        'mongodb://user:pass@localhost:27017/test',
        'MONGO_URI',
        PROD_DB_NAME
      )
    ).toThrow(/Local MongoDB host.*MediSync is strictly MongoDB Atlas Free/i);
  });

  test('3. Rejects non-Atlas hosts that do not end with .mongodb.net', () => {
    expect(() =>
      parseAndValidateAtlasUri(
        'mongodb://user:pass@db.example.org:27017/medisync_automated_test',
        'MONGO_URI_TEST',
        TEST_DB_NAME
      )
    ).toThrow(/Non-Atlas host/i);
  });

  test('4. Enforces explicit "/medisync_automated_test" database path in MONGO_URI_TEST', () => {
    const prodUri = 'mongodb+srv://prod_user:prod_pass@medisync.ffx62be.mongodb.net/test?appName=MediSync';
    const missingDbTestUri = 'mongodb+srv://test_user:test_pass@medisync.ffx62be.mongodb.net/?appName=MediSync';
    const wrongDbTestUri = 'mongodb+srv://test_user:test_pass@medisync.ffx62be.mongodb.net/medisync_test?appName=MediSync';

    expect(() =>
      validateAutomatedTestConfig({ testUri: missingDbTestUri, prodUri })
    ).toThrow(/must explicitly specify "\/medisync_automated_test"/i);

    expect(() =>
      validateAutomatedTestConfig({ testUri: wrongDbTestUri, prodUri })
    ).toThrow(/specifies database "medisync_test", but "medisync_automated_test" is required/i);
  });

  test('5. Blocks automated tests if MONGO_URI_TEST uses the same Atlas username as production MONGO_URI', () => {
    const prodUri = 'mongodb+srv://shared_admin:secret1@medisync.ffx62be.mongodb.net/test?appName=MediSync';
    const sameUserTestUri = 'mongodb+srv://shared_admin:secret2@medisync.ffx62be.mongodb.net/medisync_automated_test?appName=MediSync';

    expect(() =>
      validateAutomatedTestConfig({ testUri: sameUserTestUri, prodUri })
    ).toThrow(/Credential separation violation: MONGO_URI_TEST uses the same MongoDB Atlas database user/i);
  });

  test('6. Accepts valid Atlas MONGO_URI_TEST only when database is medisync_automated_test and username is distinct from MONGO_URI', () => {
    const prodUri = 'mongodb+srv://prod_user:prod_pass@medisync.ffx62be.mongodb.net/test?appName=MediSync';
    const validTestUri = 'mongodb+srv://restricted_test_user:test_pass@medisync.ffx62be.mongodb.net/medisync_automated_test?appName=MediSync';

    const result = validateAutomatedTestConfig({ testUri: validTestUri, prodUri });
    expect(result.pathnameDb).toBe('medisync_automated_test');
    expect(result.maskedUri).toContain('****');
    expect(result.maskedUri).not.toContain('test_pass');
    expect(result.maskedUri).not.toContain('restricted_test_user');
  });

  test('7. Permanently blocks dropDatabase() and dropCollection() at runtime', async () => {
    await expect(mongoose.Connection.prototype.dropDatabase()).rejects.toThrow(
      DestructiveOperationBlockedError
    );
    await expect(mongoose.Connection.prototype.dropCollection('patients')).rejects.toThrow(
      DestructiveOperationBlockedError
    );
    if (mongoose.mongo?.Db?.prototype) {
      await expect(mongoose.mongo.Db.prototype.dropDatabase()).rejects.toThrow(
        DestructiveOperationBlockedError
      );
      await expect(mongoose.mongo.Db.prototype.dropCollection('doctors')).rejects.toThrow(
        DestructiveOperationBlockedError
      );
    }
  });

  test('8. Permanently blocks blanket Model.deleteMany({}) while allowing scoped filters', () => {
    const DummySchema = new mongoose.Schema({ isTestFixture: Boolean, testRunId: String });
    const DummyModel = mongoose.models.DummyGuardModel || mongoose.model('DummyGuardModel', DummySchema);

    expect(() => DummyModel.deleteMany({})).toThrow(DestructiveOperationBlockedError);
    expect(() => DummyModel.deleteMany()).toThrow(DestructiveOperationBlockedError);
    expect(() => DummyModel.deleteMany(null)).toThrow(DestructiveOperationBlockedError);
  });

  test('9. Masks credentials safely in maskMongoUri() without leaking usernames or passwords', () => {
    const raw = 'mongodb://mySecretUser:mySecretPass123@shard-00.p7hjket.mongodb.net:27017/medisync_automated_test?ssl=true';
    const masked = maskMongoUri(raw);
    expect(masked).not.toContain('mySecretUser');
    expect(masked).not.toContain('mySecretPass123');
    expect(masked).toContain('user#');
    expect(masked).toContain(':****@');
  });

  test('10. Fails closed immediately if connectProductionDB() or mongoose.connect(prodUri) is called in automated test mode', async () => {
    const dummyProdUri = 'mongodb+srv://prod_user:prod_pass@medisync.ffx62be.mongodb.net/test?appName=MediSync';
    await expect(connectProductionDB(dummyProdUri)).rejects.toThrow(DatabaseIsolationError);
    await expect(mongoose.connect(dummyProdUri, { dbName: 'test' })).rejects.toThrow(DatabaseIsolationError);
  });

  test('11. Explicitly rejects production cluster (p7hjket.mongodb.net and medisync.p7hjket.mongodb.net) in MONGO_URI_TEST', () => {
    const prodClusterTestUri = 'mongodb+srv://test_user:test_pass@cluster0.p7hjket.mongodb.net/medisync_automated_test?appName=MediSync';
    expect(() =>
      validateAutomatedTestConfig({ testUri: prodClusterTestUri })
    ).toThrow(/Cluster collision violation: MONGO_URI_TEST points to denied production cluster "p7hjket.mongodb.net"/i);

    const exactProdClusterTestUri = 'mongodb+srv://test_user:test_pass@medisync.p7hjket.mongodb.net/medisync_automated_test?appName=MediSync';
    expect(() =>
      validateAutomatedTestConfig({ testUri: exactProdClusterTestUri })
    ).toThrow(/Cluster collision violation: MONGO_URI_TEST points to denied production cluster "p7hjket.mongodb.net"/i);
  });

  test('12. Rejects legacy database "test" and production database "medisync_prod" as QA target in MONGO_URI_TEST', () => {
    const prodUri = 'mongodb+srv://prod_user:prod_pass@medisync.p7hjket.mongodb.net/medisync_prod?appName=MediSync';
    const legacyTestUri = 'mongodb+srv://test_user:test_pass@qa-project-medisync.gwprp27.mongodb.net/test?appName=MediSync';
    const prodDbAsTestUri = 'mongodb+srv://test_user:test_pass@qa-project-medisync.gwprp27.mongodb.net/medisync_prod?appName=MediSync';

    expect(() =>
      validateAutomatedTestConfig({ testUri: legacyTestUri, prodUri })
    ).toThrow(/specifies database "test", but "medisync_automated_test" is required/i);

    expect(() =>
      validateAutomatedTestConfig({ testUri: prodDbAsTestUri, prodUri })
    ).toThrow(/specifies database "medisync_prod", but "medisync_automated_test" is required/i);
  });

  test('13. Blocks connecting real production DB (medisync.p7hjket.mongodb.net/medisync_prod) in automated-test mode', async () => {
    const realProdUri = 'mongodb+srv://prod_user:prod_pass@medisync.p7hjket.mongodb.net/medisync_prod?appName=MediSync';
    await expect(connectProductionDB(realProdUri)).rejects.toThrow(DatabaseIsolationError);
    await expect(mongoose.connect(realProdUri, { dbName: 'medisync_prod' })).rejects.toThrow(DatabaseIsolationError);
  });
});

