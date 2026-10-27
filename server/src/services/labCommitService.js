'use strict';
const crypto = require('crypto');
const { eventHash } = require('./clinicalCommandService');
async function saveLabChange({ record, actor, sessionId, action, consentExpiresAt }, injected = {}) {
  const { transact = require('./dispensingService').runTransaction, Hospital = require('../models/Hospital'), SessionToken = require('../models/SessionToken'),
    Patient = require('../models/Patient'), CommandModel = require('../models/ClinicalCommand'), LabTestModel = require('../models/LabTest'), now = Date.now } = injected;
  if (actor?.role !== 'hospital_admin' || String(record.hospitalId) !== String(actor.id) || !/^[a-f0-9]{24}$/i.test(String(sessionId)) || !['LAB_TEST_ORDERED', 'LAB_TEST_APPROVED', 'LAB_TEST_STATUS_CHANGED', 'LAB_REPORT_UPLOADED'].includes(action)) throw new Error('LAB_COMMIT_AUTHORIZATION_REQUIRED');
  const commandId = crypto.randomBytes(12).toString('hex'), timestamp = new Date();
  record.decryptFieldsSync?.();
  const values = record.toObject();
  const creating = record.isNew === true;
  if (creating && action !== 'LAB_TEST_ORDERED') throw new Error('LAB_CREATE_ACTION_INVALID');
  const requireConsent = () => {
    if ((creating || action === 'LAB_TEST_APPROVED') && (!Number.isFinite(new Date(consentExpiresAt).getTime()) || new Date(consentExpiresAt).getTime() <= now())) throw new Error('LAB_COMMIT_CONSENT_EXPIRED');
  };
  try { return await transact(async session => {
    requireConsent();
    const hospital = await Hospital.updateOne({ _id: actor.id, isActive: true, isVerified: true }, { $inc: { clinicalUseVersion: 1 } }, { session });
    const access = await SessionToken.updateOne({ _id: sessionId, userId: actor.id, userModel: 'Hospital', isValid: true, logoutAt: null,
      $or: [{ expiredAt: null }, { expiredAt: { $gt: new Date() } }] }, { $inc: { clinicalUseVersion: 1 } }, { session });
    if (hospital.modifiedCount !== 1 || access.modifiedCount !== 1) throw new Error('LAB_COMMIT_AUTHORIZATION_DENIED');
    // Fresh document per retry: aborted Mongoose saves must not carry dirty
    // encryption markers, isNew state or incremented versions into another attempt.
    const scope = action === 'LAB_TEST_APPROVED' ? { $or: [{ hospitalId: null }, { hospitalId: actor.id }] } : { hospitalId: actor.id };
    const pending = creating ? new LabTestModel(values) : await LabTestModel.findOne({ _id: record._id, __v: values.__v === undefined ? { $exists: false } : values.__v, $and: [record.$where || {}, scope] }).session(session);
    if (!pending) throw new Error('LAB_WRITE_CONFLICT');
    pending.set(values);
    if (!pending.patientId) {
      const matches = await Patient.find(require('../security/nicPersistence').nicFilter(pending.patientNic, { plainFields: ['nic'] })).limit(2).session(session);
      if (matches.length !== 1) throw new Error('LAB_PATIENT_IDENTITY_AMBIGUOUS');
      pending.patientId = matches[0]._id;
    }
    const patient = await Patient.findById(pending.patientId).session(session);
    patient?.decryptFieldsSync?.();
    if (!patient || patient.isActive === false || require('../security/nicBlindIndex').normalizeNic(patient.nic) !== require('../security/nicBlindIndex').normalizeNic(pending.patientNic)) throw new Error('LAB_PATIENT_IDENTITY_DENIED');
    await pending.save({ session });
    requireConsent();
    const event = { eventId: crypto.randomBytes(12).toString('hex'), actorId: String(actor.id), actorRole: actor.role, action,
      resourceType: 'LabTest', resourceId: String(record._id), eventAt: timestamp };
    await CommandModel.create([{ _id: commandId, actorId: actor.id, actorRole: actor.role, patientId: pending.patientId, kind: 'lab-change',
      requestHash: eventHash(event), result: { labTestIds: [String(record._id)] }, outbox: [{ ...event, eventHash: eventHash(event) }] }], { session });
    return { commandId, labTestId: String(record._id) };
  }); } catch (error) { error.commandId = commandId; throw error; }
}
module.exports = { saveLabChange };
