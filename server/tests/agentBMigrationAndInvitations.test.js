'use strict';
const crypto = require('crypto');
const { planNicMigration, planFieldMigration } = require('../src/security/securityMigrationPlan');

test('migration ownership rejects upper/lowercase spellings of the same ObjectId', () => {
  const id = 'abcdef000000000000000001', rows = [{ _id: id, __v: 1 }, { _id: id.toUpperCase(), __v: 1 }];
  expect(() => planNicMigration(rows, {})).toThrow('MIGRATION_IDENTITY_INVALID');
  expect(() => planFieldMigration(rows, { collection: 'synthetic', field: 'notes' })).toThrow('MIGRATION_IDENTITY_INVALID');
});
const { createAuthenticatedFields } = require('../src/security/authenticatedFields');
const { createNicBlindIndex } = require('../src/security/nicBlindIndex');
const { createInvitationWorkflow } = require('../src/services/invitationWorkflow');
const id = '000000000000000000000001';
test('NIC dry-run plans exact-ID/version compare-and-set plus constrained rollback without mutating input', () => {
  const rows = [{ _id: id, __v: 7, nic: '900000001V' }], original = JSON.stringify(rows), codec = createNicBlindIndex({ keys: { 1: crypto.randomBytes(32) }, activeVersion: 1 });
  const [plan] = planNicMigration(rows, codec); expect(JSON.stringify(rows)).toBe(original);
  expect(plan.update.filter).toEqual({ _id: id, __v: 7, patientNic_hmac: { $exists: false } });
  expect(plan.rollback.filter).toMatchObject({ _id: id, __v: 8, patientNic_hmac: plan.update.change.$set.patientNic_hmac });
  expect(JSON.stringify(plan)).not.toContain(rows[0].nic);
});
test.each(['duplicate', 'missing-version', 'oversized'])('migration planner rejects unsafe %s batches', mode => {
  const row = { _id: id, __v: 1, nic: '900000001V' }; if (mode === 'missing-version') delete row.__v;
  const rows = mode === 'oversized' ? Array(1001).fill(row) : mode === 'duplicate' ? [row, row] : [row];
  expect(() => planNicMigration(rows, {})).toThrow();
});
test('authenticated re-encryption verifies AAD/readback and records exact ciphertext rollback preconditions', () => {
  const oldConfiguration = { keys: { 1: crypto.randomBytes(32) }, activeVersion: 1 }, newConfiguration = { keys: { 2: crypto.randomBytes(32) }, activeVersion: 2 };
  const context = { collection: 'synthetic', recordId: id, field: 'notes' }, ciphertext = createAuthenticatedFields(oldConfiguration).encrypt('synthetic-only', context);
  const [plan] = planFieldMigration([{ _id: id, __v: 0, ciphertext }], { ...context, oldConfiguration, newConfiguration });
  expect(createAuthenticatedFields(newConfiguration).decrypt(plan.update.change.$set.ciphertext, context)).toBe('synthetic-only');
  expect(plan.rollback.filter.ciphertext).toBe(plan.update.change.$set.ciphertext); expect(plan.rollback.filter.__v).toBe(1);
  expect(JSON.stringify(plan)).not.toContain('synthetic-only');
  expect(() => planFieldMigration([{ _id: id, __v: 0, ciphertext: ciphertext.slice(0, -2) + 'AA' }], { ...context, oldConfiguration, newConfiguration })).toThrow();
});

test('CBC migration requires explicit semantic review and keeps the unauthenticated provenance warning', () => {
  const legacySecret = 'synthetic-only-legacy-field-secret', key = crypto.createHash('sha256').update(legacySecret).digest('hex').slice(0, 32), iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv), ciphertext = iv.toString('hex') + ':' + Buffer.concat([cipher.update('synthetic-only'), cipher.final()]).toString('hex');
  const oldConfiguration = { keys: { 1: crypto.randomBytes(32) }, activeVersion: 1, legacyKeys: { 1: legacySecret } }, newConfiguration = { keys: { 2: crypto.randomBytes(32) }, activeVersion: 2 };
  const options = { collection: 'synthetic', field: 'notes', oldConfiguration, newConfiguration };
  expect(() => planFieldMigration([{ _id: id, __v: 0, keyVersion: 1, ciphertext }], options)).toThrow('LEGACY_SEMANTIC_REVIEW_REQUIRED');
  expect(planFieldMigration([{ _id: id, __v: 0, keyVersion: 1, ciphertext }], { ...options, reviewLegacy: () => true })[0].unauthenticatedLegacyInput).toBe(true);
});

function invitationHarness(mode = 'success', extra = {}) {
  const claims = [];
  let state = { invitations: [], accounts: [], events: [] };
  const transaction = async work => { const before = structuredClone(state); try { return await work({}); } catch (error) { state = before; throw error; } };
  const InvitationModel = { create: async ([record]) => { if (state.invitations.some(row => row.emailDigest === record.emailDigest)) throw new Error('unique reservation conflict'); state.invitations.push({ ...record, _id: id }); },
    findOne: async () => state.invitations[0], updateOne: async (filter, change) => { if (change.$inc) { state.invitations[0].failedAttempts++; return { modifiedCount: 1 }; } claims.push(filter); if (state.invitations[0].consumedAt || mode === 'race') return { modifiedCount: 0 }; Object.assign(state.invitations[0], change.$set); return { modifiedCount: 1 }; } };
  class Account { constructor(attributes) { Object.assign(this, attributes); } static findOne() { return { session: async () => mode === 'duplicate' ? { _id: id } : null }; } async save() { state.accounts.push({ ...this }); } }
  const workflow = createInvitationWorkflow({ InvitationModel, UserModels: Object.fromEntries(['Admin', 'Doctor', 'Patient', 'Hospital', 'PharmacyStaff'].map(name => [name, Account])),
    PharmacyModel: { findOne: () => ({ session: async () => ({ _id: id }) }) }, EventModel: { create: async ([event]) => { if (mode === 'event-outage' && event.action === 'INVITATION_ACCEPTED_MFA_REQUIRED') throw new Error('audit unavailable'); state.events.push(event); } },
    comparisonKey: crypto.randomBytes(32), keyVersion: 1, transact: transaction, authorizeOperator: async () => mode !== 'operator-denied',
    passwordHash: async () => '$2b$12$' + 'a'.repeat(53), compareOtp: async () => mode !== 'wrong-otp', ...extra });
  return { workflow, state: () => state, claims };
}
test.each(['admin', 'doctor', 'patient', 'hospital_admin', 'pharmacist'])('invitation acceptance for %s enforces MFA and professional holds without issuing sessions', async role => {
  const h = invitationHarness(), issued = await h.workflow.issue({ operator: { id, role: 'admin' }, role, email: 'synthetic@example.invalid', pharmacyId: id });
  const accepted = await h.workflow.accept({ ...issued, role, email: 'synthetic@example.invalid', emailOtp: issued.emailOtp, password: 'Synthetic-password-123!', profile: { fullName: 'Synthetic', nic: '900000001V', isSuperAdmin: true, isVerified: true } });
  expect(accepted).toMatchObject({ mfaRequired: true, sessionsCreated: 0, trustedDevicesCreated: 0 });
  const account = h.state().accounts[0]; expect(account.twoFactorEnabled).toBe(true); expect(account.isSuperAdmin).toBeUndefined();
  if (['doctor', 'hospital_admin', 'pharmacist'].includes(role)) expect(account).toMatchObject({ isVerified: false, isActive: false });
  expect(JSON.stringify(h.state().invitations)).not.toContain(issued.token); expect(JSON.stringify(h.state().invitations)).not.toContain(issued.emailOtp);
  await expect(h.workflow.accept({ ...issued, role, email: 'synthetic@example.invalid', password: 'Synthetic-password-123!' })).rejects.toThrow();
});
test.each(['operator-denied', 'duplicate'])('invitation issuance rejects %s without creating any account', async mode => {
  const h = invitationHarness(mode); await expect(h.workflow.issue({ operator: { id, role: 'admin' }, role: 'doctor', email: 'synthetic@example.invalid' })).rejects.toThrow(); expect(h.state().accounts).toHaveLength(0); expect(h.state().invitations).toHaveLength(0);
});
test.each(['race', 'event-outage', 'wrong-otp'])('invitation %s cannot leave a partial activation', async mode => {
  const h = invitationHarness(mode), issued = await h.workflow.issue({ operator: { id, role: 'admin' }, role: 'doctor', email: 'synthetic@example.invalid' });
  await expect(h.workflow.accept({ ...issued, role: 'doctor', email: 'synthetic@example.invalid', password: 'Synthetic-password-123!', emailOtp: issued.emailOtp })).rejects.toThrow();
  expect(h.state().accounts).toHaveLength(0); expect(h.state().invitations[0].consumedAt).toBeNull();
  if (mode === 'wrong-otp') expect(h.state().invitations[0].failedAttempts).toBe(1);
});

test.each([-1, 1.5, NaN, 5])('invitation rejects corrupt or exhausted attempt count %s before activation', async failedAttempts => {
  const h = invitationHarness(), issued = await h.workflow.issue({ operator: { id, role: 'admin' }, role: 'doctor', email: 'synthetic@example.invalid' });
  h.state().invitations[0].failedAttempts = failedAttempts;
  await expect(h.workflow.accept({ ...issued, role: 'doctor', email: 'synthetic@example.invalid', password: 'Synthetic-password-123!', emailOtp: issued.emailOtp })).rejects.toThrow('INVITATION_PROOF_DENIED');
  expect(h.state().accounts).toHaveLength(0); expect(h.state().invitations[0].consumedAt).toBeNull();
});
test.each(['', '12345', '1234567', 123456, '12345x'])('invitation rejects malformed OTP %j before activation', async emailOtp => {
  const h = invitationHarness();
  await expect(h.workflow.accept({ role: 'doctor', subjectId: id, email: 'synthetic@example.invalid', password: 'Synthetic-password-123!', emailOtp })).rejects.toThrow('INVITATION_ACTIVATION_INVALID');
  expect(h.state().accounts).toHaveLength(0);
});
test('invitation atomic claim uses current expiry after password hashing and a nonnegative retry counter', async () => {
  let clock = Date.now();
  const h = invitationHarness('success', { now: () => clock, passwordHash: async () => { clock += 2000; return '$2b$12$' + 'a'.repeat(53); } });
  const issued = await h.workflow.issue({ operator: { id, role: 'admin' }, role: 'doctor', email: 'synthetic@example.invalid' }), before = clock;
  await h.workflow.accept({ ...issued, role: 'doctor', email: 'synthetic@example.invalid', password: 'Synthetic-password-123!', emailOtp: issued.emailOtp });
  expect(h.claims).toHaveLength(1); expect(h.claims[0].expiresAt.$gt.getTime()).toBe(before + 2000);
  expect(h.claims[0].emailOtpExpiresAt.$gt.getTime()).toBe(before + 2000); expect(h.claims[0].failedAttempts).toEqual({ $gte: 0, $lt: 5 });
});
test.each([undefined, 'invalid', { $ne: null }])('pharmacist invitation rejects an unbound pharmacy identifier %j', async pharmacyId => {
  const h = invitationHarness(); await expect(h.workflow.issue({ operator: { id, role: 'admin' }, role: 'pharmacist', email: 'synthetic@example.invalid', pharmacyId })).rejects.toThrow('PROVISIONING_PHARMACY_APPROVAL_REQUIRED'); expect(h.state().invitations).toHaveLength(0);
});
test('patient identity review detects normalized duplicates across retained HMAC versions without exposing NIC', () => {
  const codec = createNicBlindIndex({ keys: { 1: crypto.randomBytes(32), 2: crypto.randomBytes(32) }, activeVersion: 2 });
  const rows = [{ _id: id, __v: 0, nic: '900000001v', patientNic_hmac: codec.index('900000001V', 1) }, { _id: '000000000000000000000002', __v: 3, nic: ' 900000001V ', patientNic_hmac: codec.index('900000001V', 2) }];
  const before = JSON.stringify(rows), result = require('../src/security/securityMigrationPlan').reviewPatientIdentityBatch(rows, codec);
  expect(result).toMatchObject({ writes: 0, batchUnique: false, databaseUniquenessVerified: false, oldAndNewNicEquivalenceVerified: false });
  expect(result.collisions[0].recordIds).toEqual(rows.map(row => row._id)); expect(JSON.stringify(result)).not.toContain('900000001'); expect(JSON.stringify(rows)).toBe(before);
});
test('patient identity review refuses mismatching historical sidecars', () => {
  const codec = createNicBlindIndex({ keys: { 1: crypto.randomBytes(32) }, activeVersion: 1 });
  expect(() => require('../src/security/securityMigrationPlan').reviewPatientIdentityBatch([{ _id: id, __v: 0, nic: '900000001V', patientNic_hmac: codec.index('900000002V') }], codec)).toThrow('PATIENT_IDENTITY_SIDECAR_MISMATCH');
});
