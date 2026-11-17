const { nicFilter, writeNicFields } = require('../security/nicPersistence');
const { dispense, DispenseError } = require('../services/dispensingService');
const { recordClinicalEvent } = require('../services/clinicalAuditService');
const AuditLog = require('../models/AuditLog');
const Patient = require('../models/Patient');
const emailService = require('../utils/emailService');
const crypto = require('crypto');

// Dispense notification debounce map: at most 1 email per patient per dispensing event / order window (120 seconds)
const dispenseEmailDebounce = new Map();

function shouldSendDispenseEmail(patientId, windowMs = 120000) {
  const key = String(patientId);
  const now = Date.now();
  const lastSent = dispenseEmailDebounce.get(key);
  if (lastSent && (now - lastSent < windowMs)) {
    return false;
  }
  dispenseEmailDebounce.set(key, now);
  if (dispenseEmailDebounce.size > 200) {
    for (const [k, v] of dispenseEmailDebounce.entries()) {
      if (now - v > 300000) dispenseEmailDebounce.delete(k);
    }
  }
  return true;
}

const handler = otc => async (req, res) => {
  // B1: the same consent-protected POST /pharmacy/dispense records "not available at this pharmacy" for one
  // medicine (no new route: an existing test fixes the route inventory).
  if (!otc && req.body?.action === 'not_available') return exports.markNotAvailable(req, res);
  try {
    if (req.body?.safetyAcknowledgment !== undefined || (Array.isArray(req.body?.items) && req.body.items.length > 0)) {
      const { evaluateMedicineSafety } = require('../utils/medicineSafetyEngine');
      const medItems = req.body.items || [];
      const safetyResult = await evaluateMedicineSafety({
        medications: medItems.map(i => ({ drugName: i.drugName || i.name, dosage: i.dosage, durationDays: i.durationDays, frequency: i.frequency })),
        patientId: req.body.patientId,
        acknowledgment: req.body.safetyAcknowledgment,
        actorId: req.user?.id,
        actorRole: req.user?.role || 'pharmacist'
      });
      if (safetyResult.hasActionableWarnings && !safetyResult.canProceed) {
        return res.status(400).json({
          error: 'CLINICAL_ACKNOWLEDGMENT_REQUIRED',
          code: 'CLINICAL_ACKNOWLEDGMENT_REQUIRED',
          warnings: safetyResult.warnings,
          message: 'Clinical acknowledgment with justification reason is required for detected medicine safety warnings.'
        });
      }
    }
    const {receipt,replay} = await dispense({user:req.user,body:req.body,otc,prescriptionRef:req.params?.id,
      idempotencyKey:req.headers['idempotency-key'], skipAuditProjection:true,
      authorization:{ consentToken: req.headers['x-patient-access'] || req.headers['x-patient-access-token'], sessionId: req.session?._id }});
    // Capped audit collections cannot participate in the dispensing transaction.
    // The receipt's durable audit event is authoritative; this is an extra projection.
    if (!replay) {
      await recordClinicalEvent({
        actorId: receipt.audit?.actorId || String(req.user.id),
        actorRole: req.user.role || 'pharmacist',
        action: receipt.audit?.action || (otc ? 'OTC_PRESCRIPTION_DISPENSED' : 'PRESCRIPTION_DISPENSED'),
        resourceType: 'Dispensing',
        resourceId: String(receipt._id),
        patientNic: receipt.patientNic,
        correlationId: req.headers['idempotency-key'] || receipt.requestHash || receipt.receiptNumber,
        details: { receiptNumber: receipt.receiptNumber }
      }).catch((err) => {
        console.error('[DispensingController] Audit projection warning:');
      });
      if (process.env.NODE_ENV === 'production' && process.env.MEDISYNC_TEST_MODE !== 'true' && !otc) {
        // B3: one medication update email per dispense action (pharmacy and pharmacist names, never ids).
        require('../services/medicationUpdateEmail').notifyMedicationUpdate({ prescriptionId: receipt.prescriptionId, pharmacyId: receipt.pharmacyId,
          pharmacistName: receipt.pharmacistName, pharmacyName: receipt.pharmacyName }).catch(() => {});
      } else if (process.env.NODE_ENV === 'production' && process.env.MEDISYNC_TEST_MODE !== 'true') {
        const nicHash = crypto.createHash('sha256').update(receipt.patientNic).digest('hex');
        Patient.findOne(nicFilter(receipt.patientNic, { plainFields: ['nic'] })).then(patient => {
          if (patient?.email && (!receipt.patientId || String(receipt.patientId) === String(patient._id))) {
            if (!shouldSendDispenseEmail(patient._id)) {
              console.log('[DISPENSE EMAIL] Throttled duplicate dispense email.');
              return;
            }
            return require('../services/recipientLanguageService').email({ model: 'Patient', accountId: String(patient._id) }, ({ to, lang }) => emailService.sendDispenseNotificationEmail(to,patient.fullName,receipt.pharmacyName || 'MediSync Pharmacy',
              receipt.pharmacistName || 'Pharmacist',receipt.items.map(i=>`${i.drugName} (Qty: ${i.quantityDispensed} ${i.unit})`).join(', '),receipt.dispensedAt || receipt.createdAt || new Date(), { lang }));
          }
        }).catch(()=>{});
      }
    }
    return res.status(replay?200:201).json({message:'Dispensed successfully',replayed:replay,
      data:{receiptNumber:receipt.receiptNumber,prescriptionId:receipt.prescriptionId,medicationCount:receipt.items.length}});
  } catch (e) {
    const known = e instanceof DispenseError || e instanceof require('../services/clinicalErrors').ClinicalCommandError;
    return res.status(known?e.status:503).json({error:known?e.message:'Dispensing could not be completed safely.',
      code:known?e.code:'TRANSACTION_FAILED'});
  }
};
exports.dispense = handler(false);

// B1: mark one medicine "not available at this pharmacy". It stays pending for other pharmacies.
exports.markNotAvailable = async (req, res) => {
  const { markNotAvailable, ItemError } = require('../services/pharmacyItemService');
  try {
    const out = await markNotAvailable({ user: req.user, prescriptionRef: req.params?.id || req.body?.prescriptionId, patientNic: req.body?.patientNic, reason: req.body?.reason, note: req.body?.note });
    if (out.changed) {
      recordClinicalEvent({ actorId: String(req.user.id), actorRole: req.user.role, action: 'PRESCRIPTION_ITEM_NOT_AVAILABLE', resourceType: 'Prescription',
        resourceId: String(out.prescription._id), patientNic: req.body.patientNic, correlationId: String(out.prescription._id), details: { reason: out.mark.reason } }).catch(() => {});
      if (process.env.NODE_ENV === 'production' && process.env.MEDISYNC_TEST_MODE !== 'true') {
        require('../services/medicationUpdateEmail').notifyMedicationUpdate({ prescriptionId: out.prescription._id, pharmacyId: out.pharmacy._id,
          pharmacistName: out.staff.fullName, pharmacyName: out.pharmacy.name }).catch(() => {});
      }
    }
    return res.status(200).json({ message: out.changed ? 'Marked not available at this pharmacy' : 'Already marked at this pharmacy', status: 'pending',
      data: { prescriptionId: String(out.prescription._id), reason: out.mark.reason, pharmacyName: out.pharmacy.name } });
  } catch (e) {
    const known = e instanceof ItemError;
    return res.status(known ? e.status : 500).json({ error: known ? e.message : 'Could not record this right now.', code: known ? e.code : 'NOT_AVAILABLE_FAILED' });
  }
};
exports.dispenseOTC = handler(true);
exports.shouldSendDispenseEmail = shouldSendDispenseEmail;
exports._dispenseEmailDebounce = dispenseEmailDebounce;
