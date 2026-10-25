'use strict';
const crypto = require('crypto');
const { createAuthenticatedFields } = require('./authenticatedFields');
const context = record => ({ collection: 'labtests', recordId: String(record._id), field: 'report-file-key' });
const aad = record => Buffer.from(JSON.stringify(['medisync-lab-report', 2, String(record._id), 'application/pdf']));
function encryptReport(pdf, record, configuration) {
  if (!Buffer.isBuffer(pdf) || pdf.length > 10 * 1024 * 1024 || pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('LAB_PDF_FORMAT_INVALID');
  const key = crypto.randomBytes(32), iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  cipher.setAAD(aad(record));
  const body = Buffer.concat([cipher.update(pdf), cipher.final()]);
  return { blob: Buffer.concat([cipher.getAuthTag(), body]), reportEnvelopeVersion: 2, fileIV: iv.toString('hex'),
    encryptedFileKey: createAuthenticatedFields(configuration).encrypt(key.toString('base64'), context(record)) };
}
function decryptReport(blob, record, configuration) {
  try {
    if (record.reportEnvelopeVersion !== 2 || !Buffer.isBuffer(blob) || blob.length < 21 || blob.length > 10 * 1024 * 1024 + 16 || !/^[a-f0-9]{24}$/i.test(record.fileIV)) throw new Error();
    const encoded = createAuthenticatedFields(configuration).decrypt(record.encryptedFileKey, context(record));
    if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error();
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(encoded, 'base64'), Buffer.from(record.fileIV, 'hex'), { authTagLength: 16 });
    decipher.setAAD(aad(record)); decipher.setAuthTag(blob.subarray(0, 16));
    const plain = Buffer.concat([decipher.update(blob.subarray(16)), decipher.final()]);
    if (plain.subarray(0, 5).toString() !== '%PDF-') throw new Error();
    return plain;
  } catch (_) { throw new Error('LAB_REPORT_AUTHENTICATION_FAILED'); }
}
function encryptLegacyReport(pdf, masterSecret) {
  if (!Buffer.isBuffer(pdf) || pdf.length > 10 * 1024 * 1024 || pdf.subarray(0, 5).toString() !== '%PDF-' || typeof masterSecret !== 'string' || Buffer.byteLength(masterSecret) < 32) throw new Error('LAB_LEGACY_ENCRYPTION_UNAVAILABLE');
  const key = crypto.randomBytes(32), iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(pdf), cipher.final()]), wrapIv = crypto.randomBytes(16);
  const wrap = crypto.createCipheriv('aes-256-cbc', Buffer.from(masterSecret).subarray(0, 32), wrapIv); wrap.setAutoPadding(false);
  return { blob: Buffer.concat([cipher.getAuthTag(), body]), reportEnvelopeVersion: 1, fileIV: iv.toString('hex'), encryptedFileKey: wrapIv.toString('hex') + Buffer.concat([wrap.update(key), wrap.final()]).toString('hex') };
}
module.exports = { encryptReport, decryptReport, encryptLegacyReport };
