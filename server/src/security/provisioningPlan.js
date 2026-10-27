'use strict';
const crypto = require('crypto');
const COLLECTIONS = Object.freeze({ admin: 'admins', patient: 'patients', doctor: 'doctors', hospital_admin: 'hospitals', pharmacist: 'pharmacystaffs' });
function normalizeEmail(value) {
  if (typeof value !== 'string' || value.length > 254 || !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value.trim())) throw new Error('OPERATOR_EMAIL_INVALID');
  return value.trim().toLowerCase();
}
function planFiveRoles(records, { comparisonKey, existingEmailDigests = [] } = {}) {
  if (!Buffer.isBuffer(comparisonKey) || comparisonKey.length !== 32 || comparisonKey.every(v => v === 0)) throw new Error('PLAN_KEY_REQUIRED');
  if (!Array.isArray(records) || records.length !== 5) throw new Error('EXACT_FIVE_ROLES_REQUIRED');
  const roles = new Set(), identities = new Set();
  const operations = records.map(record => {
    if (!record || !Object.hasOwn(COLLECTIONS, record.role) || roles.has(record.role)) throw new Error('ROLE_SET_INVALID');
    roles.add(record.role);
    const emailDigest = crypto.createHmac('sha256', comparisonKey).update('provision-email-v1\0').update(normalizeEmail(record.email)).digest('hex');
    if (identities.has(emailDigest) || existingEmailDigests.includes(emailDigest)) throw new Error('DUPLICATE_IDENTITY_REVIEW_REQUIRED');
    identities.add(emailDigest);
    return { role: record.role, collection: COLLECTIONS[record.role], emailDigest,
      status: 'BLOCKED_PENDING_INVITATION_AND_VERIFICATION',
      professionalHold: ['doctor', 'hospital_admin', 'pharmacist'].includes(record.role),
      pharmacyLinkRequired: record.role === 'pharmacist',
      requiredBeforeActivation: ['email_ownership', 'password_setup', 'MFA_enrollment', 'schema_validation', 'duplicate_recheck', 'operator_approval'],
      createsSessionsBeforeAcceptance: false };
  });
  return { mode: 'DRY_RUN', existingInfrastructureOnly: true, writes: 0, deletes: 0, externalMessages: 0, operations };
}
function issueInvitation({ role, subjectId, now = Date.now(), ttlMs = 3600000 }) {
  if (!Object.hasOwn(COLLECTIONS, role) || !/^[a-f0-9]{24}$/.test(subjectId) || !Number.isFinite(now) || !Number.isInteger(ttlMs) || ttlMs < 60000 || ttlMs > 86400000) throw new Error('INVITATION_INVALID');
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, record: { role, subjectId, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(now + ttlMs), consumedAt: null } };
}
function verifyInvitation(token, record, { role, subjectId, now = Date.now() }) {
  if (!Object.hasOwn(COLLECTIONS, role) || !Number.isFinite(now) || typeof token !== 'string' || !/^[a-zA-Z0-9_-]{43}$/.test(token) || !record || record.role !== role || record.subjectId !== subjectId || record.consumedAt || !Number.isFinite(new Date(record.expiresAt).getTime()) || new Date(record.expiresAt).getTime() <= now || !/^[a-f0-9]{64}$/.test(record.tokenHash)) return false;
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(token).digest(), Buffer.from(record.tokenHash, 'hex'));
}
module.exports = { planFiveRoles, issueInvitation, verifyInvitation, normalizeEmail, COLLECTIONS };
