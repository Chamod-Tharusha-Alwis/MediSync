const { nicFilter, writeNicFields } = require('../security/nicPersistence');
const crypto = require('crypto');
const Prescription = require('../models/Prescription');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Consultation = require('../models/Consultation');
const { generateLockedPrescription, generateConsultationSummaryPDF } = require('../utils/pdfGenerator');
const emailService = require('../utils/emailService');
const { checkAllergyConflict } = require('../utils/ingredientResolver');
const { prescriptionTiming, DurationError } = require('../utils/prescriptionDuration');

function sanitizeFileRef(rawId) {
  const cleaned = String(rawId || 'record')
    .replace(/\b(?:[0-9]{9}[vVxX]|[0-9]{12})\b/g, 'record')
    .replace(/[^A-Za-z0-9_-]/g, '');
  return cleaned || 'record';
}

// POST /api/prescription/issue — Doctor issues prescription
exports.issuePrescription = async (req, res) => {
  try {
    const outcome = await require('../services/consultationCommandService').executeClinicalWrite(req, { standalone: true });
    const rx = await Prescription.findOne({ _id: outcome.result.prescriptionId, doctorId: req.user.id, patientId: req.clinicalAuthorization.patientId });
    if (!rx) return res.status(503).json({ error: 'Committed prescription cannot be read safely', commandId: outcome.commandId });
    rx.decryptFieldsSync?.();
    const data = {};
    for (const key of ['_id','prescriptionId','consultationId','consultationRef','patientId','doctorId','hospitalId','drugName','dosage','frequency','durationDays','instructions','status','issuedAt','expiresAt']) if (rx[key] !== undefined) data[key] = rx[key];
    res.set('X-Idempotent-Replay', String(outcome.replayed));
    return res.status(outcome.replayed ? 200 : 201).json(data);
  } catch (error) {
    if (error instanceof DurationError) return res.status(400).json({ error: error.code, message: error.message });
    if (error instanceof require('../services/clinicalErrors').ClinicalCommandError) return res.status(error.status).json({ error: error.code });
    return res.status(503).json({ error: 'Clinical write could not be completed safely' });
  }
};

// GET /api/prescription/pending/:nic — Pharmacist gets pending prescriptions
exports.getPendingByNic = async (req, res) => {
  try {
    const rxList = await Prescription.find({
      ...nicFilter(req.params.nic, { legacyFields: ['nicHash', 'patientNic_bi'] }),
      status: { $in: ['pending', 'issued'] },
      expiresAt: { $gt: new Date() }
    }).populate('doctorId', 'fullName specialization');

    res.json(rxList);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch prescriptions' });
  }
};

// PUT /api/prescription/dispense/:id — Pharmacist marks dispensed
exports.dispense = require('./dispensingController').dispense;

// GET /api/prescription/download/:prescriptionId — Patient downloads their own E-Prescription PDF
exports.downloadPrescriptionPdf = async (req, res) => {
  try {
    const { refId } = req.params;
    const patient = await Patient.findById(req.user.id);
    patient?.decryptFieldsSync?.();
    if (!patient?.nic || !refId) return res.status(403).json({ error: 'Access denied' });
    const authNic = String(patient.nic).trim().toUpperCase();

    // Support querying by either the consultation string or the individual prescription ObjectId/string
    const prescriptions = await Prescription.find({ $and: [
      nicFilter(authNic, { legacyFields: ['nicHash', 'patientNic_bi'], plainFields: ['patientNic'] }),
      { $or: [
        { consultationRef: refId }, 
        { prescriptionId: refId }
      ] }
    ]
    })
      .populate('doctorId', 'fullName')
      .populate('hospitalId', 'name');

    if (prescriptions.length === 0) {
      return res.status(404).json({ error: 'No prescriptions found for this reference.' });
    }

    // Decrypt and verify patient ownership
    prescriptions.forEach(rx => {
      if (typeof rx.decryptFieldsSync === 'function') {
        rx.decryptFieldsSync();
      }
    });

    if (prescriptions.some(rx => !rx.patientNic || String(rx.patientNic).trim().toUpperCase() !== authNic || (rx.patientId && String(rx.patientId) !== String(patient._id)))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const firstRx = prescriptions[0];
    const doctor = firstRx.doctorId;
    const doctorName = doctor?.fullName || 'Consulting Medical Professional';
    const hospitalName = firstRx.hospitalId?.name || 'Private Practice';
    const patientDOB = patient.dateOfBirth
      ? new Date(patient.dateOfBirth).toLocaleDateString()
      : 'N/A';

    // Retrieve recommended lab tests and follow-up date from the parent consultation if available
    let labTests = [];
    let followUpDate = null;
    if (refId) {
      const consultation = await Consultation.findOne({ consultationId: refId, patientId: patient._id });
      if (consultation) {
        if (typeof consultation.decryptFieldsSync === 'function') {
          consultation.decryptFieldsSync();
        }
        labTests = consultation.labTests || [];
        followUpDate = consultation.followUpDate || null;
      }
    }

    // Language is resolved only after persisted identity and every row's ownership.
    const languageOptions = await require('../services/recipientLanguageService').pdf({ model: 'Patient', accountId: String(patient._id), authorizedSubjectId: String(req.user.id) });
    // Re-generate the e-prescription PDF containing all prescriptions under this consultation
    const pdfBuffer = await generateLockedPrescription(
      prescriptions, patient.fullName, patient.nic, patientDOB, doctorName, hospitalName,
      patient.gender || '', labTests, followUpDate, refId, languageOptions
    );

    const safeFileRef = sanitizeFileRef(refId).slice(-24);
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `inline; filename="E-Prescription-${safeFileRef}.pdf"`,
      'Content-Length':      pdfBuffer.length,
      'Cache-Control':       'private, no-store, no-cache, must-revalidate',
      'Pragma':              'no-cache',
      'Expires':             '0',
    });
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[PDF Download] Generation unavailable.');
    if (err?.code === 'SECURITY_HOLD') {
      return res.status(503).json({ code: 'PDF_EXPORT_UNAVAILABLE' });
    }
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
};

// GET /api/prescriptions/consultations/:id/export-pdf — Clinical Consultation PDF export (Milestone 4 WP5)
exports.exportConsultationPdf = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(404).json({ error: 'Consultation not found' });

    const cleanId = String(id).trim();
    const isObjId = /^[0-9a-fA-F]{24}$/.test(cleanId);
    const query = {
      $or: [
        { consultationId: cleanId },
        ...(isObjId ? [{ _id: cleanId }] : [])
      ]
    };

    const consultation = await Consultation.findOne(query)
      .populate('doctorId', 'fullName slmcNumber')
      .populate('patientId', 'fullName nic dateOfBirth gender preferredLanguage');

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' });
    }

    if (typeof consultation.decryptFieldsSync === 'function') {
      try { consultation.decryptFieldsSync(); } catch (_) {}
    }

    // Access control
    if (req.user.role === 'patient') {
      const patientObjId = consultation.patientId?._id || consultation.patientId;
      let isOwnerId = Boolean(patientObjId && String(patientObjId) === String(req.user.id));
      let isOwnerNic = Boolean(
        req.user.nic && consultation.patientNic &&
        String(req.user.nic).trim().toUpperCase() === String(consultation.patientNic).trim().toUpperCase()
      );
      const canQueryPatient = typeof Patient?.findById === 'function' && (Patient.db?.readyState === 1 || Patient.findById._isMockFunction);
      if (!isOwnerId && !isOwnerNic && req.user.id && consultation.patientNic && canQueryPatient) {
        try {
          const authPatient = await Patient.findById(req.user.id);
          authPatient?.decryptFieldsSync?.();
          if (authPatient?.nic && String(authPatient.nic).trim().toUpperCase() === String(consultation.patientNic).trim().toUpperCase()) {
            isOwnerNic = true;
          }
        } catch (_) {}
      }
      if (!isOwnerId && !isOwnerNic) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } else if (req.user.role === 'doctor') {
      const doctorObjId = consultation.doctorId?._id || consultation.doctorId;
      const isAttendingDoctor = doctorObjId && String(doctorObjId) === String(req.user.id);
      if (!isAttendingDoctor) {
        const token = req.headers['x-patient-access'] || req.headers['x-patient-access-token'];
        if (!token) {
          return res.status(403).json({ error: 'Access denied: Active patient consent required' });
        }
        try {
          const consent = await require('../services/patientConsentService').verifyPatientConsent({
            actor: req.user,
            nic: consultation.patientNic,
            token
          });
          const patientObjId = consultation.patientId?._id || consultation.patientId;
          if (!consent || !consent.patientId || (patientObjId && String(consent.patientId) !== String(patientObjId))) {
            return res.status(403).json({ error: 'Access denied' });
          }
        } catch (_) {
          return res.status(403).json({ error: 'Access denied: Active patient consent required' });
        }
      }
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Flag gate
    if (process.env.PDF_EXPORT_ENABLED !== 'true') {
      return res.status(503).json({ error: 'Clinical PDF export is temporarily unavailable', code: 'PDF_EXPORT_UNAVAILABLE' });
    }

    const patientDetails = consultation.patientId && typeof consultation.patientId === 'object'
      ? consultation.patientId
      : { nic: consultation.patientNic || 'Unavailable', fullName: 'Unavailable' };
    if (typeof patientDetails.decryptFieldsSync === 'function') {
      try { patientDetails.decryptFieldsSync(); } catch (_) {}
    }
    const doctorDetails = consultation.doctorId && typeof consultation.doctorId === 'object'
      ? consultation.doctorId
      : { fullName: 'Unavailable' };

    let consultationPayload = consultation.toObject ? consultation.toObject() : { ...consultation };
    if (
      !Array.isArray(consultationPayload.medications) &&
      !Array.isArray(consultationPayload.prescriptions) &&
      typeof Prescription?.find === 'function' &&
      (Prescription.db?.readyState === 1 || Prescription.find._isMockFunction)
    ) {
      try {
        const rxOr = [];
        if (consultation._id) rxOr.push({ consultationId: consultation._id });
        if (consultation.consultationId) rxOr.push({ consultationRef: consultation.consultationId });
        if (rxOr.length > 0) {
          const rxQuery = Prescription.find({ $or: rxOr });
          const rxDocs = typeof rxQuery?.sort === 'function' ? await rxQuery.sort({ issuedAt: 1, createdAt: 1 }) : await rxQuery;
          if (Array.isArray(rxDocs) && rxDocs.length > 0) {
            const decryptedRx = rxDocs.map((rx) => {
              if (typeof rx?.decryptFieldsSync === 'function') {
                try { rx.decryptFieldsSync(); } catch (_) {}
              }
              return rx?.toObject ? rx.toObject() : rx;
            });
            consultationPayload = {
              ...consultationPayload,
              medications: decryptedRx,
              prescriptions: decryptedRx,
            };
          }
        }
      } catch (_) {}
    }

    let verificationUrl = null;
    try {
      const { issueVerificationToken } = require('../services/verificationTokenService');
      const tokenRes = await issueVerificationToken({
        consultationId: consultation._id,
        patientId: consultation.patientId,
        doctorId: consultation.doctorId,
        consultationRef: consultation.consultationId,
      });
      verificationUrl = tokenRes?.verificationUrl;
    } catch (_) {}

    const pdfBuffer = await generateConsultationSummaryPDF(consultationPayload, patientDetails, doctorDetails, { verificationUrl });

    const date = new Date().toISOString().slice(0, 10);
    const maskedRef = sanitizeFileRef(consultation.consultationId || consultation._id).slice(-8);
    const filename = `MediSync-Consultation-${date}-${maskedRef}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': pdfBuffer.length,
      'Cache-Control': 'private, no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    return res.send(pdfBuffer);
  } catch (err) {
    if (err?.code === 'SECURITY_HOLD') {
      return res.status(503).json({ error: 'Clinical PDF export is temporarily unavailable', code: 'PDF_EXPORT_UNAVAILABLE' });
    }
    console.error('[PDF Export] Generation unavailable.');
    return res.status(500).json({ error: 'Failed to generate PDF' });
  }
};

// POST /api/prescriptions/consultations/:id/resend-summary (and /api/patient/consultation/:id/resend-summary)
exports.resendConsultationSummaryEmail = async (req, res) => {
  try {
    if (req.user?.role !== 'patient' || !req.user?.id) {
      return res.status(403).json({ error: 'Only the patient owner can request a summary email resend' });
    }

    const { id } = req.params;
    if (!id) return res.status(404).json({ error: 'Consultation not found' });

    const cleanId = String(id).trim();
    const isObjId = /^[0-9a-fA-F]{24}$/.test(cleanId);
    const consultation = await Consultation.findOne({
      $or: [
        { consultationId: cleanId },
        ...(isObjId ? [{ _id: cleanId }] : []),
      ],
    });

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' });
    }

    if (typeof consultation.decryptFieldsSync === 'function') {
      try { consultation.decryptFieldsSync(); } catch (_) {}
    }

    const patientObjId = consultation.patientId?._id || consultation.patientId;
    let isOwner = Boolean(patientObjId && String(patientObjId) === String(req.user.id));
    if (!isOwner && consultation.patientNic && typeof Patient.findById === 'function' && (Patient.db?.readyState === 1 || Patient.findById._isMockFunction)) {
      const authPatient = await Patient.findById(req.user.id);
      authPatient?.decryptFieldsSync?.();
      if (
        authPatient?.nic &&
        String(authPatient.nic).trim().toUpperCase() === String(consultation.patientNic).trim().toUpperCase()
      ) {
        isOwner = true;
      }
    }

    if (!isOwner) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const {
      sendConsultationSummaryEmail,
      checkResendRateLimit,
    } = require('../services/consultationSummaryEmailService');
    const consultKey = String(consultation._id || consultation.consultationId);
    const throttle = checkResendRateLimit(req.user.id, consultKey);
    if (!throttle.allowed) {
      return res.status(429).json({
        error: 'Please wait before requesting another consultation summary email.',
        code: throttle.errorCode,
        retryAfterSeconds: throttle.retryAfterSeconds,
      });
    }

    const result = await sendConsultationSummaryEmail({
      consultationId: consultation._id || consultation.consultationId,
      patientId: req.user.id,
      doctorId: consultation.doctorId?._id || consultation.doctorId,
      forceResend: true,
    });

    if (!result.sent) {
      return res.status(503).json({
        error: 'Consultation summary email could not be sent right now.',
        code: result.errorCode || 'EMAIL_DELIVERY_FAILED',
      });
    }

    return res.status(200).json({
      message: 'Consultation summary email sent successfully.',
      sent: true,
      pdfAttached: Boolean(result.pdfAttached),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to resend consultation summary email' });
  }
};

exports.previewConsultationSafety = async (req, res) => {
  const { medications } = req.body || {};
  if (!Array.isArray(medications) || medications.length > 50) {
    return res.status(400).json({ error: 'CLINICAL_REQUEST_INVALID' });
  }

  let consent;
  try {
    consent = await require('../services/patientConsentService').verifyPatientConsent({
      actor: req.user,
      nic: req.body.patientNic,
      token: req.headers['x-patient-access'] || req.headers['x-patient-access-token'],
    });
  } catch (_) {
    return res.status(403).json({ error: 'Patient consent required' });
  }

  try {
    const patient = await require('../models/Patient').findById(consent.patientId);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    patient.decryptFieldsSync?.();
    if (patient.__enc_allergies) return res.status(503).json({ error: 'PATIENT_RECORD_UNAVAILABLE' });
    const { currentMedicationNames } = require('../services/currentMedicationSafety');
    const activePrescriptions = await currentMedicationNames(consent.patientId, { includeReferences: true });
    const { analyzeMedicationSafety } = require('../utils/ingredientResolver');
    const { COMMON_DRUGS } = require('./drugController');
    const result = require('../utils/clinicalSafetyValidator').computeClinicalFindings({
      medications,
      patientAllergies: patient.allergies || [],
      activePrescriptions,
      analyze: names => analyzeMedicationSafety(names, [], COMMON_DRUGS),
    });
    return res.json({
      ...result,
      hasWarnings: result.findings.length > 0,
      warnings: result.findings.map(finding => ({
        ...finding,
        severity: ['critical', 'severe'].includes(finding.severity) ? 'high' : finding.severity,
        message: finding.summary,
      })),
    });
  } catch (_) {
    return res.status(503).json({ error: 'SAFETY_CHECK_UNAVAILABLE' });
  }
};

function sanitizeDrugName(name) {
  if (typeof name !== 'string') return 'unrecognised medicine';
  const trimmed = name.trim();
  if (!trimmed || /^(?:gcm1\.|enc:|[0-9a-f]{32}:[0-9a-f]+)/i.test(trimmed)) {
    return 'unrecognised medicine';
  }
  return trimmed;
}

function sanitizePayloadDeep(value) {
  if (typeof value === 'string') {
    if (/^(?:gcm1\.|enc:|[0-9a-f]{32}:[0-9a-f]+)/i.test(value.trim())) {
      return 'unrecognised medicine';
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizePayloadDeep);
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = sanitizePayloadDeep(v);
    }
    return out;
  }
  return value;
}

exports.checkMedicineSafety = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { evaluateMedicineSafety } = require('../utils/medicineSafetyEngine');
    const { computeClinicalFindings } = require('../utils/clinicalSafetyValidator');
    const { medications: rawMeds, patientId, activePrescriptions, acknowledgment } = req.body || {};

    const medications = Array.isArray(rawMeds)
      ? rawMeds.map(m => {
          if (typeof m === 'string') return sanitizeDrugName(m);
          if (m && typeof m === 'object') {
            const name = sanitizeDrugName(m.name || m.drugName || '');
            return { ...m, name, drugName: name };
          }
          return m;
        })
      : [];

    let patientAllergies = [];
    let resolvedActiveRx = Array.isArray(activePrescriptions) ? [...activePrescriptions] : [];
    if (patientId && mongoose.isObjectIdOrHexString(patientId)) {
      try {
        const Patient = require('../models/Patient');
        const patient = await Patient.findById(patientId);
        if (patient) {
          patient.decryptFieldsSync?.();
          patientAllergies = Array.isArray(patient.allergies) ? patient.allergies : [];
        }
      } catch (_) {}

      if (resolvedActiveRx.length === 0) {
        try {
          const Prescription = require('../models/Prescription');
          const now = new Date();
          // Active prescriptions only: pending or issued (not yet dispensed, not expired, not superseded).
          // Historical dispensed prescriptions are excluded: a finished course from months ago is not a concurrent active drug.
          const query = Prescription.find({
            patientId,
            status: { $in: ['pending', 'issued'] },
            supersededBy: null,
            $or: [{ expiresAt: { $gt: now } }, { expiresAt: null }]
          });
          const selectResult = typeof query?.select === 'function'
            ? query.select('drugName medications consultationRef prescriptionId durationDays dosage frequency createdAt')
            : query;
          const rawDocs = typeof selectResult?.lean === 'function'
            ? await selectResult.lean()
            : await selectResult;

          const activeDocs = (Array.isArray(rawDocs) ? rawDocs : []).map(d => {
            if (d && typeof d.decryptFieldsSync !== 'function' && typeof Prescription.hydrate === 'function') {
              try {
                const hyd = Prescription.hydrate(d);
                hyd.decryptFieldsSync?.();
                return hyd;
              } catch (_) {
                return d;
              }
            }
            d?.decryptFieldsSync?.();
            return d;
          });

          for (const doc of activeDocs || []) {
            doc.decryptFieldsSync?.();
            const ref = doc.consultationRef || doc.prescriptionId || 'CON-RECORD';
            if (Array.isArray(doc.medications) && doc.medications.length) {
              for (const m of doc.medications) {
                const drugName = sanitizeDrugName(m.name || m.drugName);
                resolvedActiveRx.push({ drugName, reference: ref, consultationRef: ref, dosage: m.dosage, frequency: m.frequency, rawDoc: doc });
              }
            } else if (doc.drugName) {
              const drugName = sanitizeDrugName(doc.drugName);
              resolvedActiveRx.push({ drugName, reference: ref, consultationRef: ref, dosage: doc.dosage, frequency: doc.frequency, rawDoc: doc });
            }
          }
        } catch (_) {}
      }
    }

    const computed = computeClinicalFindings({
      medications,
      patientAllergies,
      activePrescriptions: resolvedActiveRx,
    });

    const result = await evaluateMedicineSafety({
      medications,
      patientId,
      activePrescriptions: resolvedActiveRx,
      acknowledgment,
      actorId: req.user?._id || req.user?.id || 'system',
      actorRole: req.user?.role || 'doctor',
    });

    result.findings = computed.findings;
    result.findingsHash = computed.findingsHash;
    result.requiresAcknowledgment = computed.requiresAcknowledgment;
    result.requiresReason = computed.requiresReason;
    result.maxSeverity = computed.maxSeverity;

    // Merge computed findings into warnings for UI panels while avoiding duplicates
    const existingSummaries = new Set((result.warnings || []).map(w => w.message || w.summary || ''));
    for (const f of computed.findings) {
      if (!existingSummaries.has(f.summary)) {
        result.warnings.push({
          type: f.type,
          severity: f.severity === 'severe' ? 'high' : f.severity,
          drug1: f.items[0],
          drug2: f.items[1],
          items: f.items,
          message: f.summary,
          summary: f.summary,
          source: f.source,
        });
        existingSummaries.add(f.summary);
      }
    }
    result.hasWarnings = result.warnings.length > 0;
    result.hasActionableWarnings = computed.requiresAcknowledgment;

    const { isSameMedicine, getDaysRemaining } = require('../utils/prescriptionLifecycle');
    const supersededNotices = [];
    if (Array.isArray(medications) && Array.isArray(resolvedActiveRx)) {
      for (const newMed of medications) {
        const medName = typeof newMed === 'string' ? newMed : (newMed?.name || newMed?.drugName || '');
        if (!medName) continue;
        for (const active of resolvedActiveRx) {
          const activeName = active.drugName || active.name || '';
          if (!activeName) continue;
          if (isSameMedicine(medName, activeName)) {
            const rawDoc = active.rawDoc || active;
            const ref = active.consultationRef || active.reference || rawDoc.consultationRef || rawDoc.prescriptionId || 'previous consultation';
            const startDate = rawDoc.dispensedAt || rawDoc.issuedAt || rawDoc.createdAt || new Date();
            const startStr = new Date(startDate).toISOString().slice(0, 10);
            const daysLeft = getDaysRemaining(rawDoc, new Date());
            supersededNotices.push({
              drugName: medName,
              activeDrugName: activeName,
              consultationRef: ref,
              startDate: startStr,
              daysLeft,
              message: `${medName} is currently active from ${ref} (started ${startStr}, ${daysLeft} days left). Saving will replace it.`
            });
          }
        }
      }
    }
    result.supersededNotices = supersededNotices;

    const sanitizedResponse = sanitizePayloadDeep(result);
    return res.status(200).json(sanitizedResponse);
  } catch (err) {
    return res.status(500).json({ error: 'SAFETY_CHECK_FAILED', message: err.message });
  }
};
