'use strict';
const crypto = require('crypto');
const { normalizeNic } = require('../security/nicBlindIndex');
function createClinicalWriteAuthorization({ verify = (req, nic, hash) => require('../controllers/patientController').verifyDoctorPatientAuthorization(req, nic, hash),
  getDoctor = id => require('../models/Doctor').findById(id).select('orgLogins').lean(),
  getExisting = patientId => require('../services/currentMedicationSafety').currentMedicationNames(patientId),
  medicationCheck = names => require('../utils/ingredientResolver').analyzeMedicationSafety(names, [], require('../controllers/drugController').COMMON_DRUGS) } = {}) {
  return async (req, res, next) => {
    try {
      if (req.user?.role !== 'doctor') return res.status(403).json({ error: 'Clinical authorization required' });
      if (!req.headers['x-patient-access'] && !req.headers['x-patient-access-token']) return res.status(403).json({ error: 'Explicit patient consent required' });
      const nic = normalizeNic(req.body?.patientNic);
      const decision = await verify(req, nic, crypto.createHash('sha256').update(nic).digest('hex'));
      if (!decision?.authorized || decision.mode !== 'patient_otp_consent') return res.status(403).json({ error: 'Patient consent invalid or expired' });
      const hospitalId = req.body.sessionHospitalId || req.body.hospitalId;
      if (req.body.loginType === 'hospital' && !hospitalId) return res.status(403).json({ error: 'Hospital workspace verification required' });
      if (hospitalId) {
        if (!/^[a-f0-9]{24}$/i.test(String(hospitalId))) return res.status(403).json({ error: 'Hospital workspace verification required' });
        const doctor = await getDoctor(req.user.id);
        if (!doctor?.orgLogins?.some(org => String(org.hospitalId) === String(hospitalId) && org.isActive === true && org.mustChangePassword !== true)) return res.status(403).json({ error: 'Hospital workspace verification required' });
      }

      // Idempotency replay fast-path: if command was already committed, bypass medication duplicate check
      const idempKey = req.headers['idempotency-key'];
      if (typeof idempKey === 'string' && /^[A-Za-z0-9:_-]{16,128}$/.test(idempKey)) {
        const { digest } = require('../services/clinicalCommandService');
        const commandId = digest({ domain: 'clinical-command-v1', actorId: String(req.user.id), role: req.user.role, kind: 'consultation', idempotencyKey: idempKey }).slice(0, 24);
        const previous = await require('../models/ClinicalCommand').findById(commandId).select('_id requestHash').lean();
        if (previous) {
          req.clinicalAuthorization = { patientId: String(decision.patientId), consentSessionId: decision.consentSessionId };
          return next();
        }
      }

      const list = req.body.prescriptions === undefined ? (req.body.drugName ? [req.body] : []) : req.body.prescriptions;
      if (!Array.isArray(list)) return res.status(400).json({ error: 'Invalid medication list' });
      if (list.length) {
        const names = list.map(m => require('../utils/medicationName').canonicalMedicationName(m));
        const existing = await getExisting(decision.patientId);
        if (!Array.isArray(existing)) return res.status(409).json({ error: 'MEDICATION_RECONCILIATION_REQUIRED' });
        const allMeds = [...existing, ...names];
        const result = await medicationCheck(allMeds);
        const hasNoUnresolved = Array.isArray(result?.unresolvedIngredients) &&
          result.unresolvedIngredients.length === 0 &&
          Array.isArray(result?.unresolvedDrugs) &&
          result.unresolvedDrugs.length === 0;
        const isSingleResolvedSafe = (names.length === 1 && existing.length === 0) &&
          hasNoUnresolved &&
          result &&
          result.hasInteraction === false &&
          (!result.duplicateIngredients || result.duplicateIngredients.length === 0);
        const hasConflict = !result || (result.verificationIncomplete !== false && !isSingleResolvedSafe) || result.hasInteraction !== false || (result.duplicateIngredients && result.duplicateIngredients.length > 0);
        if (hasConflict) {
          const ack = req.body?.safetyAcknowledgment;
          const isAck = Boolean(ack && ack.acknowledged === true);
          if (!isAck) return res.status(409).json({ error: 'MEDICATION_REVIEW_REQUIRED' });
        }
      }
      req.clinicalAuthorization = { patientId: String(decision.patientId), consentSessionId: decision.consentSessionId };
      return next();
    } catch (error) { return res.status(['MEDICATION_RECONCILIATION_REQUIRED', 'MEDICATION_REVIEW_REQUIRED'].includes(error.message) ? 409 : 503).json({ error: ['MEDICATION_RECONCILIATION_REQUIRED', 'MEDICATION_REVIEW_REQUIRED'].includes(error.message) ? error.message : 'Clinical authorization unavailable' }); }
  };
}
module.exports = createClinicalWriteAuthorization();
module.exports.createClinicalWriteAuthorization = createClinicalWriteAuthorization;
