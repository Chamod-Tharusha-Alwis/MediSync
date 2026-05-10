/**
 * setupAdmin.js — Creates or updates an admin account in the database.
 * Usage: node server/scripts/setupAdmin.js [email] [password]
 * 
 * If the account exists → updates it to admin/isSuperAdmin=true.
 * If it doesn't exist  → creates a new admin account.
 */
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const dotenv   = require('dotenv');
const path     = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Admin = require('../src/models/Admin');

const EMAIL    = process.argv[2] || 'admin@medisync.com';
const PASSWORD = process.argv[3] || 'Admin123!';

const run = async () => {
  try {
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI not set in server/.env');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected.');

    const hashed = await bcrypt.hash(PASSWORD, 12);

    const existing = await Admin.findOne({ email: EMAIL });

    if (existing) {
      existing.role = 'admin';
      existing.isSuperAdmin = true;
      existing.password = hashed;
      await existing.save();
      console.log(`\nUPDATED existing admin:`);
      console.log(`  Email: ${existing.email}`);
      console.log(`  Role:  ${existing.role}`);
      console.log(`  Super: ${existing.isSuperAdmin}\n`);
    } else {
      const admin = await Admin.create({
        name: 'System Administrator',
        email: EMAIL,
        password: hashed,
        role: 'admin',
        isSuperAdmin: true,
      });
      console.log(`\nCREATED new admin:`);
      console.log(`  Email: ${admin.email}`);
      console.log(`  Role:  ${admin.role}`);
      console.log(`  Super: ${admin.isSuperAdmin}\n`);
    }

    process.exit(0);
  } catch (err) {
    console.error('setupAdmin failed:', err.message);
    process.exit(1);
  }
};

run();
