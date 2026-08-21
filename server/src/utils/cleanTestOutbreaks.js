require('dotenv').config();
global.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
global.ENCRYPTION_KEYS = { '1': process.env.ENCRYPTION_KEY };
global.ACTIVE_KEY_VERSION = 1;

const mongoose = require('mongoose');
const OutbreakAlert = require('../models/OutbreakAlert');

async function cleanTestOutbreaks() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI);
  }
  console.log('--- CLEANING TEST OUTBREAK ALERTS & BROADCASTS ---');

  // Remove test broadcasts
  const bmColl = mongoose.connection.db.collection('broadcastmessages');
  const delBroadcasts = await bmColl.deleteMany({
    $or: [
      { message: { $regex: 'Test Broadcast', $options: 'i' } },
      { title: { $regex: 'E2E Test', $options: 'i' } },
      { message: { $regex: 'Cholera', $options: 'i' } },
      { message: { $regex: 'General Infection', $options: 'i' } }
    ]
  });

  // Resolve or clean test outbreak alerts
  const delOutbreaks = await OutbreakAlert.deleteMany({
    $or: [
      { disease: { $regex: 'Cholera', $options: 'i' } },
      { disease: { $regex: 'General Infection', $options: 'i' } },
      { disease: { $regex: 'Common Cold', $options: 'i' } },
      { status: { $in: ['Pending', 'Resolved', 'Dismissed'] } }
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
    console.error('Cleanup failed:', err);
    process.exit(1);
  });
}

module.exports = cleanTestOutbreaks;
