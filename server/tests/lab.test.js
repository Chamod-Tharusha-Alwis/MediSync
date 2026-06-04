// server/tests/lab.test.js
// ─────────────────────────────────────────────────────────────────────────────
// Real-World Integration Tests — Zero-Trust Lab Module
// No mocks. Real MongoDB, Real Cloudinary, Real ML Engine (localhost:5001).
// ─────────────────────────────────────────────────────────────────────────────

const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const mongoose = require('mongoose');
const jwt      = require('jsonwebtoken');
const request  = require('supertest');
const express  = require('express');

// ── Load environment variables ───────────────────────────────────────────────
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Set global encryption key BEFORE models are required
// (mongoose-field-encryption reads this at require-time)
global.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

// ── Models ───────────────────────────────────────────────────────────────────
const Patient      = require('../src/models/Patient');
const Hospital     = require('../src/models/Hospital');
const Doctor       = require('../src/models/Doctor');
const LabTest      = require('../src/models/LabTest');
const SessionToken = require('../src/models/SessionToken');

// ── Build Express app with only lab routes ───────────────────────────────────
const labRoutes = require('../src/routes/labRoutes');
const { _otpHelpers, OTP_NS_HOSPITAL } = require('../src/controllers/labController');
const { setOtp, getOtp, deleteOtp } = _otpHelpers;
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/lab', labRoutes);

// ── Constants ────────────────────────────────────────────────────────────────
const JWT_SECRET    = process.env.JWT_SECRET;
const TEST_NIC      = '200012345678';
const TEST_DB_NAME  = 'medisync_test_lab';

// Robust parsing to inject the test database name into the MONGO_URI string
const getTestUri = (uri, dbName) => {
  const qIdx = uri.indexOf('?');
  const base = qIdx !== -1 ? uri.substring(0, qIdx) : uri;
  const query = qIdx !== -1 ? uri.substring(qIdx) : '';
  const protoEnd = base.startsWith('mongodb+srv://') ? 14 : 10;
  const lastSlash = base.lastIndexOf('/');
  if (lastSlash > protoEnd) {
    return base.substring(0, lastSlash) + '/' + dbName + query;
  } else {
    return base + '/' + dbName + query;
  }
};

const MONGO_TEST_URI = process.env.MONGO_URI_TEST || getTestUri(process.env.MONGO_URI, TEST_DB_NAME);

// ── Helpers ──────────────────────────────────────────────────────────────────
const nicHash = (nic) => crypto.createHash('sha256').update(nic.trim()).digest('hex');

/**
 * Creates a JWT token AND a matching SessionToken document in the test DB
 * so the real auth middleware can verify the session.
 */
async function createAuthToken(payload) {
  const token     = jwt.sign(payload, JWT_SECRET, { expiresIn: '30m' });
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  await SessionToken.create({
    userId:    payload.id,
    userModel: payload.role === 'patient' ? 'Patient' : payload.role === 'doctor' ? 'Doctor' : 'Hospital',
    tokenHash,
    isValid:   true,
  });

  return token;
}

/**
 * Seeds a Patient via Mongoose (so field-level encryption runs on fullName,
 * contactInfo, allergies), then injects the nic_bi blind-index hash via the
 * native MongoDB driver (because the Patient schema doesn't declare nic_bi,
 * and Mongoose strict mode would strip it from a normal .save() call).
 *
 * This mirrors what the production auth/registration flow does.
 */
async function seedPatient(nic, data) {
  const doc = await Patient.create({ nic, ...data });

  // Inject the blind-index that the labController queries against
  await Patient.collection.updateOne(
    { _id: doc._id },
    { $set: { patientNic_bi: nicHash(nic) } }
  );

  return doc;
}

/**
 * Creates a minimal 1 KB dummy PDF file for upload tests.
 */
function createDummyPdf() {
  const dummyPath = path.join(__dirname, 'dummy_report.pdf');
  if (!fs.existsSync(dummyPath)) {
    // Minimal valid PDF structure
    const pdfContent =
      '%PDF-1.4\n' +
      '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
      '3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\n' +
      'xref\n0 4\n' +
      '0000000000 65535 f \n' +
      '0000000009 00000 n \n' +
      '0000000058 00000 n \n' +
      '0000000115 00000 n \n' +
      'trailer<</Size 4/Root 1 0 R>>\n' +
      'startxref\n204\n%%EOF\n';
    fs.writeFileSync(dummyPath, pdfContent);
  }
  return dummyPath;
}

/**
 * Helper to create a lab test via the API and return the labTestId.
 * Calls the hospital OTP endpoint first, extracts the OTP from the
 * exported in-memory store, then passes it to /accept.
 * Asserts the creation succeeded (201) so downstream tests fail clearly.
 */
async function createLabTestViaApi(token, nic, testName, testCategory) {
  // Step 1: Request consent OTP
  const otpRes = await request(app)
    .post('/api/lab/hospital/request-otp')
    .set('Authorization', `Bearer ${token}`)
    .send({ patientNic: nic });

  if (otpRes.status !== 200) {
    throw new Error(
      `[Test Helper] requestHospitalOtp failed with ${otpRes.status}: ${JSON.stringify(otpRes.body)}`
    );
  }

  // Step 2: Extract OTP from the Redis-backed store
  const hash = nicHash(nic);
  const stored = await getOtp(OTP_NS_HOSPITAL + hash);
  if (!stored) {
    throw new Error('[Test Helper] OTP not found in Redis/memory store after request');
  }

  // Step 3: Accept lab test with the OTP
  const res = await request(app)
    .post('/api/lab/accept')
    .set('Authorization', `Bearer ${token}`)
    .send({
      nic,
      testName,
      testCategory: testCategory || 'Other',
      urgency:      'routine',
      otp:          stored.otp,
    });

  if (res.status !== 201) {
    throw new Error(
      `[Test Helper] createLabTestViaApi failed with ${res.status}: ${JSON.stringify(res.body)}`
    );
  }
  return res.body.labTestId;
}

/**
 * Helper to upload a report PDF for a given lab test ID.
 * Asserts the upload succeeded (200).
 */
async function uploadReportViaApi(token, labTestId) {
  const dummyPdf = createDummyPdf();
  const res = await request(app)
    .post(`/api/lab/${labTestId}/upload-report`)
    .set('Authorization', `Bearer ${token}`)
    .attach('report', dummyPdf);

  if (res.status !== 200) {
    throw new Error(
      `[Test Helper] uploadReportViaApi failed with ${res.status}: ${JSON.stringify(res.body)}`
    );
  }
  return res;
}

// ── Shared state across tests ────────────────────────────────────────────────
let hospitalDoc, patientDoc, doctorDoc;
let hospitalToken, patientToken, doctorToken;
let createdLabTestId;

// ─────────────────────────────────────────────────────────────────────────────
// SETUP & TEARDOWN
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await mongoose.connect(MONGO_TEST_URI);
  console.log(`[Test] Connected to test DB: ${MONGO_TEST_URI}`);
  try {
    await mongoose.connection.db.dropDatabase();
    console.log('[Test] Clean startup: Test DB dropped.');
  } catch (err) {
    console.warn('[Test] Warning dropping DB during startup:', err.message);
  }
}, 30000);

afterAll(async () => {
  await mongoose.connection.db.dropDatabase();
  console.log('[Test] Test database dropped.');
  await mongoose.connection.close();

  // Clean up dummy PDF
  const dummyPath = path.join(__dirname, 'dummy_report.pdf');
  if (fs.existsSync(dummyPath)) fs.unlinkSync(dummyPath);
}, 15000);

beforeEach(async () => {
  // Clear all collections before each test
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }

  // ── Seed Hospital ──────────────────────────────────────────────────────────
  hospitalDoc = await Hospital.create({
    name:     'MediSync General Hospital',
    type:     'government',
    district: 'Colombo',
    address:  '123 Hospital Road, Colombo',
    regNo:    'HOSP-TEST-001',
    email:    'hospital-test@medisync.lk',
    password: 'hashedpassword123',
  });

  // ── Seed Patient (with nic_bi blind index) ─────────────────────────────────
  patientDoc = await seedPatient(TEST_NIC, {
    fullName:    'Kamal Perera',
    dateOfBirth: new Date('2000-05-15'),
    gender:      'Male',
    district:    'Colombo',
    contactInfo: '0771234567',
    email:       'kamal.test@medisync.lk',
    password:    'hashedpassword456',
  });

  // ── Seed Doctor ────────────────────────────────────────────────────────────
  doctorDoc = await Doctor.create({
    doctorId:       'DOC-TEST-001',
    fullName:       'Dr. Nimal Silva',
    email:          'nimal.doctor@medisync.lk',
    password:       'hashedpassword789',
    specialization: 'Pathology',
    licenseNo:      'SLMC-T-0001',
    hospitals:      [hospitalDoc._id],
    role:           'doctor',
  });

  // ── Generate real JWT tokens with matching SessionToken entries ─────────
  // The JWT payload fields must match what each controller destructures
  // from req.user (which is set to the decoded JWT by the auth middleware).

  hospitalToken = await createAuthToken({
    id:         hospitalDoc._id,      // auth middleware uses decoded.id
    role:       'hospital_admin',      // RBAC match for lab routes
    hospitalId: hospitalDoc._id,      // acceptLabTest: req.user.hospitalId
    userId:     hospitalDoc._id,      // acceptLabTest: req.user.userId
    email:      'admin@test.medisync.lk',
  });

  patientToken = await createAuthToken({
    id:   patientDoc._id,
    role: 'patient',
    sub:  TEST_NIC,
    nic:  TEST_NIC,                   // getMyLabTests/patientDownload: req.user.nic
  });

  doctorToken = await createAuthToken({
    id:     doctorDoc._id,
    role:   'doctor',
    sub:    'DOC-TEST-001',
    userId: doctorDoc._id,            // doctorRequestOtp: req.user.userId
    email:  'nimal.doctor@medisync.lk', // doctorRequestOtp: req.user.email
    name:   'Dr. Nimal Silva',        // doctorRequestOtp: req.user.name
  });
}, 15000);

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE
// ─────────────────────────────────────────────────────────────────────────────

describe('Zero-Trust Lab Module — Integration Tests', () => {

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 1: Hospital Admin creates a lab test
  // ═══════════════════════════════════════════════════════════════════════════
  describe('POST /api/lab/accept', () => {

    it('should reject unauthenticated requests', async () => {
      const res = await request(app)
        .post('/api/lab/accept')
        .send({ nic: TEST_NIC, testName: 'Full Blood Count', otp: '123456' });

      expect(res.status).toBe(401);
    });

    it('should reject patients from creating lab tests', async () => {
      const res = await request(app)
        .post('/api/lab/accept')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ nic: TEST_NIC, testName: 'Full Blood Count', otp: '123456' });

      expect(res.status).toBe(403);
    });

    it('should reject requests with missing required fields', async () => {
      const res = await request(app)
        .post('/api/lab/accept')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ nic: TEST_NIC }); // missing testName

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('required');
    });

    it('should reject requests without a consent OTP', async () => {
      const res = await request(app)
        .post('/api/lab/accept')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          nic:      TEST_NIC,
          testName: 'Full Blood Count',
          // no OTP
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('OTP is required');
    });

    it('should reject requests with an invalid OTP', async () => {
      // First request a real OTP
      await request(app)
        .post('/api/lab/hospital/request-otp')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ patientNic: TEST_NIC });

      const res = await request(app)
        .post('/api/lab/accept')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          nic:      TEST_NIC,
          testName: 'Full Blood Count',
          otp:      '000000', // wrong OTP
        });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Invalid OTP');
    });

    it('should reject requests with an expired OTP', async () => {
      // Request OTP
      await request(app)
        .post('/api/lab/hospital/request-otp')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ patientNic: TEST_NIC });

      // Manually expire the OTP in the store
      const hash = nicHash(TEST_NIC);
      const stored = await getOtp(OTP_NS_HOSPITAL + hash);
      stored.expiresAt = Date.now() - 1000; // expired 1s ago
      await setOtp(OTP_NS_HOSPITAL + hash, stored, 60); // re-save with expired timestamp

      const res = await request(app)
        .post('/api/lab/accept')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          nic:      TEST_NIC,
          testName: 'Full Blood Count',
          otp:      stored.otp,
        });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('expired');
    });

    it('should successfully create a lab test with a valid consent OTP', async () => {
      // Step 1: Request OTP
      const otpRes = await request(app)
        .post('/api/lab/hospital/request-otp')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ patientNic: TEST_NIC });

      expect(otpRes.status).toBe(200);
      expect(otpRes.body.message).toContain('Consent OTP sent');

      // Step 2: Extract OTP from store
      const hash = nicHash(TEST_NIC);
      const stored = await getOtp(OTP_NS_HOSPITAL + hash);
      expect(stored).toBeTruthy();

      // Step 3: Create lab test with OTP
      const res = await request(app)
        .post('/api/lab/accept')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          nic:          TEST_NIC,
          testName:     'Full Blood Count',
          testCategory: 'Haematology',
          urgency:      'routine',
          notes:        'Fasting sample required',
          otp:          stored.otp,
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Lab test registered successfully');
      expect(res.body.labTestId).toMatch(/^LT-\d{8}-\d{4}$/);

      // Save for subsequent tests
      createdLabTestId = res.body.labTestId;

      // Verify the record exists in the database
      const dbRecord = await LabTest.findOne({ labTestId: createdLabTestId });
      expect(dbRecord).not.toBeNull();
      expect(dbRecord.status).toBe('pending');
      expect(dbRecord.patientNic_bi).toBe(nicHash(TEST_NIC));

      // Verify OTP was consumed (one-time use)
      const consumedOtp = await getOtp(OTP_NS_HOSPITAL + hash);
      expect(consumedOtp).toBeNull();
    });

    it('should return 404 when patient NIC is not registered', async () => {
      // Request OTP for a non-existent NIC should fail at OTP stage
      const res = await request(app)
        .post('/api/lab/hospital/request-otp')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ patientNic: '000000000000' });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('No registered patient');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 2: Hospital Admin uploads a PDF report → ML Engine → Cloudinary
  // ═══════════════════════════════════════════════════════════════════════════
  describe('POST /api/lab/:labTestId/upload-report', () => {

    beforeEach(async () => {
      createdLabTestId = await createLabTestViaApi(
        hospitalToken, TEST_NIC, 'Liver Function Test', 'Biochemistry'
      );
    });

    it('should reject upload without a file', async () => {
      const res = await request(app)
        .post(`/api/lab/${createdLabTestId}/upload-report`)
        .set('Authorization', `Bearer ${hospitalToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('No PDF');
    });

    it('should encrypt via ML Engine, upload to Cloudinary, and return a secure_url', async () => {
      const dummyPdf = createDummyPdf();

      const res = await request(app)
        .post(`/api/lab/${createdLabTestId}/upload-report`)
        .set('Authorization', `Bearer ${hospitalToken}`)
        .attach('report', dummyPdf);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Report uploaded and encrypted successfully');

      // Verify the database was updated with a Cloudinary URL
      const dbRecord = await LabTest.findOne({ labTestId: createdLabTestId });
      expect(dbRecord.reportPath).toBeTruthy();
      expect(dbRecord.reportPath).toMatch(/^https:\/\/res\.cloudinary\.com\//);
      expect(dbRecord.status).toBe('report_ready');
      expect(dbRecord.reportUploadedAt).toBeTruthy();
    }, 45000); // Extended timeout for ML Engine + Cloudinary round-trip
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 3: Doctor requests OTP → email sent to patient
  // ═══════════════════════════════════════════════════════════════════════════
  describe('POST /api/lab/doctor/request-otp/:labTestId', () => {

    beforeEach(async () => {
      createdLabTestId = await createLabTestViaApi(
        hospitalToken, TEST_NIC, 'Thyroid Panel', 'Biochemistry'
      );
      await uploadReportViaApi(hospitalToken, createdLabTestId);
    }, 45000);

    it('should reject unauthenticated OTP requests', async () => {
      const res = await request(app)
        .post(`/api/lab/doctor/request-otp/${createdLabTestId}`);

      expect(res.status).toBe(401);
    });

    it('should reject patients from requesting OTPs', async () => {
      const res = await request(app)
        .post(`/api/lab/doctor/request-otp/${createdLabTestId}`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(403);
    });

    it('should successfully send OTP to the patient email (Zero-Trust)', async () => {
      const res = await request(app)
        .post(`/api/lab/doctor/request-otp/${createdLabTestId}`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('OTP sent');
      expect(res.body.expiresInMinutes).toBe(10);
    }, 15000);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 4: Patient downloads the locked (encrypted) PDF
  // ═══════════════════════════════════════════════════════════════════════════
  describe('GET /api/lab/patient/download/:labTestId', () => {

    beforeEach(async () => {
      createdLabTestId = await createLabTestViaApi(
        hospitalToken, TEST_NIC, 'Urinalysis', 'Urine Analysis'
      );
      await uploadReportViaApi(hospitalToken, createdLabTestId);
    }, 45000);

    it('should reject unauthenticated download requests', async () => {
      const res = await request(app)
        .get(`/api/lab/patient/download/${createdLabTestId}`);

      expect(res.status).toBe(401);
    });

    it('should reject doctors from downloading patient reports directly', async () => {
      const res = await request(app)
        .get(`/api/lab/patient/download/${createdLabTestId}`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(403);
    });

    it('should serve the encrypted PDF to the authenticated patient', async () => {
      const res = await request(app)
        .get(`/api/lab/patient/download/${createdLabTestId}`)
        .set('Authorization', `Bearer ${patientToken}`)
        .buffer(true);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain(`${createdLabTestId}_encrypted_report.pdf`);

      // Verify we received actual binary PDF data
      expect(res.body).toBeInstanceOf(Buffer);
      expect(res.body.length).toBeGreaterThan(0);
    }, 30000);

    it('should return 404 for a lab test that does not belong to the patient', async () => {
      // Create a different patient with its own nic_bi blind index
      const otherPatient = await seedPatient('999988887777', {
        fullName:    'Other Person',
        dateOfBirth: new Date('1990-01-01'),
        gender:      'Female',
        district:    'Kandy',
        contactInfo: '0779999999',
        email:       'other@medisync.lk',
        password:    'hashed',
      });

      const otherToken = await createAuthToken({
        id:   otherPatient._id,
        role: 'patient',
        sub:  '999988887777',
        nic:  '999988887777',
      });

      const res = await request(app)
        .get(`/api/lab/patient/download/${createdLabTestId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('not found or not linked');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 5: Public status check (no auth needed)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('GET /api/public/lab/:labTestId/status', () => {

    beforeEach(async () => {
      createdLabTestId = await createLabTestViaApi(
        hospitalToken, TEST_NIC, 'COVID-19 PCR'
      );
    });

    it('should return lab test status without authentication', async () => {
      const res = await request(app)
        .get(`/api/lab/public/${createdLabTestId}/status`);

      expect(res.status).toBe(200);
      expect(res.body.labTestId).toBe(createdLabTestId);
      expect(res.body.testName).toBe('COVID-19 PCR');
      expect(res.body.status).toBe('pending');
    });

    it('should return 404 for a non-existent lab test ID', async () => {
      const res = await request(app).get('/api/lab/public/INVALID-123/status');

      expect(res.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 6: Patient views their lab tests
  // ═══════════════════════════════════════════════════════════════════════════
  describe('GET /api/lab/patient/my-tests', () => {

    beforeEach(async () => {
      // Create two lab tests for the same patient via the real API
      await createLabTestViaApi(hospitalToken, TEST_NIC, 'Test A', 'Haematology');
      await createLabTestViaApi(hospitalToken, TEST_NIC, 'Test B', 'Biochemistry');
    });

    it('should return all lab tests for the authenticated patient', async () => {
      const res = await request(app)
        .get('/api/lab/patient/my-tests')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });

    it('should return empty array for a patient with no tests', async () => {
      const emptyPatient = await seedPatient('111122223333', {
        fullName:    'Empty Patient',
        dateOfBirth: new Date('1995-01-01'),
        gender:      'Male',
        district:    'Galle',
        contactInfo: '0770000000',
        email:       'empty@medisync.lk',
        password:    'hashed',
      });

      const emptyToken = await createAuthToken({
        id:   emptyPatient._id,
        role: 'patient',
        sub:  '111122223333',
        nic:  '111122223333',
      });

      const res = await request(app)
        .get('/api/lab/patient/my-tests')
        .set('Authorization', `Bearer ${emptyToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 7: Status update flow
  // ═══════════════════════════════════════════════════════════════════════════
  describe('PATCH /api/lab/:labTestId/status', () => {

    beforeEach(async () => {
      createdLabTestId = await createLabTestViaApi(
        hospitalToken, TEST_NIC, 'Lipid Panel'
      );
    });

    it('should allow hospital admin to update status', async () => {
      const res = await request(app)
        .patch(`/api/lab/${createdLabTestId}/status`)
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ status: 'sample_collected', note: 'Sample taken at 10am' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('sample_collected');

      // Verify in DB
      const dbRecord = await LabTest.findOne({ labTestId: createdLabTestId });
      expect(dbRecord.status).toBe('sample_collected');
      expect(dbRecord.statusHistory.length).toBe(2); // pending + sample_collected
    });

    it('should reject invalid status values', async () => {
      const res = await request(app)
        .patch(`/api/lab/${createdLabTestId}/status`)
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ status: 'invalid_status' });

      expect(res.status).toBe(400);
    });

    it('should track full status lifecycle progression', async () => {
      const statuses = ['sample_collected', 'processing', 'report_ready'];

      for (const status of statuses) {
        const res = await request(app)
          .patch(`/api/lab/${createdLabTestId}/status`)
          .set('Authorization', `Bearer ${hospitalToken}`)
          .send({ status });

        expect(res.status).toBe(200);
      }

      const dbRecord = await LabTest.findOne({ labTestId: createdLabTestId });
      expect(dbRecord.status).toBe('report_ready');
      // pending + sample_collected + processing + report_ready = 4
      expect(dbRecord.statusHistory.length).toBe(4);
    });
  });
});
