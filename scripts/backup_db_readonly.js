#!/usr/bin/env node
'use strict';

/**
 * scripts/backup_db_readonly.js
 *
 * Read-only MongoDB Atlas Backup Utility for MediSync.
 *
 * Guarantees:
 * 1. ZERO Database writes: Read-only cursors only. Never inserts, updates, or deletes.
 * 2. Strict destination safety: Refuses output paths inside repository or inside OneDrive.
 * 3. Exact BSON fidelity: Serializes using BSON Extended JSON (bson.EJSON).
 * 4. Zero credentials logged: Never logs or prints MongoDB connection URI or secrets.
 * 5. Built-in verification: --verify-backup validates exported files and count parity.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { EJSON } = require('bson');

const envPath = path.resolve(__dirname, '../server/.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

let mongoose;
try {
  mongoose = require(require.resolve('mongoose', { paths: [path.resolve(__dirname, '../server')] }));
} catch (_) {
  mongoose = require('mongoose');
}

function validateOutDir(outDir) {
  if (!outDir || typeof outDir !== 'string') {
    throw new Error('DESTINATION_REQUIRED: --out <directory> is required.');
  }

  const resolved = path.resolve(outDir);
  const repoRoot = path.resolve(__dirname, '..');

  // Refuse if inside repo
  if (resolved === repoRoot || resolved.startsWith(repoRoot + path.sep)) {
    throw new Error(`SECURITY_REJECTED: Destination path is inside repository (${resolved}). Backups must be stored outside repository.`);
  }

  // Refuse if inside OneDrive
  if (/onedrive/i.test(resolved)) {
    throw new Error(`SECURITY_REJECTED: Destination path is inside OneDrive (${resolved}). Backups must be stored outside OneDrive.`);
  }

  return resolved;
}

function parseCliArgs(args = process.argv.slice(2)) {
  let outDir = null;
  let database = 'medisync_prod';
  let verifyOnly = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--verify-backup') {
      verifyOnly = true;
    } else if (arg.startsWith('--out=')) {
      outDir = arg.slice('--out='.length).trim();
    } else if (arg === '--out') {
      outDir = args[++i]?.trim();
    } else if (arg.startsWith('--db=')) {
      database = arg.slice('--db='.length).trim();
    } else if (arg === '--db') {
      database = args[++i]?.trim();
    } else if (arg === '-h' || arg === '--help') {
      console.log(`
Usage: node scripts/backup_db_readonly.js --out <directory> [options]

Options:
  --out <dir>           Target directory (MUST be outside repo and outside OneDrive)
  --db <name>           Database name [default: medisync_prod]
  --verify-backup       Verify an existing backup directory against file contents / DB
  -h, --help            Show this help text
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { outDir, database, verifyOnly };
}

async function connectReadOnly(database) {
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    return mongoose.connection.db;
  }
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGO_URI_REQUIRED: MONGO_URI is not defined in server/.env');
  }

  await mongoose.connect(uri, {
    dbName: database,
    readPreference: 'secondaryPreferred',
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000
  });

  return mongoose.connection.db;
}

async function backupDatabase(targetDb, outDir, customDb = null) {
  const verifiedOut = validateOutDir(outDir);
  if (!fs.existsSync(verifiedOut)) {
    fs.mkdirSync(verifiedOut, { recursive: true });
  }

  const db = customDb || await connectReadOnly(targetDb);
  const collections = await db.listCollections().toArray();

  console.log('================================================================');
  console.log('💾 [MEDISYNC READ-ONLY DATABASE BACKUP]');
  console.log('================================================================');
  console.log(`Target Database : ${targetDb}`);
  console.log(`Destination Dir : ${verifiedOut}`);
  console.log(`Collections     : ${collections.length}`);
  console.log('----------------------------------------------------------------');

  const manifest = {
    database: targetDb,
    createdAt: new Date().toISOString(),
    collections: {},
    totalDocuments: 0,
    totalBytes: 0
  };

  for (const colInfo of collections) {
    const colName = colInfo.name;
    if (colName.startsWith('system.')) continue;

    const collection = db.collection(colName);
    const docs = await collection.find({}).toArray();
    const ejsonContent = EJSON.stringify(docs, null, 2);
    const filePath = path.join(verifiedOut, `${colName}.json`);

    fs.writeFileSync(filePath, ejsonContent, 'utf8');
    const bytes = Buffer.byteLength(ejsonContent, 'utf8');

    manifest.collections[colName] = {
      count: docs.length,
      bytes,
      file: `${colName}.json`
    };
    manifest.totalDocuments += docs.length;
    manifest.totalBytes += bytes;

    const sizeStr = (bytes / 1024).toFixed(1) + ' KB';
    console.log(`   ${colName.padEnd(25)} : ${String(docs.length).padStart(6)} doc(s) -> ${sizeStr.padStart(10)}`);
  }

  const manifestPath = path.join(verifiedOut, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log('----------------------------------------------------------------');
  console.log(`Total Collections : ${Object.keys(manifest.collections).length}`);
  console.log(`Total Documents   : ${manifest.totalDocuments}`);
  console.log(`Total Size        : ${(manifest.totalBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Manifest File     : ${manifestPath}`);
  console.log('Backup Status     : COMPLETED SUCCESSFULLY (Read-only, 0 writes to DB)');
  console.log('================================================================\n');

  return manifest;
}

async function verifyBackup(outDir, customDb = null) {
  const verifiedOut = validateOutDir(outDir);
  const manifestPath = path.join(verifiedOut, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`MANIFEST_MISSING: manifest.json not found in ${verifiedOut}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  console.log('================================================================');
  console.log('🔍 [VERIFYING BACKUP INTEGRITY]');
  console.log('================================================================');
  console.log(`Destination Dir : ${verifiedOut}`);
  console.log(`Target Database : ${manifest.database}`);
  console.log(`Recorded At     : ${manifest.createdAt}`);
  console.log('----------------------------------------------------------------');

  let db = customDb;
  if (!db) {
    try {
      db = await connectReadOnly(manifest.database);
    } catch (_) {
      console.log('⚠️  Notice: MongoDB connection not available. Verifying exported files offline.');
    }
  }

  let allValid = true;
  let recheckedDocs = 0;

  for (const [colName, info] of Object.entries(manifest.collections)) {
    const filePath = path.join(verifiedOut, info.file || `${colName}.json`);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Missing file: ${filePath}`);
      allValid = false;
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    let parsedDocs;
    try {
      parsedDocs = EJSON.parse(content);
    } catch (parseErr) {
      console.error(`❌ EJSON Parse failure in ${info.file}: ${parseErr.message}`);
      allValid = false;
      continue;
    }

    if (!Array.isArray(parsedDocs) || parsedDocs.length !== info.count) {
      console.error(`❌ Document count mismatch in ${info.file}: expected ${info.count}, parsed ${parsedDocs?.length}`);
      allValid = false;
      continue;
    }

    recheckedDocs += parsedDocs.length;

    let dbParityStr = '';
    if (db) {
      const liveCount = await db.collection(colName).countDocuments();
      if (liveCount !== info.count) {
        dbParityStr = ` [LIVE DB MISMATCH: ${liveCount} in DB vs ${info.count} in backup]`;
        allValid = false;
      } else {
        dbParityStr = ` [Live DB Parity: EXACT (${liveCount})]`;
      }
    }

    console.log(`   ${colName.padEnd(25)} : ${String(parsedDocs.length).padStart(6)} doc(s) verified${dbParityStr}`);
  }

  console.log('----------------------------------------------------------------');
  if (allValid) {
    console.log(`Verification      : PASSED (${recheckedDocs} documents across ${Object.keys(manifest.collections).length} collections)`);
  } else {
    console.error('Verification      : FAILED (Corrupt files or count mismatches detected)');
    process.exitCode = 1;
  }
  console.log('================================================================\n');

  return { allValid, recheckedDocs, manifest };
}

async function main() {
  const args = parseCliArgs();
  if (!args.outDir) {
    console.error('ERROR: --out <directory> is required.');
    process.exit(1);
  }

  try {
    if (args.verifyOnly) {
      await verifyBackup(args.outDir);
    } else {
      await backupDatabase(args.database, args.outDir);
    }
  } catch (err) {
    console.error(`❌ Backup operation failed: ${err.message}`);
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
  validateOutDir,
  parseCliArgs,
  backupDatabase,
  verifyBackup
};
