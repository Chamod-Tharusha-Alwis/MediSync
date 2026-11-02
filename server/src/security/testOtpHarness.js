'use strict';

/**
 * Temporary Test OTP Security Harness
 * 
 * Strict invariants:
 *  1. Enabled ONLY when process.env.TEST_OTP_ENABLED === 'true'.
 *  2. OTP value comes strictly from process.env.TEST_OTP_CODE (never hardcoded in source).
 *  3. Works ONLY for the allowlist of exactly five test account emails.
 *  4. Every use is logged WITHOUT the OTP code.
 *  5. Documented in docs/TEMP_TEST_HARNESS.md.
 *  6. To be completely removed in the final cleanup task of the master run.
 */

const ALLOWLISTED_TEST_EMAILS = Object.freeze([
  'medisync.system.lk@gmail.com',
  'chamodtharusha13@gmail.com',
  'chamodalwis1309@gmail.com',
  'ayuaranacare@gmail.com',
  'coctharusha0913@gmail.com',
]);

function isTestOtpEnabled() {
  return (
    process.env.TEST_OTP_ENABLED === 'true' &&
    typeof process.env.TEST_OTP_CODE === 'string' &&
    /^[0-9]{6}$/.test(process.env.TEST_OTP_CODE.trim())
  );
}

function isAllowlistedEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  return ALLOWLISTED_TEST_EMAILS.includes(normalized);
}

function verifyTestOtp(email, candidateOtp) {
  if (!isTestOtpEnabled()) return false;
  if (!isAllowlistedEmail(email)) return false;
  if (typeof candidateOtp !== 'string' && typeof candidateOtp !== 'number') return false;

  const candidate = String(candidateOtp).trim();
  const configured = String(process.env.TEST_OTP_CODE).trim();

  if (candidate.length !== 6 || candidate !== configured) {
    return false;
  }

  const masked = String(email).replace(/(.{2})(.*)(?=@)/, (_, a, b) => a + '*'.repeat(Math.max(2, b.length)));
  console.log(`[Security Audit] Temporary test OTP verified successfully for allowlisted test account: ${masked}`);
  return true;
}

function shouldInterceptOtpEmail(email) {
  if (!isTestOtpEnabled()) return false;
  if (!isAllowlistedEmail(email)) return false;

  const masked = String(email).replace(/(.{2})(.*)(?=@)/, (_, a, b) => a + '*'.repeat(Math.max(2, b.length)));
  console.log(`[Security Audit] Test OTP email dispatch intercepted for allowlisted test account: ${masked}`);
  return true;
}

module.exports = {
  ALLOWLISTED_TEST_EMAILS,
  isTestOtpEnabled,
  isAllowlistedEmail,
  verifyTestOtp,
  shouldInterceptOtpEmail,
};
