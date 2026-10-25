'use strict';
const crypto = require('crypto');
const { planFiveRoles, issueInvitation, verifyInvitation } = require('../src/security/provisioningPlan');
const { decryptStoredReport, downloadStoredReport } = require('../src/services/labReportStorage');
const { reconcileClinicalAuditOutbox, recordClinicalEvent, sanitizeDetails } = require('../src/services/clinicalAuditService');
const rows = ['admin', 'patient', 'doctor', 'hospital_admin', 'pharmacist'].map(role => ({ role, email: `${role}@example.invalid` }));
test('five-role plan has correct collections, no identities in output and zero side effects', () => {
  const plan = planFiveRoles(rows, { comparisonKey: crypto.randomBytes(32) });
  expect(plan.writes).toBe(0); expect(plan.operations.map(x => x.collection)).toEqual(['admins', 'patients', 'doctors', 'hospitals', 'pharmacystaffs']);
  expect(JSON.stringify(plan)).not.toContain('@'); expect(plan.operations.filter(x => x.professionalHold)).toHaveLength(3);
});
test('provisioning rejects duplicate roles/email and existing normalized identity', () => {
  const comparisonKey = crypto.randomBytes(32);
  expect(() => planFiveRoles([...rows.slice(0, 4), rows[0]], { comparisonKey })).toThrow();
  expect(() => planFiveRoles(rows.map((r, i) => i === 4 ? { ...r, email: rows[0].email.toUpperCase() } : r), { comparisonKey })).toThrow();
  const plan = planFiveRoles(rows, { comparisonKey });
  expect(() => planFiveRoles(rows, { comparisonKey, existingEmailDigests: [plan.operations[0].emailDigest] })).toThrow();
});
test('invitation proof binds role/subject/expiry and never persists the bearer token in record', () => {
  const identity = { role: 'doctor', subjectId: '000000000000000000000001', now: 1000000 };
  const invite = issueInvitation(identity);
  expect(JSON.stringify(invite.record)).not.toContain(invite.token); expect(verifyInvitation(invite.token, invite.record, identity)).toBe(true);
  for (const patch of [{ role: 'patient' }, { subjectId: '000000000000000000000002' }, { now: 99999999 }]) expect(verifyInvitation(invite.token, invite.record, { ...identity, ...patch })).toBe(false);
  expect(verifyInvitation(invite.token, { ...invite.record, consumedAt: new Date() }, identity)).toBe(false);
  expect(verifyInvitation(invite.token, invite.record, { ...identity, now: NaN })).toBe(false);
});

test.each(['constructor', 'toString', '__proto__'])('provisioning rejects inherited role %s', role => {
  expect(() => planFiveRoles([{ role, email: 'synthetic@example.invalid' }, ...rows.slice(1)], { comparisonKey: crypto.randomBytes(32) })).toThrow('ROLE_SET_INVALID');
  expect(() => issueInvitation({ role, subjectId: '000000000000000000000001' })).toThrow('INVITATION_INVALID');
});
function encryptedFixture() {
  const masterSecret = 'synthetic-only-master-key-32bytes!!', fileKey = crypto.randomBytes(32), iv = crypto.randomBytes(12), wrapIv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', fileKey, iv); const ciphertext = Buffer.concat([cipher.update('synthetic PDF'), cipher.final()]);
  const wrapper = crypto.createCipheriv('aes-256-cbc', Buffer.from(masterSecret).subarray(0, 32), wrapIv); wrapper.setAutoPadding(false);
  return { masterSecret, blob: Buffer.concat([cipher.getAuthTag(), ciphertext]), record: { reportPublicId: 'synthetic/report', encryptedFileKey: wrapIv.toString('hex') + Buffer.concat([wrapper.update(fileKey), wrapper.final()]).toString('hex'), fileIV: iv.toString('hex') } };
}
test('actual lab retrieval decrypts legacy wrapped GCM and bounds provider access', async () => {
  const f = encryptedFixture(), download = jest.fn(async () => ({ data: f.blob }));
  expect((await downloadStoredReport(f.record, { masterSecret: f.masterSecret, sign: () => 'https://api.cloudinary.com/synthetic', download })).toString()).toBe('synthetic PDF');
  expect(download.mock.calls[0][1]).toMatchObject({ maxRedirects: 0, timeout: 10000 });
});
test.each(['tag', 'ciphertext', 'key', 'nonce', 'master'])('actual lab decrypt rejects tampered %s without replacement PDF', type => {
  const f = encryptedFixture();
  if (type === 'tag') f.blob[0] ^= 1;
  if (type === 'ciphertext') f.blob[f.blob.length - 1] ^= 1;
  if (type === 'key') f.record.encryptedFileKey = '00'.repeat(48);
  if (type === 'nonce') f.record.fileIV = '00'.repeat(12);
  if (type === 'master') f.masterSecret = 'different-synthetic-master-32bytes';
  expect(() => decryptStoredReport(f.blob, f.record, f.masterSecret)).toThrow('LAB_REPORT_AUTHENTICATION_FAILED');
});
test.each(['http://127.0.0.1/', 'https://api.cloudinary.com.attacker.invalid/', 'https://api.cloudinary.com:8443/', 'https://user:pass@api.cloudinary.com/'])('lab download rejects unapproved URL %#', async url => {
  const f = encryptedFixture(), download = jest.fn();
  await expect(downloadStoredReport(f.record, { sign: () => url, download, masterSecret: f.masterSecret })).rejects.toThrow('LAB_REPORT_UNAVAILABLE'); expect(download).not.toHaveBeenCalled();
});
test('lab storage outage and unversioned legacy record fail closed', async () => {
  const f = encryptedFixture();
  await expect(downloadStoredReport(f.record, { sign: () => 'https://api.cloudinary.com/synthetic', download: async () => { throw new Error('provider secret'); } })).rejects.toThrow(/^LAB_REPORT_UNAVAILABLE$/);
  await expect(downloadStoredReport({ reportPath: 'https://example.invalid' })).rejects.toThrow('LAB_REPORT_LEGACY_REVIEW_REQUIRED');
});
test('production Redis security operations reject memory fallback even with development override', async () => {
  const redis = require('../src/config/redis'), oldEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production'; process.env.SINGLE_INSTANCE_DEV_MODE = 'true';
  try {
    for (const name of ['setOtp', 'getOtp', 'deleteOtp', 'clearAttempts', 'incrementAttempts', 'getAttempts', 'checkOtpRequestThrottle', 'recordOtpRequestSent']) await expect(redis[name]('synthetic')).rejects.toThrow('SECURITY_STORE_UNAVAILABLE');
  } finally { process.env.NODE_ENV = oldEnv; delete process.env.SINGLE_INSTANCE_DEV_MODE; }
});
test('audit reconciliation requires bounded adapter and exact-ID confirmed projection', async () => {
  await expect(reconcileClinicalAuditOutbox({ DispensingModel: { find: () => ({ lean: async () => [] }) }, AuditLogModel: {} })).rejects.toThrow('AUDIT_RECONCILIATION_ADAPTER_INVALID');
  const row = { _id: '000000000000000000000004', audit: { actorId: 'actor', actorRole: 'assistant', action: 'OTC_PRESCRIPTION_DISPENSED' } };
  const limit = jest.fn(() => ({ lean: async () => [row] })), updateOne = jest.fn(async () => ({ modifiedCount: 1 })), create = jest.fn(async v => v);
  expect(await reconcileClinicalAuditOutbox({ DispensingModel: { find: () => ({ limit }), updateOne }, AuditLogModel: { create } })).toEqual({ scanned: 1, reconciled: 1 });
  expect(limit).toHaveBeenCalledWith(100); expect(updateOne.mock.calls[0][0]).toEqual({ _id: row._id, 'audit.projectedAt': { $exists: false } });
  expect(create.mock.calls[0][0].actorRole).toBe('assistant'); expect(create.mock.calls[0][0].action).toContain('OTC_PRESCRIPTION_DISPENSED');
});
test('duplicate dispensing projection verifies existing evidence and rejects conflicts', async () => {
  let existing;
  const model = { create: jest.fn(async value => { if (existing) throw Object.assign(new Error('duplicate'), { code: 11000 }); existing = value; return value; }), findById: () => ({ lean: async () => existing }) };
  const params = { actorId: 'actor', actorRole: 'assistant', action: 'OTC_PRESCRIPTION_DISPENSED', resourceType: 'Dispensing', resourceId: 'fixture', auditLogModel: model };
  const first = await recordClinicalEvent(params); expect(await recordClinicalEvent(params)).toEqual(first);
  await expect(recordClinicalEvent({ ...params, actorRole: 'doctor' })).rejects.toThrow('AUDIT_PROJECTION_CONFLICT');
});
test('audit metadata excludes explicit identifiers and arbitrary email/NIC values', () => expect(sanitizeDetails({ patientName: 'synthetic', nic: '900000001V', extra: 'person@example.invalid', other: '900000001V', quantity: 2 })).toEqual({ quantity: 2 }));
