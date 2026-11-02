'use strict';

const {
  ALLOWLISTED_TEST_EMAILS,
  isTestOtpEnabled,
  isAllowlistedEmail,
  verifyTestOtp,
  shouldInterceptOtpEmail,
} = require('../src/security/testOtpHarness');

describe('Temporary Test OTP Security Harness Specification', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.TEST_OTP_ENABLED;
    delete process.env.TEST_OTP_CODE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('1. Fails closed when TEST_OTP_ENABLED is not set or false', () => {
    process.env.TEST_OTP_CODE = '123456';
    expect(isTestOtpEnabled()).toBe(false);
    expect(verifyTestOtp('chamodalwis1309@gmail.com', '123456')).toBe(false);
    expect(shouldInterceptOtpEmail('chamodalwis1309@gmail.com')).toBe(false);

    process.env.TEST_OTP_ENABLED = 'false';
    expect(isTestOtpEnabled()).toBe(false);
    expect(verifyTestOtp('chamodalwis1309@gmail.com', '123456')).toBe(false);
  });

  test('2. Fails closed when TEST_OTP_CODE is missing, invalid length, or non-numeric', () => {
    process.env.TEST_OTP_ENABLED = 'true';

    delete process.env.TEST_OTP_CODE;
    expect(isTestOtpEnabled()).toBe(false);

    process.env.TEST_OTP_CODE = '12345'; // 5 digits
    expect(isTestOtpEnabled()).toBe(false);

    process.env.TEST_OTP_CODE = '1234567'; // 7 digits
    expect(isTestOtpEnabled()).toBe(false);

    process.env.TEST_OTP_CODE = 'abcdef'; // non-numeric
    expect(isTestOtpEnabled()).toBe(false);
  });

  test('3. Enforces allowlist strictly against the five designated test accounts', () => {
    expect(ALLOWLISTED_TEST_EMAILS).toHaveLength(5);
    expect(isAllowlistedEmail('medisync.system.lk@gmail.com')).toBe(true);
    expect(isAllowlistedEmail('chamodtharusha13@gmail.com')).toBe(true);
    expect(isAllowlistedEmail('chamodalwis1309@gmail.com')).toBe(true);
    expect(isAllowlistedEmail('ayuaranacare@gmail.com')).toBe(true);
    expect(isAllowlistedEmail('coctharusha0913@gmail.com')).toBe(true);

    // Any other email rejected
    expect(isAllowlistedEmail('attacker@evil.com')).toBe(false);
    expect(isAllowlistedEmail('doctor@otherhospital.com')).toBe(false);
    expect(isAllowlistedEmail('')).toBe(false);
    expect(isAllowlistedEmail(null)).toBe(false);
  });

  test('4. Accepts matching code for allowlisted email when properly configured', () => {
    process.env.TEST_OTP_ENABLED = 'true';
    process.env.TEST_OTP_CODE = '654321';

    expect(isTestOtpEnabled()).toBe(true);
    expect(verifyTestOtp('chamodalwis1309@gmail.com', '654321')).toBe(true);
    expect(shouldInterceptOtpEmail('chamodalwis1309@gmail.com')).toBe(true);
  });

  test('5. Rejects incorrect code even for allowlisted email', () => {
    process.env.TEST_OTP_ENABLED = 'true';
    process.env.TEST_OTP_CODE = '654321';

    expect(verifyTestOtp('chamodalwis1309@gmail.com', '111111')).toBe(false);
    expect(verifyTestOtp('chamodalwis1309@gmail.com', '654320')).toBe(false);
  });

  test('6. Rejects matching code for non-allowlisted email', () => {
    process.env.TEST_OTP_ENABLED = 'true';
    process.env.TEST_OTP_CODE = '654321';

    expect(verifyTestOtp('stranger@gmail.com', '654321')).toBe(false);
    expect(shouldInterceptOtpEmail('stranger@gmail.com')).toBe(false);
  });
});
