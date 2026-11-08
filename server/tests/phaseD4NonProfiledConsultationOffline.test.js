'use strict';

/**
 * Phase D4 Offline Regression Test: Doctor/Patient UX for "Any Disease"
 * Verifies full 71,704 ICD-10 catalog lookup for non-profiled conditions,
 * Consultation schema persistence of arbitrary ICD codes without blocking,
 * and PDF export generation & security-hold gating.
 */

const { icd10 } = require('../src/utils/loadDatasets');
const Consultation = require('../src/models/Consultation');
const { generateConsultationSummaryPDF } = require('../src/utils/pdfGenerator');

describe('Phase D4 — Doctor/Patient Any Disease Consultation Offline Contract', () => {
  test('1. Full 71,704 catalog contains non-profiled clinical diseases', () => {
    expect(icd10.length).toBe(71704);

    const nonProfiledSearches = [
      { term: 'celiac', expectedCodePrefix: 'K90' },
      { term: 'type 1 diabetes', expectedCodePrefix: 'E10' },
      { term: 'multiple sclerosis', expectedCodePrefix: 'G35' },
      { term: 'crohn', expectedCodePrefix: 'K50' },
      { term: 'rheumatoid arthritis', expectedCodePrefix: 'M06' }
    ];

    for (const item of nonProfiledSearches) {
      const matches = icd10.filter(c =>
        c.description.toLowerCase().includes(item.term) || c.code.toLowerCase().includes(item.term)
      );
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some(m => m.code.toUpperCase().startsWith(item.expectedCodePrefix))).toBe(true);
    }
  });

  test('2. Consultation model schema supports any ICD code and non-profiled diagnosis', () => {
    const consultation = new Consultation({
      patientNic: '199512345678',
      doctorId: new (require('mongoose').Types.ObjectId)(),
      symptoms: ['chronic diarrhea', 'abdominal pain', 'weight loss'],
      diagnosis: 'Celiac disease',
      icdCode: 'K90.0',
      icdDescription: 'Celiac disease',
      icdVersion: 'ICD-10',
      prescriptions: [
        {
          name: 'Prednisolone',
          dosage: '20mg',
          frequency: 'OD',
          durationDays: 14,
          instructions: 'Morning after food'
        }
      ],
      clinicalNotes: 'Gluten-sensitive enteropathy diagnosed; dietary counseling provided.',
      isFollowUpRequired: true
    });

    const validationErr = consultation.validateSync(['diagnosis', 'icdCode', 'symptoms', 'prescriptions']);
    expect(validationErr).toBeUndefined();
    expect(consultation.diagnosis).toBe('Celiac disease');
    expect(consultation.icdCode).toBe('K90.0');
  });

  test('3. PDF export for non-profiled consultation honors PDF_EXPORT_ENABLED security gate', async () => {
    const fakeConsultation = {
      _id: 'CONS-CELIAC-2026-001',
      patientNic: '199512345678',
      diagnosis: 'Celiac disease',
      icdCode: 'K90.0',
      symptoms: ['chronic diarrhea', 'abdominal pain'],
      prescriptions: [{ name: 'Prednisolone', dosage: '20mg', frequency: 'OD', durationDays: 14 }],
      clinicalNotes: 'Gluten-free diet initiated.',
      createdAt: new Date().toISOString()
    };
    const fakePatient = { fullName: 'Test Patient', nic: '199512345678', age: 30, gender: 'Female' };
    const fakeDoctor = { fullName: 'Dr. Silva', slmcNumber: 'SLMC-12345', specialty: 'Gastroenterology' };

    // With PDF_EXPORT_ENABLED != 'true' -> fails closed with SECURITY_HOLD
    const origEnv = process.env.PDF_EXPORT_ENABLED;
    process.env.PDF_EXPORT_ENABLED = 'false';
    await expect(
      generateConsultationSummaryPDF(fakeConsultation, fakePatient, fakeDoctor)
    ).rejects.toThrow(/SECURITY_HOLD/);

    // With PDF_EXPORT_ENABLED == 'true' -> generates valid PDF document
    process.env.PDF_EXPORT_ENABLED = 'true';
    try {
      const pdfBytes = await generateConsultationSummaryPDF(fakeConsultation, fakePatient, fakeDoctor);
      expect(pdfBytes).toBeDefined();
      expect(Buffer.isBuffer(Buffer.from(pdfBytes))).toBe(true);
      expect(Buffer.from(pdfBytes).slice(0, 5).toString('utf-8')).toBe('%PDF-');
    } finally {
      process.env.PDF_EXPORT_ENABLED = origEnv;
    }
  });
});
