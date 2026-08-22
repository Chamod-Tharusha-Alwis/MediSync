const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config(); // fallback

const mongoose = require('mongoose');
const Consultation = require('../models/Consultation');
const BroadcastMessage = require('../models/BroadcastMessage');

async function wipeOutbreakDemo() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI);
  }
  console.log('🧹 [Outbreak Demo] Wiping all demo outbreak data...');

  const delCases = await Consultation.deleteMany({
    $or: [{ isDemoData: true }, { isSynthetic: true }]
  });

  const delBroadcasts = await BroadcastMessage.deleteMany({
    $or: [
      { isDemoData: true },
      { title: new RegExp('DENGUE|LEPTOSPIROSIS|CHICKENPOX', 'i') }
    ]
  });

  console.log(`✅ Deleted ${delCases.deletedCount} demo consultation records.`);
  console.log(`✅ Deleted ${delBroadcasts.deletedCount} demo outbreak broadcast messages.`);

  return { deletedCases: delCases.deletedCount, deletedBroadcasts: delBroadcasts.deletedCount };
}

if (require.main === module) {
  wipeOutbreakDemo().then(() => process.exit(0)).catch(err => {
    console.error('Wipe error:', err);
    process.exit(1);
  });
}

module.exports = wipeOutbreakDemo;
