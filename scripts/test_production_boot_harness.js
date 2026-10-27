'use strict';
const path = require('path');

console.log('--- Testing Production Startup Admission Harness ---');

// Mock environment for Render
const baseEnv = {
  NODE_ENV: 'production',
  PORT: '10000',
  CLIENT_URL: 'https://medisync.chamodtharusha.com.lk',
  MEDISYNC_DEPLOYMENT_MODE: 'clinical',
  MEDISYNC_LIVE_START_APPROVED: 'true',
  MEDISYNC_ATLAS_ROTATION_CONFIRMED: 'true',
  MONGO_URI: 'mongodb+srv://synthetic-user:synthetic-pass@medisync.p7hjket.mongodb.net/medisync_prod?tls=true&w=majority&readPreference=primary&authSource=admin&authMechanism=SCRAM-SHA-256',
  REDIS_URL: 'rediss://:synthetic-redis-pass@red-cxxxxxx.render.com:6379/0',
  JWT_SECRET: 'dummy-production-jwt-secret-min-32-chars-long-abc',
  JWT_REFRESH_SECRET: 'dummy-production-jwt-refresh-secret-min-32-chars',
  SESSION_SECRET: 'dummy-session-secret-min-32-chars-long',
  MEDISYNC_PROTOTYPE_MODE: 'true',
  MEDISYNC_ALLOW_OPERATOR_KEYS: 'true',
  ACTIVE_KEY_VERSION: '1',
  ENCRYPTION_KEYS: '{"1":"a8f4c2b9e1d03756a8f4c2b9e1d03756a8f4c2b9e1d03756a8f4c2b9e1d03756"}',
  INTERNAL_API_KEY: 'dummy-internal-api-key-32-chars-xyz',
  ML_ENGINE_URL: 'https://medisync-ml-service.onrender.com'
};

const results = [];

// Gate 1: productionRuntimePolicy.assertProductionRuntime
try {
  const { assertProductionRuntime } = require('../server/src/security/productionRuntimePolicy');
  assertProductionRuntime(baseEnv);
  results.push({ gate: '1. assertProductionRuntime', status: 'PASS' });
} catch (err) {
  results.push({ gate: '1. assertProductionRuntime', status: 'FAIL', error: err.message });
}

// Gate 2: MEDISYNC_ATLAS_ROTATION_CONFIRMED
try {
  if (baseEnv.MEDISYNC_ATLAS_ROTATION_CONFIRMED !== 'true') throw new Error('BOTH_COMPROMISED_ATLAS_IDENTITIES_MUST_BE_ROTATED');
  results.push({ gate: '2. MEDISYNC_ATLAS_ROTATION_CONFIRMED', status: 'PASS' });
} catch (err) {
  results.push({ gate: '2. MEDISYNC_ATLAS_ROTATION_CONFIRMED', status: 'FAIL', error: err.message });
}

// Gate 3: clinicalEntryPolicy.assertClinicalEntry
try {
  const { assertClinicalEntry } = require('../server/src/security/clinicalEntryPolicy');
  assertClinicalEntry(baseEnv);
  results.push({ gate: '3. assertClinicalEntry', status: 'PASS' });
} catch (err) {
  results.push({ gate: '3. assertClinicalEntry', status: 'FAIL', error: err.message });
}

// Gate 4: clientOriginPolicy.clientOrigin
try {
  const { clientOrigin } = require('../server/src/security/clientOriginPolicy');
  const origin = clientOrigin(baseEnv);
  results.push({ gate: '4. clientOriginPolicy', status: 'PASS', detail: origin });
} catch (err) {
  results.push({ gate: '4. clientOriginPolicy', status: 'FAIL', error: err.message });
}

// Gate 5: redisConnectionPolicy.validateRedisConnection
try {
  const { validateRedisConnection } = require('../server/src/security/redisConnectionPolicy');
  validateRedisConnection(baseEnv);
  results.push({ gate: '5. validateRedisConnection', status: 'PASS' });
} catch (err) {
  results.push({ gate: '5. validateRedisConnection', status: 'FAIL', error: err.message });
}

// Gate 6: productionAtlasPolicy.assertProductionAtlasConfiguration
try {
  const { assertProductionAtlasConfiguration } = require('../server/src/security/productionAtlasPolicy');
  const atlas = assertProductionAtlasConfiguration(baseEnv, baseEnv.MONGO_URI);
  results.push({ gate: '6. assertProductionAtlasConfiguration', status: 'PASS', detail: atlas });
} catch (err) {
  results.push({ gate: '6. assertProductionAtlasConfiguration', status: 'FAIL', error: err.message });
}

// Gate 7: Operator Key Resolution for Prototype (app.js:initializeVault)
try {
  const { validateAndLoadOperatorKeys } = require('../server/src/security/operatorKeyPolicy');
  const res = validateAndLoadOperatorKeys(baseEnv);
  results.push({ gate: '7. Operator Key Resolution (app.js:initializeVault)', status: 'PASS', detail: `Active version: ${res.activeVersion}, Versions loaded: ${Object.keys(res.keys).join(', ')}` });
} catch (err) {
  results.push({ gate: '7. Operator Key Resolution (app.js:initializeVault)', status: 'FAIL', error: err.message });
}

// Gate 8: productionAtlasPolicy.verifyProductionIdentity (requires live DB or mock)
results.push({ gate: '8. verifyProductionIdentity', status: 'REQUIRES_MOCK_OR_LIVE', detail: 'Requires Atlas connectionStatus:1 returning 1 user with readWrite@medisync_prod' });

// Gate 9: productionStorageAdmission.verifyProductionStorage (requires live DB or mock)
results.push({ gate: '9. verifyProductionStorage', status: 'REQUIRES_MOCK_OR_LIVE', detail: 'Requires 29 collections and all exact indexes matching productionStorageManifest.json on db medisync_prod' });

console.log(JSON.stringify(results, null, 2));
