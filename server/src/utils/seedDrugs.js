require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Drug = require('../models/Drug');

const seedDrugs = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected for seeding drugs...');

    // Read drugs_clean.json
    const drugsPath = path.join(__dirname, '../../../ml-engine/data/drugs_clean.json');
    if (!fs.existsSync(drugsPath)) {
      console.error('drugs_clean.json not found at', drugsPath);
      process.exit(1);
    }

    const drugsData = JSON.parse(fs.readFileSync(drugsPath, 'utf-8'));
    console.log(`Loaded ${drugsData.length} drugs from JSON.`);

    let inserted = 0;
    let updated = 0;

    // Upsert by name
    for (const drug of drugsData) {
      if (!drug.name) continue;

      const result = await Drug.updateOne(
        { name: drug.name },
        { $set: drug },
        { upsert: true }
      );

      if (result.upsertedCount > 0) inserted++;
      else if (result.modifiedCount > 0) updated++;
    }

    console.log(`Successfully seeded drugs! Inserted: ${inserted}, Updated: ${updated}`);
    mongoose.disconnect();
    console.log('Database disconnected.');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding drugs:', error);
    process.exit(1);
  }
};

seedDrugs();
