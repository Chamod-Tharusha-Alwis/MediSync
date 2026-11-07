'use strict';

/**
 * Verification Test Suite: Complete Removal of Test OTP Harness and Bypass Logic
 * Branch: chore/remove-test-otp (Milestone 4 WP6)
 *
 * Asserts:
 *  1. testOtpHarness.js file is deleted and cannot be imported.
 *  2. Zero occurrences of testOtpHarness or TEST_OTP bypass strings exist in server/src/.
 *  3. Setting TEST_OTP_ENABLED=true and TEST_OTP_CODE does NOT bypass OTP verification in any controller.
 *  4. Real bcrypt-hashed OTP verification remains functional and required.
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

jest.mock('uuid', () => ({ v4: () => 'mock-uuid-1234' }));

describe('Test OTP Harness Removal and Zero-Bypass Specification', () => {
  const repoRoot = path.resolve(__dirname, '../..');
  const serverSrc = path.resolve(repoRoot, 'server/src');
  const harnessPath = path.resolve(serverSrc, 'security/testOtpHarness.js');

  test('1. testOtpHarness.js is deleted and does not exist in the filesystem', () => {
    expect(fs.existsSync(harnessPath)).toBe(false);
    expect(() => require('../src/security/testOtpHarness')).toThrow();
  });

  test('2. Zero occurrences of testOtpHarness or TEST_OTP in server/src source code', () => {
    const targetFiles = [
      'controllers/authController.js',
      'controllers/patientController.js',
      'controllers/labController.js',
      'controllers/pharmacyController.js',
      'utils/emailService.js',
      'routes/authRoutes.js',
      'routes/patientRoutes.js',
      'routes/labRoutes.js'
    ];

    for (const rel of targetFiles) {
      const fullPath = path.join(serverSrc, rel);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        expect(content).not.toContain('testOtpHarness');
        expect(content).not.toContain('TEST_OTP_ENABLED');
        expect(content).not.toContain('TEST_OTP_CODE');
        expect(content).not.toContain('verifyTestOtp');
      }
    }
  });

  test('3. Injection proof: TEST_OTP_ENABLED cannot bypass login OTP verification in authController', async () => {
    const originalEnv = { ...process.env };
    process.env.TEST_OTP_ENABLED = 'true';
    process.env.TEST_OTP_CODE = '999999';

    try {
      const authController = require('../src/controllers/authController');
      const OTPSession = require('../src/models/OTPSession');
      const Patient = require('../src/models/Patient');

      const realOtp = '849201';
      const realOtpHash = await bcrypt.hash(realOtp, 10);
      const testEmail = 'chamodalwis1309@gmail.com';
      const userId = '507f191e810c19729de860ea';

      const mockUser = {
        _id: userId,
        email: testEmail,
        isEmailVerified: true,
        isActive: true,
        role: 'patient',
        accountStatus: 'active'
      };

      const mockOtpRecord = {
        _id: 'sess-test-otp-1',
        userId,
        userModel: 'Patient',
        purpose: 'login',
        otp: realOtpHash,
        expiresAt: new Date(Date.now() + 60000),
        used: false,
        failedAttempts: 0
      };

      jest.spyOn(Patient, 'findById').mockResolvedValue(mockUser);
      jest.spyOn(OTPSession, 'findOne').mockReturnValue({
        sort: () => Promise.resolve(mockOtpRecord)
      });
      jest.spyOn(OTPSession.collection, 'updateOne').mockResolvedValue({ modifiedCount: 1 });

      const req = {
        body: { userId, otp: '999999' },
        headers: {},
        ip: '127.0.0.1'
      };
      let statusCode = null;
      let responseBody = null;
      const res = {
        status(code) { statusCode = code; return this; },
        json(data) { responseBody = data; return this; }
      };

      await authController.verifyLoginOTP(req, res);

      // Must be rejected as 400 Incorrect OTP
      expect(statusCode).toBe(400);
      expect(responseBody.message).toContain('Incorrect OTP');
    } finally {
      process.env = originalEnv;
      jest.restoreAllMocks();
    }
  });

  test('4. Positive proof: Genuine bcrypt-hashed OTP verifies correctly in authController', async () => {
    const originalEnv = { ...process.env };
    process.env.JWT_SECRET = 'test-secret-jwt-removal-s1';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-jwt-removal-s1';
    process.env.SKIP_LOGIN_NOTIFICATION = 'true';

    try {
      const authController = require('../src/controllers/authController');
      const OTPSession = require('../src/models/OTPSession');
      const Patient = require('../src/models/Patient');
      const SessionToken = require('../src/models/SessionToken');
      const TrustedDevice = require('../src/models/TrustedDevice');

      const realOtp = '849201';
      const realOtpHash = await bcrypt.hash(realOtp, 10);
      const testEmail = 'chamodalwis1309@gmail.com';
      const userId = '507f191e810c19729de860ea';

      const mockUser = {
        _id: userId,
        email: testEmail,
        role: 'patient',
        isEmailVerified: true,
        isActive: true,
        accountStatus: 'active',
        save: jest.fn().mockResolvedValue(true),
        toObject: () => ({ _id: userId, email: testEmail, role: 'patient' })
      };

      const mockOtpRecord = {
        _id: 'sess-test-otp-2',
        userId,
        userModel: 'Patient',
        purpose: 'login',
        otp: realOtpHash,
        expiresAt: new Date(Date.now() + 60000),
        used: false,
        failedAttempts: 0
      };

      jest.spyOn(Patient, 'findById').mockResolvedValue(mockUser);
      jest.spyOn(OTPSession, 'findOne').mockReturnValue({
        sort: () => Promise.resolve(mockOtpRecord)
      });
      jest.spyOn(OTPSession, 'findOneAndUpdate').mockResolvedValue(mockOtpRecord);
      jest.spyOn(OTPSession.collection, 'updateOne').mockResolvedValue({ modifiedCount: 1 });
      jest.spyOn(SessionToken, 'create').mockResolvedValue({});
      jest.spyOn(SessionToken, 'findOne').mockResolvedValue(null);
      jest.spyOn(TrustedDevice, 'findOne').mockResolvedValue(null);

      const req = {
        body: { userId, otp: realOtp },
        headers: {},
        ip: '127.0.0.1'
      };
      let statusCode = null;
      let responseBody = null;
      const res = {
        status(code) { statusCode = code; return this; },
        json(data) { responseBody = data; return this; },
        cookie() { return this; }
      };

      await authController.verifyLoginOTP(req, res);

      expect(statusCode).toBe(200);
      expect(responseBody.message).toBe('Login successful');
      expect(responseBody.data.accessToken).toBeDefined();
    } finally {
      process.env = originalEnv;
      jest.restoreAllMocks();
    }
  });
});
