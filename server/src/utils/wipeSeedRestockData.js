require('../security/maintenanceAdmission').denyLegacyMaintenance();
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config(); // fallback
global.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
global.ENCRYPTION_KEYS = { '1': process.env.ENCRYPTION_KEY };
global.ACTIVE_KEY_VERSION = 1;

const mongoose = require('mongoose');
const Dispensing = require('../models/Dispensing');
const Prescription = require('../models/Prescription');
const {
  PROD_DB_NAME,
  TEST_DB_NAME,
  installDestructiveOpGuards,
  connectProductionDB,
  connectAutomatedTestDB
} = require('../config/dbGuard');

installDestructiveOpGuards();

async function wipeSeedRestockData() {
  if (mongoose.connection.readyState === 0) {
    const args = process.argv.slice(2);
    const targetArg = args.find((a) => a.startsWith('--target-db='));
    const targetDb = targetArg ? targetArg.split('=')[1] : null;
    if (!targetDb || ![PROD_DB_NAME, TEST_DB_NAME].includes(targetDb)) {
      throw new Error(
        `[SAFEGUARD] Explicit --target-db=${TEST_DB_NAME} (or --target-db=${PROD_DB_NAME} --confirm-production-cleanup) is required.`
      );
    }
    if (targetDb === PROD_DB_NAME && !args.includes('--confirm-production-cleanup')) {
      throw new Error(
        `[SAFEGUARD] Wiping restock seed records in "${PROD_DB_NAME}" via CLI requires --confirm-production-cleanup.`
      );
    }
    if (targetDb === TEST_DB_NAME) {
      await connectAutomatedTestDB();
    } else {
      await connectProductionDB();
    }
  }
  console.log('--- WIPING SYNTHETIC TEST SEED RESTOCK DATA ---');

  const queryDispensing = {
    $or: [
      { isSynthetic: true },
      { receiptNumber: { $regex: '^RCP-SEED-' } },
      { notes: { $regex: 'seed dispensing', $options: 'i' } }
    ]
  };

  const queryPrescriptions = {
    $or: [
      { isSynthetic: true },
      { nicHash: 'dummy_hash_seed' }
    ]
  };

  const delDispensing = await Dispensing.deleteMany(queryDispensing);
  const delPrescriptions = await Prescription.deleteMany(queryPrescriptions);

  console.log(`✅ Deleted ${delDispensing.deletedCount} synthetic dispensing records.`);
  console.log(`✅ Deleted ${delPrescriptions.deletedCount} synthetic prescription records.`);
  console.log('🎉 WIPE COMPLETE: Database is clean of synthetic test dispensing data.');

  return {
    success: true,
    deletedDispensings: delDispensing.deletedCount,
    deletedPrescriptions: delPrescriptions.deletedCount
  };
}

if (require.main === module) {
  wipeSeedRestockData().then(() => process.exit(0)).catch(err => {
    console.error('Wipe failed:', err);
    process.exit(1);
  });
}

module.exports = wipeSeedRestockData;
