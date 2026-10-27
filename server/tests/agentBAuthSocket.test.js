'use strict';
const jwt = require('jsonwebtoken');
const { createSocketVerifier, installSocketAuthorization } = require('../src/security/socketAuthorization');
const { assertAccountState } = require('../src/security/accountState');
const { accountCheck } = require('../src/middleware/verifiedAuth');
const id = '000000000000000000000001', secret = 'synthetic-only-socket-signing-secret-32bytes';
function dependencies(role = 'doctor') {
  const model = { doctor: 'Doctor', patient: 'Patient', admin: 'Admin', hospital_admin: 'Hospital', pharmacist: 'PharmacyStaff' }[role];
  return { secret, getSession: jest.fn(async () => ({ userId: id, userModel: model, isValid: true })), getAccount: jest.fn(async () => ({ _id: id, role, isActive: true, isVerified: true })), getBan: jest.fn(async () => null), getDevice: jest.fn(async () => null) };
}
const tokenFor = (role = 'doctor', options = { expiresIn: '15m' }) => jwt.sign({ id, role }, secret, options);
test.each(['admin', 'doctor', 'patient', 'hospital_admin', 'pharmacist'])('authenticates verified %s with matching server session', async role => {
  expect(await createSocketVerifier(dependencies(role))(tokenFor(role))).toMatchObject({ id, role });
});
test.each(['invalid', 'expired', 'noexpiry', 'algorithm', 'unknownrole', 'wrongid'])('rejects JWT %s', async variant => {
  const tokens = { invalid: 'bad', expired: tokenFor('doctor', { expiresIn: '-1s' }), noexpiry: tokenFor('doctor', {}), algorithm: tokenFor('doctor', { algorithm: 'HS384', expiresIn: '15m' }), unknownrole: tokenFor('owner'), wrongid: jwt.sign({ id: 'not-an-object-id', role: 'doctor' }, secret, { expiresIn: '15m' }) };
  await expect(createSocketVerifier(dependencies())(tokens[variant])).rejects.toThrow('SOCKET_AUTH_DENIED');
});
test.each([{ isValid: false }, { logoutAt: new Date() }, { userId: '000000000000000000000002' }, { userModel: 'Patient' }, { expiredAt: 'bad' }, { expiredAt: new Date(0) }])('rejects stale/mismatched sessions %#', async patch => {
  const d = dependencies(), original = await d.getSession(); d.getSession.mockResolvedValue({ ...original, ...patch });
  await expect(createSocketVerifier(d)(tokenFor())).rejects.toThrow('SOCKET_AUTH_DENIED');
});
test.each([null, { _id: id, role: 'doctor', isActive: true }, { _id: id, role: 'doctor', isActive: false, isVerified: true }, { _id: id, role: 'doctor', isActive: true, isVerified: true, mustChangePassword: true }])('holds missing/unverified/inactive professionals %#', async account => {
  const d = dependencies(); d.getAccount.mockResolvedValue(account);
  await expect(createSocketVerifier(d)(tokenFor())).rejects.toThrow('SOCKET_AUTH_DENIED');
});
test.each([undefined, {}, { isActive: true }])('ban absence must be explicit null %#', async ban => {
  const d = dependencies(); d.getBan.mockResolvedValue(ban);
  await expect(createSocketVerifier(d)(tokenFor())).rejects.toThrow('SOCKET_AUTH_DENIED');
});
test('device revocation and repository outages fail closed without detail disclosure', async () => {
  const d = dependencies(); d.getSession.mockResolvedValue({ userId: id, userModel: 'Doctor', isValid: true, deviceFingerprint: 'synthetic' });
  d.getDevice.mockResolvedValue({ userId: id, isRevoked: true });
  await expect(createSocketVerifier(d)(tokenFor())).rejects.toThrow('SOCKET_AUTH_DENIED');
  d.getSession.mockRejectedValue(new Error('PRIVATE_PROVIDER_DETAIL'));
  await expect(createSocketVerifier(d)(tokenFor())).rejects.toThrow(/^SOCKET_AUTH_DENIED$/);
});
test('HTTP supplement requires matching session model and blocks unverified professional', async () => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }, next = jest.fn();
  const guard = accountCheck({ lookup: async () => ({ _id: id, role: 'doctor', isActive: true, isVerified: false }) });
  await guard({ user: { id, role: 'doctor' }, session: { userModel: 'Doctor' } }, res, next);
  expect(res.status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled();
  expect(() => assertAccountState({ id, role: 'hospital_admin' }, { _id: id })).toThrow();
});
function fakeIo() { return { use(fn) { this.handshake = fn; }, on(event, fn) { if (event === 'connection') this.connection = fn; } }; }
function fakeSocket(socketId, token, query = {}) {
  const handlers = {};
  return { id: socketId, connected: true, handshake: { auth: { token }, query }, data: {}, join: jest.fn(), emit: jest.fn(), use: jest.fn(), on(event, fn) { handlers[event] = fn; }, disconnect: jest.fn(function () { this.connected = false; handlers.disconnect?.(); }) };
}
async function admit(io, socket) { let failure; await io.handshake(socket, e => { failure = e; }); if (!failure) io.connection(socket); return failure; }
test('production installer rejects query tokens and limits room membership', async () => {
  const io = fakeIo(); installSocketAuthorization(io, dependencies());
  const query = fakeSocket('query', tokenFor(), { token: tokenFor() }); expect(await admit(io, query)).toBeInstanceOf(Error);
  const socket = fakeSocket('one', tokenFor()); expect(await admit(io, socket)).toBeUndefined();
  expect(socket.join.mock.calls).toEqual([[`user:${id}`]]); expect(socket.data).not.toHaveProperty('user'); socket.disconnect();
});
test('targeted delivery revalidates revocation and handles multiple same-user sockets', async () => {
  const io = fakeIo(), d = dependencies(); installSocketAuthorization(io, d);
  const a = fakeSocket('a', tokenFor()), b = fakeSocket('b', tokenFor()); await admit(io, a); await admit(io, b);
  await io.emitToVerifiedUser('000000000000000000000002', 'event', {}); expect(a.emit).not.toHaveBeenCalled();
  await io.emitToVerifiedUser(id, 'event', { safe: true }); expect(a.emit).toHaveBeenCalledTimes(1); expect(b.emit).toHaveBeenCalledTimes(1);
  b.disconnect(); expect(io.userSocketMap.get(id)).toBe('a');
  d.getSession.mockResolvedValue(null); await io.emitToVerifiedUser(id, 'event', {});
  expect(a.emit).toHaveBeenCalledTimes(1); expect(a.disconnect).toHaveBeenCalled(); expect(io.userSocketMap.size).toBe(0);
});
test('admin notices never reach patient sockets', async () => {
  const io = fakeIo(); installSocketAuthorization(io, dependencies('patient'));
  const socket = fakeSocket('patient', tokenFor('patient')); await admit(io, socket);
  await io.emitToVerifiedAdmins('notice', {}); expect(socket.emit).not.toHaveBeenCalled(); socket.disconnect();
});
test('expired connections disconnect and incoming packets recheck state', async () => {
  jest.useFakeTimers();
  try {
    const io = fakeIo(), d = dependencies(); installSocketAuthorization(io, d);
    const socket = fakeSocket('timed', tokenFor('doctor', { expiresIn: '2s' })); await admit(io, socket);
    jest.advanceTimersByTime(2100); expect(socket.disconnect).toHaveBeenCalled();
  } finally { jest.useRealTimers(); }
});

test.each(['jwt', 'session'])('socket denies %s expiry during asynchronous repository checks', async mode => {
  let clock = Date.now(); const start = clock, d = dependencies();
  d.now = () => clock;
  d.getSession.mockResolvedValue({ userId: id, userModel: 'Doctor', isValid: true, expiredAt: new Date(start + (mode === 'session' ? 1000 : 60000)) });
  d.getBan.mockImplementation(async () => { clock = start + 2500; return null; });
  await expect(createSocketVerifier(d)(tokenFor('doctor', { expiresIn: mode === 'jwt' ? '2s' : '1m' }))).rejects.toThrow('SOCKET_AUTH_DENIED');
});

test.each(['foreign-model', 'foreign-fingerprint', 'missing-revocation', 'undefined-result', 'valid', 'untrusted'])('socket validates persisted device identity: %s', async mode => {
  const d = dependencies(); d.getSession.mockResolvedValue({ userId: id, userModel: 'Doctor', isValid: true, deviceFingerprint: 'owned-device' });
  const device = { userId: id, userModel: 'Doctor', deviceFingerprint: 'owned-device', isRevoked: false };
  if (mode === 'foreign-model') device.userModel = 'Patient';
  if (mode === 'foreign-fingerprint') device.deviceFingerprint = 'other-device';
  if (mode === 'missing-revocation') delete device.isRevoked;
  d.getDevice.mockResolvedValue(mode === 'undefined-result' ? undefined : mode === 'untrusted' ? null : device);
  const result = createSocketVerifier(d)(tokenFor());
  if (['valid', 'untrusted'].includes(mode)) await expect(result).resolves.toMatchObject({ id });
  else await expect(result).rejects.toThrow('SOCKET_AUTH_DENIED');
});

test.each(['valid', 'foreign-user', 'wrong-model', 'logged-out', 'revoked', 'no-expiry', 'expiry-during-lookup', 'foreign-device', 'device-outage'])('HTTP supplement verifies ownership and late validity: %s', async mode => {
  let clock = Date.now();
  const user = { id, role: 'doctor', exp: Math.floor(clock / 1000) + 2 };
  const session = { userId: id, userModel: 'Doctor', isValid: true, deviceFingerprint: 'owned-device' };
  if (mode === 'foreign-user') session.userId = '000000000000000000000002';
  if (mode === 'wrong-model') session.userModel = 'Patient';
  if (mode === 'logged-out') session.logoutAt = new Date(clock);
  if (mode === 'revoked') session.isValid = false;
  if (mode === 'no-expiry') delete user.exp;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }, next = jest.fn();
  await accountCheck({ now: () => clock,
    lookup: async () => { if (mode === 'expiry-during-lookup') clock += 3000; return { _id: id, role: 'doctor', isActive: true, isVerified: true }; },
    lookupDevice: async () => { if (mode === 'device-outage') throw new Error('PRIVATE_STORE_DETAIL'); return { userId: id, userModel: mode === 'foreign-device' ? 'Patient' : 'Doctor', deviceFingerprint: 'owned-device', isRevoked: false }; }
  })({ user, session }, res, next);
  if (mode === 'valid') expect(next).toHaveBeenCalledTimes(1);
  else { expect(next).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(mode === 'device-outage' ? 503 : 403); expect(JSON.stringify(res.json.mock.calls)).not.toContain('PRIVATE_STORE_DETAIL'); }
});
test('cookie refresh rejects absent/foreign origin and permits exact configured origin', () => {
  const guard = require('../src/middleware/trustedCookieOrigin'), old = process.env.CLIENT_URL, oldNode = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  process.env.CLIENT_URL = 'https://synthetic.example.invalid';
  try {
    for (const origin of [undefined, 'https://attacker.invalid', 'https://synthetic.example.invalid.attacker.invalid', 'null']) {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }, next = jest.fn();
      guard({ cookies: { refreshToken: 'synthetic' }, headers: { origin } }, res, next);
      expect(res.status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled();
    }
    const next = jest.fn(); guard({ cookies: { refreshToken: 'synthetic' }, headers: { origin: process.env.CLIENT_URL } }, {}, next); expect(next).toHaveBeenCalled();
  } finally { process.env.NODE_ENV = oldNode; if (old === undefined) delete process.env.CLIENT_URL; else process.env.CLIENT_URL = old; }
});
test.each(['absent', 'expired', 'relationship', 'foreign-hospital', 'interaction', 'incomplete', 'authorized'])('clinical write guard: %s', async variant => {
  const { createClinicalWriteAuthorization } = require('../src/middleware/clinicalWriteAuthorization');
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }, next = jest.fn();
  const req = { user: { id, role: 'doctor' }, headers: variant === 'absent' ? {} : { 'x-patient-access': 'synthetic-proof' }, body: { patientNic: '900000001V', prescriptions: [{ drugName: 'SyntheticMedicine', durationDays: 1 }] } };
  if (variant === 'foreign-hospital') req.body.sessionHospitalId = id;
  const middleware = createClinicalWriteAuthorization({
    verify: async () => ({ authorized: variant !== 'expired', mode: variant === 'relationship' ? 'active_relationship' : 'patient_otp_consent', patientId: id }),
    getExisting: async () => [],
    getDoctor: async () => ({ orgLogins: [] }), medicationCheck: async () => ({ verificationIncomplete: variant === 'incomplete', hasInteraction: variant === 'interaction' })
  });
  await middleware(req, res, next);
  if (variant === 'authorized') expect(next).toHaveBeenCalled(); else expect(next).not.toHaveBeenCalled();
});
