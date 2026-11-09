'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Mock email service before loading controller
jest.mock('../src/utils/emailService', () => ({
  sendOTPEmail: jest.fn().mockResolvedValue({
    providerAccepted: true,
    provider: 'resend',
  }),
}));

// Mock PDF generator to return mock PDF buffer
jest.mock('../src/utils/pdfGenerator', () => ({
  generatePatientHistoryPDF: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock pdf data')),
}));

const { computeReleaseSummary } = require('../src/services/releaseSummaryService');
const {
  getVerificationPublicStatus,
  requestVerificationOtp,
  verifyOtpAndUnlock,
  downloadHistoryPdfWithNicGate,
} = require('../src/controllers/verificationController');

const VerificationToken = require('../src/models/VerificationToken');
const OTPSession = require('../src/models/OTPSession');
const Patient = require('../src/models/Patient');
const Consultation = require('../src/models/Consultation');
const Prescription = require('../src/models/Prescription');
const Dispensing = require('../src/models/Dispensing');
const emailService = require('../src/utils/emailService');

describe('Phase 2 — OTP-Gated QR Verification Portal & Release Summary Suite', () => {
  const dummyTokenString = 'a'.repeat(64);
  const tokenHash = crypto.createHash('sha256').update(dummyTokenString).digest('hex');

  const mockPatientId = '507f1f77bcf86cd799439011';
  const mockConsultationId = '507f1f77bcf86cd799439012';
  const mockDoctorId = '507f1f77bcf86cd799439013';
  const mockTokenRecordId = '507f1f77bcf86cd799439014';

  const mockPatient = {
    _id: mockPatientId,
    fullName: 'Kamal Perera',
    email: 'kamal.perera@example.com',
    gender: 'Male',
    dateOfBirth: new Date('1990-05-15'),
    bloodGroup: 'O+',
    allergies: ['Amoxicillin'],
    nic: '199013501234',
    decryptFieldsSync: jest.fn(),
  };

  const mockDoctor = {
    _id: mockDoctorId,
    fullName: 'Dr. Sarah Perera',
  };

  const mockConsultation = {
    _id: mockConsultationId,
    consultationId: 'CON-202611-998877',
    createdAt: new Date('2026-11-09T08:00:00.000Z'),
    diagnosis: 'Acute Viral Pharyngitis',
    icdCode: 'J02.9',
    icdDescription: 'Acute pharyngitis, unspecified',
    notes: 'Prescribed symptomatic relief and rest.',
    district: 'Colombo',
    symptoms: ['Sore throat', 'Fever'],
    sessionHospitalId: 'Colombo General Hospital',
    isFollowUpRequired: true,
    followUpDate: new Date('2026-11-16T00:00:00.000Z'),
    vitals: { bloodPressure: '120/80', pulseRate: 74, temperature: 37.8, spO2: 99 },
    decryptFieldsSync: jest.fn(),
  };

  const mockTokenRecord = {
    _id: mockTokenRecordId,
    tokenHash,
    consultationId: mockConsultation,
    patientRef: mockPatient,
    doctorRef: mockDoctor,
    consultationRef: 'CON-202611-998877',
    expiresAt: new Date(Date.now() + 90 * 24 * 3600 * 1000),
    revokedAt: null,
    save: jest.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Release Summary Computation Service', () => {
    test('returns empty not_released structure if consultationId is missing', async () => {
      const summary = await computeReleaseSummary(null);
      expect(summary).toEqual({
        overallStatus: 'not_released',
        items: [],
        dispensings: [],
      });
    });

    test('computes released status with pharmacy and pharmacist name when dispensed', async () => {
      jest.spyOn(Prescription, 'find').mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockResolvedValue([
            {
              _id: 'rx-1',
              prescriptionId: 'RX-20261109-111111',
              drugName: 'Paracetamol 500mg',
              dosage: '500mg',
              frequency: 'TDS',
              durationDays: 3,
              status: 'dispensed',
              dispensedAt: new Date('2026-11-09T09:00:00.000Z'),
              dispensedByPharmacist: 'Sunil Shantha',
              pharmacyName: 'City Pharmacy',
              isAlternativeDispensed: false,
              decryptFieldsSync: jest.fn(),
            },
          ]),
        }),
      });

      jest.spyOn(Dispensing, 'find').mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([
                {
                  prescriptionId: 'rx-1',
                  receiptNumber: 'REC-001',
                  dispensedAt: new Date('2026-11-09T09:00:00.000Z'),
                  pharmacyId: { name: 'City Pharmacy', district: 'Colombo' },
                  staffId: { fullName: 'Sunil Shantha', role: 'pharmacist' },
                  items: [{ drugName: 'Paracetamol 500mg', dosage: '500mg', quantityDispensed: 10, status: 'dispensed' }],
                },
              ]),
            }),
          }),
        }),
      });

      const summary = await computeReleaseSummary('test-consultation-id');
      expect(summary.overallStatus).toBe('released');
      expect(summary.items).toHaveLength(1);
      expect(summary.items[0]).toMatchObject({
        drugName: 'Paracetamol 500mg',
        released: true,
        pharmacy: { name: 'City Pharmacy', district: 'Colombo' },
        releasedBy: { name: 'Sunil Shantha' },
      });
      expect(summary.dispensings).toHaveLength(1);
      expect(summary.dispensings[0].receiptNo).toBe('REC-001');

      Prescription.find.mockRestore();
      Dispensing.find.mockRestore();
    });
  });

  describe('2. Public Authenticity Endpoint (GET /api/verify/:token)', () => {
    test('returns authentic metadata with masked contact hint, zero clinical notes, and zero PII', async () => {
      jest.spyOn(VerificationToken, 'findOne').mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockTokenRecord),
          }),
        }),
      });

      const req = { params: { token: dummyTokenString } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await getVerificationPublicStatus(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          valid: true,
          authentic: true,
          consultationRef: 'CON-202611-998877',
          doctorName: 'Dr. Sarah Perera',
          maskedContact: 'ka***@example.com',
          clinicalValidation: 'not_established',
          requiresOtpForClinical: true,
        })
      );

      // Verify zero patient PII leaked
      const responseData = res.json.mock.calls[0][0];
      expect(responseData.patientName).toBeUndefined();
      expect(responseData.nic).toBeUndefined();
      expect(responseData.diagnosis).toBeUndefined();
      expect(responseData.prescriptions).toBeUndefined();

      VerificationToken.findOne.mockRestore();
    });

    test('returns 410 for revoked token', async () => {
      const revokedRecord = {
        ...mockTokenRecord,
        revokedAt: new Date(),
        revocationReason: 'Revoked by clinician',
      };
      jest.spyOn(VerificationToken, 'findOne').mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(revokedRecord),
          }),
        }),
      });

      const req = { params: { token: dummyTokenString } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await getVerificationPublicStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(410);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          valid: false,
          authentic: false,
          reason: 'TOKEN_REVOKED',
        })
      );

      VerificationToken.findOne.mockRestore();
    });
  });

  describe('3. OTP Request Endpoint (POST /api/verify/:token/otp/request)', () => {
    test('dispatches OTP via email and returns success with 60s cooldown', async () => {
      jest.spyOn(VerificationToken, 'findOne').mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockTokenRecord),
          }),
        }),
      });

      jest.spyOn(OTPSession, 'deleteMany').mockResolvedValue({ deletedCount: 1 });
      jest.spyOn(OTPSession, 'create').mockResolvedValue({ _id: 'otp-session-1' });

      const req = { params: { token: dummyTokenString }, ip: '127.0.0.1' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await requestVerificationOtp(req, res);

      expect(emailService.sendOTPEmail).toHaveBeenCalledWith(
        'kamal.perera@example.com',
        expect.any(String),
        expect.stringMatching(/^\d{6}$/),
        expect.objectContaining({ lang: 'en' })
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          maskedContact: 'ka***@example.com',
          cooldownSeconds: 60,
        })
      );

      VerificationToken.findOne.mockRestore();
      OTPSession.deleteMany.mockRestore();
      OTPSession.create.mockRestore();
    });

    test('enforces 60s cooldown on immediate subsequent request', async () => {
      jest.spyOn(VerificationToken, 'findOne').mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockTokenRecord),
          }),
        }),
      });

      const req = { params: { token: dummyTokenString }, ip: '127.0.0.1' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      // Immediate second call uses in-memory tracker
      await requestVerificationOtp(req, res);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'COOLDOWN_ACTIVE',
        })
      );

      VerificationToken.findOne.mockRestore();
    });
  });

  describe('4. OTP Verify & Unlock Endpoint (POST /api/verify/:token/otp/verify)', () => {
    test('rejects wrong OTP, increments failedAttempts and returns remaining attempts', async () => {
      const realOtp = '765432';
      const hashedOtp = await bcrypt.hash(realOtp, 10);

      const mockSession = {
        _id: 'otp-session-1',
        otp: hashedOtp,
        failedAttempts: 0,
        used: false,
        expiresAt: new Date(Date.now() + 300000),
        metadata: { tokenHash },
        save: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(VerificationToken, 'findOne').mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockTokenRecord),
          }),
        }),
      });

      jest.spyOn(OTPSession, 'findOne').mockResolvedValue(mockSession);

      const req = { params: { token: dummyTokenString }, body: { otp: '000000' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), set: jest.fn() };

      await verifyOtpAndUnlock(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockSession.failedAttempts).toBe(1);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'INVALID_OTP',
          attemptsRemaining: 2,
        })
      );

      VerificationToken.findOne.mockRestore();
      OTPSession.findOne.mockRestore();
    });

    test('locks out session when 3 failed attempts are reached', async () => {
      const realOtp = '765432';
      const hashedOtp = await bcrypt.hash(realOtp, 10);

      const mockSession = {
        _id: 'otp-session-1',
        otp: hashedOtp,
        failedAttempts: 2, // 2 prior failed attempts
        used: false,
        expiresAt: new Date(Date.now() + 300000),
        metadata: { tokenHash },
        save: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(VerificationToken, 'findOne').mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockTokenRecord),
          }),
        }),
      });

      jest.spyOn(OTPSession, 'findOne').mockResolvedValue(mockSession);

      const req = { params: { token: dummyTokenString }, body: { otp: '999999' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), set: jest.fn() };

      await verifyOtpAndUnlock(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockSession.failedAttempts).toBe(3);
      expect(mockSession.used).toBe(true);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'INVALID_OTP',
          attemptsRemaining: 0,
        })
      );

      VerificationToken.findOne.mockRestore();
      OTPSession.findOne.mockRestore();
    });

    test('correct OTP unlocks clinical & release data, issues sessionToken, and sets no-store headers', async () => {
      const realOtp = '827103';
      const hashedOtp = await bcrypt.hash(realOtp, 10);

      const mockSession = {
        _id: 'otp-session-1',
        otp: hashedOtp,
        failedAttempts: 0,
        used: false,
        expiresAt: new Date(Date.now() + 300000),
        metadata: { tokenHash },
        save: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(VerificationToken, 'findOne').mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockTokenRecord),
          }),
        }),
      });

      jest.spyOn(OTPSession, 'findOne').mockResolvedValue(mockSession);
      jest.spyOn(Consultation, 'findById').mockResolvedValue(mockConsultation);
      jest.spyOn(Patient, 'findById').mockResolvedValue(mockPatient);

      // Mock Prescription & Dispensing for release summary
      jest.spyOn(Prescription, 'find').mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockResolvedValue([
            {
              _id: 'rx-1',
              drugName: 'Paracetamol 500mg',
              dosage: '500mg',
              frequency: 'TDS',
              durationDays: 3,
              status: 'dispensed',
              dispensedAt: new Date('2026-11-09T09:00:00.000Z'),
              dispensedByPharmacist: 'Sunil Shantha',
              pharmacyName: 'Colombo Central Pharmacy',
              isAlternativeDispensed: false,
              decryptFieldsSync: jest.fn(),
            },
          ]),
        }),
      });

      jest.spyOn(Dispensing, 'find').mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              lean: jest.fn().mockResolvedValue([
                {
                  prescriptionId: 'rx-1',
                  receiptNumber: 'REC-999',
                  dispensedAt: new Date('2026-11-09T09:00:00.000Z'),
                  pharmacyId: { name: 'Colombo Central Pharmacy', district: 'Colombo' },
                  staffId: { fullName: 'Sunil Shantha' },
                  items: [{ drugName: 'Paracetamol 500mg', dosage: '500mg', quantityDispensed: 10, status: 'dispensed' }],
                },
              ]),
            }),
          }),
        }),
      });

      const req = { params: { token: dummyTokenString }, body: { otp: realOtp } };
      const headersSet = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        set: jest.fn((headers) => Object.assign(headersSet, headers)),
      };

      await verifyOtpAndUnlock(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockSession.used).toBe(true);

      // Check strict no-store headers
      expect(headersSet['Cache-Control']).toContain('no-store');

      const data = res.json.mock.calls[0][0];
      expect(data.success).toBe(true);
      expect(data.sessionToken).toBeDefined();
      expect(data.expiresInSeconds).toBe(600);

      // Clinical shape checks
      expect(data.clinical.consultation.reference).toBe('CON-202611-998877');
      expect(data.clinical.patient.name).toBe('Kamal Perera');
      expect(data.clinical.diagnosis.icdCode).toBe('J02.9');
      expect(data.clinical.diagnosis.text).toBe('Acute Viral Pharyngitis');

      // Release shape checks
      expect(data.release.overallStatus).toBe('released');
      expect(data.release.items[0].released).toBe(true);
      expect(data.release.items[0].releasedBy.name).toBe('Sunil Shantha');
      expect(data.release.dispensings[0].receiptNo).toBe('REC-999');

      VerificationToken.findOne.mockRestore();
      OTPSession.findOne.mockRestore();
      Consultation.findById.mockRestore();
      Patient.findById.mockRestore();
      Prescription.find.mockRestore();
      Dispensing.find.mockRestore();
    });
  });

  describe('5. Authorized PDF History Download Gate (POST /api/verify/:token/history-pdf)', () => {
    test('rejects request without session token or NIC with 401', async () => {
      jest.spyOn(VerificationToken, 'findOne').mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockTokenRecord),
          }),
        }),
      });
      jest.spyOn(Patient, 'findById').mockResolvedValue(mockPatient);

      const req = { params: { token: dummyTokenString }, headers: {}, body: {} };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), set: jest.fn() };

      await downloadHistoryPdfWithNicGate(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'VERIFICATION_FAILED',
        })
      );

      VerificationToken.findOne.mockRestore();
      Patient.findById.mockRestore();
    });

    test('accepts valid in-memory view session token and returns PDF stream with no-store headers', async () => {
      jest.spyOn(VerificationToken, 'findOne').mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockTokenRecord),
          }),
        }),
      });
      jest.spyOn(Patient, 'findById').mockResolvedValue(mockPatient);
      jest.spyOn(Consultation, 'find').mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([mockConsultation]),
          }),
        }),
      });
      jest.spyOn(Prescription, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      });

      // Generate valid view session JWT
      const jwtSecret = process.env.JWT_SECRET || 'medisync_session_secret_local';
      const validSessionJwt = jwt.sign(
        {
          purpose: 'qr_view_session',
          tokenHash,
          patientId: mockPatientId,
        },
        jwtSecret,
        { expiresIn: '10m', algorithm: 'HS256' }
      );

      const req = {
        params: { token: dummyTokenString },
        headers: { authorization: `Bearer ${validSessionJwt}` },
        body: {},
      };
      const headersSet = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        set: jest.fn((headers) => Object.assign(headersSet, headers)),
        send: jest.fn(),
      };

      await downloadHistoryPdfWithNicGate(req, res);

      expect(headersSet['Content-Type']).toBe('application/pdf');
      expect(headersSet['Cache-Control']).toContain('no-store');
      expect(res.send).toHaveBeenCalled();

      VerificationToken.findOne.mockRestore();
      Patient.findById.mockRestore();
      Consultation.find.mockRestore();
      Prescription.find.mockRestore();
    });
  });
});
