'use strict';
/**
 * server/scripts/demo/demoStore.cjs
 *
 * Database side of the synthetic demonstration seed (docs/demo/SEED_DESIGN.md). Every function takes
 * an already-connected `db` (a MongoDB Db handle); nothing here opens a connection or reads .env.
 * Writes are bulkWrite upserts with $setOnInsert in bounded batches. Clean-up removes only documents
 * that carry the batch tag, isSynthetic: true AND this seed's identifier prefix.
 */
const {
  BATCH_TAG, DEMO_PREFIX, PATIENT_NIC_PREFIX, DOCTOR_PREFIX, CLINIC_PREFIX, PATIENT_EMAIL_PREFIX, LABEL, diseaseByKey,
} = require('./demoSeedPlan.cjs');

const BATCH_SIZE = 1000;
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SELECTORS = Object.freeze({
  consultations: { consultationId: { $regex: `^${escape(DEMO_PREFIX)}` } },
  patients: { nic: { $regex: `^${PATIENT_NIC_PREFIX}[0-9]{8}$` }, email: { $regex: `^${escape(PATIENT_EMAIL_PREFIX)}` } },
  doctors: { doctorId: { $regex: `^${escape(DOCTOR_PREFIX)}` } },
  hospitals: { regNo: { $regex: `^${escape(CLINIC_PREFIX)}` } },
});
const FLAGS = Object.freeze({ syntheticSeedBatch: BATCH_TAG, isSynthetic: true });
const flagged = doc => doc.syntheticSeedBatch === BATCH_TAG && doc.isSynthetic === true;
const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

function parentDocuments(plan, passwordHash) {
  const { writeNicFields } = require('../../src/security/nicPersistence');
  const ids = plan.identities;
  const usedPatients = new Set(plan.rows.map(r => r.patientIndex));
  const usedDistricts = new Set(plan.rows.map(r => r.district));
  return {
    hospitals: ids.clinics.filter(c => usedDistricts.has(c.district)).map(c => ({ key: { regNo: c.regNo }, doc: {
      regNo: c.regNo, name: c.name, type: 'government', district: c.district, address: `Synthetic address, ${c.district}`, email: c.email,
      password: passwordHash, isActive: true, isVerified: true, syntheticLabel: LABEL, ...FLAGS } })),
    doctors: ids.doctors.filter(d => usedDistricts.has(d.district)).map(d => ({ key: { doctorId: d.doctorId }, clinicRegNo: d.clinicRegNo, doc: {
      doctorId: d.doctorId, fullName: d.fullName, email: d.email, licenseNo: d.licenseNo, specialization: 'General Practice', district: d.district,
      password: passwordHash, role: 'doctor', loginType: 'personal', isActive: true, isVerified: true, syntheticLabel: LABEL, ...FLAGS } })),
    patients: ids.patients.filter(p => usedPatients.has(p.index)).map(p => ({ key: { nic: p.nic }, index: p.index, doc: {
      nic: p.nic, fullName: p.fullName, email: p.email, district: p.district, password: passwordHash, isActive: true,
      syntheticLabel: LABEL, ...FLAGS, ...writeNicFields(p.nic) } })),
  };
}

function consultationDocument(row, plan, refs) {
  const { writeNicFields } = require('../../src/security/nicPersistence');
  const disease = diseaseByKey.get(row.disease).condition;
  const patient = plan.identities.patients[row.patientIndex - 1];
  const when = new Date(row.time);
  return {
    consultationId: row.consultationId, patientNic: patient.nic, ...writeNicFields(patient.nic),
    patientId: refs.patients.get(patient.nic), doctorId: refs.doctors.get(row.district), hospitalId: refs.hospitals.get(row.district),
    diagnosis: disease.diseaseName, icdCode: disease.icdCode, icdDescription: disease.icdDescription, icdVersion: disease.icdVersion,
    symptoms: disease.symptoms.slice(0, 3), district: row.district,
    notes: `Synthetic demonstration data (${BATCH_TAG} demo seed, scenario ${row.scenario}). Not a real patient.`,
    ...FLAGS,
    surveillanceVerification: { status: 'verified', diagnosisStatus: 'confirmed', source: 'clinical_review', verifiedBy: BATCH_TAG,
      verifiedAt: when, episodeId: `EP-${row.consultationId}`, caseDefinitionReference: 'WHO-SL-EPI-2026' },
    createdAt: when, updatedAt: when,
  };
}

// Read-only: identifiers this plan would use that are held by a document outside this seed.
async function preflightCollisions(db, plan) {
  const parents = parentDocuments(plan, 'x');
  const collisions = [];
  const probe = async (collection, field, values) => {
    for (const part of chunks(values, 5000)) {
      const found = await db.collection(collection).find({ [field]: { $in: part } }, { projection: { _id: 1, [field]: 1, syntheticSeedBatch: 1, isSynthetic: 1 } }).toArray();
      for (const d of found) if (!flagged(d)) collisions.push({ collection, field, value: d[field], id: String(d._id) });
    }
  };
  await probe('hospitals', 'regNo', parents.hospitals.map(h => h.doc.regNo));
  await probe('hospitals', 'email', parents.hospitals.map(h => h.doc.email));
  await probe('doctors', 'doctorId', parents.doctors.map(d => d.doc.doctorId));
  await probe('doctors', 'email', parents.doctors.map(d => d.doc.email));
  await probe('patients', 'nic', parents.patients.map(p => p.doc.nic));
  await probe('patients', 'email', parents.patients.map(p => p.doc.email));
  await probe('consultations', 'consultationId', plan.rows.map(r => r.consultationId));
  return collisions;
}

async function upsertAll(collection, items, report) {
  for (const part of chunks(items, BATCH_SIZE)) {
    const res = await collection.bulkWrite(part.map(i => ({ updateOne: { filter: i.key, update: { $setOnInsert: i.doc }, upsert: true } })), { ordered: false });
    report.inserted += res.upsertedCount; report.existing += part.length - res.upsertedCount; report.batches++;
  }
}

async function writePlan(db, plan, { passwordHash } = {}) {
  if (!passwordHash) throw new Error('PASSWORD_HASH_REQUIRED (random, unknown secret)');
  const collisions = await preflightCollisions(db, plan);
  if (collisions.length) { const e = new Error(`PRE_FLIGHT_COLLISION_DETECTED: ${collisions.length}`); e.collisions = collisions; throw e; }
  const parents = parentDocuments(plan, passwordHash);
  const report = {};
  const refs = { hospitals: new Map(), doctors: new Map(), patients: new Map() };
  report.hospitals = { inserted: 0, existing: 0, batches: 0 };
  await upsertAll(db.collection('hospitals'), parents.hospitals, report.hospitals);
  for (const h of await db.collection('hospitals').find({ ...SELECTORS.hospitals, ...FLAGS }, { projection: { regNo: 1, district: 1 } }).toArray()) refs.hospitals.set(h.district, h._id);
  report.doctors = { inserted: 0, existing: 0, batches: 0 };
  await upsertAll(db.collection('doctors'), parents.doctors.map(d => ({ ...d, doc: { ...d.doc, hospitals: refs.hospitals.has(d.doc.district) ? [refs.hospitals.get(d.doc.district)] : [] } })), report.doctors);
  for (const d of await db.collection('doctors').find({ ...SELECTORS.doctors, ...FLAGS }, { projection: { district: 1 } }).toArray()) refs.doctors.set(d.district, d._id);
  report.patients = { inserted: 0, existing: 0, batches: 0 };
  await upsertAll(db.collection('patients'), parents.patients, report.patients);
  for (const p of await db.collection('patients').find({ ...SELECTORS.patients, ...FLAGS }, { projection: { nic: 1 } }).toArray()) refs.patients.set(p.nic, p._id);
  report.consultations = { inserted: 0, existing: 0, batches: 0 };
  await upsertAll(db.collection('consultations'), plan.rows.map(r => ({ key: { consultationId: r.consultationId }, doc: consultationDocument(r, plan, refs) })), report.consultations);
  return report;
}

async function findDemo(db) {
  const found = {};
  for (const [collection, selector] of Object.entries(SELECTORS)) {
    const docs = await db.collection(collection).find(selector, { projection: { _id: 1, syntheticSeedBatch: 1, isSynthetic: 1 } }).toArray();
    const bad = docs.filter(d => !flagged(d));
    if (bad.length) throw new Error(`SAFETY_ABORT: ${bad.length} document(s) in ${collection} match this seed's identifier prefix but lack the batch tag or isSynthetic=true (first _id ${bad[0]._id})`);
    found[collection] = docs.map(d => d._id);
  }
  const demoIds = new Set(found.consultations.map(String));
  const alerts = await db.collection('outbreakalerts').find({ syntheticSeedBatch: { $regex: escape(BATCH_TAG) } }, { projection: { _id: 1, sourceConsultationIds: 1 } }).toArray();
  found.outbreakalerts = [];
  found.mixedAlertsLeft = [];
  for (const a of alerts) {
    const src = (a.sourceConsultationIds || []).map(String);
    if (src.length && src.every(id => demoIds.has(id))) found.outbreakalerts.push(a._id);
    else if (src.some(id => demoIds.has(id))) found.mixedAlertsLeft.push(String(a._id));
  }
  return found;
}

const COUNTED = ['consultations', 'patients', 'doctors', 'hospitals', 'outbreakalerts'];
async function countAll(db) {
  const out = {};
  for (const c of COUNTED) out[c] = await db.collection(c).countDocuments({});
  return out;
}

async function cleanDemo(db, { confirm = false } = {}) {
  const before = await countAll(db);
  const found = await findDemo(db);
  const report = { dryRun: !confirm, before, matched: Object.fromEntries(COUNTED.map(c => [c, found[c].length])), mixedAlertsLeft: found.mixedAlertsLeft, deleted: {} };
  if (!confirm) return report;
  for (const c of COUNTED) {
    let deleted = 0;
    for (const part of chunks(found[c], BATCH_SIZE)) {
      const filter = c === 'outbreakalerts' ? { _id: { $in: part }, syntheticSeedBatch: { $regex: escape(BATCH_TAG) } } : { _id: { $in: part }, ...SELECTORS[c], ...FLAGS };
      deleted += (await db.collection(c).deleteMany(filter)).deletedCount;
    }
    report.deleted[c] = deleted;
  }
  report.after = await countAll(db);
  report.unflaggedRemoved = COUNTED.reduce((n, c) => n + (before[c] - report.after[c] - report.deleted[c]), 0);
  return report;
}

// Measured average stored bytes per consultation (data + all indexes) for this seed's documents.
async function measureConsultationBytes(db) {
  const s = await db.command({ collStats: 'consultations' });
  return { count: s.count, size: s.size, totalIndexSize: s.totalIndexSize, storageSize: s.storageSize,
    bytesPerConsultation: s.count ? (s.size + s.totalIndexSize) / s.count : 0 };
}

module.exports = { BATCH_SIZE, SELECTORS, FLAGS, parentDocuments, consultationDocument, preflightCollisions, writePlan, findDemo, cleanDemo, countAll, measureConsultationBytes };
