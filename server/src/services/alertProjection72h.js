'use strict';
/**
 * server/src/services/alertProjection72h.js
 *
 * 72-hour numbers and an honest projection for outbreak alerts.
 *
 * Windows are aligned to the last complete day (Asia/Colombo midnight E of the alert or scan time):
 *   previous 72h = [E-144h, E-72h)   actual last 72h = [E-72h, E)   next 72h = [E, E+72h)
 *
 * Projection (method v1): the expected value is the actual last 72 hours (naive "repeat the last value").
 * The range is that value plus the 10th and 90th percentiles of past 72h-to-next-72h changes for the same
 * district and disease, using only cases before E. Past windows are non-overlapping 72-hour steps back
 * from E, starting no earlier than the first verified case of that district and disease in the look-back.
 * At least 8 past windows are required; otherwise the range is "not enough history".
 * This is a projection, not a forecast. In this project's back-test it was not shown to beat repeating
 * the last 72 hours (it IS repeating the last 72 hours; the range only describes past variability).
 *
 * Every number is computed from verified consultation records (surveillanceService.loadCases). No patient
 * fields are read or returned: only district, disease code and timestamps.
 */
const DAY = 86400000;
const H72 = 3 * DAY;
const MIN_HISTORY_WINDOWS = 8;
const QUANTILES = Object.freeze({ low: 0.1, high: 0.9 });
const METHOD = 'naive-last-72h with empirical 10th-90th percentile range of past 72h-to-next-72h changes';
const METHOD_VERSION = 'alert72h-naive-empirical-v1';
const CAVEAT = 'projection, not a forecast';
const HELP_TEXT = 'Expected value = the actual last 72 hours repeated. Range = that value plus the 10th to 90th percentile of past 72-hour-to-next-72-hour changes for this district and disease (data before the alert date only, at least 8 past windows). In this project\'s tests it has not been shown to beat repeating the last 72 hours.';
const DATA_NOTE = 'verified MediSync consultations only (lower bound)';

function colomboMidnight(date) {
  return require('./surveillanceService').getColomboMidnight(date);
}

// Type-7 (linear interpolation) quantile of a numeric array.
function quantile(values, p) {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return null;
  const h = (s.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
}

/**
 * Pure core shared by the alert service and the back-test.
 * periods: consecutive period totals, oldest first; the LAST element is the actual (most recent) period.
 * Returns the naive projection for the next period and, with >= 8 past changes, an empirical range.
 */
function projectFromPeriods(periods) {
  if (!Array.isArray(periods) || !periods.length) throw new Error('PERIODS_REQUIRED');
  const actual = periods[periods.length - 1];
  const changes = [];
  for (let i = 1; i < periods.length; i++) changes.push(periods[i] - periods[i - 1]);
  const base = { projected: actual, historyWindows: changes.length, method: METHOD, methodVersion: METHOD_VERSION, caveat: CAVEAT };
  if (changes.length < MIN_HISTORY_WINDOWS) return { ...base, low: null, high: null, enoughHistory: false };
  const low = Math.max(0, Math.floor(actual + quantile(changes, QUANTILES.low)));
  const high = Math.max(low, Math.ceil(actual + quantile(changes, QUANTILES.high)));
  return { ...base, low, high, enoughHistory: true };
}

const countIn = (times, start, end) => times.reduce((n, t) => n + (t >= start && t < end ? 1 : 0), 0);

function matchesAlert(c, alert) {
  const district = String(alert.location || alert.district || '').toLowerCase();
  const disease = String(alert.disease || '').toUpperCase();
  return String(c.district || '').toLowerCase() === district && String(c.diseaseId || c.disease || '').toUpperCase() === disease;
}

/**
 * Computes the alert's numbers at reference time `asOf` from verified cases (rows with district, diseaseId,
 * time). lookbackStart bounds the history (the scan's look-back start).
 */
function computeAlertNumbers(alert, cases, { asOf, lookbackStart } = {}) {
  const E = colomboMidnight(asOf);
  const own = cases.filter(c => matchesAlert(c, alert)).map(c => (typeof c.time === 'number' ? c.time : +new Date(c.createdAt))).filter(t => t < E);
  const island = cases.filter(c => String(c.diseaseId || c.disease || '').toUpperCase() === String(alert.disease || '').toUpperCase())
    .map(c => (typeof c.time === 'number' ? c.time : +new Date(c.createdAt)));
  const previous72h = countIn(own, E - 2 * H72, E - H72);
  const actual72h = countIn(own, E - H72, E);
  // History: non-overlapping 72h periods ending at E, E-72h, ...; a period is used only if it lies inside the
  // look-back and ends after the first verified case of this district and disease (no invented zeros before it).
  const firstCase = own.length ? Math.min(...own) : E;
  const floor = Number.isFinite(lookbackStart) ? lookbackStart : -Infinity;
  const periods = [];
  for (let end = E; end - H72 >= floor && end > firstCase; end -= H72) periods.unshift(countIn(own, end - H72, end));
  const projection = projectFromPeriods(periods.length ? periods : [actual72h]);
  const dailyCounts7d = Array.from({ length: 7 }, (_, i) => countIn(own, E - (7 - i) * DAY, E - (6 - i) * DAY));
  const change = actual72h - previous72h;
  return {
    window: { previousStart: new Date(E - 2 * H72), previousEnd: new Date(E - H72), actualStart: new Date(E - H72), actualEnd: new Date(E),
      nextStart: new Date(E), nextEnd: new Date(E + H72), dailyStart: new Date(E - 7 * DAY) },
    previous72h, actual72h, change, percentChange: previous72h > 0 ? Number(((change / previous72h) * 100).toFixed(1)) : (actual72h > 0 ? 'new' : 0),
    islandActual72h: countIn(island, E - H72, E), dailyCounts7d, projection, dataNote: DATA_NOTE,
  };
}

function populationFigures(district, count) {
  const { getDistrictPopulation } = require('./incidenceService');
  const population = getDistrictPopulation(district);
  if (!population) return { population: null, sharePct: null, per100k: null };
  return { population, sharePct: Number(((count / population) * 100).toPrecision(3)), per100k: Number(((count / population) * 100000).toFixed(2)) };
}

function buildSnapshot(alert, cases, { asOf, lookbackStart, now = new Date() } = {}) {
  const n = computeAlertNumbers(alert, cases, { asOf, lookbackStart });
  return {
    alertId: String(alert._id || alert.alertId || ''), district: alert.location || alert.district, disease: alert.disease,
    window: n.window, previous72h: n.previous72h, actual72h: n.actual72h,
    projected: n.projection.projected, low: n.projection.low, high: n.projection.high, enoughHistory: n.projection.enoughHistory,
    historyWindows: n.projection.historyWindows, method: METHOD, methodVersion: METHOD_VERSION, caveat: CAVEAT, createdAt: now,
  };
}

function outcomeFor(snapshot, cases, { asOf } = {}) {
  const E = colomboMidnight(asOf);
  const nextStart = +new Date(snapshot.window.nextStart), nextEnd = +new Date(snapshot.window.nextEnd);
  if (E < nextEnd) return null; // the next scan has not yet covered the whole period
  const own = cases.filter(c => matchesAlert(c, snapshot)).map(c => (typeof c.time === 'number' ? c.time : +new Date(c.createdAt)));
  const actualNext72h = countIn(own, nextStart, nextEnd);
  return { actualNext72h, absoluteError: Math.abs(actualNext72h - snapshot.projected),
    withinRange: snapshot.enoughHistory ? actualNext72h >= snapshot.low && actualNext72h <= snapshot.high : null, recordedAt: new Date() };
}

/**
 * Write-once persistence through the raw collection (the snapshot is never overwritten; the outcome is
 * added beside it once). Returns counts. `collection` is OutbreakAlert.collection.
 */
async function recordSnapshotsAndOutcomes(collection, alerts, cases, { asOf, lookbackStart, now = new Date() } = {}) {
  const out = { snapshotsWritten: 0, outcomesWritten: 0 };
  for (const a of alerts || []) {
    const id = a._id || a.alertId;
    if (!id) continue;
    const _id = typeof id === 'string' ? new (require('mongoose').Types.ObjectId)(id) : id;
    const snap = buildSnapshot({ ...a, _id }, cases, { asOf, lookbackStart, now });
    const r = await collection.updateOne({ _id, projection72h: { $exists: false } }, { $set: { projection72h: snap } });
    out.snapshotsWritten += r.modifiedCount || 0;
  }
  const pending = await collection.find({ projection72h: { $exists: true }, projection72hOutcome: { $exists: false } }, { projection: { projection72h: 1 } }).toArray();
  for (const doc of pending) {
    const outcome = outcomeFor(doc.projection72h, cases, { asOf });
    if (!outcome) continue;
    const r = await collection.updateOne({ _id: doc._id, projection72hOutcome: { $exists: false } }, { $set: { projection72hOutcome: outcome } });
    out.outcomesWritten += r.modifiedCount || 0;
  }
  return out;
}

/** View model for the admin screen and email: stored snapshot (or a live computation) plus outcome. */
function alertView(alert, liveNumbers) {
  const snap = alert.projection72h || null;
  const n = liveNumbers || null;
  const actual = snap ? snap.actual72h : n?.actual72h ?? null;
  const previous = snap ? snap.previous72h : n?.previous72h ?? null;
  return {
    previous72h: previous, actual72h: actual,
    change: actual !== null && previous !== null ? actual - previous : null,
    projected: snap ? snap.projected : n?.projection.projected ?? null,
    low: snap ? snap.low : n?.projection.low ?? null, high: snap ? snap.high : n?.projection.high ?? null,
    enoughHistory: snap ? snap.enoughHistory : n?.projection.enoughHistory ?? false,
    historyWindows: snap ? snap.historyWindows : n?.projection.historyWindows ?? 0,
    window: snap ? snap.window : n?.window ?? null,
    stored: Boolean(snap), outcome: alert.projection72hOutcome || null,
    caveat: CAVEAT, helpText: HELP_TEXT, methodVersion: METHOD_VERSION, dataNote: DATA_NOTE,
  };
}

module.exports = { DAY, H72, MIN_HISTORY_WINDOWS, QUANTILES, METHOD, METHOD_VERSION, CAVEAT, HELP_TEXT, DATA_NOTE,
  quantile, projectFromPeriods, computeAlertNumbers, populationFigures, buildSnapshot, outcomeFor, recordSnapshotsAndOutcomes, alertView };
