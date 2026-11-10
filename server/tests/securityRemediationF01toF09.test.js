'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

jest.mock('../src/utils/emailService', () => ({
  sendOTPEmail: jest.fn().mockResolvedValue({ providerAccepted: true, provider: 'resend' }),
}));

jest.mock('../src/utils/pdfGenerator', () => ({
  generatePatientHistoryPDF: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock pdf data')),
}));

const {
  revokeVerificationToken,
  downloadHistoryPdfWithNicGate,
  verifyOtpAndUnlock,
  requestVerificationOtp,
} = require('../src/controllers/verificationController');

const VerificationToken = require('../src/models/VerificationToken');
const OTPSession = require('../src/models/OTPSession');
const Patient = require('../src/models/Patient');
const Consultation = require('../src/models/Consultation');
const Prescription = require('../src/models/Prescription');
const Dispensing = require('../src/models/Dispensing');
const AuditLog = require('../src/models/AuditLog');
const { recordAudit } = require('../src/utils/auditLogger');
const pdfGenerator = require('../src/utils/pdfGenerator');

describe('Security Remediation Suite (F01–F09 CODEX Review Audit Fixes)', () => {
  const issuingDoctorId = '507f1f77bcf86cd799439001';
  const unrelatedDoctorId = '507f1f77bcf86cd799439002';
  const patientOwnerId = '507f1f77bcf86cd799439003';
  const unrelatedPatientId = '507f1f77bcf86cd799439004';
  const consultationId = '507f1f77bcf86cd799439005';
  const adminId = '507f1f77bcf86cd799439006';

  const mockConsultation = {
    _id: consultationId,
    consultationId: 'CON-VIVA-0001',
    createdAt: new Date(),
    diagnosis: 'Viral Fever',
    symptoms: ['Fever'],
    decryptFieldsSync: jest.fn(),
  };

  const mockPatient = {
    _id: patientOwnerId,
    fullName: 'Perera Nimal',
    nic: '199512345678',
    email: 'nimal@accounts.invalid',
    allergies: ['Aspirin'],
    decryptFieldsSync: jest.fn(),
  };

  function createFreshTokenRecord(rawToken, overrides = {}) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    return {
      _id: '507f1f77bcf86cd799439007',
      tokenHash,
      consultationId: mockConsultation,
      patientRef: mockPatient,
      doctorRef: { _id: issuingDoctorId, fullName: 'Dr. Silva' },
      expiresAt: new Date(Date.now() + 90 * 24 * 3600 * 1000),
      revokedAt: null,
      save: jest.fn().mockResolvedValue(true),
      ...overrides,
    };
  }

  function createFindOneQuery(record) {
    const recCopy = { ...record };
    const p3 = {
      populate: jest.fn().mockResolvedValue(recCopy),
      then: (resolve) => Promise.resolve(recCopy).then(resolve),
      catch: (reject) => Promise.resolve(recCopy).catch(reject),
    };
    const p2 = {
      populate: jest.fn().mockReturnValue(p3),
      then: (resolve) => Promise.resolve(recCopy).then(resolve),
      catch: (reject) => Promise.resolve(recCopy).catch(reject),
    };
    const p1 = {
      populate: jest.fn().mockReturnValue(p2),
      then: (resolve) => Promise.resolve(recCopy).then(resolve),
      catch: (reject) => Promise.resolve(recCopy).catch(reject),
    };
    return p1;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Prescription, 'find').mockReturnValue({
      populate: jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue([]),
      }),
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
      sort: jest.fn().mockResolvedValue([]),
      lean: jest.fn().mockResolvedValue([]),
    });
    jest.spyOn(Dispensing, 'find').mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
      lean: jest.fn().mockResolvedValue([]),
    });
  });

  describe('F01: Verification Token Revocation Authorization & State Verification', () => {
    test('issuing doctor (token.doctorRef) is authorized to revoke', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenRecord = createFreshTokenRecord(rawToken);
      jest.spyOn(VerificationToken, 'findOne').mockImplementation(() => createFindOneQuery(tokenRecord));

      const req = {
        params: { token: rawToken },
        body: { reason: 'Clinical misdiagnosis revised' },
        user: { id: issuingDoctorId, role: 'doctor' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await revokeVerificationToken(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Verification token revoked successfully' })
      );
      VerificationToken.findOne.mockRestore();
    });

    test('unrelated doctor receives 403 UNAUTHORIZED_REVOCATION', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenRecord = createFreshTokenRecord(rawToken);
      jest.spyOn(VerificationToken, 'findOne').mockImplementation(() => createFindOneQuery(tokenRecord));

      const req = {
        params: { token: rawToken },
        body: { reason: 'Malicious revocation attempt' },
        user: { id: unrelatedDoctorId, role: 'doctor' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await revokeVerificationToken(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'UNAUTHORIZED_REVOCATION' })
      );
      VerificationToken.findOne.mockRestore();
    });

    test('patient owner is authorized to revoke', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenRecord = createFreshTokenRecord(rawToken);
      jest.spyOn(VerificationToken, 'findOne').mockImplementation(() => createFindOneQuery(tokenRecord));

      const req = {
        params: { token: rawToken },
        body: { reason: 'Patient opted out of public QR link' },
        user: { id: patientOwnerId, role: 'patient' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await revokeVerificationToken(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Verification token revoked successfully' })
      );
      VerificationToken.findOne.mockRestore();
    });

    test('unrelated patient receives 403 UNAUTHORIZED_REVOCATION', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenRecord = createFreshTokenRecord(rawToken);
      jest.spyOn(VerificationToken, 'findOne').mockImplementation(() => createFindOneQuery(tokenRecord));

      const req = {
        params: { token: rawToken },
        body: {},
        user: { id: unrelatedPatientId, role: 'patient' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await revokeVerificationToken(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'UNAUTHORIZED_REVOCATION' })
      );
      VerificationToken.findOne.mockRestore();
    });

    test('administrator is authorized to revoke with audit record', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenRecord = createFreshTokenRecord(rawToken);
      jest.spyOn(VerificationToken, 'findOne').mockImplementation(() => createFindOneQuery(tokenRecord));

      const req = {
        params: { token: rawToken },
        body: { reason: 'Administrative audit action' },
        user: { id: adminId, role: 'admin' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await revokeVerificationToken(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Verification token revoked successfully' })
      );
      VerificationToken.findOne.mockRestore();
    });

    test('already revoked token returns 409 TOKEN_ALREADY_REVOKED', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenRecord = createFreshTokenRecord(rawToken, { revokedAt: new Date('2026-11-01') });
      jest.spyOn(VerificationToken, 'findOne').mockImplementation(() => createFindOneQuery(tokenRecord));

      const req = {
        params: { token: rawToken },
        body: {},
        user: { id: issuingDoctorId, role: 'doctor' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await revokeVerificationToken(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'TOKEN_ALREADY_REVOKED' })
      );
      VerificationToken.findOne.mockRestore();
    });

    test('expired token returns 410 TOKEN_EXPIRED', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenRecord = createFreshTokenRecord(rawToken, { expiresAt: new Date('2026-01-01') });
      jest.spyOn(VerificationToken, 'findOne').mockImplementation(() => createFindOneQuery(tokenRecord));

      const req = {
        params: { token: rawToken },
        body: {},
        user: { id: issuingDoctorId, role: 'doctor' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await revokeVerificationToken(req, res);

      expect(res.status).toHaveBeenCalledWith(410);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'TOKEN_EXPIRED' })
      );
      VerificationToken.findOne.mockRestore();
    });
  });

  describe('F02: History PDF Gate & Single-Encounter Scope Containment', () => {
    test('strictly rejects request with matching NIC alone (NIC authorization removed)', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenRecord = createFreshTokenRecord(rawToken);
      jest.spyOn(VerificationToken, 'findOne').mockImplementation(() => createFindOneQuery(tokenRecord));
      jest.spyOn(Patient, 'findById').mockResolvedValue(mockPatient);

      const req = {
        params: { token: rawToken },
        body: { nic: '199512345678' }, // Correct patient NIC
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await downloadHistoryPdfWithNicGate(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'VERIFICATION_FAILED',
          reason: 'UNAUTHORIZED_VIEW_SESSION',
        })
      );
      VerificationToken.findOne.mockRestore();
      Patient.findById.mockRestore();
    });

    test('returns 403 FULL_HISTORY_CONSENT_REQUIRED when full-history export is requested', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenRecord = createFreshTokenRecord(rawToken);
      jest.spyOn(VerificationToken, 'findOne').mockImplementation(() => createFindOneQuery(tokenRecord));
      jest.spyOn(Patient, 'findById').mockResolvedValue(mockPatient);

      const jwtSecret = process.env.JWT_SECRET || 'medisync_session_secret_local';
      const validToken = jwt.sign(
        { purpose: 'qr_view_session', tokenHash: tokenRecord.tokenHash, patientId: patientOwnerId },
        jwtSecret
      );

      const req = {
        params: { token: rawToken },
        headers: { authorization: `Bearer ${validToken}` },
        body: { scope: 'full_history' },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await downloadHistoryPdfWithNicGate(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'FULL_HISTORY_CONSENT_REQUIRED',
        })
      );
      VerificationToken.findOne.mockRestore();
      Patient.findById.mockRestore();
    });

    test('limits export strictly to the QR token encounter and retains SECURITY_HOLD behavior', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenRecord = createFreshTokenRecord(rawToken);
      jest.spyOn(VerificationToken, 'findOne').mockImplementation(() => createFindOneQuery(tokenRecord));
      jest.spyOn(Patient, 'findById').mockResolvedValue(mockPatient);

      // Simulate SECURITY_HOLD from PDF generator
      pdfGenerator.generatePatientHistoryPDF.mockRejectedValueOnce({ code: 'SECURITY_HOLD' });

      const jwtSecret = process.env.JWT_SECRET || 'medisync_session_secret_local';
      const validToken = jwt.sign(
        { purpose: 'qr_view_session', tokenHash: tokenRecord.tokenHash, patientId: patientOwnerId },
        jwtSecret
      );

      const req = {
        params: { token: rawToken },
        headers: { authorization: `Bearer ${validToken}` },
        body: {},
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await downloadHistoryPdfWithNicGate(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'PDF_EXPORT_UNAVAILABLE',
        })
      );
      VerificationToken.findOne.mockRestore();
      Patient.findById.mockRestore();
    });
  });

  describe('F03: Atomic OTP Attempt Counting and Consumption Race Control', () => {
    test('concurrent correct unlock requests: losing request receives 401 OTP_ALREADY_USED', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenRecord = createFreshTokenRecord(rawToken);
      const realOtp = '123456';
      const hashedOtp = await bcrypt.hash(realOtp, 10);

      const mockSession = {
        _id: 'session-atomic-1',
        otp: hashedOtp,
        used: false,
        failedAttempts: 0,
        expiresAt: new Date(Date.now() + 300000),
        metadata: { tokenHash: tokenRecord.tokenHash },
      };

      jest.spyOn(VerificationToken, 'findOne').mockImplementation(() => createFindOneQuery(tokenRecord));
      jest.spyOn(OTPSession, 'findOne').mockResolvedValue(mockSession);
      jest.spyOn(Patient, 'findById').mockResolvedValue(mockPatient);
      jest.spyOn(Consultation, 'findById').mockResolvedValue(mockConsultation);

      // Mock atomic findOneAndUpdate: first call succeeds, second call returns null (lost race)
      jest.spyOn(OTPSession, 'findOneAndUpdate')
        .mockResolvedValueOnce({ ...mockSession, used: true })
        .mockResolvedValueOnce(null);

      const req1 = { params: { token: rawToken }, body: { otp: realOtp } };
      const res1 = { status: jest.fn().mockReturnThis(), json: jest.fn(), set: jest.fn() };

      const req2 = { params: { token: rawToken }, body: { otp: realOtp } };
      const res2 = { status: jest.fn().mockReturnThis(), json: jest.fn(), set: jest.fn() };

      await Promise.all([
        verifyOtpAndUnlock(req1, res1),
        verifyOtpAndUnlock(req2, res2),
      ]);

      expect(res1.status).toHaveBeenCalledWith(200);
      expect(res2.status).toHaveBeenCalledWith(401);
      expect(res2.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'OTP_ALREADY_USED' })
      );

      VerificationToken.findOne.mockRestore();
      OTPSession.findOne.mockRestore();
      OTPSession.findOneAndUpdate.mockRestore();
      Patient.findById.mockRestore();
      Consultation.findById.mockRestore();
    });

    test('concurrent wrong OTP requests atomically increment failedAttempts and lock at threshold', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenRecord = createFreshTokenRecord(rawToken);
      const realOtp = '654321';
      const hashedOtp = await bcrypt.hash(realOtp, 10);

      const mockSession = {
        _id: 'session-atomic-2',
        otp: hashedOtp,
        used: false,
        failedAttempts: 1, // 1 prior attempt
        expiresAt: new Date(Date.now() + 300000),
        metadata: { tokenHash: tokenRecord.tokenHash },
      };

      jest.spyOn(VerificationToken, 'findOne').mockImplementation(() => createFindOneQuery(tokenRecord));
      jest.spyOn(OTPSession, 'findOne').mockResolvedValue(mockSession);
      jest.spyOn(OTPSession, 'updateOne').mockResolvedValue({ modifiedCount: 1 });

      // First concurrent failure increments to 2, second increments to 3 (locked)
      jest.spyOn(OTPSession, 'findOneAndUpdate')
        .mockResolvedValueOnce({ ...mockSession, failedAttempts: 2 })
        .mockResolvedValueOnce({ ...mockSession, failedAttempts: 3 });

      const req1 = { params: { token: rawToken }, body: { otp: '000001' } };
      const res1 = { status: jest.fn().mockReturnThis(), json: jest.fn(), set: jest.fn() };

      const req2 = { params: { token: rawToken }, body: { otp: '000002' } };
      const res2 = { status: jest.fn().mockReturnThis(), json: jest.fn(), set: jest.fn() };

      await Promise.all([
        verifyOtpAndUnlock(req1, res1),
        verifyOtpAndUnlock(req2, res2),
      ]);

      expect(res1.status).toHaveBeenCalledWith(401);
      expect(res1.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'INVALID_OTP', attemptsRemaining: 1 })
      );

      expect(res2.status).toHaveBeenCalledWith(401);
      expect(res2.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'INVALID_OTP', attemptsRemaining: 0 })
      );

      VerificationToken.findOne.mockRestore();
      OTPSession.findOne.mockRestore();
      OTPSession.findOneAndUpdate.mockRestore();
      OTPSession.updateOne.mockRestore();
    });
  });

  describe('F04: Allergy Decryption Failure vs Zero Allergies Differentiation', () => {
    test('distinguishes decryption failure / unreadable ciphertext from known zero allergies', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const realOtp = '888888';
      const hashedOtp = await bcrypt.hash(realOtp, 10);

      const patientWithCorruptAllergies = {
        ...mockPatient,
        allergies: '__enc_allergies_corrupt_ciphertext',
        decryptFieldsSync: jest.fn().mockImplementation(() => {
          throw new Error('DECRYPTION_FAILED_BAD_KEY');
        }),
      };

      const tokenRecordCorrupt = createFreshTokenRecord(rawToken, {
        patientRef: patientWithCorruptAllergies,
      });

      const mockSession = {
        _id: 'session-allergy-1',
        otp: hashedOtp,
        used: false,
        failedAttempts: 0,
        expiresAt: new Date(Date.now() + 300000),
        metadata: { tokenHash: tokenRecordCorrupt.tokenHash },
      };

      jest.spyOn(VerificationToken, 'findOne').mockImplementation(() => createFindOneQuery(tokenRecordCorrupt));
      jest.spyOn(OTPSession, 'findOne').mockResolvedValue(mockSession);
      jest.spyOn(OTPSession, 'findOneAndUpdate').mockResolvedValue({ ...mockSession, used: true });
      jest.spyOn(Patient, 'findById').mockResolvedValue(patientWithCorruptAllergies);
      jest.spyOn(Consultation, 'findById').mockResolvedValue(mockConsultation);

      const req = { params: { token: rawToken }, body: { otp: realOtp } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), set: jest.fn() };

      await verifyOtpAndUnlock(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];

      // Must be unavailable, NOT an empty array
      expect(payload.clinical.patient.allergiesStatus).toBe('unavailable');
      expect(payload.clinical.patient.allergies).toBeNull();

      VerificationToken.findOne.mockRestore();
      OTPSession.findOne.mockRestore();
      OTPSession.findOneAndUpdate.mockRestore();
      Patient.findById.mockRestore();
      Consultation.findById.mockRestore();
    });

    test('known clean patient with zero allergies returns allergiesStatus="none" and empty list', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const realOtp = '999999';
      const hashedOtp = await bcrypt.hash(realOtp, 10);

      const cleanPatient = {
        ...mockPatient,
        allergies: [],
        decryptFieldsSync: jest.fn(),
      };

      const tokenRecordClean = createFreshTokenRecord(rawToken, {
        patientRef: cleanPatient,
      });

      const mockSession = {
        _id: 'session-allergy-2',
        otp: hashedOtp,
        used: false,
        failedAttempts: 0,
        expiresAt: new Date(Date.now() + 300000),
        metadata: { tokenHash: tokenRecordClean.tokenHash },
      };

      jest.spyOn(VerificationToken, 'findOne').mockImplementation(() => createFindOneQuery(tokenRecordClean));
      jest.spyOn(OTPSession, 'findOne').mockResolvedValue(mockSession);
      jest.spyOn(OTPSession, 'findOneAndUpdate').mockResolvedValue({ ...mockSession, used: true });
      jest.spyOn(Patient, 'findById').mockResolvedValue(cleanPatient);
      jest.spyOn(Consultation, 'findById').mockResolvedValue(mockConsultation);

      const req = { params: { token: rawToken }, body: { otp: realOtp } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), set: jest.fn() };

      await verifyOtpAndUnlock(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];

      expect(payload.clinical.patient.allergiesStatus).toBe('none');
      expect(payload.clinical.patient.allergies).toEqual([]);

      VerificationToken.findOne.mockRestore();
      OTPSession.findOne.mockRestore();
      OTPSession.findOneAndUpdate.mockRestore();
      Patient.findById.mockRestore();
      Consultation.findById.mockRestore();
    });
  });

  describe('F06: AuditLog Structured Details Schema & Sanitization', () => {
    test('AuditLog schema supports structured details and recordAudit sanitizes PII', async () => {
      const mockCreate = jest.spyOn(AuditLog, 'create').mockResolvedValue(true);

      await recordAudit({
        actorId: 'doc-123',
        actorRole: 'doctor',
        action: 'TEST_AUDIT_ACTION',
        accessedNic: '199512345678',
        deviceModel: 'Test Agent',
        details: {
          outcome: 'SUCCESS',
          statusCode: 200,
          secretPassword: 'DO_NOT_LOG_THIS_PASSWORD',
          userToken: 'eyJhbGciOi...',
          authorizationHeader: 'Bearer secret',
          patientEmail: 'private@patient.lk',
          unmaskedNic: '199512345678',
          remaining: 2,
        },
      });

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const callArgs = mockCreate.mock.calls[0][0];

      expect(callArgs.action).toBe('TEST_AUDIT_ACTION');
      expect(callArgs.accessedNic).toBe('1995****78'); // masked
      expect(callArgs.details).toBeDefined();
      expect(callArgs.details.outcome).toBe('SUCCESS');
      expect(callArgs.details.statusCode).toBe(200);
      expect(callArgs.details.remaining).toBe(2);

      // PII and secrets must be stripped
      expect(callArgs.details.secretPassword).toBeUndefined();
      expect(callArgs.details.userToken).toBeUndefined();
      expect(callArgs.details.authorizationHeader).toBeUndefined();
      expect(callArgs.details.patientEmail).toBeUndefined();
      expect(callArgs.details.unmaskedNic).toBeUndefined();

      mockCreate.mockRestore();
    });
  });

  describe('F07: Sentinel Exception Leak Prevention in verificationController', () => {
    test('internal errors in verificationController never leak sentinel exception text', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const SENTINEL_INTERNAL_ERROR = 'SENTINEL_ATLAS_CLUSTER_SECRET_KEY_EXPOSURE_CHECK_99182';

      jest.spyOn(VerificationToken, 'findOne').mockImplementation(() => {
        throw new Error(SENTINEL_INTERNAL_ERROR);
      });

      // 1. In downloadHistoryPdfWithNicGate
      const reqPdf = { params: { token: rawToken } };
      const resPdf = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await downloadHistoryPdfWithNicGate(reqPdf, resPdf);

      expect(resPdf.status).toHaveBeenCalledWith(500);
      const pdfJson = JSON.stringify(resPdf.json.mock.calls[0][0]);
      expect(pdfJson).not.toContain(SENTINEL_INTERNAL_ERROR);

      // 2. In revokeVerificationToken
      const reqRevoke = { params: { token: rawToken }, user: { id: adminId, role: 'admin' } };
      const resRevoke = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await revokeVerificationToken(reqRevoke, resRevoke);

      expect(resRevoke.status).toHaveBeenCalledWith(500);
      const revokeJson = JSON.stringify(resRevoke.json.mock.calls[0][0]);
      expect(revokeJson).not.toContain(SENTINEL_INTERNAL_ERROR);

      VerificationToken.findOne.mockRestore();
    });
  });

  describe('F09: Token-Scoped OTP Invalidation and Rate Map Eviction', () => {
    test('requesting OTP deletes only unused sessions matching the specific tokenHash', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenRecord = createFreshTokenRecord(rawToken);
      jest.spyOn(VerificationToken, 'findOne').mockImplementation(() => createFindOneQuery(tokenRecord));

      const deleteManySpy = jest.spyOn(OTPSession, 'deleteMany').mockResolvedValue({ deletedCount: 1 });
      jest.spyOn(OTPSession, 'create').mockResolvedValue({ _id: 'otp-new' });

      const req = { params: { token: rawToken }, ip: '127.0.0.1' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await requestVerificationOtp(req, res);

      expect(deleteManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockPatient._id,
          purpose: 'qr_view',
          'metadata.tokenHash': tokenRecord.tokenHash,
          used: false,
        })
      );

      VerificationToken.findOne.mockRestore();
      OTPSession.deleteMany.mockRestore();
      OTPSession.create.mockRestore();
    });
  });
});
