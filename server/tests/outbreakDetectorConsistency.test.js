'use strict';

const { evaluateOutbreakCriteria } = require('../src/services/surveillanceService');

describe('Fix E: Outbreak Detector Consistency, Z-Score, Deviation, and Unified Severity', () => {
  const baseDate = new Date('2026-11-12T12:00:00.000Z');

  function makeConsultations(district, disease, icdCode, dates) {
    return dates.map((d, i) => ({
      _id: `test-con-${district}-${disease}-${i}`,
      createdAt: new Date(d),
      district,
      disease,
      diseaseId: disease,
      icdCode
    }));
  }

  it('calculates finite zScore, baseline7d, and deviationPct with unified severity for Dengue (Critical)', () => {
    // 28 days baseline with 1 case every other day (~14 cases over 28 days => mean = 0.5 cases/day)
    const baselineDates = [];
    for (let day = 35; day > 7; day -= 2) {
      const d = new Date(baseDate.getTime() - day * 86400000);
      baselineDates.push(d.toISOString());
    }

    // Evaluation window (last 7 days): spike of 5 cases on day -2, 5 cases on day -1 (consecutive elevated)
    const evalDates = [
      new Date(baseDate.getTime() - 2 * 86400000).toISOString(),
      new Date(baseDate.getTime() - 2 * 86400000).toISOString(),
      new Date(baseDate.getTime() - 2 * 86400000).toISOString(),
      new Date(baseDate.getTime() - 2 * 86400000).toISOString(),
      new Date(baseDate.getTime() - 2 * 86400000).toISOString(),
      new Date(baseDate.getTime() - 1 * 86400000).toISOString(),
      new Date(baseDate.getTime() - 1 * 86400000).toISOString(),
      new Date(baseDate.getTime() - 1 * 86400000).toISOString(),
      new Date(baseDate.getTime() - 1 * 86400000).toISOString(),
      new Date(baseDate.getTime() - 1 * 86400000).toISOString(),
    ];

    const cases = makeConsultations('Gampaha', 'Dengue', 'A90', [...baselineDates, ...evalDates]);
    const res = evaluateOutbreakCriteria({ cases, now: baseDate, baselineDays: 28, evalDays: 7 });

    expect(res).toHaveLength(1);
    const item = res[0];
    expect(item.disease).toBe('Dengue');
    expect(item.district).toBe('Gampaha');
    expect(item.triggered).toBe(true);
    expect(Number.isFinite(item.maxZ)).toBe(true);
    expect(Number.isFinite(item.zScore)).toBe(true);
    expect(Number.isFinite(item.deviationPct)).toBe(true);
    expect(Number.isFinite(item.baseline7d)).toBe(true);
    expect(item.baseline7d).toBeGreaterThan(0);
    expect(item.deviationPct).toBeGreaterThan(0);
    expect(item.severity).toBe('Critical');
  });

  it('produces High severity (not Critical) for Kandy Influenza with zScore between 3.0 and 4.0', () => {
    // Baseline mean ~1 case per day (28 cases over 28 days)
    const baselineDates = [];
    for (let day = 35; day > 7; day--) {
      const d = new Date(baseDate.getTime() - day * 86400000);
      baselineDates.push(d.toISOString());
    }

    // Daily variance: bStdDev ~ 1. Evaluation window with z ~ 3.2 on consecutive days (e.g. 4 cases, 4 cases)
    // Poisson z = (c - lambda) / sqrt(lambda) = (4 - 1) / 1 = 3.0
    const evalDates = [
      new Date(baseDate.getTime() - 2 * 86400000).toISOString(),
      new Date(baseDate.getTime() - 2 * 86400000).toISOString(),
      new Date(baseDate.getTime() - 2 * 86400000).toISOString(),
      new Date(baseDate.getTime() - 2 * 86400000).toISOString(),
      new Date(baseDate.getTime() - 1 * 86400000).toISOString(),
      new Date(baseDate.getTime() - 1 * 86400000).toISOString(),
      new Date(baseDate.getTime() - 1 * 86400000).toISOString(),
      new Date(baseDate.getTime() - 1 * 86400000).toISOString(),
    ];

    const cases = makeConsultations('Kandy', 'Influenza', 'J11.1', [...baselineDates, ...evalDates]);
    const res = evaluateOutbreakCriteria({ cases, now: baseDate, baselineDays: 28, evalDays: 7 });

    expect(res).toHaveLength(1);
    const item = res[0];
    expect(item.disease).toBe('Influenza');
    expect(item.district).toBe('Kandy');
    expect(item.triggered).toBe(true);
    expect(item.maxZ).toBeGreaterThanOrEqual(3.0);
    expect(item.maxZ).toBeLessThan(4.0);
    expect(item.severity).toBe('High');
    expect(Number.isFinite(item.deviationPct)).toBe(true);
    expect(isNaN(item.zScore)).toBe(false);
  });

  it('suppresses one-day spikes (Kalutara) and low case floor (Matara)', () => {
    // Baseline: 28 days with 0 cases
    // Kalutara: 6 cases on 1 single day -> not consecutive -> triggered: false
    const kalutaraCases = [
      ...Array(6).fill(null).map(() => new Date(baseDate.getTime() - 86400000).toISOString())
    ];
    const casesKalu = makeConsultations('Kalutara', 'Dengue', 'A90', kalutaraCases);
    const resKalu = evaluateOutbreakCriteria({ cases: casesKalu, now: baseDate, baselineDays: 28, evalDays: 7 });
    expect(resKalu[0].triggered).toBe(false);

    // Matara: 4 cases spread over 2 days (floor requires >= 5) -> triggered: false
    const mataraCases = [
      new Date(baseDate.getTime() - 2 * 86400000).toISOString(),
      new Date(baseDate.getTime() - 2 * 86400000).toISOString(),
      new Date(baseDate.getTime() - 1 * 86400000).toISOString(),
      new Date(baseDate.getTime() - 1 * 86400000).toISOString(),
    ];
    const casesMat = makeConsultations('Matara', 'Dengue', 'A90', mataraCases);
    const resMat = evaluateOutbreakCriteria({ cases: casesMat, now: baseDate, baselineDays: 28, evalDays: 7 });
    expect(resMat[0].triggered).toBe(false);
  });
});
