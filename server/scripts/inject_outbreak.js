// node scripts/inject_outbreak.js


require('dotenv').config();
const mongoose = require('mongoose');

// Import your existing models
const Consultation = require('../src/models/Consultation');
const Doctor = require('../src/models/Doctor');

async function simulateOutbreak() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected successfully.');

    // 1. Get any existing doctor to link the consultations to
    const doctor = await Doctor.findOne({ role: 'doctor' });
    const doctorId = doctor ? doctor._id : new mongoose.Types.ObjectId();

    const disease = "Conjunctivitis";
    const district = "Colombo";

    console.log(`\n💉 Injecting BASELINE data for ${disease} (Older than 7 days)...`);
    // Inject 10 cases spread across the last 30 days
    for (let i = 0; i < 10; i++) {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - (Math.floor(Math.random() * 20) + 8)); 

      const doc = new Consultation({
        patientNic: `MOCK-${Math.floor(Math.random() * 100000)}`,
        doctorId: doctorId,
        diagnosis: disease,
        icdDescription: disease,
        district: district,
        notes: "Mock baseline data",
        loginType: "personal"
      });
      // Bypass Mongoose timestamp lock
      doc.createdAt = pastDate;
      await doc.save({ timestamps: false });
    }
    console.log('✅ Baseline injected (10 cases).');

    console.log(`\n🚨 Injecting MASSIVE SPIKE for ${disease} (Last 7 days)...`);
    // Inject 60 cases in the last 5 days
    for (let i = 0; i < 60; i++) {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - Math.floor(Math.random() * 5)); 

      const doc = new Consultation({
        patientNic: `MOCK-${Math.floor(Math.random() * 100000)}`,
        doctorId: doctorId,
        diagnosis: disease,
        icdDescription: disease,
        district: district,
        notes: "Mock spike data",
        loginType: "personal"
      });
      doc.createdAt = recentDate;
      await doc.save({ timestamps: false });
    }
    console.log('✅ Spike injected (60 cases).');

    console.log('\n🎉 Simulation data successfully written to the database!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error injecting data:', err);
    process.exit(1);
  }
}

simulateOutbreak();