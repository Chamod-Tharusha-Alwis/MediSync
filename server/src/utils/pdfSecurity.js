'use strict';

const crypto = require('crypto');
const { encryptPDF, AlreadyEncryptedError } = require('@pdfsmaller/pdf-encrypt-lite');

const EMPTY_MARKERS = new Set(['', 'N/A', 'UNDEFINED', 'NULL']);
const cleanPassword = value => (typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '') : '');

/**
 * Normalizes password for PDF lock (Patient NIC uppercase with no whitespace).
 * Fallback to consultation reference if NIC is absent or N/A.
 * Returns null when neither is available: there is NO fixed default password.
 */
function normalizePdfPassword(rawPassword, fallback = null) {
  const primary = cleanPassword(rawPassword);
  if (!EMPTY_MARKERS.has(primary)) return primary;
  const secondary = cleanPassword(fallback);
  if (!EMPTY_MARKERS.has(secondary)) return secondary;
  return null;
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
 * Encrypts a generated PDF buffer with the PDF Standard Security Handler.
 *
 * KNOWN LIMITATION: @pdfsmaller/pdf-encrypt-lite implements RC4-128 only (PDF 1.4,
 * /V 2 /R 3). RC4 is cryptographically weak, and the user password is derived from a
 * low-entropy identifier (NIC or consultation reference). Treat the lock as a
 * casual-access deterrent, not as confidentiality. Exports stay off by default
 * (PDF_EXPORT_ENABLED / REACT_APP_PDF_EXPORT_ENABLED). See docs/final/PDF_ENCRYPTION_LIMITATION.md.
 *
 * User Password: Patient NIC (upper case, no spaces) or consultation reference.
 * Fails closed (SECURITY_HOLD) when neither is available; there is no fixed default.
 * Permissions: Disallow copying and editing; allow high-quality printing.
 */
async function securePdfBuffer(pdfBytes, rawPassword, options = {}) {
  if (!pdfBytes) throw new Error('PDF_BYTES_REQUIRED');
  if (options.unlockForTest === true || process.env.MEDISYNC_TEST_DISABLE_PDF_LOCK === 'true') {
    return pdfBytes;
  }

  const userPassword = normalizePdfPassword(rawPassword, options.fallbackPassword || options.consultationRef);
  if (!userPassword) {
    const err = new Error('SECURITY_HOLD: PDF password source unavailable (no patient NIC or consultation reference); export refused.');
    err.code = 'SECURITY_HOLD';
    err.reason = 'PDF_PASSWORD_UNAVAILABLE';
    throw err;
  }
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
