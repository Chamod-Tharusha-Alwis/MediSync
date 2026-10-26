'use strict';

/**
 * provisionProductionStorage.js
 * 
 * Additive provisioning script for MediSync production / QA MongoDB Atlas storage.
 * Reads productionStorageManifest.json and creates any missing collections and indexes.
 * 
 * SAFETY RULES:
 * 1. Default mode is DRY-RUN. Does not write unless --apply is passed explicitly.
 * 2. Additive ONLY: Never drops, truncates, modifies, or deletes existing data or indexes.
 * 3. Refuses any host or database outside the strict explicit allowlist.
 * 4. Never logs or prints connection strings, passwords, or credentials.
 */

const { MongoClient } = require('mongodb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const manifest = require('../src/security/productionStorageManifest.json');

const ALLOWED_TARGETS = [
  { hostSubstr: 'medisync.p7hjket.mongodb.net', database: 'medisync_prod' },
  { hostSubstr: 'qa-project-medisync.gwprp27.mongodb.net', database: 'medisync_automated_test' }
];

function isTargetAllowed(host, database) {
  if (database === 'test') {
    return false; // Strictly refuse old "test" database
  }
  return ALLOWED_TARGETS.some(t => host.includes(t.hostSubstr) && database === t.database);
}

function redactUri(uriString) {
  try {
    const parsed = new URL(uriString);
    return {
      host: parsed.hostname,
      port: parsed.port || '27017',
      database: parsed.pathname ? parsed.pathname.replace(/^\//, '') : ''
    };
  } catch (_) {
    return { host: 'UNKNOWN', database: 'UNKNOWN' };
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const isVerify = args.includes('--verify');
  const isQa = args.includes('--qa');
  return { isApply, isVerify, isDryRun: !isApply && !isVerify, isQa };
}

function normalizeIndexKey(k) {
  return JSON.stringify(Object.entries(k || {}).sort(([a], [b]) => a.localeCompare(b)));
}

function compareStorageWithManifest(existingCollectionNames, existingIndexesByCollection, storageManifest = manifest) {
  const collSet = new Set(existingCollectionNames || []);
  const comparison = {
    isCompliant: true,
    collectionsToCreate: [],
    indexesToCreate: [],
    alreadyCompliantCollections: 0,
    alreadyCompliantIndexes: 0,
    totalRequiredCollections: storageManifest.collections.length,
    totalRequiredIndexes: 0
  };

  for (const collSpec of storageManifest.collections) {
    const collName = collSpec.name;
    const collExists = collSet.has(collName);

    if (!collExists) {
      comparison.collectionsToCreate.push(collName);
      comparison.isCompliant = false;
    } else {
      comparison.alreadyCompliantCollections++;
    }

    const existingIndexes = existingIndexesByCollection[collName] || [];
    const existingKeySet = new Set(existingIndexes.map(i => normalizeIndexKey(i.key)));

    for (const idxSpec of collSpec.indexes) {
      comparison.totalRequiredIndexes++;
      const specKeyString = normalizeIndexKey(idxSpec.key);
      if (collExists && existingKeySet.has(specKeyString)) {
        comparison.alreadyCompliantIndexes++;
      } else {
        comparison.indexesToCreate.push({
          collection: collName,
          key: idxSpec.key,
          unique: !!idxSpec.unique,
          sparse: !!idxSpec.sparse
        });
        comparison.isCompliant = false;
      }
    }
  }

  return comparison;
}

async function runProvisioning(options = {}) {
  const { isApply = false, isVerify = false, isQa = false } = options;
  const rawUri = isQa ? process.env.MONGO_URI_TEST : (process.env.MONGO_URI || process.env.MONGO_URI_TEST);

  if (!rawUri) {
    throw new Error('PROVISIONING_ERROR: Neither MONGO_URI nor MONGO_URI_TEST environment variable is set.');
  }

  const { host, database } = redactUri(rawUri);

  console.log('================================================================');
  console.log('  MEDISYNC STORAGE PROVISIONING & VERIFICATION');
  console.log('================================================================');
  console.log(`Target Host:     ${host}`);
  console.log(`Target Database: ${database}`);
  const modeLabel = isVerify
    ? 'VERIFY (READ ONLY COMPLIANCE AUDIT)'
    : (isApply ? 'APPLY (ADDITIVE WRITES ENABLED)' : 'DRY-RUN (READ ONLY, NO WRITES)');
  console.log(`Execution Mode:  ${modeLabel}`);
  console.log('----------------------------------------------------------------');

  // Verify Target Allowlist
  if (!isTargetAllowed(host, database)) {
    throw new Error(`PROVISIONING_GUARD: Target host '${host}' and database '${database}' is NOT in the strict allowlist (or matches forbidden 'test'). Operation aborted.`);
  }

  const client = new MongoClient(rawUri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000
  });

  try {
    await client.connect();
    const db = client.db(database);

    const existingCollectionsCursor = await db.listCollections({}, { authorizedCollections: true, nameOnly: true });
    const existingCollections = await existingCollectionsCursor.toArray();
    const existingCollectionNames = existingCollections.map(c => c.name);

    console.log(`Discovered ${existingCollectionNames.length} existing collections in database '${database}'.`);
    console.log(`Manifest specifies ${manifest.collections.length} required collections.`);
    console.log('');

    const existingIndexesByCollection = {};
    for (const collName of existingCollectionNames) {
      try {
        existingIndexesByCollection[collName] = await db.collection(collName).indexes();
      } catch (idxErr) {
        existingIndexesByCollection[collName] = [];
      }
    }

    const plan = compareStorageWithManifest(existingCollectionNames, existingIndexesByCollection, manifest);

    console.log('--- STORAGE COMPLIANCE SUMMARY ---');
    console.log(`Collections compliant: ${plan.alreadyCompliantCollections} / ${plan.totalRequiredCollections}`);
    console.log(`Collections missing:   ${plan.collectionsToCreate.length}`);
    if (plan.collectionsToCreate.length > 0) {
      console.log(`  -> ${plan.collectionsToCreate.join(', ')}`);
    }

    console.log(`Indexes compliant:     ${plan.alreadyCompliantIndexes} / ${plan.totalRequiredIndexes}`);
    console.log(`Indexes missing:       ${plan.indexesToCreate.length}`);
    if (plan.indexesToCreate.length > 0) {
      plan.indexesToCreate.forEach(item => {
        console.log(`  -> Collection '${item.collection}': key ${JSON.stringify(item.key)}, unique: ${item.unique}, sparse: ${item.sparse}`);
      });
    }
    console.log('----------------------------------');

    if (isVerify) {
      if (plan.isCompliant) {
        console.log('\n[VERIFY PASS] Database storage is 100% compliant with productionStorageManifest.json.');
        return plan;
      } else {
        console.error('\n[VERIFY FAIL] Database is missing required collections or indexes.');
        throw new Error(`VERIFICATION_FAILED: Missing ${plan.collectionsToCreate.length} collections and ${plan.indexesToCreate.length} indexes.`);
      }
    }

    if (!isApply) {
      console.log('');
      console.log('[DRY-RUN COMPLETE] No changes were written to the database.');
      console.log('To apply these additions, run with the --apply flag.');
      return plan;
    }

    // APPLY PHASE (Additive only)
    console.log('\n[APPLY PHASE] Executing additive provisioning...');

    for (const collName of plan.collectionsToCreate) {
      console.log(`Creating collection '${collName}'...`);
      await db.createCollection(collName);
    }

    for (const item of plan.indexesToCreate) {
      if (item.key && Object.keys(item.key).length === 1 && item.key._id) {
        // Skip _id index: MongoDB creates the unique _id index automatically on collection creation.
        continue;
      }
      console.log(`Creating index on '${item.collection}': ${JSON.stringify(item.key)} (unique: ${item.unique})...`);
      const coll = db.collection(item.collection);
      const options = {};
      if (item.unique) options.unique = true;
      if (item.sparse) options.sparse = true;
      await coll.createIndex(item.key, options);
    }

    console.log('\n[APPLY COMPLETE] All missing collections and indexes created additively.');
    return plan;
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  const { isApply, isVerify, isQa } = parseArgs();
  runProvisioning({ isApply, isVerify, isQa }).catch(err => {
    console.error('\n[FATAL] Provisioning execution failed:');
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  runProvisioning,
  compareStorageWithManifest,
  redactUri,
  ALLOWED_TARGETS,
  isTargetAllowed
};
