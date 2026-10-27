'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto'), mongoose = require('mongoose');
const { controllerHarness, consent, ids, nic } = require('./helpers/phase5xD5InertHarness');
test.each(['valid', 'expired', 'revoked', 'actor', 'role', 'ambiguous', 'unverified'])('actual consent verification rejects invalid evidence: %s', async variant => {
  const proof = consent(variant === 'expired' ? { expiresIn: -1 } : variant === 'actor' ? { requesterId: ids.other } : variant === 'role' ? { claims: { requesterRole: 'patient' } } : variant === 'revoked' ? { metadata: { revoked: true } } : {});
  const h = controllerHarness('patientController', { otp: proof.otp, ambiguous: variant === 'ambiguous', doctor: variant === 'unverified' ? { isVerified: false } : {} });
  const decision = await h.exports.verifyDoctorPatientAuthorization({ user: { id: ids.doctor, role: 'doctor' }, headers: { 'x-patient-access': proof.token } }, nic, crypto.createHash('sha256').update(nic).digest('hex'));
  expect(decision.authorized).toBe(variant === 'valid'); expect(h.calls.writes).toBe(0);
});
function dispensingHarness(options = {}) {
  const staffId = '000000000000000000000001', pharmacyId = '000000000000000000000002', inventoryId = '000000000000000000000003', rxId = '000000000000000000000004';
  let state = { stock: 5, receipts: {}, prescriptions: {}, rx: { _id: rxId, patientId: ids.patient, patientNic: nic, status: 'pending', expiresAt: new Date(Date.now() + 86400000), drugName: 'SyntheticDrug' } }, revision = 0;
  const calls = { writes: 0, aborts: 0, commits: 0, predicates: [] };
  const session = async () => ({ draft: null, version: 0, startTransaction() { this.draft = structuredClone(state); this.version = revision; }, inTransaction: () => true,
    async commitTransaction() { if (revision !== this.version) throw Object.assign(new Error('conflict'), { errorLabels: ['TransientTransactionError'] }); state = this.draft; revision++; calls.commits++; }, async abortTransaction() { calls.aborts++; }, async endSession() {} });
  class Prescription { constructor(data) { Object.assign(this, data); } async save({ session: s }) { calls.writes++; s.draft.prescriptions[String(this._id)] = this; } }
  Prescription.findOne = () => ({ session: async s => s.draft.rx });
  Prescription.updateOne = async (filter, update, { session: s }) => { calls.writes++; if (s.draft.rx.status !== 'pending') return { modifiedCount: 0 }; Object.assign(s.draft.rx, update.$set); return { modifiedCount: 1 }; };
  class Dispensing { constructor(data) { Object.assign(this, data); } toObject() { return { ...this, _id: String(this._id), prescriptionId: String(this.prescriptionId) }; } async save({ session: s }) { if (options.failReceipt) throw new Error('receipt persistence failed'); calls.writes++; s.draft.receipts[String(this._id)] = this.toObject(); } }
  Dispensing.findById = id => ({ session: s => ({ lean: async () => s.draft.receipts[String(id)] || null }) });
  const dependencies = {
    '../security/nicPersistence': require('../src/security/nicPersistence'),
    './clinicalErrors': require('../src/services/clinicalErrors'),
    './pharmacyCommitGuard': { claimPharmacyAuthorization: async () => ({ patientId: ids.patient }) },
    './currentMedicationSafety': { currentMedicationNames: async () => [], assertMedicationResult: require('../src/services/currentMedicationSafety').assertMedicationResult },
    mongoose: { ...mongoose, startSession: session }, crypto,
    '../models/PharmacyStaff': { findById: () => ({ session: async () => ({ _id: staffId, role: 'pharmacist', isActive: true, isVerified: options.unverified !== true, pharmacyId }) }) },
    '../models/Pharmacy': { findById: () => ({ session: async s => ({ _id: pharmacyId, isActive: true, name: 'Synthetic pharmacy', inventory: [{ _id: inventoryId, drugName: 'SyntheticDrug', stock: s.draft.stock, unit: 'tablet' }] }) }),
      updateOne: async (filter, update, { session: s }) => { calls.writes++; calls.predicates.push(filter); const qty = -update.$inc['inventory.$.stock']; if (s.draft.stock < qty) return { modifiedCount: 0 }; s.draft.stock -= qty; return { modifiedCount: 1 }; } },
    '../models/Prescription': Prescription, '../models/Dispensing': Dispensing,
    '../models/Patient': { findOne: () => ({ session: async () => ({ _id: ids.patient, nic, allergies: options.allergy ? ['synthetic'] : [] }) }) },
    '../utils/ingredientResolver': { checkAllergyConflict: (_drug, allergies) => ({ hasConflict: allergies.length > 0 }), analyzeMedicationSafety: () => ({ verificationIncomplete: false, hasInteraction: false }) },
    './clinicalAuditService': { recordClinicalEvent: async () => ({}), ACTIONS: {} }
  };
  const module = { exports: {} }, filename = path.resolve(__dirname, '../src/services/dispensingService.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, require: name => { if (!(name in dependencies)) throw new Error('UNEXPECTED_DEPENDENCY'); return dependencies[name]; }, Buffer, Date, Map }, { filename });
  const request = { user: { id: staffId, role: 'pharmacist' }, body: { patientNic: nic, items: [{ drugName: 'SyntheticDrug', quantity: 2, unit: 'tablet' }], prescriptionId: rxId }, idempotencyKey: 'synthetic-key-1', skipAuditProjection: true };
  return { service: module.exports, request, calls, state: () => state };
}
test('actual dispensing consumes scoped stock once and replay returns original receipt', async () => {
  const h = dispensingHarness(); const first = await h.service.dispense(h.request), second = await h.service.dispense(h.request);
  expect(first.replay).toBe(false); expect(second.replay).toBe(true); expect(String(first.receipt._id)).toBe(String(second.receipt._id)); expect(h.state().stock).toBe(3);
  expect(h.calls.predicates[0]).toMatchObject({ _id: '000000000000000000000002', inventory: { $elemMatch: { _id: '000000000000000000000003', stock: { $gte: 2 } } } });
});
test.each(['allergy', 'unverified', 'failReceipt'])('actual dispensing %s aborts without committed stock/receipt change', async flag => {
  const h = dispensingHarness({ [flag]: true }); await expect(h.service.dispense(h.request)).rejects.toBeDefined();
  expect(h.state().stock).toBe(5); expect(h.state().rx.status).toBe('pending'); expect(Object.keys(h.state().receipts)).toHaveLength(0); expect(h.calls.commits).toBe(0);
});
test('actual concurrent checkout has one receipt and one inventory decrement', async () => {
  const h = dispensingHarness(); const outcomes = await Promise.all([h.service.dispense(h.request), h.service.dispense(h.request)]);
  expect(outcomes.filter(o => !o.replay)).toHaveLength(1); expect(h.state().stock).toBe(3); expect(Object.keys(h.state().receipts)).toHaveLength(1);
});
test('actual changed replay payload is rejected', async () => {
  const h = dispensingHarness(); await h.service.dispense(h.request);
  await expect(h.service.dispense({ ...h.request, body: { ...h.request.body, notes: 'changed' } })).rejects.toMatchObject({ code: 'ALREADY_DISPENSED' }); expect(h.state().stock).toBe(3);
});
test('actual OTC checkout requires replay key and persists one prescription', async () => {
  const h = dispensingHarness(); const request = { ...h.request, otc: true, body: { patientNic: nic, medications: h.request.body.items } };
  await expect(h.service.dispense({ ...request, idempotencyKey: undefined })).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
  await h.service.dispense(request); expect((await h.service.dispense(request)).replay).toBe(true); expect(Object.keys(h.state().prescriptions)).toHaveLength(1); expect(h.state().stock).toBe(3);
});
