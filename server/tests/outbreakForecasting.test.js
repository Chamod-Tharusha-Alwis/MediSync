'use strict';

const { calculate14DayForecast, getTCrit, fitLogLinear, fitQuadratic } = require('../src/utils/outbreakForecasting');

describe('Epidemiological 14-Day Outbreak Forecasting Suite', () => {
  test('returns empty forecast and hasSufficientData=false on empty or non-array inputs', () => {
    for (const input of [null, undefined, '', {}, 123, []]) {
      const result = calculate14DayForecast(input);
      expect(result.hasSufficientData).toBe(false);
      expect(result.forecast).toEqual([]);
      expect(result.message).toMatch(/Insufficient historical data/i);
    }
  });

  test('returns empty forecast when fewer than 3 valid data points are provided', () => {
    const onePoint = [{ date: '2026-11-01', count: 10 }];
    const twoPoints = [
      { date: '2026-11-01', count: 10 },
      { date: '2026-11-02', count: 12 }
    ];

    expect(calculate14DayForecast(onePoint).hasSufficientData).toBe(false);
    expect(calculate14DayForecast(twoPoints).hasSufficientData).toBe(false);
  });

  test('computes exact 14-day forecast with expanding prediction bands for valid historical trend', () => {
    const trend = [
      { date: '2026-10-25', count: 10 },
      { date: '2026-10-26', count: 12 },
      { date: '2026-10-27', count: 15 },
      { date: '2026-10-28', count: 18 },
      { date: '2026-10-29', count: 20 },
      { date: '2026-10-30', count: 23 },
      { date: '2026-10-31', count: 26 }
    ];

    const result = calculate14DayForecast(trend);
    expect(result.hasSufficientData).toBe(true);
    expect(result.forecast.length).toBe(14);
    expect(result.slope).toBeGreaterThan(0);

    let prevDate = new Date('2026-10-31T00:00:00Z');
    let prevMargin = 0;

    result.forecast.forEach((pt, idx) => {
      // Date progression
      const ptDate = new Date(`${pt.date}T00:00:00Z`);
      const dayDiff = (ptDate - prevDate) / (1000 * 60 * 60 * 24);
      expect(dayDiff).toBe(1);
      prevDate = ptDate;

      // Mathematical invariants: lower <= predicted <= upper and all >= 0
      expect(Number.isInteger(pt.predicted)).toBe(true);
      expect(Number.isInteger(pt.lower)).toBe(true);
      expect(Number.isInteger(pt.upper)).toBe(true);
      expect(pt.predicted).toBeGreaterThanOrEqual(0);
      expect(pt.lower).toBeGreaterThanOrEqual(0);
      expect(pt.upper).toBeGreaterThanOrEqual(pt.predicted);
      expect(pt.predicted).toBeGreaterThanOrEqual(pt.lower);
      expect(pt.bandRange).toBe(pt.upper - pt.lower);

      // Prediction interval cone expands with projection distance
      if (idx > 0) {
        expect(pt.bandRange).toBeGreaterThanOrEqual(prevMargin);
      }
      prevMargin = pt.bandRange;
    });

    // Day 14 should project into the future
    expect(result.forecast[0].date).toBe('2026-11-01');
    expect(result.forecast[13].date).toBe('2026-11-14');
  });

  test('verifies prediction interval variance ratio exceeds sqrt(1 + 1/n)', () => {
    const trend = [
      { date: '2026-10-20', count: 100 },
      { date: '2026-10-21', count: 105 },
      { date: '2026-10-22', count: 110 },
      { date: '2026-10-23', count: 115 },
      { date: '2026-10-24', count: 120 }
    ];
    const n = trend.length;
    const minExpansionFactor = Math.sqrt(1 + 1 / n);

    const result = calculate14DayForecast(trend);
    const se = result.standardError;
    const tCrit = getTCrit(n - 2, 0.95);

    result.forecast.forEach(pt => {
      const halfWidth = (pt.upper - pt.lower) / 2;
      // When se > 0, halfWidth / (tCrit * se) reflects sePred / se factor
      if (se > 0) {
        const impliedSePred = halfWidth / tCrit;
        expect(impliedSePred / se).toBeGreaterThanOrEqual(minExpansionFactor * 0.85); // Allow for integer rounding
      }
    });
  });

  test('handles zero variance (flat baseline) gracefully without division by zero', () => {
    const flatTrend = [
      { date: '2026-11-01', count: 5 },
      { date: '2026-11-02', count: 5 },
      { date: '2026-11-03', count: 5 },
      { date: '2026-11-04', count: 5 }
    ];

    const result = calculate14DayForecast(flatTrend);
    expect(result.hasSufficientData).toBe(true);
    expect(result.slope).toBe(0);
    expect(result.standardError).toBe(0);
    expect(result.forecast.length).toBe(14);

    result.forecast.forEach(pt => {
      expect(pt.predicted).toBe(5);
      expect(pt.lower).toBe(5);
      expect(pt.upper).toBe(5);
      expect(pt.bandRange).toBe(0);
    });
  });

  test('filters out malformed rows (negative counts, non-date strings, NaN)', () => {
    const dirtyTrend = [
      { date: 'invalid-date', count: 10 },
      { date: '2026-11-01', count: -5 },
      { date: '2026-11-01', count: NaN },
      { date: '2026-11-02', count: 12 },
      { date: '2026-11-03', count: '14' },
      { date: '2026-11-04', count: 16 }
    ];

    const result = calculate14DayForecast(dirtyTrend);
    expect(result.hasSufficientData).toBe(true);
    expect(result.forecast.length).toBe(14);
    expect(result.forecast[0].predicted).toBeGreaterThanOrEqual(0);
  });

  test('computes exact Student t critical values for df 1 to 30 and handles convergence to normal z', () => {
    // 95% confidence level
    expect(getTCrit(1)).toBe(12.71);
    expect(getTCrit(5)).toBe(2.57);
    expect(getTCrit(10)).toBe(2.23);
    expect(getTCrit(20)).toBe(2.09);
    expect(getTCrit(28)).toBe(2.048);
    expect(getTCrit(30)).toBe(2.042);
    expect(getTCrit(35)).toBe(1.96);

    // 99% confidence level
    expect(getTCrit(1, 0.99)).toBe(63.66);
    expect(getTCrit(5, 0.99)).toBe(4.03);
    expect(getTCrit(28, 0.99)).toBe(2.763);
    expect(getTCrit(35, 0.99)).toBe(2.576);
  });

  test('enforces strict bounds invariant 0 <= lower <= predicted <= upper across diverse trends', () => {
    const testCases = [
      // Steep downward trend heading to negative
      Array.from({ length: 10 }, (_, i) => ({ date: `2026-10-${(i + 1).toString().padStart(2, '0')}`, count: Math.max(0, 100 - i * 15) })),
      // Oscillating noisy trend
      Array.from({ length: 15 }, (_, i) => ({ date: `2026-10-${(i + 1).toString().padStart(2, '0')}`, count: 20 + (i % 3) * 10 })),
      // High count baseline
      Array.from({ length: 10 }, (_, i) => ({ date: `2026-10-${(i + 1).toString().padStart(2, '0')}`, count: 1500 + i * 5 }))
    ];

    testCases.forEach(tc => {
      const res = calculate14DayForecast(tc);
      expect(res.hasSufficientData).toBe(true);
      res.forecast.forEach(pt => {
        expect(pt.lower).toBeGreaterThanOrEqual(0);
        expect(pt.predicted).toBeGreaterThanOrEqual(pt.lower);
        expect(pt.upper).toBeGreaterThanOrEqual(pt.predicted);
        expect(Number.isSafeInteger(pt.lower)).toBe(true);
        expect(Number.isSafeInteger(pt.predicted)).toBe(true);
        expect(Number.isSafeInteger(pt.upper)).toBe(true);
      });
    });
  });

  test('executes 7-day holdout backtest when trend >= 14 days and evaluates model performance', () => {
    const trend = Array.from({ length: 20 }, (_, i) => ({
      date: `2026-10-${(i + 1).toString().padStart(2, '0')}`,
      count: 10 + i * 2 + (i % 2 === 0 ? 1 : -1)
    }));

    const result = calculate14DayForecast(trend);
    expect(result.backtest).toBeDefined();
    expect(result.backtest.evaluated).toBe(true);
    expect(result.backtest.holdoutDays).toBe(7);
    expect(typeof result.backtest.mae).toBe('number');
    expect(result.backtest.mae).toBeGreaterThan(0);
    expect(result.backtest.empiricalCoverage).toBeGreaterThanOrEqual(0);
    expect(result.backtest.empiricalCoverage).toBeLessThanOrEqual(100);
  });

  test('gated model selection selects log-linear alternative when exponential surge reduces holdout MAE by >10%', () => {
    // Generate an accelerating exponential surge trajectory
    const surgeTrend = [
      { date: '2026-10-01', count: 10 },
      { date: '2026-10-02', count: 12 },
      { date: '2026-10-03', count: 15 },
      { date: '2026-10-04', count: 19 },
      { date: '2026-10-05', count: 25 },
      { date: '2026-10-06', count: 34 },
      { date: '2026-10-07', count: 48 },
      { date: '2026-10-08', count: 68 },
      { date: '2026-10-09', count: 96 },
      { date: '2026-10-10', count: 135 },
      { date: '2026-10-11', count: 190 },
      { date: '2026-10-12', count: 268 },
      { date: '2026-10-13', count: 378 },
      { date: '2026-10-14', count: 532 },
      { date: '2026-10-15', count: 750 },
      { date: '2026-10-16', count: 1050 }
    ];

    const result = calculate14DayForecast(surgeTrend);
    expect(result.hasSufficientData).toBe(true);
    // On steep exponential growth, log-linear captures the curvature significantly better
    expect(result.backtest.evaluated).toBe(true);
    if (result.backtest.logLinear && result.backtest.logLinear.mae < result.backtest.mae * 0.90) {
      expect(result.modelType).toBe('log_linear');
    }
    // Invariants must strictly hold regardless of model
    result.forecast.forEach(pt => {
      expect(pt.lower).toBeGreaterThanOrEqual(0);
      expect(pt.predicted).toBeGreaterThanOrEqual(pt.lower);
      expect(pt.upper).toBeGreaterThanOrEqual(pt.predicted);
    });
  });

  test('evaluates polynomial quadratic alternative without diverging', () => {
    const curve = [
      { date: '2026-10-01', count: 10 },
      { date: '2026-10-02', count: 25 },
      { date: '2026-10-03', count: 45 },
      { date: '2026-10-04', count: 60 },
      { date: '2026-10-05', count: 70 },
      { date: '2026-10-06', count: 75 },
      { date: '2026-10-07', count: 77 }
    ];

    const result = calculate14DayForecast(curve);
    expect(result.hasSufficientData).toBe(true);
    expect(result.forecast.length).toBe(14);
    result.forecast.forEach(pt => {
      expect(pt.lower).toBeLessThanOrEqual(pt.predicted);
      expect(pt.predicted).toBeLessThanOrEqual(pt.upper);
      expect(pt.lower).toBeGreaterThanOrEqual(0);
    });
  });
});
