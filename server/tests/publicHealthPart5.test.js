'use strict';

const { calculate14DayForecast } = require('../src/utils/outbreakForecasting');

describe('Part 5: Public Health Page & Forecast Projection Verification', () => {
  test('calculate14DayForecast enforces minPoints when specified and rejects < 14 days of data', () => {
    const trend7Days = [
      { date: '2026-11-01', count: 10 },
      { date: '2026-11-02', count: 12 },
      { date: '2026-11-03', count: 14 },
      { date: '2026-11-04', count: 16 },
      { date: '2026-11-05', count: 18 },
      { date: '2026-11-06', count: 20 },
      { date: '2026-11-07', count: 22 }
    ];

    // Default minPoints is 3, so 7 days succeeds without option
    const resultDefault = calculate14DayForecast(trend7Days);
    expect(resultDefault.hasSufficientData).toBe(true);
    expect(resultDefault.forecast.length).toBe(14);

    // With minPoints: 14, 7 days is rejected with clear message
    const result14 = calculate14DayForecast(trend7Days, { minPoints: 14 });
    expect(result14.hasSufficientData).toBe(false);
    expect(result14.forecast).toEqual([]);
    expect(result14.message).toContain('minimum 14 data points required');
  });

  test('calculate14DayForecast succeeds with 14 days of data and clamps lower bound at 0', () => {
    const trend14Days = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-10-${String(15 + i).padStart(2, '0')}`,
      count: 5 + i * 2
    }));

    const result = calculate14DayForecast(trend14Days, { minPoints: 14 });
    expect(result.hasSufficientData).toBe(true);
    expect(result.forecast.length).toBe(14);
    expect(result.slope).toBeGreaterThan(0);

    result.forecast.forEach(pt => {
      expect(pt.lower).toBeGreaterThanOrEqual(0);
      expect(pt.predicted).toBeGreaterThanOrEqual(pt.lower);
      expect(pt.upper).toBeGreaterThanOrEqual(pt.predicted);
      expect(pt.bandRange).toBe(pt.upper - pt.lower);
    });
  });

  test('declining trend clamps lower bound at 0 and never goes negative', () => {
    const decliningTrend = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-10-${String(15 + i).padStart(2, '0')}`,
      count: Math.max(1, 20 - i * 2)
    }));

    const result = calculate14DayForecast(decliningTrend, { minPoints: 14 });
    expect(result.hasSufficientData).toBe(true);
    result.forecast.forEach(pt => {
      expect(pt.lower).toBeGreaterThanOrEqual(0);
      expect(pt.predicted).toBeGreaterThanOrEqual(0);
      expect(pt.upper).toBeGreaterThanOrEqual(pt.predicted);
    });
  });

  test('incomplete trailing today observation with 0 cases does not cause sudden plunge when excluded', () => {
    const trendWithoutTrailing = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-10-${String(15 + i).padStart(2, '0')}`,
      count: 10 + i * 2
    }));
    const trendWithArtificialZero = [
      ...trendWithoutTrailing,
      { date: '2026-10-29', count: 0 } // Trailing 0 from ongoing day
    ];

    const resultClean = calculate14DayForecast(trendWithoutTrailing, { minPoints: 14 });
    const resultUnclean = calculate14DayForecast(trendWithArtificialZero, { minPoints: 14 });

    // Clean forecast has healthy positive slope
    expect(resultClean.slope).toBeGreaterThan(1.5);
    // Unclean forecast slope is severely depressed by the artificial trailing 0
    expect(resultUnclean.slope).toBeLessThan(resultClean.slope);
  });
});
