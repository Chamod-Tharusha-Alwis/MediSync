'use strict';

/**
 * Phase 3 Backend Consultation 409 & Idempotency Offline Unit/Integration Suite
 * Target: server/tests/consultation409Offline.test.js
 *
 * Scopes Covered:
 *  1. Duplicate submission with identical payload -> 200 OK Safe Replay (no duplicate writes).
 *  2. Duplicate submission with modified payload -> 409 CLINICAL_IDEMPOTENCY_CONFLICT.
 *  3. Concurrent same-key submissions -> 1 commit (201), 1 replay (200), zero orphaned rows.
 *  4. 409 MEDICATION_REVIEW_REQUIRED on drug-drug interaction / duplicate ingredients.
 *  5. 409 MEDICATION_RECONCILIATION_REQUIRED on unreconciled active patient prescriptions.
 *  6. Missing or invalid Idempotency-Key rejection (400 CLINICAL_COMMAND_INVALID).
 *  7. Error code sanitization: zero stack trace or internal database error leakages.
 *  8. Reconcile endpoint GET /doctor/consultation-command/:key outcome verification.
 *  9. Single resolved medication with zero interactions/duplicates admits successfully (does not reject with 409).
 */

const crypto = require('crypto');
const { runTransaction } = require('../src/services/dispensingService');
const { createClinicalCommandService, digest } = require('../src/services/clinicalCommandService');
const { executeClinicalWrite } = require('../src/services/consultationCommandService');
const { createConsultationHandler } = require('../src/controllers/clinicalCommandController');
const { createClinicalWriteAuthorization } = require('../src/middleware/clinicalWriteAuthorization');
const { createReconciliation } = require('../src/controllers/clinicalReconciliationController');
const { assertMedicationResult } = require('../src/services/currentMedicationSafety');

const ids = {
  doctor: '000000000000000000000001',
  patient: '000000000000000000000002',
  session: '000000000000000000000003',
  consent: '000000000000000000000004'
};
const nic = '900000001V';

function buildMockHarness(options = {}) {
  let state = { commands: {}, consultations: [], prescriptions: [], labtests: [] };
  let revision = 0, sequence = 100, guardCalls = 0, commits = 0;

  const sessionFactory = async () => ({
    draft: null,
    version: 0,
    committed: false,
    startTransaction() {
      this.draft = structuredClone(state);
      this.version = revision;
    },
    inTransaction: () => true,
    async commitTransaction() {
      if (this.committed) return;
      if (revision !== this.version) {
        throw Object.assign(new Error('Write conflict'), { errorLabels: ['TransientTransactionError'] });
      }
      state = this.draft;
      revision++;
      commits++;
      this.committed = true;
    },
    async abortTransaction() {},
    async endSession() {}
  });

  const CommandModel = {
    findById: id => ({
      session: async s => s.draft.commands[id] || state.commands[id] || null
    }),
    create: async ([row], { session }) => {
      session.draft.commands[row._id] = row;
    }
  };

  const guard = async () => { guardCalls++; };

  const command = createClinicalCommandService({
    transact: work => runTransaction(work, sessionFactory),
    CommandModel,
    guard
  });

  const model = kind => class {
    constructor(data) {
      Object.assign(this, data);
      this._id = (++sequence).toString(16).padStart(24, '0');
    }
    async save({ session }) {
      session.draft[kind.toLowerCase() + 's']?.push({ kind, id: this._id, ...this });
    }
  };

  const models = {
    Consultation: model('Consultation'),
    Prescription: model('Prescription'),
    LabTest: model('LabTest'),
    Patient: {
      findById: () => ({
        session: async () => ({ _id: ids.patient, nic, allergies: [], decryptFieldsSync: () => {} })
      })
    }
  };

  const analyze = jest.fn(() => ({
    hasInteraction: options.hasInteraction === true,
    verificationIncomplete: options.verificationIncomplete === true,
    duplicateIngredients: options.duplicateIngredients || [],
    unresolvedIngredients: options.unresolvedIngredients || [],
    unresolvedDrugs: options.unresolvedDrugs || []
  }));

  const baseRequest = {
    user: { id: ids.doctor, role: 'doctor' },
    session: { _id: ids.session },
    clinicalAuthorization: { patientId: ids.patient },
    headers: {
      'idempotency-key': 'consult-test-key-00000000000001',
      'x-patient-access': 'synthetic-proof'
    },
    body: {
      patientNic: nic,
      diagnosis: 'Acute Pharyngitis',
      clinicalNotes: 'Rest and hydration advised.',
      prescriptions: [{ drugName: 'Amoxicillin 500mg', dosage: '500mg', durationDays: 5, frequency: 'TDS' }],
      orderedTests: ['Throat Swab Culture']
    }
  };

  const run = (req = baseRequest, extra = {}) =>
    executeClinicalWrite(req, {
      command,
      models,
      existingMedicines: async () => (options.existingMedicines || []),
      analyze,
      allergyCheck: () => ({ hasConflict: options.hasAllergy === true }),
      ...extra
    });

  return { run, baseRequest, state: () => state, counts: () => ({ commits, guardCalls }) };
}

describe('Phase 3 Backend: Consultation 409 & Idempotency Specification', () => {

  test('1. First submission commits consultation, prescription, lab, and command journal atomically', async () => {
    const h = buildMockHarness();
    const result = await h.run();

    expect(result.replayed).toBe(false);
    expect(result.result).toHaveProperty('consultationId');
    expect(result.result.prescriptionIds).toHaveLength(1);
    expect(result.result.labTestIds).toHaveLength(1);
    expect(h.counts().commits).toBe(1);
  });

  test('2. Resubmission with EXACT same payload and key returns 200 OK Safe Replay', async () => {
    const h = buildMockHarness();
    const first = await h.run();
    const second = await h.run();

    expect(second.replayed).toBe(true);
    expect(second.commandId).toBe(first.commandId);
    expect(second.result).toEqual(first.result);
    // Verified: No duplicate database records created on safe replay
    expect(h.state().consultations).toHaveLength(1);
    expect(h.state().prescriptions).toHaveLength(1);
    expect(h.state().labtests).toHaveLength(1);
  });

  test('3. Resubmission with same key but MODIFIED diagnosis rejects with 409 CLINICAL_IDEMPOTENCY_CONFLICT', async () => {
    const h = buildMockHarness();
    await h.run();

    const modifiedReq = {
      ...h.baseRequest,
      body: { ...h.baseRequest.body, diagnosis: 'Streptococcal Tonsillitis' }
    };

    await expect(h.run(modifiedReq)).rejects.toMatchObject({
      code: 'CLINICAL_IDEMPOTENCY_CONFLICT',
      status: 409
    });
    // Verified: Original records unmodified, no second commit
    expect(h.counts().commits).toBe(1);
  });

  test('4. Resubmission with same key but MODIFIED prescription items rejects with 409 CLINICAL_IDEMPOTENCY_CONFLICT', async () => {
    const h = buildMockHarness();
    await h.run();

    const modifiedReq = {
      ...h.baseRequest,
      body: {
        ...h.baseRequest.body,
        prescriptions: [{ drugName: 'Azithromycin 500mg', dosage: '500mg', durationDays: 3, frequency: 'OD' }]
      }
    };

    await expect(h.run(modifiedReq)).rejects.toMatchObject({
      code: 'CLINICAL_IDEMPOTENCY_CONFLICT',
      status: 409
    });
  });

  test('5. Concurrent submissions with identical key and body result in 1 commit and 1 safe replay', async () => {
    const h = buildMockHarness();
    const [res1, res2] = await Promise.all([h.run(), h.run()]);

    const replays = [res1, res2].filter(r => r.replayed);
    const commits = [res1, res2].filter(r => !r.replayed);

    expect(commits).toHaveLength(1);
    expect(replays).toHaveLength(1);
    expect(replays[0].result).toEqual(commits[0].result);
    expect(h.state().consultations).toHaveLength(1);
    expect(h.state().prescriptions).toHaveLength(1);
    expect(h.state().labtests).toHaveLength(1);
  });

  test('6. Missing or invalid Idempotency-Key format rejects with 400 CLINICAL_COMMAND_INVALID before writes', async () => {
    const h = buildMockHarness();
    const invalidKeyReq = {
      ...h.baseRequest,
      headers: { ...h.baseRequest.headers, 'idempotency-key': 'short' }
    };

    await expect(h.run(invalidKeyReq)).rejects.toMatchObject({
      code: 'CLINICAL_COMMAND_INVALID',
      status: 400
    });
    expect(h.counts().commits).toBe(0);
  });

  test('7. clinicalWriteAuthorization middleware returns 409 MEDICATION_REVIEW_REQUIRED on interaction', async () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    const middleware = createClinicalWriteAuthorization({
      verify: async () => ({ authorized: true, mode: 'patient_otp_consent', patientId: ids.patient }),
      getExisting: async () => ['Warfarin 5mg'],
      getDoctor: async () => ({ orgLogins: [] }),
      medicationCheck: async () => ({ hasInteraction: true, verificationIncomplete: false })
    });

    const req = {
      user: { id: ids.doctor, role: 'doctor' },
      headers: { 'x-patient-access': 'valid-proof' },
      body: { patientNic: nic, prescriptions: [{ drugName: 'Aspirin 100mg', durationDays: 7 }] }
    };

    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'MEDICATION_REVIEW_REQUIRED' });
    expect(next).not.toHaveBeenCalled();
  });

  test('8. clinicalWriteAuthorization middleware returns 409 MEDICATION_RECONCILIATION_REQUIRED on unreconciled records', async () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    const middleware = createClinicalWriteAuthorization({
      verify: async () => ({ authorized: true, mode: 'patient_otp_consent', patientId: ids.patient }),
      getExisting: async () => null,
      getDoctor: async () => ({ orgLogins: [] }),
      medicationCheck: async () => ({ hasInteraction: false, verificationIncomplete: false })
    });

    const req = {
      user: { id: ids.doctor, role: 'doctor' },
      headers: { 'x-patient-access': 'valid-proof' },
      body: { patientNic: nic, prescriptions: [{ drugName: 'Paracetamol 500mg', durationDays: 3 }] }
    };

    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'MEDICATION_RECONCILIATION_REQUIRED' });
    expect(next).not.toHaveBeenCalled();
  });

  test('9. clinicalCommandController handles ClinicalCommandError 409 and sanitizes payload', async () => {
    const { ClinicalCommandError } = require('../src/services/clinicalErrors');
    const mockExecute = jest.fn(async () => {
      throw new ClinicalCommandError('CLINICAL_IDEMPOTENCY_CONFLICT', 409);
    });

    const handler = createConsultationHandler({ execute: mockExecute });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const req = {
      user: { id: ids.doctor, role: 'doctor' },
      clinicalAuthorization: { patientId: ids.patient },
      body: {}
    };

    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'CLINICAL_IDEMPOTENCY_CONFLICT' });
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('stack');
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('details');
  });

  test('10. Clinical command reconcile endpoint retrieves committed outcome without re-execution', async () => {
    const key = 'consult-test-key-00000000000001';
    const expectedId = digest({ domain: 'clinical-command-v1', actorId: ids.doctor, role: 'doctor', kind: 'consultation', idempotencyKey: key }).slice(0, 24);
    const mockLookup = jest.fn(async () => ({
      _id: expectedId,
      actorId: ids.doctor,
      actorRole: 'doctor',
      kind: 'consultation',
      result: { consultationId: '0123456789abcdef01234567' }
    }));
    const reconcileHandler = createReconciliation({
      preflight: async () => {},
      lookup: mockLookup
    });

    const mockReq = {
      user: { id: ids.doctor, role: 'doctor' },
      params: { key }
    };
    let jsonResult;
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn((data) => { jsonResult = data; return mockRes; })
    };

    await reconcileHandler(mockReq, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith({
      state: 'committed',
      operationKey: key,
      consultationId: '0123456789abcdef01234567'
    });
  });

  test('11. Single resolved drug prescription admits successfully without 409 MEDICATION_REVIEW_REQUIRED', async () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    const middleware = createClinicalWriteAuthorization({
      verify: async () => ({ authorized: true, mode: 'patient_otp_consent', patientId: ids.patient }),
      getExisting: async () => [], // No existing medications
      getDoctor: async () => ({ orgLogins: [] }),
      medicationCheck: async () => ({
        hasInteraction: false,
        verificationIncomplete: true, // Insufficient for pairwise check, but single drug is resolved
        duplicateIngredients: [],
        unresolvedIngredients: [],
        unresolvedDrugs: [],
        statusMessage: 'Automated interaction checking is incomplete: at least two valid medications are required for pairwise interaction checking.'
      })
    });

    const req = {
      user: { id: ids.doctor, role: 'doctor' },
      headers: { 'x-patient-access': 'valid-proof' },
      body: { patientNic: nic, prescriptions: [{ drugName: 'Paracetamol 500mg Tablet', durationDays: 3 }] }
    };

    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();

    // Also assert assertMedicationResult does not throw for single resolved drug
    expect(() => {
      assertMedicationResult({
        hasInteraction: false,
        verificationIncomplete: true,
        duplicateIngredients: [],
        unresolvedIngredients: [],
        unresolvedDrugs: [],
        statusMessage: 'Automated interaction checking is incomplete: at least two valid medications are required for pairwise interaction checking.'
      }, 1);
    }).not.toThrow();
  });
});
