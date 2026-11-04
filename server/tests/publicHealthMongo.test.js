'use strict';
const reporting = require('../src/services/publicHealthStats');
const { healthDto } = require('../src/security/publicDto');
const { controllerHarness } = require('./helpers/phase5xD5InertHarness');
const now = new Date('2026-11-04T12:00:00.000Z');

function clinical(n = 1, overrides = {}) {
  return {
    _id: String(n).padStart(24, '0'), patientId: String(n + 1000).padStart(24, '0'),
    createdAt: new Date('2026-11-03T10:00:00Z'), district: 'Colombo', icdCode: 'A90', icdVersion: 'ICD-10',
    surveillanceVerification: { status: 'verified', source: 'clinical_review', diagnosisStatus: 'confirmed',
      verifiedBy: 'reviewer-offline', verifiedAt: new Date('2026-11-03T11:00:00Z'), episodeId: 'episode-' + n,
      caseDefinitionReference: 'reviewed-reference-v1' },
    ...overrides
  };
}
function inertCollection(documents) {
  const toArray = jest.fn(async () => documents);
  const close = jest.fn(async () => {});
  return { find: jest.fn(() => ({ toArray, close })), toArray, close };
}
function controller({ rows = [], cached = null, readyState = 1, failure } = {}) {
  const collection = inertCollection(rows), getCache = jest.fn(async () => cached), setCache = jest.fn(async () => true);
  if (failure) collection.toArray.mockRejectedValue(failure);
  const ml = { get: jest.fn(), post: jest.fn() }, generateToken = jest.fn();
  const h = controllerHarness('publicController', { dependencies: {
    '../security/publicDto': require('../src/security/publicDto'),
    '../services/publicHealthStats': reporting,
    '../models/Consultation': { collection },
    mongoose: { connection: { readyState } },
    '../config/redis': { getCache, setCache }, axios: ml,
    '../utils/internalAuth': { generateToken }, '../config/dbGuard': { isAutomatedTestEnvironment: () => false }
  } });
  return { collection, getCache, setCache, ml, generateToken, run: query => h.invoke('getHealthStats', { query: query || {} }) };
}

test('real-only metadata reporting produces the public DTO without private fields', async () => {
  const rows = Array.from({ length: 6 }, (_, n) => clinical(n + 1, { diagnosis: 'PRIVATE_CIPHERTEXT', notes: 'PRIVATE_NOTE', patientNic: 'PRIVATE_ID' }));
  const collection = inertCollection(rows);
  const result = await reporting.loadPublicHealthStats(collection, { connection: { readyState: 1 }, now });
  expect(healthDto(result)).toEqual({ totalCases: 6, byDistrict: [{ district: 'Colombo', totalCases: 6, topDisease: 'Dengue' }], byDisease: [{ disease: 'Dengue', totalCases: 6 }], trend: expect.any(Array) });
  expect(result.trend).toHaveLength(30); expect(result.trend.filter(day => day.count > 0)).toEqual([{ date: '2026-11-03', count: 6 }]);
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE|patient|episode|reviewer/);
  const [query, options] = collection.find.mock.calls[0];
  expect(query.isSimulatedDemo).toEqual({ $in: [false, null] });
  expect(query.demoBatchId).toEqual({ $exists: false });
  expect(options).toMatchObject({ limit: reporting.MAX_REPORTING_ROWS + 1, maxTimeMS: reporting.MAX_TIME_MS });
  expect(Object.keys(options.projection)).not.toEqual(expect.arrayContaining(['diagnosis', 'notes', 'patientNic']));
  expect(options.projection).not.toHaveProperty('surveillanceVerification');
  expect(options.projection['surveillanceVerification.status']).toBe(1);
  expect(options.projection['surveillanceVerification.episodeId']).toBe(1);
  expect(Object.keys(options.projection).filter(key => key.startsWith('surveillanceVerification.')).sort()).toEqual(['caseDefinitionReference','diagnosisStatus','episodeId','source','status','verifiedAt','verifiedBy'].map(key=>'surveillanceVerification.'+key).sort());
  expect(collection.close).toHaveBeenCalledTimes(1);
});

test.each(reporting.SYNTHETIC_FLAGS)('real reporting excludes %s even if a boundary adapter ignores the database predicate', marker => {
  expect(reporting.aggregatePublicCases([clinical(1), clinical(2, { [marker]: true })], { now }).totalCases).toBe(1);
});
test.each(reporting.SYNTHETIC_MARKERS)('real reporting excludes marker-only provenance %s', marker => {
  expect(reporting.aggregatePublicCases([clinical(1), clinical(2, { [marker]: 'owned-synthetic' })], { now }).totalCases).toBe(1);
});
test('an internal simulation selection requires one exact batch and cannot mix real or other batches', () => {
  const rows = [clinical(1), clinical(2, { isSimulatedDemo: true, demoBatchId: 'BATCH_A', surveillanceVerification: { ...clinical().surveillanceVerification, source: 'synthetic_qa', episodeId: 'synthetic-2' } }),
    clinical(3, { isSimulatedDemo: true, demoBatchId: 'BATCH_B', surveillanceVerification: { ...clinical().surveillanceVerification, source: 'synthetic_qa' } })];
  expect(reporting.aggregatePublicCases(rows, { now, mode: 'simulation', batchId: 'BATCH_A' })).toMatchObject({ totalCases: 1, isSimulatedDemo: true });
  expect(reporting.aggregatePublicCases(rows, { now }).totalCases).toBe(1);
  expect(() => reporting.aggregatePublicCases(rows, { now, mode: 'simulation' })).toThrow();
  expect(() => reporting.aggregatePublicCases(rows, { now, batchId: 'BATCH_A' })).toThrow();
});
test('repeated patient+ICD+episode visits count once while distinct episodes and patients remain separate', () => {
  const first = clinical(1), repeated = { ...first, _id: '2'.repeat(24), createdAt: new Date('2026-11-04T09:00Z') };
  const secondEpisode = { ...first, _id: '3'.repeat(24), surveillanceVerification: { ...first.surveillanceVerification, episodeId: 'different-episode' } };
  const anotherPatient = { ...first, _id: '4'.repeat(24), patientId: '5'.repeat(24) };
  const result = reporting.aggregatePublicCases([repeated, first, secondEpisode, anotherPatient], { now });
  expect(result.totalCases).toBe(3); expect(result.trend.filter(day => day.count > 0)).toEqual([{ date: '2026-11-03', count: 3 }]);
});
test.each([1, 30, 90, 365])('%i-day reporting uses aligned UTC day boundaries and excludes future or prior-day records', rangeDays => {
  const { start, end } = reporting.reportingWindow(rangeDays, now);
  expect(start.getUTCHours()).toBe(0); expect(end).toEqual(now);
  const rows = [clinical(1, { createdAt: start }), clinical(2, { createdAt: new Date(+start - 1) }), clinical(3, { createdAt: new Date(+now + 1) })];
  expect(reporting.aggregatePublicCases(rows, { now, rangeDays }).totalCases).toBe(1);
});
test('district suppression retains the existing under-five boundary without changing national totals', () => {
  const rows = Array.from({ length: 9 }, (_, n) => clinical(n + 1, { district: n < 5 ? 'Colombo' : 'Kandy' }));
  const result = reporting.aggregatePublicCases(rows, { now });
  expect(result.totalCases).toBe(9); expect(result.byDistrict).toHaveLength(1); expect(result.byDistrict[0].totalCases).toBe(5);
  expect(result.byDisease[0].totalCases).toBe(9);
});
test('district and canonical disease filters select actual case metadata only', () => {
  const rows = [clinical(1), clinical(2, { district: 'Kandy' }), clinical(3, { icdCode: 'J10.1' })];
  expect(reporting.aggregatePublicCases(rows, { now, district: 'Colombo', disease: 'ICD10:A90' }).totalCases).toBe(1);
  expect(reporting.aggregatePublicCases(rows, { now, disease: 'ICD10:J101' }).totalCases).toBe(1);
});
test('explicit pending or unconfirmed reviews do not become confirmed cases', () => {
  const rows = [clinical(1), clinical(2, { surveillanceVerification: { status: 'pending' } }), clinical(3, { surveillanceVerification: { status: 'verified', diagnosisStatus: 'suspected' } })];
  expect(reporting.aggregatePublicCases(rows, { now }).totalCases).toBe(1);
});
test.each([
  { surveillanceVerification: undefined }, { surveillanceVerification: {} }, { surveillanceVerification: [] },
  { surveillanceVerification: { status: 'unknown' } }, { surveillanceVerification: { status: 1 } },
  { surveillanceVerification: { status: 'verified', diagnosisStatus: 'unknown' } },
  { surveillanceVerification: { status: 'verified', diagnosisStatus: [] } },
  { surveillanceVerification: { ...clinical().surveillanceVerification, source: 'synthetic_qa' } },
  { surveillanceVerification: { ...clinical().surveillanceVerification, verifiedBy: null } },
  { surveillanceVerification: { ...clinical().surveillanceVerification, episodeId: '' } },
  { surveillanceVerification: { ...clinical().surveillanceVerification, verifiedAt: new Date('invalid') } },
  { surveillanceVerification: { ...clinical().surveillanceVerification, verifiedAt: new Date(+now + 1) } },
  { createdAt: 'not-a-date' }, { patientId: null }, { district: 'Unknown' }, { icdVersion: 'unreviewed' }
])('malformed/unverifiable real metadata fails unavailable instead of inventing zero %#', change => {
  expect(() => reporting.aggregatePublicCases([clinical(1, change)], { now })).toThrow('PUBLIC_REPORTING_SOURCE_UNVERIFIED');
});
test('an empty completed source read is a genuine zero count with observed UTC calendar buckets', async () => {
  const collection = inertCollection([]);
  const result = await reporting.loadPublicHealthStats(collection, { connection: { readyState: 1 }, now });
  expect(result).toMatchObject({ totalCases: 0, byDistrict: [], byDisease: [] });
  expect(result.trend).toHaveLength(30); expect(result.trend.every(day => day.count === 0)).toBe(true);
  expect(collection.find).toHaveBeenCalledTimes(1);
});
test('unavailable, oversized and malformed read results never become empty success', async () => {
  const unavailable = inertCollection([]);
  await expect(reporting.loadPublicHealthStats(unavailable, { connection: { readyState: 0 }, now })).rejects.toThrow();
  expect(unavailable.find).not.toHaveBeenCalled();
  for (const result of [undefined, {}, [null], Array(reporting.MAX_REPORTING_ROWS + 1).fill(clinical())]) {
    await expect(reporting.loadPublicHealthStats(inertCollection(result), { connection: { readyState: 1 }, now })).rejects.toThrow();
  }
  const failure = inertCollection([]); failure.toArray.mockRejectedValue(Error('PRIVATE_DB_FAILURE'));
  await expect(reporting.loadPublicHealthStats(failure, { connection: { readyState: 1 }, now })).rejects.toThrow();
  expect(failure.close).toHaveBeenCalledTimes(1);
});
test('actual public controller computes Mongo DTO/forecast and cannot dispatch ML, HMAC, providers or DDL', async () => {
  const rows = Array.from({ length: 6 }, (_, n) => clinical(n + 1, { createdAt: new Date(Date.now() - 3600000), surveillanceVerification: { ...clinical(n + 1).surveillanceVerification, verifiedAt: new Date(Date.now() - 1000) } }));
  const h = controller({ rows }), result = await h.run();
  expect(result.status).toBe(200); expect(result.body.data.totalCases).toBe(6); expect(result.body.data.forecast).toEqual([]);
  expect(result.body.data).not.toHaveProperty('isSimulatedDemo'); expect(h.collection.find).toHaveBeenCalledTimes(1);
  expect(h.ml.get).not.toHaveBeenCalled(); expect(h.ml.post).not.toHaveBeenCalled(); expect(h.generateToken).not.toHaveBeenCalled();
  expect(h.getCache.mock.calls[0][0]).toMatch(/^medisync:cache:health-stats:real-v1:/);
  expect(h.setCache.mock.calls[0]).toEqual([h.getCache.mock.calls[0][0], { policy: reporting.CACHE_POLICY, mode: 'real', data: result.body.data }, 300]);
});
test('old mixed cache values and mislabeled new cache data are ignored, never flushed', async () => {
  for (const cached of [{ totalCases: 999, isSimulatedDemo: true }, { policy: reporting.CACHE_POLICY, mode: 'simulation', data: { totalCases: 999 } }, { policy: reporting.CACHE_POLICY, mode: 'real', data: { totalCases: 999, isSimulatedDemo: true } }]) {
    const h = controller({ cached }), result = await h.run();
    expect(result.status).toBe(200); expect(result.body.data.totalCases).toBe(0); expect(result.body.cached).toBe(false); expect(h.collection.find).toHaveBeenCalledTimes(1);
    expect(h.getCache.mock.calls.every(([key]) => key.startsWith('medisync:cache:health-stats:real-v1:'))).toBe(true);
  }
});
test('validated real-source cached DTO is projected and cannot expose nested private metadata', async () => {
  const cached = { policy: reporting.CACHE_POLICY, mode: 'real', data: { totalCases: 0, byDistrict: [], byDisease: [], trend: [], password: 'PRIVATE_CACHE' } };
  const h = controller({ cached }), result = await h.run();
  expect(result.status).toBe(200); expect(result.body.cached).toBe(true); expect(JSON.stringify(result.body)).not.toContain('PRIVATE'); expect(h.collection.find).not.toHaveBeenCalled();
});
test.each([{ mode: 'simulation' }, { demoBatchId: 'BATCH_A' }, { rangeDays: 0 }, { rangeDays: 366 }, { rangeDays: {} }, { district: { $ne: null } }, { disease: ['A90'] }])('public filter rejects malformed or simulation opt-in before reads %#', async query => {
  const h = controller(), result = await h.run(query);
  expect(result.status).toBe(400); expect(result.body.error).toBe('INVALID_HEALTH_FILTER'); expect(h.collection.find).not.toHaveBeenCalled(); expect(h.getCache).not.toHaveBeenCalled();
});
test('controller fails closed on disconnected Mongo even when a real-looking cache exists', async () => {
  const h = controller({ readyState: 0, cached: { policy: reporting.CACHE_POLICY, mode: 'real', data: { totalCases: 0, byDistrict: [], byDisease: [], trend: [] } } });
  const result = await h.run(); expect(result.status).toBe(503); expect(result.body.data).toBeNull(); expect(h.getCache).not.toHaveBeenCalled();
});
test('actual source failure returns sanitized 503 and circuit hold prevents repeated dependency calls', async () => {
  const h = controller({ failure: Error('PRIVATE_PROVIDER_OR_DATABASE_DETAILS') });
  for (let n = 0; n < 3; n++) {
    const result = await h.run(); expect(result.status).toBe(503); expect(result.body).toEqual({ error: 'PUBLIC_HEALTH_UNAVAILABLE', message: 'Health statistics are temporarily unavailable.', data: null }); expect(JSON.stringify(result.body)).not.toContain('PRIVATE');
  }
  expect(h.collection.find).toHaveBeenCalledTimes(1); expect(h.setCache).not.toHaveBeenCalled();
});

test.each([
  ['Dengue', 'A90'], ['Leptospirosis', 'A27.9'], ['Diarrhoeal disease', 'A09'],
  ['Influenza', 'J10.1'], ['Chikungunya', 'A92.0'], ['COVID-19', 'U07.1']
])('existing human DiseaseCombobox value %s selects the actual canonical case', (disease, icdCode) => {
  const result = reporting.aggregatePublicCases([clinical(1, { icdCode })], { now, disease });
  expect(result.totalCases).toBe(1); expect(result.byDisease).toEqual([{ disease, totalCases: 1 }]);
});
test('other labels come from the verified packaged catalog; unknown or ambiguous codes use canonical fallback', () => {
  expect(reporting.diseaseLabel('ICD10:A000')).toBe('Cholera due to Vibrio cholerae 01, biovar cholerae');
  expect(reporting.diseaseLabel('ICD10:A00')).toBe('ICD10:A00');
  expect(reporting.diseaseLabel('ICD11:1D20')).toBe('Dengue');
  expect(reporting.diseaseLabel('ICD11:1C62')).toBe('ICD11:1C62');
  expect(reporting.diseaseLabel('ICD10:Z9999')).toBe('ICD10:Z9999');
});
test('equal-time repeated-episode district attribution is deterministic rather than database iteration order', () => {
  const rows = [];
  for (let n = 1; n <= 5; n++) {
    const first = clinical(n);
    rows.push(first, { ...first, _id: String(n + 100).padStart(24, '0'), district: 'Kandy' });
  }
  const a = reporting.aggregatePublicCases(rows, { now, district: 'Colombo' });
  const b = reporting.aggregatePublicCases([...rows].reverse(), { now, district: 'Colombo' });
  expect(a).toEqual(b); expect(a.totalCases).toBe(5); expect(JSON.stringify(a)).not.toMatch(/patientId|consultation|episode/);
});
test('sparse trusted history preserves elapsed UTC days including leap/month boundaries', () => {
  const at = new Date('2024-03-02T12:00Z');
  const rowA = clinical(1, { createdAt: new Date('2024-02-28T12:00Z'), surveillanceVerification: { ...clinical().surveillanceVerification, verifiedAt: at } });
  const rowB = clinical(2, { createdAt: new Date('2024-03-02T10:00Z'), surveillanceVerification: { ...clinical().surveillanceVerification, verifiedAt: at } });
  const result = reporting.aggregatePublicCases([rowA, rowB], { now: at, rangeDays: 4 });
  expect(result.trend).toEqual([{ date: '2024-02-28', count: 1 }, { date: '2024-02-29', count: 0 }, { date: '2024-03-01', count: 0 }, { date: '2024-03-02', count: 1 }]);
});
