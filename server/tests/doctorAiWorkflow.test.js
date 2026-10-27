require('./helpers/qaEnvironment');
const qa = require('./helpers/ownedFixtures');
jest.mock('axios',()=>({post:jest.fn(async url=>({data:String(url).includes('predict-disease')?{predictions:[{disease:'Dengue',icdCode:'A90',score:75}]}:{riskScore:0.1,riskLevel:'low'}}))}));
jest.mock('uuid',()=>({v4:()=>require('crypto').randomUUID()}));

global.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
global.ENCRYPTION_KEYS = { '1': process.env.ENCRYPTION_KEY };
global.ACTIVE_KEY_VERSION = 1;

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const crypto = require('crypto');
const Doctor = require('../src/models/Doctor');
const Patient = require('../src/models/Patient');
const Consultation = require('../src/models/Consultation');
const SessionToken = require('../src/models/SessionToken');
const { connectAutomatedTestDB } = require('../src/config/dbGuard');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/doctor', require('../src/routes/doctorRoutes'));
  app.use('/api/drugs', require('../src/routes/drugRoutes'));
  return app;
}

describe('Stage 4 — Doctor AI Symptom Workflow & Dual ICD Persistence Suite', () => {
  let app;
  let doctorToken;
  let testDoctorId;
  let testSessionId;
  let testPatientNic;
  let testPatientId;
  let createdConsultationId;

  beforeAll(async () => {
    await connectAutomatedTestDB();
    app = buildApp();

    // Use a synthetic test doctor
    const doc = await qa.clone(Doctor, { email: 'dr.silva@demo.medisync.local' });
    if (!doc) throw new Error('No synthetic demo doctor found');
    testDoctorId = doc._id;

    doctorToken = jwt.sign(
      { id: doc._id.toString(), email: doc.email, role: 'doctor', isVerified: true },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const tokenHash = crypto.createHash('sha256').update(doctorToken).digest('hex');
    const session = await SessionToken.create({
      userId: doc._id,
      userModel: 'Doctor',
      tokenHash,
      isValid: true,
      expiredAt: new Date(Date.now() + 3600 * 1000)
    });
    testSessionId = session._id;

    // Use a synthetic test patient
    const pat = await qa.clone(Patient, { email: 'kamal.patient@demo.medisync.local' });
    if (!pat) throw new Error('No synthetic demo patient found');
    testPatientNic = pat.nic;
    testPatientId = pat._id;
  });


  test('1. Predict disease endpoint accepts symptoms and returns structured candidates', async () => {
    const res = await request(app)
      .post('/api/doctor/predict-disease')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ symptoms: ['high fever', 'skin rash', 'joint pain', 'vomiting'] });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('predictions');
    expect(Array.isArray(res.body.predictions)).toBe(true);
    expect(res.body.predictions.length).toBeGreaterThan(0);
    const top = res.body.predictions[0];
    expect(top).toHaveProperty('disease');
  });

  test('2. Dual ICD search retrieves both ICD-10 and WHO ICD-11 results', async () => {
    const res = await request(app)
      .get('/api/drugs/icd/search?q=dengue&version=all')
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    const items = res.body.data;
    expect(items.some(i => i.version === 'ICD-10')).toBe(true);
    expect(items.some(i => i.version === 'ICD-11')).toBe(true);
  });

  test('3. Doctor saves consultation with clinician-selected WHO ICD-11 diagnosis', async () => {
    // Generate valid patient access token for testing
    const patientAccessToken = jwt.sign(
      { nic: testPatientNic, authorizedRole: 'doctor', doctorId: testDoctorId.toString() },
      process.env.JWT_SECRET,
      { expiresIn: '30m' }
    );

    const consultationPayload = {
      patientNic: testPatientNic,
      symptoms: ['high fever', 'joint pain'],
      diagnosis: 'Dengue',
      icdCode: '1D20',
      icdDescription: 'Dengue without warning signs',
      icdVersion: 'ICD-11',
      clinicalNotes: 'Evaluated with Stage 4 Doctor AI workflow test',
      isFollowUpRequired: true
    };

    const res = await request(app)
      .post('/api/doctor/consultation')
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('x-patient-access', patientAccessToken)
      .send(consultationPayload);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('consultationId');
    createdConsultationId = res.body.consultationId;
  });

  test('4. Reopening saved consultation retrieves accurate ICD-11 diagnosis and version', async () => {
    expect(createdConsultationId).toBeDefined();

    const saved = await Consultation.findById(createdConsultationId);
    expect(saved).toBeDefined();
    expect(saved.icdCode).toBe('1D20');
    expect(saved.icdVersion).toBe('ICD-11');
    expect(saved.diagnosis).toBe('Dengue');
    expect(saved.patientNic).toBe(testPatientNic);
  });

  afterAll(async () => { try { await qa.cleanup(); } finally { await mongoose.disconnect(); } });
});
