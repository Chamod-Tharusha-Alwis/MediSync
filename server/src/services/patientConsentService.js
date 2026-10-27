'use strict';
const jwt = require('jsonwebtoken');
const { normalizeNic } = require('../security/nicBlindIndex');
async function verifyPatientConsent({ actor, nic, token, session = null, claim = false }, { secret = process.env.JWT_SECRET, OTPSession = require('../models/OTPSession'), now = Date.now } = {}) {
  if (!actor?.id || !['doctor', 'pharmacist', 'pharmacy_admin', 'assistant', 'hospital_admin'].includes(actor.role) || typeof secret !== 'string' || secret.length < 32 || typeof token !== 'string') throw new Error('PATIENT_CONSENT_REQUIRED');
  const identity = normalizeNic(nic);
  const claims = jwt.verify(token, secret, { algorithms: ['HS256'], clockTimestamp: Math.floor(now() / 1000) });
  if (claims.type !== 'patient-access' || claims.requesterId !== String(actor.id) || claims.requesterRole !== actor.role || normalizeNic(claims.nic) !== identity || !Number.isFinite(claims.exp) || claims.exp * 1000 <= now() || !/^[a-f0-9]{24}$/i.test(claims.sessionId)) throw new Error('PATIENT_CONSENT_DENIED');
  const filter = { _id: claims.sessionId, userModel: 'Patient', purpose: 'patient-access', used: true,
    'metadata.requesterId': String(actor.id), 'metadata.requesterRole': actor.role, 'metadata.accessNic': identity,
    'metadata.revoked': false, 'metadata.accessExpiresAt': { $gt: new Date(now()) } };
  let query = OTPSession.findOne(filter);
  if (session) query = query.session(session);
  const record = await query;
  if (!record || !/^[a-f0-9]{24}$/i.test(String(record.userId))) throw new Error('PATIENT_CONSENT_DENIED');
  // The read may have waited past expiry; never reuse its pre-await time fence.
  if (claims.exp * 1000 <= now()) throw new Error('PATIENT_CONSENT_DENIED');
  if (claim) {
    if (!session) throw new Error('CONSENT_TRANSACTION_REQUIRED');
    const updated = await OTPSession.updateOne({ ...filter, userId: record.userId, 'metadata.accessExpiresAt': { $gt: new Date(now()) } }, { $inc: { 'metadata.commitVersion': 1 } }, { session });
    if (updated.modifiedCount !== 1 || claims.exp * 1000 <= now()) throw new Error('PATIENT_CONSENT_DENIED');
  }
  return { patientId: String(record.userId), consentSessionId: claims.sessionId };
}
module.exports = { verifyPatientConsent };
