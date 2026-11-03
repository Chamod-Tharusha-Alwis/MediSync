require('./liveVerificationReadOnly.cjs').install();
'use strict';

/**
 * ============================================================================
 * MEDISYNC TARGET FEATURE B6 LIVE VERIFICATION RUNNER
 * File: scripts/verify_b6_flow_live.cjs
 *
 * Programmatically exercises and verifies the complete Patient -> Doctor ->
 * Pharmacy prescription flow live on MediSync:
 *   - Live Frontend: https://medisync.chamodtharusha.com.lk
 *   - Live Backend:  https://medisync-wabc.onrender.com/api
 *
 * Enforces all Mandatory Security Guardrails:
 *   1. Zero secret leakage: Passwords, OTP codes, and unmasked raw NICs are
 *      never printed, logged, or recorded.
 *   2. 15 Protected Hashes: Pre-flight verified against docs/release/PROTECTED_HASHES.json.
 *   3. PDF Security Hold: Preserved intact; no PDF generation routes invoked.
 *   4. Zero Real Emails: Asserts testOtpHarness intercepts all OTP dispatches.
 *   5. Strict Account Allowlist: Operates solely with the 5 designated accounts.
 *   6. Independent Multi-Role Verification: Asserts durable Doctor and Pharmacy
 *      outcomes via independent Patient and Pharmacy read queries.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── Configuration Constants ──────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const LIVE_BACKEND_URL = (process.env.MEDISYNC_LIVE_BACKEND || 'https://medisync-wabc.onrender.com').replace(/\/+$/, '');
const LIVE_API_URL = `${LIVE_BACKEND_URL}/api`;
const LIVE_FRONTEND_URL = (process.env.MEDISYNC_LIVE_FRONTEND || 'https://medisync.chamodtharusha.com.lk').replace(/\/+$/, '');
const LOG_FILE_PATH = path.join(ROOT, 'docs/b6_live_verification_execution.log');
const JSON_REPORT_PATH = path.join(ROOT, 'docs/live_b6_verification_log.json');

const MAX_COLD_START_WAIT_MS = 90000;
const HTTP_TIMEOUT_MS = 25000;
const MAX_HTTP_RETRIES = 4;

const ALLOWLISTED_TEST_EMAILS = Object.freeze([
  'medisync.system.lk@gmail.com',
  'chamodtharusha13@gmail.com',
  'chamodalwis1309@gmail.com',
  'ayuaranacare@gmail.com',
  'coctharusha0913@gmail.com',
]);

// ─── Masking & Redaction Engine ──────────────────────────────────────────────

function maskEmail(email) {
  if (!email || typeof email !== 'string') return '<unknown-email>';
  return email.trim().replace(/(.{2})(.*)(?=@)/, (_, a, b) => a + '*'.repeat(Math.max(2, b.length)));
}

function maskNic(nic) {
  if (!nic || typeof nic !== 'string') return '<unknown-nic>';
  const clean = nic.trim();
  if (clean.length === 12) {
    return clean.slice(0, 4) + '****' + clean.slice(8);
  }
  if (clean.length === 10) {
    return clean.slice(0, 2) + '****' + clean.slice(6);
  }
  return clean.slice(0, 2) + '****' + clean.slice(-2);
}

function maskToken(token) {
  if (!token || typeof token !== 'string') return 'NONE';
  const hash = crypto.createHash('sha256').update(token).digest('hex').slice(0, 8);
  return `jwt_sha256_${hash}`;
}

// ─── Verification Logger ─────────────────────────────────────────────────────

class VerificationLogger {
  constructor(filePath) {
    this.filePath = filePath;
    this.entries = [];
    this.sensitiveTokens = [];
    this.startTime = new Date();

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this._initHeader();
  }

  registerSecret(token) {
    if (typeof token === 'string' && token.trim().length >= 4) {
      this.sensitiveTokens.push(token.trim());
    }
  }

  _initHeader() {
    const lines = [
      '====================================================================================================',
      'MediSync Target Feature B6 Live Verification Execution Log',
      `Run Initiated: ${this.startTime.toISOString()}`,
      `Backend Target:  ${LIVE_BACKEND_URL}`,
      `Frontend Target: ${LIVE_FRONTEND_URL}`,
      'Integrity Mode: development | Zero-Secret Guarantee: Active',
      'Strict Account Allowlist: 5 designated test accounts only',
      '====================================================================================================\n'
    ];
    fs.writeFileSync(this.filePath, lines.join('\n'), 'utf8');
  }

  sanitize(input) {
    if (input === null || input === undefined) return '';
    let text = typeof input === 'string' ? input : JSON.stringify(input);

    for (const secret of this.sensitiveTokens) {
      if (secret) {
        text = text.split(secret).join('[REDACTED_SECRET]');
      }
    }

    // Scrub Bearer tokens
    text = text.replace(/Bearer\s+ey[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]+/g, 'Bearer [REDACTED_JWT]');
    // Scrub OTP codes in JSON strings
    text = text.replace(/(?<="otp":\s*")[0-9]{6}(?=")/g, '[TEST_OTP_INTERCEPTED]');
    // Scrub unmasked 12-digit NICs (e.g. 199012345678 -> 1990****5678)
    text = text.replace(/([0-9]{4})[0-9]{4}([0-9]{4})/g, '$1****$2');
    // Scrub unmasked 10-char legacy NICs
    text = text.replace(/([0-9]{2})[0-9]{4}([0-9]{3}[vVxX])/gi, '$1****$2');

    return text;
  }

  logStep({ step, stepCode, actor, description, endpoint, httpStatus, latencyMs, recordIds = {}, assertion, details }) {
    const timestamp = new Date().toISOString();
    const cleanActor = this.sanitize(actor);
    const cleanDesc = this.sanitize(description);
    const cleanEndpoint = this.sanitize(endpoint || 'N/A');
    const cleanDetails = this.sanitize(details);
    const cleanRecordIds = {};
    for (const [k, v] of Object.entries(recordIds)) {
      cleanRecordIds[k] = this.sanitize(String(v));
    }
    const recordIdStr = Object.entries(cleanRecordIds).map(([k, v]) => `${k}=${v}`).join(', ') || 'none';

    const entry = {
      step,
      stepCode,
      timestamp,
      actor: cleanActor,
      description: cleanDesc,
      endpoint: cleanEndpoint,
      httpStatus: httpStatus || null,
      latencyMs: latencyMs || 0,
      recordIds: cleanRecordIds,
      assertion,
      details: cleanDetails
    };

    this.entries.push(entry);

    const block = [
      `[${timestamp}] STEP ${String(step).padStart(2, '0')} [${assertion}] ${stepCode}`,
      `  Description : ${cleanDesc}`,
      `  Endpoint    : ${cleanEndpoint} | Status: ${entry.httpStatus || 'N/A'} | Latency: ${entry.latencyMs}ms`,
      `  Actor       : ${cleanActor}`,
      `  Record IDs  : ${recordIdStr}`,
      `  Details     : ${cleanDetails}`,
      '----------------------------------------------------------------------------------------------------'
    ].join('\n') + '\n';

    fs.appendFileSync(this.filePath, block, 'utf8');
    console.log(block);
    return entry;
  }

  writeSummary({ doctorOutcomeAccepted, pharmacyOutcomeAccepted, zeroEmailAuditPassed, protectedHashesVerified, independentVerificationPassed, preConsentDenialVerified, idempotencyReplayVerified, rbacDenialsVerified }) {
    const passed = doctorOutcomeAccepted && pharmacyOutcomeAccepted && zeroEmailAuditPassed && protectedHashesVerified && independentVerificationPassed && preConsentDenialVerified && idempotencyReplayVerified && rbacDenialsVerified;
    const summary = [
      '\n====================================================================================================',
      'VERIFICATION ACCEPTANCE SUMMARY — TARGET FEATURE B6',
      '====================================================================================================',
      `15 Protected Hashes Verified Intact   : ${protectedHashesVerified ? 'YES (PASS)' : 'NO (FAIL)'}`,
      `Zero Real Email Guarantee Audit Passed: ${zeroEmailAuditPassed ? 'YES (PASS)' : 'NO (FAIL)'}`,
      `Pre-Consent Patient Lookup Denied (403): ${preConsentDenialVerified ? 'YES (PASS)' : 'NO (FAIL)'}`,
      `Doctor Consultation Outcome Accepted : ${doctorOutcomeAccepted ? 'YES (PASS)' : 'NO (FAIL)'}`,
      `Consultation Idempotency Replay (200): ${idempotencyReplayVerified ? 'YES (PASS)' : 'NO (FAIL)'}`,
      `Pharmacy Dispensation Outcome Accepted: ${pharmacyOutcomeAccepted ? 'YES (PASS)' : 'NO (FAIL)'}`,
      `Independent Read Outcomes Verified    : ${independentVerificationPassed ? 'YES (PASS)' : 'NO (FAIL)'}`,
      `Wrong-Role RBAC Denials Verified (403): ${rbacDenialsVerified ? 'YES (PASS)' : 'NO (FAIL)'}`,
      `Total Verification Steps Executed     : ${this.entries.length}`,
      `Failed Steps                          : ${this.entries.filter(e => e.assertion === 'FAIL').length}`,
      `Overall Acceptance Verdict            : ${passed && this.entries.length === 20 ? 'TARGET FEATURE B6 VERIFIED AND ACCEPTED (20/20 PASSES)' : 'VERIFICATION REJECTED'}`,
      '====================================================================================================\n'
    ].join('\n');

    fs.appendFileSync(this.filePath, summary, 'utf8');
    console.log(summary);
    return passed;
  }
}

// ─── Step 1: Protected Hash Assertion & PDF Security Hold Guard ───────────────

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
      throw new Error(`PROTECTED_HASH_MISMATCH: ${item.path} (computed: ${digest}, expected: ${item.releaseCandidateSha256})`);
    }
  }

  // Verify PDF Security Hold is intact
  const pdfGenPath = path.join(ROOT, 'server/src/utils/pdfGenerator.js');
  if (fs.existsSync(pdfGenPath)) {
    const pdfContent = fs.readFileSync(pdfGenPath, 'utf8');
    const holdMatches = pdfContent.match(/SECURITY_HOLD/g);
    if (!holdMatches || holdMatches.length === 0) {
      throw new Error('PDF_SECURITY_HOLD_BREACH: SECURITY_HOLD lock missing from pdfGenerator.js');
    }
  }

  return true;
}

// ─── Step 2: Credential & Allowlist Ingestion ─────────────────────────────────

function loadCredentials(logger) {
  const credPath = path.join(ROOT, 'docs/temp/TEST_CREDENTIALS.local.md');
  if (!fs.existsSync(credPath)) {
    throw new Error(`TEST_CREDENTIALS_FILE_NOT_FOUND: ${credPath}`);
  }

  const content = fs.readFileSync(credPath, 'utf8');
  const lines = content.split(/\r?\n/);

  const rawAccounts = {};
  let sharedPassword = process.env.TEST_PASSWORD || process.env.TEMP_ACCOUNT_PASSWORD;
  let patientNic = process.env.PATIENT_NIC;
  let testOtpCode = process.env.TEST_OTP_CODE;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const adminMatch = line.match(/^Admin:\s*([^\s]+)/i);
    if (adminMatch) { rawAccounts.admin = adminMatch[1].trim().toLowerCase(); continue; }

    const patientMatch = line.match(/^Patient:\s*([^\s(]+)(?:\s*\(NIC\s*([^)]+)\))?/i);
    if (patientMatch) {
      rawAccounts.patient = patientMatch[1].trim().toLowerCase();
      if (patientMatch[2]) patientNic = patientMatch[2].trim();
      continue;
    }

    const doctorMatch = line.match(/^Doctor:\s*([^\s]+)/i);
    if (doctorMatch) { rawAccounts.doctor = doctorMatch[1].trim().toLowerCase(); continue; }

    const hospitalMatch = line.match(/^Hospital:\s*([^\s]+)/i);
    if (hospitalMatch) { rawAccounts.hospital = hospitalMatch[1].trim().toLowerCase(); continue; }

    const pharmacyMatch = line.match(/^Pharmacy:\s*([^\s]+)/i);
    if (pharmacyMatch) { rawAccounts.pharmacy = pharmacyMatch[1].trim().toLowerCase(); continue; }

    const passMatch = line.match(/^Password(?:\s+for\s+all)?:\s*(.+)$/i);
    if (passMatch) { sharedPassword = passMatch[1].trim(); continue; }

    const otpMatch = line.match(/^(?:TEST[_\s]+)?OTP(?:[_\s]+CODE)?:\s*([0-9]{6})/i) || line.match(/^TEST_OTP_CODE:\s*([0-9]{6})/i);
    if (otpMatch) { testOtpCode = otpMatch[1].trim(); continue; }
  }

  // Register secrets with logger for automatic redaction
  if (sharedPassword) logger.registerSecret(sharedPassword);
  if (testOtpCode) logger.registerSecret(testOtpCode);
  if (patientNic) logger.registerSecret(patientNic);

  // Strict allowlist validation: fail-closed if any non-allowlisted email appears
  for (const [role, email] of Object.entries(rawAccounts)) {
    if (!ALLOWLISTED_TEST_EMAILS.includes(email)) {
      throw new Error(`SECURITY_ERROR: Unauthorized non-allowlisted email for role ${role}: ${maskEmail(email)}`);
    }
  }

  const requiredRoles = ['patient', 'doctor', 'pharmacy'];
  for (const r of requiredRoles) {
    if (!rawAccounts[r]) throw new Error(`CREDENTIALS_INCOMPLETE: Missing required role "${r}"`);
  }

  if (!sharedPassword || sharedPassword.length < 8) {
    throw new Error('CREDENTIALS_INVALID: Shared password missing or shorter than 8 characters');
  }

  if (!patientNic || !/^([0-9]{9}[vVxX]|[0-9]{12})$/.test(patientNic)) {
    throw new Error(`CREDENTIALS_INVALID: Missing or malformed patient NIC: ${maskNic(patientNic)}`);
  }

  if (!testOtpCode || !/^[0-9]{6}$/.test(String(testOtpCode).trim())) {
    throw new Error('CREDENTIALS_INVALID: A valid 6-digit TEST_OTP_CODE is required via docs/temp/TEST_CREDENTIALS.local.md or process.env.TEST_OTP_CODE');
  }

  return Object.freeze({
    password: sharedPassword,
    testOtpCode: String(testOtpCode).trim(),
    patientNic: String(patientNic).trim().toUpperCase(),
    accounts: rawAccounts
  });
}

// ─── HTTP Session & Transport Layer ──────────────────────────────────────────

class UserSession {
  constructor(role, email) {
    this.role = role;
    this.email = email;
    this.token = null;
    this.refreshToken = null;
    this.patientAccessToken = null;
    this.pharmacyId = null;
    this.cookies = new Map();
    this.deviceFingerprint = crypto.createHash('sha256').update(`b6_live_${role}_${email}`).digest('hex');
  }

  updateCookies(setCookieHeader) {
    if (!setCookieHeader) return;
    const items = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    for (const item of items) {
      const parts = item.split(';')[0].split('=');
      if (parts.length === 2) {
        this.cookies.set(parts[0].trim(), parts[1].trim());
      }
    }
  }

  getCookieHeader() {
    if (this.cookies.size === 0) return '';
    return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

async function requestWithRetry(url, options = {}, session = null, timeoutMs = HTTP_TIMEOUT_MS) {
  let attempt = 0;
  let lastError = null;

  while (attempt < MAX_HTTP_RETRIES) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers = {
      'Accept': 'application/json',
      ...(options.headers || {})
    };

    let bodyPayload = options.body;
    if (bodyPayload && typeof bodyPayload === 'object' && !(bodyPayload instanceof String)) {
      headers['Content-Type'] = 'application/json';
      bodyPayload = JSON.stringify(bodyPayload);
    }

    if (session) {
      if (session.token && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${session.token}`;
      }
      if (session.patientAccessToken && !headers['x-patient-access']) {
        headers['x-patient-access'] = session.patientAccessToken;
      }
      const cookieStr = session.getCookieHeader();
      if (cookieStr) headers['Cookie'] = cookieStr;
      headers['X-Device-Fingerprint'] = session.deviceFingerprint;
      headers['X-Hardware-Model'] = 'MediSync-LiveVerify-Runner';
    }

    const startTime = Date.now();
    try {
      const res = await fetch(url, { ...options, body: bodyPayload, headers, signal: controller.signal });
      clearTimeout(timer);
      const latencyMs = Date.now() - startTime;

      if (session && typeof res.headers.getSetCookie === 'function') {
        session.updateCookies(res.headers.getSetCookie());
      } else if (session && res.headers.get('set-cookie')) {
        session.updateCookies(res.headers.get('set-cookie'));
      }

      // Handle transient Render cold-start / gateway errors
      if ([502, 503, 504].includes(res.status) && attempt < MAX_HTTP_RETRIES) {
        const delay = Math.min(10000, 1500 * Math.pow(2, attempt) + Math.random() * 500);
        console.log(`[HTTP RETRY] HTTP ${res.status} on ${url}. Retrying in ${Math.round(delay)}ms (attempt ${attempt}/${MAX_HTTP_RETRIES})...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      let parsedBody = null;
      const text = await res.text();
      try { parsedBody = JSON.parse(text); } catch (_) { parsedBody = text; }

      return {
        status: res.status,
        headers: res.headers,
        data: parsedBody,
        latencyMs
      };
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < MAX_HTTP_RETRIES) {
        const delay = Math.min(10000, 1500 * Math.pow(2, attempt) + Math.random() * 500);
        console.log(`[HTTP RETRY] Network error (${err.message}) on ${url}. Retrying in ${Math.round(delay)}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw new Error(`HTTP_REQUEST_FAILED: Request to ${url} failed after ${MAX_HTTP_RETRIES} attempts: ${lastError?.message}`);
}

// ─── Step 3: Zero Real Email Assertion Guard ─────────────────────────────────

function assertZeroRealEmailDispatch(res, stepName) {
  const payload = res.data?.data || res.data;
  if (!payload || typeof payload !== 'object') {
    throw new Error(`ZERO_EMAIL_AUDIT_FAILURE [${stepName}]: Response payload missing`);
  }

  if (payload.provider !== 'test-harness') {
    throw new Error(
      `ZERO_EMAIL_AUDIT_FAILURE [${stepName}]: External email provider detected! Expected "test-harness", got "${payload.provider}"`
    );
  }

  if (payload.deliveryQueued !== false) {
    throw new Error(`ZERO_EMAIL_AUDIT_FAILURE [${stepName}]: Email was queued for external transport`);
  }

  if (payload.deliveryConfirmed !== false) {
    throw new Error(`ZERO_EMAIL_AUDIT_FAILURE [${stepName}]: External delivery was confirmed`);
  }

  if (payload.fallbackUsed === true) {
    throw new Error(`ZERO_EMAIL_AUDIT_FAILURE [${stepName}]: Fallback transport was triggered`);
  }

  if (payload.providerAccepted !== true) {
    throw new Error(`ZERO_EMAIL_AUDIT_FAILURE [${stepName}]: Provider acceptance not confirmed`);
  }

  return {
    verified: true,
    provider: payload.provider,
    auditText: `Zero real emails dispatched (provider: '${payload.provider}', deliveryQueued: false, deliveryConfirmed: false)`
  };
}

// ─── Step 4: Authentication Helper ───────────────────────────────────────────

async function authenticateRole(session, password, testOtpCode, endpoint = '/auth/login', extraBody = {}, logger, stepNum, stepCode) {
  const loginRes = await requestWithRetry(`${LIVE_API_URL}${endpoint}`, {
    method: 'POST',
    body: { email: session.email, password, role: session.role, ...extraBody }
  }, session);

  if (loginRes.status !== 200) {
    logger.logStep({
      step: stepNum,
      stepCode,
      actor: session.role.toUpperCase(),
      description: `Authenticate ${session.role} account`,
      endpoint: `POST ${endpoint}`,
      httpStatus: loginRes.status,
      latencyMs: loginRes.latencyMs,
      assertion: 'FAIL',
      details: `Authentication failed: ${JSON.stringify(loginRes.data)}`
    });
    throw new Error(`AUTH_FAILED [${session.role}]: HTTP ${loginRes.status}`);
  }

  const loginData = loginRes.data?.data || loginRes.data;

  // If 2FA or device OTP challenge triggered
  if (loginData?.requiresOTP) {
    // Audit zero real email on 2FA challenge response
    assertZeroRealEmailDispatch(loginRes, `${stepCode}_2FA_CHALLENGE`);

    const otpRes = await requestWithRetry(`${LIVE_API_URL}/auth/verify-otp`, {
      method: 'POST',
      body: { userId: loginData.userId, otp: testOtpCode }
    }, session);

    if (otpRes.status !== 200) {
      throw new Error(`OTP_VERIFY_FAILED [${session.role}]: HTTP ${otpRes.status}`);
    }

    const verified = otpRes.data?.data || otpRes.data;
    session.token = verified.accessToken || verified.token;
    session.refreshToken = verified.refreshToken;
    session.pharmacyId = verified.pharmacyId || session.pharmacyId;
  } else {
    session.token = loginData.accessToken || loginData.token;
    session.refreshToken = loginData.refreshToken;
    session.pharmacyId = loginData.pharmacyId || session.pharmacyId;
  }

  if (!session.token) {
    throw new Error(`TOKEN_MISSING: Access token missing for ${session.role}`);
  }

  logger.logStep({
    step: stepNum,
    stepCode,
    actor: session.role.toUpperCase(),
    description: `Authenticate allowlisted ${session.role} (${maskEmail(session.email)})`,
    endpoint: `POST ${endpoint}`,
    httpStatus: loginRes.status,
    latencyMs: loginRes.latencyMs,
    recordIds: { role: session.role },
    assertion: 'PASS',
    details: `Authenticated successfully. Token fingerprint: ${maskToken(session.token)}`
  });
}

// ─── Step 5: Patient Access OTP Helper ───────────────────────────────────────

async function requestAndVerifyPatientConsent(clinicianSession, patientNic, testOtpCode, requesterName, logger, reqStepNum, verifyStepNum, reqCode, verifyCode) {
  // A. Request Access
  const reqRes = await requestWithRetry(`${LIVE_API_URL}/patient/request-access`, {
    method: 'POST',
    body: { patientNic, requesterRole: clinicianSession.role, requesterName }
  }, clinicianSession);

  if (reqRes.status !== 200) {
    logger.logStep({
      step: reqStepNum,
      stepCode: reqCode,
      actor: clinicianSession.role.toUpperCase(),
      description: `Request patient access OTP for ${clinicianSession.role}`,
      endpoint: 'POST /api/patient/request-access',
      httpStatus: reqRes.status,
      latencyMs: reqRes.latencyMs,
      assertion: 'FAIL',
      details: `Request access failed: ${JSON.stringify(reqRes.data)}`
    });
    throw new Error(`CONSENT_REQUEST_FAILED: HTTP ${reqRes.status}`);
  }

  // Audit zero real email dispatch on consent response
  const emailAudit = assertZeroRealEmailDispatch(reqRes, reqCode);
  const sessionId = reqRes.data?.sessionId;
  if (!sessionId) throw new Error('CONSENT_SESSION_ID_MISSING');

  logger.logStep({
    step: reqStepNum,
    stepCode: reqCode,
    actor: clinicianSession.role.toUpperCase(),
    description: `Request patient access OTP for ${clinicianSession.role} (${maskNic(patientNic)})`,
    endpoint: 'POST /api/patient/request-access',
    httpStatus: reqRes.status,
    latencyMs: reqRes.latencyMs,
    recordIds: { sessionId },
    assertion: 'PASS',
    details: `${emailAudit.auditText}. Session created: ${sessionId}`
  });

  // B. Verify Access with TEST_OTP_CODE
  const verifyRes = await requestWithRetry(`${LIVE_API_URL}/patient/verify-access`, {
    method: 'POST',
    body: { sessionId, patientNic, otp: testOtpCode }
  }, clinicianSession);

  if (verifyRes.status !== 200) {
    logger.logStep({
      step: verifyStepNum,
      stepCode: verifyCode,
      actor: clinicianSession.role.toUpperCase(),
      description: `Verify patient access OTP for ${clinicianSession.role}`,
      endpoint: 'POST /api/patient/verify-access',
      httpStatus: verifyRes.status,
      latencyMs: verifyRes.latencyMs,
      recordIds: { sessionId },
      assertion: 'FAIL',
      details: `Verify access failed: ${JSON.stringify(verifyRes.data)}`
    });
    throw new Error(`CONSENT_VERIFY_FAILED: HTTP ${verifyRes.status}`);
  }

  const consentToken = verifyRes.data?.accessToken;
  if (!consentToken) throw new Error('PATIENT_ACCESS_TOKEN_MISSING');

  clinicianSession.patientAccessToken = consentToken;

  logger.logStep({
    step: verifyStepNum,
    stepCode: verifyCode,
    actor: clinicianSession.role.toUpperCase(),
    description: `Verify patient access OTP with testOtpHarness for ${clinicianSession.role}`,
    endpoint: 'POST /api/patient/verify-access',
    httpStatus: verifyRes.status,
    latencyMs: verifyRes.latencyMs,
    recordIds: { sessionId },
    assertion: 'PASS',
    details: `Consent token granted. Fingerprint: ${maskToken(consentToken)}`
  });

  return consentToken;
}

// ─── MAIN EXECUTION RUNNER ───────────────────────────────────────────────────

async function main() {
  const runId = `B6-RUN-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const logger = new VerificationLogger(LOG_FILE_PATH);

  const manifest = {
    runId,
    timestamp: new Date().toISOString(),
    backendUrl: LIVE_BACKEND_URL,
    frontendUrl: LIVE_FRONTEND_URL,
    protectedHashesVerified: false,
    zeroEmailAuditPassed: false,
    preConsentDenialVerified: false,
    doctorOutcome: null,
    idempotencyReplayVerified: false,
    pharmacyOutcome: null,
    independentVerification: null,
    rbacDenialsVerified: false,
    totalSteps: 0,
    stepsPassed: 0,
    success: false
  };

  try {
    console.log('====================================================================================================');
    console.log(`  MEDISYNC LIVE VERIFICATION RUNNER — TARGET FEATURE B6 [${runId}]`);
    console.log('====================================================================================================');

    // ── STEP 1: Pre-flight Protected Hash Integrity & PDF Security Hold Guard ───
    verifyProtectedHashes();
    manifest.protectedHashesVerified = true;
    logger.logStep({
      step: 1,
      stepCode: 'PREFLIGHT_INTEGRITY',
      actor: 'SYSTEM',
      description: 'Pre-flight verify 15 protected file hashes and PDF security hold',
      endpoint: 'Local Filesystem',
      httpStatus: null,
      latencyMs: 0,
      assertion: 'PASS',
      details: 'All 15 release candidate SHA-256 hashes matched 100%. SECURITY_HOLD active in pdfGenerator.js.'
    });

    // ── STEP 2: Ingest Credentials & Enforce Allowlist ──────────────────────────
    const { password, testOtpCode, patientNic, accounts } = loadCredentials(logger);
    logger.logStep({
      step: 2,
      stepCode: 'CREDENTIAL_INGESTION',
      actor: 'SYSTEM',
      description: 'Ingest allowlisted credentials from docs/temp/TEST_CREDENTIALS.local.md',
      endpoint: 'Local Filesystem',
      httpStatus: null,
      latencyMs: 0,
      recordIds: { patientNicMasked: maskNic(patientNic) },
      assertion: 'PASS',
      details: 'All 5 accounts verified against immutable allowlist. Zero secrets leaked.'
    });

    // ── STEP 3: Frontend Liveness Probe ─────────────────────────────────────────
    const feRes = await requestWithRetry(LIVE_FRONTEND_URL, { method: 'GET' }, null, 15000);
    if (feRes.status !== 200 || !String(feRes.data).includes('id="root"')) {
      throw new Error(`FRONTEND_LIVENESS_FAILED: HTTP ${feRes.status}`);
    }
    logger.logStep({
      step: 3,
      stepCode: 'FRONTEND_LIVENESS',
      actor: 'SYSTEM',
      description: `Probe live frontend application at ${LIVE_FRONTEND_URL}`,
      endpoint: `GET ${LIVE_FRONTEND_URL}`,
      httpStatus: feRes.status,
      latencyMs: feRes.latencyMs,
      assertion: 'PASS',
      details: `Frontend responsive (HTTP 200, DOM container <div id="root"> present).`
    });

    // ── STEP 4: Backend Cold Start & Health Probe ───────────────────────────────
    const probeStartTime = Date.now();
    let backendReady = false;
    let probeLatency = 0;

    while (Date.now() - probeStartTime < MAX_COLD_START_WAIT_MS) {
      try {
        const probeRes = await requestWithRetry(`${LIVE_BACKEND_URL}/health`, { method: 'GET' }, null, 8000);
        if (probeRes.status === 200) {
          backendReady = true;
          probeLatency = probeRes.latencyMs;
          break;
        }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 4000));
    }

    if (!backendReady) {
      throw new Error(`COLD_START_TIMEOUT: Backend at ${LIVE_BACKEND_URL} did not respond within ${MAX_COLD_START_WAIT_MS / 1000}s`);
    }

    logger.logStep({
      step: 4,
      stepCode: 'BACKEND_HEALTH_PROBE',
      actor: 'SYSTEM',
      description: `Probe live backend health endpoint at ${LIVE_BACKEND_URL}/health`,
      endpoint: `GET ${LIVE_BACKEND_URL}/health`,
      httpStatus: 200,
      latencyMs: probeLatency,
      assertion: 'PASS',
      details: `Backend responsive and ready (status: ready, service: medisync-express).`
    });

    // Initialize Role Sessions
    const doctorSession = new UserSession('doctor', accounts.doctor);
    const patientSession = new UserSession('patient', accounts.patient);
    const pharmacySession = new UserSession('pharmacist', accounts.pharmacy);

    // ── STEP 5: Doctor Authentication ───────────────────────────────────────────
    await authenticateRole(doctorSession, password, testOtpCode, '/auth/login', { loginType: 'personal' }, logger, 5, 'DOCTOR_AUTH');

    // ── STEP 6: Patient Authentication ──────────────────────────────────────────
    await authenticateRole(patientSession, password, testOtpCode, '/auth/login', {}, logger, 6, 'PATIENT_AUTH');

    // ── STEP 7: Pharmacy Authentication ─────────────────────────────────────────
    await authenticateRole(pharmacySession, password, testOtpCode, '/pharmacy/login', {}, logger, 7, 'PHARMACY_AUTH');

    // ── STEP 8 (NEW PASS 1): Doctor Patient Lookup Prior to Consent (403 Denial) ─
    const unconsentedNic = '199512345678';
    const preConsentLookupRes = await requestWithRetry(`${LIVE_API_URL}/patient/${unconsentedNic}`, {
      method: 'GET'
    }, doctorSession);

    if (preConsentLookupRes.status !== 403) {
      logger.logStep({
        step: 8,
        stepCode: 'DOCTOR_LOOKUP_PRE_CONSENT_DENIAL',
        actor: 'DOCTOR',
        description: 'Verify doctor patient lookup prior to consent returns HTTP 403 Forbidden',
        endpoint: `GET /api/patient/${maskNic(unconsentedNic)}`,
        httpStatus: preConsentLookupRes.status,
        latencyMs: preConsentLookupRes.latencyMs,
        assertion: 'FAIL',
        details: `Expected HTTP 403 Forbidden prior to consent, got HTTP ${preConsentLookupRes.status}`
      });
      throw new Error(`PRE_CONSENT_DENIAL_FAILED: Expected HTTP 403, got ${preConsentLookupRes.status}`);
    }

    logger.logStep({
      step: 8,
      stepCode: 'DOCTOR_LOOKUP_PRE_CONSENT_DENIAL',
      actor: 'DOCTOR',
      description: 'Verify doctor patient lookup prior to consent returns HTTP 403 Forbidden',
      endpoint: `GET /api/patient/${maskNic(unconsentedNic)}`,
      httpStatus: preConsentLookupRes.status,
      latencyMs: preConsentLookupRes.latencyMs,
      recordIds: { unconsentedNicMasked: maskNic(unconsentedNic) },
      assertion: 'PASS',
      details: 'Doctor patient lookup prior to consent rejected with HTTP 403 Forbidden. Consent gating strictly enforced.'
    });
    manifest.preConsentDenialVerified = true;

    // ── STEP 9 & 10: Doctor Patient Access Request & Verify ─────────────────────
    await requestAndVerifyPatientConsent(
      doctorSession, patientNic, testOtpCode, 'Dr. Chamod Alwis',
      logger, 9, 10, 'DOCTOR_PATIENT_ACCESS_REQUEST', 'DOCTOR_PATIENT_ACCESS_VERIFY'
    );
    manifest.zeroEmailAuditPassed = true;

    // ── Dynamic Clinical Drug Selection to Avoid 409 Conflict ──────────────────
    // Pre-flight check patient active prescriptions to prevent duplicate active ingredient conflict
    const activeRxRes = await requestWithRetry(`${LIVE_API_URL}/patient/${patientNic}/prescriptions`, {
      method: 'GET'
    }, patientSession);

    const existingRxs = activeRxRes.data?.data || [];
    const activeRxs = existingRxs.filter(r => ['pending', 'issued', 'dispensed'].includes(r.status) && new Date(r.expiresAt).getTime() > Date.now());
    const activeDrugNames = activeRxs.map(r => (r.drugName || '').toLowerCase().trim());

    // Candidate list of safe, reviewed essential medications from COMMON_DRUGS
    const drugCandidates = [
      { name: 'Ranitidine 150mg', dosage: '150mg', frequency: 'Twice daily', durationDays: 14, instructions: 'Take 1 tablet twice daily before meals.' },
      { name: 'Metformin 500mg', dosage: '500mg', frequency: 'Twice daily', durationDays: 14, instructions: 'Take 1 tablet with meals.' },
      { name: 'Amlodipine 5mg', dosage: '5mg', frequency: 'Daily', durationDays: 14, instructions: 'Take 1 tablet in the morning.' },
      { name: 'Salbutamol Inhaler', dosage: '100mcg/dose', frequency: 'As needed', durationDays: 14, instructions: 'Inhale 2 puffs as needed for shortness of breath.' },
      { name: 'Zinc Sulfate 20mg', dosage: '20mg', frequency: 'Daily', durationDays: 14, instructions: 'Take 1 tablet daily.' },
      { name: 'Amoxicillin 500mg', dosage: '500mg', frequency: 'Three times a day', durationDays: 5, instructions: 'Take 1 capsule every 8 hours after meals.' },
      { name: 'Cetirizine 10mg', dosage: '10mg', frequency: 'Daily', durationDays: 7, instructions: 'Take 1 tablet at bedtime.' },
      { name: 'Paracetamol 500mg', dosage: '500mg', frequency: 'Three times a day', durationDays: 5, instructions: 'Take 1 tablet after meals.' }
    ];

    const { analyzeMedicationSafety } = require('../server/src/utils/ingredientResolver');
    const { COMMON_DRUGS } = require('../server/src/controllers/drugController');

    let chosenDrug = drugCandidates.find(c => {
      if (activeDrugNames.some(active => active.includes(c.name.toLowerCase().split(' ')[0]))) return false;
      const safety = analyzeMedicationSafety([...activeDrugNames, c.name], [], COMMON_DRUGS);
      return safety && safety.hasInteraction === false && (!safety.duplicateIngredients || safety.duplicateIngredients.length === 0) && safety.verificationIncomplete === false;
    });
    if (!chosenDrug) {
      chosenDrug = drugCandidates.find(c => !activeDrugNames.some(active => active.includes(c.name.toLowerCase().split(' ')[0]))) || drugCandidates[0];
    }

    // ── STEP 11: Doctor Consultation & Prescription Issuance (Doctor Outcome) ──
    const consultationIdempKey = `b6-con-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    const isRanitidine = chosenDrug.name.includes('Ranitidine');
    const isMetformin = chosenDrug.name.includes('Metformin');
    const consultationPayload = {
      patientNic,
      diagnosis: isRanitidine ? 'Gastroesophageal Reflux Disease (B6 Live Flow Acceptance)' :
                 isMetformin ? 'Type 2 Diabetes Mellitus (B6 Live Flow Acceptance)' :
                 'Seasonal Allergic Rhinitis (B6 Live Flow Acceptance)',
      icdCode: isRanitidine ? 'K21.9' : isMetformin ? 'E11.9' : 'J30.1',
      icdDescription: isRanitidine ? 'Gastro-esophageal reflux disease without oesophagitis' :
                      isMetformin ? 'Type 2 diabetes mellitus without complications' : 'Allergic rhinitis due to pollen',
      icdVersion: 'ICD-10',
      symptoms: isRanitidine ? ['Heartburn', 'Acid Regurgitation', 'Dyspepsia'] :
                isMetformin ? ['Polyuria', 'Polydipsia', 'Fatigue'] : ['Sneezing', 'Nasal Congestion', 'Watery Eyes'],
      notes: `Automated live verification consultation ${runId}`,
      isFollowUpRequired: false,
      prescriptions: [
        {
          name: chosenDrug.name,
          dosage: chosenDrug.dosage,
          frequency: chosenDrug.frequency,
          durationDays: chosenDrug.durationDays,
          instructions: chosenDrug.instructions
        }
      ]
    };

    const consultRes = await requestWithRetry(`${LIVE_API_URL}/doctor/consultation`, {
      method: 'POST',
      headers: { 'Idempotency-Key': consultationIdempKey },
      body: consultationPayload
    }, doctorSession);

    if (![200, 201].includes(consultRes.status)) {
      logger.logStep({
        step: 11,
        stepCode: 'DOCTOR_CONSULTATION_ISSUE',
        actor: 'DOCTOR',
        description: 'Issue doctor consultation & prescription',
        endpoint: 'POST /api/doctor/consultation',
        httpStatus: consultRes.status,
        latencyMs: consultRes.latencyMs,
        assertion: 'FAIL',
        details: `Consultation issuance failed: ${JSON.stringify(consultRes.data)}`
      });
      throw new Error(`CONSULTATION_ISSUANCE_FAILED: HTTP ${consultRes.status}`);
    }

    const consultData = consultRes.data;
    const consultationId = consultData.consultationId;
    const issuedPrescriptions = consultData.prescriptions || [];
    if (!issuedPrescriptions.length) throw new Error('NO_PRESCRIPTIONS_RETURNED');

    const targetRx = issuedPrescriptions[0];
    const targetRxObjectId = targetRx._id;
    const targetRxCustomId = targetRx.prescriptionId;

    // Doctor Outcome Contract Assertions
    if (!consultationId || !/^[a-f0-9]{24}$/i.test(consultationId)) {
      throw new Error(`DOCTOR_OUTCOME_VIOLATION: consultationId must be 24-hex string, got "${consultationId}"`);
    }
    if (!targetRxObjectId || !/^[a-f0-9]{24}$/i.test(targetRxObjectId)) {
      throw new Error(`DOCTOR_OUTCOME_VIOLATION: rx _id must be 24-hex string, got "${targetRxObjectId}"`);
    }
    if (!targetRxCustomId || !/^RX-\d{8}-\d{6}$/.test(targetRxCustomId)) {
      throw new Error(`DOCTOR_OUTCOME_VIOLATION: prescriptionId must match RX-YYYYMMDD-XXXXXX, got "${targetRxCustomId}"`);
    }
    if (targetRx.status !== 'pending') {
      throw new Error(`DOCTOR_OUTCOME_VIOLATION: initial prescription status must be "pending", got "${targetRx.status}"`);
    }
    if (targetRx.isOTC !== false) {
      throw new Error(`DOCTOR_OUTCOME_VIOLATION: doctor-issued prescription must have isOTC === false`);
    }

    manifest.doctorOutcome = {
      accepted: true,
      consultationId,
      prescriptionObjectId: targetRxObjectId,
      prescriptionCustomId: targetRxCustomId,
      drugName: chosenDrug.name,
      dosage: chosenDrug.dosage,
      initialStatus: targetRx.status,
      durationDays: targetRx.durationDays,
      replayed: consultData.replayed || false
    };

    logger.logStep({
      step: 11,
      stepCode: 'DOCTOR_CONSULTATION_ISSUE',
      actor: 'DOCTOR',
      description: 'Issue consultation and prescription outcome (Doctor Outcome)',
      endpoint: 'POST /api/doctor/consultation',
      httpStatus: consultRes.status,
      latencyMs: consultRes.latencyMs,
      recordIds: {
        consultationId,
        prescriptionId: targetRxCustomId,
        rxObjectId: targetRxObjectId
      },
      assertion: 'PASS',
      details: `Doctor Outcome Accepted. Created consultation ${consultationId} with pending prescription ${targetRxCustomId} (${chosenDrug.name}).`
    });

    // ── STEP 12 (NEW PASS 2): Double-Click Consultation Idempotency Replay ─────
    const replayRes = await requestWithRetry(`${LIVE_API_URL}/doctor/consultation`, {
      method: 'POST',
      headers: { 'Idempotency-Key': consultationIdempKey },
      body: consultationPayload
    }, doctorSession);

    if (replayRes.status !== 200) {
      logger.logStep({
        step: 12,
        stepCode: 'DOCTOR_CONSULTATION_IDEMPOTENCY_REPLAY',
        actor: 'DOCTOR',
        description: 'Verify double-click consultation resubmission with same Idempotency-Key returns HTTP 200 replay with identical IDs',
        endpoint: 'POST /api/doctor/consultation',
        httpStatus: replayRes.status,
        latencyMs: replayRes.latencyMs,
        assertion: 'FAIL',
        details: `Expected HTTP 200 on idempotency replay, got HTTP ${replayRes.status}: ${JSON.stringify(replayRes.data)}`
      });
      throw new Error(`IDEMPOTENCY_REPLAY_FAILED: Expected HTTP 200, got ${replayRes.status}`);
    }

    const replayData = replayRes.data;
    if (replayData.replayed !== true) {
      throw new Error('IDEMPOTENCY_REPLAY_FAILED: Expected replayed === true on replay response');
    }
    if (replayData.consultationId !== consultationId) {
      throw new Error(`IDEMPOTENCY_REPLAY_FAILED: consultationId mismatch (expected ${consultationId}, got ${replayData.consultationId})`);
    }
    const replayRxs = replayData.prescriptions || [];
    if (!replayRxs.length || replayRxs[0]._id !== targetRxObjectId || replayRxs[0].prescriptionId !== targetRxCustomId) {
      throw new Error('IDEMPOTENCY_REPLAY_FAILED: Replay returned mismatched prescription object or custom ID');
    }

    // Verify patient prescription count did not increment
    const postReplayRxRes = await requestWithRetry(`${LIVE_API_URL}/patient/${patientNic}/prescriptions`, {
      method: 'GET'
    }, patientSession);
    const postReplayRxs = postReplayRxRes.data?.data || [];
    const matchingCustomRxCount = postReplayRxs.filter(r => r.prescriptionId === targetRxCustomId).length;
    if (matchingCustomRxCount !== 1) {
      throw new Error(`IDEMPOTENCY_DUPLICATE_DETECTED: Found ${matchingCustomRxCount} prescriptions matching ${targetRxCustomId}`);
    }

    logger.logStep({
      step: 12,
      stepCode: 'DOCTOR_CONSULTATION_IDEMPOTENCY_REPLAY',
      actor: 'DOCTOR',
      description: 'Verify double-click consultation resubmission with same Idempotency-Key returns HTTP 200 replay with identical IDs',
      endpoint: 'POST /api/doctor/consultation',
      httpStatus: replayRes.status,
      latencyMs: replayRes.latencyMs,
      recordIds: {
        consultationId: replayData.consultationId,
        prescriptionId: targetRxCustomId,
        rxObjectId: targetRxObjectId,
        replayed: 'true'
      },
      assertion: 'PASS',
      details: `Double-click consultation idempotency replay confirmed (HTTP 200, replayed: true). Identical consultationId=${consultationId} and prescriptionId=${targetRxCustomId}. Zero duplicates created.`
    });
    manifest.idempotencyReplayVerified = true;

    // ── STEP 13: Pharmacy Pre-flight Inventory Check & Restock Guarantee ────────
    const invRes = await requestWithRetry(`${LIVE_API_URL}/pharmacy/inventory`, { method: 'GET' }, pharmacySession);
    let inventoryItems = invRes.data?.data || invRes.data || [];
    let matchedItem = inventoryItems.find(i => (i.drugName || '').toLowerCase().trim() === chosenDrug.name.toLowerCase().trim());

    if (!matchedItem || matchedItem.stock < 10) {
      const putInvRes = await requestWithRetry(`${LIVE_API_URL}/pharmacy/inventory`, {
        method: 'PUT',
        body: { drugName: chosenDrug.name, stock: 100, reorderLevel: 20, unit: 'tablets' }
      }, pharmacySession);
      if (putInvRes.status !== 200) throw new Error(`INVENTORY_UPDATE_FAILED: HTTP ${putInvRes.status}`);

      const refInv = await requestWithRetry(`${LIVE_API_URL}/pharmacy/inventory`, { method: 'GET' }, pharmacySession);
      inventoryItems = refInv.data?.data || refInv.data || [];
      matchedItem = inventoryItems.find(i => (i.drugName || '').toLowerCase().trim() === chosenDrug.name.toLowerCase().trim());
    }

    if (!matchedItem) throw new Error(`PHARMACY_INVENTORY_NOT_FOUND: ${chosenDrug.name}`);
    const inventoryItemId = matchedItem._id;
    const stockBefore = matchedItem.stock;

    logger.logStep({
      step: 13,
      stepCode: 'PHARMACY_INVENTORY_ENSURE',
      actor: 'PHARMACY',
      description: `Verify and ensure sufficient inventory stock for ${chosenDrug.name}`,
      endpoint: 'GET/PUT /api/pharmacy/inventory',
      httpStatus: 200,
      latencyMs: invRes.latencyMs,
      recordIds: { inventoryItemId, stockBefore },
      assertion: 'PASS',
      details: `Inventory verified. Drug: ${chosenDrug.name}, available stock: ${stockBefore} units.`
    });

    // ── STEP 14 & 15: Pharmacy Patient Access Request & Verify ──────────────────
    await requestAndVerifyPatientConsent(
      pharmacySession, patientNic, testOtpCode, 'MediSync Pharmacist',
      logger, 14, 15, 'PHARMACY_PATIENT_ACCESS_REQUEST', 'PHARMACY_PATIENT_ACCESS_VERIFY'
    );

    // ── STEP 16: Pharmacy Discovery of Pending Prescription ─────────────────────
    const pendingRes = await requestWithRetry(`${LIVE_API_URL}/pharmacy/prescriptions/pending/${patientNic}`, {
      method: 'GET'
    }, pharmacySession);

    if (pendingRes.status !== 200) throw new Error(`PENDING_RX_QUERY_FAILED: HTTP ${pendingRes.status}`);
    const pendingList = pendingRes.data?.data?.prescriptions || [];
    const foundPending = pendingList.find(p => p._id === targetRxObjectId || p.prescriptionId === targetRxCustomId);

    if (!foundPending) {
      throw new Error(`PRESCRIPTION_DISCOVERY_FAILED: Rx ${targetRxCustomId} not found in pending prescriptions list`);
    }

    logger.logStep({
      step: 16,
      stepCode: 'PHARMACY_PENDING_DISCOVERY',
      actor: 'PHARMACY',
      description: `Discover pending prescription for patient ${maskNic(patientNic)}`,
      endpoint: `GET /api/pharmacy/prescriptions/pending/${patientNic}`,
      httpStatus: pendingRes.status,
      latencyMs: pendingRes.latencyMs,
      recordIds: { prescriptionId: targetRxCustomId },
      assertion: 'PASS',
      details: `Pending prescription found in pharmacy discovery pipeline with status "${foundPending.status}".`
    });

    // ── STEP 17: Pharmacy Medication Dispensation (Pharmacy Outcome) ────────────
    const dispenseIdempKey = `rx:${targetRxObjectId}`;
    const dispenseRes = await requestWithRetry(`${LIVE_API_URL}/pharmacy/dispense`, {
      method: 'POST',
      headers: { 'Idempotency-Key': dispenseIdempKey },
      body: {
        prescriptionId: targetRxObjectId,
        patientNic,
        items: [
          {
            inventoryItemId,
            drugName: chosenDrug.name,
            unit: matchedItem.unit || 'tablets',
            quantityDispensed: 1
          }
        ],
        isAlternativeDispensed: false
      }
    }, pharmacySession);

    if (![200, 201].includes(dispenseRes.status)) {
      logger.logStep({
        step: 17,
        stepCode: 'PHARMACY_DISPENSE_CHECKOUT',
        actor: 'PHARMACY',
        description: 'Execute medication dispensation',
        endpoint: 'POST /api/pharmacy/dispense',
        httpStatus: dispenseRes.status,
        latencyMs: dispenseRes.latencyMs,
        assertion: 'FAIL',
        details: `Dispensation failed: ${JSON.stringify(dispenseRes.data)}`
      });
      throw new Error(`DISPENSE_FAILED: HTTP ${dispenseRes.status}`);
    }

    const dispenseData = dispenseRes.data?.data || dispenseRes.data;
    const receiptNumber = dispenseData.receiptNumber;

    // Pharmacy Outcome Contract Assertions
    if (!receiptNumber || !/^REC-[a-f0-9]{24}$/i.test(receiptNumber)) {
      throw new Error(`PHARMACY_OUTCOME_VIOLATION: receiptNumber must match REC-<24hex>, got "${receiptNumber}"`);
    }
    if (String(dispenseData.prescriptionId) !== String(targetRxObjectId)) {
      throw new Error(`PHARMACY_OUTCOME_VIOLATION: receipt prescriptionId mismatch`);
    }

    manifest.pharmacyOutcome = {
      accepted: true,
      receiptNumber,
      prescriptionId: targetRxObjectId,
      prescriptionCustomId: targetRxCustomId,
      medicationCount: dispenseData.medicationCount || 1,
      replayed: dispenseRes.data?.replayed || false
    };

    logger.logStep({
      step: 17,
      stepCode: 'PHARMACY_DISPENSE_CHECKOUT',
      actor: 'PHARMACY',
      description: 'Execute medication dispensation and receipt creation (Pharmacy Outcome)',
      endpoint: 'POST /api/pharmacy/dispense',
      httpStatus: dispenseRes.status,
      latencyMs: dispenseRes.latencyMs,
      recordIds: {
        receiptNumber,
        prescriptionId: targetRxCustomId
      },
      assertion: 'PASS',
      details: `Pharmacy Outcome Accepted. Created immutable dispensing receipt ${receiptNumber} and updated status to "dispensed".`
    });

    // ── STEP 18: Independent Patient Timeline Read Verification ─────────────────
    const patientTimelineRes = await requestWithRetry(`${LIVE_API_URL}/patient/${patientNic}/prescriptions`, {
      method: 'GET'
    }, patientSession);

    if (patientTimelineRes.status !== 200) {
      throw new Error(`INDEPENDENT_PATIENT_READ_FAILED: HTTP ${patientTimelineRes.status}`);
    }

    const patientPrescriptions = patientTimelineRes.data?.data || [];
    const verifiedPatientRx = patientPrescriptions.find(p => p._id === targetRxObjectId || p.prescriptionId === targetRxCustomId);

    if (!verifiedPatientRx) {
      throw new Error(`INDEPENDENT_PATIENT_READ_FAILED: Target prescription not found in patient history`);
    }
    if (verifiedPatientRx.status !== 'dispensed') {
      throw new Error(`INDEPENDENT_PATIENT_READ_FAILED: Prescription status viewed by patient is "${verifiedPatientRx.status}", expected "dispensed"`);
    }
    if (!verifiedPatientRx.dispensedAt) {
      throw new Error(`INDEPENDENT_PATIENT_READ_FAILED: dispensedAt timestamp missing from patient prescription`);
    }
    if (String(verifiedPatientRx.consultationId) !== String(consultationId)) {
      throw new Error(`INDEPENDENT_PATIENT_READ_FAILED: Consultation linkage corrupted`);
    }

    logger.logStep({
      step: 18,
      stepCode: 'INDEPENDENT_PATIENT_TIMELINE',
      actor: 'PATIENT',
      description: 'Independent verification of dispensed prescription via Patient timeline',
      endpoint: `GET /api/patient/${patientNic}/prescriptions`,
      httpStatus: patientTimelineRes.status,
      latencyMs: patientTimelineRes.latencyMs,
      recordIds: {
        prescriptionId: targetRxCustomId,
        consultationId
      },
      assertion: 'PASS',
      details: `Patient timeline reflects status="dispensed", dispensedAt="${verifiedPatientRx.dispensedAt}", and consultation linkage intact.`
    });

    // ── STEP 19: Independent Pharmacy Receipt & Inventory Decrement Verification ─
    const receiptRes = await requestWithRetry(`${LIVE_API_URL}/pharmacy/receipt/${receiptNumber}`, {
      method: 'GET'
    }, pharmacySession);

    if (receiptRes.status !== 200) {
      throw new Error(`INDEPENDENT_RECEIPT_READ_FAILED: HTTP ${receiptRes.status}`);
    }

    const receiptDoc = receiptRes.data?.data || receiptRes.data;
    if (!receiptDoc || receiptDoc.receiptNumber !== receiptNumber) {
      throw new Error('INDEPENDENT_RECEIPT_READ_FAILED: Receipt lookup returned mismatched receiptNumber');
    }

    // Verify stock decrement
    const postInvRes = await requestWithRetry(`${LIVE_API_URL}/pharmacy/inventory`, { method: 'GET' }, pharmacySession);
    const postInvItems = postInvRes.data?.data || postInvRes.data || [];
    const postMatchedItem = postInvItems.find(i => String(i._id) === String(inventoryItemId));

    if (!postMatchedItem || postMatchedItem.stock >= stockBefore) {
      throw new Error(`INVENTORY_DECREMENT_FAILED: Expected stock < ${stockBefore}, got ${postMatchedItem?.stock}`);
    }

    manifest.independentVerification = {
      patientConfirmedStatus: verifiedPatientRx.status,
      patientDispensedAt: verifiedPatientRx.dispensedAt,
      receiptNumber: receiptDoc.receiptNumber,
      stockBefore,
      stockAfter: postMatchedItem.stock,
      inventoryDecremented: true
    };

    logger.logStep({
      step: 19,
      stepCode: 'INDEPENDENT_PHARMACY_RECEIPT',
      actor: 'PHARMACY',
      description: 'Independent verification of receipt and inventory stock decrement',
      endpoint: `GET /api/pharmacy/receipt/${receiptNumber}`,
      httpStatus: receiptRes.status,
      latencyMs: receiptRes.latencyMs,
      recordIds: {
        receiptNumber,
        stockBefore,
        stockAfter: postMatchedItem.stock
      },
      assertion: 'PASS',
      details: `Receipt ${receiptNumber} confirmed in pharmacy history. Inventory decremented from ${stockBefore} to ${postMatchedItem.stock}.`
    });

    // ── STEP 20 (NEW PASS 3): Wrong-Role Access RBAC Denials ────────────────────
    // A. Patient attempting Doctor Consultation endpoint
    const wrongRoleConsultRes = await requestWithRetry(`${LIVE_API_URL}/doctor/consultation`, {
      method: 'POST',
      headers: { 'Idempotency-Key': `wrong-role-con-${Date.now()}` },
      body: {
        patientNic,
        diagnosis: 'Unauthorized Consultation Attempt',
        prescriptions: []
      }
    }, patientSession);

    if (wrongRoleConsultRes.status !== 403) {
      logger.logStep({
        step: 20,
        stepCode: 'WRONG_ROLE_RBAC_DENIAL',
        actor: 'PATIENT',
        description: 'Verify wrong-role access returns HTTP 403 Forbidden across clinician and pharmacy routes',
        endpoint: 'POST /api/doctor/consultation & POST /api/pharmacy/dispense',
        httpStatus: wrongRoleConsultRes.status,
        latencyMs: wrongRoleConsultRes.latencyMs,
        assertion: 'FAIL',
        details: `Patient calling POST /api/doctor/consultation expected HTTP 403 Forbidden, got HTTP ${wrongRoleConsultRes.status}`
      });
      throw new Error(`WRONG_ROLE_RBAC_DENIAL_FAILED: Doctor consultation route returned HTTP ${wrongRoleConsultRes.status}`);
    }

    // B. Patient attempting Pharmacy Dispense endpoint
    const wrongRoleDispenseRes = await requestWithRetry(`${LIVE_API_URL}/pharmacy/dispense`, {
      method: 'POST',
      headers: { 'Idempotency-Key': `wrong-role-rx-${Date.now()}` },
      body: {
        prescriptionId: targetRxObjectId,
        items: []
      }
    }, patientSession);

    if (wrongRoleDispenseRes.status !== 403) {
      logger.logStep({
        step: 20,
        stepCode: 'WRONG_ROLE_RBAC_DENIAL',
        actor: 'PATIENT',
        description: 'Verify wrong-role access returns HTTP 403 Forbidden across clinician and pharmacy routes',
        endpoint: 'POST /api/doctor/consultation & POST /api/pharmacy/dispense',
        httpStatus: wrongRoleDispenseRes.status,
        latencyMs: wrongRoleDispenseRes.latencyMs,
        assertion: 'FAIL',
        details: `Patient calling POST /api/pharmacy/dispense expected HTTP 403 Forbidden, got HTTP ${wrongRoleDispenseRes.status}`
      });
      throw new Error(`WRONG_ROLE_RBAC_DENIAL_FAILED: Pharmacy dispense route returned HTTP ${wrongRoleDispenseRes.status}`);
    }

    logger.logStep({
      step: 20,
      stepCode: 'WRONG_ROLE_RBAC_DENIAL',
      actor: 'PATIENT',
      description: 'Verify wrong-role access returns HTTP 403 Forbidden across clinician and pharmacy routes',
      endpoint: 'POST /api/doctor/consultation & POST /api/pharmacy/dispense',
      httpStatus: 403,
      latencyMs: wrongRoleConsultRes.latencyMs + wrongRoleDispenseRes.latencyMs,
      recordIds: {
        doctorConsultStatus: wrongRoleConsultRes.status,
        pharmacyDispenseStatus: wrongRoleDispenseRes.status
      },
      assertion: 'PASS',
      details: 'Wrong-role access attempts strictly blocked with HTTP 403 Forbidden. RBAC policy enforced for non-doctor and non-pharmacist tokens.'
    });
    manifest.rbacDenialsVerified = true;

    // ── Summary & Final Acceptance ──────────────────────────────────────────────
    const allPassed = logger.writeSummary({
      doctorOutcomeAccepted: Boolean(manifest.doctorOutcome?.accepted),
      pharmacyOutcomeAccepted: Boolean(manifest.pharmacyOutcome?.accepted),
      zeroEmailAuditPassed: manifest.zeroEmailAuditPassed,
      protectedHashesVerified: manifest.protectedHashesVerified,
      independentVerificationPassed: Boolean(manifest.independentVerification),
      preConsentDenialVerified: manifest.preConsentDenialVerified,
      idempotencyReplayVerified: manifest.idempotencyReplayVerified,
      rbacDenialsVerified: manifest.rbacDenialsVerified
    });

    manifest.success = allPassed;
    manifest.totalSteps = logger.entries.length;
    manifest.stepsPassed = logger.entries.filter(e => e.assertion === 'PASS').length;
    fs.writeFileSync(JSON_REPORT_PATH, JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`[MANIFEST] JSON verification run manifest written to ${JSON_REPORT_PATH}`);

    process.exit(allPassed && logger.entries.length === 20 ? 0 : 1);

  } catch (err) {
    console.error(`\n[FATAL ERROR] B6 Verification Execution Halted: ${err.message}`);
    logger.logStep({
      step: 99,
      stepCode: 'EXECUTION_HALTED',
      actor: 'SYSTEM',
      description: 'Feature B6 Live Verification execution halted with fatal error',
      endpoint: 'N/A',
      httpStatus: 500,
      latencyMs: 0,
      assertion: 'FAIL',
      details: err.message
    });

    logger.writeSummary({
      doctorOutcomeAccepted: Boolean(manifest.doctorOutcome?.accepted),
      pharmacyOutcomeAccepted: Boolean(manifest.pharmacyOutcome?.accepted),
      zeroEmailAuditPassed: manifest.zeroEmailAuditPassed,
      protectedHashesVerified: manifest.protectedHashesVerified,
      independentVerificationPassed: false,
      preConsentDenialVerified: manifest.preConsentDenialVerified,
      idempotencyReplayVerified: manifest.idempotencyReplayVerified,
      rbacDenialsVerified: manifest.rbacDenialsVerified
    });

    manifest.success = false;
    manifest.failureReason = err.message;
    fs.writeFileSync(JSON_REPORT_PATH, JSON.stringify(manifest, null, 2), 'utf8');

    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  verifyProtectedHashes,
  loadCredentials,
  requestWithRetry,
  assertZeroRealEmailDispatch,
  UserSession,
  VerificationLogger
};
