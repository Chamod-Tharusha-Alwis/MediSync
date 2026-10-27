'use strict';
const jwt = require('jsonwebtoken');
const { normalizeNic } = require('../security/nicBlindIndex');
const { assertAccountState } = require('../security/accountState');
const { ClinicalCommandError } = require('./clinicalErrors');
const denied = code => new ClinicalCommandError(code, 403);
async function claimClinicalAuthorization({ user, request, context, session }, injected = {}) {
  const { Doctor = require('../models/Doctor'), Patient = require('../models/Patient'), OTPSession = require('../models/OTPSession'), SessionToken = require('../models/SessionToken'), BanRecord = require('../models/BanRecord'), TrustedDevice = require('../models/TrustedDevice'), secret = process.env.JWT_SECRET, now = Date.now } = injected;
  if (typeof secret !== 'string' || secret.length < 32 || !context?.consentToken || !/^[a-f0-9]{24}$/i.test(String(context.patientId)) || !/^[a-f0-9]{24}$/i.test(String(context.sessionId))) throw denied('CLINICAL_AUTHORIZATION_REQUIRED');
  const nic = normalizeNic(request.patientNic);
  let claims; try { claims = jwt.verify(context.consentToken, secret, { algorithms: ['HS256'], clockTimestamp: Math.floor(now() / 1000) }); } catch (_) { throw denied('CLINICAL_CONSENT_DENIED'); }
  if (claims.type !== 'patient-access' || claims.requesterRole !== 'doctor' || claims.requesterId !== String(user.id) || normalizeNic(claims.nic) !== nic || !Number.isFinite(claims.exp) || claims.exp * 1000 <= now() || !/^[a-f0-9]{24}$/i.test(claims.sessionId)) throw denied('CLINICAL_CONSENT_DENIED');
  const doctor = await Doctor.findById(user.id).session(session);
  try { assertAccountState(user, doctor); } catch (_) { throw denied('CLINICAL_ACTOR_DENIED'); }
  const hospitalId = request.sessionHospitalId || request.hospitalId;
  if ((request.loginType === 'hospital' && !hospitalId) || (hospitalId && !doctor.orgLogins?.some(org => String(org.hospitalId) === String(hospitalId) && org.isActive === true && org.mustChangePassword !== true))) throw denied('CLINICAL_WORKSPACE_DENIED');
  const patient = await Patient.findById(context.patientId).session(session);
  if (!patient || normalizeNic(patient.nic) !== nic || patient.isActive === false) throw denied('CLINICAL_PATIENT_DENIED');
  if (await BanRecord.findOne({ targetId: user.id, isActive: true, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date(now()) } }] }).session(session) !== null) throw denied('CLINICAL_ACTOR_DENIED');
  const access = await SessionToken.findOne({ _id: context.sessionId, userId: user.id, userModel: 'Doctor', isValid: true }).session(session);
  if (!access || access.isValid !== true || String(access.userId) !== String(user.id) || access.userModel !== 'Doctor' || access.logoutAt || (access.expiredAt && (!Number.isFinite(new Date(access.expiredAt).getTime()) || new Date(access.expiredAt).getTime() <= now()))) throw denied('CLINICAL_SESSION_DENIED');
  const requireFreshTime = () => {
    if (claims.exp * 1000 <= now()) throw denied('CLINICAL_CONSENT_DENIED');
    if (access.expiredAt != null && new Date(access.expiredAt).getTime() <= now()) throw denied('CLINICAL_SESSION_DENIED');
  };
  if (access.deviceFingerprint) {
    const device = await TrustedDevice.findOne({ userId: user.id, deviceFingerprint: access.deviceFingerprint }).session(session);
    if (!device || device.userModel !== 'Doctor' || device.isRevoked !== false) throw denied('CLINICAL_DEVICE_DENIED');
    const deviceClaim = await TrustedDevice.updateOne({ _id: device._id, userId: user.id, userModel: 'Doctor', deviceFingerprint: access.deviceFingerprint, isRevoked: false }, { $inc: { clinicalUseVersion: 1 } }, { session });
    if (deviceClaim.modifiedCount !== 1) throw denied('CLINICAL_DEVICE_DENIED');
  }
  requireFreshTime();
  const consent = await OTPSession.updateOne({ _id: claims.sessionId, userId: patient._id, userModel: 'Patient', purpose: 'patient-access', used: true,
    'metadata.requesterId': String(user.id), 'metadata.requesterRole': 'doctor', 'metadata.accessNic': nic,
    'metadata.revoked': false, 'metadata.accessExpiresAt': { $gt: new Date(now()) } }, { $inc: { 'metadata.commitVersion': 1 } }, { session });
  const actor = await Doctor.updateOne({ _id: user.id, role: 'doctor', isActive: true, isVerified: true, isDeleted: { $ne: true }, mustChangePassword: { $ne: true } }, { $inc: { clinicalUseVersion: 1 } }, { session });
  const accessClaim = await SessionToken.updateOne({ _id: context.sessionId, userId: user.id, userModel: 'Doctor', isValid: true, logoutAt: null,
    $or: [{ expiredAt: null }, { expiredAt: { $gt: new Date(now()) } }] }, { $inc: { clinicalUseVersion: 1 } }, { session });
  if (consent.modifiedCount !== 1 || actor.modifiedCount !== 1 || accessClaim.modifiedCount !== 1) throw denied('CLINICAL_COMMIT_AUTHORIZATION_DENIED');
  requireFreshTime();
  return patient;
}
module.exports = { claimClinicalAuthorization };
