'use strict';
/**
 * bootstrapSuperAdmin.js — Idempotent super-admin seed for medisync_prod.
 *
 * Usage:
 *   node server/scripts/bootstrapSuperAdmin.js <email> <password>
 *
 * - Creates an active super-admin if one does not exist.
 * - Updates an existing account to isSuperAdmin=true, isActive=true.
 * - Requires MONGO_URI in server/.env pointing to the production cluster.
 * - Reads MEDISYNC_PROTOTYPE_MODE and MEDISYNC_ALLOW_OPERATOR_KEYS so the
 *   Vault bypass path (operator-supplied ENCRYPTION_KEYS) is honoured.
 * - Never prints or logs the password or connection string.
 * - Exits 0 on success, 1 on any error.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const EMAIL    = process.argv[2];
const PASSWORD = process.argv[3];

if (!EMAIL || !PASSWORD) {
  console.error('Usage: node server/scripts/bootstrapSuperAdmin.js <email> <password>');
  process.exit(1);
}

if (!process.env.MONGO_URI) {
  console.error('FATAL: MONGO_URI is not set in server/.env');
  process.exit(1);
}

// Initialise encryption globals so Mongoose field-encryption plugins load safely.
// In prototype mode these come from env; otherwise we set a dummy for schema load only.
if (!global.ENCRYPTION_KEY) {
  const k = (process.env.ENCRYPTION_KEYS && JSON.parse(process.env.ENCRYPTION_KEYS)) ||
            (process.env.ENCRYPTION_KEY && { '1': process.env.ENCRYPTION_KEY }) ||
            { '1': 'bootstrapplaceholder00000000000000' };
  const v = process.env.ACTIVE_KEY_VERSION || '1';
  global.ENCRYPTION_KEYS    = k;
  global.ACTIVE_KEY_VERSION = v;
  global.ENCRYPTION_KEY     = k[v] || k['1'];
}

const Admin = require('../src/models/Admin');

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI, { dbName: 'medisync_prod' });
    console.log('[bootstrap] MongoDB connected.');

    const hashed = await bcrypt.hash(PASSWORD, 12);

    const existing = await Admin.findOne({ email: EMAIL });
    if (existing) {
      existing.isSuperAdmin = true;
      existing.isActive     = true;
      existing.role         = 'admin';
      existing.password     = hashed;
      await existing.save();
      console.log(`[bootstrap] Updated existing admin: ${EMAIL} → isSuperAdmin=true isActive=true`);
    } else {
      await Admin.create({
        name:        'System Administrator',
        email:       EMAIL,
        password:    hashed,
        role:        'admin',
        isSuperAdmin: true,
        isActive:    true,
      });
      console.log(`[bootstrap] Created super-admin: ${EMAIL}`);
    }

    await mongoose.disconnect();
    console.log('[bootstrap] Done.');
    process.exit(0);
  } catch (err) {
    console.error('[bootstrap] FAILED:', err.message);
    process.exit(1);
  }
}

run();
