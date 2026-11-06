'use strict';

// Real application modules, router, JWT and bcrypt; only persistence/provider
// boundaries are inert. No listener, database driver or provider is started.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const source = path.resolve(__dirname, '../../src');
const secret = 'synthetic-hotfix-access-key-not-live-0001';
const refreshSecret = 'synthetic-hotfix-refresh-key-not-live-0002';
const ownerId = '111111111111111111111111';
const otherId = '222222222222222222222222';
const ownerNic = '999999999991';
const otherNic = '999999999992';
const consultationId = '333333333333333333333333';
const password = 'Synthetic-not-for-real-login!';
const passwordHash = bcrypt.hashSync(password, 4);
const otpHash = bcrypt.hashSync('123456', 4);

function chain(value, select) {
  const q = { select(fields) { if (select) value = select(fields, value); return q; }, populate() { return q; }, sort() { return q; },
    lean() { return Promise.resolve(value); }, then(ok, fail) { return Promise.resolve(value).then(ok, fail); } };
  return q;
}
function response(done = () => {}) {
  return { statusCode: 200, body: null, headers: {}, cookies: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; done(this); return this; },
    cookie(name, value) { this.cookies[name] = value; return this; },
    clearCookie(name) { delete this.cookies[name]; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    getHeader(name) { return this.headers[name.toLowerCase()]; } };
}
function matches(row, query) {
  return Object.entries(query).every(([key, value]) => {
    if (key === '$or') return value.some(clause => matches(row, clause));
    if (value instanceof RegExp || Object.prototype.toString.call(value) === '[object RegExp]') return value.test(row[key]);
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      return Object.entries(value).every(([op, target]) => op === '$gt' ? row[key] > target : op === '$gte' ? row[key] >= target : op === '$lt' ? row[key] < target : false);
    }
    return value === null ? row[key] == null : String(row[key]) === String(value);
  });
}

function harness() {
  const state = { banned: false, sessions: [], providers: 0, repositoryWrites: 0, reads: [],
    profileReads: [], accountMissing: false, lookupError: false, identityFault: null };
  function document(id, nic) {
    return { _id: id, nic, email: id === ownerId ? 'owner@example.invalid' : 'other@example.invalid',
      fullName: 'Synthetic fixture', password: passwordHash, role: 'patient', isActive: true,
      twoFactorEnabled: false, reportedDoctors: [], async save() { state.repositoryWrites++; },
      decryptFieldsSync() {}, toObject() { return { _id: this._id, nic: this.nic, fullName: this.fullName, bloodGroup: this.bloodGroup }; } };
  }
  const owner = document(ownerId, ownerNic), other = document(otherId, otherNic);
  const emptyModel = () => ({ find() { return chain([]); }, findOne() { return chain(null); }, findById() { return chain(null); } });
  const models = Object.fromEntries(['Doctor', 'Hospital', 'PharmacyStaff', 'Pharmacy', 'Admin', 'Prescription', 'Consultation', 'LabTest', 'TestOrder', 'Review', 'RecoveryToken'].map(name => [name, emptyModel()]));
  models.Patient = {
    findById(id) {
      state.reads.push(String(id)); if (state.lookupError) throw Error('SYNTHETIC_LOOKUP_FAILURE');
      return chain(state.accountMissing ? null : String(id) === ownerId ? owner : String(id) === otherId ? other : null, (fields, row) => {
        if (fields !== '_id nic') return row;
        if (state.identityFault === 'missing') return null;
        if (state.identityFault === 'foreign') return { _id: otherId, nic: ownerNic };
        if (state.identityFault === 'invalid') return { _id: ownerId, nic: 'INVALID_SYNTHETIC' };
        if (state.identityFault === 'error') throw Error('SYNTHETIC_LOOKUP_FAILURE');
        return row;
      });
    },
    findOne(query) { state.profileReads.push(query); return chain([owner, other].find(row => matches(row, query)) || null); }
  };
  models.SessionToken = {
    findOne(query) { return Promise.resolve(state.sessions.find(row => matches(row, query)) || null); },
    async create(value) { const row = { _id: crypto.randomBytes(12).toString('hex'), logoutAt: null, expiredAt: null, deviceFingerprint: null, ...value, async save() { state.repositoryWrites++; } }; state.sessions.push(row); return row; },
    async findOneAndUpdate(query, update) { const row = state.sessions.find(item => matches(item, query)); if (!row) return null; const previous = { ...row }; state.sessions[state.sessions.indexOf(row)] = { ...row, ...update.$set }; return previous; }
  };
  models.TrustedDevice = { findOne() { return chain(null); } };
  models.AuditLog = { async create() { state.repositoryWrites++; return {}; } };
  models.BanRecord = { async findOne(query) { return state.banned ? { targetId: query.targetId, isActive: true, banType: 'permanent', reason: 'Synthetic fixture', expiresAt: null } : null; } };
  let otp = { _id: '444444444444444444444444', userId: ownerId, userModel: 'Patient', purpose: 'login', otp: otpHash, expiresAt: new Date(Date.now() + 60000), used: false, failedAttempts: 0 };
  models.OTPSession = { findOne() { return chain(otp); }, async findOneAndUpdate(query, update) { if (!matches(otp, query)) return null; Object.assign(otp, update.$set); return otp; }, collection: { async updateOne() { throw Error('UNEXPECTED_OTP_WRITE'); } } };
  models.Consultation.findById = () => chain({ _id: consultationId, patientNic: ownerNic, patientId: ownerId, doctorId: otherId });
  function Rating(value) { Object.assign(this, value); this.save = async () => { state.repositoryWrites++; }; }
  Rating.find = () => chain([]); Rating.findOne = () => chain(null);
  models.ConsultationRating = Rating;
  const cache = new Map();
  const env = { NODE_ENV: 'test', JWT_SECRET: secret, JWT_REFRESH_SECRET: refreshSecret, SKIP_LOGIN_NOTIFICATION: 'true' };
  const redis = { async getAttempts() { return 0; }, async incrementAttempts() { return 1; }, async clearAttempts() {}, async checkOtpRequestThrottle() { return { allowed: true }; }, async recordOtpRequestSent() {} };
  const fail = () => { throw Error('UNEXPECTED_OFFLINE_PROVIDER'); };
  function load(relative) {
    const filename = path.resolve(source, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    function requireSource(id) {
      // The alias read route uses the REAL patientController.getPrescriptions.
      // Unexercised sibling write/PDF handlers are tripwires, not fake successes.
      if (id === '../controllers/prescriptionController') return { issuePrescription: fail, getPendingByNic: fail, dispense: fail, downloadPrescriptionPdf: fail };
      if (id.startsWith('../models/')) {
        const model = models[id.slice('../models/'.length)]; if (!model) throw Error('UNEXPECTED_OFFLINE_MODEL'); return model;
      }
      if (id === '../config/redis') return redis;
      if (id === '../utils/emailService') return new Proxy({}, { get() { return () => { state.providers++; return fail(); }; } });
      if (id === '../security/passwordAttemptPolicy') return require('../../src/security/passwordAttemptPolicy').createPasswordAttemptPolicy({ getAttempts: redis.getAttempts, incrementAttempts: redis.incrementAttempts });
      if (id === '../utils/deviceParser') return { parseDeviceModel: () => 'Synthetic device' };
      if (id === '../utils/ipLookup') return { resolveLocation: fail };
      if (id === '../services/recipientLanguageService') return { languageOptionsForRecord: () => ({ lang: 'en' }) };
      if (id === 'uuid') return { v4: () => crypto.randomUUID() };
      if (id === 'speakeasy' || id === 'axios') return new Proxy({}, { get() { return fail; } });
      if (id === '../utils/passwordUtils') return { hashPassword: fail, validatePasswordStrength: fail };
      if (id.startsWith('.')) {
        let target = path.resolve(path.dirname(filename), id); if (!path.extname(target)) target += '.js';
        if (target.includes(path.sep + 'controllers' + path.sep) || target.includes(path.sep + 'middleware' + path.sep) || target.endsWith(path.sep + 'accountState.js')) return load(path.relative(source, target));
        return require(target);
      }
      return require(id);
    }
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, require: requireSource,
      __dirname: path.dirname(filename), __filename: filename, Buffer, Date, Set, Map, Object, URL,
      process: { env }, console: { log() {}, warn() {}, error() {}, debug() {} }, setTimeout, clearTimeout }, { filename });
    return module.exports;
  }
  const controller = load('controllers/authController.js');
  const routers = { patient: load('routes/patientRoutes.js'), prescription: load('routes/prescriptionRoutes.js'), test: load('routes/testRoutes.js') };
  const request = (body = {}) => ({ body, headers: {}, ip: '192.0.2.1', cookies: {}, app: { get() { return null; } } });
  async function issue(kind = 'login') {
    const res = response();
    if (kind === 'login') await controller.login(request({ email: owner.email, password, role: 'patient' }), res);
    else if (kind === 'otp') { otp.used = false; await controller.verifyLoginOTP(request({ userId: ownerId, otp: '123456' }), res); }
    else if (kind === 'refresh') { const initial = await issue('login'); await controller.refreshToken(request({ refreshToken: initial.refreshToken }), res); }
    else throw Error('INVALID_SYNTHETIC_ISSUER');
    if (res.statusCode !== 200 || !res.body?.data?.accessToken) throw Error('SYNTHETIC_TOKEN_ISSUANCE_FAILED_' + res.statusCode);
    return res.body.data;
  }
  function dispatch(method, url, token, body = {}, scope = 'patient') {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('SYNTHETIC_ROUTER_NO_RESPONSE')), 1500);
      const req = { ...request(body), method, url, originalUrl: url, baseUrl: '', params: {}, query: {},
        headers: token ? { authorization: 'Bearer ' + token } : {} };
      const res = response(value => { clearTimeout(timer); resolve({ status: value.statusCode, body: value.body }); });
      routers[scope].handle(req, res, error => { clearTimeout(timer); error ? reject(error) : resolve({ status: 404, body: null }); });
    });
  }
  async function wrongRole() {
    const token = jwt.sign({ id: ownerId, sub: ownerId, role: 'assistant' }, secret, { expiresIn: '15m' });
    await models.SessionToken.create({ userId: ownerId, userModel: 'PharmacyStaff', tokenHash: crypto.createHash('sha256').update(token).digest('hex'), isValid: true });
    return token;
  }
  const expired = () => jwt.sign({ id: ownerId, sub: ownerId, role: 'patient' }, secret, { expiresIn: -1 });
  return { state, owner, other, ownerId, otherId, ownerNic, otherNic, consultationId, issue, dispatch, wrongRole, expired, decode: token => jwt.verify(token, secret) };
}
module.exports = { harness };
