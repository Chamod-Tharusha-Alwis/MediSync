require('../security/maintenanceAdmission').denyLegacyMaintenance();
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config(); // fallback

const mongoose = require('mongoose');
const Consultation = require('../models/Consultation');
const BroadcastMessage = require('../models/BroadcastMessage');
const {
  PROD_DB_NAME,
  TEST_DB_NAME,
  installDestructiveOpGuards,
  connectProductionDB,
  connectAutomatedTestDB
} = require('../config/dbGuard');

installDestructiveOpGuards();

async function wipeOutbreakDemo() {
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
        `[SAFEGUARD] Wiping demo outbreak records in "${PROD_DB_NAME}" via CLI requires --confirm-production-cleanup.`
      );
    }
    if (targetDb === TEST_DB_NAME) {
      await connectAutomatedTestDB();
    } else {
      await connectProductionDB();
    }
  }
  console.log('🧹 [Outbreak Demo] Wiping all demo outbreak data...');

  const delCases = await Consultation.deleteMany({
    $or: [{ isDemoData: true }, { isSynthetic: true }, { consultationId: /^CON-DEMO-/ }]
  });

  const delBroadcasts = await BroadcastMessage.deleteMany({
    $or: [{ isDemoData: true }, { isSynthetic: true }]
  });

  console.log(`✅ Deleted ${delCases.deletedCount} demo consultation records.`);
  console.log(`✅ Deleted ${delBroadcasts.deletedCount} demo outbreak broadcast messages.`);

  return { deletedCases: delCases.deletedCount, deletedBroadcasts: delBroadcasts.deletedCount };
}

if (require.main === module) {
  wipeOutbreakDemo().then(() => process.exit(0)).catch(err => {
    console.error('Wipe error:', err.message);
    process.exit(1);
  });
}

module.exports = wipeOutbreakDemo;
