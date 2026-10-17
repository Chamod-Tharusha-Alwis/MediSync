'use strict';

const crypto = require('crypto');
const assert = require('assert');

const SENSITIVE_CLINICAL_FIELDS = Object.freeze([
  'notes',
  'diagnosis',
  'symptoms',
  'prescriptionDetails'
]);

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH_BYTES = 32; // 256 bits
const IV_LENGTH_BYTES = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH_BYTES = 16;
const MIN_PBKDF2_ITERATIONS = 100000;

/**
 * Validates encryption key strength. Rejects short, empty, or trivial keys.
 */
function validateKeyStrength(keyBuffer) {
  if (!keyBuffer || !Buffer.isBuffer(keyBuffer)) {
    const err = new Error('B14: Key must be a valid Buffer');
    err.code = 'B14_INVALID_KEY_TYPE';
    throw err;
  }
  if (keyBuffer.length !== KEY_LENGTH_BYTES) {
    const err = new Error(`B14: Key length must be exactly ${KEY_LENGTH_BYTES} bytes (256 bits), got ${keyBuffer.length}`);
    err.code = 'B14_INVALID_KEY_LENGTH';
    throw err;
  }
  // Check for trivial all-zero key
  if (keyBuffer.every(b => b === 0)) {
    const err = new Error('B14: Trivial all-zero key rejected');
    err.code = 'B14_WEAK_KEY';
    throw err;
  }
  return true;
}

/**
 * Derives a 256-bit encryption key from secret and salt using PBKDF2.
 */
function deriveEncryptionKey(passphrase, salt, iterations = MIN_PBKDF2_ITERATIONS) {
  if (!passphrase || typeof passphrase !== 'string' || passphrase.length < 16) {
    const err = new Error('B14: Passphrase must be at least 16 characters');
    err.code = 'B14_WEAK_PASSPHRASE';
    throw err;
  }
  if (!salt || !Buffer.isBuffer(salt) || salt.length < 16) {
    const err = new Error('B14: Salt must be a Buffer of at least 16 bytes');
    err.code = 'B14_INSUFFICIENT_SALT';
    throw err;
  }
  if (iterations < MIN_PBKDF2_ITERATIONS) {
    const err = new Error(`B14: Iterations must be >= ${MIN_PBKDF2_ITERATIONS}`);
    err.code = 'B14_INSUFFICIENT_ITERATIONS';
    throw err;
  }
  return crypto.pbkdf2Sync(passphrase, salt, iterations, KEY_LENGTH_BYTES, 'sha256');
}

/**
 * Encrypts plaintext field using AES-256-GCM.
 * Output format: enc:v<version>:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
function encryptClinicalField(plaintext, keyBuffer, keyVersion = 1) {
  validateKeyStrength(keyBuffer);
  if (typeof plaintext !== 'string') {
    plaintext = JSON.stringify(plaintext);
  }

  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv, {
    authTagLength: AUTH_TAG_LENGTH_BYTES
  });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `enc:v${keyVersion}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts clinical field ciphertext. Supports key keyring for rotation.
 */
function decryptClinicalField(envelope, keyRing) {
  if (!envelope || typeof envelope !== 'string' || !envelope.startsWith('enc:v')) {
    const err = new Error('B14: Invalid ciphertext envelope format');
    err.code = 'B14_INVALID_ENVELOPE';
    throw err;
  }

  const parts = envelope.split(':');
  if (parts.length !== 5) {
    const err = new Error('B14: Envelope must contain exactly 5 parts');
    err.code = 'B14_MALFORMED_ENVELOPE';
    throw err;
  }

  const [, versionStr, ivHex, tagHex, cipherHex] = parts;
  const version = parseInt(versionStr.replace(/^v/, ''), 10);

  // Retrieve key from keyRing by version
  let keyBuffer;
  if (Buffer.isBuffer(keyRing)) {
    keyBuffer = keyRing;
  } else if (keyRing && typeof keyRing === 'object') {
    keyBuffer = keyRing[version];
  }

  if (!keyBuffer) {
    const err = new Error(`B14: Missing decryption key for version ${version}`);
    err.code = 'B14_KEY_VERSION_NOT_FOUND';
    throw err;
  }

  validateKeyStrength(keyBuffer);

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');

  if (iv.length !== IV_LENGTH_BYTES) {
    const err = new Error('B14: Invalid IV length');
    err.code = 'B14_INVALID_IV';
    throw err;
  }

  if (authTag.length !== AUTH_TAG_LENGTH_BYTES) {
    const err = new Error('B14: Invalid auth tag length');
    err.code = 'B14_INVALID_AUTH_TAG';
    throw err;
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv, {
    authTagLength: AUTH_TAG_LENGTH_BYTES
  });
  decipher.setAuthTag(authTag);

  try {
    let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    const err = new Error('B14: Decryption or authentication failed (tampered ciphertext or wrong key)');
    err.code = 'B14_DECRYPTION_FAILED';
    throw err;
  }
}

/**
 * Zero-Actor E1 Pre-flight verification:
 * Proves encryption engine and bootstrap keys are operational using an ephemeral
 * in-memory probe string. Guarantees ZERO interaction with stored patient records or databases.
 */
function verifyZeroActorBootstrap(keyBuffer, currentVersion = 1) {
  validateKeyStrength(keyBuffer);

  // Self-test with synthetic probe
  const probeData = 'QA_BOOTSTRAP_PROBE_NON_SENSITIVE_' + Date.now();
  const encrypted = encryptClinicalField(probeData, keyBuffer, currentVersion);
  const decrypted = decryptClinicalField(encrypted, keyBuffer);

  if (decrypted !== probeData) {
    const err = new Error('B14: Self-test loopback verification failed');
    err.code = 'B14_BOOTSTRAP_SELF_TEST_FAILED';
    throw err;
  }

  return {
    operational: true,
    algorithm: ALGORITHM,
    keyLengthBits: KEY_LENGTH_BYTES * 8,
    activeVersion: currentVersion,
    zeroPatientAccessVerified: true,
    protectedFields: SENSITIVE_CLINICAL_FIELDS
  };
}

module.exports = {
  SENSITIVE_CLINICAL_FIELDS,
  ALGORITHM,
  KEY_LENGTH_BYTES,
  validateKeyStrength,
  deriveEncryptionKey,
  encryptClinicalField,
  decryptClinicalField,
  verifyZeroActorBootstrap
};
