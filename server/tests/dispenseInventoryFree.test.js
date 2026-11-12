'use strict';

const mongoose = require('mongoose');

jest.mock('../src/services/pharmacyCommitGuard', () => ({
  claimPharmacyAuthorization: jest.fn().mockResolvedValue({ patientId: '507f1f77bcf86cd799439001' }),
}));

jest.mock('../src/services/currentMedicationSafety', () => ({
  currentMedicationNames: jest.fn().mockResolvedValue([]),
  assertMedicationResult: jest.fn((result, totalCount) => {
    if (result && result.hasInteraction) {
      throw new Error('MEDICATION_REVIEW_REQUIRED');
    }
  }),
}));

const { dispense } = require('../src/services/dispensingService');
const { getInventory } = require('../src/controllers/pharmacyController');
const Pharmacy = require('../src/models/Pharmacy');
const PharmacyStaff = require('../src/models/PharmacyStaff');
const Prescription = require('../src/models/Prescription');
const Dispensing = require('../src/models/Dispensing');
const Patient = require('../src/models/Patient');

describe('Fix A: Pharmacy Dispense without Inventory & Safety Review Gate', () => {
  const staffId = new mongoose.Types.ObjectId();
  const pharmacyId = new mongoose.Types.ObjectId();
  const patientId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439001');
  const patientNic = '199012345678';
  const authorizedUser = { id: String(staffId), role: 'pharmacist' };

  beforeEach(() => {
    jest.clearAllMocks();

    const fakeSession = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn().mockResolvedValue(),
      abortTransaction: jest.fn().mockResolvedValue(),
      endSession: jest.fn().mockResolvedValue(),
      inTransaction: () => true,
    };

    jest.spyOn(mongoose, 'startSession').mockResolvedValue(fakeSession);

    jest.spyOn(PharmacyStaff, 'findById').mockReturnValue({
      session: jest.fn().mockResolvedValue({
        _id: staffId,
        pharmacyId,
        role: 'pharmacist',
        isActive: true,
        isVerified: true,
        mustChangePassword: false,
        fullName: 'Pharmacist Perera',
      }),
    });

    jest.spyOn(Pharmacy, 'findById').mockReturnValue({
      session: jest.fn().mockResolvedValue({
        _id: pharmacyId,
        name: 'MediSync Test Pharmacy',
        isActive: true,
        inventory: [], // Zero inventory
      }),
    });

    jest.spyOn(Patient, 'findOne').mockReturnValue({
      session: jest.fn().mockResolvedValue({
        _id: patientId,
        nic: patientNic,
        fullName: 'Test Patient',
        allergies: [],
      }),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('GET /api/pharmacy/inventory returns 410 Gone with decommissioning documentation', async () => {
    const req = { user: authorizedUser };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    await getInventory(req, res);
    expect(res.status).toHaveBeenCalledWith(410);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'INVENTORY_MANAGEMENT_DECOMMISSIONED',
        message: expect.stringContaining('does not provide pharmacy inventory management'),
      })
    );
  });

  test('dispense succeeds with zero inventory in pharmacy stock', async () => {
    const rxId = new mongoose.Types.ObjectId();
    jest.spyOn(Dispensing, 'findById').mockReturnValue({
      session: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    });

    jest.spyOn(Prescription, 'findOne').mockReturnValue({
      session: jest.fn().mockResolvedValue({
        _id: rxId,
        patientNic,
        patientId,
        status: 'issued',
        expiresAt: new Date(Date.now() + 86400000),
        medications: [{ name: 'Amoxicillin 500mg', dosage: '500mg', durationDays: 5 }],
      }),
    });

    jest.spyOn(Prescription, 'updateOne').mockResolvedValue({ modifiedCount: 1 });
    jest.spyOn(Dispensing.prototype, 'save').mockResolvedValue({});

    const outcome = await dispense({
      user: authorizedUser,
      body: {
        prescriptionId: String(rxId),
        patientNic,
        items: [{ name: 'Amoxicillin 500mg', qty: 15, unit: 'capsules' }],
      },
      skipAuditProjection: true,
    });

    expect(outcome.receipt).toBeDefined();
    expect(outcome.receipt.items[0].drugName).toBe('Amoxicillin 500mg');
    expect(outcome.receipt.items[0].quantityDispensed).toBe(15);
  });

  test('duplicate dispense is blocked with ALREADY_DISPENSED', async () => {
    const rxId = new mongoose.Types.ObjectId();
    jest.spyOn(Dispensing, 'findById').mockReturnValue({
      session: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    });

    // Prescription is already dispensed
    jest.spyOn(Prescription, 'findOne').mockReturnValue({
      session: jest.fn().mockResolvedValue({
        _id: rxId,
        patientNic,
        patientId,
        status: 'dispensed',
        expiresAt: new Date(Date.now() + 86400000),
        medications: [{ name: 'Amoxicillin 500mg' }],
      }),
    });

    await expect(
      dispense({
        user: authorizedUser,
        body: {
          prescriptionId: String(rxId),
          patientNic,
          items: [{ name: 'Amoxicillin 500mg', qty: 15 }],
        },
        skipAuditProjection: true,
      })
    ).rejects.toMatchObject({
      code: 'ALREADY_DISPENSED',
    });
  });

  test('dispense without safety checkbox is blocked when warnings exist, but succeeds when checkbox is checked', async () => {
    const rxId = new mongoose.Types.ObjectId();
    jest.spyOn(Dispensing, 'findById').mockReturnValue({
      session: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    });

    jest.spyOn(Prescription, 'findOne').mockReturnValue({
      session: jest.fn().mockResolvedValue({
        _id: rxId,
        patientNic,
        patientId,
        status: 'issued',
        expiresAt: new Date(Date.now() + 86400000),
        medications: [{ name: 'Warfarin 5mg' }],
      }),
    });

    const { assertMedicationResult } = require('../src/services/currentMedicationSafety');

    // 1. Without safety acknowledgment checkbox: blocked with 409
    assertMedicationResult.mockImplementationOnce(() => {
      const err = new Error('MEDICATION_REVIEW_REQUIRED');
      throw err;
    });

    await expect(
      dispense({
        user: authorizedUser,
        body: {
          prescriptionId: String(rxId),
          patientNic,
          items: [{ name: 'Warfarin 5mg', qty: 10 }],
          safetyAcknowledgment: null,
        },
        skipAuditProjection: true,
      })
    ).rejects.toMatchObject({
      code: 'MEDICATION_REVIEW_REQUIRED',
      status: 409,
    });

    // 2. With safety acknowledgment checkbox checked: succeeds!
    jest.spyOn(Prescription, 'updateOne').mockResolvedValue({ modifiedCount: 1 });
    let savedReceipt = null;
    jest.spyOn(Dispensing.prototype, 'save').mockImplementation(function () {
      savedReceipt = this;
      return Promise.resolve(this);
    });

    assertMedicationResult.mockImplementationOnce(() => {
      const err = new Error('MEDICATION_REVIEW_REQUIRED');
      throw err;
    });

    const outcome = await dispense({
      user: authorizedUser,
      body: {
        prescriptionId: String(rxId),
        patientNic,
        items: [{ name: 'Warfarin 5mg', qty: 10 }],
        safetyAcknowledgment: { acknowledged: true },
      },
      skipAuditProjection: true,
    });

    expect(outcome.receipt).toBeDefined();
    expect(savedReceipt.pharmacistOverride).toBeDefined();
    expect(savedReceipt.pharmacistOverride.acknowledged).toBe(true);
  });
});
