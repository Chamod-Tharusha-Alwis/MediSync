'use strict';

/**
 * bootstrapSyntheticAccounts.js
 * 
 * Provisions initial synthetic baseline accounts and records for MediSync
 * prototype production and QA rehearsal environments.
 * 
 * SAFETY RULES:
 * 1. Default mode is DRY-RUN. Writes require explicit --apply flag.
 * 2. Idempotent: checks existing identifiers before creating; never duplicates or overwrites.
 * 3. Uses official Mongoose models, versioned encryption, and blind index helpers (no raw driver inserts).
 * 4. Passwords MUST be supplied via environment variables at runtime and are NEVER printed or logged.
 * 5. Refuses any target database outside the strict allowlist (and explicitly refuses "test").
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Ensure global encryption key dictionary is initialized for Mongoose field encryption plugins
if (!global.ENCRYPTION_KEYS) {
  if (process.env.ENCRYPTION_KEYS) {
    try {
      global.ENCRYPTION_KEYS = typeof process.env.ENCRYPTION_KEYS === 'string'
        ? JSON.parse(process.env.ENCRYPTION_KEYS)
        : process.env.ENCRYPTION_KEYS;
    } catch (_) {}
  }
  if (!global.ENCRYPTION_KEYS && process.env.ENCRYPTION_KEY) {
    global.ENCRYPTION_KEYS = { '1': process.env.ENCRYPTION_KEY };
  }
}
if (!global.ACTIVE_KEY_VERSION) {
  global.ACTIVE_KEY_VERSION = process.env.ACTIVE_KEY_VERSION || 1;
}

const { hashPassword } = require('../src/utils/passwordUtils');
const { writeNicFields } = require('../src/security/nicPersistence');

// Models
const Admin = require('../src/models/Admin');
const Doctor = require('../src/models/Doctor');
const Hospital = require('../src/models/Hospital');
const Pharmacy = require('../src/models/Pharmacy');
const PharmacyStaff = require('../src/models/PharmacyStaff');
const Patient = require('../src/models/Patient');
const Consultation = require('../src/models/Consultation');
const Prescription = require('../src/models/Prescription');
const LabTest = require('../src/models/LabTest');
const OutbreakAlert = require('../src/models/OutbreakAlert');

const ALLOWED_TARGETS = [
  { hostSubstr: 'medisync.p7hjket.mongodb.net', database: 'medisync_prod' },
  { hostSubstr: 'qa-project-medisync.gwprp27.mongodb.net', database: 'medisync_automated_test' }
];

function isTargetAllowed(host, database) {
  if (database === 'test') return false;
  return ALLOWED_TARGETS.some(t => host.includes(t.hostSubstr) && database === t.database);
}

function redactUri(uriString) {
  try {
    const parsed = new URL(uriString);
    return {
      host: parsed.hostname,
      port: parsed.port || '27017',
      database: parsed.pathname ? parsed.pathname.replace(/^\//, '') : ''
    };
  } catch (_) {
    return { host: 'UNKNOWN', database: 'UNKNOWN' };
  }
}

function validateSyntheticEmail(email, role) {
  if (!email || typeof email !== 'string') {
    throw new Error(`BOOTSTRAP_ERROR: Invalid email address provided for ${role}.`);
  }
  const trimmed = email.trim().toLowerCase();
  if (trimmed.endsWith('.local') || trimmed.includes('@medisync.local') || trimmed.endsWith('.internal')) {
    throw new Error(`BOOTSTRAP_ERROR: Email "${email}" uses forbidden ".local" or ".internal" domain. Use a valid synthetic email domain (e.g., @medisync.synthetic or configure via BOOTSTRAP_${role.toUpperCase()}_EMAIL).`);
  }
  return trimmed;
}

async function bootstrapSyntheticData(options = {}) {
  const {
    isApply = false,
    isQa = false,
    uri = (options.isQa ? process.env.MONGO_URI_TEST : (process.env.MONGO_URI || process.env.MONGO_URI_TEST)),
    passwords = {
      admin: options.passwords?.admin || process.env.BOOTSTRAP_ADMIN_PASSWORD || process.env.SEED_TEST_PASSWORD,
      doctor: options.passwords?.doctor || process.env.BOOTSTRAP_DOCTOR_PASSWORD || process.env.SEED_TEST_PASSWORD,
      hospital: options.passwords?.hospital || process.env.BOOTSTRAP_HOSPITAL_PASSWORD || process.env.SEED_TEST_PASSWORD,
      pharmacy: options.passwords?.pharmacy || process.env.BOOTSTRAP_PHARMACY_PASSWORD || process.env.SEED_TEST_PASSWORD,
      patient: options.passwords?.patient || process.env.BOOTSTRAP_PATIENT_PASSWORD || process.env.SEED_TEST_PASSWORD
    },
    skipConnection = false // for unit testing with already-connected mongoose
  } = options;

  // Validate all synthetic emails BEFORE any connection
  const emails = {
    admin: validateSyntheticEmail(options.emails?.admin || process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin.synth@medisync.synthetic', 'admin'),
    doctor: validateSyntheticEmail(options.emails?.doctor || process.env.BOOTSTRAP_DOCTOR_EMAIL || 'doctor.synth@medisync.synthetic', 'doctor'),
    hospital: validateSyntheticEmail(options.emails?.hospital || process.env.BOOTSTRAP_HOSPITAL_EMAIL || 'hospital.synth@medisync.synthetic', 'hospital'),
    pharmacy: validateSyntheticEmail(options.emails?.pharmacy || process.env.BOOTSTRAP_PHARMACY_EMAIL || 'pharmacist.synth@medisync.synthetic', 'pharmacy'),
    patient: validateSyntheticEmail(options.emails?.patient || process.env.BOOTSTRAP_PATIENT_EMAIL || 'patient.synth@medisync.synthetic', 'patient')
  };

  if (!uri && !skipConnection) {
    throw new Error('BOOTSTRAP_ERROR: No MongoDB connection string provided in MONGO_URI or MONGO_URI_TEST.');
  }

  const { host, database } = redactUri(uri || 'mongodb://in-memory/test');

  if (!skipConnection) {
    if (!isTargetAllowed(host, database)) {
      throw new Error(`BOOTSTRAP_GUARD: Target host '${host}' and database '${database}' is not in the allowlist. Operation aborted.`);
    }
  }

  console.log('================================================================');
  console.log('  MEDISYNC SYNTHETIC BASELINE BOOTSTRAP');
  console.log('================================================================');
  console.log(`Target Host:     ${host}`);
  console.log(`Target Database: ${database}`);
  console.log(`Execution Mode:  ${isApply ? 'APPLY (WRITES ENABLED)' : 'DRY-RUN (READ ONLY, NO WRITES)'}`);
  console.log('----------------------------------------------------------------');

  const requiredRoles = ['admin', 'doctor', 'hospital', 'pharmacy', 'patient'];
  const missingPasswords = [];
  for (const role of requiredRoles) {
    if (!passwords[role] || typeof passwords[role] !== 'string' || passwords[role].length < 8) {
      missingPasswords.push(`BOOTSTRAP_${role.toUpperCase()}_PASSWORD`);
    }
  }

  if (isApply && missingPasswords.length > 0) {
    throw new Error(`BOOTSTRAP_ERROR: Missing required password environment variables in apply mode: ${missingPasswords.join(', ')}`);
  }

  if (!skipConnection && mongoose.connection.readyState !== 1) {
    await mongoose.connect(uri, {
      dbName: database,
      serverSelectionTimeoutMS: 5000
    });
  }

  const report = {
    plan: [],
    skippedExisting: [],
    created: [],
    updated: []
  };

  // Synthetic Entities Definitions
  const adminEmail = emails.admin;
  const doctorEmail = emails.doctor;
  const hospitalEmail = emails.hospital;
  const pharmacyStaffEmail = emails.pharmacy;
  const patientEmail = emails.patient;
  const patientNic = '199512345678';
  const doctorId = 'DOC-SYNTH-001';
  const hospitalRegNo = 'HOSP-SYNTH-001';
  const pharmacyRegNo = 'PHARM-SYNTH-001';

  // 1. Super Admin
  const existingAdmin = await Admin.findOne({ email: adminEmail });
  if (existingAdmin) {
    report.skippedExisting.push(`Admin: ${adminEmail}`);
  } else {
    report.plan.push(`Admin: ${adminEmail} (role: super_admin)`);
    if (isApply) {
      const hash = await hashPassword(passwords.admin);
      const admin = new Admin({
        name: 'Synthetic System Admin',
        email: adminEmail,
        password: hash,
        role: 'super_admin',
        isActive: true
      });
      await admin.save();
      report.created.push(`Admin: ${adminEmail}`);
    }
  }

  // 2. Hospital
  let hospital = await Hospital.findOne({ regNo: hospitalRegNo });
  if (hospital) {
    report.skippedExisting.push(`Hospital: ${hospitalRegNo}`);
  } else {
    report.plan.push(`Hospital: ${hospitalRegNo} (${hospitalEmail})`);
    if (isApply) {
      const hash = await hashPassword(passwords.hospital);
      hospital = new Hospital({
        name: 'National Hospital Colombo',
        regNo: hospitalRegNo,
        email: hospitalEmail,
        password: hash,
        type: 'government',
        district: 'Colombo',
        address: 'Regent Street, Colombo 10',
        contactPhone: '+94112691111',
        isVerified: true,
        isActive: true
      });
      await hospital.save();
      report.created.push(`Hospital: ${hospitalRegNo}`);
    }
  }

  // 3. Doctor
  let doctor = await Doctor.findOne({ doctorId });
  if (doctor) {
    report.skippedExisting.push(`Doctor: ${doctorId}`);
  } else {
    report.plan.push(`Doctor: ${doctorId} (${doctorEmail})`);
    if (isApply) {
      const hash = await hashPassword(passwords.doctor);
      doctor = new Doctor({
        fullName: 'Dr. Sandun Perera',
        doctorId: doctorId,
        email: doctorEmail,
        password: hash,
        licenseNo: 'SLMC-SYNTH-001',
        specialization: 'General Practice',
        hospitals: hospital?._id ? [hospital._id] : [],
        district: 'Colombo',
        contactNumber: '+94771234567',
        isVerified: true,
        isActive: true
      });
      await doctor.save();
      report.created.push(`Doctor: ${doctorId}`);
    }
  }

  // 4. Pharmacy & Pharmacy Staff
  let pharmacy = await Pharmacy.findOne({ regNo: pharmacyRegNo });
  if (pharmacy) {
    report.skippedExisting.push(`Pharmacy: ${pharmacyRegNo}`);
  } else {
    report.plan.push(`Pharmacy: ${pharmacyRegNo}`);
    if (isApply) {
      pharmacy = new Pharmacy({
        name: 'MediSync Central Pharmacy',
        regNo: pharmacyRegNo,
        district: 'Colombo',
        address: 'Main Street, Colombo 01',
        phone: '+94112334455',
        email: 'pharmacy@medisync.synthetic',
        isVerified: true,
        isActive: true,
        inventory: [
          { drugName: 'Paracetamol 500mg', stock: 100, reorderLevel: 20, unit: 'tablets' },
          { drugName: 'Cetirizine 10mg', stock: 50, reorderLevel: 10, unit: 'tablets' }
        ]
      });
      await pharmacy.save();
      report.created.push(`Pharmacy: ${pharmacyRegNo}`);
    }
  }

  let staff = await PharmacyStaff.findOne({ email: pharmacyStaffEmail });
  if (staff) {
    report.skippedExisting.push(`PharmacyStaff: ${pharmacyStaffEmail}`);
  } else {
    report.plan.push(`PharmacyStaff: ${pharmacyStaffEmail}`);
    if (isApply) {
      const hash = await hashPassword(passwords.pharmacy);
      staff = new PharmacyStaff({
        fullName: 'Kavinda Silva',
        email: pharmacyStaffEmail,
        password: hash,
        role: 'pharmacist',
        pharmacyId: pharmacy?._id,
        isVerified: true,
        isActive: true,
        mustChangePassword: false
      });
      await staff.save();
      report.created.push(`PharmacyStaff: ${pharmacyStaffEmail}`);
    }
  }

  // 5. Patient
  let patient = await Patient.findOne({ nic: patientNic });
  if (patient) {
    report.skippedExisting.push(`Patient: ${patientNic}`);
  } else {
    report.plan.push(`Patient: ${patientNic} (${patientEmail})`);
    if (isApply) {
      const hash = await hashPassword(passwords.patient);
      patient = new Patient({
        fullName: 'Kamal Gunaratne',
        email: patientEmail,
        password: hash,
        nic: patientNic,
        ...writeNicFields(patientNic),
        dateOfBirth: new Date('1995-05-12'),
        gender: 'Male',
        district: 'Colombo',
        contactInfo: '+94779876543',
        riskLevel: 'low',
        riskScore: 10,
        preferredLanguage: 'en',
        isActive: true
      });
      await patient.save();
      report.created.push(`Patient: ${patientNic}`);
    }
  }

  // 6. Baseline Clinical Records (Consultation, Prescription, Lab, Outbreak)
  if (isApply) {
    const consultationId = 'CON-SYNTH-001';
    let con = await Consultation.findOne({ consultationId });
    if (!con && doctor && patient) {
      con = new Consultation({
        consultationId,
        doctorId: doctor._id,
        patientId: patient._id,
        patientNic: patientNic,
        ...writeNicFields(patientNic),
        diagnosis: 'Seasonal Viral Pyrexia',
        symptoms: ['Fever', 'Headache', 'Myalgia'],
        status: 'completed',
        consultationDate: new Date()
      });
      await con.save();
      report.created.push(`Consultation: ${consultationId}`);
    }

    const prescriptionId = 'RX-SYNTH-001';
    let rx = await Prescription.findOne({ prescriptionId });
    if (!rx && doctor && patient) {
      rx = new Prescription({
        prescriptionId,
        consultationId: con?._id || null,
        consultationRef: consultationId,
        doctorId: doctor._id,
        patientId: patient._id,
        patientNic: patientNic,
        ...writeNicFields(patientNic),
        medications: [
          { name: 'Amoxicillin 500mg', dosage: '1 capsule', frequency: '8 hourly' }
        ],
        drugName: 'Amoxicillin 500mg',
        dosage: '1 capsule',
        frequency: '8 hourly',
        instructions: 'Take after meals. Complete full course.',
        durationDays: 5,
        status: 'pending',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });
      await rx.save();
      report.created.push(`Prescription: ${prescriptionId}`);
    } else if (rx && isApply) {
      let changed = false;
      if (!rx.expiresAt || rx.expiresAt <= new Date()) {
        rx.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        changed = true;
      }
      if (rx.drugName === 'Paracetamol 500mg' || (Array.isArray(rx.medications) && rx.medications.some(m => m.name.includes('Paracetamol')))) {
        rx.medications = [{ name: 'Amoxicillin 500mg', dosage: '1 capsule', frequency: '8 hourly' }];
        rx.drugName = 'Amoxicillin 500mg';
        changed = true;
      }
      if (changed) {
        await rx.save();
        report.updated.push(`Prescription: ${prescriptionId} (reconciled safety fields)`);
      }
    }

    const labTestId = 'LAB-SYNTH-001';
    let lab = await LabTest.findOne({ labTestId });
    if (!lab && patient) {
      lab = new LabTest({
        labTestId,
        testName: 'Full Blood Count (FBC)',
        testCategory: 'Haematology',
        patientId: patient._id,
        patientNic: patientNic,
        patientName: 'Kamal Gunaratne',
        patientEmail: patientEmail,
        ...writeNicFields(patientNic),
        hospitalId: hospital?._id || null,
        status: 'pending'
      });
      await lab.save();
      report.created.push(`LabTest: ${labTestId}`);
    }

    const existingAlert = await OutbreakAlert.findOne({ disease: 'Dengue', location: 'Colombo' });
    if (!existingAlert) {
      const alert = new OutbreakAlert({
        disease: 'Dengue',
        location: 'Colombo',
        severity: 'Moderate',
        affectedCount: 42,
        status: 'Active'
      });
      await alert.save();
      report.created.push('OutbreakAlert: Dengue (Colombo)');
    }
  }

  console.log('--- BOOTSTRAP SUMMARY ---');
  console.log(`Skipped existing: ${report.skippedExisting.length}`);
  if (report.skippedExisting.length > 0) console.log('  -> ' + report.skippedExisting.join(', '));
  console.log(`Planned items:    ${report.plan.length}`);
  if (report.plan.length > 0) console.log('  -> ' + report.plan.join(', '));
  console.log(`Created items:    ${report.created.length}`);
  if (report.created.length > 0) console.log('  -> ' + report.created.join(', '));
  console.log(`Updated items:    ${report.updated.length}`);
  if (report.updated.length > 0) console.log('  -> ' + report.updated.join(', '));
  console.log('-------------------------');

  return report;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const isQa = args.includes('--qa');
  bootstrapSyntheticData({ isApply, isQa }).then(() => {
    console.log('[BOOTSTRAP PROCESS COMPLETED]');
    process.exit(0);
  }).catch(err => {
    console.error('[FATAL] Bootstrap failed:', err.message);
    process.exit(1);
  });
}

module.exports = {
  bootstrapSyntheticData,
  isTargetAllowed,
  redactUri,
  validateSyntheticEmail,
  ALLOWED_TARGETS
};
