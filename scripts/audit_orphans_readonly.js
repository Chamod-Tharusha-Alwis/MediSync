#!/usr/bin/env node
'use strict';

/**
 * scripts/audit_orphans_readonly.js
 *
 * Read-only Foreign Key Orphan Reference Auditor for MediSync.
 *
 * Guarantees:
 * 1. READ-ONLY: Never writes, modifies, or deletes any documents.
 * 2. Privacy-preserving: Outputs ONLY _id suffixes (e.g. ...ef73cc).
 *    Never logs, prints, or exports raw passwords, tokens, NICs, or emails.
 * 3. Comprehensive cross-reference graph: Checks consultations, prescriptions,
 *    dispensings, labtests, verificationtokens, outbreakalerts, doctors, pharmacies, and staff.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

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

function parseCliArgs(args = process.argv.slice(2)) {
  let database = 'medisync_prod';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--db=')) {
      database = arg.slice('--db='.length).trim();
    } else if (arg === '--db') {
      database = args[++i]?.trim();
    } else if (arg === '-h' || arg === '--help') {
      console.log(`
Usage: node scripts/audit_orphans_readonly.js [options]

Options:
  --db <name>           Database name [default: medisync_prod]
  -h, --help            Show this help text
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { database };
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

const idSuffix = val => val ? `...${String(val).slice(-6)}` : 'null';

async function fetchIdSet(db, colName) {
  const docs = await db.collection(colName).find({}, { projection: { _id: 1 } }).toArray();
  const set = new Set();
  for (const doc of docs) {
    if (doc._id) set.add(String(doc._id));
  }
  return set;
}

async function auditOrphans(customDb = null, database = 'medisync_prod') {
  const db = customDb || await connectReadOnly(database);

  console.log('================================================================');
  console.log('🔎 [READ-ONLY ORPHAN REFERENCE AUDIT]');
  console.log('================================================================');
  console.log(`Database        : ${database}`);
  console.log(`Execution Mode  : READ-ONLY (0 writes)`);
  console.log('----------------------------------------------------------------');

  // Load reference ID sets for primary actors
  const hospitalIds = await fetchIdSet(db, 'hospitals');
  const pharmacyIds = await fetchIdSet(db, 'pharmacies');
  const doctorIds = await fetchIdSet(db, 'doctors');
  const staffIds = await fetchIdSet(db, 'pharmacystaffs');
  const patientIds = await fetchIdSet(db, 'patients');
  const consultationIds = await fetchIdSet(db, 'consultations');
  const prescriptionIds = await fetchIdSet(db, 'prescriptions');

  console.log('Loaded Primary Entity ID Sets:');
  console.log(`   Hospitals      : ${hospitalIds.size}`);
  console.log(`   Pharmacies     : ${pharmacyIds.size}`);
  console.log(`   Doctors        : ${doctorIds.size}`);
  console.log(`   Pharmacy Staff : ${staffIds.size}`);
  console.log(`   Patients       : ${patientIds.size}`);
  console.log(`   Consultations  : ${consultationIds.size}`);
  console.log(`   Prescriptions  : ${prescriptionIds.size}`);
  console.log('----------------------------------------------------------------');

  const orphans = [];
  const countsByCollection = {};

  function checkRef(colName, doc, field, targetColName, targetSet) {
    const val = doc[field];
    if (val === undefined || val === null || val === '') return;
    const strVal = String(val);
    if (!targetSet.has(strVal)) {
      orphans.push({
        collection: colName,
        docIdSuffix: idSuffix(doc._id),
        field,
        targetCollection: targetColName,
        missingIdSuffix: idSuffix(strVal)
      });
      countsByCollection[colName] = (countsByCollection[colName] || 0) + 1;
    }
  }

  function checkRefArray(colName, doc, field, targetColName, targetSet) {
    const arr = doc[field];
    if (!Array.isArray(arr) || arr.length === 0) return;
    for (const val of arr) {
      if (val === undefined || val === null || val === '') continue;
      const strVal = String(val);
      if (!targetSet.has(strVal)) {
        orphans.push({
          collection: colName,
          docIdSuffix: idSuffix(doc._id),
          field,
          targetCollection: targetColName,
          missingIdSuffix: idSuffix(strVal)
        });
        countsByCollection[colName] = (countsByCollection[colName] || 0) + 1;
      }
    }
  }

  // 1. Audit Consultations
  const consultations = await db.collection('consultations').find({}, {
    projection: { _id: 1, doctorId: 1, hospitalId: 1, patientId: 1 }
  }).toArray();
  for (const doc of consultations) {
    checkRef('consultations', doc, 'patientId', 'patients', patientIds);
    checkRef('consultations', doc, 'doctorId', 'doctors', doctorIds);
    checkRef('consultations', doc, 'hospitalId', 'hospitals', hospitalIds);
  }

  // 2. Audit Prescriptions
  const prescriptions = await db.collection('prescriptions').find({}, {
    projection: { _id: 1, doctorId: 1, hospitalId: 1, patientId: 1, consultationId: 1, dispensedBy: 1, dispenserStaffId: 1 }
  }).toArray();
  for (const doc of prescriptions) {
    checkRef('prescriptions', doc, 'patientId', 'patients', patientIds);
    checkRef('prescriptions', doc, 'doctorId', 'doctors', doctorIds);
    checkRef('prescriptions', doc, 'hospitalId', 'hospitals', hospitalIds);
    checkRef('prescriptions', doc, 'consultationId', 'consultations', consultationIds);
    checkRef('prescriptions', doc, 'dispensedBy', 'pharmacies', pharmacyIds);
    checkRef('prescriptions', doc, 'dispenserStaffId', 'pharmacystaffs', staffIds);
  }

  // 3. Audit Dispensings
  const dispensings = await db.collection('dispensings').find({}, {
    projection: { _id: 1, prescriptionId: 1, pharmacyId: 1, staffId: 1 }
  }).toArray();
  for (const doc of dispensings) {
    checkRef('dispensings', doc, 'prescriptionId', 'prescriptions', prescriptionIds);
    checkRef('dispensings', doc, 'pharmacyId', 'pharmacies', pharmacyIds);
    checkRef('dispensings', doc, 'staffId', 'pharmacystaffs', staffIds);
  }

  // 4. Audit LabTests
  const labtests = await db.collection('labtests').find({}, {
    projection: { _id: 1, patientId: 1, hospitalId: 1, referredBy: 1, consultationId: 1 }
  }).toArray();
  for (const doc of labtests) {
    checkRef('labtests', doc, 'patientId', 'patients', patientIds);
    checkRef('labtests', doc, 'hospitalId', 'hospitals', hospitalIds);
    checkRef('labtests', doc, 'referredBy', 'doctors', doctorIds);
    checkRef('labtests', doc, 'consultationId', 'consultations', consultationIds);
  }

  // 5. Audit VerificationTokens
  const verificationtokens = await db.collection('verificationtokens').find({}, {
    projection: { _id: 1, consultationId: 1, patientRef: 1, doctorRef: 1 }
  }).toArray();
  for (const doc of verificationtokens) {
    checkRef('verificationtokens', doc, 'consultationId', 'consultations', consultationIds);
    checkRef('verificationtokens', doc, 'patientRef', 'patients', patientIds);
    checkRef('verificationtokens', doc, 'doctorRef', 'doctors', doctorIds);
  }

  // 6. Audit OutbreakAlerts
  const outbreakalerts = await db.collection('outbreakalerts').find({}, {
    projection: { _id: 1, sourceConsultationIds: 1 }
  }).toArray();
  for (const doc of outbreakalerts) {
    checkRefArray('outbreakalerts', doc, 'sourceConsultationIds', 'consultations', consultationIds);
  }

  // 7. Audit Doctors
  const doctors = await db.collection('doctors').find({}, {
    projection: { _id: 1, hospitals: 1 }
  }).toArray();
  for (const doc of doctors) {
    checkRefArray('doctors', doc, 'hospitals', 'hospitals', hospitalIds);
  }

  // 8. Audit Pharmacies
  const pharmacies = await db.collection('pharmacies').find({}, {
    projection: { _id: 1, adminId: 1 }
  }).toArray();
  for (const doc of pharmacies) {
    checkRef('pharmacies', doc, 'adminId', 'pharmacystaffs', staffIds);
  }

  // 9. Audit PharmacyStaffs
  const pharmacystaffs = await db.collection('pharmacystaffs').find({}, {
    projection: { _id: 1, pharmacyId: 1 }
  }).toArray();
  for (const doc of pharmacystaffs) {
    checkRef('pharmacystaffs', doc, 'pharmacyId', 'pharmacies', pharmacyIds);
  }

  // Print Summary
  const auditedCollections = [
    'consultations', 'prescriptions', 'dispensings', 'labtests',
    'verificationtokens', 'outbreakalerts', 'doctors', 'pharmacies', 'pharmacystaffs'
  ];

  console.log('Orphan References By Collection:');
  for (const col of auditedCollections) {
    const count = countsByCollection[col] || 0;
    const status = count === 0 ? 'CLEAN (0 orphans)' : `❌ ${count} ORPHAN REFERENCE(S)`;
    console.log(`   ${col.padEnd(22)} : ${status}`);
  }

  console.log('----------------------------------------------------------------');
  console.log(`Total Orphan References Across Database: ${orphans.length}`);

  if (orphans.length > 0) {
    console.log('\nSample Orphan References (displaying first 30 max, suffixes only):');
    const displayList = orphans.slice(0, 30);
    for (const item of displayList) {
      console.log(`   [ORPHAN] in ${item.collection} (Doc ID: ${item.docIdSuffix}) -> ${item.field} points to missing ${item.targetCollection} (ID: ${item.missingIdSuffix})`);
    }
    if (orphans.length > 30) {
      console.log(`   ... and ${orphans.length - 30} more orphan reference(s).`);
    }
  }

  console.log('----------------------------------------------------------------');
  const isClean = orphans.length === 0;
  console.log(`Audit Result: ${isClean ? '✅ CLEAN - ALL FOREIGN REFERENCES INTEGRAL' : '⚠️ ORPHANS DETECTED'}`);
  console.log('================================================================\n');

  return {
    isClean,
    totalOrphans: orphans.length,
    countsByCollection,
    orphans
  };
}

async function main() {
  const args = parseCliArgs();
  try {
    const result = await auditOrphans(null, args.database);
    if (!result.isClean) {
      process.exitCode = 2; // Informative non-zero exit when orphans exist
    }
  } catch (err) {
    console.error(`❌ Audit failed: ${err.message}`);
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
  auditOrphans,
  parseCliArgs
};
