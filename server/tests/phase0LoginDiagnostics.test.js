'use strict';

// Execute the current controller with actual crypto libraries and inert repositories.
// No app/config/model/provider import, dotenv, DB connection, or process.env access.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fieldEncryption = require('mongoose-field-encryption');
const policyModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/security/accountState.js'), 'utf8'), {
  module: policyModule, process: { env: { NODE_ENV: 'production' } },
});
const { assertLoginAccount } = policyModule.exports;

const id = '111111111111111111111111';
const password = 'Inert-test-password-482!';
const accessKey = 'inert-access-key-only-used-in-this-vm';
const refreshKey = 'inert-refresh-key-only-used-in-this-vm';
const canary = 'PRIVATE_DIAGNOSTIC_CANARY';
const roles = [
  ['doctor', 'Doctor'], ['patient', 'Patient'], ['pharmacist', 'PharmacyStaff'],
  ['hospital_admin', 'Hospital'], ['admin', 'Admin'],
];
const passwordHash = bcrypt.hashSync(password, 4);
const source = fs.readFileSync(path.resolve(__dirname, '../src/controllers/authController.js'), 'utf8');

function harness({ role = 'patient', model = 'Patient', missingKey, failure } = {}) {
  const calls = { sessionWrites: 0, userSaves: 0, audits: 0, diagnostics: [], logs: [] };
  let legacySaveHook;
  if (failure === 'legacy-encryption') {
    const pluginModule = { exports: {} };
    // Each probe gets an isolated keyring; no host globals are changed or read.
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/utils/versionedEncryption.js'), 'utf8'), {
      module: pluginModule,
      require(name) {
        if (name === 'crypto') return crypto;
        if (name === 'mongoose-field-encryption') return fieldEncryption;
        throw new Error('Unexpected encryption dependency');
      },
      global: { ENCRYPTION_KEYS: {}, ACTIVE_KEY_VERSION: 1 },
      process: { env: { NODE_ENV: 'production' } },
      console: { error: (...args) => calls.logs.push(args) },
    });
    pluginModule.exports({
      add() {}, methods: {}, post() {},
      pre(name, hook) { if (name === 'save') legacySaveHook = hook; },
    }, { fields: ['fullName', 'contactInfo', 'allergies'] });
  }
  const account = {
    _id: id, role, isActive: true, isVerified: true, twoFactorEnabled: false,
    password: passwordHash, fullName: 'Inert Account', name: 'Inert Facility',
    email: 'inert@example.invalid',
    async save() {
      calls.userSaves++;
      if (failure === 'account') throw new Error(canary);
      if (failure === 'legacy-encryption') legacySaveHook.call(this);
      return this;
    },
  };
  const query = value => ({
    populate() { return this; },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  });
  const models = Object.fromEntries(['Doctor', 'Patient', 'PharmacyStaff', 'Hospital', 'Admin']
    .map(name => [name, { findOne: () => query(name === model ? account : null) }]));
  const reportFailure = (...args) => calls.diagnostics.push(args);
  const unexpected = () => { throw new Error('Unexpected provider or alternate authentication path'); };
  const dependencies = {
    crypto, jsonwebtoken: jwt, bcryptjs: bcrypt,
    uuid: { v4: () => crypto.randomUUID() },
    '../security/nicPersistence': { nicFilter: () => { throw new Error('Unexpected NIC path'); } },
    '../security/loginIdentifier': {
      normalizeLoginIdentifier: value => value.trim().toLowerCase(),
      literalIdentifierPattern: value => new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    },
    '../security/accountState': {
      assertLoginAccount: (user, name) => assertLoginAccount(user, name),
    },
    '../security/organizationLoginDto': { organizationLoginDto: () => [] },
    '../security/safeFailureDiagnostic': { reportFailure },
    '../utils/passwordUtils': { validatePasswordStrength: unexpected, hashPassword: unexpected },
    '../config/redis': {
      incrementAttempts: unexpected, getAttempts: unexpected, clearAttempts: unexpected,
      checkOtpRequestThrottle: unexpected, recordOtpRequestSent: unexpected,
    },
    '../utils/ipLookup': { resolveLocation: unexpected },
    '../utils/deviceParser': { parseDeviceModel: () => 'Inert Device' },
    '../models/SessionToken': {
      async create() {
        calls.sessionWrites++;
        if (failure === 'session') throw new Error(canary);
        return {};
      },
    },
    '../models/AuditLog': {
      async create() {
        calls.audits++;
        if (failure === 'audit') throw new Error(canary);
        return {};
      },
    },
  };
  for (const [name, value] of Object.entries(models)) dependencies[`../models/${name}`] = value;
  const environment = { NODE_ENV: 'production', JWT_SECRET: accessKey, JWT_REFRESH_SECRET: refreshKey, SKIP_LOGIN_NOTIFICATION: 'true' };
  if (missingKey) delete environment[missingKey];
  const exports = {};
  vm.runInNewContext(source, {
    exports, require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      // Unused top-level imports are inert. Accessing one fails immediately.
      return new Proxy({}, { get() { throw new Error(`Unexpected dependency use: ${name}`); } });
    },
    process: { env: environment }, Buffer,
    console: Object.fromEntries(['log', 'warn', 'error'].map(level => [level, (...args) => calls.logs.push(args)])),
  }, { filename: 'phase0-actual-authController.js' });
  async function invoke() {
    let status = 200, body;
    const cookies = [];
    const res = {
      status(value) { status = value; return this; },
      json(value) { body = value; return this; },
      cookie(...args) { cookies.push(args); return this; },
    };
    await exports.login({ body: { role, email: account.email, password }, headers: {}, ip: '192.0.2.1' }, res);
    return { status, body, cookies };
  }
  return { invoke, calls, account, environment };
}

function expectFailure(result, h, step) {
  expect(result.status).toBe(500);
  expect(result.body).toEqual({ error: 'Login failed' });
  expect(result.cookies).toHaveLength(0);
  expect(h.calls.diagnostics).toHaveLength(1);
  expect(h.calls.diagnostics[0]).toContain(step);
  expect(JSON.stringify([result.body, h.calls.logs])).not.toContain(canary);
  expect(h.environment.JWT_SECRET).toBe(accessKey);
}

test.each(roles)('inert production %s login signs both tokens and persists the session', async (role, model) => {
  const h = harness({ role, model });
  const result = await h.invoke();
  expect(result.status).toBe(200);
  expect(result.body.data.role).toBe(role);
  expect(jwt.verify(result.body.data.accessToken, accessKey)).toMatchObject({ id, role });
  expect(jwt.verify(result.body.data.refreshToken, refreshKey)).toMatchObject({ id, role });
  expect(h.calls.sessionWrites).toBe(1);
  expect(h.calls.userSaves).toBe(1);
  expect(h.calls.diagnostics).toEqual([]);
  expect(h.account.password).toBe(passwordHash);
  expect(h.environment.JWT_REFRESH_SECRET).toBe(refreshKey);
});

test.each([
  ['JWT_SECRET', 'token_access'], ['JWT_REFRESH_SECRET', 'token_refresh'],
])('absent %s fails before session persistence with a safe stage', async (missingKey, step) => {
  const h = harness({ missingKey });
  const result = await h.invoke();
  expect(result.status).toBe(500);
  expect(result.body).toEqual({ error: 'Login failed' });
  expect(h.calls.sessionWrites).toBe(0);
  expect(h.calls.userSaves).toBe(0);
  expect(h.calls.diagnostics).toHaveLength(1);
  expect(h.calls.diagnostics[0]).toContain(step);
  expect(h.calls.diagnostics[0][0].message).toBe('secretOrPrivateKey must have a value');
  expect(Object.hasOwn(h.environment, missingKey)).toBe(false);
  expect(JSON.stringify(result.body)).not.toMatch(/secretOrPrivateKey|inert-access|inert-refresh/);
});

test('session persistence failure is identified before the account save', async () => {
  const h = harness({ failure: 'session' });
  expectFailure(await h.invoke(), h, 'session_persistence');
  expect(h.calls.sessionWrites).toBe(1);
  expect(h.calls.userSaves).toBe(0);
});

test('account save failure is identified after session persistence', async () => {
  const h = harness({ failure: 'account' });
  expectFailure(await h.invoke(), h, 'account_last_login');
  expect(h.calls.sessionWrites).toBe(1);
  expect(h.calls.userSaves).toBe(1);
});

test('audit insertion outage does not turn an otherwise valid login into a 500', async () => {
  const h = harness({ failure: 'audit' });
  const result = await h.invoke();
  expect(result.status).toBe(200);
  expect(h.calls.audits).toBe(1);
  expect(h.calls.userSaves).toBe(1);
  expect(h.calls.diagnostics).toEqual([]);
  expect(JSON.stringify([result.body, h.calls.logs])).not.toContain(canary);
});

test('actual legacy Patient encryption save hook reports a missing key after session creation', async () => {
  const h = harness({ failure: 'legacy-encryption' });
  const result = await h.invoke();
  expectFailure(result, h, 'account_last_login');
  expect(h.calls.sessionWrites).toBe(1);
  expect(h.calls.userSaves).toBe(1);
  expect(h.calls.diagnostics[0][0].message).toBe('Missing encryption key for version 1');
  expect(Object.keys(result.body)).toEqual(['error']);
  expect(JSON.stringify([result.body, h.calls.logs])).not.toMatch(/Inert Account|contactInfo|allergies|Missing encryption key/);
});
