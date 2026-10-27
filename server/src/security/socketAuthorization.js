'use strict';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { ROLE_MODELS, assertAccountState, readAccount } = require('./accountState');
function productionDependencies() {
  return {
    secret: process.env.JWT_SECRET,
    getSession: hash => require('../models/SessionToken').findOne({ tokenHash: hash }).lean(),
    getAccount: readAccount,
    getBan: id => require('../models/BanRecord').findOne({ targetId: id, isActive: true, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }).lean(),
    getDevice: (id, fingerprint) => require('../models/TrustedDevice').findOne({ userId: id, deviceFingerprint: fingerprint }).lean()
  };
}
function createSocketVerifier({ secret, getSession, getAccount, getBan, getDevice, now = Date.now }) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32 || [getSession, getAccount, getBan, getDevice].some(fn => typeof fn !== 'function')) throw new Error('SOCKET_CONFIG_INVALID');
  return async token => {
    try {
      if (typeof token !== 'string' || token.length > 8192) throw new Error();
      const claims = jwt.verify(token, secret, { algorithms: ['HS256'], clockTimestamp: Math.floor(now() / 1000) });
      if (!claims || typeof claims.id !== 'string' || !/^[a-f0-9]{24}$/i.test(claims.id) || !Object.hasOwn(ROLE_MODELS, claims.role) || !Number.isFinite(claims.exp) || claims.exp * 1000 <= now()) throw new Error();
      const identity = { id: claims.id, role: claims.role, expiresAt: claims.exp * 1000 };
      const session = await getSession(crypto.createHash('sha256').update(token).digest('hex'));
      if (!session || session.isValid !== true || session.logoutAt || String(session.userId) !== claims.id || session.userModel !== ROLE_MODELS[claims.role]) throw new Error();
      if (session.expiredAt != null && (!Number.isFinite(new Date(session.expiredAt).getTime()) || new Date(session.expiredAt).getTime() <= now())) throw new Error();
      assertAccountState(identity, await getAccount(identity));
      if (await getBan(identity.id) !== null) throw new Error();
      if (session.deviceFingerprint) {
        const device = await getDevice(identity.id, session.deviceFingerprint);
        if (device === undefined || (device !== null && (device.isRevoked !== false || String(device.userId) !== identity.id || device.userModel !== session.userModel || device.deviceFingerprint !== session.deviceFingerprint))) throw new Error();
      }
      // Repository work may outlive the JWT or session even when it began valid.
      if (identity.expiresAt <= now() || (session.expiredAt != null && new Date(session.expiredAt).getTime() <= now())) throw new Error();
      return identity;
    } catch (_) { throw new Error('SOCKET_AUTH_DENIED'); }
  };
}
function installSocketAuthorization(io, dependencies = productionDependencies()) {
  const verify = createSocketVerifier(dependencies);
  const admitted = new WeakMap(), active = new Map();
  io.userSocketMap = new Map();
  io.use(async (socket, next) => {
    try {
      // URL/query tokens leak through access logs and are deliberately unsupported.
      if (socket.handshake.query?.token != null) throw new Error();
      const token = socket.handshake.auth?.token;
      const identity = await verify(token);
      admitted.set(socket, { token, identity });
      socket.data = { ...socket.data, userId: identity.id, role: identity.role };
      next();
    } catch (_) { const error = new Error('Unauthorized: SOCKET_AUTH_DENIED'); error.data = { code: 'SOCKET_AUTH_DENIED' }; next(error); }
  });
  io.on('connection', socket => {
    const entry = admitted.get(socket);
    if (!entry) return socket.disconnect(true);
    const { identity, token } = entry;
    active.set(socket.id, socket);
    io.userSocketMap.set(identity.id, socket.id);
    socket.join(`user:${identity.id}`);
    // Do not create global doctor/pharmacy clinical rooms. Only administrative notices use a role room.
    if (['admin', 'super_admin', 'superadmin'].includes(identity.role)) socket.join('role:admin');
    const check = async () => {
      try { await verify(token); return true; }
      catch (_) { socket.disconnect(true); return false; }
    };
    const timer = setInterval(check, 15000);
    timer.unref?.();
    const expiry = setTimeout(() => socket.disconnect(true), Math.min(identity.expiresAt - Date.now(), 2147483647));
    expiry.unref?.();
    socket.use(async (_packet, next) => { if (await check()) next(); else next(new Error('SOCKET_AUTH_DENIED')); });
    socket.on('disconnect', () => {
      clearInterval(timer); clearTimeout(expiry); active.delete(socket.id); admitted.delete(socket);
      if (io.userSocketMap.get(identity.id) === socket.id) {
        io.userSocketMap.delete(identity.id);
        const remaining = [...active.values()].find(s => admitted.get(s)?.identity.id === identity.id);
        if (remaining) io.userSocketMap.set(identity.id, remaining.id);
      }
    });
  });
  const deliver = async (predicate, event, payload) => {
    for (const socket of active.values()) {
      const entry = admitted.get(socket);
      if (!entry || !predicate(entry.identity)) continue;
      try {
        const current = await verify(entry.token);
        if (socket.connected !== false && predicate(current)) socket.emit(event, payload);
      } catch (_) { socket.disconnect(true); }
    }
  };
  io.emitToVerifiedUser = (id, event, payload) => deliver(identity => identity.id === String(id), event, payload);
  io.emitToVerifiedAdmins = (event, payload) => deliver(identity => ['admin', 'super_admin', 'superadmin'].includes(identity.role), event, payload);
  return { verify };
}
module.exports = { createSocketVerifier, installSocketAuthorization };
