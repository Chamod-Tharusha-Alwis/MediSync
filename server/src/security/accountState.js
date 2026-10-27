'use strict';
const ROLE_MODELS = Object.freeze({ admin: 'Admin', super_admin: 'Admin', superadmin: 'Admin', patient: 'Patient', doctor: 'Doctor', hospital_admin: 'Hospital', pharmacist: 'PharmacyStaff', pharmacy_admin: 'PharmacyStaff', assistant: 'PharmacyStaff' });
const professional = new Set(['Doctor', 'Hospital', 'PharmacyStaff']);
function assertAccountState(identity, account, environment = process.env) {
  const model = identity && Object.hasOwn(ROLE_MODELS, identity.role) ? ROLE_MODELS[identity.role] : null;
  if (!model || !account || String(account._id) !== String(identity.id)) throw new Error('ACCOUNT_DENIED');
  if (environment.NODE_ENV === 'production' && (['isSynthetic','isDemoData','isDemoAccount'].some(key => account[key] === true) || account.datasetVersion === 'MEDISYNC_UNIV_DEMO_V2' || account.phase5xOwner || account.phase5xBrowserOwner)) throw new Error('ACCOUNT_DENIED');
  if (account.isActive === false || account.isDeleted === true || account.mustChangePassword === true) throw new Error('ACCOUNT_DENIED');
  if (model === 'Admin' || model === 'Doctor' || model === 'PharmacyStaff') {
    if (account.isActive !== true || account.role !== identity.role) throw new Error('ACCOUNT_DENIED');
  }
  if (professional.has(model) && (account.isVerified !== true || account.isActive !== true)) throw new Error('PROFESSIONAL_VERIFICATION_REQUIRED');
  return model;
}
async function readAccount(identity) {
  const model = identity && Object.hasOwn(ROLE_MODELS, identity.role) ? ROLE_MODELS[identity.role] : null;
  if (!model) throw new Error('ACCOUNT_DENIED');
  return require(`../models/${model}`).findById(identity.id).select('_id role isActive isDeleted isVerified mustChangePassword isSynthetic isDemoData isDemoAccount datasetVersion phase5xOwner phase5xBrowserOwner').lean();
}
function assertLoginAccount(account, model) {
  const role = account?.role || ({Doctor:'doctor',Patient:'patient',Hospital:'hospital_admin',Admin:'admin'})[model];
  if (ROLE_MODELS[role] !== model) throw new Error('ACCOUNT_DENIED');
  return assertAccountState({id:String(account?._id),role},account);
}
module.exports = { ROLE_MODELS, assertAccountState, assertLoginAccount, readAccount };
