const axios = require('axios');

const BASE_URL = 'http://localhost:5005';
const timestamp = Date.now();

// Test Data
const patientData = {
  nic: `999${timestamp.toString().slice(-6)}V`, // Mock unique NIC
  fullName: "E2E Test Patient",
  email: `patient_${timestamp}@example.com`,
  password: "StrongPassword123!",
  dateOfBirth: "1990-01-01",
  gender: "Male",
  contactNumber: "0771234567",
  patientPhone: "0771234567"
};

const doctorData = {
  fullName: "E2E Test Doctor",
  email: `doctor_${timestamp}@example.com`,
  password: "StrongPassword123!",
  licenseNo: `DOC-${timestamp}`,
  specialization: "Cardiology"
};

const hospitalData = {
  name: "E2E Test Hospital",
  email: `hospital_${timestamp}@example.com`,
  password: "StrongPassword123!",
  regNo: `HOSP-${timestamp}`
};

// Axios instance to track cookies/headers if needed
const client = axios.create({
  validateStatus: () => true // Resolve all statuses so we can assert on them
});

async function runTests() {
  console.log('--- Starting MediSync E2E Security & Role Tests ---\n');
  let patientToken = '';
  let doctorToken = '';

  // 1. Patient Registration & Login
  console.log('Testing Patient Flow...');
  let res = await client.post(`${BASE_URL}/api/patient/register`, patientData);
  console.log(`[POST /api/patient/register] Status: ${res.status}`);
  if (res.status !== 201) {
    console.error('Patient Registration Failed:', res.data);
    process.exit(1);
  }

  res = await client.post(`${BASE_URL}/api/auth/login`, {
    email: patientData.email,
    password: patientData.password,
    role: 'patient'
  });
  console.log(`[POST /api/auth/login (Patient)] Status: ${res.status}`);
  if (res.status !== 200 || !res.data.data?.accessToken) {
    console.error('Patient Login Failed:', res.data);
    process.exit(1);
  }
  patientToken = res.data.data.accessToken;
  console.log('✅ Patient Registration & Login Successful.\n');

  // 2. Doctor Registration & Login
  console.log('Testing Doctor Flow...');
  res = await client.post(`${BASE_URL}/api/auth/register`, doctorData);
  console.log(`[POST /api/auth/register] Status: ${res.status}`);
  if (res.status !== 201) {
    console.error('Doctor Registration Failed:', res.data);
    process.exit(1);
  }

  res = await client.post(`${BASE_URL}/api/auth/login`, {
    email: doctorData.email,
    password: doctorData.password,
    role: 'doctor'
  });
  console.log(`[POST /api/auth/login (Doctor)] Status: ${res.status}`);
  if (res.status !== 200 || !res.data.data?.accessToken) {
    console.error('Doctor Login Failed:', res.data);
    process.exit(1);
  }
  doctorToken = res.data.data.accessToken;
  console.log('✅ Doctor Registration & Login Successful.\n');

  // 3. Hospital Registration & Login
  console.log('Testing Hospital Flow...');
  res = await client.post(`${BASE_URL}/api/hospital/register`, hospitalData);
  console.log(`[POST /api/hospital/register] Status: ${res.status}`);
  if (res.status !== 201) {
    console.error('Hospital Registration Failed:', res.data);
    process.exit(1);
  }

  res = await client.post(`${BASE_URL}/api/auth/login`, {
    email: hospitalData.email,
    password: hospitalData.password,
    role: 'hospital_admin'
  });
  console.log(`[POST /api/auth/login (Hospital)] Status: ${res.status}`);
  if (res.status !== 200 || !res.data.data?.accessToken) {
    console.error('Hospital Login Failed:', res.data);
    process.exit(1);
  }
  console.log('✅ Hospital Registration & Login Successful.\n');

  // 4. RBAC Security Check
  console.log('Testing RBAC Security Check...');
  console.log('Attempting to access /api/doctor/profile with Patient JWT...');
  res = await client.get(`${BASE_URL}/api/doctor/profile`, {
    headers: { Authorization: `Bearer ${patientToken}` }
  });
  console.log(`[GET /api/doctor/profile] Status: ${res.status}`);
  if (res.status === 403) {
    console.log('✅ RBAC successfully blocked patient from accessing doctor route (403 Forbidden).');
  } else {
    console.error(`❌ Security Failure! Expected 403, got ${res.status}. Response:`, res.data);
    process.exit(1);
  }

  console.log('\n🎉 All E2E Security & Role Tests Passed!');
}

runTests().catch(err => {
  console.error('Unhandled Error during tests:', err);
  if (err.response) {
    console.error('Response Status:', err.response.status);
    console.dir(err.response.data, { depth: null, colors: true });
  }
  process.exit(1);
});
