'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');

jest.mock('../src/services/pharmacyCommitGuard', () => ({
  claimPharmacyAuthorization: jest.fn(),
}));

jest.mock('../src/services/currentMedicationSafety', () => ({
  currentMedicationNames: jest.fn().mockResolvedValue([]),
  assertMedicationResult: jest.fn(),
}));

const { runTransaction, dispense, DispenseError } = require('../src/services/dispensingService');
const { claimPharmacyAuthorization } = require('../src/services/pharmacyCommitGuard');
const Pharmacy = require('../src/models/Pharmacy');
const PharmacyStaff = require('../src/models/PharmacyStaff');
const Prescription = require('../src/models/Prescription');
const Dispensing = require('../src/models/Dispensing');
const Patient = require('../src/models/Patient');

describe('Task P11-C: Pharmacy OTC Atomic Failures & Retry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('runTransaction retry on WriteConflict / Transient error', () => {
    function fakeSession() {
      return {
        startTransaction: jest.fn(),
        commitTransaction: jest.fn().mockResolvedValue(),
        abortTransaction: jest.fn().mockResolvedValue(),
        endSession: jest.fn().mockResolvedValue(),
        inTransaction: () => true
      };
    }

    test('retries on transient WriteConflict error (code 112) and succeeds on attempt 2', async () => {
      const s = fakeSession();
      const writeConflictError = new Error('WriteConflict error: write conflict');
      writeConflictError.code = 112;
      writeConflictError.codeName = 'WriteConflict';

      const work = jest.fn()
        .mockRejectedValueOnce(writeConflictError)
        .mockResolvedValueOnce({ success: true, receiptId: 'rec_123' });

      const result = await runTransaction(work, async () => s);
      expect(result).toEqual({ success: true, receiptId: 'rec_123' });
      expect(work).toHaveBeenCalledTimes(2);
      expect(s.abortTransaction).toHaveBeenCalledTimes(1);
      expect(s.commitTransaction).toHaveBeenCalledTimes(1);
    });

    test('retries on TransientTransactionError label and aborts failed attempt', async () => {
      const s = fakeSession();
      const transientError = Object.assign(new Error('TransientTransactionError'), {
        errorLabels: ['TransientTransactionError']
      });

      const work = jest.fn()
        .mockRejectedValueOnce(transientError)
        .mockResolvedValueOnce('retry_success');

      const result = await runTransaction(work, async () => s);
      expect(result).toBe('retry_success');
      expect(work).toHaveBeenCalledTimes(2);
      expect(s.abortTransaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('dispense idempotency and status validation', () => {
    const pharmacyId = new mongoose.Types.ObjectId();
    const staffId = new mongoose.Types.ObjectId();
    const patientId = new mongoose.Types.ObjectId();
    const patientNic = '199012345678';
    const idempotencyKey = 'key_otc_test_12345678';

    const mockStaff = {
      _id: staffId,
      pharmacyId,
      role: 'pharmacist',
      isActive: true,
      isVerified: true,
      mustChangePassword: false
    };

    const mockPharmacy = {
      _id: pharmacyId,
      name: 'MediSync Central Pharmacy',
      district: 'Colombo',
      isActive: true
    };

    const authorizedUser = {
      id: String(staffId),
      role: 'pharmacist'
    };

    let mockSession;

    beforeEach(() => {
      mockSession = {
        startTransaction: jest.fn(),
        commitTransaction: jest.fn().mockResolvedValue(),
        abortTransaction: jest.fn().mockResolvedValue(),
        endSession: jest.fn().mockResolvedValue(),
        inTransaction: () => true
      };
      jest.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession);
      claimPharmacyAuthorization.mockResolvedValue({ verified: true });

      jest.spyOn(PharmacyStaff, 'findById').mockReturnValue({
        session: jest.fn().mockResolvedValue(mockStaff)
      });
      jest.spyOn(Pharmacy, 'findById').mockReturnValue({
        session: jest.fn().mockResolvedValue(mockPharmacy)
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('replay with identical idempotency key and payload returns existing receipt with replay: true', async () => {
      const items = [{ name: 'Paracetamol 500mg', qty: 10, unit: 'tablets' }];
      const normalizedItems = [{ name: 'Paracetamol 500mg', qty: 10, inventoryItemId: null, unit: 'tablets', dosage: '', frequency: '', status: 'dispensed' }];
      const hash = crypto.createHash('sha256').update(JSON.stringify({
        staff: String(authorizedUser.id),
        nic: patientNic,
        ref: null,
        items: normalizedItems,
        alternative: false,
        reason: '',
        notes: '',
        consultationRef: ''
      })).digest('hex');

      const priorReceipt = {
        _id: new mongoose.Types.ObjectId(),
        idempotencyKey,
        requestHash: hash,
        pharmacyId: String(pharmacyId),
        receiptNumber: 'REC-2026-001',
        items: [{ drugName: 'Paracetamol 500mg', quantityDispensed: 10, unit: 'tablets' }]
      };

      jest.spyOn(Dispensing, 'findById').mockReturnValue({
        session: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(priorReceipt)
        })
      });

      const outcome = await dispense({
        user: authorizedUser,
        body: {
          patientNic,
          medications: items,
          idempotencyKey
        },
        otc: true
      });

      expect(outcome.replay).toBe(true);
      expect(outcome.receipt).toEqual(priorReceipt);
    });

    test('replay with same idempotency key but altered payload fails with 409 IDEMPOTENCY_CONFLICT', async () => {
      const items = [{ name: 'Paracetamol 500mg', qty: 10, unit: 'tablets' }];
      const priorReceipt = {
        _id: new mongoose.Types.ObjectId(),
        idempotencyKey,
        requestHash: 'different_hash_from_earlier_payload',
        pharmacyId: String(pharmacyId),
        receiptNumber: 'REC-2026-001'
      };

      jest.spyOn(Dispensing, 'findById').mockReturnValue({
        session: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(priorReceipt)
        })
      });

      await expect(dispense({
        user: authorizedUser,
        body: {
          patientNic,
          medications: items,
          idempotencyKey
        },
        otc: true
      })).rejects.toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT',
        status: 409
      });
    });

    test('dispensing an already-dispensed prescription fails with 400 ALREADY_DISPENSED', async () => {
      const rxId = new mongoose.Types.ObjectId();
      const items = [{ name: 'Amoxicillin 500mg', qty: 20, unit: 'capsules' }];

      jest.spyOn(Dispensing, 'findById').mockReturnValue({
        session: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null)
        })
      });

      const alreadyDispensedRx = {
        _id: rxId,
        patientNic,
        status: 'dispensed', // not pending, issued, or partially_dispensed
        expiresAt: new Date(Date.now() + 86400000),
        medications: [{ name: 'Amoxicillin 500mg' }]
      };

      jest.spyOn(Prescription, 'findOne').mockReturnValue({
        session: jest.fn().mockResolvedValue(alreadyDispensedRx)
      });

      await expect(dispense({
        user: authorizedUser,
        body: {
          patientNic,
          items,
          prescriptionId: String(rxId)
        },
        otc: false
      })).rejects.toMatchObject({
        code: 'ALREADY_DISPENSED',
        status: 400
      });
    });
  });
});
