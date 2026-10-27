'use strict';
const crypto = require('crypto');
const versionPattern = /^[1-9][0-9]{0,5}$/;
function normalizeNic(value) {
  if (typeof value !== 'string') throw new Error('NIC_FORMAT_INVALID');
  const normalized = value.trim().toUpperCase();
  if (!/^(?:[0-9]{12}|[0-9]{9}[VX])$/.test(normalized)) throw new Error('NIC_FORMAT_INVALID');
  return normalized;
}
function keyRing(keys, activeVersion) {
  if (!keys || !versionPattern.test(String(activeVersion))) throw new Error('NIC_KEY_INVALID');
  const ring = new Map();
  for (const [version, key] of Object.entries(keys)) {
    if (!versionPattern.test(version) || !Buffer.isBuffer(key) || key.length !== 32 || key.every(b => b === 0)) throw new Error('NIC_KEY_INVALID');
    if ([...ring.values()].some(other => crypto.timingSafeEqual(other, key))) throw new Error('NIC_KEY_REUSED');
    ring.set(version, Buffer.from(key));
  }
  if (!ring.has(String(activeVersion))) throw new Error('NIC_KEY_MISSING');
  return ring;
}
function createNicBlindIndex({ keys, activeVersion }) {
  const ring = keyRing(keys, activeVersion);
  const index = (nic, version = String(activeVersion)) => {
    const key = ring.get(String(version));
    if (!key) throw new Error('NIC_KEY_MISSING');
    const digest = crypto.createHmac('sha256', key).update('medisync:nic-index:v1\0').update(normalizeNic(nic)).digest('hex');
    return `hmac-sha256:${version}:${digest}`;
  };
  return Object.freeze({
    index,
    matches(nic, stored) {
      const match = typeof stored === 'string' && /^hmac-sha256:([1-9][0-9]{0,5}):([0-9a-f]{64})$/.exec(stored);
      if (!match || !ring.has(match[1])) return false;
      return crypto.timingSafeEqual(Buffer.from(index(nic, match[1])), Buffer.from(stored));
    },
    // Lookup candidates are NOT authorization. Caller must retain actor/consent/tenant predicates.
    candidates(nic, { includeLegacy = false } = {}) {
      normalizeNic(nic);
      return {
        hmac: [...ring.keys()].map(v => index(nic, v)),
        legacy: includeLegacy ? [...new Set([nic.trim(), normalizeNic(nic)])].map(v => crypto.createHash('sha256').update(v).digest('hex')) : []
      };
    },
    dryRun(records) {
      if (!Array.isArray(records) || records.length > 1000) throw new Error('BOUNDED_BATCH_REQUIRED');
      const seen = new Set();
      return records.map(record => {
        if (!record || typeof record.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(record.id) || seen.has(record.id)) throw new Error('RECORD_ID_INVALID');
        seen.add(record.id);
        return { id: record.id, patientNic_hmac: index(record.nic), expectedOldIndex: record.patientNic_hmac || null };
      });
    }
  });
}
module.exports = { normalizeNic, createNicBlindIndex };
