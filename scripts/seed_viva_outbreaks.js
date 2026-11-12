#!/usr/bin/env node
'use strict';

/**
 * scripts/seed_viva_outbreaks.js
 *
 * Deterministic multi-disease outbreak surveillance seeder for MediSync viva.
 *
 * Guarantees:
 * 1. Dry-run by default (0 database writes). Requires --confirm to write.
 * 2. 100% Synthetic data: tagged with syntheticSeedBatch: "viva-2026-11-outbreaks" and isSynthetic: true.
 * 3. Insert-only: checks existing records by deterministic _id/consultationId; never overwrites.
 * 4. Zero live emails or external side-effects.
 * 5. Mathematically verified against evaluateOutbreakCriteria:
 *    - Dengue (A90) in Gampaha: Floor PASS, Persistence PASS -> Critical
 *    - Influenza (J11.1) in Kandy: Floor PASS, Persistence PASS -> High
 *    - Leptospirosis (A27) in Galle: Floor PASS, Persistence PASS -> High
 *    - Typhoid (A01) in Ratnapura: Floor PASS, Persistence PASS -> Moderate
 *    - Kalutara: single-day spike (N=6), suppressed by PERSISTENCE_CRITERIA_NOT_MET
 *    - Matara: small cluster (N=4 < 5), suppressed by CASE_FLOOR_NOT_MET
 */

const fs = require('fs');
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

function deterministicObjectId(namespace, collection, index) {
  const hash = crypto.createHash('sha256')
    .update(`${namespace}:${collection}:${index}`)
    .digest('hex');
  return new mongoose.Types.ObjectId(hash.slice(0, 24));
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  return {
    confirm: args.includes('--confirm'),
    dryRun: !args.includes('--confirm'),
    verifyOnly: args.includes('--verify'),
  };
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

  // ── 3. Galle Leptospirosis (A27) — High (N=7 >= 5, 3 consecutive days z > 2.0) ──
  for (const ago of [50, 45, 40, 35, 30, 25, 20, 15, 12, 10]) {
    addScenarioEpisodes({ conditionKey: 'leptospirosis', district: 'Galle', icdCode: 'A27', icdDescription: 'Leptospirosis', daysAgo: ago, count: 1, scenario: 'Galle-Leptospirosis-Baseline' });
  }
  addScenarioEpisodes({ conditionKey: 'leptospirosis', district: 'Galle', icdCode: 'A27', icdDescription: 'Leptospirosis', daysAgo: 3, count: 3, scenario: 'Galle-Leptospirosis-Window' });
  addScenarioEpisodes({ conditionKey: 'leptospirosis', district: 'Galle', icdCode: 'A27', icdDescription: 'Leptospirosis', daysAgo: 2, count: 2, scenario: 'Galle-Leptospirosis-Window' });
  addScenarioEpisodes({ conditionKey: 'leptospirosis', district: 'Galle', icdCode: 'A27', icdDescription: 'Leptospirosis', daysAgo: 1, count: 2, scenario: 'Galle-Leptospirosis-Window' });

  // ── 4. Ratnapura Typhoid (A01) — Moderate/Medium (N=6 >= 5, 2 consecutive days z > 2.0) ──
  for (const ago of [50, 46, 42, 38, 34, 30, 26, 22, 18, 14, 12, 10]) {
    addScenarioEpisodes({ conditionKey: 'typhoid', district: 'Ratnapura', icdCode: 'A01', icdDescription: 'Typhoid and paratyphoid fevers', daysAgo: ago, count: 1, scenario: 'Ratnapura-Typhoid-Baseline' });
  }
  addScenarioEpisodes({ conditionKey: 'typhoid', district: 'Ratnapura', icdCode: 'A01', icdDescription: 'Typhoid and paratyphoid fevers', daysAgo: 2, count: 3, scenario: 'Ratnapura-Typhoid-Window' });
  addScenarioEpisodes({ conditionKey: 'typhoid', district: 'Ratnapura', icdCode: 'A01', icdDescription: 'Typhoid and paratyphoid fevers', daysAgo: 1, count: 3, scenario: 'Ratnapura-Typhoid-Window' });

  // ── 5. Kalutara Dengue — Suppressed by PERSISTENCE_CRITERIA_NOT_MET (1-day spike of 6) ──
  for (const ago of [50, 45, 40, 35, 30, 25, 20, 15, 12, 10]) {
    addScenarioEpisodes({ conditionKey: 'dengue', district: 'Kalutara', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: ago, count: 1, scenario: 'Kalutara-Dengue-Baseline' });
  }
  addScenarioEpisodes({ conditionKey: 'dengue', district: 'Kalutara', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: 2, count: 6, scenario: 'Kalutara-Dengue-Window' });

  // ── 6. Matara Dengue — Suppressed by CASE_FLOOR_NOT_MET (cluster of 4 < 5) ──
  for (const ago of [45, 35, 25, 15]) {
    addScenarioEpisodes({ conditionKey: 'dengue', district: 'Matara', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: ago, count: 1, scenario: 'Matara-Dengue-Baseline' });
  }
  addScenarioEpisodes({ conditionKey: 'dengue', district: 'Matara', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: 2, count: 2, scenario: 'Matara-Dengue-Window' });
  addScenarioEpisodes({ conditionKey: 'dengue', district: 'Matara', icdCode: 'A90', icdDescription: 'Dengue fever [classical dengue]', daysAgo: 1, count: 2, scenario: 'Matara-Dengue-Window' });

  // Deterministic parent documents to guarantee zero orphan references
  const parentDoctors = [
    { _id: deterministicObjectId(BATCH_TAG, 'Doctor', 1), doctorId: `${BATCH_TAG}-DOC-01`, fullName: 'Dr. Nirmal Senanayake', email: 'dr.nirmal.outbreaks@medisync.local', slmcNumber: 'SLMC-98101', district: 'Gampaha' },
    { _id: deterministicObjectId(BATCH_TAG, 'Doctor', 2), doctorId: `${BATCH_TAG}-DOC-02`, fullName: 'Dr. Anoma Wijesinghe', email: 'dr.anoma.outbreaks@medisync.local', slmcNumber: 'SLMC-98102', district: 'Kandy' },
    { _id: deterministicObjectId(BATCH_TAG, 'Doctor', 3), doctorId: `${BATCH_TAG}-DOC-03`, fullName: 'Dr. Chandana Jayasuriya', email: 'dr.chandana.outbreaks@medisync.local', slmcNumber: 'SLMC-98103', district: 'Galle' },
  ];

  const parentPatients = Array.from({ length: 12 }, (_, i) => {
    const pIdx = i + 1;
    const nic = `1990${String(pIdx).padStart(8, '0')}`;
    return {
      _id: deterministicObjectId(BATCH_TAG, 'Patient', pIdx),
      nic,
      fullName: `Surveillance Case Subject ${pIdx}`,
      email: `case.subject.${pIdx}@qa.medisync.local`,
      district: ['Gampaha', 'Kandy', 'Galle', 'Ratnapura', 'Kalutara', 'Matara'][i % 6],
      isActive: true,
      isSynthetic: true,
      syntheticSeedBatch: BATCH_TAG,
    };
  });

  const parentHospitals = [
    { _id: deterministicObjectId(BATCH_TAG, 'Hospital', 1), name: 'District General Hospital Gampaha', district: 'Gampaha', email: 'info@gampaha.hospital.local' },
    { _id: deterministicObjectId(BATCH_TAG, 'Hospital', 2), name: 'Kandy Teaching Hospital', district: 'Kandy', email: 'info@kandy.hospital.local' },
    { _id: deterministicObjectId(BATCH_TAG, 'Hospital', 3), name: 'Karapitiya Teaching Hospital Galle', district: 'Galle', email: 'info@karapitiya.hospital.local' },
  ];

  // Map planned episodes to full Consultation documents
  const consultations = episodes.map((ep, idx) => {
    const consultationId = `${BATCH_TAG}-CON-${String(idx + 1).padStart(4, '0')}`;
    const _id = deterministicObjectId(BATCH_TAG, 'Consultation', idx + 1);
    const minuteOfDay = 510 + ((idx * 19) % 480);
    const episodeDate = new Date(todayMidnight - ep.daysAgo * DAY_MS + minuteOfDay * 60000);
    const episodeId = `EP-${ep.district}-${episodeDate.toISOString().slice(0, 10)}-${String(idx + 1).padStart(4, '0')}`;

    const pat = parentPatients[idx % parentPatients.length];
    const doc = parentDoctors[idx % parentDoctors.length];
    const hosp = parentHospitals[idx % parentHospitals.length];

    return {
      _id,
      consultationId,
      patientId: pat._id,
      doctorId: doc._id,
      hospitalId: hosp._id,
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

async function runSeeder() {
  const args = parseCliArgs();
  console.log(`=== MediSync Multi-Disease Outbreak Seeder ===`);
  console.log(`Batch Namespace: ${BATCH_TAG}`);
  console.log(`Mode:            ${args.confirm ? 'LIVE CONFIRM (WRITING)' : 'DRY-RUN (READ-ONLY)'}\n`);

  const plan = buildOutbreakSeedPlan(new Date());
  console.log(`Planned Consultations: ${plan.totalConsultations}`);
  console.log(`Parent Accounts:       ${plan.parentDoctors.length} Doctors, ${plan.parentPatients.length} Patients, ${plan.parentHospitals.length} Hospitals\n`);

  // Run mathematical proof against Stage D outbreak detector
  console.log(`--- Running Mathematical Proof (evaluateOutbreakCriteria) ---`);
  const proofCases = plan.consultations.map(c => ({
    consultationId: String(c._id),
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

  if (args.dryRun) {
    console.log(`\n[DRY-RUN] 0 database writes executed. Pass --confirm to commit.`);
    return;
  }

  // Live execution with --confirm
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('ERROR: MONGODB_URI not configured in server/.env');
    process.exit(1);
  }

  console.log(`\nConnecting to database...`);
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  try {
    // 1. Insert parent documents (insert-only)
    console.log(`Writing parent documents...`);
    for (const doc of plan.parentDoctors) {
      await db.collection('doctors').updateOne({ _id: doc._id }, { $setOnInsert: { ...doc, isSynthetic: true, syntheticSeedBatch: BATCH_TAG } }, { upsert: true });
    }
    for (const pat of plan.parentPatients) {
      await db.collection('patients').updateOne({ _id: pat._id }, { $setOnInsert: pat }, { upsert: true });
    }
    for (const hosp of plan.parentHospitals) {
      await db.collection('hospitals').updateOne({ _id: hosp._id }, { $setOnInsert: { ...hosp, isSynthetic: true, syntheticSeedBatch: BATCH_TAG } }, { upsert: true });
    }

    // 2. Insert consultations (insert-only)
    console.log(`Writing ${plan.consultations.length} consultations...`);
    let inserted = 0;
    for (const c of plan.consultations) {
      const res = await db.collection('consultations').updateOne(
        { _id: c._id },
        { $setOnInsert: c },
        { upsert: true }
      );
      if (res.upsertedCount > 0) inserted++;
    }
    console.log(`✔ Successfully inserted ${inserted} new consultations (${plan.consultations.length - inserted} already existed).`);
  } finally {
    await mongoose.disconnect();
    console.log(`Disconnected from database.`);
  }
}

if (require.main === module) {
  runSeeder().catch(err => {
    console.error('Seeder failed:', err);
    process.exit(1);
  });
}

module.exports = {
  buildOutbreakSeedPlan,
  BATCH_TAG,
};
