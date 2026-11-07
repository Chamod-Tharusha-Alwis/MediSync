'use strict';

const Consultation = require('../src/models/Consultation');
const Prescription = require('../src/models/Prescription');
const Patient = require('../src/models/Patient');
const Doctor = require('../src/models/Doctor');
const LabTest = require('../src/models/LabTest');
const AuditLog = require('../src/models/AuditLog');
const {
  sendConsultationSummaryEmail,
  checkResendRateLimit,
  _resetTestState,
} = require('../src/services/consultationSummaryEmailService');
const {
  exportConsultationPdf,
  resendConsultationSummaryEmail,
} = require('../src/controllers/prescriptionController');
const { createConsultationHandler } = require('../src/controllers/clinicalCommandController');
const labController = require('../src/controllers/labController');

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(obj) {
      Object.assign(this.headers, obj);
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe('Phase 2 — Consultation Summary Email & Clinical PDF Export (Tasks 2.0–2.3)', () => {
  const originalPdfFlag = process.env.PDF_EXPORT_ENABLED;
  const TEST_NIC = '199512345678';
  const PATIENT_ID = '507f1f77bcf86cd799439011';
  const OTHER_PATIENT_ID = '507f1f77bcf86cd799439099';
  const DOCTOR_ID = '507f1f77bcf86cd799439022';
  const CONSULT_ID = '507f1f77bcf86cd799439033';

  beforeEach(() => {
    delete process.env.PDF_EXPORT_ENABLED;
    _resetTestState();
    jest.restoreAllMocks();

    jest.spyOn(Consultation, 'findById').mockImplementation((id) => {
      if (String(id) === CONSULT_ID) {
        return Promise.resolve({
          _id: CONSULT_ID,
          consultationId: 'CONS-2026-0091',
          patientId: PATIENT_ID,
          patientNic: TEST_NIC,
          doctorId: DOCTOR_ID,
          diagnosis: `Acute Dengue Fever (${TEST_NIC})`,
          notes: `Maintain hydration. Ref ${TEST_NIC}`,
          symptoms: ['Fever', 'Myalgia'],
          createdAt: new Date('2026-11-07T08:00:00Z'),
          toObject() {
            return { ...this };
          },
        });
      }
      return Promise.resolve(null);
    });

    jest.spyOn(Consultation, 'findOne').mockImplementation(() => {
      const doc = {
        _id: CONSULT_ID,
        consultationId: 'CONS-2026-0091',
        patientId: {
          _id: PATIENT_ID,
          fullName: 'Kasun Perera',
          nic: TEST_NIC,
          dateOfBirth: new Date('1995-05-10'),
          gender: 'Male',
        },
        patientNic: TEST_NIC,
        doctorId: {
          _id: DOCTOR_ID,
          fullName: 'Dr. Nimal Silva',
          slmcNumber: 'SLMC-4421',
        },
        diagnosis: 'Acute Dengue Fever',
        notes: 'Rest and oral rehydration',
        symptoms: ['Fever', 'Headache'],
        createdAt: new Date('2026-11-07T08:00:00Z'),
        toObject() {
          return { ...this };
        },
      };
      return {
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(doc),
        }),
        then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject),
      };
    });

    jest.spyOn(Patient, 'findById').mockImplementation((id) => {
      if (String(id) === PATIENT_ID) {
        return Promise.resolve({
          _id: PATIENT_ID,
          fullName: 'Kasun Perera',
          email: 'kasun.patient@medisync.local',
          nic: TEST_NIC,
          dateOfBirth: new Date('1995-05-10'),
          gender: 'Male',
        });
      }
      return Promise.resolve(null);
    });

    jest.spyOn(Doctor, 'findById').mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: DOCTOR_ID,
          fullName: 'Dr. Nimal Silva',
          specialization: 'Internal Medicine',
          slmcNumber: 'SLMC-4421',
        }),
      }),
    });

    jest.spyOn(Prescription, 'find').mockImplementation(() => {
      const rows = [
        {
          _id: '507f1f77bcf86cd799439044',
          prescriptionId: 'RX-2026-001',
          consultationId: CONSULT_ID,
          consultationRef: 'CONS-2026-0091',
          patientId: PATIENT_ID,
          patientNic: TEST_NIC,
          drugName: 'Paracetamol',
          dosage: '500mg',
          frequency: 'TDS',
          durationDays: 5,
          instructions: `Take after meals (${TEST_NIC})`,
          toObject() {
            return { ...this };
          },
        },
      ];
      return {
        sort: jest.fn().mockResolvedValue(rows),
        then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
      };
    });

    jest.spyOn(AuditLog, 'findOne').mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    });
    jest.spyOn(AuditLog, 'create').mockResolvedValue({});
  });

  afterAll(() => {
    if (originalPdfFlag === undefined) {
      delete process.env.PDF_EXPORT_ENABLED;
    } else {
      process.env.PDF_EXPORT_ENABLED = originalPdfFlag;
    }
    jest.restoreAllMocks();
  });

  test('1. Sends consultation summary email once (idempotent), to patient account email only, without PDF when PDF_EXPORT_ENABLED is off', async () => {
    const sentPayloads = [];
    const mockSendMail = jest.fn(async (opts) => {
      sentPayloads.push(opts);
      return { success: true, providerAccepted: true, messageId: 'msg-001' };
    });

    const first = await sendConsultationSummaryEmail({
      consultationId: CONSULT_ID,
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      sendMailFn: mockSendMail,
    });

    expect(first.sent).toBe(true);
    expect(first.pdfAttached).toBe(false);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(sentPayloads[0].to).toBe('kasun.patient@medisync.local');
    expect(sentPayloads[0].attachments).toEqual([]);
    expect(sentPayloads[0].html).toContain('Paracetamol');
    expect(sentPayloads[0].text).toContain('Paracetamol');

    // Zero NIC leak in subject, html, text
    expect(sentPayloads[0].subject).not.toContain(TEST_NIC);
    expect(sentPayloads[0].html).not.toContain(TEST_NIC);
    expect(sentPayloads[0].text).not.toContain(TEST_NIC);

    // Duplicate call for same consultation is suppressed by idempotency guard
    const second = await sendConsultationSummaryEmail({
      consultationId: CONSULT_ID,
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      sendMailFn: mockSendMail,
    });
    expect(second.sent).toBe(false);
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe('already_sent');
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  test('2. Attaches consultation_<id>.pdf when PDF_EXPORT_ENABLED is true and never leaks NIC in filename or body', async () => {
    process.env.PDF_EXPORT_ENABLED = 'true';
    const sentPayloads = [];
    const mockSendMail = jest.fn(async (opts) => {
      sentPayloads.push(opts);
      return { success: true, providerAccepted: true, messageId: 'msg-pdf-001' };
    });

    const res = await sendConsultationSummaryEmail({
      consultationId: CONSULT_ID,
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      sendMailFn: mockSendMail,
    });

    expect(res.sent).toBe(true);
    expect(res.pdfAttached).toBe(true);
    expect(sentPayloads[0].attachments).toHaveLength(1);
    expect(sentPayloads[0].attachments[0].filename).toBe('consultation_CONS-2026-0091.pdf');
    expect(sentPayloads[0].attachments[0].filename).not.toContain(TEST_NIC);
    expect(sentPayloads[0].attachments[0].content.slice(0, 5).toString('ascii')).toBe('%PDF-');
  });

  test('3. Retries transient email failure with exponential backoff, logs code only without PII, and never blocks consultation save', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const mockSendMail = jest.fn(async () => ({
      success: false,
      providerAccepted: false,
      errorCode: 'temporary_provider_failure',
    }));

    const emailOutcome = await sendConsultationSummaryEmail({
      consultationId: CONSULT_ID,
      patientId: PATIENT_ID,
      doctorId: DOCTOR_ID,
      retryBaseDelayMs: 5,
      maxAttempts: 3,
      sendMailFn: mockSendMail,
    });

    expect(emailOutcome.sent).toBe(false);
    expect(emailOutcome.attempts).toBe(3);
    expect(mockSendMail).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledWith('[CONSULTATION_EMAIL] Delivery failed: code=temporary_provider_failure');
    const allLogs = warnSpy.mock.calls.map((c) => c.join(' ')).join(' ');
    expect(allLogs).not.toContain(TEST_NIC);
    expect(allLogs).not.toContain('kasun.patient@medisync.local');

    // Verify clinicalCommandController save still succeeds with 201 even if notify throws
    const handler = createConsultationHandler({
      execute: async () => ({
        result: { consultationId: CONSULT_ID, prescriptionIds: [], labTestIds: [] },
        replayed: false,
        commandId: 'cmd-201',
      }),
      prescriptions: async () => [],
      labs: async () => [],
      notify: () => {
        throw new Error('simulated email crash');
      },
    });
    const res = mockRes();
    await handler(
      { user: { id: DOCTOR_ID }, clinicalAuthorization: { patientId: PATIENT_ID } },
      res
    );
    expect(res.statusCode).toBe(201);
    expect(res.body.consultationId).toBe(CONSULT_ID);
  });

  test('4. Resend summary email endpoint allows owner patient, rejects other patient (403), and enforces rate limit (429)', async () => {
    // Non-owner patient -> 403
    const forbiddenRes = mockRes();
    await resendConsultationSummaryEmail(
      { params: { id: CONSULT_ID }, user: { id: OTHER_PATIENT_ID, role: 'patient' } },
      forbiddenRes
    );
    expect(forbiddenRes.statusCode).toBe(403);

    // Owner patient first resend -> 200
    const okRes = mockRes();
    await resendConsultationSummaryEmail(
      { params: { id: CONSULT_ID }, user: { id: PATIENT_ID, role: 'patient' } },
      okRes
    );
    expect(okRes.statusCode).toBe(200);
    expect(okRes.body.sent).toBe(true);

    // Immediate second resend within cooldown -> 429
    const rateLimitedRes = mockRes();
    await resendConsultationSummaryEmail(
      { params: { id: CONSULT_ID }, user: { id: PATIENT_ID, role: 'patient' } },
      rateLimitedRes
    );
    expect(rateLimitedRes.statusCode).toBe(429);
    expect(rateLimitedRes.body.retryAfterSeconds).toBeGreaterThan(0);

    // Verify window rate limit (maxPerWindow = 3 with cooldownMs = 0)
    const key = 'WINDOW_TEST_CONS';
    expect(checkResendRateLimit(PATIENT_ID, key, { cooldownMs: 0, maxPerWindow: 2 }).allowed).toBe(true);
    expect(checkResendRateLimit(PATIENT_ID, key, { cooldownMs: 0, maxPerWindow: 2 }).allowed).toBe(true);
    const third = checkResendRateLimit(PATIENT_ID, key, { cooldownMs: 0, maxPerWindow: 2 });
    expect(third.allowed).toBe(false);
    expect(third.statusCode).toBe(429);
  });

  test('5. Consultation PDF and Lab Report PDF return 503 when flag is off and stream valid PDF with NIC-free headers when flag is on', async () => {
    // 5a. Flag OFF -> 503 PDF_EXPORT_UNAVAILABLE
    const holdConsultRes = mockRes();
    await exportConsultationPdf(
      { params: { id: CONSULT_ID }, user: { id: PATIENT_ID, role: 'patient' }, headers: {} },
      holdConsultRes
    );
    expect(holdConsultRes.statusCode).toBe(503);
    expect(holdConsultRes.body.code).toBe('PDF_EXPORT_UNAVAILABLE');

    // 5b. Flag ON -> 200 valid PDF with consultation prescriptions loaded
    process.env.PDF_EXPORT_ENABLED = 'true';
    const pdfConsultRes = mockRes();
    await exportConsultationPdf(
      { params: { id: CONSULT_ID }, user: { id: PATIENT_ID, role: 'patient' }, headers: {} },
      pdfConsultRes
    );
    expect(pdfConsultRes.statusCode).toBe(200);
    expect(pdfConsultRes.headers['Content-Type']).toBe('application/pdf');
    expect(pdfConsultRes.headers['Content-Disposition']).not.toContain(TEST_NIC);
    expect(Buffer.from(pdfConsultRes.body).slice(0, 5).toString('ascii')).toBe('%PDF-');

    // 5c. Lab report PDF with legacy NIC-only LabTest record and JWT without req.user.nic
    labController._findLabTestByIdentifier = jest.fn().mockResolvedValue({
      _id: '507f1f77bcf86cd799439088',
      reportId: 'LAB-2026-7788',
      patientNic: TEST_NIC,
      testName: 'Full Blood Count',
      status: 'completed',
      results: 'Platelets 145,000 /uL',
    });

    const labPdfRes = mockRes();
    await labController.exportLabReportPdf(
      { params: { id: 'LAB-2026-7788' }, user: { id: PATIENT_ID, role: 'patient' }, headers: {} },
      labPdfRes
    );
    expect(labPdfRes.statusCode).toBe(200);
    expect(labPdfRes.headers['Content-Type']).toBe('application/pdf');
    expect(labPdfRes.headers['Content-Disposition']).not.toContain(TEST_NIC);
    expect(Buffer.from(labPdfRes.body).slice(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
