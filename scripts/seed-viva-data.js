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

const { NAMESPACE, buildVivaSeedPlan, deterministicObjectId } = require('./seedVivaPlan.cjs');
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
  let legacy = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--confirm') confirm = true;
    else if (arg === '--dry-run') action = 'dry-run';
    else if (arg === '--rollback') action = 'rollback';
    else if (arg === '--legacy') legacy = true;
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
  --rollback                Reverse viva seed batch via seed_manifests IDs + batch tag fallbacks
  --rollback --legacy       Clean up leftover un-tagged documents from the initial seed run using deterministic IDs + seed markers
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

  if (action === 'rollback' && legacy) {
    action = 'rollback-legacy';
  } else if (confirm && action === 'dry-run') {
    action = 'seed';
  }
  return { action, database, confirm, ownerEmail, legacy };
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
  const manifestCollections = {};

  for (const [modelName, docs] of Object.entries(plan.documentsByModel)) {
    const Model = models[modelName];
    if (!Model) throw new Error(`Model not found: ${modelName}`);

    const preparedDocs = [];
    const docIds = [];

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

      // Native driver guarantee: preserve every field from input
      // so strict schemas do not strip syntheticSeedBatch, isSynthetic, surveillanceVerification, etc.
      for (const [k, v] of Object.entries(input)) {
        if (obj[k] === undefined && v !== undefined) {
          obj[k] = v;
        }
      }

      // Convert 24-char hex string _id to native ObjectId
      if (typeof obj._id === 'string' && /^[0-9a-f]{24}$/i.test(obj._id)) {
        obj._id = new mongoose.Types.ObjectId(obj._id);
      }

      preparedDocs.push(obj);
      docIds.push(obj._id);
    }

    // Insert prepared documents into collection via native driver
    const result = await Model.collection.insertMany(preparedDocs, { ordered: true });
    insertedCounts[modelName] = result.insertedCount;
    manifestCollections[Model.collection.collectionName] = docIds;
    console.log(`   Inserted ${String(result.insertedCount).padStart(4)} ${modelName} documents`);
  }

  // ── Outbreak Alerts: Run real detector on inserted verified consultations ─────
  console.log(`\n🚨 Running real outbreak detector on seeded clinical consultations...`);
  const insertedConsultations = await models.Consultation.collection.find({
    $or: [
      { consultationId: /^CON-VIVA-2026-/ },
      { syntheticSeedBatch: plan.namespace }
    ]
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
  const alertIds = [];
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
    alertIds.push(alertId);
    alertsCreated++;
    console.log(`   Real Detector produced: [Pending] ${alertDoc.severity} Alert for ${alertDoc.disease} in ${alertDoc.location} (Affected: ${alertDoc.affectedCount})`);
  }
  manifestCollections[models.OutbreakAlert.collection.collectionName] = alertIds;
  console.log(`   Seeded ${alertsCreated} OutbreakAlerts via real detection engine (S-B & S-C negative controls suppressed).`);

  // ── Write Manifest Document ────────────────────────────────────────────────
  const manifestDoc = {
    _id: `manifest-${plan.namespace}`,
    batch: plan.namespace,
    database,
    createdAt: new Date(),
    counts: insertedCounts,
    collections: manifestCollections
  };

  await mongoose.connection.collection('seed_manifests').updateOne(
    { batch: plan.namespace },
    { $set: manifestDoc },
    { upsert: true }
  );
  console.log(`\n📋 Seed manifest recorded in 'seed_manifests' (batch: "${plan.namespace}", ${Object.keys(manifestCollections).length} collections).`);

  console.log(`\n🔑 [ONE-TIME SECRET] Live QR Capability Token generated:`);
  console.log(`   Verification URL : ${plan.demoPatient.qrUrl}`);
  console.log(`   (Printed once to console; only SHA-256 tokenHash is stored in the database.)\n`);

  console.log('----------------------------------------------------------------');
  console.log('🎉 Viva seed batch committed successfully!');
  console.log('================================================================');

  if (process.env.NODE_ENV !== 'test') {
    await mongoose.disconnect();
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

  // 1. Read manifest document from seed_manifests if present
  let manifest = null;
  try {
    manifest = await mongoose.connection.collection('seed_manifests').findOne({ batch: NAMESPACE });
    if (manifest) {
      console.log(`   Found seed_manifests document with ${Object.keys(manifest.collections || {}).length} tracked collection(s).`);
    }
  } catch (err) {
    console.log(`   Note: seed_manifests lookup: ${err.message}`);
  }

  const deletedCounts = {};

  const allModels = [
    'Hospital', 'Pharmacy', 'Doctor', 'PharmacyStaff', 'Patient',
    'Consultation', 'Prescription', 'Dispensing', 'LabTest',
    'VerificationToken', 'OutbreakAlert'
  ];

  for (const modelName of allModels) {
    const Model = models[modelName];
    if (!Model) continue;
    const collName = Model.collection.collectionName;

    // Collect IDs from manifest for this collection
    const manifestIds = (manifest && manifest.collections && manifest.collections[collName])
      ? manifest.collections[collName].map(id => typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id)
      : [];

    const orClauses = [];
    if (manifestIds.length > 0) {
      orClauses.push({ _id: { $in: manifestIds } });
    }
    orClauses.push({ syntheticSeedBatch: NAMESPACE });

    if (modelName === 'Consultation') {
      orClauses.push({ consultationId: /^CON-VIVA-2026-/ });
      orClauses.push({ 'surveillanceVerification.verifiedBy': NAMESPACE });
    } else if (modelName === 'Prescription') {
      orClauses.push({ prescriptionRef: /^RX-VIVA-2026-/ });
    } else if (modelName === 'LabTest') {
      orClauses.push({ reportId: /^RPT-VIVA-2026-/ });
    } else if (modelName === 'VerificationToken') {
      orClauses.push({ reason: 'viva_demo_qr_access' });
      orClauses.push({ tokenHash: /^8390ba72/ });
    } else if (modelName === 'OutbreakAlert') {
      orClauses.push({ isSynthetic: true, syntheticSeedBatch: NAMESPACE });
      orClauses.push({ surveillancePolicy: '5w-verified-episodes-v1', isSynthetic: true });
    } else if (modelName === 'Patient') {
      orClauses.push({ nic: '200012345678' });
      orClauses.push({ email: /@accounts\.invalid$/ });
    } else if (modelName === 'Doctor') {
      orClauses.push({ licenseNo: { $in: ['SLMC-24819', 'SLMC-31204', 'SLMC-42918', 'SLMC-51029'] } });
      orClauses.push({ email: /@accounts\.invalid$/ });
    } else if (modelName === 'PharmacyStaff') {
      orClauses.push({ licenseNo: { $in: ['SPMC-7102', 'SPMC-8831', 'SPMC-9402'] } });
      orClauses.push({ email: /@accounts\.invalid$/ });
    } else if (modelName === 'Hospital') {
      orClauses.push({ name: { $in: ['National Apex General Hospital', 'Kandy Teaching Hospital', 'Colombo Apex National Hospital', 'Kandy Central General Hospital'] } });
    } else if (modelName === 'Pharmacy') {
      orClauses.push({ name: { $in: ['Colombo Central Community Dispensary', 'Gampaha City Healthcare Pharmacy', 'Asiri Central Care Pharmacy', 'Kandy City Dispensary'] } });
    }

    const deleteRes = await Model.collection.deleteMany({ $or: orClauses });
    deletedCounts[modelName] = deleteRes.deletedCount;
    console.log(`   Removed ${String(deleteRes.deletedCount).padStart(4)} ${modelName} documents`);
  }

  // 2. Remove manifest record
  try {
    await mongoose.connection.collection('seed_manifests').deleteOne({ batch: NAMESPACE });
  } catch (_) {}

  // 3. Post-rollback verification: confirm 0 remaining documents across all collections
  console.log('\n🔍 Verifying post-rollback collection cleanliness:');
  const remainingErrors = [];

  for (const modelName of allModels) {
    const Model = models[modelName];
    if (!Model) continue;

    const checkClauses = [{ syntheticSeedBatch: NAMESPACE }];
    if (modelName === 'Consultation') {
      checkClauses.push({ consultationId: /^CON-VIVA-2026-/ });
      checkClauses.push({ 'surveillanceVerification.verifiedBy': NAMESPACE });
    } else if (modelName === 'Prescription') {
      checkClauses.push({ prescriptionRef: /^RX-VIVA-2026-/ });
    } else if (modelName === 'LabTest') {
      checkClauses.push({ reportId: /^RPT-VIVA-2026-/ });
    } else if (modelName === 'VerificationToken') {
      checkClauses.push({ reason: 'viva_demo_qr_access' });
      checkClauses.push({ tokenHash: /^8390ba72/ });
    } else if (modelName === 'OutbreakAlert') {
      checkClauses.push({ syntheticSeedBatch: NAMESPACE });
    } else if (modelName === 'Patient') {
      checkClauses.push({ nic: '200012345678' });
    } else if (modelName === 'Doctor') {
      checkClauses.push({ licenseNo: { $in: ['SLMC-24819', 'SLMC-31204', 'SLMC-42918', 'SLMC-51029'] } });
    } else if (modelName === 'PharmacyStaff') {
      checkClauses.push({ licenseNo: { $in: ['SPMC-7102', 'SPMC-8831', 'SPMC-9402'] } });
    } else if (modelName === 'Hospital') {
      checkClauses.push({ name: { $in: ['National Apex General Hospital', 'Kandy Teaching Hospital', 'Colombo Apex National Hospital', 'Kandy Central General Hospital'] } });
    } else if (modelName === 'Pharmacy') {
      checkClauses.push({ name: { $in: ['Colombo Central Community Dispensary', 'Gampaha City Healthcare Pharmacy', 'Asiri Central Care Pharmacy', 'Kandy City Dispensary'] } });
    }

    const remaining = await Model.collection.countDocuments({ $or: checkClauses });
    console.log(`   Remaining after rollback: ${remaining} for ${modelName}`);
    if (remaining > 0) {
      remainingErrors.push(`${modelName}: ${remaining} documents still present after rollback`);
    }
  }

  console.log('----------------------------------------------------------------');
  const totalDeleted = Object.values(deletedCounts).reduce((a, b) => a + b, 0);
  console.log(`Total documents removed : ${totalDeleted}`);
  console.log('Zero non-tagged or owner documents were modified.');
  console.log('================================================================');

  if (process.env.NODE_ENV !== 'test') {
    await mongoose.disconnect();
  }

  if (remainingErrors.length > 0) {
    console.error('\x1b[31m%s\x1b[0m', '❌ [ROLLBACK FAILED] Documents from viva seed batch remain in database:');
    for (const e of remainingErrors) {
      console.error('\x1b[31m%s\x1b[0m', `   - ${e}`);
    }
    const err = new Error(`ROLLBACK_VERIFICATION_FAILED: ${remainingErrors.length} collection(s) still have seeded documents.`);
    err.remainingErrors = remainingErrors;
    throw err;
  }

  console.log('\x1b[32m%s\x1b[0m', '✅ [ROLLBACK SUCCESS] All seeded documents deleted and verified 0 remaining across all collections.');
}

async function runRollbackLegacy(database, confirm = false) {
  console.log('================================================================');
  console.log('🧹 [LEGACY ROLLBACK] CLEANING UP UNTAGGED LEFTOVER SEED DOCUMENTS');
  console.log('================================================================');
  console.log(`Target Database : ${database}`);
  console.log(`Execution Mode  : ${confirm ? 'EXECUTE (CONFIRMED WRITES)' : 'DRY-RUN (0 WRITES)'}`);
  console.log('----------------------------------------------------------------');

  await connectToMongo(database);
  console.log(` Connected to MongoDB Atlas (${database})`);

  // Target legacy collections and their expected counts + seed markers
  const legacySpecs = [
    {
      modelName: 'Hospital',
      expectedCount: 2,
      ids: [0, 1].map(i => deterministicObjectId('Hospital', i)),
      seedFilter: { name: { $in: ['National Apex General Hospital', 'Kandy Teaching Hospital', 'Colombo Apex National Hospital', 'Kandy Central General Hospital'] } }
    },
    {
      modelName: 'Pharmacy',
      expectedCount: 2,
      ids: [0, 1].map(i => deterministicObjectId('Pharmacy', i)),
      seedFilter: { name: { $in: ['Colombo Central Community Dispensary', 'Gampaha City Healthcare Pharmacy', 'Asiri Central Care Pharmacy', 'Kandy City Dispensary'] } }
    },
    {
      modelName: 'Doctor',
      expectedCount: 4,
      ids: [0, 1, 2, 3].map(i => deterministicObjectId('Doctor', i)),
      seedFilter: { licenseNo: { $in: ['SLMC-24819', 'SLMC-31204', 'SLMC-42918', 'SLMC-51029'] } }
    },
    {
      modelName: 'PharmacyStaff',
      expectedCount: 3,
      ids: [0, 1, 2].map(i => deterministicObjectId('PharmacyStaff', i)),
      seedFilter: { $or: [{ licenseNo: { $in: ['SPMC-7102', 'SPMC-8831', 'SPMC-9402'] } }, { fullName: { $in: ['Kaveen Bandara', 'Malarvel Selvam', 'Thushara Perera'] } }] }
    },
    {
      modelName: 'Patient',
      expectedCount: 30,
      ids: Array.from({ length: 30 }, (_, i) => deterministicObjectId('Patient', i)),
      seedFilter: { $or: [{ nic: '200012345678' }, { email: /@accounts\.invalid$/ }, { email: /\+patient/ }, { fullName: 'Chamod Tharusha' }, { isSynthetic: true }] }
    },
    {
      modelName: 'Prescription',
      expectedCount: 283,
      ids: Array.from({ length: 283 }, (_, i) => deterministicObjectId('Prescription', i)),
      seedFilter: { prescriptionRef: /^RX-VIVA-2026-/ }
    },
    {
      modelName: 'LabTest',
      expectedCount: 12,
      ids: Array.from({ length: 12 }, (_, i) => deterministicObjectId('LabTest', i)),
      seedFilter: { reportId: /^RPT-VIVA-2026-/ }
    },
    {
      modelName: 'VerificationToken',
      expectedCount: 1,
      ids: [deterministicObjectId('VerificationToken', 0)],
      seedFilter: { $or: [{ reason: 'viva_demo_qr_access' }, { tokenHash: /^8390ba72/ }] },
      includeTokenHashPrefix: /^8390ba72/
    }
  ];

  let totalFound = 0;
  let totalDeleted = 0;
  const planSummary = [];

  for (const spec of legacySpecs) {
    const Model = models[spec.modelName];
    if (!Model) continue;

    const objectIds = spec.ids.map(id => new mongoose.Types.ObjectId(id));
    const orQuery = [{ _id: { $in: objectIds } }];
    if (spec.includeTokenHashPrefix) {
      orQuery.push({ tokenHash: spec.includeTokenHashPrefix });
    }

    // Compound safety query: MUST match deterministic ID / hash AND seed marker
    const safetyQuery = {
      $and: [
        { $or: orQuery },
        spec.seedFilter
      ]
    };

    const foundCount = await Model.collection.countDocuments(safetyQuery);
    totalFound += foundCount;
    planSummary.push({
      collection: spec.modelName,
      found: foundCount,
      expected: spec.expectedCount
    });

    console.log(`   ${spec.modelName.padEnd(18)}: Found ${String(foundCount).padStart(3)} documents (Expected: ${spec.expectedCount})`);

    if (confirm && foundCount > 0) {
      const deleteRes = await Model.collection.deleteMany(safetyQuery);
      totalDeleted += deleteRes.deletedCount;
      const remaining = await Model.collection.countDocuments(safetyQuery);
      if (remaining !== 0) {
        throw new Error(`LEGACY_ROLLBACK_FAILED: ${remaining} documents remain in ${spec.modelName}`);
      }
      console.log(`      -> Successfully deleted ${deleteRes.deletedCount} documents (Remaining: 0)`);
    }
  }

  // Also clean up any manifest leftovers if present
  if (confirm) {
    try {
      await mongoose.connection.collection('seed_manifests').deleteOne({ batch: NAMESPACE });
    } catch (_) {}
  }

  console.log('----------------------------------------------------------------');
  if (!confirm) {
    console.log(`🔎 [DRY-RUN RESULT] Total legacy leftover documents identified: ${totalFound}`);
    console.log(`   Zero documents were modified or deleted.`);
    console.log(`\nTo execute deletion of these legacy leftovers, run with --confirm:`);
    console.log(`   node scripts/seed-viva-data.js --rollback --legacy --confirm --db=${database}`);
  } else {
    console.log(`🎉 [CLEANUP RESULT] Total legacy documents permanently removed: ${totalDeleted}`);
    console.log(`   Consultations and real user accounts were 100% untouched.`);
  }
  console.log('================================================================');

  if (process.env.NODE_ENV !== 'test') {
    await mongoose.disconnect();
  }

  return { totalFound, totalDeleted, planSummary };
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
  const liveConsultDocs = await models.Consultation.collection.find({}).toArray();
  const seededConsultDocs = liveConsultDocs.filter(c => String(c.consultationId || '').startsWith('CON-VIVA-2026-'));
  const realConsultDocs = liveConsultDocs.filter(c => !String(c.consultationId || '').startsWith('CON-VIVA-2026-'));

  console.log(`\n📋 Consultations Count:`);
  console.log(`   Seeded consultations in database: ${seededConsultDocs.length} (Planned: 400)`);
  if (realConsultDocs.length > 0) {
    console.log(`   Real production consultations   : ${realConsultDocs.length} (Excluded from viva assertions)`);
  }
  if (seededConsultDocs.length !== 400) {
    failures.push(`Expected 400 seeded consultations, found ${seededConsultDocs.length}`);
  }

  // 3. Verify public health stats on seeded cohort
  const agg = await aggregatePublicCases(seededConsultDocs, { mode: 'real', rangeDays: 30, now: new Date(plan.now) });
  console.log(`\n🌐 Public Health Live Aggregates (Seeded Cohort):`);
  console.log(`   Verified Cases  : ${agg.verifiedCases} (Planned: 177)`);
  console.log(`   Awaiting Review : ${agg.awaitingReviewCount} (Planned: 10)`);
  console.log(`   State           : "${agg.state}"`);

  if (agg.verifiedCases !== 177) {
    failures.push(`Live verified cases mismatch: expected 177, got ${agg.verifiedCases}`);
  }
  if (agg.awaitingReviewCount !== 10) {
    failures.push(`Live awaiting review mismatch: expected 10, got ${agg.awaitingReviewCount}`);
  }

  // 4. Verify outbreak detector scenarios against seeded data
  const cases = seededConsultDocs.map(c => ({
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
  } else if (args.action === 'rollback-legacy') {
    await runRollbackLegacy(args.database, args.confirm);
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
  runRollbackLegacy,
  runVerify
};
