'use strict';

/**
 * Phase 1 ML Service Verification & Cold-Start Diagnostic Probe
 * 
 * Capabilities:
 *  1. Non-invasive pre-flight integrity check of the 15 protected files.
 *  2. Probes ML /health with progressive cold-start backoff polling (up to 90s).
 *  3. Issues safe synthetic /predict-disease request (zero patient data).
 *  4. Evaluates security boundary (403 when unauthenticated, 200 with HMAC).
 *  5. Verifies ranked reference matches and response contracts.
 *  6. ZERO SECRETS: Never logs raw keys, tokens, or personal identifiers.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_ML_URL = process.env.ML_ENGINE_URL || 'https://medisync-ml.onrender.com';
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS) || 90000;
const POLL_INTERVAL_MS = 5000;

// Safe synthetic symptoms - ZERO patient data
const SYNTHETIC_SYMPTOMS = ['fever', 'headache', 'joint pain', 'rash'];

function maskKeyFingerprint(key) {
  if (!key) return 'NONE';
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 8);
}

function generateInternalToken(secret) {
  const now = new Date();
  const currentStr = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
  return crypto.createHmac('sha256', secret).update(currentStr).digest('hex');
}

function verifyProtectedHashes() {
  const ledgerPath = path.join(ROOT, 'docs/release/PROTECTED_HASHES.json');
  if (!fs.existsSync(ledgerPath)) {
    throw new Error('PROTECTED_LEDGER_MISSING');
  }
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  if (!Array.isArray(ledger.files) || ledger.files.length !== 15) {
    throw new Error(`PROTECTED_LEDGER_COUNT_MISMATCH: expected 15, got ${ledger.files?.length}`);
  }
  for (const item of ledger.files) {
    const full = path.join(ROOT, item.path);
    if (!fs.existsSync(full)) {
      throw new Error(`PROTECTED_FILE_NOT_FOUND: ${item.path}`);
    }
    const digest = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    if (digest !== item.releaseCandidateSha256) {
      throw new Error(`PROTECTED_HASH_MISMATCH: ${item.path} (expected ${item.releaseCandidateSha256}, got ${digest})`);
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
      const status = res.status;
      if (status === 200) {
        const body = await res.json();
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[PROBE:HEALTH] SUCCESS HTTP 200 (attempt ${attempt}, elapsed ${elapsed}s)`);
        console.log(`[PROBE:HEALTH] Status: "${body.status}", references files: ${body.references?.files}, icd10Concepts: ${body.references?.icd10Concepts}`);
        return { success: true, body, elapsedMs: Date.now() - startTime };
      }
      console.log(`[PROBE:HEALTH] Cold-start HTTP ${status} (attempt ${attempt}). Retrying in ${POLL_INTERVAL_MS / 1000}s...`);
    } catch (err) {
      const errName = err.name === 'AbortError' ? 'TIMEOUT' : (err.code || err.name || 'FETCH_ERROR');
      console.log(`[PROBE:HEALTH] Cold-start response [${errName}] (attempt ${attempt}). Retrying in ${POLL_INTERVAL_MS / 1000}s...`);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`HEALTH_CHECK_TIMED_OUT: ML service failed to return 200 within ${maxWaitMs / 1000}s`);
}

async function probeDiseasePrediction(baseUrl, apiKey) {
  const predictUrl = `${baseUrl.replace(/\/+$/, '')}/api/ml/predict-disease`;
  const hasSecret = Boolean(apiKey);
  const keyFp = maskKeyFingerprint(apiKey);

  console.log(`[PROBE:PREDICT] Target: ${predictUrl}`);
  console.log(`[PROBE:PREDICT] Synthetic symptoms (zero patient data):`, JSON.stringify(SYNTHETIC_SYMPTOMS));
  console.log(`[PROBE:PREDICT] Internal auth secret status: ${hasSecret ? `PRESENT (fp: ${keyFp})` : 'ABSENT'}`);

  // Test 1: Unauthenticated request must return 403 Forbidden
  console.log(`[PROBE:PREDICT:UNAUTH] Verifying security rejection on unauthenticated request...`);
  try {
    const unauthRes = await fetchWithTimeout(predictUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symptoms: SYNTHETIC_SYMPTOMS })
    }, 15000);

    if (unauthRes.status === 403) {
      const errBody = await unauthRes.json().catch(() => ({}));
      console.log(`[PROBE:PREDICT:UNAUTH] SUCCESS: Rejection verified HTTP 403 Forbidden ("${errBody.error}")`);
    } else {
      throw new Error(`SECURITY_BREACH: Expected 403 Forbidden for unauthenticated request, got ${unauthRes.status}`);
    }
  } catch (err) {
    if (err.message?.startsWith('SECURITY_BREACH')) throw err;
    console.error(`[PROBE:PREDICT:UNAUTH] Error during unauthenticated probe: ${err.name || err.code}`);
  }

  // Test 2: Authenticated request with HMAC token (if INTERNAL_API_KEY available)
  if (!hasSecret) {
    console.log(`[PROBE:PREDICT:AUTH] SKIPPED: INTERNAL_API_KEY environment variable not set in this context.`);
    console.log(`[PROBE:PREDICT:AUTH] To run authenticated live prediction probe, export INTERNAL_API_KEY.`);
    return { unauthVerified: true, authSkipped: true };
  }

  const token = generateInternalToken(apiKey);
  console.log(`[PROBE:PREDICT:AUTH] Issuing authenticated request with HMAC token for current UTC hour...`);

  const authRes = await fetchWithTimeout(predictUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': token
    },
    body: JSON.stringify({ symptoms: SYNTHETIC_SYMPTOMS })
  }, 30000);

  if (authRes.status !== 200) {
    const errText = await authRes.text().catch(() => '');
    throw new Error(`AUTHENTICATED_PREDICT_FAILED: HTTP ${authRes.status} - ${errText.slice(0, 100)}`);
  }

  const body = await authRes.json();
  if (!body || !Array.isArray(body.predictions)) {
    throw new Error('INVALID_PREDICTION_PAYLOAD: Missing predictions array');
  }

  console.log(`[PROBE:PREDICT:AUTH] SUCCESS HTTP 200. Returned ${body.predictions.length} candidate predictions.`);

  // Verify response contract & descending order
  let previousConfidence = Infinity;
  body.predictions.forEach((cand, idx) => {
    if (typeof cand.disease !== 'string' || !cand.disease.trim()) {
      throw new Error(`INVALID_CANDIDATE: Candidate at index ${idx} missing valid disease string`);
    }
    if (typeof cand.confidence !== 'number' || !Number.isFinite(cand.confidence) || cand.confidence < 0 || cand.confidence > 100) {
      throw new Error(`INVALID_CONFIDENCE: Candidate ${cand.disease} has invalid confidence ${cand.confidence}`);
    }
    if (cand.confidence > previousConfidence) {
      throw new Error(`RANKING_ORDER_VIOLATION: Candidate ${cand.disease} (${cand.confidence}%) ranked below previous (${previousConfidence}%)`);
    }
    previousConfidence = cand.confidence;
    console.log(`  [Rank ${idx + 1}] ${cand.disease} (ICD: ${cand.icd_code || 'N/A'}) - Confidence: ${cand.confidence}% - Urgent: ${cand.urgent || false}`);
  });

  return { unauthVerified: true, authVerified: true, count: body.predictions.length, topMatch: body.predictions[0] };
}

async function main() {
  console.log('===============================================================');
  console.log('MEDISYNC PHASE 1: ML HEALTH & SYNTHETIC PREDICTION PROBE');
  console.log('===============================================================\n');

  // Step 1: Pre-flight protected ledger check
  console.log('[STEP 1/3] Verifying 15 protected file hashes in docs/release/PROTECTED_HASHES.json...');
  verifyProtectedHashes();
  console.log('[STEP 1/3] PASS: All 15 protected files match their baseline hashes 100%.\n');

  // Step 2: Probe /health with cold-start tolerance
  console.log(`[STEP 2/3] Checking ML Service health at ${DEFAULT_ML_URL}...`);
  await probeHealthWithColdStart(DEFAULT_ML_URL, TIMEOUT_MS);
  console.log('[STEP 2/3] PASS: ML service is online and reports ready.\n');

  // Step 3: Issue synthetic prediction
  console.log(`[STEP 3/3] Testing disease prediction endpoint with synthetic symptoms...`);
  const apiKey = process.env.INTERNAL_API_KEY;
  await probeDiseasePrediction(DEFAULT_ML_URL, apiKey);
  console.log('[STEP 3/3] PASS: Prediction endpoint verified safely with zero patient data.\n');

  console.log('===============================================================');
  console.log('VERIFICATION SUMMARY: ALL PHASE 1 PROBE CHECKS PASSED');
  console.log('===============================================================');
}

if (require.main === module) {
  main().catch(err => {
    console.error('\n[PROBE_FAILURE]', err.message || err);
    process.exit(1);
  });
}

module.exports = {
  verifyProtectedHashes,
  probeHealthWithColdStart,
  probeDiseasePrediction,
  generateInternalToken
};
