'use strict';

const crypto = require('crypto');
const { encryptPDF, AlreadyEncryptedError } = require('@pdfsmaller/pdf-encrypt-lite');

/**
 * Normalizes password for PDF lock (Patient NIC uppercase with no whitespace).
 * Fallback to consultation reference if NIC is absent or N/A.
 */
function normalizePdfPassword(rawPassword, fallback = 'MEDISYNC') {
  if (typeof rawPassword === 'string') {
    const cleaned = rawPassword.trim().toUpperCase().replace(/\s+/g, '');
    if (cleaned && cleaned !== 'N/A' && cleaned !== 'UNDEFINED' && cleaned !== 'NULL') {
      return cleaned;
    }
  }
  if (typeof fallback === 'string' && fallback.trim()) {
    return fallback.trim().toUpperCase().replace(/\s+/g, '');
  }
  return 'MEDISYNC';
}

/**
 * Checks if raw PDF buffer contains standard /Encrypt dictionary.
 */
function isPdfEncrypted(pdfBuffer) {
  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) && !(pdfBuffer instanceof Uint8Array)) return false;
  const buf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
  return buf.includes(Buffer.from('/Encrypt'));
}

/**
 * Encrypts a generated PDF buffer with AES/RC4 standard encryption.
 * User Password: Patient NIC (upper case, no spaces) or consultation reference.
 * Permissions: Disallow copying and editing; allow high-quality printing.
 */
async function securePdfBuffer(pdfBytes, rawPassword, options = {}) {
  if (!pdfBytes) throw new Error('PDF_BYTES_REQUIRED');
  if (options.unlockForTest === true || process.env.MEDISYNC_TEST_DISABLE_PDF_LOCK === 'true') {
    return pdfBytes;
  }

  const userPassword = normalizePdfPassword(rawPassword, options.fallbackPassword || options.consultationRef);
  const ownerPassword = options.ownerPassword || crypto.randomBytes(32).toString('hex');

  try {
    const encrypted = await encryptPDF(pdfBytes, userPassword, {
      ownerPassword,
      allowPrinting: true,
      allowHighQualityPrinting: true,
      allowCopying: false,
      allowModifying: false,
      allowAnnotating: false,
      allowFillingForms: false,
      allowDocumentAssembly: false,
      allowContentAccessibility: false,
    });
    return encrypted;
  } catch (err) {
    if (err instanceof AlreadyEncryptedError) return pdfBytes;
    console.error('[PDF_SECURITY] Encryption failure:', err.message);
    throw err;
  }
}

module.exports = {
  normalizePdfPassword,
  isPdfEncrypted,
  securePdfBuffer,
};
