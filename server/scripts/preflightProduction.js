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
const { verifyProductionStorage } = require('../src/security/productionStorageAdmission');
const { selectOperatorDatabase } = require('./operatorDatabaseMode');
const { MongoClient } = require('mongodb');
const { createClient } = require('redis');

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
    // SESSION_SECRET is a retained preflight compatibility requirement. The
    // current server runtime uses JWT sessions and has no SESSION_SECRET reader.
    // CORS_ORIGIN is likewise not consumed: actual origin policy reads CLIENT_URL.
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
  // Direct callers receive the same admission as the command-line entrypoint;
  // there is no QA fallback and no Mongoose model import or implicit DDL.
  const target = selectOperatorDatabase(env, false);
  const redisUrl = validateRedisConnection(env);
  if (new URL(redisUrl).protocol !== 'rediss:') throw new Error('PREFLIGHT_REDIS_TLS_REQUIRED');
  console.log('\n[CONNECT MODE] Initiating read-only live probes...');
  console.log(`Target MongoDB Database: ${target.database}`);
  const client = new MongoClient(target.uri, { ...target.connectionOptions, socketTimeoutMS: 5000 });
  let redisClient, failure;
  const bounded = async operation => {
    let timer;
    try {
      return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('PREFLIGHT_REDIS_UNAVAILABLE')), 5000);
      })]);
    } finally { clearTimeout(timer); }
  };
  try {
    try { await client.connect(); } catch (_) { throw new Error('PREFLIGHT_ATLAS_CONNECTION_UNAVAILABLE'); }
    const db = client.db(target.database);
    const identityReceipt = await verifyProductionIdentity(db);
    console.log(`[PASS] Identity verified: db=${identityReceipt.dbName}, users=${identityReceipt.authenticatedUserCount}, roles=${JSON.stringify(identityReceipt.authenticatedRoles)}`);
    const storage = await verifyProductionStorage(db, env);
    console.log(`[PASS] Strict runtime storage verified: collections=${storage.verifiedCollections}, indexes=${storage.verifiedRequiredIndexes}, transactionTopologyVerified=true`);
    // Same filter as app.js boot. Read only the existence projection, never
    // account credentials, clinical records or a complete account document.
    let admin;
    try { admin = await db.collection('admins').findOne({ isActive: true, isSuperAdmin: true }, { projection: { _id: 1 }, maxTimeMS: 5000 }); }
    catch (_) { throw new Error('PREFLIGHT_BOOT_ADMIN_UNVERIFIED'); }
    if (!admin?._id) throw new Error('PREFLIGHT_ACTIVE_SUPER_ADMIN_REQUIRED');
    console.log('[PASS] Active super-admin exists: isActive=true, isSuperAdmin=true');
    try {
      redisClient = createClient({ url: redisUrl, disableOfflineQueue: true, socket: { tls: true, rejectUnauthorized: true, connectTimeout: 5000, reconnectStrategy: false } });
      redisClient.on('error', () => {}); // Never log library errors containing a URL.
      await bounded(() => redisClient.connect());
      if (await bounded(() => redisClient.ping()) !== 'PONG') throw new Error('PREFLIGHT_REDIS_UNAVAILABLE');
    } catch (_) { throw new Error('PREFLIGHT_REDIS_UNAVAILABLE'); }
    console.log('[PASS] TLS Redis PING: PONG (no data commands)');
    return { identity: identityReceipt, storage, operator: { activeSuperAdminVerified: true }, redis: { tls: true, ping: 'PONG' } };
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    let shutdownFailed = false;
    try { if (redisClient?.isOpen) redisClient.destroy(); } catch (_) { shutdownFailed = true; }
    try { await client.close(); } catch (_) { shutdownFailed = true; }
    if (shutdownFailed) {
      if (failure) failure.message += '; PREFLIGHT_DISCONNECT_UNVERIFIED';
      else throw new Error('PREFLIGHT_DISCONNECT_UNVERIFIED');
    }
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
    console.log('To verify Atlas identity/storage, active super-admin and TLS Redis PING read-only, supply --connect with separate operator authorization.');
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
