'use strict';
// Node bridge for V4: calls the real MediSync outbreak functions, unchanged, on a weekly series.
// Input (stdin, JSON): { series: [{date, count}], detectorWeeks: [index...], projection: {origins: [index...], trainingWeeks, forecastWeeks} }
// Output (stdout, JSON): { detector: [{index, triggered, maxZ, count, baseline}], projection: [{index, modelType, forecast:[{predicted, lower, upper}]}] }
// One weekly count is fed to the detector as one detector "day" (see outbreak_backtest_protocol.json).

const path = require('path');
const root = path.resolve(__dirname, '../..');
const { evaluateOutbreakCriteria, getColomboMidnight } = require(path.join(root, 'server/src/services/surveillanceService.js'));
const { calculate14DayForecast } = require(path.join(root, 'server/src/utils/outbreakForecasting.js'));

const DAY = 86400000;
const HOUR = 3600000;
const BASELINE_UNITS = 56;
const WINDOW_UNITS = 7;
const ANCHOR = Date.UTC(2000, 0, 3, 12);

function runDetector(series, index) {
  const base = getColomboMidnight(new Date(ANCHOR));
  const first = index - (BASELINE_UNITS + WINDOW_UNITS - 1);
  const cases = [];
  for (let unit = 0; unit < BASELINE_UNITS + WINDOW_UNITS; unit++) {
    const time = base + unit * DAY + HOUR;
    const count = series[first + unit].count;
    for (let c = 0; c < count; c++) cases.push({ district: 'Colombo', diseaseId: 'dengue', time });
  }
  const now = new Date(base + (BASELINE_UNITS + WINDOW_UNITS) * DAY + HOUR);
  const results = evaluateOutbreakCriteria({ cases, now, baselineDays: BASELINE_UNITS, level: 'island' });
  const row = results[0] || { triggered: false, maxZ: 0, count: 0, baseline: 0 };
  return { index, triggered: row.triggered === true, maxZ: row.maxZ, count: row.count, baseline: row.baseline };
}

function runProjection(series, origin, trainingWeeks, forecastWeeks) {
  const trend = series.slice(origin - trainingWeeks + 1, origin + 1).map(point => ({ date: point.date, count: point.count }));
  const result = calculate14DayForecast(trend, { forecastDays: forecastWeeks });
  return { index: origin, modelType: result.modelType, forecast: result.forecast.map(f => ({ predicted: f.predicted, lower: f.lower, upper: f.upper })) };
}

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const task = JSON.parse(input);
  const out = {
    detector: (task.detectorWeeks || []).map(index => runDetector(task.series, index)),
    projection: ((task.projection || {}).origins || []).map(origin =>
      runProjection(task.series, origin, task.projection.trainingWeeks, task.projection.forecastWeeks)),
  };
  process.stdout.write(JSON.stringify(out));
});
