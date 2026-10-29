'use strict';
const { canonicalMedicationName } = require('../utils/medicationName');
async function currentMedicationNames(patientId, { session = null, PrescriptionModel = require('../models/Prescription'), now = new Date(), excludeId = null } = {}) {
  if (!/^[a-f0-9]{24}$/i.test(String(patientId))) throw new Error('MEDICATION_PATIENT_ID_REQUIRED');
  let query = PrescriptionModel.find({ patientId, status: { $in: ['pending', 'issued', 'dispensed'] },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}), $or: [{ expiresAt: { $gt: now } }, { expiresAt: null }] }).limit(101);
  if (session) query = query.session(session);
  const rows = await query;
  if (!Array.isArray(rows) || rows.length > 100) throw new Error('MEDICATION_RECONCILIATION_REQUIRED');
  const names = [];
  for (const row of rows) {
    row.decryptFieldsSync?.();
    if (!row.expiresAt || !Number.isFinite(new Date(row.expiresAt).getTime()) || row.__enc_drugName) throw new Error('MEDICATION_RECONCILIATION_REQUIRED');
    if (Array.isArray(row.medications) && row.medications.length) for (const med of row.medications) names.push(canonicalMedicationName(med));
    else names.push(canonicalMedicationName(row));
  }
  return names;
}
function assertMedicationResult(result, totalCount = 2) {
  const isSingleResolvedSafe = (totalCount === 1 || (totalCount === 2 && result?.statusMessage?.includes('at least two valid medications are required') && (!result.unresolvedDrugs || result.unresolvedDrugs.length === 0))) &&
    result &&
    result.hasInteraction === false &&
    (!result.duplicateIngredients || result.duplicateIngredients.length === 0) &&
    (!result.unresolvedIngredients || result.unresolvedIngredients.length === 0);
  if (!result || (result.verificationIncomplete !== false && !isSingleResolvedSafe) || result.hasInteraction !== false || (result.duplicateIngredients && result.duplicateIngredients.length > 0)) throw new Error('MEDICATION_REVIEW_REQUIRED');
}
module.exports = { currentMedicationNames, assertMedicationResult };
