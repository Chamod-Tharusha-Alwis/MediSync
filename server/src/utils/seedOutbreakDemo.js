const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config(); // fallback
global.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
global.ENCRYPTION_KEYS = { '1': process.env.ENCRYPTION_KEY };
global.ACTIVE_KEY_VERSION = 1;

const mongoose = require('mongoose');
const Consultation = require('../models/Consultation');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Hospital = require('../models/Hospital');

async function seedOutbreakDemo() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI);
  }
  console.log('🌱 Seeding 14-day 3-Tier Outbreak Anomaly Detection Demo data...');

  const patient = await Patient.findOne() || { _id: new mongoose.Types.ObjectId(), nic: '200325711121' };
  const doc = await Doctor.findOne() || { _id: new mongoose.Types.ObjectId() };
  const hospital = await Hospital.findOne() || { _id: new mongoose.Types.ObjectId() };

  const patientNic = patient.nic || '200325711121';
  const now = new Date();
  const records = [];
  let seq = 1000;

  const tiers = [
    { tier: 'CRITICAL', disease: 'Dengue', district: 'Kandy', baselineDailyAvg: 7, todaySpikeCount: 18 },
    { tier: 'CRITICAL', disease: 'Cholera', district: 'Jaffna', baselineDailyAvg: 4, todaySpikeCount: 14 },
    { tier: 'WARNING', disease: 'Leptospirosis', district: 'Colombo', baselineDailyAvg: 5, todaySpikeCount: 9 },
    { tier: 'WARNING', disease: 'Typhoid', district: 'Matara', baselineDailyAvg: 4, todaySpikeCount: 7 },
    { tier: 'NORMAL', disease: 'Chickenpox', district: 'Galle', baselineDailyAvg: 3, todaySpikeCount: 3 }
  ];

  let summary = {
    CRITICAL_DENGUE_KANDY: 0,
    CRITICAL_CHOLERA_JAFFNA: 0,
    WARNING_LEPTOSPIROSIS_COLOMBO: 0,
    WARNING_TYPHOID_MATARA: 0,
    NORMAL_CHICKENPOX_GALLE: 0,
    total: 0
  };

  for (const t of tiers) {
    const summaryKey = `${t.tier}_${t.disease.toUpperCase()}_${t.district.toUpperCase()}`;
    // 14-day historical baseline
    for (let dayOffset = 14; dayOffset >= 1; dayOffset--) {
      const dayDate = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);
      const dailyCount = Math.max(1, t.baselineDailyAvg + (Math.floor(Math.random() * 3) - 1));
      for (let i = 0; i < dailyCount; i++) {
        seq++;
        records.push({
          consultationId: `CON-DEMO-${Date.now()}-${seq}`,
          patientId: patient._id,
          patientNic: patientNic,
          doctorId: doc._id,
          hospitalId: hospital._id,
          diagnosis: t.disease,
          district: t.district,
          symptoms: ['Fever', 'Body ache', 'Fatigue'],
          isDemoData: true,
          isSynthetic: true,
          createdAt: dayDate,
          updatedAt: dayDate
        });
        summary[summaryKey] = (summary[summaryKey] || 0) + 1;
        summary.total++;
      }
    }

    // Today's spike / baseline count
    for (let i = 0; i < t.todaySpikeCount; i++) {
      seq++;
      records.push({
        consultationId: `CON-DEMO-${Date.now()}-${seq}`,
        patientId: patient._id,
        patientNic: patientNic,
        doctorId: doc._id,
        hospitalId: hospital._id,
        diagnosis: t.disease,
        district: t.district,
        symptoms: ['Acute high fever', 'Joint pain', 'Vomiting'],
        isDemoData: true,
        isSynthetic: true,
        createdAt: now,
        updatedAt: now
      });
      summary[summaryKey] = (summary[summaryKey] || 0) + 1;
      summary.total++;
    }
  }

  // Insert records individually to ensure encryption hooks run cleanly
  for (const r of records) {
    const consultation = new Consultation(r);
    await consultation.save();
  }

  console.log('✅ Outbreak Seeding Complete (5 Tiers):');
  console.log(`   - Critical Tier 1 (Dengue in Kandy): ${summary.CRITICAL_DENGUE_KANDY} cases`);
  console.log(`   - Critical Tier 2 (Cholera in Jaffna): ${summary.CRITICAL_CHOLERA_JAFFNA} cases`);
  console.log(`   - Warning Tier 1 (Leptospirosis in Colombo): ${summary.WARNING_LEPTOSPIROSIS_COLOMBO} cases`);
  console.log(`   - Warning Tier 2 (Typhoid in Matara): ${summary.WARNING_TYPHOID_MATARA} cases`);
  console.log(`   - Normal Tier (Chickenpox in Galle): ${summary.NORMAL_CHICKENPOX_GALLE} cases`);
  console.log(`   - Total Cases: ${summary.total}`);
  return summary;
}

if (require.main === module) {
  seedOutbreakDemo().then(() => process.exit(0)).catch(err => {
    console.error('Seeding error:', err);
    process.exit(1);
  });
}

module.exports = seedOutbreakDemo;
