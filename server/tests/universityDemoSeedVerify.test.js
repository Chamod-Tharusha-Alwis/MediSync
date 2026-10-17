throw new Error('Phase 5X-B quarantine: source migrated; requires separate approval before database test execution.');

require('./helpers/qaEnvironment');
const qa = require('./helpers/ownedFixtures');

const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

global.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
global.ENCRYPTION_KEYS = { '1': process.env.ENCRYPTION_KEY };
global.ACTIVE_KEY_VERSION = 1;

const {
  TEST_DB_NAME,
  DestructiveOperationBlockedError,
  connectAutomatedTestDB
} = require('../src/config/dbGuard');

const Admin = require('../src/models/Admin');
const Doctor = require('../src/models/Doctor');
const Patient = require('../src/models/Patient');
const Hospital = require('../src/models/Hospital');
const Pharmacy = require('../src/models/Pharmacy');
const PharmacyStaff = require('../src/models/PharmacyStaff');
const Consultation = require('../src/models/Consultation');
const Prescription = require('../src/models/Prescription');
const Dispensing = require('../src/models/Dispensing');
const LabTest = require('../src/models/LabTest');
const OutbreakAlert = require('../src/models/OutbreakAlert');
const BroadcastMessage = require('../src/models/BroadcastMessage');
const Drug = require('../src/models/Drug');
const ICDCode = require('../src/models/ICDCode');

const nicHash = (nic) => crypto.createHash('sha256').update(String(nic).trim()).digest('hex');
const isCiphertext = (v) => typeof v === 'string' && (v.startsWith('v1:') || /^[0-9a-f]{32}:/i.test(v));

describe('IR-03 — Isolated Atlas Test Database (medisync_automated_test) Seed & Integrity Suite', () => {
  jest.setTimeout(30000);
  let connInfo;

  beforeAll(async () => {
    connInfo = await connectAutomatedTestDB();
    qa.verifyRuntime(connInfo);
  }, 30000);

  afterAll(async () => {
    try { await qa.cleanup(); }
    finally { if (mongoose.connection.readyState !== 0) await mongoose.disconnect(); }
  }, 15000);

  test('1. Connected exclusively to medisync_automated_test with restricted readWrite role', () => {
    expect(connInfo.dbName).toBe(TEST_DB_NAME);
    expect(mongoose.connection.name).toBe(TEST_DB_NAME);
    expect(connInfo.authenticatedRoles).toEqual([
      { role: 'readWrite', db: TEST_DB_NAME }
    ]);
  });

  test('2. Seeded collection and record counts match expected deterministic baseline', async () => {
    const expectedCounts = {
      admins: 2,
      doctors: 5,
      patients: 5,
      hospitals: 3,
      pharmacies: 2,
      pharmacystaffs: 3,
      consultations: 30,
      prescriptions: 20,
      dispensings: 20,
      labtests: 5,
      outbreakalerts: 2,
      broadcastmessages: 2,
      drugs: 3000,
      icdcodes: 71704
    };

    for (const [coll, expected] of Object.entries(expectedCounts)) {
      const actual = await mongoose.connection.db.collection(coll).countDocuments({ datasetVersion: 'MEDISYNC_UNIV_DEMO_V2' });
      expect(actual).toBe(expected);
    }
  });

  test('3. All five MediSync user roles exist with synthetic @demo.medisync.local identities and valid single-pass bcrypt hashes', async () => {
    const demoPass = process.env.SEED_TEST_PASSWORD || 'MediSyncDemo#2026!';
    const [
      superAdmin,
      opsAdmin,
      doctor,
      patient,
      hospital,
      pharmAdmin,
      pharmacist,
      pharmAssist
    ] = await Promise.all([
      Admin.findOne({ email: 'superadmin@demo.medisync.local' }),
      Admin.findOne({ email: 'opsadmin@demo.medisync.local' }),
      Doctor.findOne({ email: 'dr.silva@demo.medisync.local' }),
      Patient.findOne({ email: 'kamal.patient@demo.medisync.local' }),
      Hospital.findOne({ email: 'colombo.hospital@demo.medisync.local' }),
      PharmacyStaff.findOne({ email: 'pharmacy.admin@demo.medisync.local' }),
      PharmacyStaff.findOne({ email: 'kandy.pharmacist@demo.medisync.local' }),
      PharmacyStaff.findOne({ email: 'pharmacy.assistant@demo.medisync.local' })
    ]);

    expect(superAdmin?.role).toBe('admin');
    expect(superAdmin?.isSuperAdmin).toBe(true);
    expect(opsAdmin?.role).toBe('admin');
    expect(opsAdmin?.isSuperAdmin).toBe(false);
    expect(doctor?.role).toBe('doctor');
    expect(patient?.email).toBe('kamal.patient@demo.medisync.local');
    expect(hospital?.regNo).toBe('HOSP-DEMO-001');
    expect(pharmAdmin?.role).toBe('pharmacy_admin');
    expect(pharmacist?.role).toBe('pharmacist');
    expect(pharmAssist?.role).toBe('assistant');

    expect(await bcrypt.compare(demoPass, superAdmin.password)).toBe(true);
    expect(await bcrypt.compare(demoPass, doctor.password)).toBe(true);
    expect(await bcrypt.compare(demoPass, patient.password)).toBe(true);
    expect(await bcrypt.compare(demoPass, hospital.password)).toBe(true);
    expect(await bcrypt.compare(demoPass, pharmAdmin.password)).toBe(true);
  });

  test('4. AES-256 field encryption at rest and SHA-256 blind indexing operate accurately', async () => {
    const [rawPat, rawDoc, rawCon, rawRx, rawLab] = await Promise.all([
      Patient.collection.findOne({ email: 'kamal.patient@demo.medisync.local' }),
      Doctor.collection.findOne({ email: 'dr.silva@demo.medisync.local' }),
      Consultation.collection.findOne({ consultationId: 'CON-DEMO-CLIN-001' }),
      Prescription.collection.findOne({ prescriptionId: 'RX-DEMO-CLIN-001' }),
      LabTest.collection.findOne({ labTestId: 'LT-DEMO-20261010-0001' })
    ]);

    expect(isCiphertext(rawPat.fullName)).toBe(true);
    expect(isCiphertext(rawPat.contactInfo)).toBe(true);
    expect(rawPat.patientNic_bi).toBe(nicHash('999000001V'));
    expect(isCiphertext(rawDoc.licenseNo)).toBe(true);
    expect(isCiphertext(rawCon.patientNic)).toBe(true);
    expect(isCiphertext(rawCon.diagnosis)).toBe(true);
    expect(isCiphertext(rawRx.patientNic)).toBe(true);
    expect(isCiphertext(rawRx.drugName)).toBe(true);
    expect(isCiphertext(rawLab.patientNic)).toBe(true);
    expect(isCiphertext(rawLab.patientName)).toBe(true);

    const [decPat, decCon, decRx, decLab] = await Promise.all([
      Patient.findOne({ patientNic_bi: nicHash('999000001V') }),
      Consultation.findOne({ consultationId: 'CON-DEMO-CLIN-001' }),
      Prescription.findOne({ prescriptionId: 'RX-DEMO-CLIN-001' }),
      LabTest.findOne({ labTestId: 'LT-DEMO-20261010-0001' })
    ]);

    expect(decPat.fullName).toBe('Kamal Perera (Demo Patient)');
    expect(decCon.diagnosis).toBe('Essential Hypertension (I10)');
    expect(decRx.drugName).toBe('Losartan 50mg');
    expect(decLab.patientName).toBe('Kamal Perera (Demo Patient)');
  });

  test('5. Referential integrity holds across Doctor, Patient, Hospital, Pharmacy, Consultation, Prescription, Dispensing, and LabTest', async () => {
    const [
      clinConsults,
      clinRxs,
      clinDisps,
      clinLabs,
      patients,
      doctors,
      hospitals,
      pharmacies,
      staffList,
      firstDrug,
      lastDrug
    ] = await Promise.all([
      Consultation.find({ consultationId: /^CON-DEMO-CLIN-/ }),
      Prescription.find({ prescriptionId: /^RX-DEMO-CLIN-/ }),
      Dispensing.find({ receiptNumber: /^REC-DEMO-CLIN-/ }),
      LabTest.find({ labTestId: /^LT-DEMO-/ }),
      Patient.collection.find({}).toArray(),
      Doctor.collection.find({}).toArray(),
      Hospital.collection.find({}).toArray(),
      Pharmacy.collection.find({}).toArray(),
      PharmacyStaff.collection.find({}).toArray(),
      Drug.exists({ _id: '6acb4f7b5210a79f7aedce36' }),
      Drug.exists({ _id: '6acb4f975210a79f7aedd9ee' })
    ]);

    expect(clinConsults).toHaveLength(5);
    expect(clinRxs).toHaveLength(5);
    expect(clinDisps).toHaveLength(5);
    expect(clinLabs).toHaveLength(5);

    const patIdSet = new Set(patients.map((p) => String(p._id)));
    const patBiSet = new Set(patients.map((p) => p.patientNic_bi));
    const docIdSet = new Set(doctors.map((d) => String(d._id)));
    const hospIdSet = new Set(hospitals.map((h) => String(h._id)));
    const pharmIdSet = new Set(pharmacies.map((ph) => String(ph._id)));
    const staffIdSet = new Set(staffList.map((st) => String(st._id)));
    const conIdSet = new Set(clinConsults.map((c) => String(c._id)));
    const rxIdSet = new Set(clinRxs.map((r) => String(r._id)));

    for (const c of clinConsults) {
      expect(patIdSet.has(String(c.patientId))).toBe(true);
      expect(docIdSet.has(String(c.doctorId))).toBe(true);
      expect(hospIdSet.has(String(c.hospitalId))).toBe(true);
    }

    for (const r of clinRxs) {
      expect(conIdSet.has(String(r.consultationId))).toBe(true);
      expect(patIdSet.has(String(r.patientId))).toBe(true);
      expect(docIdSet.has(String(r.doctorId))).toBe(true);
      expect(pharmIdSet.has(String(r.dispensedBy))).toBe(true);
    }

    for (const dp of clinDisps) {
      expect(rxIdSet.has(String(dp.prescriptionId))).toBe(true);
      expect(pharmIdSet.has(String(dp.pharmacyId))).toBe(true);
      expect(staffIdSet.has(String(dp.staffId))).toBe(true);
    }

    for (const l of clinLabs) {
      expect(conIdSet.has(String(l.consultationId))).toBe(true);
      expect(docIdSet.has(String(l.referredBy))).toBe(true);
      expect(hospIdSet.has(String(l.hospitalId))).toBe(true);
      expect(patBiSet.has(l.patientNic_bi)).toBe(true);
    }

    expect(firstDrug).toBeTruthy();
    expect(lastDrug).toBeTruthy();
  });

  test('6. Every university baseline document across all 14 collections is labeled synthetic', async () => {
    const collections = [
      'admins', 'doctors', 'patients', 'hospitals', 'pharmacies', 'pharmacystaffs',
      'consultations', 'prescriptions', 'dispensings', 'labtests',
      'outbreakalerts', 'broadcastmessages', 'drugs', 'icdcodes'
    ];

    for (const c of collections) {
      const unlabeledCount = await mongoose.connection.db.collection(c).countDocuments({
        datasetVersion: 'MEDISYNC_UNIV_DEMO_V2',
        $or: [
          { isDemoData: { $ne: true } },
          { isSynthetic: { $ne: true } }
        ]
      });
      expect(unlabeledCount).toBe(0);
    }
  });

  test('7. Owned-fixture duplicate prevention leaves baseline and unrelated collections unchanged', async () => {
    const source = await Consultation.collection.findOne({ consultationId: 'CON-DEMO-CLIN-001', datasetVersion: 'MEDISYNC_UNIV_DEMO_V2' });
    expect(source).toBeTruthy();
    expect(source.isSynthetic).toBe(true);
    const fixtureId = new mongoose.Types.ObjectId();
    const consultationId = `CON-QA-${qa.owner}`;
    const owned = { ...source, _id: fixtureId, consultationId, datasetVersion: qa.owner,
      isSynthetic: true, isDemoData: true, createdAt: new Date(), updatedAt: new Date() };
    await Consultation.collection.insertOne(owned);
    const beforeConsults = await Consultation.countDocuments();
    const beforeRxs = await Prescription.countDocuments();
    const beforeDisps = await Dispensing.countDocuments();
    const insertOnce = async () => {
      const existing = await Consultation.collection.findOne({ consultationId, datasetVersion: qa.owner });
      if (!existing) await Consultation.collection.insertOne({ ...owned, _id: new mongoose.Types.ObjectId() });
    };
    await insertOnce();
    expect(await Consultation.collection.countDocuments({ consultationId, datasetVersion: qa.owner })).toBe(1);
    expect(await Consultation.countDocuments()).toBe(beforeConsults);
    expect(await Prescription.countDocuments()).toBe(beforeRxs);
    expect(await Dispensing.countDocuments()).toBe(beforeDisps);
  }, 30000);

  test('8. Runtime destructive operation guards block dropDatabase, dropCollection, and blanket deleteMany({})', async () => {
    // Exercise local guard rejection on an unconnected object. Never target the
    // authenticated Atlas connection or dispatch a destructive database command.
    const detached = mongoose.createConnection();
    expect(detached.readyState).toBe(0);
    await expect(detached.dropDatabase()).rejects.toThrow(DestructiveOperationBlockedError);
    await expect(detached.dropCollection('patients')).rejects.toThrow(DestructiveOperationBlockedError);
    expect(() => Patient.deleteMany({})).toThrow(DestructiveOperationBlockedError);
  });
});
