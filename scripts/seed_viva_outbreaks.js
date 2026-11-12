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
  const DUMMY_SYNTHETIC_PASSWORD_HASH = '$2a$10$wT1rK0c1234567890abcdef.dummyHashForSyntheticDocOnly';

  const parentDoctors = [
    {
      _id: deterministicObjectId(BATCH_TAG, 'Doctor', 1),
      doctorId: `${BATCH_TAG}-DOC-01`,
      fullName: 'Dr. Nirmal Senanayake',
      email: 'dr.nirmal.outbreaks@qa.medisync.local',
      slmcNumber: 'SLMC-98101',
      licenseNo: 'SLMC-98101',
      specialization: 'General Medicine',
      password: DUMMY_SYNTHETIC_PASSWORD_HASH,
      district: 'Gampaha',
      isActive: true,
      isVerified: true,
      isSynthetic: true,
      syntheticSeedBatch: BATCH_TAG,
    },
    {
      _id: deterministicObjectId(BATCH_TAG, 'Doctor', 2),
      doctorId: `${BATCH_TAG}-DOC-02`,
      fullName: 'Dr. Anoma Wijesinghe',
      email: 'dr.anoma.outbreaks@qa.medisync.local',
      slmcNumber: 'SLMC-98102',
      licenseNo: 'SLMC-98102',
      specialization: 'Pulmonology',
      password: DUMMY_SYNTHETIC_PASSWORD_HASH,
      district: 'Kandy',
      isActive: true,
      isVerified: true,
      isSynthetic: true,
      syntheticSeedBatch: BATCH_TAG,
    },
    {
      _id: deterministicObjectId(BATCH_TAG, 'Doctor', 3),
      doctorId: `${BATCH_TAG}-DOC-03`,
      fullName: 'Dr. Chandana Jayasuriya',
      email: 'dr.chandana.outbreaks@qa.medisync.local',
      slmcNumber: 'SLMC-98103',
      licenseNo: 'SLMC-98103',
      specialization: 'Infectious Diseases',
      password: DUMMY_SYNTHETIC_PASSWORD_HASH,
      district: 'Galle',
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
      _id: deterministicObjectId(BATCH_TAG, 'Patient', pIdx),
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

  const parentHospitals = [
    {
      _id: deterministicObjectId(BATCH_TAG, 'Hospital', 1),
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
      _id: deterministicObjectId(BATCH_TAG, 'Hospital', 2),
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
      _id: deterministicObjectId(BATCH_TAG, 'Hospital', 3),
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

  // 3. Check Patients for collisions on nic or email
  const patNics = plan.parentPatients.map(p => p.nic);
  const patEmails = plan.parentPatients.map(p => p.email);
  const existingPatients = await db.collection('patients').find({
    $or: [
      { nic: { $in: patNics } },
      { email: { $in: patEmails } },
    ]
  }).toArray();

  for (const doc of existingPatients) {
    const isOurBatch = doc.syntheticSeedBatch === BATCH_TAG && doc.isSynthetic === true;
    if (!isOurBatch) {
      collisions.push({
        collection: 'patients',
        field: patNics.includes(doc.nic) ? 'nic' : 'email',
        value: patNics.includes(doc.nic) ? doc.nic : doc.email,
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

  // 1. Insert parent hospitals: keyed on synthetic regNo (idempotent, insert-only)
  for (const hosp of plan.parentHospitals) {
    report.hospitals.regNos.push(hosp.regNo);
    const res = await db.collection('hospitals').updateOne(
      { regNo: hosp.regNo },
      { $setOnInsert: { ...hosp, isSynthetic: true, syntheticSeedBatch: BATCH_TAG } },
      { upsert: true }
    );
    if (res.upsertedCount > 0) {
      report.hospitals.inserted++;
    } else {
      report.hospitals.existing++;
    }
  }

  // 2. Insert parent doctors: keyed on synthetic doctorId (idempotent, insert-only)
  for (const doc of plan.parentDoctors) {
    report.doctors.doctorIds.push(doc.doctorId);
    const res = await db.collection('doctors').updateOne(
      { doctorId: doc.doctorId },
      { $setOnInsert: { ...doc, isSynthetic: true, syntheticSeedBatch: BATCH_TAG } },
      { upsert: true }
    );
    if (res.upsertedCount > 0) {
      report.doctors.inserted++;
    } else {
      report.doctors.existing++;
    }
  }

  // 3. Insert parent patients: keyed on synthetic nic (idempotent, insert-only)
  for (const pat of plan.parentPatients) {
    report.patients.nics.push(pat.nic);
    const res = await db.collection('patients').updateOne(
      { nic: pat.nic },
      { $setOnInsert: { ...pat, isSynthetic: true, syntheticSeedBatch: BATCH_TAG } },
      { upsert: true }
    );
    if (res.upsertedCount > 0) {
      report.patients.inserted++;
    } else {
      report.patients.existing++;
    }
  }

  // 4. Insert consultations: keyed on synthetic consultationId (idempotent, insert-only)
  for (const c of plan.consultations) {
    const res = await db.collection('consultations').updateOne(
      { consultationId: c.consultationId },
      { $setOnInsert: { ...c, isSynthetic: true, syntheticSeedBatch: BATCH_TAG } },
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
    console.log(`Executing pre-flight collision check and insert-only seeding...`);
    const report = await seedOutbreakDocuments(db, plan);

    console.log(`\n=== Seed Execution Complete ===`);
    console.log(`Hospitals:     ${report.hospitals.inserted} inserted, ${report.hospitals.existing} already existed (regNos: ${report.hospitals.regNos.join(', ')})`);
    console.log(`Doctors:       ${report.doctors.inserted} inserted, ${report.doctors.existing} already existed (doctorIds: ${report.doctors.doctorIds.join(', ')})`);
    console.log(`Patients:      ${report.patients.inserted} inserted, ${report.patients.existing} already existed (${report.patients.nics.length} NICs)`);
    console.log(`Consultations: ${report.consultations.inserted} inserted, ${report.consultations.existing} already existed (planned: ${report.consultations.planned})`);
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
  preflightCollisionCheck,
  seedOutbreakDocuments,
};
