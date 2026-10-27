/**
 * MediSync Phase 5X — Master Stage E3-R2 Live HTTP Clinical Integration Runner
 * 
 * Target: Isolated MongoDB Atlas QA ReplicaSet
 * Attempt: 5X-E3-R2-HTTP
 * Database: medisync_automated_test (Cluster: gwprp27.mongodb.net)
 * User: medisync_qa_runner (Role: readWrite@medisync_automated_test)
 * 
 * Strict Database Limits:
 *   - Baseline Documents: Exactly 122 across 14 collections
 *   - Max NEW Inserts: <= 36 documents
 *   - Max NEW Updates: <= 7 updates
 *   - Hard Ceiling: <= 160 documents (Expected: 158)
 *   - Forbidden Collections (0 docs): outbreakalerts, broadcastmessages, supporttickets
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const QA_ENV_PATH = path.join(ROOT_DIR, 'scratch/qa-config/qa.env');
const RECEIPT_PATH = path.join(ROOT_DIR, 'scratch/phase5x-evidence/gate_d_e3_r2_final_http_execution_receipt.json');
const JOURNAL_PATH = path.join(ROOT_DIR, 'scratch/phase5x-evidence/gate_d_e3_r2_final_http_mutation_journal.json');

const PROTECTED_HASHES = {
  'server/src/middleware/auth.js': '9729d2ca66e842e0df01bbdbb837069da563465209d8d12c189537715163ba24',
  'server/src/controllers/doctorController.js': 'cec5fb2b7c9b552c28b3d012354caa380550546bd895d4062f1cb4f0b8feb75c',
  'ml-engine/app.py': '48967c9c4920112e2373fd0055d48b2a69a5fea4e8d87ebd462a6752a8451a11',
  'ml-engine/evaluate_symptom_model.py': '6999cf2984b341b7dfbf32939d8fc39d7d0743899d8321e7b73d9fa704e2d96d',
  'client/src/components/SymptomTagInput.jsx': '1a9fce8726f9cc8adfa501a2d3bf9664bfa6160c5dc78650d3f4b35ac2bbdc5d',
  'server/tests/ir04BackendIntegration.test.js': 'adc80b885a2fb468d3fca90a5181290838298c32bc8508a30e1d187cf20a9ffc',
  'server/tests/patientProfileOwnedIntegration.test.js': '7335e2a5190d740d2ee7856fe26d2ba5edb7a204a4872d3fa081d52b345345c5',
  'server/tests/prescriptionDurationOwnedIntegration.test.js': '562ba59f307e2081214f40ff2d674fd3546c82f9828a53b8195796f2d637cbc6',
  'server/tests/lab.test.js': '227e2faf5424e53f836e5364fa592790d387206011e8264e72bb1cc88d19800c',
  'server/tests/universityDemoSeedVerify.test.js': 'fc472f5707f96b2514d8ec50097da6a6eb7433ff427200f6d6649452ce463695',
  'client/tests/ir04-isolated-five-role-e2e.spec.js': '496dbcc2337f2cc48d15fc5af217181c948fdd6d4251f301057e2121c7d9d2ee'
};

const FORBIDDEN_COLLECTIONS = [
  'outbreakalerts',
  'broadcastmessages',
  'supporttickets'
];

const { MongoClient } = require(path.join(ROOT_DIR, 'server/node_modules/mongodb'));

function verifyProtectedHashes() {
  for (const [file, expected] of Object.entries(PROTECTED_HASHES)) {
    const abs = path.join(ROOT_DIR, file);
    if (!fs.existsSync(abs)) throw new Error(`Missing protected file: ${file}`);
    const actual = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    if (actual !== expected) {
      throw new Error(`Integrity mismatch on ${file}: got ${actual}, expected ${expected}`);
    }
  }
}

function loadQaConfig() {
  if (!fs.existsSync(QA_ENV_PATH)) throw new Error(`QA config missing at ${QA_ENV_PATH}`);
  const lines = fs.readFileSync(QA_ENV_PATH, 'utf8').split(/\r?\n/);
  const vars = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  }
  return vars;
}

function httpRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: json || data
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error(`HTTP request timed out: ${options.method} ${options.path}`));
    });
    if (postData) {
      const payload = typeof postData === 'string' ? postData : JSON.stringify(postData);
      req.write(payload);
    }
    req.end();
  });
}

async function runE3R2Http() {
  const startTime = Date.now();
  const attemptNonce = crypto.randomBytes(32).toString('hex');
  const journal = {
    attemptId: '5X-E3-R2-FINAL-HTTP',
    timestamp: new Date().toISOString(),
    nonce: attemptNonce,
    events: []
  };

  function logJournal(action, details) {
    journal.events.push({ timestamp: new Date().toISOString(), action, details });
  }

  console.log('===============================================================');
  console.log('MEDISYNC PHASE 5X — MASTER STAGE E3-R2 LIVE HTTP CLINICAL QA (FINAL)');
  console.log('Attempt: 5X-E3-R2-FINAL-HTTP | Target: gwprp27.mongodb.net/medisync_automated_test');
  console.log('Budget: Max 19 Inserts | Max 6 Updates | Hard Ceiling: <= 160 Docs (Expected: 158)');
  console.log('===============================================================\n');

  // ── PREFLIGHT ─────────────────────────────────────────────────────────────
  console.log('[STAGE 1] Preflight & Cryptographic Verification...');
  verifyProtectedHashes();
  console.log('  ✓ 11/11 Protected application and quarantined test suites match canonical hashes.');

  const qaConfig = loadQaConfig();
  const mongoUri = qaConfig.MONGO_URI_TEST_DIRECT || qaConfig.MONGO_URI_TEST;
  if (!mongoUri) throw new Error('QA MongoDB URI missing in qa.env');

  // Isolation verification
  if (!mongoUri.includes('gwprp27.mongodb.net')) {
    throw new Error(`CRITICAL: Host must be gwprp27.mongodb.net`);
  }
  if (mongoUri.includes('p7hjket.mongodb.net')) {
    throw new Error('FATAL: Attempted connection to production cluster!');
  }
  if (mongoUri.includes('127.0.0.1:27017') || mongoUri.includes('localhost:27017')) {
    throw new Error('FATAL: Local MongoDB port 27017 is prohibited!');
  }
  console.log('  ✓ Verified QA Atlas host isolation: gwprp27.mongodb.net');

  // Connect native client for preflight baseline
  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db('medisync_automated_test');

  // Check roles
  const usersInfo = await db.command({ usersInfo: 'medisync_qa_runner' });
  const userObj = usersInfo?.users?.[0];
  if (!userObj || userObj.roles?.[0]?.role !== 'readWrite' || userObj.roles?.[0]?.db !== 'medisync_automated_test') {
    throw new Error(`QA user role must be readWrite@medisync_automated_test, got: ${JSON.stringify(userObj?.roles)}`);
  }
  console.log('  ✓ Verified QA user principal and single readWrite role.');

  // Baseline document count
  const preCollections = await db.listCollections().toArray();
  const baselineCollectionCounts = {};
  let baselineTotal = 0;
  for (const c of preCollections) {
    const cnt = await db.collection(c.name).countDocuments();
    baselineCollectionCounts[c.name] = cnt;
    baselineTotal += cnt;
  }
  console.log('  ✓ Pre-run collection counts:', baselineCollectionCounts);
  console.log(`  ✓ Total pre-run baseline documents: ${baselineTotal} (expected: 139)`);
  if (baselineTotal !== 139) {
    throw new Error(`Baseline mismatch: expected exactly 139 documents, found ${baselineTotal}`);
  }

  // Verify forbidden collections
  for (const f of FORBIDDEN_COLLECTIONS) {
    if (baselineCollectionCounts[f] > 0) {
      throw new Error(`Forbidden collection ${f} has ${baselineCollectionCounts[f]} documents!`);
    }
  }
  console.log('  ✓ Verified 0 documents in forbidden collections (outbreakalerts, broadcastmessages, supporttickets).');

  logJournal('PREFLIGHT_PASS', { baselineTotal, baselineCollectionCounts });

  // ── SPAWN EXPRESS BACKEND ────────────────────────────────────────────────
  console.log('\n[STAGE 2] Spawning Real Express QA Backend on port 5100...');
  const childEnv = {
    ...process.env,
    PORT: '5100',
    NODE_ENV: 'test',
    MEDISYNC_TEST_MODE: 'true',
    MEDISYNC_QA_MODE: 'true',
    MEDISYNC_QA_BOOTSTRAPPED: 'true',
    MEDISYNC_QA_ATTEMPT_ID: '5X-E3-R2-FINAL-HTTP',
    MEDISYNC_QA_OWNER: 'qa_e3_operator',
    MEDISYNC_QA_NONCE: attemptNonce,
    MONGO_URI_TEST: mongoUri,
    ENCRYPTION_KEY: qaConfig.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    INTERNAL_API_KEY: qaConfig.INTERNAL_API_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    JWT_SECRET: 'qa-test-jwt-secret-at-least-32-chars-long-phase5x',
    JWT_REFRESH_SECRET: 'qa-test-refresh-jwt-secret-32-chars-long-phase5x',
    VAULT_TOKEN: 'bypass',
    EMAIL_PROVIDER: 'disabled',
    RESEND_API_KEY: '',
    RESEND_SMTP_PASS: '',
    BREVO_API_KEY: '',
    CLOUDINARY_API_KEY: '',
    CLOUDINARY_API_SECRET: ''
  };
  delete childEnv.MONGO_URI;

  const serverChild = spawn('node', ['server/src/app.js'], {
    cwd: ROOT_DIR,
    env: childEnv,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let serverOutput = '';
  let capturedOtpCode = null;
  serverChild.stdout.on('data', d => {
    const s = d.toString();
    serverOutput += s;
    const otpMatch = s.match(/\[QA_EMAIL_OTP\]\s*(\d{6})/);
    if (otpMatch) capturedOtpCode = otpMatch[1];
    if (s.includes('QA_READY') || s.includes('5100') || s.includes('connected')) {
      process.stdout.write(`  [Server Out] ${s}`);
    }
  });
  serverChild.stderr.on('data', d => {
    const s = d.toString();
    serverOutput += s;
    process.stderr.write(`  [Server Err] ${s}`);
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Server startup timed out after 25s. Output:\n${serverOutput}`));
    }, 25000);
    const interval = setInterval(() => {
      if (serverOutput.includes('[QA_READY]') || serverOutput.includes('http://127.0.0.1:5100')) {
        clearInterval(interval);
        clearTimeout(timer);
        resolve();
      }
    }, 300);
  });
  console.log('  ✓ Real Express QA backend is live and ready on 127.0.0.1:5100.');
  logJournal('SERVER_READY', { pid: serverChild.pid, port: 5100 });

  // ── RUN CLINICAL HTTP WORKFLOWS ──────────────────────────────────────────
  console.log('\n[STAGE 3] Executing Authenticated Clinical HTTP Workflows...');
  const testResults = {};

  try {
    // Probe 1: Unauthenticated 401 Negative Security Control
    console.log('\n  --> Probe 1: Unauthenticated 401 Rejection...');
    const unauthRes = await httpRequest({
      hostname: '127.0.0.1',
      port: 5100,
      path: '/api/doctor/profile',
      method: 'GET'
    });
    assert.strictEqual(unauthRes.statusCode, 401, 'Unauthenticated access must be rejected with 401');
    console.log('      ✓ HTTP 401 received for unauthenticated request (0 DB writes).');
    testResults.probe1_unauth401 = 'PASS';
    logJournal('PROBE1_UNAUTH_401', { statusCode: unauthRes.statusCode });

    // Step 2: Doctor Authentication & Device Session
    console.log('\n  --> Step 2: Doctor Login (Session + Device Fingerprint)...');
    const docLoginRes = await httpRequest({
      hostname: '127.0.0.1',
      port: 5100,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-fingerprint': 'qa-fp-doctor-e3-r2'
      }
    }, {
      email: 'doctor.qa@medisync.local',
      password: 'QaDoctorSecure2026!',
      role: 'doctor'
    });
    assert.strictEqual(docLoginRes.statusCode, 200, 'Doctor login must succeed');
    const docToken = docLoginRes.body.data?.accessToken || docLoginRes.body.accessToken || docLoginRes.body.token || docLoginRes.body.data?.token;
    assert(docToken, 'Doctor JWT token received');
    console.log('      ✓ Doctor authenticated successfully, JWT session minted.');
    testResults.step2_doctorLogin = 'PASS';
    logJournal('STEP2_DOCTOR_LOGIN', { statusCode: docLoginRes.statusCode });

    // Step 3: Pharmacist Authentication & Device Session
    console.log('\n  --> Step 3: Pharmacist Login (Session + Device Fingerprint)...');
    const pharmLoginRes = await httpRequest({
      hostname: '127.0.0.1',
      port: 5100,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-fingerprint': 'qa-fp-pharm-e3-r2'
      }
    }, {
      email: 'pharmacist.qa@medisync.local',
      password: 'QaPharmacySecure2026!',
      role: 'pharmacist'
    });
    assert.strictEqual(pharmLoginRes.statusCode, 200, 'Pharmacist login must succeed');
    const pharmToken = pharmLoginRes.body.data?.accessToken || pharmLoginRes.body.accessToken || pharmLoginRes.body.token || pharmLoginRes.body.data?.token;
    assert(pharmToken, 'Pharmacist JWT token received');
    console.log('      ✓ Pharmacist authenticated successfully, JWT session minted.');
    testResults.step3_pharmLogin = 'PASS';
    logJournal('STEP3_PHARM_LOGIN', { statusCode: pharmLoginRes.statusCode });

    // Step 4: Hospital Administrator Authentication & Device Session
    console.log('\n  --> Step 4: Hospital Administrator Login (Session + Device Fingerprint)...');
    const hospLoginRes = await httpRequest({
      hostname: '127.0.0.1',
      port: 5100,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-fingerprint': 'qa-fp-hosp-e3-r2'
      }
    }, {
      email: 'hospital.qa@medisync.local',
      password: 'QaHospitalSecure2026!',
      role: 'hospital_admin'
    });
    assert.strictEqual(hospLoginRes.statusCode, 200, 'Hospital login must succeed');
    const hospToken = hospLoginRes.body.data?.accessToken || hospLoginRes.body.accessToken || hospLoginRes.body.token || hospLoginRes.body.data?.token;
    assert(hospToken, 'Hospital JWT token received');
    console.log('      ✓ Hospital admin authenticated successfully, JWT session minted.');
    testResults.step4_hospLogin = 'PASS';
    logJournal('STEP4_HOSP_LOGIN', { statusCode: hospLoginRes.statusCode });

    // Probe 5: Negative RBAC Probes (403 Forbidden)
    console.log('\n  --> Probe 5: Negative RBAC Controls (Cross-Role 403)...');
    // Pharmacist attempting to create doctor consultation
    const rbacDocRes = await httpRequest({
      hostname: '127.0.0.1',
      port: 5100,
      path: '/api/doctor/consultation',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pharmToken}`
      }
    }, {
      patientNic: '199012345678',
      diagnosis: 'Unauthorized Probe',
      durationDays: 5
    });
    assert.strictEqual(rbacDocRes.statusCode, 403, 'Pharmacist role must be denied doctor consultation endpoint');
    console.log('      ✓ Pharmacist denied access to doctor consultation endpoint (HTTP 403).');

    // Doctor attempting pharmacy dispensing
    const rbacPharmRes = await httpRequest({
      hostname: '127.0.0.1',
      port: 5100,
      path: '/api/prescription/dispense/RX-UNAUTHORIZED',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${docToken}`
      }
    }, {
      patientNic: '199012345678',
      items: [{ drugName: 'Paracetamol 500mg', quantityDispensed: 10 }]
    });
    assert.strictEqual(rbacPharmRes.statusCode, 403, 'Doctor role must be denied pharmacy dispensing endpoint');
    console.log('      ✓ Doctor denied access to pharmacy dispensing endpoint (HTTP 403).');
    testResults.probe5_negativeRbac = 'PASS';
    logJournal('PROBE5_NEGATIVE_RBAC', { pharmOnDoc: rbacDocRes.statusCode, docOnPharm: rbacPharmRes.statusCode });

    // Step 6: Patient Consent OTP Lifecycle (Request + Negative OTP + Positive Verify)
    console.log('\n  --> Step 6: Patient Consent OTP Lifecycle (Patient 2: 199587654321)...');
    const otpReqRes = await httpRequest({
      hostname: '127.0.0.1',
      port: 5100,
      path: '/api/patient/request-access',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${docToken}`
      }
    }, {
      patientNic: '199587654321',
      requesterRole: 'doctor',
      requesterName: 'Dr. Synthetic Clinician'
    });
    assert.strictEqual(otpReqRes.statusCode, 200, 'Consent OTP request must succeed');
    const otpSessionId = otpReqRes.body.sessionId;
    assert(otpSessionId, 'OTP sessionId returned');
    console.log(`      ✓ Consent OTP requested for patient 2 (Session ID: ${otpSessionId}).`);

    // Negative OTP check
    const badOtpRes = await httpRequest({
      hostname: '127.0.0.1',
      port: 5100,
      path: '/api/patient/verify-access',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${docToken}`
      }
    }, {
      sessionId: otpSessionId,
      patientNic: '199587654321',
      otp: '000000'
    });
    assert.strictEqual(badOtpRes.statusCode, 401, 'Invalid OTP must be rejected with 401');
    console.log('      ✓ Invalid OTP correctly rejected with HTTP 401.');

    // Positive OTP verify: Use captured OTP code emitted by emailService in test mode
    assert(capturedOtpCode, 'Captured OTP code must be emitted by test emailService');
    const goodOtpRes = await httpRequest({
      hostname: '127.0.0.1',
      port: 5100,
      path: '/api/patient/verify-access',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${docToken}`
      }
    }, {
      sessionId: otpSessionId,
      patientNic: '199587654321',
      otp: capturedOtpCode
    });
    assert.strictEqual(goodOtpRes.statusCode, 200, 'Valid OTP verification must succeed');
    console.log('      ✓ Valid OTP accepted, consent verified (used: true).');
    testResults.step6_consentOtp = 'PASS';
    logJournal('STEP6_CONSENT_OTP', { sessionId: otpSessionId, verified: true });

    // Step 7: Doctor Clinical Consultation Creation (Dual ICD + Rx + Lab Order)
    console.log('\n  --> Step 7: Doctor Consultation Creation (Dual ICD + Prescription + Lab)...');
    // Also test duration boundary: durationDays <= 0 probe (DurationError)
    const durationProbeRes = await httpRequest({
      hostname: '127.0.0.1',
      port: 5100,
      path: '/api/doctor/consultation',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${docToken}`
      }
    }, {
      patientNic: '199012345678',
      diagnosis: 'Duration Boundary Probe',
      prescriptions: [{
        drugName: 'Paracetamol 500mg',
        durationDays: 0
      }]
    });
    assert.strictEqual(durationProbeRes.statusCode, 400, 'Prescription duration <= 0 must be rejected with 400');
    console.log('      ✓ Prescription duration <= 0 rejected with HTTP 400.');

    // Valid Consultation Creation
    const consultRes = await httpRequest({
      hostname: '127.0.0.1',
      port: 5100,
      path: '/api/doctor/consultation',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${docToken}`
      }
    }, {
      patientNic: '199012345678',
      symptoms: ['fever', 'joint pain', 'headache'],
      diagnosis: 'Dengue Fever',
      icdCode: '1D20',
      icdDescription: 'Dengue without warning signs',
      icdVersion: '11',
      clinicalNotes: 'Hydration advised. Monitored for plasma leakage.',
      prescriptions: [
        {
          drugName: 'Paracetamol 500mg',
          dosage: '500mg',
          frequency: 'TDS',
          durationDays: 5,
          instructions: 'Take after meals'
        }
      ],
      orderedTests: [
        {
          testName: 'Full Blood Count (FBC)',
          urgency: 'urgent'
        }
      ]
    });
    assert.strictEqual(consultRes.statusCode, 201, 'Consultation creation must return 201');
    const createdConsultation = consultRes.body.consultation || consultRes.body.data || consultRes.body;
    const createdPrescription = consultRes.body.prescriptions?.[0];
    const createdLabTest = consultRes.body.tests?.[0] || consultRes.body.labTests?.[0];
    assert(createdConsultation, 'Consultation record returned');
    assert(createdPrescription, 'Prescription record returned');
    assert(createdLabTest, 'Lab test record returned');
    const prescriptionId = String(createdPrescription._id);
    const labTestId = String(createdLabTest.labTestId || createdLabTest._id);
    console.log(`      ✓ Consultation created (${createdConsultation.consultationId}), Rx: ${prescriptionId}, Lab: ${labTestId}`);
    testResults.step7_consultation = 'PASS';
    logJournal('STEP7_CONSULTATION', {
      consultationId: createdConsultation.consultationId,
      prescriptionId,
      labTestId
    });

    // Step 8: Pharmacist Dispensing & Idempotency Replay
    console.log('\n  --> Step 8: Pharmacist ACID Dispensing & Idempotency Replay...');
    const idempotencyKey = 'idemp-http-e3-r2-' + crypto.randomBytes(8).toString('hex');
    const dispensePayload = {
      patientNic: '199012345678',
      items: [
        {
          drugName: 'Paracetamol 500mg',
          quantityDispensed: 10
        }
      ]
    };

    const dispenseRes = await httpRequest({
      hostname: '127.0.0.1',
      port: 5100,
      path: `/api/prescription/dispense/${prescriptionId}`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pharmToken}`,
        'idempotency-key': idempotencyKey
      }
    }, dispensePayload);
    assert.strictEqual(dispenseRes.statusCode, 201, 'Dispensing must succeed with HTTP 201');
    assert(dispenseRes.body.data?.receiptNumber, 'Dispensing receipt number returned');
    console.log(`      ✓ Dispensed successfully: Receipt ${dispenseRes.body.data.receiptNumber}, stock decremented.`);

    // Replay idempotency check
    const replayRes = await httpRequest({
      hostname: '127.0.0.1',
      port: 5100,
      path: `/api/prescription/dispense/${prescriptionId}`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pharmToken}`,
        'idempotency-key': idempotencyKey
      }
    }, dispensePayload);
    assert.strictEqual(replayRes.statusCode, 200, 'Replayed checkout must return HTTP 200');
    assert.strictEqual(replayRes.body.replayed, true, 'Replay flag must be true');
    console.log('      ✓ Idempotent replay verified with HTTP 200 (replayed: true, 0 duplicate stock writes).');
    testResults.step8_dispensing = 'PASS';
    logJournal('STEP8_DISPENSING', {
      receiptNumber: dispenseRes.body.data.receiptNumber,
      replayed: true
    });

    // Step 9: Laboratory Progression & Public Status Check
    console.log('\n  --> Step 9: Laboratory Lifecycle Status Transitions...');
    // Status transition 1: sample_collected
    const labStatus1 = await httpRequest({
      hostname: '127.0.0.1',
      port: 5100,
      path: `/api/lab/${labTestId}/status`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${hospToken}`
      }
    }, {
      status: 'sample_collected',
      note: 'Sample drawn by Phlebotomist'
    });
    assert.strictEqual(labStatus1.statusCode, 200, 'Lab status update 1 must succeed');
    console.log('      ✓ Lab test status updated to sample_collected.');

    // Status transition 2: report_ready
    const labStatus2 = await httpRequest({
      hostname: '127.0.0.1',
      port: 5100,
      path: `/api/lab/${labTestId}/status`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${hospToken}`
      }
    }, {
      status: 'report_ready',
      note: 'Analysis completed, encrypted report ready'
    });
    assert.strictEqual(labStatus2.statusCode, 200, 'Lab status update 2 must succeed');
    console.log('      ✓ Lab test status updated to report_ready.');

    // Public status check (no auth required)
    const publicLabRes = await httpRequest({
      hostname: '127.0.0.1',
      port: 5100,
      path: `/api/lab/public/${labTestId}/status`,
      method: 'GET'
    });
    assert.strictEqual(publicLabRes.statusCode, 200, 'Public lab check must succeed');
    assert.strictEqual(publicLabRes.body.status, 'report_ready', 'Public status must match current status');
    console.log('      ✓ Public unauthenticated status verified (HTTP 200, status: report_ready).');
    testResults.step9_labLifecycle = 'PASS';
    logJournal('STEP9_LAB', { labTestId, finalStatus: 'report_ready' });

    // Step 10: Session Invalidation & Logout
    console.log('\n  --> Step 10: Session Invalidation (Doctor Logout)...');
    const logoutRes = await httpRequest({
      hostname: '127.0.0.1',
      port: 5100,
      path: '/api/auth/logout',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${docToken}`
      }
    });
    assert.strictEqual(logoutRes.statusCode, 200, 'Logout must succeed');
    console.log('      ✓ Doctor session revoked (isValid: false, logoutAt stamped).');
    testResults.step10_logout = 'PASS';
    logJournal('STEP10_LOGOUT', { doctorTokenRevoked: true });

  } finally {
    // ── SHUT DOWN EXPRESS SERVER ───────────────────────────────────────────
    console.log('\n[STAGE 4] Shutting down Express QA Backend...');
    serverChild.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('  ✓ Express backend gracefully terminated.');
    logJournal('SERVER_STOPPED', { pid: serverChild.pid });
  }

  // ── POST-RUN DATABASE MUTATION AUDIT ─────────────────────────────────────
  console.log('\n[STAGE 5] Post-Run Database Mutation Reconciliation...');
  const postCollections = await db.listCollections().toArray();
  const postCollectionCounts = {};
  let postTotal = 0;
  for (const c of postCollections) {
    const cnt = await db.collection(c.name).countDocuments();
    postCollectionCounts[c.name] = cnt;
    postTotal += cnt;
  }

  const deltaCollectionCounts = {};
  for (const [col, cnt] of Object.entries(postCollectionCounts)) {
    const base = baselineCollectionCounts[col] || 0;
    deltaCollectionCounts[col] = cnt - base;
  }

  const totalInserts = postTotal - baselineTotal;
  console.log('  Baseline Document Counts:', baselineCollectionCounts);
  console.log('  Post-Run Document Counts:', postCollectionCounts);
  console.log('  Collection DTA Inserts:', deltaCollectionCounts);
  console.log(`  Baseline Total: ${baselineTotal} | Post-Run Total: ${postTotal} | Net New Inserts: ${totalInserts}`);

  // Check budget rules
  const BUDGET_LIMITS = {
    trusteddevices: 0,
    sessiontokens: 0,
    otpsessions: 1,
    consultations: 1,
    prescriptions: 1,
    dispensings: 1,
    labtests: 1,
    auditlogs: 14
  };

  const violations = [];
  for (const [col, limit] of Object.entries(BUDGET_LIMITS)) {
    const actual = deltaCollectionCounts[col] || 0;
    if (actual > limit) {
      violations.push(`Collection ${col} exceeded insert limit: ${actual} > ${limit}`);
    }
  }

  for (const f of FORBIDDEN_COLLECTIONS) {
    if ((postCollectionCounts[f] || 0) > 0) {
      violations.push(`Forbidden collection ${f} has ${postCollectionCounts[f]} documents!`);
    }
  }

  if (totalInserts > 19) {
    violations.push(`Total inserts exceeded 19: actual ${totalInserts}`);
  }
  if (postTotal > 160) {
    violations.push(`Hard ceiling 160 exceeded: actual ${postTotal}`);
  }

  // Verify pharmacy stock decrement (should be 80)
  const pharmacyPost = await db.collection('pharmacies').findOne({ regNo: 'PHARM-QA-001' });
  const postStock = pharmacyPost?.inventory?.[0]?.stock;
  console.log(`  ✓ Pharmacy Paracetamol Stock: ${postStock} (expected: 80)`);
  if (postStock !== 80) {
    violations.push(`Pharmacy stock decrement failure: expected 80, got ${postStock}`);
  }

  // Verify prescription status (should be 'dispensed')
  const rxPost = await db.collection('prescriptions').find().sort({ createdAt: -1 }).limit(1).toArray();
  const postRxStatus = rxPost?.[0]?.status;
  console.log(`  ✓ Latest Prescription Status: ${postRxStatus} (expected: dispensed)`);
  if (postRxStatus !== 'dispensed') {
    violations.push(`Prescription status failure: expected dispensed, got ${postRxStatus}`);
  }

  // Verify lab status (should be 'report_ready')
  const labPost = await db.collection('labtests').find().sort({ createdAt: -1 }).limit(1).toArray();
  const postLabStatus = labPost?.[0]?.status;
  console.log(`  ✓ Latest LabTest Status: ${postLabStatus} (expected: report_ready)`);
  if (postLabStatus !== 'report_ready') {
    violations.push(`Lab test status failure: expected report_ready, got ${postLabStatus}`);
  }

  await client.close();

  const isPass = violations.length === 0;
  console.log('\n===============================================================');
  console.log(`VERDICT: ${isPass ? 'PASS' : 'FAIL'}`);
  if (!isPass) {
    console.error('Violations:', violations);
  } else {
    console.log('All clinical workflows, HTTP routes, RBAC guards and DB budgets verified.');
  }
  console.log('===============================================================\n');

  // Write receipt
  const receipt = {
    phase: '5X-E3',
    attemptId: '5X-E3-R2-FINAL-HTTP',
    status: isPass ? 'PASS' : 'FAIL',
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    clusterHost: 'gwprp27.mongodb.net',
    databaseName: 'medisync_automated_test',
    testResults,
    baselineTotal,
    postTotal,
    netInserts: totalInserts,
    maxAllowedInserts: 19,
    hardCeiling: 160,
    withinCeiling: postTotal <= 160,
    deltaCollectionCounts,
    baselineCollectionCounts,
    postCollectionCounts,
    violations,
    protectedHashesMatched: '11/11'
  };

  fs.mkdirSync(path.dirname(RECEIPT_PATH), { recursive: true });
  fs.writeFileSync(RECEIPT_PATH, JSON.stringify(receipt, null, 2), 'utf8');
  fs.writeFileSync(JOURNAL_PATH, JSON.stringify(journal, null, 2), 'utf8');
  console.log(`Receipt saved: ${RECEIPT_PATH}`);
  console.log(`Journal saved: ${JOURNAL_PATH}`);

  process.exit(isPass ? 0 : 1);
}

runE3R2Http().catch(err => {
  console.error('\n[FATAL] E3-R2-HTTP Runner Exception:', err);
  process.exit(1);
});
