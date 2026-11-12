#!/usr/bin/env node
'use strict';

/**
 * scripts/cleanup_viva_outbreaks.js
 *
 * Safe cleanup script for viva outbreak synthetic data.
 *
 * Guarantees:
 * 1. Dry-run by default: reports matching documents and IDs; zero deletions without --confirm.
 * 2. Strict safety invariant: deletes ONLY documents where:
 *      syntheticSeedBatch === "viva-2026-11-outbreaks" AND isSynthetic === true
 * 3. Pre-flight sanity check: inspects all matched documents across:
 *      hospitals, doctors, patients, consultations, outbreakalerts
 *    Aborts immediately if any document lacks both flags.
 * 4. Target database override: supports --db=<database>.
 */

const fs = require('fs');
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

const BATCH_TAG = 'viva-2026-11-outbreaks';
const TARGET_COLLECTIONS = ['hospitals', 'doctors', 'patients', 'consultations', 'outbreakalerts'];

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

/**
 * Find all outbreak documents for the batch and verify safety flags.
 * Throws SAFETY_CHECK_FAILED if any matched document lacks isSynthetic: true or valid syntheticSeedBatch.
 */
async function findOutbreakDocuments(db, batchTag = BATCH_TAG) {
  const result = {};

  for (const colName of TARGET_COLLECTIONS) {
    const col = db.collection(colName);
    const docs = await col.find({
      $or: [
        { syntheticSeedBatch: batchTag },
        { 'metadata.syntheticSeedBatch': batchTag },
      ],
    }).toArray();

    // Verify invariant on EVERY matched doc
    for (const doc of docs) {
      const docBatch = doc.syntheticSeedBatch || doc.metadata?.syntheticSeedBatch;
      const isSynth = doc.isSynthetic === true || doc.metadata?.isSynthetic === true;

      if (docBatch !== batchTag || !isSynth) {
        throw new Error(
          `SAFETY_ABORT: Document ${doc._id} in collection '${colName}' matched batch filter but lacks isSynthetic=true or batch tag mismatch (isSynthetic=${doc.isSynthetic}, batch=${docBatch})`
        );
      }
    }

    result[colName] = {
      count: docs.length,
      ids: docs.map(d => String(d._id)),
      identifiers: docs.map(d => d.regNo || d.doctorId || d.nic || d.consultationId || String(d._id)),
    };
  }

  return result;
}

/**
 * Executes cleanup of outbreak documents.
 * If dryRun is true, returns counts and IDs without deleting.
 * If confirm is true, safely deletes documents with both flags present.
 */
async function cleanupOutbreakDocuments(db, options = {}) {
  const batchTag = options.batchTag || BATCH_TAG;
  const isConfirm = options.confirm === true;

  // 1. Pre-flight discovery and invariant verification
  const found = await findOutbreakDocuments(db, batchTag);

  const report = {
    batchTag,
    dryRun: !isConfirm,
    collections: {},
    totalFound: 0,
    totalDeleted: 0,
  };

  for (const colName of TARGET_COLLECTIONS) {
    const colData = found[colName] || { count: 0, ids: [], identifiers: [] };
    report.totalFound += colData.count;
    report.collections[colName] = {
      found: colData.count,
      ids: colData.ids,
      identifiers: colData.identifiers,
      deleted: 0,
    };
  }

  if (!isConfirm) {
    return report;
  }

  // 2. Confirmed deletion with strict dual filter
  for (const colName of TARGET_COLLECTIONS) {
    const col = db.collection(colName);
    const filter = {
      $or: [
        { syntheticSeedBatch: batchTag, isSynthetic: true },
        { 'metadata.syntheticSeedBatch': batchTag, 'metadata.isSynthetic': true },
      ],
    };

    const res = await col.deleteMany(filter);
    const deletedCount = res.deletedCount || 0;
    report.collections[colName].deleted = deletedCount;
    report.totalDeleted += deletedCount;
  }

  return report;
}

async function runCleanup() {
  const args = parseCliArgs();
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error('ERROR: MONGODB_URI not configured in server/.env');
    process.exit(1);
  }

  const dbName = extractDatabaseName(uri, args.targetDb);
  console.log(`=== MediSync Viva Outbreak Cleanup ===`);
  console.log(`Target Database: ${dbName}${args.targetDb ? ' (manual override)' : ''}`);
  console.log(`Mode:            ${args.confirm ? 'LIVE CONFIRM (DELETING)' : 'DRY-RUN (READ-ONLY)'}`);
  console.log(`Batch Tag:       ${BATCH_TAG}\n`);

  console.log(`Connecting to database '${dbName}'...`);
  await mongoose.connect(uri, { dbName });
  const db = mongoose.connection.db;

  try {
    const report = await cleanupOutbreakDocuments(db, {
      batchTag: BATCH_TAG,
      confirm: args.confirm,
    });

    console.log(`\n=== Outbreak Document Discovery ===`);
    for (const [col, info] of Object.entries(report.collections)) {
      console.log(`- ${col.padEnd(16)}: ${info.found} found${info.found > 0 ? ` [IDs: ${info.ids.slice(0, 5).join(', ')}${info.ids.length > 5 ? '...' : ''}]` : ''}`);
    }
    console.log(`Total matched documents: ${report.totalFound}`);

    if (report.dryRun) {
      console.log(`\n[DRY-RUN] 0 documents deleted. Invariant verified: all matched docs have isSynthetic=true and syntheticSeedBatch="${BATCH_TAG}".`);
      console.log(`To delete these documents, run:`);
      console.log(`node scripts/cleanup_viva_outbreaks.js --confirm${args.targetDb ? ` --db=${args.targetDb}` : ''}`);
    } else {
      console.log(`\n=== Deletion Receipt ===`);
      for (const [col, info] of Object.entries(report.collections)) {
        console.log(`- ${col.padEnd(16)}: ${info.deleted} deleted`);
      }
      console.log(`Total documents deleted: ${report.totalDeleted}`);
      console.log(`\n[CONFIRMED] Outbreak synthetic batch "${BATCH_TAG}" cleanly removed.`);
    }
  } finally {
    await mongoose.disconnect();
    console.log(`Disconnected from database.`);
  }
}

if (require.main === module) {
  runCleanup().catch(err => {
    console.error(`\n❌ CLEANUP FAILED: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  parseCliArgs,
  extractDatabaseName,
  findOutbreakDocuments,
  cleanupOutbreakDocuments,
  BATCH_TAG,
  TARGET_COLLECTIONS,
};
