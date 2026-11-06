'use strict';

// Deterministic data only: no models, environment files, connections or writes.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadReferenceCatalogs } = require('../server/src/utils/referenceCatalogs');
const { isPrescribableDrug } = require('../server/src/utils/ingredientResolver');

const NAMESPACE = 'SEED_2026_11_A';
const PASSWORD_PLACEHOLDER = 'SEED_RUNTIME_UNUSABLE_PASSWORD_HASH_REQUIRED';
const DAY = 86400000;
const OFFSET = 330 * 60000;
const FULL_COUNTS = Object.freeze({ Patient: 400, Hospital: 12, Doctor: 40, Pharmacy: 15, PharmacyStaff: 15, Consultation: 4500, Prescription: 4000, LabTest: 1125, Dispensing: 2800 });
const COMPACT_COUNTS = Object.freeze({ Patient: 8, Hospital: 3, Doctor: 6, Pharmacy: 2, PharmacyStaff: 2, Consultation: 32, Prescription: 28, LabTest: 8, Dispensing: 20 });
const MODEL_INFO = Object.freeze({
  Patient: ['patients', 'email'], Hospital: ['hospitals', 'regNo'], Doctor: ['doctors', 'doctorId'],
  Pharmacy: ['pharmacies', 'regNo'], PharmacyStaff: ['pharmacystaffs', 'email'],
  Consultation: ['consultations', 'consultationId'], Prescription: ['prescriptions', 'prescriptionId'],
  LabTest: ['labtests', 'labTestId'], Dispensing: ['dispensings', 'receiptNumber']
});
// Estimated allocation weights, not a verified census dataset. Sum = 100.
const DISTRICTS = Object.freeze([
  ['Colombo', 12], ['Gampaha', 12], ['Kalutara', 6], ['Kandy', 7], ['Matale', 3], ['Nuwara Eliya', 4],
  ['Galle', 5], ['Matara', 4], ['Hambantota', 3], ['Jaffna', 3], ['Kilinochchi', 1], ['Mannar', 1],
  ['Mullaitivu', 1], ['Vavuniya', 1], ['Batticaloa', 3], ['Ampara', 3], ['Trincomalee', 2],
  ['Kurunegala', 7], ['Puttalam', 3], ['Anuradhapura', 4], ['Polonnaruwa', 2], ['Badulla', 4],
  ['Monaragala', 2], ['Ratnapura', 4], ['Kegalle', 3]
].map(([canonical, weight]) => Object.freeze({ key: canonical.toLowerCase().replace(/ /g, '_'), canonical, weight })));
const HOSPITAL_DISTRICTS = ['Colombo', 'Gampaha', 'Kalutara', 'Ratnapura', 'Galle', 'Kandy', 'Nuwara Eliya', 'Jaffna', 'Batticaloa', 'Matale', 'Ampara', 'Kurunegala'];
const CONDITIONS = Object.freeze([
  ['dengue', 'A90', 'Paracetamol'], ['leptospirosis', 'A279', 'Paracetamol'],
  ['influenza', 'J111', 'Paracetamol'], ['chickenpox', 'B019', 'Calamine Lotion'],
  ['mumps', 'B269', 'Paracetamol'], ['diarrhoeal', 'A09', 'Oral Rehydration Salts (ORS)'],
  ['typhoid', 'A0100', 'Paracetamol'], ['hepatitis_a', 'B159', null],
  ['chikungunya', 'A920', 'Paracetamol'], ['hfmd', 'B084', 'Paracetamol'],
  ['uri', 'J069', 'Paracetamol'], ['hypertension', 'I10', 'Amlodipine'],
  ['diabetes', 'E119', 'Metformin'], ['asthma', 'J45909', 'Salbutamol Inhaler'],
  ['gastritis', 'K2970', 'Omeprazole'], ['migraine', 'G43909', 'Paracetamol'],
  ['backpain', 'M545', 'Paracetamol'], ['uti', 'N390', null]
].map(([key, code, medication]) => Object.freeze({ key, code, medication })));

function invalid(code = 'SEED_PLAN_INPUT_INVALID') { throw Error(code); }
function objectId(model, index) {
  if (!Object.hasOwn(MODEL_INFO, model) || !Number.isSafeInteger(index) || index < 0) invalid();
  return crypto.createHash('sha256').update(`${NAMESPACE}|${model}|${index}`).digest('hex').slice(0, 24);
}
const serial = index => String(index + 1).padStart(5, '0');
function candidatePatientNics(count) {
  // A bounded pool larger than the requested cohort lets the executor skip
  // collisions without changing or reusing an existing person's identifier.
  if (!Number.isSafeInteger(count) || count < 1 || count > 10000) invalid();
  // Impossible future birth year / out-of-range day candidate, format only.
  // The executor must independently check collisions; no reserved range is claimed.
  return Array.from({ length: count }, (_, i) => '9999900' + String(i + 1).padStart(5, '0'));
}

// Parse the actual COMMON_DRUGS literal without importing its controller or
// evaluating source. Deliberately accepts only literal strings/arrays/objects.
function readCommonDrugs() {
  const source = fs.readFileSync(path.resolve(__dirname, '../server/src/controllers/drugController.js'), 'utf8');
  const marker = 'const COMMON_DRUGS = ';
  let i = source.indexOf(marker);
  if (i < 0 || source.indexOf(marker, i + marker.length) >= 0) invalid('SEED_COMMON_CATALOG_INVALID');
  i += marker.length;
  const skip = () => { while (/\s/.test(source[i] || '') && i < source.length) i++; };
  function string() {
    const quote = source[i++]; let out = '';
    while (i < source.length) {
      const char = source[i++];
      if (char === quote) return out;
      if (char === '\\') {
        const escaped = source[i++], escapes = { n: '\n', r: '\r', t: '\t', '\\': '\\', "'": "'", '"': '"' };
        if (!Object.hasOwn(escapes, escaped)) invalid('SEED_COMMON_CATALOG_INVALID');
        out += escapes[escaped];
      } else { if (char === '\n' || char === '\r') invalid('SEED_COMMON_CATALOG_INVALID'); out += char; }
    }
    invalid('SEED_COMMON_CATALOG_INVALID');
  }
  function value() {
    skip();
    if (source[i] === "'" || source[i] === '"') return string();
    if (source[i] === '[') {
      i++; const out = []; skip();
      while (source[i] !== ']') { out.push(value()); skip(); if (source[i] === ',') { i++; skip(); } else if (source[i] !== ']') invalid('SEED_COMMON_CATALOG_INVALID'); }
      i++; return out;
    }
    if (source[i] === '{') {
      i++; const out = Object.create(null); skip();
      while (source[i] !== '}') {
        const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i));
        const key = match ? (i += match[0].length, match[0]) : ["'", '"'].includes(source[i]) ? string() : invalid('SEED_COMMON_CATALOG_INVALID');
        if (['__proto__', 'prototype', 'constructor'].includes(key) || Object.hasOwn(out, key)) invalid('SEED_COMMON_CATALOG_INVALID');
        skip(); if (source[i++] !== ':') invalid('SEED_COMMON_CATALOG_INVALID'); out[key] = value(); skip();
        if (source[i] === ',') { i++; skip(); } else if (source[i] !== '}') invalid('SEED_COMMON_CATALOG_INVALID');
      }
      i++; return out;
    }
    invalid('SEED_COMMON_CATALOG_INVALID');
  }
  const rows = value(); skip();
  if (source[i] !== ';' || !Array.isArray(rows) || !rows.length || rows.some(row => typeof row.name !== 'string' || typeof row.genericName !== 'string' || !Array.isArray(row.commonDosages) || row.commonDosages.some(x => typeof x !== 'string'))) invalid('SEED_COMMON_CATALOG_INVALID');
  return rows;
}

function dayAnchor(now) {
  const date = now instanceof Date ? new Date(+now) : new Date(now);
  if (!Number.isFinite(+date)) invalid();
  const local = new Date(+date + OFFSET);
  return { now: date, midnight: Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - OFFSET };
}
function allocate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map(weight => total * weight / sum), result = raw.map(Math.floor);
  let remaining = total - result.reduce((a, b) => a + b, 0);
  const order = raw.map((n, i) => ({ i, remainder: n - Math.floor(n) })).sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  for (let i = 0; i < remaining; i++) result[order[i].i]++;
  return result;
}

function buildSeedPlatformPlan({ now, compact = false, patientNics } = {}) {
  if (typeof compact !== 'boolean' || now === undefined) invalid();
  const { now: current, midnight } = dayAnchor(now), target = compact ? COMPACT_COUNTS : FULL_COUNTS;
  const nics = patientNics === undefined ? candidatePatientNics(target.Patient) : patientNics;
  if (!Array.isArray(nics) || nics.length !== target.Patient || nics.some(nic => typeof nic !== 'string' || !/^9999900[0-9]{5}$/.test(nic)) || new Set(nics).size !== nics.length) invalid('SEED_SYNTHETIC_IDENTITY_REQUIRED');
  const catalog = loadReferenceCatalogs(), common = readCommonDrugs();
  const prescribable = [...common, ...catalog.drugs].filter(isPrescribableDrug);
  const conditions = CONDITIONS.map(condition => {
    const reference = catalog.icd10.find(row => row.code.replace(/\./g, '').toUpperCase() === condition.code);
    if (!reference) invalid('SEED_REFERENCE_CONDITION_MISSING');
    const drug = condition.medication ? prescribable.find(row => row.name === condition.medication) : null;
    if (condition.medication && (!drug || !drug.commonDosages?.length)) invalid('SEED_REFERENCE_MEDICATION_MISSING');
    return { ...condition, description: reference.description, drug };
  });
  const byCondition = new Map(conditions.map(row => [row.key, row]));
  const records = [], byModel = Object.fromEntries(Object.keys(MODEL_INFO).map(model => [model, []]));
  function add(model, document, extra = {}, annotations = {}) {
    const index = byModel[model].length, [collection, field] = MODEL_INFO[model];
    const id = objectId(model, index);
    const prefixValue = field === 'email' ? `${NAMESPACE.toLowerCase()}-${model.toLowerCase()}-${serial(index)}@accounts.invalid` : `${NAMESPACE}-${model.toUpperCase()}-${serial(index)}`;
    const canonical = { _id: id, ...document, [field]: prefixValue };
    const metadata = { syntheticSeedBatch: NAMESPACE, isSynthetic: true, isDemoData: true, ...extra };
    const row = { model, collection, id, prefix: { field, value: prefixValue }, document: canonical, metadata, ...annotations };
    records.push(row); byModel[model].push(row); return row;
  }
  const time = (ago, minute = 0) => new Date(midnight - ago * DAY + 10 * 3600000 + minute * 60000);
  const hospitalDates = time(120);
  for (let i = 0; i < target.Hospital; i++) add('Hospital', { name: `SEED Hospital ${serial(i)}`, district: HOSPITAL_DISTRICTS[i], type: i % 2 ? 'private' : 'government', email: `${NAMESPACE.toLowerCase()}-hospital-${serial(i)}@accounts.invalid`, password: PASSWORD_PLACEHOLDER, isActive: true, isVerified: true, createdAt: hospitalDates, updatedAt: hospitalDates });
  const personalDistricts = compact ? [] : DISTRICTS.filter(row => !HOSPITAL_DISTRICTS.includes(row.canonical));
  for (let i = 0; i < target.Doctor; i++) {
    const personal = i < personalDistricts.length;
    const hospital = personal ? null : byModel.Hospital[(i - personalDistricts.length) % target.Hospital];
    const district = personal ? personalDistricts[i].canonical : hospital.document.district;
    add('Doctor', { fullName: `SEED Doctor ${serial(i)}`, email: `${NAMESPACE.toLowerCase()}-doctor-${serial(i)}@accounts.invalid`, password: PASSWORD_PLACEHOLDER, licenseNo: `${NAMESPACE}-LIC-${serial(i)}`, specialization: 'Synthetic workflow fixture', hospitals: hospital ? [hospital.id] : [], role: 'doctor', loginType: 'personal', isActive: true, isVerified: true, isSynthetic: true, isDemoData: true, createdAt: hospitalDates, updatedAt: hospitalDates }, {}, { district });
  }
  for (let i = 0; i < target.Pharmacy; i++) {
    const district = DISTRICTS[i % DISTRICTS.length].canonical;
    const staffId = objectId('PharmacyStaff', i);
    const pharmacy = add('Pharmacy', { name: `SEED Pharmacy ${serial(i)}`, district, adminId: staffId, isActive: true, inventory: [], email: `${NAMESPACE.toLowerCase()}-pharmacy-${serial(i)}@accounts.invalid`, createdAt: hospitalDates, updatedAt: hospitalDates });
    add('PharmacyStaff', { fullName: `SEED Pharmacy Staff ${serial(i)}`, pharmacyId: pharmacy.id, password: PASSWORD_PLACEHOLDER, role: 'pharmacy_admin', isActive: true, isVerified: true, mustChangePassword: false, createdAt: hospitalDates, updatedAt: hospitalDates });
  }
  const districtAssignments = compact ? Array.from({ length: target.Patient }, (_, i) => HOSPITAL_DISTRICTS[i % target.Hospital]) : allocate(target.Patient, DISTRICTS.map(row => row.weight)).flatMap((n, i) => Array(n).fill(DISTRICTS[i].canonical));
  for (let i = 0; i < target.Patient; i++) {
    const age = i % 5 === 0 ? 8 + i % 10 : 18 + i % 60;
    add('Patient', { nic: nics[i], fullName: `SEED Patient ${serial(i)}`, dateOfBirth: new Date(Date.UTC(new Date(midnight + OFFSET).getUTCFullYear() - age, 0, 1)), gender: ['Male', 'Female', 'Other'][i % 3], district: districtAssignments[i], contactInfo: '', password: PASSWORD_PLACEHOLDER, allergies: [], chronicConditions: [], isActive: true, preferredLanguage: ['en', 'si', 'ta'][i % 3], createdAt: hospitalDates, updatedAt: hospitalDates });
  }

  const episodes = [];
  const addEpisode = (scenario, condition, district, ago, count) => {
    for (let i = 0; i < count; i++) episodes.push({ scenario, condition, district, ago });
  };
  if (compact) {
    for (let i = 0; i < target.Consultation; i++) addEpisode('COMPACT_FIXTURE_ONLY', conditions[i % conditions.length].key, districtAssignments[i % districtAssignments.length], 1 + i % 120, 1);
  } else {
    const weekdayFactor = ago => [0, 6].includes(new Date(midnight - ago * DAY + OFFSET).getUTCDay()) ? 0.8 : 1;
    for (const district of ['Colombo', 'Gampaha', 'Kalutara']) for (let ago = 35; ago >= 1; ago--) {
      const daily = ago > 10 ? 1 + Math.floor((35 - ago) / 15) : 6 + Math.floor((10 - ago) / 3);
      addEpisode('S1', 'dengue', district, ago, Math.max(1, Math.round(daily * weekdayFactor(ago))));
    }
    for (const district of ['Ratnapura', 'Kalutara', 'Galle']) [2, 3, 5, 7, 8, 8, 7, 5, 3, 2].forEach((n, i) => addEpisode('S2', 'leptospirosis', district, 26 - i, n));
    for (let ago = 14; ago >= 1; ago--) addEpisode('S3', 'chickenpox', 'Galle', ago, ago % 2 ? 2 : 3);
    for (const district of DISTRICTS) for (let ago = 30; ago >= 1; ago--) {
      const daily = (ago > 14 ? 1 : ago > 7 ? 2 : 4) * (['Kandy', 'Nuwara Eliya'].includes(district.canonical) ? 2 : 1);
      addEpisode('S4', 'influenza', district.canonical, ago, Math.max(1, Math.round(daily * weekdayFactor(ago))));
    }
    for (const district of ['Jaffna', 'Batticaloa']) for (const condition of ['typhoid', 'diarrhoeal']) for (let ago = 5; ago >= 1; ago--) addEpisode('S5', condition, district, ago, 3);
    for (let ago = 8; ago >= 1; ago--) addEpisode('S6', 'hepatitis_a', 'Matale', ago, 2);
    addEpisode('S8', 'dengue', 'Ampara', 1, 6);
    const background = ['mumps', 'chikungunya', 'hfmd', 'uri', 'hypertension', 'diabetes', 'asthma', 'gastritis', 'migraine', 'backpain', 'uti'];
    const remaining = target.Consultation - episodes.length;
    if (remaining < 120) invalid('SEED_SCENARIO_BUDGET_INVALID');
    const daily = allocate(remaining, Array.from({ length: 120 }, (_, i) => [0, 6].includes(new Date(midnight - (i + 1) * DAY + OFFSET).getUTCDay()) ? 4 : 5));
    let cursor = 0;
    for (let i = 0; i < daily.length; i++) for (let j = 0; j < daily[i]; j++) {
      const district = districtAssignments[(cursor * 37) % districtAssignments.length];
      addEpisode('S7', background[cursor % background.length], district, i + 1, 1); cursor++;
    }
  }
  episodes.sort((a, b) => b.ago - a.ago || a.scenario.localeCompare(b.scenario) || a.district.localeCompare(b.district) || a.condition.localeCompare(b.condition));
  const patientsByDistrict = new Map(DISTRICTS.map(d => [d.canonical, byModel.Patient.filter(row => row.document.district === d.canonical)]));
  for (const [index, episode] of episodes.entries()) {
    const pool = patientsByDistrict.get(episode.district) || [];
    if (!pool.length) invalid('SEED_DISTRICT_PATIENT_REQUIRED');
    const children = pool.filter(row => current.getUTCFullYear() - row.document.dateOfBirth.getUTCFullYear() < 18);
    const patient = (episode.condition === 'chickenpox' && children.length ? children : pool)[index % (episode.condition === 'chickenpox' && children.length ? children : pool).length];
    const affiliated = byModel.Doctor.filter(row => row.district === episode.district);
    if (!affiliated.length) invalid('SEED_DISTRICT_DOCTOR_REQUIRED');
    const doctor = affiliated[index % affiliated.length];
    const hospitalId = doctor.document.hospitals[0], condition = byCondition.get(episode.condition), createdAt = time(episode.ago, index % 360);
    const consultation = add('Consultation', { patientNic: patient.document.nic, patientId: patient.id, doctorId: doctor.id, ...(hospitalId ? { hospitalId, sessionHospitalId: hospitalId } : {}), diagnosis: condition.description, icdCode: condition.code, icdDescription: condition.description, icdVersion: 'ICD-10', district: episode.district, notes: 'Synthetic workflow fixture only; not a clinical recommendation.', symptoms: catalog.symptoms.filter(s => ['headache', 'fatigue'].includes(s)), labTests: [], loginType: hospitalId ? 'hospital' : 'personal', isSynthetic: true, isDemoData: true, createdAt, updatedAt: createdAt }, {}, { scenario: episode.scenario, conditionKey: condition.key });
    consultation.metadata.isSimulation = true;
    consultation.metadata.surveillanceVerification = { status: 'verified', source: 'synthetic_qa', diagnosisStatus: 'confirmed', verifiedBy: doctor.id, verifiedAt: current, episodeId: consultation.document.consultationId, caseDefinitionReference: 'SYNTHETIC_WORKFLOW_CASE_NOT_CLINICALLY_VALIDATED' };
  }

  const rxEligible = byModel.Consultation.filter(row => byCondition.get(row.conditionKey).drug);
  const rxCount = Math.min(target.Prescription, rxEligible.length), dispCount = Math.min(target.Dispensing, rxCount);
  for (let i = 0; i < rxCount; i++) {
    const consultation = rxEligible[i], patient = byModel.Patient.find(row => row.id === consultation.document.patientId), drug = byCondition.get(consultation.conditionKey).drug;
    const createdAt = consultation.document.createdAt, expiresAt = new Date(+createdAt + 7 * DAY), dispensedAt = new Date(Math.min(+createdAt + DAY, +current - 1000));
    const pharmacy = byModel.Pharmacy[i % target.Pharmacy], staff = byModel.PharmacyStaff[i % target.PharmacyStaff], dispensed = i < dispCount;
    const rx = add('Prescription', { consultationId: consultation.id, consultationRef: consultation.document.consultationId, patientNic: patient.document.nic, patientId: patient.id, doctorId: consultation.document.doctorId, ...(consultation.document.hospitalId ? { hospitalId: consultation.document.hospitalId } : {}), drugName: drug.name, dosage: drug.commonDosages[0], frequency: 'Synthetic workflow fixture only', durationDays: 7, instructions: 'Not a treatment recommendation. Synthetic record only.', medications: [{ name: drug.name, dosage: drug.commonDosages[0], frequency: 'Synthetic workflow fixture only' }], status: dispensed ? 'dispensed' : expiresAt < current ? 'expired' : 'issued', issuedAt: createdAt, expiresAt, ...(dispensed ? { dispensedAt, dispensedBy: pharmacy.id, dispenserStaffId: staff.id, dispensedByPharmacist: staff.document.fullName, pharmacyName: pharmacy.document.name } : {}), createdAt, updatedAt: dispensed ? dispensedAt : createdAt });
    if (dispensed) add('Dispensing', { prescriptionId: rx.id, pharmacyId: pharmacy.id, staffId: staff.id, patientNic: patient.document.nic, items: [{ drugName: drug.name, dosage: drug.commonDosages[0], quantityDispensed: 1, status: 'dispensed' }], notes: 'Synthetic workflow fixture only; no inventory change.', audit: { actorId: staff.id, actorRole: 'pharmacy_admin', action: 'SYNTHETIC_DISPENSING_FIXTURE', timestamp: dispensedAt }, dispensedAt, createdAt: dispensedAt, updatedAt: dispensedAt });
  }
  const infectious = new Set(['dengue','leptospirosis','influenza','chickenpox','mumps','diarrhoeal','typhoid','hepatitis_a','chikungunya','hfmd','uri']);
  const labEligible = byModel.Consultation.filter(row => row.document.hospitalId && infectious.has(row.conditionKey));
  if (labEligible.length < target.LabTest) invalid('SEED_LAB_REFERRAL_BUDGET_INVALID');
  for (let i = 0; i < target.LabTest; i++) {
    const consultation = labEligible[Math.floor(i * labEligible.length / target.LabTest)], patient = byModel.Patient.find(row => row.id === consultation.document.patientId), createdAt = consultation.document.createdAt;
    const testName = ['Complete Blood Count', 'Urine Analysis', 'Blood Glucose'][i % 3];
    consultation.document.labTests.push(testName);
    add('LabTest', { consultationId: consultation.id, consultationRef: consultation.document.consultationId, patientNic: patient.document.nic, patientId: patient.id, patientName: patient.document.fullName, patientEmail: patient.document.email, hospitalId: consultation.document.hospitalId, referredBy: consultation.document.doctorId, testName, testCategory: ['Haematology', 'Urine Analysis', 'Biochemistry'][i % 3], urgency: 'routine', status: 'pending', statusHistory: [{ status: 'pending', changedAt: createdAt, note: 'Synthetic workflow fixture only' }], notes: 'Synthetic workflow fixture; no report uploaded or provider delivery.', createdAt, updatedAt: createdAt });
  }
  const counts = Object.fromEntries(Object.entries(byModel).map(([model, rows]) => [model, rows.length]));
  const scenarioSummary = Object.fromEntries([...new Set(episodes.map(x => x.scenario))].map(scenario => [scenario, episodes.filter(x => x.scenario === scenario).length]));
  return {
    planVersion: 1, namespace: NAMESPACE, compact, anchorDate: new Date(midnight + OFFSET).toISOString().slice(0, 10), now: current.toISOString(),
    requiresRuntimePasswordHash: true, passwordPlaceholder: PASSWORD_PLACEHOLDER,
    counts, targetCounts: { ...target }, totalDocuments: records.length, records,
    documentsByModel: Object.fromEntries(Object.entries(byModel).map(([model, rows]) => [model, rows.map(row => row.document)])),
    registry: records.map(({ model, collection, id, prefix }) => ({ model, collection, id, prefix: { ...prefix } })),
    districts: DISTRICTS.map(row => ({ ...row })), conditions: conditions.map(({ drug, ...condition }) => ({ ...condition, medication: drug?.name || null })), scenarioSummary,
    catalogEvidence: { icdSource: 'server/reference-data/icd10_clean.json', icdRows: catalog.icd10.length, packagedDrugSource: 'server/reference-data/drugs_clean.json', packagedDrugRows: catalog.drugs.length, fallbackDrugSource: 'server/src/controllers/drugController.js:COMMON_DRUGS', fallbackDrugRows: common.length, prescribabilitySource: 'server/src/utils/ingredientResolver.js:isPrescribableDrug', covidExcluded: !conditions.some(row => row.code === 'U071') },
    warnings: [
      'All records are synthetic workflow fixtures, not reviewed real cases or treatment recommendations.',
      'District keys are lowercase planning labels; persisted districts retain canonical TitleCase required by the existing selector.',
      'Population weights are explicit estimates, not census-validated. Weekends are weighted four versus five on weekdays.',
      'Exactly twelve hospital districts are represented; thirteen other districts have personal doctors without invented hospital affiliations.',
      'Runtime must replace every account password placeholder with a cryptorandom unusable bcrypt hash and preserve synthetic metadata.',
      'NIC candidates satisfy format only; executor must verify the exact registry and all identity collisions before any write.',
      'Metadata is separate: append only after real model validation and encryption; do not change schemas or enable strict:false.',
      'No outbreak detection, ML ingestion, audit, notification, inventory mutation or provider delivery is part of this plan.',
      ...(rxCount < target.Prescription ? ['Prescription target reduced because unsupported condition-to-catalog mappings are deliberately omitted.'] : [])
    ]
  };
}

module.exports = { NAMESPACE, PASSWORD_PLACEHOLDER, FULL_COUNTS, COMPACT_COUNTS, MODEL_INFO, DISTRICTS, CONDITIONS, objectId, candidatePatientNics, readCommonDrugs, buildSeedPlatformPlan };
