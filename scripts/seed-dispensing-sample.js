'use strict';

/**
 * scripts/seed-dispensing-sample.js
 *
 * Additive, idempotent 30-day pharmacy dispensing sample seeder for MediSync.
 * Namespace: SEED_2026_11_B
 *
 * Safety Invariants:
 * 1. Dry-run by default: ZERO database writes unless `--confirm` is passed.
 * 2. Requires approval env var `MEDISYNC_SEED_RUN_APPROVAL="SEED RUN APPROVED"`
 *    (or `SEED_APPROVAL=I_APPROVE_SEED_2026_11_B`) when `--confirm` is passed.
 * 3. Additive & Idempotent: Upserts only deterministic `SEED_2026_11_B` documents
 *    keyed by `receiptNumber` (`RCP-SEED-202611B-###`). Never deletes or alters
 *    documents from `SEED_2026_11_A` or non-synthetic clinical records.
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const Dispensing = require('../server/src/models/Dispensing');
const Pharmacy = require('../server/src/models/Pharmacy');
const PharmacyStaff = require('../server/src/models/PharmacyStaff');
const Prescription = require('../server/src/models/Prescription');

const SEED_NAMESPACE = 'SEED_2026_11_B';
const PROTECTED_NAMESPACES = ['SEED_2026_11_A', 'DEMO_OUTBREAK_2026_V1'];
const ALLOWED_DATABASES = ['medisync_prod', 'medisync_automated_test'];

const SAMPLE_MEDICATIONS = [
  { drugName: 'Paracetamol', dosage: '500mg', unit: 'tablets', baseQty: 12 },
  { drugName: 'Amoxicillin', dosage: '500mg', unit: 'capsules', baseQty: 15 },
  { drugName: 'Cetirizine', dosage: '10mg', unit: 'tablets', baseQty: 10 },
  { drugName: 'Metformin', dosage: '500mg', unit: 'tablets', baseQty: 30 },
  { drugName: 'Atorvastatin', dosage: '20mg', unit: 'tablets', baseQty: 30 },
  { drugName: 'Omeprazole', dosage: '20mg', unit: 'capsules', baseQty: 14 },
  { drugName: 'Losartan', dosage: '50mg', unit: 'tablets', baseQty: 28 },
  { drugName: 'Oral Rehydration Salts', dosage: '20.5g', unit: 'sachets', baseQty: 6 },
];

function deterministicObjectId(seedKey) {
  const hex = crypto.createHash('sha256').update(`${SEED_NAMESPACE}:${seedKey}`).digest('hex').slice(0, 24);
  return new mongoose.Types.ObjectId(hex);
}

function fail(code, message) {
  const err = new Error(message ? `[${code}] ${message}` : code);
  err.code = code;
  throw err;
}

function parseCliArgs(args = []) {
  let database = 'medisync_automated_test';
  let apply = false;
  let dryRun = true;

  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--db') {
      database = args[++i];
      if (!database || database.startsWith('--')) {
        fail('SEED_DATABASE_REQUIRED', '--db requires a database name');
      }
    } else if (flag === '--confirm' || flag === '--apply') {
      apply = true;
      dryRun = false;
    } else if (flag === '--dry-run') {
      dryRun = true;
      apply = false;
    } else {
      fail('SEED_ARGUMENT_INVALID', `Unrecognized argument: ${flag}`);
    }
  }

  if (!ALLOWED_DATABASES.includes(database)) {
    fail('SEED_DATABASE_NOT_APPROVED', `Database ${database} is not in approved list`);
  }

  return {
    namespace: SEED_NAMESPACE,
    database,
    apply,
    dryRun: !apply,
  };
}

function verifySeedApproval(parsed, env = process.env) {
  if (parsed.dryRun) {
    return { approved: true, mode: 'DRY_RUN' };
  }
  const isApproved =
    env.MEDISYNC_SEED_RUN_APPROVAL === 'SEED RUN APPROVED' ||
    env.SEED_APPROVAL === 'I_APPROVE_SEED_2026_11_B';
  if (!isApproved) {
    fail(
      'SEED_WRITE_APPROVAL_REQUIRED',
      'Applying SEED_2026_11_B requires MEDISYNC_SEED_RUN_APPROVAL="SEED RUN APPROVED" or SEED_APPROVAL=I_APPROVE_SEED_2026_11_B'
    );
  }
  return { approved: true, mode: 'APPLY' };
}

function buildSampleDispensingPlan({
  pharmacyId,
  staffId,
  prescriptionId,
  now = new Date(),
  days = 30,
} = {}) {
  const resolvedPharmacyId = pharmacyId || deterministicObjectId('pharmacy:default');
  const resolvedStaffId = staffId || deterministicObjectId('staff:default');
  const resolvedPrescriptionId = prescriptionId || deterministicObjectId('prescription:default');
  const baseTime = now instanceof Date ? now.getTime() : Date.now();

  const records = [];
  for (let dayOffset = 0; dayOffset < days; dayOffset++) {
    // 2 receipts per day across the 30-day window (60 receipts total, multi-medication items)
    for (let slot = 0; slot < 2; slot++) {
      const idx = dayOffset * 2 + slot + 1;
      const receiptNumber = `RCP-SEED-202611B-${String(idx).padStart(3, '0')}`;
      const recordId = deterministicObjectId(`dispensing:${receiptNumber}`);
      const hoursAgo = dayOffset * 24 + (slot === 0 ? 4 : 11);
      const dispensedAt = new Date(baseTime - hoursAgo * 60 * 60 * 1000);

      const medA = SAMPLE_MEDICATIONS[(dayOffset + slot) % SAMPLE_MEDICATIONS.length];
      const medB = SAMPLE_MEDICATIONS[(dayOffset + slot + 3) % SAMPLE_MEDICATIONS.length];

      const items = [
        {
          drugName: medA.drugName,
          dosage: medA.dosage,
          quantityDispensed: medA.baseQty + (dayOffset % 5),
          unit: medA.unit,
          status: 'dispensed',
        },
        {
          drugName: medB.drugName,
          dosage: medB.dosage,
          quantityDispensed: medB.baseQty + ((dayOffset + 2) % 4),
          unit: medB.unit,
          status: 'dispensed',
        },
      ];

      records.push({
        _id: recordId,
        receiptNumber,
        prescriptionId: resolvedPrescriptionId,
        pharmacyId: resolvedPharmacyId,
        staffId: resolvedStaffId,
        patientNic: `1994${String(10000000 + (idx % 9000)).slice(-8)}`,
        items,
        dispensedAt,
        createdAt: dispensedAt,
        updatedAt: dispensedAt,
        isSynthetic: true,
        syntheticSeedBatch: SEED_NAMESPACE,
        notes: `Synthetic 30-day dispensing sample (${SEED_NAMESPACE})`,
      });
    }
  }

  return {
    namespace: SEED_NAMESPACE,
    protectedNamespaces: PROTECTED_NAMESPACES,
    recordCount: records.length,
    records,
  };
}

async function runDispensingSampleSeed({
  args = [],
  env = process.env,
  now = new Date(),
  pharmacyId = null,
  staffId = null,
  prescriptionId = null,
} = {}) {
  const parsed = parseCliArgs(args);
  verifySeedApproval(parsed, env);

  let targetPharmacyId = pharmacyId;
  let targetStaffId = staffId;
  let targetPrescriptionId = prescriptionId;

  if (mongoose.connection.readyState === 1) {
    if (!targetPharmacyId) {
      const existingPharmacy = await Pharmacy.findOne({}).select('_id').lean();
      if (existingPharmacy?._id) targetPharmacyId = existingPharmacy._id;
    }
    if (!targetStaffId) {
      const existingStaff = await PharmacyStaff.findOne(
        targetPharmacyId ? { pharmacyId: targetPharmacyId } : {}
      ).select('_id pharmacyId').lean();
      if (existingStaff?._id) {
        targetStaffId = existingStaff._id;
        if (!targetPharmacyId && existingStaff.pharmacyId) {
          targetPharmacyId = existingStaff.pharmacyId;
        }
      }
    }
    if (!targetPrescriptionId) {
      const existingRx = await Prescription.findOne({ status: 'dispensed' }).select('_id').lean();
      if (existingRx?._id) targetPrescriptionId = existingRx._id;
    }
  }

  const plan = buildSampleDispensingPlan({
    pharmacyId: targetPharmacyId,
    staffId: targetStaffId,
    prescriptionId: targetPrescriptionId,
    now,
  });

  const existingOwnedCount =
    mongoose.connection.readyState === 1
      ? await Dispensing.countDocuments({ syntheticSeedBatch: SEED_NAMESPACE })
      : 0;

  if (parsed.dryRun) {
    return {
      mode: 'DRY_RUN',
      namespace: SEED_NAMESPACE,
      database: parsed.database,
      plannedRecords: plan.recordCount,
      existingOwnedCount,
      insertedCount: 0,
      updatedCount: 0,
    };
  }

  let insertedCount = 0;
  let updatedCount = 0;

  for (const doc of plan.records) {
    const existing = await Dispensing.findOne({ receiptNumber: doc.receiptNumber }).lean();
    if (existing) {
      if (existing.syntheticSeedBatch && existing.syntheticSeedBatch !== SEED_NAMESPACE) {
        fail('SEED_NAMESPACE_COLLISION', `Refusing to overwrite receipt ${doc.receiptNumber} owned by ${existing.syntheticSeedBatch}`);
      }
      await Dispensing.updateOne(
        { _id: existing._id },
        {
          $set: {
            items: doc.items,
            dispensedAt: doc.dispensedAt,
            pharmacyId: doc.pharmacyId,
            staffId: doc.staffId,
            isSynthetic: true,
            syntheticSeedBatch: SEED_NAMESPACE,
          },
        }
      );
      updatedCount++;
    } else {
      await Dispensing.create(doc);
      insertedCount++;
    }
  }

  const finalOwnedCount = await Dispensing.countDocuments({ syntheticSeedBatch: SEED_NAMESPACE });
  return {
    mode: 'APPLY',
    namespace: SEED_NAMESPACE,
    database: parsed.database,
    plannedRecords: plan.recordCount,
    existingOwnedCount,
    insertedCount,
    updatedCount,
    finalOwnedCount,
  };
}

if (require.main === module) {
  (async () => {
    const dotenv = require('dotenv');
    const path = require('path');
    dotenv.config({ path: path.join(__dirname, '../server/.env') });

    const parsed = parseCliArgs(process.argv.slice(2));
    verifySeedApproval(parsed, process.env);

    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
      fail('MONGO_URI_MISSING', 'MONGO_URI is required in server/.env');
    }

    await mongoose.connect(uri, { dbName: parsed.database });
    try {
      const summary = await runDispensingSampleSeed({
        args: process.argv.slice(2),
        env: process.env,
      });
      console.log(JSON.stringify(summary, null, 2));
    } finally {
      await mongoose.disconnect();
    }
  })().catch(err => {
    console.error(`[seed-dispensing-sample] ${err.code || 'ERROR'}: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  SEED_NAMESPACE,
  PROTECTED_NAMESPACES,
  parseCliArgs,
  verifySeedApproval,
  buildSampleDispensingPlan,
  runDispensingSampleSeed,
};
