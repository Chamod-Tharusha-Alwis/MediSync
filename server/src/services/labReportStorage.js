'use strict';
const crypto = require('crypto');
const MAX_BYTES = 10 * 1024 * 1024 + 16;
function decryptStoredReport(blob, record, masterSecret, fieldConfiguration) {
  if (record.reportEnvelopeVersion === 2) return require('../security/labReportEnvelope').decryptReport(blob, record, fieldConfiguration || require('../security/securityRuntime').current().fieldConfiguration());
  try {
    if (!Buffer.isBuffer(blob) || blob.length < 17 || blob.length > MAX_BYTES || typeof masterSecret !== 'string' || Buffer.byteLength(masterSecret) < 32 ||
        !/^[0-9a-f]{96}$/i.test(record.encryptedFileKey) || !/^[0-9a-f]{24}$/i.test(record.fileIV)) throw new Error();
    // Legacy key wrapping retained for existing encrypted reports; GCM authenticates the file before returning ANY bytes.
    const keyDecipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(masterSecret, 'utf8').subarray(0, 32), Buffer.from(record.encryptedFileKey.slice(0, 32), 'hex'));
    keyDecipher.setAutoPadding(false);
    const fileKey = Buffer.concat([keyDecipher.update(Buffer.from(record.encryptedFileKey.slice(32), 'hex')), keyDecipher.final()]);
    const decipher = crypto.createDecipheriv('aes-256-gcm', fileKey, Buffer.from(record.fileIV, 'hex'), { authTagLength: 16 });
    decipher.setAuthTag(blob.subarray(0, 16));
    return Buffer.concat([decipher.update(blob.subarray(16)), decipher.final()]);
  } catch (_) { throw new Error('LAB_REPORT_AUTHENTICATION_FAILED'); }
}
async function downloadStoredReport(record, { sign, download, masterSecret, fieldConfiguration } = {}) {
  if (typeof record?.reportPublicId !== 'string' || !record.reportPublicId || !record.encryptedFileKey || !record.fileIV) throw new Error('LAB_REPORT_LEGACY_REVIEW_REQUIRED');
  const signer = sign || require('../utils/cloudinary').generateSignedUrl;
  const transport = download || require('axios').get;
  try {
    const url = signer(record.reportPublicId, { resource_type: 'raw', type: 'authenticated' });
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'api.cloudinary.com' || parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) throw new Error();
    const response = await transport(url, { responseType: 'arraybuffer', timeout: 10000, maxRedirects: 0, maxContentLength: MAX_BYTES, maxBodyLength: MAX_BYTES });
    const version = record.fileKeyVersion ?? record.keyVersion ?? 1;
    return decryptStoredReport(Buffer.from(response.data), record, masterSecret ?? global.ENCRYPTION_KEYS?.[String(version)], fieldConfiguration);
  } catch (_) { throw new Error('LAB_REPORT_UNAVAILABLE'); }
}
module.exports = { decryptStoredReport, downloadStoredReport };
