'use strict';
const crypto = require('crypto');
// Candidate codec only: no globals, environment lookup, mongoose hooks or database access.
function createAuthenticatedFields({ keys, activeVersion, legacyKeys = {} }) {
  const ring = new Map();
  for (const [v, key] of Object.entries(keys || {})) {
    if (!/^[1-9][0-9]{0,5}$/.test(v) || !Buffer.isBuffer(key) || key.length !== 32 || key.every(b => b === 0)) throw new Error('FIELD_KEY_INVALID');
    if ([...ring.values()].some(k => crypto.timingSafeEqual(k, key))) throw new Error('FIELD_KEY_REUSED');
    ring.set(v, Buffer.from(key));
  }
  if (!ring.has(String(activeVersion))) throw new Error('FIELD_KEY_MISSING');
  const aad = (context, version) => {
    if (!context || ['collection', 'recordId', 'field'].some(k => typeof context[k] !== 'string' || !/^[a-zA-Z0-9_.-]{1,128}$/.test(context[k]))) throw new Error('FIELD_CONTEXT_INVALID');
    return Buffer.from(JSON.stringify(['medisync-field-gcm', 1, version, context.collection, context.recordId, context.field]));
  };
  const decode = (value, length) => {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]*$/.test(value)) throw new Error('FIELD_AUTH_FAILED');
    const b = Buffer.from(value, 'base64url');
    if (b.toString('base64url') !== value || (length && b.length !== length)) throw new Error('FIELD_AUTH_FAILED');
    return b;
  };
  return Object.freeze({
    encrypt(value, context) {
      if (typeof value !== 'string' || Buffer.byteLength(value) > 1024 * 1024) throw new Error('FIELD_VALUE_INVALID');
      const v = String(activeVersion), nonce = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', ring.get(v), nonce, { authTagLength: 16 });
      cipher.setAAD(aad(context, v));
      const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return ['gcm1', v, nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
    },
    decrypt(envelope, context) {
      try {
        if (typeof envelope !== 'string' || envelope.length > 1500000) throw new Error();
        const parts = envelope.split('.');
        if (parts.length !== 5 || parts[0] !== 'gcm1' || !ring.has(parts[1])) throw new Error();
        const [, v, iv, tag, body] = parts;
        const decipher = crypto.createDecipheriv('aes-256-gcm', ring.get(v), decode(iv, 12), { authTagLength: 16 });
        decipher.setAAD(aad(context, v));
        decipher.setAuthTag(decode(tag, 16));
        return Buffer.concat([decipher.update(decode(body)), decipher.final()]).toString('utf8');
      } catch (_) { throw new Error('FIELD_AUTH_FAILED'); }
    },
    // Explicit legacy import only. CBC cannot authenticate its plaintext or provenance.
    readLegacy(envelope, version, { allowUnauthenticatedLegacy = false } = {}) {
      try {
        const secret = legacyKeys[String(version)];
        if (!allowUnauthenticatedLegacy || typeof secret !== 'string' || !secret || typeof envelope !== 'string' || !/^[a-f0-9]{32}:(?:[a-f0-9]{32})+$/i.test(envelope)) throw new Error();
        const [iv, body] = envelope.split(':');
        const legacyKey = crypto.createHash('sha256').update(secret).digest('hex').substring(0, 32);
        const decipher = crypto.createDecipheriv('aes-256-cbc', legacyKey, Buffer.from(iv, 'hex'));
        return { plaintext: Buffer.concat([decipher.update(Buffer.from(body, 'hex')), decipher.final()]).toString('utf8'), authenticated: false, requiresReview: true };
      } catch (_) { throw new Error('LEGACY_FIELD_REJECTED'); }
    }
  });
}
module.exports = { createAuthenticatedFields };
