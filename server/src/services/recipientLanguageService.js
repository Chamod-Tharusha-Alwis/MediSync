'use strict';
const { savedPreferredLanguage } = require('../security/preferredLanguage');
const loaders = Object.freeze({ Admin: () => require('../models/Admin'), Patient: () => require('../models/Patient'), Doctor: () => require('../models/Doctor'), Hospital: () => require('../models/Hospital'), PharmacyStaff: () => require('../models/PharmacyStaff') });
const validId = id => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);
function languageOptionsForRecord(model, account) {
  // For records already selected by an authorized server operation (including
  // OTP delivery to an institutional address). This only selects presentation;
  // recipient selection and clinical authorization stay with that operation.
  if (!Object.hasOwn(loaders, model) || !validId(String(account?._id)) || (account.constructor?.modelName && account.constructor.modelName !== model)) throw new Error('LANGUAGE_RECIPIENT_DENIED');
  return Object.freeze({ lang: savedPreferredLanguage(account.preferredLanguage) });
}
function createRecipientLanguageService({ models = null } = {}) {
  const descriptor = recipient => {
    if (!recipient || typeof recipient !== 'object' || Array.isArray(recipient) || Object.keys(recipient).length !== 2 || !Object.hasOwn(recipient, 'model') || !Object.hasOwn(recipient, 'accountId') || Object.keys(recipient).some(key => !['model', 'accountId'].includes(key)) || !Object.hasOwn(loaders, recipient.model) || !validId(recipient.accountId)) throw new Error('LANGUAGE_RECIPIENT_DENIED');
    // Copy before any await: callers cannot change a later recipient mid-batch.
    return { model: recipient.model, accountId: recipient.accountId.toLowerCase() };
  };
  async function resolve({ model, accountId }) {
    if (!Object.hasOwn(loaders, model) || !validId(accountId)) throw new Error('LANGUAGE_RECIPIENT_DENIED');
    const Model = models ? models[model] : loaders[model]();
    const account = await Model.findById(accountId).select('_id email preferredLanguage isActive isDeleted').lean();
    if (!account || String(account._id) !== accountId || account.isActive === false || account.isDeleted === true) throw new Error('LANGUAGE_RECIPIENT_DENIED');
    return { accountId, model, email: account.email, lang: savedPreferredLanguage(account.preferredLanguage) };
  }
  async function envelope(recipient) {
    const resolved = await resolve(recipient);
    if (typeof resolved.email !== 'string' || !/^[^\s@,;<>\r\n]+@[^\s@,;<>\r\n]+\.[^\s@,;<>\r\n]+$/.test(resolved.email)) throw new Error('LANGUAGE_RECIPIENT_DENIED');
    return Object.freeze({ to: resolved.email, lang: resolved.lang });
  }
  return {
    // Internal API only: recipient IDs must come from the already-authorized
    // server operation. This resolver grants no clinical access or new recipient.
    async email(recipient, renderAndSend) {
      if (typeof renderAndSend !== 'function') throw new Error('LANGUAGE_RECIPIENT_DENIED');
      return renderAndSend(await envelope(descriptor(recipient)));
    },
    async emails(recipients, renderAndSend) {
      if (!Array.isArray(recipients) || !recipients.length || recipients.length > 100 || typeof renderAndSend !== 'function') throw new Error('LANGUAGE_RECIPIENT_DENIED');
      const identities = Array.from(recipients, descriptor);
      if (new Set(identities.map(r => r.model + ':' + r.accountId)).size !== identities.length) throw new Error('LANGUAGE_RECIPIENT_DENIED');
      // Validate the entire batch before sending anything. Individual envelopes
      // prevent disclosure of other addresses. Delivery itself is not atomic;
      // a provider failure propagates without automatic retry or resending.
      const envelopes = [];
      for (const recipient of identities) envelopes.push(await envelope(recipient));
      const result = [];
      for (const value of envelopes) result.push(await renderAndSend(value));
      return result;
    },
    async pdf({ model, accountId, authorizedSubjectId }) {
      if (accountId !== authorizedSubjectId) throw new Error('LANGUAGE_DOCUMENT_SUBJECT_DENIED');
      const resolved = await resolve({ model, accountId });
      // No caller-supplied encryption, identifier or recipient options pass through.
      return Object.freeze({ lang: resolved.lang });
    }
  };
}
async function clinicalPatientForRecord(record, { PatientModel = loaders.Patient() } = {}) {
  // Only for an already-authorized server clinical record, never a route body.
  // Snapshot contact fields and token email are deliberately not delivery fallbacks.
  const { normalizeNic } = require('../security/nicBlindIndex');
  const { nicFilter } = require('../security/nicPersistence');
  const nic = normalizeNic(record?.patientNic);
  const id = record.patientId == null ? null : String(record.patientId);
  if (id !== null && !validId(id)) throw new Error('LANGUAGE_RECIPIENT_DENIED');
  const patient = id === null
    ? await PatientModel.findOne(nicFilter(nic, { plainFields: ['nic'] }))
    : await PatientModel.findById(id);
  patient?.decryptFieldsSync?.();
  if (!patient || !validId(String(patient._id)) || (id !== null && String(patient._id) !== id) || normalizeNic(patient.nic) !== nic || patient.isActive === false || patient.isDeleted === true || typeof patient.email !== 'string' || !/^[^\s@,;<>\r\n]+@[^\s@,;<>\r\n]+\.[^\s@,;<>\r\n]+$/.test(patient.email)) throw new Error('LANGUAGE_RECIPIENT_DENIED');
  return patient;
}
module.exports = { createRecipientLanguageService, languageOptionsForRecord, clinicalPatientForRecord, ...createRecipientLanguageService() };
