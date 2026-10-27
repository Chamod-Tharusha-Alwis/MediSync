'use strict';
const { ROLE_MODELS, assertAccountState } = require('../security/accountState');
const { LanguagePreferenceError, normalizePreferredLanguage, savedPreferredLanguage, supportsLanguagePersistence } = require('../security/preferredLanguage');
const modelLoaders = Object.freeze({ Admin: () => require('../models/Admin'), Patient: () => require('../models/Patient'), Doctor: () => require('../models/Doctor'), Hospital: () => require('../models/Hospital'), PharmacyStaff: () => require('../models/PharmacyStaff') });
const objectId = value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
function ownIdentity(req) {
  if (!req.user || !objectId(req.user.id)) throw new LanguagePreferenceError('LANGUAGE_ACCOUNT_DENIED', 403);
  const model = Object.hasOwn(ROLE_MODELS, req.user.role) && ROLE_MODELS[req.user.role];
  const session = req.session;
  if (!model || !session || session.userModel !== model || String(session.userId) !== req.user.id || session.isValid !== true || session.logoutAt || (session.expiredAt && (!Number.isFinite(new Date(session.expiredAt).getTime()) || new Date(session.expiredAt) <= new Date()))) throw new LanguagePreferenceError('LANGUAGE_ACCOUNT_DENIED', 403);
  if (Object.keys(req.query || {}).length || Object.keys(req.params || {}).length) throw new LanguagePreferenceError('LANGUAGE_SELF_ONLY', 400);
  return { id: req.user.id, role: req.user.role, model };
}
function createAccountLanguageService({ models = null } = {}) {
  const modelFor = name => models ? models[name] : modelLoaders[name]();
  async function account(req) {
    const identity = ownIdentity(req), Model = modelFor(identity.model);
    const row = await Model.findById(identity.id).select('_id role isActive isDeleted isVerified mustChangePassword preferredLanguage').lean();
    try { assertAccountState(identity, row); } catch (_) { throw new LanguagePreferenceError('LANGUAGE_ACCOUNT_DENIED', 403); }
    return { identity, Model, row };
  }
  const dto = (Model, row) => ({ preferredLanguage: savedPreferredLanguage(row.preferredLanguage), persistenceAvailable: supportsLanguagePersistence(Model) });
  return {
    async get(req) { const { Model, row } = await account(req); return dto(Model, row); },
    async update(req) {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'preferredLanguage')) throw new LanguagePreferenceError('LANGUAGE_FIELDS_NOT_ALLOWED', 400);
      const language = normalizePreferredLanguage(body.preferredLanguage);
      const { identity, Model } = await account(req);
      if (!supportsLanguagePersistence(Model)) throw new LanguagePreferenceError('LANGUAGE_SCHEMA_APPROVAL_REQUIRED', 503);
      const filter = { _id: identity.id, isActive: { $ne: false }, isDeleted: { $ne: true }, mustChangePassword: { $ne: true } };
      if (['Admin', 'Doctor', 'PharmacyStaff'].includes(identity.model)) Object.assign(filter, { role: identity.role, isActive: true });
      if (['Doctor', 'Hospital', 'PharmacyStaff'].includes(identity.model)) Object.assign(filter, { isVerified: true, isActive: true });
      // A field-only atomic update preserves concurrent clinical/profile writes.
      // No upsert, replacement, full-document save or timestamp churn on retries.
      const updated = await Model.findOneAndUpdate(filter, { $set: { preferredLanguage: language } }, { new: true, runValidators: true, upsert: false, timestamps: false }).select('_id preferredLanguage').lean();
      if (!updated || String(updated._id) !== identity.id || updated.preferredLanguage !== language) throw new LanguagePreferenceError('LANGUAGE_ACCOUNT_DENIED', 403);
      return dto(Model, updated);
    }
  };
}
module.exports = { createAccountLanguageService };
