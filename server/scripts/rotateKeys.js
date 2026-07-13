require('dotenv').config();
const mongoose = require('mongoose');
const nodeVault = require('node-vault');

// Models
const Patient = require('../src/models/Patient');
const Consultation = require('../src/models/Consultation');
const Prescription = require('../src/models/Prescription');
const LabTest = require('../src/models/LabTest');
const Doctor = require('../src/models/Doctor');
const TestOrder = require('../src/models/TestOrder');
const AuditLog = require('../src/models/AuditLog');
const crypto = require('crypto');

async function initializeVault() {
  const vault = nodeVault({
    apiVersion: 'v1',
    endpoint: 'http://127.0.0.1:8200',
    token: process.env.VAULT_TOKEN,
  });

  if (!process.env.VAULT_TOKEN) {
    throw new Error('FATAL: VAULT_TOKEN environment variable is not defined.');
  }

  try {
    const keysSecret = await vault.read('secret/data/medisync/keys');
    global.ENCRYPTION_KEYS = keysSecret.data.data.versions;
    global.ACTIVE_KEY_VERSION = keysSecret.data.data.activeVersion;
    global.ENCRYPTION_KEY = global.ENCRYPTION_KEYS[global.ACTIVE_KEY_VERSION];
    console.log(`[Vault] Successfully retrieved AES encryption keys (Active version: ${global.ACTIVE_KEY_VERSION}).`);
  } catch (err) {
    console.error('[Vault] Error retrieving keys:', err.message);
    process.exit(1);
  }
}

async function migrateModel(Model, targetVersion) {
  console.log(`\nStarting migration for model: ${Model.modelName}`);
  
  // Find documents where keyVersion is missing (assumed 1) or less than targetVersion
  const query = {
    $or: [
      { keyVersion: { $lt: targetVersion } },
      { keyVersion: { $exists: false } }
    ]
  };

  const total = await Model.countDocuments(query);
  console.log(`Found ${total} documents requiring re-encryption to version ${targetVersion}.`);

  if (total === 0) return;

  const cursor = Model.find(query).cursor();
  let processed = 0;
  let errors = 0;

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    try {
      // The `post('init')` hook has already decrypted the document using its OLD key.
      
      if (Model.modelName === 'LabTest' && doc.encryptedFileKey && doc.fileIV) {
        const oldVersion = doc.keyVersion || 1;
        const oldMasterKey = global.ENCRYPTION_KEYS[oldVersion] || global.ENCRYPTION_KEY;
        const oldMasterKeyBuf = Buffer.from(oldMasterKey, 'utf-8').slice(0, 32);
        
        const cbcIvHex = doc.encryptedFileKey.substring(0, 32);
        const wrappedKeyHex = doc.encryptedFileKey.substring(32);
        const cbcIV = Buffer.from(cbcIvHex, 'hex');
        const wrappedKey = Buffer.from(wrappedKeyHex, 'hex');
        
        const keyDecipher = crypto.createDecipheriv('aes-256-cbc', oldMasterKeyBuf, cbcIV);
        keyDecipher.setAutoPadding(false);
        const fileKey = Buffer.concat([keyDecipher.update(wrappedKey), keyDecipher.final()]);
        
        const newMasterKey = global.ENCRYPTION_KEYS[targetVersion];
        const newMasterKeyBuf = Buffer.from(newMasterKey, 'utf-8').slice(0, 32);
        const newCbcIV = crypto.randomBytes(16);
        
        const keyCipher = crypto.createCipheriv('aes-256-cbc', newMasterKeyBuf, newCbcIV);
        keyCipher.setAutoPadding(false);
        const newWrappedKey = Buffer.concat([keyCipher.update(fileKey), keyCipher.final()]);
        
        doc.encryptedFileKey = newCbcIV.toString('hex') + newWrappedKey.toString('hex');
      }

      // Saving the document will trigger the `pre('save')` hook, which will:
      // 1. Update doc.keyVersion to global.ACTIVE_KEY_VERSION (targetVersion).
      // 2. Re-encrypt the fields using the NEW key.
      
      // Pass timestamps: false to preserve original updatedAt values
      await doc.save({ timestamps: false });
      
      await AuditLog.create({
        actorRole: 'System',
        action: 'KEY_ROTATION',
        accessedNic: doc.nic || doc.patientNic || 'N/A',
        timestamp: new Date()
      });

      processed++;
      
      if (processed % 100 === 0) {
        console.log(`Processed ${processed} / ${total} ${Model.modelName} documents...`);
      }
    } catch (err) {
      console.error(`Error migrating ${Model.modelName} _id ${doc._id}:`, err.message);
      errors++;
    }
  }

  console.log(`Finished ${Model.modelName}: ${processed} processed, ${errors} errors.`);
}

async function run() {
  console.log('--- Key Rotation & Migration Script ---');
  
  // 1. Initialize Vault & Globals
  await initializeVault();

  // 2. Connect to Database
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log('Connected to MongoDB.');

  const targetVersion = global.ACTIVE_KEY_VERSION;
  if (!targetVersion) {
    console.error('No ACTIVE_KEY_VERSION found in Vault.');
    process.exit(1);
  }

  // 3. Migrate All Models
  const models = [Patient, Consultation, Prescription, LabTest, Doctor, TestOrder];
  
  for (const Model of models) {
    await migrateModel(Model, targetVersion);
  }

  console.log('\n--- Migration Complete ---');
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error during migration:', err);
  process.exit(1);
});
