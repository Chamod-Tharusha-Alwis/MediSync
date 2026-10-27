'use strict';

const mongoose = require('mongoose');
const { canonicalMedicationName, MedicationNameError } = require('../src/utils/medicationName');
const Prescription = require('../src/models/Prescription');

describe('canonicalMedicationName - Dedicated Mongoose Subdocument & Validation Suite', () => {
  const medicineItemSchema = new mongoose.Schema({
    name: { type: String },
    drugName: { type: String },
    dosage: { type: String },
    frequency: { type: String }
  }, { _id: true });

  const prescriptionTestSchema = new mongoose.Schema({
    patientNic: { type: String, required: true },
    items: [medicineItemSchema]
  });

  const TestPrescription = mongoose.models.TestPrescription || mongoose.model('TestPrescription', prescriptionTestSchema);

  describe('Real Mongoose Embedded Subdocuments', () => {
    test('extracts canonical name when subdocument supplies only name', () => {
      const doc = new TestPrescription({
        patientNic: '901234567V',
        items: [{ name: '  Amoxicillin 500mg  ', dosage: '500mg', frequency: 'TDS' }]
      });
      const subdoc = doc.items[0];
      expect(subdoc).toBeInstanceOf(mongoose.Types.EmbeddedDocument || mongoose.Document);
      expect(canonicalMedicationName(subdoc)).toBe('Amoxicillin 500mg');
    });

    test('extracts canonical name when subdocument supplies only drugName', () => {
      const doc = new TestPrescription({
        patientNic: '901234567V',
        items: [{ drugName: 'Paracetamol 500mg', dosage: '500mg' }]
      });
      const subdoc = doc.items[0];
      expect(canonicalMedicationName(subdoc)).toBe('Paracetamol 500mg');
    });

    test('accepts subdocument when name and drugName agree after trimming', () => {
      const doc = new TestPrescription({
        patientNic: '901234567V',
        items: [{ name: 'Metformin 500mg', drugName: '  Metformin 500mg\t' }]
      });
      const subdoc = doc.items[0];
      expect(canonicalMedicationName(subdoc)).toBe('Metformin 500mg');
    });

    test('throws MedicationNameError when subdocument name and drugName conflict', () => {
      const doc = new TestPrescription({
        patientNic: '901234567V',
        items: [{ name: 'Amoxicillin 500mg', drugName: 'Ibuprofen 400mg' }]
      });
      const subdoc = doc.items[0];
      expect(() => canonicalMedicationName(subdoc)).toThrow(MedicationNameError);
      try {
        canonicalMedicationName(subdoc);
      } catch (err) {
        expect(err.code).toBe('INVALID_MEDICATION_NAME');
      }
    });

    test('works with actual production Prescription model medications array subdocument', () => {
      const rx = new Prescription({
        patientNic: '901234567V',
        medications: [{ name: 'Ciprofloxacin 250mg', dosage: '250mg', frequency: 'BD' }]
      });
      const subdoc = rx.medications[0];
      expect(canonicalMedicationName(subdoc)).toBe('Ciprofloxacin 250mg');
    });
  });

  describe('Malformed & Edge Case Rejections', () => {
    test.each([
      ['empty string name', { name: '' }],
      ['whitespace only name', { name: '   \t\n  ' }],
      ['empty string drugName', { drugName: '' }],
      ['whitespace only drugName', { drugName: '    ' }],
      ['empty object (neither name nor drugName)', {}],
      ['non-string name (number)', { name: 500 }],
      ['non-string drugName (boolean)', { drugName: true }],
      ['null name property', { name: null }],
      ['undefined name property', { name: undefined }],
      ['array property', { name: ['Amoxicillin'] }],
      ['null input', null],
      ['undefined input', undefined],
      ['primitive string input', 'Amoxicillin'],
      ['primitive number input', 12345],
      ['array input', [{ name: 'Amoxicillin' }]]
    ])('rejects %s throwing MedicationNameError with code INVALID_MEDICATION_NAME', (_label, input) => {
      expect(() => canonicalMedicationName(input)).toThrow(MedicationNameError);
      try {
        canonicalMedicationName(input);
      } catch (err) {
        expect(err.code).toBe('INVALID_MEDICATION_NAME');
      }
    });
  });
});
