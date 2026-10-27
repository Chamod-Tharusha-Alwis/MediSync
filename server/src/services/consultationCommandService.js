'use strict';
const { normalizeNic } = require('../security/nicBlindIndex');
const { writeNicFields } = require('../security/nicPersistence');
const { canonicalMedicationName } = require('../utils/medicationName');
const { validateMedicines } = require('../utils/prescriptionDuration');
const { currentMedicationNames, assertMedicationResult } = require('./currentMedicationSafety');

async function executeClinicalWrite(req, { standalone = false, command = require('./clinicalCommandService').productionCommandService(),
  models = { Consultation: require('../models/Consultation'), Prescription: require('../models/Prescription'), LabTest: require('../models/LabTest'), Patient: require('../models/Patient') },
  existingMedicines = currentMedicationNames,
  analyze = names => require('../utils/ingredientResolver').analyzeMedicationSafety(names, [], require('../controllers/drugController').COMMON_DRUGS),
  allergyCheck = require('../utils/ingredientResolver').checkAllergyConflict } = {}) {
  const body = req.body || {}, nic = normalizeNic(body.patientNic);
  const medicines = standalone ? [body] : body.prescriptions || [];
  if (!Array.isArray(medicines) || medicines.length > 50) throw new Error('CLINICAL_REQUEST_INVALID');
  const names = medicines.map(canonicalMedicationName), timings = validateMedicines(medicines);
  const labs = standalone ? [] : [...new Set([...(body.labTests || []), ...(body.orderedTests || [])].map(test => typeof test === 'string' ? test.trim() : String(test?.testName || '').trim()))];
  if (labs.length > 50 || labs.some(name => !name || name.length > 160)) throw new Error('CLINICAL_REQUEST_INVALID');
  const request = { patientNic: nic, prescriptions: medicines, labTests: labs,
    symptoms: body.symptoms || [], diagnosis: body.diagnosis || '', notes: body.notes || body.clinicalNotes || '',
    icdCode: body.icdCode || '', icdDescription: body.icdDescription || '', icdVersion: body.icdVersion || '',
    isFollowUpRequired: body.isFollowUpRequired === true, followUpDate: body.followUpDate || '', followUpNotes: body.followUpNotes || '',
    loginType: body.loginType || 'personal', sessionHospitalId: body.sessionHospitalId || body.hospitalId || null };
  // No providers, ML dispatch or PDF generation may run inside this callback.
  return command({ user: req.user, kind: standalone ? 'prescription' : 'consultation', request,
    idempotencyKey: req.headers?.['idempotency-key'],
    context: { patientId: req.clinicalAuthorization?.patientId, sessionId: String(req.session?._id || ''), consentToken: req.headers?.['x-patient-access'] || req.headers?.['x-patient-access-token'] },
    write: async session => {
      const patient = await models.Patient.findById(req.clinicalAuthorization?.patientId).session(session);
      if (!patient || normalizeNic(patient.nic) !== nic) throw new Error('CLINICAL_PATIENT_DENIED');
      patient.decryptFieldsSync?.();
      for (const name of names) if (allergyCheck(name, patient.allergies || []).hasConflict) throw new Error('ALLERGY_CONFLICT');
      if (names.length) assertMedicationResult(await analyze([...(await existingMedicines(patient._id, { session, PrescriptionModel: models.Prescription })), ...names]));
      let consultation;
      const events = [], prescriptionIds = [], labTestIds = [];
      if (!standalone) {
        consultation = new models.Consultation({ patientId: patient._id, doctorId: req.user.id, patientNic: nic, ...writeNicFields(nic),
          consultationId: 'CON-' + require('crypto').randomBytes(12).toString('hex').toUpperCase(),
          symptoms: request.symptoms, diagnosis: request.diagnosis, notes: request.notes, icdCode: request.icdCode,
          icdDescription: request.icdDescription, icdVersion: request.icdVersion, isFollowUpRequired: request.isFollowUpRequired,
          ...(request.followUpDate ? { followUpDate: new Date(request.followUpDate) } : {}), followUpNotes: request.followUpNotes,
          loginType: request.loginType, sessionHospitalId: request.sessionHospitalId, district: patient.district, labTests: labs });
        await consultation.save({ session });
        events.push({ action: 'CONSULTATION_CREATED', resourceType: 'Consultation', resourceId: String(consultation._id) });
      }
      for (const [index, medicine] of medicines.entries()) {
        const rx = new models.Prescription({ patientId: patient._id, doctorId: req.user.id, patientNic: nic, ...writeNicFields(nic),
          consultationId: consultation?._id, consultationRef: consultation?.consultationId, hospitalId: request.sessionHospitalId,
          drugName: names[index], dosage: medicine.dosage || '', frequency: medicine.frequency || '', instructions: medicine.instructions || '', ...timings[index], status: 'pending' });
        await rx.save({ session }); prescriptionIds.push(String(rx._id));
        events.push({ action: 'PRESCRIPTION_ISSUED', resourceType: 'Prescription', resourceId: String(rx._id) });
      }
      for (const name of labs) {
        const lab = new models.LabTest({ patientId: patient._id, patientNic: nic, ...writeNicFields(nic), referredBy: req.user.id,
          consultationId: consultation._id, consultationRef: consultation.consultationId, patientName: patient.fullName, patientEmail: patient.email,
          testName: name, testCategory: 'Other', urgency: 'routine', status: 'pending' });
        await lab.save({ session }); labTestIds.push(String(lab._id));
        events.push({ action: 'LAB_TEST_ORDERED', resourceType: 'LabTest', resourceId: String(lab._id) });
      }
      return { result: standalone ? { prescriptionId: prescriptionIds[0] } : { consultationId: String(consultation._id), prescriptionIds, labTestIds }, events };
    }
  });
}
module.exports = { executeClinicalWrite };
