require('dotenv').config({ path: __dirname + '/../../.env' });
const mongoose = require('mongoose');
const Doctor = require('../models/Doctor');

async function seedAdmin() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB.');

    const adminEmail = 'admin@medisync.com';
    const adminExists = await Doctor.findOne({ email: adminEmail });

    if (adminExists) {
      console.log('Admin already exists! Updating password and role...');
      adminExists.password = 'AdminPass1!'; // This will trigger the pre('save') hook
      adminExists.role = 'super_admin';
      adminExists.fullName = 'System Administrator';
      await adminExists.save();
      console.log('Admin updated successfully!');
    } else {
      console.log('Creating new Super Admin...');
      const admin = new Doctor({
        doctorId: 'ADMIN-001',
        fullName: 'System Administrator',
        email: adminEmail,
        password: 'AdminPass1!',
        licenseNo: 'SYS-ADMIN-000',
        specialization: 'System Administration',
        role: 'super_admin',
        isActive: true
      });
      await admin.save();
      console.log('Super Admin created successfully!');
    }

    mongoose.disconnect();
    console.log('Database disconnected.');
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
}

seedAdmin();
