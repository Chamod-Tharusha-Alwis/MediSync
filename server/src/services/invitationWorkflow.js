'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { issueInvitation, verifyInvitation, normalizeEmail, COLLECTIONS } = require('../security/provisioningPlan');
const { validatePasswordStrength, hashPassword } = require('../utils/passwordUtils');
const { writeNicFields } = require('../security/nicPersistence');
const MODELS = Object.freeze({ admin: 'Admin', doctor: 'Doctor', patient: 'Patient', hospital_admin: 'Hospital', pharmacist: 'PharmacyStaff' });
const PROFILE = { admin: ['fullName'], doctor: ['fullName', 'licenseNo', 'specialization'], patient: ['fullName', 'nic', 'dateOfBirth', 'gender', 'district'], hospital_admin: ['name', 'regNo', 'district'], pharmacist: ['fullName'] };

// No HTTP registration and no default live adapter. The operator dry-run CLI
// continues to call planFiveRoles only. These transactions require later admission.
function createInvitationWorkflow({ InvitationModel, UserModels, PharmacyModel, EventModel, comparisonKey, keyVersion, transact, authorizeOperator, now = Date.now, passwordHash = hashPassword, compareOtp = bcrypt.compare }) {
  if (!Buffer.isBuffer(comparisonKey) || comparisonKey.length !== 32 || comparisonKey.every(v => v === 0) || !Number.isInteger(keyVersion) || keyVersion < 1 || typeof transact !== 'function' || typeof authorizeOperator !== 'function') throw new Error('INVITATION_WORKFLOW_CONFIGURATION_INVALID');
  const key = Buffer.from(comparisonKey);
  const emailDigest = email => crypto.createHmac('sha256', key).update('provision-email-v1\0').update(normalizeEmail(email)).digest('hex');
  const assertNoAccount = async (email, session) => {
    for (const name of Object.values(MODELS)) if (await UserModels[name].findOne({ email }).session(session)) throw new Error('DUPLICATE_IDENTITY_REVIEW_REQUIRED');
  };
  return {
    async issue({ operator, role, email, pharmacyId }) {
      if (!Object.hasOwn(COLLECTIONS, role) || !/^[a-f0-9]{24}$/i.test(String(operator?.id)) || !['admin', 'super_admin'].includes(operator.role) || !await authorizeOperator(operator)) throw new Error('PROVISIONING_OPERATOR_DENIED');
      if (role === 'pharmacist' && !/^[a-f0-9]{24}$/i.test(String(pharmacyId))) throw new Error('PROVISIONING_PHARMACY_APPROVAL_REQUIRED');
      const normalized = normalizeEmail(email), subjectId = crypto.randomBytes(12).toString('hex');
      const invite = issueInvitation({ role, subjectId, now: now() }), otp = String(crypto.randomInt(100000, 1000000)), emailOtpHash = await passwordHashForOtp(otp);
      await transact(async session => {
        await assertNoAccount(normalized, session);
        if (role === 'pharmacist' && (!pharmacyId || !await PharmacyModel.findOne({ _id: pharmacyId, isActive: true }).session(session))) throw new Error('PROVISIONING_PHARMACY_APPROVAL_REQUIRED');
        await InvitationModel.create([{ ...invite.record, emailDigest: emailDigest(normalized), keyVersion, emailOtpHash,
          emailOtpExpiresAt: new Date(now() + 600000), failedAttempts: 0, ...(role === 'pharmacist' ? { pharmacyId } : {}) }], { session });
        await EventModel.create([{ userId: subjectId, userModel: MODELS[role], actorId: String(operator.id), actorModel: 'Admin', action: 'INVITATION_ISSUED', timestamp: new Date(now()) }], { session });
      });
      // Returned once for an approved private delivery adapter; never logged here.
      return { subjectId, token: invite.token, emailOtp: otp, externalMessages: 0 };
    },
    async accept({ role, subjectId, email, token, emailOtp, password, profile = {} }) {
      if (!Object.hasOwn(MODELS, role) || !/^[a-f0-9]{24}$/.test(subjectId) || typeof emailOtp !== 'string' || !/^[0-9]{6}$/.test(emailOtp) || !validatePasswordStrength(password).valid) throw new Error('INVITATION_ACTIVATION_INVALID');
      const normalized = normalizeEmail(email), digest = emailDigest(normalized);
      const filter = { subjectId, role, emailDigest: digest, keyVersion, consumedAt: null, expiresAt: { $gt: new Date(now()) }, failedAttempts: { $lt: 5 } };
      const record = await InvitationModel.findOne(filter);
      if (!record || record.keyVersion !== keyVersion || !/^[a-f0-9]{64}$/.test(record.emailDigest) || !crypto.timingSafeEqual(Buffer.from(record.emailDigest, 'hex'), Buffer.from(digest, 'hex')) || !Number.isInteger(record.failedAttempts) || record.failedAttempts < 0 || record.failedAttempts >= 5 || !verifyInvitation(token, record, { role, subjectId, now: now() }) || !Number.isFinite(new Date(record.emailOtpExpiresAt).getTime()) || new Date(record.emailOtpExpiresAt).getTime() <= now()) throw new Error('INVITATION_PROOF_DENIED');
      if (!await compareOtp(String(emailOtp || ''), record.emailOtpHash)) {
        await InvitationModel.updateOne({ _id: record._id, consumedAt: null, failedAttempts: { $lt: 5 } }, { $inc: { failedAttempts: 1 } });
        throw new Error('INVITATION_PROOF_DENIED');
      }
      const newHash = await passwordHash(password), professionalHold = ['doctor', 'hospital_admin', 'pharmacist'].includes(role);
      return transact(async session => {
        const claimTime = new Date(now());
        const claimed = await InvitationModel.updateOne({ ...filter, _id: record._id, expiresAt: { $gt: claimTime }, failedAttempts: { $gte: 0, $lt: 5 }, tokenHash: record.tokenHash, emailOtpHash: record.emailOtpHash, emailOtpExpiresAt: { $gt: claimTime } }, { $set: { consumedAt: claimTime } }, { session });
        if (claimed.modifiedCount !== 1) throw new Error('INVITATION_ALREADY_CONSUMED');
        await assertNoAccount(normalized, session);
        const attributes = Object.fromEntries(PROFILE[role].filter(field => profile[field] !== undefined).map(field => [field, profile[field]]));
        const account = new UserModels[MODELS[role]]({ ...attributes, _id: subjectId, email: normalized, password: newHash,
          ...(role === 'patient' ? writeNicFields(profile.nic) : {}), role, isActive: !professionalHold,
          ...(professionalHold ? { isVerified: false } : {}), twoFactorEnabled: true,
          ...(role === 'pharmacist' ? { pharmacyId: record.pharmacyId, mustChangePassword: false } : {}) });
        await account.save({ session });
        await EventModel.create([{ userId: subjectId, userModel: MODELS[role], actorId: subjectId, actorModel: MODELS[role], action: 'INVITATION_ACCEPTED_MFA_REQUIRED', timestamp: new Date(now()) }], { session });
        return { subjectId, role, professionalHold, mfaRequired: true, sessionsCreated: 0, trustedDevicesCreated: 0 };
      });
    }
  };
}
async function passwordHashForOtp(otp) { return bcrypt.hash(otp, 10); }
module.exports = { createInvitationWorkflow };
