require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const Drug = require("../models/Drug");
const ICDCode = require("../models/ICDCode");

const seedDatabase = async () => {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    console.log("Clearing existing Drug and ICDCode collections...");
    await Drug.deleteMany({});
    await ICDCode.deleteMany({});
    console.log("Cleared existing collections.");

    const drugsPath = path.join(__dirname, "../../../ml-engine/data/drugs_clean.json");
    const icdPath = path.join(__dirname, "../../../ml-engine/data/icd10_clean.json");

    if (!fs.existsSync(drugsPath) || !fs.existsSync(icdPath)) {
      throw new Error("Dataset files not found. Please ensure the Python preprocessor has run successfully.");
    }

    const drugsData = JSON.parse(fs.readFileSync(drugsPath, "utf-8"));
    const icdData = JSON.parse(fs.readFileSync(icdPath, "utf-8"));

    console.log("Seeding " + drugsData.length + " drugs...");
    // Inserting all 3000 drugs is small enough for a single insertMany
    await Drug.insertMany(drugsData);
    
    console.log("Seeding " + icdData.length + " ICD-10 codes...");
    // Chunking the 71,000+ ICD-10 codes to prevent memory issues
    const CHUNK_SIZE = 5000;
    const totalChunks = Math.ceil(icdData.length / CHUNK_SIZE);
    
    for (let i = 0; i < icdData.length; i += CHUNK_SIZE) {
      const chunk = icdData.slice(i, i + CHUNK_SIZE);
      await ICDCode.insertMany(chunk);
      const currentChunk = Math.floor(i / CHUNK_SIZE) + 1;
      console.log("Inserted chunk " + currentChunk + " of " + totalChunks);
    }

    console.log("==========================================");
    console.log("✅ Database seeded successfully!");
    console.log("==========================================");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  }
};

seedDatabase();
