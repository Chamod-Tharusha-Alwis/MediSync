require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const Drug = require("../models/Drug");
const ICDCode = require("../models/ICDCode");
const {
  PROD_DB_NAME,
  TEST_DB_NAME,
  installDestructiveOpGuards,
  connectProductionDB,
  connectAutomatedTestDB
} = require("../config/dbGuard");

installDestructiveOpGuards();

const seedDatabase = async () => {
  try {
    const args = process.argv.slice(2);
    const targetArg = args.find((a) => a.startsWith("--target-db="));
    const targetDb = targetArg ? targetArg.split("=")[1] : null;

    if (!targetDb || ![PROD_DB_NAME, TEST_DB_NAME].includes(targetDb)) {
      throw new Error(
        `[SAFEGUARD] Explicit --target-db=${TEST_DB_NAME} (or --target-db=${PROD_DB_NAME} --confirm-production-seed) is required.`
      );
    }

    if (targetDb === PROD_DB_NAME && !args.includes("--confirm-production-seed")) {
      throw new Error(
        `[SAFEGUARD] Seeding "${PROD_DB_NAME}" requires explicit --confirm-production-seed flag.`
      );
    }

    console.log(`Connecting to MongoDB Atlas [target=${targetDb}]...`);
    if (targetDb === TEST_DB_NAME) {
      await connectAutomatedTestDB();
    } else {
      await connectProductionDB();
    }
    console.log(`Connected to MongoDB [db=${mongoose.connection.name}]`);

    const drugsPath = path.join(__dirname, "../../../ml-engine/data/drugs_clean.json");
    const icdPath = path.join(__dirname, "../../../ml-engine/data/icd10_clean.json");

    if (!fs.existsSync(drugsPath) || !fs.existsSync(icdPath)) {
      throw new Error("Dataset files not found. Please ensure the Python preprocessor has run successfully.");
    }

    const drugsData = JSON.parse(fs.readFileSync(drugsPath, "utf-8"));
    const icdData = JSON.parse(fs.readFileSync(icdPath, "utf-8"));

    console.log(`Upserting ${drugsData.length} drugs non-destructively (no deleteMany)...`);
    const drugOps = drugsData
      .filter((d) => d && d.name)
      .map((d) => ({
        updateOne: {
          filter: { name: d.name },
          update: {
            $setOnInsert: {
              name: d.name,
              brand: d.brand || "",
              genericName: d.genericName || "",
              category: d.category || "General",
              commonDosages: Array.isArray(d.commonDosages) ? d.commonDosages : []
            }
          },
          upsert: true
        }
      }));
    if (drugOps.length > 0) {
      await Drug.collection.bulkWrite(drugOps, { ordered: false });
    }

    console.log(`Upserting ${icdData.length} ICD-10 codes non-destructively...`);
    const CHUNK_SIZE = 1000;
    const totalChunks = Math.ceil(icdData.length / CHUNK_SIZE);

    for (let i = 0; i < icdData.length; i += CHUNK_SIZE) {
      const chunk = icdData.slice(i, i + CHUNK_SIZE);
      const icdOps = chunk
        .filter((item) => item && item.code)
        .map((item) => ({
          updateOne: {
            filter: { code: item.code },
            update: {
              $setOnInsert: {
                code: item.code,
                description: item.description || "",
                category: item.category || "General"
              }
            },
            upsert: true
          }
        }));
      if (icdOps.length > 0) {
        await ICDCode.collection.bulkWrite(icdOps, { ordered: false });
      }
      const currentChunk = Math.floor(i / CHUNK_SIZE) + 1;
      console.log("Upserted chunk " + currentChunk + " of " + totalChunks);
    }

    console.log("==========================================");
    console.log("✅ Reference catalogues upserted safely!");
    console.log("==========================================");
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Error seeding database:", error.message);
    process.exit(1);
  }
};

if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
