require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Drug = require('../models/Drug');
const {
  PROD_DB_NAME,
  TEST_DB_NAME,
  installDestructiveOpGuards,
  connectProductionDB,
  connectAutomatedTestDB
} = require('../config/dbGuard');

installDestructiveOpGuards();

const hasContentChanged = (existing, incoming) => {
  if (!existing) return true;
  if ((existing.brand || '') !== (incoming.brand || '')) return true;
  if ((existing.genericName || '') !== (incoming.genericName || '')) return true;
  if ((existing.category || 'General') !== (incoming.category || 'General')) return true;
  const existingDoses = Array.isArray(existing.commonDosages) ? existing.commonDosages : [];
  const incomingDoses = Array.isArray(incoming.commonDosages) ? incoming.commonDosages : [];
  if (existingDoses.length !== incomingDoses.length) return true;
  for (let i = 0; i < existingDoses.length; i++) {
    if (existingDoses[i] !== incomingDoses[i]) return true;
  }
  return false;
};

const seedDrugs = async ({ disconnectWhenDone = true } = {}) => {
  const shouldConnect = mongoose.connection.readyState !== 1;
  if (shouldConnect) {
    const args = process.argv.slice(2);
    const targetArg = args.find((a) => a.startsWith('--target-db='));
    const targetDb = targetArg ? targetArg.split('=')[1] : null;
    if (!targetDb || ![PROD_DB_NAME, TEST_DB_NAME].includes(targetDb)) {
      throw new Error(
        `[SAFEGUARD] Explicit --target-db=${TEST_DB_NAME} (or --target-db=${PROD_DB_NAME} --confirm-production-seed) is required.`
      );
    }
    if (targetDb === PROD_DB_NAME && !args.includes('--confirm-production-seed')) {
      throw new Error(
        `[SAFEGUARD] Seeding "${PROD_DB_NAME}" requires explicit --confirm-production-seed flag.`
      );
    }
    if (targetDb === TEST_DB_NAME) {
      await connectAutomatedTestDB();
    } else {
      await connectProductionDB();
    }
    console.log(`MongoDB connected for seeding drugs [db=${mongoose.connection.name}]...`);
  }

  // Read drugs_clean.json
  const drugsPath = path.join(__dirname, '../../../ml-engine/data/drugs_clean.json');
  if (!fs.existsSync(drugsPath)) {
    throw new Error(`drugs_clean.json not found at ${drugsPath}`);
  }

  const drugsData = JSON.parse(fs.readFileSync(drugsPath, 'utf-8'));
  console.log(`Loaded ${drugsData.length} drugs from JSON.`);

  const existingDocs = await Drug.collection.find({}).toArray();
  const existingByName = new Map(existingDocs.map(doc => [doc.name, doc]));

  const now = new Date();
  const bulkOps = [];

  for (const drug of drugsData) {
    if (!drug || !drug.name) continue;

    const normalizedDoc = {
      name: drug.name,
      brand: drug.brand || '',
      genericName: drug.genericName,
      category: drug.category || 'General',
      commonDosages: Array.isArray(drug.commonDosages) ? drug.commonDosages : []
    };

    const existing = existingByName.get(drug.name);
    if (!existing) {
      bulkOps.push({
        updateOne: {
          filter: { name: drug.name },
          update: {
            $setOnInsert: {
              ...normalizedDoc,
              createdAt: now,
              updatedAt: now
            }
          },
          upsert: true
        }
      });
    } else if (hasContentChanged(existing, normalizedDoc)) {
      bulkOps.push({
        updateOne: {
          filter: { name: drug.name },
          update: {
            $set: {
              ...normalizedDoc,
              updatedAt: now
            }
          },
          upsert: false
        }
      });
    } else {
      // Unchanged record: $setOnInsert only on native collection avoids touching updatedAt
      bulkOps.push({
        updateOne: {
          filter: { name: drug.name },
          update: {
            $setOnInsert: {
              ...normalizedDoc,
              createdAt: now,
              updatedAt: now
            }
          },
          upsert: true
        }
      });
    }
  }

  const result = bulkOps.length > 0
    ? await Drug.collection.bulkWrite(bulkOps, { ordered: false })
    : { matchedCount: 0, upsertedCount: 0, modifiedCount: 0 };

  const inserted = result.upsertedCount || 0;
  const updated = result.modifiedCount || 0;
  const matched = result.matchedCount || 0;
  const totalCount = await Drug.collection.countDocuments();

  console.log(
    `Successfully seeded drugs! Matched: ${matched}, Inserted: ${inserted}, Updated: ${updated}, Total Preserved: ${totalCount}`
  );

  if (disconnectWhenDone && shouldConnect) {
    await mongoose.disconnect();
    console.log('Database disconnected.');
  }

  return {
    matchedCount: matched,
    upsertedCount: inserted,
    modifiedCount: updated,
    totalCount
  };
};

if (require.main === module) {
  seedDrugs()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Error seeding drugs:', error);
      process.exit(1);
    });
}

module.exports = seedDrugs;
