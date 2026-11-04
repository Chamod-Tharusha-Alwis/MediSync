'use strict';

// Saved consultation activity is not confirmed-case surveillance. Only native
// metadata is read; no models are hydrated and no clinical fields are decrypted.
const { SYNTHETIC_FLAGS, SYNTHETIC_MARKERS, reportingWindow, queryFor, validateFilters } = require('./publicHealthStats');
const DAY = 86400000;
const MAX_ACTIVITY_ROWS = 100000;
const MAX_TIME_MS = 10000;
const DISTRICT_MIN_COUNT = 5;
const CACHE_POLICY = 'public-real-consultation-activity-v1';
const METRIC = 'recorded_consultation_visits';
const SYNTHETIC_REFERENCE = /^CON-(?:SYNTH|DEMO)(?:-|$)/i;
const PROJECTION = Object.freeze(Object.fromEntries(['_id', 'consultationId', 'createdAt', 'district', ...SYNTHETIC_FLAGS, ...SYNTHETIC_MARKERS].map(key => [key, 1])));
const unavailable = () => { throw Error('CONSULTATION_ACTIVITY_UNAVAILABLE'); };
const validDate = value => Object.prototype.toString.call(value) === '[object Date]' && Number.isFinite(+value);
const synthetic = row => SYNTHETIC_FLAGS.some(key => row[key] !== undefined && row[key] !== false && row[key] !== null) ||
  SYNTHETIC_MARKERS.some(key => Object.prototype.hasOwnProperty.call(row, key)) ||
  (typeof row.consultationId === 'string' && SYNTHETIC_REFERENCE.test(row.consultationId));

function validateActivityFilters(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['rangeDays', 'district'].includes(key))) throw Error('INVALID_ACTIVITY_FILTER');
  const { rangeDays = 30, district = 'all' } = input;
  let validated;
  try { validated = validateFilters({ rangeDays, district }); } catch (_) { throw Error('INVALID_ACTIVITY_FILTER'); }
  return { rangeDays: validated.rangeDays, district: validated.district };
}

function activityQuery(options = {}) {
  if ((options.mode !== undefined && options.mode !== 'real') || Object.prototype.hasOwnProperty.call(options, 'demoBatchId')) unavailable();
  const filters = validateActivityFilters({ rangeDays: options.rangeDays ?? 30, district: options.district ?? 'all' });
  const query = queryFor({ ...filters, mode: 'real', now: options.now || new Date() });
  query.consultationId = { $not: SYNTHETIC_REFERENCE };
  // Select the same real-only input regardless of district so malformed metadata
  // cannot disappear behind a filter and be presented as an authoritative zero.
  return query;
}

function recordId(value) {
  if (typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value)) return value.toLowerCase();
  if (value && typeof value.toHexString === 'function') {
    const text = value.toHexString();
    if (typeof text === 'string' && /^[a-f0-9]{24}$/i.test(text)) return text.toLowerCase();
  }
  unavailable();
}

function unavailableSurveillance() {
  return { availability: 'not_available', confirmedCases: null, outbreakClusters: null, forecast: null };
}

function aggregateConsultationActivity(documents, options = {}) {
  activityQuery(options);
  const filters = validateActivityFilters({ rangeDays: options.rangeDays ?? 30, district: options.district ?? 'all' });
  const now = options.now || new Date(), { start, end } = reportingWindow(filters.rangeDays, now);
  if (!Array.isArray(documents) || documents.length > MAX_ACTIVITY_ROWS) unavailable();
  const days = new Map(), districts = new Map(), seen = new Map();
  for (let time = +start; time <= +end; time += DAY) days.set(new Date(time).toISOString().slice(0, 10), 0);
  let totalVisits = 0;
  for (const row of documents) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) unavailable();
    if (synthetic(row)) continue;
    if (!validDate(row.createdAt)) unavailable();
    if (+row.createdAt < +start || +row.createdAt > +end) continue;
    const id = recordId(row._id);
    if (row.consultationId !== undefined && (typeof row.consultationId !== 'string' || row.consultationId.length > 160)) unavailable();
    // District is optional in the production schema. An absent location cannot
    // erase a saved visit, and must never be assigned to an invented district.
    let district = null;
    if (row.district !== undefined && row.district !== null && row.district !== '') {
      try { validateFilters({ district: row.district }); } catch (_) { unavailable(); }
      if (row.district === 'all') unavailable();
      district = row.district;
    }
    const signature = JSON.stringify([+row.createdAt, district, row.consultationId || null]);
    if (seen.has(id)) { if (seen.get(id) !== signature) unavailable(); continue; }
    seen.set(id, signature);
    if (filters.district !== 'all' && district !== filters.district) continue;
    totalVisits++;
    const day = row.createdAt.toISOString().slice(0, 10);
    days.set(day, days.get(day) + 1);
    if (district) districts.set(district, (districts.get(district) || 0) + 1);
  }
  const suppressed = filters.district !== 'all' && totalVisits < DISTRICT_MIN_COUNT;
  return activityDto({
    metric: METRIC, source: 'mongodb', mode: 'real', unit: 'visits',
    period: { start: start.toISOString(), end: end.toISOString(), rangeDays: filters.rangeDays }, totalVisits: suppressed ? null : totalVisits,
    byDistrict: [...districts].filter(([, count]) => count >= DISTRICT_MIN_COUNT).map(([district, visitCount]) => ({ district, visitCount })).sort((a, b) => b.visitCount - a.visitCount || a.district.localeCompare(b.district)),
    trend: filters.district !== 'all' ? [] : [...days].map(([date, visitCount]) => ({ date, visitCount })),
    disclosure: { districtMinCount: DISTRICT_MIN_COUNT, ...(suppressed ? { suppressed: true } : filters.district !== 'all' ? { districtTrendUnavailable: true } : {}) }, surveillance: unavailableSurveillance()
  });
}

function activityDto(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || synthetic(value) || value.metric !== METRIC || value.source !== 'mongodb' || value.mode !== 'real' || value.unit !== 'visits' ||
      ['totalCases', 'byDisease', 'forecast', 'outbreakClusters', 'riskTier'].some(key => Object.prototype.hasOwnProperty.call(value, key))) unavailable();
  const count = input => { if (!Number.isSafeInteger(input) || input < 0 || input > MAX_ACTIVITY_ROWS) unavailable(); return input; };
  const period = value.period;
  if (!period || typeof period !== 'object' || typeof period.start !== 'string' || typeof period.end !== 'string') unavailable();
  const start = new Date(period.start), end = new Date(period.end);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || start.toISOString() !== period.start || end.toISOString() !== period.end) unavailable();
  let window;
  try { window = reportingWindow(period.rangeDays, end); } catch (_) { unavailable(); }
  if (+window.start !== +start || +end < +start || value.disclosure?.districtMinCount !== DISTRICT_MIN_COUNT) unavailable();
  if (value.disclosure.suppressed !== undefined && typeof value.disclosure.suppressed !== 'boolean') unavailable();
  const surveillance = value.surveillance;
  if (!surveillance || surveillance.availability !== 'not_available' || surveillance.confirmedCases !== null || surveillance.outbreakClusters !== null || surveillance.forecast !== null) unavailable();
  if (value.disclosure.suppressed === true) {
    if (value.totalVisits !== null || !Array.isArray(value.byDistrict) || value.byDistrict.length || !Array.isArray(value.trend) || value.trend.length) unavailable();
    return { metric: METRIC, source: 'mongodb', mode: 'real', unit: 'visits',
      period: { start: period.start, end: period.end, rangeDays: period.rangeDays }, totalVisits: null,
      byDistrict: [], trend: [], disclosure: { districtMinCount: DISTRICT_MIN_COUNT, suppressed: true }, surveillance: unavailableSurveillance() };
  }
  const totalVisits = count(value.totalVisits);
  const districtTrendUnavailable = value.disclosure.districtTrendUnavailable === true;
  if (value.disclosure.districtTrendUnavailable !== undefined && typeof value.disclosure.districtTrendUnavailable !== 'boolean') unavailable();
  if (!Array.isArray(value.byDistrict) || value.byDistrict.length > 25 || !Array.isArray(value.trend) || value.trend.length !== (districtTrendUnavailable ? 0 : period.rangeDays)) unavailable();
  const names = new Set();
  const byDistrict = value.byDistrict.map(row => {
    if (!row || typeof row !== 'object' || names.has(row.district)) unavailable();
    try { validateFilters({ district: row.district }); } catch (_) { unavailable(); }
    if (row.district === 'all' || row.district === undefined) unavailable();
    names.add(row.district);
    const visitCount = count(row.visitCount);
    if (visitCount < DISTRICT_MIN_COUNT) unavailable();
    return { district: row.district, visitCount };
  });
  const trend = value.trend.map((row, index) => {
    const expected = new Date(+start + index * DAY).toISOString().slice(0, 10);
    if (!row || typeof row !== 'object' || row.date !== expected) unavailable();
    return { date: expected, visitCount: count(row.visitCount) };
  });
  if ((!districtTrendUnavailable && trend.reduce((sum, row) => sum + row.visitCount, 0) !== totalVisits) || byDistrict.reduce((sum, row) => sum + row.visitCount, 0) > totalVisits ||
      (districtTrendUnavailable && (totalVisits < 5 || byDistrict.length !== 1 || byDistrict[0].visitCount !== totalVisits))) unavailable();
  return { metric: METRIC, source: 'mongodb', mode: 'real', unit: 'visits',
    period: { start: period.start, end: period.end, rangeDays: period.rangeDays }, totalVisits,
    byDistrict, trend, disclosure: { districtMinCount: DISTRICT_MIN_COUNT, ...(districtTrendUnavailable ? { districtTrendUnavailable: true } : {}) }, surveillance: unavailableSurveillance() };
}

async function loadConsultationActivity(collection, { connection, ...options } = {}) {
  if (connection?.readyState !== 1 || !collection || typeof collection.find !== 'function') unavailable();
  const query = activityQuery(options);
  const cursor = collection.find(query, { projection: PROJECTION, limit: MAX_ACTIVITY_ROWS + 1, maxTimeMS: MAX_TIME_MS });
  try {
    if (!cursor || typeof cursor.toArray !== 'function') unavailable();
    return aggregateConsultationActivity(await cursor.toArray(), options);
  } finally { if (cursor && typeof cursor.close === 'function') await cursor.close(); }
}

module.exports = { CACHE_POLICY, METRIC, MAX_ACTIVITY_ROWS, MAX_TIME_MS, DISTRICT_MIN_COUNT, PROJECTION, SYNTHETIC_REFERENCE,
  validateActivityFilters, activityQuery, activityDto, aggregateConsultationActivity, loadConsultationActivity };
