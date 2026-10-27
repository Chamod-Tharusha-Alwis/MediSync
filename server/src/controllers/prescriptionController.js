const { nicFilter, writeNicFields } = require('../security/nicPersistence');
const crypto = require('crypto');
const Prescription = require('../models/Prescription');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Consultation = require('../models/Consultation');
const { generateLockedPrescription } = require('../utils/pdfGenerator');
const emailService = require('../utils/emailService');
const { checkAllergyConflict } = require('../utils/ingredientResolver');
const { prescriptionTiming, DurationError } = require('../utils/prescriptionDuration');

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

    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `inline; filename="E-Prescription-${refId}.pdf"`,
      'Content-Length':      pdfBuffer.length,
      'Cache-Control':       'private, no-store, no-cache, must-revalidate',
      'Pragma':              'no-cache',
      'Expires':             '0',
    });
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[PDF Download] Generation unavailable.');
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
};
