'use strict';

/**
 * Phase 7 Unit Tests: Clinical PDF Export behind PDF_EXPORT_ENABLED flag (Milestone 4 WP5)
 * Covers:
 *  - Consultation and Lab report PDF exports
 *  - Feature flag gating (503 when flag is off / undefined, 200 when flag is 'true')
 *  - Access control: patient ownership, attending/referring doctor, consent token verification, hospital isolation
 *  - Privacy filenames (zero NIC, zero patient name, date + maskedRef format)
 *  - Zero PII in error logs
 *  - Multilingual font safety (Sinhala / Tamil characters without WinAnsi crash)
 */

const mongoose = require('mongoose');
const prescriptionController = require('../src/controllers/prescriptionController');
const labController = require('../src/controllers/labController');
const Consultation = require('../src/models/Consultation');
const LabTest = require('../src/models/LabTest');
const patientConsentService = require('../src/services/patientConsentService');

const MOCK_PATIENT_ID = '507f191e810c19729de860ea';
const MOCK_OTHER_PATIENT_ID = '507f191e810c19729de860eb';
const MOCK_DOCTOR_ID = '507f191e810c19729de860ec';
const MOCK_OTHER_DOCTOR_ID = '507f191e810c19729de860ed';
const MOCK_HOSPITAL_ID = '507f191e810c19729de860ee';
const MOCK_OTHER_HOSPITAL_ID = '507f191e810c19729de860ef';
const MOCK_PATIENT_NIC = '199012345678';
const MOCK_PATIENT_NAME = 'Perera Sunimal';

function createMockRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    set(headerObj) {
      Object.assign(this.headers, headerObj);
      return this;
    },
    send(buf) {
      this.body = buf;
      return this;
    }
  };
  return res;
}

describe('Clinical PDF Export — Phase 7 (Milestone 4 WP5)', () => {
  const originalEnvFlag = process.env.PDF_EXPORT_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env.PDF_EXPORT_ENABLED = originalEnvFlag;
  });

  describe('Feature Flag Gating (Consultation & Lab Report)', () => {
    test('returns 503 PDF_EXPORT_UNAVAILABLE when PDF_EXPORT_ENABLED is unset / false for consultation', async () => {
      delete process.env.PDF_EXPORT_ENABLED;

      const mockConsultation = {
        consultationId: 'CNS-2026-0001',
        patientId: { _id: MOCK_PATIENT_ID, fullName: MOCK_PATIENT_NAME, nic: MOCK_PATIENT_NIC },
        doctorId: { _id: MOCK_DOCTOR_ID, fullName: 'Dr. Nimal Silva', slmcNumber: 'SLMC-12345' },
        patientNic: MOCK_PATIENT_NIC,
        diagnosis: 'Dengue Fever',
        symptoms: ['Fever', 'Headache'],
        medications: [{ drugName: 'Paracetamol', dosage: '500mg', frequency: 'TDS', duration: '5 days' }]
      };

      jest.spyOn(Consultation, 'findOne').mockReturnValue({
        populate: () => ({
          populate: () => Promise.resolve(mockConsultation)
        })
      });

      const req = {
        params: { id: 'CNS-2026-0001' },
        user: { id: MOCK_PATIENT_ID, role: 'patient', nic: MOCK_PATIENT_NIC },
        headers: {}
      };
      const res = createMockRes();

      await prescriptionController.exportConsultationPdf(req, res);

      expect(res.statusCode).toBe(503);
      expect(res.body).toEqual({
        error: 'Clinical PDF export is temporarily unavailable',
        code: 'PDF_EXPORT_UNAVAILABLE'
      });
      expect(res.headers['Content-Type']).toBeUndefined();
    });

    test('returns 503 PDF_EXPORT_UNAVAILABLE when PDF_EXPORT_ENABLED is unset / false for lab report', async () => {
      delete process.env.PDF_EXPORT_ENABLED;

      const mockLabTest = {
        labTestId: 'LAB-2026-0001',
        reportId: 'REP-2026-0001',
        testName: 'Full Blood Count (FBC)',
        category: 'Hematology',
        status: 'Completed',
        patientId: MOCK_PATIENT_ID,
        patientNic: MOCK_PATIENT_NIC,
        referredBy: MOCK_DOCTOR_ID,
        hospitalId: MOCK_HOSPITAL_ID,
        urgency: 'Routine'
      };

      jest.spyOn(labController, '_findLabTestByIdentifier').mockResolvedValue(mockLabTest);

      const req = {
        params: { id: 'LAB-2026-0001' },
        user: { id: MOCK_PATIENT_ID, role: 'patient', nic: MOCK_PATIENT_NIC },
        headers: {}
      };
      const res = createMockRes();

      await labController.exportLabReportPdf(req, res);

      expect(res.statusCode).toBe(503);
      expect(res.body).toEqual({
        message: 'Clinical PDF export is temporarily unavailable',
        code: 'PDF_EXPORT_UNAVAILABLE'
      });
      expect(res.headers['Content-Type']).toBeUndefined();
    });
  });

  describe('Feature Flag Enabled: Binary PDF Stream & Privacy Filename', () => {
    beforeEach(() => {
      process.env.PDF_EXPORT_ENABLED = 'true';
    });

    test('generates valid binary PDF and privacy filename for consultation', async () => {
      const mockConsultation = {
        consultationId: 'CNS-2026-0001',
        patientId: { _id: MOCK_PATIENT_ID, fullName: MOCK_PATIENT_NAME, nic: MOCK_PATIENT_NIC, dateOfBirth: '1990-01-01', gender: 'male' },
        doctorId: { _id: MOCK_DOCTOR_ID, fullName: 'Dr. Nimal Silva', slmcNumber: 'SLMC-12345' },
        patientNic: MOCK_PATIENT_NIC,
        diagnosis: 'Dengue Fever',
        symptoms: ['High Fever', 'Joint Pain'],
        medications: [{ drugName: 'Paracetamol', dosage: '500mg', frequency: 'QDS', durationDays: 3, instructions: 'After meals' }]
      };

      jest.spyOn(Consultation, 'findOne').mockReturnValue({
        populate: () => ({
          populate: () => Promise.resolve(mockConsultation)
        })
      });

      const req = {
        params: { id: 'CNS-2026-0001' },
        user: { id: MOCK_PATIENT_ID, role: 'patient', nic: MOCK_PATIENT_NIC },
        headers: {}
      };
      const res = createMockRes();

      await prescriptionController.exportConsultationPdf(req, res);

      expect(res.statusCode).toBeNull(); // send() was called without error
      expect(res.headers['Content-Type']).toBe('application/pdf');
      expect(res.headers['Content-Disposition']).toMatch(/^inline; filename="MediSync-Consultation-\d{4}-\d{2}-\d{2}-[a-zA-Z0-9_-]+\.pdf"$/);
      expect(res.headers['Content-Disposition']).not.toContain(MOCK_PATIENT_NIC);
      expect(res.headers['Content-Disposition']).not.toContain(MOCK_PATIENT_NAME);
      expect(Buffer.isBuffer(res.body) || res.body instanceof Uint8Array).toBe(true);

      const pdfHeader = Buffer.from(res.body).slice(0, 5).toString('ascii');
      expect(pdfHeader).toBe('%PDF-');
    });

    test('generates valid binary PDF and privacy filename for lab report', async () => {
      const mockLabTest = {
        labTestId: 'LAB-2026-0001',
        reportId: 'REP-2026-0001',
        testName: 'Full Blood Count (FBC)',
        category: 'Hematology',
        status: 'Completed',
        patientId: MOCK_PATIENT_ID,
        patientNic: MOCK_PATIENT_NIC,
        patientName: MOCK_PATIENT_NAME,
        referredBy: MOCK_DOCTOR_ID,
        hospitalId: MOCK_HOSPITAL_ID,
        urgency: 'Routine'
      };

      jest.spyOn(labController, '_findLabTestByIdentifier').mockResolvedValue(mockLabTest);

      const req = {
        params: { id: 'LAB-2026-0001' },
        user: { id: MOCK_PATIENT_ID, role: 'patient', nic: MOCK_PATIENT_NIC },
        headers: {}
      };
      const res = createMockRes();

      await labController.exportLabReportPdf(req, res);

      expect(res.statusCode).toBeNull(); // send() was called
      expect(res.headers['Content-Type']).toBe('application/pdf');
      expect(res.headers['Content-Disposition']).toMatch(/^inline; filename="MediSync-LabReport-\d{4}-\d{2}-\d{2}-[a-zA-Z0-9_-]+\.pdf"$/);
      expect(res.headers['Content-Disposition']).not.toContain(MOCK_PATIENT_NIC);
      expect(res.headers['Content-Disposition']).not.toContain(MOCK_PATIENT_NAME);
      expect(Buffer.isBuffer(res.body) || res.body instanceof Uint8Array).toBe(true);

      const pdfHeader = Buffer.from(res.body).slice(0, 5).toString('ascii');
      expect(pdfHeader).toBe('%PDF-');
    });
  });

  describe('Access Control Rules — Consultation Export', () => {
    const mockConsultation = {
      consultationId: 'CNS-2026-0001',
      patientId: { _id: MOCK_PATIENT_ID, fullName: MOCK_PATIENT_NAME, nic: MOCK_PATIENT_NIC },
      doctorId: { _id: MOCK_DOCTOR_ID, fullName: 'Dr. Nimal Silva', slmcNumber: 'SLMC-12345' },
      patientNic: MOCK_PATIENT_NIC
    };

    beforeEach(() => {
      process.env.PDF_EXPORT_ENABLED = 'true';
      jest.spyOn(Consultation, 'findOne').mockReturnValue({
        populate: () => ({
          populate: () => Promise.resolve(mockConsultation)
        })
      });
    });

    test('patient caller with mismatched patientId and NIC receives 403 Forbidden', async () => {
      const req = {
        params: { id: 'CNS-2026-0001' },
        user: { id: MOCK_OTHER_PATIENT_ID, role: 'patient', nic: '199999999999' },
        headers: {}
      };
      const res = createMockRes();

      await prescriptionController.exportConsultationPdf(req, res);

      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({ error: 'Access denied' });
    });

    test('attending doctor caller receives 200 without requiring patient consent token', async () => {
      const req = {
        params: { id: 'CNS-2026-0001' },
        user: { id: MOCK_DOCTOR_ID, role: 'doctor' },
        headers: {}
      };
      const res = createMockRes();

      await prescriptionController.exportConsultationPdf(req, res);

      expect(res.headers['Content-Type']).toBe('application/pdf');
    });

    test('non-attending doctor caller without consent token receives 403', async () => {
      const req = {
        params: { id: 'CNS-2026-0001' },
        user: { id: MOCK_OTHER_DOCTOR_ID, role: 'doctor' },
        headers: {}
      };
      const res = createMockRes();

      await prescriptionController.exportConsultationPdf(req, res);

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toContain('Active patient consent required');
    });

    test('non-attending doctor caller with valid patient consent token receives 200', async () => {
      jest.spyOn(patientConsentService, 'verifyPatientConsent').mockResolvedValue({
        patientId: MOCK_PATIENT_ID,
        consentSessionId: 'sess123'
      });

      const req = {
        params: { id: 'CNS-2026-0001' },
        user: { id: MOCK_OTHER_DOCTOR_ID, role: 'doctor' },
        headers: { 'x-patient-access': 'valid-consent-jwt' }
      };
      const res = createMockRes();

      await prescriptionController.exportConsultationPdf(req, res);

      expect(patientConsentService.verifyPatientConsent).toHaveBeenCalledWith({
        actor: req.user,
        nic: MOCK_PATIENT_NIC,
        token: 'valid-consent-jwt'
      });
      expect(res.headers['Content-Type']).toBe('application/pdf');
    });

    test('non-attending doctor caller with mismatched consent patientId receives 403', async () => {
      jest.spyOn(patientConsentService, 'verifyPatientConsent').mockResolvedValue({
        patientId: MOCK_OTHER_PATIENT_ID,
        consentSessionId: 'sess123'
      });

      const req = {
        params: { id: 'CNS-2026-0001' },
        user: { id: MOCK_OTHER_DOCTOR_ID, role: 'doctor' },
        headers: { 'x-patient-access': 'mismatched-consent-jwt' }
      };
      const res = createMockRes();

      await prescriptionController.exportConsultationPdf(req, res);

      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({ error: 'Access denied' });
    });

    test('non-attending doctor caller when verifyPatientConsent throws receives 403', async () => {
      jest.spyOn(patientConsentService, 'verifyPatientConsent').mockRejectedValue(new Error('PATIENT_CONSENT_DENIED'));

      const req = {
        params: { id: 'CNS-2026-0001' },
        user: { id: MOCK_OTHER_DOCTOR_ID, role: 'doctor' },
        headers: { 'x-patient-access': 'expired-jwt' }
      };
      const res = createMockRes();

      await prescriptionController.exportConsultationPdf(req, res);

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toContain('Active patient consent required');
    });

    test('pharmacist or other role receives 403', async () => {
      const req = {
        params: { id: 'CNS-2026-0001' },
        user: { id: '507f191e810c19729de860f0', role: 'pharmacist' },
        headers: {}
      };
      const res = createMockRes();

      await prescriptionController.exportConsultationPdf(req, res);

      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({ error: 'Access denied' });
    });

    test('consultation not found returns 404', async () => {
      jest.spyOn(Consultation, 'findOne').mockReturnValue({
        populate: () => ({
          populate: () => Promise.resolve(null)
        })
      });

      const req = {
        params: { id: 'NON-EXISTENT-ID' },
        user: { id: MOCK_PATIENT_ID, role: 'patient' },
        headers: {}
      };
      const res = createMockRes();

      await prescriptionController.exportConsultationPdf(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'Consultation not found' });
    });
  });

  describe('Access Control Rules — Lab Report Export', () => {
    const mockLabTest = {
      labTestId: 'LAB-2026-0001',
      reportId: 'REP-2026-0001',
      testName: 'Lipid Profile',
      category: 'Biochemistry',
      status: 'Completed',
      patientId: MOCK_PATIENT_ID,
      patientNic: MOCK_PATIENT_NIC,
      referredBy: MOCK_DOCTOR_ID,
      hospitalId: MOCK_HOSPITAL_ID
    };

    beforeEach(() => {
      process.env.PDF_EXPORT_ENABLED = 'true';
      jest.spyOn(labController, '_findLabTestByIdentifier').mockResolvedValue(mockLabTest);
    });

    test('patient owner caller receives 200', async () => {
      const req = {
        params: { id: 'LAB-2026-0001' },
        user: { id: MOCK_PATIENT_ID, role: 'patient', nic: MOCK_PATIENT_NIC },
        headers: {}
      };
      const res = createMockRes();

      await labController.exportLabReportPdf(req, res);

      expect(res.headers['Content-Type']).toBe('application/pdf');
    });

    test('patient caller with mismatched ID and NIC receives 403', async () => {
      const req = {
        params: { id: 'LAB-2026-0001' },
        user: { id: MOCK_OTHER_PATIENT_ID, role: 'patient', nic: '199999999999' },
        headers: {}
      };
      const res = createMockRes();

      await labController.exportLabReportPdf(req, res);

      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({ message: 'Access denied' });
    });

    test('referring doctor caller receives 200 without consent token', async () => {
      const req = {
        params: { id: 'LAB-2026-0001' },
        user: { id: MOCK_DOCTOR_ID, role: 'doctor' },
        headers: {}
      };
      const res = createMockRes();

      await labController.exportLabReportPdf(req, res);

      expect(res.headers['Content-Type']).toBe('application/pdf');
    });

    test('non-referring doctor without consent token receives 403', async () => {
      const req = {
        params: { id: 'LAB-2026-0001' },
        user: { id: MOCK_OTHER_DOCTOR_ID, role: 'doctor' },
        headers: {}
      };
      const res = createMockRes();

      await labController.exportLabReportPdf(req, res);

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toContain('Active patient consent required');
    });

    test('non-referring doctor with valid consent token receives 200', async () => {
      jest.spyOn(patientConsentService, 'verifyPatientConsent').mockResolvedValue({
        patientId: MOCK_PATIENT_ID,
        consentSessionId: 'sess456'
      });

      const req = {
        params: { id: 'LAB-2026-0001' },
        user: { id: MOCK_OTHER_DOCTOR_ID, role: 'doctor' },
        headers: { 'x-patient-access': 'valid-consent-jwt' }
      };
      const res = createMockRes();

      await labController.exportLabReportPdf(req, res);

      expect(res.headers['Content-Type']).toBe('application/pdf');
    });

    test('hospital admin from matching hospital receives 200', async () => {
      const req = {
        params: { id: 'LAB-2026-0001' },
        user: { id: 'admin1', role: 'hospital_admin', hospitalId: MOCK_HOSPITAL_ID },
        headers: {}
      };
      const res = createMockRes();

      await labController.exportLabReportPdf(req, res);

      expect(res.headers['Content-Type']).toBe('application/pdf');
    });

    test('hospital admin from different hospital receives 403', async () => {
      const req = {
        params: { id: 'LAB-2026-0001' },
        user: { id: 'admin2', role: 'hospital_admin', hospitalId: MOCK_OTHER_HOSPITAL_ID },
        headers: {}
      };
      const res = createMockRes();

      await labController.exportLabReportPdf(req, res);

      expect(res.statusCode).toBe(403);
      expect(res.body).toEqual({ message: 'Access denied' });
    });

    test('lab report not found returns 404', async () => {
      jest.spyOn(labController, '_findLabTestByIdentifier').mockResolvedValue(null);

      const req = {
        params: { id: 'NON-EXISTENT-LAB' },
        user: { id: MOCK_PATIENT_ID, role: 'patient' },
        headers: {}
      };
      const res = createMockRes();

      await labController.exportLabReportPdf(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ message: 'Lab report not found' });
    });
  });

  describe('Multilingual Font Safety & Zero PII Logging', () => {
    beforeEach(() => {
      process.env.PDF_EXPORT_ENABLED = 'true';
    });

    test('generates PDF safely when consultation contains Sinhala and Tamil medical text', async () => {
      const multilingualConsultation = {
        consultationId: 'CNS-2026-MULTI',
        patientId: {
          _id: MOCK_PATIENT_ID,
          fullName: 'අජිත් පෙරේරා (Ajith Perera)',
          nic: MOCK_PATIENT_NIC,
          preferredLanguage: 'si'
        },
        doctorId: {
          _id: MOCK_DOCTOR_ID,
          fullName: 'Dr. කමල් ගුණරත්න',
          slmcNumber: 'SLMC-98765'
        },
        patientNic: MOCK_PATIENT_NIC,
        diagnosis: 'ඩෙංගු උණ (Dengue Fever / டெங்கு காய்ச்சல்)',
        symptoms: ['උණ (Fever / காய்ச்சல்)', 'ඇඟපත වේදනාව (Body aches)'],
        medications: [
          { drugName: 'පැරසිටමෝල්', dosage: '500mg', frequency: 'TDS', durationDays: 3, instructions: 'ආහාරයෙන් පසු' },
          { drugName: 'பராசிட்டமால்', dosage: '500mg', frequency: 'TDS', durationDays: 3, instructions: 'உணவுக்குப் பிறகு' }
        ]
      };

      jest.spyOn(Consultation, 'findOne').mockReturnValue({
        populate: () => ({
          populate: () => Promise.resolve(multilingualConsultation)
        })
      });

      const req = {
        params: { id: 'CNS-2026-MULTI' },
        user: { id: MOCK_PATIENT_ID, role: 'patient', nic: MOCK_PATIENT_NIC },
        headers: {}
      };
      const res = createMockRes();

      // Must not throw WinAnsi exception
      await expect(prescriptionController.exportConsultationPdf(req, res)).resolves.not.toThrow();

      expect(res.headers['Content-Type']).toBe('application/pdf');
      expect(Buffer.isBuffer(res.body) || res.body instanceof Uint8Array).toBe(true);
    });

    test('logs zero patient NIC and zero PII on unexpected generation error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      jest.spyOn(Consultation, 'findOne').mockReturnValue({
        populate: () => ({
          populate: () => Promise.reject(new Error(`Database timeout for NIC ${MOCK_PATIENT_NIC}`))
        })
      });

      const req = {
        params: { id: 'CNS-2026-0001' },
        user: { id: MOCK_PATIENT_ID, role: 'patient', nic: MOCK_PATIENT_NIC },
        headers: {}
      };
      const res = createMockRes();

      await prescriptionController.exportConsultationPdf(req, res);

      expect(res.statusCode).toBe(500);

      // Verify that console.error does not contain the patient NIC
      for (const call of consoleErrorSpy.mock.calls) {
        const loggedString = call.map(c => String(c)).join(' ');
        expect(loggedString).not.toContain(MOCK_PATIENT_NIC);
        expect(loggedString).not.toContain(MOCK_PATIENT_NAME);
      }

      consoleErrorSpy.mockRestore();
    });
  });
});
