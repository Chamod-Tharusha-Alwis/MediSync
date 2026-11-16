'use strict';
/**
 * server/scripts/demo/demoSeedPlan.cjs
 *
 * Synthetic demonstration data for the viva outbreak demo (see docs/demo/SEED_DESIGN.md).
 * Pure and deterministic: builds the plan in memory, never touches a database. Every record is
 * labelled with the existing seed batch the detector admits (viva-2026-11-outbreaks). The dengue
 * season is synthetic, shaped from public weekly counts (dengue_weekly_shape.json).
 */
const crypto = require('crypto');
const path = require('path');
const { DISTRICTS, CONDITIONS } = require('../../../scripts/seedVivaPlan.cjs');
const DENGUE_SHAPE = require('./dengue_weekly_shape.json');

const BATCH_TAG = 'viva-2026-11-outbreaks'; // surveillanceService VIVA_DEMO_SEED_BATCH
const DEMO_PREFIX = `${BATCH_TAG}-DEMO-`;
const LIVE_PREFIX = `${DEMO_PREFIX}LIVE-`;
const PATIENT_NIC_PREFIX = '9991';
const DOCTOR_PREFIX = `${DEMO_PREFIX}DOC-`;
const CLINIC_PREFIX = 'VIVA-DEMO-CLINIC-';
const PATIENT_EMAIL_PREFIX = 'viva.demo.patient.';
const SEED = 20261118;
const LABEL = 'synthetic demonstration data';
const DAY_MS = 86400000;
const COLOMBO_OFFSET_MS = 330 * 60000;
const HISTORY_DAYS = 365;
const PATIENTS_PER_WEIGHT_UNIT = 6; // DISTRICTS weights sum to 100 -> 600 patients
const DISPERSION = 10;
const BOUNDS = Object.freeze({ min: 20000, max: 40000 });
const STORAGE_CAP_MB = 120;
const ATLAS_FREE_TIER_MB = 512;

const DISEASES = Object.freeze([
  { key: 'dengue', condition: CONDITIONS.DENGUE, annual: 12000, season: 'opendengue' },
  { key: 'influenza', condition: CONDITIONS.INFLUENZA, annual: 7500, season: { amplitude: 0.15, peakWeek: 2 } },
  { key: 'diarrhoeal', condition: CONDITIONS.DIARRHOEAL, annual: 6000, season: { amplitude: 0.15, peakWeek: 20 } },
  { key: 'leptospirosis', condition: CONDITIONS.LEPTOSPIROSIS, annual: 3000, season: { amplitude: 0.15, peakWeek: 44 } },
  { key: 'typhoid', condition: CONDITIONS.TYPHOID, annual: 1500, season: { amplitude: 0.15, peakWeek: 30 } },
]);
// Mon..Sun, rescaled below so the week averages 1.0.
const WEEKDAY_RAW = [1.25, 1.15, 1.10, 1.05, 1.00, 0.85, 0.60];
const WEEKDAY = WEEKDAY_RAW.map(v => v * 7 / WEEKDAY_RAW.reduce((a, b) => a + b, 0));

const SCENARIOS = Object.freeze([
  { id: 'A', name: 'Clear outbreak A', district: 'Kurunegala', disease: 'dengue', kind: 'spike',
    added: { 5: 4, 4: 6, 3: 9, 2: 11, 1: 12 }, expected: 'Pending alert (rule flags; persistence met)' },
  { id: 'B', name: 'Clear outbreak B', district: 'Kegalle', disease: 'leptospirosis', kind: 'spike',
    added: { 4: 3, 3: 4, 2: 5, 1: 4 }, expected: 'Pending alert (rule flags; persistence met)' },
  { id: 'C', name: 'Slow rise', district: 'Anuradhapura', disease: 'influenza', kind: 'ramp',
    rampDays: 63, expected: 'No alert (rule expected to miss a gradual rise)' },
  { id: 'D', name: 'Noise spike', district: 'Hambantota', disease: 'typhoid', kind: 'spike',
    added: { 2: 8 }, expected: 'No alert (persistence guard suppresses a one-day spike)' },
]);
const LIVE = Object.freeze({ disease: 'dengue', defaultDistrict: 'Badulla', added: { 5: 4, 4: 6, 3: 8, 2: 9, 1: 9 } });
const SCENARIO_DISTRICTS = new Set(SCENARIOS.map(s => s.district));

const districtCode = name => name.replace(/\s+/g, '').toUpperCase();
const districtByName = new Map(DISTRICTS.map(d => [d.canonical, d]));
const diseaseByKey = new Map(DISEASES.map(d => [d.key, d]));

// ------------------------------------------------------------------ deterministic random numbers
function rngFor(...parts) {
  const digest = crypto.createHash('sha256').update([SEED, ...parts].join('|')).digest();
  let a = digest.readUInt32LE(0);
  return () => { // mulberry32
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normal(rand) {
  const u = Math.max(rand(), 1e-12), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function gamma(rand, shape) { // Marsaglia-Tsang, shape >= 1
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = normal(rand); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rand();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
function poisson(rand, lambda) { // Knuth; lambdas here stay well below 50
  if (lambda <= 0) return 0;
  const limit = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rand(); } while (p > limit);
  return k - 1;
}
function gammaPoisson(rand, mean) {
  return mean <= 0 ? 0 : poisson(rand, gamma(rand, DISPERSION) * mean / DISPERSION);
}

// ------------------------------------------------------------------ calendar (Asia/Colombo)
function referenceMidnight(referenceDate) {
  if (typeof referenceDate === 'string') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) throw new Error('REFERENCE_DATE_FORMAT (YYYY-MM-DD)');
    const [y, m, d] = referenceDate.split('-').map(Number);
    return Date.UTC(y, m - 1, d) - COLOMBO_OFFSET_MS;
  }
  const local = new Date(+new Date(referenceDate) + COLOMBO_OFFSET_MS);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - COLOMBO_OFFSET_MS;
}
function localDate(midnightUtc) { return new Date(midnightUtc + COLOMBO_OFFSET_MS); }
function isoDate(midnightUtc) { return localDate(midnightUtc).toISOString().slice(0, 10); }
function isoWeek(midnightUtc) {
  const d = localDate(midnightUtc);
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return { year: thursday.getUTCFullYear(), week: Math.ceil(((thursday - yearStart) / DAY_MS + 1) / 7), weekday: day };
}
function seasonFactor(disease, week) {
  const w = Math.min(week, 52);
  if (disease.season === 'opendengue') return DENGUE_SHAPE.isoWeekShape[w - 1];
  return 1 + disease.season.amplitude * Math.cos(2 * Math.PI * (w - disease.season.peakWeek) / 52);
}

// ------------------------------------------------------------------ identities (synthetic only)
function buildIdentities() {
  const patients = [], byDistrict = new Map();
  let n = 0;
  for (const d of DISTRICTS) {
    const list = [];
    for (let i = 0; i < d.weight * PATIENTS_PER_WEIGHT_UNIT; i++) {
      n++;
      const tag = String(n).padStart(4, '0');
      const p = { index: n, nic: `${PATIENT_NIC_PREFIX}${String(n).padStart(8, '0')}`, fullName: `Synthetic Surveillance Subject ${tag}`,
        email: `${PATIENT_EMAIL_PREFIX}${tag}@qa.medisync.local`, district: d.canonical };
      patients.push(p); list.push(p);
    }
    byDistrict.set(d.canonical, list);
  }
  const clinics = DISTRICTS.map(d => ({ regNo: `${CLINIC_PREFIX}${districtCode(d.canonical)}`, name: `Synthetic Demo Clinic ${d.canonical}`,
    district: d.canonical, email: `viva.demo.clinic.${districtCode(d.canonical).toLowerCase()}@qa.medisync.local` }));
  const doctors = DISTRICTS.map(d => ({ doctorId: `${DOCTOR_PREFIX}${districtCode(d.canonical)}`, fullName: `Synthetic Demo Doctor ${d.canonical}`,
    district: d.canonical, licenseNo: `SYNTH-DEMO-${districtCode(d.canonical)}`, clinicRegNo: `${CLINIC_PREFIX}${districtCode(d.canonical)}`,
    email: `viva.demo.doctor.${districtCode(d.canonical).toLowerCase()}@qa.medisync.local` }));
  return { patients, byDistrict, clinics, doctors };
}

// ------------------------------------------------------------------ plan
function caseRow({ rand, midnight, district, disease, scenario, idPrefix, seq, identities }) {
  const pool = identities.byDistrict.get(district);
  const patient = pool[Math.floor(rand() * pool.length)];
  const minutes = 8 * 60 + Math.floor(rand() * 9 * 60); // 08:00-17:00 Colombo
  return { consultationId: `${idPrefix}${String(seq).padStart(6, '0')}`, time: midnight + minutes * 60000, date: isoDate(midnight),
    district, disease, scenario, patientIndex: patient.index };
}

function buildBulkPlan({ referenceDate = new Date() } = {}) {
  const D = referenceMidnight(referenceDate);
  const ref = isoDate(D);
  const identities = buildIdentities();
  const idPrefix = `${DEMO_PREFIX}${ref.replace(/-/g, '')}-`;
  const rows = [];
  let seq = 0;
  const ramp = new Map(SCENARIOS.filter(s => s.kind === 'ramp').map(s => [`${s.district}|${s.disease}`, s]));
  for (let ago = HISTORY_DAYS; ago >= 1; ago--) {
    const midnight = D - ago * DAY_MS, date = isoDate(midnight), wk = isoWeek(midnight);
    for (const district of DISTRICTS) {
      for (const disease of DISEASES) {
        let mean = disease.annual * (district.weight / 100) * seasonFactor(disease, wk.week) * WEEKDAY[wk.weekday] / 365;
        const r = ramp.get(`${district.canonical}|${disease.key}`);
        let scenario = 'background';
        if (r && ago <= r.rampDays) { mean *= 1 + (r.rampDays - ago) / (r.rampDays - 1); scenario = r.id; }
        const rand = rngFor('bulk', date, district.canonical, disease.key);
        const count = gammaPoisson(rand, mean);
        for (let i = 0; i < count; i++) rows.push(caseRow({ rand, midnight, district: district.canonical, disease: disease.key, scenario, idPrefix, seq: ++seq, identities }));
      }
    }
  }
  for (const s of SCENARIOS.filter(x => x.kind === 'spike')) {
    for (const [ago, n] of Object.entries(s.added)) {
      const midnight = D - Number(ago) * DAY_MS;
      const rand = rngFor('scenario', s.id, isoDate(midnight));
      for (let i = 0; i < n; i++) rows.push(caseRow({ rand, midnight, district: s.district, disease: s.disease, scenario: s.id, idPrefix, seq: ++seq, identities }));
    }
  }
  return finalisePlan({ kind: 'bulk', referenceDate: ref, referenceMidnight: D, rows, identities });
}

function buildLivePlan({ referenceDate = new Date(), district = LIVE.defaultDistrict } = {}) {
  if (!districtByName.has(district)) throw new Error(`LIVE_DISTRICT_UNKNOWN: ${district}`);
  if (SCENARIO_DISTRICTS.has(district)) throw new Error(`LIVE_DISTRICT_IS_A_SCENARIO_DISTRICT: ${district}`);
  const D = referenceMidnight(referenceDate);
  const ref = isoDate(D);
  const identities = buildIdentities();
  const idPrefix = `${LIVE_PREFIX}${districtCode(district)}-${ref.replace(/-/g, '')}-`;
  const rows = [];
  let seq = 0;
  for (const [ago, n] of Object.entries(LIVE.added).sort((a, b) => b[0] - a[0])) {
    const midnight = D - Number(ago) * DAY_MS;
    const rand = rngFor('live', district, isoDate(midnight));
    for (let i = 0; i < n; i++) rows.push(caseRow({ rand, midnight, district, disease: LIVE.disease, scenario: 'LIVE', idPrefix, seq: ++seq, identities }));
  }
  return finalisePlan({ kind: 'live', referenceDate: ref, referenceMidnight: D, rows, identities, district });
}

function finalisePlan(plan) {
  const byDisease = {}, byDistrict = {}, byScenario = {}, manifest = {};
  for (const r of plan.rows) {
    byDisease[r.disease] = (byDisease[r.disease] || 0) + 1;
    byDistrict[r.district] = (byDistrict[r.district] || 0) + 1;
    const s = byScenario[r.scenario] || (byScenario[r.scenario] = { count: 0, districts: new Set(), dates: new Set() });
    s.count++; s.districts.add(r.district); s.dates.add(r.date);
    const wk = isoWeek(r.time - ((r.time + COLOMBO_OFFSET_MS) % DAY_MS)); // ISO week of the case's Colombo day
    const key = `${wk.year}-W${String(wk.week).padStart(2, '0')}`;
    ((manifest[r.district] ||= {})[r.disease] ||= {})[key] = (manifest[r.district][r.disease][key] || 0) + 1;
  }
  const scenarios = Object.fromEntries(Object.entries(byScenario).sort().map(([k, v]) => [k, { count: v.count,
    districts: [...v.districts].sort(), firstDate: [...v.dates].sort()[0], lastDate: [...v.dates].sort().slice(-1)[0], days: v.dates.size }]));
  const digest = crypto.createHash('sha256').update(JSON.stringify(plan.rows)).digest('hex');
  return { ...plan, label: LABEL, batchTag: BATCH_TAG, seed: SEED, total: plan.rows.length, byDisease, byDistrict, scenarios, manifest, digest };
}

// Pure check of the plan against the unchanged rule (evaluateOutbreakCriteria), for the dry run.
function predictRule(plan, { scanDate, extraRows = [] } = {}) {
  const { evaluateOutbreakCriteria } = require('../../src/services/surveillanceService');
  const now = new Date(referenceMidnight(scanDate || plan.referenceDate) + 12 * 3600000);
  const cases = [...plan.rows, ...extraRows].filter(r => r.time >= +now - 63 * DAY_MS && r.time <= +now)
    .map(r => ({ district: r.district, diseaseId: `ICD10:${diseaseByKey.get(r.disease).condition.icdCode.replace('.', '')}`, time: r.time }));
  return evaluateOutbreakCriteria({ cases, now, baselineDays: 56, level: 'district' })
    .map(r => ({ district: r.district, disease: r.disease, triggered: r.triggered, reason: r.reason || null, count: r.count,
      maxZ: Number.isFinite(r.maxZ) ? Number(r.maxZ.toFixed(2)) : r.maxZ, maxConsecutiveDays: r.maxConsecutiveDays, severity: r.severity, dailyCounts: r.dailyCounts }));
}

module.exports = {
  BATCH_TAG, DEMO_PREFIX, LIVE_PREFIX, PATIENT_NIC_PREFIX, DOCTOR_PREFIX, CLINIC_PREFIX, PATIENT_EMAIL_PREFIX,
  SEED, LABEL, BOUNDS, STORAGE_CAP_MB, ATLAS_FREE_TIER_MB, DISEASES, SCENARIOS, LIVE, DAY_MS,
  districtCode, diseaseByKey, referenceMidnight, isoDate, isoWeek, buildIdentities, buildBulkPlan, buildLivePlan, predictRule,
  DENGUE_SHAPE_SOURCE: DENGUE_SHAPE.source, SHAPE_PATH: path.join(__dirname, 'dengue_weekly_shape.json'),
};
