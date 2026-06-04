require('dotenv').config({ path: __dirname + '/../../.env' });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');

async function seedAdmin() {
  try {
    console.log('Connecting to MongoDB...');
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/medisync';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.');

    const adminEmail = 'superadmin@medisync.com';
    const adminExists = await Admin.findOne({ email: adminEmail });

    if (adminExists) {
      console.log('Super Admin already exists.');
      process.exit(0);
    }

    console.log('Creating new Super Admin...');
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      throw new Error('FATAL: ADMIN_PASSWORD environment variable is not defined.');
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminPassword, salt);

    const admin = new Admin({
      fullName: 'Super Administrator',
      name: 'SuperAdmin',
      email: adminEmail,
      password: hashedPassword,
      role: 'admin',
      isSuperAdmin: true,
      isActive: true
    });
    
    await admin.save();
    console.log('Super Admin Seeded Successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
}

seedAdmin();
