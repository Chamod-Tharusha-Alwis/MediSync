require('dotenv').config();

// Ensure global encryption keys are available for Mongoose versionedEncryption plugin
global.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '7c3f9a2e8b1d4f6a5c0d9e8b7a6f5c4d';
global.ENCRYPTION_KEYS = { "1": global.ENCRYPTION_KEY };
global.ACTIVE_KEY_VERSION = 1;

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
const TEST_PASSWORD = process.env.SEED_TEST_PASSWORD || 'MediSync#2026!Pass';

const seedUsers = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);

    // ── 1. DOCTOR ──────────────────────────────────────────────────────────────
    console.log('\n--- Doctor Seed ---');
    const docEmail = 'doctor@example.com';
    let existingDoc = await Doctor.findOne({ email: docEmail });
    if (!existingDoc) {
      existingDoc = await new Doctor({
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
      existingDoc.password = hashedPassword;
      await existingDoc.save();
      console.log(`ℹ️ Doctor updated with new password!`);
    }
    console.log(`   Email   : ${docEmail}`);

    // ── 2. PATIENT ─────────────────────────────────────────────────────────────
    console.log('\n--- Patient Seed ---');
    try {
      const patNIC = '981234567V';
      const patEmail = 'codmobilechamod2025@gmail.com';

      // Clean up any existing records for this email or NIC to avoid index conflicts
      await Patient.deleteMany({ $or: [{ email: patEmail }, { nic: patNIC }] });

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
      
      await Patient.collection.updateOne(
        { _id: doc._id },
        { $set: { patientNic_bi: nicHash(patNIC) } }
      );
      console.log(`✅ Patient created!`);
      console.log(`   NIC     : ${patNIC}`);
      console.log(`   Email   : ${patEmail}`);
    } catch (e) {
      console.error('⚠️ Patient seed error:', e.message);
    }

    // ── 3. HOSPITAL ────────────────────────────────────────────────────────────
    console.log('\n--- Hospital Seed ---');
    try {
      const hospEmail = 'admin@generalhospital.com';
      const hospRegNo = 'HOSP-2024-001';
      let existingHosp = await Hospital.findOne({ email: hospEmail });
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
        existingHosp.password = hashedPassword;
        await existingHosp.save();
        console.log(`ℹ️ Hospital updated with new password!`);
      }
      console.log(`   Email   : ${hospEmail}`);
    } catch (e) {
      console.log('⚠️ Hospital seed error:', e.message);
    }

    // ── 4. PHARMACY ────────────────────────────────────────────────────────────
    console.log('\n--- Pharmacy Seed ---');
    try {
      const pharmEmail = 'admin@pharmacy.com';
      let existingStaff = await PharmacyStaff.findOne({ email: pharmEmail });
      if (!existingStaff) {
        let newPharmacy = await Pharmacy.findOne({ regNo: 'PH-1001' });
        if (!newPharmacy) {
          newPharmacy = await new Pharmacy({
            name: 'HealthCare Pharmacy',
            district: 'Colombo',
            regNo: 'PH-1001'
          }).save();
        }
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
        existingStaff.password = hashedPassword;
        await existingStaff.save();
        console.log(`ℹ️ Pharmacy Admin updated with new password!`);
      }
      console.log(`   Email   : ${pharmEmail}`);
    } catch (e) {
      console.log('⚠️ Pharmacy seed error:', e.message);
    }

    // ── 5. SUPER ADMIN ─────────────────────────────────────────────────────────
    console.log('\n--- Super Admin Seed ---');
    try {
      const adminEmail = 'superadmin@medisync.com';
      let existingAdmin = await Admin.findOne({ email: adminEmail });
      if (!existingAdmin) {
        await new Admin({
          fullName: 'Super Admin',
          email: adminEmail,
          password: hashedPassword,
          role: 'admin'
        }).save();
        console.log(`✅ Super Admin created!`);
      } else {
        existingAdmin.password = hashedPassword;
        await existingAdmin.save();
        console.log(`ℹ️ Super Admin updated with new password!`);
      }
      console.log(`   Email   : ${adminEmail}`);
    } catch (e) {
      console.log('⚠️ Admin seed error:', e.message);
    }

    console.log('\n✅ Seed execution completed successfully!\n');

  } catch (error) {
    console.error('Fatal seed error:', error);
  } finally {
    mongoose.connection.close();
  }
};

seedUsers();
