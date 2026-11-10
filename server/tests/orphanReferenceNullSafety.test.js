'use strict';

jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

/**
 * server/tests/orphanReferenceNullSafety.test.js
 *
 * Comprehensive Null-Safety Verification for Orphan Foreign References across:
 * 1. Admin analytics / dashboard (missing doctor/user docs -> 'Unavailable')
 * 2. Admin audit page (orphan actorId -> 'Unavailable')
 * 3. Surveillance review queue (orphan consultation references -> safe processing)
 * 4. Public health stats / map (orphan patientId -> aggregates without throwing 503)
 * 5. Consultation lists / patient timeline (orphan doctor/hospital -> safe 200)
 * 6. PDF / summary generation (generateConsultationSummaryPDF & generatePatientHistoryPDF)
 * 7. Name normalization utility (formatDoctorName handles 'Unavailable' neutrally)
 */

const mongoose = require('mongoose');
const { formatDoctorName } = require('../src/utils/doctorName');
const { selectReportingCases, aggregatePublicCases } = require('../src/services/publicHealthStats');
const { generateConsultationSummaryPDF, generatePatientHistoryPDF } = require('../src/utils/pdfGenerator');
const analyticsController = require('../src/controllers/analyticsController');
const adminController = require('../src/controllers/adminController');
const patientController = require('../src/controllers/patientController');
const Consultation = require('../src/models/Consultation');
const Prescription = require('../src/models/Prescription');
const AuditLog = require('../src/models/AuditLog');
const Doctor = require('../src/models/Doctor');
const Patient = require('../src/models/Patient');
const PharmacyStaff = require('../src/models/PharmacyStaff');
const Hospital = require('../src/models/Hospital');
const Admin = require('../src/models/Admin');
const SessionToken = require('../src/models/SessionToken');
const OutbreakAlert = require('../src/models/OutbreakAlert');
const TrustedDevice = require('../src/models/TrustedDevice');

beforeAll(() => {
  process.env.PDF_EXPORT_ENABLED = 'true';
});

afterAll(() => {
  delete process.env.PDF_EXPORT_ENABLED;
});

describe('Orphan Foreign Reference Null-Safety Suite', () => {
  describe('1. Doctor Display Name Normalization (utils/doctorName.js)', () => {
    test('formatDoctorName handles "Unavailable" neutrally without prepending "Dr."', () => {
      expect(formatDoctorName('Unavailable')).toBe('Unavailable');
      expect(formatDoctorName('UNAVAILABLE')).toBe('UNAVAILABLE');
      expect(formatDoctorName(null, 'Unavailable')).toBe('Unavailable');
      expect(formatDoctorName(undefined, 'Unavailable')).toBe('Unavailable');
      expect(formatDoctorName('', 'Unavailable')).toBe('Unavailable');
    });
  });

  describe('2. Admin Analytics / Dashboard (analyticsController.getDashboardStats)', () => {
    test('topDoctors aggregation pipeline returns "Unavailable" for orphan doctorId', async () => {
      const orphanDoctorId = new mongoose.Types.ObjectId();

      const mockTopDoctors = [
        {
          _id: orphanDoctorId,
          count: 15,
          name: 'Unavailable'
        }
      ];

      const patientAggSpy = jest.spyOn(Patient, 'aggregate').mockResolvedValue([]);
      const aggregateSpy = jest.spyOn(Consultation, 'aggregate').mockResolvedValue(mockTopDoctors);

      const rxAggregateSpy = jest.spyOn(Prescription, 'aggregate').mockResolvedValue([]);
      const rxFindSpy = jest.spyOn(Prescription, 'find').mockReturnValue({
        sort: () => ({ limit: () => Promise.resolve([]) })
      });
      const alertFindSpy = jest.spyOn(OutbreakAlert, 'find').mockReturnValue({
        sort: () => ({ limit: () => Promise.resolve([]) })
      });

      const req = { user: { role: 'admin' }, query: {} };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      try {
        await analyticsController.getDashboardStats(req, res);
        expect(res.json).toHaveBeenCalled();
        const responseData = res.json.mock.calls[0][0].data;
        expect(responseData.topDoctors).toBeDefined();
        expect(responseData.topDoctors.length).toBe(1);
        expect(responseData.topDoctors[0].name).toBe('Unavailable');
      } finally {
        patientAggSpy.mockRestore();
        aggregateSpy.mockRestore();
        rxAggregateSpy.mockRestore();
        rxFindSpy.mockRestore();
        alertFindSpy.mockRestore();
      }
    });
  });

  describe('3. Admin Audit Page (adminController.getAuditLogs & getUserAuditProfile)', () => {
    test('getAuditLogs resolves missing/orphan actorId as "Unavailable" without leaking PII', async () => {
      const orphanActorId = new mongoose.Types.ObjectId();

      jest.spyOn(AuditLog, 'aggregate')
        .mockResolvedValueOnce([{ total: 1 }]) // countPipeline
        .mockResolvedValueOnce([              // main pipeline
          {
            _id: new mongoose.Types.ObjectId(),
            actorId: orphanActorId,
            actorRole: 'doctor',
            action: 'LOGIN',
            timestamp: new Date()
          }
        ]);

      // All actor model searches return empty (orphan actor)
      jest.spyOn(Doctor, 'find').mockResolvedValue([]);
      jest.spyOn(Patient, 'find').mockResolvedValue([]);
      jest.spyOn(PharmacyStaff, 'find').mockResolvedValue([]);
      jest.spyOn(Hospital, 'find').mockResolvedValue([]);
      jest.spyOn(Admin, 'find').mockResolvedValue([]);
      jest.spyOn(SessionToken, 'find').mockReturnValue({
        select: () => ({ lean: () => Promise.resolve([]) }),
        sort: () => ({ lean: () => Promise.resolve([]) })
      });

      const req = { query: { page: 1, limit: 10 } };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      try {
        await adminController.getAuditLogs(req, res);
        expect(res.json).toHaveBeenCalled();
        const logs = res.json.mock.calls[0][0].data;
        expect(logs.length).toBe(1);
        expect(logs[0].actorName).toBe('Unavailable');
        expect(logs[0].actorNic).toBe('—');
      } finally {
        jest.restoreAllMocks();
      }
    });

    test('getUserAuditProfile resolves missing user record as "Unavailable"', async () => {
      const orphanUserId = new mongoose.Types.ObjectId();

      jest.spyOn(Admin, 'findById').mockResolvedValue(null);
      jest.spyOn(Doctor, 'findById').mockResolvedValue(null);
      jest.spyOn(PharmacyStaff, 'findById').mockResolvedValue(null);
      jest.spyOn(Hospital, 'findById').mockResolvedValue(null);
      jest.spyOn(Patient, 'findById').mockResolvedValue(null);

      jest.spyOn(SessionToken, 'findOne').mockReturnValue({ lean: () => Promise.resolve(null) });
      jest.spyOn(SessionToken, 'find').mockReturnValue({
        sort: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) })
      });
      jest.spyOn(AuditLog, 'find').mockReturnValue({
        sort: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) })
      });
      jest.spyOn(TrustedDevice, 'find').mockReturnValue({
        sort: () => ({ lean: () => Promise.resolve([]) })
      });

      const req = { params: { userId: String(orphanUserId) } };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      try {
        await adminController.getUserAuditProfile(req, res);
        expect(res.json).toHaveBeenCalled();
        const payload = res.json.mock.calls[0][0].data;
        expect(payload.user).toBeDefined();
        expect(payload.user.fullName).toBe('Unavailable');
      } finally {
        jest.restoreAllMocks();
      }
    });
  });

  describe('4. Surveillance Review Queue (adminController.getPendingSurveillanceConsultations)', () => {
    test('getPendingSurveillanceConsultations handles orphan consultations cleanly', async () => {
      const orphanConsultation = {
        _id: new mongoose.Types.ObjectId(),
        district: 'Colombo',
        diagnosis: 'Dengue',
        icdCode: 'A90',
        icdVersion: 'ICD-10',
        createdAt: new Date(),
        surveillanceVerification: { status: 'pending' },
        patientId: new mongoose.Types.ObjectId(), // orphan
        doctorId: new mongoose.Types.ObjectId(),  // orphan
        hospitalId: new mongoose.Types.ObjectId() // orphan
      };

      const mockQueryChain = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([orphanConsultation])
      };
      jest.spyOn(Consultation, 'find').mockReturnValue(mockQueryChain);

      const req = { query: { limit: 10 } };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      try {
        await adminController.getPendingSurveillanceConsultations(req, res);
        expect(res.json).toHaveBeenCalled();
        const data = res.json.mock.calls[0][0].data;
        expect(data.length).toBe(1);
        expect(data[0].diagnosis).toBe('Dengue');
      } finally {
        jest.restoreAllMocks();
      }
    });
  });

  describe('5. Public Health Stats & Map (publicHealthStats)', () => {
    test('selectReportingCases and aggregatePublicCases safely process consultations with orphan parent patientId', () => {
      const now = new Date('2026-11-05T00:00:00Z');
      const orphanConsultation = {
        _id: new mongoose.Types.ObjectId(),
        patientId: new mongoose.Types.ObjectId(), // orphan parent reference (ID points to missing patient doc)
        district: 'Gampaha',
        icdCode: 'A90',
        icdVersion: 'ICD-10',
        createdAt: new Date('2026-11-04T10:00:00Z'),
        surveillanceVerification: {
          status: 'verified',
          diagnosisStatus: 'confirmed',
          source: 'clinical_review',
          verifiedBy: 'health_officer_1',
          verifiedAt: new Date('2026-11-04T12:00:00Z'),
          episodeId: 'EP-GAM-2026-0001',
          caseDefinitionReference: 'SL-EPID-DEF-1'
        }
      };

      // Ensure selectReportingCases does not throw unavailable()
      const selection = selectReportingCases([orphanConsultation], { mode: 'real', rangeDays: 30, now });
      expect(selection.cases.length).toBe(1);
      expect(selection.cases[0].district).toBe('Gampaha');

      // Ensure aggregatePublicCases succeeds
      const aggregation = aggregatePublicCases([orphanConsultation], { mode: 'real', rangeDays: 30, now });
      expect(aggregation.verifiedCases).toBe(1);
      expect(aggregation.state).toBe('ok');
    });
  });

  describe('6. Consultation Summary & History PDF Generation (utils/pdfGenerator.js)', () => {
    test('generateConsultationSummaryPDF handles completely missing patient and doctor records', async () => {
      const consultationData = {
        consultationId: 'CON-ORPHAN-001',
        createdAt: new Date('2026-11-01T10:00:00Z'),
        diagnosis: 'Clinical Consultation',
        hospitalId: new mongoose.Types.ObjectId() // orphan hospital
      };

      // Empty patientDetails and doctorDetails simulate missing/deleted parents
      const patientDetails = {};
      const doctorDetails = {};

      const pdfBuffer = await generateConsultationSummaryPDF(consultationData, patientDetails, doctorDetails);
      expect(pdfBuffer).toBeDefined();
      const buf = Buffer.from(pdfBuffer);
      expect(buf.length).toBeGreaterThan(1000);
      // Valid PDF magic header
      expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF');
    });

    test('generatePatientHistoryPDF handles consultations with orphan doctor references', async () => {
      const patientData = {
        fullName: 'Test Patient',
        nic: '199012345678'
      };

      const consultations = [
        {
          _id: new mongoose.Types.ObjectId(),
          consultationId: 'CON-ORPHAN-002',
          createdAt: new Date('2026-11-02T10:00:00Z'),
          diagnosis: 'Acute Pharyngitis',
          doctorId: null, // orphan doctor
          hospitalId: null
        }
      ];

      const prescriptions = [];

      const pdfBuffer = await generatePatientHistoryPDF(patientData, consultations, prescriptions);
      expect(pdfBuffer).toBeDefined();
      const buf = Buffer.from(pdfBuffer);
      expect(buf.length).toBeGreaterThan(1000);
      expect(buf.slice(0, 4).toString('ascii')).toBe('%PDF');
    });
  });
});
