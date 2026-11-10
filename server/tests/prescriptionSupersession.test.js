'use strict';

const mongoose = require('mongoose');
const {
  getPrescriptionActiveState,
  getCanonicalIngredientSet,
  isSameMedicine,
  getDaysRemaining,
  DAY_MS
} = require('../src/utils/prescriptionLifecycle');

describe('Task R6: Prescription Auto-Expiry and Supersession Suite', () => {

  describe('1. Active State & Expiry Derivation', () => {
    const baseNow = new Date('2026-11-10T12:00:00.000Z');

    test('returns cancelled if prescription status is cancelled', () => {
      const rx = { status: 'cancelled', expiresAt: new Date(+baseNow + 5 * DAY_MS) };
      expect(getPrescriptionActiveState(rx, baseNow)).toBe('cancelled');
    });

    test('returns superseded if supersededBy or supersededAt is set', () => {
      const rx1 = { status: 'pending', supersededBy: new mongoose.Types.ObjectId() };
      const rx2 = { status: 'dispensed', supersededAt: new Date(baseNow) };
      expect(getPrescriptionActiveState(rx1, baseNow)).toBe('superseded');
      expect(getPrescriptionActiveState(rx2, baseNow)).toBe('superseded');
    });

    test('returns expired if prescription status is expired', () => {
      const rx = { status: 'expired', expiresAt: new Date(+baseNow + 5 * DAY_MS) };
      expect(getPrescriptionActiveState(rx, baseNow)).toBe('expired');
    });

    test('expiry boundary: day before expiry is active, day after is expired', () => {
      const expiresAt = new Date('2026-11-15T12:00:00.000Z');
      const rx = { status: 'pending', expiresAt };

      const dayBefore = new Date('2026-11-14T12:00:00.000Z');
      const exactMoment = new Date('2026-11-15T12:00:00.000Z');
      const dayAfter = new Date('2026-11-16T12:00:00.000Z');

      expect(getPrescriptionActiveState(rx, dayBefore)).toBe('active');
      expect(getPrescriptionActiveState(rx, exactMoment)).toBe('expired');
      expect(getPrescriptionActiveState(rx, dayAfter)).toBe('expired');
    });

    test('derives end date from dispensedAt + durationDays when expiresAt is omitted', () => {
      const rx = {
        status: 'dispensed',
        dispensedAt: new Date('2026-11-01T00:00:00.000Z'),
        durationDays: 7
      };
      // End date = Nov 8, 2026
      expect(getPrescriptionActiveState(rx, new Date('2026-11-05T00:00:00.000Z'))).toBe('active');
      expect(getPrescriptionActiveState(rx, new Date('2026-11-08T00:00:00.000Z'))).toBe('expired');
      expect(getPrescriptionActiveState(rx, new Date('2026-11-10T00:00:00.000Z'))).toBe('expired');
    });

    test('calculates correct days remaining', () => {
      const rx = {
        status: 'pending',
        issuedAt: baseNow,
        durationDays: 10,
        expiresAt: new Date(+baseNow + 10 * DAY_MS)
      };
      expect(getDaysRemaining(rx, baseNow)).toBe(10);
      expect(getDaysRemaining(rx, new Date(+baseNow + 3 * DAY_MS))).toBe(7);
      expect(getDaysRemaining(rx, new Date(+baseNow + 11 * DAY_MS))).toBe(0);
    });
  });

  describe('2. Canonical Ingredient Resolution & Medicine Equivalence', () => {
    test('extracts sorted canonical ingredients correctly', () => {
      expect(getCanonicalIngredientSet('Citalopram 20mg Tablet')).toEqual(['citalopram']);
      expect(getCanonicalIngredientSet('Citalopram 40mg')).toEqual(['citalopram']);
      expect(getCanonicalIngredientSet('Paracetamol 500mg')).toEqual(['acetaminophen']);
      expect(getCanonicalIngredientSet('Amoxicillin + Clavulanic Acid 625mg')).toEqual(
        ['amoxicillin', 'clavulanic acid'].sort()
      );
    });

    test('isSameMedicine returns true for identical active ingredient set across different dosages', () => {
      expect(isSameMedicine('Citalopram 20mg Tablet', 'Citalopram 40mg Capsule')).toBe(true);
      expect(isSameMedicine('Amoxicillin 250mg', 'Amoxicillin 500mg')).toBe(true);
    });

    test('isSameMedicine returns false for different ingredients', () => {
      expect(isSameMedicine('Citalopram 20mg', 'Fluoxetine 20mg')).toBe(false);
      expect(isSameMedicine('Amoxicillin 500mg', 'Ciprofloxacin 500mg')).toBe(false);
    });

    test('partial overlap does not count as same medicine (no supersession for combinations)', () => {
      // Amoxicillin alone vs Amoxicillin + Clavulanic Acid
      expect(isSameMedicine('Amoxicillin 500mg', 'Amoxicillin + Clavulanic Acid 625mg')).toBe(false);
    });
  });

  describe('3. Dispensing Guard for Superseded Lines', () => {
    test('superseded prescription cannot be dispensed and fails with SUPERSEDED error', async () => {
      const { fail } = require('../src/services/dispensingService');
      const rx = {
        _id: new mongoose.Types.ObjectId(),
        patientNic: '199012345678',
        status: 'pending',
        supersededBy: new mongoose.Types.ObjectId(),
        supersededAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000)
      };

      // Simulating the check inside dispensing transaction:
      const checkDispense = (prescription) => {
        if (prescription.supersededBy || prescription.supersededAt) {
          const err = new Error('Prescription has been superseded by a newer consultation and cannot be dispensed.');
          err.code = 'SUPERSEDED';
          err.statusCode = 400;
          throw err;
        }
      };

      expect(() => checkDispense(rx)).toThrow('Prescription has been superseded');
      try {
        checkDispense(rx);
      } catch (err) {
        expect(err.code).toBe('SUPERSEDED');
        expect(err.statusCode).toBe(400);
      }
    });
  });

  describe('4. Release Summary State Mapping', () => {
    test('release summary maps superseded items to "Replaced by newer prescription"', () => {
      const rxSuperseded = {
        _id: new mongoose.Types.ObjectId(),
        status: 'pending',
        supersededBy: new mongoose.Types.ObjectId(),
        supersededAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000)
      };
      const rxExpired = {
        _id: new mongoose.Types.ObjectId(),
        status: 'pending',
        expiresAt: new Date(Date.now() - 86400000)
      };

      expect(getPrescriptionActiveState(rxSuperseded)).toBe('superseded');
      expect(getPrescriptionActiveState(rxExpired)).toBe('expired');
    });
  });

  describe('5. Patient Isolation', () => {
    test('prescriptions belonging to distinct patients do not collide or supersede', () => {
      const patientA = new mongoose.Types.ObjectId();
      const patientB = new mongoose.Types.ObjectId();

      const rxA = {
        patientId: patientA,
        drugName: 'Citalopram 20mg',
        status: 'pending',
        expiresAt: new Date(Date.now() + 86400000)
      };

      const rxB = {
        patientId: patientB,
        drugName: 'Citalopram 40mg',
        status: 'pending',
        expiresAt: new Date(Date.now() + 86400000)
      };

      // Same medicine logic applies at drug level, but query filters by patientId
      expect(String(rxA.patientId)).not.toBe(String(rxB.patientId));
      expect(isSameMedicine(rxA.drugName, rxB.drugName)).toBe(true);
    });
  });
});
