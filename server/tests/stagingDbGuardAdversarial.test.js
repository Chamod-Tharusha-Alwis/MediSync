'use strict';

/**
 * MediSync — Staging Database Guard Adversarial Test Suite
 * Validates fail-closed isolation, credential segregation, Atlas-only enforcement,
 * and destructive operation blocks for the dedicated 'medisync_staging' environment.
 * Zero database network calls.
 */

const mongoose = require('mongoose');
const {
  PROD_DB_NAME,
  TEST_DB_NAME,
  STAGING_DB_NAME,
  DatabaseIsolationError,
  DestructiveOperationBlockedError,
  maskMongoUri,
  parseAndValidateAtlasUri,
  installDestructiveOpGuards,
  validateStagingConfig,
  connectStagingDB
} = require('../src/config/dbGuard');

describe('MediSync Atlas Staging Database Guard Adversarial Suite', () => {
  beforeAll(() => {
    installDestructiveOpGuards();
  });

  const validStagingUri = 'mongodb+srv://staging_user:staging_pass_778899@medisync.ffx62be.mongodb.net/medisync_staging?appName=MediSync';
  const validProdUri = 'mongodb+srv://prod_user:prod_pass_112233@medisync.ffx62be.mongodb.net/test?appName=MediSync';
  const validTestUri = 'mongodb+srv://test_user:test_pass_445566@medisync.ffx62be.mongodb.net/medisync_automated_test?appName=MediSync';

  test('1. Rejects missing or empty MONGO_URI_STAGING immediately', () => {
    expect(() => validateStagingConfig({ stagingUri: '' })).toThrow(DatabaseIsolationError);
    expect(() => validateStagingConfig({ stagingUri: null })).toThrow(DatabaseIsolationError);
  });

  test('2. Strictly prohibits localhost (127.0.0.1 / localhost / 0.0.0.0) in MONGO_URI_STAGING', () => {
    expect(() =>
      validateStagingConfig({
        stagingUri: 'mongodb://staging_user:staging_pass@127.0.0.1:27017/medisync_staging'
      })
    ).toThrow(/Local MongoDB host.*MediSync is strictly MongoDB Atlas Free/i);

    expect(() =>
      validateStagingConfig({
        stagingUri: 'mongodb://staging_user:staging_pass@localhost:27017/medisync_staging'
      })
    ).toThrow(/Local MongoDB host.*MediSync is strictly MongoDB Atlas Free/i);
  });

  test('3. Rejects non-Atlas hostnames not ending with .mongodb.net in MONGO_URI_STAGING', () => {
    expect(() =>
      validateStagingConfig({
        stagingUri: 'mongodb+srv://staging_user:pass@staging-db.internal.hospital.lk/medisync_staging'
      })
    ).toThrow(/Non-Atlas host/i);
  });

  test('4. Enforces explicit "/medisync_staging" database path in MONGO_URI_STAGING', () => {
    expect(() =>
      validateStagingConfig({
        stagingUri: 'mongodb+srv://staging_user:pass@medisync.ffx62be.mongodb.net/?appName=MediSync'
      })
    ).toThrow(/must explicitly specify "\/medisync_staging"/i);

    expect(() =>
      validateStagingConfig({
        stagingUri: 'mongodb+srv://staging_user:pass@medisync.ffx62be.mongodb.net/test?appName=MediSync'
      })
    ).toThrow(/specifies database "test", but "medisync_staging" is required/i);

    expect(() =>
      validateStagingConfig({
        stagingUri: 'mongodb+srv://staging_user:pass@medisync.ffx62be.mongodb.net/medisync_automated_test?appName=MediSync'
      })
    ).toThrow(/specifies database "medisync_automated_test", but "medisync_staging" is required/i);
  });

  test('5. Blocks staging if MONGO_URI_STAGING shares username with production MONGO_URI', () => {
    const sharedUserStagingUri = 'mongodb+srv://prod_user:some_pass@medisync.ffx62be.mongodb.net/medisync_staging?appName=MediSync';
    expect(() =>
      validateStagingConfig({
        stagingUri: sharedUserStagingUri,
        prodUri: validProdUri
      })
    ).toThrow(/Credential separation violation: MONGO_URI_STAGING uses the same MongoDB Atlas database user as production/i);
  });

  test('6. Blocks staging if MONGO_URI_STAGING shares username with test MONGO_URI_TEST', () => {
    const sharedTestUserStagingUri = 'mongodb+srv://test_user:some_pass@medisync.ffx62be.mongodb.net/medisync_staging?appName=MediSync';
    expect(() =>
      validateStagingConfig({
        stagingUri: sharedTestUserStagingUri,
        testUri: validTestUri
      })
    ).toThrow(/Credential separation violation: MONGO_URI_STAGING uses the same MongoDB Atlas database user as MONGO_URI_TEST/i);
  });

  test('7. Accepts valid isolated staging configuration with distinct user and medisync_staging db', () => {
    const info = validateStagingConfig({
      stagingUri: validStagingUri,
      prodUri: validProdUri,
      testUri: validTestUri
    });
    expect(info.pathnameDb).toBe('medisync_staging');
    expect(info.maskedUri).toContain('****');
    expect(info.maskedUri).not.toContain('staging_pass_778899');
    expect(info.maskedUri).not.toContain('staging_user');
  });

  test('8. Fail-closed: connectStagingDB rejects startup when MEDISYNC_STAGING_MODE is not true', async () => {
    const orig = process.env.MEDISYNC_STAGING_MODE;
    delete process.env.MEDISYNC_STAGING_MODE;
    await expect(connectStagingDB({ stagingUri: validStagingUri })).rejects.toThrow(
      /Staging database access requires explicit MEDISYNC_STAGING_MODE=true/i
    );
    process.env.MEDISYNC_STAGING_MODE = orig;
  });

  test('9. Fail-closed: connectStagingDB rejects startup if production MONGO_URI is loaded', async () => {
    const origStaging = process.env.MEDISYNC_STAGING_MODE;
    const origProd = process.env.MONGO_URI;
    process.env.MEDISYNC_STAGING_MODE = 'true';
    process.env.MONGO_URI = validProdUri;

    await expect(connectStagingDB({ stagingUri: validStagingUri })).rejects.toThrow(
      /Production MONGO_URI must not be loaded in a staging environment/i
    );

    process.env.MEDISYNC_STAGING_MODE = origStaging;
    if (origProd) process.env.MONGO_URI = origProd;
    else delete process.env.MONGO_URI;
  });

  test('10. Fail-closed: connectStagingDB rejects startup if live production startup approved', async () => {
    const origEnv = process.env.NODE_ENV;
    const origApproved = process.env.MEDISYNC_LIVE_START_APPROVED;
    const origStaging = process.env.MEDISYNC_STAGING_MODE;

    process.env.NODE_ENV = 'production';
    process.env.MEDISYNC_LIVE_START_APPROVED = 'true';
    process.env.MEDISYNC_STAGING_MODE = 'true';

    await expect(connectStagingDB({ stagingUri: validStagingUri })).rejects.toThrow(
      /Staging connection cannot be initiated in a live production approved environment/i
    );

    process.env.NODE_ENV = origEnv;
    if (origApproved) process.env.MEDISYNC_LIVE_START_APPROVED = origApproved;
    else delete process.env.MEDISYNC_LIVE_START_APPROVED;
    if (origStaging) process.env.MEDISYNC_STAGING_MODE = origStaging;
    else delete process.env.MEDISYNC_STAGING_MODE;
  });

  test('11. Destructive operations remain permanently blocked across staging models', () => {
    const StagingModel = mongoose.models.StagingDummy || mongoose.model('StagingDummy', new mongoose.Schema({ item: String }));
    expect(() => StagingModel.deleteMany({})).toThrow(DestructiveOperationBlockedError);
    expect(() => StagingModel.deleteMany()).toThrow(DestructiveOperationBlockedError);
  });

  test('12. Explicitly denies production cluster (p7hjket.mongodb.net) and QA cluster (gwprp27.mongodb.net)', () => {
    expect(() =>
      validateStagingConfig({
        stagingUri: 'mongodb+srv://staging_user:pass@p7hjket.mongodb.net/medisync_staging'
      })
    ).toThrow(/Cluster collision violation: MONGO_URI_STAGING points to denied cluster "p7hjket.mongodb.net"/i);

    expect(() =>
      validateStagingConfig({
        stagingUri: 'mongodb+srv://staging_user:pass@gwprp27.mongodb.net/medisync_staging'
      })
    ).toThrow(/Cluster collision violation: MONGO_URI_STAGING points to denied cluster "gwprp27.mongodb.net"/i);
  });

  test('13. Enforces TLS/SSL requirement; rejects ssl=false and tls=false', () => {
    expect(() =>
      validateStagingConfig({
        stagingUri: 'mongodb+srv://staging_user:pass@medisync.ffx62be.mongodb.net/medisync_staging?ssl=false'
      })
    ).toThrow(/TLS\/SSL encryption is strictly mandatory/i);

    expect(() =>
      validateStagingConfig({
        stagingUri: 'mongodb+srv://staging_user:pass@medisync.ffx62be.mongodb.net/medisync_staging?tls=false'
      })
    ).toThrow(/TLS\/SSL encryption is strictly mandatory/i);
  });
});
