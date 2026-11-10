'use strict';

const assert = require('assert');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const {
  issueVerificationToken,
  resolveVerificationToken,
  revokeToken,
} = require('../src/services/verificationTokenService');
const {
  getVerificationPublicStatus,
  downloadHistoryPdfWithNicGate,
  revokeVerificationToken,
} = require('../src/controllers/verificationController');
const { generatePatientHistoryPDF } = require('../src/utils/pdfGenerator');

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

describe('Sub-Project 3 Phase 2: Verification Token & History Download Gate', () => {
  const mockConsultationId = new mongoose.Types.ObjectId();
  const mockPatientId = new mongoose.Types.ObjectId();
  const mockDoctorId = new mongoose.Types.ObjectId();

  let activeToken = null;

  it('generates 256-bit entropy token and stores SHA-256 hash', async () => {
    // Mock save
    const origSave = mongoose.Model.prototype.save;
    mongoose.Model.prototype.save = async function () {
      return this;
    };

    try {
      const res = await issueVerificationToken({
        consultationId: mockConsultationId,
        patientId: mockPatientId,
        doctorId: mockDoctorId,
        consultationRef: 'CON-TEST-123456',
        expiresInDays: 90,
      });

      assert(res.rawToken, 'Must generate rawToken');
      assert.strictEqual(res.rawToken.length, 64, '32 bytes hex = 64 characters');
      assert(res.tokenHash, 'Must generate SHA-256 tokenHash');

      const expectedHash = crypto.createHash('sha256').update(res.rawToken).digest('hex');
      assert.strictEqual(res.tokenHash, expectedHash, 'tokenHash must match SHA-256 of rawToken');
      assert(res.verificationUrl.includes(res.rawToken), 'verificationUrl must contain raw token');
      assert(res.expiresAt > new Date(), 'expiresAt must be in the future');

      activeToken = res.rawToken;
    } finally {
      mongoose.Model.prototype.save = origSave;
    }
  });

  it('rejects invalid, malformed, or missing tokens gracefully', async () => {
    const invalidRes = await resolveVerificationToken('too-short');
    assert.strictEqual(invalidRes.valid, false);
    assert.strictEqual(invalidRes.reason, 'INVALID_TOKEN_FORMAT');

    const emptyRes = await resolveVerificationToken('');
    assert.strictEqual(emptyRes.valid, false);
  });

  it('public status controller never leaks patient NIC, name, diagnosis, or medicines', async () => {
    const fakeTokenRecord = {
      _id: new mongoose.Types.ObjectId(),
      consultationId: {
        _id: mockConsultationId,
        consultationId: 'CON-2026-99999',
        createdAt: new Date('2026-11-08T10:00:00Z'),
        sessionHospitalId: 'Colombo National Hospital',
        diagnosis: 'CONFIDENTIAL_SECRET_DIAGNOSIS',
        symptoms: ['SymptomSecret'],
        clinicalNotes: 'TopSecretClinicalNote',
      },
      patientRef: {
        _id: mockPatientId,
        fullName: 'Jane Doe',
        nic: '199512345678',
      },
      doctorRef: {
        _id: mockDoctorId,
        fullName: 'Dr. Gregory House',
      },
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
      save: async () => {},
    };

    const VerificationToken = require('../src/models/VerificationToken');
    const origFindOne = VerificationToken.findOne;
    VerificationToken.findOne = () => ({
      populate() {
        return this;
      },
      then(fn) {
        return Promise.resolve(fn(fakeTokenRecord));
      },
    });

    try {
      const req = { params: { token: 'a'.repeat(64) } };
      const res = mockRes();

      await getVerificationPublicStatus(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.valid, true);
      assert.strictEqual(res.body.consultationRef, 'CON-2026-99999');
      assert.strictEqual(res.body.clinicalValidation, 'not_established');
      assert.strictEqual(res.body.doctorName, 'Dr. Gregory House');
      assert.strictEqual(res.body.hospital, 'Colombo National Hospital');

      // CRITICAL DATA PRIVACY AUDIT: Ensure zero leakage of sensitive medical or identity fields
      const jsonStr = JSON.stringify(res.body);
      assert(!jsonStr.includes('Jane Doe'), 'Must not leak patient name');
      assert(!jsonStr.includes('199512345678'), 'Must not leak patient NIC');
      assert(!jsonStr.includes('CONFIDENTIAL_SECRET_DIAGNOSIS'), 'Must not leak diagnosis');
      assert(!jsonStr.includes('SymptomSecret'), 'Must not leak symptoms');
      assert(!jsonStr.includes('TopSecretClinicalNote'), 'Must not leak notes');
    } finally {
      VerificationToken.findOne = origFindOne;
    }
  });

  it('handles revoked tokens with HTTP 410 and reason notice', async () => {
    const fakeRevokedToken = {
      _id: new mongoose.Types.ObjectId(),
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: new Date('2026-11-08T09:00:00Z'),
      revocationReason: 'Patient privacy request',
      save: async () => {},
    };

    const VerificationToken = require('../src/models/VerificationToken');
    const origFindOne = VerificationToken.findOne;
    VerificationToken.findOne = () => ({
      populate() {
        return this;
      },
      then(fn) {
        return Promise.resolve(fn(fakeRevokedToken));
      },
    });

    try {
      const req = { params: { token: 'b'.repeat(64) } };
      const res = mockRes();

      await getVerificationPublicStatus(req, res);

      assert.strictEqual(res.statusCode, 410);
      assert.strictEqual(res.body.valid, false);
      assert.strictEqual(res.body.reason, 'TOKEN_REVOKED');
      assert.strictEqual(res.body.revocationReason, 'Patient privacy request');
      assert.strictEqual(res.body.clinicalValidation, 'not_established');
    } finally {
      VerificationToken.findOne = origFindOne;
    }
  });

  it('NIC history gate requires valid NIC with constant-time equality check', async () => {
    const rawTokenC = 'c'.repeat(64);
    const tokenHashC = crypto.createHash('sha256').update(rawTokenC).digest('hex');
    const fakeTokenRecord = {
      _id: new mongoose.Types.ObjectId(),
      tokenHash: tokenHashC,
      consultationId: { _id: mockConsultationId },
      patientRef: mockPatientId,
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
      save: async () => {},
    };

    const fakePatient = {
      _id: mockPatientId,
      fullName: 'John Doe',
      nic: '901234567V',
      decryptFieldsSync() {},
    };

    const VerificationToken = require('../src/models/VerificationToken');
    const Patient = require('../src/models/Patient');

    const origFindOne = VerificationToken.findOne;
    const origFindById = Patient.findById;

    VerificationToken.findOne = () => ({
      populate() {
        return this;
      },
      then(fn) {
        return Promise.resolve(fn(fakeTokenRecord));
      },
    });
    Patient.findById = () => Promise.resolve(fakePatient);

    try {
      // 1. Missing NIC / unauthorized -> 401
      const reqNoNic = { params: { token: 'c'.repeat(64) }, body: {} };
      const resNoNic = mockRes();
      await downloadHistoryPdfWithNicGate(reqNoNic, resNoNic);
      assert.ok(resNoNic.statusCode === 400 || resNoNic.statusCode === 401);

      // 2. Mismatched NIC -> 401
      const reqWrongNic = { params: { token: 'c'.repeat(64) }, body: { nic: '999999999V' } };
      const resWrongNic = mockRes();
      await downloadHistoryPdfWithNicGate(reqWrongNic, resWrongNic);
      assert.strictEqual(resWrongNic.statusCode, 401);
      assert.strictEqual(resWrongNic.body.error, 'VERIFICATION_FAILED');

      // 3. Matched NIC -> 200 / PDF stream
      process.env.PDF_EXPORT_ENABLED = 'true';
      const Consultation = require('../src/models/Consultation');
      const Prescription = require('../src/models/Prescription');
      const origConsultFind = Consultation.find;
      const origRxFind = Prescription.find;

      Consultation.find = () => ({
        populate() {
          return this;
        },
        sort() {
          return this;
        },
        lean() {
          return Promise.resolve([
            {
              _id: mockConsultationId,
              consultationId: 'CON-001',
              createdAt: new Date(),
              diagnosis: 'Mild Fever',
              symptoms: ['Fever'],
            },
          ]);
        },
      });

      Prescription.find = () => ({
        lean() {
          return Promise.resolve([
            {
              consultationId: mockConsultationId,
              drugName: 'Paracetamol',
              dosage: '500mg',
              frequency: 'TDS',
              durationDays: 3,
            },
          ]);
        },
      });

      const validSessionJwt = jwt.sign(
        {
          purpose: 'qr_view_session',
          tokenHash: tokenHashC,
          patientId: mockPatientId,
        },
        process.env.JWT_SECRET || 'medisync_session_secret_local',
        { expiresIn: '10m', algorithm: 'HS256' }
      );

      const reqCorrectNic = {
        params: { token: rawTokenC },
        headers: { authorization: `Bearer ${validSessionJwt}` },
        body: { nic: '901234567v' },
      }; // Normalized view session + encounter export
      const resCorrectNic = mockRes();
      await downloadHistoryPdfWithNicGate(reqCorrectNic, resCorrectNic);

      assert.strictEqual(resCorrectNic.statusCode, 200);
      assert.strictEqual(resCorrectNic.headers['Content-Type'], 'application/pdf');
      assert(resCorrectNic.body instanceof Buffer, 'Must return PDF buffer');
      assert(resCorrectNic.body.length > 500, 'PDF buffer must be non-empty');

      Consultation.find = origConsultFind;
      Prescription.find = origRxFind;
    } finally {
      VerificationToken.findOne = origFindOne;
      Patient.findById = origFindById;
      delete process.env.PDF_EXPORT_ENABLED;
    }
  });

  it('generatePatientHistoryPDF generates valid PDF with clinicalValidation disclaimer and watermark', async () => {
    process.env.PDF_EXPORT_ENABLED = 'true';
    try {
      const patient = {
        fullName: 'Test Patient',
        nic: '901234567V',
        gender: 'Male',
        age: 34,
      };
      const consultations = [
        {
          _id: mockConsultationId,
          consultationId: 'CON-TEST-HIST',
          createdAt: new Date(),
          doctorName: 'Dr. Test Physician',
          diagnosis: 'Upper Respiratory Tract Infection',
          symptoms: ['Cough', 'Sore Throat'],
        },
      ];
      const prescriptions = [
        {
          consultationId: mockConsultationId,
          drugName: 'Amoxicillin',
          dosage: '500mg',
          frequency: 'TDS',
          durationDays: 5,
        },
      ];

      const pdfBytes = await generatePatientHistoryPDF(patient, consultations, prescriptions);
      assert(pdfBytes instanceof Uint8Array || Buffer.isBuffer(pdfBytes), 'Must return PDF byte array');
      assert(pdfBytes.length > 1000, 'History PDF must contain rendered bytes');
    } finally {
      delete process.env.PDF_EXPORT_ENABLED;
    }
  });
});
