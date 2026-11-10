'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');

jest.mock('../src/services/pharmacyCommitGuard', () => ({
  claimPharmacyAuthorization: jest.fn(),
}));

jest.mock('../src/services/currentMedicationSafety', () => ({
  currentMedicationNames: jest.fn().mockResolvedValue([]),
  assertMedicationResult: jest.fn(),
}));

const { claimPharmacyAuthorization } = require('../src/services/pharmacyCommitGuard');
const {
  computeClinicalFindings,
  computeFindingsHash,
  validateSafetyAcknowledgment,
} = require('../src/utils/clinicalSafetyValidator');
const { executeClinicalWrite } = require('../src/services/consultationCommandService');
const { generateLockedPrescription } = require('../src/utils/pdfGenerator');
const { dispense } = require('../src/services/dispensingService');
const Pharmacy = require('../src/models/Pharmacy');
const PharmacyStaff = require('../src/models/PharmacyStaff');
const Prescription = require('../src/models/Prescription');
const Dispensing = require('../src/models/Dispensing');
const Patient = require('../src/models/Patient');

describe('Task P10-A: Doctor Override Engine (Warn, Never Block)', () => {
  const oldPdfExport = process.env.PDF_EXPORT_ENABLED;

  beforeAll(() => {
    process.env.PDF_EXPORT_ENABLED = 'true';
  });

  afterAll(() => {
    process.env.PDF_EXPORT_ENABLED = oldPdfExport;
  });

  describe('Clinical Safety Validator Unit Tests', () => {
    test('detects allergy conflict as critical finding and requires reason', () => {
      const res = computeClinicalFindings({
        medications: [{ name: 'Amoxicillin', dosage: '500mg', frequency: 'TDS' }],
        patientAllergies: ['Penicillin'],
      });
      expect(res.requiresAcknowledgment).toBe(true);
      expect(res.requiresReason).toBe(true);
      expect(res.maxSeverity).toBe('critical');
      expect(res.findings.some((f) => f.type === 'allergy_conflict')).toBe(true);
      expect(typeof res.findingsHash).toBe('string');
      expect(res.findingsHash).toHaveLength(64);
    });

    test('detects duration limit exceeded as moderate finding', () => {
      const res = computeClinicalFindings({
        medications: [{ drugName: 'Paracetamol', dosage: '500mg', frequency: 'BD', durationDays: 14 }],
        patientAllergies: [],
      });
      expect(res.requiresAcknowledgment).toBe(true);
      expect(res.requiresReason).toBe(false); // moderate does not require reason
      expect(res.maxSeverity).toBe('moderate');
      expect(res.findings.some((f) => f.type === 'duration_limit_exceeded')).toBe(true);
    });

    test('validates acknowledgment and detects tampered findingsHash', () => {
      const res = computeClinicalFindings({
        medications: [{ name: 'Amoxicillin' }],
        patientAllergies: ['Penicillin'],
      });

      // Missing acknowledgment
      const noAck = validateSafetyAcknowledgment(null, res);
      expect(noAck.valid).toBe(false);
      expect(noAck.code).toBe('SAFETY_ACKNOWLEDGMENT_REQUIRED');

      // Tampered findings hash
      const badHash = validateSafetyAcknowledgment(
        { acknowledged: true, reason: 'Clinical justification on record', findingsHash: 'tampered_hash_value' },
        res
      );
      expect(badHash.valid).toBe(false);
      expect(badHash.code).toBe('SAFETY_ACKNOWLEDGMENT_REQUIRED');

      // Reason too short (< 5 chars)
      const shortReason = validateSafetyAcknowledgment(
        { acknowledged: true, reason: 'ok', findingsHash: res.findingsHash },
        res
      );
      expect(shortReason.valid).toBe(false);
      expect(shortReason.code).toBe('SAFETY_ACKNOWLEDGMENT_REQUIRED');

      // Valid acknowledgment
      const valid = validateSafetyAcknowledgment(
        { acknowledged: true, reason: 'Patient tested non-allergic via skin prick test', findingsHash: res.findingsHash },
        res
      );
      expect(valid.valid).toBe(true);
    });
  });

  describe('Consultation Command Execution with Safety Override', () => {
    function createMockEnvironment() {
      const savedPrescriptions = [];
      const savedConsultations = [];

      class MockPatient {
        constructor(doc) {
          Object.assign(this, doc);
        }
        static findById() {
          return {
            session: () => Promise.resolve(new MockPatient({
              _id: '507f191e810c19729de860ea',
              nic: '199012345678',
              fullName: 'Sunil Perera',
              allergies: ['Penicillin'],
              district: 'Colombo',
              decryptFieldsSync: () => {},
            })),
          };
        }
      }

      class MockConsultation {
        constructor(doc) {
          this._id = '607f191e810c19729de860eb';
          this.consultationId = 'CON-20261110-001';
          Object.assign(this, doc);
        }
        save() {
          savedConsultations.push(this);
          return Promise.resolve(this);
        }
      }

      class MockPrescription {
        constructor(doc) {
          this._id = '707f191e810c19729de860ec';
          this.prescriptionId = 'RX-20261110-001';
          Object.assign(this, doc);
        }
        static find() {
          const chain = {
            limit: () => chain,
            session: () => Promise.resolve([]),
            then: (resolve) => resolve([]),
          };
          return chain;
        }
        save() {
          savedPrescriptions.push(this);
          return Promise.resolve(this);
        }
      }

      class MockLabTest {
        constructor(doc) {
          this._id = '807f191e810c19729de860ed';
          Object.assign(this, doc);
        }
        save() {
          return Promise.resolve(this);
        }
      }

      const mockCommand = jest.fn(async ({ write }) => {
        const session = {};
        const outcome = await write(session);
        return { replayed: false, commandId: 'cmd_123', result: outcome.result };
      });

      return {
        models: {
          Patient: MockPatient,
          Consultation: MockConsultation,
          Prescription: MockPrescription,
          LabTest: MockLabTest,
        },
        mockCommand,
        savedPrescriptions,
        savedConsultations,
      };
    }

    test('rejects with ALLERGY_CONFLICT when prescribed allergy drug lacks acknowledgment', async () => {
      const env = createMockEnvironment();
      const req = {
        user: { id: '507f191e810c19729de860ee', role: 'doctor' },
        clinicalAuthorization: { patientId: '507f191e810c19729de860ea' },
        headers: { 'idempotency-key': 'idemp_key_123456789012' },
        body: {
          patientNic: '199012345678',
          diagnosis: 'Bacterial Pharyngitis',
          prescriptions: [{ name: 'Amoxicillin', dosage: '500mg', frequency: 'TDS', durationDays: 5 }],
        },
      };

      await expect(
        executeClinicalWrite(req, {
          command: env.mockCommand,
          models: env.models,
        })
      ).rejects.toThrow('ALLERGY_CONFLICT');
    });

    test('admits prescription when valid safetyAcknowledgment is provided and persists safetyOverride', async () => {
      const env = createMockEnvironment();
      const findings = computeClinicalFindings({
        medications: [{ name: 'Amoxicillin', dosage: '500mg', frequency: 'TDS', durationDays: 5 }],
        patientAllergies: ['Penicillin'],
      });

      const req = {
        user: { id: '507f191e810c19729de860ee', role: 'doctor' },
        clinicalAuthorization: { patientId: '507f191e810c19729de860ea' },
        headers: { 'idempotency-key': 'idemp_key_123456789012' },
        body: {
          patientNic: '199012345678',
          diagnosis: 'Bacterial Pharyngitis',
          prescriptions: [{ name: 'Amoxicillin', dosage: '500mg', frequency: 'TDS', durationDays: 5 }],
          safetyAcknowledgment: {
            acknowledged: true,
            reason: 'Patient tested negative for penicillin hypersensitivity on skin test',
            findingsHash: findings.findingsHash,
          },
        },
      };

      const outcome = await executeClinicalWrite(req, {
        command: env.mockCommand,
        models: env.models,
      });

      expect(outcome.result.consultationId).toBeDefined();
      expect(env.savedPrescriptions).toHaveLength(1);
      const rx = env.savedPrescriptions[0];
      expect(rx.safetyOverride).toBeDefined();
      expect(rx.safetyOverride.acknowledged).toBe(true);
      expect(rx.safetyOverride.reason).toContain('tested negative');
      expect(rx.safetyOverride.findingTypes).toContain('allergy_conflict');
    });

    test('rejects with SAFETY_ACKNOWLEDGMENT_REQUIRED when findingsHash does not match computed findings', async () => {
      const env = createMockEnvironment();
      const req = {
        user: { id: '507f191e810c19729de860ee', role: 'doctor' },
        clinicalAuthorization: { patientId: '507f191e810c19729de860ea' },
        headers: { 'idempotency-key': 'idemp_key_123456789012' },
        body: {
          patientNic: '199012345678',
          diagnosis: 'Bacterial Pharyngitis',
          prescriptions: [{ name: 'Amoxicillin', dosage: '500mg', frequency: 'TDS', durationDays: 5 }],
          safetyAcknowledgment: {
            acknowledged: true,
            reason: 'Prescriber assumes full clinical responsibility',
            findingsHash: 'tampered_hash_that_does_not_match',
          },
        },
      };

      await expect(
        executeClinicalWrite(req, {
          command: env.mockCommand,
          models: env.models,
        })
      ).rejects.toThrow('SAFETY_ACKNOWLEDGMENT_REQUIRED');
    });
  });

  describe('Downstream PDF Rendering of Doctor Safety Override', () => {
    test('generates locked prescription PDF with override notice when safetyOverride is present', async () => {
      const { PDFPage } = require('pdf-lib');
      const rendered = [];
      const originalDrawText = PDFPage.prototype.drawText;
      const spy = jest.spyOn(PDFPage.prototype, 'drawText').mockImplementation(function (text, options) {
        rendered.push(text);
        return originalDrawText.call(this, text, options);
      });

      const rxWithOverride = {
        drugName: 'Amoxicillin',
        dosage: '500mg',
        frequency: 'TDS',
        durationDays: 5,
        safetyOverride: {
          acknowledged: true,
          findingTypes: ['allergy_conflict'],
        },
      };

      try {
        const pdfBuffer = await generateLockedPrescription(
          [rxWithOverride],
          'Sunil Perera',
          '199012345678',
          '1990-01-01',
          'Dr. Chamod Alwis',
          'Hospital Consultation',
          'Male',
          [],
          null,
          'CON-20261110-001',
          { unlockForTest: true }
        );

        expect(pdfBuffer).toBeDefined();
        expect(pdfBuffer.length).toBeGreaterThan(500);
        expect(rendered.some((t) => t.includes('Doctor acknowledged safety warnings: allergy_conflict'))).toBe(true);
        expect(rendered.some((t) => t.includes('tested negative'))).toBe(false);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('Pharmacist Allergy Override & Duplicate Dispense Hard Stop', () => {
    const pharmacyId = new mongoose.Types.ObjectId();
    const staffId = new mongoose.Types.ObjectId();
    const patientId = new mongoose.Types.ObjectId();
    const patientNic = '199012345678';
    const authorizedUser = { id: String(staffId), role: 'pharmacist' };

    beforeEach(() => {
      claimPharmacyAuthorization.mockResolvedValue({ patientId: String(patientId) });

      const fakeSession = {
        startTransaction: jest.fn(),
        commitTransaction: jest.fn().mockResolvedValue(),
        abortTransaction: jest.fn().mockResolvedValue(),
        endSession: jest.fn().mockResolvedValue(),
        inTransaction: () => true,
      };

      jest.spyOn(mongoose, 'startSession').mockResolvedValue(fakeSession);

      jest.spyOn(PharmacyStaff, 'findById').mockReturnValue({
        session: jest.fn().mockReturnValue({
          _id: staffId,
          pharmacyId,
          fullName: 'Saman Silva',
          role: 'pharmacist',
          isActive: true,
          isVerified: true,
          mustChangePassword: false,
        }),
      });

      jest.spyOn(Pharmacy, 'findById').mockReturnValue({
        session: jest.fn().mockReturnValue({
          _id: pharmacyId,
          name: 'City Care Pharmacy',
          isActive: true,
          inventory: [],
        }),
      });

      jest.spyOn(Patient, 'findOne').mockReturnValue({
        session: jest.fn().mockReturnValue({
          _id: patientId,
          nic: patientNic,
          allergies: ['Penicillin'],
        }),
      });

      jest.spyOn(require('../src/services/currentMedicationSafety'), 'currentMedicationNames').mockResolvedValue([]);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('pharmacist checkout rejects with ALLERGY_CONFLICT when no override is provided', async () => {
      jest.spyOn(Dispensing, 'findById').mockReturnValue({
        session: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      });

      await expect(
        dispense({
          user: authorizedUser,
          body: {
            patientNic,
            medications: [{ name: 'Amoxicillin 500mg', qty: 10, unit: 'capsules' }],
            idempotencyKey: 'idemp_otc_allergy_001',
          },
          otc: true,
          skipAuditProjection: true,
        })
      ).rejects.toMatchObject({
        code: 'ALLERGY_CONFLICT',
      });
    });

    test('pharmacist checkout succeeds when explicit allergyOverride is on record', async () => {
      jest.spyOn(Dispensing, 'findById').mockReturnValue({
        session: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      });

      let savedReceipt = null;
      jest.spyOn(Dispensing.prototype, 'save').mockImplementation(function () {
        savedReceipt = this;
        return Promise.resolve(this);
      });

      jest.spyOn(Prescription.prototype, 'save').mockResolvedValue({});

      const outcome = await dispense({
        user: authorizedUser,
        body: {
          patientNic,
          medications: [{ name: 'Amoxicillin 500mg', qty: 10, unit: 'capsules' }],
          idempotencyKey: 'idemp_otc_allergy_002',
          allergyOverride: {
            acknowledged: true,
            reason: 'Prescriber confirmed negative tolerance test; patient counseled',
          },
        },
        otc: true,
        skipAuditProjection: true,
      });

      expect(outcome.receipt).toBeDefined();
      expect(savedReceipt.pharmacistOverride).toBeDefined();
      expect(savedReceipt.pharmacistOverride.acknowledged).toBe(true);
      expect(savedReceipt.pharmacistOverride.reason).toContain('Prescriber confirmed');
    });

    test('duplicate-dispense rule remains an absolute hard stop (ALREADY_DISPENSED)', async () => {
      const rxId = new mongoose.Types.ObjectId();
      jest.spyOn(Dispensing, 'findById').mockReturnValue({
        session: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      });

      jest.spyOn(Prescription, 'findOne').mockReturnValue({
        session: jest.fn().mockReturnValue({
          _id: rxId,
          patientNic,
          status: 'dispensed', // Already dispensed
          expiresAt: new Date(Date.now() + 86400000),
          medications: [{ name: 'Paracetamol 500mg' }],
        }),
      });

      await expect(
        dispense({
          user: authorizedUser,
          body: {
            patientNic,
            items: [{ name: 'Paracetamol 500mg', qty: 10, unit: 'tablets' }],
            prescriptionId: String(rxId),
            allergyOverride: { acknowledged: true, reason: 'Attempted duplicate dispense' },
          },
          otc: false,
          skipAuditProjection: true,
        })
      ).rejects.toMatchObject({
        code: 'ALREADY_DISPENSED',
        status: 400,
      });
    });
  });
});
