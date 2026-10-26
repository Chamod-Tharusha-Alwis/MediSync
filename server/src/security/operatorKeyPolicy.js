'use strict';

/**
 * operatorKeyPolicy.js
 * 
 * Validates operator-supplied encryption keys for prototype production mode.
 * Strictly enforces that keys are valid 32-byte values, non-default, and that all
 * required prototype flags are present. Never logs key values.
 */

const crypto = require('crypto');

const KNOWN_TEST_KEYS = new Set([
  'inert',
  'test',
  'offline-key',
  'offline-token',
  '0123456789abcdef0123456789abcdef',
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '1111111111111111111111111111111111111111111111111111111111111111',
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  '<YOUR_32_CHARACTER_HEX_ENCRYPTION_KEY>',
  'changeme',
  'password',
  'default',
  'admin'
]);

function is32Bytes(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  // 64-char hex string (32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return true;
  }
  // 32-character raw byte string
  if (Buffer.byteLength(trimmed, 'utf8') === 32) {
    return true;
  }
  // 44-character standard Base64 string (32 bytes decoded)
  if (/^[A-Za-z0-9+/]{43}=$/.test(trimmed)) {
    try {
      const buf = Buffer.from(trimmed, 'base64');
      if (buf.length === 32 && buf.toString('base64') === trimmed) {
        return true;
      }
    } catch (_) {}
  }
  return false;
}

function isKnownTestOrDefaultKey(value) {
  if (typeof value !== 'string') return true;
  const lower = value.trim().toLowerCase();
  if (KNOWN_TEST_KEYS.has(lower)) return true;

  // Check repetitive / zero-entropy patterns
  const uniqueChars = new Set(lower).size;
  if (uniqueChars < 8) return true;

  // Check if string contains common placeholders
  if (/example|placeholder|changethis|dummy|secret123/i.test(lower)) return true;

  return false;
}

function validateAndLoadOperatorKeys(environment = process.env) {
  if (environment.MEDISYNC_PROTOTYPE_MODE !== 'true') {
    throw new Error('OPERATOR_KEY_ERROR: MEDISYNC_PROTOTYPE_MODE must be set to "true".');
  }
  if (environment.MEDISYNC_ALLOW_OPERATOR_KEYS !== 'true') {
    throw new Error('OPERATOR_KEY_ERROR: MEDISYNC_ALLOW_OPERATOR_KEYS must be set to "true".');
  }
  if (environment.VAULT_TOKEN === 'bypass') {
    throw new Error('OPERATOR_KEY_ERROR: VAULT_TOKEN=bypass is strictly forbidden in operator-key production mode.');
  }

  const rawKeys = environment.ENCRYPTION_KEYS;
  const rawActiveVersion = environment.ACTIVE_KEY_VERSION;

  if (!rawKeys) {
    throw new Error('OPERATOR_KEY_ERROR: ENCRYPTION_KEYS environment variable is missing.');
  }
  if (!rawActiveVersion) {
    throw new Error('OPERATOR_KEY_ERROR: ACTIVE_KEY_VERSION environment variable is missing.');
  }

  let parsedKeys;
  if (typeof rawKeys === 'string') {
    try {
      parsedKeys = JSON.parse(rawKeys);
    } catch (_) {
      throw new Error('OPERATOR_KEY_ERROR: ENCRYPTION_KEYS must be a valid JSON object string.');
    }
  } else if (typeof rawKeys === 'object' && rawKeys !== null && !Array.isArray(rawKeys)) {
    parsedKeys = rawKeys;
  } else {
    throw new Error('OPERATOR_KEY_ERROR: ENCRYPTION_KEYS must be an object.');
  }

  const versions = Object.keys(parsedKeys);
  if (versions.length === 0) {
    throw new Error('OPERATOR_KEY_ERROR: ENCRYPTION_KEYS object contains no key versions.');
  }

  const activeVersionStr = String(rawActiveVersion).trim();
  if (!parsedKeys[activeVersionStr]) {
    throw new Error(`OPERATOR_KEY_ERROR: ACTIVE_KEY_VERSION (${activeVersionStr}) is not defined in ENCRYPTION_KEYS.`);
  }

  for (const [ver, keyVal] of Object.entries(parsedKeys)) {
    if (!is32Bytes(keyVal)) {
      throw new Error(`OPERATOR_KEY_ERROR: Key for version ${ver} is not a valid 32-byte value.`);
    }
    if (isKnownTestOrDefaultKey(keyVal)) {
      throw new Error(`OPERATOR_KEY_ERROR: Key for version ${ver} is a known default or test value.`);
    }
  }

  return {
    keys: parsedKeys,
    activeVersion: activeVersionStr
  };
}

module.exports = {
  validateAndLoadOperatorKeys,
  is32Bytes,
  isKnownTestOrDefaultKey
};
