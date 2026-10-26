'use strict';

const { runOfflinePreflight } = require('../scripts/preflightProduction');

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
