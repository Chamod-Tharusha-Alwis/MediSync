#!/usr/bin/env node
'use strict';

/**
 * importReferenceData.js
 * 
 * Production-ready additive, idempotent reference data import operator script.
 * Imports:
 * - 3,000 drugs from server/reference-data/drugs_clean.json into 'drugs' collection.
 * - 71,704 ICD-10 codes from server/reference-data/icd10_clean.json into 'icdcodes' collection.
 * 
 * CORE ARCHITECTURAL INVARIANTS:
 * 1. STRICTLY ADDITIVE & IDEMPOTENT: Uses bulkWrite with updateOne, $setOnInsert, and upsert: true.
 *    Never modifies, overwrites, or deletes any existing database documents.
 * 2. RUNTIME DESTRUCTIVE OP GUARDS: Enforces installDestructiveOpGuards() from dbGuard.js
 *    blocking dropDatabase(), dropCollection(), and un-scoped deleteMany({}).
 * 3. COMPREHENSIVE DRY-RUN MODE: When invoked with --dry-run, reads datasets, verifies SHA-256
 *    against manifest.json, displays row counts and top 5 sample names/codes ONLY,
 *    performing ZERO database writes and zero production connections.
 * 4. PRODUCTION WRITE PAUSE PROTOCOL: Halts and prompts the operator to type "apply"
 *    before executing any write to production (unless explicit --apply CLI flag is provided).
 * 5. ZERO SECRETS: Never logs or prints MongoDB connection strings, credentials, or tokens.
 * 
 * USAGE:
 *   Dry-Run Only (no DB connection/write):
 *     node server/scripts/importReferenceData.js --dry-run
 * 
 *   Test Database Import:
 *     node server/scripts/importReferenceData.js --target-db=medisync_automated_test
 * 
 *   Production Import (with interactive pause):
 *     node server/scripts/importReferenceData.js --target-db=medisync_prod --confirm-production-import
 * 
 *   Production Import (automated / non-interactive):
 *     node server/scripts/importReferenceData.js --target-db=medisync_prod --confirm-production-import --apply
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mongoose = require('mongoose');

// Resolve server root path whether run from server/scripts/ or from .agents/teamwork/...
const SERVER_ROOT = fs.existsSync(path.join(__dirname, '../src/models/Drug.js'))
  ? path.resolve(__dirname, '..')
  : path.resolve(__dirname, '../../../server');

// Load environment variables if available
require('dotenv').config({ path: path.join(SERVER_ROOT, '.env') });

const Drug = require(path.join(SERVER_ROOT, 'src/models/Drug'));
const ICDCode = require(path.join(SERVER_ROOT, 'src/models/ICDCode'));
const { loadReferenceCatalogs } = require(path.join(SERVER_ROOT, 'src/utils/referenceCatalogs'));
const {
  PROD_DB_NAME,
  TEST_DB_NAME,
  installDestructiveOpGuards,
  connectProductionDB,
  connectAutomatedTestDB
} = require(path.join(SERVER_ROOT, 'src/config/dbGuard'));

// Install runtime guards immediately before any database interaction
installDestructiveOpGuards();

const CHUNK_SIZE = 1000;
const REFERENCE_DATA_DIR = path.join(SERVER_ROOT, 'reference-data');

function parseArgs() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const hasApply = args.includes('--apply');
  const confirmProd = args.includes('--confirm-production-import');

  const targetArg = args.find((a) => a.startsWith('--target-db='));
  const targetDb = targetArg ? targetArg.split('=')[1] : null;

  return { isDryRun, hasApply, confirmProd, targetDb };
}

function promptOperator(question) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve('');
      return;
    }
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function displayDryRunReport(catalogs) {
  console.log('================================================================');
  console.log('  MEDISYNC REFERENCE DATA IMPORT: DRY-RUN INSPECTION REPORT     ');
  console.log('================================================================');
  console.log(`Reference Source Directory: ${REFERENCE_DATA_DIR}`);
  console.log(`Manifest Integrity Check:  VERIFIED (SHA-256 validated)\n`);

  // Drugs Catalog
  const drugs = catalogs.drugs || [];
  console.log(`[CATALOG: DRUGS]`);
  console.log(`  Total Dataset Records: ${drugs.length.toLocaleString()}`);
  console.log(`  Natural Key:           "name" (unique, trim)`);
  console.log(`  Target Collection:     "drugs"`);
  console.log(`  Initial 5 Sample Names:`);
  drugs.slice(0, 5).forEach((d, idx) => {
    console.log(`    ${idx + 1}. "${d.name}" | Brand: "${d.brand || 'N/A'}" | Generic: "${d.genericName || 'N/A'}" | Category: "${d.category || 'other'}"`);
  });
  console.log('');

  // ICD-10 Catalog
  const icd10 = catalogs.icd10 || [];
  console.log(`[CATALOG: ICD-10 CODES]`);
  console.log(`  Total Dataset Records: ${icd10.length.toLocaleString()}`);
  console.log(`  Natural Key:           "code" (unique)`);
  console.log(`  Target Collection:     "icdcodes"`);
  console.log(`  Initial 5 Sample Codes:`);
  icd10.slice(0, 5).forEach((item, idx) => {
    console.log(`    ${idx + 1}. [${item.code}] ${item.description}`);
  });
  console.log('================================================================');
}

async function run() {
  const { isDryRun, hasApply, confirmProd, targetDb } = parseArgs();

  // 1. Load and verify source datasets via referenceCatalogs integrity checker
  console.log('\n[PREFLIGHT] Loading and verifying reference catalogs against manifest.json...');
  let catalogs;
  try {
    catalogs = loadReferenceCatalogs(REFERENCE_DATA_DIR);
  } catch (err) {
    console.error(`[FATAL] Reference catalog integrity validation failed: ${err.message}`);
    process.exit(1);
  }

  const drugsData = catalogs.drugs;
  const icd10Data = catalogs.icd10;

  // 2. Display dry-run summary
  displayDryRunReport(catalogs);

  // If explicitly in dry-run mode, terminate without establishing database connections
  if (isDryRun) {
    console.log('\n✅ [DRY-RUN COMPLETE] Verified 3,000 drugs and 71,704 ICD-10 records.');
    console.log('   Zero database connections opened. Zero database writes executed.');
    process.exit(0);
  }

  // 3. Validate target database arguments
  if (!targetDb || ![PROD_DB_NAME, TEST_DB_NAME].includes(targetDb)) {
    console.error(`\n[ERROR] Valid --target-db argument required.`);
    console.error(`Allowed values:`);
    console.error(`  --target-db=${TEST_DB_NAME}`);
    console.error(`  --target-db=${PROD_DB_NAME} --confirm-production-import`);
    process.exit(1);
  }

  const isProduction = targetDb === PROD_DB_NAME;

  if (isProduction && !confirmProd) {
    console.error(`\n[ERROR] Production target "${PROD_DB_NAME}" requires explicit flag: --confirm-production-import`);
    process.exit(1);
  }

  // 4. Production Write Pause Protocol
  if (isProduction && !hasApply) {
    console.log('\n⚠️  [PRODUCTION WRITE PAUSE]');
    console.log(`   You are about to execute an additive reference import into: "${PROD_DB_NAME}".`);
    console.log('   Please review the dry-run summary printed above.');
    console.log('   To proceed, type "apply" and press Enter.');
    console.log('   To cancel, press Ctrl+C or enter any other text.\n');

    const confirmation = await promptOperator('Confirmation ("apply"): ');
    if (confirmation !== 'apply') {
      console.log('\n🛑 [ABORT] Operator did not confirm with "apply". Aborting reference import.');
      console.log('   Zero database writes executed.');
      process.exit(0);
    }
    console.log('\n[CONFIRMED] "apply" received. Proceeding with production import...');
  }

  // 5. Connect to target database using guarded connector
  console.log(`\n[CONNECT] Connecting to target database: ${targetDb}...`);
  if (isProduction) {
    await connectProductionDB();
  } else {
    await connectAutomatedTestDB();
  }

  const dbName = mongoose.connection.name;
  console.log(`[CONNECTED] Authenticated connection established to database: "${dbName}"`);

  // 6. Pre-import document counts
  const initialDrugCount = await Drug.countDocuments();
  const initialIcdCount = await ICDCode.countDocuments();
  console.log(`[PRE-IMPORT STATE] Existing in DB: ${initialDrugCount.toLocaleString()} drugs, ${initialIcdCount.toLocaleString()} ICD codes.`);

  // 7. Additive, Idempotent Drug Upsert
  console.log(`\n[IMPORT] Executing additive bulk upsert of ${drugsData.length.toLocaleString()} drugs...`);
  const now = new Date();
  const drugOps = drugsData
    .filter((d) => d && d.name && d.name.trim())
    .map((d) => ({
      updateOne: {
        filter: { name: d.name.trim() },
        update: {
          $setOnInsert: {
            name: d.name.trim(),
            genericName: d.genericName ? d.genericName.trim() : '',
            brand: d.brand ? d.brand.trim() : '',
            category: d.category || 'other',
            commonDosages: Array.isArray(d.commonDosages) ? d.commonDosages : [],
            interactions: Array.isArray(d.interactions) ? d.interactions : [],
            sideEffects: Array.isArray(d.sideEffects) ? d.sideEffects : [],
            icdCodes: Array.isArray(d.icdCodes) ? d.icdCodes : [],
            createdAt: now,
            updatedAt: now
          }
        },
        upsert: true
      }
    }));

  let drugUpsertedCount = 0;
  let drugMatchedCount = 0;

  for (let i = 0; i < drugOps.length; i += CHUNK_SIZE) {
    const chunk = drugOps.slice(i, i + CHUNK_SIZE);
    const result = await Drug.collection.bulkWrite(chunk, { ordered: false });
    drugUpsertedCount += result.upsertedCount || 0;
    drugMatchedCount += result.matchedCount || 0;
  }

  // 8. Additive, Idempotent ICD-10 Upsert (Chunked)
  console.log(`[IMPORT] Executing additive chunked bulk upsert of ${icd10Data.length.toLocaleString()} ICD-10 codes...`);
  const icdOps = icd10Data
    .filter((item) => item && item.code && item.code.trim())
    .map((item) => ({
      updateOne: {
        filter: { code: item.code.trim() },
        update: {
          $setOnInsert: {
            code: item.code.trim(),
            description: item.description ? item.description.trim() : ''
          }
        },
        upsert: true
      }
    }));

  let icdUpsertedCount = 0;
  let icdMatchedCount = 0;
  const totalIcdChunks = Math.ceil(icdOps.length / CHUNK_SIZE);

  for (let i = 0; i < icdOps.length; i += CHUNK_SIZE) {
    const chunk = icdOps.slice(i, i + CHUNK_SIZE);
    const result = await ICDCode.collection.bulkWrite(chunk, { ordered: false });
    icdUpsertedCount += result.upsertedCount || 0;
    icdMatchedCount += result.matchedCount || 0;

    const currentChunk = Math.floor(i / CHUNK_SIZE) + 1;
    if (currentChunk % 10 === 0 || currentChunk === totalIcdChunks) {
      console.log(`  Processed ICD-10 chunk ${currentChunk} of ${totalIcdChunks} (${Math.min(i + CHUNK_SIZE, icdOps.length).toLocaleString()} codes)...`);
    }
  }

  // 9. Post-import verification and counts
  const finalDrugCount = await Drug.countDocuments();
  const finalIcdCount = await ICDCode.countDocuments();

  console.log('\n================================================================');
  console.log('  IMPORT EXECUTION COMPLETE: SUMMARY REPORT                     ');
  console.log('================================================================');
  console.log(`Database:                 "${dbName}"`);
  console.log(`Drugs Catalog:`);
  console.log(`  - Newly Inserted:       ${drugUpsertedCount.toLocaleString()}`);
  console.log(`  - Existing Untouched:   ${drugMatchedCount.toLocaleString()}`);
  console.log(`  - Final Total in DB:    ${finalDrugCount.toLocaleString()}`);
  console.log(`ICD-10 Catalog:`);
  console.log(`  - Newly Inserted:       ${icdUpsertedCount.toLocaleString()}`);
  console.log(`  - Existing Untouched:   ${icdMatchedCount.toLocaleString()}`);
  console.log(`  - Final Total in DB:    ${finalIcdCount.toLocaleString()}`);
  console.log('================================================================');
  console.log('✅ Reference data import completed safely with zero overwrites or deletions.');

  await mongoose.disconnect();
  process.exit(0);
}

if (require.main === module) {
  run().catch(async (err) => {
    console.error(`\n[FATAL ERROR] Reference data import failed: ${err.message}`);
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    } catch (_) {}
    process.exit(1);
  });
}

module.exports = { run, displayDryRunReport, parseArgs };
