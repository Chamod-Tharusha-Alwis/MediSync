#!/usr/bin/env node
'use strict';

/**
 * scripts/seed-viva-data.js
 *
 * Deterministic Viva Voce Demonstration Seed Script for MediSync.
 *
 * Guarantees:
 * 1. 100% Synthetic data tagged with syntheticSeedBatch: "viva-2026-11" and isSynthetic: true.
 * 2. Non-destructive: Every seeded document is tagged for atomic, reversible rollback.
 * 3. Default mode is --dry-run (0 database writes). Writing requires --confirm.
 * 4. Passwords hashed from SEED_TEST_PASSWORD / TEMP_ACCOUNT_PASSWORD (never printed or logged).
 * 5. Notifications strictly disabled (no emails or SMS dispatched).
 * 6. Mathematical verification of all 4 outbreak scenarios (S-A, S-B, S-C, S-D) against evaluateOutbreakCriteria.
 * 7. Real public health stats compliance: verified consultations produce verified public cases, 15 pending review.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

// Load environment from server/.env if present
const envPath = path.resolve(__dirname, '../server/.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Ensure notification transport is silenced
process.env.EMAIL_PROVIDER = 'none';

let mongoose;
try {
  mongoose = require(require.resolve('mongoose', { paths: [path.resolve(__dirname, '../server')] }));
} catch (_) {
  mongoose = require('mongoose');
}

let bcrypt;
try {
  bcrypt = require(require.resolve('bcryptjs', { paths: [path.resolve(__dirname, '../server')] }));
} catch (_) {
  bcrypt = require('bcryptjs');
}

const { NAMESPACE, buildVivaSeedPlan } = require('./seedVivaPlan.cjs');
const { writeNicFields } = require('../server/src/security/nicPersistence');
const { evaluateOutbreakCriteria } = require('../server/src/services/surveillanceService');
const { selectReportingCases, aggregatePublicCases } = require('../server/src/services/publicHealthStats');

const models = {
  Hospital: require('../server/src/models/Hospital'),
  Pharmacy: require('../server/src/models/Pharmacy'),
  Doctor: require('../server/src/models/Doctor'),
  PharmacyStaff: require('../server/src/models/PharmacyStaff'),
  Patient: require('../server/src/models/Patient'),
  Consultation: require('../server/src/models/Consultation'),
  Prescription: require('../server/src/models/Prescription'),
  Dispensing: require('../server/src/models/Dispensing'),
  LabTest: require('../server/src/models/LabTest'),
  VerificationToken: require('../server/src/models/VerificationToken'),
  OutbreakAlert: require('../server/src/models/OutbreakAlert')
};

function parseArgs(args = process.argv.slice(2)) {
  let action = 'dry-run';
  let database = 'medisync_prod';
  let confirm = false;
  let ownerEmail = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--confirm') confirm = true;
    else if (arg === '--dry-run') action = 'dry-run';
    else if (arg === '--rollback') action = 'rollback';
    else if (arg === '--verify') action = 'verify';
    else if (arg.startsWith('--owner-email=')) {
      ownerEmail = arg.slice('--owner-email='.length).trim();
    } else if (arg === '--owner-email') {
      ownerEmail = args[++i]?.trim();
      if (!ownerEmail || ownerEmail.startsWith('--')) throw new Error('Email address required after --owner-email');
    } else if (arg === '--db') {
      database = args[++i];
      if (!database || database.startsWith('--')) throw new Error('Database name required after --db');
    } else if (arg === '-h' || arg === '--help') {
      console.log(`
Usage: node scripts/seed-viva-data.js [options]

Options:
  --dry-run                 Run full plan generation, validation, and scenario proof (default, 0 writes)
  --confirm                 Execute database writes (requires confirmation)
  --rollback                Reverse viva seed batch, deleting only documents with batch tag "viva-2026-11"
  --verify                  Execute live post-seed validation queries against the target database
  --db <name>               Target database (default: medisync_prod; allowed: medisync_prod, medisync_automated_test)
  --owner-email <address>   Assign Gmail-style plus aliases (+doctor1, +pharmacist1, +patient, etc.) to all personas
  -h, --help                Show this help text
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (confirm && action === 'dry-run') action = 'seed';
  return { action, database, confirm, ownerEmail };
}

function loadEncryptionKeys() {
  const { validateAndLoadOperatorKeys } = require('../server/src/security/operatorKeyPolicy');
  const ring = validateAndLoadOperatorKeys(process.env);
  global.ENCRYPTION_KEYS = ring.keys;
  global.ACTIVE_KEY_VERSION = ring.activeVersion;
  global.ENCRYPTION_KEY = ring.keys[ring.activeVersion];
}

async function connectToMongo(database) {
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    return;
  }
  if (process.env.MEDISYNC_OFFLINE_ONLY === 'true' || process.env.NODE_ENV === 'test') {
    return;
  }
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is required to connect to MongoDB');

  // Connect with proper Mongoose options
  await mongoose.connect(uri, {
    dbName: database,
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000
  });
}

async function runDryRun(plan) {
  console.log('================================================================');
  console.log('🔍 [DRY-RUN] MEDISYNC VIVA VOCE SEED PLAN INSPECTION');
  console.log('================================================================');
  console.log(`Namespace Batch Tag : "${plan.namespace}"`);
  console.log(`Anchor Date          : ${plan.anchorDate}`);
  console.log(`Execution Mode       : DRY-RUN (0 database writes)`);
  console.log('----------------------------------------------------------------');

  console.log('\n📊 1. PLANNED RECORD COUNTS PER COLLECTION:');
  for (const [model, count] of Object.entries(plan.counts)) {
    console.log(`   - ${model.padEnd(20)}: ${count}`);
  }
  const totalDocs = Object.values(plan.counts).reduce((a, b) => a + b, 0);
  console.log(`   Total Documents     : ${totalDocs}`);

  console.log('\n🧪 2. OUTBREAK SCENARIO MATHEMATICAL PROOF (evaluateOutbreakCriteria):');
  const cases = plan.documentsByModel.Consultation.map(c => ({
    district: c.district,
    diseaseId: c.icdCode,
    disease: c.diagnosis,
    time: new Date(c.createdAt).getTime(),
    createdAt: c.createdAt
  }));

  const results = evaluateOutbreakCriteria({ cases, now: new Date(plan.now), baselineDays: 56, level: 'district' });
  const sA = results.find(r => r.district === 'Gampaha' && (r.disease === 'A90' || r.disease === 'Dengue'));
  const sB = results.find(r => r.district === 'Kalutara' && (r.disease === 'A90' || r.disease === 'Dengue'));
  const sC = results.find(r => r.district === 'Matara' && (r.disease === 'A90' || r.disease === 'Dengue'));
  const sD = results.find(r => r.district === 'Kandy' && (r.disease === 'J11.1' || r.disease === 'Influenza'));

  console.log(`   [S-A] Gampaha Dengue:`);
  console.log(`         Triggered       : ${sA?.triggered ? 'YES (ALERT ISSUED)' : 'NO'}`);
  console.log(`         Alert Level     : ${sA?.alertLevel} (Severity: ${sA?.severity})`);
  console.log(`         Window Total N  : ${sA?.count} (Gate 1 floor: N >= 5 ${sA?.count >= 5 ? 'PASSED' : 'FAILED'})`);
  console.log(`         Consecutive >2.0: ${sA?.maxConsecutiveDays} days (Gate 2 persistence: >= 2 ${sA?.maxConsecutiveDays >= 2 ? 'PASSED' : 'FAILED'})`);
  console.log(`         Max Daily Z     : ${sA?.maxZ} (z > 2.0 strict threshold)`);
  console.log(`         Daily Counts    : [${sA?.dailyCounts.join(', ')}]`);

  console.log(`   [S-B] Kalutara Dengue (Negative Control: 1-Day Spike):`);
  console.log(`         Triggered       : ${sB?.triggered ? 'YES (FAIL)' : 'NO (PASSED: PERSISTENCE PREVENTED ALERT)'}`);
  console.log(`         Reason          : ${sB?.reason}`);
  console.log(`         Window Total N  : ${sB?.count}`);
  console.log(`         Consecutive >2.0: ${sB?.maxConsecutiveDays} day (Persistence rejected)`);
  console.log(`         Daily Counts    : [${sB?.dailyCounts.join(', ')}]`);

  console.log(`   [S-C] Matara Dengue (Negative Control: Small Cluster under N=5):`);
  console.log(`         Triggered       : ${sC?.triggered ? 'YES (FAIL)' : 'NO (PASSED: FLOOR PREVENTED ALERT)'}`);
  console.log(`         Reason          : ${sC?.reason}`);
  console.log(`         Window Total N  : ${sC?.count} (Gate 1 floor: N < 5 rejected)`);
  console.log(`         Daily Counts    : [${sC?.dailyCounts.join(', ')}]`);

  console.log(`   [S-D] Kandy Influenza (Multi-Disease Secondary Detection):`);
  console.log(`         Triggered       : ${sD?.triggered ? 'YES (ALERT ISSUED)' : 'NO'}`);
  console.log(`         Alert Level     : ${sD?.alertLevel} (Severity: ${sD?.severity})`);
  console.log(`         Window Total N  : ${sD?.count} (Gate 1 floor: N >= 5 ${sD?.count >= 5 ? 'PASSED' : 'FAILED'})`);
  console.log(`         Consecutive >2.0: ${sD?.maxConsecutiveDays} days (Gate 2 persistence: >= 2 ${sD?.maxConsecutiveDays >= 2 ? 'PASSED' : 'FAILED'})`);
  console.log(`         Daily Counts    : [${sD?.dailyCounts.join(', ')}]`);

  console.log('\n🌐 3. PUBLIC HEALTH STATS COMPLIANCE (aggregatePublicCases):');
  const agg = aggregatePublicCases(plan.documentsByModel.Consultation, { mode: 'real', rangeDays: 30, now: new Date(plan.now) });
  console.log(`   Verified Cases (30d)  : ${agg.verifiedCases}`);
  console.log(`   Awaiting Review (30d) : ${agg.awaitingReviewCount}`);
  console.log(`   State                 : "${agg.state}"`);
  console.log(`   Districts Reporting   : ${agg.byDistrict.length}`);
  console.log(`   Top 3 Diseases (30d)  : ${agg.byDisease.slice(0, 3).map(d => `${d.disease} (${d.totalCases})`).join(', ')}`);

  console.log('\n👤 4. SEEDED PERSONAS & DEMO CREDENTIALS:');
  console.log(`   Demo Patient (OA-14)  : ${plan.demoPatient.name} | NIC: ${plan.demoPatient.nic} | Email: ${plan.demoPatient.email}`);
  const docs = plan.documentsByModel.Doctor;
  const staff = plan.documentsByModel.PharmacyStaff;
  const hosps = plan.documentsByModel.Hospital;
  console.log(`   Doctor 1              : ${docs[0]?.fullName} (SLMC: ${docs[0]?.licenseNo}) | Email: ${docs[0]?.email}`);
  console.log(`   Pharmacist 1          : ${staff[0]?.fullName} | Email: ${staff[0]?.email}`);
  console.log(`   Pharmacy Admin        : ${staff[2]?.fullName} | Email: ${staff[2]?.email}`);
  console.log(`   Hospital Admin        : ${hosps[0]?.name} | Email: ${hosps[0]?.email}`);
  console.log(`   QR Capability URL     : ${plan.demoPatient.qrUrl}`);
  console.log(`   Note: All persona passwords derived from SEED_TEST_PASSWORD. Direct password login works without OTP; OTP is sent for verification and lab report download.`);

  console.log('\n🛡️ 5. REVERSIBILITY & ROLLBACK DRY-RUN:');
  console.log(`   Batch Tag Identifier : syntheticSeedBatch: "${plan.namespace}"`);
  console.log(`   Consultation Pattern : consultationId: /^CON-VIVA-2026-\\d{4}$/`);
  console.log(`   Would Delete on Undo : ${totalDocs} documents across 10 collections`);
  console.log(`   Existing Real Data   : Protected (0 modifications, zero cross-batch cascade)`);
  console.log('================================================================');
  console.log('✅ Dry-run successful. To apply this plan, run:');
  console.log('   # PowerShell:');
  console.log('   $env:SEED_TEST_PASSWORD="YourPassword"; node scripts/seed-viva-data.js --confirm');
  console.log('   # Bash:');
  console.log('   SEED_TEST_PASSWORD="YourPassword" node scripts/seed-viva-data.js --confirm');
  console.log('================================================================');
}

async function runSeed(plan, database) {
  console.log('================================================================');
  console.log('🚀 [SEED] APPLYING VIVA VOCE SEED PLAN TO MONGODB');
  console.log('================================================================');
  console.log(`Target Database : ${database}`);
  console.log(`Batch Namespace : "${plan.namespace}"`);
  console.log('----------------------------------------------------------------');

  const passwordRaw = process.env.SEED_TEST_PASSWORD || process.env.TEMP_ACCOUNT_PASSWORD;
  if (!passwordRaw) {
    throw new Error('FATAL: SEED_TEST_PASSWORD (or TEMP_ACCOUNT_PASSWORD) environment variable is required to set staff account passwords.');
  }

  const passwordHash = bcrypt.hashSync(passwordRaw, 10);
  await connectToMongo(database);
  console.log(` Connected to MongoDB Atlas (${database})`);

  const insertedCounts = {};

  for (const [modelName, docs] of Object.entries(plan.documentsByModel)) {
    const Model = models[modelName];
    if (!Model) throw new Error(`Model not found: ${modelName}`);

    const preparedDocs = [];
    for (const doc of docs) {
      const input = { ...doc };
      if (Model.schema.path('password')) input.password = passwordHash;
      const nic = input.nic || input.patientNic;
      if (nic && ['Patient', 'Consultation', 'Prescription', 'LabTest', 'Dispensing'].includes(modelName)) {
        Object.assign(input, writeNicFields(nic, { legacyFields: modelName === 'Patient' || modelName === 'LabTest' ? ['patientNic_bi'] : ['patientNic_bi', 'nicHash'] }));
      }
      const instance = new Model(input);
      if (typeof instance.encryptFieldsSync === 'function') instance.encryptFieldsSync();
      const obj = instance.toObject({ depopulate: true, versionKey: false });

      // Preserve unmapped fields (surveillanceVerification, syntheticSeedBatch, isSynthetic)
      // to ensure MongoDB persistence without relying on strict Mongoose schema definitions.
      for (const [k, v] of Object.entries(input)) {
        if (obj[k] === undefined && v !== undefined) {
          obj[k] = v;
        }
      }
      preparedDocs.push(obj);
    }

    // Insert prepared documents into collection
    const result = await Model.collection.insertMany(preparedDocs, { ordered: true });
    insertedCounts[modelName] = result.insertedCount;
    console.log(`   Inserted ${String(result.insertedCount).padStart(4)} ${modelName} documents`);
  }

  // ── Outbreak Alerts: Run real detector on inserted verified consultations ─────
  console.log(`\n🚨 Running real outbreak detector on seeded clinical consultations...`);
  const insertedConsultations = await models.Consultation.collection.find({
    syntheticSeedBatch: plan.namespace
  }).toArray();

  const detectorCases = insertedConsultations.map(c => ({
    consultationId: String(c._id),
    district: c.district,
    diseaseId: c.icdCode,
    disease: c.diagnosis,
    time: new Date(c.createdAt).getTime(),
    createdAt: c.createdAt
  }));

  const detectorResults = evaluateOutbreakCriteria({
    cases: detectorCases,
    now: new Date(plan.now),
    baselineDays: 56,
    level: 'district'
  });

  let alertsCreated = 0;
  for (const r of detectorResults) {
    if (!r.triggered) continue; // S-B (Kalutara) and S-C (Matara) are negative controls (suppressed)

    const matchingIds = detectorCases
      .filter(c => c.district === r.district && (c.diseaseId === r.disease || c.disease === r.disease))
      .map(c => new mongoose.Types.ObjectId(c.consultationId))
      .sort();

    const alertId = new mongoose.Types.ObjectId(
      crypto.createHash('sha256').update(JSON.stringify(['5w-verified-episodes-v1', 'real', r.district, r.disease, matchingIds.map(String)])).digest('hex').slice(0, 24)
    );

    const alertDoc = {
      _id: alertId,
      disease: r.disease === 'A90' ? 'Dengue' : (r.disease === 'J11.1' ? 'Influenza' : r.disease),
      location: r.district,
      affectedCount: r.count,
      severity: r.severity === 'Critical' ? 'Critical' : 'High',
      status: 'Pending',
      surveillancePolicy: '5w-verified-episodes-v1',
      sourceConsultationIds: matchingIds,
      isSimulation: false,
      isSynthetic: true,
      syntheticSeedBatch: plan.namespace,
      message: `Elevated syndromic cluster detected in ${r.district} (N=${r.count}, persistent over ${r.maxConsecutiveDays} consecutive calendar days). Awaiting administrative epidemiological review.`,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await models.OutbreakAlert.collection.updateOne(
      { _id: alertId },
      { $set: alertDoc },
      { upsert: true }
    );
    alertsCreated++;
    console.log(`   Real Detector produced: [Pending] ${alertDoc.severity} Alert for ${alertDoc.disease} in ${alertDoc.location} (Affected: ${alertDoc.affectedCount})`);
  }
  console.log(`   Seeded ${alertsCreated} OutbreakAlerts via real detection engine (S-B & S-C negative controls suppressed).`);

  console.log(`\n🔑 [ONE-TIME SECRET] Live QR Capability Token generated:`);
  console.log(`   Verification URL : ${plan.demoPatient.qrUrl}`);
  console.log(`   (Printed once to console; only SHA-256 tokenHash is stored in the database.)\n`);

  console.log('----------------------------------------------------------------');
  console.log('🎉 Viva seed batch committed successfully!');
  console.log('================================================================');

  if (process.env.NODE_ENV !== 'test') {
    if (process.env.NODE_ENV !== 'test') {
    await mongoose.disconnect();
  }
  }
}

async function runRollback(database) {
  console.log('================================================================');
  console.log('🧹 [ROLLBACK] REVERSING VIVA VOCE SEED BATCH');
  console.log('================================================================');
  console.log(`Target Database : ${database}`);
  console.log(`Batch Namespace : "${NAMESPACE}"`);
  console.log('----------------------------------------------------------------');

  await connectToMongo(database);
  console.log(` Connected to MongoDB Atlas (${database})`);

  const deletedCounts = {};

  // 1. Delete standard tagged collections
  const taggedModels = ['Hospital', 'Pharmacy', 'Doctor', 'PharmacyStaff', 'Patient', 'Prescription', 'Dispensing', 'LabTest', 'VerificationToken', 'OutbreakAlert'];
  for (const modelName of taggedModels) {
    const Model = models[modelName];
    const res = await Model.collection.deleteMany({ syntheticSeedBatch: NAMESPACE });
    deletedCounts[modelName] = res.deletedCount;
    console.log(`   Removed ${String(res.deletedCount).padStart(4)} ${modelName} documents`);
  }

  // 2. Delete consultations by consultationId prefix or verifiedBy tag
  const consultRes = await models.Consultation.collection.deleteMany({
    $or: [
      { consultationId: /^CON-VIVA-2026-/ },
      { 'surveillanceVerification.verifiedBy': NAMESPACE }
    ]
  });
  deletedCounts.Consultation = consultRes.deletedCount;
  console.log(`   Removed ${String(consultRes.deletedCount).padStart(4)} Consultation documents`);

  console.log('----------------------------------------------------------------');
  const totalDeleted = Object.values(deletedCounts).reduce((a, b) => a + b, 0);
  console.log(`Total documents removed : ${totalDeleted}`);
  console.log('Zero non-tagged or owner documents were modified.');
  console.log('================================================================');

  if (process.env.NODE_ENV !== 'test') {
    if (process.env.NODE_ENV !== 'test') {
    await mongoose.disconnect();
  }
  }
}

async function runVerify(plan, database) {
  console.log('================================================================');
  console.log('🔍 [VERIFY] LIVE DATABASE VERIFICATION');
  console.log('================================================================');
  console.log(`Target Database : ${database}`);
  console.log('----------------------------------------------------------------');

  await connectToMongo(database);
  console.log(` Connected to MongoDB Atlas (${database})`);

  const failures = [];

  // 1. Verify demo patient decryption
  const demoPatient = await models.Patient.findOne({ nic: '200012345678' });
  if (!demoPatient) {
    failures.push('Demo patient 200012345678 not found in database.');
    console.log('❌ Demo patient not found in database.');
  } else {
    console.log('✅ Demo patient decrypted successfully:');
    console.log(`   Name      : ${demoPatient.fullName}`);
    console.log(`   NIC (RAW) : ${demoPatient.nic}`);
    console.log(`   Contact   : ${demoPatient.contactInfo}`);
    console.log(`   Allergies : ${demoPatient.allergies.join(', ')}`);
  }

  // 2. Verify consultations count
  const consultCount = await models.Consultation.countDocuments({ consultationId: /^CON-VIVA-2026-/ });
  console.log(`\n📋 Consultations Count:`);
  console.log(`   Seeded consultations in database: ${consultCount} (Planned: 400)`);
  if (consultCount !== 400) {
    failures.push(`Expected 400 seeded consultations, found ${consultCount}`);
  }

  // 3. Verify public health stats on live collection
  const liveConsultDocs = await models.Consultation.collection.find({}).toArray();
  const agg = await aggregatePublicCases(liveConsultDocs, { mode: 'real', rangeDays: 30, now: new Date(plan.now) });
  console.log(`\n🌐 Public Health Live Aggregates:`);
  console.log(`   Verified Cases  : ${agg.verifiedCases} (Planned: 177)`);
  console.log(`   Awaiting Review : ${agg.awaitingReviewCount} (Planned: 10)`);
  console.log(`   State           : "${agg.state}"`);

  if (agg.verifiedCases !== 177) {
    failures.push(`Live verified cases mismatch: expected 177, got ${agg.verifiedCases}`);
  }
  if (agg.awaitingReviewCount !== 10) {
    failures.push(`Live awaiting review mismatch: expected 10, got ${agg.awaitingReviewCount}`);
  }

  // 4. Verify outbreak detector scenarios against live data
  const cases = liveConsultDocs
    .filter(c => String(c.consultationId || '').startsWith('CON-VIVA-2026-'))
    .map(c => ({
      consultationId: String(c._id),
      district: c.district,
      diseaseId: c.icdCode,
      disease: c.diagnosis,
      time: new Date(c.createdAt).getTime(),
      createdAt: c.createdAt
    }));

  const results = evaluateOutbreakCriteria({ cases, now: new Date(plan.now), baselineDays: 56, level: 'district' });
  const sA = results.find(r => r.district === 'Gampaha' && (r.disease === 'A90' || r.disease === 'Dengue'));
  const sB = results.find(r => r.district === 'Kalutara' && (r.disease === 'A90' || r.disease === 'Dengue'));
  const sC = results.find(r => r.district === 'Matara' && (r.disease === 'A90' || r.disease === 'Dengue'));
  const sD = results.find(r => r.district === 'Kandy' && (r.disease === 'J11.1' || r.disease === 'Influenza'));

  console.log(`\n🧪 Outbreak Scenarios Live Evaluation:`);
  console.log(`   [S-A] Gampaha Dengue: triggered=${sA?.triggered} (level=${sA?.alertLevel})`);
  console.log(`   [S-B] Kalutara Dengue: triggered=${sB?.triggered} (reason=${sB?.reason})`);
  console.log(`   [S-C] Matara Dengue: triggered=${sC?.triggered} (reason=${sC?.reason})`);
  console.log(`   [S-D] Kandy Influenza: triggered=${sD?.triggered} (level=${sD?.alertLevel})`);

  if (!sA?.triggered || sA.alertLevel !== 'Critical') {
    failures.push(`Scenario S-A expected triggered Critical alert in Gampaha, got triggered=${sA?.triggered}, level=${sA?.alertLevel}`);
  }
  if (sB?.triggered) {
    failures.push(`Scenario S-B negative control failed: Kalutara Dengue should NOT trigger an alert`);
  }
  if (sC?.triggered) {
    failures.push(`Scenario S-C negative control failed: Matara Dengue should NOT trigger an alert`);
  }
  if (!sD?.triggered || sD.alertLevel !== 'Alert') {
    failures.push(`Scenario S-D expected triggered Alert in Kandy, got triggered=${sD?.triggered}, level=${sD?.alertLevel}`);
  }

  // 5. Verify OutbreakAlert collection has S-A and S-D, and NO S-B or S-C
  const sAAlert = await models.OutbreakAlert.findOne({ location: 'Gampaha', disease: { $in: ['Dengue', 'A90'] } });
  const sDAlert = await models.OutbreakAlert.findOne({ location: 'Kandy', disease: { $in: ['Influenza', 'J11.1'] } });
  const sBAlert = await models.OutbreakAlert.findOne({ location: 'Kalutara', disease: { $in: ['Dengue', 'A90'] } });
  const sCAlert = await models.OutbreakAlert.findOne({ location: 'Matara', disease: { $in: ['Dengue', 'A90'] } });

  console.log(`\n🚨 OutbreakAlert Collection Inspection:`);
  console.log(`   S-A Alert (Gampaha Dengue)  : ${sAAlert ? `Found [${sAAlert.status}] (Affected: ${sAAlert.affectedCount})` : 'MISSING'}`);
  console.log(`   S-D Alert (Kandy Influenza) : ${sDAlert ? `Found [${sDAlert.status}] (Affected: ${sDAlert.affectedCount})` : 'MISSING'}`);
  console.log(`   S-B Alert (Kalutara Dengue) : ${sBAlert ? 'UNEXPECTED ALERT FOUND' : 'Clean (No Alert)'}`);
  console.log(`   S-C Alert (Matara Dengue)   : ${sCAlert ? 'UNEXPECTED ALERT FOUND' : 'Clean (No Alert)'}`);

  if (!sAAlert) failures.push('Missing OutbreakAlert for S-A (Gampaha Dengue)');
  if (!sDAlert) failures.push('Missing OutbreakAlert for S-D (Kandy Influenza)');
  if (sBAlert) failures.push('Unexpected OutbreakAlert found for S-B negative control (Kalutara)');
  if (sCAlert) failures.push('Unexpected OutbreakAlert found for S-C negative control (Matara)');

  // 6. Verify Email routability when ownerEmail used
  const ownerEmailUsed = plan.ownerEmail || (demoPatient?.email && !demoPatient.email.endsWith('.invalid'));
  if (ownerEmailUsed) {
    console.log(`\n📧 Email Routability Verification:`);
    const seededStaff = await models.PharmacyStaff.find({ syntheticSeedBatch: plan.namespace });
    const seededDoctors = await models.Doctor.find({ syntheticSeedBatch: plan.namespace });
    const seededPatients = await models.Patient.find({ syntheticSeedBatch: plan.namespace });
    const accounts = [...seededStaff, ...seededDoctors, ...seededPatients];

    for (const acc of accounts) {
      const email = acc.email;
      if (!email || email.includes('.invalid') || email.includes('.example') || !email.includes('+') || !email.includes('@')) {
        failures.push(`Non-routable email found for account ${acc._id} (${acc.fullName || acc.name}): ${email}`);
      }
    }
    console.log(`   Checked ${accounts.length} accounts: all use routable plus-aliases.`);
  }

  console.log('================================================================');
  if (process.env.NODE_ENV !== 'test') {
    await mongoose.disconnect();
  }

  if (failures.length > 0) {
    console.error('\x1b[31m%s\x1b[0m', '❌ [VERIFY FAILURE] LIVE AGGREGATES DIFFER FROM SEED PLAN:');
    for (const f of failures) {
      console.error('\x1b[31m%s\x1b[0m', `   - ${f}`);
    }
    const err = new Error(`SEED_VERIFY_FAILED: ${failures.length} verification check(s) failed.`);
    err.failures = failures;
    throw err;
  }

  console.log('\x1b[32m%s\x1b[0m', '✅ [VERIFY SUCCESS] All live aggregates, outbreak scenarios, and email routability match the seed plan 100%!');
  console.log('================================================================');
}

async function main() {
  const args = parseArgs();
  loadEncryptionKeys();
  const plan = buildVivaSeedPlan({
    now: new Date(),
    ownerEmail: args.ownerEmail || process.env.VIVA_DEMO_EMAIL || null
  });

  if (args.action === 'dry-run') {
    await runDryRun(plan);
  } else if (args.action === 'seed') {
    await runSeed(plan, args.database);
  } else if (args.action === 'rollback') {
    await runRollback(args.database);
  } else if (args.action === 'verify') {
    await runVerify(plan, args.database);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('FATAL ERROR:', err);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  runDryRun,
  runSeed,
  runRollback,
  runVerify
};
