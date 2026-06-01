// server/src/controllers/labController.js
const crypto     = require('crypto');
const path       = require('path');
const fs         = require('fs');
const axios      = require('axios');
const FormData   = require('form-data');
const speakeasy  = require('speakeasy');
const cloudinary = require('cloudinary').v2;

const LabTest    = require('../models/LabTest');
const Patient    = require('../models/Patient');
const Consultation = require('../models/Consultation');
const Prescription = require('../models/Prescription');
const { sendEmail } = require('../utils/email');

const ML_ENGINE  = process.env.ML_ENGINE_URL || 'http://127.0.0.1:5001';
const UPLOAD_DIR = path.join(__dirname, '../../uploads/lab-reports');

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── Blind-index helper ────────────────────────────────────────────────────────
const nicHash = (nic) =>
  crypto.createHash('sha256').update(nic.trim()).digest('hex');

// ── OTP store (in-memory; replace with Redis for production) ─────────────────
const otpStore = new Map();   // key: doctorId → { otp, labTestId, expiresAt }

// ─────────────────────────────────────────────────────────────────────────────
// HOSPITAL ACTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/lab/search-patient
 * Hospital searches for a patient by NIC to begin lab test registration.
 * Returns patient's name (decrypted) + existing open lab tests for that NIC.
 */
exports.searchPatientByNic = async (req, res) => {
  try {
    const { nic } = req.body;
    if (!nic) return res.status(400).json({ message: 'NIC is required' });

    const hash    = nicHash(nic);
    const patient = await Patient.findOne({ nic_bi: hash });

    if (!patient) {
      return res.status(404).json({ message: 'No registered patient found with this NIC' });
    }

    // Fetch existing lab tests for this patient
    const existingTests = await LabTest.find({ patientNic_bi: hash })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('labTestId testName status createdAt');

    return res.json({
      found:        true,
      patientName:  patient.name,           // mongoose-field-encryption decrypts on .find()
      patientEmail: patient.email,
      existingTests,
    });
  } catch (err) {
    console.error('[Lab] searchPatient error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * POST /api/lab/accept
 * Hospital accepts a lab test for a patient.
 * Generates unique labTestId and sends confirmation email to patient.
 */
exports.acceptLabTest = async (req, res) => {
  try {
    const { nic, testName, testCategory, urgency, notes, referredBy } = req.body;
    const { userId, hospitalId } = req.user;

    if (!nic || !testName) {
      return res.status(400).json({ message: 'NIC and test name are required' });
    }

    // Resolve patient details
    const hash    = nicHash(nic);
    const patient = await Patient.findOne({ nic_bi: hash });
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    // Create lab test — labTestId auto-generated in schema default
    const labTest = await LabTest.create({
      patientNic:     nic,
      patientNic_bi:  hash,
      patientName:    patient.name,
      patientEmail:   patient.email,
      hospitalId,
      acceptedBy:     userId,
      testName,
      testCategory:   testCategory || 'Other',
      urgency:        urgency || 'routine',
      notes:          notes || '',
      referredBy:     referredBy || null,
      status:         'pending',
      statusHistory:  [{ status: 'pending', changedBy: userId, note: 'Lab test registered' }],
    });

    // Send confirmation email to patient
    await sendStatusEmail(labTest, patient.email, 'pending');

    return res.status(201).json({
      message:   'Lab test registered successfully',
      labTestId: labTest.labTestId,
    });
  } catch (err) {
    console.error('[Lab] acceptLabTest error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * PATCH /api/lab/:labTestId/status
 * Hospital updates the status of a lab test.
 * Sends email notification to patient on every status change.
 */
exports.updateStatus = async (req, res) => {
  try {
    const { labTestId } = req.params;
    const { status, note } = req.body;
    const { userId } = req.user;

    const VALID = ['pending', 'sample_collected', 'processing', 'report_ready', 'delivered'];
    if (!VALID.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const labTest = await LabTest.findOne({ labTestId });
    if (!labTest) return res.status(404).json({ message: 'Lab test not found' });

    labTest.status = status;
    labTest.statusHistory.push({ status, changedBy: userId, note: note || '' });
    await labTest.save();

    // Email patient on every status change
    await sendStatusEmail(labTest, labTest.patientEmail, status);

    return res.json({ message: `Status updated to "${status}"`, labTestId });
  } catch (err) {
    console.error('[Lab] updateStatus error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * POST /api/lab/:labTestId/upload-report
 * Hospital uploads the PDF report.
 * The PDF is sent to the ML engine, which encrypts it with the patient's NIC as password.
 * The NIC-encrypted PDF is stored server-side.
 */
exports.uploadReport = async (req, res) => {
  try {
    const { labTestId } = req.params;
    if (!req.file) return res.status(400).json({ message: 'No PDF file uploaded' });

    const labTest = await LabTest.findOne({ labTestId });
    if (!labTest) return res.status(404).json({ message: 'Lab test not found' });

    const rawPdfPath     = req.file.path;

    // Send raw PDF + NIC to ML engine for password-encryption
    const form = new FormData();
    form.append('pdf',      fs.createReadStream(rawPdfPath));
    form.append('password', labTest.patientNic);

    const mlResponse = await axios.post(
      `${ML_ENGINE}/lab/encrypt-pdf`,
      form,
      { headers: form.getHeaders(), responseType: 'arraybuffer' }
    );

    // Upload encrypted PDF arraybuffer directly to Cloudinary
    const uploadPromise = new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: 'raw', format: 'pdf' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(Buffer.from(mlResponse.data));
    });

    const cloudinaryResult = await uploadPromise;

    // Clean up the raw uploaded file
    if (fs.existsSync(rawPdfPath)) fs.unlinkSync(rawPdfPath);

    // Update lab test record
    labTest.reportPath         = cloudinaryResult.secure_url;
    labTest.reportOriginalName = req.file.originalname;
    labTest.reportUploadedAt   = new Date();
    labTest.status             = 'report_ready';
    labTest.statusHistory.push({
      status:    'report_ready',
      changedBy: req.user.userId,
      note:      'Report uploaded and encrypted',
    });
    await labTest.save();

    // Email patient that report is ready
    await sendStatusEmail(labTest, labTest.patientEmail, 'report_ready');

    return res.json({ message: 'Report uploaded and encrypted successfully', labTestId });
  } catch (err) {
    console.error('[Lab] uploadReport error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * GET /api/lab/hospital/all
 * Hospital views all lab tests for their hospital.
 */
exports.getHospitalLabTests = async (req, res) => {
  try {
    const { hospitalId } = req.user;
    const { status, search } = req.query;

    const filter = { hospitalId };
    if (status && status !== 'all') filter.status = status;

    const tests = await LabTest.find(filter)
      .sort({ createdAt: -1 })
      .select('-patientNic -patientEmail')  // don't return encrypted PII in list view
      .populate('acceptedBy', 'name')
      .populate('referredBy', 'name specialization');

    // If searching by labTestId or testName
    const filtered = search
      ? tests.filter(t =>
          t.labTestId.toLowerCase().includes(search.toLowerCase()) ||
          t.testName.toLowerCase().includes(search.toLowerCase()) ||
          t.patientName.toLowerCase().includes(search.toLowerCase())
        )
      : tests;

    return res.json(filtered);
  } catch (err) {
    console.error('[Lab] getHospitalLabTests error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATIENT ACTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/lab/patient/my-tests
 * Patient views all their lab tests using their authenticated NIC (from JWT).
 */
exports.getMyLabTests = async (req, res) => {
  try {
    const { nic } = req.user;
    const hash = nicHash(nic);

    const tests = await LabTest.find({ patientNic_bi: hash })
      .sort({ createdAt: -1 })
      .select('labTestId testName testCategory status urgency reportUploadedAt createdAt statusHistory')
      .populate('hospitalId', 'name address')
      .populate('referredBy', 'name specialization');

    return res.json(tests);
  } catch (err) {
    console.error('[Lab] getMyLabTests error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * GET /api/lab/patient/download/:labTestId
 * Patient downloads their encrypted PDF report.
 * Server decrypts with the stored NIC (patient is authenticated — NIC confirmed via JWT).
 * Returns a clean unlocked PDF to the authenticated patient.
 */
exports.patientDownloadReport = async (req, res) => {
  try {
    const { labTestId } = req.params;
    const { nic }       = req.user;       // from JWT — patient is authenticated

    const hash    = nicHash(nic);
    const labTest = await LabTest.findOne({ labTestId, patientNic_bi: hash });

    if (!labTest) {
      return res.status(404).json({ message: 'Lab test not found or not linked to your account' });
    }
    if (!labTest.reportPath) {
      return res.status(404).json({ message: 'Report not yet available' });
    }

    // Fetch the encrypted PDF from Cloudinary and stream it directly
    const cloudinaryResponse = await axios.get(labTest.reportPath, { responseType: 'arraybuffer' });

    const filename = `${labTestId}_encrypted_report.pdf`;
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      cloudinaryResponse.data.byteLength,
    });
    return res.send(Buffer.from(cloudinaryResponse.data));
  } catch (err) {
    console.error('[Lab] patientDownload error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DOCTOR ACTIONS  — OTP-gated download
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/lab/doctor/request-otp/:labTestId
 * Doctor requests an OTP to download a lab test report.
 * OTP is emailed to the doctor's registered email.
 */
exports.doctorRequestOtp = async (req, res) => {
  try {
    const { labTestId } = req.params;
    const { userId, email, name } = req.user;

    const labTest = await LabTest.findOne({ labTestId });
    if (!labTest) return res.status(404).json({ message: 'Lab test not found' });

    if (!labTest.reportPath) {
      return res.status(400).json({ message: 'Report not yet available for this lab test' });
    }

    // Generate 6-digit OTP, valid for 10 minutes
    const otp       = speakeasy.totp({ secret: speakeasy.generateSecret().base32, digits: 6 });
    const expiresAt = Date.now() + 10 * 60 * 1000;

    otpStore.set(String(userId), { otp, labTestId, expiresAt });

    await sendEmail({
      to:      labTest.patientEmail,
      subject: `MediSync — Dr. ${name} is requesting access to your lab report`,
      html: `
        <p>Dear Patient,</p>
        <p>Dr. <strong>${name}</strong> is requesting access to your lab report <strong>${labTestId}</strong>.</p>
        <p>If you authorize this, please provide the doctor with the following OTP:</p>
        <h2 style="letter-spacing:8px;font-size:32px;color:#0D9488">${otp}</h2>
        <p>This OTP expires in <strong>10 minutes</strong>. Do not share it if you do not authorize access.</p>
        <p>MediSync Security Team</p>
      `,
    });

    return res.json({ message: `OTP sent to patient's email`, expiresInMinutes: 10 });
  } catch (err) {
    console.error('[Lab] doctorRequestOtp error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * POST /api/lab/doctor/download/:labTestId
 * Doctor submits OTP and downloads the decrypted report.
 */
exports.doctorDownloadReport = async (req, res) => {
  try {
    const { labTestId }  = req.params;
    const { otp }        = req.body;
    const { userId }     = req.user;

    if (!otp) return res.status(400).json({ message: 'OTP is required' });

    // Verify OTP
    const stored = otpStore.get(String(userId));
    if (!stored) {
      return res.status(401).json({ message: 'No OTP requested. Please request an OTP first.' });
    }
    if (stored.labTestId !== labTestId) {
      return res.status(401).json({ message: 'OTP was issued for a different lab test' });
    }
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(String(userId));
      return res.status(401).json({ message: 'OTP has expired. Please request a new one.' });
    }
    if (stored.otp !== otp) {
      return res.status(401).json({ message: 'Invalid OTP' });
    }

    // OTP valid — consume it (one-time use)
    otpStore.delete(String(userId));

    const labTest = await LabTest.findOne({ labTestId });
    if (!labTest || !labTest.reportPath) {
      return res.status(404).json({ message: 'Report file not found' });
    }

    // Fetch encrypted PDF from Cloudinary
    const cloudinaryResponse = await axios.get(labTest.reportPath, { responseType: 'arraybuffer' });

    // Decrypt via ML engine
    const form = new FormData();
    form.append('pdf',      Buffer.from(cloudinaryResponse.data), { filename: 'encrypted.pdf', contentType: 'application/pdf' });
    form.append('password', labTest.patientNic);

    const mlResponse = await axios.post(
      `${ML_ENGINE}/lab/decrypt-pdf`,
      form,
      { headers: form.getHeaders(), responseType: 'arraybuffer' }
    );

    const filename = `${labTestId}_report_doctor.pdf`;
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      mlResponse.data.byteLength,
    });
    return res.send(Buffer.from(mlResponse.data));
  } catch (err) {
    console.error('[Lab] doctorDownload error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — status check by Lab Test ID only (no auth required)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/public/lab/:labTestId/status
 * Anyone with the Lab Test ID can check the current status (no PII exposed).
 */
exports.publicStatusCheck = async (req, res) => {
  try {
    const { labTestId } = req.params;
    const labTest = await LabTest.findOne({ labTestId })
      .select('labTestId testName testCategory status urgency reportUploadedAt createdAt statusHistory')
      .populate('hospitalId', 'name');

    if (!labTest) return res.status(404).json({ message: 'Lab Test ID not found' });

    return res.json(labTest);
  } catch (err) {
    console.error('[Lab] publicStatus error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal email helper
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_MESSAGES = {
  pending:          { subject: 'Lab Test Registered',       body: 'Your lab test has been registered. Please visit the lab at your convenience.' },
  sample_collected: { subject: 'Sample Collected',          body: 'Your sample has been collected and sent to the lab for analysis.' },
  processing:       { subject: 'Lab Test In Progress',      body: 'Your sample is currently being analysed. Results will be available soon.' },
  report_ready:     { subject: '🎉 Your Report Is Ready',   body: 'Your lab report is ready. Log in to MediSync to download your report securely.' },
  delivered:        { subject: 'Report Delivered',          body: 'Your lab test has been completed and the report has been delivered.' },
};

async function sendStatusEmail(labTest, toEmail, status) {
  try {
    if (!toEmail) return;
    const msg = STATUS_MESSAGES[status];
    if (!msg) return;

    await sendEmail({
      to:      toEmail,
      subject: `MediSync Lab: ${msg.subject} — ${labTest.labTestId}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <div style="background:#0A1628;padding:24px;border-radius:12px 12px 0 0">
            <h2 style="color:#14B8A6;margin:0;font-size:20px">MediSync Lab Results</h2>
          </div>
          <div style="background:#F8FAFC;padding:24px;border-radius:0 0 12px 12px;border:1px solid #E2E8F0;border-top:none">
            <p style="color:#1E293B;font-size:15px">${msg.body}</p>
            <div style="background:#fff;border:1px solid #E2E8F0;border-radius:8px;padding:16px;margin:16px 0">
              <p style="margin:0 0 6px;font-size:12px;color:#64748B">Lab Test ID</p>
              <p style="margin:0;font-size:20px;font-weight:700;letter-spacing:2px;color:#0D9488">${labTest.labTestId}</p>
            </div>
            <p style="margin:0 0 6px;font-size:13px;color:#64748B">Test: <strong style="color:#1E293B">${labTest.testName}</strong></p>
            <p style="margin:0;font-size:11px;color:#94A3B8">Keep your Lab Test ID safe — you need it to check your status.</p>
          </div>
        </div>
      `,
    });
  } catch (err) {
    console.error('[Lab] sendStatusEmail error:', err.message);
    // Don't throw — email failure should not block the API response
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MIGRATION SCRIPT ENDPOINT
// ─────────────────────────────────────────────────────────────────────────────
exports.migrateNic = async (req, res) => {
  try {
    const consults = await Consultation.find({ patientNic_bi: { $exists: false } });
    let c = 0;
    for (const doc of consults) {
      if (typeof doc.decryptFieldsSync === 'function') {
        try { doc.decryptFieldsSync(); } catch(e) {}
      }
      if (!doc.patientNic) continue;
      doc.patientNic_bi = nicHash(doc.patientNic);
      await doc.save();
      c++;
    }

    const prescriptions = await Prescription.find({ patientNic_bi: { $exists: false } });
    let p = 0;
    for (const doc of prescriptions) {
      if (typeof doc.decryptFieldsSync === 'function') {
        try { doc.decryptFieldsSync(); } catch(e) {}
      }
      if (!doc.patientNic) continue;
      doc.patientNic_bi = nicHash(doc.patientNic);
      await doc.save();
      p++;
    }

    return res.json({ message: `Migration complete. Consultations: ${c}, Prescriptions: ${p}` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Migration failed', error: String(err) });
  }
};
