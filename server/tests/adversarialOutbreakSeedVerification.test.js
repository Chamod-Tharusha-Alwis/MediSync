'use strict';

/**
 * server/tests/adversarialOutbreakSeedVerification.test.js
 *
 * Empirical Adversarial Challenger Test Suite for Milestone 1 Step 1 (Feature F Seed Script)
 *
 * Stress-tests:
 * 1. Surveillance Service Ingestion & Provenance Isolation
 *    - selectCases accepts 100% of seeded consultations in mode: 'simulation' within active window.
 *    - Zero provenance, unverified, unconfirmed, or identity/location exclusions on valid seeded data.
 *    - Strict cross-contamination barrier: simulated records rejected in 'real' mode; real records rejected in 'simulation' mode.
 *    - Historical baseline exclusion verification (days 89..30 excluded strictly by reporting_time).
 *    - Adversarial corruption fuzzing (bad ICD, invalid district, unverified status, unconfirmed diagnosis, future timestamps).
 *    - Duplicate episode deduplication oracle.
 *
 * 2. Batch Isolation & Selective Teardown
 *    - Multi-batch mixture: Batch A (seed 101), Batch B (seed 202), Batch C (seed 303), and diverse non-simulated records.
 *    - Execution of --remove --batch <batchA_id>:
 *      * 100% of Batch A records removed.
 *      * 100% of Batch B and Batch C records preserved.
 *      * 100% of non-simulated clinical consultations remain completely untouched.
 *    - Idempotent repeated removal, non-existent batch removal, and invalid argument handling.
 *
 * 3. Public DTO Privacy & Field Leak Elimination
 *    - Fail-closed raw document rejection: passing raw consultation to healthDto throws INVALID_AGGREGATE.
 *    - Deep contaminated aggregate payload injection: asserts zero leakage of patientId, consultationId,
 *      patientNic, symptoms, notes, doctorId, or any unapproved fields across all DTO levels.
 *    - Key whitelisting validation & serialized regex scan.
 *    - Boundary validation (negative counts, non-integers, length limits).
 */

const path = require('path');
const mongoose = require('mongoose');
const { selectCases, POLICY, diseaseId } = require('../src/services/surveillanceService');
const { healthDto } = require('../src/security/publicDto');

const seedScriptPath = path.resolve(__dirname, '../../scripts/seed-demo-outbreak.js');
const seedModule = require(seedScriptPath);

// Robust In-Memory MongoDB Collection Mock
class InMemoryCollectionMock {
  constructor() {
    this.documents = [];
  }

  reset() {
    this.documents = [];
  }

  matchesVal(a, b) {
    if (a === b) return true;
    if (a === undefined || b === undefined || a === null || b === null) return a === b;
    if (typeof a === 'boolean' || typeof b === 'boolean') return a === b;
    if (typeof a === 'number' || typeof b === 'number') return a === b;
    return String(a) === String(b);
  }

  matchesQuery(doc, query) {
    for (const [k, v] of Object.entries(query)) {
      const isOperatorObj = v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) &&
        Object.keys(v).some(key => key.startsWith('$'));

      if (isOperatorObj) {
        if (v.$ne !== undefined) {
          if (this.matchesVal(doc[k], v.$ne)) return false;
        }
        if (v.$exists !== undefined) {
          if (Boolean(doc[k] !== undefined) !== v.$exists) return false;
        }
        if (v.$in !== undefined && Array.isArray(v.$in)) {
          if (!v.$in.some(target => this.matchesVal(doc[k], target))) return false;
        }
        if (v.$gte !== undefined) {
          const val = doc[k] instanceof Date ? doc[k].getTime() : doc[k];
          const target = v.$gte instanceof Date ? v.$gte.getTime() : v.$gte;
          if (val < target) return false;
        }
        if (v.$lte !== undefined) {
          const val = doc[k] instanceof Date ? doc[k].getTime() : doc[k];
          const target = v.$lte instanceof Date ? v.$lte.getTime() : v.$lte;
          if (val > target) return false;
        }
      } else {
        if (!this.matchesVal(doc[k], v)) return false;
      }
    }
    return true;
  }

  async insertMany(docs) {
    for (const doc of docs) {
      this.documents.push({
        _id: doc._id || new mongoose.Types.ObjectId(),
        ...doc
      });
    }
    return { insertedCount: docs.length };
  }

  async find(query = {}) {
    const matched = this.documents.filter(doc => this.matchesQuery(doc, query));
    return {
      async toArray() {
        return matched;
      }
    };
  }

  async countDocuments(query = {}) {
    const cursor = await this.find(query);
    const arr = await cursor.toArray();
    return arr.length;
  }

  async deleteMany(query = {}) {
    const before = this.documents.length;
    this.documents = this.documents.filter(doc => !this.matchesQuery(doc, query));
    return { deletedCount: before - this.documents.length };
  }

  async distinct(field, query = {}) {
    const cursor = await this.find(query);
    const arr = await cursor.toArray();
    return [...new Set(arr.map(doc => doc[field]).filter(Boolean))];
  }
}

describe('Adversarial Verification Suite: Feature F Demo Outbreak Seed & Integration', () => {
  let mockConsultationCol;

  beforeEach(() => {
    mockConsultationCol = new InMemoryCollectionMock();
  });

  // =========================================================================
  // 1. SURVEILLANCE SERVICE INGESTION & ISOLATION
  // =========================================================================
  describe('1. Surveillance Service Ingestion & Isolation', () => {
    test('1.1: surveillanceService.selectCases accepts 100% of seeded 30-day window cases in mode: "simulation"', () => {
      const fixedNow = new Date('2026-11-03T12:00:00.000Z');
      const dataset = seedModule.generateOutbreakDataset(2026, { now: fixedNow });
      const candidates = dataset.consultations;

      // Filter candidates falling strictly in the active 30-day window [now - 30*DAY, now]
      const thirtyDaysMs = 30 * 86400000;
      const windowStart = fixedNow.getTime() - thirtyDaysMs;
      const candidatesInWindow = candidates.filter(c => {
        const t = new Date(c.createdAt).getTime();
        return t >= windowStart && t <= fixedNow.getTime();
      });

      expect(candidatesInWindow.length).toBeGreaterThan(500);

      // Run real surveillance service case selection in simulation mode
      const result = selectCases(candidatesInWindow, { mode: 'simulation', now: fixedNow });

      expect(result.policy).toBe(POLICY);
      // Invariant: ZERO provenance or verification exclusions
      expect(result.excluded.provenance || 0).toBe(0);
      expect(result.excluded.unverified || 0).toBe(0);
      expect(result.excluded.unconfirmed || 0).toBe(0);
      expect(result.excluded.identity_or_location || 0).toBe(0);
      expect(result.excluded.reporting_time || 0).toBe(0);
      expect(result.excluded.repeat_episode || 0).toBe(0);

      // Invariant: 100% of in-window candidates admitted as verified cases
      expect(result.cases.length).toBe(candidatesInWindow.length);

      // Verify structure of selected cases
      for (const c of result.cases) {
        expect(c.consultationId).toBeDefined();
        expect(c.diseaseId).toMatch(/^ICD10:[A-Z0-9]+$/);
        expect(c.district).toBeDefined();
        expect(typeof c.time).toBe('number');
      }
    });

    test('1.2: Cross-contamination barrier: selectCases in mode: "real" rejects 100% of simulated consultations with provenance error', () => {
      const fixedNow = new Date('2026-11-03T12:00:00.000Z');
      const dataset = seedModule.generateOutbreakDataset(42, { now: fixedNow });
      const candidates = dataset.consultations.slice(0, 100);

      const result = selectCases(candidates, { mode: 'real', now: fixedNow });

      // Invariant: Absolutely ZERO simulated cases admitted into real surveillance
      expect(result.cases.length).toBe(0);
      expect(result.excluded.provenance).toBe(candidates.length);
    });

    test('1.3: Cross-contamination barrier: selectCases in mode: "simulation" rejects 100% of real clinical consultations with provenance error', () => {
      const fixedNow = new Date('2026-11-03T12:00:00.000Z');
      const realConsultations = [
        {
          _id: new mongoose.Types.ObjectId(),
          patientId: new mongoose.Types.ObjectId(),
          createdAt: fixedNow,
          district: 'Colombo',
          icdCode: 'A90',
          icdVersion: 'ICD-10',
          // Real clinical consultation has NO simulation/synthetic flags
          surveillanceVerification: {
            status: 'verified',
            source: 'clinical_review',
            verifiedBy: 'dr_reviewer_1',
            verifiedAt: fixedNow,
            caseDefinitionReference: 'moh-sl-dengue-guideline-2025',
            episodeId: 'EP-REAL-001',
            diagnosisStatus: 'confirmed'
          }
        },
        {
          _id: new mongoose.Types.ObjectId(),
          patientId: new mongoose.Types.ObjectId(),
          createdAt: fixedNow,
          district: 'Kandy',
          icdCode: 'A27.9',
          icdVersion: 'ICD-10',
          surveillanceVerification: {
            status: 'verified',
            source: 'clinical_review',
            verifiedBy: 'dr_reviewer_2',
            verifiedAt: fixedNow,
            caseDefinitionReference: 'moh-sl-lepto-guideline-2025',
            episodeId: 'EP-REAL-002',
            diagnosisStatus: 'confirmed'
          }
        }
      ];

      const result = selectCases(realConsultations, { mode: 'simulation', now: fixedNow });

      // Invariant: Zero real consultations admitted into simulation mode
      expect(result.cases.length).toBe(0);
      expect(result.excluded.provenance).toBe(realConsultations.length);
    });

    test('1.4: 60-day baseline historical candidates (>30 days ago) are strictly excluded by reporting_time', () => {
      const fixedNow = new Date('2026-11-03T12:00:00.000Z');
      const dataset = seedModule.generateOutbreakDataset(42, { now: fixedNow });
      const thirtyDaysMs = 30 * 86400000;
      const windowStart = fixedNow.getTime() - thirtyDaysMs;

      // Filter historical baseline candidates (> 30 days ago)
      const historicalCandidates = dataset.consultations.filter(c => {
        const t = new Date(c.createdAt).getTime();
        return t < windowStart;
      });

      expect(historicalCandidates.length).toBeGreaterThan(100);

      const result = selectCases(historicalCandidates, { mode: 'simulation', now: fixedNow });

      // Invariant: All historical baseline cases outside the 30-day window must be excluded strictly by reporting_time
      expect(result.cases.length).toBe(0);
      expect(result.excluded.reporting_time).toBe(historicalCandidates.length);
      expect(result.excluded.provenance || 0).toBe(0);
      expect(result.excluded.unverified || 0).toBe(0);
    });

    test('1.5: Adversarial input stress-testing: rejects corrupted simulated records accurately within 30-day window', () => {
      const fixedNow = new Date('2026-11-03T12:00:00.000Z');
      const validTimestamp = new Date(fixedNow.getTime() - 2 * 86400000); // 2 days ago

      const baseValid = {
        _id: new mongoose.Types.ObjectId(),
        patientId: new mongoose.Types.ObjectId(),
        createdAt: validTimestamp,
        district: 'Colombo',
        icdCode: 'A90',
        icdVersion: 'ICD-10',
        isSimulatedDemo: true,
        isSynthetic: true,
        isSimulation: true,
        isDemoData: true,
        surveillanceVerification: {
          status: 'verified',
          source: 'synthetic_qa',
          verifiedBy: 'system_demo_seeder',
          verifiedAt: validTimestamp,
          caseDefinitionReference: 'approved-synthetic-demo-protocol-v1',
          episodeId: 'EP-DEMO-TEST-001',
          diagnosisStatus: 'confirmed'
        }
      };

      // A: Invalid ICD format
      const corruptedIcd = { ...baseValid, _id: new mongoose.Types.ObjectId(), icdCode: 'INVALID-CODE' };
      // B: Invalid district
      const corruptedDistrict = { ...baseValid, _id: new mongoose.Types.ObjectId(), district: 'Atlantis' };
      // C: Missing patient ID
      const corruptedPatient = { ...baseValid, _id: new mongoose.Types.ObjectId(), patientId: null };
      // D: Unconfirmed status
      const unconfirmed = {
        ...baseValid,
        _id: new mongoose.Types.ObjectId(),
        surveillanceVerification: { ...baseValid.surveillanceVerification, diagnosisStatus: 'suspected' }
      };
      // E: Unverified status
      const unverified = {
        ...baseValid,
        _id: new mongoose.Types.ObjectId(),
        surveillanceVerification: { ...baseValid.surveillanceVerification, status: 'pending' }
      };
      // F: Wrong verification source for simulation
      const wrongSource = {
        ...baseValid,
        _id: new mongoose.Types.ObjectId(),
        surveillanceVerification: { ...baseValid.surveillanceVerification, source: 'clinical_review' }
      };
      // G: Future timestamp
      const futureTime = {
        ...baseValid,
        _id: new mongoose.Types.ObjectId(),
        createdAt: new Date(fixedNow.getTime() + 86400000),
        surveillanceVerification: { ...baseValid.surveillanceVerification, verifiedAt: new Date(fixedNow.getTime() + 86400000) }
      };

      const adversarialList = [
        corruptedIcd, corruptedDistrict, corruptedPatient,
        unconfirmed, unverified, wrongSource, futureTime
      ];

      const result = selectCases(adversarialList, { mode: 'simulation', now: fixedNow });

      expect(result.cases.length).toBe(0);
      expect(result.excluded.identity_or_location).toBe(3); // A, B, C
      expect(result.excluded.unconfirmed).toBe(1); // D
      expect(result.excluded.unverified).toBe(2); // E, F
      expect(result.excluded.reporting_time).toBe(1); // G
    });

    test('1.6: Duplicate episode oracle: duplicate visits for same patient/disease/episode count exactly once', () => {
      const fixedNow = new Date('2026-11-03T12:00:00.000Z');
      const validTimestamp = new Date(fixedNow.getTime() - 2 * 86400000); // 2 days ago

      const original = {
        _id: new mongoose.Types.ObjectId(),
        patientId: new mongoose.Types.ObjectId(),
        createdAt: validTimestamp,
        district: 'Colombo',
        icdCode: 'A90',
        icdVersion: 'ICD-10',
        isSimulatedDemo: true,
        isSynthetic: true,
        isSimulation: true,
        isDemoData: true,
        surveillanceVerification: {
          status: 'verified',
          source: 'synthetic_qa',
          verifiedBy: 'system_demo_seeder',
          verifiedAt: validTimestamp,
          caseDefinitionReference: 'approved-synthetic-demo-protocol-v1',
          episodeId: 'EP-DEMO-TEST-DUP-01',
          diagnosisStatus: 'confirmed'
        }
      };

      const repeatVisit = {
        ...original,
        _id: new mongoose.Types.ObjectId(),
        createdAt: new Date(validTimestamp.getTime() + 3600000), // 1 hour later
        surveillanceVerification: {
          ...original.surveillanceVerification,
          verifiedAt: new Date(validTimestamp.getTime() + 3600000)
        }
      };

      const result = selectCases([original, repeatVisit], { mode: 'simulation', now: fixedNow });

      expect(result.cases.length).toBe(1);
      expect(result.excluded.repeat_episode).toBe(1);
    });
  });

  // =========================================================================
  // 2. BATCH ISOLATION & SELECTIVE TEARDOWN
  // =========================================================================
  describe('2. Batch Isolation & Selective Teardown', () => {
    test('2.1: Multi-batch mixture: --remove --batch removes 100% of target batch while 100% of other batches and real clinical records remain untouched', async () => {
      const col = mockConsultationCol;

      // Seed 4 Distinct Real Clinical Consultations (variety of shapes)
      const realRecords = [
        {
          _id: new mongoose.Types.ObjectId(),
          patientNic: '850123456V',
          diagnosis: 'Type 2 Diabetes',
          district: 'Colombo',
          isSimulatedDemo: false,
          notes: 'Regular checkup'
        },
        {
          _id: new mongoose.Types.ObjectId(),
          patientNic: '900234567V',
          diagnosis: 'Essential Hypertension',
          district: 'Gampaha',
          // isSimulatedDemo is omitted entirely (standard prod document)
          notes: 'Prescription refill'
        },
        {
          _id: new mongoose.Types.ObjectId(),
          patientNic: '920345678V',
          diagnosis: 'Bronchial Asthma',
          district: 'Kandy',
          isSimulatedDemo: null,
          demoBatchId: null
        },
        {
          // Adversarial case: real record that has a demoBatchId key matching batch A, but isSimulatedDemo is false
          _id: new mongoose.Types.ObjectId(),
          patientNic: '950456789V',
          diagnosis: 'Fracture',
          district: 'Galle',
          isSimulatedDemo: false,
          demoBatchId: 'DEMO_BATCH_ALPHA'
        }
      ];
      await col.insertMany(realRecords);
      expect(await col.countDocuments()).toBe(4);

      // Seed Simulated Batch Alpha (100 records)
      const batchAlphaId = 'DEMO_BATCH_ALPHA';
      const datasetAlpha = seedModule.generateOutbreakDataset(101, { batchId: batchAlphaId });
      const recordsAlpha = datasetAlpha.consultations.slice(0, 100);
      await col.insertMany(recordsAlpha);

      // Seed Simulated Batch Beta (150 records)
      const batchBetaId = 'DEMO_BATCH_BETA';
      const datasetBeta = seedModule.generateOutbreakDataset(202, { batchId: batchBetaId });
      const recordsBeta = datasetBeta.consultations.slice(0, 150);
      await col.insertMany(recordsBeta);

      // Seed Simulated Batch Gamma (120 records)
      const batchGammaId = 'DEMO_BATCH_GAMMA';
      const datasetGamma = seedModule.generateOutbreakDataset(303, { batchId: batchGammaId });
      const recordsGamma = datasetGamma.consultations.slice(0, 120);
      await col.insertMany(recordsGamma);

      const totalBefore = await col.countDocuments();
      expect(totalBefore).toBe(4 + 100 + 150 + 120);

      // Verify Status command reflects batches properly
      const statusRes = await seedModule.runSeed(['--status'], {
        consultationCollection: col,
        silent: true
      });
      expect(statusRes.simulatedCount).toBe(100 + 150 + 120);
      expect(statusRes.nonSimulatedCount).toBe(4);
      expect(statusRes.batches.length).toBe(3);

      // EXECUTE TEARDOWN ON BATCH ALPHA
      const removeRes = await seedModule.runSeed(['--remove', '--batch', batchAlphaId], {
        consultationCollection: col,
        silent: true
      });

      expect(removeRes.success).toBe(true);
      expect(removeRes.deletedCount).toBe(100);

      // ASSERT INVARIANTS:
      // 1. 100% of Batch Alpha simulated records are deleted
      const remainingAlphaSimulated = await col.find({
        isSimulatedDemo: true,
        demoBatchId: batchAlphaId
      }).then(c => c.toArray());
      expect(remainingAlphaSimulated.length).toBe(0);

      // 2. 100% of Batch Beta records remain intact
      const remainingBeta = await col.find({
        isSimulatedDemo: true,
        demoBatchId: batchBetaId
      }).then(c => c.toArray());
      expect(remainingBeta.length).toBe(150);
      const remainingBetaIds = new Set(remainingBeta.map(r => String(r._id)));
      for (const r of recordsBeta) {
        expect(remainingBetaIds.has(String(r._id))).toBe(true);
      }

      // 3. 100% of Batch Gamma records remain intact
      const remainingGamma = await col.find({
        isSimulatedDemo: true,
        demoBatchId: batchGammaId
      }).then(c => c.toArray());
      expect(remainingGamma.length).toBe(120);
      const remainingGammaIds = new Set(remainingGamma.map(r => String(r._id)));
      for (const r of recordsGamma) {
        expect(remainingGammaIds.has(String(r._id))).toBe(true);
      }

      // 4. 100% of non-simulated clinical consultations remain completely untouched
      for (const realRec of realRecords) {
        const found = await col.find({ _id: realRec._id }).then(c => c.toArray());
        expect(found.length).toBe(1);
        expect(found[0].patientNic).toBe(realRec.patientNic);
        expect(found[0].diagnosis).toBe(realRec.diagnosis);
      }

      // 5. Total count is exactly 4 real + 150 Beta + 120 Gamma = 274
      const totalAfter = await col.countDocuments();
      expect(totalAfter).toBe(4 + 150 + 120);
    });

    test('2.2: Idempotent removal: executing --remove twice on same batch deletes 0 additional records', async () => {
      const col = mockConsultationCol;

      const batchId = 'DEMO_BATCH_IDEMPOTENT';
      const dataset = seedModule.generateOutbreakDataset(42, { batchId });
      await col.insertMany(dataset.consultations.slice(0, 50));

      const firstRemove = await seedModule.runSeed(['--remove', '--batch', batchId], {
        consultationCollection: col,
        silent: true
      });
      expect(firstRemove.deletedCount).toBe(50);

      // Second run: must be safe and report 0 deleted
      const secondRemove = await seedModule.runSeed(['--remove', '--batch', batchId], {
        consultationCollection: col,
        silent: true
      });
      expect(secondRemove.deletedCount).toBe(0);
      expect(secondRemove.success).toBe(true);
    });

    test('2.3: Non-existent batch removal touches zero records', async () => {
      const col = mockConsultationCol;
      const realId = new mongoose.Types.ObjectId();
      await col.insertMany([{ _id: realId, patientNic: '123456789V', isSimulatedDemo: false }]);

      const removeRes = await seedModule.runSeed(['--remove', '--batch', 'NON_EXISTENT_BATCH'], {
        consultationCollection: col,
        silent: true
      });

      expect(removeRes.deletedCount).toBe(0);
      expect(await col.countDocuments()).toBe(1);
    });
  });

  // =========================================================================
  // 3. PUBLIC DTO PRIVACY & FIELD LEAK ELIMINATION
  // =========================================================================
  describe('3. Public DTO Privacy & Field Leak Elimination', () => {
    test('3.1: Fail-closed raw document rejection: passing raw consultation to healthDto throws INVALID_AGGREGATE', () => {
      const dataset = seedModule.generateOutbreakDataset(42);
      const rawConsultation = dataset.consultations[0];

      // Attempting to pass a consultation document directly into healthDto must be strictly rejected
      expect(() => healthDto(rawConsultation)).toThrow('INVALID_AGGREGATE');
      expect(() => healthDto(null)).toThrow('INVALID_AGGREGATE');
      expect(() => healthDto({})).toThrow('INVALID_AGGREGATE');
    });

    test('3.2: Adversarial PHI injection: healthDto strips patientId, consultationId, patientNic, symptoms, and unapproved fields at all levels', () => {
      const contaminatedPayload = {
        totalCases: 1500,
        isSimulatedDemo: true,
        // MALICIOUS / SENSITIVE FIELDS INJECTED AT ROOT
        patientId: '654321654321654321654321',
        consultationId: 'CON-SECRET-001',
        patientNic: '901234567V',
        nicHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        doctorId: '654321654321654321654322',
        hospitalId: '654321654321654321654323',
        doctorName: 'Dr. John Doe',
        notes: 'Confidential clinical diagnosis notes with severe symptoms',
        symptoms: ['High fever', 'Severe abdominal cramps'],
        diagnosis: 'Dengue',
        internalToken: 'super-secret-internal-bearer-token',
        passwordHash: '$2b$10$abcdefghijklmnopqrstuv',

        byDistrict: [
          {
            district: 'Colombo',
            totalCases: 1200,
            topDisease: 'Dengue',
            // MALICIOUS INJECTIONS INSIDE DISTRICT
            patientId: '654321654321654321654324',
            consultationId: 'CON-SECRET-DIST-01',
            patientNic: '901234568V',
            address: '123 Confidential St, Colombo'
          }
        ],
        byDisease: [
          {
            disease: 'Dengue',
            totalCases: 1200,
            // MALICIOUS INJECTIONS INSIDE DISEASE
            patientId: '654321654321654321654325',
            notes: 'Disease notes leak'
          }
        ],
        trend: [
          {
            date: '2026-11-01',
            count: 45,
            // MALICIOUS INJECTIONS INSIDE TREND
            consultationId: 'CON-SECRET-TREND-01',
            patientNic: '901234569V'
          }
        ],
        forecast: [
          {
            date: '2026-11-04',
            predicted: 50,
            lower: 40,
            upper: 60,
            // MALICIOUS INJECTIONS INSIDE FORECAST
            patientId: '654321654321654321654326',
            debugPhi: 'Secret internal projection variable'
          }
        ]
      };

      const sanitized = healthDto(contaminatedPayload);

      // ASSERT STRICT PROPERTY WHITELISTING AT ROOT
      const allowedRootKeys = new Set(['totalCases', 'byDistrict', 'byDisease', 'trend', 'forecast', 'isSimulatedDemo']);
      for (const key of Object.keys(sanitized)) {
        expect(allowedRootKeys.has(key)).toBe(true);
      }

      // Root explicit undefined checks
      expect(sanitized.patientId).toBeUndefined();
      expect(sanitized.consultationId).toBeUndefined();
      expect(sanitized.patientNic).toBeUndefined();
      expect(sanitized.nicHash).toBeUndefined();
      expect(sanitized.doctorId).toBeUndefined();
      expect(sanitized.hospitalId).toBeUndefined();
      expect(sanitized.doctorName).toBeUndefined();
      expect(sanitized.notes).toBeUndefined();
      expect(sanitized.symptoms).toBeUndefined();
      expect(sanitized.diagnosis).toBeUndefined();
      expect(sanitized.internalToken).toBeUndefined();
      expect(sanitized.passwordHash).toBeUndefined();

      // District array property whitelisting
      const allowedDistrictKeys = new Set(['district', 'totalCases', 'topDisease']);
      for (const item of sanitized.byDistrict) {
        for (const k of Object.keys(item)) {
          expect(allowedDistrictKeys.has(k)).toBe(true);
        }
        expect(item.patientId).toBeUndefined();
        expect(item.consultationId).toBeUndefined();
        expect(item.patientNic).toBeUndefined();
        expect(item.address).toBeUndefined();
      }

      // Disease array property whitelisting
      const allowedDiseaseKeys = new Set(['disease', 'totalCases']);
      for (const item of sanitized.byDisease) {
        for (const k of Object.keys(item)) {
          expect(allowedDiseaseKeys.has(k)).toBe(true);
        }
        expect(item.patientId).toBeUndefined();
        expect(item.notes).toBeUndefined();
      }

      // Trend array property whitelisting
      const allowedTrendKeys = new Set(['date', 'count']);
      for (const item of sanitized.trend) {
        for (const k of Object.keys(item)) {
          expect(allowedTrendKeys.has(k)).toBe(true);
        }
        expect(item.consultationId).toBeUndefined();
        expect(item.patientNic).toBeUndefined();
      }

      // Forecast array property whitelisting
      const allowedForecastKeys = new Set(['date', 'predicted', 'lower', 'upper']);
      for (const item of sanitized.forecast) {
        for (const k of Object.keys(item)) {
          expect(allowedForecastKeys.has(k)).toBe(true);
        }
        expect(item.patientId).toBeUndefined();
        expect(item.debugPhi).toBeUndefined();
      }

      // SERIALIZED STRING SCAN ORACLE:
      // Absolutely no injected secret values may appear anywhere in serialized JSON
      const serialized = JSON.stringify(sanitized);
      expect(serialized).not.toContain('654321654321654321654321');
      expect(serialized).not.toContain('CON-SECRET');
      expect(serialized).not.toContain('901234567V');
      expect(serialized).not.toContain('901234568V');
      expect(serialized).not.toContain('901234569V');
      expect(serialized).not.toContain('Dr. John Doe');
      expect(serialized).not.toContain('Confidential clinical diagnosis');
      expect(serialized).not.toContain('super-secret-internal-bearer-token');
      expect(serialized).not.toContain('abcdefghijklmnopqrstuv');
      expect(serialized).not.toContain('123 Confidential St');
    });

    test('3.3: Invariant: isSimulatedDemo is preserved when true and omitted when false/absent', () => {
      const baseValid = {
        totalCases: 10,
        byDistrict: [{ district: 'Colombo', totalCases: 10, topDisease: 'Dengue' }],
        byDisease: [{ disease: 'Dengue', totalCases: 10 }],
        trend: [{ date: '2026-11-01', count: 10 }]
      };

      // With isSimulatedDemo: true
      const simulatedResult = healthDto({ ...baseValid, isSimulatedDemo: true });
      expect(simulatedResult.isSimulatedDemo).toBe(true);

      // With isSynthetic: true
      const syntheticResult = healthDto({ ...baseValid, isSynthetic: true });
      expect(syntheticResult.isSimulatedDemo).toBe(true);

      // With isSimulatedDemo: false
      const nonSimulatedResult = healthDto({ ...baseValid, isSimulatedDemo: false });
      expect(nonSimulatedResult.isSimulatedDemo).toBeUndefined();

      // With isSimulatedDemo omitted
      const omittedResult = healthDto(baseValid);
      expect(omittedResult.isSimulatedDemo).toBeUndefined();
    });

    test('3.4: Adversarial boundary checks: healthDto strictly enforces numeric invariants and length bounds', () => {
      const baseValid = {
        totalCases: 10,
        byDistrict: [{ district: 'Colombo', totalCases: 10, topDisease: 'Dengue' }],
        byDisease: [{ disease: 'Dengue', totalCases: 10 }],
        trend: [{ date: '2026-11-01', count: 10 }]
      };

      // Negative totalCases
      expect(() => healthDto({ ...baseValid, totalCases: -1 })).toThrow('INVALID_AGGREGATE');

      // Float totalCases
      expect(() => healthDto({ ...baseValid, totalCases: 10.5 })).toThrow('INVALID_AGGREGATE');

      // NaN totalCases
      expect(() => healthDto({ ...baseValid, totalCases: NaN })).toThrow('INVALID_AGGREGATE');

      // District label exceeding 120 characters
      const longDistrict = 'A'.repeat(121);
      expect(() => healthDto({
        ...baseValid,
        byDistrict: [{ district: longDistrict, totalCases: 10, topDisease: 'Dengue' }]
      })).toThrow('INVALID_AGGREGATE');

      // Trend array exceeding 1,000 items
      const hugeTrend = Array.from({ length: 1001 }, (_, i) => ({ date: `2026-01-${i}`, count: 1 }));
      expect(() => healthDto({ ...baseValid, trend: hugeTrend })).toThrow('INVALID_AGGREGATE');
    });
  });
});
