require('dotenv').config({ path: __dirname + '/../../.env' });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const {
  PROD_DB_NAME,
  TEST_DB_NAME,
  installDestructiveOpGuards,
  connectProductionDB,
  connectAutomatedTestDB
} = require('../config/dbGuard');

installDestructiveOpGuards();

async function seedAdmin() {
  try {
    const args = process.argv.slice(2);
    const targetArg = args.find((a) => a.startsWith('--target-db='));
    const targetDb = targetArg ? targetArg.split('=')[1] : null;
    if (!targetDb || ![PROD_DB_NAME, TEST_DB_NAME].includes(targetDb)) {
      throw new Error(
        `[SAFEGUARD] Explicit --target-db=${TEST_DB_NAME} (or --target-db=${PROD_DB_NAME} --confirm-production-seed) is required.`
      );
    }
    if (targetDb === PROD_DB_NAME && !args.includes('--confirm-production-seed')) {
      throw new Error(
        `[SAFEGUARD] Seeding "${PROD_DB_NAME}" requires explicit --confirm-production-seed flag.`
      );
    }

    console.log(`Connecting to MongoDB Atlas [target=${targetDb}]...`);
    if (targetDb === TEST_DB_NAME) {
      await connectAutomatedTestDB();
    } else {
      await connectProductionDB();
    }
    console.log(`Connected to MongoDB [db=${mongoose.connection.name}].`);

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
