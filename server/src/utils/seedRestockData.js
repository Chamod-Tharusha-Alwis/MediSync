require('dotenv').config();
global.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
global.ENCRYPTION_KEYS = { '1': process.env.ENCRYPTION_KEY };
global.ACTIVE_KEY_VERSION = 1;

const mongoose = require('mongoose');
const Pharmacy = require('../models/Pharmacy');
const PharmacyStaff = require('../models/PharmacyStaff');
const Dispensing = require('../models/Dispensing');
const Prescription = require('../models/Prescription');

const DRUGS_DATA = [
  { drugName: 'Paracetamol', defaultStock: 500, reorderLevel: 150, unit: 'tablets', dailyRange: [15, 45], spikeDays: [1, 2, 3] },
  { drugName: 'Amoxicillin', defaultStock: 300, reorderLevel: 80, unit: 'capsules', dailyRange: [10, 30], spikeDays: [1, 2] },
  { drugName: 'Metformin', defaultStock: 400, reorderLevel: 100, unit: 'tablets', dailyRange: [20, 50], spikeDays: [] },
  { drugName: 'Omeprazole', defaultStock: 250, reorderLevel: 60, unit: 'capsules', dailyRange: [8, 25], spikeDays: [1] },
  { drugName: 'Cetirizine', defaultStock: 350, reorderLevel: 90, unit: 'tablets', dailyRange: [12, 35], spikeDays: [1, 2, 3] },
  { drugName: 'Salbutamol', defaultStock: 100, reorderLevel: 30, unit: 'inhalers', dailyRange: [3, 12], spikeDays: [1, 2] },
  { drugName: 'Azithromycin', defaultStock: 150, reorderLevel: 40, unit: 'tablets', dailyRange: [5, 18], spikeDays: [] },
  { drugName: 'Ibuprofen', defaultStock: 280, reorderLevel: 70, unit: 'tablets', dailyRange: [8, 22], spikeDays: [] },
];

async function seedRestock() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI);
  }
  console.log('--- SEEDING 14-DAY PHARMACY RESTOCK & DISPENSING DATA ---');

  const pharmacies = await Pharmacy.find();
  if (pharmacies.length === 0) {
    console.log('No pharmacies found to seed.');
    return { success: false, message: 'No pharmacies found' };
  }

  let totalDispensedCreated = 0;

  for (const pharmacy of pharmacies) {
    // 1. Update/populate inventory
    if (!pharmacy.inventory || pharmacy.inventory.length === 0) {
      pharmacy.inventory = [];
    }

    for (const d of DRUGS_DATA) {
      const existing = pharmacy.inventory.find(i => i.drugName.toLowerCase().trim() === d.drugName.toLowerCase().trim());
      if (existing) {
        existing.reorderLevel = d.reorderLevel;
        existing.unit = d.unit;
      } else {
        pharmacy.inventory.push({
          drugName: d.drugName,
          stock: d.defaultStock,
          reorderLevel: d.reorderLevel,
          unit: d.unit
        });
      }
    }
    await pharmacy.save();

    // 2. Find a staff member
    let staff = await PharmacyStaff.findOne({ pharmacyId: pharmacy._id });
    if (!staff) {
      staff = await PharmacyStaff.findOne();
    }
    const staffId = staff ? staff._id : new mongoose.Types.ObjectId();

    // 3. Generate 14 days of historical dispensings
    const now = new Date();
    for (let day = 14; day >= 0; day--) {
      const dayDate = new Date(now.getTime() - day * 24 * 60 * 60 * 1000);
      const isSpike = day <= 3; // Recent spike for demand trend

      for (const d of DRUGS_DATA) {
        const baseQty = Math.floor(Math.random() * (d.dailyRange[1] - d.dailyRange[0] + 1)) + d.dailyRange[0];
        const multiplier = isSpike && d.spikeDays.includes(day) ? 2.5 : 1.0;
        const finalQty = Math.round(baseQty * multiplier);

        const dummyPrescription = new Prescription({
          patientNic: '200325711121',
          nicHash: 'dummy_hash_seed',
          drugName: d.drugName,
          dosage: 'Standard',
          status: 'dispensed',
          dispensedAt: dayDate,
          dispensedBy: pharmacy._id,
          pharmacyName: pharmacy.name,
          isOTC: true
        });
        await dummyPrescription.save();

        const dispensing = new Dispensing({
          receiptNumber: `RCP-SEED-${pharmacy._id.toString().slice(-4)}-${day}-${Math.floor(1000 + Math.random() * 9000)}`,
          prescriptionId: dummyPrescription._id,
          pharmacyId: pharmacy._id,
          staffId: staffId,
          patientNic: '200325711121',
          items: [{
            drugName: d.drugName,
            dosage: 'Standard',
            quantityDispensed: finalQty,
            status: 'dispensed'
          }],
          notes: `Historical seed dispensing day -${day}`,
          dispensedAt: dayDate
        });
        await dispensing.save();
        totalDispensedCreated++;
      }
    }
    console.log(`✅ Seeded inventory & 14 days of dispensings for pharmacy: ${pharmacy.name} (${pharmacy.district || 'Colombo'})`);
  }

  console.log(`\n🎉 SEED COMPLETE: Created ${totalDispensedCreated} dispensing records across ${pharmacies.length} pharmacies.`);
  return { success: true, count: totalDispensedCreated };
}

if (require.main === module) {
  seedRestock().then(() => process.exit(0)).catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}

module.exports = seedRestock;
