const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config(); // fallback
global.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
global.ENCRYPTION_KEYS = { '1': process.env.ENCRYPTION_KEY };
global.ACTIVE_KEY_VERSION = 1;

const mongoose = require('mongoose');
const Dispensing = require('../models/Dispensing');
const Prescription = require('../models/Prescription');

async function wipeSeedRestockData() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI);
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
