'use strict';
// Supplement the immutable canonical auth middleware; do not replace its session/ban/RBAC checks.
const protect = require('./auth');
const { ROLE_MODELS, assertAccountState, readAccount } = require('../security/accountState');
function accountCheck({ lookup = readAccount, lookupDevice = (id, fingerprint) => require('../models/TrustedDevice').findOne({ userId: id, deviceFingerprint: fingerprint }).lean(), now = Date.now } = {}) {
  return async (req, res, next) => {
    try {
      const sessionValid = () => req.user && Object.hasOwn(ROLE_MODELS, req.user.role) && /^[a-f0-9]{24}$/i.test(req.user.id) && Number.isFinite(req.user.exp) && req.user.exp * 1000 > now() && req.session?.isValid === true && String(req.session.userId) === req.user.id && req.session.userModel === ROLE_MODELS[req.user.role] && !req.session.logoutAt && (req.session.expiredAt == null || (Number.isFinite(new Date(req.session.expiredAt).getTime()) && new Date(req.session.expiredAt).getTime() > now()));
      if (!sessionValid()) return res.status(403).json({ error: 'Account verification required' });
      const account = await lookup(req.user);
      assertAccountState(req.user, account);
      if (req.session.deviceFingerprint) {
        const device = await lookupDevice(req.user.id, req.session.deviceFingerprint);
        if (device === undefined || (device !== null && (device.isRevoked !== false || String(device.userId) !== req.user.id || device.userModel !== req.session.userModel || device.deviceFingerprint !== req.session.deviceFingerprint))) return res.status(403).json({ error: 'Device verification required' });
      }
      if (!sessionValid()) return res.status(403).json({ error: 'Account verification required' });
      return next();
    } catch (error) {
      const denied = ['ACCOUNT_DENIED', 'PROFESSIONAL_VERIFICATION_REQUIRED'].includes(error.message);
      return res.status(denied ? 403 : 503).json({ error: denied ? 'Account verification required' : 'Account verification unavailable' });
    }
  };
}
module.exports = roles => [protect(roles), accountCheck()];
module.exports.accountCheck = accountCheck;
