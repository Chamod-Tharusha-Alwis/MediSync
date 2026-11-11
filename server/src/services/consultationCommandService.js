'use strict';
const { normalizeNic } = require('../security/nicBlindIndex');
const { writeNicFields } = require('../security/nicPersistence');
const { canonicalMedicationName } = require('../utils/medicationName');
const { validateMedicines } = require('../utils/prescriptionDuration');
const { currentMedicationNames, assertMedicationResult } = require('./currentMedicationSafety');
const { ClinicalCommandError } = require('./clinicalErrors');
const { computeClinicalFindings, validateSafetyAcknowledgment } = require('../utils/clinicalSafetyValidator');
const { isSameMedicine, getPrescriptionActiveState, getCanonicalIngredientSet } = require('../utils/prescriptionLifecycle');
const { detectIcdVersion } = require('../utils/icdClassifier');

async function executeClinicalWrite(req, { standalone = false, command = require('./clinicalCommandService').productionCommandService(),
  models = { Consultation: require('../models/Consultation'), Prescription: require('../models/Prescription'), LabTest: require('../models/LabTest'), Patient: require('../models/Patient') },
  existingMedicines = currentMedicationNames,
  analyze = names => require('../utils/ingredientResolver').analyzeMedicationSafety(names, [], require('../controllers/drugController').COMMON_DRUGS),
  allergyCheck = require('../utils/ingredientResolver').checkAllergyConflict } = {}) {
  const body = req.body || {}, nic = normalizeNic(body.patientNic);
  const medicines = standalone ? [body] : body.prescriptions || [];
  if (!Array.isArray(medicines) || medicines.length > 50) throw new ClinicalCommandError('CLINICAL_REQUEST_INVALID', 400);
  const names = medicines.map(canonicalMedicationName), timings = validateMedicines(medicines);
  const labs = standalone ? [] : [...new Set([...(body.labTests || []), ...(body.orderedTests || [])].map(test => typeof test === 'string' ? test.trim() : String(test?.testName || '').trim()))];
  if (labs.length > 50 || labs.some(name => !name || name.length > 160)) throw new ClinicalCommandError('CLINICAL_REQUEST_INVALID', 400);
  const resolvedIcdVersion = body.icdCode
    ? (detectIcdVersion(body.icdCode) === 'ICD-11' ? 'ICD-11' : (body.icdVersion || 'ICD-10'))
    : (body.icdVersion || '');
  const request = { patientNic: nic, prescriptions: medicines, labTests: labs,
    symptoms: body.symptoms || [], diagnosis: body.diagnosis || '', notes: body.notes || body.clinicalNotes || '',
    icdCode: body.icdCode || '', icdDescription: body.icdDescription || '', icdVersion: resolvedIcdVersion,
    isFollowUpRequired: body.isFollowUpRequired === true, followUpDate: body.followUpDate || '', followUpNotes: body.followUpNotes || '',
    loginType: body.loginType || 'personal', sessionHospitalId: body.sessionHospitalId || body.hospitalId || null };

  return command({ user: req.user, kind: standalone ? 'prescription' : 'consultation', request,
    idempotencyKey: req.headers?.['idempotency-key'],
    context: { patientId: req.clinicalAuthorization?.patientId, sessionId: String(req.session?._id || ''), consentToken: req.headers?.['x-patient-access'] || req.headers?.['x-patient-access-token'] },
    write: async session => {
      const patient = await models.Patient.findById(req.clinicalAuthorization?.patientId).session(session);
      if (!patient || normalizeNic(patient.nic) !== nic) throw new ClinicalCommandError('CLINICAL_PATIENT_DENIED', 403);
      patient.decryptFieldsSync?.();

      const existingMedList = names.length ? await existingMedicines(patient._id, { session, PrescriptionModel: models.Prescription, includeReferences: true }) : [];
      const computed = computeClinicalFindings({
        medications: medicines,
        patientAllergies: patient.allergies || [],
        activePrescriptions: existingMedList.map(entry => typeof entry === 'string' ? { drugName: entry } : entry),
        analyze,
        allergyCheck,
      });

      let safetyOverride = null;
      if (computed.requiresAcknowledgment) {
        const ack = body.safetyAcknowledgment;
        const ackValidation = validateSafetyAcknowledgment(ack, computed);
        if (!ackValidation.valid) {
          // Backward compatibility for legacy tests without acknowledgment payload:
          const hasAllergyConflict = computed.findings.some(f => f.type === 'allergy_conflict');
          if (hasAllergyConflict && (!ack || !ack.acknowledged)) {
            throw new ClinicalCommandError('ALLERGY_CONFLICT', 400);
          }
          if (!ack || !ack.acknowledged) {
            throw new ClinicalCommandError('MEDICATION_REVIEW_REQUIRED', 409);
          }
          // Acknowledgment was provided but failed hash matching or reason length
          throw new ClinicalCommandError('SAFETY_ACKNOWLEDGMENT_REQUIRED', 400);
        }

        safetyOverride = {
          acknowledged: true,
          acknowledgedAt: new Date(),
          doctorId: req.user.id,
          reason: ack.reason ? String(ack.reason).trim() : '',
          findings: computed.findings.map(f => ({
            type: f.type,
            severity: f.severity,
            items: f.items || [],
            summary: f.summary || '',
            source: f.source || 'formulary_engine'
          })),
          findingTypes: [...new Set(computed.findings.map(f => f.type))]
        };
      } else {
        // Fallback for edge cases
        for (const name of names) {
          if (allergyCheck(name, patient.allergies || []).hasConflict) {
            throw new ClinicalCommandError('ALLERGY_CONFLICT', 400);
          }
        }
        if (names.length) {
          const allMeds = [...existingMedList.map(entry => typeof entry === 'string' ? entry : entry.drugName), ...names];
          try {
            assertMedicationResult(await analyze(allMeds), allMeds.length);
          } catch (mErr) {
            throw new ClinicalCommandError(mErr.message || 'MEDICATION_REVIEW_REQUIRED', 409);
          }
        }
      }

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

      const now = new Date();
      let activeCandidates = [];
      try {
        const candidateQuery = models.Prescription.find({
          patientId: patient._id,
          status: { $in: ['pending', 'issued', 'dispensed', 'partially_dispensed'] },
          supersededBy: null
        });
        activeCandidates = session && typeof candidateQuery.session === 'function'
          ? await candidateQuery.session(session)
          : await candidateQuery;
        for (const c of activeCandidates || []) {
          c.decryptFieldsSync?.();
        }
      } catch (_) {}

      for (const [index, medicine] of medicines.entries()) {
        const canonicalIngredients = getCanonicalIngredientSet(names[index] || medicine);
        const rxData = {
          patientId: patient._id, doctorId: req.user.id, patientNic: nic, ...writeNicFields(nic),
          consultationId: consultation?._id, consultationRef: consultation?.consultationId, hospitalId: request.sessionHospitalId,
          drugName: names[index], dosage: medicine.dosage || '', frequency: medicine.frequency || '', instructions: medicine.instructions || '',
          ...timings[index], status: 'pending',
          resolvedIngredients: canonicalIngredients
        };
        if (safetyOverride) {
          rxData.safetyOverride = safetyOverride;
        }
        const rx = new models.Prescription(rxData);
        await rx.save({ session });
        prescriptionIds.push(String(rx._id));
        events.push({ action: 'PRESCRIPTION_ISSUED', resourceType: 'Prescription', resourceId: String(rx._id) });

        for (const candidate of activeCandidates || []) {
          if (String(candidate._id) === String(rx._id) || candidate.supersededBy) continue;
          if (isSameMedicine(candidate, names[index] || medicine) && getPrescriptionActiveState(candidate, now) === 'active') {
            candidate.supersededBy = rx._id;
            candidate.supersededByConsultationId = consultation?._id || null;
            candidate.supersededAt = now;
            candidate.supersededReason = 'newer_prescription_same_medicine';
            await candidate.save({ session });
            events.push({
              action: 'PRESCRIPTION_SUPERSEDED',
              resourceType: 'Prescription',
              resourceId: String(candidate._id),
              details: {
                supersededBy: String(rx._id),
                consultationId: consultation?._id ? String(consultation._id) : null,
                reason: 'newer_prescription_same_medicine'
              }
            });
          }
        }
      }

      if (safetyOverride) {
        events.push({
          action: 'PRESCRIPTION_SAFETY_OVERRIDE',
          resourceType: 'Consultation',
          resourceId: String(consultation?._id || prescriptionIds[0]),
          details: {
            findingTypes: safetyOverride.findingTypes,
            severities: [...new Set(safetyOverride.findings.map(f => f.severity))]
          }
        });
      }

      for (const name of labs) {
        const lab = new models.LabTest({ patientId: patient._id, patientNic: nic, ...writeNicFields(nic), referredBy: req.user.id,
          consultationId: consultation?._id, consultationRef: consultation?.consultationId, patientName: patient.fullName, patientEmail: patient.email,
          testName: name, testCategory: 'Other', urgency: 'routine', status: 'pending' });
        await lab.save({ session });
        labTestIds.push(String(lab._id));
        events.push({ action: 'LAB_TEST_ORDERED', resourceType: 'LabTest', resourceId: String(lab._id) });
      }
      return { result: standalone ? { prescriptionId: prescriptionIds[0] } : { consultationId: String(consultation._id), prescriptionIds, labTestIds }, events };
    }
  });
}
module.exports = { executeClinicalWrite };
