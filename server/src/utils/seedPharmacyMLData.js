const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config(); // fallback
global.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
global.ENCRYPTION_KEYS = { '1': process.env.ENCRYPTION_KEY };
global.ACTIVE_KEY_VERSION = 1;

const mongoose = require('mongoose');
const Dispensing = require('../models/Dispensing');
const Prescription = require('../models/Prescription');
const PharmacyStaff = require('../models/PharmacyStaff');
const Pharmacy = require('../models/Pharmacy');
const Patient = require('../models/Patient');

async function seedPharmacyMLData() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI);
  }
  console.log('🌱 Seeding Pharmacy Medication Release & ML Analytics Data...');

  const pharmacy = await Pharmacy.findOne() || { _id: new mongoose.Types.ObjectId(), name: 'Central City Pharmacy' };
  const staff = await PharmacyStaff.findOne({ email: 'coctharusha0913@gmail.com' }) || await PharmacyStaff.findOne() || { _id: new mongoose.Types.ObjectId(), fullName: 'Tharusha (Pharmacist)' };
  const patient = await Patient.findOne() || { _id: new mongoose.Types.ObjectId(), nic: '200325711121' };

  const pharmacyId = pharmacy._id;
  const staffId = staff._id;
  const patientNic = patient.nic || '200325711121';

  const medications = [
    { name: 'Amoxicillin 500mg', baseDaily: 15, spikeTrend: 1.8, district: 'Kandy', dosage: '500mg' },
    { name: 'Paracetamol 500mg', baseDaily: 30, spikeTrend: 1.1, district: 'Colombo', dosage: '500mg' },
    { name: 'Salbutamol 4mg', baseDaily: 10, spikeTrend: 2.2, district: 'Kandy', dosage: '4mg' },
    { name: 'Metformin 500mg', baseDaily: 20, spikeTrend: 1.0, district: 'Galle', dosage: '500mg' },
    { name: 'Omeprazole 20mg', baseDaily: 18, spikeTrend: 1.05, district: 'Colombo', dosage: '20mg' }
  ];

  const now = new Date();
  const dispensingRecords = [];
  let receiptSeq = 1000;

  for (let day = 14; day >= 0; day--) {
    const recordDate = new Date(now.getTime() - day * 24 * 60 * 60 * 1000);
    const isRecentSpikeDay = day <= 3;

    for (const med of medications) {
      const multiplier = isRecentSpikeDay ? med.spikeTrend : 1.0;
      const count = Math.round(med.baseDaily * multiplier);

      for (let i = 0; i < count; i++) {
        receiptSeq++;
        const qty = Math.floor(Math.random() * 10) + 10;

        // Create synthetic prescription
        const prescription = new Prescription({
          prescriptionId: `RX-DEMO-${Date.now()}-${receiptSeq}`,
          patientNic: patientNic,
          patientId: patient._id,
          drugName: med.name,
          dosage: med.dosage,
          frequency: 'Twice daily',
          durationDays: 7,
          status: 'dispensed',
          isOTC: true,
          dispensedAt: recordDate,
          dispensedBy: pharmacyId
        });
        await prescription.save();

        // Create synthetic dispensing record
        const dispensing = new Dispensing({
          prescriptionId: prescription._id,
          pharmacyId: pharmacyId,
          staffId: staffId,
          patientNic: patientNic,
          receiptNumber: `REC-DEMO-${Date.now()}-${receiptSeq}`,
          items: [{
            drugName: med.name,
            dosage: med.dosage,
            quantityDispensed: qty,
            status: 'dispensed'
          }],
          dispensedAt: recordDate,
          isSynthetic: true
        });
        await dispensing.save();
        dispensingRecords.push(dispensing);
      }
    }
  }

  console.log(`✅ Successfully seeded ${dispensingRecords.length} medication release records for ML Analytics & Forecasting!`);
  return { totalDispensed: dispensingRecords.length };
}

if (require.main === module) {
  seedPharmacyMLData().then(() => process.exit(0)).catch(err => {
    console.error('Pharmacy seeding error:', err);
    process.exit(1);
  });
}

module.exports = seedPharmacyMLData;
