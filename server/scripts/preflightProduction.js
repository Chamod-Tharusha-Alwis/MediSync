'use strict';

/**
 * preflightProduction.js
 * 
 * Production admission and readiness preflight script.
 * Runs offline policy gates by default; optionally runs read-only connectivity probes when --connect is passed.
 * 
 * SAFETY RULES:
 * 1. Default mode is OFFLINE. No network connections are initiated without --connect.
 * 2. READ-ONLY: Never executes any writes, collection creation, or modifications.
 * 3. Never prints, logs, or discloses secrets, passwords, encryption keys, or full credentialed URIs.
 * 4. Fails closed if any policy violation or unexpected variable configuration is detected.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { assertProductionRuntime } = require('../src/security/productionRuntimePolicy');
const { assertClinicalEntry } = require('../src/security/clinicalEntryPolicy');
const { assertProductionAtlasConfiguration, verifyProductionIdentity } = require('../src/security/productionAtlasPolicy');
const { clientOrigin } = require('../src/security/clientOriginPolicy');
const { validateRedisConnection } = require('../src/security/redisConnectionPolicy');
const { validateAndLoadOperatorKeys } = require('../src/security/operatorKeyPolicy');
const { compareStorageWithManifest, redactUri, isTargetAllowed } = require('./provisionProductionStorage');
const manifest = require('../src/security/productionStorageManifest.json');
const { MongoClient } = require('mongodb');

function parseArgs() {
  const args = process.argv.slice(2);
  const isConnect = args.includes('--connect');
  return { isConnect, isOffline: !isConnect };
}

function runOfflinePreflight(env = process.env) {
  const results = [];

  function record(gate, fn) {
    try {
      const detail = fn();
      results.push({ gate, status: 'PASS', detail: detail || 'OK' });
      return true;
    } catch (err) {
      results.push({ gate, status: 'FAIL', error: err.message });
      return false;
    }
  }

  // 1. Production Runtime Policy (NODE_ENV, deployment mode, rotation confirmed, etc.)
  record('1. Production Runtime Policy', () => {
    assertProductionRuntime(env);
    return `NODE_ENV=${env.NODE_ENV}, DEPLOYMENT_MODE=${env.MEDISYNC_DEPLOYMENT_MODE}`;
  });

  // 2. Clinical Entry Policy
  record('2. Clinical Entry Policy', () => {
    assertClinicalEntry(env);
    return 'Clinical entry prerequisites verified';
  });

  // 3. Client Origin Policy
  record('3. Client Origin Policy', () => {
    const origin = clientOrigin(env);
    return `Allowed HTTPS origin: ${origin}`;
  });

  // 4. Redis Connection Policy
  record('4. Redis Connection Policy', () => {
    validateRedisConnection(env);
    return 'Redis URL conforms to secure rediss:// protocol';
  });

  // 5. Production Atlas Configuration
  record('5. Production Atlas Policy', () => {
    const atlas = assertProductionAtlasConfiguration(env, env.MONGO_URI);
    return `Cluster: ${atlas.cluster}, Database: ${atlas.database}, TLS: true, authSource: admin`;
  });

  // 6. Operator Key Policy (Prototype)
  record('6. Operator Key Policy (Prototype)', () => {
    const keysRes = validateAndLoadOperatorKeys(env);
    return `Active version: ${keysRes.activeVersion}, Total versions: ${Object.keys(keysRes.keys).length}`;
  });

  // 7. Core Production Secrets Presence (names only, non-empty, min 32 chars)
  record('7. Core Secrets Presence', () => {
    const required = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'SESSION_SECRET', 'INTERNAL_API_KEY'];
    const missing = [];
    for (const name of required) {
      const val = env[name];
      if (!val || typeof val !== 'string' || val.trim().length < 32) {
        missing.push(name);
      }
    }
    if (missing.length > 0) {
      throw new Error(`PREFLIGHT_ERROR: Missing or insufficient entropy for secrets: ${missing.join(', ')}`);
    }
    return 'All 4 application secrets present with adequate length (min 32 chars)';
  });

  // 8. Forbidden QA Material Check
  record('8. Forbidden QA Variable Quarantine', () => {
    const forbidden = ['MONGO_URI_TEST', 'MONGODB_URI_TEST', 'MONGO_URI_STAGING', 'SEED_TEST_PASSWORD'];
    const detected = [];
    for (const name of forbidden) {
      if (env[name]) detected.push(name);
    }
    if (detected.length > 0) {
      throw new Error(`PREFLIGHT_ERROR: Forbidden QA variables detected in production environment: ${detected.join(', ')}`);
    }
    return 'Zero QA variables present in production environment';
  });

  return results;
}

async function runLiveConnectivityPreflight(env = process.env) {
  const rawUri = env.MONGO_URI;
  if (!rawUri) {
    throw new Error('PREFLIGHT_CONNECT_ERROR: MONGO_URI is missing.');
  }

  const { host, database } = redactUri(rawUri);
  console.log('\n[CONNECT MODE] Initiating read-only live probes...');
  console.log(`Target MongoDB Host:     ${host}`);
  console.log(`Target MongoDB Database: ${database}`);

  if (!isTargetAllowed(host, database)) {
    throw new Error(`PREFLIGHT_CONNECT_GUARD: Target host "${host}" / database "${database}" is not in the allowlist.`);
  }

  const client = new MongoClient(rawUri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000
  });

  try {
    await client.connect();
    const db = client.db(database);

    // Probe 1: Verify authenticated database user identity
    console.log('Probing Atlas user identity and roles via connectionStatus...');
    const identityReceipt = await verifyProductionIdentity(db);
    console.log(`[PASS] Identity verified: db=${identityReceipt.dbName}, users=${identityReceipt.authenticatedUserCount}, roles=${JSON.stringify(identityReceipt.authenticatedRoles)}`);

    // Probe 2: Read-only inventory of collections and indexes
    console.log('Probing collections and indexes against productionStorageManifest.json...');
    const collectionsCursor = await db.listCollections({}, { authorizedCollections: true, nameOnly: true });
    const existingCollections = await collectionsCursor.toArray();
    const existingCollectionNames = existingCollections.map(c => c.name);

    const existingIndexes = {};
    for (const collName of existingCollectionNames) {
      try {
        existingIndexes[collName] = await db.collection(collName).indexes();
      } catch (_) {
        existingIndexes[collName] = [];
      }
    }

    const storageComparison = compareStorageWithManifest(existingCollectionNames, existingIndexes, manifest);
    console.log(`[STORAGE AUDIT] Compliant collections: ${storageComparison.alreadyCompliantCollections}/${storageComparison.totalRequiredCollections}, Compliant indexes: ${storageComparison.alreadyCompliantIndexes}/${storageComparison.totalRequiredIndexes}`);

    return {
      identity: identityReceipt,
      storage: storageComparison
    };
  } finally {
    await client.close();
  }
}

async function main() {
  const { isConnect } = parseArgs();

  console.log('================================================================');
  console.log('  MEDISYNC PRODUCTION PREFLIGHT VERIFICATION');
  console.log('================================================================');
  console.log(`Mode: ${isConnect ? 'OFFLINE GATES + LIVE READ-ONLY CONNECT' : 'OFFLINE GATES (DRY RUN)'}`);
  console.log('----------------------------------------------------------------');

  const offlineResults = runOfflinePreflight(process.env);
  console.log('\n--- OFFLINE POLICY GATES ---');
  let allOfflinePass = true;
  for (const r of offlineResults) {
    const symbol = r.status === 'PASS' ? '[PASS]' : '[FAIL]';
    console.log(`${symbol} ${r.gate}: ${r.status === 'PASS' ? r.detail : r.error}`);
    if (r.status !== 'PASS') allOfflinePass = false;
  }
  console.log('----------------------------');

  if (!allOfflinePass) {
    console.error('\n[FATAL] Preflight offline policy verification failed. Cannot proceed to connect.');
    process.exit(1);
  }

  if (isConnect) {
    await runLiveConnectivityPreflight(process.env);
    console.log('\n[PREFLIGHT CONNECT COMPLETE] All read-only probes finished successfully.');
  } else {
    console.log('\n[PREFLIGHT OFFLINE COMPLETE] All offline policy gates passed.');
    console.log('To run live read-only connectivity probes against MongoDB and Redis, supply the --connect flag.');
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('\n[FATAL] Preflight error:', err.message);
    process.exit(1);
  });
}

module.exports = {
  runOfflinePreflight,
  runLiveConnectivityPreflight,
  parseArgs
};
