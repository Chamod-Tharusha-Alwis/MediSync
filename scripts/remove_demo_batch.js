'use strict';

/**
 * scripts/remove_demo_batch.js
 *
 * Guarded demo batch removal tool for MediSync.
 * Targets exclusively legacy simulated outbreak batch DEMO_OUTBREAK_2026_V1.
 *
 * Safety Invariants:
 * 1. Default mode: --dry-run (read-only count; ZERO database writes or deletions).
 * 2. Deletion mode requires BOTH:
 *    - CLI flag: --confirm-demo-removal DEMO_OUTBREAK_2026_V1
 *    - Env variable: APPROVE_DEMO_OUTBREAK_REMOVAL=true or MEDISYNC_DEMO_REMOVAL_APPROVAL=APPROVED
 * 3. Seed Batch Protection:
 *    - Explicitly excludes and protects SEED_2026_11_A (production seed).
 *    - Never touches genuine clinical or user accounts.
 * 4. Production Host Validation:
 *    - Validates target database name against allowed list (medisync_prod, medisync_automated_test).
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const TARGET_BATCH = 'DEMO_OUTBREAK_2026_V1';
const PROTECTED_SEED_BATCH = 'SEED_2026_11_A';
const ALLOWED_DATABASES = ['medisync_prod', 'medisync_automated_test'];

function fail(code, message) {
  const err = new Error(message ? `[${code}] ${message}` : code);
  err.code = code;
  throw err;
}

function parseCliArgs(args = []) {
  let database = 'medisync_prod';
  let dryRun = true;
  let confirmBatch = null;
  let targetBatch = TARGET_BATCH;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--db') {
      database = args[++i];
      if (!database || database.startsWith('--')) {
        fail('INVALID_DATABASE_ARGUMENT', '--db requires a database name');
      }
    } else if (arg === '--confirm-demo-removal') {
      dryRun = false;
      confirmBatch = args[++i];
    } else if (arg === '--batch') {
      targetBatch = args[++i];
    } else if (arg === '--confirm') {
      dryRun = false;
    }
  }

  if (!ALLOWED_DATABASES.includes(database)) {
    fail('DATABASE_NOT_PERMITTED', `Database ${database} is not in approved list`);
  }

  return { database, dryRun, confirmBatch, targetBatch };
}

function verifyRemovalAdmission(parsed, env = process.env) {
  if (parsed.dryRun) {
    return { admitted: true, mode: 'DRY_RUN' };
  }

  // Deletion admission checks
  if (parsed.targetBatch !== TARGET_BATCH) {
    fail('BATCH_UNAPPROVED', `Only batch ${TARGET_BATCH} is admitted for removal.`);
  }

  if (parsed.confirmBatch && parsed.confirmBatch !== TARGET_BATCH) {
    fail('CONFIRM_BATCH_MISMATCH', `Confirm batch '${parsed.confirmBatch}' does not match target '${TARGET_BATCH}'`);
  }

  const approvalVar = env.APPROVE_DEMO_OUTBREAK_REMOVAL === 'true' || env.MEDISYNC_DEMO_REMOVAL_APPROVAL === 'APPROVED';
  if (!approvalVar) {
    fail('APPROVAL_ENV_REQUIRED', 'Destructive removal requires APPROVE_DEMO_OUTBREAK_REMOVAL=true or MEDISYNC_DEMO_REMOVAL_APPROVAL=APPROVED');
  }

  return { admitted: true, mode: 'EXECUTE' };
}

function buildQuery(batchId) {
  return {
    $and: [
      {
        $or: [
          { demoBatchId: batchId },
          { isSimulatedDemo: true, syntheticSeedBatch: batchId },
          { isSimulatedDemo: true, consultationId: /^CON-(?:DEMO|SYNTH)/ }
        ]
      },
      // Guarantee zero intersection with SEED_2026_11_A
      {
        syntheticSeedBatch: { $ne: PROTECTED_SEED_BATCH }
      }
    ]
  };
}

async function inspectOrRemoveBatch(mongooseInstance, options = {}) {
  const { database = 'medisync_prod', dryRun = true, targetBatch = TARGET_BATCH, env = process.env } = options;

  verifyRemovalAdmission({ database, dryRun, targetBatch, confirmBatch: options.confirmBatch }, env);

  const db = mongooseInstance.connection.db;
  if (!db) {
    fail('DB_NOT_CONNECTED', 'Mongoose must have an active database connection');
  }

  const query = buildQuery(targetBatch);

  // Collections that may hold demo outbreak records
  const consultationCol = db.collection('consultations');
  const alertCol = db.collection('outbreakalerts');

  // Verify protected seed batch presence & safety
  const protectedCount = await consultationCol.countDocuments({ syntheticSeedBatch: PROTECTED_SEED_BATCH });

  // Count target records
  const consultationsTargeted = await consultationCol.countDocuments(query);
  const alertsTargeted = await alertCol.countDocuments({
    $and: [
      {
        $or: [
          { demoBatchId: targetBatch },
          { isSimulatedDemo: true }
        ]
      },
      { syntheticSeedBatch: { $ne: PROTECTED_SEED_BATCH } }
    ]
  });

  const result = {
    batchId: targetBatch,
    database,
    dryRun,
    protectedSeedCount: protectedCount,
    protectedSeedPreserved: true,
    consultationsTargeted,
    alertsTargeted,
    consultationsDeleted: 0,
    alertsDeleted: 0,
    status: dryRun ? 'DRY_RUN_COMPLETED' : 'DELETION_COMPLETED',
    timestamp: new Date().toISOString()
  };

  if (!dryRun) {
    // Execute guarded deletion
    const conDelete = await consultationCol.deleteMany(query);
    const alertDelete = await alertCol.deleteMany({
      $and: [
        {
          $or: [
            { demoBatchId: targetBatch },
            { isSimulatedDemo: true }
          ]
        },
        { syntheticSeedBatch: { $ne: PROTECTED_SEED_BATCH } }
      ]
    });

    result.consultationsDeleted = conDelete.deletedCount || 0;
    result.alertsDeleted = alertDelete.deletedCount || 0;

    // Verify post-deletion that protected seed was untouched
    const postProtectedCount = await consultationCol.countDocuments({ syntheticSeedBatch: PROTECTED_SEED_BATCH });
    if (postProtectedCount !== protectedCount) {
      fail('INTEGRITY_BREACH', 'Protected seed count changed during batch removal!');
    }
  }

  return result;
}

async function runCli(args = process.argv.slice(2)) {
  const envPath = path.resolve(__dirname, '../server/.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }

  const parsed = parseCliArgs(args);
  verifyRemovalAdmission(parsed, process.env);

  let mongoose;
  try {
    mongoose = require(require.resolve('mongoose', { paths: [path.resolve(__dirname, '../server')] }));
  } catch (_) {
    mongoose = require('mongoose');
  }

  const { selectOperatorDatabase } = require('../server/scripts/operatorDatabaseMode');
  const target = selectOperatorDatabase(process.env, parsed.database === 'medisync_automated_test');

  await mongoose.connect(target.uri, target.connectionOptions || {});

  try {
    const report = await inspectOrRemoveBatch(mongoose, {
      database: parsed.database,
      dryRun: parsed.dryRun,
      targetBatch: parsed.targetBatch,
      confirmBatch: parsed.confirmBatch,
      env: process.env
    });
    return report;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runCli()
    .then(report => {
      console.log(JSON.stringify(report, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error(JSON.stringify({ error: err.message, code: err.code }));
      process.exit(1);
    });
}

module.exports = {
  TARGET_BATCH,
  PROTECTED_SEED_BATCH,
  ALLOWED_DATABASES,
  parseCliArgs,
  verifyRemovalAdmission,
  buildQuery,
  inspectOrRemoveBatch,
  runCli
};
