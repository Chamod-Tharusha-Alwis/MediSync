const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config(); // fallback
global.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
global.ENCRYPTION_KEYS = { '1': process.env.ENCRYPTION_KEY };
global.ACTIVE_KEY_VERSION = 1;

const mongoose = require('mongoose');
const OutbreakAlert = require('../models/OutbreakAlert');
const {
  PROD_DB_NAME,
  TEST_DB_NAME,
  installDestructiveOpGuards,
  connectProductionDB,
  connectAutomatedTestDB
} = require('../config/dbGuard');

installDestructiveOpGuards();

async function cleanTestOutbreaks() {
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
        `[SAFEGUARD] Cleaning "${PROD_DB_NAME}" requires explicit --confirm-production-cleanup flag.`
      );
    }
    if (targetDb === TEST_DB_NAME) {
      await connectAutomatedTestDB();
    } else {
      await connectProductionDB();
    }
  }
  console.log('--- CLEANING TEST OUTBREAK ALERTS & BROADCASTS ---');

  // Remove only explicitly tagged demo/test broadcasts
  const bmColl = mongoose.connection.db.collection('broadcastmessages');
  const delBroadcasts = await bmColl.deleteMany({
    $or: [
      { isDemoData: true },
      { isSynthetic: true },
      { isTestFixture: true },
      { message: { $regex: '^\\[DEMO\\]|Test Broadcast', $options: 'i' } },
      { title: { $regex: 'E2E Test', $options: 'i' } }
    ]
  });

  // Remove only explicitly tagged demo/synthetic/test outbreak alerts
  const delOutbreaks = await OutbreakAlert.deleteMany({
    $or: [
      { isDemoData: true },
      { isSynthetic: true },
      { isTestFixture: true }
    ]
  });

  console.log(`✅ Removed ${delBroadcasts.deletedCount} test broadcast message records.`);
  console.log(`✅ Removed ${delOutbreaks.deletedCount} test outbreak alerts.`);
  console.log('🎉 CLEANUP COMPLETE: Outbreak monitor and active banners are reset.');

  return {
    success: true,
    deletedBroadcasts: delBroadcasts.deletedCount,
    deletedOutbreaks: delOutbreaks.deletedCount
  };
}

if (require.main === module) {
  cleanTestOutbreaks().then(() => process.exit(0)).catch(err => {
    console.error('Cleanup failed:', err.message);
    process.exit(1);
  });
}

module.exports = cleanTestOutbreaks;
