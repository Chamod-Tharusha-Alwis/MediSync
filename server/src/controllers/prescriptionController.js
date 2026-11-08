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
      if (!isOwnerId && !isOwnerNic && req.user.id && consultation.patientNic && typeof Patient.findById === 'function') {
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
      : { nic: consultation.patientNic };
    if (typeof patientDetails.decryptFieldsSync === 'function') {
      try { patientDetails.decryptFieldsSync(); } catch (_) {}
    }
    const doctorDetails = consultation.doctorId && typeof consultation.doctorId === 'object'
      ? consultation.doctorId
      : {};

    let consultationPayload = consultation.toObject ? consultation.toObject() : { ...consultation };
    if (
      !Array.isArray(consultationPayload.medications) &&
      !Array.isArray(consultationPayload.prescriptions) &&
      typeof Prescription?.find === 'function'
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
    if (!isOwner && consultation.patientNic && typeof Patient.findById === 'function') {
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

exports.checkMedicineSafety = async (req, res) => {
  try {
    const { evaluateMedicineSafety } = require('../utils/medicineSafetyEngine');
    const { medications, patientId, activePrescriptions, acknowledgment } = req.body || {};
    const result = await evaluateMedicineSafety({
      medications,
      patientId,
      activePrescriptions,
      acknowledgment,
      actorId: req.user?._id || req.user?.id || 'system',
      actorRole: req.user?.role || 'doctor',
    });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: 'SAFETY_CHECK_FAILED', message: err.message });
  }
};
