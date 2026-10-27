'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const mongoose = require('mongoose'), bcrypt = require('bcryptjs');
function controller(name, mocks, environment = {}) {
  const filename = path.resolve(__dirname, '../src/controllers', name), exports = {};
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { exports, module: { exports }, __dirname: path.dirname(filename), Buffer, Date, Set, Map,
    process: { env: { NODE_ENV: 'test', ...environment } }, global: { ENCRYPTION_KEYS: { 1: 'synthetic-only-lab-master-key-32bytes' }, ACTIVE_KEY_VERSION: 1 }, console: { log() {}, warn() {}, error() {} },
    require(id) {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id === 'crypto') return crypto;
      if (id === 'path') return path;
      if (id === 'mongoose') return mongoose;
      if (id === 'bcryptjs') return bcrypt;
      if (id === '../security/nicPersistence') return require('../src/security/nicPersistence');
      if (id === '../security/securityRuntime') return require('../src/security/securityRuntime');
      if (id === '../security/loginIdentifier') return require('../src/security/loginIdentifier');
      if (id === '../services/clinicalRecordDto') return require('../src/services/clinicalRecordDto');
      if (id === '../services/recipientLanguageService') return require('../src/services/recipientLanguageService');
      if (id === '../security/accountState') return require('../src/security/accountState');
      if (id === 'fs') return { existsSync: () => true };
      if (id === 'cloudinary') return { v2: { config() {} } };
      // Unused dependencies are inert and cannot accidentally access provider/DB modules.
      return new Proxy({}, { get(_target, key) { if (key === 'then') return undefined; return () => { throw new Error('UNEXPECTED_DEPENDENCY_CALL'); }; } });
    }
  }, { filename });
  return exports;
}
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), send: jest.fn(), set: jest.fn(), clearCookie: jest.fn(), cookie: jest.fn() });
const id = '000000000000000000000001';

test('legacy patient test lookup cannot fall back to a token NIC after the patient record disappears', async () => {
  const find = jest.fn(), c = controller('testController.js', { '../models/Patient': { findById: async () => null }, '../models/LabTest': { find } }), res = response();
  await c.getPatientTests({ user: { id, role: 'patient', nic: '900000001V' }, params: { nic: '900000001V' } }, res);
  expect(res.status).toHaveBeenCalledWith(403); expect(find).not.toHaveBeenCalled();
});

test.each(['doctor', 'patient', 'pharmacist', 'hospital_admin', 'admin'])('actual %s login treats regex metacharacters as literal identity', async role => {
  const findOne = jest.fn(() => ({ populate: async () => null, then: resolve => Promise.resolve(null).then(resolve) }));
  const models = Object.fromEntries(['Doctor', 'Patient', 'PharmacyStaff', 'Hospital', 'Admin'].map(name => ['../models/' + name, { findOne }]));
  const c = controller('authController.js', models), res = response();
  await c.login({ body: { identifier: '.*+qa@example.invalid', password: 'synthetic', role } }, res);
  const query = findOne.mock.calls[0][0], pattern = query.email || query.$or[0].email;
  expect(pattern.test('.*+qa@example.invalid')).toBe(true); expect(pattern.test('someone@example.invalid')).toBe(false);
  expect(res.status).toHaveBeenCalledWith(401);
});

test.each([{}, '', 'x'.repeat(255), 'qa\u0000@example.invalid'])('actual login rejects malformed/oversized identity before account lookup (%p)', async identifier => {
  const findOne = jest.fn(), c = controller('authController.js', { '../models/Doctor': { findOne } }), res = response();
  await c.login({ body: { identifier, password: 'synthetic', role: 'doctor' } }, res);
  expect(res.status).toHaveBeenCalledWith(400); expect(findOne).not.toHaveBeenCalled();
});

test.each(['provider-outage', 'metadata-outage'])('actual hospital registration reports its commit despite %s', async mode => {
  const nic = '900000001V', expiresAt = Date.now() + 60000;
  class Lab { constructor(values) { Object.assign(this, values); this.labTestId = 'synthetic-lab'; } }
  const saveLabChange = jest.fn(async () => ({ commandId: id })), sendEmail = jest.fn(async () => { throw new Error('synthetic provider outage'); });
  const c = controller('labController.js', {
    '../models/LabTest': Lab, '../models/Patient': { findOne: async () => ({ _id: id, nic, fullName: 'Synthetic', email: 'qa@example.invalid' }) },
    '../config/redis': { getAttempts: async () => 0, getOtp: async () => ({ purpose: 'hospital-lab-consent', hospitalId: id, patientNic: nic, otp: '123456', expiresAt }), consumeOtp: async () => true },
    '../services/labCommitService': { saveLabChange }, '../utils/emailService': { sendEmail },
    '../models/Doctor': { findOne: async () => { throw new Error('synthetic metadata outage'); } }
  }), res = response();
  await c.acceptLabTest({ user: { id, role: 'hospital_admin' }, session: { _id: id }, body: { nic, testName: 'Synthetic', otp: '123456', ...(mode === 'metadata-outage' ? { referredBy: id } : {}) } }, res);
  expect(saveLabChange).toHaveBeenCalledWith(expect.objectContaining({ action: 'LAB_TEST_ORDERED', consentExpiresAt: expiresAt, sessionId: id }));
  expect(sendEmail).toHaveBeenCalledTimes(mode === 'metadata-outage' ? 0 : 1); expect(res.status).toHaveBeenCalledWith(201);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ labTestId: 'synthetic-lab', notifications: { requested: false, deliveryConfirmed: false } }));
});

test('actual legacy pending-lab shortcut denies before any clinical lookup', async () => {
  const find = jest.fn(), c = controller('labController.js', { '../models/LabTest': { find } }), res = response();
  await c.getPendingTests({ user: { id, role: 'hospital_admin' }, body: { patientNic: '900000001V' } }, res);
  expect(res.status).toHaveBeenCalledWith(403); expect(find).not.toHaveBeenCalled();
});

test('actual hospital worklist scopes ownership and excludes encrypted sidecars and report keys', async () => {
  const find = jest.fn();
  const chain = { sort: () => chain, select: () => chain, populate: () => chain, then: (resolve, reject) => Promise.resolve([{ labTestId: 'synthetic-lab', testName: 'Synthetic', patientName: 'Synthetic', encryptedFileKey: 'private', reportPath: 'private', __enc_patientEmail_d: 'private' }]).then(resolve, reject) };
  find.mockReturnValue(chain);
  const c = controller('labController.js', { '../models/LabTest': { find } }), res = response();
  await c.getHospitalLabTests({ user: { id, role: 'hospital_admin' }, query: {} }, res);
  expect(find).toHaveBeenCalledWith({ hospitalId: id });
  expect(res.json).toHaveBeenCalledWith([{ labTestId: 'synthetic-lab', testName: 'Synthetic', patientName: 'Synthetic' }]);
});

test.each(['owned', 'missing-patient', 'foreign-row', 'mixed-rows'])('actual prescription PDF enforces persisted identity and every row (%s)', async variant => {
  const nic = '900000001V', find = jest.fn();
  const owned = { patientNic: nic, patientId: id, doctorId: { fullName: 'Synthetic Doctor' } };
  const rows = variant === 'foreign-row' ? [{ ...owned, patientNic: '900000002V' }] : variant === 'mixed-rows' ? [owned, { ...owned, patientId: '000000000000000000000002' }] : [owned];
  const chain = { populate: () => chain, then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject) };
  find.mockReturnValue(chain);
  const generateLockedPrescription = jest.fn(async () => Buffer.from('synthetic-pdf'));
  const pdfLanguage = jest.fn(async () => ({ lang: 'si' }));
  const consultationLookup = jest.fn(async () => null);
  const c = controller('prescriptionController.js', {
    '../models/Patient': { findById: async () => variant === 'missing-patient' ? null : { _id: id, nic, fullName: 'Synthetic Patient' } },
    '../models/Prescription': { find }, '../models/Consultation': { findOne: consultationLookup }, '../utils/pdfGenerator': { generateLockedPrescription },
    '../services/recipientLanguageService': { pdf: pdfLanguage }
  }), res = response();
  await c.downloadPrescriptionPdf({ user: { id, nic, role: 'patient' }, params: { refId: 'synthetic-reference' }, body: { preferredLanguage: 'ta', documentPassword: 'untrusted' } }, res);
  if (variant === 'owned') {
    expect(find.mock.calls[0][0].$and).toHaveLength(2);
    expect(consultationLookup).toHaveBeenCalledWith({ consultationId: 'synthetic-reference', patientId: id });
    expect(generateLockedPrescription).toHaveBeenCalledTimes(1); expect(res.send).toHaveBeenCalledWith(Buffer.from('synthetic-pdf'));
    expect(pdfLanguage).toHaveBeenCalledWith({ model: 'Patient', accountId: id, authorizedSubjectId: id });
    expect(generateLockedPrescription.mock.calls[0][2]).toBe(nic);
    expect(generateLockedPrescription.mock.calls[0][10]).toEqual({ lang: 'si' });
  } else {
    expect(res.status).toHaveBeenCalledWith(403); expect(generateLockedPrescription).not.toHaveBeenCalled();
    expect(pdfLanguage).not.toHaveBeenCalled();
    if (variant === 'missing-patient') expect(find).not.toHaveBeenCalled();
  }
});
test('actual first-password handler rejects staff-ID-only takeover before lookup', async () => {
  const findById = jest.fn(), c = controller('pharmacyController.js', { '../models/PharmacyStaff': { findById } }), res = response();
  await c.changeFirstPassword({ body: { staffId: id, newPassword: 'Synthetic-new-123!' } }, res);
  expect(res.status).toHaveBeenCalledWith(401); expect(findById).not.toHaveBeenCalled();
});
test.each([false, true])('actual first-password handler checks proof and atomic claim (valid=%s)', async valid => {
  const oldPassword = 'Synthetic-old-123!', hash = bcrypt.hashSync(oldPassword, 4);
  const findOneAndUpdate = jest.fn(async () => ({ _id: id })), updateMany = jest.fn(async () => ({}));
  const c = controller('pharmacyController.js', {
    '../models/PharmacyStaff': { findById: async () => ({ _id: id, password: hash, isActive: true, mustChangePassword: true }), findOneAndUpdate },
    '../models/SessionToken': { updateMany }, '../utils/passwordUtils': { validatePasswordStrength: () => ({ valid: true, score: 4 }), hashPassword: async () => '$2b$12$' + 'a'.repeat(53) },
    '../services/passwordChangeService': { changePasswordAtomic: parameters => require('../src/services/passwordChangeService').createPasswordChangeService({ transact: work => work({}), SessionToken: { updateMany }, TrustedDevice: { updateMany: async () => ({}) }, EventModel: { create: async () => ({}) } })(parameters) }
  });
  const res = response(); await c.changeFirstPassword({ body: { staffId: id, currentPassword: valid ? oldPassword : 'wrong', newPassword: 'Synthetic-new-123!' } }, res);
  if (!valid) { expect(res.status).toHaveBeenCalledWith(401); expect(findOneAndUpdate).not.toHaveBeenCalled(); }
  else { expect(findOneAndUpdate.mock.calls[0][0]).toMatchObject({ _id: id, password: hash, mustChangePassword: true }); expect(updateMany).toHaveBeenCalledWith({ userId: id, userModel: 'PharmacyStaff', isValid: true }, { $set: { isValid: false, logoutAt: expect.any(Date) } }, { session: expect.any(Object) }); }
});
test('actual staff toggle constrains target to administrator pharmacy', async () => {
  const findOne = jest.fn(async () => null), c = controller('pharmacyController.js', { '../models/PharmacyStaff': { findById: async () => ({ role: 'pharmacy_admin', isActive: true, pharmacyId: 'owned-pharmacy' }), findOne } });
  const res = response(); await c.toggleStaffStatus({ user: { id }, params: { id: '000000000000000000000002' } }, res);
  expect(findOne).toHaveBeenCalledWith({ _id: '000000000000000000000002', pharmacyId: 'owned-pharmacy' }); expect(res.status).toHaveBeenCalledWith(404);
});
test('actual lab ownership helper rejects foreign NIC and allows owned NIC', async () => {
  const record = { _id: id, labTestId: 'synthetic-lab', patientNic: '900000001V' };
  const c = controller('labController.js', { '../models/LabTest': { findOne: async () => record } });
  expect(await c._findLabTestByIdentifier('synthetic-lab', '900000001v')).toBe(record);
  expect(await c._findLabTestByIdentifier('synthetic-lab', '900000002V')).toBeNull();
});
test('actual patient download rejects foreign report before OTP or provider access', async () => {
  const getOtp = jest.fn(), c = controller('labController.js', {
    '../models/Patient': { findById: async () => ({ nic: '900000001V' }) },
    '../models/LabTest': { findOne: async () => ({ _id: id, patientNic: '900000002V' }) },
    '../config/redis': { getOtp }
  });
  const res = response(); await c.patientDownloadReport({ user: { id, role: 'patient' }, query: {}, params: { labTestId: 'synthetic-lab' }, body: { otp: '123456' }, headers: {} }, res);
  expect(res.status).toHaveBeenCalledWith(404); expect(getOtp).not.toHaveBeenCalled(); expect(res.send).not.toHaveBeenCalled();
});

test.each(['current', 'no-current-email', 'inactive', 'foreign-id'])('actual patient lab OTP %s never uses token/report email', async mode => {
  const patient = { _id: id, nic: '900000001V', email: mode === 'no-current-email' ? null : 'current@example.invalid', isActive: mode !== 'inactive' };
  const row = { _id: id, patientId: mode === 'foreign-id' ? '000000000000000000000002' : id, patientNic: patient.nic, patientEmail: 'stale@example.invalid', labTestId: 'synthetic-lab' };
  const setOtp = jest.fn(), sendEmail = jest.fn(async () => ({ providerAccepted: true }));
  const c = controller('labController.js', {
    '../models/Patient': { findById: async () => patient }, '../models/LabTest': { findOne: async () => row },
    '../utils/emailService': { sendEmail }, speakeasy: { generateSecret: () => ({ base32: 'synthetic' }), totp: () => '123456' },
    '../config/redis': { setOtp, getAttempts: async () => 0, checkOtpRequestThrottle: async () => ({ allowed: true }), recordOtpRequestSent: async () => {} }
  }), res = response();
  await c.patientRequestOtp({ user: { id, role: 'patient', email: 'token@example.invalid' }, params: { labTestId: row.labTestId }, body: { lang: 'ta' } }, res);
  if (mode === 'current') {
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: patient.email, isOtp: true }));
    expect(setOtp).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ patientId: id, purpose: 'patient-lab-download' }), 600);
  } else { expect(res.status).toHaveBeenCalledWith(mode === 'foreign-id' ? 404 : 400); expect(setOtp).not.toHaveBeenCalled(); expect(sendEmail).not.toHaveBeenCalled(); }
});

test('actual patient lab download rejects a foreign persisted patient ID even when the legacy NIC matches', async () => {
  const getOtp = jest.fn(), sendEmail = jest.fn();
  const c = controller('labController.js', {
    '../models/Patient': { findById: async () => ({ _id: id, nic: '900000001V' }) },
    '../models/LabTest': { findOne: async () => ({ _id: id, patientId: '000000000000000000000002', patientNic: '900000001V' }) },
    '../config/redis': { getOtp }, '../utils/emailService': { sendEmail }
  }), res = response();
  await c.patientDownloadReport({ user: { id, role: 'patient' }, params: { labTestId: 'synthetic-lab' }, body: { otp: '123456' }, headers: {}, query: {} }, res);
  expect(res.status).toHaveBeenCalledWith(404); expect(getOtp).not.toHaveBeenCalled(); expect(sendEmail).not.toHaveBeenCalled(); expect(res.send).not.toHaveBeenCalled();
});

test.each(['current', 'missing', 'wrong-nic', 'inactive'])('actual doctor lab OTP %s resolves patient before creating any OTP', async mode => {
  const patient = { _id: id, nic: mode === 'wrong-nic' ? '900000002V' : '900000001V', email: 'current@example.invalid', isActive: mode !== 'inactive' };
  const row = { _id: id, patientId: id, patientNic: '900000001V', patientEmail: 'stale@example.invalid', labTestId: 'synthetic-lab', reportPath: 'synthetic-private' };
  const setOtp = jest.fn(), sendEmail = jest.fn(async () => ({ providerAccepted: true }));
  const findById = jest.fn(async () => mode === 'missing' ? null : patient);
  const c = controller('labController.js', {
    '../models/Patient': { findById }, '../models/LabTest': { findOne: async () => row }, '../models/Doctor': { findById: async () => ({ fullName: 'Synthetic Doctor' }) },
    '../utils/emailService': { sendEmail }, speakeasy: { generateSecret: () => ({ base32: 'synthetic' }), totp: () => '123456' },
    '../config/redis': { setOtp, checkOtpRequestThrottle: async () => ({ allowed: true }), recordOtpRequestSent: async () => {} }
  }), res = response();
  await c.doctorRequestOtp({ user: { id: '000000000000000000000002', role: 'doctor' }, params: { labTestId: row.labTestId }, body: { lang: 'ta' } }, res);
  expect(findById).toHaveBeenCalledWith(id);
  if (mode === 'current') { expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: patient.email, isOtp: true })); expect(setOtp).toHaveBeenCalledTimes(1); }
  else { expect(res.status).toHaveBeenCalledWith(400); expect(setOtp).not.toHaveBeenCalled(); expect(sendEmail).not.toHaveBeenCalled(); }
});

test.each(['current', 'missing', 'encrypted-save'])('post-commit lab status %s sends only to a current bound patient and preserves the commit', async mode => {
  const patient = { _id: id, nic: '900000001V', email: 'current@example.invalid' };
  const row = { _id: id, hospitalId: id, patientId: id, patientNic: patient.nic, patientEmail: 'stale@example.invalid', labTestId: 'synthetic-lab', testName: '<img src=x>', status: 'sample_collected', statusHistory: [] };
  const saveLabChange = jest.fn(async () => { if (mode === 'encrypted-save') row.patientNic = 'encrypted-in-place'; }), sendEmail = jest.fn();
  const c = controller('labController.js', {
    '../models/Patient': { findById: async () => mode === 'missing' ? null : patient }, '../models/LabTest': { findOne: async () => row },
    '../utils/emailService': { sendEmail }, '../services/labCommitService': { saveLabChange }
  }), res = response();
  await c.updateStatus({ user: { id, role: 'hospital_admin' }, session: { _id: id }, params: { labTestId: row.labTestId }, body: { status: 'processing' } }, res);
  expect(saveLabChange).toHaveBeenCalledTimes(1);
  expect(res.json).toHaveBeenCalledWith({ message: 'Status updated to "processing"', labTestId: row.labTestId });
  if (mode !== 'missing') {
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: patient.email }));
    expect(sendEmail.mock.calls[0][0].html).toContain('&lt;img src=x&gt;');
    expect(sendEmail.mock.calls[0][0].html).not.toContain('<img src=x>');
  }
  else expect(sendEmail).not.toHaveBeenCalled();
});
test.each([['patient', 'legacy-ref'], ['patient', null], ['doctor', 'legacy-ref'], ['doctor', null]])('actual %s download fails closed without a retrievable stored PDF (path=%s)', async (role, reportPath) => {
  const row = { _id: id, patientNic: '900000001V', labTestId: 'synthetic-lab', reportPath }, generateLabReportPDF = jest.fn();
  const c = controller('labController.js', {
    '../models/Patient': { findById: async () => ({ nic: row.patientNic }) }, '../models/LabTest': { findOne: async () => row },
    '../utils/pdfGenerator': { generateLabReportPDF }, '../services/labReportStorage': { downloadStoredReport: async () => { throw new Error('storage unavailable'); } },
    '../config/redis': { getAttempts: async () => 0, getOtp: async () => ({ purpose: role + '-lab-download', patientId: id, doctorId: id, labTestId: row.labTestId, testObjectId: id, otp: '123456', expiresAt: Date.now() + 10000 }), consumeOtp: async () => true, deleteOtp: async () => {} }
  });
  const res = response(); await c[role === 'patient' ? 'patientDownloadReport' : 'doctorDownloadReport']({ user: { id, role }, query: {}, params: { labTestId: row.labTestId }, body: { otp: '123456' }, headers: {} }, res);
  expect(res.status).toHaveBeenCalledWith(503); expect(res.send).not.toHaveBeenCalled(); expect(generateLabReportPDF).not.toHaveBeenCalled();
});

test.each(['getNotifications', 'markAsRead', 'markAllAsRead'])('actual notification %s failure does not disclose persistence diagnostics', async method => {
  const fail = () => { throw new Error('synthetic-private-diagnostic'); };
  const c = controller('notificationController.js', { '../models/Notification': { find: fail, findOneAndUpdate: fail, updateMany: fail } }), res = response();
  await c[method]({ user: { id }, params: { id } }, res);
  expect(res.status).toHaveBeenCalledWith(500); expect(JSON.stringify(res.json.mock.calls)).not.toContain('synthetic-private-diagnostic');
});

test.each(['success', 'same-secret', 'no-expiry', 'logged-out', 'wrong-model', 'expired-session', 'unverified', 'banned', 'ban-store-error', 'device-mismatch', 'lost-rotation-race'])('actual refresh handler enforces session/account checks: %s', async scenario => {
  const jwt = require('jsonwebtoken'), accountState = require('../src/security/accountState');
  const env = { JWT_SECRET: 'synthetic-access-key-32bytes-only!!!', JWT_REFRESH_SECRET: 'synthetic-refresh-key-32bytes-only!!' };
  if (scenario === 'same-secret') env.JWT_REFRESH_SECRET = env.JWT_SECRET;
  const token = jwt.sign({ id, role: 'doctor' }, env.JWT_REFRESH_SECRET, scenario === 'no-expiry' ? {} : { expiresIn: '5m' });
  const session = { _id: '000000000000000000000002', userId: id, userModel: scenario === 'wrong-model' ? 'Patient' : 'Doctor', isValid: true,
    ...(scenario === 'logged-out' ? { logoutAt: new Date() } : {}),
    ...(scenario === 'expired-session' ? { expiredAt: new Date(0) } : {}),
    ...(scenario === 'device-mismatch' ? { deviceFingerprint: 'bound-synthetic-device' } : {}) };
  const create = jest.fn(async () => ({})), findOneAndUpdate = jest.fn(async () => scenario === 'lost-rotation-race' ? null : session);
  const findOne = jest.fn(async () => session), readAccount = jest.fn(async () => ({ _id: id, role: 'doctor', isActive: true, isVerified: scenario !== 'unverified' }));
  const c = controller('authController.js', {
    jsonwebtoken: jwt, uuid: { v4: crypto.randomUUID },
    '../models/SessionToken': { findOne, findOneAndUpdate, create },
    '../security/accountState': { ...accountState, readAccount },
    '../models/BanRecord': { findOne: async () => { if (scenario === 'ban-store-error') throw new Error('synthetic secret'); return scenario === 'banned' ? { isActive: true } : null; } },
    '../utils/deviceParser': { parseDeviceModel: () => 'synthetic-device' }
  }, env);
  const res = response(); await c.refreshToken({ headers: {}, body: { refreshToken: token } }, res);
  if (scenario === 'success') {
    expect(res.status).toHaveBeenCalledWith(200); expect(create).toHaveBeenCalledTimes(1);
    expect(findOneAndUpdate.mock.calls[0][0]).toEqual({ _id: session._id, userId: id, userModel: 'Doctor', refreshTokenHash: crypto.createHash('sha256').update(token).digest('hex'), isValid: true, logoutAt: null, deviceFingerprint: null, $or: [{ expiredAt: null }, { expiredAt: { $gt: expect.any(Date) } }] });
    const issued = res.json.mock.calls[0][0].data;
    expect(issued.refreshToken).not.toBe(token); expect(jwt.verify(issued.accessToken, env.JWT_SECRET).id).toBe(id);
    expect(create.mock.calls[0][0].userModel).toBe('Doctor');
  } else {
    expect(res.status.mock.calls[0][0]).toBeGreaterThanOrEqual(400); expect(create).not.toHaveBeenCalled();
    if (scenario !== 'lost-rotation-race') expect(findOneAndUpdate).not.toHaveBeenCalled();
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('synthetic secret');
  }
});

test.each(['doctor', 'hospital_admin'])('legacy consultation test lookup is scoped to %s and removes storage details', async role => {
  const find = jest.fn(() => ({ populate: () => ({ sort: async () => [{ resultFileUrl: 'private', resultCloudinaryId: 'private', patientNic: '900000001V', __enc_patientNic: true, testName: 'Synthetic' }] }) }));
  const c = controller('testController.js', { '../models/TestOrder': { find } }), res = response();
  await c.getConsultationTests({ user: { id, role }, params: { id: 'consultation-fixture' } }, res);
  expect(find).toHaveBeenCalledWith({ consultationId: 'consultation-fixture', [role === 'doctor' ? 'doctorId' : 'hospitalId']: id });
  expect(res.json).toHaveBeenCalledWith({ data: [{ testName: 'Synthetic' }] });
});

test('legacy patient test lookup requires doctor consent before clinical query', async () => {
  const find = jest.fn(), c = controller('testController.js', { '../models/LabTest': { find } }), res = response();
  await c.getPatientTests({ user: { id, role: 'doctor' }, headers: {}, params: { nic: '900000001V' } }, res);
  expect(res.status).toHaveBeenCalledWith(403); expect(find).not.toHaveBeenCalled();
});

test('legacy hospital patient test lookup includes hospital scope', async () => {
  const find = jest.fn(() => ({ sort: async () => [] })), c = controller('testController.js', { '../models/LabTest': { find } }), res = response();
  await c.getPatientTests({ user: { id, role: 'hospital_admin' }, headers: {}, params: { nic: '900000001V' } }, res);
  expect(find.mock.calls[0][0]).toMatchObject({ hospitalId: id }); expect(res.json).toHaveBeenCalledWith({ data: [] });
});

test.each(['foreign', 'cancelled', 'race', 'success'])('legacy test status update denies unsafe %s and scopes writes', async scenario => {
  const findOne = jest.fn(async () => scenario === 'foreign' ? null : { status: scenario === 'cancelled' ? 'cancelled' : 'ordered' });
  const findOneAndUpdate = jest.fn(async () => scenario === 'race' ? null : { status: 'processing' });
  const c = controller('testController.js', { '../models/TestOrder': { findOne, findOneAndUpdate } }), res = response();
  await c.updateTestStatus({ user: { id, role: 'hospital_admin' }, params: { id: 'test-fixture' }, body: { status: 'processing' } }, res);
  expect(findOne).toHaveBeenCalledWith({ _id: 'test-fixture', hospitalId: id });
  if (['foreign', 'cancelled'].includes(scenario)) expect(findOneAndUpdate).not.toHaveBeenCalled();
  else expect(findOneAndUpdate.mock.calls[0][0]).toEqual({ _id: 'test-fixture', hospitalId: id, status: 'ordered' });
  if (scenario === 'race') expect(res.status).toHaveBeenCalledWith(409);
});

test('legacy upload is held before any persistence or provider middleware', async () => {
  const c = controller('testController.js', {}), res = response(); await c.uploadTestResult({}, res);
  expect(res.status).toHaveBeenCalledWith(403);
  const route = fs.readFileSync(path.resolve(__dirname, '../src/routes/testRoutes.js'), 'utf8');
  expect(route).not.toContain('upload.single'); expect(route).not.toContain("require('../utils/cloudinary')");
});

test('legacy test ordering rejects patient/consultation mismatch before save', async () => {
  const save = jest.fn(); class Order { async save() { save(); } }
  const c = controller('testController.js', { '../models/Consultation': { findOne: async () => ({ patientNic: '900000002V' }) }, '../models/TestOrder': Order, '../security/nicBlindIndex': require('../src/security/nicBlindIndex') }), res = response();
  await c.orderTest({ user: { id, role: 'doctor' }, body: { consultationId: 'consultation-fixture', patientNic: '900000001V', testName: 'Synthetic', testCategory: 'blood' } }, res);
  expect(res.status).toHaveBeenCalledWith(403); expect(save).not.toHaveBeenCalled();
});

test.each(['getTestByReportId', 'updateStatus', 'uploadReport'])('actual %s denies a foreign hospital before clinical writes or provider calls', async method => {
  const save = jest.fn(), upload = jest.fn(), row = { _id: id, hospitalId: '000000000000000000000009', status: 'Approved', save };
  const c = controller('labController.js', { '../models/LabTest': { findOne: async () => row }, cloudinary: { v2: { config() {}, uploader: { upload_stream: upload } } } }), res = response();
  await c[method]({ user: { id, role: 'hospital_admin' }, params: { labTestId: 'synthetic-lab', reportId: 'synthetic-lab' }, body: { status: 'processing' }, file: { buffer: Buffer.from('%PDF- synthetic') } }, res);
  expect(res.status).toHaveBeenCalledWith(404); expect(save).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
});
test.each(['save-failure', 'foreign-provider-id', 'unknown-commit'])('actual upload %s cleanup uses only the allocated private asset identifier', async mode => {
  const row = { _id: id, hospitalId: id, status: 'Approved', patientNic: '900000001V', statusHistory: [] }, destroy = jest.fn(async () => ({}));
  const upload_stream = jest.fn((options, callback) => ({ end() { callback(null, { public_id: mode === 'foreign-provider-id' ? 'foreign-asset' : options.public_id, secure_url: 'https://res.cloudinary.com/synthetic' }); } }));
  const c = controller('labController.js', { '../models/LabTest': { findOne: async () => row }, cloudinary: { v2: { config() {}, uploader: { upload_stream, destroy } } },
    '../security/securityRuntime': { current: () => ({ fieldMode: 'legacy' }) }, '../security/labReportEnvelope': require('../src/security/labReportEnvelope'),
    '../services/labCommitService': { saveLabChange: async () => { throw Object.assign(new Error('synthetic database failure'), mode === 'unknown-commit' ? { code: 'TRANSACTION_OUTCOME_UNKNOWN', commandId: 'synthetic-command' } : {}); } } }), res = response();
  await c.uploadReport({ user: { id, role: 'hospital_admin' }, params: { labTestId: 'synthetic-lab' }, file: { buffer: Buffer.from('%PDF- synthetic'), originalname: 'synthetic.pdf' } }, res);
  expect(res.status).toHaveBeenCalledWith(mode === 'unknown-commit' ? 503 : 500); const options = upload_stream.mock.calls[0][0]; expect(options).toMatchObject({ type: 'authenticated', overwrite: false });
  expect(options.public_id).toMatch(new RegExp('^medisync/lab-reports/' + id + '/[a-f0-9]{32}$'));
  if (mode === 'save-failure') expect(destroy).toHaveBeenCalledWith(options.public_id, expect.objectContaining({ type: 'authenticated', resource_type: 'raw' })); else expect(destroy).not.toHaveBeenCalled();
});

test('administrative analytics rejects a hospital before any aggregate or clinical lookup', async () => {
  const aggregate = jest.fn(), c = controller('analyticsController.js', { '../models/Patient': { aggregate } }), res = response();
  await c.getDashboardStats({ user: { id, role: 'hospital_admin' } }, res); expect(res.status).toHaveBeenCalledWith(403); expect(aggregate).not.toHaveBeenCalled();
});

test.each(['en', 'si'])('actual account suspension sends a security notice using stored %s preference', async lang => {
  const target = { _id: id, email: 'synthetic@example.invalid', fullName: 'Synthetic', preferredLanguage: lang, save: jest.fn() };
  class Ban { constructor(value) { Object.assign(this, value); } async save() {} }
  const sendSecurityIncidentEmail = jest.fn(async () => ({})), sendWelcomeEmail = jest.fn();
  const c = controller('adminController.js', { '../models/Doctor': { findById: async () => target }, '../models/BanRecord': Ban,
    '../utils/emailService': { sendSecurityIncidentEmail, sendWelcomeEmail } }), res = response();
  await c.banUser({ user: { id: '000000000000000000000002' }, body: { targetId: id, targetModel: 'Doctor', banType: 'permanent', reason: 'Synthetic', lang: 'ta', email: 'foreign@example.invalid' } }, res);
  expect(res.status).toHaveBeenCalledWith(201); expect(target.save).toHaveBeenCalledTimes(1); expect(target.isActive).toBe(false);
  expect(sendSecurityIncidentEmail).toHaveBeenCalledWith(target.email, target.fullName, expect.stringContaining('suspended'), { lang });
  expect(sendWelcomeEmail).not.toHaveBeenCalled();
});
test('guessable public lab identifiers disclose no clinical metadata or existence', async () => {
  const findOne = jest.fn(), c = controller('labController.js', { '../models/LabTest': { findOne } }), res = response();
  await c.publicStatusCheck({ params: { labTestId: 'synthetic-guessed-id' } }, res); expect(res.status).toHaveBeenCalledWith(403); expect(findOne).not.toHaveBeenCalled();
});

function deviceTrustFixture() {
  const deviceId = '000000000000000000000002', sessionId = '000000000000000000000003', otpId = '000000000000000000000004';
  const device = { _id: deviceId, userId: id, userModel: 'Doctor', deviceFingerprint: 'synthetic-device', deviceModel: 'Synthetic browser', isRevoked: true, isTrusted: false, save: jest.fn() };
  const account = { _id: id, role: 'doctor', isActive: true, isVerified: true, email: 'current@example.invalid', preferredLanguage: 'si' };
  const otp = { _id: otpId, userId: id, userModel: 'Doctor', purpose: 'device-trust', used: false, failedAttempts: 0, expiresAt: new Date(Date.now() + 60000), otp: bcrypt.hashSync('123456', 4),
    metadata: { deviceId, deviceFingerprint: device.deviceFingerprint, sessionId } };
  const state = { account, otp, claim: true, accountReads: 0, revokeAfterClaim: false };
  const otherModel = { findById: jest.fn(async () => ({ _id: id, email: 'foreign@example.invalid' })) };
  const findAccount = jest.fn(async () => { state.accountReads++; return state.revokeAfterClaim && state.accountReads > 1 ? null : state.account; });
  const findOne = jest.fn(() => ({ sort: async () => state.otp }));
  const findOneAndUpdate = jest.fn(async () => state.claim ? otp : null);
  const create = jest.fn(async value => ({ _id: otpId, ...value })), updateMany = jest.fn(), updateOne = jest.fn(), sendOTPEmail = jest.fn(async () => ({ providerAccepted: true }));
  const sessionUpdate = jest.fn(), audit = jest.fn(), incrementAttempts = jest.fn(async () => 1);
  const c = controller('deviceController.js', {
    '../models/Doctor': { findById: findAccount }, '../models/Patient': otherModel, '../models/PharmacyStaff': otherModel, '../models/Hospital': otherModel, '../models/Admin': otherModel,
    '../models/TrustedDevice': { findById: async () => device }, '../models/SessionToken': { updateMany: sessionUpdate }, '../models/AuditLog': { create: audit },
    '../models/OTPSession': { findOne, findOneAndUpdate, create, updateMany, updateOne, collection: { updateOne }, deleteOne: jest.fn() },
    '../config/redis': { getAttempts: async () => 0, incrementAttempts, clearAttempts: async () => {}, checkOtpRequestThrottle: async () => ({ allowed: true }), recordOtpRequestSent: async () => {} },
    '../utils/emailService': { sendOTPEmail }
  });
  const req = { user: { id, role: 'doctor' }, session: { _id: sessionId, userId: id, userModel: 'Doctor', isValid: true, deviceFingerprint: device.deviceFingerprint }, params: { id: deviceId }, headers: { 'user-agent': 'synthetic' }, body: { otp: '123456', lang: 'ta', email: 'foreign@example.invalid' } };
  return { c, req, device, account, otp, state, otherModel, findAccount, findOne, findOneAndUpdate, create, updateMany, updateOne, sendOTPEmail, sessionUpdate, audit, incrementAttempts };
}

function refreshSafetyFixture({ claims = {}, expiresIn = '5m', bound = false, device } = {}) {
  const jwt = require('jsonwebtoken'), state = { reads: 0, banned: false, inactive: false, beforeClaim() {}, accountDelay() {} };
  const env = { JWT_SECRET: 'synthetic-access-key-32bytes-only!!!', JWT_REFRESH_SECRET: 'synthetic-refresh-key-32bytes-only!!' };
  const token = jwt.sign({ id, role: 'doctor', ...claims }, env.JWT_REFRESH_SECRET, { expiresIn });
  const session = { _id: '000000000000000000000002', userId: id, userModel: 'Doctor', isValid: true, ...(bound ? { deviceFingerprint: 'owned-device' } : {}) };
  const create = jest.fn(async () => ({})), findOneAndUpdate = jest.fn(async filter => {
    state.beforeClaim();
    if (!session.isValid || session.logoutAt || session.userId !== filter.userId || session.userModel !== filter.userModel || (session.expiredAt && session.expiredAt <= filter.$or[1].expiredAt.$gt)) return null;
    const before = { ...session }; session.isValid = false; return before;
  });
  const readAccount = jest.fn(async () => { state.reads++; state.accountDelay(); return { _id: id, role: 'doctor', isActive: !state.inactive, isVerified: true }; });
  const c = controller('authController.js', {
    jsonwebtoken: jwt, uuid: { v4: crypto.randomUUID },
    '../models/SessionToken': { findOne: async filter => session.isValid === filter.isValid ? { ...session } : null, findOneAndUpdate, create },
    '../security/accountState': { ...require('../src/security/accountState'), readAccount },
    '../models/TrustedDevice': { findOne: async () => device },
    '../models/BanRecord': { findOne: async () => state.banned ? { isActive: true } : null },
    '../utils/deviceParser': { parseDeviceModel: () => 'synthetic-device' }
  }, env);
  const req = { headers: bound ? { 'x-device-fingerprint': 'owned-device' } : {}, body: { refreshToken: token } };
  return { c, req, state, session, create, readAccount, findOneAndUpdate };
}

test.each([{ id: 'bad' }, { id: { $ne: null } }, { role: 'owner' }, { role: 'toString' }])('refresh rejects malformed signed identity before repository access: %p', async claims => {
  const h = refreshSafetyFixture({ claims }), res = response(); await h.c.refreshToken(h.req, res);
  expect(res.status).toHaveBeenCalledWith(403); expect(h.readAccount).not.toHaveBeenCalled(); expect(h.create).not.toHaveBeenCalled();
});

test.each(['valid', 'untrusted', 'undefined', 'foreign-user', 'foreign-model', 'foreign-fingerprint', 'unknown-revocation', 'revoked'])('refresh binds returned device rows: %s', async mode => {
  let device = { userId: id, userModel: 'Doctor', deviceFingerprint: 'owned-device', isRevoked: false, save: jest.fn(async () => {}) };
  if (mode === 'foreign-user') device.userId = '000000000000000000000003';
  if (mode === 'foreign-model') device.userModel = 'Patient';
  if (mode === 'foreign-fingerprint') device.deviceFingerprint = 'other';
  if (mode === 'unknown-revocation') delete device.isRevoked;
  if (mode === 'revoked') device.isRevoked = true;
  if (mode === 'undefined') device = undefined;
  if (mode === 'untrusted') device = null;
  const h = refreshSafetyFixture({ bound: true, device }), res = response();
  await h.c.refreshToken(h.req, res);
  if (['valid', 'untrusted'].includes(mode)) { expect(res.status).toHaveBeenCalledWith(200); expect(h.create).toHaveBeenCalledTimes(1); }
  else { expect(res.status).toHaveBeenCalledWith(401); expect(h.create).not.toHaveBeenCalled(); }
});

test.each(['token-expiry', 'session-expiry', 'suspension-after-claim', 'ban-after-claim', 'expiry-after-claim', 'session-expiry-after-claim', 'logout-at-claim'])('refresh cannot mint credentials after %s', async mode => {
  jest.useFakeTimers();
  try {
    const h = refreshSafetyFixture({ expiresIn: mode === 'session-expiry-after-claim' ? '5m' : '2s' }), res = response(), start = Date.now();
    if (mode === 'session-expiry' || mode === 'session-expiry-after-claim') h.session.expiredAt = new Date(start + 1000);
    h.state.accountDelay = () => {
      if (h.state.reads === 1 && ['token-expiry', 'session-expiry'].includes(mode)) jest.setSystemTime(start + 3000);
      if (h.state.reads === 2) {
        if (mode === 'suspension-after-claim') h.state.inactive = true;
        if (mode === 'ban-after-claim') h.state.banned = true;
        if (mode === 'expiry-after-claim' || mode === 'session-expiry-after-claim') jest.setSystemTime(start + 3000);
      }
    };
    if (mode === 'logout-at-claim') h.state.beforeClaim = () => { h.session.logoutAt = new Date(); };
    await h.c.refreshToken(h.req, res);
    expect(res.status.mock.calls[0][0]).toBeGreaterThanOrEqual(400); expect(h.create).not.toHaveBeenCalled(); expect(res.cookie).not.toHaveBeenCalled();
    if (['token-expiry', 'session-expiry'].includes(mode)) expect(h.findOneAndUpdate).not.toHaveBeenCalled();
  } finally { jest.useRealTimers(); }
});

test('concurrent refresh requests claim one old session and mint at most one new pair', async () => {
  const h = refreshSafetyFixture(), a = response(), b = response();
  await Promise.all([h.c.refreshToken(h.req, a), h.c.refreshToken(h.req, b)]);
  expect([a, b].filter(res => res.status.mock.calls[0][0] === 200)).toHaveLength(1);
  expect(h.create).toHaveBeenCalledTimes(1); expect(h.session.isValid).toBe(false);
});

test.each(['wrong-session-model', 'wrong-session-user', 'logged-out', 'expired', 'missing-account', 'unverified', 'inactive', 'foreign-device-model', 'invalid-failure-count'])('device trust OTP denies %s without cross-role lookup or secondary writes', async mode => {
  const f = deviceTrustFixture(), res = response();
  if (mode === 'wrong-session-model') f.req.session.userModel = 'Patient';
  if (mode === 'wrong-session-user') f.req.session.userId = f.device._id;
  if (mode === 'logged-out') f.req.session.logoutAt = new Date();
  if (mode === 'expired') f.req.session.expiredAt = new Date(0);
  if (mode === 'missing-account') f.state.account = null;
  if (mode === 'unverified') f.account.isVerified = false;
  if (mode === 'inactive') f.account.isActive = false;
  if (mode === 'foreign-device-model') f.device.userModel = 'Patient';
  if (mode === 'invalid-failure-count') f.otp.failedAttempts = NaN;
  await f.c.requestDeviceTrustOTP(f.req, res);
  expect(res.status).toHaveBeenCalledWith(403); expect(f.otherModel.findById).not.toHaveBeenCalled();
  expect(f.create).not.toHaveBeenCalled(); expect(f.updateMany).not.toHaveBeenCalled(); expect(f.sendOTPEmail).not.toHaveBeenCalled();
});

test('device challenge persists exact model/device/fingerprint/session and uses the account preference', async () => {
  const f = deviceTrustFixture(), res = response(); f.state.otp = null;
  await f.c.requestDeviceTrustOTP(f.req, res);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(f.create).toHaveBeenCalledWith(expect.objectContaining({ userId: id, userModel: 'Doctor', purpose: 'device-trust',
    metadata: { deviceId: String(f.device._id), deviceFingerprint: f.device.deviceFingerprint, sessionId: String(f.req.session._id) } }));
  expect(f.updateMany).toHaveBeenCalledWith({ userId: id, userModel: 'Doctor', purpose: 'device-trust', used: false }, { $set: { used: true } });
  expect(f.sendOTPEmail).toHaveBeenCalledWith(f.account.email, 'User', expect.stringMatching(/^[0-9]{6}$/), { lang: 'si' });
  expect(f.otherModel.findById).not.toHaveBeenCalled();
});

test.each(['verification-purpose', 'wrong-model', 'wrong-device', 'wrong-fingerprint', 'wrong-session', 'used', 'expired', 'invalid-failure-count', 'negative-failure-count', 'wrong-code', 'invalid-code', 'lost-claim', 'revoked-after-claim', 'valid'])('actual device trust enforces challenge scope and claim: %s', async mode => {
  const f = deviceTrustFixture(), res = response();
  if (mode === 'verification-purpose') f.otp.purpose = 'verification';
  if (mode === 'wrong-model') f.otp.userModel = 'Patient';
  if (mode === 'wrong-device') f.otp.metadata.deviceId = id;
  if (mode === 'wrong-fingerprint') f.otp.metadata.deviceFingerprint = 'foreign';
  if (mode === 'wrong-session') f.otp.metadata.sessionId = id;
  if (mode === 'used') f.otp.used = true;
  if (mode === 'expired') f.otp.expiresAt = new Date(0);
  if (mode === 'invalid-failure-count') f.otp.failedAttempts = NaN;
  if (mode === 'negative-failure-count') f.otp.failedAttempts = -1;
  if (mode === 'wrong-code') f.req.body.otp = '654321';
  if (mode === 'invalid-code') f.req.body.otp = '123456-untrusted';
  if (mode === 'lost-claim') f.state.claim = false;
  if (mode === 'revoked-after-claim') f.state.revokeAfterClaim = true;
  await f.c.trustMyDevice(f.req, res);
  if (mode === 'valid') {
    expect(f.device.save).toHaveBeenCalledTimes(1); expect(f.device.isTrusted).toBe(true);
    expect(f.sessionUpdate).toHaveBeenCalledWith({ userId: id, userModel: 'Doctor', deviceFingerprint: f.device.deviceFingerprint, isValid: true }, { $set: { isTrusted: true } });
    expect(f.audit).toHaveBeenCalledTimes(1); expect(f.findAccount).toHaveBeenCalledTimes(2);
  } else {
    expect(res.status).toHaveBeenCalledWith(403); expect(f.device.save).not.toHaveBeenCalled(); expect(f.sessionUpdate).not.toHaveBeenCalled(); expect(f.audit).not.toHaveBeenCalled();
  }
  if (['valid', 'lost-claim', 'revoked-after-claim'].includes(mode)) {
    expect(f.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({ _id: f.otp._id, userId: id, userModel: 'Doctor', purpose: 'device-trust', used: false,
      expiresAt: { $gt: expect.any(Date) }, failedAttempts: { $lt: 5 }, 'metadata.deviceId': String(f.device._id), 'metadata.deviceFingerprint': f.device.deviceFingerprint, 'metadata.sessionId': String(f.req.session._id) }), { $set: { used: true } }, { returnDocument: 'after' });
  } else expect(f.findOneAndUpdate).not.toHaveBeenCalled();
  expect(f.sendOTPEmail).not.toHaveBeenCalled(); expect(f.otherModel.findById).not.toHaveBeenCalled();
});

test('real detached OTP schema retains challenge binding without persistence or index changes', () => {
  const Model = require('../src/models/OTPSession');
  const document = new Model({ userId: id, userModel: 'Doctor', purpose: 'device-trust', otp: 'synthetic-hash', expiresAt: new Date(Date.now() + 60000),
    metadata: { deviceId: id, deviceFingerprint: 'synthetic', sessionId: id } });
  expect(document.validateSync()).toBeUndefined(); expect(document.toObject().metadata).toMatchObject({ deviceId: id, deviceFingerprint: 'synthetic', sessionId: id });
  expect(Model.schema.indexes()).toEqual([[{ expiresAt: 1 }, { expireAfterSeconds: 0 }]]);
});

test.each(['valid', 'expires-during-compare', 'exhausted-during-compare', 'claim-lost', 'invalid-counter', 'expired', 'malformed-code'])('actual 2FA setup binds and rechecks challenge state at claim: %s', async mode => {
  const user = { _id: id, twoFactorEnabled: false, email: 'qa@example.invalid', save: jest.fn(async () => {}) };
  const otp = { _id: '000000000000000000000008', userId: id, userModel: 'Patient', purpose: '2fa-setup', otp: 'synthetic-bcrypt-proof', failedAttempts: mode === 'invalid-counter' ? NaN : 0, used: false, expiresAt: new Date(Date.now() + (mode === 'expired' ? -60000 : 60000)) };
  const compare = jest.fn(async () => { if (mode === 'expires-during-compare') otp.expiresAt = new Date(0); if (mode === 'exhausted-during-compare') otp.failedAttempts = 5; return true; });
  const findOneAndUpdate = jest.fn(async filter => filter.userModel === otp.userModel && filter.userId === otp.userId && filter.purpose === otp.purpose && filter.otp === otp.otp && filter.expiresAt?.$gt < otp.expiresAt && filter.failedAttempts?.$gte === 0 && filter.failedAttempts?.$lt > otp.failedAttempts && mode !== 'claim-lost' ? otp : null);
  const findOne = jest.fn(() => ({ sort: async () => otp })), clearAttempts = jest.fn(async () => {});
  const c = controller('authController.js', { '../models/Patient': { findById: async () => user }, '../models/OTPSession': { findOne, findOneAndUpdate },
    '../config/redis': { getAttempts: async () => 0, incrementAttempts: async () => 1, clearAttempts }, 'bcryptjs': { compare } });
  const res = response(); await c.verify2FASetup({ user: { id, role: 'patient' }, body: { otp: mode === 'malformed-code' ? '12.456' : '123456' } }, res);
  if (mode === 'valid') { expect(res.status).toHaveBeenCalledWith(200); expect(user.twoFactorEnabled).toBe(true); expect(user.save).toHaveBeenCalledTimes(1); }
  else { expect(user.twoFactorEnabled).toBe(false); expect(user.save).not.toHaveBeenCalled(); expect(clearAttempts).not.toHaveBeenCalled(); }
  if (['valid', 'expires-during-compare', 'exhausted-during-compare', 'claim-lost'].includes(mode)) {
    expect(findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({ _id: otp._id, userId: id, userModel: 'Patient', purpose: '2fa-setup', otp: otp.otp, used: false, expiresAt: { $gt: expect.any(Date) }, failedAttempts: { $gte: 0, $lt: 5 } }), { $set: { used: true, failedAttempts: 0 } }, { returnDocument: 'after' });
  } else { expect(compare).not.toHaveBeenCalled(); expect(findOneAndUpdate).not.toHaveBeenCalled(); }
  if (mode !== 'malformed-code') expect(findOne).toHaveBeenCalledWith({ userId: id, userModel: 'Patient', purpose: '2fa-setup' });
});

test.each(['expires-during-compare', 'exhausted-during-compare', 'claim-lost', 'invalid-counter', 'expired', 'malformed-code', 'missing-bound-account'])('actual login OTP denies %s without token issuance or cross-model fallback', async mode => {
  const otp = { _id: '000000000000000000000008', userId: id, userModel: 'Patient', purpose: 'login', otp: 'synthetic-bcrypt-proof', failedAttempts: mode === 'invalid-counter' ? NaN : 0, used: false, expiresAt: new Date(Date.now() + (mode === 'expired' ? -60000 : 60000)) };
  const compare = jest.fn(async () => { if (mode === 'expires-during-compare') otp.expiresAt = new Date(0); if (mode === 'exhausted-during-compare') otp.failedAttempts = 5; return true; });
  const claim = jest.fn(async () => null), sign = jest.fn(), foreignLookup = jest.fn(async () => ({ _id: id }));
  const c = controller('authController.js', { '../models/Patient': { findById: async () => mode === 'missing-bound-account' ? null : ({ _id: id, email: 'qa@example.invalid' }) },
    '../models/Doctor': { findById: foreignLookup }, '../models/PharmacyStaff': { findById: foreignLookup }, '../models/Hospital': { findById: foreignLookup }, '../models/Admin': { findById: foreignLookup },
    '../models/OTPSession': { findOne: () => ({ sort: async () => otp }), findOneAndUpdate: claim }, '../config/redis': { getAttempts: async () => 0, incrementAttempts: async () => 1 }, 'bcryptjs': { compare }, jsonwebtoken: { sign } });
  const res = response(); await c.verifyLoginOTP({ body: { userId: id, otp: mode === 'malformed-code' ? '12.456' : '123456' } }, res);
  expect(sign).not.toHaveBeenCalled(); expect(foreignLookup).not.toHaveBeenCalled();
  if (['expires-during-compare', 'exhausted-during-compare', 'claim-lost'].includes(mode)) expect(claim).toHaveBeenCalledWith(expect.objectContaining({ _id: otp._id, userId: id, userModel: 'Patient', purpose: 'login', otp: otp.otp, used: false, expiresAt: { $gt: expect.any(Date) }, failedAttempts: { $gte: 0, $lt: 5 } }), { $set: { used: true, failedAttempts: 0 } }, { returnDocument: 'after' });
  else { expect(compare).not.toHaveBeenCalled(); expect(claim).not.toHaveBeenCalled(); }
  expect(res.status).toHaveBeenCalledWith(mode === 'missing-bound-account' ? 404 : mode === 'invalid-counter' ? 500 : 400);
});
