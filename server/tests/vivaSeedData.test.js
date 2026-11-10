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

  beforeAll(() => {
    plan = buildVivaSeedPlan({ now: new Date('2026-11-10T12:00:00.000Z') });
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
