'use strict';

const { compareStorageWithManifest, isTargetAllowed, redactUri } = require('../scripts/provisionProductionStorage');
const manifest = require('../src/security/productionStorageManifest.json');
const { storageFixture } = require('./helpers/gate3StorageFixture');

describe('Storage Provisioning and Manifest Compliance Verification', () => {
  test('isTargetAllowed allows only exact cluster host medisync.p7hjket.mongodb.net and QA cluster', () => {
    expect(isTargetAllowed('medisync.p7hjket.mongodb.net', 'medisync_prod')).toBe(true);
    expect(isTargetAllowed('qa-project-medisync.gwprp27.mongodb.net', 'medisync_automated_test')).toBe(true);

    expect(isTargetAllowed('p7hjket.mongodb.net', 'medisync_prod')).toBe(false);
    expect(isTargetAllowed('medisync.p7hjket.mongodb.net', 'test')).toBe(false);
    expect(isTargetAllowed('p7hjket.mongodb.net', 'test')).toBe(false);
    expect(isTargetAllowed('other.mongodb.net', 'medisync_prod')).toBe(false);
    expect(isTargetAllowed('medisync.p7hjket.mongodb.net.attacker.invalid', 'medisync_prod')).toBe(false);
  });

  test('compareStorageWithManifest identifies missing collections and indexes when database is empty', () => {
    const allOptional = Object.fromEntries(manifest.collections.flatMap(row => (row.whenAll || []).map(flag => [flag, 'true'])));
    const result = compareStorageWithManifest([], {}, manifest, allOptional);
    expect(result.isCompliant).toBe(false);
    expect(result.collectionsToCreate.length).toBe(manifest.collections.length);
    expect(result.alreadyCompliantCollections).toBe(0);
    expect(result.alreadyCompliantIndexes).toBe(0);
    expect(result.indexesToCreate.length).toBe(result.totalRequiredIndexes);
  });

  test('compareStorageWithManifest reports 100% compliant when all collections and indexes exist', () => {
    const fixture = storageFixture({ complete: true, optional: true });
    const allOptional = Object.fromEntries(manifest.collections.flatMap(row => (row.whenAll || []).map(flag => [flag, 'true'])));
    const result = compareStorageWithManifest(fixture.metadata(), fixture.indexes(), manifest, allOptional);
    expect(result.isCompliant).toBe(true);
    expect(result.collectionsToCreate.length).toBe(0);
    expect(result.indexesToCreate.length).toBe(0);
    expect(result.alreadyCompliantCollections).toBe(manifest.collections.length);
    expect(result.alreadyCompliantIndexes).toBe(result.totalRequiredIndexes);
  });
});
