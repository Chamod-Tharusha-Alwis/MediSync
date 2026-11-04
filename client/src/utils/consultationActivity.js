import { ALL_DISTRICTS } from './districtAdjacency';

const FLAGS = ['isSimulatedDemo', 'isSynthetic', 'isDemoData', 'isSimulation', 'isTestFixture', 'isDemoAccount', 'isSyntheticUniversityData', 'isUniversityDemo'];
const MARKERS = ['demoBatchId', 'syntheticSeedBatch', 'datasetVersion', 'datasetBatch', 'testRunId', 'phase5wOwner'];
const DAY = 86400000;
const reject = () => { throw new Error('CONSULTATION_ACTIVITY_INVALID'); };
const count = value => Number.isSafeInteger(value) && value >= 0 && value <= 100000;
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

// Project only the public activity contract. Never turn legacy case DTOs or
// simulation payloads into visit counts, clinical predictions or HTML strings.
export function validateConsultationActivity(value, filters = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.metric !== 'recorded_consultation_visits' || value.source !== 'mongodb' || value.mode !== 'real' || value.unit !== 'visits' ||
      FLAGS.some(key => value[key] !== undefined && value[key] !== null && value[key] !== false) || MARKERS.some(key => Object.prototype.hasOwnProperty.call(value, key)) ||
      ['totalCases', 'byDisease', 'forecast', 'outbreakClusters', 'riskTier'].some(key => Object.prototype.hasOwnProperty.call(value, key))) reject();
  const { period, disclosure, surveillance } = value;
  if (!period || !iso(period.start) || !iso(period.end) || Date.parse(period.end) < Date.parse(period.start) ||
      !Number.isInteger(period.rangeDays) || period.rangeDays < 1 || period.rangeDays > 365 ||
      (filters.rangeDays !== undefined && Number(filters.rangeDays) !== period.rangeDays) ||
      disclosure?.districtMinCount !== 5 || surveillance?.availability !== 'not_available' ||
      surveillance.confirmedCases !== null || surveillance.outbreakClusters !== null || surveillance.forecast !== null ||
      !Array.isArray(value.byDistrict) || value.byDistrict.length > 25 || !Array.isArray(value.trend)) reject();
  const start = Date.parse(period.start);
  if (new Date(start).getUTCHours() || new Date(start).getUTCMinutes() || new Date(start).getUTCSeconds() || new Date(start).getUTCMilliseconds() ||
      Math.floor((Date.parse(period.end) - start) / DAY) !== period.rangeDays - 1) reject();
  if (disclosure.suppressed !== undefined && typeof disclosure.suppressed !== 'boolean') reject();
  if (disclosure.suppressed === true) {
    if (!filters.district || filters.district === 'all' || value.totalVisits !== null || value.byDistrict.length || value.trend.length) reject();
    return { metric: value.metric, source: value.source, mode: value.mode, unit: value.unit,
      period: { start: period.start, end: period.end, rangeDays: period.rangeDays }, totalVisits: null, byDistrict: [], trend: [],
      disclosure: { districtMinCount: 5, suppressed: true }, surveillance: { availability: 'not_available', confirmedCases: null, outbreakClusters: null, forecast: null } };
  }
  const districtTrendUnavailable = disclosure.districtTrendUnavailable === true;
  if (disclosure.districtTrendUnavailable !== undefined && typeof disclosure.districtTrendUnavailable !== 'boolean') reject();
  if (districtTrendUnavailable !== Boolean(filters.district && filters.district !== 'all')) reject();
  if (!count(value.totalVisits) || value.trend.length !== (districtTrendUnavailable ? 0 : period.rangeDays)) reject();
  if (filters.district && filters.district !== 'all' && value.totalVisits < 5) reject();
  const seen = new Set();
  const byDistrict = value.byDistrict.map(row => {
    if (!row || !ALL_DISTRICTS.includes(row.district) || seen.has(row.district) || !count(row.visitCount) || row.visitCount < 5 || row.visitCount > value.totalVisits ||
        (filters.district && filters.district !== 'all' && row.district !== filters.district)) reject();
    seen.add(row.district);
    return { district: row.district, visitCount: row.visitCount };
  });
  if (byDistrict.reduce((sum, row) => sum + row.visitCount, 0) > value.totalVisits) reject();
  if (districtTrendUnavailable && (byDistrict.length !== 1 || byDistrict[0].visitCount !== value.totalVisits)) reject();
  const trend = value.trend.map((row, i) => {
    if (!row || row.date !== new Date(start + i * DAY).toISOString().slice(0, 10) || !count(row.visitCount) || row.visitCount > value.totalVisits) reject();
    return { date: row.date, visitCount: row.visitCount };
  });
  if (!districtTrendUnavailable && trend.reduce((sum, row) => sum + row.visitCount, 0) !== value.totalVisits) reject();
  return { metric: value.metric, source: value.source, mode: value.mode, unit: value.unit,
    period: { start: period.start, end: period.end, rangeDays: period.rangeDays }, totalVisits: value.totalVisits, byDistrict, trend,
    disclosure: { districtMinCount: 5, ...(districtTrendUnavailable ? { districtTrendUnavailable: true } : {}) }, surveillance: { availability: 'not_available', confirmedCases: null, outbreakClusters: null, forecast: null } };
}
