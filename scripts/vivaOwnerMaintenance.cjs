'use strict';

const { createRequire } = require('node:module');
const { join } = require('node:path');
const requireServer = createRequire(join(__dirname, '../server/package.json'));
const BATCH = 'viva-2026-11';

function fail(code) {
  throw Object.assign(new Error(code), { safeCode: code });
}

async function withOwnedBatch(confirm, work) {
  const { selectOperatorDatabase, verifyOperatorIdentity } = require('../server/scripts/operatorDatabaseMode');
  const { MongoClient } = requireServer('mongodb');
  const target = selectOperatorDatabase(process.env);
  const client = new MongoClient(target.uri, {
    ...target.connectionOptions, retryWrites: false, retryReads: false, appName: 'medisync-viva-operator',
  });
  let session;
  let failed = false;
  try {
    await client.connect();
    const db = client.db(target.database);
    await verifyOperatorIdentity(db, target);
    const { verifyProductionStorage } = require('../server/src/security/productionStorageAdmission');
    await verifyProductionStorage(db, { ...process.env, MEDISYNC_AUTO_PROVISION_STORAGE: 'false' });
    const manifestFilter = { batch: BATCH, database: target.database };
    if (confirm) {
      session = client.startSession();
      session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    }
    const manifest = await db.collection('seed_manifests').findOne(manifestFilter, { session });
    if (!manifest || !manifest.collections) fail('VIVA_MANIFEST_REQUIRED');
    const result = await work({ db, manifest, session, confirm });
    if (confirm) {
      try {
        await session.commitTransaction();
      } catch (_) {
        fail('VIVA_COMMIT_UNVERIFIED_DO_NOT_RETRY');
      }
    }
    return result;
  } catch (error) {
    failed = true;
    if (error.safeCode !== 'VIVA_COMMIT_UNVERIFIED_DO_NOT_RETRY' && session?.inTransaction()) {
      await session.abortTransaction().catch(() => {});
    }
    throw error;
  } finally {
    const sessionClosed = await Promise.resolve().then(() => session?.endSession()).then(() => true, () => false);
    const clientClosed = await Promise.resolve().then(() => client.close()).then(() => true, () => false);
    if (!failed && (!sessionClosed || !clientClosed)) {
      fail(confirm ? 'VIVA_COMMITTED_CLEANUP_UNVERIFIED_DO_NOT_RETRY' : 'VIVA_CLEANUP_UNVERIFIED');
    }
  }
}

function ownedIds(manifest, collection) {
  const ids = manifest.collections[collection];
  if (!Array.isArray(ids) || !ids.length || ids.length > 10000 ||
      ids.some(id => id?._bsontype !== 'ObjectId') || new Set(ids.map(String)).size !== ids.length) {
    fail('VIVA_MANIFEST_IDS_INVALID');
  }
  return ids;
}

function ownedFilter(ids) {
  return { _id: { $in: ids }, syntheticSeedBatch: BATCH, isSynthetic: true };
}

async function countOwnedManifest({ db, manifest }) {
  const collections = [
    'hospitals', 'pharmacies', 'doctors', 'pharmacystaffs', 'patients',
    'consultations', 'prescriptions', 'dispensings', 'labtests', 'verificationtokens', 'outbreakalerts',
  ];
  const result = {};
  for (const name of collections) {
    if (!Object.hasOwn(manifest.collections, name)) continue;
    const ids = ownedIds(manifest, name);
    const count = await db.collection(name).countDocuments(ownedFilter(ids), { maxTimeMS: 5000 });
    result[name] = { tracked: ids.length, present: count };
  }
  if (!result.consultations || !result.patients) fail('VIVA_MANIFEST_IDS_INVALID');
  return result;
}

module.exports = { BATCH, fail, ownedIds, ownedFilter, withOwnedBatch, countOwnedManifest };
