'use strict';

/**
 * Two-tailed Student's t critical values for alpha = 0.05 (95% CI) and alpha = 0.01 (99% CI)
 * for degrees of freedom 1 to 30. For df > 30, converges to standard normal z.
 */
function getTCrit(df, confidenceLevel = 0.95) {
  const safeDf = Math.max(1, Math.floor(df));
  if (confidenceLevel === 0.99) {
    const t99 = [63.66, 9.92, 5.84, 4.60, 4.03, 3.71, 3.50, 3.36, 3.25, 3.17, 3.11, 3.05, 3.01, 2.98, 2.95, 2.92, 2.90, 2.88, 2.86, 2.85];
    return safeDf <= 20 ? (t99[safeDf - 1] || 2.85) : 2.576;
  }
  const t95 = [12.71, 4.30, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23, 2.20, 2.18, 2.16, 2.14, 2.13, 2.12, 2.11, 2.10, 2.09, 2.09];
  return safeDf <= 20 ? (t95[safeDf - 1] || 2.09) : 1.96;
}

/**
 * Evaluates a 7-day holdout on historical time-series data to measure
 * Mean Absolute Error (MAE) and empirical confidence interval coverage.
 */
function evaluateHoldoutBacktest(cleanData, options = {}) {
  const holdoutDays = Math.min(7, Math.floor(cleanData.length / 2));
  if (holdoutDays < 3 || cleanData.length < 14) {
    return {
      evaluated: false,
      reason: 'Holdout evaluation requires at least 14 days of historical data'
    };
  }

  const trainData = cleanData.slice(0, cleanData.length - holdoutDays);
  const holdoutData = cleanData.slice(cleanData.length - holdoutDays);

  const nTrain = trainData.length;
  const xTrain = Array.from({ length: nTrain }, (_, i) => i);
  const yTrain = trainData.map(d => d.count);

  const xMean = xTrain.reduce((a, b) => a + b, 0) / nTrain;
  const yMean = yTrain.reduce((a, b) => a + b, 0) / nTrain;

  let num = 0, den = 0;
  for (let i = 0; i < nTrain; i++) {
    num += (xTrain[i] - xMean) * (yTrain[i] - yMean);
    den += (xTrain[i] - xMean) * (xTrain[i] - xMean);
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;

  let ssRes = 0;
  for (let i = 0; i < nTrain; i++) {
    const yHat = slope * xTrain[i] + intercept;
    ssRes += (yTrain[i] - yHat) * (yTrain[i] - yHat);
  }
  const df = Math.max(1, nTrain - 2);
  const se = Math.sqrt(ssRes / df);
  const tCrit = getTCrit(df, options.confidenceLevel || 0.95);

  let totalAbsoluteError = 0;
  let insideBandsCount = 0;

  for (let k = 0; k < holdoutDays; k++) {
    const futureX = (nTrain - 1) + (k + 1);
    const rawPred = slope * futureX + intercept;
    const pred = Math.max(0, Math.round(rawPred));
    const sePred = se * Math.sqrt(1 + 1 / nTrain + (den === 0 ? 0 : Math.pow(futureX - xMean, 2) / den));
    const margin = Math.round(tCrit * sePred);
    const lower = Math.min(pred, Math.max(0, Math.round(rawPred - margin)));
    const upper = Math.max(pred, Math.round(rawPred + margin));

    const actual = holdoutData[k].count;
    totalAbsoluteError += Math.abs(actual - pred);
    if (actual >= lower && actual <= upper) {
      insideBandsCount++;
    }
  }

  const mae = totalAbsoluteError / holdoutDays;
  const empiricalCoverage = (insideBandsCount / holdoutDays) * 100;

  return {
    evaluated: true,
    holdoutDays,
    mae: Number(mae.toFixed(2)),
    empiricalCoverage: Number(empiricalCoverage.toFixed(1)),
    insideBandsCount,
    totalHoldout: holdoutDays
  };
}

/**
 * Fits quadratic polynomial curve y = a*x^2 + b*x + c to detect nonlinear surge curvature.
 */
function fitQuadratic(x, y) {
  const n = x.length;
  if (n < 4) return null;

  let s0 = n, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
  let t0 = 0, t1 = 0, t2 = 0;

  for (let i = 0; i < n; i++) {
    const xi = x[i], yi = y[i];
    const xi2 = xi * xi;
    s1 += xi;
    s2 += xi2;
    s3 += xi2 * xi;
    s4 += xi2 * xi2;
    t0 += yi;
    t1 += xi * yi;
    t2 += xi2 * yi;
  }

  // Gaussian elimination for 3x3 normal equations matrix:
  // [ s4 s3 s2 | t2 ] (a)
  // [ s3 s2 s1 | t1 ] (b)
  // [ s2 s1 s0 | t0 ] (c)
  const A = [
    [s4, s3, s2, t2],
    [s3, s2, s1, t1],
    [s2, s1, s0, t0]
  ];

  for (let i = 0; i < 3; i++) {
    let pivot = i;
    for (let j = i + 1; j < 3; j++) {
      if (Math.abs(A[j][i]) > Math.abs(A[pivot][i])) pivot = j;
    }
    if (Math.abs(A[pivot][i]) < 1e-12) return null; // Singular
    if (pivot !== i) {
      const temp = A[i]; A[i] = A[pivot]; A[pivot] = temp;
    }
    const div = A[i][i];
    for (let k = i; k <= 3; k++) A[i][k] /= div;
    for (let j = 0; j < 3; j++) {
      if (j !== i) {
        const factor = A[j][i];
        for (let k = i; k <= 3; k++) A[j][k] -= factor * A[i][k];
      }
    }
  }

  const a = A[0][3], b = A[1][3], c = A[2][3];
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const yHat = a * x[i] * x[i] + b * x[i] + c;
    ssRes += (y[i] - yHat) * (y[i] - yHat);
  }
  return { a, b, c, ssRes };
}

/**
 * Calculates a 14-day epidemiological outbreak forecast with 95% confidence interval
 * using Ordinary Least Squares (OLS) linear trend regression and prediction variance.
 *
 * Implements:
 * - Variance prediction term: sePred = se * sqrt(1 + 1/n + (x - xMean)^2 / Sxx)
 * - Exact Student's t critical values for small degrees of freedom
 * - Strict structural invariant: 0 <= lower <= predicted <= upper
 * - 7-day holdout backtesting for empirical coverage and MAE
 * - Polynomial alternative fit evaluation
 */
function calculate14DayForecast(trend, options = {}) {
  const forecastDays = Math.max(1, Math.min(60, Number(options.forecastDays) || 14));
  const confidenceLevel = options.confidenceLevel === 0.99 ? 0.99 : 0.95;

  if (!Array.isArray(trend) || trend.length < 3) {
    return {
      forecast: [],
      hasSufficientData: false,
      message: 'Insufficient historical data (minimum 3 data points required)'
    };
  }

  // Filter and sort by date ascending
  const clean = trend
    .filter(p => p && typeof p.date === 'string' && Number.isFinite(Number(p.count)) && Number(p.count) >= 0)
    .map(p => ({ date: p.date, count: Math.round(Number(p.count)) }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (clean.length < 3) {
    return {
      forecast: [],
      hasSufficientData: false,
      message: 'Insufficient historical data (minimum 3 data points required)'
    };
  }

  const n = clean.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const y = clean.map(p => p.count);

  const xMean = x.reduce((a, b) => a + b, 0) / n;
  const yMean = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - xMean) * (y[i] - yMean);
    den += (x[i] - xMean) * (x[i] - xMean);
  }

  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;

  // Residual variance and standard error of estimate
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const yHat = slope * x[i] + intercept;
    ssRes += (y[i] - yHat) * (y[i] - yHat);
    ssTot += (y[i] - yMean) * (y[i] - yMean);
  }
  const df = Math.max(1, n - 2);
  const se = Math.sqrt(ssRes / df);
  const rSquared = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  const tCrit = getTCrit(df, confidenceLevel);

  // Polynomial quadratic alternative evaluation
  const quadFit = fitQuadratic(x, y);
  const modelType = (quadFit && quadFit.ssRes < ssRes * 0.75 && quadFit.a < 0) ? 'polynomial_quad' : 'ols_linear';

  const lastDateRaw = clean[clean.length - 1].date;
  const lastDate = new Date(lastDateRaw.includes('T') ? lastDateRaw : `${lastDateRaw}T00:00:00Z`);

  const forecast = [];
  for (let k = 1; k <= forecastDays; k++) {
    const futureX = (n - 1) + k;
    let rawPredicted = slope * futureX + intercept;

    // If quadratic model indicates deceleration with better fit, apply damped trajectory
    if (modelType === 'polynomial_quad' && quadFit) {
      const quadPred = quadFit.a * futureX * futureX + quadFit.b * futureX + quadFit.c;
      if (quadPred >= 0 && quadPred <= rawPredicted * 1.5) {
        rawPredicted = quadPred * 0.5 + rawPredicted * 0.5; // Smooth ensemble
      }
    }

    const predicted = Math.max(0, Math.round(rawPredicted));

    // Prediction standard error includes variance of regression line and future observation variance
    const sePred = se * Math.sqrt(1 + 1 / n + (den === 0 ? 0 : Math.pow(futureX - xMean, 2) / den));
    const margin = Math.round(tCrit * sePred);

    // Strict structural invariant: 0 <= lower <= predicted <= upper
    const lower = Math.min(predicted, Math.max(0, Math.round(rawPredicted - margin)));
    const upper = Math.max(predicted, Math.round(rawPredicted + margin));
    const bandRange = upper - lower;

    const fDate = new Date(lastDate);
    fDate.setUTCDate(fDate.getUTCDate() + k);
    const dateStr = fDate.toISOString().split('T')[0];

    forecast.push({
      date: dateStr,
      predicted,
      lower,
      upper,
      bandRange
    });
  }

  // 7-day holdout backtesting
  const backtest = evaluateHoldoutBacktest(clean, { confidenceLevel });

  return {
    forecast,
    hasSufficientData: true,
    slope: Number(slope.toFixed(4)),
    intercept: Number(intercept.toFixed(4)),
    standardError: Number(se.toFixed(4)),
    rSquared: Number(rSquared.toFixed(4)),
    modelType,
    backtest
  };
}

module.exports = {
  calculate14DayForecast,
  getTCrit,
  evaluateHoldoutBacktest,
  fitQuadratic
};
