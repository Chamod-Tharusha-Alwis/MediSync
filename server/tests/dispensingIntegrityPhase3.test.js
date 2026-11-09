'use strict';

const mongoose = require('mongoose');

// Mock pharmacy commit guard to simulate verified patient consent and session
jest.mock('../src/services/pharmacyCommitGuard', () => ({
  claimPharmacyAuthorization: jest.fn(),
}));

// Mock current medication safety to prevent unmocked database queries
jest.mock('../src/services/currentMedicationSafety', () => ({
  currentMedicationNames: jest.fn().mockResolvedValue([]),
  assertMedicationResult: jest.fn(),
}));

const { claimPharmacyAuthorization } = require('../src/services/pharmacyCommitGuard');
const { dispense, DispenseError, validateItems } = require('../src/services/dispensingService');
const { computeReleaseSummary, groupDispensingHistoryByReceipt } = require('../src/services/releaseSummaryService');
const Prescription = require('../src/models/Prescription');
const Dispensing = require('../src/models/Dispensing');
const Pharmacy = require('../src/models/Pharmacy');
const PharmacyStaff = require('../src/models/PharmacyStaff');
const Patient = require('../src/models/Patient');

describe('Phase 3 — Medicine Release Data Integrity & Double-Dispense Lockout Suite', () => {
  const pharmacyId = new mongoose.Types.ObjectId();
  const staffId = new mongoose.Types.ObjectId();
  const patientId = new mongoose.Types.ObjectId();
  const consultationId = new mongoose.Types.ObjectId();
  const patientNic = '199512345678';

  const mockStaff = {
    _id: staffId,
    pharmacyId,
    role: 'pharmacist',
    fullName: 'Perera, B.Pharm',
    isActive: true,
    isVerified: true,
    mustChangePassword: false,
  };

  const mockPharmacy = {
    _id: pharmacyId,
    name: 'National Wellness Pharmacy',
    district: 'Colombo',
    isActive: true,
    inventory: [],
  };

  const mockPatient = {
    _id: patientId,
    nic: patientNic,
    fullName: 'Anura Bandara',
    allergies: [],
  };

  const authorizedUser = {
    id: String(staffId),
    role: 'pharmacist',
  };

  function createMockSession() {
    return {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn().mockResolvedValue(),
      abortTransaction: jest.fn().mockResolvedValue(),
      endSession: jest.fn().mockResolvedValue(),
      inTransaction: jest.fn().mockReturnValue(false),
    };
  }

  beforeEach(() => {
    claimPharmacyAuthorization.mockResolvedValue({ patientId: String(patientId) });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Validation and Item Status Helper', () => {
    test('validateItems accepts standard items and sets dispensed status by default', () => {
      const items = validateItems([{ name: 'Paracetamol', qty: 20, unit: 'tablets', dosage: '500mg' }]);
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('Paracetamol');
      expect(items[0].qty).toBe(20);
      expect(items[0].status).toBe('dispensed');
    });

    test('validateItems rejects partial status when isPartial is false', () => {
      expect(() => {
        validateItems([{ name: 'Amoxicillin', qty: 10, status: 'partial' }], false);
      }).toThrow('Partial dispensing is not supported by this full-prescription checkout.');
    });

    test('validateItems permits partial status when isPartial is true', () => {
      const items = validateItems([{ name: 'Amoxicillin', qty: 10, status: 'partial' }], true);
      expect(items).toHaveLength(1);
      expect(items[0].status).toBe('partial');
    });
  });

  describe('2. Shared Release Summary Helper (computeReleaseSummary & groupDispensingHistoryByReceipt)', () => {
    test('computeReleaseSummary returns partially_released when a prescription is partially_dispensed', async () => {
      const rx1 = {
        _id: new mongoose.Types.ObjectId(),
        prescriptionId: 'RX-PART-01',
        consultationId,
        drugName: 'Metformin',
        dosage: '500mg',
        status: 'partially_dispensed',
        dispensedByPharmacist: 'Perera, B.Pharm',
        pharmacyName: 'National Wellness Pharmacy',
        dispensedAt: new Date('2026-11-09T09:00:00Z'),
      };
      const rx2 = {
        _id: new mongoose.Types.ObjectId(),
        prescriptionId: 'RX-PART-02',
        consultationId,
        drugName: 'Atorvastatin',
        dosage: '20mg',
        status: 'pending',
      };

      jest.spyOn(Prescription, 'find').mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue([rx1, rx2]),
      });

      jest.spyOn(Dispensing, 'find').mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              receiptNumber: 'REC-001-PART',
              prescriptionId: rx1._id,
              pharmacyName: 'National Wellness Pharmacy',
              pharmacistName: 'Perera, B.Pharm',
              dispensedAt: new Date('2026-11-09T09:00:00Z'),
              items: [{ drugName: 'Metformin', quantityDispensed: 15, status: 'partial' }],
            },
          ]),
        }),
      });

      const summary = await computeReleaseSummary(consultationId);
      expect(summary.overallStatus).toBe('partially_released');
      expect(summary.items).toHaveLength(2);
      expect(summary.items[0].status).toBe('partially_released');
      expect(summary.items[0].released).toBe(false);
      expect(summary.items[0].releasedBy.name).toBe('Perera, B.Pharm');
      expect(summary.items[1].status).toBe('not_released');
    });

    test('computeReleaseSummary defaults to "Not recorded" for old legacy records without pharmacist/pharmacy', async () => {
      const legacyRx = {
        _id: new mongoose.Types.ObjectId(),
        prescriptionId: 'RX-LEGACY-01',
        consultationId,
        drugName: 'Aspirin',
        dosage: '75mg',
        status: 'pending',
      };

      jest.spyOn(Prescription, 'find').mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue([legacyRx]),
      });

      jest.spyOn(Dispensing, 'find').mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      });

      const summary = await computeReleaseSummary(consultationId);
      expect(summary.overallStatus).toBe('not_released');
      expect(summary.items[0].releasedBy.name).toBe('Not recorded');
      expect(summary.items[0].pharmacy.name).toBe('Not recorded');
    });

    test('groupDispensingHistoryByReceipt normalizes receipt facts matching verify summary', () => {
      const records = [
        {
          receiptNumber: 'REC-UNIFIED-100',
          pharmacyName: 'City Center Dispensary',
          pharmacistName: 'Kamal Silva',
          patientNic: '199512345678',
          createdAt: new Date('2026-11-09T10:00:00Z'),
          items: [
            { drugName: 'Salbutamol Inhaler', dosage: '100mcg', quantityDispensed: 1, unit: 'inhaler', status: 'dispensed' },
          ],
        },
      ];

      const grouped = groupDispensingHistoryByReceipt(records);
      expect(grouped).toHaveLength(1);
      expect(grouped[0].receiptNumber).toBe('REC-UNIFIED-100');
      expect(grouped[0].pharmacyName).toBe('City Center Dispensary');
      expect(grouped[0].pharmacistName).toBe('Kamal Silva');
      expect(grouped[0].medications[0].status).toBe('dispensed');
    });
  });

  describe('3. Double-Dispensing Lockout & State Transitions', () => {
    test('dispensing rejects already-dispensed prescription with ALREADY_DISPENSED error', async () => {
      const rxId = new mongoose.Types.ObjectId();
      const dispensedRx = {
        _id: rxId,
        prescriptionId: 'RX-DISPENSED-99',
        patientNic,
        status: 'dispensed', // already dispensed
        expiresAt: new Date(Date.now() + 86400000),
        drugName: 'Paracetamol',
        medications: [{ name: 'Paracetamol' }],
      };

      const mockSession = createMockSession();
      jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);
      jest.spyOn(PharmacyStaff, 'findById').mockReturnValue({ session: jest.fn().mockResolvedValue(mockStaff) });
      jest.spyOn(Pharmacy, 'findById').mockReturnValue({ session: jest.fn().mockResolvedValue(mockPharmacy) });
      jest.spyOn(Prescription, 'findOne').mockReturnValue({ session: jest.fn().mockResolvedValue(dispensedRx) });
      jest.spyOn(Dispensing, 'findById').mockReturnValue({
        session: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      });

      await expect(
        dispense({
          user: authorizedUser,
          body: {
            patientNic,
            items: [{ name: 'Paracetamol', qty: 10 }],
          },
          prescriptionRef: String(rxId),
          authorization: { consentToken: 'valid-token' },
        })
      ).rejects.toMatchObject({
        code: 'ALREADY_DISPENSED',
        message: 'Prescription is not eligible for dispensing.',
      });
    });

    test('dispensing allows transitioning partially_dispensed to dispensed', async () => {
      const rxId = new mongoose.Types.ObjectId();
      const partialRx = {
        _id: rxId,
        prescriptionId: 'RX-PART-TRANS',
        patientNic,
        patientId,
        status: 'partially_dispensed', // already partial
        expiresAt: new Date(Date.now() + 86400000),
        drugName: 'Paracetamol',
        medications: [{ name: 'Paracetamol' }],
      };

      const mockSession = createMockSession();
      jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);
      jest.spyOn(PharmacyStaff, 'findById').mockReturnValue({ session: jest.fn().mockResolvedValue(mockStaff) });
      jest.spyOn(Pharmacy, 'findById').mockReturnValue({ session: jest.fn().mockResolvedValue(mockPharmacy) });
      jest.spyOn(Prescription, 'findOne').mockReturnValue({ session: jest.fn().mockResolvedValue(partialRx) });
      jest.spyOn(Dispensing, 'findById').mockReturnValue({
        session: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      });
      jest.spyOn(Patient, 'findOne').mockReturnValue({ session: jest.fn().mockResolvedValue(mockPatient) });

      let capturedUpdate = null;
      jest.spyOn(Prescription, 'updateOne').mockImplementation((filter, update) => {
        capturedUpdate = update;
        return Promise.resolve({ modifiedCount: 1 });
      });

      let capturedReceipt = null;
      jest.spyOn(Dispensing.prototype, 'save').mockImplementation(function () {
        capturedReceipt = this;
        return Promise.resolve(this);
      });

      const outcome = await dispense({
        user: authorizedUser,
        body: {
          patientNic,
          items: [{ name: 'Paracetamol', qty: 10 }],
          isAlternativeDispensed: true,
          alternativeDetails: 'Generic substitution approved',
        },
        prescriptionRef: String(rxId),
        authorization: { consentToken: 'valid-token' },
        skipAuditProjection: true,
      });

      expect(outcome.replay).toBe(false);
      expect(capturedUpdate.$set.status).toBe('dispensed');
      expect(capturedUpdate.$set.dispensedByPharmacist).toBe('Perera, B.Pharm');
      expect(capturedUpdate.$set.pharmacyName).toBe('National Wellness Pharmacy');
      expect(capturedUpdate.$set.isAlternativeDispensed).toBe(true);
      expect(capturedUpdate.$set.alternativeDetails).toBe('Generic substitution approved');

      expect(capturedReceipt.pharmacyName).toBe('National Wellness Pharmacy');
      expect(capturedReceipt.pharmacistName).toBe('Perera, B.Pharm');
      expect(capturedReceipt.isAlternativeDispensed).toBe(true);
      expect(capturedReceipt.alternativeDetails).toBe('Generic substitution approved');
    });

    test('partial dispense sets status to partially_dispensed and stores partial item status', async () => {
      const rxId = new mongoose.Types.ObjectId();
      const pendingRx = {
        _id: rxId,
        prescriptionId: 'RX-PEND-PART',
        patientNic,
        patientId,
        status: 'pending',
        expiresAt: new Date(Date.now() + 86400000),
        drugName: 'Paracetamol',
        medications: [{ name: 'Paracetamol' }],
      };

      const mockSession = createMockSession();
      jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);
      jest.spyOn(PharmacyStaff, 'findById').mockReturnValue({ session: jest.fn().mockResolvedValue(mockStaff) });
      jest.spyOn(Pharmacy, 'findById').mockReturnValue({ session: jest.fn().mockResolvedValue(mockPharmacy) });
      jest.spyOn(Prescription, 'findOne').mockReturnValue({ session: jest.fn().mockResolvedValue(pendingRx) });
      jest.spyOn(Dispensing, 'findById').mockReturnValue({
        session: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      });
      jest.spyOn(Patient, 'findOne').mockReturnValue({ session: jest.fn().mockResolvedValue(mockPatient) });

      let capturedUpdate = null;
      jest.spyOn(Prescription, 'updateOne').mockImplementation((filter, update) => {
        capturedUpdate = update;
        return Promise.resolve({ modifiedCount: 1 });
      });

      let capturedReceipt = null;
      jest.spyOn(Dispensing.prototype, 'save').mockImplementation(function () {
        capturedReceipt = this;
        return Promise.resolve(this);
      });

      const outcome = await dispense({
        user: authorizedUser,
        body: {
          patientNic,
          isPartialDispense: true,
          items: [{ name: 'Paracetamol', qty: 5, status: 'partial' }],
        },
        prescriptionRef: String(rxId),
        authorization: { consentToken: 'valid-token' },
        skipAuditProjection: true,
      });

      expect(outcome.replay).toBe(false);
      expect(capturedUpdate.$set.status).toBe('partially_dispensed');
      expect(capturedReceipt.items[0].status).toBe('partial');
      expect(capturedReceipt.pharmacyName).toBe('National Wellness Pharmacy');
      expect(capturedReceipt.pharmacistName).toBe('Perera, B.Pharm');
    });
  });
});
