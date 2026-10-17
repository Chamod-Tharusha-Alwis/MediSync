'use strict';

const crypto = require('crypto');
const {
  SENSITIVE_CLINICAL_FIELDS,
  ALGORITHM,
  KEY_LENGTH_BYTES,
  validateKeyStrength,
  deriveEncryptionKey,
  encryptClinicalField,
  decryptClinicalField,
  verifyZeroActorBootstrap
} = require('./helpers/qaEncryptionBootstrap');

describe('B14 QA Encryption Bootstrap & Pre-Flight Verification Suite', () => {
  const VALID_KEY_V1 = crypto.randomBytes(KEY_LENGTH_BYTES);
  const VALID_KEY_V2 = crypto.randomBytes(KEY_LENGTH_BYTES);
  const SENSITIVE_NOTE = 'Patient reports severe migraine with photophobia';

  describe('Part A: Key Strength & Derivation Rules', () => {
    test('1. Validates sensitive clinical fields coverage', () => {
      expect(SENSITIVE_CLINICAL_FIELDS).toContain('notes');
      expect(SENSITIVE_CLINICAL_FIELDS).toContain('diagnosis');
      expect(SENSITIVE_CLINICAL_FIELDS).toContain('symptoms');
      expect(SENSITIVE_CLINICAL_FIELDS).toContain('prescriptionDetails');
    });

    test('2. Fails closed on invalid key buffer or length', () => {
      expect(() => validateKeyStrength(null)).toThrow(/valid Buffer/);
      expect(() => validateKeyStrength(crypto.randomBytes(16))).toThrow(/exactly 32 bytes/);
      expect(() => validateKeyStrength(crypto.randomBytes(64))).toThrow(/exactly 32 bytes/);
    });

    test('3. Fails closed on trivial all-zero key', () => {
      const allZeros = Buffer.alloc(KEY_LENGTH_BYTES, 0);
      expect(() => validateKeyStrength(allZeros)).toThrow(/Trivial all-zero key rejected/);
    });

    test('4. Derives 256-bit key using PBKDF2 with strict parameter validation', () => {
      const salt = crypto.randomBytes(16);
      const key = deriveEncryptionKey('StrongPassphraseForTesting123!', salt, 100000);
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);

      // Rejects weak passphrase (< 16 chars)
      expect(() => deriveEncryptionKey('short', salt)).toThrow(/at least 16 characters/);
      // Rejects insufficient salt (< 16 bytes)
      expect(() => deriveEncryptionKey('StrongPassphraseForTesting123!', crypto.randomBytes(8))).toThrow(/at least 16 bytes/);
      // Rejects low iterations (< 100,000)
      expect(() => deriveEncryptionKey('StrongPassphraseForTesting123!', salt, 5000)).toThrow(/Iterations must be >= 100000/);
    });
  });

  describe('Part B: Zero-Actor E1 Pre-Flight Verification', () => {
    test('5. Zero-actor E1 pre-flight proves encryption operational with zero patient access', () => {
      const result = verifyZeroActorBootstrap(VALID_KEY_V1, 1);
      expect(result.operational).toBe(true);
      expect(result.algorithm).toBe('aes-256-gcm');
      expect(result.keyLengthBits).toBe(256);
      expect(result.activeVersion).toBe(1);
      expect(result.zeroPatientAccessVerified).toBe(true);
    });

    test('6. Zero-actor verification fails closed if key is weak', () => {
      const weakKey = Buffer.alloc(16, 1);
      expect(() => verifyZeroActorBootstrap(weakKey, 1)).toThrow(/Key length must be exactly 32 bytes/);
    });
  });

  describe('Part C: Authenticated Encryption & Negative Failure Modes', () => {
    test('7. Successful authenticated encryption and decryption roundtrip', () => {
      const cipherEnvelope = encryptClinicalField(SENSITIVE_NOTE, VALID_KEY_V1, 1);
      expect(cipherEnvelope.startsWith('enc:v1:')).toBe(true);
      expect(cipherEnvelope).not.toContain(SENSITIVE_NOTE);

      const decrypted = decryptClinicalField(cipherEnvelope, VALID_KEY_V1);
      expect(decrypted).toBe(SENSITIVE_NOTE);
    });

    test('8. Fails closed on corrupted ciphertext bytes', () => {
      const envelope = encryptClinicalField(SENSITIVE_NOTE, VALID_KEY_V1, 1);
      const parts = envelope.split(':');
      // Corrupt ciphertext segment
      parts[4] = parts[4].slice(0, -2) + (parts[4].slice(-2) === 'aa' ? 'bb' : 'aa');
      const corruptedEnvelope = parts.join(':');

      expect(() => decryptClinicalField(corruptedEnvelope, VALID_KEY_V1)).toThrow(/Decryption or authentication failed/);
    });

    test('9. Fails closed on tampered authentication tag', () => {
      const envelope = encryptClinicalField(SENSITIVE_NOTE, VALID_KEY_V1, 1);
      const parts = envelope.split(':');
      // Corrupt auth tag segment
      parts[3] = '00'.repeat(16);
      const tamperedTagEnvelope = parts.join(':');

      expect(() => decryptClinicalField(tamperedTagEnvelope, VALID_KEY_V1)).toThrow(/Decryption or authentication failed/);
    });

    test('10. Fails closed on corrupted initialization vector (IV)', () => {
      const envelope = encryptClinicalField(SENSITIVE_NOTE, VALID_KEY_V1, 1);
      const parts = envelope.split(':');
      // Corrupt IV segment length
      parts[2] = '00';
      const invalidIvEnvelope = parts.join(':');

      expect(() => decryptClinicalField(invalidIvEnvelope, VALID_KEY_V1)).toThrow(/Invalid IV length/);
    });

    test('11. Fails closed on wrong decryption key', () => {
      const wrongKey = crypto.randomBytes(KEY_LENGTH_BYTES);
      const envelope = encryptClinicalField(SENSITIVE_NOTE, VALID_KEY_V1, 1);

      expect(() => decryptClinicalField(envelope, wrongKey)).toThrow(/Decryption or authentication failed/);
    });

    test('12. Fails closed on malformed envelope format', () => {
      expect(() => decryptClinicalField('plaintext-unencrypted-notes', VALID_KEY_V1)).toThrow(/Invalid ciphertext envelope format/);
      expect(() => decryptClinicalField('enc:v1:part2:part3', VALID_KEY_V1)).toThrow(/must contain exactly 5 parts/);
    });
  });

  describe('Part D: Key Rotation & Keyring Management', () => {
    test('13. Multi-version keyring decrypts v1 records while encrypting new records in v2', () => {
      const keyRing = {
        1: VALID_KEY_V1,
        2: VALID_KEY_V2
      };

      // Record 1 encrypted under key version 1
      const v1Record = encryptClinicalField('Record from 2025 encrypted with v1', VALID_KEY_V1, 1);
      // Record 2 encrypted under key version 2
      const v2Record = encryptClinicalField('Record from 2026 encrypted with v2', VALID_KEY_V2, 2);

      // Decrypt both using keyring
      const dec1 = decryptClinicalField(v1Record, keyRing);
      const dec2 = decryptClinicalField(v2Record, keyRing);

      expect(dec1).toBe('Record from 2025 encrypted with v1');
      expect(dec2).toBe('Record from 2026 encrypted with v2');
    });

    test('14. Fails closed when required key version is missing from keyring', () => {
      const incompleteKeyRing = {
        2: VALID_KEY_V2
      };

      const v1Record = encryptClinicalField(SENSITIVE_NOTE, VALID_KEY_V1, 1);
      expect(() => decryptClinicalField(v1Record, incompleteKeyRing)).toThrow(/Missing decryption key for version 1/);
    });
  });
});
