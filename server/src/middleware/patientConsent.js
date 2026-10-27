'use strict';
module.exports = async (req, res, next) => {
  try {
    req.patientConsent = await require('../services/patientConsentService').verifyPatientConsent({
      actor: req.user, nic: req.params.nic || req.body.patientNic, token: req.headers['x-patient-access'] || req.headers['x-patient-access-token']
    });
    next();
  } catch (_) { return res.status(403).json({ error: 'Patient consent required' }); }
};
