const axios = require('axios');
const mongoose = require('mongoose');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Color formatting utilities for console
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m'
};

const print = (color, text) => console.log(`${color}${text}${colors.reset}`);

// Targets
const BACKEND_URL = 'http://127.0.0.2:5005';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/medisync';

// Dummy Test Data
const DUMMY_PATIENT = {
  fullName: 'Dummy Patient',
  email: 'dummy.patient3@medisync.lk',
  password: 'Password123!',
  nic: '999888773V',
  dateOfBirth: '1999-08-08',
  gender: 'Male',
  contactInfo: '0771234567'
};

const DUMMY_DOCTOR = {
  fullName: 'Dummy Doctor',
  email: 'dummy.doctor3@medisync.lk',
  password: 'Password123!',
  licenseNo: 'LIC-99998',
  specialization: 'General Medicine'
};

async function runE2E() {
  print(colors.magenta, '\n==================================================');
  print(colors.magenta, '   🚀 MEDISYNC BACKEND API E2E VALIDATOR          ');
  print(colors.magenta, '==================================================\n');

  print(colors.cyan, `Using Backend API Endpoint: ${BACKEND_URL}`);
  print(colors.cyan, `Using MongoDB URI: ${MONGO_URI.replace(/:([^:@]+)@/, ':****@')}\n`);

  let dbConnection = null;

  try {
    // -------------------------------------------------------------------------
    // Setup: Connect to MongoDB and clean up previous dummy records
    // -------------------------------------------------------------------------
    print(colors.yellow, 'Setting up: Cleaning previous dummy records from MongoDB...');
    dbConnection = await mongoose.connect(MONGO_URI);
    
    // Import Schemas / Define inline to avoid path import issues
    const Patient = mongoose.models.Patient || mongoose.model('Patient', new mongoose.Schema({}, { strict: false }), 'patients');
    const Doctor = mongoose.models.Doctor || mongoose.model('Doctor', new mongoose.Schema({}, { strict: false }), 'doctors');
    const LabTest = mongoose.models.LabTest || mongoose.model('LabTest', new mongoose.Schema({}, { strict: false }), 'labtests');
    const Consultation = mongoose.models.Consultation || mongoose.model('Consultation', new mongoose.Schema({}, { strict: false }), 'consultations');
    const SessionToken = mongoose.models.SessionToken || mongoose.model('SessionToken', new mongoose.Schema({}, { strict: false }), 'sessiontokens');

    await Patient.deleteMany({ email: DUMMY_PATIENT.email });
    // Also clean up by NIC
    await Patient.deleteMany({ nic: DUMMY_PATIENT.nic });
    const hashedNic = crypto.createHash('sha256').update(DUMMY_PATIENT.nic).digest('hex');
    await Patient.deleteMany({ patientNic_bi: hashedNic });

    await Doctor.deleteMany({ email: DUMMY_DOCTOR.email });
    await LabTest.deleteMany({ patientNic: DUMMY_PATIENT.nic });
    await LabTest.deleteMany({ patientNic_bi: hashedNic });
    await Consultation.deleteMany({ patientNic: DUMMY_PATIENT.nic });
    await Consultation.deleteMany({ patientNic_bi: hashedNic });

    print(colors.green, '✅ Setup Complete: MongoDB database cleaned.');

    // -------------------------------------------------------------------------
    // Step 1: Auth Flow (Register dummy Patient & Doctor, Login Doctor)
    // -------------------------------------------------------------------------
    print(colors.yellow, '\nExecuting Step 1: Auth Flow...');
    
    // Register Patient
    print(colors.cyan, ` -> Registering patient: ${DUMMY_PATIENT.fullName} (NIC: ${DUMMY_PATIENT.nic})...`);
    const patientRegRes = await axios.post(`${BACKEND_URL}/api/auth/register-patient`, DUMMY_PATIENT);
    if (patientRegRes.status === 201) {
      print(colors.green, '   ✅ Passed: Patient registered successfully.');
    } else {
      throw new Error(`Patient registration failed with status: ${patientRegRes.status}`);
    }

    // Register Doctor
    print(colors.cyan, ` -> Registering doctor: ${DUMMY_DOCTOR.fullName}...`);
    const doctorRegRes = await axios.post(`${BACKEND_URL}/api/auth/register`, DUMMY_DOCTOR);
    if (doctorRegRes.status === 201) {
      print(colors.green, '   ✅ Passed: Doctor registered successfully.');
    } else {
      throw new Error(`Doctor registration failed with status: ${doctorRegRes.status}`);
    }

    // Login Doctor
    print(colors.cyan, ' -> Logging in as Doctor...');
    const loginRes = await axios.post(`${BACKEND_URL}/api/auth/login`, {
      email: DUMMY_DOCTOR.email,
      password: DUMMY_DOCTOR.password,
      role: 'doctor'
    });

    if (loginRes.status !== 200 || !loginRes.data || !loginRes.data.data || !loginRes.data.data.accessToken) {
      throw new Error('Doctor login failed or accessToken not found in response');
    }

    const doctorToken = loginRes.data.data.accessToken;
    print(colors.green, '   ✅ Passed: Doctor login successful. JWT token extracted.');

    // Since Doctor login requires set-login-type for active session mapping
    print(colors.cyan, ' -> Setting Login Type to personal...');
    await axios.post(`${BACKEND_URL}/api/auth/login-type`, {
      loginType: 'personal'
    }, {
      headers: {
        Authorization: `Bearer ${doctorToken}`
      }
    });

    // -------------------------------------------------------------------------
    // Step 2: Consultation Flow (Using Doctor JWT)
    // -------------------------------------------------------------------------
    print(colors.yellow, '\nExecuting Step 2: Consultation Flow...');
    
    const consultationPayload = {
      patientNic: DUMMY_PATIENT.nic,
      symptoms: ['Fever', 'Cough'],
      diagnosis: 'Viral Infection',
      notes: 'Prescribed bed rest and hydration.',
      labTests: ['Full Blood Count'],
      vitals: {
        bloodPressure: '120/80',
        temperature: '99.5',
        pulse: '78'
      }
    };

    const consultRes = await axios.post(
      `${BACKEND_URL}/api/doctor/consultation`,
      consultationPayload,
      {
        headers: {
          Authorization: `Bearer ${doctorToken}`
        }
      }
    );

    if (consultRes.status === 200 || consultRes.status === 201) {
      print(colors.green, '   ✅ Passed: Consultation successfully created.');
      print(colors.green, `   Consultation ID: ${consultRes.data.consultationId || 'Created'}`);
    } else {
      throw new Error(`Consultation creation failed with status: ${consultRes.status}`);
    }

    // -------------------------------------------------------------------------
    // Step 3: Lab Approval Flow (Zero-Trust)
    // -------------------------------------------------------------------------
    print(colors.yellow, '\nExecuting Step 3: Lab Approval Flow (Zero-Trust)...');

    // We need a hospital admin token to act as the hospital. Let's seed or use existing.
    // Let's login as the default hospital admin: admin@test.medisync.lk / Password123!
    print(colors.cyan, ' -> Logging in as Hospital Admin...');
    const hospLoginRes = await axios.post(`${BACKEND_URL}/api/auth/login`, {
      email: 'admin2@test.medisync.lk',
      password: 'Password123!',
      role: 'hospital_admin'
    });

    if (hospLoginRes.status !== 200 || !hospLoginRes.data || !hospLoginRes.data.data || !hospLoginRes.data.data.accessToken) {
      throw new Error('Hospital admin login failed');
    }

    const hospitalToken = hospLoginRes.data.data.accessToken;
    print(colors.green, '   ✅ Passed: Hospital admin logged in successfully.');

    // Trigger OTP request for patient NIC
    print(colors.cyan, ` -> Triggering consent OTP for patient NIC: ${DUMMY_PATIENT.nic}...`);
    const otpRes = await axios.post(
      `${BACKEND_URL}/api/lab/hospital/request-otp`,
      { patientNic: DUMMY_PATIENT.nic },
      {
        headers: {
          Authorization: `Bearer ${hospitalToken}`
        }
      }
    );

    if (otpRes.status === 200) {
      print(colors.green, '   ✅ Passed: Consent OTP request triggered successfully.');
    } else {
      throw new Error(`Consent OTP request failed with status: ${otpRes.status}`);
    }

    // Retrieve pending tests
    print(colors.cyan, ' -> Querying pending tests for patient (bypass OTP validation via Direct NIC pending-tests route)...');
    const pendingTestsRes = await axios.post(
      `${BACKEND_URL}/api/lab/hospital/pending-tests`,
      { patientNic: DUMMY_PATIENT.nic },
      {
        headers: {
          Authorization: `Bearer ${hospitalToken}`
        }
      }
    );

    if (pendingTestsRes.status === 200 && pendingTestsRes.data && Array.isArray(pendingTestsRes.data.tests)) {
      const tests = pendingTestsRes.data.tests;
      const fbcTest = tests.find(t => t.testName === 'Full Blood Count');
      
      if (fbcTest) {
        print(colors.green, '   ✅ Passed: "Full Blood Count" test successfully listed in pending tests.');
        print(colors.green, `   Lab Test ID: ${fbcTest.labTestId}`);
      } else {
        throw new Error('Full Blood Count test was not found in the pending list');
      }
    } else {
      throw new Error(`Failed to retrieve pending tests. Status: ${pendingTestsRes.status}`);
    }

    print(colors.magenta, '\n==================================================');
    print(colors.green, '🎉 E2E INTEGRATION SUITE PASSED SUCCESSFULLY!');
    print(colors.magenta, '==================================================\n');

    process.exit(0);

  } catch (err) {
    print(colors.red, `\n❌ E2E Execution Failed: ${err.message}`);
    if (err.response) {
      console.log('   Response status:', err.response.status);
      console.log('   Response data:', err.response.data);
    }
    process.exit(1);
  } finally {
    if (dbConnection) {
      await mongoose.disconnect();
    }
  }
}

runE2E();
