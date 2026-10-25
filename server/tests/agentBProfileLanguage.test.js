'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const mongoose = require('mongoose'), jwt = require('jsonwebtoken');
const { normalizePreferredLanguage, savedPreferredLanguage, preferredLanguageField, supportsLanguagePersistence, LanguagePreferenceError } = require('../src/security/preferredLanguage');
const { ROLE_MODELS } = require('../src/security/accountState');
const { createAccountLanguageService } = require('../src/services/accountLanguageService');
const { createAccountLanguageController } = require('../src/controllers/accountLanguageController');
const { createRecipientLanguageService, languageOptionsForRecord } = require('../src/services/recipientLanguageService');
const ownId = '000000000000000000000001', otherId = '000000000000000000000002';
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), set: jest.fn().mockReturnThis() });
const request = role => ({ user: { id: ownId, role }, session: { userId: ownId, userModel: ROLE_MODELS[role], isValid: true }, body: { preferredLanguage: 'si' }, params: {}, query: {} });
function repository(role = 'doctor', supports = true) {
  const row = { _id: ownId, role, email: 'synthetic@example.invalid', isActive: true, isVerified: true, fullName: 'Synthetic unchanged profile', preferredLanguage: 'en', allergies: ['synthetic'], updatedAt: 'original timestamp' };
  const schema = new mongoose.Schema(supports ? { preferredLanguage: preferredLanguageField() } : {});
  const state = { row, beforeUpdate: null };
  const chain = read => ({ select: jest.fn(() => ({ lean: async () => read() })) });
  const Model = { schema, findById: jest.fn(() => chain(() => state.row && { ...state.row })), findOneAndUpdate: jest.fn((filter, change, options) => chain(async () => {
    if (state.beforeUpdate) await state.beforeUpdate();
    const r = state.row;
    if (!r || r._id !== filter._id || (filter.role && r.role !== filter.role) || r.isActive === false || r.isDeleted === true || r.mustChangePassword === true || (filter.isVerified && r.isVerified !== true)) return null;
    Object.assign(r, change.$set);
    return { _id: r._id, preferredLanguage: r.preferredLanguage };
  })) };
  const models = { [ROLE_MODELS[role]]: Model };
  return { Model, models, state, service: createAccountLanguageService({ models }) };
}

test.each(['en', 'si', 'ta', ' EN ', 'SI', ' ta '])('normalizes supported language %p', value => expect(['en', 'si', 'ta']).toContain(normalizePreferredLanguage(value)));
test.each([undefined, null, '', 'fr', 'en-US', 'සිංහල', [], {}, 1, true, 'x'.repeat(17), 'en\u0000'])('rejects invalid write language %p and reads legacy value as English', value => {
  expect(() => normalizePreferredLanguage(value)).toThrow('INVALID_PREFERRED_LANGUAGE'); expect(savedPreferredLanguage(value)).toBe('en');
});
test.each(['Admin', 'Doctor', 'Hospital', 'PharmacyStaff', 'Patient'])('actual %s schema validates preference without connecting', name => {
  const Model = require('../src/models/' + name);
  expect(supportsLanguagePersistence(Model)).toBe(true);
  const doc = new Model(); expect(doc.preferredLanguage).toBe('en');
  doc.preferredLanguage = 'unsupported'; expect(doc.validateSync().errors.preferredLanguage).toBeDefined();
});
test('individually approved Patient language schema preserves identity and does not activate HMAC migration', () => {
  const Patient = require('../src/models/Patient');
  expect(supportsLanguagePersistence(Patient)).toBe(true);
  expect(Patient.schema.path('nic').options.required).toBe(true);
  expect(Patient.schema.path('patientNic_bi')).toBeDefined();
  expect(Patient.schema.path('patientNic_hmac')).toBeUndefined();
});
test.each(['en','si','ta'])('actual Patient schema supports a self-only %s service roundtrip across detached session instances', async language => {
  const {Model,service,state} = repository('patient');
  Model.schema=require('../src/models/Patient').schema;
  delete state.row.preferredLanguage;
  expect(await service.get(request('patient'))).toEqual({preferredLanguage:'en',persistenceAvailable:true});
  const req=request('patient');req.body.preferredLanguage=language;
  expect(await service.update(req)).toEqual({preferredLanguage:language,persistenceAvailable:true});
  expect(await service.get(request('patient'))).toEqual({preferredLanguage:language,persistenceAvailable:true});
  expect(Model.findOneAndUpdate.mock.calls[0][1]).toEqual({$set:{preferredLanguage:language}});
  expect(state.row.fullName).toBe('Synthetic unchanged profile');
});
test.each(Object.keys(ROLE_MODELS))('self language roundtrip uses only the exact %s model and ID', async role => {
  const { service, Model, state } = repository(role), req = request(role);
  delete state.row.preferredLanguage;
  expect(await service.get(req)).toEqual({ preferredLanguage: 'en', persistenceAvailable: true });
  expect(await service.update(req)).toEqual({ preferredLanguage: 'si', persistenceAvailable: true });
  expect(await service.get(req)).toEqual({ preferredLanguage: 'si', persistenceAvailable: true });
  const [filter, update, options] = Model.findOneAndUpdate.mock.calls[0];
  expect(filter._id).toBe(ownId); expect(update).toEqual({ $set: { preferredLanguage: 'si' } });
  expect(options).toEqual({ new: true, runValidators: true, upsert: false, timestamps: false });
  expect(state.row.fullName).toBe('Synthetic unchanged profile'); expect(state.row.updatedAt).toBe('original timestamp');
  expect(Model.findById.mock.calls.every(args => args[0] === ownId)).toBe(true);
});
test('Patient read defaults safely and update is blocked until the separately approved schema exists', async () => {
  const { service, Model, state } = repository('patient', false); delete state.row.preferredLanguage;
  expect(await service.get(request('patient'))).toEqual({ preferredLanguage: 'en', persistenceAvailable: false });
  await expect(service.update(request('patient'))).rejects.toMatchObject({ code: 'LANGUAGE_SCHEMA_APPROVAL_REQUIRED', status: 503 });
  expect(Model.findOneAndUpdate).not.toHaveBeenCalled(); expect(state.row.preferredLanguage).toBeUndefined();
});
test.each(['missing-user', 'unknown-role', 'missing-session', 'wrong-session-user', 'wrong-session-model', 'revoked-session', 'expired-session'])('denies %s before lookup or write', async mode => {
  const req = request('admin'), { service, Model } = repository('admin');
  if (mode === 'missing-user') delete req.user;
  if (mode === 'unknown-role') req.user.role = 'owner';
  if (mode === 'missing-session') delete req.session;
  if (mode === 'wrong-session-user') req.session.userId = otherId;
  if (mode === 'wrong-session-model') req.session.userModel = 'Doctor';
  if (mode === 'revoked-session') req.session.isValid = false;
  if (mode === 'expired-session') req.session.expiredAt = new Date(0);
  await expect(service.update(req)).rejects.toMatchObject({ status: 403 });
  expect(Model.findById).not.toHaveBeenCalled(); expect(Model.findOneAndUpdate).not.toHaveBeenCalled();
});
test.each(['role', 'isVerified', 'password', 'twoFactorEnabled', 'nic', 'hospitalId', 'accountId', 'userId', '__proto__'])('rejects mass assignment of %s', async field => {
  const req = request('doctor'), { service, Model } = repository();
  req.body = JSON.parse('{"preferredLanguage":"ta","' + field + '":"untrusted"}');
  await expect(service.update(req)).rejects.toMatchObject({ code: 'LANGUAGE_FIELDS_NOT_ALLOWED', status: 400 });
  expect(Model.findById).not.toHaveBeenCalled(); expect(Model.findOneAndUpdate).not.toHaveBeenCalled();
});
test.each(['query', 'params'])('even an admin cannot select another account through %s', async field => {
  const req = request('admin'), { service, Model } = repository('admin'); req[field] = { id: otherId };
  await expect(service.update(req)).rejects.toMatchObject({ code: 'LANGUAGE_SELF_ONLY', status: 400 });
  expect(Model.findOneAndUpdate).not.toHaveBeenCalled();
});
test.each(['wrong-id', 'wrong-role', 'inactive', 'unverified', 'password-hold'])('stored account %s cannot update preference', async mode => {
  const { service, Model, state } = repository();
  if (mode === 'wrong-id') state.row._id = otherId;
  if (mode === 'wrong-role') state.row.role = 'admin';
  if (mode === 'inactive') state.row.isActive = false;
  if (mode === 'unverified') state.row.isVerified = false;
  if (mode === 'password-hold') state.row.mustChangePassword = true;
  await expect(service.update(request('doctor'))).rejects.toMatchObject({ status: 403 });
  expect(Model.findOneAndUpdate).not.toHaveBeenCalled();
});
test('concurrent profile write survives and repeated preference writes do not change timestamps', async () => {
  const { service, state } = repository();
  state.beforeUpdate = async () => { state.row.fullName = 'Concurrent profile edit'; state.row.allergies.push('concurrent'); };
  await service.update(request('doctor'));
  state.beforeUpdate = null; await service.update(request('doctor'));
  expect(state.row).toMatchObject({ fullName: 'Concurrent profile edit', allergies: ['synthetic', 'concurrent'], preferredLanguage: 'si', updatedAt: 'original timestamp' });
});
test('account revocation or role change between read and update fails the atomic predicate', async () => {
  const { service, state } = repository(); state.beforeUpdate = async () => { state.row.isActive = false; };
  await expect(service.update(request('doctor'))).rejects.toMatchObject({ status: 403 }); expect(state.row.preferredLanguage).toBe('en');
});
test('HTTP controller returns no private profile fields and hides storage errors', async () => {
  const { service } = repository(), controller = createAccountLanguageController(service), res = response();
  await controller.get(request('doctor'), res);
  expect(res.json).toHaveBeenCalledWith({ data: { preferredLanguage: 'en', persistenceAvailable: true } });
  expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  const failed = createAccountLanguageController({ get: async () => { throw new Error('PRIVATE_DATABASE_DETAIL'); } }), denied = response();
  await failed.get(request('doctor'), denied); expect(denied.status).toHaveBeenCalledWith(503);
  expect(denied.json).toHaveBeenCalledWith({ error: 'LANGUAGE_PREFERENCE_UNAVAILABLE' });
});
test('actual auth routes register self-service GET/PATCH behind the canonical auth supplement', () => {
  const registrations = [], router = new Proxy({}, { get: (_, method) => (route, ...handlers) => registrations.push({ method, route, handlers }) });
  const module = { exports: {} }, languageController = { get() {}, update() {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/routes/authRoutes.js'), 'utf8'), { module, process: { env: { NODE_ENV: 'test' } }, require(name) {
    if (name === 'express') return { Router: () => router };
    if (name === 'express-rate-limit') return () => () => {};
    if (name === '../middleware/auth') return () => () => {};
    if (name === '../middleware/verifiedAuth') return roles => ({ canonicalSupplementRoles: roles });
    if (name === '../controllers/accountLanguageController') return languageController;
    if (name === '../controllers/authController') return {};
    if (name === '../controllers/organizationPasswordController') return { change() { throw new Error('ORG_PASSWORD_HANDLER_NOT_EXECUTED_BY_ROUTE_REGISTRATION'); } };
    if (name === '../middleware/trustedCookieOrigin') return () => {};
    throw new Error('UNREVIEWED_ROUTE_DEPENDENCY');
  } });
  for (const method of ['get', 'patch']) {
    const route = registrations.find(row => row.method === method && row.route === '/preferences/language');
    expect(route.handlers[0].canonicalSupplementRoles).toEqual(Object.keys(ROLE_MODELS));
    expect(route.handlers[1]).toBe(method === 'get' ? languageController.get : languageController.update);
  }
  const organization = registrations.find(row => row.method === 'post' && row.route === '/change-org-password');
  expect(organization.handlers[1].canonicalSupplementRoles).toEqual(['doctor']);
});

test('each email recipient gets only its saved language and own envelope', async () => {
  const rows = { [ownId]: { _id: ownId, email: 'one@example.invalid', preferredLanguage: 'si' }, [otherId]: { _id: otherId, email: 'two@example.invalid', preferredLanguage: 'ta' } };
  const Model = { findById: jest.fn(id => ({ select: () => ({ lean: async () => rows[id] }) })) };
  const resolver = createRecipientLanguageService({ models: { Patient: Model } }), send = jest.fn(async values => ({ accepted: true }));
  await resolver.emails([{ model: 'Patient', accountId: ownId }, { model: 'Patient', accountId: otherId }], send);
  expect(send.mock.calls.map(args => args[0])).toEqual([{ to: 'one@example.invalid', lang: 'si' }, { to: 'two@example.invalid', lang: 'ta' }]);
});
test.each(['missing-language', 'unsupported-language', 'missing-account', 'wrong-record', 'inactive', 'header-injection', 'unrelated-language', 'unrelated-address'])('recipient resolution safely handles %s', async mode => {
  const { Model, state } = repository('patient'), resolver = createRecipientLanguageService({ models: { Patient: Model } }), send = jest.fn();
  const recipient = { model: 'Patient', accountId: ownId };
  if (mode === 'missing-language') delete state.row.preferredLanguage;
  if (mode === 'unsupported-language') state.row.preferredLanguage = 'fr';
  if (mode === 'missing-account') state.row = null;
  if (mode === 'wrong-record') state.row._id = otherId;
  if (mode === 'inactive') state.row.isActive = false;
  if (mode === 'header-injection') state.row.email = 'one@example.invalid\r\nBcc: other@example.invalid';
  if (mode === 'unrelated-language') recipient.lang = 'ta';
  if (mode === 'unrelated-address') recipient.to = 'other@example.invalid';
  if (['missing-language', 'unsupported-language'].includes(mode)) {
    await resolver.email(recipient, send); expect(send).toHaveBeenCalledWith({ to: 'synthetic@example.invalid', lang: 'en' });
  } else { await expect(resolver.email(recipient, send)).rejects.toThrow('LANGUAGE_RECIPIENT_DENIED'); expect(send).not.toHaveBeenCalled(); }
});
test('PDF resolution cannot select a foreign subject even if a caller supplies another language', async () => {
  const { Model } = repository('patient'), resolver = createRecipientLanguageService({ models: { Patient: Model } });
  await expect(resolver.pdf({ model: 'Patient', accountId: otherId, authorizedSubjectId: ownId, lang: 'ta' })).rejects.toThrow('LANGUAGE_DOCUMENT_SUBJECT_DENIED');
  expect(Model.findById).not.toHaveBeenCalled();
  expect(await resolver.pdf({ model: 'Patient', accountId: ownId, authorizedSubjectId: ownId, lang: 'ta' })).toEqual({ lang: 'en' });
});
test('already-loaded server recipient uses saved preference and rejects hydrated model confusion', () => {
  expect(languageOptionsForRecord('Doctor', { _id: ownId, preferredLanguage: 'si' })).toEqual({ lang: 'si' });
  expect(() => languageOptionsForRecord('Doctor', { _id: ownId, constructor: { modelName: 'Admin' }, preferredLanguage: 'ta' })).toThrow('LANGUAGE_RECIPIENT_DENIED');
});

test.each(['bad-second-address', 'missing-second-account', 'foreign-language', 'duplicate', 'sparse', 'no-callback'])('recipient batch rejects %s before any delivery', async mode => {
  const rows = { [ownId]: { _id: ownId, email: 'one@example.invalid' }, [otherId]: { _id: otherId, email: 'two@example.invalid' } };
  const Model = { findById: jest.fn(id => ({ select: () => ({ lean: async () => rows[id] }) })) };
  const { emails } = createRecipientLanguageService({ models: { Patient: Model } }), send = jest.fn();
  const recipients = [{ model: 'Patient', accountId: ownId }, { model: 'Patient', accountId: otherId }];
  if (mode === 'bad-second-address') rows[otherId].email += '\r\nBcc: other@example.invalid';
  if (mode === 'missing-second-account') delete rows[otherId];
  if (mode === 'foreign-language') recipients[1].lang = 'ta';
  if (mode === 'duplicate') recipients[1] = recipients[0];
  if (mode === 'sparse') delete recipients[1];
  await expect(emails(recipients, mode === 'no-callback' ? null : send)).rejects.toThrow('LANGUAGE_RECIPIENT_DENIED');
  expect(send).not.toHaveBeenCalled();
  if (!['bad-second-address', 'missing-second-account'].includes(mode)) expect(Model.findById).not.toHaveBeenCalled();
});

test('destructured batch copies recipient identities before awaiting and propagates delivery failure without retry', async () => {
  const recipients = [{ model: 'Patient', accountId: ownId }, { model: 'Patient', accountId: otherId }];
  const Model = { findById: jest.fn(id => ({ select: () => ({ lean: async () => {
    recipients[1].accountId = ownId;
    return { _id: id, email: id === ownId ? 'one@example.invalid' : 'two@example.invalid', preferredLanguage: id === ownId ? 'si' : 'ta' };
  } }) })) };
  const { emails } = createRecipientLanguageService({ models: { Patient: Model } });
  const send = jest.fn(async value => { expect(Object.isFrozen(value)).toBe(true); if (value.lang === 'ta') throw new Error('synthetic delivery failure'); return 'accepted'; });
  await expect(emails(recipients, send)).rejects.toThrow('synthetic delivery failure');
  expect(Model.findById.mock.calls).toEqual([[ownId], [otherId]]);
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls.map(args => args[0].to)).toEqual(['one@example.invalid', 'two@example.invalid']);
});

test.each(['id', 'legacy-nic', 'missing', 'foreign-id', 'wrong-nic', 'invalid-id', 'inactive', 'deleted', 'no-email', 'header-injection'])('clinical recipient %s uses authoritative identity and never snapshot contact', async mode => {
  const record = { patientId: ownId, patientNic: '900000001V', patientEmail: 'stale@example.invalid' };
  const patient = { _id: ownId, nic: '900000001V', email: 'current@example.invalid', preferredLanguage: 'si' };
  if (mode === 'legacy-nic') delete record.patientId;
  if (mode === 'foreign-id') patient._id = otherId;
  if (mode === 'wrong-nic') patient.nic = '900000002V';
  if (mode === 'invalid-id') record.patientId = 'not-an-id';
  if (mode === 'inactive') patient.isActive = false;
  if (mode === 'deleted') patient.isDeleted = true;
  if (mode === 'no-email') delete patient.email;
  if (mode === 'header-injection') patient.email += '\r\nBcc: other@example.invalid';
  const PatientModel = { findById: jest.fn(async () => mode === 'missing' ? null : patient), findOne: jest.fn(async () => patient) };
  const resolve = require('../src/services/recipientLanguageService').clinicalPatientForRecord;
  if (['id', 'legacy-nic'].includes(mode)) {
    expect(await resolve(record, { PatientModel })).toBe(patient);
    expect(patient.email).not.toBe(record.patientEmail);
  } else await expect(resolve(record, { PatientModel })).rejects.toThrow('LANGUAGE_RECIPIENT_DENIED');
  if (mode === 'invalid-id') expect(PatientModel.findById).not.toHaveBeenCalled();
  if (mode !== 'legacy-nic') expect(PatientModel.findOne).not.toHaveBeenCalled();
});

test.each(['current', 'wrong-nic', 'inactive', 'synthetic'])('actual reminder callback %s binds the consultation to its current patient', async mode => {
  const consult = { _id: ownId, patientId: ownId, patientNic: '900000001V', followUpDate: '2026-10-22', doctorId: { fullName: 'Synthetic Doctor' } };
  const patient = { _id: ownId, nic: mode === 'wrong-nic' ? '900000002V' : consult.patientNic, email: 'current@example.invalid', fullName: 'Synthetic Patient', preferredLanguage: 'ta', isActive: mode !== 'inactive', isSynthetic: mode === 'synthetic' };
  const findById = jest.fn(async () => patient), findOne = jest.fn(), sendReminderEmail = jest.fn(async () => ({ providerAccepted: true }));
  const callbacks = new Map(), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/utils/cronJobs.js'), 'utf8'), { module, exports: module.exports, Date, Intl, console: { log() {}, warn() {}, error() {} }, process: { env: { MEDISYNC_BACKGROUND_JOBS_APPROVED: 'true', MEDISYNC_REMINDER_DISPATCH_APPROVED: 'true' } }, require(name) {
    if (name === 'node-cron') return { schedule: (expression, callback) => callbacks.set(expression, callback) };
    if (name === '../models/Patient') return { findById, findOne };
    if (name === '../models/Consultation') return { find: () => ({ populate: () => ({ lean: async () => [consult] }) }) };
    if (name === './emailService') return { sendReminderEmail };
    if (name === '../security/nicPersistence') return require('../src/security/nicPersistence');
    if (name === '../services/recipientLanguageService') return require('../src/services/recipientLanguageService');
    if (name === 'mongoose') return { connection: { db: {} } };
    if (name === '../services/reminderDispatchService') return { followUpWindow: require('../src/services/reminderDispatchService').followUpWindow, existingReminderStore: async () => ({}), createReminderDispatcher: () => async (_identity, send) => send({ allowFallback: false }) };
    if (name.startsWith('../models/')) return {};
    throw new Error('UNREVIEWED_CRON_DEPENDENCY');
  } });
  module.exports(); await callbacks.get('0 8 * * *')();
  expect(findById).toHaveBeenCalledWith(ownId); expect(findOne).not.toHaveBeenCalled();
  if (mode === 'current') expect(sendReminderEmail).toHaveBeenCalledWith(patient.email, patient.fullName, expect.any(String), 'Synthetic Doctor', { lang: 'ta', allowFallback: false });
  else expect(sendReminderEmail).not.toHaveBeenCalled();
});

test.each(['absent', 'foreign-patient', 'foreign-requester', 'expired', 'revoked', 'valid'])('actual OTC consent middleware rejects %s grants before the handler', async mode => {
  const secret = 'synthetic-only-language-task-signing-secret', now = Date.now();
  const actor = { id: ownId, role: 'pharmacist' }, nic = '900000001V';
  const claims = { type: 'patient-access', nic: mode === 'foreign-patient' ? '900000002V' : nic, requesterId: mode === 'foreign-requester' ? otherId : ownId, requesterRole: actor.role, sessionId: ownId };
  const token = mode === 'absent' ? undefined : jwt.sign(claims, secret, { expiresIn: mode === 'expired' ? '-1s' : '5m' });
  const findOne = jest.fn(async () => mode === 'revoked' ? null : { userId: otherId });
  const verify = require('../src/services/patientConsentService').verifyPatientConsent;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/middleware/patientConsent.js'), 'utf8'), { module, require(name) {
    if (name === '../services/patientConsentService') return { verifyPatientConsent: parameters => verify(parameters, { secret, now: () => now, OTPSession: { findOne } }) };
    throw new Error('UNREVIEWED_CONSENT_DEPENDENCY');
  } });
  const req = { user: actor, body: { patientNic: nic }, params: {}, headers: { 'x-patient-access': token } }, res = response(), next = jest.fn();
  await module.exports(req, res, next);
  if (mode === 'valid') { expect(next).toHaveBeenCalledTimes(1); expect(req.patientConsent.patientId).toBe(otherId); }
  else { expect(res.status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled(); }
  if (['absent', 'foreign-patient', 'foreign-requester', 'expired'].includes(mode)) expect(findOne).not.toHaveBeenCalled();
  if (mode === 'revoked' || mode === 'valid') expect(findOne.mock.calls[0][0]).toMatchObject({ purpose: 'patient-access', 'metadata.revoked': false, 'metadata.requesterId': ownId, 'metadata.accessNic': nic });
});
