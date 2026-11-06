'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = 'test-jwt-secret-s1-removal-testing-key-32b';
const JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-s1-removal-32b';
const NIC_PATTERN = /^([0-9]{9}[vxVX]|[0-9]{12})$/;

const patientId = '654321098765432109876543';
const patientNic = '199012345678';
const doctorId = '654321098765432109876544';
const docCustomId = 'DR-998877';

function createController(name, customMocks = {}) {
  const filePath = path.resolve(__dirname, '../src/controllers', name);
  const code = fs.readFileSync(filePath, 'utf8');
  const exports = {};
  const context = {
    exports,
    module: { exports },
    __dirname: path.dirname(filePath),
    Buffer,
    Date,
    Set,
    Map,
    process: {
      env: {
        NODE_ENV: 'test',
        JWT_SECRET,
        JWT_REFRESH_SECRET,
        TEST_OTP_ENABLED: 'true',
        SKIP_LOGIN_NOTIFICATION: 'true'
      }
    },
    console: { log() {}, warn() {}, error() {} },
    require(id) {
      if (Object.hasOwn(customMocks, id)) return customMocks[id];
      if (id === 'crypto') return crypto;
      if (id === 'jsonwebtoken') return jwt;
      if (id === 'bcryptjs') return bcrypt;
      if (id === 'path') return path;
      if (id === 'uuid') return { v4: () => crypto.randomUUID() };
      if (id === '../security/nicPersistence') return require('../src/security/nicPersistence');
      if (id === '../security/loginRequest') return require('../src/security/loginRequest');
      if (id === '../security/loginIdentifier') return require('../src/security/loginIdentifier');
      if (id === '../security/passwordAttemptPolicy') {
        return require('../src/security/passwordAttemptPolicy').createPasswordAttemptPolicy({
          getAttempts: async () => 0,
          incrementAttempts: async () => 1
        });
      }
      if (id === '../security/accountState') return require('../src/security/accountState');
      if (id === '../security/organizationLoginDto') return require('../src/security/organizationLoginDto');
      if (id === '../services/recipientLanguageService') return { languageOptionsForRecord: () => ({ lang: 'en' }) };
      if (id === '../utils/passwordUtils') return {
        hashPassword: async (p) => bcrypt.hash(p, 10),
        validatePasswordStrength: () => ({ valid: true, score: 4 })
      };
      if (id === '../utils/deviceParser') return { parseDeviceModel: () => 'TestDevice' };
      if (id === '../utils/ipLookup') return { resolveLocation: () => 'Colombo, LK' };
      if (id === '../utils/emailService') return {
        sendWelcomeEmail: jest.fn(async () => ({ providerAccepted: true })),
        sendOTPEmail: jest.fn(async () => ({ providerAccepted: true })),
        sendLoginNotificationEmail: jest.fn(async () => ({ providerAccepted: true }))
      };
      if (id === '../security/testOtpHarness') return {
        verifyTestOtp: () => true
      };
      if (id === '../config/redis') return {
        incrementAttempts: jest.fn(async () => 0),
        getAttempts: jest.fn(async () => 0),
        clearAttempts: jest.fn(async () => {}),
        checkOtpRequestThrottle: jest.fn(async () => ({ allowed: true })),
        recordOtpRequestSent: jest.fn(async () => {})
      };
      return new Proxy({}, {
        get(_target, prop) {
          if (prop === 'then') return undefined;
          return () => { throw new Error(`Unexpected dependency call: ${id}.${String(prop)}`); };
        }
      });
    }
  };
  vm.runInNewContext(code, context, { filename: filePath });
  return exports;
}

const mockResponse = () => {
  const res = {
    statusCode: 200,
    body: null,
    cookies: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    cookie(name, val, opts) {
      this.cookies[name] = { val, opts };
      return this;
    },
    clearCookie(name) {
      delete this.cookies[name];
      return this;
    }
  };
  return res;
};

const queryChain = (doc) => {
  const q = {
    select: jest.fn(() => q),
    populate: jest.fn(() => q),
    sort: jest.fn(() => q),
    lean: jest.fn(async () => doc),
    then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject)
  };
  return q;
};

describe('S1: JWT Patient NIC Removal', () => {
  const assertNoNicClaims = (token, expectedId) => {
    expect(token).toBeDefined();
    const decoded = jwt.decode(token);
    expect(decoded).toBeTruthy();
    expect(decoded.id).toBe(String(expectedId));
    expect(decoded.sub).toBe(String(expectedId));
    expect(decoded.nic).toBeUndefined();

    for (const [key, value] of Object.entries(decoded)) {
      if (typeof value === 'string') {
        expect(value).not.toMatch(NIC_PATTERN);
      }
    }
    return decoded;
  };

  test('patient registration issues token where sub is patient._id and nic is not present in claims', async () => {
    function MockPatient(data) {
      this._id = patientId;
      Object.assign(this, data);
      this.save = jest.fn(async () => {});
    }
    MockPatient.findOne = jest.fn(async () => null);

    const patientCtrl = createController('patientController.js', {
      '../models/Patient': MockPatient,
      '../models/SessionToken': { create: jest.fn(async () => ({})) },
      '../models/AuditLog': { create: jest.fn(async () => ({})) }
    });

    const res = mockResponse();
    await patientCtrl.registerPatient({
      body: {
        nic: patientNic,
        fullName: 'Test Patient S1',
        email: 'patient.s1@example.invalid',
        password: 'ValidPassword123!',
        dateOfBirth: '1990-01-01',
        gender: 'male',
        district: 'Colombo'
      },
      headers: {}
    }, res);

    expect(res.statusCode).toBe(201);
    expect(res.body?.data?.accessToken).toBeDefined();
    assertNoNicClaims(res.body.data.accessToken, patientId);
  });

  test('patient login issues access & refresh tokens where sub is patient._id and nic is not in claims', async () => {
    const mockPatientDoc = {
      _id: patientId,
      nic: patientNic,
      fullName: 'Test Patient S1',
      email: 'patient.s1@example.invalid',
      password: await bcrypt.hash('ValidPassword123!', 10),
      role: 'patient',
      isActive: true,
      twoFactorEnabled: false,
      save: jest.fn(async () => {})
    };

    const authCtrl = createController('authController.js', {
      '../models/Patient': {
        findOne: jest.fn(() => queryChain(mockPatientDoc))
      },
      '../models/SessionToken': {
        findOne: jest.fn(async () => null),
        create: jest.fn(async () => ({}))
      },
      '../models/TrustedDevice': {
        findOne: jest.fn(async () => null),
        create: jest.fn(async () => ({}))
      },
      '../models/AuditLog': { create: jest.fn(async () => ({})) }
    });

    const res = mockResponse();
    await authCtrl.login({
      body: {
        email: 'patient.s1@example.invalid',
        password: 'ValidPassword123!',
        role: 'patient'
      },
      headers: {}
    }, res);

    expect(res.statusCode).toBe(200);
    const { accessToken, refreshToken } = res.body.data;
    assertNoNicClaims(accessToken, patientId);
    assertNoNicClaims(refreshToken, patientId);
  });

  test('patient verifyLoginOTP issues access & refresh tokens where sub is patient._id and nic is not in claims', async () => {
    const mockPatientDoc = {
      _id: patientId,
      nic: patientNic,
      fullName: 'Test Patient S1',
      email: 'patient.s1@example.invalid',
      role: 'patient',
      isActive: true,
      save: jest.fn(async () => {})
    };
    const otpSessionDoc = {
      _id: 'otp-session-12345',
      userId: patientId,
      userModel: 'Patient',
      purpose: 'login',
      otp: await bcrypt.hash('123456', 10),
      expiresAt: new Date(Date.now() + 60000),
      used: false,
      failedAttempts: 0
    };

    const authCtrl = createController('authController.js', {
      '../models/Patient': {
        findById: jest.fn(() => queryChain(mockPatientDoc))
      },
      '../models/OTPSession': {
        findOne: jest.fn(() => queryChain(otpSessionDoc)),
        findOneAndUpdate: jest.fn(async () => otpSessionDoc),
        collection: { updateOne: jest.fn(async () => ({})) }
      },
      '../models/SessionToken': {
        findOne: jest.fn(async () => null),
        create: jest.fn(async () => ({}))
      },
      '../models/TrustedDevice': {
        findOne: jest.fn(async () => null),
        create: jest.fn(async () => ({}))
      },
      '../models/AuditLog': { create: jest.fn(async () => ({})) }
    });

    const res = mockResponse();
    await authCtrl.verifyLoginOTP({
      body: {
        userId: patientId,
        userModel: 'Patient',
        otp: '123456'
      },
      headers: {}
    }, res);

    expect(res.statusCode).toBe(200);
    const { accessToken, refreshToken } = res.body.data;
    assertNoNicClaims(accessToken, patientId);
    assertNoNicClaims(refreshToken, patientId);
  });

  test('refreshToken preserves safe sub and drops any legacy nic claim', async () => {
    const incomingRefreshToken = jwt.sign(
      { id: patientId, role: 'patient', sub: String(patientId), nic: patientNic },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );
    const sessionDoc = {
      _id: 'sess-12345',
      userId: patientId,
      userModel: 'Patient',
      isValid: true,
      logoutAt: null,
      expiredAt: new Date(Date.now() + 600000)
    };
    const mockPatientAccount = {
      _id: patientId,
      role: 'patient',
      isActive: true
    };
    const accountState = require('../src/security/accountState');

    const authCtrl = createController('authController.js', {
      '../models/SessionToken': {
        findOne: jest.fn(async () => sessionDoc),
        findOneAndUpdate: jest.fn(async () => sessionDoc),
        create: jest.fn(async () => ({}))
      },
      '../security/accountState': {
        ...accountState,
        readAccount: jest.fn(async () => mockPatientAccount)
      },
      '../models/BanRecord': { findOne: jest.fn(async () => null) },
      '../models/AuditLog': { create: jest.fn(async () => ({})) }
    });

    const res = mockResponse();
    await authCtrl.refreshToken({
      body: { refreshToken: incomingRefreshToken },
      cookies: {},
      headers: {}
    }, res);

    expect(res.statusCode).toBe(200);
    const { accessToken, refreshToken } = res.body.data;
    assertNoNicClaims(accessToken, patientId);
    assertNoNicClaims(refreshToken, patientId);
  });

  test('doctor login preserves doctorId in sub claim', async () => {
    const mockDoctorDoc = {
      _id: doctorId,
      doctorId: docCustomId,
      fullName: 'Dr. Test S1',
      email: 'doctor.s1@example.invalid',
      password: await bcrypt.hash('ValidPassword123!', 10),
      role: 'doctor',
      isActive: true,
      isVerified: true,
      twoFactorEnabled: false,
      save: jest.fn(async () => {})
    };

    const authCtrl = createController('authController.js', {
      '../models/Doctor': {
        findOne: jest.fn(() => queryChain(mockDoctorDoc))
      },
      '../models/SessionToken': {
        findOne: jest.fn(async () => null),
        create: jest.fn(async () => ({}))
      },
      '../models/TrustedDevice': {
        findOne: jest.fn(async () => null),
        create: jest.fn(async () => ({}))
      },
      '../models/AuditLog': { create: jest.fn(async () => ({})) }
    });

    const res = mockResponse();
    await authCtrl.login({
      body: {
        email: 'doctor.s1@example.invalid',
        password: 'ValidPassword123!',
        role: 'doctor'
      },
      headers: {}
    }, res);

    expect(res.statusCode).toBe(200);
    const { accessToken } = res.body.data;
    const decoded = jwt.decode(accessToken);
    expect(decoded.id).toBe(String(doctorId));
    expect(decoded.sub).toBe(docCustomId);
  });

  test('patient profile access succeeds when req.user has sub equal to patient ID and no nic claim', async () => {
    const mockPatientRecord = {
      _id: patientId,
      nic: patientNic,
      fullName: 'Test Patient S1',
      dateOfBirth: new Date('1990-01-01'),
      gender: 'male',
      district: 'Colombo',
      decryptFieldsSync: jest.fn(),
      toObject: () => ({ ...mockPatientRecord })
    };

    const patientCtrl = createController('patientController.js', {
      '../models/Patient': {
        findById: jest.fn((id) => queryChain(String(id) === patientId ? { nic: patientNic } : null)),
        findOne: jest.fn(() => queryChain(mockPatientRecord))
      },
      '../models/AuditLog': { create: jest.fn(async () => ({})) },
      '../utils/patientProfilePolicy': require('../src/utils/patientProfilePolicy')
    });

    const res = mockResponse();
    await patientCtrl.getPatient({
      params: { nic: patientNic },
      user: {
        id: patientId,
        role: 'patient',
        sub: String(patientId)
        // Note: no nic property on user!
      },
      headers: {}
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.data?.fullName).toBe('Test Patient S1');
  });
});
