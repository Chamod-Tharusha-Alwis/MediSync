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
const { collectionCompatible, indexesCompatible, verifyProductionStorage } = require('../src/security/productionStorageAdmission');
const { selectOperatorDatabase, verifyOperatorIdentity } = require('./operatorDatabaseMode');

const ALLOWED_TARGETS = [
  { hostSubstr: 'medisync.p7hjket.mongodb.net', database: 'medisync_prod' },
  { hostSubstr: 'qa-project-medisync.gwprp27.mongodb.net', database: 'medisync_automated_test' }
];

function isTargetAllowed(host, database) {
  if (database === 'test') {
    return false; // Strictly refuse old "test" database
  }
  return ALLOWED_TARGETS.some(t => host === t.hostSubstr && database === t.database);
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

const indexKey = index => JSON.stringify(Object.entries(index.key || {}));
const sameFields = (a, b) => JSON.stringify(Object.keys(a.key || {}).sort()) === JSON.stringify(Object.keys(b.key || {}).sort());
const requiredCollections = (storageManifest, environment) => storageManifest.collections.filter(
  row => !row.whenAll || row.whenAll.every(flag => environment[flag] === 'true')
);

function collectionCreationOptions(spec) {
  const options = {};
  if (spec.capped) Object.assign(options, { capped: true, size: spec.capped.size, max: spec.capped.max });
  if (spec.validator) Object.assign(options, { validator: structuredClone(spec.validator), validationLevel: 'strict', validationAction: 'error' });
  return options;
}

function indexCreationOptions(spec) {
  const options = { name: spec.name };
  if (spec.unique) options.unique = true;
  if (spec.sparse) options.sparse = true;
  if (Object.hasOwn(spec, 'expireAfterSeconds')) options.expireAfterSeconds = spec.expireAfterSeconds;
  return options;
}

// Full listCollections metadata is mandatory. Name-only legacy callers fail
// closed rather than claiming that unknown collection options are compliant.
function compareStorageWithManifest(existingCollections, existingIndexesByCollection, storageManifest = manifest, environment = process.env) {
  if (!Array.isArray(existingCollections) || !existingIndexesByCollection) throw new Error('PROVISIONING_METADATA_UNVERIFIED');
  const required = requiredCollections(storageManifest, environment);
  const rows = existingCollections.map(row => typeof row === 'string' ? { name: row } : row);
  if (rows.some(row => !row || typeof row.name !== 'string') || new Set(rows.map(row => row.name)).size !== rows.length) throw new Error('PROVISIONING_METADATA_UNVERIFIED');
  const comparison = {
    isCompliant: true,
    collectionsToCreate: [],
    indexesToCreate: [],
    alreadyCompliantCollections: 0,
    alreadyCompliantIndexes: 0,
    totalRequiredCollections: required.length,
    totalRequiredIndexes: 0,
    incompatibilities: []
  };

  for (const collSpec of required) {
    const collName = collSpec.name;
    const row = rows.find(item => item.name === collName);
    const collExists = Boolean(row);

    if (!collExists) {
      comparison.collectionsToCreate.push(collName);
      comparison.isCompliant = false;
    } else if (collectionCompatible(row, collSpec)) {
      comparison.alreadyCompliantCollections++;
    } else {
      comparison.incompatibilities.push({ collection: collName, reason: 'COLLECTION_OPTIONS_INCOMPATIBLE' });
      comparison.isCompliant = false;
    }

    const existingIndexes = existingIndexesByCollection[collName] || [];
    if (!Array.isArray(existingIndexes)) throw new Error('PROVISIONING_METADATA_UNVERIFIED');
    const presentRequired = collSpec.indexes.filter(spec => existingIndexes.some(index => indexKey(index) === indexKey(spec)));
    // Reuse the runtime policy for every present index, including unsupported
    // extra constraints, duplicate definitions, hidden/building and TTL options.
    if (collExists && (!presentRequired.some(spec => spec.name === '_id_') || !indexesCompatible(existingIndexes, presentRequired))) {
      comparison.incompatibilities.push({ collection: collName, reason: 'INDEX_OPTIONS_INCOMPATIBLE' });
      comparison.isCompliant = false;
    }

    for (const idxSpec of collSpec.indexes) {
      comparison.totalRequiredIndexes++;
      const matches = existingIndexes.filter(index => indexKey(index) === indexKey(idxSpec));
      if (collExists && matches.length === 1 && indexesCompatible(matches, [idxSpec])) {
        comparison.alreadyCompliantIndexes++;
      } else {
        if (collExists && (matches.length || existingIndexes.some(index => index.name === idxSpec.name || sameFields(index, idxSpec)))) {
          comparison.incompatibilities.push({ collection: collName, index: idxSpec.name, reason: 'INDEX_DEFINITION_INCOMPATIBLE' });
        } else comparison.indexesToCreate.push({ collection: collName, ...structuredClone(idxSpec) });
        comparison.isCompliant = false;
      }
    }
  }

  return comparison;
}

async function inspectStorage(db) {
  const cursor = db.listCollections({}, { authorizedCollections: false, nameOnly: false, maxTimeMS: 5000 });
  let collections;
  try { collections = await cursor.toArray(); }
  finally { if (typeof cursor.close === 'function') await cursor.close(); }
  if (!Array.isArray(collections)) throw new Error('PROVISIONING_METADATA_UNVERIFIED');
  const indexes = {};
  for (const spec of requiredCollections(manifest, process.env)) {
    if (collections.some(row => row.name === spec.name)) indexes[spec.name] = await db.collection(spec.name).indexes();
  }
  return compareStorageWithManifest(collections, indexes);
}

function rejectIncompatibleStorage(plan) {
  if (plan.incompatibilities.length) throw new Error('PROVISIONING_EXISTING_STORAGE_INCOMPATIBLE: ' + plan.incompatibilities.map(row => `${row.collection}:${row.reason}`).join(', '));
}

async function runProvisioning(options = {}) {
  const { isApply = false, isVerify = false, isQa = false } = options;
  const target = selectOperatorDatabase(process.env, isQa);
  const rawUri = target.uri;

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

  const client = new MongoClient(rawUri, target.connectionOptions);

  try {
    await client.connect();
    const db = client.db(database);
    await verifyOperatorIdentity(db, target);

    const plan = await inspectStorage(db);
    rejectIncompatibleStorage(plan);

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
        if (database === manifest.database) await verifyProductionStorage(db, process.env);
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
      const spec = manifest.collections.find(row => row.name === collName);
      await db.createCollection(collName, collectionCreationOptions(spec));
    }

    for (const item of plan.indexesToCreate) {
      if (item.key && Object.keys(item.key).length === 1 && item.key._id) {
        // Skip _id index: MongoDB creates the unique _id index automatically on collection creation.
        continue;
      }
      console.log(`Creating index on '${item.collection}': ${JSON.stringify(item.key)} (unique: ${item.unique})...`);
      const coll = db.collection(item.collection);
      await coll.createIndex(item.key, indexCreationOptions(item));
    }

    // Re-read actual server metadata; a successful create call is not proof that
    // the resulting storage satisfies admission. Never repair incompatibilities.
    const after = await inspectStorage(db);
    rejectIncompatibleStorage(after);
    if (!after.isCompliant) throw new Error('PROVISIONING_POST_APPLY_NOT_COMPLIANT');
    if (database === manifest.database) await verifyProductionStorage(db, process.env);
    console.log('\n[APPLY COMPLETE] All missing collections and indexes created additively.');
    return after;
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
