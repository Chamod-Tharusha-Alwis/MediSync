'use strict';
const fields = {
  prescription: ['_id', 'prescriptionId', 'consultationId', 'consultationRef', 'patientId', 'patientNic', 'doctorId', 'hospitalId', 'drugName', 'dosage', 'frequency', 'durationDays', 'instructions', 'status', 'issuedAt', 'expiresAt', 'medications', 'isOTC', 'dispensedAt', 'pharmacyName'],
  lab: ['_id', 'labTestId', 'reportId', 'consultationId', 'consultationRef', 'patientId', 'patientName', 'testName', 'testCategory', 'urgency', 'status', 'createdAt', 'orderedAt', 'referredBy', 'hospitalId']
};
function clinicalDto(record, type) {
  if (!fields[type]) throw new Error('CLINICAL_PROJECTION_REQUIRED');
  record.decryptFieldsSync?.();
  const source = record.toObject ? record.toObject() : record;
  return Object.fromEntries(fields[type].filter(field => source[field] !== undefined).map(field => [field, source[field]]));
}
module.exports = { clinicalDto };
