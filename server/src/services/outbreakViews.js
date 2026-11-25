'use strict';
/**
 * Outbreak Monitor vs Outbreak History: ONE shared rule, so the two pages can never overlap or leave a gap.
 *
 *   Monitor  = status is Pending or Active  AND  first detected >= now - 14 days
 *              (firstDetectedAt; createdAt for alerts saved before that field existed)
 *   History  = NOT Monitor   (Resolved or Dismissed at any age, or any alert older than 14 days, or missing data)
 *
 * The cut-off is an instant (now minus 14 x 24 hours). Instants have no time zone, so the result is the same in Sri
 * Lanka time (UTC+05:30, no daylight saving) and in UTC. Nothing is deleted or modified: this is a filter only.
 */
const DAY_MS = 86400000;
const MONITOR_WINDOW_DAYS = 14;
const MONITOR_STATUSES = Object.freeze(['Pending', 'Active']);
const ALL_STATUSES = Object.freeze(['Pending', 'Active', 'Resolved', 'Dismissed']); // OutbreakAlert.status enum
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_PAGE = 10000;

const monitorCutoff = (now = new Date()) => new Date(+new Date(now) - MONITOR_WINDOW_DAYS * DAY_MS);

/**
 * Mongo condition for alerts that belong on the Monitor. { detectedAt: true } uses firstDetectedAt with createdAt as the
 * fallback (what the pages use); without it the condition is on createdAt only. Same cut-off in both forms.
 */
function monitorCondition(now = new Date(), { detectedAt = false } = {}) {
  const status = { $in: [...MONITOR_STATUSES] }, recent = { $gte: monitorCutoff(now) };
  if (!detectedAt) return { status, createdAt: recent };
  return { status, $or: [{ firstDetectedAt: recent }, { firstDetectedAt: null, createdAt: recent }] };
}

/** Mongo condition for History: the exact complement of the Monitor condition. */
function historyCondition(now = new Date(), options) {
  return { $nor: [monitorCondition(now, options)] };
}

/** When an alert was first detected: firstDetectedAt, or createdAt for older alerts. */
const firstDetected = alert => (alert && (alert.firstDetectedAt || alert.createdAt)) || null;

/** Same rule in plain JavaScript (used by tests and for labelling). */
function isMonitorAlert(alert, now = new Date()) {
  const first = firstDetected(alert);
  const detected = first ? +new Date(first) : NaN;
  return Boolean(alert) && MONITOR_STATUSES.includes(alert.status) && Number.isFinite(detected) && detected >= +monitorCutoff(now);
}

class ViewQueryError extends Error {
  constructor(code, message) { super(message); this.code = code; this.status = 400; }
}

function parsePaging(query = {}) {
  const page = query.page === undefined ? 1 : Number(query.page);
  if (!Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE || !/^\d+$/.test(String(query.page ?? '1'))) {
    throw new ViewQueryError('INVALID_PAGE', `page must be a whole number from 1 to ${MAX_PAGE}.`);
  }
  const limit = query.limit === undefined ? DEFAULT_LIMIT : Number(query.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT || !/^\d+$/.test(String(query.limit ?? DEFAULT_LIMIT))) {
    throw new ViewQueryError('INVALID_LIMIT', `limit must be a whole number from 1 to ${MAX_LIMIT}.`);
  }
  return { page, limit, skip: (page - 1) * limit };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// A calendar date in Sri Lanka time: from = 00:00 +05:30, to = 23:59:59.999 +05:30.
function colomboDay(value, endOfDay) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null; // e.g. 2026-02-30
  return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+05:30`);
}

const HISTORY_KEYS = new Set(['view', 'page', 'limit', 'disease', 'district', 'status', 'from', 'to']);
/**
 * Validates GET /admin/outbreak/alerts?view=history&page=&limit=&disease=&district=&status=&from=&to=
 * Throws ViewQueryError (status 400, code) for anything else.
 */
function parseHistoryQuery(query = {}, { districts } = {}) {
  for (const key of Object.keys(query)) if (!HISTORY_KEYS.has(key)) throw new ViewQueryError('UNKNOWN_FILTER', `Unknown filter: ${key}.`);
  for (const [key, value] of Object.entries(query)) if (typeof value !== 'string') throw new ViewQueryError('INVALID_FILTER', `${key} must be given once.`);
  const paging = parsePaging(query);
  const filters = {};
  if (query.disease !== undefined) {
    const disease = query.disease.trim();
    if (!disease || disease.length > 64 || !/^[A-Za-z0-9:._ -]+$/.test(disease)) throw new ViewQueryError('INVALID_DISEASE', 'disease must be 1 to 64 letters, digits or . : _ - characters.');
    filters.disease = disease;
  }
  if (query.district !== undefined) {
    const district = query.district.trim();
    if (!district || (districts && !districts.has(district))) throw new ViewQueryError('INVALID_DISTRICT', 'district must be one of the 25 districts.');
    filters.district = district;
  }
  if (query.status !== undefined) {
    if (!ALL_STATUSES.includes(query.status)) throw new ViewQueryError('INVALID_STATUS', `status must be one of: ${ALL_STATUSES.join(', ')}.`);
    filters.status = query.status;
  }
  let from = null, to = null;
  if (query.from !== undefined && !(from = colomboDay(query.from, false))) throw new ViewQueryError('INVALID_DATE', 'from must be a date in the form YYYY-MM-DD.');
  if (query.to !== undefined && !(to = colomboDay(query.to, true))) throw new ViewQueryError('INVALID_DATE', 'to must be a date in the form YYYY-MM-DD.');
  if (from && to && from > to) throw new ViewQueryError('INVALID_DATE_RANGE', 'from must not be after to.');
  return { ...paging, filters, from, to };
}

/** Mongo filter fragment for the History filters (combined with historyCondition by the caller). */
function historyFilterFragment({ filters = {}, from = null, to = null } = {}) {
  const out = {};
  if (filters.disease) out.disease = filters.disease;
  if (filters.district) out.$or = [{ location: filters.district }, { district: filters.district }];
  if (filters.status) out.status = filters.status;
  if (from || to) out.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  return out;
}

module.exports = {
  MONITOR_WINDOW_DAYS, MONITOR_STATUSES, ALL_STATUSES, DEFAULT_LIMIT, MAX_LIMIT,
  monitorCutoff, monitorCondition, historyCondition, isMonitorAlert, firstDetected,
  parsePaging, parseHistoryQuery, historyFilterFragment, ViewQueryError,
};
