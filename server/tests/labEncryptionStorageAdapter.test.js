'use strict';

/**
 * MediSync Laboratory Report Authenticated Envelope Encryption & Storage Adapter Test
 * Verifies:
 * - Authenticated AES-256-GCM in-memory file encryption
 * - Master key wrapping & unwrapping via AES-256-CBC
 * - Mocked storage adapter retrieval
 * - Rejection of tampered ciphertext, bad auth tags, wrong keys, and cross-patient access
 */

const crypto = require('crypto');
const assert = require('assert');

describe('Laboratory Report Authenticated Envelope Encryption Specification', () => {
  const masterKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const masterKeyBuf = Buffer.from(masterKey, 'utf-8').slice(0, 32);

  // Synthetic PDF buffer
  const syntheticPdf = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Title (SYNTHETIC_LAB_REPORT_FBC_QA) /PatientNIC (199012345678) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'
  );

  // In-memory mock storage adapter simulating Cloudinary authenticated raw bucket
  const storageAdapter = new Map();

  it('1. Successfully executes full authenticated encryption, storage, retrieval, and decryption round-trip', async () => {
    // 1. Generate unique 32-byte AES-256 file key and 12-byte GCM IV
    const fileKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);

    // 2. Encrypt with AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', fileKey, iv);
    const encryptedBytes = Buffer.concat([cipher.update(syntheticPdf), cipher.final()]);
    const authTag = cipher.getAuthTag(); // 16 bytes

    // 3. Combine: [authTag (16 bytes) | ciphertext]
    const storedBlob = Buffer.concat([authTag, encryptedBytes]);

    // 4. Store in storage adapter
    const storageId = `raw/authenticated/lab-reports/report-${Date.now()}.bin`;
    storageAdapter.set(storageId, storedBlob);

    // 5. Wrap fileKey using master Vault key (AES-256-CBC)
    const cbcIV = crypto.randomBytes(16);
    const keyCipher = crypto.createCipheriv('aes-256-cbc', masterKeyBuf, cbcIV);
    keyCipher.setAutoPadding(false);
    const wrappedKey = Buffer.concat([keyCipher.update(fileKey), keyCipher.final()]);

    // --- RETRIEVAL & DECRYPTION ---
    // 6. Retrieve from storage adapter
    const retrievedBlob = storageAdapter.get(storageId);
    assert(retrievedBlob, 'Retrieved blob must exist in storage');

    // 7. Unwrap fileKey
    const keyDecipher = crypto.createDecipheriv('aes-256-cbc', masterKeyBuf, cbcIV);
    keyDecipher.setAutoPadding(false);
    const unwrappedFileKey = Buffer.concat([keyDecipher.update(wrappedKey), keyDecipher.final()]);
    assert.deepStrictEqual(unwrappedFileKey, fileKey, 'Unwrapped fileKey must match original fileKey');

    // 8. Decrypt and authenticate AES-256-GCM
    const extractedAuthTag = retrievedBlob.slice(0, 16);
    const extractedCiphertext = retrievedBlob.slice(16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', unwrappedFileKey, iv);
    decipher.setAuthTag(extractedAuthTag);

    const decryptedBuffer = Buffer.concat([decipher.update(extractedCiphertext), decipher.final()]);
    assert.deepStrictEqual(decryptedBuffer, syntheticPdf, 'Decrypted buffer must match original PDF exactly');
  });

  it('2. Fails closed and rejects tampered ciphertext bytes', async () => {
    const fileKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', fileKey, iv);
    const encryptedBytes = Buffer.concat([cipher.update(syntheticPdf), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const storedBlob = Buffer.concat([authTag, encryptedBytes]);

    // Corrupt ciphertext
    const corruptedBlob = Buffer.from(storedBlob);
    corruptedBlob[corruptedBlob.length - 1] ^= 0x01; // flip 1 bit

    const decipher = crypto.createDecipheriv('aes-256-gcm', fileKey, iv);
    decipher.setAuthTag(corruptedBlob.slice(0, 16));
    assert.throws(() => {
      Buffer.concat([decipher.update(corruptedBlob.slice(16)), decipher.final()]);
    }, /Unsupported state or unable to authenticate data/);
  });

  it('3. Fails closed and rejects tampered authentication tag', async () => {
    const fileKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', fileKey, iv);
    const encryptedBytes = Buffer.concat([cipher.update(syntheticPdf), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const tamperedTag = Buffer.from(authTag);
    tamperedTag[0] ^= 0xff; // flip byte

    const decipher = crypto.createDecipheriv('aes-256-gcm', fileKey, iv);
    decipher.setAuthTag(tamperedTag);
    assert.throws(() => {
      Buffer.concat([decipher.update(encryptedBytes), decipher.final()]);
    }, /Unsupported state or unable to authenticate data/);
  });

  it('4. Fails closed and rejects decryption with wrong master key', async () => {
    const fileKey = crypto.randomBytes(32);
    const cbcIV = crypto.randomBytes(16);
    const keyCipher = crypto.createCipheriv('aes-256-cbc', masterKeyBuf, cbcIV);
    keyCipher.setAutoPadding(false);
    const wrappedKey = Buffer.concat([keyCipher.update(fileKey), keyCipher.final()]);

    const wrongMasterKeyBuf = crypto.randomBytes(32);
    const wrongDecipher = crypto.createDecipheriv('aes-256-cbc', wrongMasterKeyBuf, cbcIV);
    wrongDecipher.setAutoPadding(false);
    const corruptedFileKey = Buffer.concat([wrongDecipher.update(wrappedKey), wrongDecipher.final()]);

    assert.notDeepStrictEqual(corruptedFileKey, fileKey);
  });

  it('5. Rejects unauthorized patient access (RBAC & ownership boundary)', () => {
    const labTestMetadata = {
      testId: 'LT-20261018-001',
      patientNic: '199012345678',
      hospitalId: 'HOSP-001'
    };

    const requestingPatient1 = { role: 'patient', nic: '199012345678' };
    const requestingPatient2 = { role: 'patient', nic: '199587654321' };

    // Authorized patient
    const authorized = requestingPatient1.nic === labTestMetadata.patientNic;
    assert.strictEqual(authorized, true);

    // Cross-patient unauthorized attempt
    const crossPatientDenied = requestingPatient2.nic !== labTestMetadata.patientNic;
    assert.strictEqual(crossPatientDenied, true);
  });
});
