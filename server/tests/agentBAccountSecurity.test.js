'use strict';
const { createPasswordChangeService } = require('../src/services/passwordChangeService');
const { verifyPatientConsent } = require('../src/services/patientConsentService');
const jwt = require('jsonwebtoken');
const id = '000000000000000000000001', patientId = '000000000000000000000002', sessionId = '000000000000000000000003';
test.each(['success', 'proof-race', 'password-race', 'session-outage', 'audit-outage'])('password, proof, revocation and security event remain atomic: %s', async mode => {
  let state = { password: 'old-hash', proofUsed: false, validSession: true, trusted: true, events: [] };
  const transact = async work => { const before = structuredClone(state); try { return await work({ synthetic: true }); } catch (e) { state = before; throw e; } };
  const findOneAndUpdate = jest.fn(async filter => { expect(filter).toMatchObject({ _id: id, password: 'old-hash', mustChangePassword: true }); if (mode === 'password-race') return null; state.password = 'new-hash'; return { _id: id }; });
  const change = createPasswordChangeService({ transact, SessionToken: { updateMany: async (filter, _update, options) => { expect(filter).toMatchObject({ userId: id, userModel: 'PharmacyStaff', isValid: true }); expect(options.session).toBeDefined(); if (mode === 'session-outage') throw new Error(); state.validSession = false; } },
    TrustedDevice: { updateMany: async () => { state.trusted = false; } }, EventModel: { create: async ([event]) => { if (mode === 'audit-outage') throw new Error(); state.events.push(event); } } });
  const call = change({ user: { _id: id, password: 'old-hash' }, UserModel: { findOneAndUpdate }, userModel: 'PharmacyStaff', setup: true, newHash: '$2b$12$' + 'a'.repeat(53), proof: {
    model: { updateOne: async (_filter, _update, options) => { expect(options.session).toBeDefined(); if (mode === 'proof-race') return { modifiedCount: 0 }; state.proofUsed = true; return { modifiedCount: 1 }; } }, filter: { _id: 'owned-proof', used: false }, consumption: { used: true }
  } });
  if (mode === 'success') { await expect(call).resolves.toBe(true); expect(state).toMatchObject({ password: 'new-hash', proofUsed: true, validSession: false, trusted: false }); expect(state.events).toHaveLength(1); expect(JSON.stringify(state.events)).not.toContain('hash'); }
  else { await expect(call).rejects.toBeDefined(); expect(state).toEqual({ password: 'old-hash', proofUsed: false, validSession: true, trusted: true, events: [] }); }
});
test.each([undefined, 'short', 'a'.repeat(73), 'é'.repeat(40), 'alllowercasepassword'])('password utility rejects invalid input %#', value => expect(require('../src/utils/passwordUtils').validatePasswordStrength(value).valid).toBe(false));
test('temporary password generation and actual password hashing use cryptographic primitives', async () => {
  const utils = require('../src/utils/passwordUtils'), first = utils.generateTempPassword(), second = utils.generateTempPassword();
  expect(first).toHaveLength(16); expect(second).not.toBe(first); expect(utils.validatePasswordStrength(first).valid).toBe(true);
  const hash = await utils.hashPassword('Synthetic-password-123!'); expect(require('bcryptjs').getRounds(hash)).toBe(12); expect(await require('bcryptjs').compare('Synthetic-password-123!', hash)).toBe(true);
});
test.each(['pharmacist', 'doctor', 'hospital_admin'])('patient consent is role/actor/subject bound for %s', async role => {
  const secret = 'synthetic-consent-service-signing-key-32bytes';
  const token = jwt.sign({ type: 'patient-access', requesterId: id, requesterRole: role, nic: '900000001V', sessionId }, secret, { expiresIn: '5m' });
  const findOne = jest.fn(() => Promise.resolve({ userId: patientId }));
  expect(await verifyPatientConsent({ actor: { id, role }, nic: '900000001V', token }, { secret, OTPSession: { findOne } })).toEqual({ patientId, consentSessionId: sessionId });
  expect(findOne.mock.calls[0][0]).toMatchObject({ 'metadata.requesterRole': role, 'metadata.revoked': false });
  await expect(verifyPatientConsent({ actor: { id: patientId, role }, nic: '900000001V', token }, { secret, OTPSession: { findOne } })).rejects.toThrow();
});
test('revoked consent cannot win the transactional claim', async () => {
  const secret = 'synthetic-consent-service-signing-key-32bytes';
  const token = jwt.sign({ type: 'patient-access', requesterId: id, requesterRole: 'pharmacist', nic: '900000001V', sessionId }, secret, { expiresIn: '5m' });
  await expect(verifyPatientConsent({ actor: { id, role: 'pharmacist' }, nic: '900000001V', token, session: {}, claim: true }, { secret, OTPSession: { findOne: () => ({ session: async () => ({ userId: patientId }) }), updateOne: async () => ({ modifiedCount: 0 }) } })).rejects.toThrow('PATIENT_CONSENT_DENIED');
});
