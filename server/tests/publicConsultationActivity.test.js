'use strict';
const activity = require('../src/services/publicConsultationActivity');
const { SYNTHETIC_FLAGS, SYNTHETIC_MARKERS } = require('../src/services/publicHealthStats');
const { controllerHarness } = require('./helpers/phase5xD5InertHarness');
const now = new Date('2026-11-04T12:00:00Z');
const visit = (n = 1, overrides = {}) => ({ _id: n.toString(16).padStart(24, '0'), consultationId: 'CON-' + n, createdAt: new Date('2026-11-03T10:00:00Z'), district: 'Colombo', ...overrides });
const rows = n => Array.from({ length: n }, (_, i) => visit(i + 1));
function collection(documents) { const toArray = jest.fn(async () => documents), close = jest.fn(async () => {}); return { find: jest.fn(() => ({ toArray, close })), toArray, close }; }
function controller({ documents = [], cached = null, readyState = 1 } = {}) {
  const source = collection(documents), getCache = jest.fn(async () => cached), setCache = jest.fn(async () => {});
  const h = controllerHarness('publicConsultationActivityController', { dependencies: {
    mongoose: { connection: { readyState } }, '../models/Consultation': { collection: source },
    '../config/redis': { getCache, setCache }, '../services/publicConsultationActivity': activity
  } });
  return { source, getCache, setCache, run: query => h.invoke('getConsultationActivity', { query: query || {} }) };
}
test('saved records are visits without requiring or fabricating clinical review', () => {
  const result = activity.aggregateConsultationActivity(rows(6), { now });
  expect(result).toMatchObject({ metric: 'recorded_consultation_visits', mode: 'real', unit: 'visits', totalVisits: 6,
    byDistrict: [{ district: 'Colombo', visitCount: 6 }], surveillance: { availability: 'not_available', confirmedCases: null, outbreakClusters: null, forecast: null } });
  expect(result.trend).toHaveLength(30); expect(result.trend.reduce((n, row) => n + row.visitCount, 0)).toBe(6);
  expect(result).not.toHaveProperty('totalCases'); expect(result).not.toHaveProperty('byDisease'); expect(result).not.toHaveProperty('forecast');
});
test.each(SYNTHETIC_FLAGS)('excludes synthetic flag %s even if adapter ignores query predicates', key => {
  expect(activity.aggregateConsultationActivity([visit(1), visit(2, { [key]: true })], { now }).totalVisits).toBe(1);
});
test.each(SYNTHETIC_MARKERS)('excludes present batch marker %s', key => {
  expect(activity.aggregateConsultationActivity([visit(1), visit(2, { [key]: null })], { now }).totalVisits).toBe(1);
});
test.each(['CON-SYNTH-001', 'CON-DEMO-OWNED-001', 'con-synth-owned'])('excludes known synthetic reference without flags (%s)', consultationId => {
  expect(activity.aggregateConsultationActivity([visit(1), visit(2, { consultationId })], { now }).totalVisits).toBe(1);
});
test('identical duplicate IDs count once; conflicting duplicates are unavailable', () => {
  expect(activity.aggregateConsultationActivity([visit(), visit()], { now }).totalVisits).toBe(1);
  expect(() => activity.aggregateConsultationActivity([visit(), visit(1, { district: 'Galle' })], { now })).toThrow();
});
test('district suppression never changes national or daily totals', () => {
  const result = activity.aggregateConsultationActivity([...rows(5), ...rows(4).map((row, i) => visit(i + 10, { district: 'Galle' }))], { now });
  expect(result.totalVisits).toBe(9); expect(result.byDistrict).toEqual([{ district: 'Colombo', visitCount: 5 }]);
  expect(result.trend.reduce((n, row) => n + row.visitCount, 0)).toBe(9);
  expect(activity.aggregateConsultationActivity(rows(4), { now }).byDistrict).toEqual([]);
});
test.each([1, 7, 30, 90, 365])('UTC window %i counts exact start and excludes future and prior times', rangeDays => {
  const query = activity.activityQuery({ now, rangeDays }), start = query.createdAt.$gte;
  const result = activity.aggregateConsultationActivity([visit(1, { createdAt: start }), visit(2, { createdAt: new Date(+start - 1) }), visit(3, { createdAt: new Date(+now + 1) })], { now, rangeDays });
  expect(result.totalVisits).toBe(1); expect(result.trend).toHaveLength(rangeDays); expect(start.getUTCHours()).toBe(0);
});
test('filters are real-only, and a completed empty read is a genuine zero-visit report', () => {
  expect(activity.aggregateConsultationActivity([], { now })).toMatchObject({ totalVisits: 0, byDistrict: [] });
  expect(activity.aggregateConsultationActivity([visit(1)], { now, district: 'Galle' }).totalVisits).toBeNull();
  expect(() => activity.aggregateConsultationActivity([], { now, mode: 'simulation' })).toThrow();
  expect(() => activity.aggregateConsultationActivity([], { now, demoBatchId: 'OWNED' })).toThrow();
});
test.each([null, {}, [null], [visit(1, { createdAt: 'bad' })], [visit(1, { district: { $ne: null } })], [visit(1, { district: 'Unknown' })], [visit(1, { district: 'all' })], [visit(1, { _id: 'bad' })], Array(100001).fill(visit())])('invalid/oversized metadata never becomes fabricated zero %#', input => {
  expect(() => activity.aggregateConsultationActivity(input, { now })).toThrow();
});
test.each([undefined, null, ''])('optional unrecorded district preserves a visit without inventing location (%p)', district => {
  const input = [visit(1, { district })];
  expect(activity.aggregateConsultationActivity(input, { now })).toMatchObject({ totalVisits: 1, byDistrict: [] });
  expect(activity.aggregateConsultationActivity(input, { now, district: 'Colombo' }).totalVisits).toBeNull();
});
test.each([0, 1, 4])('selected district with %i records discloses neither total nor daily counts', amount => {
  const result = activity.aggregateConsultationActivity(rows(amount), { now, district: 'Colombo' });
  expect(result).toMatchObject({ totalVisits: null, trend: [], byDistrict: [], disclosure: { districtMinCount: 5, suppressed: true } });
});
test('selected district at the disclosure threshold retains actual visit counts', () => {
  const data = activity.aggregateConsultationActivity(rows(5), { now, district: 'Colombo' });
  expect(data.totalVisits).toBe(5); expect(data.trend).toEqual([]); expect(data.disclosure.districtTrendUnavailable).toBe(true);
});
test('published selected total cannot expose under-threshold district daily cells', () => {
  const input = rows(5).map((row, index) => ({ ...row, createdAt: new Date(index < 3 ? '2026-11-03T10:00:00Z' : '2026-11-02T10:00:00Z') }));
  const data = activity.aggregateConsultationActivity(input, { now, district: 'Colombo' });
  expect(data.totalVisits).toBe(5); expect(data.trend).toEqual([]);
  expect(activity.aggregateConsultationActivity(input, { now }).trend.filter(row => row.visitCount > 0).map(row => row.visitCount)).toEqual([2, 3]);
});
test('HTTP selected-district result is suppressed and an old numeric cache cannot bypass it', async () => {
  const documents = rows(4).map(row => ({ ...row, createdAt: new Date(Date.now() - 60000) }));
  const now = new Date(), stale = activity.aggregateConsultationActivity(documents, { now });
  const h = controller({ documents, cached: { policy: activity.CACHE_POLICY, mode: 'real', district: 'Colombo', data: stale } });
  const result = await h.run({ district: 'Colombo' });
  expect(result.status).toBe(200); expect(result.body.data.totalVisits).toBeNull(); expect(result.body.data.trend).toEqual([]);
  expect(h.source.find).toHaveBeenCalledTimes(1);
});
test('native query is bounded, excludes synthetic references and reads no clinical fields', async () => {
  const source = collection(rows(6)); await activity.loadConsultationActivity(source, { connection: { readyState: 1 }, now });
  const [query, options] = source.find.mock.calls[0];
  expect(query.demoBatchId).toEqual({ $exists: false }); expect(query.consultationId.$not).toBe(activity.SYNTHETIC_REFERENCE);
  expect(options).toMatchObject({ limit: 100001, maxTimeMS: 10000 });
  expect(Object.keys(options.projection)).not.toEqual(expect.arrayContaining(['patientId', 'doctorId', 'patientNic', 'diagnosis', 'notes', 'email', 'fullName']));
  expect(source.close).toHaveBeenCalledTimes(1);
});
test('read rejection closes the cursor and a disconnected source is never read', async () => {
  const source = collection([]); source.toArray.mockRejectedValue(Error('owned-private-sentinel'));
  await expect(activity.loadConsultationActivity(source, { connection: { readyState: 1 }, now })).rejects.toThrow(); expect(source.close).toHaveBeenCalledTimes(1);
  const disconnected = collection([]); await expect(activity.loadConsultationActivity(disconnected, { connection: { readyState: 0 }, now })).rejects.toThrow(); expect(disconnected.find).not.toHaveBeenCalled();
});
test('DTO strips unknown identifiers and cannot convert visit data to cases or forecasts', () => {
  const data = activity.aggregateConsultationActivity(rows(6), { now });
  expect(JSON.stringify(activity.activityDto({ ...data, patientId: 'owned-private-sentinel' }))).not.toContain('owned-private-sentinel');
  for (const change of [{ unit: 'cases' }, { mode: 'simulation' }, { forecast: [] }, { totalCases: 6 }, { surveillance: { ...data.surveillance, confirmedCases: 0 } }, { totalVisits: 7 }, { trend: [] }]) expect(() => activity.activityDto({ ...data, ...change })).toThrow();
});
test.each([{ mode: 'simulation' }, { demoBatchId: 'OWNED' }, { disease: 'A90' }, { rangeDays: '366' }, { rangeDays: ['7'] }, { district: { $ne: null } }, { rangeDays: '1e2' }])('HTTP filter rejects unapproved input before source/cache access %#', async query => {
  const h = controller(), result = await h.run(query); expect(result.status).toBe(400); expect(h.source.find).not.toHaveBeenCalled(); expect(h.getCache).not.toHaveBeenCalled();
});
test('HTTP source response is metadata-only activity with separate cache namespace', async () => {
  const h = controller({ documents: rows(6).map(row => ({ ...row, createdAt: new Date(Date.now() - 60000) })) });
  const result = await h.run(); expect(result.status).toBe(200); expect(result.body.data.totalVisits).toBe(6); expect(result.body.cached).toBe(false);
  expect(h.getCache.mock.calls[0][0]).toMatch(/^medisync:cache:consultation-activity:real-v1:/); expect(h.setCache).toHaveBeenCalledTimes(1);
});
test.each(['read', 'write', 'decode'])('optional cache %s failure cannot invalidate verified saved-visit metadata', async phase => {
  const h = controller({ documents: rows(6).map(row => ({ ...row, createdAt: new Date(Date.now() - 60000) })), cached: phase === 'decode' ? { policy: activity.CACHE_POLICY, mode: 'real', district: 'all', data: {} } : null });
  if (phase === 'read') h.getCache.mockRejectedValue(Error('owned-private-sentinel'));
  if (phase === 'write') h.setCache.mockRejectedValue(Error('owned-private-sentinel'));
  const result = await h.run(); expect(result.status).toBe(200); expect(result.body.data.totalVisits).toBe(6); expect(h.source.find).toHaveBeenCalledTimes(1); expect(JSON.stringify(result)).not.toContain('owned-private-sentinel');
});
test('source failure is sanitized and disconnected Mongo cannot use a cached report', async () => {
  const h = controller(); h.source.toArray.mockRejectedValue(Error('owned-private-sentinel')); const result = await h.run(); expect(result).toEqual({ status: 503, body: { error: 'CONSULTATION_ACTIVITY_UNAVAILABLE', data: null } });
  const disconnected = controller({ readyState: 0, cached: { policy: activity.CACHE_POLICY } }); expect((await disconnected.run()).status).toBe(503); expect(disconnected.getCache).not.toHaveBeenCalled();
});
