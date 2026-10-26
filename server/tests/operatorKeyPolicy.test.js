'use strict';

const crypto = require('crypto');
const { validateAndLoadOperatorKeys, is32Bytes, isKnownTestOrDefaultKey } = require('../src/security/operatorKeyPolicy');

describe('Operator Key Policy (Prototype Production Mode)', () => {
  const valid32ByteHex = crypto.randomBytes(32).toString('hex');
  const validEnv = () => ({
    NODE_ENV: 'production',
    MEDISYNC_PROTOTYPE_MODE: 'true',
    MEDISYNC_ALLOW_OPERATOR_KEYS: 'true',
    ACTIVE_KEY_VERSION: '1',
    ENCRYPTION_KEYS: JSON.stringify({
      "1": valid32ByteHex
    })
  });

  test('accepts valid 32-byte operator key configuration', () => {
    const config = validateAndLoadOperatorKeys(validEnv());
    expect(config.activeVersion).toBe('1');
    expect(config.keys['1']).toBe(valid32ByteHex);
  });

  test('accepts valid 44-char base64 32-byte key', () => {
    const b64Key = crypto.randomBytes(32).toString('base64');
    const env = validEnv();
    env.ENCRYPTION_KEYS = JSON.stringify({ "1": b64Key });
    const config = validateAndLoadOperatorKeys(env);
    expect(config.keys['1']).toBe(b64Key);
  });

  test('accepts valid 32-character raw byte key', () => {
    // Generate 32 characters of high-entropy ASCII
    const raw32 = crypto.randomBytes(32).toString('base64').slice(0, 32);
    const env = validEnv();
    env.ENCRYPTION_KEYS = JSON.stringify({ "1": raw32 });
    const config = validateAndLoadOperatorKeys(env);
    expect(config.keys['1']).toBe(raw32);
  });

  test('fails closed if MEDISYNC_PROTOTYPE_MODE is absent or false', () => {
    const env = validEnv();
    delete env.MEDISYNC_PROTOTYPE_MODE;
    expect(() => validateAndLoadOperatorKeys(env)).toThrow(/MEDISYNC_PROTOTYPE_MODE must be set to "true"/i);

    env.MEDISYNC_PROTOTYPE_MODE = 'false';
    expect(() => validateAndLoadOperatorKeys(env)).toThrow(/MEDISYNC_PROTOTYPE_MODE must be set to "true"/i);
  });

  test('fails closed if MEDISYNC_ALLOW_OPERATOR_KEYS is absent or false', () => {
    const env = validEnv();
    delete env.MEDISYNC_ALLOW_OPERATOR_KEYS;
    expect(() => validateAndLoadOperatorKeys(env)).toThrow(/MEDISYNC_ALLOW_OPERATOR_KEYS must be set to "true"/i);

    env.MEDISYNC_ALLOW_OPERATOR_KEYS = 'false';
    expect(() => validateAndLoadOperatorKeys(env)).toThrow(/MEDISYNC_ALLOW_OPERATOR_KEYS must be set to "true"/i);
  });

  test('strictly rejects VAULT_TOKEN=bypass in operator mode', () => {
    const env = validEnv();
    env.VAULT_TOKEN = 'bypass';
    expect(() => validateAndLoadOperatorKeys(env)).toThrow(/VAULT_TOKEN=bypass is strictly forbidden/i);
  });

  test('fails closed if ENCRYPTION_KEYS is missing', () => {
    const env = validEnv();
    delete env.ENCRYPTION_KEYS;
    expect(() => validateAndLoadOperatorKeys(env)).toThrow(/ENCRYPTION_KEYS environment variable is missing/i);
  });

  test('fails closed if ACTIVE_KEY_VERSION is missing', () => {
    const env = validEnv();
    delete env.ACTIVE_KEY_VERSION;
    expect(() => validateAndLoadOperatorKeys(env)).toThrow(/ACTIVE_KEY_VERSION environment variable is missing/i);
  });

  test('fails closed if ACTIVE_KEY_VERSION is not present in ENCRYPTION_KEYS', () => {
    const env = validEnv();
    env.ACTIVE_KEY_VERSION = '2';
    expect(() => validateAndLoadOperatorKeys(env)).toThrow(/ACTIVE_KEY_VERSION \(2\) is not defined in ENCRYPTION_KEYS/i);
  });

  test('fails closed if key is not 32 bytes (too short or too long)', () => {
    const envShort = validEnv();
    envShort.ENCRYPTION_KEYS = JSON.stringify({ "1": 'short_key_16_byte' });
    expect(() => validateAndLoadOperatorKeys(envShort)).toThrow(/not a valid 32-byte value/i);

    const envLong = validEnv();
    envLong.ENCRYPTION_KEYS = JSON.stringify({ "1": 'a'.repeat(65) });
    expect(() => validateAndLoadOperatorKeys(envLong)).toThrow(/not a valid 32-byte value/i);
  });

  test.each([
    ['inert', 'inert'],
    ['offline-key', 'offline-key'],
    ['all-zeros hex', '0'.repeat(64)],
    ['all-ones hex', '1'.repeat(64)],
    ['all-fs hex', 'f'.repeat(64)],
    ['sequential pattern', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'],
    ['placeholder token', '<YOUR_32_CHARACTER_HEX_ENCRYPTION_KEY>']
  ])('fails closed if key is known test/default value (%s)', (_, badKey) => {
    const env = validEnv();
    env.ENCRYPTION_KEYS = JSON.stringify({ "1": badKey });
    expect(() => validateAndLoadOperatorKeys(env)).toThrow(/is a known default or test value|not a valid 32-byte value/i);
  });

  test('never includes actual key material in error messages', () => {
    const secretKey = 'my_super_secret_unusual_length_sample_that_is_invalid';
    const env = validEnv();
    env.ENCRYPTION_KEYS = JSON.stringify({ "1": secretKey });
    try {
      validateAndLoadOperatorKeys(env);
      throw new Error('Should have failed');
    } catch (err) {
      expect(err.message).not.toContain(secretKey);
    }
  });
});
