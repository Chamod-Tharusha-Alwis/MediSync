'use strict';
// Synthetic demonstration data: tests for server/scripts/demo (docs/demo/SEED_DESIGN.md).
// No database and no network: the clean-up is exercised against a small in-process collection fake.
const plan = require('../scripts/demo/demoSeedPlan.cjs');
const store = require('../scripts/demo/demoStore.cjs');
const cli = require('../scripts/demo/demoCli.cjs');

const REF = '2026-11-17';
const bulk = plan.buildBulkPlan({ referenceDate: REF });
const icd = key => `ICD10:${plan.diseaseByKey.get(key).condition.icdCode.replace('.', '')}`;

function matches(doc, filter) {
  return Object.entries(filter).every(([k, cond]) => {
    const v = doc[k];
    if (cond && typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date) && !cond._bsontype && Object.keys(cond).some(x => x.startsWith('$'))) {
      if ('$regex' in cond && !(typeof v === 'string' && new RegExp(cond.$regex).test(v))) return false;
      if ('$in' in cond && !cond.$in.some(x => String(x) === String(v))) return false;
      if ('$ne' in cond && v === cond.$ne) return false;
      return true;
    }
    return String(v) === String(cond);
  });
}
function fakeDb(seed) {
  const data = Object.fromEntries(Object.entries(seed).map(([c, docs]) => [c, docs.map((d, i) => ({ _id: `${c}-${i}`, ...d }))]));
  const coll = name => ({
    find: filter => ({ toArray: async () => (data[name] || []).filter(d => matches(d, filter)) }),
    countDocuments: async (filter = {}) => (data[name] || []).filter(d => matches(d, filter)).length,
    deleteMany: async filter => { const before = (data[name] || []).length; data[name] = (data[name] || []).filter(d => !matches(d, filter)); return { deletedCount: before - data[name].length }; },
  });
  return { collection: coll, data };
}

describe('demo seed plan (synthetic demonstration data)', () => {
  test('dry-run plan is deterministic for the same seed and reference date', () => {
    const again = plan.buildBulkPlan({ referenceDate: REF });
    expect(again.digest).toBe(bulk.digest);
    expect(again.total).toBe(bulk.total);
    expect(plan.buildBulkPlan({ referenceDate: '2026-11-18' }).digest).not.toBe(bulk.digest);
  });

  test('two CLI dry runs print identical output and never connect', async () => {
    const capture = async () => {
      const lines = [], log = console.log;
      console.log = (...a) => lines.push(a.join(' '));
      try { await cli.runSeed('bulk', [`--reference-date=${REF}`]); } finally { console.log = log; }
      return lines.join('\n');
    };
    const first = await capture();
    expect(first).toContain('DRY RUN');
    expect(first).toContain(bulk.digest);
    expect(await capture()).toBe(first);
  });

  test('bulk volume, districts and diseases follow the design', () => {
    expect(bulk.total).toBeGreaterThanOrEqual(plan.BOUNDS.min);
    expect(bulk.total).toBeLessThanOrEqual(plan.BOUNDS.max);
    expect(Object.keys(bulk.byDistrict)).toHaveLength(25);
    expect(Object.keys(bulk.byDisease).sort()).toEqual(['dengue', 'diarrhoeal', 'influenza', 'leptospirosis', 'typhoid']);
    const last = Math.max(...bulk.rows.map(r => r.time));
    expect(last).toBeLessThan(plan.referenceMidnight(REF)); // nothing on or after the seed day
  });

  test('every consultation and parent document carries the existing batch flag', () => {
    const refs = { patients: new Map(), doctors: new Map(), hospitals: new Map() };
    for (const row of bulk.rows) {
      const d = store.consultationDocument(row, bulk, refs);
      expect(d.syntheticSeedBatch).toBe('viva-2026-11-outbreaks');
      expect(d.isSynthetic).toBe(true);
      expect(d.consultationId.startsWith(plan.DEMO_PREFIX)).toBe(true);
      expect(d.surveillanceVerification).toMatchObject({ status: 'verified', diagnosisStatus: 'confirmed', source: 'clinical_review' });
    }
    const parents = store.parentDocuments(bulk, 'hash');
    for (const list of Object.values(parents)) for (const p of list) expect(p.doc).toMatchObject({ syntheticSeedBatch: 'viva-2026-11-outbreaks', isSynthetic: true });
    expect(new Set(bulk.rows.map(r => r.consultationId)).size).toBe(bulk.total);
  });

  test('the detector admits the seed batch in real mode (existing mechanism, not a new flag)', () => {
    const { selectCases } = require('../src/services/surveillanceService');
    const row = bulk.rows[bulk.rows.length - 1];
    const doc = { _id: 'x', patientId: 'p', ...store.consultationDocument(row, bulk, { patients: new Map(), doctors: new Map(), hospitals: new Map() }) };
    doc.patientId = 'p1';
    const out = selectCases([doc], { mode: 'real', now: new Date(plan.referenceMidnight(REF) + 3600000) });
    expect(out.cases).toHaveLength(1);
    expect(out.cases[0].syntheticSeedBatch).toBe('viva-2026-11-outbreaks');
  });

  test('scenario expectations hold under the unchanged rule on seed day and the next day', () => {
    for (const day of ['2026-11-17', '2026-11-18']) {
      const r = plan.predictRule(bulk, { scanDate: day });
      const get = (district, disease) => r.find(x => x.district === district && x.disease === icd(disease));
      expect(get('Kurunegala', 'dengue').triggered).toBe(true);
      expect(get('Kegalle', 'leptospirosis').triggered).toBe(true);
      expect(get('Anuradhapura', 'influenza').triggered).toBe(false);
      const spike = get('Hambantota', 'typhoid');
      expect(spike.triggered).toBe(false);
      expect(spike.reason).toBe('PERSISTENCE_CRITERIA_NOT_MET');
      expect(spike.count).toBeGreaterThanOrEqual(5);
    }
  });

  test('live demo adds 30-40 dengue cases in one district over 5 days ending yesterday and is flagged', () => {
    const live = plan.buildLivePlan({ referenceDate: '2026-11-18' });
    expect(live.total).toBeGreaterThanOrEqual(30);
    expect(live.total).toBeLessThanOrEqual(40);
    expect(Object.keys(live.byDistrict)).toEqual(['Badulla']);
    expect(live.scenarios.LIVE).toMatchObject({ firstDate: '2026-11-13', lastDate: '2026-11-17', days: 5 });
    expect(plan.buildLivePlan({ referenceDate: '2026-11-18' }).digest).toBe(live.digest);
    const r = plan.predictRule(live, { scanDate: '2026-11-18', extraRows: plan.buildBulkPlan({ referenceDate: '2026-11-17' }).rows });
    expect(r.find(x => x.district === 'Badulla' && x.disease === icd('dengue')).triggered).toBe(true);
    expect(() => plan.buildLivePlan({ district: 'Kurunegala' })).toThrow(/SCENARIO_DISTRICT/);
    expect(() => plan.buildLivePlan({ district: 'Atlantis' })).toThrow(/UNKNOWN/);
  });

  test('--confirm without the dry-run digest is refused before any connection', async () => {
    const log = console.log; console.log = () => {};
    try { await expect(cli.runSeed('bulk', [`--reference-date=${REF}`, '--confirm'])).rejects.toThrow(/DIGEST_MISMATCH/); }
    finally { console.log = log; }
  });
});

describe('cleanDemo removes only this seed\'s flagged records', () => {
  const B = 'viva-2026-11-outbreaks';
  const seed = () => ({
    consultations: [
      { consultationId: `${plan.DEMO_PREFIX}20261117-000001`, syntheticSeedBatch: B, isSynthetic: true },
      { consultationId: `${plan.LIVE_PREFIX}BADULLA-20261118-000001`, syntheticSeedBatch: B, isSynthetic: true },
      { consultationId: `${B}-CON-0001`, syntheticSeedBatch: B, isSynthetic: true }, // other viva seeder
      { consultationId: 'REAL-1' },
    ],
    patients: [
      { nic: '999100000001', email: 'viva.demo.patient.0001@qa.medisync.local', syntheticSeedBatch: B, isSynthetic: true },
      { nic: '999000000001', email: 'viva.outbreak.patient.1@qa.medisync.local', syntheticSeedBatch: B, isSynthetic: true },
      { nic: '200000000001', email: 'real@example.invalid' },
    ],
    doctors: [{ doctorId: `${plan.DOCTOR_PREFIX}BADULLA`, syntheticSeedBatch: B, isSynthetic: true }, { doctorId: `${B}-DOC-01`, syntheticSeedBatch: B, isSynthetic: true }],
    hospitals: [{ regNo: `${plan.CLINIC_PREFIX}BADULLA`, syntheticSeedBatch: B, isSynthetic: true }, { regNo: 'VIVA-OUTBREAK-HOSP-01', syntheticSeedBatch: B, isSynthetic: true }],
    outbreakalerts: [
      { syntheticSeedBatch: B, sourceConsultationIds: ['consultations-0', 'consultations-1'] },
      { syntheticSeedBatch: B, sourceConsultationIds: ['consultations-0', 'consultations-2'] }, // mixed: left in place
      { sourceConsultationIds: ['consultations-3'] },
    ],
  });

  test('dry run deletes nothing; confirm deletes exactly the seed records', async () => {
    const db = fakeDb(seed());
    const dry = await store.cleanDemo(db, { confirm: false });
    expect(dry.matched).toEqual({ consultations: 2, patients: 1, doctors: 1, hospitals: 1, outbreakalerts: 1 });
    expect(db.data.consultations).toHaveLength(4);
    const res = await store.cleanDemo(db, { confirm: true });
    expect(res.deleted).toEqual(dry.matched);
    expect(res.unflaggedRemoved).toBe(0);
    expect(res.mixedAlertsLeft).toEqual(['outbreakalerts-1']);
    expect(db.data.consultations.map(d => d.consultationId)).toEqual([`${B}-CON-0001`, 'REAL-1']);
    expect(db.data.patients.map(d => d.nic)).toEqual(['999000000001', '200000000001']);
    expect(db.data.doctors).toHaveLength(1);
    expect(db.data.hospitals).toHaveLength(1);
    expect(db.data.outbreakalerts).toHaveLength(2);
  });

  test('aborts without deleting if a record with this seed\'s prefix lacks a flag', async () => {
    const s = seed();
    s.consultations.push({ consultationId: `${plan.DEMO_PREFIX}20261117-999999`, syntheticSeedBatch: B }); // isSynthetic missing
    const db = fakeDb(s);
    await expect(store.cleanDemo(db, { confirm: true })).rejects.toThrow(/SAFETY_ABORT/);
    expect(db.data.consultations).toHaveLength(5);
  });
});
