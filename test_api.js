// test_api.js — node test_api.js
const http = require('http');

const BASE = 'http://localhost:5000';
const ML   = 'http://localhost:5001';

let doctorToken = '';
let adminToken  = '';
let patientNic  = '200399887766';
let consultationId = '';
let results = [];

function req(method, urlPath, body, headers = {}) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const base = urlPath.startsWith('http') ? urlPath : BASE + urlPath;
    const u = new URL(base);
    const options = {
      method,
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + u.search,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data ? Buffer.byteLength(data) : 0,
        ...headers
      }
    };
    const r = http.request(options, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    r.on('error', e => resolve({ status: 0, error: e.message }));
    if (data) r.write(data);
    r.end();
  });
}

function log(name, res, expectStatus) {
  const pass = res.status === expectStatus || 
               (expectStatus === 201 && res.status === 200); // some servers return 200 for creates
  const icon = pass ? '✅' : '❌';
  results.push({ name, pass, status: res.status, expected: expectStatus });
  console.log(`${icon} ${name}: ${res.status} ${pass ? 'PASS' : 'FAIL'}`);
  if (!pass) {
    const body = typeof res.body === 'object' 
      ? JSON.stringify(res.body) 
      : String(res.body);
    console.log(`   → ${body.slice(0, 300)}`);
  }
  return res;
}

function auth(token) {
  return { 'Authorization': `Bearer ${token}` };
}

async function run() {
  console.log('\n══════════════════════════════════════');
  console.log('    MediSync API Diagnostic Test v2');
  console.log('══════════════════════════════════════\n');

  // ── ML Engine ────────────────────────────────
  console.log('── ML Engine ──');
  const mlStatus = await req('GET', ML + '/model-status');
  log('ML model-status', mlStatus, 200);
  if (mlStatus.body?.status) {
    console.log(`   → Status: ${mlStatus.body.status}, DataPoints: ${mlStatus.body.dataPoints}`);
  }
  
  const mlPredict = await req('POST', ML + '/api/ml/predict-disease',
    { symptoms: ['Fever', 'Headache', 'Joint Pain', 'Rash'] });
  log('ML predict-disease', mlPredict, 200);
  if (mlPredict.body?.suggestions?.length > 0) {
    console.log(`   → Top: ${mlPredict.body.suggestions[0].disease} (${mlPredict.body.suggestions[0].confidence_percent}%)`);
  }

  const mlInteract = await req('POST', ML + '/api/ml/check-interactions',
    { drugs: ['Warfarin', 'Aspirin'] });
  log('ML check-interactions', mlInteract, 200);
  if (mlInteract.body?.hasInteraction !== undefined) {
    console.log(`   → hasInteraction: ${mlInteract.body.hasInteraction}`);
  }

  // ── Doctor Auth ───────────────────────────────
  console.log('\n── Doctor Auth ──');
  
  // Register (ignore 400 if already exists)
  const regRes = await req('POST', '/api/auth/register', {
    fullName: 'Dr Test Diag',
    email: 'drtest_diag@test.com',
    password: 'DrTest1!',
    specialization: 'General',
    licenseNo: 'DIAG-001',
    role: 'doctor'
  });
  if (regRes.status === 201 || regRes.status === 200) {
    log('Doctor register', regRes, regRes.status);
  } else if (regRes.status === 400 && 
    JSON.stringify(regRes.body).includes('already')) {
    console.log('ℹ️  Doctor already registered — skipping');
  } else {
    log('Doctor register', regRes, 201);
  }

  const loginRes = await req('POST', '/api/auth/login', {
    email: 'drtest_diag@test.com',
    password: 'DrTest1!'
  });
  log('Doctor login', loginRes, 200);
  
  // Try multiple possible token locations in response
  doctorToken = loginRes.body?.accessToken 
    || loginRes.body?.token 
    || loginRes.body?.data?.accessToken 
    || loginRes.body?.data?.token
    || '';
  
  if (doctorToken) {
    console.log(`   → Token obtained (${doctorToken.slice(0, 20)}...)`);
  } else {
    console.log('   ⚠️  Token NOT found in response!');
    console.log('   Response body:', JSON.stringify(loginRes.body).slice(0, 200));
  }

  // ── Patient ───────────────────────────────────
  console.log('\n── Patient ──');
  
  // Patient register — include email field
  const patRegRes = await req('POST', '/api/patient/register', {
    nic: patientNic,
    fullName: 'Diagnostic Patient',
    email: `patient_diag_${Date.now()}@test.com`,
    dateOfBirth: '2000-01-15',
    gender: 'Male',
    district: 'Kandy',
    bloodGroup: 'O+',
    contactInfo: '0771234567',
    address: '123 Test St, Kandy',
    allergies: ['Penicillin'],
    chronicConditions: ['Diabetes'],
    password: 'Patient1!',
    emergencyContact: {
      name: 'Emergency Contact',
      relationship: 'Parent',
      phone: '0779876543'
    }
  });
  if (patRegRes.status === 400 && 
    JSON.stringify(patRegRes.body).includes('already')) {
    console.log('ℹ️  Patient NIC already registered — OK');
  } else {
    log('Patient register', patRegRes, 201);
    if (patRegRes.body?.error) {
      console.log('   Patient register error details:', patRegRes.body);
    }
  }

  // Get patient with doctor token
  if (doctorToken) {
    const patGetRes = await req('GET', `/api/patient/${patientNic}`, 
      null, auth(doctorToken));
    log('Get patient by NIC (doctor)', patGetRes, 200);
    if (patGetRes.body?.requiresPatientAccess) {
      console.log('   ℹ️  Patient access OTP required — feature working');
    }
  } else {
    console.log('❌ Skipping patient tests — no doctor token');
  }

  // ── Doctor Endpoints ──────────────────────────
  console.log('\n── Doctor Endpoints ──');
  
  if (doctorToken) {
    log('Doctor stats', 
      await req('GET', '/api/doctor/stats', null, auth(doctorToken)), 200);

    const consultRes = await req('POST', '/api/doctor/consultation', {
      patientNic,
      symptoms: ['Fever', 'Headache', 'Joint Pain'],
      icdCode: 'A90',
      icdDescription: 'Dengue Fever',
      diagnosis: 'Suspected Dengue Fever',
      notes: 'Diagnostic test consultation',
      clinicalNotes: 'Diagnostic test consultation',
      loginType: 'personal',
      sessionHospitalId: null,
      prescriptions: [{
        drugName: 'Paracetamol',
        dosage: '500mg',
        frequency: 'Three times daily',
        durationDays: 5,
        instructions: 'Take after meals'
      }],
      tests: []
    }, auth(doctorToken));
    log('Create consultation', consultRes, 201);
    if (consultRes.body?.consultationId) {
      consultationId = consultRes.body.consultationId;
      console.log(`   → Consultation ID: ${consultationId}`);
    }
    if (consultRes.body?.error) {
      console.log('   Consultation error:', consultRes.body);
    }

    // Doctor profile
    log('Doctor profile', 
      await req('GET', '/api/doctor/profile', null, auth(doctorToken)), 200);
    
    // Doctor consultations list
    log('Doctor consultations', 
      await req('GET', '/api/doctor/consultations', null, auth(doctorToken)), 200);
  } else {
    console.log('❌ Skipping — no doctor token');
  }

  // ── Drug Endpoints ────────────────────────────
  console.log('\n── Drug Endpoints ──');
  
  if (doctorToken) {
    const drugSearch = await req('GET', '/api/drugs/search?q=para', 
      null, auth(doctorToken));
    log('Drug search (para)', drugSearch, 200);
    if (Array.isArray(drugSearch.body)) {
      console.log(`   → Found ${drugSearch.body.length} drugs`);
    }

    const icdSearch = await req('GET', '/api/drugs/icd-search?q=dengue', 
      null, auth(doctorToken));
    log('ICD-10 search (dengue)', icdSearch, 200);
    if (Array.isArray(icdSearch.body)) {
      console.log(`   → Found ${icdSearch.body.length} ICD codes`);
    }

    const interaction = await req('POST', '/api/drugs/check-interaction',
      { drugs: ['Warfarin', 'Aspirin'] }, auth(doctorToken));
    log('Drug interaction check', interaction, 200);
    if (interaction.body?.hasInteraction !== undefined) {
      console.log(`   → hasInteraction: ${interaction.body.hasInteraction}`);
    }

    log('Drug recommend', 
      await req('POST', '/api/drugs/recommend', 
        { icdCode: 'A90', diagnosis: 'Dengue' }, auth(doctorToken)), 200);
  } else {
    console.log('❌ Skipping — no doctor token');
  }

  // ── Hospital ──────────────────────────────────
  console.log('\n── Hospital ──');
  
  const hospRes = await req('POST', '/api/hospital/register', {
    name: 'Diagnostic Hospital',
    type: 'government',
    district: 'Kandy',
    address: '1 Hospital Rd, Kandy',
    regNo: `DIAG-HOSP-${Date.now()}`,
    phone: '0812345678',
    adminName: 'Hospital Admin',
    adminEmail: `hospadmin_${Date.now()}@test.com`,
    adminPassword: 'Admin123!'
  });
  if (hospRes.status === 400 && 
    JSON.stringify(hospRes.body).includes('already')) {
    console.log('ℹ️  Hospital already registered — OK');
  } else {
    log('Hospital register', hospRes, 201);
    if (hospRes.body?.error) {
      console.log('   Hospital error:', hospRes.body);
    }
  }

  // ── Pharmacy ──────────────────────────────────
  console.log('\n── Pharmacy ──');
  
  const pharmRes = await req('POST', '/api/pharmacy/register', {
    pharmacyName: `Diagnostic Pharmacy ${Date.now()}`,
    district: 'Kandy',
    address: '5 Pharma St, Kandy',
    regNo: `DIAG-PHARM-${Date.now()}`,
    phone: '0811234567',
    adminName: 'Pharmacy Admin',
    adminEmail: `pharmadmin_${Date.now()}@test.com`,
    adminPassword: 'Pharm123!'
  });
  log('Pharmacy register', pharmRes, 201);

  // ── Admin ─────────────────────────────────────
  console.log('\n── Admin ──');
  
  // Try both admin emails
  for (const creds of [
    { email: 'admin@medisync.com', password: 'Admin123!' },
    { email: 'admin@medisync.lk', password: 'password123' }
  ]) {
    const adminLogin = await req('POST', '/api/auth/login', creds);
    if (adminLogin.status === 200) {
      adminToken = adminLogin.body?.accessToken 
        || adminLogin.body?.token 
        || adminLogin.body?.data?.accessToken
        || '';
      if (adminToken) {
        console.log(`✅ Admin login (${creds.email}): 200 PASS`);
        console.log(`   → Token obtained`);
        break;
      }
    }
  }

  if (adminToken) {
    log('Admin stats', 
      await req('GET', '/api/admin/stats', null, auth(adminToken)), 200);
    
    const mlStatus2 = await req('GET', '/api/admin/ml-status', 
      null, auth(adminToken));
    log('Admin ML status', mlStatus2, 200);
    if (mlStatus2.body) {
      console.log(`   → ML: ${mlStatus2.body.status || 'unknown'}`);
    }

    log('Admin audit log', 
      await req('GET', '/api/admin/audit', null, auth(adminToken)), 200);

    const triggerRes = await req('POST', '/api/admin/outbreak/trigger', 
      {}, auth(adminToken));
    log('Admin trigger ML (403 fix)', triggerRes, 200);
    if (triggerRes.status === 403) {
      console.log('   ⚠️  Still 403 — check route allows admin role');
      console.log('   Response:', JSON.stringify(triggerRes.body));
    }

    log('Admin users list', 
      await req('GET', '/api/admin/users?role=doctor', 
        null, auth(adminToken)), 200);
  } else {
    console.log('❌ Admin login failed — both credential sets failed');
    console.log('   Run: node server/scripts/makeAdmin.js admin@medisync.com Admin123!');
  }

  // ── Patient get own records ───────────────────
  console.log('\n── Patient own records ──');
  const patLogin = await req('POST', '/api/patient/login', {
    nic: patientNic,
    password: 'Patient1!'
  });
  if (patLogin.status === 200) {
    const patToken = patLogin.body?.accessToken 
      || patLogin.body?.token
      || '';
    if (patToken) {
      console.log('✅ Patient login: 200 PASS');
      log('Patient get own profile', 
        await req('GET', `/api/patient/${patientNic}`, 
          null, auth(patToken)), 200);
      log('Patient timeline', 
        await req('GET', `/api/patient/${patientNic}/timeline`, 
          null, auth(patToken)), 200);
    }
  } else {
    log('Patient login', patLogin, 200);
  }

  // ── Summary ───────────────────────────────────
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass);
  const total  = results.length;
  const pct    = Math.round(passed/total*100);

  console.log('\n══════════════════════════════════════');
  console.log(`  Results: ${passed}/${total} PASS (${pct}%)`);
  
  if (failed.length === 0) {
    console.log('  🎉 All tests passed! Platform is ready.');
  } else {
    console.log('\n  ❌ Failed tests:');
    failed.forEach(r => {
      console.log(`     ${r.name}: got ${r.status}, expected ${r.expected}`);
    });
    console.log('\n  Priority fixes:');
    if (failed.some(r => r.name.includes('consultation'))) {
      console.log('  1. Fix createConsultation 500 — add console.error to catch block');
    }
    if (failed.some(r => r.name.includes('ICD') || r.name.includes('interaction'))) {
      console.log('  2. Add missing drug routes to drugRoutes.js');
    }
    if (failed.some(r => r.name.includes('Hospital'))) {
      console.log('  3. Fix hospital register — adminPassword field name');
    }
    if (failed.some(r => r.name.includes('trigger'))) {
      console.log('  4. Fix 403 on outbreak trigger — add admin to allowed roles');
    }
  }
  console.log('══════════════════════════════════════\n');
}

run().catch(console.error);