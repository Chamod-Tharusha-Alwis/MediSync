'use strict';
const { ClinicalCommandError } = require('./clinicalErrors');
function createPasswordChangeService({ transact, SessionToken, TrustedDevice, EventModel }) {
  return async ({ user, UserModel, userModel, newHash, setup = false, proof = null }) => {
    if (!user?._id || !['Admin', 'Doctor', 'Patient', 'PharmacyStaff', 'Hospital'].includes(userModel) || typeof user.password !== 'string' || !/^\$2[aby]\$(?:1[0-9]|2[0-9]|3[01])\$[./A-Za-z0-9]{53}$/.test(newHash)) throw new ClinicalCommandError('PASSWORD_CHANGE_INVALID');
    return transact(async session => {
      if (proof) {
        const result = await proof.model.updateOne(proof.filter, { $set: proof.consumption }, { session });
        if (result.modifiedCount !== 1) throw new ClinicalCommandError('PASSWORD_PROOF_ALREADY_CONSUMED', 409);
      }
      const changed = await UserModel.findOneAndUpdate({ _id: user._id, password: user.password, ...(setup ? { mustChangePassword: true, isActive: true } : {}) },
        { $set: { password: newHash, ...(setup ? { mustChangePassword: false } : {}), ...(UserModel.schema?.path('passwordChangedAt') ? { passwordChangedAt: new Date() } : {}) }, ...(setup ? { $unset: { tempPassword: 1 } } : {}) }, { session });
      if (!changed) throw new ClinicalCommandError('PASSWORD_CHANGE_CONFLICT', 409);
      await SessionToken.updateMany({ userId: user._id, userModel, isValid: true }, { $set: { isValid: false, logoutAt: new Date() } }, { session });
      await TrustedDevice.updateMany({ userId: user._id, userModel }, { $set: { isTrusted: false } }, { session });
      await EventModel.create([{ userId: user._id, userModel, actorId: String(user._id), actorModel: userModel, action: setup ? 'PASSWORD_SETUP' : proof ? 'PASSWORD_RESET' : 'PASSWORD_CHANGE', timestamp: new Date() }], { session });
      return true;
    });
  };
}
function changePasswordAtomic(parameters) {
  return createPasswordChangeService({ transact: require('./dispensingService').runTransaction,
    SessionToken: require('../models/SessionToken'), TrustedDevice: require('../models/TrustedDevice'), EventModel: require('../models/AccountSecurityEvent') })(parameters);
}
module.exports = { createPasswordChangeService, changePasswordAtomic };
