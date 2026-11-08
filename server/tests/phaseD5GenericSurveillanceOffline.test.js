'use strict';

/**
 * Phase D5 Generic Surveillance for Any ICD Code Offline Regression Suite
 * Validates dynamic outbreak detection across 12+ diseases spanning multiple
 * ICD-10 chapters (both profiled and non-profiled) without any hardcoded disease whitelist.
 */

const { evaluateOutbreakCriteria, getColomboMidnight } = require('../src/services/surveillanceService');

describe('Phase D5 — Generic Surveillance for Any ICD Code Suite', () => {
  const DAY = 86400000;
  const now = new Date('2026-11-08T12:00:00Z');
  const todayMidnight = getColomboMidnight(now);
  const windowStart = todayMidnight - 7 * DAY;

  // 12 distinct diseases across multiple clinical chapters (6 profiled, 6 non-profiled)
  const TEST_DISEASES = [
    { code: 'ICD10:A90', name: 'Dengue', chapter: 'Ch. I Infectious (Profiled)' },
    { code: 'ICD10:B54', name: 'Malaria', chapter: 'Ch. I Infectious (Profiled)' },
    { code: 'ICD10:A010', name: 'Typhoid fever', chapter: 'Ch. I Infectious (Profiled)' },
    { code: 'ICD10:I219', name: 'Acute myocardial infarction', chapter: 'Ch. IX Circulatory (Profiled)' },
    { code: 'ICD10:N390', name: 'Urinary tract infection', chapter: 'Ch. XIV Genitourinary (Profiled)' },
    { code: 'ICD10:J189', name: 'Pneumonia', chapter: 'Ch. X Respiratory (Profiled)' },
    { code: 'ICD10:A009', name: 'Cholera', chapter: 'Ch. I Infectious (Non-profiled)' },
    { code: 'ICD10:B059', name: 'Measles', chapter: 'Ch. I Infectious (Non-profiled)' },
    { code: 'ICD10:J09X2', name: 'Avian influenza', chapter: 'Ch. X Respiratory (Non-profiled)' },
    { code: 'ICD10:K900', name: 'Celiac disease', chapter: 'Ch. XI Digestive (Non-profiled)' },
    { code: 'ICD10:G35', name: 'Multiple sclerosis', chapter: 'Ch. VI Nervous (Non-profiled)' },
    { code: 'ICD10:E109', name: 'Type 1 diabetes', chapter: 'Ch. IV Endocrine (Non-profiled)' },
  ];

  test('1. High counts with >=2 consecutive elevated days trigger alerts for ALL 12 diseases', () => {
    const cases = [];

    // For each disease, inject 8 cases in Colombo: 4 on Day 4, 4 on Day 5
    TEST_DISEASES.forEach((dis, dIdx) => {
      // Day 4 (windowStart + 4*DAY + offset)
      for (let i = 0; i < 4; i++) {
        cases.push({
          district: 'Colombo',
          diseaseId: dis.code,
          disease: dis.code,
          time: windowStart + 4 * DAY + (i + 1) * 3600000,
          patientId: `p-${dIdx}-${i}`,
          consultationId: `c-${dIdx}-${i}`
        });
      }
      // Day 5 (windowStart + 5*DAY + offset)
      for (let i = 0; i < 4; i++) {
        cases.push({
          district: 'Colombo',
          diseaseId: dis.code,
          disease: dis.code,
          time: windowStart + 5 * DAY + (i + 1) * 3600000,
          patientId: `p-${dIdx}-${i + 4}`,
          consultationId: `c-${dIdx}-${i + 4}`
        });
      }
    });

    const results = evaluateOutbreakCriteria({ cases, now, level: 'district' });
    expect(results.length).toBe(12);

    for (const res of results) {
      expect(res.count).toBe(8);
      expect(res.triggered).toBe(true);
      expect(['Watch', 'Alert', 'Critical']).toContain(res.alertLevel);
      expect(res.maxConsecutiveDays).toBeGreaterThanOrEqual(2);
      expect(res.maxZ).toBeGreaterThan(2.0);
    }
  });

  test('2. Sub-threshold case floor (N = 3 < 5) does NOT trigger alert for any disease', () => {
    const cases = [];
    TEST_DISEASES.forEach((dis, dIdx) => {
      // 3 cases on Day 4 and Day 5
      cases.push({
        district: 'Gampaha',
        diseaseId: dis.code,
        disease: dis.code,
        time: windowStart + 4 * DAY + 3600000,
        patientId: `sub-p-${dIdx}-1`,
        consultationId: `sub-c-${dIdx}-1`
      });
      cases.push({
        district: 'Gampaha',
        diseaseId: dis.code,
        disease: dis.code,
        time: windowStart + 5 * DAY + 3600000,
        patientId: `sub-p-${dIdx}-2`,
        consultationId: `sub-c-${dIdx}-2`
      });
      cases.push({
        district: 'Gampaha',
        diseaseId: dis.code,
        disease: dis.code,
        time: windowStart + 5 * DAY + 7200000,
        patientId: `sub-p-${dIdx}-3`,
        consultationId: `sub-c-${dIdx}-3`
      });
    });

    const results = evaluateOutbreakCriteria({ cases, now, level: 'district' });
    expect(results.length).toBe(12);

    for (const res of results) {
      expect(res.count).toBe(3);
      expect(res.triggered).toBe(false);
      expect(res.reason).toBe('CASE_FLOOR_NOT_MET');
      expect(res.alertLevel).toBe('None');
    }
  });

  test('3. Non-consecutive isolated spikes fail persistence gate (Gate 2)', () => {
    // 8 cases total: 4 on Day 1, 4 on Day 5 (separated by 3 quiet days)
    const cases = [
      { district: 'Kandy', diseaseId: 'ICD10:A009', disease: 'ICD10:A009', time: windowStart + 1 * DAY + 1000 },
      { district: 'Kandy', diseaseId: 'ICD10:A009', disease: 'ICD10:A009', time: windowStart + 1 * DAY + 2000 },
      { district: 'Kandy', diseaseId: 'ICD10:A009', disease: 'ICD10:A009', time: windowStart + 1 * DAY + 3000 },
      { district: 'Kandy', diseaseId: 'ICD10:A009', disease: 'ICD10:A009', time: windowStart + 1 * DAY + 4000 },
      { district: 'Kandy', diseaseId: 'ICD10:A009', disease: 'ICD10:A009', time: windowStart + 5 * DAY + 1000 },
      { district: 'Kandy', diseaseId: 'ICD10:A009', disease: 'ICD10:A009', time: windowStart + 5 * DAY + 2000 },
      { district: 'Kandy', diseaseId: 'ICD10:A009', disease: 'ICD10:A009', time: windowStart + 5 * DAY + 3000 },
      { district: 'Kandy', diseaseId: 'ICD10:A009', disease: 'ICD10:A009', time: windowStart + 5 * DAY + 4000 }
    ];

    const results = evaluateOutbreakCriteria({ cases, now, level: 'district' });
    expect(results.length).toBe(1);
    const chol = results[0];
    expect(chol.count).toBe(8);
    expect(chol.maxConsecutiveDays).toBe(1);
    expect(chol.triggered).toBe(false);
    expect(chol.alertLevel).toBe('None');
  });
});
