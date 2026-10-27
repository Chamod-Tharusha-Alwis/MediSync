'use strict';
const { verifyPatientConsent } = require('./patientConsentService');
const { ClinicalCommandError } = require('./clinicalErrors');
async function claimPharmacyAuthorization({ user, nic, authorization, session }, injected = {}) {
  const { verify = verifyPatientConsent, SessionToken = require('../models/SessionToken'), TrustedDevice = require('../models/TrustedDevice'), now = Date.now } = injected;
  if (!/^[a-f0-9]{24}$/i.test(String(authorization?.sessionId))) throw new ClinicalCommandError('PHARMACY_SESSION_REQUIRED', 403);
  const consent = await verify({ actor: user, nic, token: authorization.consentToken, session, claim: true });
  const access = await SessionToken.findOne({ _id: authorization.sessionId, userId: user.id, userModel: 'PharmacyStaff', isValid: true, logoutAt: null }).session(session);
  if (!access || access.isValid !== true || String(access.userId) !== String(user.id) || access.userModel !== 'PharmacyStaff' || access.logoutAt || (access.expiredAt && (!Number.isFinite(new Date(access.expiredAt).getTime()) || new Date(access.expiredAt).getTime() <= now()))) throw new ClinicalCommandError('PHARMACY_SESSION_DENIED', 403);
  if (access.deviceFingerprint) {
    const result = await TrustedDevice.updateOne({ userId: user.id, userModel: 'PharmacyStaff', deviceFingerprint: access.deviceFingerprint, isRevoked: false }, { $inc: { clinicalUseVersion: 1 } }, { session });
    if (result.modifiedCount !== 1) throw new ClinicalCommandError('PHARMACY_DEVICE_DENIED', 403);
  }
  const changed = await SessionToken.updateOne({ _id: access._id, userId: user.id, userModel: 'PharmacyStaff', isValid: true, logoutAt: null,
    $or: [{ expiredAt: null }, { expiredAt: { $gt: new Date(now()) } }] }, { $inc: { clinicalUseVersion: 1 } }, { session });
  if (changed.modifiedCount !== 1) throw new ClinicalCommandError('PHARMACY_SESSION_DENIED', 403);
  if (access.expiredAt != null && new Date(access.expiredAt).getTime() <= now()) throw new ClinicalCommandError('PHARMACY_SESSION_DENIED', 403);
  return consent;
}
module.exports = { claimPharmacyAuthorization };
