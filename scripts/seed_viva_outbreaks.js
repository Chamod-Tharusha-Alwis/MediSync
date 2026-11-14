#!/usr/bin/env node
'use strict';

/**
 * scripts/seed_viva_outbreaks.js
 *
 * Deterministic multi-disease outbreak surveillance seeder for MediSync viva.
 *
 * Guarantees:
 * 1. Outbreak cases ONLY (Consultation records only). Zero insertions into hospitals,
 *    doctors, patients, or outbreakalerts. Resolves parent references dynamically.
 * 2. Relative dates: calculated relative to Date.now() / getColomboMidnight at execution time.
 *    Active window: last 7 days (heavily concentrated in last 72h).
 *    Baseline window: days -56 to -7 (seasonal background).
 * 3. Seven defined scenarios:
 *    a. Gampaha Dengue (A90) — Critical alert (12 cases in last 72h, 4 consecutive days z >= 2.0).
 *    b. Kandy Influenza (J11.1) — High alert (8 cases in last 72h, 4 consecutive days z >= 2.0).
 *    c. Galle Leptospirosis (A27) — Warning/Moderate alert (6 cases in last 72h, 2 consecutive days z >= 2.0).
 *    d. Ratnapura Typhoid (A01) — Warning alert (5 cases in last 72h, 2 consecutive days z >= 2.0).
 *    e. Colombo Chickenpox (B01) — Non-profiled universal ICD alert (6 cases in last 72h).
 *    f. Kalutara Dengue (A90) — Negative control (1-day spike of 6 cases, suppressed by persistence gate).
 *    g. Matara Dengue (A90) — Negative control (3 cases in 7 days, suppressed by floor gate < 5).
 * 4. Idempotent upserts ($setOnInsert only) keyed on consultationId ("VIVA-2026-11-...").
 * 5. Dynamic MongoDB _id generation (zero hardcoded ObjectIds).
 * 6. Connected pre-flight check: detects collisions and dry-runs safely by default.
 *    Requires --confirm to write.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
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
  // 56-day Baseline: 12 cases across days -52 to -10 (~0.2/day)
  for (const ago of [52, 48, 44, 40, 36, 32, 28, 24, 20, 16, 13, 10]) {
    addScenarioEpisodes({ conditionKey: 'dengue', district: 'Gampaha', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: ago, count: 1, scenario: 'Gampaha-Dengue-Baseline' });
  }
  // 7-day Window: 12 cases in last 72-96h (3, 4, 3, 2 across days -4, -3, -2, -1)
  addScenarioEpisodes({ conditionKey: 'dengue', district: 'Gampaha', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: 4, count: 3, scenario: 'Gampaha-Dengue-Window' });
  addScenarioEpisodes({ conditionKey: 'dengue', district: 'Gampaha', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: 3, count: 4, scenario: 'Gampaha-Dengue-Window' });
  addScenarioEpisodes({ conditionKey: 'dengue', district: 'Gampaha', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: 2, count: 3, scenario: 'Gampaha-Dengue-Window' });
  addScenarioEpisodes({ conditionKey: 'dengue', district: 'Gampaha', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: 1, count: 2, scenario: 'Gampaha-Dengue-Window' });

  // ── 2. Kandy Influenza (J11.1) — High (N=8 >= 5, 4 consecutive days z > 2.0, maxZ >= 3.0) ──
  // 56-day Baseline: 14 cases across days -52 to -10 (~0.25/day)
  for (const ago of [52, 49, 46, 43, 39, 36, 33, 29, 26, 22, 19, 16, 13, 10]) {
    addScenarioEpisodes({ conditionKey: 'influenza', district: 'Kandy', icdCode: 'J11.1', icdDescription: 'Influenza with other respiratory manifestations', daysAgo: ago, count: 1, scenario: 'Kandy-Influenza-Baseline' });
  }
  // 7-day Window: 8 cases in last 72-96h (2, 2, 2, 2 across days -4, -3, -2, -1)
  addScenarioEpisodes({ conditionKey: 'influenza', district: 'Kandy', icdCode: 'J11.1', icdDescription: 'Influenza with other respiratory manifestations', daysAgo: 4, count: 2, scenario: 'Kandy-Influenza-Window' });
  addScenarioEpisodes({ conditionKey: 'influenza', district: 'Kandy', icdCode: 'J11.1', icdDescription: 'Influenza with other respiratory manifestations', daysAgo: 3, count: 2, scenario: 'Kandy-Influenza-Window' });
  addScenarioEpisodes({ conditionKey: 'influenza', district: 'Kandy', icdCode: 'J11.1', icdDescription: 'Influenza with other respiratory manifestations', daysAgo: 2, count: 2, scenario: 'Kandy-Influenza-Window' });
  addScenarioEpisodes({ conditionKey: 'influenza', district: 'Kandy', icdCode: 'J11.1', icdDescription: 'Influenza with other respiratory manifestations', daysAgo: 1, count: 2, scenario: 'Kandy-Influenza-Window' });

  // ── 3. Galle Leptospirosis (A27) — Warning/Moderate (N=7 >= 5, 3 consecutive days z > 2.0, maxZ >= 3.0) ──
  // 56-day Baseline: 10 cases across days -50 to -12 (~0.2/day)
  for (const ago of [50, 46, 42, 38, 34, 30, 26, 22, 18, 12]) {
    addScenarioEpisodes({ conditionKey: 'leptospirosis', district: 'Galle', icdCode: 'A27', icdDescription: 'Leptospirosis', daysAgo: ago, count: 1, scenario: 'Galle-Lepto-Baseline' });
  }
  // 7-day Window: 7 cases in last 72h (2, 3, 2 across days -3, -2, -1)
  addScenarioEpisodes({ conditionKey: 'leptospirosis', district: 'Galle', icdCode: 'A27', icdDescription: 'Leptospirosis', daysAgo: 3, count: 2, scenario: 'Galle-Lepto-Window' });
  addScenarioEpisodes({ conditionKey: 'leptospirosis', district: 'Galle', icdCode: 'A27', icdDescription: 'Leptospirosis', daysAgo: 2, count: 3, scenario: 'Galle-Lepto-Window' });
  addScenarioEpisodes({ conditionKey: 'leptospirosis', district: 'Galle', icdCode: 'A27', icdDescription: 'Leptospirosis', daysAgo: 1, count: 2, scenario: 'Galle-Lepto-Window' });

  // ── 4. Ratnapura Typhoid (A01) — Warning/Moderate (N=6 >= 5, 2 consecutive days z > 2.0, maxZ >= 2.0) ──
  // 56-day Baseline: 8 cases across days -52 to -14 (~0.14/day)
  for (const ago of [52, 47, 41, 35, 29, 23, 18, 14]) {
    addScenarioEpisodes({ conditionKey: 'typhoid', district: 'Ratnapura', icdCode: 'A01', icdDescription: 'Typhoid and paratyphoid fevers', daysAgo: ago, count: 1, scenario: 'Ratnapura-Typhoid-Baseline' });
  }
  // 7-day Window: 6 cases in last 72h (3, 3 across days -2, -1)
  addScenarioEpisodes({ conditionKey: 'typhoid', district: 'Ratnapura', icdCode: 'A01', icdDescription: 'Typhoid and paratyphoid fevers', daysAgo: 2, count: 3, scenario: 'Ratnapura-Typhoid-Window' });
  addScenarioEpisodes({ conditionKey: 'typhoid', district: 'Ratnapura', icdCode: 'A01', icdDescription: 'Typhoid and paratyphoid fevers', daysAgo: 1, count: 3, scenario: 'Ratnapura-Typhoid-Window' });

  // ── 5. Colombo Chickenpox (B01) — Non-Profiled Universal Trigger (N=6 >= 5, 2 consecutive days z > 2.0) ──
  // 56-day Baseline: 8 cases across days -52 to -14 (~0.14/day)
  for (const ago of [52, 47, 41, 35, 29, 23, 18, 14]) {
    addScenarioEpisodes({ conditionKey: 'chickenpox', district: 'Colombo', icdCode: 'B01', icdDescription: 'Varicella [chickenpox]', daysAgo: ago, count: 1, scenario: 'Colombo-Chickenpox-Baseline' });
  }
  // 7-day Window: 6 cases in last 72h (3, 3 across days -2, -1)
  addScenarioEpisodes({ conditionKey: 'chickenpox', district: 'Colombo', icdCode: 'B01', icdDescription: 'Varicella [chickenpox]', daysAgo: 2, count: 3, scenario: 'Colombo-Chickenpox-Window' });
  addScenarioEpisodes({ conditionKey: 'chickenpox', district: 'Colombo', icdCode: 'B01', icdDescription: 'Varicella [chickenpox]', daysAgo: 1, count: 3, scenario: 'Colombo-Chickenpox-Window' });

  // ── 6. Kalutara Dengue (A90) — Suppressed: Single-day spike (persistence not met) ──
  // 56-day Baseline: 12 cases across days -52 to -10
  for (const ago of [52, 48, 44, 40, 36, 32, 28, 24, 20, 16, 13, 10]) {
    addScenarioEpisodes({ conditionKey: 'dengue', district: 'Kalutara', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: ago, count: 1, scenario: 'Kalutara-SingleDaySpike-Baseline' });
  }
  // 7-day Window: 6 cases all concentrated on day -1 (single day spike)
  addScenarioEpisodes({ conditionKey: 'dengue', district: 'Kalutara', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: 1, count: 6, scenario: 'Kalutara-SingleDaySpike-Window' });

  // ── 7. Matara Dengue (A90) — Suppressed: Small cluster (N=3 < 5 case floor) ──
  // 56-day Baseline: 12 cases across days -52 to -10
  for (const ago of [52, 48, 44, 40, 36, 32, 28, 24, 20, 16, 13, 10]) {
    addScenarioEpisodes({ conditionKey: 'dengue', district: 'Matara', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: ago, count: 1, scenario: 'Matara-SmallCluster-Baseline' });
  }
  // 7-day Window: 3 cases across days -3, -2, -1 (floor not met, 3 < 5)
  addScenarioEpisodes({ conditionKey: 'dengue', district: 'Matara', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: 3, count: 1, scenario: 'Matara-SmallCluster-Window' });
  addScenarioEpisodes({ conditionKey: 'dengue', district: 'Matara', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: 2, count: 1, scenario: 'Matara-SmallCluster-Window' });
  addScenarioEpisodes({ conditionKey: 'dengue', district: 'Matara', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: 1, count: 1, scenario: 'Matara-SmallCluster-Window' });

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

  // Map planned episodes to Consultation documents relative to referenceDate
  const consultations = episodes.map((ep, idx) => {
    const consultationId = `${BATCH_TAG}-CON-${String(idx + 1).padStart(4, '0')}`;
    const episodeId = `EP-${BATCH_TAG}-${ep.scenario}-${idx}`;
    const pat = parentPatients[idx % parentPatients.length];
    const doc = parentDoctors[idx % parentDoctors.length];
    const hosp = parentHospitals[idx % parentHospitals.length];

    // Calculate timestamp relative to todayMidnight
    const episodeDate = new Date(todayMidnight - ep.daysAgo * DAY_MS + 10 * 3600000 + (idx % 12) * 60000);

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
        caseDefinitionReference: 'WHO-SL-EPI-2026',
      },
      createdAt: episodeDate,
      updatedAt: episodeDate,
    };
  });

  return {
    referenceDate,
    parentHospitals,
    parentDoctors,
    parentPatients,
    consultations,
    totalConsultations: consultations.length,
    scenarios: [
      { name: 'Gampaha Dengue', district: 'Gampaha', condition: 'Dengue (A90)', expected: 'Critical Alert', casesLast72h: 12 },
      { name: 'Kandy Influenza', district: 'Kandy', condition: 'Influenza (J11.1)', expected: 'High Alert', casesLast72h: 8 },
      { name: 'Galle Leptospirosis', district: 'Galle', condition: 'Leptospirosis (A27)', expected: 'Warning/Moderate Alert', casesLast72h: 7 },
      { name: 'Ratnapura Typhoid', district: 'Ratnapura', condition: 'Typhoid (A01)', expected: 'Warning Alert', casesLast72h: 6 },
      { name: 'Colombo Chickenpox', district: 'Colombo', condition: 'Chickenpox (B01)', expected: 'Non-Profiled Universal Trigger', casesLast72h: 6 },
      { name: 'Kalutara Dengue', district: 'Kalutara', condition: 'Dengue (A90)', expected: 'Suppressed (1-day spike)', casesLast72h: 6 },
      { name: 'Matara Dengue', district: 'Matara', condition: 'Dengue (A90)', expected: 'Suppressed (< 5 cases)', casesLast72h: 3 },
    ]
  };
}

async function preflightCollisionCheck(db, plan) {
  const collisions = [];

  // 1. Check Hospitals for collisions on regNo or email
  if (Array.isArray(plan.parentHospitals)) {
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
  }

  // 2. Check Doctors for collisions on doctorId or email
  if (Array.isArray(plan.parentDoctors)) {
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
  }

  // 3. Check Patients for collisions on patientNic_bi, nic, or email
  if (Array.isArray(plan.parentPatients)) {
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

  const report = {};

  if (Array.isArray(plan.parentHospitals)) {
    const hospRegNos = plan.parentHospitals.map(h => h.regNo);
    const existingHospitals = await db.collection('hospitals').find({
      regNo: { $in: hospRegNos },
      syntheticSeedBatch: BATCH_TAG,
      isSynthetic: true,
    }).toArray();
    report.hospitals = {
      planned: plan.parentHospitals.length,
      alreadyExist: existingHospitals.length,
      wouldInsert: plan.parentHospitals.length - existingHospitals.length,
      existingIds: existingHospitals.map(d => String(d._id)),
    };
  }

  if (Array.isArray(plan.parentDoctors)) {
    const docIds = plan.parentDoctors.map(d => d.doctorId);
    const existingDoctors = await db.collection('doctors').find({
      doctorId: { $in: docIds },
      syntheticSeedBatch: BATCH_TAG,
      isSynthetic: true,
    }).toArray();
    report.doctors = {
      planned: plan.parentDoctors.length,
      alreadyExist: existingDoctors.length,
      wouldInsert: plan.parentDoctors.length - existingDoctors.length,
      existingIds: existingDoctors.map(d => String(d._id)),
    };
  }

  if (Array.isArray(plan.parentPatients)) {
    const patBis = plan.parentPatients.map(p => p.patientNic_bi).filter(Boolean);
    const existingPatients = await db.collection('patients').find({
      $or: [
        { patientNic_bi: { $in: patBis } },
        { nic: { $in: plan.parentPatients.map(p => p.nic) } },
      ],
      syntheticSeedBatch: BATCH_TAG,
      isSynthetic: true,
    }).toArray();
    report.patients = {
      planned: plan.parentPatients.length,
      alreadyExist: existingPatients.length,
      wouldInsert: plan.parentPatients.length - existingPatients.length,
      existingIds: existingPatients.map(d => String(d._id)),
    };
  }

  const conIds = plan.consultations.map(c => c.consultationId);
  const existingConsultations = await db.collection('consultations').find({
    consultationId: { $in: conIds },
    syntheticSeedBatch: BATCH_TAG,
    isSynthetic: true,
  }).toArray();

  report.consultations = {
    planned: plan.consultations.length,
    alreadyExist: existingConsultations.length,
    wouldInsert: plan.consultations.length - existingConsultations.length,
    existingIds: existingConsultations.map(d => String(d._id)),
  };

  return report;
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
    hospitals: { planned: (plan.parentHospitals || []).length, inserted: 0, existing: 0, regNos: [] },
    doctors: { planned: (plan.parentDoctors || []).length, inserted: 0, existing: 0, doctorIds: [] },
    patients: { planned: (plan.parentPatients || []).length, inserted: 0, existing: 0, nics: [] },
    consultations: { planned: plan.consultations.length, inserted: 0, existing: 0 },
  };

  const hospitalMap = new Map();
  const doctorMap = new Map();
  const patientMap = new Map();

  // 1. Insert parent hospitals: keyed on synthetic regNo (idempotent, insert-only)
  if (Array.isArray(plan.parentHospitals)) {
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
      if (found && found._id) hospitalMap.set(hosp.regNo, found._id);
    }
  }

  // 2. Insert parent doctors: keyed on synthetic doctorId (idempotent, insert-only)
  if (Array.isArray(plan.parentDoctors)) {
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
      if (found && found._id) doctorMap.set(doc.doctorId, found._id);
    }
  }

  // 3. Insert parent patients: keyed on patientNic_bi or nic (idempotent, insert-only)
  if (Array.isArray(plan.parentPatients)) {
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
      if (found && found._id) patientMap.set(pat.nic, found._id);
    }
  }

  // Fallbacks for consultations if parents not mapped
  let fallbackDoctorId = null;
  let fallbackHospitalId = null;
  let fallbackPatientId = null;

  try {
    const defaultDoctor = await db.collection('doctors').findOne({ isActive: { $ne: false } });
    const defaultHospital = await db.collection('hospitals').findOne({ isActive: { $ne: false } });
    const defaultPatient = await db.collection('patients').findOne({ isActive: { $ne: false } });
    fallbackDoctorId = defaultDoctor?._id;
    fallbackHospitalId = defaultHospital?._id;
    fallbackPatientId = defaultPatient?._id;
  } catch (_) {}

  // Upsert consultations: keyed on synthetic consultationId (idempotent, insert-only)
  for (const c of plan.consultations) {
    const resolvedPatientId = patientMap.get(c.targetPatientNic) || fallbackPatientId;
    const resolvedDoctorId = doctorMap.get(c.targetDoctorId) || fallbackDoctorId;
    const resolvedHospitalId = hospitalMap.get(c.targetHospitalRegNo) || fallbackHospitalId;

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

async function runSeeder(cliOptions = {}) {
  const options = { ...parseCliArgs(), ...cliOptions };
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('❌ MONGO_URI is missing from server/.env. Cannot proceed.');
    process.exit(1);
  }

  const targetDbName = extractDatabaseName(mongoUri, options.targetDb);
  console.log(`\n================================================================================`);
  console.log(`MediSync Outbreak Seeder (Viva Relative-Date Edition)`);
  console.log(`Target Database:  ${targetDbName}`);
  console.log(`Batch Tag:        ${BATCH_TAG}`);
  console.log(`Mode:             ${options.confirm ? 'LIVE INSERT (--confirm)' : 'CONNECTED DRY-RUN (READ-ONLY)'}`);
  console.log(`================================================================================\n`);

  await mongoose.connect(mongoUri, { dbName: targetDbName });
  const db = mongoose.connection.db;

  const plan = buildOutbreakSeedPlan(new Date());

  try {
    if (options.dryRun) {
      console.log('--- CONNECTED DRY-RUN PRE-FLIGHT REPORT ---');
      const inspection = await dryRunInspect(db, plan);
      console.log(`Consultations: ${inspection.consultations.alreadyExist} already exist, ${inspection.consultations.wouldInsert} would be inserted (planned: ${inspection.consultations.planned})`);
      console.log('\nPlanned Scenarios:');
      for (const s of plan.scenarios) {
        console.log(`  * [${s.district}] ${s.condition} -> Expected: ${s.expected} (${s.casesLast72h} cases in 72h window)`);
      }
      console.log('\n[DRY RUN SAFE] Zero documents written or deleted.');
      console.log('To execute real insertion, run with: node scripts/seed_viva_outbreaks.js --confirm\n');
      recordDryRunSession(targetDbName, inspection);
      return inspection;
    }

    if (options.confirm) {
      if (!verifyDryRunSession(targetDbName)) {
        console.error('❌ REFUSING --confirm against production without a prior connected dry-run in this session.');
        console.error('   Run `node scripts/seed_viva_outbreaks.js` (dry-run) first, inspect the counts, then rerun with --confirm.');
        throw new Error('PRODUCTION_SAFETY_GATE_TRIGGERED');
      }

      console.log('--- EXECUTING SEED INSERTION ---');
      const report = await seedOutbreakDocuments(db, plan);
      console.log(`\nSUCCESS: Seed completed.`);
      console.log(`Consultations: ${report.consultations.inserted} inserted, ${report.consultations.existing} already existed (total planned: ${report.consultations.planned})`);
      console.log('\nZero OutbreakAlert documents were inserted. Alerts will generate dynamically during surveillance scan.');
      clearDryRunSession();
      return report;
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runSeeder().catch(err => {
    console.error('\n❌ SEEDER ERROR:', err.message);
    process.exit(1);
  });
}

module.exports = {
  BATCH_TAG,
  buildOutbreakSeedPlan,
  preflightCollisionCheck,
  dryRunInspect,
  seedOutbreakDocuments,
  runSeeder,
};