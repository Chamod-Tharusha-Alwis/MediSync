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

    test('two consecutive seed plans generate distinct random tokens and tokenHashes', () => {
      const planA = buildVivaSeedPlan({ now: new Date() });
      const planB = buildVivaSeedPlan({ now: new Date() });
      expect(planA.demoPatient.rawToken).not.toBe(planB.demoPatient.rawToken);
      expect(planA.demoPatient.tokenHash).not.toBe(planB.demoPatient.tokenHash);
      expect(planA.demoPatient.rawToken).toMatch(/^[0-9a-f]{64}$/);
      expect(planB.demoPatient.rawToken).toMatch(/^[0-9a-f]{64}$/);
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

    test('when ownerEmail is provided, all seeded patient, doctor, and pharmacy staff emails are routable', () => {
      const aliasPlan = buildVivaSeedPlan({
        now: new Date('2026-11-10T12:00:00.000Z'),
        ownerEmail: 'chamod.tester@gmail.com'
      });
      const allAccounts = [
        ...aliasPlan.documentsByModel.Patient,
        ...aliasPlan.documentsByModel.Doctor,
        ...aliasPlan.documentsByModel.PharmacyStaff
      ];
      expect(allAccounts.length).toBeGreaterThan(0);
      for (const acc of allAccounts) {
        expect(acc.email).toBeDefined();
        expect(acc.email).not.toContain('.invalid');
        expect(acc.email).not.toContain('.example');
        expect(acc.email).toContain('+');
        expect(acc.email).toContain('@gmail.com');
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

  describe('Seed Problem Fixes & Live Aggregation Verification', () => {
    test('consultation preparation preserves surveillanceVerification without schema mutation', () => {
      const Consultation = require('../src/models/Consultation');
      const sample = plan.documentsByModel.Consultation[0];
      const input = { ...sample };
      const instance = new Consultation(input);
      const obj = instance.toObject({ depopulate: true, versionKey: false });

      // In unmodified strict Consultation schema, unmapped surveillanceVerification is stripped by toObject
      expect(obj.surveillanceVerification).toBeUndefined();

      // Applying seed-viva-data.js preservation:
      for (const [k, v] of Object.entries(input)) {
        if (obj[k] === undefined && v !== undefined) {
          obj[k] = v;
        }
      }

      // After preservation, surveillanceVerification is intact for BSON collection.insertMany
      expect(obj.surveillanceVerification).toBeDefined();
      expect(obj.surveillanceVerification.status).toBe(sample.surveillanceVerification.status);
      expect(obj.surveillanceVerification.verifiedBy).toBe('viva-2026-11');
    });

    test('prepared consultations reproduce planned live public health aggregates (177 verified, 10 awaiting review)', async () => {
      const Consultation = require('../src/models/Consultation');
      const preparedConsultations = plan.documentsByModel.Consultation.map(doc => {
        const input = { ...doc };
        const instance = new Consultation(input);
        const obj = instance.toObject({ depopulate: true, versionKey: false });
        for (const [k, v] of Object.entries(input)) {
          if (obj[k] === undefined && v !== undefined) obj[k] = v;
        }
        return obj;
      });

      const agg = await aggregatePublicCases(preparedConsultations, {
        mode: 'real',
        rangeDays: 30,
        now: new Date('2026-11-10T12:00:00.000Z')
      });

      expect(agg.verifiedCases).toBe(177);
      expect(agg.awaitingReviewCount).toBe(10);
      expect(agg.state).toBe('ok');
    });

    test('real detector execution on seeded consultations triggers S-A and S-D, and suppresses S-B and S-C', () => {
      const detectorCases = plan.documentsByModel.Consultation.map(c => ({
        consultationId: String(c._id),
        district: c.district,
        diseaseId: c.icdCode,
        disease: c.diagnosis,
        time: new Date(c.createdAt).getTime(),
        createdAt: c.createdAt
      }));

      const results = evaluateOutbreakCriteria({
        cases: detectorCases,
        now: new Date('2026-11-10T12:00:00.000Z'),
        baselineDays: 56,
        level: 'district'
      });

      const sA = results.find(r => r.district === 'Gampaha' && (r.disease === 'A90' || r.disease === 'Dengue'));
      const sB = results.find(r => r.district === 'Kalutara' && (r.disease === 'A90' || r.disease === 'Dengue'));
      const sC = results.find(r => r.district === 'Matara' && (r.disease === 'A90' || r.disease === 'Dengue'));
      const sD = results.find(r => r.district === 'Kandy' && (r.disease === 'J11.1' || r.disease === 'Influenza'));

      expect(sA.triggered).toBe(true);
      expect(sA.alertLevel).toBe('Critical');
      expect(sD.triggered).toBe(true);
      expect(sD.alertLevel).toBe('Alert');

      // Negative controls suppressed
      expect(sB.triggered).toBe(false);
      expect(sC.triggered).toBe(false);
    });

    test('runVerify throws SEED_VERIFY_FAILED when live aggregates differ from plan', async () => {
      const { runVerify } = require('../../scripts/seed-viva-data.js');
      const Patient = require('../src/models/Patient');
      const Consultation = require('../src/models/Consultation');
      const OutbreakAlert = require('../src/models/OutbreakAlert');

      // Mock models to simulate mismatched live database state (e.g., 0 verified cases as occurred in real seed)
      const origPatientFindOne = Patient.findOne;
      const origConsultCount = Consultation.countDocuments;
      const origConsultFind = Consultation.collection.find;
      const origAlertFindOne = OutbreakAlert.findOne;

      try {
        Patient.findOne = jest.fn().mockResolvedValue({
          fullName: 'Saman Perera',
          nic: '200012345678',
          contactInfo: '+94771234567',
          allergies: ['Penicillin']
        });
        Consultation.countDocuments = jest.fn().mockResolvedValue(400);

        // Mismatched collection: all pending consultations (verifiedCases = 0, awaiting = 199)
        const unverifiedConsultations = plan.documentsByModel.Consultation.map(c => ({
          ...c,
          surveillanceVerification: {
            status: 'pending',
            diagnosisStatus: 'suspected',
            source: 'clinical_review'
          }
        }));
        Consultation.collection.find = jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue(unverifiedConsultations)
        });
        OutbreakAlert.findOne = jest.fn().mockImplementation(query => {
          if (query.location === 'Gampaha' || query.location === 'Kandy') {
            return Promise.resolve({ status: 'Pending', affectedCount: 12 });
          }
          return Promise.resolve(null);
        });

        let error;
        try {
          await runVerify(plan, 'medisync_automated_test');
        } catch (err) {
          error = err;
        }

        expect(error).toBeDefined();
        expect(error.message).toMatch(/SEED_VERIFY_FAILED/);
        expect(error.failures.some(f => f.includes('Live verified cases mismatch'))).toBe(true);
      } finally {
        Patient.findOne = origPatientFindOne;
        Consultation.countDocuments = origConsultCount;
        Consultation.collection.find = origConsultFind;
        OutbreakAlert.findOne = origAlertFindOne;
      }
    });
  });

  describe('Manifest-backed Seed & Robust Rollback with Real Strict Schemas', () => {
    const { runSeed, runRollback, runRollbackLegacy, runVerify } = require('../../scripts/seed-viva-data.js');
    const { deterministicObjectId } = require('../../scripts/seedVivaPlan.cjs');
    const mongoose = require('mongoose');

    const modelMap = {
      Hospital: require('../src/models/Hospital'),
      Pharmacy: require('../src/models/Pharmacy'),
      Doctor: require('../src/models/Doctor'),
      PharmacyStaff: require('../src/models/PharmacyStaff'),
      Patient: require('../src/models/Patient'),
      Consultation: require('../src/models/Consultation'),
      Prescription: require('../src/models/Prescription'),
      Dispensing: require('../src/models/Dispensing'),
      LabTest: require('../src/models/LabTest'),
      VerificationToken: require('../src/models/VerificationToken'),
      OutbreakAlert: require('../src/models/OutbreakAlert')
    };

    function setupInMemoryStore() {
      const store = {};
      const getColl = name => {
        if (!store[name]) store[name] = [];
        return store[name];
      };

      function matchesFilter(doc, filter) {
        if (!filter || Object.keys(filter).length === 0) return true;
        for (const [key, val] of Object.entries(filter)) {
          if (key === '$or') {
            if (!val.some(sub => matchesFilter(doc, sub))) return false;
            continue;
          }
          if (key === '$and') {
            if (!val.every(sub => matchesFilter(doc, sub))) return false;
            continue;
          }
          const docVal = doc[key];
          if (val instanceof RegExp) {
            if (!val.test(String(docVal || ''))) return false;
          } else if (val && typeof val === 'object' && val.$in) {
            const allowed = val.$in.map(String);
            if (!allowed.includes(String(docVal))) return false;
          } else if (val && typeof val === 'object' && val.$nin) {
            const forbidden = val.$nin.map(String);
            if (forbidden.includes(String(docVal))) return false;
          } else {
            if (String(docVal) !== String(val)) return false;
          }
        }
        return true;
      }

      function cloneDoc(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof mongoose.Types.ObjectId || obj._bsontype === 'ObjectID' || (typeof obj.toHexString === 'function')) {
          return new mongoose.Types.ObjectId(obj.toString());
        }
        if (Array.isArray(obj)) return obj.map(cloneDoc);
        const copy = {};
        for (const [k, v] of Object.entries(obj)) {
          copy[k] = cloneDoc(v);
        }
        return copy;
      }

      const createAdapter = name => ({
        collectionName: name,
        async insertMany(docs) {
          const coll = getColl(name);
          for (const d of docs) {
            const idStr = String(d._id);
            if (coll.some(existing => String(existing._id) === idStr)) {
              const err = new Error(`E11000 duplicate key error collection: ${name} index: _id_ dup key: { _id: "${idStr}" }`);
              err.code = 11000;
              throw err;
            }
            coll.push(cloneDoc(d));
          }
          return { insertedCount: docs.length };
        },
        async updateOne(filter, update, options = {}) {
          const coll = getColl(name);
          const idx = coll.findIndex(d => matchesFilter(d, filter));
          const setDoc = update.$set || update;
          if (idx >= 0) {
            coll[idx] = { ...coll[idx], ...cloneDoc(setDoc) };
          } else if (options.upsert) {
            coll.push({ ...cloneDoc(filter), ...cloneDoc(setDoc) });
          }
          return { acknowledged: true };
        },
        async deleteOne(filter) {
          const coll = getColl(name);
          const idx = coll.findIndex(d => matchesFilter(d, filter));
          if (idx >= 0) {
            coll.splice(idx, 1);
            return { deletedCount: 1 };
          }
          return { deletedCount: 0 };
        },
        async deleteMany(filter) {
          const coll = getColl(name);
          const before = coll.length;
          store[name] = coll.filter(d => !matchesFilter(d, filter));
          return { deletedCount: before - store[name].length };
        },
        async countDocuments(filter = {}) {
          const coll = getColl(name);
          return coll.filter(d => matchesFilter(d, filter)).length;
        },
        find(filter = {}) {
          const coll = getColl(name);
          const results = coll.filter(d => matchesFilter(d, filter));
          return {
            toArray: async () => results.map(cloneDoc)
          };
        },
        async findOne(filter = {}) {
          const coll = getColl(name);
          const res = coll.find(d => matchesFilter(d, filter));
          return res ? cloneDoc(res) : null;
        }
      });

      const origCollections = {};
      const origFindOnes = {};
      const origCountDocs = {};
      const origFinds = {};
      const origConnCollection = mongoose.connection.collection;

      for (const [modelName, Model] of Object.entries(modelMap)) {
        const collName = Model.collection.collectionName;
        origCollections[modelName] = Model.collection;
        origFindOnes[modelName] = Model.findOne;
        origCountDocs[modelName] = Model.countDocuments;
        origFinds[modelName] = Model.find;

        const adapter = createAdapter(collName);
        Model.collection = adapter;
        Model.findOne = filter => adapter.findOne(filter);
        Model.countDocuments = filter => adapter.countDocuments(filter);
        Model.find = filter => Promise.resolve(adapter.find(filter).toArray());
      }

      mongoose.connection.collection = name => createAdapter(name);

      const restore = () => {
        for (const [modelName, Model] of Object.entries(modelMap)) {
          Model.collection = origCollections[modelName];
          Model.findOne = origFindOnes[modelName];
          Model.countDocuments = origCountDocs[modelName];
          Model.find = origFinds[modelName];
        }
        mongoose.connection.collection = origConnCollection;
      };

      return { store, getColl, createAdapter, restore };
    }

    test('seed followed by rollback leaves zero documents in every collection, and manifest is cleaned up', async () => {
      const inMem = setupInMemoryStore();
      process.env.SEED_TEST_PASSWORD = 'TestPassword123!';

      try {
        // 1. Run seed into in-memory store
        await runSeed(plan, 'medisync_automated_test');

        // Check documents inserted into collections
        expect(inMem.getColl('hospitals').length).toBe(2);
        expect(inMem.getColl('pharmacies').length).toBe(2);
        expect(inMem.getColl('doctors').length).toBe(4);
        expect(inMem.getColl('pharmacystaffs').length).toBe(3);
        expect(inMem.getColl('patients').length).toBe(30);
        expect(inMem.getColl('consultations').length).toBe(400);
        expect(inMem.getColl('prescriptions').length).toBe(283);
        expect(inMem.getColl('dispensings').length).toBe(180);
        expect(inMem.getColl('labtests').length).toBe(12);
        expect(inMem.getColl('verificationtokens').length).toBe(1);
        expect(inMem.getColl('outbreakalerts').length).toBeGreaterThanOrEqual(2);

        // Check manifest was recorded in seed_manifests collection
        const manifestColl = inMem.getColl('seed_manifests');
        expect(manifestColl.length).toBe(1);
        expect(manifestColl[0].batch).toBe('viva-2026-11');
        expect(manifestColl[0].collections.hospitals.length).toBe(2);

        // 2. Run rollback
        await runRollback('medisync_automated_test');

        // Verify EVERY collection has 0 remaining documents
        const allCollNames = [
          'hospitals', 'pharmacies', 'doctors', 'pharmacystaffs', 'patients',
          'consultations', 'prescriptions', 'dispensings', 'labtests',
          'verificationtokens', 'outbreakalerts'
        ];
        for (const name of allCollNames) {
          expect(inMem.getColl(name).length).toBe(0);
        }

        // Verify manifest was also deleted
        expect(inMem.getColl('seed_manifests').length).toBe(0);
      } finally {
        inMem.restore();
        delete process.env.SEED_TEST_PASSWORD;
      }
    });

    test('seed twice in a row without error (seed -> rollback -> seed -> verify)', async () => {
      const inMem = setupInMemoryStore();
      process.env.SEED_TEST_PASSWORD = 'TestPassword123!';

      try {
        // First seed
        await runSeed(plan, 'medisync_automated_test');

        // Rollback
        await runRollback('medisync_automated_test');

        // Second seed (must NOT throw E11000 duplicate key error)
        await runSeed(plan, 'medisync_automated_test');

        // Verify all 400 consultations, 177 verified, 10 awaiting review pass cleanly
        await expect(runVerify(plan, 'medisync_automated_test')).resolves.not.toThrow();
      } finally {
        inMem.restore();
        delete process.env.SEED_TEST_PASSWORD;
      }
    });

    test('rollback removes the QR token record from database', async () => {
      const inMem = setupInMemoryStore();
      process.env.SEED_TEST_PASSWORD = 'TestPassword123!';

      try {
        await runSeed(plan, 'medisync_automated_test');
        expect(inMem.getColl('verificationtokens').length).toBe(1);

        await runRollback('medisync_automated_test');
        expect(inMem.getColl('verificationtokens').length).toBe(0);
      } finally {
        inMem.restore();
        delete process.env.SEED_TEST_PASSWORD;
      }
    });

    test('pre-flight check blocks duplicate insertion with zero writes', async () => {
      const inMem = setupInMemoryStore();
      process.env.SEED_TEST_PASSWORD = 'TestPassword123!';

      try {
        // Pre-insert a conflicting Doctor document with planned doctorId
        inMem.getColl('doctors').push({
          _id: new mongoose.Types.ObjectId(deterministicObjectId('Doctor', 0)),
          doctorId: 'DOC-VIVA-01',
          fullName: 'Dr. Anura Jayasinghe'
        });

        // runSeed should detect pre-flight conflict and abort BEFORE writing any Hospital, Pharmacy, etc.
        await expect(runSeed(plan, 'medisync_automated_test')).rejects.toThrow(/PREFLIGHT_CONFLICT/);

        // Verify zero writes: hospitals, pharmacies have 0 documents, and doctors still only has the 1 pre-existing doc
        expect(inMem.getColl('hospitals').length).toBe(0);
        expect(inMem.getColl('pharmacies').length).toBe(0);
        expect(inMem.getColl('doctors').length).toBe(1);
        expect(inMem.getColl('consultations').length).toBe(0);
      } finally {
        inMem.restore();
        delete process.env.SEED_TEST_PASSWORD;
      }
    });

    test('failure injected on collection 3 leaves zero documents (all-or-nothing rollback)', async () => {
      const inMem = setupInMemoryStore();
      process.env.SEED_TEST_PASSWORD = 'TestPassword123!';

      // Inject failure on collection 3 (Doctor)
      const origDocInsertMany = modelMap.Doctor.collection.insertMany;
      modelMap.Doctor.collection.insertMany = async () => {
        throw new Error('SIMULATED_COLLECTION_3_DATABASE_FAILURE');
      };

      try {
        await expect(runSeed(plan, 'medisync_automated_test')).rejects.toThrow(/partial insert rolled back/);

        // Verify all-or-nothing: Hospital (coll 1) and Pharmacy (coll 2) were automatically rolled back
        expect(inMem.getColl('hospitals').length).toBe(0);
        expect(inMem.getColl('pharmacies').length).toBe(0);
        expect(inMem.getColl('doctors').length).toBe(0);
        expect(inMem.getColl('seed_manifests').length).toBe(0);
      } finally {
        modelMap.Doctor.collection.insertMany = origDocInsertMany;
        inMem.restore();
        delete process.env.SEED_TEST_PASSWORD;
      }
    });

    test('legacy matcher finds documents lacking markers and inspect reports them', async () => {
      const inMem = setupInMemoryStore();
      const { runInspect } = require('../../scripts/seed-viva-data.js');

      try {
        // Insert documents lacking synthetic markers (as in initial prod seed)
        inMem.getColl('doctors').push({
          _id: new mongoose.Types.ObjectId(deterministicObjectId('Doctor', 0)),
          doctorId: 'DOC-VIVA-01',
          fullName: 'Dr. Anura Jayasinghe',
          role: 'doctor'
        });
        inMem.getColl('prescriptions').push({
          _id: new mongoose.Types.ObjectId(deterministicObjectId('Prescription', 0)),
          prescriptionId: 'RX-VIVA-2026-00001'
        });
        inMem.getColl('verificationtokens').push({
          _id: new mongoose.Types.ObjectId(deterministicObjectId('VerificationToken', 0)),
          consultationRef: 'CON-VIVA-2026-0003',
          tokenHash: 'f86a9daf22ed532da016094ca75449a7575d3b7f34e3a6a59b689bd5db42b049'
        });

        // 1. runInspect detects orphan mismatches
        const inspectRes = await runInspect(plan, 'medisync_automated_test');
        expect(inspectRes.mismatches.length).toBeGreaterThanOrEqual(3);
        const docMismatch = inspectRes.mismatches.find(m => m.collection === 'Doctor');
        expect(docMismatch).toBeDefined();
        expect(docMismatch.hasBatch).toBe(false);
        expect(docMismatch.hasDeterministicId).toBe(true);

        // 2. runRollbackLegacy dry-run finds them and explains reason
        const dryRes = await runRollbackLegacy('medisync_automated_test', false);
        expect(dryRes.totalFound).toBe(3);
        expect(dryRes.totalDeleted).toBe(0);

        // 3. runRollbackLegacy confirm deletes them
        const cleanRes = await runRollbackLegacy('medisync_automated_test', true);
        expect(cleanRes.totalDeleted).toBe(3);
        expect(inMem.getColl('doctors').length).toBe(0);
        expect(inMem.getColl('prescriptions').length).toBe(0);
        expect(inMem.getColl('verificationtokens').length).toBe(0);
      } finally {
        inMem.restore();
      }
    });

    test('no document from the batch has the exposed password hash after cleanup', async () => {
      const inMem = setupInMemoryStore();
      const testPass = 'SecretExposedHash123!';
      process.env.SEED_TEST_PASSWORD = testPass;

      try {
        await runSeed(plan, 'medisync_automated_test');

        // Find documents in user collections
        const userCollections = ['doctors', 'pharmacystaffs', 'patients'];
        let usersWithPassword = 0;
        for (const collName of userCollections) {
          usersWithPassword += inMem.getColl(collName).filter(d => d.password).length;
        }
        expect(usersWithPassword).toBeGreaterThan(0);

        // Rollback
        await runRollback('medisync_automated_test');

        // Check that after cleanup, 0 documents have passwords or exist in seeded collections
        for (const collName of userCollections) {
          const count = inMem.getColl(collName).length;
          expect(count).toBe(0);
        }
      } finally {
        inMem.restore();
        delete process.env.SEED_TEST_PASSWORD;
      }
    });

    test('viva rollback and legacy rollback strictly protect SEED_2026_11_A and never match or delete them', async () => {
      const inMem = setupInMemoryStore();
      const crypto = require('crypto');

      try {
        // Populate SEED_2026_11_A compact documents
        const platformDocId = crypto.createHash('sha256').update('SEED_2026_11_A|Doctor|0').digest('hex').slice(0, 24);
        const platformHospId = crypto.createHash('sha256').update('SEED_2026_11_A|Hospital|0').digest('hex').slice(0, 24);
        const platformPatientId = crypto.createHash('sha256').update('SEED_2026_11_A|Patient|0').digest('hex').slice(0, 24);

        inMem.getColl('doctors').push({
          _id: new mongoose.Types.ObjectId(platformDocId),
          doctorId: 'SEED_2026_11_A-DOCTOR-00001',
          name: 'SEED Doctor 00001',
          email: 'seed_2026_11_a-doctor-00001@accounts.invalid',
          syntheticSeedBatch: 'SEED_2026_11_A',
          isSynthetic: true
        });

        inMem.getColl('hospitals').push({
          _id: new mongoose.Types.ObjectId(platformHospId),
          regNo: 'SEED_2026_11_A-HOSPITAL-00001',
          name: 'SEED Hospital 00001',
          email: 'seed_2026_11_a-hospital-00001@accounts.invalid',
          syntheticSeedBatch: 'SEED_2026_11_A',
          isSynthetic: true
        });

        inMem.getColl('patients').push({
          _id: new mongoose.Types.ObjectId(platformPatientId),
          nic: '999990000001',
          email: 'seed_2026_11_a-patient-00001@accounts.invalid',
          syntheticSeedBatch: 'SEED_2026_11_A',
          isSynthetic: true
        });

        // Demo outbreak alert
        inMem.getColl('outbreakalerts').push({
          _id: new mongoose.Types.ObjectId(),
          disease: 'Dengue',
          syntheticSeedBatch: 'DEMO_OUTBREAK_2026_V1',
          isSynthetic: true
        });

        // 1. Run legacy dry-run: MUST find 0 documents
        const dryRes = await runRollbackLegacy('medisync_automated_test', false);
        expect(dryRes.totalFound).toBe(0);

        // 2. Run legacy confirm: MUST delete 0 documents
        const legacyRes = await runRollbackLegacy('medisync_automated_test', true);
        expect(legacyRes.totalDeleted).toBe(0);
        expect(inMem.getColl('doctors').length).toBe(1);
        expect(inMem.getColl('hospitals').length).toBe(1);
        expect(inMem.getColl('patients').length).toBe(1);

        // 3. Run normal rollback: MUST delete 0 protected documents
        await runRollback('medisync_automated_test');
        expect(inMem.getColl('doctors').length).toBe(1);
        expect(inMem.getColl('hospitals').length).toBe(1);
        expect(inMem.getColl('patients').length).toBe(1);
        expect(inMem.getColl('outbreakalerts').length).toBe(1);
      } finally {
        inMem.restore();
      }
    });

    test('auditOrphans and restoreProtectedSeed properly identify and restore missing SEED_2026_11_A entities', async () => {
      const inMem = setupInMemoryStore();
      const { auditOrphans } = require('../../scripts/audit_orphans_readonly.js');
      const { restoreProtectedSeed } = require('../../scripts/restore_protected_seed.js');

      try {
        // Create an in-memory db wrapper matching the mock interface
        const mockDb = {
          collection(name) {
            const coll = inMem.getColl(name);
            return {
              async findOne(q) {
                return coll.find(d => String(d._id) === String(q._id)) || null;
              },
              async insertOne(doc) {
                coll.push(doc);
                return { insertedId: doc._id };
              },
              find(filter = {}, options = {}) {
                return {
                  toArray: async () => coll.filter(d => {
                    if (!filter || Object.keys(filter).length === 0) return true;
                    if (filter._id && filter._id.$in) {
                      const allowed = filter._id.$in.map(String);
                      return allowed.includes(String(d._id));
                    }
                    return true;
                  })
                };
              },
              countDocuments: async () => coll.length
            };
          }
        };

        // Initially no primary records, but consultations pointing to them
        inMem.getColl('consultations').push({
          _id: new mongoose.Types.ObjectId(),
          doctorId: 'e73b93cdd8887b1bcfef73cc', // SEED Doctor 00001
          hospitalId: 'bafb9d88a55d53f25bd5efb6', // SEED Hospital 00001
          patientId: 'c05a402dfb36ca2ad6b5de25' // SEED Patient 00001
        });

        // 1. Audit reports orphans
        const auditBefore = await auditOrphans(mockDb, 'medisync_automated_test');
        expect(auditBefore.isClean).toBe(false);
        expect(auditBefore.totalOrphans).toBe(3);

        // 2. Dry run restore: finds 21 missing, restores 0
        const dryRes = await restoreProtectedSeed({ database: 'medisync_automated_test', confirm: false, customDb: mockDb });
        expect(dryRes.missingCount).toBe(21);
        expect(dryRes.restoredCount).toBe(0);

        // 3. Confirm restore: restores all 21 records
        const confirmRes = await restoreProtectedSeed({ database: 'medisync_automated_test', confirm: true, customDb: mockDb });
        expect(confirmRes.restoredCount).toBe(21);

        // 4. Post-restore audit reports 0 orphans
        const auditAfter = await auditOrphans(mockDb, 'medisync_automated_test');
        expect(auditAfter.isClean).toBe(true);
        expect(auditAfter.totalOrphans).toBe(0);
      } finally {
        inMem.restore();
      }
    });
  });
});
