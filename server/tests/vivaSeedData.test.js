'use strict';

/**
 * server/tests/vivaSeedData.test.js
 *
 * Automated regression suite for Viva Voce Demonstration Seed Plan.
 * Verifies data integrity, outbreak scenario mathematics, public health compliance,
 * demo patient specifications, and reversibility.
 */

const { buildVivaSeedPlan, NAMESPACE } = require('../../scripts/seedVivaPlan.cjs');
const { evaluateOutbreakCriteria } = require('../src/services/surveillanceService');
const { aggregatePublicCases, selectReportingCases } = require('../src/services/publicHealthStats');

describe('Viva Voce Demonstration Seed Plan', () => {
  let plan;
  const TEST_KEY = '01234567890123456789012345678901';
  let prevKeys, prevVersion, prevPdfExport, prevEncKey;

  beforeAll(() => {
    prevKeys = global.ENCRYPTION_KEYS;
    prevVersion = global.ACTIVE_KEY_VERSION;
    prevEncKey = process.env.ENCRYPTION_KEY;
    prevPdfExport = process.env.PDF_EXPORT_ENABLED;

    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || TEST_KEY;
    global.ENCRYPTION_KEYS = global.ENCRYPTION_KEYS || { '1': process.env.ENCRYPTION_KEY };
    global.ACTIVE_KEY_VERSION = global.ACTIVE_KEY_VERSION || 1;
    process.env.PDF_EXPORT_ENABLED = 'true';

    plan = buildVivaSeedPlan({ now: new Date('2026-11-10T12:00:00.000Z') });
  });

  afterAll(() => {
    global.ENCRYPTION_KEYS = prevKeys;
    global.ACTIVE_KEY_VERSION = prevVersion;
    process.env.ENCRYPTION_KEY = prevEncKey;
    process.env.PDF_EXPORT_ENABLED = prevPdfExport;
  });

  test('plan generates required collection counts matching capstone specifications', () => {
    expect(plan.counts.Hospital).toBe(2);
    expect(plan.counts.Pharmacy).toBe(2);
    expect(plan.counts.Doctor).toBe(4);
    expect(plan.counts.PharmacyStaff).toBe(3);
    expect(plan.counts.Patient).toBe(30);
    expect(plan.counts.Consultation).toBe(400);
    expect(plan.counts.Prescription).toBe(283);
    expect(plan.counts.Dispensing).toBe(180);
    expect(plan.counts.LabTest).toBe(12);
    expect(plan.counts.VerificationToken).toBe(1);

    const totalDocs = Object.values(plan.counts).reduce((a, b) => a + b, 0);
    expect(totalDocs).toBe(917);
    expect(plan.namespace).toBe('viva-2026-11');
  });

  describe('Outbreak Scenarios Mathematical Proofs (evaluateOutbreakCriteria)', () => {
    let results;

    beforeAll(() => {
      const cases = plan.documentsByModel.Consultation.map(c => ({
        district: c.district,
        diseaseId: c.icdCode,
        disease: c.diagnosis,
        time: new Date(c.createdAt).getTime(),
        createdAt: c.createdAt
      }));

      results = evaluateOutbreakCriteria({
        cases,
        now: new Date(plan.now),
        baselineDays: 56,
        level: 'district'
      });
    });

    test('Scenario S-A: Dengue in Gampaha triggers Critical Outbreak Alert', () => {
      const sA = results.find(r => r.district === 'Gampaha' && (r.disease === 'A90' || r.disease === 'Dengue'));
      expect(sA).toBeDefined();
      expect(sA.triggered).toBe(true);
      expect(sA.alertLevel).toBe('Critical');
      expect(sA.severity).toBe('Critical');
      expect(sA.count).toBe(12); // N = 12 >= 5 (Gate 1 PASS)
      expect(sA.count).toBeGreaterThanOrEqual(5);
      expect(sA.maxConsecutiveDays).toBeGreaterThanOrEqual(2); // Gate 2 PASS (4 days)
      expect(sA.maxZ).toBeGreaterThanOrEqual(4.0); // Critical threshold
    });

    test('Scenario S-B: Dengue in Kalutara negative control is rejected by persistence gate', () => {
      const sB = results.find(r => r.district === 'Kalutara' && (r.disease === 'A90' || r.disease === 'Dengue'));
      expect(sB).toBeDefined();
      expect(sB.triggered).toBe(false);
      expect(sB.reason).toBe('PERSISTENCE_CRITERIA_NOT_MET');
      expect(sB.count).toBe(6); // N = 6 >= 5 (Floor pass)
      expect(sB.maxConsecutiveDays).toBe(1); // 1 day only (< 2, Persistence fail)
    });

    test('Scenario S-C: Dengue in Matara negative control is rejected by case floor gate', () => {
      const sC = results.find(r => r.district === 'Matara' && (r.disease === 'A90' || r.disease === 'Dengue'));
      expect(sC).toBeDefined();
      expect(sC.triggered).toBe(false);
      expect(sC.reason).toBe('CASE_FLOOR_NOT_MET');
      expect(sC.count).toBe(4); // N = 4 < 5 (Floor fail)
    });

    test('Scenario S-D: Influenza in Kandy triggers High Outbreak Alert for secondary disease', () => {
      const sD = results.find(r => r.district === 'Kandy' && (r.disease === 'J11.1' || r.disease === 'Influenza'));
      expect(sD).toBeDefined();
      expect(sD.triggered).toBe(true);
      expect(sD.alertLevel).toBe('Alert');
      expect(sD.severity).toBe('High');
      expect(sD.count).toBe(8); // N = 8 >= 5 (Gate 1 PASS)
      expect(sD.maxConsecutiveDays).toBeGreaterThanOrEqual(2); // Gate 2 PASS (4 days)
      expect(sD.maxZ).toBeGreaterThan(2.0);
    });
  });

  describe('Public Health Compliance (publicHealthStats)', () => {
    test('public health aggregation returns verified cases and active awaiting review queue', () => {
      const consultations = plan.documentsByModel.Consultation;
      const agg = aggregatePublicCases(consultations, {
        mode: 'real',
        rangeDays: 30,
        now: new Date(plan.now)
      });

      expect(agg.verifiedCases).toBe(177);
      expect(agg.awaitingReviewCount).toBe(10);
      expect(agg.state).toBe('ok');
      expect(agg.byDistrict.length).toBeGreaterThanOrEqual(20);
      expect(agg.byDisease.some(d => d.disease === 'Dengue')).toBe(true);
    });

    test('surveillance selectCases accepts verified cases and rejects pending with unverified', () => {
      const consultations = plan.documentsByModel.Consultation;
      const sel = selectReportingCases(consultations, {
        mode: 'real',
        rangeDays: 30,
        now: new Date(plan.now)
      });

      expect(sel.cases.length).toBe(177);
      expect(sel.awaitingReviewCount).toBe(10);
    });
  });

  describe('Demo Patient Profile & Verification', () => {
    test('demo patient has synthetic NIC 200012345678 and required clinical states', () => {
      const demo = plan.demoPatient;
      expect(demo.nic).toBe('200012345678');
      expect(demo.name).toBe('Chamod Tharusha');

      // Consultations for demo patient
      const demoConsultations = plan.documentsByModel.Consultation.filter(c => c.patientId === demo.id);
      expect(demoConsultations.length).toBe(3);

      // Prescriptions for demo patient
      const demoRxs = plan.documentsByModel.Prescription.filter(rx => rx.patientId === demo.id);
      expect(demoRxs.length).toBeGreaterThanOrEqual(4);

      const hasDispensed = demoRxs.some(rx => rx.status === 'dispensed');
      const hasPending = demoRxs.some(rx => rx.status === 'pending');
      const hasSuperseded = demoRxs.some(rx => rx.supersededBy);
      const hasCancelled = demoRxs.some(rx => rx.status === 'cancelled');

      expect(hasDispensed).toBe(true);
      expect(hasPending).toBe(true);
      expect(hasSuperseded).toBe(true);
      expect(hasCancelled).toBe(true);

      // Lab tests for demo patient
      const demoLabs = plan.documentsByModel.LabTest.filter(l => l.patientId === demo.id);
      expect(demoLabs.length).toBe(2);
      expect(demoLabs.some(l => l.status === 'report_ready')).toBe(true);
      expect(demoLabs.some(l => l.status === 'sample_collected')).toBe(true);

      // Verification token capability
      const tokenDoc = plan.documentsByModel.VerificationToken[0];
      expect(tokenDoc).toBeDefined();
      expect(tokenDoc.patientRef).toBe(demo.id);
      expect(tokenDoc.tokenHash).toBeDefined();
      expect(demo.qrUrl).toContain('/verify/');

      // Task 2: URL must contain raw token, DB must contain tokenHash = sha256(rawToken), expiresAt = 90 days
      const crypto = require('crypto');
      expect(demo.rawToken).toBeDefined();
      expect(typeof demo.rawToken).toBe('string');
      expect(demo.qrUrl).toBe(`https://medisync.chamodtharusha.com.lk/verify/${demo.rawToken}`);
      expect(demo.qrUrl).not.toContain(tokenDoc.tokenHash);
      const computedHash = crypto.createHash('sha256').update(demo.rawToken).digest('hex');
      expect(computedHash).toBe(tokenDoc.tokenHash);

      const daysUntilExpiry = (new Date(tokenDoc.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(daysUntilExpiry).toBeGreaterThan(88);
      expect(daysUntilExpiry).toBeLessThanOrEqual(91);
    });

    test('GET /api/verify/:token resolves correctly using the raw token', async () => {
      const { resolveVerificationToken } = require('../src/services/verificationTokenService');
      const VerificationToken = require('../src/models/VerificationToken');

      // Mock VerificationToken.findOne with populate chaining
      const tokenDoc = plan.documentsByModel.VerificationToken[0];
      const demoConsultation = plan.documentsByModel.Consultation.find(c => c._id === tokenDoc.consultationId);
      const demoPat = plan.documentsByModel.Patient.find(p => p._id === tokenDoc.patientRef);
      const demoDoc = plan.documentsByModel.Doctor.find(d => d._id === tokenDoc.doctorRef);

      const mockRecord = {
        ...tokenDoc,
        consultationId: demoConsultation,
        patientRef: demoPat,
        doctorRef: demoDoc,
        useCount: 0
      };

      const originalFindOne = VerificationToken.findOne;
      VerificationToken.findOne = jest.fn(() => ({
        populate: jest.fn().mockReturnThis(),
        then: resolve => resolve(mockRecord)
      }));

      try {
        const resolved = await resolveVerificationToken(plan.demoPatient.rawToken);
        expect(resolved.valid).toBe(true);
        expect(resolved.token).toBeDefined();
        expect(resolved.token.consultationRef).toBe(tokenDoc.consultationRef);
      } finally {
        VerificationToken.findOne = originalFindOne;
      }
    });
  });

  describe('Task 1: Gmail-style Plus Aliasing (--owner-email) & Account Login', () => {
    test('buildVivaSeedPlan assigns plus aliases to all personas when ownerEmail is provided', () => {
      const aliasPlan = buildVivaSeedPlan({
        now: new Date('2026-11-10T12:00:00.000Z'),
        ownerEmail: 'chamod.tester@gmail.com'
      });

      // Demo Patient
      expect(aliasPlan.demoPatient.email).toBe('chamod.tester+patient@gmail.com');

      // Doctors
      const docs = aliasPlan.documentsByModel.Doctor;
      expect(docs[0].email).toBe('chamod.tester+doctor1@gmail.com');
      expect(docs[1].email).toBe('chamod.tester+doctor2@gmail.com');
      expect(docs[2].email).toBe('chamod.tester+doctor3@gmail.com');
      expect(docs[3].email).toBe('chamod.tester+doctor4@gmail.com');

      // Pharmacy Staff
      const staff = aliasPlan.documentsByModel.PharmacyStaff;
      expect(staff[0].email).toBe('chamod.tester+pharmacist1@gmail.com');
      expect(staff[1].email).toBe('chamod.tester+pharmacist2@gmail.com');
      expect(staff[2].email).toBe('chamod.tester+pharmacyadmin@gmail.com');

      // Hospital Admins
      const hosps = aliasPlan.documentsByModel.Hospital;
      expect(hosps[0].email).toBe('chamod.tester+hospitaladmin1@gmail.com');
      expect(hosps[1].email).toBe('chamod.tester+hospitaladmin2@gmail.com');

      // Other patients
      const patients = aliasPlan.documentsByModel.Patient;
      expect(patients[1].email).toBe('chamod.tester+patient2@gmail.com');
    });

    test('seeded personas have twoFactorEnabled: false for instant direct viva login', () => {
      // By design, viva demo accounts allow direct password login without 2FA blockage,
      // while OTPs can still be requested on demand (verify portal, lab report, patient consent).
      for (const d of plan.documentsByModel.Doctor) {
        expect(d.twoFactorEnabled).toBeFalsy();
      }
      for (const p of plan.documentsByModel.Patient) {
        expect(p.twoFactorEnabled).toBeFalsy();
      }
      for (const s of plan.documentsByModel.PharmacyStaff) {
        expect(s.twoFactorEnabled).toBeFalsy();
      }
      for (const h of plan.documentsByModel.Hospital) {
        expect(h.twoFactorEnabled).toBeFalsy();
      }
    });
  });

  describe('Task 3: Seeded Lab Reports Content & Download Verification', () => {
    test('report_ready lab tests contain real encrypted PDF payload and envelope metadata', () => {
      const readyLabs = plan.documentsByModel.LabTest.filter(l => l.status === 'report_ready');
      expect(readyLabs.length).toBe(3);

      for (const lab of readyLabs) {
        expect(lab.reportId).toMatch(/^RPT-VIVA-2026-\d{4}$/);
        expect(lab.reportOriginalName).toMatch(/\.pdf$/);
        expect(lab.reportSha256).toMatch(/^[0-9a-f]{64}$/);
        expect([1, 2]).toContain(lab.reportEnvelopeVersion);
        expect(lab.fileIV).toBeDefined();
        expect(lab.encryptedFileKey).toBeDefined();
        expect(lab.encryptedBlob).toBeDefined();
        expect(typeof lab.encryptedBlob).toBe('string');
      }
    });

    test('seeded lab report can be decrypted directly via labReportStorage.downloadStoredReport', async () => {
      const { downloadStoredReport } = require('../src/services/labReportStorage');
      const readyLab = plan.documentsByModel.LabTest.find(l => l.status === 'report_ready');
      expect(readyLab).toBeDefined();

      const decrypted = await downloadStoredReport(readyLab);
      expect(Buffer.isBuffer(decrypted)).toBe(true);
      expect(decrypted.subarray(0, 5).toString()).toBe('%PDF-');
    });

    test('seeded lab report can be exported via pdfGenerator.generateLabReportPDF', async () => {
      const pdfGenerator = require('../src/utils/pdfGenerator');
      const readyLab = plan.documentsByModel.LabTest.find(l => l.status === 'report_ready');

      const generated = await pdfGenerator.generateLabReportPDF(readyLab, { unlockForTest: true });
      const buf = Buffer.from(generated);
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    });
  });

  describe('Reversibility & Isolation', () => {
    test('every non-consultation document carries batch tag and isSynthetic flag', () => {
      const nonConsultationModels = ['Hospital', 'Pharmacy', 'Doctor', 'PharmacyStaff', 'Patient', 'Prescription', 'Dispensing', 'LabTest', 'VerificationToken'];
      for (const model of nonConsultationModels) {
        for (const doc of plan.documentsByModel[model]) {
          expect(doc.syntheticSeedBatch).toBe('viva-2026-11');
          expect(doc.isSynthetic).toBe(true);
        }
      }
    });

    test('all consultations have deterministic CON-VIVA-2026- prefix and batch reviewer', () => {
      for (const c of plan.documentsByModel.Consultation) {
        expect(c.consultationId).toMatch(/^CON-VIVA-2026-\d{4}$/);
        if (c.surveillanceVerification.status === 'verified') {
          expect(c.surveillanceVerification.verifiedBy).toBe('viva-2026-11');
        }
      }
    });
  });
});
