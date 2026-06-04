require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const Pharmacy = require('../models/Pharmacy');
const PharmacyStaff = require('../models/PharmacyStaff');
const Hospital = require('../models/Hospital');
const Admin = require('../models/Admin');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/medisync';
const nicHash = (nic) => crypto.createHash('sha256').update(nic.trim()).digest('hex');

const seedUsers = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const hashedPassword = await bcrypt.hash('password123', 10);

    // ── 1. DOCTOR ──────────────────────────────────────────────────────────────
    console.log('\n--- Doctor Seed ---');
    const docEmail = 'doctor@example.com';
    const existingDoc = await Doctor.findOne({ email: docEmail });
    if (!existingDoc) {
      await new Doctor({
        doctorId: 'DR-102945',
        fullName: 'Dr. A. Silva',
        email: docEmail,
        password: hashedPassword,
        specialization: 'Cardiologist',
        licenseNo: 'SLMC-12345',
        role: 'doctor',
        twoFactorEnabled: false
      }).save();
      console.log(`✅ Doctor created!`);
    } else {
      console.log(`ℹ️  Doctor already exists!`);
    }
    console.log(`   Email   : ${docEmail}`);
    console.log(`   Password: password123`);

    // ── 2. PATIENT ─────────────────────────────────────────────────────────────
    console.log('\n--- Patient Seed ---');
    try {
      const patNIC = '981234567V';
      const patEmail = 'patient@example.com';
      const tempPat = new Patient({ nic: patNIC, fullName: 'dummy', password: 'dummy', email: patEmail });
      tempPat.encryptFieldsSync();
      const existingPat = await Patient.findOne({ nic: tempPat.nic });
      if (!existingPat) {
        const doc = await new Patient({
          nic: patNIC,
          fullName: 'John Doe',
          password: hashedPassword,
          dateOfBirth: new Date('1990-01-01'),
          gender: 'Male',
          district: 'Colombo',
          contactInfo: '0771234567',
          email: patEmail
        }).save();
        
        // Inject the blind-index that the labController queries against
        await Patient.collection.updateOne(
          { _id: doc._id },
          { $set: { nic_bi: nicHash(patNIC) } }
        );
        
        console.log(`✅ Patient created!`);
      } else {
        console.log(`ℹ️  Patient already exists!`);
      }
      console.log(`   NIC     : ${patNIC}`);
      console.log(`   Email   : ${patEmail}`);
      console.log(`   Password: password123`);
    } catch (e) {
      console.log('⚠️  Patient seed skipped:', e.message);
    }

    // ── 3. HOSPITAL ────────────────────────────────────────────────────────────
    console.log('\n--- Hospital Seed ---');
    try {
      const hospEmail = 'admin@generalhospital.com';
      const hospRegNo = 'HOSP-2024-001';
      const existingHosp = await Hospital.findOne({ email: hospEmail });
      if (!existingHosp) {
        await new Hospital({
          name: 'General Hospital Colombo',
          type: 'government',
          district: 'Colombo',
          address: 'Regent Street, Colombo 08',
          regNo: hospRegNo,
          email: hospEmail,
          password: hashedPassword
        }).save();
        console.log(`✅ Hospital created!`);
      } else {
        console.log(`ℹ️  Hospital already exists!`);
      }
      console.log(`   Email   : ${hospEmail}`);
      console.log(`   Password: password123`);
      console.log(`   Login at: http://localhost:3000/hospital/login`);
    } catch (e) {
      console.log('⚠️  Hospital seed skipped:', e.message);
    }

    // ── 4. PHARMACY ────────────────────────────────────────────────────────────
    console.log('\n--- Pharmacy Seed ---');
    try {
      const pharmEmail = 'admin@pharmacy.com';
      const existingStaff = await PharmacyStaff.findOne({ email: pharmEmail });
      if (!existingStaff) {
        const newPharmacy = await new Pharmacy({
          name: 'HealthCare Pharmacy',
          district: 'Colombo',
          regNo: 'PH-1001'
        }).save();
        await new PharmacyStaff({
          pharmacyId: newPharmacy._id,
          fullName: 'Admin Pharmacist',
          email: pharmEmail,
          password: hashedPassword,
          role: 'pharmacy_admin',
          mustChangePassword: false
        }).save();
        console.log(`✅ Pharmacy Admin created!`);
      } else {
        console.log(`ℹ️  Pharmacy Admin already exists!`);
      }
      console.log(`   Email   : ${pharmEmail}`);
      console.log(`   Password: password123`);
    } catch (e) {
      console.log('⚠️  Pharmacy seed skipped:', e.message);
    }

    // ── 5. SUPER ADMIN ─────────────────────────────────────────────────────────
    console.log('\n--- Super Admin Seed ---');
    try {
      const adminEmail = 'superadmin@medisync.com';
      const existingAdmin = await Admin.findOne({ email: adminEmail });
      if (!existingAdmin) {
        await new Admin({
          fullName: 'Super Admin',
          email: adminEmail,
          password: hashedPassword,
          role: 'admin'
        }).save();
        console.log(`✅ Super Admin created!`);
      } else {
        console.log(`ℹ️  Super Admin already exists!`);
      }
      console.log(`   Email   : ${adminEmail}`);
      console.log(`   Password: password123`);
    } catch (e) {
      console.log('⚠️  Admin seed skipped:', e.message);
    }

    console.log('\n✅ Seed completed! All test accounts use password: password123\n');
    console.log('════════════════════════════════════════════════════');
    console.log('  LOGIN CREDENTIALS SUMMARY');
    console.log('════════════════════════════════════════════════════');
    console.log('  Doctor   → doctor@example.com       / password123');
    console.log('  Patient  → NIC: 981234567V          / password123');
    console.log('  Hospital → admin@generalhospital.com/ password123');
    console.log('  Pharmacy → admin@pharmacy.com       / password123');
    console.log('  Admin    → superadmin@medisync.com  / password123');
    console.log('════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('Fatal seed error:', error);
  } finally {
    mongoose.connection.close();
  }
};

seedUsers();
