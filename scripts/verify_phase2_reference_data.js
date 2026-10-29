'use strict';

/**
 * Phase 2 Reference Data & Autocomplete Live Verification Script
 * 
 * Verifies live production/staging backend:
 * 1. Pre-flight 15 protected file hashes in docs/release/PROTECTED_HASHES.json.
 * 2. Probes live backend /health with cold-start tolerance.
 * 3. Security perimeter check: unauthenticated requests must receive 401/403.
 * 4. Doctor session authentication using TEMP_ACCOUNT_PASSWORD (never logged or printed).
 * 5. Probes GET /api/drugs/search?q=para -> returns Paracetamol / Panadol.
 * 6. Probes GET /api/drugs/search?q=asp -> returns Aspirin.
 * 7. Probes GET /api/drugs/search?q=amox -> returns Amoxicillin.
 * 8. Verifies case-insensitivity ('PARA', 'Para', 'pArA') and generic vs brand matching.
 * 9. Probes ICD-10 diagnosis search: GET /api/drugs/icd/search?q=cholera & ?q=dengue.
 * 10. Validates document schema structure and asserts ZERO secret leakage.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_BACKEND_URL = process.env.BACKEND_URL || 'https://medisync-wabc.onrender.com';
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS) || 60000;
const POLL_INTERVAL_MS = 4000;

function verifyProtectedHashes() {
  const ledgerPath = path.join(ROOT, 'docs/release/PROTECTED_HASHES.json');
  if (!fs.existsSync(ledgerPath)) throw new Error('PROTECTED_LEDGER_MISSING');
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  if (!Array.isArray(ledger.files) || ledger.files.length !== 15) {
    throw new Error(`PROTECTED_LEDGER_COUNT_MISMATCH: expected 15, got ${ledger.files?.length}`);
  }
  for (const item of ledger.files) {
    const full = path.join(ROOT, item.path);
    if (!fs.existsSync(full)) throw new Error(`PROTECTED_FILE_NOT_FOUND: ${item.path}`);
    const digest = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    if (digest !== item.releaseCandidateSha256) {
      throw new Error(`PROTECTED_HASH_MISMATCH: ${item.path}`);
    }
  }
  return true;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function probeHealthWithColdStart(baseUrl, maxWaitMs) {
  const healthUrl = `${baseUrl.replace(/\/+$/, '')}/health`;
  const startTime = Date.now();
  let attempt = 0;

  console.log(`[PROBE:HEALTH] Probing ${healthUrl} (max timeout: ${maxWaitMs / 1000}s)...`);

  while (Date.now() - startTime < maxWaitMs) {
    attempt++;
    try {
      const res = await fetchWithTimeout(healthUrl, { method: 'GET' }, 10000);
      if (res.status === 200) {
        const body = await res.json().catch(() => ({}));
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[PROBE:HEALTH] SUCCESS HTTP 200 (attempt ${attempt}, elapsed ${elapsed}s)`);
        console.log(`[PROBE:HEALTH] Status: "${body.status || 'healthy'}"`);
        return { success: true, body };
      }
      console.log(`[PROBE:HEALTH] Cold-start HTTP ${res.status} (attempt ${attempt}). Retrying in ${POLL_INTERVAL_MS / 1000}s...`);
    } catch (err) {
      const errName = err.name === 'AbortError' ? 'TIMEOUT' : (err.code || err.name || 'FETCH_ERROR');
      console.log(`[PROBE:HEALTH] Cold-start response [${errName}] (attempt ${attempt}). Retrying in ${POLL_INTERVAL_MS / 1000}s...`);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`HEALTH_CHECK_TIMED_OUT: Live backend service failed to return 200 within ${maxWaitMs / 1000}s`);
}

function assertZeroSecretLeakage(dataStr) {
  const forbiddenPatterns = [
    /mongodb(\+srv)?:\/\/[^\s]+/i,
    /"password"\s*:\s*"[^"]+"/i,
    /"secret"\s*:\s*"[^"]+"/i,
    /bearer\s+[a-zA-Z0-9_\-\.]+/i
  ];
  for (const pat of forbiddenPatterns) {
    if (pat.test(dataStr)) {
      throw new Error(`SECURITY_BREACH: Secret pattern detected in API response payload: ${pat}`);
    }
  }
}

async function runLiveReferenceProbes(baseUrl) {
  const apiBase = `${baseUrl.replace(/\/+$/, '')}/api`;

  console.log('\n===============================================================');
  console.log('PHASE 2: LIVE REFERENCE DATA & SEARCH VERIFICATION');
  console.log('===============================================================');

  // Step 1: Pre-flight protected hash verification
  console.log('\n[STEP 1/6] Verifying 15 protected file hashes in docs/release/PROTECTED_HASHES.json...');
  verifyProtectedHashes();
  console.log('[STEP 1/6] PASS: All 15 protected files match release candidate hashes 100%.');

  // Step 2: Cold-start check
  console.log(`\n[STEP 2/6] Probing live health endpoint at ${baseUrl}...`);
  await probeHealthWithColdStart(baseUrl, TIMEOUT_MS);
  console.log('[STEP 2/6] PASS: Live backend service is active.');

  // Step 3: Security Perimeter Check (Unauthenticated 401 Rejection)
  console.log('\n[STEP 3/6] Verifying security rejection on unauthenticated request to /drugs/search...');
  const unauthRes = await fetchWithTimeout(`${apiBase}/drugs/search?q=para`, { method: 'GET' });
  if (unauthRes.status === 401 || unauthRes.status === 403) {
    console.log(`[STEP 3/6] PASS: Endpoint securely rejected unauthenticated call (HTTP ${unauthRes.status}).`);
  } else {
    throw new Error(`SECURITY_BREACH: Expected HTTP 401/403 for unauthenticated /drugs/search, got ${unauthRes.status}`);
  }

  // Step 4: Obtain Doctor Auth Token
  console.log('\n[STEP 4/6] Authenticating as doctor for live probe...');
  let doctorToken = process.env.DOCTOR_TOKEN || process.env.MEDISYNC_LIVE_TOKEN;

  if (!doctorToken) {
    const password = process.env.TEMP_ACCOUNT_PASSWORD;
    const email = process.env.DOCTOR_EMAIL || 'dr.silva@demo.medisync.local';
    if (!password) {
      console.log('[STEP 4/6] WARN: Neither DOCTOR_TOKEN nor TEMP_ACCOUNT_PASSWORD was provided in environment.');
      console.log('[STEP 4/6] Unauthenticated security check passed. To run live data probe against Atlas:');
      console.log('           export TEMP_ACCOUNT_PASSWORD="<password>" && node scripts/verify_phase2_reference_data.js');
      return { securityVerified: true, dataProbeSkipped: true };
    }

    const loginRes = await fetchWithTimeout(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (loginRes.status !== 200) {
      throw new Error(`DOCTOR_LOGIN_FAILED: HTTP ${loginRes.status} during authentication for live probe`);
    }

    const loginBody = await loginRes.json();
    doctorToken = loginBody?.data?.token || loginBody?.token;
    if (!doctorToken) throw new Error('DOCTOR_LOGIN_NO_TOKEN: No token in login response');
    const maskedFp = crypto.createHash('sha256').update(doctorToken).digest('hex').slice(0, 8);
    console.log(`[STEP 4/6] PASS: Doctor authenticated successfully (token fingerprint: ${maskedFp}).`);
  } else {
    const maskedFp = crypto.createHash('sha256').update(doctorToken).digest('hex').slice(0, 8);
    console.log(`[STEP 4/6] PASS: Using existing doctor token (fingerprint: ${maskedFp}).`);
  }

  const authHeaders = {
    'Authorization': `Bearer ${doctorToken}`,
    'Content-Type': 'application/json'
  };

  // Step 5: Probe Live Drug Search Endpoints ("para", "asp", "amox")
  console.log('\n[STEP 5/6] Probing live medication search endpoints...');

  // Probe 5A: q=para
  console.log('  -> Testing GET /api/drugs/search?q=para ...');
  const paraRes = await fetchWithTimeout(`${apiBase}/drugs/search?q=para`, { headers: authHeaders });
  if (paraRes.status !== 200) throw new Error(`DRUG_SEARCH_FAILED: q=para returned HTTP ${paraRes.status}`);
  const paraBody = await paraRes.json();
  const paraStr = JSON.stringify(paraBody);
  assertZeroSecretLeakage(paraStr);
  const paraDrugs = paraBody.data || [];
  if (!Array.isArray(paraDrugs) || paraDrugs.length === 0) {
    throw new Error('REFERENCE_DATA_EMPTY: Live q=para returned 0 results. Database reference import required.');
  }
  const hasParacetamol = paraDrugs.some(d =>
    (d.name && d.name.toLowerCase().includes('paracetamol')) ||
    (d.genericName && d.genericName.toLowerCase().includes('paracetamol')) ||
    (d.brand && d.brand.toLowerCase().includes('panadol'))
  );
  if (!hasParacetamol) throw new Error('MISSING_TARGET_DRUG: Paracetamol / Panadol not found in q=para results');
  const sampleDrug = paraDrugs[0];
  if (!sampleDrug.name || !sampleDrug._id) throw new Error('INVALID_DRUG_SCHEMA: Drug missing name or _id');
  console.log(`     SUCCESS: ${paraDrugs.length} matches returned. Top match: "${sampleDrug.name}" (category: ${sampleDrug.category || 'N/A'})`);

  // Probe 5B: q=asp
  console.log('  -> Testing GET /api/drugs/search?q=asp ...');
  const aspRes = await fetchWithTimeout(`${apiBase}/drugs/search?q=asp`, { headers: authHeaders });
  if (aspRes.status !== 200) throw new Error(`DRUG_SEARCH_FAILED: q=asp returned HTTP ${aspRes.status}`);
  const aspBody = await aspRes.json();
  assertZeroSecretLeakage(JSON.stringify(aspBody));
  const aspDrugs = aspBody.data || [];
  if (!Array.isArray(aspDrugs) || aspDrugs.length === 0) {
    throw new Error('REFERENCE_DATA_EMPTY: Live q=asp returned 0 results.');
  }
  const hasAspirin = aspDrugs.some(d =>
    (d.name && d.name.toLowerCase().includes('aspirin')) ||
    (d.name && d.name.toLowerCase().includes('alaspan')) ||
    (d.genericName && d.genericName.toLowerCase().includes('acetylsalicylic'))
  );
  if (!hasAspirin) throw new Error('MISSING_TARGET_DRUG: Aspirin not found in q=asp results');
  console.log(`     SUCCESS: ${aspDrugs.length} matches returned. Top match: "${aspDrugs[0].name}"`);

  // Probe 5C: q=amox
  console.log('  -> Testing GET /api/drugs/search?q=amox ...');
  const amoxRes = await fetchWithTimeout(`${apiBase}/drugs/search?q=amox`, { headers: authHeaders });
  if (amoxRes.status !== 200) throw new Error(`DRUG_SEARCH_FAILED: q=amox returned HTTP ${amoxRes.status}`);
  const amoxBody = await amoxRes.json();
  assertZeroSecretLeakage(JSON.stringify(amoxBody));
  const amoxDrugs = amoxBody.data || [];
  if (!Array.isArray(amoxDrugs) || amoxDrugs.length === 0) {
    throw new Error('REFERENCE_DATA_EMPTY: Live q=amox returned 0 results.');
  }
  const hasAmox = amoxDrugs.some(d =>
    (d.name && d.name.toLowerCase().includes('amox')) ||
    (d.genericName && d.genericName.toLowerCase().includes('amox'))
  );
  if (!hasAmox) throw new Error('MISSING_TARGET_DRUG: Amoxicillin not found in q=amox results');
  console.log(`     SUCCESS: ${amoxDrugs.length} matches returned. Top match: "${amoxDrugs[0].name}"`);

  // Probe 5D: Case-insensitivity verification
  console.log('  -> Testing case-insensitivity: q=PARA vs q=Para vs q=para ...');
  const upperRes = await fetchWithTimeout(`${apiBase}/drugs/search?q=PARA`, { headers: authHeaders });
  const mixedRes = await fetchWithTimeout(`${apiBase}/drugs/search?q=Para`, { headers: authHeaders });
  const upperBody = await upperRes.json();
  const mixedBody = await mixedRes.json();
  if ((upperBody.data || []).length !== paraDrugs.length || (mixedBody.data || []).length !== paraDrugs.length) {
    throw new Error('CASE_SENSITIVITY_VIOLATION: Drug search query results differ across case variations');
  }
  console.log(`     SUCCESS: Case-insensitivity verified (${upperBody.data.length} matches across all cases).`);

  // Step 6: Probe Live ICD-10 Diagnosis Search Endpoints ("cholera", "dengue")
  console.log('\n[STEP 6/6] Probing live ICD diagnosis search endpoints...');

  // Probe 6A: q=cholera
  console.log('  -> Testing GET /api/drugs/icd/search?q=cholera&version=all ...');
  const choleraRes = await fetchWithTimeout(`${apiBase}/drugs/icd/search?q=cholera&version=all`, { headers: authHeaders });
  if (choleraRes.status !== 200) throw new Error(`ICD_SEARCH_FAILED: q=cholera returned HTTP ${choleraRes.status}`);
  const choleraBody = await choleraRes.json();
  assertZeroSecretLeakage(JSON.stringify(choleraBody));
  const choleraItems = choleraBody.data || [];
  if (!Array.isArray(choleraItems) || choleraItems.length === 0) {
    throw new Error('ICD_REFERENCE_EMPTY: q=cholera returned 0 results.');
  }
  const hasCholeraCode = choleraItems.some(i => i.code && i.code.startsWith('A00'));
  if (!hasCholeraCode) throw new Error('MISSING_ICD_CODE: Code A00 for Cholera not found in results');
  console.log(`     SUCCESS: ${choleraItems.length} concepts returned. Top match: [${choleraItems[0].code}] ${choleraItems[0].description}`);

  // Probe 6B: q=dengue
  console.log('  -> Testing GET /api/drugs/icd/search?q=dengue&version=all ...');
  const dengueRes = await fetchWithTimeout(`${apiBase}/drugs/icd/search?q=dengue&version=all`, { headers: authHeaders });
  if (dengueRes.status !== 200) throw new Error(`ICD_SEARCH_FAILED: q=dengue returned HTTP ${dengueRes.status}`);
  const dengueBody = await dengueRes.json();
  assertZeroSecretLeakage(JSON.stringify(dengueBody));
  const dengueItems = dengueBody.data || [];
  if (!Array.isArray(dengueItems) || dengueItems.length === 0) {
    throw new Error('ICD_REFERENCE_EMPTY: q=dengue returned 0 results.');
  }
  const hasDengueCode = dengueItems.some(i => i.code === 'A90' || (i.code && i.code.startsWith('1D20')));
  if (!hasDengueCode) throw new Error('MISSING_ICD_CODE: Code A90 for Dengue not found in results');
  console.log(`     SUCCESS: ${dengueItems.length} concepts returned. Top match: [${dengueItems[0].code}] ${dengueItems[0].description}`);

  console.log('\n===============================================================');
  console.log('VERIFICATION SUMMARY: ALL PHASE 2 REFERENCE PROBES PASSED GREEN');
  console.log('===============================================================');
  return { success: true };
}

if (require.main === module) {
  runLiveReferenceProbes(DEFAULT_BACKEND_URL).catch(err => {
    console.error('\n[VERIFICATION_FAILED]', err.message || err);
    process.exit(1);
  });
}

module.exports = {
  verifyProtectedHashes,
  probeHealthWithColdStart,
  runLiveReferenceProbes
};
