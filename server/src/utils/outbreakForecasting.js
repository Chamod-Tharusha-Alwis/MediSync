'use strict';

/**
 * Calculates a 14-day epidemiological outbreak forecast with 95% confidence interval
 * using Ordinary Least Squares (OLS) linear trend regression and prediction variance.
 *
 * @param {Array<{date: string, count: number}>} trend - Historical daily case counts
 * @param {Object} [options]
 * @param {number} [options.forecastDays=14] - Number of future days to project
 * @param {number} [options.confidenceLevel=0.95] - Confidence level (default: 0.95, t_crit = 1.96)
 * @returns {{
 *   forecast: Array<{date: string, predicted: number, lower: number, upper: number, bandRange: number}>,
 *   hasSufficientData: boolean,
 *   message?: string,
 *   slope?: number,
 *   intercept?: number,
 *   standardError?: number
 * }}
 */
function calculate14DayForecast(trend, options = {}) {
  const forecastDays = Math.max(1, Math.min(60, Number(options.forecastDays) || 14));
  const tCrit = options.confidenceLevel === 0.99 ? 2.576 : 1.96;

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
  for (let i = 0; i < n; i++) {
    const yHat = slope * x[i] + intercept;
    ssRes += (y[i] - yHat) * (y[i] - yHat);
  }
  const df = Math.max(1, n - 2);
  const se = Math.sqrt(ssRes / df);

  const lastDateRaw = clean[clean.length - 1].date;
  const lastDate = new Date(lastDateRaw.includes('T') ? lastDateRaw : `${lastDateRaw}T00:00:00Z`);

  const forecast = [];
  for (let k = 1; k <= forecastDays; k++) {
    const futureX = (n - 1) + k;
    const rawPredicted = slope * futureX + intercept;
    const predicted = Math.max(0, Math.round(rawPredicted));

    // Prediction standard error includes variance of regression line and future observation variance
    const sePred = se * Math.sqrt(1 + 1 / n + (den === 0 ? 0 : Math.pow(futureX - xMean, 2) / den));
    const margin = Math.round(tCrit * sePred);

    const upper = Math.max(predicted, Math.round(rawPredicted + margin));
    const lower = Math.max(0, Math.round(rawPredicted - margin));
    const bandRange = Math.max(0, upper - lower);

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

  return {
    forecast,
    hasSufficientData: true,
    slope: Number(slope.toFixed(4)),
    intercept: Number(intercept.toFixed(4)),
    standardError: Number(se.toFixed(4))
  };
}

module.exports = {
  calculate14DayForecast
};
