'use strict';

const path = require('path');
const fs = require('fs');
const {
  isPrescribableDrug,
  analyzeMedicationSafety
} = require('../src/utils/ingredientResolver');
const { COMMON_DRUGS } = require('../src/controllers/drugController');

describe('U2 — Prescribable drug catalog filter and duplicate self-comparison', () => {
  const SOAP_NAMES = [
    'Acnelak Pimple Care Soap',
    'Acnerex Soap',
    'ACSTOP Soap',
    'Azac Soap',
    'ACNE BRIGHT Soap',
    'BELLISSA ACNE Soap',
    'KLM Klin Soap',
    'MISTI ANTI ACNE Soap',
    'NEVLON ACNE Soap',
    'Papulex Soap Free Cleansing Gel',
    'PERNEX Soap',
    'Skinshine Soap',
    'Aactaril Soap'
  ];

  const TOPICAL_MEDICINES = [
    { name: 'Betamethasone Dipropionate Ointment', genericName: 'Betamethasone dipropionate', brand: 'Betnovate' },
    { name: 'Coal Tar Ointment', genericName: 'Coal tar', brand: 'Exorex' },
    { name: 'Mupirocin Ointment', genericName: 'Mupirocin', brand: 'Bactroban' },
    { name: 'Clotrimazole Cream', genericName: 'Clotrimazole', brand: 'Canesten' },
    { name: 'Diclofenac Gel', genericName: 'Diclofenac sodium', brand: 'Voltaren Gel' },
    { name: 'Hydrocortisone 1% Cream', genericName: 'Hydrocortisone', brand: 'Dioderm' }
  ];

  test('isPrescribableDrug excludes all 13 catalog soap products', () => {
    for (const name of SOAP_NAMES) {
      expect(isPrescribableDrug({ name, brand: name, genericName: 'Test' })).toBe(false);
    }
  });

  test('isPrescribableDrug allows legitimate topical medicines (ointments, creams, gels)', () => {
    for (const med of TOPICAL_MEDICINES) {
      expect(isPrescribableDrug(med)).toBe(true);
    }
  });

  test('isPrescribableDrug filters out non-medicine washes, facewashes, bars, and generic skin care', () => {
    expect(isPrescribableDrug({ name: 'Acnejoy Face Wash' })).toBe(false);
    expect(isPrescribableDrug({ name: 'Clindac A Foaming Facewash' })).toBe(false);
    expect(isPrescribableDrug({ name: 'Acnoff Anti Acne Bar' })).toBe(false);
    expect(isPrescribableDrug({ name: 'LICE CLEAR ANTI LICE Shampoo' })).toBe(false);
    expect(isPrescribableDrug({ name: 'Glyaha Lotion', genericName: 'Generic Name  Skin Care' })).toBe(false);
  });

  test('analyzeMedicationSafety does not emit duplicate ingredient warning on self-comparison of identical drug', () => {
    const selfRes = analyzeMedicationSafety(['Panadol', 'Panadol'], [], COMMON_DRUGS);
    expect(selfRes.duplicateIngredients.length).toBe(0);
  });

  test('analyzeMedicationSafety continues to flag duplicate active ingredients for different brand/formulation products', () => {
    const diffRes = analyzeMedicationSafety(
      ["ALMOX DT 250 Tablet 15's", "CLAVAM Tablet 10's"],
      [],
      COMMON_DRUGS
    );
    expect(diffRes.hasInteraction).toBe(true);
    expect(diffRes.duplicateIngredients.length).toBe(1);
    expect(diffRes.duplicateIngredients[0].type).toBe('duplicate_ingredient');
    expect(diffRes.duplicateIngredients[0].ingredient.toLowerCase()).toBe('amoxicillin');
  });
});
