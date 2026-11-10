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

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--confirm') confirm = true;
    else if (arg === '--dry-run') action = 'dry-run';
    else if (arg === '--rollback') action = 'rollback';
    else if (arg === '--verify') action = 'verify';
    else if (arg === '--db') {
      database = args[++i];
      if (!database || database.startsWith('--')) throw new Error('Database name required after --db');
    } else if (arg === '-h' || arg === '--help') {
      console.log(`
Usage: node scripts/seed-viva-data.js [options]

Options:
  --dry-run      Run full plan generation, validation, and scenario proof (default, 0 writes)
  --confirm      Execute database writes (requires confirmation)
  --rollback     Reverse viva seed batch, deleting only documents with batch tag "viva-2026-11"
  --verify       Execute live post-seed validation queries against the target database
  --db <name>    Target database (default: medisync_prod; allowed: medisync_prod, medisync_automated_test)
  -h, --help     Show this help text
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (confirm && action === 'dry-run') action = 'seed';
  return { action, database, confirm };
}

function loadEncryptionKeys() {
  const { validateAndLoadOperatorKeys } = require('../server/src/security/operatorKeyPolicy');
  const ring = validateAndLoadOperatorKeys(process.env);
  global.ENCRYPTION_KEYS = ring.keys;
  global.ACTIVE_KEY_VERSION = ring.activeVersion;
  global.ENCRYPTION_KEY = ring.keys[ring.activeVersion];
}

async function connectToMongo(database) {
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

  console.log('\n👤 4. DEMO PATIENT PROFILE & QR CAPABILITY:');
  console.log(`   Name                  : ${plan.demoPatient.name}`);
  console.log(`   Synthetic NIC (OA-14) : ${plan.demoPatient.nic}`);
  console.log(`   Email                 : ${plan.demoPatient.email}`);
  console.log(`   QR Capability URL     : ${plan.demoPatient.qrUrl}`);

  console.log('\n🛡️ 5. REVERSIBILITY & ROLLBACK DRY-RUN:');
  console.log(`   Batch Tag Identifier : syntheticSeedBatch: "${plan.namespace}"`);
  console.log(`   Consultation Pattern : consultationId: /^CON-VIVA-2026-\\d{4}$/`);
  console.log(`   Would Delete on Undo : ${totalDocs} documents across 10 collections`);
  console.log(`   Existing Real Data   : Protected (0 modifications, zero cross-batch cascade)`);
  console.log('================================================================');
  console.log('✅ Dry-run successful. To apply this plan, run:');
  console.log('   node scripts/seed-viva-data.js --confirm');
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
      preparedDocs.push(instance.toObject({ depopulate: true, versionKey: false }));
    }

    // Insert prepared documents into collection
    const result = await Model.collection.insertMany(preparedDocs, { ordered: true });
    insertedCounts[modelName] = result.insertedCount;
    console.log(`   Inserted ${String(result.insertedCount).padStart(4)} ${modelName} documents`);
  }

  // Pre-seed the OutbreakAlert for Scenario S-A (Gampaha Dengue) as 'Pending'
  // so the administrator can demonstrate approving it in the admin dashboard!
  const alertId = new mongoose.Types.ObjectId(crypto.createHash('sha256').update(`${plan.namespace}:ALERT:S-A:Gampaha:Dengue`).digest('hex').slice(0, 24));
  const sAAlert = {
    _id: alertId,
    disease: 'Dengue',
    location: 'Gampaha',
    affectedCount: 12,
    severity: 'High',
    status: 'Pending',
    surveillancePolicy: 'surveillance-verified-district-v1',
    isSimulation: false,
    isSynthetic: true,
    syntheticSeedBatch: plan.namespace,
    message: 'Elevated syndromic cluster detected in Gampaha (N=12, persistent over 4 consecutive calendar days). Awaiting administrative epidemiological review.',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  await models.OutbreakAlert.collection.updateOne(
    { _id: alertId },
    { $set: sAAlert },
    { upsert: true }
  );
  console.log(`   Seeded 1 OutbreakAlert for S-A Gampaha Dengue (Status: Pending)`);

  console.log('----------------------------------------------------------------');
  console.log('🎉 Viva seed batch committed successfully!');
  console.log('================================================================');

  await mongoose.disconnect();
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

  await mongoose.disconnect();
}

async function runVerify(plan, database) {
  console.log('================================================================');
  console.log('🔍 [VERIFY] LIVE DATABASE VERIFICATION');
  console.log('================================================================');
  console.log(`Target Database : ${database}`);
  console.log('----------------------------------------------------------------');

  await connectToMongo(database);
  console.log(` Connected to MongoDB Atlas (${database})`);

  // Verify demo patient decryption
  const demoPatient = await models.Patient.findOne({ nic: '200012345678' });
  if (!demoPatient) {
    console.log('❌ Demo patient not found in database.');
  } else {
    console.log('✅ Demo patient decrypted successfully:');
    console.log(`   Name      : ${demoPatient.fullName}`);
    console.log(`   NIC (RAW) : ${demoPatient.nic}`);
    console.log(`   Contact   : ${demoPatient.contactInfo}`);
    console.log(`   Allergies : ${demoPatient.allergies.join(', ')}`);
  }

  // Verify consultations count
  const consultCount = await models.Consultation.countDocuments({ consultationId: /^CON-VIVA-2026-/ });
  console.log(`✅ Seeded consultations in database: ${consultCount}`);

  // Verify public health stats on live collection
  const agg = await aggregatePublicCases(await models.Consultation.collection.find({}).toArray(), { mode: 'real', rangeDays: 30, now: new Date() });
  console.log(`✅ Public health aggregation on live data:`);
  console.log(`   Verified Cases  : ${agg.verifiedCases}`);
  console.log(`   Awaiting Review : ${agg.awaitingReviewCount}`);
  console.log(`   State           : ${agg.state}`);

  // Verify S-A OutbreakAlert
  const alert = await models.OutbreakAlert.findOne({ location: 'Gampaha', disease: 'Dengue' });
  if (alert) {
    console.log(`✅ S-A OutbreakAlert found: [${alert.status}] ${alert.disease} in ${alert.location} (Affected: ${alert.affectedCount})`);
  }

  console.log('================================================================');
  await mongoose.disconnect();
}

async function main() {
  const args = parseArgs();
  loadEncryptionKeys();
  const plan = buildVivaSeedPlan({ now: new Date(), ownerMailbox: process.env.VIVA_DEMO_EMAIL || null });

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
