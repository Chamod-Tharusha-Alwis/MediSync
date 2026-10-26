const { nicFilter, writeNicFields } = require('../security/nicPersistence');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { ClinicalCommandError } = require('./clinicalErrors');
const { claimPharmacyAuthorization } = require('./pharmacyCommitGuard');
const { currentMedicationNames, assertMedicationResult } = require('./currentMedicationSafety');
const Pharmacy = require('../models/Pharmacy');
const PharmacyStaff = require('../models/PharmacyStaff');
const Prescription = require('../models/Prescription');
const Dispensing = require('../models/Dispensing');
const Patient = require('../models/Patient');
const { checkAllergyConflict, analyzeMedicationSafety } = require('../utils/ingredientResolver');

class DispenseError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const fail = (code, message, status) => { throw new DispenseError(code, message, status); };
const labelled = (e, label) => e?.hasErrorLabel?.(label) || e?.errorLabels?.includes(label);
const normalize = v => typeof v === 'string' ? v.trim().toLowerCase().replace(/\s+/g, ' ') : '';

// Bounded retries: a commit with an unknown outcome is retried on the SAME
// session/transaction, never by re-executing the callback. No fallback writes.
async function runTransaction(work, startSession = () => mongoose.startSession()) {
  let session;
  try { session = await startSession(); } catch (_) {
    fail('TRANSACTION_UNAVAILABLE', 'Dispensing requires an available transaction.', 503);
  }
  const deadline = Date.now() + 20000;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      let uncertain = false;
      try {
        session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 5000 });
        const result = await work(session);
        for (let commitAttempt = 0; commitAttempt < 3; commitAttempt++) {
          try { await session.commitTransaction({ timeoutMS: 5000 }); return result; }
          catch (e) {
            // An unlabeled commit transport failure is uncertain as well. Never
            // rerun the clinical callback or delete external assets on that basis.
            if (!labelled(e, 'UnknownTransactionCommitResult') && !labelled(e, 'TransientTransactionError')) uncertain = true;
            if (labelled(e, 'UnknownTransactionCommitResult')) {
              uncertain = true;
              if (commitAttempt < 2 && Date.now() < deadline) continue;
            }
            if (uncertain) fail('TRANSACTION_OUTCOME_UNKNOWN', 'Commit outcome is unknown. Retry with the same idempotency key; do not create a new checkout.', 503);
            throw e;
          }
        }
      } catch (e) {
        if (!uncertain && session.inTransaction()) await session.abortTransaction().catch(() => {});
        if (!uncertain && labelled(e, 'TransientTransactionError') && attempt < 2 && Date.now() < deadline) continue;
        if (e instanceof DispenseError || e instanceof ClinicalCommandError) throw e;
        fail('TRANSACTION_FAILED', 'Dispensing could not be completed atomically. Retry the same checkout.', 503);
      }
    }
  } finally { await session.endSession().catch(() => {}); }
}

function validateItems(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 50) fail('INVALID_ITEM', 'Provide 1 to 50 medicines with explicit quantities.');
  return raw.map(item => {
    if (!item || typeof item !== 'object') fail('INVALID_ITEM', 'Each dispensing item must be an object.');
    const name = typeof (item.drugName ?? item.name) === 'string' ? (item.drugName ?? item.name).trim() : '';
    const rawQty = item.quantityDispensed ?? item.quantity ?? item.qty;
    if (!['number', 'string'].includes(typeof rawQty) || String(rawQty).trim() === '' || !Number.isSafeInteger(Number(rawQty)) || Number(rawQty) <= 0) {
      fail('INVALID_QUANTITY', 'Quantity must be a positive whole number of inventory units.');
    }
    if (!name) fail('INVALID_ITEM', 'Medicine name is required.');
    if (item.status && item.status !== 'dispensed') fail('PARTIAL_DISPENSE_REQUIRES_REVIEW', 'Partial dispensing is not supported by this full-prescription checkout.');
    if (item.inventoryItemId && !mongoose.isObjectIdOrHexString(item.inventoryItemId)) fail('INVALID_ITEM', 'Invalid inventory item identifier.');
    return { name, qty: Number(rawQty), inventoryItemId: item.inventoryItemId ? String(item.inventoryItemId) : null,
      unit: normalize(item.unit), dosage: typeof item.dosage === 'string' ? item.dosage.trim() : '',
      frequency: typeof item.frequency === 'string' ? item.frequency.trim() : '' };
  });
}

const { recordClinicalEvent, ACTIONS } = require('./clinicalAuditService');

async function dispense({ user, body = {}, prescriptionRef, otc = false, idempotencyKey, skipAuditProjection = false, authorization }) {
  if (!user?.id || !['pharmacist','pharmacy_admin','assistant'].includes(user.role)) fail('FORBIDDEN', 'Authorized pharmacy staff required.', 403);
  const items = validateItems(otc ? body.medications : body.items);
  const nic = typeof body.patientNic === 'string' ? body.patientNic.trim().toUpperCase() : '';
  if (!nic) fail('INVALID_PATIENT', 'Patient NIC is required.');
  const key = idempotencyKey || body.idempotencyKey;
  if (otc && !key) fail('IDEMPOTENCY_KEY_REQUIRED', 'An idempotency key is required for OTC checkout.');
  if (key && (typeof key !== 'string' || !/^[A-Za-z0-9:_-]{8,128}$/.test(key))) fail('INVALID_IDEMPOTENCY_KEY', 'Invalid idempotency key.');
  if (body.isAlternativeDispensed && !String(body.alternativeDetails || '').trim()) fail('ALTERNATIVE_REASON_REQUIRED', 'A substitution reason is required.');
  const ref = prescriptionRef || body.prescriptionId;
  if (!otc && (typeof ref !== 'string' || !ref.trim())) fail('INVALID_PRESCRIPTION', 'Prescription identifier is required.');
  const hash = crypto.createHash('sha256').update(JSON.stringify({ staff: String(user.id), nic, ref:otc?null:ref, items,
    alternative:!!body.isAlternativeDispensed, reason:body.alternativeDetails || '', notes:body.notes || '', consultationRef:body.consultationRef || '' })).digest('hex');
  // This identifier is allocated once, outside the retryable callback.
  const otcPrescriptionId = new mongoose.Types.ObjectId();
  const outcome = await runTransaction(async session => {
    const consent = await claimPharmacyAuthorization({ user, nic, authorization, session });
    const staff = await PharmacyStaff.findById(user.id).session(session);
    if (!staff || staff.isActive !== true || staff.isVerified !== true || staff.mustChangePassword === true || staff.role !== user.role) fail('FORBIDDEN', 'Pharmacy staff account is not eligible.', 403);
    const pharmacy = await Pharmacy.findById(staff.pharmacyId).session(session);
    if (!pharmacy || pharmacy.isActive !== true) fail('FORBIDDEN', 'Pharmacy is not active.', 403);
    if (body.pharmacyId && String(body.pharmacyId) !== String(pharmacy._id)) fail('FORBIDDEN', 'Cannot dispense for another pharmacy.', 403);
    let rx = otc ? null : await Prescription.findOne(mongoose.isObjectIdOrHexString(ref) ? { _id:ref } : { prescriptionId:ref }).session(session);
    if (!otc && !rx) fail('PRESCRIPTION_NOT_FOUND', 'Prescription not found.', 404);
    const operationKey = otc ? `otc:${pharmacy._id}:${key}` : `rx:${rx._id}`;
    const receiptId = new mongoose.Types.ObjectId(crypto.createHash('sha256').update(operationKey).digest('hex').slice(0,24));
    const prior = await Dispensing.findById(receiptId).session(session).lean();
    if (prior) {
      if (key && prior.idempotencyKey === key && prior.requestHash === hash && String(prior.pharmacyId) === String(pharmacy._id)) {
        return { receipt:prior, replay:true };
      }
      fail(otc ? 'IDEMPOTENCY_CONFLICT' : 'ALREADY_DISPENSED', 'Checkout already exists or its payload differs.', otc ? 409 : 400);
    }
    if (rx) {
      if (String(rx.patientNic).trim().toUpperCase() !== nic) fail('PATIENT_MISMATCH', 'Prescription does not belong to this patient.', 403);
      if (!['pending','issued'].includes(rx.status)) fail('ALREADY_DISPENSED', 'Prescription is not eligible for dispensing.');
      if (!rx.expiresAt || rx.expiresAt <= new Date()) fail('PRESCRIPTION_EXPIRED', 'A valid prescription expiry is required.');
      if (!body.isAlternativeDispensed) {
        const prescribed = rx.medications?.length ? rx.medications.map(m => normalize(m.name)) : [normalize(rx.drugName)];
        const requested = [...new Set(items.map(i => normalize(i.name)))].sort();
        if (JSON.stringify([...new Set(prescribed)].sort()) !== JSON.stringify(requested)) fail('MEDICINE_MISMATCH', 'Dispensed medicines must match the prescription, or an explicit substitution must be recorded.');
      }
    }
    const patient = await Patient.findOne(rx?.patientId ? {_id:rx.patientId} : nicFilter(nic, { plainFields: ['nic'] })).session(session);
    if (!patient || String(patient.nic).trim().toUpperCase() !== nic) fail('PATIENT_NOT_FOUND', 'A matching registered patient record is required for allergy checks.', 404);
    if (String(patient._id) !== consent.patientId) fail('FORBIDDEN', 'Consent is bound to a different patient.', 403);
    if (patient.__enc_allergies) fail('PATIENT_RECORD_UNAVAILABLE', 'Patient allergy data could not be read safely.', 503);
    assertMedicationResult(analyzeMedicationSafety([...(await currentMedicationNames(patient._id, { session, PrescriptionModel: Prescription, excludeId: rx?._id })), ...items.map(item => item.name)]));
    const updates = new Map();
    for (const item of items) {
      const candidates = pharmacy.inventory.filter(i => item.inventoryItemId ? String(i._id) === item.inventoryItemId : normalize(i.drugName) === normalize(item.name));
      if (candidates.length !== 1) fail('INSUFFICIENT_STOCK', 'Medicine is missing or ambiguous in this pharmacy inventory.');
      const inv = candidates[0];
      if (normalize(inv.drugName) !== normalize(item.name)) fail('MEDICINE_MISMATCH', 'Inventory identifier and medicine name disagree.');
      if (!normalize(inv.unit) || (item.unit && item.unit !== normalize(inv.unit))) fail('INVALID_UNIT', 'Quantity must use the selected inventory unit.');
      if (checkAllergyConflict(inv.drugName, patient?.allergies).hasConflict) fail('ALLERGY_CONFLICT', 'Recorded patient allergy conflicts with a dispensed medicine.');
      const previous = updates.get(String(inv._id));
      const qty = (previous?.qty || 0) + item.qty;
      if (!Number.isSafeInteger(qty)) fail('INVALID_QUANTITY', 'Total quantity exceeds the supported range.');
      updates.set(String(inv._id), { inventoryItemId:inv._id, drugName:inv.drugName, unit:inv.unit,
        dosage:item.dosage || rx?.dosage || inv.unit, frequency:item.frequency || 'As directed', qty });
    }
    if (rx) {
      const claimed = await Prescription.updateOne({ _id:rx._id, status:{$in:['pending','issued']}, expiresAt:{$gt:new Date()} },
        {$set:{status:'dispensed',dispensedAt:new Date(),dispensedBy:pharmacy._id,dispenserStaffId:String(staff._id),dispensedByPharmacist:staff.fullName,
          pharmacyName:pharmacy.name,isAlternativeDispensed:!!body.isAlternativeDispensed,alternativeDetails:body.alternativeDetails || ''}}, {session});
      if (claimed.modifiedCount !== 1) fail('ALREADY_DISPENSED', 'Prescription is no longer eligible.');
    }
    for (const item of updates.values()) {
      const changed = await Pharmacy.updateOne({ _id:pharmacy._id, isActive:true,
        inventory:{$elemMatch:{_id:item.inventoryItemId,drugName:item.drugName,unit:item.unit,stock:{$gte:item.qty}}} },
      {$inc:{'inventory.$.stock':-item.qty}}, {session});
      if (changed.modifiedCount !== 1) fail('INSUFFICIENT_STOCK', `Insufficient stock for ${item.drugName}.`);
    }
    if (otc) {
      rx = new Prescription({ _id:otcPrescriptionId, prescriptionId:`OTC-${receiptId}`, patientNic:nic,
        patientId:patient?._id, ...writeNicFields(nic), isOTC:true,
        consultationRef:body.consultationRef, dispensedBy:pharmacy._id, dispenserStaffId:String(staff._id),
        dispensedByPharmacist:staff.fullName, pharmacyName:pharmacy.name, dispensedAt:new Date(),
        medications:[...updates.values()].map(i=>({name:i.drugName,dosage:i.dosage,frequency:i.frequency})),
        drugName:items[0].name, dosage:items[0].dosage, instructions:body.notes || 'OTC Dispensation', status:'dispensed',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
      await rx.save({session});
    }
    const receipt = new Dispensing({ _id:receiptId, receiptNumber:`REC-${receiptId}`, prescriptionId:rx._id,
      pharmacyId:pharmacy._id,staffId:staff._id,patientNic:nic,notes:body.notes,
      idempotencyKey:key,requestHash:hash,
      audit:{actorId:String(staff._id),actorRole:user.role||'pharmacist',action:otc?'OTC_PRESCRIPTION_DISPENSED':'PRESCRIPTION_DISPENSED',timestamp:new Date()},
      items:[...updates.values()].map(i=>({inventoryItemId:i.inventoryItemId,drugName:i.drugName,dosage:i.dosage,unit:i.unit,quantityDispensed:i.qty,status:'dispensed'})) });
    await claimPharmacyAuthorization({ user, nic, authorization, session });
    await receipt.save({session});
    return {receipt:receipt.toObject(),replay:false};
  });

  // Post-commit durable clinical audit projection (when not explicitly handled by an HTTP controller)
  if (!skipAuditProjection && !outcome.replay && outcome.receipt) {
    recordClinicalEvent({
      actorId: String(user.id),
      actorRole: user.role,
      action: otc ? ACTIONS.OTC_PRESCRIPTION_DISPENSED : ACTIONS.PRESCRIPTION_DISPENSED,
      resourceType: 'Dispensing',
      resourceId: String(outcome.receipt._id),
      patientNic: nic,
      correlationId: key || hash
    }).catch(() => {});
  }

  return outcome;
}
module.exports = { dispense, runTransaction, DispenseError, validateItems };
