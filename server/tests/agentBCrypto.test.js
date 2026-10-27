'use strict';
const crypto = require('crypto');
const { createNicBlindIndex, normalizeNic } = require('../src/security/nicBlindIndex');
const { createAuthenticatedFields } = require('../src/security/authenticatedFields');
const context = { collection: 'synthetic', recordId: 'fixture-1', field: 'notes' };
describe('SEC-01 offline migration candidate', () => {
  const keys = { 1: crypto.randomBytes(32), 2: crypto.randomBytes(32) };
  const codec = createNicBlindIndex({ keys, activeVersion: 2 });
  test('normalizes only strict NIC formats without punctuation/confusable folding', () => {
    expect(normalizeNic(' 900000001v ')).toBe('900000001V');
    for (const value of ['900-000001V', '９00000001V', '', null, {}, '123']) expect(() => normalizeNic(value)).toThrow();
  });
  test('versioned writes and rotation read old/new with constant-time matching', () => {
    const old = codec.index('900000001v', 1), current = codec.index('900000001V');
    expect(old).not.toBe(current); expect(codec.matches('900000001v', old)).toBe(true);
    expect(codec.matches('900000002V', current)).toBe(false);
    expect(codec.matches('900000001V', current.replace('sha256:2', 'sha256:99'))).toBe(false);
  });
  test('dual-read is explicit, preserves legacy trim and uppercase indices', () => {
    expect(codec.candidates('900000001v').legacy).toEqual([]);
    const c = codec.candidates('900000001v', { includeLegacy: true });
    expect(c.hmac).toHaveLength(2); expect(c.legacy).toHaveLength(2);
    expect(c.legacy).toContain(crypto.createHash('sha256').update('900000001v').digest('hex'));
  });
  test.each([undefined, {}, { 1: 'string-secret' }, { 1: Buffer.alloc(32) }, { 1: Buffer.alloc(16) }])('rejects invalid key material %#', keys => expect(() => createNicBlindIndex({ keys, activeVersion: 1 })).toThrow());
  test('rejects reused rotation keys and missing active key', () => {
    expect(() => createNicBlindIndex({ keys: { 1: keys[1], 2: keys[1] }, activeVersion: 2 })).toThrow('NIC_KEY_REUSED');
    expect(() => createNicBlindIndex({ keys, activeVersion: 3 })).toThrow();
  });
  test('dry-run produces bounded exact-ID candidate operations without changing input', () => {
    const rows = [{ id: 'synthetic-1', nic: '900000001V' }], before = JSON.stringify(rows);
    const plan = codec.dryRun(rows); expect(JSON.stringify(rows)).toBe(before);
    expect(plan[0]).not.toHaveProperty('nic'); expect(plan[0].id).toBe('synthetic-1');
    expect(() => codec.dryRun([...rows, ...rows])).toThrow();
    expect(() => codec.dryRun(Array(1001).fill(rows[0]))).toThrow();
  });
});
describe('SEC-02 authenticated envelope candidate', () => {
  const keys = { 1: crypto.randomBytes(32), 2: crypto.randomBytes(32) };
  const codec = createAuthenticatedFields({ keys, activeVersion: 2, legacyKeys: { 1: 'synthetic-legacy-only' } });
  test.each(['', 'synthetic notes', 'සිංහල தமிழ்'])('round trips UTF-8 and empty strings %#', value => expect(codec.decrypt(codec.encrypt(value, context), context)).toBe(value));
  test('random 96-bit nonces differ for repeated plaintext and tags are 128-bit', () => {
    const values = Array.from({ length: 100 }, () => codec.encrypt('fixture', context));
    expect(new Set(values.map(v => v.split('.')[2])).size).toBe(100);
    expect(Buffer.from(values[0].split('.')[2], 'base64url')).toHaveLength(12);
    expect(Buffer.from(values[0].split('.')[3], 'base64url')).toHaveLength(16);
  });
  test.each([1, 2, 3, 4])('rejects tampered envelope part %i', i => {
    const p = codec.encrypt('fixture', context).split('.'); p[i] = (p[i][0] === 'A' ? 'B' : 'A') + p[i].slice(1);
    expect(() => codec.decrypt(p.join('.'), context)).toThrow('FIELD_AUTH_FAILED');
  });
  test.each(['collection', 'recordId', 'field'])('binds AAD to %s', field => expect(() => codec.decrypt(codec.encrypt('fixture', context), { ...context, [field]: 'other' })).toThrow('FIELD_AUTH_FAILED'));
  test('wrong key, missing key, truncated input and legacy auto-detection fail closed', () => {
    const other = createAuthenticatedFields({ keys: { 2: crypto.randomBytes(32) }, activeVersion: 2 });
    expect(() => other.decrypt(codec.encrypt('fixture', context), context)).toThrow('FIELD_AUTH_FAILED');
    expect(() => codec.decrypt('00:ff', context)).toThrow('FIELD_AUTH_FAILED');
    expect(() => createAuthenticatedFields({ keys: {}, activeVersion: 1 })).toThrow();
  });
  test('old GCM key can be read after rotation; new writes use active version', () => {
    const old = createAuthenticatedFields({ keys, activeVersion: 1 });
    expect(codec.decrypt(old.encrypt('fixture', context), context)).toBe('fixture');
    expect(codec.encrypt('fixture', context)).toMatch(/^gcm1\.2\./);
  });
  test('actual legacy library CBC format remains explicit and labelled unauthenticated', () => {
    const key = crypto.createHash('sha256').update('synthetic-legacy-only').digest('hex').substring(0, 32);
    const old = require('mongoose-field-encryption').encrypt('synthetic legacy', key, () => crypto.randomBytes(16));
    expect(() => codec.readLegacy(old, 1)).toThrow('LEGACY_FIELD_REJECTED');
    expect(codec.readLegacy(old, 1, { allowUnauthenticatedLegacy: true })).toEqual({ plaintext: 'synthetic legacy', authenticated: false, requiresReview: true });
    expect(() => codec.readLegacy(old, 999, { allowUnauthenticatedLegacy: true })).toThrow();
  });
});
