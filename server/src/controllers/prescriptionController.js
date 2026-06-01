const crypto = require('crypto');
const Prescription = require('../models/Prescription');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Consultation = require('../models/Consultation');
const { generateLockedPrescription } = require('../utils/pdfGenerator');
const emailService = require('../utils/emailService');

// POST /api/prescription/issue — Doctor issues prescription
exports.issuePrescription = async (req, res) => {
  try {
    const { patientNic, drugName, dosage, frequency, durationDays } = req.body;

    // Allergy cross-reference check
    const patient = await Patient.findOne({ nic: patientNic });
    if (patient) {
      patient.decryptFieldsSync();
    }

    if (patient?.allergies?.some(a => drugName.toLowerCase().includes(a.toLowerCase()))) {
      return res.status(400).json({ 
        error: 'ALLERGY_CONFLICT', 
        message: `Patient is allergic to: ${patient.allergies.join(', ')}` 
      });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (durationDays || 7));

    const hashedNic = crypto.createHash('sha256').update(patientNic.trim()).digest('hex');

    const rx = await Prescription.create({
      patientNic,
      nicHash: hashedNic,
      drugName, dosage, frequency,
      durationDays, expiresAt,
      doctorId: req.user.id
    });

    rx.decryptFieldsSync();

    // Generate and send password-protected PDF E-Prescription email to patient
    if (patient && patient.email) {
      try {
        const doctor = await Doctor.findById(req.user.id);
        const doctorName = doctor ? doctor.fullName : 'Consulting Medical Professional';
        
        let hospitalName = 'Private Practice';
        if (rx.hospitalId) {
          const Hospital = require('../models/Hospital');
          const hosp = await Hospital.findById(rx.hospitalId);
          if (hosp) hospitalName = hosp.name;
        }

        const patientDOB = patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString() : 'N/A';

        console.log(`[DEBUG] PDF GENERATION STARTED`);
        console.log(`[DEBUG] PATIENT NIC FETCHED: ${patient.nic}`);
        
        // Generate secure password-locked PDF (password is patient's NIC)
        const pdfBuffer = await generateLockedPrescription(rx, patient.fullName, patient.nic, patientDOB, doctorName, hospitalName);
        
        console.log(`[DEBUG] PDF BUFFER CREATED - SIZE: ${pdfBuffer ? pdfBuffer.length : 0} bytes`);
        console.log(`[DEBUG] SENDING EMAIL TO ${patient.email}`);
        
        // Send email with secure PDF attached
        const emailResult = await emailService.sendPrescriptionEmail(patient.email, patient.fullName, pdfBuffer);
        
        if (emailResult && emailResult.success) {
          console.log(`[DEBUG] EMAIL SENT SUCCESSFULLY`);
        } else {
          console.error(`[DEBUG] ERROR IN PDF/EMAIL PIPELINE - ${emailResult ? emailResult.error : 'Unknown Email Failure'}`);
        }
      } catch (pdfErr) {
        console.error(`[DEBUG] ERROR IN PDF/EMAIL PIPELINE - ${pdfErr.message}`);
        console.error('❌ Failed to generate or send secured E-Prescription PDF email:', pdfErr);
      }
    }

    // Send anonymized data point to Python ML engine
    try {
      const { generateToken } = require('../utils/internalAuth');
      await fetch(`${process.env.ML_ENGINE_URL}/ingest`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-internal-key': generateToken()
        },
        body: JSON.stringify({
          district: req.body.district,
          drugCategory: req.body.drugCategory || 'general',
          date: new Date().toISOString().split('T')[0]
          // NIC intentionally NOT sent — anonymized
        })
      });
    } catch (e) { /* ML engine errors should not block prescription */ }

    res.status(201).json(rx);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/prescription/pending/:nic — Pharmacist gets pending prescriptions
exports.getPendingByNic = async (req, res) => {
  try {
    const targetHash = crypto.createHash('sha256').update(req.params.nic.trim()).digest('hex');
    const rxList = await Prescription.find({
      nicHash: targetHash,
      status: { $in: ['pending', 'issued'] },
      expiresAt: { $gt: new Date() }
    }).populate('doctorId', 'fullName specialization');

    res.json(rxList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/prescription/dispense/:id — Pharmacist marks dispensed
exports.dispense = async (req, res) => {
  try {
    const rx = await Prescription.findById(req.params.id);
    if (!rx) return res.status(404).json({ error: 'Prescription not found' });
    if (rx.status === 'dispensed') {
      return res.status(400).json({ error: 'DUPLICATE_DISPENSE', message: 'Already dispensed' });
    }
    if (rx.status === 'expired' || rx.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Prescription has expired' });
    }

    rx.status = 'dispensed';
    rx.dispensedAt = new Date();
    rx.dispensedBy = req.body.pharmacyId;
    await rx.save();

    res.json({ message: 'Dispensed successfully', rx });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/prescription/download/:prescriptionId — Patient downloads their own E-Prescription PDF
exports.downloadPrescriptionPdf = async (req, res) => {
  try {
    const { refId } = req.params;

    // Support querying by either the consultation string or the individual prescription ObjectId/string
    const prescriptions = await Prescription.find({ 
      $or: [
        { consultationRef: refId }, 
        { prescriptionId: refId }
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

    const patientNic = prescriptions[0].patientNic;
    if (patientNic.toUpperCase() !== req.user.sub.toUpperCase()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const patient = await Patient.findOne({ nic: patientNic });
    if (!patient) return res.status(404).json({ error: 'Patient record not found' });
    if (typeof patient.decryptFieldsSync === 'function') {
      patient.decryptFieldsSync();
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
      const consultation = await Consultation.findOne({ consultationId: refId });
      if (consultation) {
        if (typeof consultation.decryptFieldsSync === 'function') {
          consultation.decryptFieldsSync();
        }
        labTests = consultation.labTests || [];
        followUpDate = consultation.followUpDate || null;
      }
    }

    // Re-generate the NIC-locked PDF containing all prescriptions under this consultation
    const pdfBuffer = await generateLockedPrescription(
      prescriptions, patient.fullName, patient.nic, patientDOB, doctorName, hospitalName,
      patient.gender || '', labTests, followUpDate, refId
    );

    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `inline; filename="E-Prescription-${refId}.pdf"`,
      'Content-Length':      pdfBuffer.length,
      'Cache-Control':       'no-store',
    });
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[PDF Download] Error:', err.message);
    res.status(500).json({ error: 'Failed to generate PDF', details: err.message });
  }
};