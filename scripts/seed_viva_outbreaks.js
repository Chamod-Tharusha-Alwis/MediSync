#!/usr/bin/env node
'use strict';

/**
 * scripts/seed_viva_outbreaks.js
 *
 * Deterministic multi-disease outbreak surveillance seeder for MediSync viva.
 *
 * Guarantees:
 * 1. Dynamic MongoDB _id generation: zero fixed ObjectIds in insert payloads.
 * 2. Idempotent upserts ($setOnInsert only) keyed on deterministic synthetic business keys:
 *    - Hospital: regNo (plaintext unique)
 *    - Doctor:   doctorId (plaintext unique)
 *    - Patient:  patientNic_bi / nic (blind-indexed / plaintext unique)
 *    - Consultation: consultationId (plaintext unique)
 * 3. Dynamic reference resolution: doctor.hospitals, consultation.patientId,
 *    consultation.doctorId, and consultation.hospitalId resolved via read-back _id.
 * 4. Connected read-only dry-run: connects, inspects collections, counts planned vs
 *    existing, flags foreign collisions with PRE_FLIGHT_COLLISION_DETECTED.
 * 5. Production safety guard: refuses --confirm against medisync_prod unless
 *    a successful connected dry-run was run in the same session.
 * 6. Target database override: supports --db=<database>.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '../server/.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}
process.env.EMAIL_PROVIDER = 'none';

let mongoose;
try {
  mongoose = require(require.resolve('mongoose', { paths: [path.resolve(__dirname, '../server')] }));
} catch (_) {
  mongoose = require('mongoose');
}

const { evaluateOutbreakCriteria, getColomboMidnight } = require('../server/src/services/surveillanceService');
const { writeNicFields } = require('../server/src/security/nicPersistence');

const BATCH_TAG = 'viva-2026-11-outbreaks';
const DAY_MS = 86400000;
const DUMMY_SYNTHETIC_PASSWORD_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
const DRYRUN_SESSION_FILE = path.join(os.tmpdir(), '.medisync_outbreak_seed_dryrun_session.json');

function parseCliArgs(argv = process.argv.slice(2)) {
  let targetDb = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--db=')) {
      targetDb = a.slice('--db='.length).trim();
    } else if (a === '--db') {
      targetDb = argv[++i]?.trim();
    }
  }
  return {
    confirm: argv.includes('--confirm'),
    dryRun: !argv.includes('--confirm'),
    verifyOnly: argv.includes('--verify'),
    targetDb: targetDb || null,
  };
}

function extractDatabaseName(uri, override = null) {
  if (override) return override;
  if (!uri) return 'medisync_prod';
  try {
    const u = new URL(uri.replace(/^mongodb(?:\+srv)?:\/\//, 'http://'));
    const name = u.pathname.replace(/^\//, '').split('?')[0];
    return name || 'medisync_prod';
  } catch (_) {
    return 'medisync_prod';
  }
}

function recordDryRunSession(dbName, report) {
  try {
    fs.writeFileSync(DRYRUN_SESSION_FILE, JSON.stringify({
      database: dbName,
      batchTag: BATCH_TAG,
      timestamp: Date.now(),
      pid: process.pid,
      report,
    }), 'utf8');
  } catch (_) {}
}

function verifyDryRunSession(dbName) {
  if (dbName !== 'medisync_prod') {
    // Non-production databases (e.g. medisync_seedtest, test) do not require prior session gate
    return true;
  }
  if (!fs.existsSync(DRYRUN_SESSION_FILE)) return false;
  try {
    const session = JSON.parse(fs.readFileSync(DRYRUN_SESSION_FILE, 'utf8'));
    const isRecent = (Date.now() - session.timestamp) < 15 * 60 * 1000; // 15 mins validity
    return session.database === dbName && session.batchTag === BATCH_TAG && isRecent;
  } catch (_) {
    return false;
  }
}

function clearDryRunSession() {
  try {
    if (fs.existsSync(DRYRUN_SESSION_FILE)) {
      fs.unlinkSync(DRYRUN_SESSION_FILE);
    }
  } catch (_) {}
}

function buildOutbreakSeedPlan(referenceDate = new Date()) {
  const todayMidnight = getColomboMidnight(referenceDate);

  const episodes = [];
  let epIdx = 0;

  const addScenarioEpisodes = ({ conditionKey, district, icdCode, icdDescription, daysAgo, count, scenario }) => {
    for (let c = 0; c < count; c++) {
      episodes.push({
        idx: epIdx++,
        scenario,
        conditionKey,
        district,
        icdCode,
        icdDescription,
        icdVersion: 'ICD-10',
        daysAgo,
      });
    }
  };

  // ── 1. Gampaha Dengue (A90) — Critical (N=12 >= 5, 4 consecutive days z > 2.0, maxZ >= 4.0) ──
  // 56-day Baseline: 12 cases across days -52 to -10
  for (const ago of [52, 48, 44, 40, 36, 32, 28, 24, 20, 16, 13, 10]) {
    addScenarioEpisodes({ conditionKey: 'dengue', district: 'Gampaha', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: ago, count: 1, scenario: 'Gampaha-Dengue-Baseline' });
  }
  // 7-day Window: 12 cases (3, 4, 3, 2 across days -4, -3, -2, -1)
  addScenarioEpisodes({ conditionKey: 'dengue', district: 'Gampaha', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: 4, count: 3, scenario: 'Gampaha-Dengue-Window' });
  addScenarioEpisodes({ conditionKey: 'dengue', district: 'Gampaha', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: 3, count: 4, scenario: 'Gampaha-Dengue-Window' });
  addScenarioEpisodes({ conditionKey: 'dengue', district: 'Gampaha', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: 2, count: 3, scenario: 'Gampaha-Dengue-Window' });
  addScenarioEpisodes({ conditionKey: 'dengue', district: 'Gampaha', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: 1, count: 2, scenario: 'Gampaha-Dengue-Window' });

  // ── 2. Kandy Influenza (J11.1) — High (N=8 >= 5, 4 consecutive days z > 2.0, maxZ >= 3.0) ──
  // 56-day Baseline: 14 cases across days -52 to -10
  for (const ago of [52, 49, 46, 43, 39, 36, 33, 29, 26, 22, 19, 16, 13, 10]) {
    addScenarioEpisodes({ conditionKey: 'influenza', district: 'Kandy', icdCode: 'J11.1', icdDescription: 'Influenza with other respiratory manifestations', daysAgo: ago, count: 1, scenario: 'Kandy-Influenza-Baseline' });
  }
  // 7-day Window: 8 cases (2, 2, 2, 2 across days -4, -3, -2, -1)
  addScenarioEpisodes({ conditionKey: 'influenza', district: 'Kandy', icdCode: 'J11.1', icdDescription: 'Influenza with other respiratory manifestations', daysAgo: 4, count: 2, scenario: 'Kandy-Influenza-Window' });
  addScenarioEpisodes({ conditionKey: 'influenza', district: 'Kandy', icdCode: 'J11.1', icdDescription: 'Influenza with other respiratory manifestations', daysAgo: 3, count: 2, scenario: 'Kandy-Influenza-Window' });
  addScenarioEpisodes({ conditionKey: 'influenza', district: 'Kandy', icdCode: 'J11.1', icdDescription: 'Influenza with other respiratory manifestations', daysAgo: 2, count: 2, scenario: 'Kandy-Influenza-Window' });
  addScenarioEpisodes({ conditionKey: 'influenza', district: 'Kandy', icdCode: 'J11.1', icdDescription: 'Influenza with other respiratory manifestations', daysAgo: 1, count: 2, scenario: 'Kandy-Influenza-Window' });

  // ── 3. Galle Leptospirosis (A27) — High (N=7 >= 5, 3 consecutive days z > 2.0, maxZ >= 3.0) ──
  // 56-day Baseline: 10 cases across days -50 to -12
  for (const ago of [50, 46, 42, 38, 34, 30, 26, 22, 18, 12]) {
    addScenarioEpisodes({ conditionKey: 'leptospirosis', district: 'Galle', icdCode: 'A27', icdDescription: 'Leptospirosis', daysAgo: ago, count: 1, scenario: 'Galle-Lepto-Baseline' });
  }
  // 7-day Window: 7 cases (2, 3, 2 across days -3, -2, -1)
  addScenarioEpisodes({ conditionKey: 'leptospirosis', district: 'Galle', icdCode: 'A27', icdDescription: 'Leptospirosis', daysAgo: 3, count: 2, scenario: 'Galle-Lepto-Window' });
  addScenarioEpisodes({ conditionKey: 'leptospirosis', district: 'Galle', icdCode: 'A27', icdDescription: 'Leptospirosis', daysAgo: 2, count: 3, scenario: 'Galle-Lepto-Window' });
  addScenarioEpisodes({ conditionKey: 'leptospirosis', district: 'Galle', icdCode: 'A27', icdDescription: 'Leptospirosis', daysAgo: 1, count: 2, scenario: 'Galle-Lepto-Window' });

  // ── 4. Ratnapura Typhoid (A01) — Moderate (N=6 >= 5, 2 consecutive days z > 2.0, maxZ >= 2.0) ──
  // 56-day Baseline: 8 cases across days -52 to -14
  for (const ago of [52, 47, 41, 35, 29, 23, 18, 14]) {
    addScenarioEpisodes({ conditionKey: 'typhoid', district: 'Ratnapura', icdCode: 'A01', icdDescription: 'Typhoid and paratyphoid fevers', daysAgo: ago, count: 1, scenario: 'Ratnapura-Typhoid-Baseline' });
  }
  // 7-day Window: 6 cases (3, 3 across days -2, -1)
  addScenarioEpisodes({ conditionKey: 'typhoid', district: 'Ratnapura', icdCode: 'A01', icdDescription: 'Typhoid and paratyphoid fevers', daysAgo: 2, count: 3, scenario: 'Ratnapura-Typhoid-Window' });
  addScenarioEpisodes({ conditionKey: 'typhoid', district: 'Ratnapura', icdCode: 'A01', icdDescription: 'Typhoid and paratyphoid fevers', daysAgo: 1, count: 3, scenario: 'Ratnapura-Typhoid-Window' });

  // ── 5. Kalutara Dengue (A90) — Suppressed: Single-day spike (persistence not met) ──
  // 56-day Baseline: 12 cases across days -52 to -10
  for (const ago of [52, 48, 44, 40, 36, 32, 28, 24, 20, 16, 13, 10]) {
    addScenarioEpisodes({ conditionKey: 'dengue', district: 'Kalutara', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: ago, count: 1, scenario: 'Kalutara-SingleDaySpike-Baseline' });
  }
  // 7-day Window: 6 cases all concentrated on day -1 (single day spike)
  addScenarioEpisodes({ conditionKey: 'dengue', district: 'Kalutara', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: 1, count: 6, scenario: 'Kalutara-SingleDaySpike-Window' });

  // ── 6. Matara Dengue (A90) — Suppressed: Small cluster (N=4 < 5 case floor) ──
  // 56-day Baseline: 12 cases across days -52 to -10
  for (const ago of [52, 48, 44, 40, 36, 32, 28, 24, 20, 16, 13, 10]) {
    addScenarioEpisodes({ conditionKey: 'dengue', district: 'Matara', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: ago, count: 1, scenario: 'Matara-SmallCluster-Baseline' });
  }
  // 7-day Window: 4 cases across days -3, -2, -1 (floor not met)
  addScenarioEpisodes({ conditionKey: 'dengue', district: 'Matara', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: 3, count: 1, scenario: 'Matara-SmallCluster-Window' });
  addScenarioEpisodes({ conditionKey: 'dengue', district: 'Matara', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: 2, count: 2, scenario: 'Matara-SmallCluster-Window' });
  addScenarioEpisodes({ conditionKey: 'dengue', district: 'Matara', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: 1, count: 1, scenario: 'Matara-SmallCluster-Window' });

  // ── Deterministic Parent Entities (No fixed _id - MongoDB generates _id on insert) ──

  const parentHospitals = [
    {
      regNo: 'VIVA-OUTBREAK-HOSP-01',
      name: 'District General Hospital Gampaha',
      type: 'government',
      district: 'Gampaha',
      address: 'Hospital Road, Gampaha',
      email: 'viva.outbreak.hosp.01@qa.medisync.local',
      password: DUMMY_SYNTHETIC_PASSWORD_HASH,
      emergencyHotline: '033-2222261',
      contactPhone: '033-2222262',
      isActive: true,
      isVerified: true,
      isSynthetic: true,
      syntheticSeedBatch: BATCH_TAG,
    },
    {
      regNo: 'VIVA-OUTBREAK-HOSP-02',
      name: 'Kandy Teaching Hospital',
      type: 'government',
      district: 'Kandy',
      address: 'Hospital Road, Kandy',
      email: 'viva.outbreak.hosp.02@qa.medisync.local',
      password: DUMMY_SYNTHETIC_PASSWORD_HASH,
      emergencyHotline: '081-2222261',
      contactPhone: '081-2222262',
      isActive: true,
      isVerified: true,
      isSynthetic: true,
      syntheticSeedBatch: BATCH_TAG,
    },
    {
      regNo: 'VIVA-OUTBREAK-HOSP-03',
      name: 'Karapitiya Teaching Hospital Galle',
      type: 'government',
      district: 'Galle',
      address: 'Karapitiya, Galle',
      email: 'viva.outbreak.hosp.03@qa.medisync.local',
      password: DUMMY_SYNTHETIC_PASSWORD_HASH,
      emergencyHotline: '091-2222261',
      contactPhone: '091-2222262',
      isActive: true,
      isVerified: true,
      isSynthetic: true,
      syntheticSeedBatch: BATCH_TAG,
    },
  ];

  const parentDoctors = [
    {
      doctorId: `${BATCH_TAG}-DOC-01`,
      fullName: 'Dr. Kasun Perera',
      email: 'dr.kasun.outbreaks@qa.medisync.local',
      slmcNumber: 'SLMC-98101',
      licenseNo: 'SLMC-98101',
      specialization: 'Epidemiology',
      password: DUMMY_SYNTHETIC_PASSWORD_HASH,
      district: 'Gampaha',
      targetHospitalRegNo: 'VIVA-OUTBREAK-HOSP-01',
      isActive: true,
      isVerified: true,
      isSynthetic: true,
      syntheticSeedBatch: BATCH_TAG,
    },
    {
      doctorId: `${BATCH_TAG}-DOC-02`,
      fullName: 'Dr. Anoma Wijesinghe',
      email: 'dr.anoma.outbreaks@qa.medisync.local',
      slmcNumber: 'SLMC-98102',
      licenseNo: 'SLMC-98102',
      specialization: 'Pulmonology',
      password: DUMMY_SYNTHETIC_PASSWORD_HASH,
      district: 'Kandy',
      targetHospitalRegNo: 'VIVA-OUTBREAK-HOSP-02',
      isActive: true,
      isVerified: true,
      isSynthetic: true,
      syntheticSeedBatch: BATCH_TAG,
    },
    {
      doctorId: `${BATCH_TAG}-DOC-03`,
      fullName: 'Dr. Chandana Jayasuriya',
      email: 'dr.chandana.outbreaks@qa.medisync.local',
      slmcNumber: 'SLMC-98103',
      licenseNo: 'SLMC-98103',
      specialization: 'Infectious Diseases',
      password: DUMMY_SYNTHETIC_PASSWORD_HASH,
      district: 'Galle',
      targetHospitalRegNo: 'VIVA-OUTBREAK-HOSP-03',
      isActive: true,
      isVerified: true,
      isSynthetic: true,
      syntheticSeedBatch: BATCH_TAG,
    },
  ];

  const parentPatients = Array.from({ length: 12 }, (_, i) => {
    const pIdx = i + 1;
    const nic = `9990${String(pIdx).padStart(8, '0')}`;
    return {
      nic,
      fullName: `Surveillance Case Subject ${pIdx}`,
      email: `viva.outbreak.patient.${pIdx}@qa.medisync.local`,
      password: DUMMY_SYNTHETIC_PASSWORD_HASH,
      district: ['Gampaha', 'Kandy', 'Galle', 'Ratnapura', 'Kalutara', 'Matara'][i % 6],
      isActive: true,
      isSynthetic: true,
      syntheticSeedBatch: BATCH_TAG,
      ...writeNicFields(nic),
    };
  });

  // Map planned episodes to Consultation documents
  const consultations = episodes.map((ep, idx) => {
    const consultationId = `${BATCH_TAG}-CON-${String(idx + 1).padStart(4, '0')}`;
    const minuteOfDay = 510 + ((idx * 19) % 480);
    const episodeDate = new Date(todayMidnight - ep.daysAgo * DAY_MS + minuteOfDay * 60000);
    const episodeId = `EP-${ep.district}-${episodeDate.toISOString().slice(0, 10)}-${String(idx + 1).padStart(4, '0')}`;

    const pat = parentPatients[idx % parentPatients.length];
    const doc = parentDoctors[idx % parentDoctors.length];
    const hosp = parentHospitals[idx % parentHospitals.length];

    return {
      consultationId,
      targetPatientNic: pat.nic,
      targetDoctorId: doc.doctorId,
      targetHospitalRegNo: hosp.regNo,
      patientNic: pat.nic,
      ...writeNicFields(pat.nic),
      diagnosis: ep.icdDescription,
      icdCode: ep.icdCode,
      icdDescription: ep.icdDescription,
      icdVersion: ep.icdVersion,
      symptoms: ['Fever', 'Headache', 'Malaise'],
      district: ep.district,
      notes: `Surveillance case recorded for outbreak modeling (${ep.scenario}).`,
      isSynthetic: true,
      syntheticSeedBatch: BATCH_TAG,
      surveillanceVerification: {
        status: 'verified',
        diagnosisStatus: 'confirmed',
        source: 'clinical_review',
        verifiedBy: BATCH_TAG,
        verifiedAt: episodeDate,
        episodeId,
        caseDefinitionReference: 'SL-EPID-CASE-DEF-V1',
      },
      createdAt: episodeDate,
      updatedAt: episodeDate,
    };
  });

  return {
    referenceDate,
    consultations,
    parentDoctors,
    parentPatients,
    parentHospitals,
    totalConsultations: consultations.length,
  };
}

async function preflightCollisionCheck(db, plan) {
  const collisions = [];

  // 1. Check Hospitals for collisions on regNo or email
  const hospRegNos = plan.parentHospitals.map(h => h.regNo);
  const hospEmails = plan.parentHospitals.map(h => h.email);
  const existingHospitals = await db.collection('hospitals').find({
    $or: [
      { regNo: { $in: hospRegNos } },
      { email: { $in: hospEmails } },
    ]
  }).toArray();

  for (const doc of existingHospitals) {
    const isOurBatch = doc.syntheticSeedBatch === BATCH_TAG && doc.isSynthetic === true;
    if (!isOurBatch) {
      collisions.push({
        collection: 'hospitals',
        field: hospRegNos.includes(doc.regNo) ? 'regNo' : 'email',
        value: hospRegNos.includes(doc.regNo) ? doc.regNo : doc.email,
        existingId: String(doc._id),
        existingSeedBatch: doc.syntheticSeedBatch || 'none',
        reason: 'Collides with pre-existing non-batch hospital',
      });
    }
  }

  // 2. Check Doctors for collisions on doctorId or email
  const docIds = plan.parentDoctors.map(d => d.doctorId);
  const docEmails = plan.parentDoctors.map(d => d.email);
  const existingDoctors = await db.collection('doctors').find({
    $or: [
      { doctorId: { $in: docIds } },
      { email: { $in: docEmails } },
    ]
  }).toArray();

  for (const doc of existingDoctors) {
    const isOurBatch = doc.syntheticSeedBatch === BATCH_TAG && doc.isSynthetic === true;
    if (!isOurBatch) {
      collisions.push({
        collection: 'doctors',
        field: docIds.includes(doc.doctorId) ? 'doctorId' : 'email',
        value: docIds.includes(doc.doctorId) ? doc.doctorId : doc.email,
        existingId: String(doc._id),
        existingSeedBatch: doc.syntheticSeedBatch || 'none',
        reason: 'Collides with pre-existing non-batch doctor',
      });
    }
  }

  // 3. Check Patients for collisions on patientNic_bi, nic, or email
  const patBis = plan.parentPatients.map(p => p.patientNic_bi).filter(Boolean);
  const patNics = plan.parentPatients.map(p => p.nic);
  const patEmails = plan.parentPatients.map(p => p.email);
  const existingPatients = await db.collection('patients').find({
    $or: [
      { patientNic_bi: { $in: patBis } },
      { nic: { $in: patNics } },
      { email: { $in: patEmails } },
    ]
  }).toArray();

  for (const doc of existingPatients) {
    const isOurBatch = doc.syntheticSeedBatch === BATCH_TAG && doc.isSynthetic === true;
    if (!isOurBatch) {
      const field = (doc.patientNic_bi && patBis.includes(doc.patientNic_bi))
        ? 'patientNic_bi'
        : (doc.nic && patNics.includes(doc.nic))
        ? 'nic'
        : 'email';
      collisions.push({
        collection: 'patients',
        field,
        value: doc[field] || doc.nic,
        existingId: String(doc._id),
        existingSeedBatch: doc.syntheticSeedBatch || 'none',
        reason: 'Collides with pre-existing non-batch patient',
      });
    }
  }

  // 4. Check Consultations for collisions on consultationId
  const conIds = plan.consultations.map(c => c.consultationId);
  const existingConsultations = await db.collection('consultations').find({
    consultationId: { $in: conIds }
  }).toArray();

  for (const doc of existingConsultations) {
    const isOurBatch = doc.syntheticSeedBatch === BATCH_TAG && doc.isSynthetic === true;
    if (!isOurBatch) {
      collisions.push({
        collection: 'consultations',
        field: 'consultationId',
        value: doc.consultationId,
        existingId: String(doc._id),
        existingSeedBatch: doc.syntheticSeedBatch || 'none',
        reason: 'Collides with pre-existing non-batch consultation',
      });
    }
  }

  return collisions;
}

async function dryRunInspect(db, plan) {
  const collisions = await preflightCollisionCheck(db, plan);
  if (collisions.length > 0) {
    const err = new Error(`PRE_FLIGHT_COLLISION_DETECTED: ${collisions.length} collision(s) detected with pre-existing non-batch documents.`);
    err.collisions = collisions;
    throw err;
  }

  // Count existing in-batch documents across each collection
  const hospRegNos = plan.parentHospitals.map(h => h.regNo);
  const docIds = plan.parentDoctors.map(d => d.doctorId);
  const patBis = plan.parentPatients.map(p => p.patientNic_bi).filter(Boolean);
  const conIds = plan.consultations.map(c => c.consultationId);

  const existingHospitals = await db.collection('hospitals').find({
    regNo: { $in: hospRegNos },
    syntheticSeedBatch: BATCH_TAG,
    isSynthetic: true,
  }).toArray();

  const existingDoctors = await db.collection('doctors').find({
    doctorId: { $in: docIds },
    syntheticSeedBatch: BATCH_TAG,
    isSynthetic: true,
  }).toArray();

  const existingPatients = await db.collection('patients').find({
    $or: [
      { patientNic_bi: { $in: patBis } },
      { nic: { $in: plan.parentPatients.map(p => p.nic) } },
    ],
    syntheticSeedBatch: BATCH_TAG,
    isSynthetic: true,
  }).toArray();

  const existingConsultations = await db.collection('consultations').find({
    consultationId: { $in: conIds },
    syntheticSeedBatch: BATCH_TAG,
    isSynthetic: true,
  }).toArray();

  return {
    hospitals: {
      planned: plan.parentHospitals.length,
      alreadyExist: existingHospitals.length,
      wouldInsert: plan.parentHospitals.length - existingHospitals.length,
      existingIds: existingHospitals.map(d => String(d._id)),
    },
    doctors: {
      planned: plan.parentDoctors.length,
      alreadyExist: existingDoctors.length,
      wouldInsert: plan.parentDoctors.length - existingDoctors.length,
      existingIds: existingDoctors.map(d => String(d._id)),
    },
    patients: {
      planned: plan.parentPatients.length,
      alreadyExist: existingPatients.length,
      wouldInsert: plan.parentPatients.length - existingPatients.length,
      existingIds: existingPatients.map(d => String(d._id)),
    },
    consultations: {
      planned: plan.consultations.length,
      alreadyExist: existingConsultations.length,
      wouldInsert: plan.consultations.length - existingConsultations.length,
      existingIds: existingConsultations.map(d => String(d._id)),
    },
  };
}

async function seedOutbreakDocuments(db, plan) {
  // Pre-flight collision check
  const collisions = await preflightCollisionCheck(db, plan);
  if (collisions.length > 0) {
    console.error(`\n❌ PRE-FLIGHT COLLISION CHECK FAILED (${collisions.length} collision(s) detected):`);
    for (const c of collisions) {
      console.error(`   - [${c.collection}] ${c.field}="${c.value}" collides with existing _id=${c.existingId} (batch: ${c.existingSeedBatch})`);
    }
    const err = new Error(`PRE_FLIGHT_COLLISION_DETECTED: ${collisions.length} collision(s) in parent or target collections`);
    err.collisions = collisions;
    throw err;
  }

  const report = {
    hospitals: { planned: plan.parentHospitals.length, inserted: 0, existing: 0, regNos: [] },
    doctors: { planned: plan.parentDoctors.length, inserted: 0, existing: 0, doctorIds: [] },
    patients: { planned: plan.parentPatients.length, inserted: 0, existing: 0, nics: [] },
    consultations: { planned: plan.consultations.length, inserted: 0, existing: 0 },
  };

  const hospitalMap = new Map(); // regNo -> _id
  const doctorMap = new Map();   // doctorId -> _id
  const patientMap = new Map();  // nic -> _id

  // 1. Insert parent hospitals: keyed on synthetic regNo (idempotent, insert-only)
  for (const hosp of plan.parentHospitals) {
    report.hospitals.regNos.push(hosp.regNo);
    const insertDoc = { ...hosp, isSynthetic: true, syntheticSeedBatch: BATCH_TAG };
    delete insertDoc._id; // Ensure MongoDB generates _id!

    const res = await db.collection('hospitals').updateOne(
      { regNo: hosp.regNo },
      { $setOnInsert: insertDoc },
      { upsert: true }
    );
    if (res.upsertedCount > 0) {
      report.hospitals.inserted++;
    } else {
      report.hospitals.existing++;
    }

    const found = await db.collection('hospitals').findOne(
      { regNo: hosp.regNo },
      { projection: { _id: 1, regNo: 1 } }
    );
    if (!found || !found._id) throw new Error(`FAILED_TO_RESOLVE_HOSPITAL_ID for ${hosp.regNo}`);
    hospitalMap.set(hosp.regNo, found._id);
  }

  // 2. Insert parent doctors: keyed on synthetic doctorId (idempotent, insert-only)
  for (const doc of plan.parentDoctors) {
    report.doctors.doctorIds.push(doc.doctorId);
    const resolvedHospId = hospitalMap.get(doc.targetHospitalRegNo);
    const insertDoc = {
      ...doc,
      hospitals: resolvedHospId ? [resolvedHospId] : [],
      isSynthetic: true,
      syntheticSeedBatch: BATCH_TAG,
    };
    delete insertDoc._id; // Ensure MongoDB generates _id!
    delete insertDoc.targetHospitalRegNo;

    const res = await db.collection('doctors').updateOne(
      { doctorId: doc.doctorId },
      { $setOnInsert: insertDoc },
      { upsert: true }
    );
    if (res.upsertedCount > 0) {
      report.doctors.inserted++;
    } else {
      report.doctors.existing++;
    }

    const found = await db.collection('doctors').findOne(
      { doctorId: doc.doctorId },
      { projection: { _id: 1, doctorId: 1 } }
    );
    if (!found || !found._id) throw new Error(`FAILED_TO_RESOLVE_DOCTOR_ID for ${doc.doctorId}`);
    doctorMap.set(doc.doctorId, found._id);
  }

  // 3. Insert parent patients: keyed on patientNic_bi or nic (idempotent, insert-only)
  for (const pat of plan.parentPatients) {
    report.patients.nics.push(pat.nic);
    const insertDoc = { ...pat, isSynthetic: true, syntheticSeedBatch: BATCH_TAG };
    delete insertDoc._id; // Ensure MongoDB generates _id!

    const patFilter = {
      $or: [
        { patientNic_bi: pat.patientNic_bi },
        { nic: pat.nic },
      ],
    };

    const res = await db.collection('patients').updateOne(
      patFilter,
      { $setOnInsert: insertDoc },
      { upsert: true }
    );
    if (res.upsertedCount > 0) {
      report.patients.inserted++;
    } else {
      report.patients.existing++;
    }

    const found = await db.collection('patients').findOne(
      patFilter,
      { projection: { _id: 1, nic: 1, patientNic_bi: 1 } }
    );
    if (!found || !found._id) throw new Error(`FAILED_TO_RESOLVE_PATIENT_ID for ${pat.nic}`);
    patientMap.set(pat.nic, found._id);
  }

  // 4. Insert consultations: keyed on synthetic consultationId (idempotent, insert-only)
  for (const c of plan.consultations) {
    const resolvedPatientId = patientMap.get(c.targetPatientNic);
    const resolvedDoctorId = doctorMap.get(c.targetDoctorId);
    const resolvedHospitalId = hospitalMap.get(c.targetHospitalRegNo);

    if (!resolvedPatientId) throw new Error(`MISSING_PARENT_PATIENT_ID for consultation ${c.consultationId}`);
    if (!resolvedDoctorId) throw new Error(`MISSING_PARENT_DOCTOR_ID for consultation ${c.consultationId}`);
    if (!resolvedHospitalId) throw new Error(`MISSING_PARENT_HOSPITAL_ID for consultation ${c.consultationId}`);

    const insertDoc = {
      ...c,
      patientId: resolvedPatientId,
      doctorId: resolvedDoctorId,
      hospitalId: resolvedHospitalId,
      isSynthetic: true,
      syntheticSeedBatch: BATCH_TAG,
    };
    delete insertDoc._id; // Ensure MongoDB generates _id!
    delete insertDoc.targetPatientNic;
    delete insertDoc.targetDoctorId;
    delete insertDoc.targetHospitalRegNo;

    const res = await db.collection('consultations').updateOne(
      { consultationId: c.consultationId },
      { $setOnInsert: insertDoc },
      { upsert: true }
    );
    if (res.upsertedCount > 0) {
      report.consultations.inserted++;
    } else {
      report.consultations.existing++;
    }
  }

  return report;
}

async function runSeeder() {
  const args = parseCliArgs();
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('ERROR: MONGODB_URI not configured in server/.env');
    process.exit(1);
  }

  const dbName = extractDatabaseName(uri, args.targetDb);

  console.log(`=== MediSync Multi-Disease Outbreak Seeder ===`);
  console.log(`Batch Namespace: ${BATCH_TAG}`);
  console.log(`Target Database: ${dbName}${args.targetDb ? ' (manual override)' : ''}`);
  console.log(`Mode:            ${args.confirm ? 'LIVE CONFIRM (WRITING)' : 'CONNECTED DRY-RUN (READ-ONLY)'}\n`);

  const plan = buildOutbreakSeedPlan(new Date());
  console.log(`Planned Consultations: ${plan.totalConsultations}`);
  console.log(`Parent Accounts:       ${plan.parentDoctors.length} Doctors, ${plan.parentPatients.length} Patients, ${plan.parentHospitals.length} Hospitals\n`);

  // Run mathematical proof against Stage D outbreak detector
  console.log(`--- Running Mathematical Proof (evaluateOutbreakCriteria) ---`);
  const proofCases = plan.consultations.map(c => ({
    consultationId: c.consultationId,
    diseaseId: `ICD10:${c.icdCode.replace('.', '')}`,
    disease: `ICD10:${c.icdCode.replace('.', '')}`,
    district: c.district,
    time: c.createdAt.getTime(),
    createdAt: c.createdAt,
  }));

  const criteriaResults = evaluateOutbreakCriteria({
    cases: proofCases,
    now: plan.referenceDate,
    baselineDays: 56,
    level: 'district',
  });

  const scenarioVerification = {
    'Gampaha Dengue': criteriaResults.find(r => r.district === 'Gampaha' && r.disease === 'ICD10:A90'),
    'Kandy Influenza': criteriaResults.find(r => r.district === 'Kandy' && r.disease === 'ICD10:J111'),
    'Galle Leptospirosis': criteriaResults.find(r => r.district === 'Galle' && r.disease === 'ICD10:A27'),
    'Ratnapura Typhoid': criteriaResults.find(r => r.district === 'Ratnapura' && r.disease === 'ICD10:A01'),
    'Kalutara Dengue': criteriaResults.find(r => r.district === 'Kalutara' && r.disease === 'ICD10:A90'),
    'Matara Dengue': criteriaResults.find(r => r.district === 'Matara' && r.disease === 'ICD10:A90'),
  };

  for (const [name, res] of Object.entries(scenarioVerification)) {
    if (!res) {
      console.log(`❌ ${name}: NOT EVALUATED`);
      continue;
    }
    const statusStr = res.triggered ? `TRIGGERED (${res.severity}, maxZ=${res.maxZ})` : `SUPPRESSED (${res.reason})`;
    console.log(`✔ ${name.padEnd(22)}: ${statusStr}`);
  }

  if (args.verifyOnly) {
    console.log(`\nVerification complete. Exiting.`);
    return;
  }

  // Connect to database (both dry-run and live confirm connect)
  console.log(`\nConnecting to database '${dbName}'...`);
  await mongoose.connect(uri, { dbName });
  const db = mongoose.connection.db;

  try {
    if (args.dryRun) {
      console.log(`Executing connected pre-flight collision check and dry-run inspection...`);
      const inspection = await dryRunInspect(db, plan);

      console.log(`\n=== Connected Dry-Run Inspection Receipt ===`);
      console.log(`Target Database: ${dbName}`);
      console.log(`Hospitals:     ${inspection.hospitals.alreadyExist} already exist, ${inspection.hospitals.wouldInsert} would be inserted (planned: ${inspection.hospitals.planned})`);
      console.log(`Doctors:       ${inspection.doctors.alreadyExist} already exist, ${inspection.doctors.wouldInsert} would be inserted (planned: ${inspection.doctors.planned})`);
      console.log(`Patients:      ${inspection.patients.alreadyExist} already exist, ${inspection.patients.wouldInsert} would be inserted (planned: ${inspection.patients.planned})`);
      console.log(`Consultations: ${inspection.consultations.alreadyExist} already exist, ${inspection.consultations.wouldInsert} would be inserted (planned: ${inspection.consultations.planned})`);

      recordDryRunSession(dbName, inspection);
      console.log(`\n[DRY-RUN] Connected verification passed. 0 database writes executed.`);
      if (dbName === 'medisync_prod') {
        console.log(`Dry-run session recorded. You may now execute: node scripts/seed_viva_outbreaks.js --confirm`);
      } else {
        console.log(`Dry-run session recorded. You may execute: node scripts/seed_viva_outbreaks.js --confirm --db=${dbName}`);
      }
      return;
    }

    // Live execution with --confirm
    if (dbName === 'medisync_prod' && !verifyDryRunSession(dbName)) {
      console.error(`\n❌ ERROR: Refusing to run --confirm against production database '${dbName}'.`);
      console.error(`A successful connected dry-run for '${dbName}' must be executed in the same session first.`);
      console.error(`Please run: node scripts/seed_viva_outbreaks.js\nReview the output, then re-run with --confirm.`);
      process.exit(1);
    }

    console.log(`Executing insert-only seeding against '${dbName}'...`);
    const report = await seedOutbreakDocuments(db, plan);

    console.log(`\n=== Seed Execution Complete ===`);
    console.log(`Target Database: ${dbName}`);
    console.log(`Hospitals:     ${report.hospitals.inserted} inserted, ${report.hospitals.existing} already existed (regNos: ${report.hospitals.regNos.join(', ')})`);
    console.log(`Doctors:       ${report.doctors.inserted} inserted, ${report.doctors.existing} already existed (doctorIds: ${report.doctors.doctorIds.join(', ')})`);
    console.log(`Patients:      ${report.patients.inserted} inserted, ${report.patients.existing} already existed (${report.patients.nics.length} NICs)`);
    console.log(`Consultations: ${report.consultations.inserted} inserted, ${report.consultations.existing} already existed (planned: ${report.consultations.planned})`);

    clearDryRunSession();
  } finally {
    await mongoose.disconnect();
    console.log(`Disconnected from database.`);
  }
}

if (require.main === module) {
  runSeeder().catch(err => {
    console.error('\nSeeder failed:', err);
    process.exit(1);
  });
}

module.exports = {
  buildOutbreakSeedPlan,
  BATCH_TAG,
  parseCliArgs,
  extractDatabaseName,
  preflightCollisionCheck,
  dryRunInspect,
  seedOutbreakDocuments,
  recordDryRunSession,
  verifyDryRunSession,
  clearDryRunSession,
  DRYRUN_SESSION_FILE,
};
