/**
 * MEDISYNC — IR-04: Isolated Backend Application & Integration Test Suite
 *
 * Target Database : medisync_automated_test (MongoDB Atlas Free M0 ONLY)
 * Production DB   : test (NEVER connected to, read, written, or probed)
 *
 * Covers all 11 IR-04 Phase 3 Priorities using synthetic QA fixtures and
 * verifies 100% preservation of the IR-03 MEDISYNC_UNIV_DEMO_V2 dataset.
 */

throw new Error('Phase 5X-B quarantine: source migration requires separate execution approval and final safety review.');

require('./helpers/qaEnvironment');
const qa = require('./helpers/ownedFixtures');
const irSafety = require('./helpers/ir04FixtureSafety');
const { IR04_COLLECTIONS } = irSafety;
qa.configureSafety({ collections: IR04_COLLECTIONS, ownedReferences: true });
global.__MEDISYNC_QA_FREEZE = qa.freeze;

const path = require('path');
const crypto = require('crypto');

// Mock ESM-only uuid package with Node's native crypto.randomUUID for Jest CJS runtime
jest.mock('uuid', () => ({
  v4: () => require('crypto').randomUUID()
}));
jest.mock('node-vault', () => () => { throw new Error('Vault initialization prohibited in isolated IR-04'); });
jest.mock('axios', () => {
  const reject = () => {
    if(global.__MEDISYNC_IR04_RECEIPT)global.__MEDISYNC_IR04_RECEIPT.rejectedAxios=(global.__MEDISYNC_IR04_RECEIPT.rejectedAxios||0)+1;
    throw new Error('Unexpected Axios operation prohibited in IR-04');
  };
  const client=Object.assign(reject,Object.fromEntries(['get','post','put','patch','delete','head','options','request'].map(name=>[name,reject])));
  client.create=()=>client;
  return client;
});
jest.mock('cloudinary', () => {
  const refuse = () => {
    if (global.__MEDISYNC_IR04_RECEIPT) global.__MEDISYNC_IR04_RECEIPT.cloudinaryCalls++;
    throw new Error('Cloudinary delivery is disabled in IR-04; upload coverage belongs to the laboratory suite');
  };
  return { v2: { config: () => ({}), uploader: { upload_stream: refuse }, url: refuse } };
});

const mongoose = require('mongoose');
const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const { createOwnedHttpServer } = require('./helpers/ownedHttpServer');
const isolation = require('./helpers/ir04IsolationReceipt').createReceipt(qa);
Object.assign(isolation.state, { rejectedAxios: 0, rejectedNativeFetch: 0 });
isolation.save();
global.__MEDISYNC_IR04_RECEIPT = isolation.state;
const irTransactions = irSafety.createTransactionTracker(mongoose.mongo.ClientSession, {
  isFrozen: () => qa.status().frozen,
  save(status) { isolation.state.transactionStatus = status; isolation.save(); }
});


// Configure encryption key before requiring any Mongoose models
global.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
global.ENCRYPTION_KEYS = { "1": process.env.ENCRYPTION_KEY };
global.ACTIVE_KEY_VERSION = 1;

const {
  TEST_DB_NAME,
  PROD_DB_NAME,
  connectAutomatedTestDB,
  connectProductionDB,
  installDestructiveOpGuards,
  DatabaseIsolationError
} = require('../src/config/dbGuard');

installDestructiveOpGuards();

const emailService = require('../src/utils/emailService');
const axios = require('axios');

// Models
const Admin = require('../src/models/Admin');
const Doctor = require('../src/models/Doctor');
const Patient = require('../src/models/Patient');
const Pharmacy = require('../src/models/Pharmacy');
const PharmacyStaff = require('../src/models/PharmacyStaff');
const Hospital = require('../src/models/Hospital');
const Consultation = require('../src/models/Consultation');
const ConsultationRating = require('../src/models/ConsultationRating');
const Prescription = require('../src/models/Prescription');
const Dispensing = require('../src/models/Dispensing');
const LabTest = require('../src/models/LabTest');
const Notification = require('../src/models/Notification');
const BroadcastMessage = require('../src/models/BroadcastMessage');
const BanRecord = require('../src/models/BanRecord');
const SessionToken = require('../src/models/SessionToken');
const TrustedDevice = require('../src/models/TrustedDevice');
const OTPSession = require('../src/models/OTPSession');
const AuditLog = require('../src/models/AuditLog');
const OutbreakAlert = require('../src/models/OutbreakAlert');

// Build full Express application mounting all MediSync routes
function buildTestApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(isolation.requests);
  app.set('io', {
    userSocketMap: new Map(),
    emit: () => { isolation.state.socketEmits++; },
    to: () => ({ emit: () => { isolation.state.socketEmits++; } })
  });

  app.use('/api/auth', require('../src/routes/authRoutes'));
  app.use('/api/public', require('../src/routes/publicRoutes'));
  app.use('/api/doctor', require('../src/routes/doctorRoutes'));
  app.use('/api/hospital', require('../src/routes/hospitalRoutes'));
  app.use('/api/pharmacy', require('../src/routes/pharmacyRoutes'));
  app.use('/api/patient', require('../src/routes/patientRoutes'));
  app.use('/api/admin', require('../src/routes/adminRoutes'));
  app.use('/api/drugs', require('../src/routes/drugRoutes'));
  app.use('/api/alerts', require('../src/routes/alertRoutes'));
  app.use('/api/tests', require('../src/routes/testRoutes'));
  app.use('/api/prescription', require('../src/routes/prescriptionRoutes'));
  app.use('/api/prescriptions', require('../src/routes/prescriptionRoutes'));
  app.use('/api/lab', require('../src/routes/labRoutes'));
  app.use('/api/notifications', require('../src/routes/notificationRoutes'));
  app.use('/api/users', require('../src/routes/userRoutes'));
  app.use('/api/support', require('../src/routes/supportRoutes'));
  app.use('/api/devices', require('../src/routes/deviceRoutes'));

  isolation.instrument(app);
  return app;
}

const app = buildTestApp();
const irHttp = createOwnedHttpServer(app);
const irRequest = () => {
  if (!irHttp.server.listening || !irHttp.server.address()) throw new Error('IR-04 owned listener not ready');
  return request(irHttp.server);
};

// Per-run credentials exist only in this isolated process, never on a baseline actor.
const DEMO_PASSWORD = `Qa9!${crypto.randomBytes(32).toString('hex')}`;
const QA_RUN_ID = qa.owner;
const QA_PATIENT_NIC = qa.alias('199988887777');
const QA_PATIENT_EMAIL = qa.alias('qa.patient@test.medisync.local');
const QA_PATIENT_PASSWORD = `Qa9!${crypto.randomBytes(32).toString('hex')}`;
const QA_DOCTOR_EMAIL = qa.alias('anura.jayawardena@medisync.local');
const QA_DOCTOR_UNVERIFIED_EMAIL = qa.alias('unverified.specialist@medisync.local');
const QA_DOCTOR_LICENSE = `SLMC-QA-${Date.now().toString().slice(-5)}`;
const QA_PHARMACY_REG = `PH-QA-${Date.now().toString().slice(-5)}`;
const QA_PHARMACY_ADMIN_EMAIL = qa.alias('qa.pharmadmin@test.medisync.local');
const QA_PHARMACY_STAFF_EMAIL = qa.alias('qa.pharmstaff@test.medisync.local');
const QA_SUB_ADMIN_EMAIL = qa.alias('qa.subadmin@test.medisync.local');

const nicHash = (nic) =>
  crypto.createHash('sha256').update(String(nic || '').trim().toUpperCase()).digest('hex');

describe('IR-04 Isolated Backend Integration & Regression Suite (medisync_automated_test ONLY)', () => {
  let baselineCounts = {};
  const ownedActors = {};

  // Tokens and IDs captured across serial tests
  let superAdminToken;
  let regularAdminToken;
  let demoDoctorToken;
  let demoPatientToken;
  let demoPharmacistToken;
  let demoHospitalToken;

  let qaPatientToken;
  let qaPatientId;
  let createdConsultationId;
  let createdConsultationRef;
  let createdPrescriptionId;
  let createdStandaloneRxId;
  let createdLabTestDocId;
  let createdLabTestId;
  let createdDispensingReceiptNo;
  let createdQaStaffId;
  let createdBanId;

  async function snapshotCounts() {
    const db = mongoose.connection.db;
    const collections = [
      'admins',
      'doctors',
      'patients',
      'pharmacies',
      'pharmacystaffs',
      'hospitals',
      'consultations',
      'prescriptions',
      'dispensings',
      'labtests',
      'outbreakalerts',
      'broadcastmessages',
      'drugs',
      'icdcodes',
      'notifications',
      'auditlogs',
      'trusteddevices',
      'sessiontokens',
      'otpsessions',
      'consultationratings',
      'reviews',
      'banrecords',
      'hospitaladmissions',
      'systemconfigs'
    ];
    const counts = {};
    for (const name of collections) {
      counts[name] = await db.collection(name).countDocuments();
    }
    return counts;
  }

  async function cleanupQaArtifacts() { await qa.cleanup(); }

  beforeAll(async () => {
    emailService.__clearCapturedTestEmails();
    const guardedFetch = global.fetch;
    jest.spyOn(global, 'fetch').mockImplementation(require('./helpers/strictMlFetch').createStrictMlFetch(guardedFetch, isolation.state));

    const axiosMocks = require('./helpers/strictIr04Axios').createIr04AxiosMocks(isolation.state, isolation.recordMock);
    jest.spyOn(axios, 'get').mockImplementation(axiosMocks.get);
    jest.spyOn(axios, 'post').mockImplementation(axiosMocks.post);

    const connInfo = await connectAutomatedTestDB();
    qa.verifyRuntime(connInfo);
    expect(connInfo.dbName).toBe(TEST_DB_NAME);
    expect(connInfo.dbName).not.toBe(PROD_DB_NAME);
    expect(connInfo.authenticatedRoles).toEqual([
      { role: 'readWrite', db: TEST_DB_NAME }
    ]);
    irSafety.assertScope(qa);
    baselineCounts = await snapshotCounts();
    const cloneAccount = async (Model, filter, overrides = {}) => {
      const actorPasswordHash = await require('bcryptjs').hash(DEMO_PASSWORD, 10);
      return irSafety.cloneActor(qa, Model, filter, actorPasswordHash, overrides);
    };

    // Login and clinical changes use cloned accounts. Baseline actors remain
    // available only for read-only publication and integrity assertions.
    ownedActors.admin = await cloneAccount(Admin, { email: 'superadmin@demo.medisync.local' });
    ownedActors.opsAdmin = await cloneAccount(Admin, { email: 'opsadmin@demo.medisync.local' });
    ownedActors.hospital = await cloneAccount(Hospital, { email: 'colombo.hospital@demo.medisync.local' }, { doctors: [] });
    ownedActors.doctor = await cloneAccount(Doctor, { email: 'dr.silva@demo.medisync.local' }, { hospitals: [ownedActors.hospital._id] });
    ownedActors.secondDoctor = await cloneAccount(Doctor, { email: 'dr.fernando@demo.medisync.local' }, { hospitals: [ownedActors.hospital._id] });
    ownedActors.unassignedDoctor = await cloneAccount(Doctor, { email: 'dr.perera@demo.medisync.local' }, { hospitals: [ownedActors.hospital._id] });
    ownedActors.patient = await cloneAccount(Patient, { email: 'kamal.patient@demo.medisync.local' });
    ownedActors.pharmacy = await qa.clone(Pharmacy, { regNo: 'PH-DEMO-001' }, { adminId: undefined, inventory: [] });
    irSafety.ownedId(qa, 'pharmacies', ownedActors.pharmacy._id);
    ownedActors.staff = await cloneAccount(PharmacyStaff, { email: 'pharmacy.admin@demo.medisync.local' }, { pharmacyId: ownedActors.pharmacy._id });
    // A deliberately selected 7-day fixture; no historical/default duration is inferred.
    const clonedRxTiming = require('../src/utils/prescriptionDuration').prescriptionTiming({ durationDays: 7 });
    ownedActors.existingRx = await qa.clone(Prescription, { prescriptionId: 'RX-DEMO-CLIN-001' }, {
      prescriptionId: `RX-QA-${qa.owner}`, patientId: ownedActors.patient._id, patientNic: ownedActors.patient.nic,
      patientNic_bi: nicHash(ownedActors.patient.nic), nicHash: nicHash(ownedActors.patient.nic),
      doctorId: ownedActors.doctor._id, consultationId: undefined, consultationRef: undefined, hospitalId: ownedActors.hospital._id,
      dispensedBy: undefined, dispenserStaffId: undefined, dispensedAt: undefined, dispensedByPharmacist: undefined, pharmacyName: undefined,
      status: 'pending', ...clonedRxTiming
    });
    irSafety.validateActorReferences(qa, 'Pharmacy', { adminId: ownedActors.staff._id });
    ownedActors.pharmacy.adminId = ownedActors.staff._id;
    ownedActors.pharmacy.inventory = [{ drugName: 'Paracetamol 500mg', stock: 200, unit: 'tablets', reorderLevel: 50 }];
    await ownedActors.pharmacy.save();
    isolation.state.setupOwnedGraph = await irSafety.verifyOwnedGraph(qa, { collection: name => mongoose.connection.db.collection(name), bsonId: id => new mongoose.Types.ObjectId(id) });
    await irHttp.start();
    isolation.state.listener = irHttp.status();
    isolation.save();
  }, 45000);

  // Sticky isolation receipts cannot be erased by caught application errors.
  afterEach(async () => {
    isolation.state.transactionStatus = irTransactions.status();
    await irSafety.verifyCaseBoundary(qa, isolation, require('./helpers/qaEnvironment'), irTransactions);
  });

  afterAll(async () => {
    let completedWithoutFailure = false;
    const teardownFailures = [];
    const noteFailure = code => { teardownFailures.push(code); isolation.state.recoveryRequired = true; };
    try { completedWithoutFailure = !qa.status().frozen; qa.freeze(); }
    catch (_) { noteFailure('freeze-or-status'); }
    try {
      try { await irHttp.close(); } catch (_) { noteFailure('listener-close'); }
      try { await isolation.drain(); } catch (_) { noteFailure('controller-drain'); }
      isolation.state.listener = irHttp.status();
      isolation.state.transactionStatus = irTransactions.status();
      isolation.save();
      if (teardownFailures.length) throw new Error('IR-04 listener/drain proof failed; retain owned fixtures');
      // Scope, rejected native writes, secret/network ledgers and producer evidence
      // are checked before the reviewed manifest/runtime/owner cleanup admission.
      irSafety.assertLedgers(qa, isolation, require('./helpers/qaEnvironment'));
      isolation.state.finalOwnedGraph = await irSafety.verifyOwnedGraph(qa, { collection: name => mongoose.connection.db.collection(name), bsonId: id => new mongoose.Types.ObjectId(id) });
      isolation.state.transactionStatus = irTransactions.status();
      irSafety.assertLedgers(qa, isolation, require('./helpers/qaEnvironment'));
      isolation.assertCleanupReady({ listener: irHttp.status(), integrations: isolation.state });
      await cleanupQaArtifacts();
      isolation.state.transactionStatus = irTransactions.status();
      irSafety.assertLedgers(qa, isolation, require('./helpers/qaEnvironment'));
      isolation.state.cleanupComplete = true;
      emailService.__clearCapturedTestEmails();
      isolation.state.mockEmailsRemaining = emailService.__getCapturedTestEmails().length;
      if (isolation.state.mockEmailsRemaining) throw new Error('IR-04 owned mock memory did not clear');
      qa.freeze(); // Persist final empty memory counters without reopening writes.
      const finalCounts = await snapshotCounts();
      expect(finalCounts).toEqual(baselineCounts);
      if(completedWithoutFailure)expect(isolation.state.mockedNativeIngest).toBe(1);
      isolation.state.recoveryRequired = false;
    } catch (_) {
      noteFailure('cleanup-or-verification');
    } finally {
      // Attempt disconnect even when freeze, listener, drain or receipt access fails.
      try { await mongoose.disconnect(); }
      catch (_) { noteFailure('database-disconnect'); }
      isolation.state.disconnected = mongoose.connection.readyState === 0;
      if (!isolation.state.disconnected) noteFailure('database-still-connected');
      const finalTransactions = irTransactions.status();
      isolation.state.transactionStatus = finalTransactions;
      if (!finalTransactions.installed || finalTransactions.pendingTransactions || finalTransactions.pendingOperations || finalTransactions.failures.length) noteFailure('transaction-settlement');
      try {
        isolation.state.listener = irHttp.status();
        isolation.state.guardStatus = qa.status();
        isolation.state.mockEmailsRemaining = emailService.__getCapturedTestEmails().length;
        isolation.state.redisPersistent = require('../src/config/redis').isUsingPersistentRedis();
      } catch (_) { noteFailure('receipt-state'); }
      // Preserve active mocks/memory on unsafe producer or cleanup failure.
      if (!teardownFailures.length) {
        try { jest.restoreAllMocks(); } catch (_) { noteFailure('mock-restore'); }
      }
      isolation.state.teardownFailures = teardownFailures;
      isolation.save();
    }
    if (teardownFailures.length) throw new Error('IR-04 teardown failed; preserve exact recovery manifests');
  }, 45000);

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 0: FAIL-CLOSED PRODUCTION ISOLATION GUARD
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Priority 0 — Fail-Closed Database Isolation Verification', () => {
    test('0.1 Verifies active connection is strictly medisync_automated_test and connectProductionDB fails closed', async () => {
      expect(mongoose.connection.name).toBe('medisync_automated_test');
      await expect(connectProductionDB()).rejects.toThrow(DatabaseIsolationError);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 1: 5-ROLE AUTHENTICATION (Admin, Doctor, Patient, Pharmacy, Hospital)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Priority 1 — Five-Role Synthetic Authentication', () => {
    test('1.1 Authenticates Super Admin (superadmin@demo.medisync.local)', async () => {
      const res = await irRequest()
        .post('/api/auth/login')
        .send({
          email: ownedActors.admin.email,
          password: DEMO_PASSWORD,
          role: 'admin'
        });

      expect(res.status).toBe(200);
      expect(res.body.data?.accessToken).toBeTruthy();
      superAdminToken = res.body.data.accessToken;
      expect(['admin', 'super_admin']).toContain(res.body.data?.role);

      // Also authenticate regular admin (isSuperAdmin: false) for permission boundary tests
      const regAdminRes = await irRequest()
        .post('/api/auth/login')
        .send({
          email: ownedActors.opsAdmin.email,
          password: DEMO_PASSWORD,
          role: 'admin'
        });
      expect(regAdminRes.status).toBe(200);
      expect(regAdminRes.body.data?.role).toBe('admin');
      regularAdminToken = regAdminRes.body.data.accessToken;
    });

    test('1.2 Authenticates Doctor (dr.silva@demo.medisync.local)', async () => {
      const res = await irRequest()
        .post('/api/auth/login')
        .send({
          email: ownedActors.doctor.email,
          password: DEMO_PASSWORD,
          role: 'doctor'
        });

      expect(res.status).toBe(200);
      expect(res.body.data?.accessToken).toBeTruthy();
      expect(res.body.data?.role).toBe('doctor');
      demoDoctorToken = res.body.data.accessToken;
    });

    test('1.3 Authenticates Patient via /api/patient/login using NIC and email', async () => {
      const res = await irRequest()
        .post('/api/patient/login')
        .send({
          nic: ownedActors.patient.nic,
          password: DEMO_PASSWORD
        });

      expect(res.status).toBe(200);
      expect(res.body.data?.accessToken).toBeTruthy();
      expect(res.body.data?.role).toBe('patient');
      demoPatientToken = res.body.data.accessToken;
    });

    test('1.4 Authenticates Pharmacy Staff via /api/pharmacy/login', async () => {
      const res = await irRequest()
        .post('/api/pharmacy/login')
        .send({
          email: ownedActors.staff.email,
          password: DEMO_PASSWORD
        });

      expect(res.status).toBe(200);
      expect(res.body.data?.accessToken).toBeTruthy();
      expect(res.body.data?.role).toBe('pharmacy_admin');
      demoPharmacistToken = res.body.data.accessToken;
    });

    test('1.5 Authenticates Hospital Admin via /api/hospital/login', async () => {
      const res = await irRequest()
        .post('/api/hospital/login')
        .send({
          email: ownedActors.hospital.email,
          password: DEMO_PASSWORD
        });

      expect(res.status).toBe(200);
      expect(res.body.data?.accessToken).toBeTruthy();
      expect(res.body.data?.role).toBe('hospital_admin');
      demoHospitalToken = res.body.data.accessToken;
    });

    test('1.6 Rejects invalid passwords with 401 across authentication endpoints', async () => {
      const badRes = await irRequest()
        .post('/api/auth/login')
        .send({
          email: ownedActors.doctor.email,
          password: 'WrongPassword999!',
          role: 'doctor'
        });
      expect(badRes.status).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 2: REGISTRATION, 2FA OTP, PASSWORD RESET, DEVICE TRUST & SESSIONS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Priority 2 — Registration, OTP Verification, Device Trust & Session Handling (Mocked Delivery)', () => {
    test('2.1 Registers a synthetic QA Patient with field encryption and mocked welcome email', async () => {
      emailService.__clearCapturedTestEmails();

      const res = await irRequest()
        .post('/api/patient/register')
        .set('x-device-fingerprint', `fp-qa-patient-${QA_RUN_ID}`)
        .send({
          nic: QA_PATIENT_NIC,
          fullName: 'QA Synthetic Patient',
          email: QA_PATIENT_EMAIL,
          dateOfBirth: '1999-04-10',
          gender: 'Female',
          district: 'Colombo',
          bloodGroup: 'O+',
          address: '42 QA Isolation Lane, Colombo',
          contactInfo: '0771112233',
          allergies: ['Penicillin', 'Amoxicillin'],
          chronicConditions: ['Asthma'],
          password: QA_PATIENT_PASSWORD
        });

      expect(res.status).toBe(201);
      expect(res.body.data?.accessToken).toBeTruthy();
      qaPatientToken = res.body.data.accessToken;

      // Ensure patientNic_bi is populated for lab/timeline blind-index queries
      const qaDoc = await Patient.findOne({ email: QA_PATIENT_EMAIL });
      expect(qaDoc).toBeTruthy();
      qaPatientId = qaDoc._id;
      await Patient.collection.updateOne(
        { _id: qaDoc._id },
        { $set: { patientNic_bi: nicHash(QA_PATIENT_NIC) } }
      );

      // Verify raw document in MongoDB has encrypted fullName & allergies
      const rawDoc = await Patient.collection.findOne({ _id: qaDoc._id });
      expect(rawDoc.__enc_fullName).toBe(true);
      expect(rawDoc.fullName).not.toBe('QA Synthetic Patient');

      // Verify welcome email was captured in memory (no real email sent)
      const captured = emailService.__getCapturedTestEmails();
      expect(captured.some((e) => e.to.includes(QA_PATIENT_EMAIL))).toBe(true);
    });

    test('2.2 Enables 2FA on QA Patient and completes 2FA OTP login flow using mocked OTP email', async () => {
      emailService.__clearCapturedTestEmails();

      // Step 1: Request 2FA setup OTP using current password
      const enableReqRes = await irRequest()
        .post('/api/auth/enable-2fa')
        .set('Authorization', `Bearer ${qaPatientToken}`)
        .send({ password: QA_PATIENT_PASSWORD });
      expect(enableReqRes.status).toBe(200);
      expect(enableReqRes.body.data?.requiresOTP).toBe(true);

      const setupEmails = emailService.__getCapturedTestEmails();
      const setupOtpEmail = setupEmails.find((e) => e.to.includes(QA_PATIENT_EMAIL) && e.otp);
      expect(setupOtpEmail).toBeTruthy();

      // Step 2: Verify 2FA setup OTP
      const verifySetupRes = await irRequest()
        .post('/api/auth/verify-2fa')
        .set('Authorization', `Bearer ${qaPatientToken}`)
        .send({ otp: setupOtpEmail.otp });
      expect(verifySetupRes.status).toBe(200);
      expect(verifySetupRes.body.data?.twoFactorEnabled).toBe(true);

      emailService.__clearCapturedTestEmails();

      // Step 3: Login with 2FA enabled triggers login OTP
      const loginRes = await irRequest()
        .post('/api/auth/login')
        .set('x-device-fingerprint', `fp-qa-patient-${QA_RUN_ID}`)
        .send({
          email: QA_PATIENT_EMAIL,
          password: QA_PATIENT_PASSWORD,
          role: 'patient'
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data?.requiresOTP).toBe(true);
      expect(loginRes.body.data?.providerAccepted).toBe(true);

      const captured = emailService.__getCapturedTestEmails();
      const otpEmail = captured.find((e) => e.to.includes(QA_PATIENT_EMAIL) && e.otp);
      expect(otpEmail).toBeTruthy();
      expect(otpEmail.otp).toMatch(/^\d{6}$/);

      const verifyRes = await irRequest()
        .post('/api/auth/verify-otp')
        .set('x-device-fingerprint', `fp-qa-patient-${QA_RUN_ID}`)
        .send({
          userId: String(qaPatientId),
          role: 'patient',
          otp: otpEmail.otp
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data?.accessToken).toBeTruthy();
      qaPatientToken = verifyRes.body.data.accessToken;
    });

    test('2.3 Completes untrusted device step-up OTP verification (GET /api/devices/my -> request-trust-otp -> trust)', async () => {
      const listRes = await irRequest()
        .get('/api/devices/my')
        .set('Authorization', `Bearer ${qaPatientToken}`);
      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body.data)).toBe(true);
      expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);

      const deviceDoc = listRes.body.data[0];
      expect(deviceDoc.isTrusted).toBe(false);

      emailService.__clearCapturedTestEmails();
      const reqOtpRes = await irRequest()
        .post(`/api/devices/my/${deviceDoc._id}/request-trust-otp`)
        .set('Authorization', `Bearer ${qaPatientToken}`);
      expect(reqOtpRes.status).toBe(200);

      const captured = emailService.__getCapturedTestEmails();
      const trustOtpEmail = captured.find((e) => e.to.includes(QA_PATIENT_EMAIL) && e.otp);
      expect(trustOtpEmail).toBeTruthy();

      const trustRes = await irRequest()
        .post(`/api/devices/my/${deviceDoc._id}/trust`)
        .set('Authorization', `Bearer ${qaPatientToken}`)
        .send({ otp: trustOtpEmail.otp });
      expect(trustRes.status).toBe(200);
      expect(trustRes.body.data?.isTrusted).toBe(true);
    });

    test('2.4 Executes forgot-password and reset-password OTP flow with mocked email delivery', async () => {
      emailService.__clearCapturedTestEmails();

      const forgotRes = await irRequest()
        .post('/api/auth/forgot-password')
        .send({ email: QA_PATIENT_EMAIL, role: 'patient' });
      expect(forgotRes.status).toBe(200);

      const captured = emailService.__getCapturedTestEmails();
      const resetOtpEmail = captured.find((e) => e.to.includes(QA_PATIENT_EMAIL) && e.otp);
      expect(resetOtpEmail).toBeTruthy();

      const resetRes = await irRequest()
        .post('/api/auth/reset-password')
        .send({
          email: QA_PATIENT_EMAIL,
          role: 'patient',
          otp: resetOtpEmail.otp,
          newPassword: QA_PATIENT_PASSWORD
        });
      expect(resetRes.status).toBe(200);

      // Re-authenticate after password reset (since resetPassword invalidates prior sessions)
      emailService.__clearCapturedTestEmails();
      const reloginAfterReset = await irRequest()
        .post('/api/auth/login')
        .set('x-device-fingerprint', `fp-qa-patient-${QA_RUN_ID}`)
        .send({
          email: QA_PATIENT_EMAIL,
          password: QA_PATIENT_PASSWORD,
          role: 'patient'
        });
      expect(reloginAfterReset.status).toBe(200);
      if (reloginAfterReset.body.data?.requiresOTP) {
        const otpMail = emailService.__getCapturedTestEmails().find((e) => e.to.includes(QA_PATIENT_EMAIL) && e.otp);
        const verifyAfterReset = await irRequest()
          .post('/api/auth/verify-otp')
          .set('x-device-fingerprint', `fp-qa-patient-${QA_RUN_ID}`)
          .send({
            userId: String(qaPatientId),
            role: 'patient',
            otp: otpMail.otp
          });
        expect(verifyAfterReset.status).toBe(200);
        qaPatientToken = verifyAfterReset.body.data.accessToken;
      } else {
        qaPatientToken = reloginAfterReset.body.data.accessToken;
      }
    });

    test('2.5 Verifies session heartbeat and logout revocation', async () => {
      // Disable 2FA first so we can get a fresh disposable token for logout test
      const disableRes = await irRequest()
        .post('/api/auth/2fa')
        .set('Authorization', `Bearer ${qaPatientToken}`)
        .send({ enabled: false, password: QA_PATIENT_PASSWORD });
      expect(disableRes.status).toBe(200);

      const hbRes = await irRequest()
        .post('/api/auth/heartbeat')
        .set('Authorization', `Bearer ${qaPatientToken}`);
      expect(hbRes.status).toBe(200);

      const logoutRes = await irRequest()
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${qaPatientToken}`);
      expect(logoutRes.status).toBe(200);

      // Re-using the revoked token must fail with 401
      const afterLogoutRes = await irRequest()
        .post('/api/auth/heartbeat')
        .set('Authorization', `Bearer ${qaPatientToken}`);
      expect(afterLogoutRes.status).toBe(401);

      // Log back in to obtain a fresh active token for subsequent tests
      const reloginRes = await irRequest()
        .post('/api/auth/login')
        .send({
          email: QA_PATIENT_EMAIL,
          password: QA_PATIENT_PASSWORD,
          role: 'patient'
        });
      expect(reloginRes.status).toBe(200);
      qaPatientToken = reloginRes.body.data.accessToken;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 3: ROLE-BASED AUTHORIZATION (RBAC) & IDOR PROTECTION
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Priority 3 — Role-Based Authorization (RBAC) & IDOR Protection', () => {
    test('3.1 Blocks cross-role privilege escalation attempts with 403 Forbidden', async () => {
      // Patient attempting Admin route
      const adminAttempt = await irRequest()
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${qaPatientToken}`);
      expect(adminAttempt.status).toBe(403);

      // Patient attempting Doctor route
      const docAttempt = await irRequest()
        .post('/api/doctor/consultation')
        .set('Authorization', `Bearer ${qaPatientToken}`)
        .send({ patientNic: QA_PATIENT_NIC });
      expect(docAttempt.status).toBe(403);

      // Doctor attempting Hospital Admin route
      const hospAttempt = await irRequest()
        .get('/api/hospital/stats')
        .set('Authorization', `Bearer ${demoDoctorToken}`);
      expect(hospAttempt.status).toBe(403);

      // Doctor attempting Pharmacy dispense route
      const pharmAttempt = await irRequest()
        .post('/api/pharmacy/dispense')
        .set('Authorization', `Bearer ${demoDoctorToken}`)
        .send({ prescriptionId: ownedActors.existingRx.prescriptionId });
      expect(pharmAttempt.status).toBe(403);
    });

    test('3.2 Blocks horizontal IDOR on Patient profile, update, and timeline routes', async () => {
      // QA Patient attempting to read seeded Patient Kamal Perera (999000001V)
      const getOtherRes = await irRequest()
        .get(`/api/patient/${ownedActors.patient.nic}`)
        .set('Authorization', `Bearer ${qaPatientToken}`);
      expect(getOtherRes.status).toBe(403);

      const updateOtherRes = await irRequest()
        .put(`/api/patient/${ownedActors.patient.nic}`)
        .set('Authorization', `Bearer ${qaPatientToken}`)
        .send({ district: 'Galle' });
      expect(updateOtherRes.status).toBe(403);

      const timelineOtherRes = await irRequest()
        .get(`/api/patient/${ownedActors.patient.nic}/timeline`)
        .set('Authorization', `Bearer ${qaPatientToken}`);
      expect(timelineOtherRes.status).toBe(403);
    });

    test('3.3 Blocks horizontal IDOR on E-Prescription PDF download across patients', async () => {
      // QA Patient attempting to download seeded Patient Kamal's prescription RX-DEMO-CLIN-001
      const rxDownloadOther = await irRequest()
        .get(`/api/prescription/download/${ownedActors.existingRx.prescriptionId}`)
        .set('Authorization', `Bearer ${qaPatientToken}`);
      expect(rxDownloadOther.status).toBe(403);
    });

    test('3.4 Enforces strict patient ownership, scoped admin access, and doctor-patient authorization on GET /api/prescriptions/patient/:nic and GET /api/patient/:nic/prescriptions', async () => {
      // 1. Patient can access only their own prescriptions on both route aliases
      const ownAlias1 = await irRequest()
        .get(`/api/patient/${ownedActors.patient.nic}/prescriptions`)
        .set('Authorization', `Bearer ${demoPatientToken}`);
      expect(ownAlias1.status).toBe(200);
      expect(Array.isArray(ownAlias1.body.data)).toBe(true);
      expect(ownAlias1.body.data.length).toBeGreaterThanOrEqual(1);

      const ownAlias2 = await irRequest()
        .get(`/api/prescriptions/patient/${ownedActors.patient.nic}`)
        .set('Authorization', `Bearer ${demoPatientToken}`);
      expect(ownAlias2.status).toBe(200);
      expect(Array.isArray(ownAlias2.body.data)).toBe(true);

      // 2. Horizontal IDOR: QA Patient denied access to Kamal's prescriptions on both aliases (no data leaked)
      const horiz1 = await irRequest()
        .get(`/api/patient/${ownedActors.patient.nic}/prescriptions`)
        .set('Authorization', `Bearer ${qaPatientToken}`);
      expect(horiz1.status).toBe(403);
      expect(horiz1.body.data).toBeUndefined();

      const horiz2 = await irRequest()
        .get(`/api/prescriptions/patient/${ownedActors.patient.nic}`)
        .set('Authorization', `Bearer ${qaPatientToken}`);
      expect(horiz2.status).toBe(403);
      expect(horiz2.body.data).toBeUndefined();

      // 3. Vertical IDOR: Pharmacist and Hospital Admin denied access to patient prescriptions endpoint
      const pharmDenied = await irRequest()
        .get(`/api/prescriptions/patient/${ownedActors.patient.nic}`)
        .set('Authorization', `Bearer ${demoPharmacistToken}`);
      expect(pharmDenied.status).toBe(403);
      expect(pharmDenied.body.data).toBeUndefined();

      const hospDenied = await irRequest()
        .get(`/api/prescriptions/patient/${ownedActors.patient.nic}`)
        .set('Authorization', `Bearer ${demoHospitalToken}`);
      expect(hospDenied.status).toBe(403);
      expect(hospDenied.body.data).toBeUndefined();

      // 4. Scoped Administrator access preserved
      const superAdminAllowed = await irRequest()
        .get(`/api/prescriptions/patient/${ownedActors.patient.nic}`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(superAdminAllowed.status).toBe(200);

      const regAdminAllowed = await irRequest()
        .get(`/api/prescriptions/patient/${ownedActors.patient.nic}`)
        .set('Authorization', `Bearer ${regularAdminToken}`);
      expect(regAdminAllowed.status).toBe(200);

      // 5. Doctor with MISSING relationship is denied (403)
      const missingRel1 = await irRequest()
        .get(`/api/prescriptions/patient/${QA_PATIENT_NIC}`)
        .set('Authorization', `Bearer ${demoDoctorToken}`);
      expect(missingRel1.status).toBe(403);
      expect(missingRel1.body.data).toBeUndefined();

      const missingRel2 = await irRequest()
        .get(`/api/patient/${QA_PATIENT_NIC}/prescriptions`)
        .set('Authorization', `Bearer ${demoDoctorToken}`);
      expect(missingRel2.status).toBe(403);
      expect(missingRel2.body.data).toBeUndefined();

      // 6. Doctor with EXPIRED consultation relationship (>30 days old & past followUpDate) is denied (403)
      const demoDoctorDoc = await Doctor.findById(ownedActors.doctor._id).select('_id');
      const expiredDate = new Date(Date.now() - 45 * 86400000);
      const expiredFollowUp = new Date(Date.now() - 10 * 86400000);
      const expiredConsult = await Consultation.create({
        consultationId: `CON-EXP-${Date.now()}`,
        patientId: qaPatientId,
        patientNic: QA_PATIENT_NIC,
        patientNic_bi: nicHash(QA_PATIENT_NIC),
        nicHash: nicHash(QA_PATIENT_NIC),
        doctorId: demoDoctorDoc._id,
        diagnosis: 'Historical resolved condition',
        isFollowUpRequired: true,
        followUpDate: expiredFollowUp,
        createdAt: expiredDate,
        updatedAt: expiredDate
      });
      await Consultation.collection.updateOne(
        { _id: expiredConsult._id },
        { $set: { createdAt: expiredDate, updatedAt: expiredDate } }
      );

      try {
        const expiredRelRes = await irRequest()
          .get(`/api/prescriptions/patient/${QA_PATIENT_NIC}`)
          .set('Authorization', `Bearer ${demoDoctorToken}`);
        expect(expiredRelRes.status).toBe(403);
        expect(expiredRelRes.body.data).toBeUndefined();
      } finally {
        await Consultation.deleteOne({ _id: expiredConsult._id });
      }

      // 7. Doctor with REVOKED relationship (patient reported doctor) is denied (403) even with recent consultation
      const activeTempConsult = await Consultation.create({
        consultationId: `CON-REV-${Date.now()}`,
        patientId: qaPatientId,
        patientNic: QA_PATIENT_NIC,
        patientNic_bi: nicHash(QA_PATIENT_NIC),
        nicHash: nicHash(QA_PATIENT_NIC),
        doctorId: demoDoctorDoc._id,
        diagnosis: 'Active temp consultation'
      });
      const previousOwnedReports = (await Patient.findById(qaPatientId).select('reportedDoctors').lean()).reportedDoctors || [];
      await irSafety.setOwnedReportedDoctors(qa, Patient, qaPatientId, [
        ...previousOwnedReports,
        { doctorId: demoDoctorDoc._id, reason: 'QA synthetic revocation check', reportedAt: new Date() }
      ]);

      try {
        const revokedRelRes = await irRequest()
          .get(`/api/prescriptions/patient/${QA_PATIENT_NIC}`)
          .set('Authorization', `Bearer ${demoDoctorToken}`);
        expect(revokedRelRes.status).toBe(403);
        expect(revokedRelRes.body.data).toBeUndefined();
      } finally {
        await irSafety.setOwnedReportedDoctors(qa, Patient, qaPatientId, previousOwnedReports);
        await Consultation.deleteOne({ _id: activeTempConsult._id });
      }

      // 8. OTP consent token (x-patient-access): valid access, ambiguous patient scope, doctor replay, and session revocation
      emailService.__clearCapturedTestEmails();
      const reqConsent = await irRequest()
        .post('/api/patient/request-access')
        .set('Authorization', `Bearer ${demoDoctorToken}`)
        .send({
          patientNic: QA_PATIENT_NIC,
          requesterRole: 'doctor',
          requesterName: 'Dr. Arjuna Silva (Demo)'
        });
      expect(reqConsent.status).toBe(200);
      const consentSessionId = reqConsent.body.sessionId;
      const consentMail = emailService
        .__getCapturedTestEmails()
        .find((e) => e.to.includes(QA_PATIENT_EMAIL) && e.otp);
      expect(consentMail).toBeTruthy();

      const verifyConsent = await irRequest()
        .post('/api/patient/verify-access')
        .set('Authorization', `Bearer ${demoDoctorToken}`)
        .send({
          sessionId: consentSessionId,
          patientNic: QA_PATIENT_NIC,
          otp: consentMail.otp
        });
      expect(verifyConsent.status).toBe(200);
      const patientAccessToken = verifyConsent.body.accessToken;

      // 8a. Valid OTP consent token grants access (200) on both prescriptions and timeline endpoints
      const validConsentGet = await irRequest()
        .get(`/api/prescriptions/patient/${QA_PATIENT_NIC}`)
        .set('Authorization', `Bearer ${demoDoctorToken}`)
        .set('x-patient-access', patientAccessToken);
      expect(validConsentGet.status).toBe(200);

      const validConsentTimeline = await irRequest()
        .get(`/api/patient/${QA_PATIENT_NIC}/timeline`)
        .set('Authorization', `Bearer ${demoDoctorToken}`)
        .set('x-patient-access', patientAccessToken);
      expect(validConsentTimeline.status).toBe(200);

      // 8b. Ambiguous / mismatched patient scope: using QA_PATIENT_NIC consent token for 999000001V is denied (403)
      const ambiguousScopeGet = await irRequest()
        .get(`/api/prescriptions/patient/${ownedActors.patient.nic}`)
        .set('Authorization', `Bearer ${demoDoctorToken}`)
        .set('x-patient-access', patientAccessToken);
      expect(ambiguousScopeGet.status).toBe(403);
      expect(ambiguousScopeGet.body.data).toBeUndefined();

      // 8c. Doctor B replaying Doctor A's consent token is denied (403) on both prescriptions and timeline
      const docBLogin = await irRequest()
        .post('/api/auth/login')
        .send({
          email: ownedActors.secondDoctor.email,
          password: DEMO_PASSWORD,
          role: 'doctor'
        });
      expect(docBLogin.status).toBe(200);
      const secondDoctorToken = docBLogin.body.data.accessToken;

      const replayedByDocB = await irRequest()
        .get(`/api/prescriptions/patient/${QA_PATIENT_NIC}`)
        .set('Authorization', `Bearer ${secondDoctorToken}`)
        .set('x-patient-access', patientAccessToken);
      expect(replayedByDocB.status).toBe(403);
      expect(replayedByDocB.body.data).toBeUndefined();

      const unconsentedTimelineDocB = await irRequest()
        .get(`/api/patient/${QA_PATIENT_NIC}/timeline`)
        .set('Authorization', `Bearer ${secondDoctorToken}`);
      expect(unconsentedTimelineDocB.status).toBe(403);
      expect(unconsentedTimelineDocB.body.data).toBeUndefined();

      // 8d. Older OTPSession missing consent metadata (e.g. missing metadata.accessExpiresAt) fails closed (403)
      await OTPSession.updateOne(
        { _id: consentSessionId },
        { $unset: { 'metadata.accessExpiresAt': 1 } }
      );
      const missingMetaGet = await irRequest()
        .get(`/api/prescriptions/patient/${QA_PATIENT_NIC}`)
        .set('Authorization', `Bearer ${demoDoctorToken}`)
        .set('x-patient-access', patientAccessToken);
      expect(missingMetaGet.status).toBe(403);
      expect(missingMetaGet.body.data).toBeUndefined();

      // 8e. Revoked OTP consent session is denied (403) and NEVER falls back to an active consultation relationship
      const fallbackCheckConsult = await Consultation.create({
        consultationId: `CON-NOFALLBACK-${Date.now()}`,
        patientId: qaPatientId,
        patientNic: QA_PATIENT_NIC,
        patientNic_bi: nicHash(QA_PATIENT_NIC),
        nicHash: nicHash(QA_PATIENT_NIC),
        doctorId: demoDoctorDoc._id,
        diagnosis: 'Active consultation that must not be used as fallback when consent header is invalid'
      });
      await OTPSession.updateOne(
        { _id: consentSessionId },
        {
          $set: {
            'metadata.revoked': true,
            'metadata.accessExpiresAt': new Date(Date.now() + 30 * 60000)
          }
        }
      );
      try {
        const revokedConsentGet = await irRequest()
          .get(`/api/prescriptions/patient/${QA_PATIENT_NIC}`)
          .set('Authorization', `Bearer ${demoDoctorToken}`)
          .set('x-patient-access', patientAccessToken);
        expect(revokedConsentGet.status).toBe(403);
        expect(revokedConsentGet.body.data).toBeUndefined();

        const revokedConsentTimeline = await irRequest()
          .get(`/api/patient/${QA_PATIENT_NIC}/timeline`)
          .set('Authorization', `Bearer ${demoDoctorToken}`)
          .set('x-patient-access', patientAccessToken);
        expect(revokedConsentTimeline.status).toBe(403);
        expect(revokedConsentTimeline.body.data).toBeUndefined();
      } finally {
        await Consultation.deleteOne({ _id: fallbackCheckConsult._id });
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 4: ADMIN USER-MANAGEMENT PERMISSIONS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Priority 4 — Admin User-Management Permissions & Governance', () => {
    test('4.1 Retrieves system stats and decrypted user directory without leaking sensitive hashes', async () => {
      const statsRes = await irRequest()
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(statsRes.status).toBe(200);
      expect(statsRes.body.data?.totalPatients).toBeGreaterThanOrEqual(5);
      expect(statsRes.body.data?.totalDoctors).toBeGreaterThanOrEqual(5);

      const usersRes = await irRequest()
        .get('/api/admin/users?role=patient&limit=20')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(usersRes.status).toBe(200);
      const users = usersRes.body.data?.users || usersRes.body.data || [];
      expect(Array.isArray(users)).toBe(true);
      const kamal = users.find((u) => u.email === 'kamal.patient@demo.medisync.local');
      expect(kamal).toBeTruthy();
      expect(kamal.fullName || kamal.name).toBe('Kamal Perera (Demo Patient)');
      expect(kamal.password).toBeUndefined();
      expect(kamal.__enc_fullName).toBeUndefined();
    });

    test('4.2 Searches users and toggles QA user status safely', async () => {
      const searchRes = await irRequest()
        .get(`/api/admin/users/search?q=${encodeURIComponent(QA_PATIENT_EMAIL)}`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(searchRes.status).toBe(200);

      // Toggle QA patient status to false and back to true
      const toggleOff = await irRequest()
        .put('/api/admin/users/toggle')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ userId: String(qaPatientId), role: 'patient', isActive: false });
      expect(toggleOff.status).toBe(200);

      const toggleOn = await irRequest()
        .put('/api/admin/users/toggle')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ userId: String(qaPatientId), role: 'patient', isActive: true });
      expect(toggleOn.status).toBe(200);
    });

    test('4.3 Enforces Super-Admin-only restriction on POST /api/admin/admins and tests ban/lift lifecycle', async () => {
      // Regular admin (isSuperAdmin: false) must be blocked with 403
      const forbiddenRes = await irRequest()
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${regularAdminToken}`)
        .send({
          fullName: 'Unauthorized Sub Admin',
          email: QA_SUB_ADMIN_EMAIL,
          password: QA_PATIENT_PASSWORD
        });
      expect(forbiddenRes.status).toBe(403);

      // Super Admin succeeds
      const createAdminRes = await irRequest()
        .post('/api/admin/admins')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          fullName: 'Authorized QA Sub Admin',
          email: QA_SUB_ADMIN_EMAIL,
          password: QA_PATIENT_PASSWORD
        });
      expect([200, 201]).toContain(createAdminRes.status);

      // Ban & Lift ban on QA Patient
      const banRes = await irRequest()
        .post('/api/admin/ban')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          targetId: String(qaPatientId),
          targetModel: 'Patient',
          reason: 'Synthetic QA ban lifecycle verification',
          banType: 'temporary',
          expiresAt: new Date(Date.now() + 3600000).toISOString()
        });
      expect([200, 201]).toContain(banRes.status);
      createdBanId = banRes.body.data?._id || banRes.body.ban?._id;
      expect(createdBanId).toBeTruthy();

      if (createdBanId) {
        const liftRes = await irRequest()
          .put(`/api/admin/bans/${createdBanId}/lift`)
          .set('Authorization', `Bearer ${superAdminToken}`)
          .send({ liftReason: 'QA test completed' });
        expect(liftRes.status).toBe(200);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 5: DOCTOR & PATIENT PROFILE ACCESS + OTP-GATED RECORD ACCESS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Priority 5 — Doctor & Patient Profile Access + OTP-Gated Patient Privacy', () => {
    test('5.1 Doctor and Patient retrieve their own profiles with decrypted fields', async () => {
      const docProf = await irRequest()
        .get('/api/doctor/profile')
        .set('Authorization', `Bearer ${demoDoctorToken}`);
      expect(docProf.status).toBe(200);
      expect(docProf.body.data?.fullName).toBe('Dr. Arjuna Silva (Demo)');
      expect(docProf.body.data?.specialization).toBe('Cardiologist');

      const patProf = await irRequest()
        .get(`/api/patient/${QA_PATIENT_NIC}`)
        .set('Authorization', `Bearer ${qaPatientToken}`);
      expect(patProf.status).toBe(200);
      expect(patProf.body.data?.fullName).toBe('QA Synthetic Patient');
      expect(patProf.body.data?.allergies).toEqual(expect.arrayContaining(['Penicillin', 'Amoxicillin']));
      expect(patProf.body.data?.__enc_fullName).toBeUndefined();
    });

    test('5.2 Doctor requests OTP-gated access to QA Patient record and verifies OTP', async () => {
      emailService.__clearCapturedTestEmails();

      const reqAccess = await irRequest()
        .post('/api/patient/request-access')
        .set('Authorization', `Bearer ${demoDoctorToken}`)
        .send({
          patientNic: QA_PATIENT_NIC,
          requesterRole: 'doctor',
          requesterName: 'Dr. Arjuna Silva (Demo)'
        });
      expect(reqAccess.status).toBe(200);
      expect(reqAccess.body.sessionId).toBeTruthy();

      const captured = emailService.__getCapturedTestEmails();
      const accessEmail = captured.find((e) => e.to.includes(QA_PATIENT_EMAIL) && e.otp);
      expect(accessEmail).toBeTruthy();

      const verifyAccess = await irRequest()
        .post('/api/patient/verify-access')
        .set('Authorization', `Bearer ${demoDoctorToken}`)
        .send({
          sessionId: reqAccess.body.sessionId,
          patientNic: QA_PATIENT_NIC,
          otp: accessEmail.otp
        });
      expect(verifyAccess.status).toBe(200);
      expect(verifyAccess.body.accessToken).toBeTruthy();
      expect(verifyAccess.body.patientNic).toBe(QA_PATIENT_NIC);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 6: CONSULTATION WORKFLOWS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Priority 6 — Doctor Consultation & Patient Timeline Workflows', () => {
    test('6.1 Doctor creates a consultation with prescription and lab test order for QA Patient', async () => {
      const followUp = new Date(Date.now() + 7 * 86400000).toISOString();
      const res = await irRequest()
        .post('/api/doctor/consultation')
        .set('Authorization', `Bearer ${demoDoctorToken}`)
        .send({
          patientNic: QA_PATIENT_NIC,
          symptoms: ['Fever', 'Headache'],
          icdCode: 'A90',
          icdDescription: 'Dengue fever [classical dengue]',
          diagnosis: 'Suspected Dengue Fever (QA Synthetic)',
          notes: 'Monitor platelet count daily and maintain hydration.',
          isFollowUpRequired: true,
          followUpDate: followUp,
          loginType: 'personal',
          prescriptions: [
            {
              drugName: 'Paracetamol 500mg',
              dosage: '500mg',
              frequency: 'Every 6 hours',
              durationDays: 5,
              instructions: 'Take after meals'
            }
          ],
          orderedTests: [{ testName: 'Full Blood Count' }]
        });

      expect(res.status).toBe(201);
      expect(res.body.consultationId).toBeTruthy();
      createdConsultationId = res.body.consultationId;
      expect(res.body.prescriptions?.length).toBe(1);
      createdPrescriptionId = res.body.prescriptions[0].prescriptionId;
      createdConsultationRef = res.body.prescriptions[0].consultationRef;
      const ownedSavedRx = await Prescription.findById(res.body.prescriptions[0]._id);
      ownedSavedRx.decryptFieldsSync();
      expect(qa.owned.prescriptions).toContain(String(ownedSavedRx._id));
      expect(ownedSavedRx.durationDays).toBe(5);
      expect(ownedSavedRx.drugName).toBe('Paracetamol 500mg');
      expect(+ownedSavedRx.expiresAt - +ownedSavedRx.issuedAt).toBe(5 * 86400000);
      expect(createdConsultationRef).toMatch(/^CON-/);
      expect(res.body.tests?.length).toBe(1);
      createdLabTestDocId = res.body.tests[0]._id;
      createdLabTestId = res.body.tests[0].labTestId;
    });

    test('6.2 Doctor retrieves dashboard stats, consultation list, and updates follow-up', async () => {
      const statsRes = await irRequest()
        .get('/api/doctor/stats')
        .set('Authorization', `Bearer ${demoDoctorToken}`);
      expect(statsRes.status).toBe(200);
      expect(statsRes.body.data?.todayConsultations).toBeGreaterThanOrEqual(1);

      const listRes = await irRequest()
        .get('/api/doctor/consultations')
        .set('Authorization', `Bearer ${demoDoctorToken}`);
      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body.data)).toBe(true);

      const followRes = await irRequest()
        .put(`/api/doctor/consultation/${createdConsultationId}/followup`)
        .set('Authorization', `Bearer ${demoDoctorToken}`)
        .send({
          isFollowUpRequired: true,
          followUpDate: new Date(Date.now() + 10 * 86400000).toISOString(),
          followUpNotes: 'Updated QA follow-up review'
        });
      expect(followRes.status).toBe(200);
    });

    test('6.3 QA Patient views unified medical timeline and rates the consultation', async () => {
      const timelineRes = await irRequest()
        .get(`/api/patient/${QA_PATIENT_NIC}/timeline`)
        .set('Authorization', `Bearer ${qaPatientToken}`);
      expect(timelineRes.status).toBe(200);
      const events = timelineRes.body.data || [];
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThanOrEqual(1);
      const consultationEvent = events.find((e) => e.type === 'consultation');
      expect(consultationEvent).toBeTruthy();
      expect(consultationEvent.data?.prescriptions?.length).toBeGreaterThanOrEqual(1);
      expect(consultationEvent.data?.labTests?.length).toBeGreaterThanOrEqual(1);

      const rateRes = await irRequest()
        .post(`/api/patient/consultation/${createdConsultationId}/rate`)
        .set('Authorization', `Bearer ${qaPatientToken}`)
        .send({ rating: 5, comment: 'Excellent synthetic QA consultation' });
      expect([200, 201]).toContain(rateRes.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 7: PRESCRIPTION CREATION, ALLERGY VALIDATION & PDF DOWNLOAD
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Priority 7 — Prescription Creation, Allergy Conflict Validation & PDF Download', () => {
    test('7.1 Blocks prescription when drug matches patient allergy (ALLERGY_CONFLICT)', async () => {
      const conflictRes = await irRequest()
        .post('/api/prescription/issue')
        .set('Authorization', `Bearer ${demoDoctorToken}`)
        .send({
          patientNic: QA_PATIENT_NIC,
          drugName: 'Amoxicillin 500mg',
          dosage: '500mg',
          frequency: 'TDS',
          durationDays: 5
        });

      expect(conflictRes.status).toBe(400);
      expect(conflictRes.body.error).toBe('ALLERGY_CONFLICT');
    });

    test('7.2 Issues a valid standalone prescription and allows QA Patient to download locked E-Prescription PDF', async () => {
      const issueRes = await irRequest()
        .post('/api/prescription/issue')
        .set('Authorization', `Bearer ${demoDoctorToken}`)
        .send({
          patientNic: QA_PATIENT_NIC,
          drugName: 'Cetirizine',
          dosage: '10mg',
          frequency: 'Once daily at night',
          durationDays: 5
        });

      expect(issueRes.status).toBe(201);
      expect(issueRes.body.prescriptionId).toMatch(/^RX-/);
      createdStandaloneRxId = issueRes.body.prescriptionId;

      const pdfRes = await irRequest()
        .get(`/api/prescription/download/${createdConsultationRef}`)
        .set('Authorization', `Bearer ${qaPatientToken}`)
        .buffer(true);

      expect(pdfRes.status).toBe(200);
      expect(pdfRes.headers['content-type']).toBe('application/pdf');
      expect(pdfRes.headers['cache-control']).toContain('no-store');
      expect(pdfRes.body.length).toBeGreaterThan(500);
    });

    test('7.3 Allows consulting doctor with active consultation relationship to view patient prescriptions while blocking unassigned doctor', async () => {
      // Consulting doctor (demoDoctorToken) who created consultation in 6.1 can retrieve QA_PATIENT_NIC prescriptions
      const consultingDocRes = await irRequest()
        .get(`/api/prescriptions/patient/${QA_PATIENT_NIC}`)
        .set('Authorization', `Bearer ${demoDoctorToken}`);
      expect(consultingDocRes.status).toBe(200);
      const rxIds = (consultingDocRes.body.data || []).map((r) => r.prescriptionId);
      expect(rxIds).toEqual(expect.arrayContaining([createdPrescriptionId, createdStandaloneRxId]));

      // Unassigned doctor (dr.perera@demo.medisync.local) has no consultation or consent with QA_PATIENT_NIC -> 403
      const unassignedLogin = await irRequest()
        .post('/api/auth/login')
        .send({
          email: ownedActors.unassignedDoctor.email,
          password: DEMO_PASSWORD,
          role: 'doctor'
        });
      expect(unassignedLogin.status).toBe(200);
      const unassignedDoctorToken = unassignedLogin.body.data.accessToken;

      const unassignedRes = await irRequest()
        .get(`/api/prescriptions/patient/${QA_PATIENT_NIC}`)
        .set('Authorization', `Bearer ${unassignedDoctorToken}`);
      expect(unassignedRes.status).toBe(403);
      expect(unassignedRes.body.data).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 8: PHARMACY DISPENSING & MEDICATION SAFETY
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Priority 8 — Pharmacy Dispensing, Duplicate Prevention & Medication Safety', () => {
    test('8.1 Pharmacist retrieves pending prescriptions for QA Patient and dispenses prescription', async () => {
      const pendingRes = await irRequest()
        .get(`/api/pharmacy/prescriptions/pending/${QA_PATIENT_NIC}`)
        .set('Authorization', `Bearer ${demoPharmacistToken}`);

      expect(pendingRes.status).toBe(200);
      const rxList = pendingRes.body.data?.prescriptions || [];
      expect(rxList.some((r) => r.prescriptionId === createdPrescriptionId)).toBe(true);

      const dispenseRes = await irRequest()
        .post('/api/pharmacy/dispense')
        .set('Authorization', `Bearer ${demoPharmacistToken}`)
        .send({
          prescriptionId: createdPrescriptionId,
          patientNic: QA_PATIENT_NIC,
          items: [
            {
              drugName: 'Paracetamol 500mg',
              dosage: '500mg',
              quantityDispensed: 5,
              unit: 'tablets',
              status: 'dispensed'
            }
          ],
          notes: 'Dispensed in QA test'
        });

      expect([200, 201]).toContain(dispenseRes.status);
      createdDispensingReceiptNo =
        dispenseRes.body.data?.receiptNumber || dispenseRes.body.receiptNumber;
      expect(createdDispensingReceiptNo).toMatch(/^REC-/);
      const pharmacyAfter = await Pharmacy.findById(ownedActors.pharmacy._id);
      expect(pharmacyAfter.inventory[0].stock).toBe(195);
    });

    test('8.2 Blocks duplicate dispensing of an already-dispensed prescription', async () => {
      const dupRes = await irRequest()
        .post('/api/pharmacy/dispense')
        .set('Authorization', `Bearer ${demoPharmacistToken}`)
        .send({
          prescriptionId: createdPrescriptionId,
          patientNic: QA_PATIENT_NIC,
          items: [{ drugName: 'Paracetamol 500mg', quantityDispensed: 5, unit: 'tablets' }]
        });

      expect(dupRes.status).toBe(400);
      expect(dupRes.body.code).toBe('ALREADY_DISPENSED');
      expect((await Pharmacy.findById(ownedActors.pharmacy._id)).inventory[0].stock).toBe(195);
    });

    test('8.3 Pharmacist retrieves dispensing history, receipt details, stats, and drug catalog search', async () => {
      const histRes = await irRequest()
        .get('/api/pharmacy/history')
        .set('Authorization', `Bearer ${demoPharmacistToken}`);
      expect(histRes.status).toBe(200);

      if (createdDispensingReceiptNo) {
        const recRes = await irRequest()
          .get(`/api/pharmacy/receipt/${createdDispensingReceiptNo}`)
          .set('Authorization', `Bearer ${demoPharmacistToken}`);
        expect(recRes.status).toBe(200);
      }

      const drugRes = await irRequest()
        .get('/api/drugs/search?q=Paracetamol')
        .set('Authorization', `Bearer ${demoPharmacistToken}`);
      expect(drugRes.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 9: LABORATORY TEST APPROVAL & PATIENT AUTHORIZATION
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Priority 9 — Hospital Lab Test Consent OTP & Approval Workflow', () => {
    test('9.1 Hospital Admin requests patient consent OTP, fetches pending doctor-ordered test, and approves it', async () => {
      emailService.__clearCapturedTestEmails();

      const otpRes = await irRequest()
        .post('/api/lab/hospital/request-otp')
        .set('Authorization', `Bearer ${demoHospitalToken}`)
        .send({ patientNic: QA_PATIENT_NIC });
      expect(otpRes.status).toBe(200);

      const captured = emailService.__getCapturedTestEmails();
      const consentEmail = captured.find((e) => e.to.includes(QA_PATIENT_EMAIL) && e.otp);
      expect(consentEmail).toBeTruthy();

      const verifyFetchRes = await irRequest()
        .post('/api/lab/hospital/verify-fetch-tests')
        .set('Authorization', `Bearer ${demoHospitalToken}`)
        .send({ nic: QA_PATIENT_NIC, otp: consentEmail.otp });
      expect(verifyFetchRes.status).toBe(200);
      expect(verifyFetchRes.body.count).toBeGreaterThanOrEqual(1);

      const approveRes = await irRequest()
        .post('/api/lab/hospital/approve-test')
        .set('Authorization', `Bearer ${demoHospitalToken}`)
        .send({
          testId: String(createdLabTestDocId),
          nic: QA_PATIENT_NIC,
          otp: consentEmail.otp
        });
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.reportId).toMatch(/^LAB-\d{4}-/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 10: HOSPITAL & PHARMACY MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Priority 10 — Hospital & Pharmacy Management', () => {
    test('10.1 Hospital Admin accesses hospital stats, profile, linked doctors, and patient list', async () => {
      const statsRes = await irRequest()
        .get('/api/hospital/stats')
        .set('Authorization', `Bearer ${demoHospitalToken}`);
      expect(statsRes.status).toBe(200);

      const profRes = await irRequest()
        .get('/api/hospital/profile')
        .set('Authorization', `Bearer ${demoHospitalToken}`);
      expect(profRes.status).toBe(200);
      expect(profRes.body.data?.name).toContain('General Hospital Colombo');

      const docsRes = await irRequest()
        .get('/api/hospital/doctors')
        .set('Authorization', `Bearer ${demoHospitalToken}`);
      expect(docsRes.status).toBe(200);
      expect(Array.isArray(docsRes.body.data)).toBe(true);

      const patsRes = await irRequest()
        .get('/api/hospital/patients')
        .set('Authorization', `Bearer ${demoHospitalToken}`);
      expect(patsRes.status).toBe(200);
    });

    test('10.2 Pharmacy Admin manages pharmacy profile, staff lifecycle, and inventory', async () => {
      const meRes = await irRequest()
        .get('/api/pharmacy/staff/me')
        .set('Authorization', `Bearer ${demoPharmacistToken}`);
      expect(meRes.status).toBe(200);
      expect(meRes.body.data?.email).toBe(ownedActors.staff.email);

      const addStaffRes = await irRequest()
        .post('/api/pharmacy/staff')
        .set('Authorization', `Bearer ${demoPharmacistToken}`)
        .send({
          name: 'QA Temp Pharmacist',
          email: QA_PHARMACY_STAFF_EMAIL,
          role: 'pharmacist'
        });
      expect(addStaffRes.status).toBe(201);

      const staffListRes = await irRequest()
        .get('/api/pharmacy/staff')
        .set('Authorization', `Bearer ${demoPharmacistToken}`);
      expect(staffListRes.status).toBe(200);
      const addedStaff = (staffListRes.body.data || []).find(
        (s) => s.email === QA_PHARMACY_STAFF_EMAIL
      );
      expect(addedStaff).toBeTruthy();
      createdQaStaffId = addedStaff._id;

      const toggleStaffRes = await irRequest()
        .put(`/api/pharmacy/staff/${createdQaStaffId}/toggle`)
        .set('Authorization', `Bearer ${demoPharmacistToken}`);
      expect(toggleStaffRes.status).toBe(200);
      expect(toggleStaffRes.body.data?.isActive).toBe(false);

      const invRes = await irRequest()
        .get('/api/pharmacy/inventory')
        .set('Authorization', `Bearer ${demoPharmacistToken}`);
      expect(invRes.status).toBe(200);
      expect(Array.isArray(invRes.body.data)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 11: OUTBREAK SURVEILLANCE & PUBLIC DIRECTORY PUBLICATION SAFETY
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Priority 11 — Outbreak Surveillance & Public Directory Safety', () => {
    test('11.1 Retrieves active synthetic outbreak alerts, disease trends, and latest broadcast', async () => {
      // Legacy university alerts lack verified provenance and must stay unpublished.
      // Owned simulation signals retain the positive reviewer-visibility assertion.
      const sources = await OutbreakAlert.find({ datasetVersion:'MEDISYNC_UNIV_DEMO_V2' }).select('_id');
      expect(sources.length).toBe(2);
      const ownedSignals = [];
      for (const source of sources) ownedSignals.push(await qa.clone(OutbreakAlert, { _id:source._id }, {
        surveillancePolicy:'5w-verified-episodes-v1',isSimulation:true,isSynthetic:true,isDemoData:true,status:'Pending',sourceConsultationIds:[],
        approvedBy:undefined,approvedAt:undefined,emailScope:'none'
      }));
      const activeRes = await irRequest()
        .get('/api/alerts/active?mode=simulation')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(activeRes.status).toBe(200);
      const alerts = activeRes.body.data || activeRes.body || [];
      expect(Array.isArray(alerts)).toBe(true);
      expect(alerts.length).toBeGreaterThanOrEqual(2);
      for (const signal of ownedSignals) expect(alerts.some(alert => String(alert._id) === String(signal._id))).toBe(true);
      const realAlerts = await irRequest().get('/api/alerts/active').set('Authorization', `Bearer ${superAdminToken}`);
      expect(realAlerts.status).toBe(200);
      for (const signal of ownedSignals) expect(realAlerts.body.data.some(alert => String(alert._id) === String(signal._id))).toBe(false);
      const patientSignals = await irRequest().get('/api/alerts/active?mode=simulation').set('Authorization', `Bearer ${qaPatientToken}`);
      expect(patientSignals.status).toBe(403);

      const trendsRes = await irRequest()
        .get('/api/alerts/trends')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(trendsRes.status).toBe(200);

      const latestBroadcastRes = await irRequest()
        .get('/api/alerts/broadcasts/latest')
        .set('Authorization', `Bearer ${qaPatientToken}`);
      expect(latestBroadcastRes.status).toBe(200);
      expect(latestBroadcastRes.body.data).toBeNull();
    });

    test('11.2 Enforces strict doctor publication safety on /api/public/doctors and returns public directories', async () => {
      // Verified/non-verified non-synthetic objects exist ONLY in the pure VM seam.
      // The positive policy and private-field assertions remain substantive there.
      await require('./helpers/doctorPublicationCases').verifiedPublication(expect);
      const pubDocsRes = await irRequest().get('/api/public/doctors');
      expect(pubDocsRes.status).toBe(200);
      const publishedDoctors = pubDocsRes.body.data?.doctors || pubDocsRes.body.data || [];
      expect(publishedDoctors.length).toBeGreaterThanOrEqual(1);
      for (const doc of publishedDoctors) {
        expect(doc.isVerified).toBe(true); expect(doc.isActive).toBe(true);
        expect(doc.licenseNo).toBeUndefined(); expect(doc.password).toBeUndefined();
        if (doc.isSynthetic) {
          expect(doc.datasetVersion).toBe('MEDISYNC_UNIV_DEMO_V2');
          expect(doc.syntheticLabel).toBe('Demo Doctor — Synthetic Profile');
          expect(doc.slmcRegistered).toBe(false);
        }
      }
      // These owned clones are deliberately NOT approved university profiles.
      expect(publishedDoctors.some(doc => doc.email === ownedActors.doctor.email)).toBe(false);
      const pubHospRes = await irRequest().get('/api/public/hospitals');
      expect(pubHospRes.status).toBe(200);
      expect((pubHospRes.body.data || []).length).toBeGreaterThanOrEqual(3);
      for (const hosp of pubHospRes.body.data || []) if (hosp.isSynthetic) expect(hosp.syntheticLabel).toBe('Demo Hospital — Synthetic Profile');
      const pubPharmRes = await irRequest().get('/api/public/pharmacies');
      expect(pubPharmRes.status).toBe(200);
      expect((pubPharmRes.body.data || []).length).toBeGreaterThanOrEqual(2);
      for (const pharm of pubPharmRes.body.data || []) if (pharm.isSynthetic) expect(pharm.syntheticLabel).toBe('Demo Pharmacy — Synthetic Profile');
      expect((await irRequest().get('/api/public/health-stats')).status).toBe(200);
    });

    test('11.3 Positive & Negative tests for ALLOW_SYNTHETIC_DEMO_DIRECTORY flag (demo mode vs production mode)', async () => {
      // In-memory rejected profiles and simulated production mode never touch Atlas
      // or change this Jest process's NODE_ENV/provider configuration.
      await require('./helpers/doctorPublicationCases').syntheticPublication(expect);
      const prevAllowFlag = process.env.ALLOW_SYNTHETIC_DEMO_DIRECTORY;
      try {
        process.env.ALLOW_SYNTHETIC_DEMO_DIRECTORY = 'true';
        const demoDirRes = await irRequest().get('/api/public/doctors');
        expect(demoDirRes.status).toBe(200);
        const demoDocs = demoDirRes.body.data || [];
        expect(demoDocs.length).toBe(5);
        expect(demoDocs.some(doc => doc.email === 'dr.silva@demo.medisync.local')).toBe(true);
        for (const doc of demoDocs) {
          expect(doc.isSynthetic).toBe(true); expect(doc.isVerified).toBe(true);
          expect(doc.datasetVersion).toBe('MEDISYNC_UNIV_DEMO_V2');
          expect(doc.syntheticLabel).toBe('Demo Doctor — Synthetic Profile'); expect(doc.slmcRegistered).toBe(false);
          expect(doc.licenseNo).toBeUndefined(); expect(doc.password).toBeUndefined();
        }
        process.env.ALLOW_SYNTHETIC_DEMO_DIRECTORY = 'false';
        const disabledFlagRes = await irRequest().get('/api/public/doctors');
        expect(disabledFlagRes.status).toBe(200);
        expect((disabledFlagRes.body.data || []).some(doc => doc.isSynthetic === true)).toBe(false);
      } finally {
        if (prevAllowFlag === undefined) delete process.env.ALLOW_SYNTHETIC_DEMO_DIRECTORY;
        else process.env.ALLOW_SYNTHETIC_DEMO_DIRECTORY = prevAllowFlag;
      }
    });
  });
});
