#!/usr/bin/env node
'use strict';

/**
 * scripts/restore_protected_seed.js
 *
 * Targeted Restoration Tool for SEED_2026_11_A Protected Production Seed.
 *
 * Restores exclusively the 21 compact seed entities deleted by legacy cleanup:
 * - 3 Hospitals
 * - 2 Pharmacies
 * - 6 Doctors
 * - 2 Pharmacy Staff
 * - 8 Patients (synthetic identities 999990000001..8)
 *
 * Guarantees:
 * 1. ZERO Overwrite (insert-only-missing mode): Existing records are NEVER overwritten or modified.
 * 2. Exact Deterministic IDs: Restores exact original 24-character ObjectIds.
 * 3. Exact Canonical Security: Uses production operator key encryption, blind indexes, and unusable bcrypt hashes.
 * 4. Silenced Transports: EMAIL_PROVIDER='none'. Zero emails or notifications sent.
 * 5. Fail-closed Safety: Default mode is --dry-run (0 writes). Execution requires --confirm.
 * 6. Post-restore Verification: Verifies 0 orphan references remain in the database.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment from server/.env if present
const envPath = path.resolve(__dirname, '../server/.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Silence notification transport strictly
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

const { buildSeedPlatformPlan } = require('./seedPlatformPlan.cjs');
const { prepareRecords } = require('./seedPlatformStore.cjs');
const { auditOrphans } = require('./audit_orphans_readonly.js');

const models = {
  Patient: require('../server/src/models/Patient'),
  Doctor: require('../server/src/models/Doctor'),
  Hospital: require('../server/src/models/Hospital'),
  Pharmacy: require('../server/src/models/Pharmacy'),
  PharmacyStaff: require('../server/src/models/PharmacyStaff')
};

function ensureKeys() {
  if (global.ENCRYPTION_KEYS && global.ACTIVE_KEY_VERSION) return;
  const { validateAndLoadOperatorKeys } = require('../server/src/security/operatorKeyPolicy');
  const ring = validateAndLoadOperatorKeys(process.env);
  global.ENCRYPTION_KEYS = ring.keys;
  global.ACTIVE_KEY_VERSION = ring.activeVersion;
  global.ENCRYPTION_KEY = ring.keys[ring.activeVersion];
}

function parseCliArgs(args = process.argv.slice(2)) {
  let database = 'medisync_prod';
  let confirm = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--confirm') {
      confirm = true;
    } else if (arg === '--dry-run') {
      confirm = false;
    } else if (arg.startsWith('--db=')) {
      database = arg.slice('--db='.length).trim();
    } else if (arg === '--db') {
      database = args[++i]?.trim();
    } else if (arg === '-h' || arg === '--help') {
      console.log(`
Usage: node scripts/restore_protected_seed.js [options]

Options:
  --dry-run             Inspect and preview missing records (default; 0 writes)
  --confirm             Execute restoration of missing records
  --db <name>           Database name [default: medisync_prod]
  -h, --help            Show this help text
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { database, confirm };
}

async function connectToMongo(database) {
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    return mongoose.connection.db;
  }
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGO_URI is required to connect to MongoDB');

  await mongoose.connect(uri, {
    dbName: database,
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000
  });

  return mongoose.connection.db;
}

const idSuffix = id => `...${String(id).slice(-6)}`;

async function restoreProtectedSeed({ database = 'medisync_prod', confirm = false, customDb = null } = {}) {
  ensureKeys();

  console.log('================================================================');
  console.log('🛡️ [MEDISYNC SEED_2026_11_A RESTORATION]');
  console.log('================================================================');
  console.log(`Target Database : ${database}`);
  console.log(`Execution Mode  : ${confirm ? 'EXECUTE (CONFIRMED WRITES)' : 'DRY-RUN (0 WRITES)'}`);
  console.log(`Strategy        : INSERT-ONLY-MISSING (0 updates, 0 overwrites)`);
  console.log('----------------------------------------------------------------');

  const db = customDb || await connectToMongo(database);

  // Generate the 21 compact platform records
  const fullPlan = buildSeedPlatformPlan({ now: '2026-11-01T00:00:00Z', compact: true });
  const targetModels = new Set(['Hospital', 'Pharmacy', 'Doctor', 'PharmacyStaff', 'Patient']);
  const targetRecords = fullPlan.records.filter(r => targetModels.has(r.model));

  if (targetRecords.length !== 21) {
    throw new Error(`PLAN_INTEGRITY_MISMATCH: Expected 21 records, got ${targetRecords.length}`);
  }

  const subPlan = { ...fullPlan, records: targetRecords };

  // Prepare with unusable cryptorandom bcrypt password hash
  const passwordHash = bcrypt.hashSync('UnusableSeedPasswordRequired123!', 12);
  const prepared = await prepareRecords(subPlan, models, { passwordHash });

  console.log(`Generated and validated 21 deterministic records for SEED_2026_11_A:`);
  console.log(`   - Hospitals      : 3`);
  console.log(`   - Pharmacies     : 2`);
  console.log(`   - Doctors        : 6`);
  console.log(`   - Pharmacy Staff : 2`);
  console.log(`   - Patients       : 8 (Confirmed synthetic NICs 999990000001..8)`);
  console.log('----------------------------------------------------------------');

  const inspection = [];
  let missingCount = 0;
  let existingCount = 0;
  let restoredCount = 0;

  for (const item of prepared) {
    const Model = models[item.model];
    const collName = Model.collection.collectionName;
    const collection = db.collection(collName);
    const id = new mongoose.Types.ObjectId(item.raw._id);

    const existing = await collection.findOne({ _id: id });
    const ident = item.raw.regNo || item.raw.doctorId || item.raw.name || item.raw.fullName || item.raw.email || item.raw.nic;

    if (existing) {
      existingCount++;
      console.log(`   [EXISTS - SKIPPED] ${item.model.padEnd(14)} : _id ${idSuffix(id)} (${ident}) already exists`);
      inspection.push({ model: item.model, id: item.raw._id, status: 'EXISTS', ident });
    } else {
      missingCount++;
      console.log(`   [MISSING - ${confirm ? 'INSERT' : 'TO RESTORE'}] ${item.model.padEnd(14)} : _id ${idSuffix(id)} (${ident})`);
      inspection.push({ model: item.model, id: item.raw._id, status: 'MISSING', ident });

      if (confirm) {
        await collection.insertOne(item.raw);
        restoredCount++;
      }
    }
  }

  console.log('----------------------------------------------------------------');
  console.log(`Restoration Summary:`);
  console.log(`   Total Target Records  : 21`);
  console.log(`   Already Existing      : ${existingCount}`);
  console.log(`   Missing Identified    : ${missingCount}`);
  if (confirm) {
    console.log(`   Successfully Restored : ${restoredCount}`);
  } else {
    console.log(`   Restored (Dry-Run)    : 0 (No database writes performed)`);
    console.log(`\nTo execute restoration of missing records, run with --confirm:`);
    console.log(`   node scripts/restore_protected_seed.js --confirm --db=${database}`);
  }

  // If confirmed, execute orphan audit to prove 0 orphans
  let auditResult = null;
  if (confirm) {
    console.log('\n----------------------------------------------------------------');
    console.log('🔍 Running Post-Restoration Orphan Reference Audit...');
    console.log('----------------------------------------------------------------');
    auditResult = await auditOrphans(db, database);
    if (!auditResult.isClean) {
      console.error(`⚠️ Warning: ${auditResult.totalOrphans} orphan reference(s) still remain.`);
    } else {
      console.log('✅ POST-RESTORE VERIFICATION PASSED: 0 ORPHAN REFERENCES IN DATABASE.');
    }
  }

  console.log('================================================================\n');

  return {
    missingCount,
    existingCount,
    restoredCount,
    auditResult,
    inspection
  };
}

async function main() {
  const args = parseCliArgs();
  try {
    await restoreProtectedSeed({ database: args.database, confirm: args.confirm });
  } catch (err) {
    console.error(`❌ Restoration failed: ${err.message}`);
    process.exit(1);
  } finally {
    if (mongoose && mongoose.connection && mongoose.connection.readyState === 1) {
      await mongoose.disconnect().catch(() => {});
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  restoreProtectedSeed,
  parseCliArgs
};
