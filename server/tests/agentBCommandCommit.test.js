'use strict';
const jwt = require('jsonwebtoken');
const { runTransaction } = require('../src/services/dispensingService');
const { createClinicalCommandService } = require('../src/services/clinicalCommandService');
const { executeClinicalWrite } = require('../src/services/consultationCommandService');
const { claimClinicalAuthorization } = require('../src/services/clinicalCommitGuard');
const ids = { doctor: '000000000000000000000001', patient: '000000000000000000000002', access: '000000000000000000000003', consent: '000000000000000000000004', device: '000000000000000000000005' };
const nic = '900000001V', secret = 'synthetic-commit-authorization-key-32bytes';

test.each(['valid-read', 'valid-claim', 'expiry-during-read', 'expiry-during-claim', 'fresh-claim-time'])('patient consent rejects stale asynchronous evidence: %s', async mode => {
  const { verifyPatientConsent } = require('../src/services/patientConsentService');
  let clock = Date.now(); const start = clock;
  const token = jwt.sign({ type: 'patient-access', requesterId: ids.doctor, requesterRole: 'doctor', nic, sessionId: ids.consent }, secret, { expiresIn: '2s' });
  const updateOne = jest.fn(async filter => {
    expect(filter['metadata.accessExpiresAt'].$gt.getTime()).toBe(clock);
    if (mode === 'expiry-during-claim') clock = start + 3000;
    return { modifiedCount: 1 };
  });
  const read = async () => {
    if (mode === 'expiry-during-read') clock = start + 3000;
    if (mode === 'fresh-claim-time') clock = start + 100;
    return { userId: ids.patient };
  };
  const result = verifyPatientConsent({ actor: { id: ids.doctor, role: 'doctor' }, nic, token, session: {}, claim: mode !== 'valid-read' }, { secret, now: () => clock, OTPSession: { findOne: () => ({ session: read }), updateOne } });
  if (mode.startsWith('expiry')) {
    await expect(result).rejects.toThrow('PATIENT_CONSENT_DENIED');
    if (mode === 'expiry-during-read') expect(updateOne).not.toHaveBeenCalled();
  } else await expect(result).resolves.toMatchObject({ patientId: ids.patient });
});
function harness(options = {}) {
  let state = { commands: {}, rows: [] }, revision = 0, sequence = 10, guardCalls = 0, commits = 0, bodies = 0;
  const sessionFactory = async () => ({ draft: null, version: 0, committed: false,
    startTransaction() { this.draft = structuredClone(state); this.version = revision; bodies++; }, inTransaction: () => true,
    async commitTransaction() {
      if (this.committed) return;
      if (revision !== this.version) throw Object.assign(new Error('synthetic write conflict'), { errorLabels: ['TransientTransactionError'] });
      state = this.draft; revision++; commits++; this.committed = true;
      if (options.unknownCommit && commits === 1) throw Object.assign(new Error('unknown result'), { errorLabels: ['UnknownTransactionCommitResult'] });
    }, async abortTransaction() {}, async endSession() {} });
  const CommandModel = { findById: id => ({ session: async s => s.draft.commands[id] || null }), create: async ([row], { session }) => {
    if (options.failOutbox) throw new Error('synthetic outbox write failed'); session.draft.commands[row._id] = row;
  } };
  const guard = async () => { guardCalls++; if (options.revokeBeforeCommit && guardCalls === 2) throw new Error('consent revoked'); };
  const command = createClinicalCommandService({ transact: work => runTransaction(work, sessionFactory), CommandModel, guard });
  const model = kind => class { constructor(data) { Object.assign(this, data); this._id = (++sequence).toString(16).padStart(24, '0'); } async save({ session }) {
    if (options.failPrescription && kind === 'Prescription') throw new Error('synthetic prescription save failed');
    if (options.failLab && kind === 'LabTest') throw new Error('synthetic lab save failed'); session.draft.rows.push({ kind, id: this._id });
  } };
  const patient = { _id: ids.patient, nic, allergies: [] };
  const models = { Consultation: model('Consultation'), Prescription: model('Prescription'), LabTest: model('LabTest'), Patient: { findById: () => ({ session: async () => patient }) } };
  const analyze = jest.fn(() => ({ hasInteraction: options.interaction === true, verificationIncomplete: false }));
  const request = { user: { id: ids.doctor, role: 'doctor' }, session: { _id: ids.access }, clinicalAuthorization: { patientId: ids.patient },
    headers: { 'idempotency-key': 'synthetic-command-0001', 'x-patient-access': 'inert-proof' }, body: { patientNic: nic, prescriptions: [{ drugName: 'SyntheticDrug', durationDays: 3 }], orderedTests: ['Synthetic lab'] } };
  const run = (req = request, extra = {}) => executeClinicalWrite(req, { command, models, existingMedicines: async () => ['ExistingSyntheticDrug'], analyze,
    allergyCheck: () => ({ hasConflict: options.allergy === true }), ...extra });
  return { run, request, state: () => state, analyze, counts: () => ({ guardCalls, commits, bodies }) };
}
test('actual consultation writer commits consultation, prescription, lab and durable outbox atomically', async () => {
  const h = harness(), result = await h.run();
  expect(h.state().rows.map(r => r.kind)).toEqual(['Consultation', 'Prescription', 'LabTest']);
  const journal = h.state().commands[result.commandId]; expect(journal.outbox).toHaveLength(3); expect(journal.patientId).toBe(ids.patient);
  expect(JSON.stringify(journal)).not.toContain(nic); expect(JSON.stringify(journal)).not.toContain('SyntheticDrug'); expect(h.counts().guardCalls).toBe(2);
  expect(h.analyze).toHaveBeenCalledWith(['ExistingSyntheticDrug', 'SyntheticDrug']);
});
test('actual command replay returns original identifiers without another clinical write', async () => {
  const h = harness(), first = await h.run(), replay = await h.run();
  expect(replay.replayed).toBe(true); expect(replay.result).toEqual(first.result); expect(h.state().rows).toHaveLength(3); expect(Object.keys(h.state().commands)).toHaveLength(1);
});
test('same key with a changed clinical request is a conflict', async () => {
  const h = harness(); await h.run(); await expect(h.run({ ...h.request, body: { ...h.request.body, diagnosis: 'changed synthetic value' } })).rejects.toMatchObject({ code: 'CLINICAL_IDEMPOTENCY_CONFLICT' }); expect(h.state().rows).toHaveLength(3);
});
test.each(['failPrescription', 'failLab', 'failOutbox', 'revokeBeforeCommit', 'allergy', 'interaction'])('actual %s failure leaves no committed domain records or journal', async flag => {
  const h = harness({ [flag]: true }); await expect(h.run()).rejects.toBeDefined(); expect(h.state()).toEqual({ commands: {}, rows: [] }); expect(h.counts().commits).toBe(0);
});
test('concurrent same-key requests have one clinical commit and one replay', async () => {
  const h = harness(), outcomes = await Promise.all([h.run(), h.run()]); expect(outcomes.filter(o => !o.replayed)).toHaveLength(1); expect(h.state().rows).toHaveLength(3);
});
test('unknown commit retries the commit without executing clinical writes again', async () => {
  const h = harness({ unknownCommit: true }); await h.run(); expect(h.counts()).toMatchObject({ bodies: 1, commits: 1 }); expect(h.state().rows).toHaveLength(3);
});

test('unlabeled commit transport failure is held as uncertain, without abort or clinical replay', async () => {
  const work = jest.fn(async () => 'synthetic'), abortTransaction = jest.fn(), commitTransaction = jest.fn(async () => { throw new Error('unlabeled transport failure'); });
  await expect(runTransaction(work, async () => ({ startTransaction() {}, inTransaction: () => true, commitTransaction, abortTransaction, endSession: async () => {} }))).rejects.toMatchObject({ code: 'TRANSACTION_OUTCOME_UNKNOWN' });
  expect(work).toHaveBeenCalledTimes(1); expect(abortTransaction).not.toHaveBeenCalled();
});

test.each(['success', 'missing-reference'])('prepared consultation response contract: %s', async mode => {
  const { createConsultationHandler } = require('../src/controllers/clinicalCommandController');
  const result = { consultationId: ids.patient, prescriptionIds: [ids.access], labTestIds: [ids.consent] };
  const prescriptions = jest.fn(async () => mode === 'missing-reference' ? [] : [{ _id: ids.access, drugName: 'SyntheticDrug', patientNic_hmac: 'must-not-leak', encryptedFileKey: 'must-not-leak' }]);
  const handler = createConsultationHandler({ execute: async () => ({ result, replayed: false, commandId: 'synthetic-command' }), prescriptions, labs: async () => [{ _id: ids.consent, testName: 'Synthetic lab', reportPath: 'must-not-leak' }] });
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await handler({ user: { id: ids.doctor }, clinicalAuthorization: { patientId: ids.patient } }, res);
  expect(prescriptions.mock.calls[0][0]).toMatchObject({ doctorId: ids.doctor, patientId: ids.patient });
  if (mode === 'success') { expect(res.status).toHaveBeenCalledWith(201); expect(res.json.mock.calls[0][0]).toMatchObject({ consultationId: ids.patient, notifications: { requested: false, deliveryConfirmed: false } }); expect(JSON.stringify(res.json.mock.calls)).not.toContain('must-not-leak'); }
  else expect(res.status).toHaveBeenCalledWith(503);
});
test('standalone prescription uses the same journal transaction without creating a consultation', async () => {
  const h = harness(); const result = await h.run({ ...h.request, body: { patientNic: nic, drugName: 'SyntheticDrug', durationDays: 2 } }, { standalone: true });
  expect(result.result).toHaveProperty('prescriptionId'); expect(h.state().rows.map(r => r.kind)).toEqual(['Prescription']);
});
test('missing idempotency key denies the write before transaction work', async () => {
  const h = harness(); await expect(h.run({ ...h.request, headers: {} })).rejects.toMatchObject({ code: 'CLINICAL_COMMAND_INVALID' }); expect(h.counts().bodies).toBe(0);
});

test.each(['valid', 'revoked-consent', 'unverified', 'expired-session', 'revoked-session', 'revoked-device', 'foreign-role', 'foreign-patient', 'no-expiry', 'foreign-workspace'])('actual commit guard enforces %s', async variant => {
  const claims = { type: 'patient-access', requesterId: ids.doctor, requesterRole: variant === 'foreign-role' ? 'patient' : 'doctor', nic, sessionId: ids.consent };
  const token = jwt.sign(claims, secret, variant === 'no-expiry' ? {} : { expiresIn: '5m' });
  const consentWrite = jest.fn(async () => ({ modifiedCount: variant === 'revoked-consent' ? 0 : 1 }));
  const access = { _id: ids.access, userId: ids.doctor, userModel: 'Doctor', isValid: variant !== 'revoked-session', deviceFingerprint: 'owned-device', ...(variant === 'expired-session' ? { expiredAt: new Date(0) } : {}) };
  const doc = { _id: ids.doctor, role: 'doctor', isActive: true, isVerified: variant !== 'unverified', orgLogins: [] };
  const wrap = result => ({ session: async () => result });
  const deps = { secret, Doctor: { findById: () => wrap(doc), updateOne: async () => ({ modifiedCount: 1 }) },
    Patient: { findById: () => wrap({ _id: ids.patient, nic: variant === 'foreign-patient' ? '900000002V' : nic }) },
    OTPSession: { updateOne: consentWrite }, SessionToken: { findOne: () => wrap(access), updateOne: async () => ({ modifiedCount: 1 }) },
    BanRecord: { findOne: () => wrap(null) }, TrustedDevice: { findOne: () => wrap({ _id: ids.device, userModel: 'Doctor', isRevoked: variant === 'revoked-device' }), updateOne: async () => ({ modifiedCount: 1 }) } };
  const call = claimClinicalAuthorization({ user: { id: ids.doctor, role: 'doctor' }, request: { patientNic: nic, ...(variant === 'foreign-workspace' ? { sessionHospitalId: ids.patient } : {}) }, context: { patientId: ids.patient, sessionId: ids.access, consentToken: token }, session: {} }, deps);
  if (variant === 'valid') { await expect(call).resolves.toMatchObject({ _id: ids.patient }); expect(consentWrite.mock.calls[0][0]).toMatchObject({ _id: ids.consent, userId: ids.patient, 'metadata.revoked': false }); expect(consentWrite.mock.calls[0][2]).toHaveProperty('session'); }
  else await expect(call).rejects.toBeDefined();
});

test.each(['valid', 'consent-after-device', 'session-after-device', 'consent-after-claim', 'session-claim-lost'])('doctor commit fences late expiry and session races: %s', async mode => {
  let clock = Date.now(); const start = clock;
  const token = jwt.sign({ type: 'patient-access', requesterId: ids.doctor, requesterRole: 'doctor', nic, sessionId: ids.consent }, secret, { expiresIn: '2s' });
  const wrap = row => ({ session: async () => row });
  const access = { _id: ids.access, userId: ids.doctor, userModel: 'Doctor', isValid: true, deviceFingerprint: 'owned-device', expiredAt: new Date(start + (mode === 'session-after-device' ? 1000 : 60000)) };
  const consentWrite = jest.fn(async () => { if (mode === 'consent-after-claim') clock = start + 3000; return { modifiedCount: 1 }; });
  const accessWrite = jest.fn(async filter => {
    expect(filter).toMatchObject({ userId: ids.doctor, userModel: 'Doctor', logoutAt: null, $or: [{ expiredAt: null }, { expiredAt: { $gt: new Date(clock) } }] });
    return { modifiedCount: mode === 'session-claim-lost' ? 0 : 1 };
  });
  const deps = { secret, now: () => clock,
    Doctor: { findById: () => wrap({ _id: ids.doctor, role: 'doctor', isActive: true, isVerified: true }), updateOne: jest.fn(async filter => {
      expect(filter).toMatchObject({ mustChangePassword: { $ne: true }, isDeleted: { $ne: true } }); return { modifiedCount: 1 };
    }) }, Patient: { findById: () => wrap({ _id: ids.patient, nic }) },
    SessionToken: { findOne: () => wrap(access), updateOne: accessWrite }, OTPSession: { updateOne: consentWrite }, BanRecord: { findOne: () => wrap(null) },
    TrustedDevice: { findOne: () => wrap({ _id: ids.device, userModel: 'Doctor', isRevoked: false }), updateOne: jest.fn(async filter => {
      expect(filter).toMatchObject({ userModel: 'Doctor', deviceFingerprint: 'owned-device' });
      if (mode.endsWith('after-device')) clock = start + 3000; return { modifiedCount: 1 };
    }) }
  };
  const result = claimClinicalAuthorization({ user: { id: ids.doctor, role: 'doctor' }, request: { patientNic: nic }, context: { patientId: ids.patient, sessionId: ids.access, consentToken: token }, session: {} }, deps);
  if (mode === 'valid') await expect(result).resolves.toHaveProperty('_id', ids.patient);
  else await expect(result).rejects.toBeDefined();
  if (mode.endsWith('after-device')) expect(consentWrite).not.toHaveBeenCalled();
});

test.each(['valid', 'expiry-during-device', 'expiry-during-session', 'lost-session-claim'])('pharmacy commit checks late session expiry: %s', async mode => {
  const { claimPharmacyAuthorization } = require('../src/services/pharmacyCommitGuard');
  let clock = Date.now(); const start = clock;
  const access = { _id: ids.access, userId: ids.doctor, userModel: 'PharmacyStaff', isValid: true, deviceFingerprint: 'owned-device', expiredAt: new Date(start + 1000) };
  const result = claimPharmacyAuthorization({ user: { id: ids.doctor, role: 'pharmacist' }, nic, authorization: { sessionId: ids.access, consentToken: 'inert' }, session: {} }, {
    now: () => clock, verify: async () => ({ patientId: ids.patient }),
    SessionToken: { findOne: () => ({ session: async () => access }), updateOne: async filter => {
      expect(filter).toMatchObject({ userId: ids.doctor, userModel: 'PharmacyStaff', $or: [{ expiredAt: null }, { expiredAt: { $gt: new Date(clock) } }] });
      if (mode === 'expiry-during-session') clock = start + 3000;
      return { modifiedCount: mode === 'lost-session-claim' ? 0 : 1 };
    } }, TrustedDevice: { updateOne: async () => { if (mode === 'expiry-during-device') clock = start + 3000; return { modifiedCount: 1 }; } }
  });
  if (mode === 'valid') await expect(result).resolves.toHaveProperty('patientId', ids.patient);
  else await expect(result).rejects.toMatchObject({ code: 'PHARMACY_SESSION_DENIED' });
});
