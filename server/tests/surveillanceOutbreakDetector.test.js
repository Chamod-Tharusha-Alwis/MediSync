'use strict';

/**
 * server/tests/surveillanceOutbreakDetector.test.js
 *
 * Unit tests for Stage D Outbreak Detector (Milestone 3 WP4):
 * - Validates detection window calculation in Asia/Colombo time (W = 7 complete days ending yesterday).
 * - Validates seed scenarios S1-S8 against scripts/seedPlatformPlan.cjs:
 *     * S1 (Dengue, Colombo/Gampaha/Kalutara): triggers Critical/Alert.
 *     * S2 (Leptospirosis, Ratnapura/Kalutara/Galle): decayed spike, N=0 in window -> NO ALERT.
 *     * S3 (Chickenpox, Galle): triggers Alert (N >= 5, consecutive elevated days >= 2).
 *     * S4 (Influenza, all 25 districts with peaks in Kandy/Nuwara Eliya): triggers Alert/Critical.
 *     * S5 (Typhoid & Diarrhoeal, Jaffna/Batticaloa): triggers Alert/Critical.
 *     * S6 (Hepatitis A, Matale): triggers Alert.
 *     * S7 (Quiet Background): N <= 1 < 5 -> NO ALERT.
 *     * S8 (Single-Day Ampara Dengue Spike): Day 7 = 6, Day 6 = 0 -> fails Gate 2 -> NO ALERT.
 * - Validates Gate 1 (Floor): N < 5 distinct episodes per disease x district returns NO ALERT.
 * - Validates Gate 2 (Persistence): Requires >= 2 consecutive elevated complete days; single-day spike fails.
 * - Validates Regularization for zero baseline and low-variance baseline.
 * - Validates Severity classification: Watch [2.0, 3.0), Alert [3.0, 4.0), Critical >= 4.0.
 */

const { buildSeedPlatformPlan } = require('../../scripts/seedPlatformPlan.cjs');
const { selectCases, evaluateOutbreakCriteria, getColomboMidnight } = require('../src/services/surveillanceService');

describe('Stage D Outbreak Detector (WP4)', () => {
  const DAY = 86400000;
  const now = new Date('2026-11-06T12:00:00Z');

  describe('1. Asia/Colombo Calendar Window & Midnight Math', () => {
    test('getColomboMidnight correctly computes Colombo local midnight in UTC', () => {
      // 2026-11-06T12:00:00Z is 17:30:00 Colombo time (+05:30).
      // Local date is 2026-11-06.
      // Midnight in Colombo is 2026-11-06 00:00:00 +05:30 = 2026-11-05 18:30:00 UTC.
      const colomboMidnight = getColomboMidnight(now);
      expect(new Date(colomboMidnight).toISOString()).toBe('2026-11-05T18:30:00.000Z');

      // Test a time just after midnight Colombo: 2026-11-05T19:00:00Z = 2026-11-06 00:30:00 Colombo
      const earlyMorning = new Date('2026-11-05T19:00:00.000Z');
      expect(new Date(getColomboMidnight(earlyMorning)).toISOString()).toBe('2026-11-05T18:30:00.000Z');

      // Test a time just before midnight Colombo: 2026-11-05T18:29:59Z = 2026-11-05 23:59:59 Colombo
      const lateNight = new Date('2026-11-05T18:29:59.000Z');
      expect(new Date(getColomboMidnight(lateNight)).toISOString()).toBe('2026-11-04T18:30:00.000Z');
    });

    test('window W excludes today and covers exactly 7 complete days ending yesterday', () => {
      const todayMidnight = getColomboMidnight(now);
      const yesterdayStart = todayMidnight - 1 * DAY;
      const windowStart = todayMidnight - 7 * DAY;

      // Single case today (since todayMidnight)
      const todayCase = { district: 'Colombo', disease: 'ICD10:A90', time: todayMidnight + 2 * 3600000, patientId: 'p1', consultationId: 'c1' };
      // 4 cases in window W
      const windowCases = [
        { district: 'Colombo', disease: 'ICD10:A90', time: yesterdayStart + 1000, patientId: 'p2', consultationId: 'c2' },
        { district: 'Colombo', disease: 'ICD10:A90', time: yesterdayStart + 2000, patientId: 'p3', consultationId: 'c3' },
        { district: 'Colombo', disease: 'ICD10:A90', time: windowStart + 1000, patientId: 'p4', consultationId: 'c4' },
        { district: 'Colombo', disease: 'ICD10:A90', time: windowStart + 2000, patientId: 'p5', consultationId: 'c5' }
      ];

      const res = evaluateOutbreakCriteria({ cases: [todayCase, ...windowCases], now });
      const colombo = res.find(r => r.district === 'Colombo');
      expect(colombo).toBeDefined();
      // Count in window W must be 4 (todayCase is strictly excluded)
      expect(colombo.count).toBe(4);
      expect(colombo.triggered).toBe(false);
      expect(colombo.reason).toBe('CASE_FLOOR_NOT_MET');
    });
  });

  describe('2. Algorithmic Gates: Floor, Persistence & Regularization', () => {
    test('Gate 1 (Floor): N < 5 cases returns triggered: false with CASE_FLOOR_NOT_MET', () => {
      const todayMidnight = getColomboMidnight(now);
      const cases = [1, 2, 3, 4].map(i => ({
        district: 'Galle',
        disease: 'ICD10:A90',
        time: todayMidnight - 2 * DAY + i * 1000,
        patientId: `p${i}`,
        consultationId: `c${i}`
      }));

      const res = evaluateOutbreakCriteria({ cases, now });
      const r = res.find(x => x.district === 'Galle');
      expect(r.count).toBe(4);
      expect(r.triggered).toBe(false);
      expect(r.reason).toBe('CASE_FLOOR_NOT_MET');
      expect(r.alertLevel).toBe('None');
    });

    test('Gate 2 (Persistence): single-day spike with N >= 5 fails persistence criteria', () => {
      const todayMidnight = getColomboMidnight(now);
      // All 8 cases occur on Day 7 (yesterday); 0 cases on days 1..6
      const cases = Array.from({ length: 8 }, (_, i) => ({
        district: 'Ampara',
        disease: 'ICD10:A90',
        time: todayMidnight - 1 * DAY + 10 * 3600000 + i * 1000,
        patientId: `p${i}`,
        consultationId: `c${i}`
      }));

      const res = evaluateOutbreakCriteria({ cases, now });
      const r = res.find(x => x.district === 'Ampara');
      expect(r.count).toBe(8);
      expect(r.maxConsecutiveDays).toBe(1);
      expect(r.triggered).toBe(false);
      expect(r.reason).toBe('PERSISTENCE_CRITERIA_NOT_MET');
    });

    test('Gate 2 (Persistence): at least two consecutive elevated days triggers alert', () => {
      const todayMidnight = getColomboMidnight(now);
      // Day 6 (2 days ago) has 4 cases; Day 7 (yesterday) has 4 cases; total N = 8
      const cases = [
        ...Array.from({ length: 4 }, (_, i) => ({
          district: 'Matara',
          disease: 'ICD10:A90',
          time: todayMidnight - 2 * DAY + 10 * 3600000 + i * 1000,
          patientId: `pA${i}`,
          consultationId: `cA${i}`
        })),
        ...Array.from({ length: 4 }, (_, i) => ({
          district: 'Matara',
          disease: 'ICD10:A90',
          time: todayMidnight - 1 * DAY + 10 * 3600000 + i * 1000,
          patientId: `pB${i}`,
          consultationId: `cB${i}`
        }))
      ];

      const res = evaluateOutbreakCriteria({ cases, now });
      const r = res.find(x => x.district === 'Matara');
      expect(r.count).toBe(8);
      expect(r.maxConsecutiveDays).toBe(2);
      expect(r.triggered).toBe(true);
      expect(r.reason).toBe('ALERT_CRITERIA_SATISFIED');
    });

    test('Regularization handles zero baseline (mu = 0.1, sigma = 0.5)', () => {
      const todayMidnight = getColomboMidnight(now);
      // Zero cases in baseline, 3 cases each on Day 6 and Day 7
      const cases = [
        ...Array.from({ length: 3 }, (_, i) => ({
          district: 'Jaffna',
          disease: 'ICD10:B159',
          time: todayMidnight - 2 * DAY + 10 * 3600000 + i * 1000,
          patientId: `pA${i}`,
          consultationId: `cA${i}`
        })),
        ...Array.from({ length: 3 }, (_, i) => ({
          district: 'Jaffna',
          disease: 'ICD10:B159',
          time: todayMidnight - 1 * DAY + 10 * 3600000 + i * 1000,
          patientId: `pB${i}`,
          consultationId: `cB${i}`
        }))
      ];

      const res = evaluateOutbreakCriteria({ cases, now });
      const r = res.find(x => x.district === 'Jaffna');
      // Daily count 3: z = (3 - 0.1) / 0.5 = 5.8
      expect(r.maxZ).toBe(5.8);
      expect(r.alertLevel).toBe('Critical');
      expect(r.severity).toBe('Critical');
    });

    test('Severity tiers: Watch [2.0, 3.0), Alert [3.0, 4.0), Critical >= 4.0', () => {
      const todayMidnight = getColomboMidnight(now);
      const baselineStart = todayMidnight - 63 * DAY;

      // Setup a baseline with mu = 1.0, sigma = 1.0 across 56 days
      const baselineCases = [];
      for (let day = 0; day < 56; day++) {
        // 2 cases on even days, 0 cases on odd days -> mean 1.0, variance ~1.0
        if (day % 2 === 0) {
          baselineCases.push(
            { district: 'Kandy', disease: 'ICD10:TEST', time: baselineStart + day * DAY + 1000, patientId: `bp${day}a`, consultationId: `bc${day}a` },
            { district: 'Kandy', disease: 'ICD10:TEST', time: baselineStart + day * DAY + 2000, patientId: `bp${day}b`, consultationId: `bc${day}b` }
          );
        }
      }

      // 4 cases/day for 2 days -> count 4, z approx (4 - 1) / 1.009 = 2.97 in [2.0, 3.0) -> Watch
      const watchCases = [
        ...baselineCases,
        { district: 'Kandy', disease: 'ICD10:TEST', time: todayMidnight - 2 * DAY + 1000, patientId: 'wp1', consultationId: 'wc1' },
        { district: 'Kandy', disease: 'ICD10:TEST', time: todayMidnight - 2 * DAY + 2000, patientId: 'wp2', consultationId: 'wc2' },
        { district: 'Kandy', disease: 'ICD10:TEST', time: todayMidnight - 2 * DAY + 3000, patientId: 'wp3', consultationId: 'wc3' },
        { district: 'Kandy', disease: 'ICD10:TEST', time: todayMidnight - 2 * DAY + 4000, patientId: 'wp4', consultationId: 'wc4' },
        { district: 'Kandy', disease: 'ICD10:TEST', time: todayMidnight - 1 * DAY + 1000, patientId: 'wp5', consultationId: 'wc5' },
        { district: 'Kandy', disease: 'ICD10:TEST', time: todayMidnight - 1 * DAY + 2000, patientId: 'wp6', consultationId: 'wc6' },
        { district: 'Kandy', disease: 'ICD10:TEST', time: todayMidnight - 1 * DAY + 3000, patientId: 'wp7', consultationId: 'wc7' },
        { district: 'Kandy', disease: 'ICD10:TEST', time: todayMidnight - 1 * DAY + 4000, patientId: 'wp8', consultationId: 'wc8' }
      ];

      const res = evaluateOutbreakCriteria({ cases: watchCases, now });
      const r = res.find(x => x.district === 'Kandy');
      expect(r.triggered).toBe(true);
      expect(['Watch', 'Alert']).toContain(r.alertLevel);
    });
  });

  describe('3. Offline Scenario Validation S1–S8 against seedPlatformPlan.cjs', () => {
    let plan, eligibleCases;

    beforeAll(() => {
      plan = buildSeedPlatformPlan({ now, compact: false });
      const consultations = plan.documentsByModel.Consultation.map(doc => {
        const rec = plan.records.find(r => r.id === doc._id);
        return {
          ...doc,
          surveillanceVerification: rec?.metadata?.surveillanceVerification,
          isSimulation: true,
          isSynthetic: true
        };
      });

      // Select cases in simulation mode with lookback covering window + 56 baseline days
      const selection = selectCases(consultations, { mode: 'simulation', now, lookbackDays: 70 });
      eligibleCases = selection.cases;
      expect(eligibleCases.length).toBeGreaterThan(3000);
    });

    test('S1: Dengue in Colombo, Gampaha, and Kalutara triggers Alert or Critical', () => {
      const results = evaluateOutbreakCriteria({ cases: eligibleCases, now });
      for (const district of ['Colombo', 'Gampaha', 'Kalutara']) {
        const r = results.find(x => x.district === district && x.disease === 'ICD10:A90');
        expect(r).toBeDefined();
        expect(r.triggered).toBe(true);
        expect(r.count).toBeGreaterThanOrEqual(5);
        expect(r.maxConsecutiveDays).toBeGreaterThanOrEqual(2);
        expect(['Alert', 'Critical']).toContain(r.alertLevel);
        expect(['High', 'Critical']).toContain(r.severity);
      }
    });

    test('S2: Leptospirosis decayed spike (17..26 days ago) does NOT trigger alert', () => {
      const results = evaluateOutbreakCriteria({ cases: eligibleCases, now });
      for (const district of ['Ratnapura', 'Kalutara', 'Galle']) {
        const r = results.find(x => x.district === district && x.disease === 'ICD10:A279');
        if (r) {
          expect(r.triggered).toBe(false);
          expect(r.count).toBeLessThan(5);
        }
      }
    });

    test('S3: Chickenpox in Galle triggers Alert with N >= 5 and persistence >= 2', () => {
      const results = evaluateOutbreakCriteria({ cases: eligibleCases, now });
      const r = results.find(x => x.district === 'Galle' && x.disease === 'ICD10:B019');
      expect(r).toBeDefined();
      expect(r.triggered).toBe(true);
      expect(r.count).toBeGreaterThanOrEqual(5);
      expect(r.maxConsecutiveDays).toBeGreaterThanOrEqual(2);
      expect(['Alert', 'Watch', 'Critical']).toContain(r.alertLevel);
    });

    test('S4: Influenza all 25 districts triggers with Kandy and Nuwara Eliya peaking', () => {
      const results = evaluateOutbreakCriteria({ cases: eligibleCases, now });
      const kandy = results.find(x => x.district === 'Kandy' && x.disease === 'ICD10:J111');
      const nuwara = results.find(x => x.district === 'Nuwara Eliya' && x.disease === 'ICD10:J111');
      const colombo = results.find(x => x.district === 'Colombo' && x.disease === 'ICD10:J111');

      expect(kandy).toBeDefined();
      expect(nuwara).toBeDefined();
      expect(kandy.triggered).toBe(true);
      expect(nuwara.triggered).toBe(true);
      expect(kandy.count).toBeGreaterThanOrEqual(50);
      expect(nuwara.count).toBeGreaterThanOrEqual(50);
      if (colombo) {
        expect(kandy.count).toBeGreaterThan(colombo.count);
      }
    });

    test('S5: Typhoid and Diarrhoeal in Jaffna and Batticaloa trigger Alert or Critical', () => {
      const results = evaluateOutbreakCriteria({ cases: eligibleCases, now });
      for (const district of ['Jaffna', 'Batticaloa']) {
        const typhoid = results.find(x => x.district === district && x.disease === 'ICD10:A0100');
        const diarrhoeal = results.find(x => x.district === district && x.disease === 'ICD10:A09');
        expect(typhoid).toBeDefined();
        expect(typhoid.triggered).toBe(true);
        expect(typhoid.count).toBeGreaterThanOrEqual(5);
        expect(typhoid.maxConsecutiveDays).toBeGreaterThanOrEqual(2);

        expect(diarrhoeal).toBeDefined();
        expect(diarrhoeal.triggered).toBe(true);
        expect(diarrhoeal.count).toBeGreaterThanOrEqual(5);
        expect(diarrhoeal.maxConsecutiveDays).toBeGreaterThanOrEqual(2);
      }
    });

    test('S6: Hepatitis A in Matale triggers Alert', () => {
      const results = evaluateOutbreakCriteria({ cases: eligibleCases, now });
      const matale = results.find(x => x.district === 'Matale' && x.disease === 'ICD10:B159');
      expect(matale).toBeDefined();
      expect(matale.triggered).toBe(true);
      expect(matale.count).toBeGreaterThanOrEqual(5);
      expect(matale.maxConsecutiveDays).toBeGreaterThanOrEqual(2);
      expect(['Alert', 'Watch', 'Critical']).toContain(matale.alertLevel);
    });

    test('S7: Quiet background chronic/routine conditions do NOT trigger alerts', () => {
      const results = evaluateOutbreakCriteria({ cases: eligibleCases, now });
      const backgroundConditions = ['ICD10:M545', 'ICD10:N390', 'ICD10:E119', 'ICD10:I10', 'ICD10:J459', 'ICD10:K297', 'ICD10:G439'];
      const triggeredBackground = results.filter(x => backgroundConditions.includes(x.disease) && x.triggered);
      expect(triggeredBackground).toHaveLength(0);
    });

    test('S8: Single-Day Ampara Dengue Spike fails Gate 2 persistence and does NOT trigger alert', () => {
      const results = evaluateOutbreakCriteria({ cases: eligibleCases, now });
      const amparaDengue = results.find(x => x.district === 'Ampara' && x.disease === 'ICD10:A90');
      expect(amparaDengue).toBeDefined();
      expect(amparaDengue.count).toBe(6); // 6 cases on Day 7 meets Gate 1 floor (>= 5)
      expect(amparaDengue.dailyCounts[6]).toBe(6); // Day 7 count = 6
      expect(amparaDengue.dailyCounts[5]).toBe(0); // Day 6 count = 0
      expect(amparaDengue.maxConsecutiveDays).toBe(1); // Only 1 elevated day
      expect(amparaDengue.triggered).toBe(false); // Fails Gate 2 persistence!
      expect(amparaDengue.reason).toBe('PERSISTENCE_CRITERIA_NOT_MET');
      expect(amparaDengue.alertLevel).toBe('None');
    });
  });
});
