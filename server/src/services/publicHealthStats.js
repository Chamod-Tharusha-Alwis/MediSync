'use strict';

// Public reporting shares surveillance's reviewed-episode definition, but uses
// an explicit UTC reporting window. No model hydration, PHI, ML or DDL is used.
const { diseaseId, POLICY } = require('./surveillanceService');
const DAY = 86400000;
const MAX_REPORTING_ROWS = 100000;
const MAX_TIME_MS = 10000;
const CACHE_POLICY = 'public-real-verified-episodes-v1';
const DISTRICTS = new Set('Ampara|Anuradhapura|Badulla|Batticaloa|Colombo|Galle|Gampaha|Hambantota|Jaffna|Kalutara|Kandy|Kegalle|Kilinochchi|Kurunegala|Mannar|Matale|Matara|Monaragala|Mullaitivu|Nuwara Eliya|Polonnaruwa|Puttalam|Ratnapura|Trincomalee|Vavuniya'.split('|'));
const SYNTHETIC_FLAGS = ['isSimulation', 'isTestFixture', 'isDemoData', 'isSynthetic', 'isUniversityDemo', 'isSyntheticUniversityData', 'isSimulatedDemo', 'isDemoAccount'];
const SYNTHETIC_MARKERS = ['datasetVersion', 'datasetBatch', 'testRunId', 'phase5wOwner', 'demoBatchId', 'syntheticSeedBatch'];
const PROJECTION = Object.freeze(Object.fromEntries([
  '_id', 'patientId', 'createdAt', 'district', 'icdCode', 'icdVersion',
  ...['status', 'source', 'diagnosisStatus', 'verifiedBy', 'verifiedAt', 'episodeId', 'caseDefinitionReference'].map(field => 'surveillanceVerification.' + field),
  ...SYNTHETIC_FLAGS, ...SYNTHETIC_MARKERS
].map(field => [field, 1])));
// Preserve the existing DiseaseCombobox/seed catalog display contract. These
// aliases label reviewed canonical codes; they never inspect clinical free text.
const DISPLAY_ALIASES = Object.freeze({
  'ICD10:A90': 'Dengue', 'ICD10:A279': 'Leptospirosis', 'ICD10:A09': 'Diarrhoeal disease',
  'ICD10:J101': 'Influenza', 'ICD10:A920': 'Chikungunya', 'ICD10:U071': 'COVID-19'
});
let referenceLabels;
function diseaseLabel(id) {
  if (!referenceLabels) {
    const labels = new Map();
    const add = (key, label) => {
      if (typeof label !== 'string' || !label.trim() || label.length > 120) return;
      if (labels.has(key) && labels.get(key) !== label) labels.set(key, null);
      else labels.set(key, label);
    };
    for (const row of require('../utils/loadDatasets').icd10) add('ICD10:' + row.code.replace('.', '').toUpperCase(), row.description);
    for (const row of require('./whoIcd11Service').CURATED_ICD11_CORE_CATALOG) add('ICD11:' + row.code.toUpperCase(), row.description);
    referenceLabels = labels;
  }
  return DISPLAY_ALIASES[id] || referenceLabels.get(id) || id;
}

function unavailable(code = 'PUBLIC_REPORTING_SOURCE_UNVERIFIED') {
  throw Object.assign(Error('PUBLIC_REPORTING_SOURCE_UNVERIFIED'), { code });
}
const validDate = value => Object.prototype.toString.call(value) === '[object Date]' && Number.isFinite(+value);
function validateFilters({ rangeDays = 30, district = 'all', disease = 'all' } = {}) {
  if (!Number.isInteger(rangeDays) || rangeDays < 1 || rangeDays > 365 ||
      typeof district !== 'string' || (district !== 'all' && !DISTRICTS.has(district)) ||
      typeof disease !== 'string' || !disease || disease.length > 100 || /[\x00-\x1f]/.test(disease)) {
    throw Error('INVALID_HEALTH_FILTER');
  }
  return { rangeDays, district, disease };
}

function reportingWindow(rangeDays, now) {
  validateFilters({ rangeDays });
  if (!validDate(now)) unavailable();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return { start: new Date(midnight - (rangeDays - 1) * DAY), end: new Date(+now) };
}

function isSynthetic(row) {
  return SYNTHETIC_FLAGS.some(field => row[field] !== undefined && row[field] !== false && row[field] !== null) ||
    SYNTHETIC_MARKERS.some(field => Object.prototype.hasOwnProperty.call(row, field));
}

function queryFor({ mode = 'real', batchId, rangeDays = 30, now = new Date() } = {}) {
  const window = reportingWindow(rangeDays, now);
  if (!['real', 'simulation'].includes(mode) ||
      (mode === 'simulation' && (typeof batchId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(batchId))) ||
      (mode === 'real' && batchId !== undefined)) unavailable();
  const query = { createdAt: { $gte: window.start, $lte: window.end } };
  if (mode === 'real') {
    // Defense in depth: selection below checks raw metadata even if an inert or
    // future adapter does not enforce these predicates correctly.
    for (const field of SYNTHETIC_FLAGS) query[field] = { $in: [false, null] };
    for (const field of SYNTHETIC_MARKERS) query[field] = { $exists: false };
  } else {
    query.isSimulatedDemo = true;
    query.demoBatchId = batchId;
  }
  return query;
}

function identity(value) {
  if (typeof value === 'string' && value && value.length <= 128) return value;
  if (value && typeof value.toHexString === 'function') {
    const hex = value.toHexString();
    if (typeof hex === 'string' && /^[a-f0-9]{24}$/i.test(hex)) return hex;
  }
  return null;
}

function selectReportingCases(documents, options = {}) {
  const { mode = 'real', batchId, now = new Date(), rangeDays = 30 } = options;
  queryFor({ mode, batchId, now, rangeDays });
  const { start, end } = reportingWindow(rangeDays, now);
  if (!Array.isArray(documents)) unavailable('REPORTING_RESULT_INVALID');
  if (documents.length > MAX_REPORTING_ROWS) unavailable('REPORTING_READ_LIMIT_EXCEEDED');
  const cases = [], seen = new Set();
  const candidates = [];
  for (const row of documents) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) unavailable();
    if (mode === 'real' ? isSynthetic(row) : !isSynthetic(row) || row.isSimulatedDemo !== true || row.demoBatchId !== batchId) continue;
    const time = validDate(row.createdAt) ? +row.createdAt : NaN;
    if (!Number.isFinite(time)) unavailable();
    if (time < +start || time > +end) continue;
    const verification = row.surveillanceVerification;
    // Missing legacy provenance cannot truthfully be converted to a zero count.
    if (!verification || typeof verification !== 'object' || Array.isArray(verification)) unavailable('REPORTING_REVIEW_REQUIRED');
    if (!['verified', 'pending', 'unverified', 'rejected'].includes(verification.status) ||
        (verification.status === 'verified' && !['confirmed', 'suspected', 'unconfirmed', 'rejected'].includes(verification.diagnosisStatus))) unavailable();
    if (verification.status !== 'verified' || verification.diagnosisStatus !== 'confirmed') continue;
    if (verification.source !== (mode === 'real' ? 'clinical_review' : 'synthetic_qa')) unavailable();
    const verifiedAt = validDate(verification.verifiedAt) ? +verification.verifiedAt : NaN;
    const patient = identity(row.patientId), consultation = identity(row._id), reviewer = identity(verification.verifiedBy);
    const episode = verification.episodeId, reference = verification.caseDefinitionReference;
    const id = diseaseId(row);
    if (!Number.isFinite(verifiedAt) || verifiedAt > +end || !patient || !consultation || !reviewer ||
        typeof episode !== 'string' || !episode.trim() || episode.length > 128 ||
        typeof reference !== 'string' || !reference.trim() || reference.length > 256 ||
        !DISTRICTS.has(row.district) || !id) unavailable();
    candidates.push({ patient, consultation, episode, time, diseaseId: id, disease: diseaseLabel(id), district: row.district });
  }
  // As in surveillance, repeat visits for the same patient/disease/episode are
  // counted once, assigned to the earliest in-window clinical encounter.
  candidates.sort((a, b) => a.time - b.time || a.consultation.localeCompare(b.consultation));
  for (const row of candidates) {
    const key = JSON.stringify([row.patient, row.diseaseId, row.episode]);
    if (seen.has(key)) continue;
    seen.add(key);
    cases.push({ time: row.time, diseaseId: row.diseaseId, disease: row.disease, district: row.district });
  }
  return { cases, policy: POLICY };
}

function aggregatePublicCases(documents, options = {}) {
  const filters = validateFilters(options);
  const { cases } = selectReportingCases(documents, options);
  const diseaseCounts = new Map(), districtCounts = new Map(), dates = new Map();
  const { start, end } = reportingWindow(filters.rangeDays, options.now || new Date());
  for (let day = +start; day <= +end; day += DAY) dates.set(new Date(day).toISOString().slice(0, 10), 0);
  let totalCases = 0;
  for (const row of cases) {
    if (filters.district !== 'all' && row.district !== filters.district) continue;
    if (filters.disease !== 'all' && row.disease !== filters.disease && row.diseaseId !== filters.disease) continue;
    totalCases++;
    diseaseCounts.set(row.disease, (diseaseCounts.get(row.disease) || 0) + 1);
    const day = new Date(row.time).toISOString().slice(0, 10);
    dates.set(day, (dates.get(day) || 0) + 1);
    if (!districtCounts.has(row.district)) districtCounts.set(row.district, { totalCases: 0, diseases: new Map() });
    const district = districtCounts.get(row.district);
    district.totalCases++;
    district.diseases.set(row.disease, (district.diseases.get(row.disease) || 0) + 1);
  }
  const byCount = (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]);
  const result = {
    totalCases,
    byDistrict: [...districtCounts].filter(([, value]) => value.totalCases >= 5).map(([district, value]) => ({
      district, totalCases: value.totalCases, topDisease: [...value.diseases].sort(byCount)[0][0]
    })).sort((a, b) => b.totalCases - a.totalCases || a.district.localeCompare(b.district)),
    byDisease: [...diseaseCounts].sort(byCount).map(([disease, count]) => ({ disease, totalCases: count })),
    trend: [...dates].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }))
  };
  if (options.mode === 'simulation') result.isSimulatedDemo = true;
  return result;
}

async function loadPublicHealthStats(collection, { connection, ...options } = {}) {
  if (!connection || connection.readyState !== 1 || !collection || typeof collection.find !== 'function') unavailable('REPORTING_SOURCE_UNAVAILABLE');
  const filters = validateFilters(options);
  const now = options.now || new Date();
  const query = queryFor({ ...options, ...filters, now });
  // No hydration/decryption and no joins to account or patient collections.
  const cursor = collection.find(query, { projection: PROJECTION, limit: MAX_REPORTING_ROWS + 1, maxTimeMS: MAX_TIME_MS });
  if (!cursor || typeof cursor.toArray !== 'function') unavailable('REPORTING_CURSOR_INVALID');
  try {
    const documents = await cursor.toArray();
    return aggregatePublicCases(documents, { ...options, ...filters, now });
  } finally {
    if (typeof cursor.close === 'function') await cursor.close();
  }
}

module.exports = { CACHE_POLICY, MAX_REPORTING_ROWS, MAX_TIME_MS, PROJECTION, SYNTHETIC_FLAGS, SYNTHETIC_MARKERS, validateFilters, reportingWindow, queryFor, diseaseLabel, selectReportingCases, aggregatePublicCases, loadPublicHealthStats };
