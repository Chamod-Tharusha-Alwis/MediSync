const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

if (!process.env.ENCRYPTION_KEY) {
  throw new Error('FATAL: ENCRYPTION_KEY environment variable is required.');
}

global.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
global.ENCRYPTION_KEYS = { '1': process.env.ENCRYPTION_KEY };
global.ACTIVE_KEY_VERSION = 1;

const mongoose = require('mongoose');
const {
  TEST_DB_NAME,
  installDestructiveOpGuards,
  connectAutomatedTestDB
} = require('../config/dbGuard');

installDestructiveOpGuards();

const Admin = require('../models/Admin');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const Hospital = require('../models/Hospital');
const Pharmacy = require('../models/Pharmacy');
const PharmacyStaff = require('../models/PharmacyStaff');
const Consultation = require('../models/Consultation');
const Prescription = require('../models/Prescription');
const Dispensing = require('../models/Dispensing');
const LabTest = require('../models/LabTest');
const OutbreakAlert = require('../models/OutbreakAlert');
const BroadcastMessage = require('../models/BroadcastMessage');
const Drug = require('../models/Drug');
const ICDCode = require('../models/ICDCode');

const DATASET_VERSION = 'MEDISYNC_UNIV_DEMO_V2';
const DEMO_META = {
  isDemoData: true,
  isSynthetic: true,
  datasetVersion: DATASET_VERSION,
  demoNotice: 'SYNTHETIC_UNIVERSITY_DEMONSTRATION_RECORD'
};

const nicHash = (nic) => crypto.createHash('sha256').update(String(nic).trim()).digest('hex');

/**
 * Ensures we never overwrite a non-demo record if one ever exists in the target DB.
 */
function assertSafeToUpdateDemoDoc(existingDoc, entityLabel, identifier) {
  if (!existingDoc) return;
  const raw = existingDoc.toObject ? existingDoc.toObject() : existingDoc;
  if (!raw.isDemoData && !raw.isSynthetic) {
    throw new Error(
      `[SAFEGUARD] Refusing to overwrite existing non-demo ${entityLabel} record (${identifier}).`
    );
  }
}

async function seedUniversityDemoDataset({
  includeReferenceCatalogues = true,
  includeSurveillanceSeries = true,
  disconnectWhenDone = true
} = {}) {
  const args = process.argv.slice(2);
  const cliTargetArg = args.find((a) => a.startsWith('--target-db='));
  const resolvedTargetDb = cliTargetArg ? cliTargetArg.split('=')[1] : TEST_DB_NAME;

  if (resolvedTargetDb !== TEST_DB_NAME) {
    throw new Error(
      `[SAFEGUARD] IR-03 university demo seeding is restricted exclusively to "${TEST_DB_NAME}" via MONGO_URI_TEST (requested "${resolvedTargetDb}").`
    );
  }

  let authVerification = null;
  if (mongoose.connection.readyState !== 1) {
    authVerification = await connectAutomatedTestDB({
      testUri: process.env.MONGO_URI_TEST,
      prodUri: process.env.MONGO_URI
    });
  }

  if (mongoose.connection.name !== TEST_DB_NAME) {
    throw new Error(
      `[SAFEGUARD] Connected database "${mongoose.connection.name}" does not match required "${TEST_DB_NAME}".`
    );
  }

  const demoPasswordPlain = process.env.SEED_TEST_PASSWORD || 'MediSyncDemo#2026!';
  const passwordHash = await bcrypt.hash(demoPasswordPlain, 10);

  const summary = {
    database: mongoose.connection.name,
    authenticatedRoles: authVerification ? authVerification.authenticatedRoles : [],
    datasetVersion: DATASET_VERSION,
    admins: 0,
    hospitals: 0,
    pharmacies: 0,
    pharmacyStaff: 0,
    doctors: 0,
    patients: 0,
    clinicalConsultations: 0,
    surveillanceConsultations: 0,
    totalConsultations: 0,
    clinicalPrescriptions: 0,
    surveillancePrescriptions: 0,
    totalPrescriptions: 0,
    clinicalDispensings: 0,
    surveillanceDispensings: 0,
    totalDispensings: 0,
    labTests: 0,
    outbreakAlerts: 0,
    broadcastMessages: 0,
    drugs: 0,
    icdCodes: 0
  };

  // ── 1. Reference Catalogues (Drugs + ICD-10) via Idempotent $setOnInsert ──
  if (includeReferenceCatalogues) {
    const drugsPath = path.resolve(__dirname, '../../../ml-engine/data/drugs_clean.json');
    const icdPath = path.resolve(__dirname, '../../../ml-engine/data/icd10_clean.json');
    const manifestPath = path.resolve(__dirname, '../../../scratch/rollback_manifests/test_drugs_seed_manifest.json');

    if (fs.existsSync(drugsPath)) {
      const drugsData = JSON.parse(fs.readFileSync(drugsPath, 'utf8'));
      const manifestIdMap = new Map();
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          if (Array.isArray(manifest.insertedNames) && Array.isArray(manifest.insertedIds)) {
            manifest.insertedNames.forEach((name, idx) => {
              if (name && manifest.insertedIds[idx]) {
                manifestIdMap.set(name, new mongoose.Types.ObjectId(manifest.insertedIds[idx]));
              }
            });
          }
        } catch (_) {}
      }

      const fixedTimestamp = new Date('2026-10-01T00:00:00.000Z');
      const drugOps = drugsData
        .filter((d) => d && d.name)
        .map((d) => {
          const setOnInsert = {
            name: d.name,
            brand: d.brand || '',
            genericName: d.genericName || '',
            category: d.category || 'General',
            commonDosages: Array.isArray(d.commonDosages) ? d.commonDosages : [],
            ...DEMO_META,
            createdAt: fixedTimestamp,
            updatedAt: fixedTimestamp
          };
          const mappedId = manifestIdMap.get(d.name);
          if (mappedId) {
            setOnInsert._id = mappedId;
          }
          return {
            updateOne: {
              filter: { name: d.name },
              update: { $setOnInsert: setOnInsert },
              upsert: true
            }
          };
        });

      if (drugOps.length > 0) {
        await Drug.collection.bulkWrite(drugOps, { ordered: false });
      }
      summary.drugs = await Drug.countDocuments();
    }

    if (fs.existsSync(icdPath)) {
      const icdData = JSON.parse(fs.readFileSync(icdPath, 'utf8'));
      const icdOps = icdData
        .filter((c) => c && c.code)
        .map((c) => ({
          updateOne: {
            filter: { code: c.code },
            update: {
              $setOnInsert: {
                code: c.code,
                description: c.description || '',
                category: c.category || 'General',
                ...DEMO_META
              }
            },
            upsert: true
          }
        }));
      if (icdOps.length > 0) {
        await ICDCode.collection.bulkWrite(icdOps, { ordered: false });
      }
      summary.icdCodes = await ICDCode.countDocuments();
    }
  }

  // ── 2. Admins (Synthetic QA Identities Only) ─────────────────────────────
  const adminSpecs = [
    {
      fullName: 'Super Admin (University Demo)',
      name: 'SuperAdminDemo',
      email: 'superadmin@demo.medisync.local',
      role: 'admin',
      isSuperAdmin: true,
      isActive: true
    },
    {
      fullName: 'Operations Admin (University Demo)',
      name: 'OpsAdminDemo',
      email: 'opsadmin@demo.medisync.local',
      role: 'admin',
      isSuperAdmin: false,
      isActive: true
    }
  ];

  const seededAdmins = [];
  for (const spec of adminSpecs) {
    let admin = await Admin.collection.findOne({ email: spec.email });
    if (admin) {
      assertSafeToUpdateDemoDoc(admin, 'Admin', spec.email);
    } else {
      const created = await Admin.create({ ...spec, password: passwordHash });
      admin = created.toObject();
    }
    await Admin.collection.updateOne(
      { _id: admin._id },
      { $set: { ...DEMO_META, isSuperAdmin: spec.isSuperAdmin, isActive: true } }
    );
    seededAdmins.push(admin);
    summary.admins += 1;
  }

  // ── 3. Hospitals (Role: hospital_admin) ──────────────────────────────────
  const hospitalSpecs = [
    {
      name: 'General Hospital Colombo (Demo)',
      type: 'government',
      district: 'Colombo',
      address: 'Regent Street, Colombo 08 (Synthetic Demo)',
      regNo: 'HOSP-DEMO-001',
      email: 'colombo.hospital@demo.medisync.local',
      isVerified: true,
      isActive: true
    },
    {
      name: 'Ayu Arana Care Private Hospital (Demo)',
      type: 'private',
      district: 'Colombo',
      address: '145 Baseline Road, Colombo 09 (Synthetic Demo)',
      regNo: 'HOSP-DEMO-002',
      email: 'ayuarana.hospital@demo.medisync.local',
      isVerified: true,
      isActive: true
    },
    {
      name: 'Kandy Teaching Hospital (Demo)',
      type: 'government',
      district: 'Kandy',
      address: 'William Gopallawa Mawatha, Kandy (Synthetic Demo)',
      regNo: 'HOSP-DEMO-003',
      email: 'kandy.hospital@demo.medisync.local',
      isVerified: true,
      isActive: true
    }
  ];

  const seededHospitals = [];
  for (const spec of hospitalSpecs) {
    let hosp = await Hospital.collection.findOne({ $or: [{ regNo: spec.regNo }, { email: spec.email }] });
    if (hosp) {
      assertSafeToUpdateDemoDoc(hosp, 'Hospital', spec.regNo);
    } else {
      const created = await Hospital.create({ ...spec, password: passwordHash });
      hosp = created.toObject();
    }
    await Hospital.collection.updateOne({ _id: hosp._id }, { $set: DEMO_META });
    seededHospitals.push(hosp);
    summary.hospitals += 1;
  }

  // ── 4. Pharmacies & PharmacyStaff (Roles: pharmacy_admin, pharmacist, assistant) ──
  const pharmacySpecs = [
    {
      name: 'HealthCare Pharmacy Colombo (Demo)',
      district: 'Colombo',
      regNo: 'PH-DEMO-001',
      address: '88 Union Place, Colombo 02 (Synthetic Demo)',
      staff: [
        {
          fullName: 'Chief Pharmacist (Demo)',
          email: 'pharmacy.admin@demo.medisync.local',
          role: 'pharmacy_admin'
        },
        {
          fullName: 'Dispensing Assistant (Demo)',
          email: 'pharmacy.assistant@demo.medisync.local',
          role: 'assistant'
        }
      ]
    },
    {
      name: 'Central City Pharmacy Kandy (Demo)',
      district: 'Kandy',
      regNo: 'PH-DEMO-002',
      address: '21 Peradeniya Road, Kandy (Synthetic Demo)',
      staff: [
        {
          fullName: 'Senior Pharmacist Kandy (Demo)',
          email: 'kandy.pharmacist@demo.medisync.local',
          role: 'pharmacist'
        }
      ]
    }
  ];

  const seededPharmacies = [];
  const seededPharmacyStaff = [];
  for (const spec of pharmacySpecs) {
    let pharm = await Pharmacy.collection.findOne({ regNo: spec.regNo });
    if (pharm) {
      assertSafeToUpdateDemoDoc(pharm, 'Pharmacy', spec.regNo);
    } else {
      const created = await Pharmacy.create({
        name: spec.name,
        district: spec.district,
        regNo: spec.regNo,
        address: spec.address,
        inventory: [
          { drugName: 'Paracetamol 500mg', currentStock: 480, reorderLevel: 150, unit: 'tablets' },
          { drugName: 'Amoxicillin 500mg', currentStock: 260, reorderLevel: 80, unit: 'capsules' },
          { drugName: 'Metformin 500mg', currentStock: 390, reorderLevel: 100, unit: 'tablets' },
          { drugName: 'Salbutamol 4mg', currentStock: 75, reorderLevel: 30, unit: 'inhalers' },
          { drugName: 'Losartan 50mg', currentStock: 310, reorderLevel: 90, unit: 'tablets' }
        ]
      });
      pharm = created.toObject();
    }
    await Pharmacy.collection.updateOne({ _id: pharm._id }, { $set: DEMO_META });
    seededPharmacies.push(pharm);
    summary.pharmacies += 1;

    for (const stSpec of spec.staff) {
      let staff = await PharmacyStaff.collection.findOne({ email: stSpec.email });
      if (staff) {
        assertSafeToUpdateDemoDoc(staff, 'PharmacyStaff', stSpec.email);
      } else {
        const createdStaff = await PharmacyStaff.create({
          pharmacyId: pharm._id,
          fullName: stSpec.fullName,
          email: stSpec.email,
          password: passwordHash,
          role: stSpec.role,
          mustChangePassword: false,
          isActive: true
        });
        staff = createdStaff.toObject();
      }
      await PharmacyStaff.collection.updateOne({ _id: staff._id }, { $set: DEMO_META });
      seededPharmacyStaff.push(staff);
      summary.pharmacyStaff += 1;
    }
  }

  // ── 5. Doctors (Role: doctor — AES-256 Encrypted licenseNo & phone) ──────
  const doctorSpecs = [
    {
      doctorId: 'DR-DEMO-101',
      fullName: 'Dr. Arjuna Silva (Demo)',
      email: 'dr.silva@demo.medisync.local',
      specialization: 'Cardiologist',
      licenseNo: 'SLMC-DEMO-10101',
      phone: '0710000101',
      hospitalType: 'Government',
      hospitals: [seededHospitals[0]._id]
    },
    {
      doctorId: 'DR-DEMO-102',
      fullName: 'Dr. Kavindi Perera (Demo)',
      email: 'dr.perera@demo.medisync.local',
      specialization: 'General Physician',
      licenseNo: 'SLMC-DEMO-10102',
      phone: '0710000102',
      hospitalType: 'Government',
      hospitals: [seededHospitals[0]._id, seededHospitals[2]._id]
    },
    {
      doctorId: 'DR-DEMO-103',
      fullName: 'Dr. Nuwan Fernando (Demo)',
      email: 'dr.fernando@demo.medisync.local',
      specialization: 'Infectious Diseases',
      licenseNo: 'SLMC-DEMO-10103',
      phone: '0710000103',
      hospitalType: 'Private',
      hospitals: [seededHospitals[1]._id]
    },
    {
      doctorId: 'DR-DEMO-104',
      fullName: 'Dr. Sanduni Jayawardena (Demo)',
      email: 'dr.jayawardena@demo.medisync.local',
      specialization: 'Pediatrics',
      licenseNo: 'SLMC-DEMO-10104',
      phone: '0710000104',
      hospitalType: 'Government',
      hospitals: [seededHospitals[2]._id]
    },
    {
      doctorId: 'DR-DEMO-105',
      fullName: 'Dr. Mahela Rajapaksa (Demo)',
      email: 'dr.rajapaksa@demo.medisync.local',
      specialization: 'Respiratory Medicine',
      licenseNo: 'SLMC-DEMO-10105',
      phone: '0710000105',
      hospitalType: 'Private',
      hospitals: [seededHospitals[1]._id]
    }
  ];

  const seededDoctors = [];
  for (const spec of doctorSpecs) {
    let doc = await Doctor.collection.findOne({ $or: [{ doctorId: spec.doctorId }, { email: spec.email }] });
    if (doc) {
      assertSafeToUpdateDemoDoc(doc, 'Doctor', spec.doctorId);
    } else {
      const created = await Doctor.create({
        ...spec,
        password: passwordHash,
        role: 'doctor',
        isVerified: true,
        isActive: true,
        isSuspended: false,
        twoFactorEnabled: false
      });
      doc = created.toObject();
    }
    await Doctor.collection.updateOne(
      { _id: doc._id },
      {
        $set: {
          ...DEMO_META,
          isDemoAccount: true,
          verificationSource: 'UNIVERSITY_DEMO_FIXTURE',
          isVerified: true,
          isActive: true,
          isSuspended: false
        }
      }
    );
    seededDoctors.push(doc);
    summary.doctors += 1;
  }

  // ── 6. Patients (Role: patient — AES-256 Encrypted PII + SHA-256 Blind Index) ──
  const patientSpecs = [
    {
      nic: '999000001V',
      fullName: 'Kamal Perera (Demo Patient)',
      email: 'kamal.patient@demo.medisync.local',
      dateOfBirth: new Date('1990-04-12'),
      gender: 'Male',
      district: 'Colombo',
      bloodGroup: 'O+',
      contactInfo: '0770000001',
      address: '10 Galle Road, Colombo 03 (Synthetic Demo)',
      allergies: ['Penicillin'],
      chronicConditions: ['Hypertension']
    },
    {
      nic: '999000002V',
      fullName: 'Nimali Fernando (Demo Patient)',
      email: 'nimali.patient@demo.medisync.local',
      dateOfBirth: new Date('1985-08-22'),
      gender: 'Female',
      district: 'Kandy',
      bloodGroup: 'A+',
      contactInfo: '0770000002',
      address: '45 Temple Street, Kandy (Synthetic Demo)',
      allergies: [],
      chronicConditions: []
    },
    {
      nic: '999000003V',
      fullName: 'Ruwan Jayawardena (Demo Patient)',
      email: 'ruwan.patient@demo.medisync.local',
      dateOfBirth: new Date('1978-11-05'),
      gender: 'Male',
      district: 'Galle',
      bloodGroup: 'B+',
      contactInfo: '0770000003',
      address: '18 Wakwella Road, Galle (Synthetic Demo)',
      allergies: ['Aspirin'],
      chronicConditions: ['Asthma']
    },
    {
      nic: '999000004V',
      fullName: 'Dilani Silva (Demo Patient)',
      email: 'dilani.patient@demo.medisync.local',
      dateOfBirth: new Date('1996-02-19'),
      gender: 'Female',
      district: 'Matara',
      bloodGroup: 'AB+',
      contactInfo: '0770000004',
      address: '72 Rahula Road, Matara (Synthetic Demo)',
      allergies: [],
      chronicConditions: ['Type 2 Diabetes']
    },
    {
      nic: '999000005V',
      fullName: 'Suresh Bandara (Demo Patient)',
      email: 'suresh.patient@demo.medisync.local',
      dateOfBirth: new Date('2001-06-30'),
      gender: 'Male',
      district: 'Jaffna',
      bloodGroup: 'O-',
      contactInfo: '0770000005',
      address: '33 Hospital Road, Jaffna (Synthetic Demo)',
      allergies: ['Sulfa Drugs'],
      chronicConditions: []
    }
  ];

  const seededPatients = [];
  for (const spec of patientSpecs) {
    const bi = nicHash(spec.nic);
    let pat = await Patient.collection.findOne({ $or: [{ email: spec.email }, { patientNic_bi: bi }] });
    if (pat) {
      assertSafeToUpdateDemoDoc(pat, 'Patient', spec.email);
    } else {
      const created = await Patient.create({
        ...spec,
        password: passwordHash
      });
      pat = created.toObject();
    }
    await Patient.collection.updateOne(
      { _id: pat._id },
      { $set: { ...DEMO_META, patientNic_bi: bi } }
    );
    pat._plainNic = spec.nic;
    pat._plainName = spec.fullName;
    pat._plainEmail = spec.email;
    seededPatients.push(pat);
    summary.patients += 1;
  }

  // ── 7. Referentially Linked Clinical Chain (Consultations -> Prescriptions -> Dispensings -> LabTests) ──
  const baseRefTime = new Date('2026-10-10T09:00:00.000Z').getTime();
  const clinicalScenarios = [
    {
      consultationId: 'CON-DEMO-CLIN-001',
      prescriptionId: 'RX-DEMO-CLIN-001',
      receiptNumber: 'REC-DEMO-CLIN-001',
      labTestId: 'LT-DEMO-20261010-0001',
      patientIdx: 0,
      doctorIdx: 0,
      hospitalIdx: 0,
      pharmacyIdx: 0,
      staffIdx: 0,
      diagnosis: 'Essential Hypertension (I10)',
      icdCode: 'I10',
      district: 'Colombo',
      symptoms: ['Headache', 'Dizziness', 'Elevated Blood Pressure'],
      notes: '[SYNTHETIC DEMO] BP 150/95 mmHg. Initiated antihypertensive regimen.',
      drugName: 'Losartan 50mg',
      dosage: '50mg',
      frequency: 'Once daily',
      durationDays: 30,
      quantity: 30,
      labTestName: 'Lipid Profile & Fasting Blood Glucose',
      labCategory: 'Biochemistry',
      labStatus: 'report_ready',
      daysAgo: 5
    },
    {
      consultationId: 'CON-DEMO-CLIN-002',
      prescriptionId: 'RX-DEMO-CLIN-002',
      receiptNumber: 'REC-DEMO-CLIN-002',
      labTestId: 'LT-DEMO-20261010-0002',
      patientIdx: 1,
      doctorIdx: 1,
      hospitalIdx: 2,
      pharmacyIdx: 1,
      staffIdx: 2,
      diagnosis: 'Dengue Fever without Warning Signs (A90)',
      icdCode: 'A90',
      district: 'Kandy',
      symptoms: ['High Fever', 'Retro-orbital Pain', 'Myalgia'],
      notes: '[SYNTHETIC DEMO] Day 3 fever. Ordered NS1 antigen and serial FBC.',
      drugName: 'Paracetamol 500mg',
      dosage: '500mg',
      frequency: 'Every 6 hours PRN',
      durationDays: 5,
      quantity: 20,
      labTestName: 'Full Blood Count (FBC) & Dengue NS1 Antigen',
      labCategory: 'Haematology',
      labStatus: 'sample_collected',
      daysAgo: 4
    },
    {
      consultationId: 'CON-DEMO-CLIN-003',
      prescriptionId: 'RX-DEMO-CLIN-003',
      receiptNumber: 'REC-DEMO-CLIN-003',
      labTestId: 'LT-DEMO-20261010-0003',
      patientIdx: 2,
      doctorIdx: 4,
      hospitalIdx: 1,
      pharmacyIdx: 0,
      staffIdx: 1,
      diagnosis: 'Acute Bronchitis (J20.9)',
      icdCode: 'J20.9',
      district: 'Galle',
      symptoms: ['Productive Cough', 'Mild Wheezing', 'Low-grade Fever'],
      notes: '[SYNTHETIC DEMO] Bilateral rhonchi on auscultation.',
      drugName: 'Salbutamol 4mg',
      dosage: '4mg',
      frequency: 'Three times daily',
      durationDays: 5,
      quantity: 15,
      labTestName: 'C-Reactive Protein (CRP)',
      labCategory: 'Biochemistry',
      labStatus: 'pending',
      daysAgo: 3
    },
    {
      consultationId: 'CON-DEMO-CLIN-004',
      prescriptionId: 'RX-DEMO-CLIN-004',
      receiptNumber: 'REC-DEMO-CLIN-004',
      labTestId: 'LT-DEMO-20261010-0004',
      patientIdx: 3,
      doctorIdx: 2,
      hospitalIdx: 1,
      pharmacyIdx: 0,
      staffIdx: 0,
      diagnosis: 'Type 2 Diabetes Mellitus (E11.9)',
      icdCode: 'E11.9',
      district: 'Matara',
      symptoms: ['Polydipsia', 'Fatigue'],
      notes: '[SYNTHETIC DEMO] Routine glycemic review and HbA1c monitoring.',
      drugName: 'Metformin 500mg',
      dosage: '500mg',
      frequency: 'Twice daily',
      durationDays: 30,
      quantity: 60,
      labTestName: 'HbA1c (Glycated Haemoglobin)',
      labCategory: 'Biochemistry',
      labStatus: 'Approved',
      daysAgo: 2
    },
    {
      consultationId: 'CON-DEMO-CLIN-005',
      prescriptionId: 'RX-DEMO-CLIN-005',
      receiptNumber: 'REC-DEMO-CLIN-005',
      labTestId: 'LT-DEMO-20261010-0005',
      patientIdx: 4,
      doctorIdx: 3,
      hospitalIdx: 2,
      pharmacyIdx: 1,
      staffIdx: 2,
      diagnosis: 'Bacterial Pharyngitis (J02.0)',
      icdCode: 'J02.0',
      district: 'Jaffna',
      symptoms: ['Sore Throat', 'Fever', 'Cervical Lymphadenopathy'],
      notes: '[SYNTHETIC DEMO] Tonsillar exudate noted; prescribed 5-day antibiotic course.',
      drugName: 'Amoxicillin 500mg',
      dosage: '500mg',
      frequency: 'Three times daily',
      durationDays: 5,
      quantity: 15,
      labTestName: 'Throat Swab Culture & Sensitivity',
      labCategory: 'Microbiology',
      labStatus: 'processing',
      daysAgo: 1
    }
  ];

  for (const sc of clinicalScenarios) {
    const pat = seededPatients[sc.patientIdx];
    const doc = seededDoctors[sc.doctorIdx];
    const hosp = seededHospitals[sc.hospitalIdx];
    const pharm = seededPharmacies[sc.pharmacyIdx];
    const staff = seededPharmacyStaff[sc.staffIdx];
    const plainNic = pat._plainNic;
    const bi = nicHash(plainNic);
    const eventTime = new Date(baseRefTime - sc.daysAgo * 24 * 60 * 60 * 1000);

    // 7a. Consultation
    let con = await Consultation.collection.findOne({ consultationId: sc.consultationId });
    if (con) {
      assertSafeToUpdateDemoDoc(con, 'Consultation', sc.consultationId);
    } else {
      const createdCon = await Consultation.create({
        consultationId: sc.consultationId,
        patientId: pat._id,
        patientNic: plainNic,
        patientNic_bi: bi,
        nicHash: bi,
        doctorId: doc._id,
        hospitalId: hosp._id,
        diagnosis: sc.diagnosis,
        icdCode: sc.icdCode,
        district: sc.district,
        symptoms: sc.symptoms,
        notes: sc.notes,
        labTests: [sc.labTestName],
        loginType: 'hospital',
        sessionHospitalId: hosp._id,
        isDemoData: true,
        isSynthetic: true,
        createdAt: eventTime,
        updatedAt: eventTime
      });
      con = createdCon.toObject();
    }
    await Consultation.collection.updateOne(
      { _id: con._id },
      { $set: { ...DEMO_META, patientNic_bi: bi, nicHash: bi } }
    );
    summary.clinicalConsultations += 1;

    // 7b. Prescription
    let rx = await Prescription.collection.findOne({ prescriptionId: sc.prescriptionId });
    if (rx) {
      assertSafeToUpdateDemoDoc(rx, 'Prescription', sc.prescriptionId);
    } else {
      const createdRx = await Prescription.create({
        prescriptionId: sc.prescriptionId,
        consultationId: con._id,
        consultationRef: sc.consultationId,
        patientId: pat._id,
        patientNic: plainNic,
        patientNic_bi: bi,
        nicHash: bi,
        doctorId: doc._id,
        hospitalId: hosp._id,
        drugName: sc.drugName,
        dosage: sc.dosage,
        frequency: sc.frequency,
        durationDays: sc.durationDays,
        instructions: '[SYNTHETIC DEMO] Take after meals.',
        medications: [{ name: sc.drugName, dosage: sc.dosage, frequency: sc.frequency }],
        status: 'dispensed',
        issuedAt: eventTime,
        dispensedAt: new Date(eventTime.getTime() + 30 * 60 * 1000),
        dispensedBy: pharm._id,
        dispensedByPharmacist: staff.fullName,
        dispenserStaffId: String(staff._id),
        pharmacyName: pharm.name,
        createdAt: eventTime,
        updatedAt: eventTime
      });
      rx = createdRx.toObject();
    }
    await Prescription.collection.updateOne(
      { _id: rx._id },
      { $set: { ...DEMO_META, patientNic_bi: bi, nicHash: bi } }
    );
    summary.clinicalPrescriptions += 1;

    // 7c. Dispensing
    let disp = await Dispensing.collection.findOne({ receiptNumber: sc.receiptNumber });
    if (disp) {
      assertSafeToUpdateDemoDoc(disp, 'Dispensing', sc.receiptNumber);
    } else {
      const createdDisp = await Dispensing.create({
        receiptNumber: sc.receiptNumber,
        prescriptionId: rx._id,
        pharmacyId: pharm._id,
        staffId: staff._id,
        patientNic: plainNic,
        items: [
          {
            drugName: sc.drugName,
            dosage: sc.dosage,
            quantityDispensed: sc.quantity,
            status: 'dispensed'
          }
        ],
        dispensedAt: new Date(eventTime.getTime() + 30 * 60 * 1000),
        notes: '[SYNTHETIC DEMO] Linked to demo consultation and prescription.',
        isSynthetic: true
      });
      disp = createdDisp.toObject();
    }
    await Dispensing.collection.updateOne(
      { _id: disp._id },
      { $set: { ...DEMO_META, patientNic_bi: bi } }
    );
    summary.clinicalDispensings += 1;

    // 7d. LabTest
    let lab = await LabTest.collection.findOne({ labTestId: sc.labTestId });
    if (lab) {
      assertSafeToUpdateDemoDoc(lab, 'LabTest', sc.labTestId);
    } else {
      const createdLab = await LabTest.create({
        labTestId: sc.labTestId,
        consultationId: con._id,
        consultationRef: sc.consultationId,
        patientNic: plainNic,
        patientNic_bi: bi,
        patientName: pat._plainName,
        patientEmail: pat._plainEmail,
        hospitalId: hosp._id,
        acceptedBy: hosp._id,
        referredBy: doc._id,
        testName: sc.labTestName,
        testCategory: sc.labCategory,
        urgency: 'routine',
        notes: '[SYNTHETIC DEMO] Ordered during university demo consultation.',
        status: sc.labStatus,
        statusHistory: [
          { status: sc.labStatus, changedBy: hosp._id, changedAt: eventTime, note: 'Synthetic demo seed' }
        ]
      });
      lab = createdLab.toObject();
    }
    await LabTest.collection.updateOne({ _id: lab._id }, { $set: DEMO_META });
    summary.labTests += 1;
  }

  // ── 8. Deterministic Synthetic Surveillance & Pharmacy ML Series ──────────
  if (includeSurveillanceSeries) {
    const surveillanceTiers = [
      { code: 'DENGUE-KANDY', disease: 'Dengue', district: 'Kandy', count: 8, patientIdx: 1, doctorIdx: 1, hospitalIdx: 2 },
      { code: 'CHOLERA-JAFFNA', disease: 'Cholera', district: 'Jaffna', count: 6, patientIdx: 4, doctorIdx: 3, hospitalIdx: 2 },
      { code: 'LEPTO-COLOMBO', disease: 'Leptospirosis', district: 'Colombo', count: 5, patientIdx: 0, doctorIdx: 2, hospitalIdx: 0 },
      { code: 'TYPHOID-MATARA', disease: 'Typhoid', district: 'Matara', count: 4, patientIdx: 3, doctorIdx: 2, hospitalIdx: 1 },
      { code: 'CHICKENPOX-GALLE', disease: 'Chickenpox', district: 'Galle', count: 2, patientIdx: 2, doctorIdx: 4, hospitalIdx: 1 }
    ];

    let survSeq = 0;
    for (const tier of surveillanceTiers) {
      const pat = seededPatients[tier.patientIdx];
      const doc = seededDoctors[tier.doctorIdx];
      const hosp = seededHospitals[tier.hospitalIdx];
      const bi = nicHash(pat._plainNic);

      for (let i = 1; i <= tier.count; i++) {
        survSeq += 1;
        const conId = `CON-DEMO-SURV-${String(survSeq).padStart(3, '0')}`;
        const eventDate = new Date(baseRefTime - (i % 7) * 24 * 60 * 60 * 1000);

        let existingCon = await Consultation.collection.findOne({ consultationId: conId });
        if (existingCon) {
          assertSafeToUpdateDemoDoc(existingCon, 'Consultation', conId);
        } else {
          const created = await Consultation.create({
            consultationId: conId,
            patientId: pat._id,
            patientNic: pat._plainNic,
            patientNic_bi: bi,
            nicHash: bi,
            doctorId: doc._id,
            hospitalId: hosp._id,
            diagnosis: tier.disease,
            district: tier.district,
            symptoms: ['Fever', 'Myalgia', 'Headache'],
            notes: `[SYNTHETIC SURVEILLANCE DEMO] ${tier.code} case #${i}`,
            isDemoData: true,
            isSynthetic: true,
            createdAt: eventDate,
            updatedAt: eventDate
          });
          existingCon = created.toObject();
        }
        await Consultation.collection.updateOne(
          { _id: existingCon._id },
          { $set: { ...DEMO_META, dataOrigin: 'SYNTHETIC_SURVEILLANCE_SIMULATION', patientNic_bi: bi, nicHash: bi } }
        );
        summary.surveillanceConsultations += 1;
      }
    }

    // Deterministic Pharmacy ML Demand Series (15 linked Prescriptions + 15 Dispensings)
    const mlMedications = [
      { drugName: 'Paracetamol 500mg', dosage: '500mg', qty: 20, count: 5, pharmIdx: 0, staffIdx: 0, patIdx: 0 },
      { drugName: 'Amoxicillin 500mg', dosage: '500mg', qty: 15, count: 5, pharmIdx: 1, staffIdx: 2, patIdx: 1 },
      { drugName: 'Salbutamol 4mg', dosage: '4mg', qty: 10, count: 5, pharmIdx: 0, staffIdx: 1, patIdx: 2 }
    ];

    let mlSeq = 0;
    for (const med of mlMedications) {
      const pharm = seededPharmacies[med.pharmIdx];
      const staff = seededPharmacyStaff[med.staffIdx];
      const pat = seededPatients[med.patIdx];
      const bi = nicHash(pat._plainNic);

      for (let i = 1; i <= med.count; i++) {
        mlSeq += 1;
        const rxId = `RX-DEMO-SURV-${String(mlSeq).padStart(3, '0')}`;
        const recNo = `REC-DEMO-SURV-${String(mlSeq).padStart(3, '0')}`;
        const eventDate = new Date(baseRefTime - (i % 5) * 24 * 60 * 60 * 1000);

        let rx = await Prescription.collection.findOne({ prescriptionId: rxId });
        if (rx) {
          assertSafeToUpdateDemoDoc(rx, 'Prescription', rxId);
        } else {
          const createdRx = await Prescription.create({
            prescriptionId: rxId,
            patientId: pat._id,
            patientNic: pat._plainNic,
            patientNic_bi: bi,
            nicHash: bi,
            drugName: med.drugName,
            dosage: med.dosage,
            frequency: 'Twice daily',
            durationDays: 5,
            status: 'dispensed',
            isOTC: true,
            issuedAt: eventDate,
            dispensedAt: eventDate,
            dispensedBy: pharm._id,
            createdAt: eventDate,
            updatedAt: eventDate
          });
          rx = createdRx.toObject();
        }
        await Prescription.collection.updateOne(
          { _id: rx._id },
          { $set: { ...DEMO_META, dataOrigin: 'SYNTHETIC_PHARMACY_ML_SIMULATION', patientNic_bi: bi, nicHash: bi } }
        );
        summary.surveillancePrescriptions += 1;

        let disp = await Dispensing.collection.findOne({ receiptNumber: recNo });
        if (disp) {
          assertSafeToUpdateDemoDoc(disp, 'Dispensing', recNo);
        } else {
          const createdDisp = await Dispensing.create({
            receiptNumber: recNo,
            prescriptionId: rx._id,
            pharmacyId: pharm._id,
            staffId: staff._id,
            patientNic: pat._plainNic,
            items: [
              {
                drugName: med.drugName,
                dosage: med.dosage,
                quantityDispensed: med.qty,
                status: 'dispensed'
              }
            ],
            dispensedAt: eventDate,
            notes: '[SYNTHETIC PHARMACY ML DEMO] Forecast demand simulation record.',
            isSynthetic: true
          });
          disp = createdDisp.toObject();
        }
        await Dispensing.collection.updateOne(
          { _id: disp._id },
          { $set: { ...DEMO_META, dataOrigin: 'SYNTHETIC_PHARMACY_ML_SIMULATION', patientNic_bi: bi } }
        );
        summary.surveillanceDispensings += 1;
      }
    }

    // OutbreakAlerts (2 deterministic records)
    const alertSpecs = [
      {
        disease: 'Dengue',
        location: 'Kandy',
        severity: 'Critical',
        affectedCount: 42,
        status: 'Pending',
        emailScope: 'none',
        feedbackStatus: 'unverified',
        message: '[SYNTHETIC DEMO] Elevated Dengue fever cluster simulated in Kandy district.'
      },
      {
        disease: 'Leptospirosis',
        location: 'Colombo',
        severity: 'High',
        affectedCount: 19,
        status: 'Active',
        emailScope: 'district',
        feedbackStatus: 'confirmed',
        approvedBy: seededDoctors[2]._id,
        approvedAt: new Date(baseRefTime),
        message: '[SYNTHETIC DEMO] Post-monsoon Leptospirosis anomaly simulation in Colombo.'
      }
    ];

    for (const aSpec of alertSpecs) {
      let alert = await OutbreakAlert.collection.findOne({
        disease: aSpec.disease,
        location: aSpec.location
      });
      if (alert) {
        assertSafeToUpdateDemoDoc(alert, 'OutbreakAlert', `${aSpec.disease}@${aSpec.location}`);
      } else {
        const created = await OutbreakAlert.create(aSpec);
        alert = created.toObject();
      }
      await OutbreakAlert.collection.updateOne({ _id: alert._id }, { $set: DEMO_META });
      summary.outbreakAlerts += 1;
    }

    // BroadcastMessages (2 deterministic records)
    const broadcastSpecs = [
      {
        title: '[DEMO] Kandy Dengue Surveillance Advisory',
        message: '[SYNTHETIC UNIVERSITY DEMO] Simulated Dengue fever spike in Kandy district for ML evaluation.',
        targetRole: 'all',
        targetDistrict: 'Kandy',
        sentBy: seededAdmins[0]._id
      },
      {
        title: '[DEMO] Colombo Leptospirosis Clinical Alert',
        message: '[SYNTHETIC UNIVERSITY DEMO] Simulated clinical advisory for Colombo medical officers.',
        targetRole: 'doctor',
        targetDistrict: 'Colombo',
        sentBy: seededAdmins[0]._id
      }
    ];

    for (const bSpec of broadcastSpecs) {
      let bm = await BroadcastMessage.collection.findOne({ title: bSpec.title });
      if (bm) {
        assertSafeToUpdateDemoDoc(bm, 'BroadcastMessage', bSpec.title);
      } else {
        const created = await BroadcastMessage.create(bSpec);
        bm = created.toObject();
      }
      await BroadcastMessage.collection.updateOne({ _id: bm._id }, { $set: DEMO_META });
      summary.broadcastMessages += 1;
    }
  }

  summary.totalConsultations = await Consultation.countDocuments();
  summary.totalPrescriptions = await Prescription.countDocuments();
  summary.totalDispensings = await Dispensing.countDocuments();

  if (disconnectWhenDone) {
    await mongoose.disconnect();
  }

  return summary;
}

if (require.main === module) {
  seedUniversityDemoDataset()
    .then((res) => {
      console.log('✅ University Demo Dataset Seeded Successfully:', JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ University Demo Dataset Seed Blocked/Failed:', err.message);
      process.exit(1);
    });
}

module.exports = seedUniversityDemoDataset;
