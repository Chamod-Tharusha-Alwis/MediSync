'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

jest.mock('uuid', () => ({ v4: () => 'mock-uuid-1234' }));

jest.mock('../src/utils/emailService', () => ({
  sendOTPEmail: jest.fn().mockResolvedValue({ providerAccepted: true, provider: 'resend' }),
}));

jest.mock('../src/utils/pdfGenerator', () => ({
  generatePatientHistoryPDF: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock history pdf')),
  generateConsultationReportPDF: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock consultation report pdf')),
  generateLabReportPDF: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock lab report pdf')),
}));

jest.mock('../src/services/labReportStorage', () => ({
  downloadStoredReport: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 stored lab report pdf')),
}));

const {
  verifyOtpAndUnlock,
  downloadConsultationPdfWithSessionGate,
  getLabTestsForVerification,
  downloadLabReportForVerification,
} = require('../src/controllers/verificationController');

const { checkMedicineSafety } = require('../src/controllers/prescriptionController');

const VerificationToken = require('../src/models/VerificationToken');
const OTPSession = require('../src/models/OTPSession');
const Patient = require('../src/models/Patient');
const Consultation = require('../src/models/Consultation');
const Prescription = require('../src/models/Prescription');
const LabTest = require('../src/models/LabTest');
const AuditLog = require('../src/models/AuditLog');
const pdfGenerator = require('../src/utils/pdfGenerator');

describe('Post-Rehearsal Fixes Verification Suite (Fix 3, Fix 4, Fix 5, Fix 6)', () => {
  const patientId = '507f1f77bcf86cd799439001';
  const doctorId = '507f1f77bcf86cd799439002';
  const encounterId1 = '507f1f77bcf86cd799439003';
  const encounterId2 = '507f1f77bcf86cd799439004';
  const labTestId1 = '507f1f77bcf86cd799439005';
  const labTestId2 = '507f1f77bcf86cd799439006';

  const mockPatient = {
    _id: patientId,
    fullName: 'Perera Nimal',
    nic: '200012345678',
    decryptFieldsSync: jest.fn(),
  };

  const mockConsultation1 = {
    _id: encounterId1,
    consultationId: 'CON-TEST-0001',
    createdAt: new Date('2026-11-10T08:00:00.000Z'),
    diagnosis: 'Acute Bronchitis',
    symptoms: ['Cough', 'Fever'],
    doctorId: { _id: doctorId, fullName: 'Dr. Fernando', slmcNumber: 'SLMC-12345' },
    decryptFieldsSync: jest.fn(),
  };

  const mockConsultation2Unrelated = {
    _id: encounterId2,
    consultationId: 'CON-SECRET-9999',
    createdAt: new Date('2026-10-01T08:00:00.000Z'),
    diagnosis: 'Confidential Psychiatric Followup',
    symptoms: ['Anxiety'],
  };

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const mockTokenRecord = {
    _id: '507f1f77bcf86cd799439007',
    tokenHash,
    consultationId: mockConsultation1,
    patientRef: mockPatient,
    doctorRef: { _id: doctorId, fullName: 'Dr. Fernando' },
    expiresAt: new Date(Date.now() + 86400000),
    revokedAt: null,
  };

  function createFindOneQuery(result) {
    return {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve(resolve(result)),
    };
  }

  let validSessionToken;

  beforeAll(() => {
    validSessionToken = jwt.sign(
      {
        purpose: 'qr_view_session',
        tokenHash,
        patientId,
      },
      process.env.JWT_SECRET || 'medisync_session_secret_local',
      { expiresIn: '10m', algorithm: 'HS256' }
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Fix 3: Scoped Single Consultation PDF
  // =========================================================================
  describe('Fix 3: Consultation Report PDF Scoped to Single Encounter', () => {
    test('serves strictly the verified encounter and passes zero data from other patient consultations', async () => {
      jest.spyOn(VerificationToken, 'findOne').mockImplementation(() => createFindOneQuery(mockTokenRecord));
      jest.spyOn(Patient, 'findById').mockResolvedValue(mockPatient);
      jest.spyOn(Prescription, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { drugName: 'Amoxicillin', dosage: '500mg', frequency: 'TDS', durationDays: 5, status: 'dispensed' },
        ]),
      });
      jest.spyOn(LabTest, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { testName: 'Full Blood Count', category: 'Hematology', status: 'completed' },
        ]),
      });

      const req = {
        params: { token: rawToken },
        headers: { authorization: `Bearer ${validSessionToken}` },
        query: { lang: 'en' },
        body: { sessionToken: validSessionToken },
      };
      const res = {
        set: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await downloadConsultationPdfWithSessionGate(req, res);

      expect(res.status).not.toHaveBeenCalledWith(401);
      expect(res.status).not.toHaveBeenCalledWith(403);
      expect(res.status).not.toHaveBeenCalledWith(404);
      expect(pdfGenerator.generateConsultationReportPDF).toHaveBeenCalledTimes(1);

      const [calledPatient, calledConsultation, calledRx, calledLabs] =
        pdfGenerator.generateConsultationReportPDF.mock.calls[0];

      // Verifies patient details match
      expect(calledPatient.nic).toBe('200012345678');
      // Verifies ONLY encounter 1 was passed
      expect(calledConsultation.consultationId).toBe('CON-TEST-0001');
      expect(JSON.stringify(calledConsultation)).not.toContain('CON-SECRET-9999');
      expect(JSON.stringify(calledConsultation)).not.toContain('Psychiatric');

      // Verifies prescription and lab were scoped
      expect(calledRx).toHaveLength(1);
      expect(calledRx[0].drugName).toBe('Amoxicillin');
      expect(calledLabs).toHaveLength(1);
      expect(calledLabs[0].testName).toBe('Full Blood Count');

      // Verifies filename format
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Disposition': 'attachment; filename="MediSync-Consultation-CON-TEST-0001.pdf"',
        })
      );
    });

    test('rejects full-history export requests with 403 and explicit clinical message', async () => {
      jest.spyOn(VerificationToken, 'findOne').mockImplementation(() => createFindOneQuery(mockTokenRecord));
      jest.spyOn(Patient, 'findById').mockResolvedValue(mockPatient);

      const req = {
        params: { token: rawToken },
        headers: { authorization: `Bearer ${validSessionToken}` },
        body: { sessionToken: validSessionToken, scope: 'full_history' },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await downloadConsultationPdfWithSessionGate(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'FULL_HISTORY_CONSENT_REQUIRED',
        })
      );
    });
  });

  // =========================================================================
  // Fix 4: Laboratory Tests on Public Verification Page
  // =========================================================================
  describe('Fix 4: Laboratory Tests Inspection and Report Download', () => {
    test('getLabTestsForVerification returns only tests for the token consultation when session is valid', async () => {
      jest.spyOn(VerificationToken, 'findOne').mockImplementation(() => createFindOneQuery(mockTokenRecord));
      jest.spyOn(LabTest, 'find').mockReturnValue({
        sort: jest.fn().mockResolvedValue([
          {
            _id: labTestId1,
            labTestId: 'LAB-2026-0001',
            testName: 'Dengue NS1 Antigen',
            category: 'Serology',
            status: 'completed',
            createdAt: new Date(),
            completedAt: new Date(),
            results: 'Negative',
            reportFile: { url: 'https://example.invalid/report.pdf' },
          },
        ]),
      });

      const req = {
        params: { token: rawToken },
        headers: { authorization: `Bearer ${validSessionToken}` },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await getLabTestsForVerification(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        labTests: [
          expect.objectContaining({
            testName: 'Dengue NS1 Antigen',
            status: 'completed',
            hasReport: true,
          }),
        ],
      });
    });

    test('downloadLabReportForVerification blocks lab test from another consultation with 403', async () => {
      jest.spyOn(VerificationToken, 'findOne').mockImplementation(() => createFindOneQuery(mockTokenRecord));
      jest.spyOn(LabTest, 'findById').mockResolvedValue({
        _id: labTestId2,
        consultationId: encounterId2, // Belongs to encounter 2, not encounter 1!
        status: 'completed',
        reportFile: { url: 'https://example.invalid/unrelated.pdf' },
      });

      const req = {
        params: { token: rawToken, labTestId: labTestId2 },
        headers: { authorization: `Bearer ${validSessionToken}` },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await downloadLabReportForVerification(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'FORBIDDEN_LAB_ACCESS',
        })
      );
    });

    test('downloadLabReportForVerification serves PDF for valid completed lab test', async () => {
      jest.spyOn(VerificationToken, 'findOne').mockImplementation(() => createFindOneQuery(mockTokenRecord));
      jest.spyOn(LabTest, 'findById').mockResolvedValue({
        _id: labTestId1,
        labTestId: 'LAB-001',
        consultationId: encounterId1,
        status: 'completed',
        reportFile: { data: Buffer.from('%PDF-1.4 test') },
      });

      const req = {
        params: { token: rawToken, labTestId: labTestId1 },
        headers: { authorization: `Bearer ${validSessionToken}` },
      };
      const res = {
        set: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await downloadLabReportForVerification(req, res);

      expect(res.send).toHaveBeenCalled();
      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Disposition': 'attachment; filename="MediSync-LabReport-LAB-001.pdf"',
        })
      );
    });
  });

  // =========================================================================
  // Fix 5: Cross-Medication Safety Check & Decryption
  // =========================================================================
  describe('Fix 5: Medication Safety DDI Review and Decryption', () => {
    test('checkMedicineSafety decrypts active prescription fields and evaluates DDI', async () => {
      jest.spyOn(Patient, 'findById').mockResolvedValue(mockPatient);

      const mockActivePrescription = {
        _id: '507f1f77bcf86cd799439010',
        drugName: 'Warfarin',
        medications: [{ name: 'Warfarin', dosage: '5mg' }],
        consultationRef: 'CON-001',
        decryptFieldsSync: jest.fn(),
      };

      jest.spyOn(Prescription, 'find').mockReturnValue({
        select: jest.fn().mockResolvedValue([mockActivePrescription]),
      });

      const req = {
        body: {
          medications: [{ name: 'Ciprofloxacin', dosage: '500mg' }],
          patientId,
          patientNic: '200012345678',
        },
        user: { _id: doctorId, role: 'doctor' },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await checkMedicineSafety(req, res);

      expect(mockActivePrescription.decryptFieldsSync).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalled();
      const responseData = res.json.mock.calls[0][0];

      // Must detect major interaction between Ciprofloxacin and Warfarin
      expect(responseData.findings.length).toBeGreaterThan(0);
      const ddiFinding = responseData.findings.find(
        (f) => f.type === 'drug_interaction' || (f.message && f.message.toLowerCase().includes('warfarin'))
      );
      expect(ddiFinding).toBeDefined();
    });
  });

  // =========================================================================
  // Fix 6: 5-Wrong-OTP Lockout
  // =========================================================================
  describe('Fix 6: 5-Wrong-OTP Lockout on /verify/:token', () => {
    test('reproduces 5 failed attempts, confirms lockout on 5th attempt, and blocks 6th attempt with 429 OTP_LOCKED', async () => {
      jest.spyOn(VerificationToken, 'findOne').mockImplementation(() => createFindOneQuery(mockTokenRecord));

      const hashedCorrectOtp = await bcrypt.hash('123456', 10);
      const sessionDoc = {
        _id: '507f1f77bcf86cd799439099',
        userId: patientId,
        purpose: 'qr_view',
        otp: hashedCorrectOtp,
        failedAttempts: 0,
        used: false,
        metadata: { tokenHash, maxAttempts: 5 },
        expiresAt: new Date(Date.now() + 600000),
        save: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(OTPSession, 'findOne').mockReturnValue({
        sort: jest.fn().mockResolvedValue(sessionDoc),
      });

      jest.spyOn(OTPSession, 'findOneAndUpdate').mockImplementation(async (query, update) => {
        if (sessionDoc.failedAttempts >= (process.env.VERIFY_OTP_MAX_ATTEMPTS || 5)) {
          return null;
        }
        if (update.$inc && update.$inc.failedAttempts) {
          sessionDoc.failedAttempts += update.$inc.failedAttempts;
        }
        return sessionDoc;
      });

      jest.spyOn(OTPSession, 'updateOne').mockImplementation(async (query, update) => {
        if (update.$set) Object.assign(sessionDoc, update.$set);
        return { modifiedCount: 1 };
      });

      const makeAttempt = async (code) => {
        const req = {
          params: { token: rawToken },
          body: { otp: code },
        };
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn(),
        };
        await verifyOtpAndUnlock(req, res);
        return { status: res.status.mock.calls[0][0], data: res.json.mock.calls[0][0] };
      };

      // Attempts 1 to 4: Should return 401 with decreasing remaining attempts
      for (let i = 1; i <= 4; i++) {
        const result = await makeAttempt('000000');
        expect(result.status).toBe(401);
        expect(result.data.error).toBe('INVALID_OTP');
        expect(result.data.attemptsRemaining).toBe(5 - i);
      }

      // Attempt 5: 5th failure consumes remaining attempts, locks session, and returns 0 attempts remaining
      const attempt5 = await makeAttempt('000000');
      expect(attempt5.status).toBe(401);
      expect(attempt5.data.error).toBe('INVALID_OTP');
      expect(attempt5.data.attemptsRemaining).toBe(0);
      expect(sessionDoc.used).toBe(true);
      expect(sessionDoc.metadata.locked).toBe(true);

      // Attempt 6: Any subsequent attempt on locked session immediately returns 429 OTP_LOCKED
      const attempt6 = await makeAttempt('000000');
      expect(attempt6.status).toBe(429);
      expect(attempt6.data.error).toBe('OTP_LOCKED');
      expect(attempt6.data.attemptsRemaining).toBe(0);
    });
  });
});
