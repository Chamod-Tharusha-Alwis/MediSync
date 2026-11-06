'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  NAMESPACE, PASSWORD_PLACEHOLDER, FULL_COUNTS, COMPACT_COUNTS,
  candidatePatientNics, objectId, readCommonDrugs, buildSeedPlatformPlan
} = require('../../scripts/seedPlatformPlan.cjs');
const { isPrescribableDrug } = require('../src/utils/ingredientResolver');

const NOW = '2026-11-06T07:30:00.000Z';
test('candidate pool supports bounded collision skipping beyond the cohort size', () => {
  const pool=candidatePatientNics(10000);
  expect(pool.length).toBe(10000);
  expect(new Set(pool).size===pool.length).toBe(true);
  expect(()=>candidatePatientNics(10001)).toThrow('SEED_PLAN_INPUT_INVALID');
});
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
let full, compact;
beforeAll(() => {
  full = buildSeedPlatformPlan({ now: NOW });
  compact = buildSeedPlatformPlan({ now: NOW, compact: true });
});

test('full plan preserves requested collection budgets without generating alerts or inventory', () => {
  expect(full.counts).toEqual(FULL_COUNTS);
  expect(full.totalDocuments).toBe(12907);
  expect(Object.keys(full.counts).length).toBe(9);
  expect(full.records.some(row => /Outbreak|Inventory|Notification|Audit/.test(row.model))).toBe(false);
});

test('compact factory uses its explicit bounded budgets and does not qualify scenario outcomes', () => {
  expect(compact.counts).toEqual(COMPACT_COUNTS);
  expect(compact.totalDocuments).toBe(109);
  expect(Object.keys(compact.scenarioSummary)).toEqual(['COMPACT_FIXTURE_ONLY']);
});

test('identical fixed inputs yield identical plans and deterministic IDs', () => {
  const another = buildSeedPlatformPlan({ now: NOW });
  expect(digest(another) === digest(full)).toBe(true);
  expect(objectId('Patient', 0) === objectId('Patient', 0)).toBe(true);
  expect(objectId('Patient', 0) === objectId('Doctor', 0)).toBe(false);
});

test('every registry row binds one unique deterministic ID and exact unencrypted ownership prefix', () => {
  expect(new Set(full.registry.map(row => row.id)).size).toBe(full.totalDocuments);
  expect(full.registry.every((row, i) => {
    const record = full.records[i];
    return /^[a-f0-9]{24}$/.test(row.id) && record.id === row.id && record.document._id === row.id &&
      record.document[row.prefix.field] === row.prefix.value && /^seed[-_]/i.test(row.prefix.value);
  })).toBe(true);
});

test('all generated account addresses are non-deliverable and require a runtime unusable hash', () => {
  const accounts = full.records.filter(row => ['Patient', 'Doctor', 'Hospital', 'PharmacyStaff'].includes(row.model));
  expect(accounts.every(row => row.document.email.endsWith('@accounts.invalid') && row.document.email === row.document.email.toLowerCase())).toBe(true);
  expect(accounts.every(row => row.document.password === PASSWORD_PLACEHOLDER)).toBe(true);
  expect(full.requiresRuntimePasswordHash).toBe(true);
  expect(full.records.every(row => row.metadata.syntheticSeedBatch === NAMESPACE && row.metadata.isSynthetic === true && row.metadata.isDemoData === true)).toBe(true);
});

test('consultation provenance stays separate for controlled append after canonical model encryption', () => {
  const consultations = full.records.filter(row => row.model === 'Consultation');
  expect(consultations.every(row => !Object.hasOwn(row.document, 'surveillanceVerification') && row.metadata.isSimulation === true &&
    row.metadata.surveillanceVerification.source === 'synthetic_qa' && row.metadata.surveillanceVerification.status === 'verified' &&
    row.metadata.surveillanceVerification.diagnosisStatus === 'confirmed' &&
    row.metadata.surveillanceVerification.verifiedBy === row.document.doctorId &&
    row.metadata.surveillanceVerification.episodeId === row.document.consultationId &&
    +row.metadata.surveillanceVerification.verifiedAt === +new Date(NOW))).toBe(true);
  expect(new Set(consultations.map(row => row.metadata.surveillanceVerification.episodeId)).size).toBe(FULL_COUNTS.Consultation);
});

test('eighteen conditions match the packaged ICD references and absent COVID code is excluded', () => {
  expect(full.conditions.length).toBe(18);
  expect(new Set(full.records.filter(row => row.model === 'Consultation').map(row => row.document.icdCode)).size).toBe(18);
  expect(full.conditions.every(row => typeof row.description === 'string' && row.description.length > 0)).toBe(true);
  expect(full.conditions.some(row => row.code === 'U071')).toBe(false);
  expect(full.catalogEvidence.covidExcluded).toBe(true);
});

test('prescriptions use actual curated platform products through the real prescribability filter', () => {
  const drugs = new Map(readCommonDrugs().map(drug => [drug.name, drug]));
  const prescriptions = full.records.filter(row => row.model === 'Prescription');
  expect(prescriptions.every(row => {
    const drug = drugs.get(row.document.drugName);
    return drug && isPrescribableDrug(drug) && drug.commonDosages.includes(row.document.dosage);
  })).toBe(true);
  expect(prescriptions.some(row => /soap|shampoo|Hatric/i.test(row.document.drugName))).toBe(false);
});

test('unsupported hepatitis and urinary-infection mappings are omitted rather than invented', () => {
  const forbidden = new Set(full.records.filter(row => row.model === 'Consultation' && ['hepatitis_a', 'uti'].includes(row.conditionKey)).map(row => row.id));
  expect(forbidden.size > 0).toBe(true);
  expect(full.records.some(row => row.model === 'Prescription' && forbidden.has(row.document.consultationId))).toBe(false);
});

test('all clinical and dispensing foreign keys point only to the owned registry with matching patient/pharmacy', () => {
  const owned = new Map(full.records.map(row => [row.id, row]));
  const consistent = full.records.every(row => {
    const d = row.document;
    if (row.model === 'Consultation') return owned.get(d.patientId)?.document.nic === d.patientNic && owned.get(d.doctorId)?.model === 'Doctor' && (!d.hospitalId || owned.get(d.hospitalId)?.model === 'Hospital');
    if (['Prescription', 'LabTest'].includes(row.model)) {
      const c = owned.get(d.consultationId)?.document;
      return c && c.patientId === d.patientId && c.patientNic === d.patientNic && owned.get(d.patientId)?.model === 'Patient' &&
        (row.model === 'Prescription' ? d.doctorId === c.doctorId : d.referredBy === c.doctorId) && (!d.hospitalId || d.hospitalId === c.hospitalId);
    }
    if (row.model === 'Dispensing') return owned.get(d.prescriptionId)?.document.patientNic === d.patientNic && owned.get(d.staffId)?.document.pharmacyId === d.pharmacyId;
    return true;
  });
  expect(consistent).toBe(true);
});

test('canonical persisted districts cover all twenty-five districts without inventing hospital affiliations', () => {
  const consultations = full.records.filter(row => row.model === 'Consultation');
  const doctors = new Map(full.records.filter(row => row.model === 'Doctor').map(row => [row.id, row]));
  const patients = new Map(full.records.filter(row => row.model === 'Patient').map(row => [row.id, row]));
  expect(new Set(consultations.map(row => row.document.district)).size).toBe(25);
  expect(consultations.every(row => doctors.get(row.document.doctorId).district === row.document.district && patients.get(row.document.patientId).document.district === row.document.district)).toBe(true);
  expect([...doctors.values()].filter(row => row.document.hospitals.length === 0).length).toBe(13);
  expect(consultations.every(row => row.document.loginType === 'personal' ? !Object.hasOwn(row.document, 'hospitalId') : Boolean(row.document.hospitalId))).toBe(true);
  expect(full.records.filter(row => row.model === 'LabTest').every(row => Boolean(row.document.hospitalId))).toBe(true);
  expect(full.districts.every(row => row.key === row.canonical.toLowerCase().replace(/ /g, '_'))).toBe(true);
});

test('consultations occupy exactly 120 complete Colombo days with no future records and lighter weekends', () => {
  const daily = new Map();
  const consultations = full.records.filter(row => row.model === 'Consultation');
  const localToday = '2026-11-06';
  expect(consultations.every(row => +row.document.createdAt < +new Date(NOW))).toBe(true);
  for (const row of consultations) {
    const day = new Date(+row.document.createdAt + 330 * 60000).toISOString().slice(0, 10);
    daily.set(day, (daily.get(day) || 0) + 1);
  }
  expect(daily.size).toBe(120);
  expect([...daily.keys()].every(day => day < localToday)).toBe(true);
  const means = [false, true].map(weekend => {
    const selected = [...daily].filter(([day]) => [0, 6].includes(new Date(day).getUTCDay()) === weekend);
    return selected.reduce((sum, [, count]) => sum + count, 0) / selected.length;
  });
  expect(means[1] < means[0]).toBe(true);
});

test('S8 is six dengue episodes on one Ampara day with no extra dengue background', () => {
  const rows = full.records.filter(row => row.model === 'Consultation' && row.document.icdCode === 'A90' && row.document.district === 'Ampara');
  expect(rows.length).toBe(6);
  expect(rows.every(row => row.scenario === 'S8')).toBe(true);
  expect(new Set(rows.map(row => new Date(+row.document.createdAt + 330 * 60000).toISOString().slice(0, 10))).size).toBe(1);
  expect(rows.length <= 10).toBe(true);
});

test('S1/S4 rise, S2 stays historical and every named shape is represented without detector execution', () => {
  const rows = full.records.filter(row => row.model === 'Consultation');
  expect(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'].every(key => full.scenarioSummary[key] > 0)).toBe(true);
  const age = row => Math.floor((+new Date(NOW) - +row.document.createdAt) / 86400000);
  for (const scenario of ['S1', 'S4']) {
    const selected = rows.filter(row => row.scenario === scenario);
    const recent = selected.filter(row => age(row) < 8).length / 7;
    const prior = selected.filter(row => age(row) >= 8 && age(row) < 31).length / 23;
    expect(recent > prior).toBe(true);
  }
  expect(rows.filter(row => row.scenario === 'S2').every(row => age(row) >= 16)).toBe(true);
});

test('dispensed prescription status, one receipt per prescription and chronology remain internally consistent', () => {
  const prescriptions = new Map(full.records.filter(row => row.model === 'Prescription').map(row => [row.id, row.document]));
  const dispensing = full.records.filter(row => row.model === 'Dispensing');
  expect(new Set(dispensing.map(row => row.document.prescriptionId)).size).toBe(FULL_COUNTS.Dispensing);
  expect(dispensing.every(row => {
    const rx = prescriptions.get(row.document.prescriptionId);
    return rx.status === 'dispensed' && +rx.dispensedAt === +row.document.dispensedAt &&
      +rx.issuedAt <= +rx.dispensedAt && +rx.dispensedAt < +new Date(NOW) && !row.document.items.some(item => item.inventoryItemId);
  })).toBe(true);
});

test('lab orders link only to infectious consultations with an owned hospital',()=>{
  const consultations=new Map(full.records.filter(r=>r.model==='Consultation').map(r=>[r.id,r.document]));
  const nonInfectious=new Set(['I10','E119','J45909','K2970','G43909','M545','N390']);
  expect(full.records.filter(r=>r.model==='LabTest').every(r=>Boolean(r.document.hospitalId)&&!nonInfectious.has(consultations.get(r.document.consultationId).icdCode))).toBe(true);
});

test('synthetic NIC candidates satisfy shape but the plan does not claim allocation/collision safety', () => {
  const nics = candidatePatientNics(400);
  const controller = fs.readFileSync(path.join(__dirname, '../src/controllers/patientController.js'), 'utf8');
  const declaration = /const nicPattern = \/\^([^\r\n]+)\$\/;/.exec(controller);
  expect(Boolean(declaration)).toBe(true);
  const realFormat = new RegExp('^' + declaration[1] + '$');
  expect(nics.every(nic => realFormat.test(nic) && nic.slice(0, 4) === '9999' && nic.slice(4, 7) === '900')).toBe(true);
  expect(new Set(nics).size).toBe(400);
});

test.each([
  {}, { now: 'invalid' }, { now: NOW, compact: 'true' },
  { now: NOW, compact: true, patientNics: [] },
  { now: NOW, compact: true, patientNics: Array(8).fill('not-an-identity') },
  { now: NOW, compact: true, patientNics: Array(8).fill(candidatePatientNics(1)[0]) }
])('invalid inputs fail with a fixed category before producing a plan %#', input => {
  let error;
  try { buildSeedPlatformPlan(input); } catch (failure) { error = failure; }
  expect(Boolean(error && /^SEED_[A-Z_]+$/.test(error.message))).toBe(true);
});

test('plan generation emits no account, identity or credential output', () => {
  const spies = ['log', 'warn', 'error', 'info'].map(method => jest.spyOn(console, method).mockImplementation(() => {}));
  try {
    buildSeedPlatformPlan({ now: NOW, compact: true });
    expect(spies.every(spy => spy.mock.calls.length === 0)).toBe(true);
  } finally { spies.forEach(spy => spy.mockRestore()); }
});
