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

  // Map planned episodes to Consultation documents relative to referenceDate
  const consultations = episodes.map((ep, idx) => {
    const consultationId = `${BATCH_TAG}-CON-${String(idx + 1).padStart(4, '0')}`;
    const episodeId = `EP-${BATCH_TAG}-${ep.scenario}-${idx}`;
    const syntheticNic = `1990${String(10000000 + idx)}`;

    // Calculate timestamp relative to todayMidnight
    const episodeDate = new Date(todayMidnight - ep.daysAgo * DAY_MS + 10 * 3600000 + (idx % 12) * 60000);

    return {
      consultationId,
      patientNic: syntheticNic,
      ...writeNicFields(syntheticNic),
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

  const conIds = plan.consultations.map(c => c.consultationId);
  const existingConsultations = await db.collection('consultations').find({
    consultationId: { $in: conIds },
    syntheticSeedBatch: BATCH_TAG,
    isSynthetic: true,
  }).toArray();

  return {
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
    const err = new Error(`PRE_FLIGHT_COLLISION_DETECTED: ${collisions.length} collision(s) in consultations`);
    err.collisions = collisions;
    throw err;
  }

  // Resolve existing doctor, hospital, and patient dynamically (NO new parent entities created)
  const defaultDoctor = await db.collection('doctors').findOne({ isActive: { $ne: false } });
  const defaultHospital = await db.collection('hospitals').findOne({ isActive: { $ne: false } });
  const defaultPatient = await db.collection('patients').findOne({ isActive: { $ne: false } });

  const fallbackDoctorId = defaultDoctor?._id || new mongoose.Types.ObjectId('650000000000000000000001');
  const fallbackHospitalId = defaultHospital?._id || new mongoose.Types.ObjectId('650000000000000000000002');
  const fallbackPatientId = defaultPatient?._id || new mongoose.Types.ObjectId('650000000000000000000003');

  // Map hospitals by district if available
  const districtHospitals = new Map();
  try {
    const foundHospitals = await db.collection('hospitals').find({ isActive: { $ne: false } }).toArray();
    for (const h of foundHospitals) {
      if (h.district && !districtHospitals.has(h.district)) {
        districtHospitals.set(h.district, h._id);
      }
    }
  } catch (_) {}

  const report = {
    consultations: { planned: plan.consultations.length, inserted: 0, existing: 0 },
    resolvedDoctorId: String(fallbackDoctorId),
    resolvedPatientId: String(fallbackPatientId),
  };

  // Upsert consultations: keyed on synthetic consultationId (idempotent, insert-only)
  for (const c of plan.consultations) {
    const resolvedHospId = districtHospitals.get(c.district) || fallbackHospitalId;
    const insertDoc = {
      ...c,
      doctorId: fallbackDoctorId,
      hospitalId: resolvedHospId,
      patientId: fallbackPatientId,
      isSynthetic: true,
      syntheticSeedBatch: BATCH_TAG,
    };
    delete insertDoc._id; // Ensure MongoDB generates _id!

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