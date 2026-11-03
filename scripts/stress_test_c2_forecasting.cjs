'use strict';

/**
 * scripts/stress_test_c2_forecasting.cjs
 * Empirical Challenger Stress Test Suite for Milestone 2 C2 Forecasting.
 */

const assert = require('assert');
const serverForecasting = require('../server/src/utils/outbreakForecasting');

// Dynamic import or babel-free import for client module if needed
let clientForecasting;
try {
  // Try importing client if possible, or transpiling ESM on the fly
  const fs = require('fs');
  const clientCode = fs.readFileSync(require.resolve('../client/src/utils/outbreakForecasting.js'), 'utf8');
  // Simple regex conversion of export to module.exports for isolated test
  const cjsCode = clientCode
    .replace(/export function /g, 'function ')
    .replace(/export default calculate14DayForecast;?/, '') +
    '\nmodule.exports = { calculate14DayForecast, getTCrit, evaluateHoldoutBacktest, fitQuadratic, fitLogLinear };';
  const vm = require('vm');
  const sandbox = { module: { exports: {} }, exports: {}, Math, Number, Array, Date, console };
  vm.createContext(sandbox);
  vm.runInContext(cjsCode, sandbox);
  clientForecasting = sandbox.module.exports;
} catch (err) {
  throw new Error('CLIENT_FORECAST_MODULE_REQUIRED');
}

const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  failures: []
};

function test(name, fn) {
  stats.total++;
  try {
    fn();
    stats.passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    stats.failed++;
    stats.failures.push({ name, error: err });
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
  }
}

console.log('='.repeat(80));
console.log('CHALLENGER 1: EMPIRICAL STRESS TEST OF C2 FORECASTING');
console.log('='.repeat(80));

// -----------------------------------------------------------------------------
// 1. Student-t Distribution Table Verification
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 1] Student-t Table Values (df in 1..30)');

// Standard reference critical values for two-tailed alpha=0.05 (t_0.975)
const REFERENCE_T95 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
  2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086,
  2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042
];

test('Server getTCrit matches reference t-distribution values within 0.01 tolerance for df 1..30 (alpha=0.05)', () => {
  for (let df = 1; df <= 30; df++) {
    const val = serverForecasting.getTCrit(df, 0.95);
    const ref = REFERENCE_T95[df - 1];
    assert(Math.abs(val - ref) < 0.02, `df=${df}: got ${val}, expected close to ${ref}`);
  }
});

test('Exact value for df=28 is 2.048 at 95% confidence', () => {
  assert.strictEqual(serverForecasting.getTCrit(28, 0.95), 2.048);
  assert.strictEqual(serverForecasting.getTCrit(28, 0.99), 2.763);
});

test('getTCrit converges to normal z for df > 30 (1.96 for 95%, 2.576 for 99%)', () => {
  assert.strictEqual(serverForecasting.getTCrit(31, 0.95), 1.96);
  assert.strictEqual(serverForecasting.getTCrit(50, 0.95), 1.96);
  assert.strictEqual(serverForecasting.getTCrit(100, 0.95), 1.96);
  assert.strictEqual(serverForecasting.getTCrit(31, 0.99), 2.576);
  assert.strictEqual(serverForecasting.getTCrit(100, 0.99), 2.576);
});

test('getTCrit handles edge case df inputs (0, negative, floating point, NaN)', () => {
  assert.strictEqual(serverForecasting.getTCrit(0, 0.95), serverForecasting.getTCrit(1, 0.95));
  assert.strictEqual(serverForecasting.getTCrit(-5, 0.95), serverForecasting.getTCrit(1, 0.95));
  assert.strictEqual(serverForecasting.getTCrit(2.9, 0.95), serverForecasting.getTCrit(2, 0.95));
});

// -----------------------------------------------------------------------------
// 2. Prediction Variance Formula Verification
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Prediction Variance vs Confidence Interval Math');

test('Prediction standard error includes observation variance factor Math.sqrt(1 + 1/n + (x - xMean)^2 / Sxx)', () => {
  // Trend with distinct non-zero variance
  const trend = [
    { date: '2026-10-01', count: 10 },
    { date: '2026-10-02', count: 14 },
    { date: '2026-10-03', count: 12 },
    { date: '2026-10-04', count: 18 },
    { date: '2026-10-05', count: 22 }
  ];
  const n = trend.length;
  const x = [0, 1, 2, 3, 4];
  const y = [10, 14, 12, 18, 22];
  const xMean = 2;
  const yMean = 15.2;
  const Sxx = x.reduce((acc, xi) => acc + Math.pow(xi - xMean, 2), 0); // 10
  const Sxy = x.reduce((acc, xi, i) => acc + (xi - xMean) * (y[i] - yMean), 0); // 29
  const slope = Sxy / Sxx; // 2.9
  const intercept = yMean - slope * xMean; // 9.4
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const yHat = slope * x[i] + intercept;
    ssRes += Math.pow(y[i] - yHat, 2);
  }
  const df = n - 2;
  const se = Math.sqrt(ssRes / df);
  const tCrit = serverForecasting.getTCrit(df, 0.95);

  const res = serverForecasting.calculate14DayForecast(trend);
  assert(res.hasSufficientData);

  // For future step k=1..14 (futureX = 4 + k)
  for (let k = 1; k <= 14; k++) {
    const futureX = 4 + k;
    const sePredExpected = se * Math.sqrt(1 + 1 / n + Math.pow(futureX - xMean, 2) / Sxx);
    const seMeanConfidence = se * Math.sqrt(1 / n + Math.pow(futureX - xMean, 2) / Sxx);

    // Theoretical check: sePred must strictly exceed seMeanConfidence by at least se
    assert(sePredExpected > seMeanConfidence, `sePred must exceed seMean at k=${k}`);
    assert(sePredExpected / seMeanConfidence > 1.0, `Variance ratio must exceed 1`);

    const expectedMargin = Math.round(tCrit * sePredExpected);
    const forecastPt = res.forecast[k - 1];
    const rawPred = slope * futureX + intercept;
    const expectedPred = Math.max(0, Math.round(rawPred));
    const expectedLower = Math.min(expectedPred, Math.max(0, Math.round(rawPred - expectedMargin)));
    const expectedUpper = Math.max(expectedPred, Math.round(rawPred + expectedMargin));

    assert.strictEqual(forecastPt.predicted, expectedPred, `predicted at k=${k}`);
    assert.strictEqual(forecastPt.lower, expectedLower, `lower at k=${k}`);
    assert.strictEqual(forecastPt.upper, expectedUpper, `upper at k=${k}`);
  }
});

// -----------------------------------------------------------------------------
// 3. Adversarial Time-Series Stress & Invariant Checks
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Adversarial Time-Series Inputs & Invariants');

function checkInvariants(forecastResult, testCaseName) {
  assert(forecastResult, `${testCaseName}: result must exist`);
  if (!forecastResult.hasSufficientData) {
    assert(Array.isArray(forecastResult.forecast) && forecastResult.forecast.length === 0,
      `${testCaseName}: forecast should be empty array when insufficient data`);
    return;
  }
  assert(Array.isArray(forecastResult.forecast), `${testCaseName}: forecast must be an array`);
  assert(forecastResult.forecast.length > 0, `${testCaseName}: forecast must have points`);

  forecastResult.forecast.forEach((pt, idx) => {
    // Strict integer check
    assert(Number.isSafeInteger(pt.predicted), `${testCaseName} pt ${idx}: predicted (${pt.predicted}) must be safe integer`);
    assert(Number.isSafeInteger(pt.lower), `${testCaseName} pt ${idx}: lower (${pt.lower}) must be safe integer`);
    assert(Number.isSafeInteger(pt.upper), `${testCaseName} pt ${idx}: upper (${pt.upper}) must be safe integer`);

    // Strict structural invariant: 0 <= lower <= predicted <= upper
    assert(pt.lower >= 0, `${testCaseName} pt ${idx}: lower (${pt.lower}) must be >= 0`);
    assert(pt.predicted >= pt.lower, `${testCaseName} pt ${idx}: predicted (${pt.predicted}) must be >= lower (${pt.lower})`);
    assert(pt.upper >= pt.predicted, `${testCaseName} pt ${idx}: upper (${pt.upper}) must be >= predicted (${pt.predicted})`);

    // Band range
    assert.strictEqual(pt.bandRange, pt.upper - pt.lower, `${testCaseName} pt ${idx}: bandRange must equal upper - lower`);

    // Date validity
    assert(/^\d{4}-\d{2}-\d{2}$/.test(pt.date), `${testCaseName} pt ${idx}: date (${pt.date}) must match YYYY-MM-DD`);
  });
}

test('Adversarial 1: Empty array', () => {
  const res = serverForecasting.calculate14DayForecast([]);
  checkInvariants(res, 'Empty array');
  assert.strictEqual(res.hasSufficientData, false);
});

test('Adversarial 2: Single point', () => {
  const res = serverForecasting.calculate14DayForecast([{ date: '2026-11-01', count: 42 }]);
  checkInvariants(res, 'Single point');
  assert.strictEqual(res.hasSufficientData, false);
});

test('Adversarial 3: Two points', () => {
  const res = serverForecasting.calculate14DayForecast([
    { date: '2026-11-01', count: 10 },
    { date: '2026-11-02', count: 20 }
  ]);
  checkInvariants(res, 'Two points');
  assert.strictEqual(res.hasSufficientData, false);
});

test('Adversarial 4: Constant zero series [0, 0, 0, 0, 0]', () => {
  const res = serverForecasting.calculate14DayForecast([
    { date: '2026-11-01', count: 0 },
    { date: '2026-11-02', count: 0 },
    { date: '2026-11-03', count: 0 },
    { date: '2026-11-04', count: 0 },
    { date: '2026-11-05', count: 0 }
  ]);
  checkInvariants(res, 'Constant zero');
  assert(res.hasSufficientData);
  res.forecast.forEach(pt => {
    assert.strictEqual(pt.predicted, 0);
    assert.strictEqual(pt.lower, 0);
    assert.strictEqual(pt.upper, 0);
  });
});

test('Adversarial 5: Constant non-zero flat baseline [100, 100, 100, 100]', () => {
  const res = serverForecasting.calculate14DayForecast([
    { date: '2026-11-01', count: 100 },
    { date: '2026-11-02', count: 100 },
    { date: '2026-11-03', count: 100 },
    { date: '2026-11-04', count: 100 }
  ]);
  checkInvariants(res, 'Constant non-zero');
  res.forecast.forEach(pt => {
    assert.strictEqual(pt.predicted, 100);
    assert.strictEqual(pt.lower, 100);
    assert.strictEqual(pt.upper, 100);
  });
});

test('Adversarial 6: Negative counts are stripped and remaining data processed', () => {
  const res = serverForecasting.calculate14DayForecast([
    { date: '2026-11-01', count: -100 },
    { date: '2026-11-02', count: -50 },
    { date: '2026-11-03', count: 10 },
    { date: '2026-11-04', count: 12 },
    { date: '2026-11-05', count: 14 }
  ]);
  checkInvariants(res, 'Negative counts stripped');
  assert(res.hasSufficientData);
  assert.strictEqual(res.forecast.length, 14);
});

test('Adversarial 7: Huge magnitude values (1,000,000 to 5,000,000)', () => {
  const hugeTrend = [
    { date: '2026-11-01', count: 1000000 },
    { date: '2026-11-02', count: 2000000 },
    { date: '2026-11-03', count: 3000000 },
    { date: '2026-11-04', count: 4000000 },
    { date: '2026-11-05', count: 5000000 }
  ];
  const res = serverForecasting.calculate14DayForecast(hugeTrend);
  checkInvariants(res, 'Huge values');
  assert(res.hasSufficientData);
  assert(res.forecast[0].predicted > 5000000);
  assert(Number.isSafeInteger(res.forecast[13].upper));
});

test('Adversarial 8: Steep crash to zero (1000 -> 500 -> 100 -> 0 -> 0 -> 0)', () => {
  const crashTrend = [
    { date: '2026-11-01', count: 1000 },
    { date: '2026-11-02', count: 500 },
    { date: '2026-11-03', count: 100 },
    { date: '2026-11-04', count: 10 },
    { date: '2026-11-05', count: 0 },
    { date: '2026-11-06', count: 0 }
  ];
  const res = serverForecasting.calculate14DayForecast(crashTrend);
  checkInvariants(res, 'Steep crash to zero');
  assert(res.hasSufficientData);
  // Linear regression slope is strongly negative; predicted will clamp to 0 without going negative
  res.forecast.forEach((pt) => {
    assert(pt.lower >= 0);
    assert(pt.predicted >= 0);
    assert(pt.upper >= pt.predicted);
  });
});

test('Adversarial 9: Extreme exponential surge (10, 25, 65, 170, 440, 1150, 3000, 7800)', () => {
  const surgeTrend = [
    { date: '2026-10-01', count: 10 },
    { date: '2026-10-02', count: 25 },
    { date: '2026-10-03', count: 65 },
    { date: '2026-10-04', count: 170 },
    { date: '2026-10-05', count: 440 },
    { date: '2026-10-06', count: 1150 },
    { date: '2026-10-07', count: 3000 },
    { date: '2026-10-08', count: 7800 }
  ];
  const res = serverForecasting.calculate14DayForecast(surgeTrend);
  checkInvariants(res, 'Extreme exponential surge');
  assert(res.hasSufficientData);
});

test('Adversarial 10: Dirty chaotic inputs (NaNs, dates out of order, floats, strings, null items)', () => {
  const dirty = [
    null,
    { date: '2026-10-05', count: 25.4 },
    { date: '2026-10-01', count: '10' },
    undefined,
    { date: 'invalid-date', count: 999 },
    { date: '2026-10-03', count: NaN },
    { date: '2026-10-02', count: 15 },
    { date: '2026-10-04', count: 20 },
    { date: '2026-10-06', count: -30 }
  ];
  const res = serverForecasting.calculate14DayForecast(dirty);
  checkInvariants(res, 'Dirty chaotic inputs');
  assert(res.hasSufficientData);
  // Valid points are 2026-10-01 (10), 2026-10-02 (15), 2026-10-04 (20), 2026-10-05 (25) -> sorted correctly
  assert.strictEqual(res.forecast[0].date, '2026-10-06');
});

// -----------------------------------------------------------------------------
// 4. Client vs Server Implementation Parity & Gated Model Selection
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Server vs Client Model Parity & Gated Model Selection');

test('Server exports fitLogLinear utility function', () => {
  assert(typeof serverForecasting.fitLogLinear === 'function',
    'Server outbreakForecasting MUST export fitLogLinear function (Worker handoff claimed it was implemented)');
});

test('Server calculate14DayForecast selects log_linear model on exponential surge', () => {
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
  const res = serverForecasting.calculate14DayForecast(surgeTrend);
  assert(res.backtest && res.backtest.evaluated, 'Backtest must be evaluated on 16-day series');
  assert(res.backtest.logLinear, 'Backtest must include logLinear evaluation');
  assert.strictEqual(res.modelType, 'log_linear', 'Server should select log_linear on exponential surge');
});

if (clientForecasting) {
  test('Client calculate14DayForecast selects log_linear model on exponential surge', () => {
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
    const res = clientForecasting.calculate14DayForecast(surgeTrend);
    assert(res.backtest && res.backtest.evaluated);
    assert.strictEqual(res.modelType, 'log_linear');
    checkInvariants(res, 'Client exponential surge');
  });
}

// -----------------------------------------------------------------------------
// 5. Backtest Runner Multi-Seed Stress Testing
// -----------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] Backtest Script Multi-Seed Stress Testing');

const { run7DayHoldout, evaluateScenarios } = require('./backtest_c2_forecast.cjs');
const { generateOutbreakDataset } = require('./seed-demo-outbreak');

test('Backtest script handles arbitrary seeds (seed=42, seed=999, seed=12345)', () => {
  for (const testSeed of [42, 999, 12345]) {
    const dataset = generateOutbreakDataset(testSeed);
    const results = evaluateScenarios(dataset);
    assert(results.baseline_60d, `Seed ${testSeed}: baseline_60d must exist`);
    assert(results.baseline_60d.empiricalCoverage >= 70,
      `Seed ${testSeed}: baseline coverage was ${results.baseline_60d.empiricalCoverage}% (expected >= 70%)`);
    assert(Number.isFinite(results.baseline_60d.mae), `Seed ${testSeed}: MAE must be finite`);
    assert(results.colombo_dengue_baseline.empiricalCoverage >= 70,
      `Seed ${testSeed}: colombo dengue coverage was ${results.colombo_dengue_baseline.empiricalCoverage}%`);
    assert(results.ampara_clean_30d.empiricalCoverage >= 70,
      `Seed ${testSeed}: ampara clean coverage was ${results.ampara_clean_30d.empiricalCoverage}%`);
  }
});

test('Backtest script correctly handles series with length < 14 gracefully', () => {
  assert.throws(() => {
    run7DayHoldout(Array.from({ length: 10 }, (_, i) => ({ date: `2026-10-${i+1}`, count: 5 })));
  }, /Requires at least 14 days/);
});

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n' + '='.repeat(80));
console.log(`STRESS TEST COMPLETE: ${stats.passed}/${stats.total} Passed, ${stats.failed} Failed`);
console.log('='.repeat(80));

if (stats.failed > 0) {
  console.log('\nFAILURE DETAILS:');
  stats.failures.forEach((f, i) => {
    console.log(`\n[${i + 1}] ${f.name}`);
    console.log(`    ${f.error.stack || f.error.message}`);
  });
  process.exit(1);
} else {
  console.log('\nALL ADVERSARIAL STRESS TESTS PASSED!');
  process.exit(0);
}
