// server/src/controllers/labController.js
const crypto     = require('crypto');
const path       = require('path');
const fs         = require('fs');
const axios      = require('axios');
const FormData   = require('form-data');
const speakeasy  = require('speakeasy');
const cloudinary = require('cloudinary').v2;

const mongoose  = require('mongoose');
const pdfGenerator = require('../utils/pdfGenerator');
const LabTest    = require('../models/LabTest');
const Patient    = require('../models/Patient');
const Consultation = require('../models/Consultation');
const Prescription = require('../models/Prescription');
const Doctor       = require('../models/Doctor');
const Hospital     = require('../models/Hospital');
const Notification = require('../models/Notification');
const { sendEmail } = require('../utils/emailService');
const {
  setOtp,
  getOtp,
  deleteOtp,
  incrementAttempts,
  getAttempts,
  checkOtpRequestThrottle,
  recordOtpRequestSent,
} = require('../config/redis');
const { generateSignedUrl }         = require('../utils/cloudinary');

const ML_ENGINE  = process.env.ML_ENGINE_URL || 'http://127.0.0.1:5001';
const UPLOAD_DIR = path.join(__dirname, '../../uploads/lab-reports');

// ── OTP key prefixes (namespacing within Redis) ──────────────────────────────
const OTP_NS_HOSPITAL = 'hospital:';  // hospital consent OTP
const OTP_NS_DOCTOR   = 'doctor:';    // doctor report-access OTP
const OTP_NS_PATIENT  = 'patient-lab:'; // patient report-download OTP
const OTP_TTL_SECONDS = 600;          // 10 minutes

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
  crypto.createHash('sha256').update(nic ? nic.trim().toUpperCase() : '').digest('hex');

const resolveAuthenticatedPatient = async (reqUser) => {
  let nic = reqUser?.nic || reqUser?.sub || null;
  let patientDoc = null;
  if (reqUser?.id && mongoose.Types.ObjectId.isValid(String(reqUser.id))) {
    patientDoc = await Patient.findById(reqUser.id);
    if (patientDoc && typeof patientDoc.decryptFieldsSync === 'function') {
      try { patientDoc.decryptFieldsSync(); } catch (e) {}
    }
    if (!nic && patientDoc?.nic) {
      nic = patientDoc.nic;
    }
  }
  return { nic: nic || reqUser?.id, patientDoc };
};

/**
 * Universal lookup helper for lab tests by any identifier (_id, labTestId, or reportId)
 */
const findLabTestByIdentifier = async (idParam, nic = null) => {
  if (!idParam) return null;
  const cleanId = String(idParam).trim();
  const isObjId = mongoose.Types.ObjectId.isValid(cleanId);
  const idQuery = {
    $or: [
      { labTestId: cleanId },
      { reportId: cleanId },
      ...(isObjId ? [{ _id: cleanId }] : [])
    ]
  };

  const candidate = await LabTest.findOne(idQuery);
  if (!candidate) {
    return null;
  }

  if (!nic) {
    return candidate;
  }

  const cleanNic  = String(nic).trim().toUpperCase();
  const hashUpper = nicHash(cleanNic);
  const hashRaw   = crypto.createHash('sha256').update(String(nic).trim()).digest('hex');

  if (typeof candidate.decryptFieldsSync === 'function') {
    try { candidate.decryptFieldsSync(); } catch (e) {}
  }

  const candidateNicUpper = String(candidate.patientNic || '').trim().toUpperCase();
  const ownsRecord =
    (candidate.patientNic_bi && (candidate.patientNic_bi === hashUpper || candidate.patientNic_bi === hashRaw)) ||
    (candidateNicUpper && candidateNicUpper === cleanNic);

  return ownsRecord ? candidate : null;
};

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
    const patient = await Patient.findOne({ patientNic_bi: hash });

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
 * POST /api/lab/hospital/request-otp
 * Hospital requests patient consent OTP before registering a lab test.
 * The OTP is emailed to the patient's registered email address.
 */
exports.requestHospitalOtp = async (req, res) => {
  try {
    const rawNic = req.body.nic || req.body.patientNic;
    if (!rawNic) return res.status(400).json({ message: 'Patient NIC is required' });

    const cleanNic = rawNic.trim();
    const hashedNic = crypto.createHash('sha256').update(cleanNic).digest('hex');
    // Fallback query: Check both the blind index AND the raw NIC field. 
    // This handles test accounts that were seeded before patientNic_bi was implemented.
    const patient = await Patient.findOne({ 
      $or: [
        { patientNic_bi: hashedNic },
        { nic: cleanNic }
      ]
    });

    if (!patient) {
      return res.status(404).json({ message: 'No registered patient found with this NIC' });
    }

    const otpKey = OTP_NS_HOSPITAL + hashedNic;
    const throttle = await checkOtpRequestThrottle({
      accountKey: otpKey,
      ipKey: req.ip,
      attemptKey: otpKey,
    });
    if (!throttle.allowed) {
      return res.status(throttle.status).json({
        message: throttle.message,
        retryAfterSeconds: throttle.retryAfterSeconds,
      });
    }

    // Generate 6-digit OTP, valid for 10 minutes
    const otp       = speakeasy.totp({ secret: speakeasy.generateSecret().base32, digits: 6 });
    const expiresAt = Date.now() + OTP_TTL_SECONDS * 1000;

    const emailResult = await sendEmail({
      to:      patient.email,
      timeSensitive: true,
      isOtp: true,
      subject: 'MediSync — Consent Required for Lab Test Registration',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <div style="background:#0A1628;padding:24px;border-radius:12px 12px 0 0">
            <h2 style="color:#14B8A6;margin:0;font-size:20px">MediSync Lab — Patient Consent</h2>
          </div>
          <div style="background:#F8FAFC;padding:24px;border-radius:0 0 12px 12px;border:1px solid #E2E8F0;border-top:none">
            <p style="color:#1E293B;font-size:15px">A hospital is requesting your consent to register a new lab test on your behalf.</p>
            <p style="color:#1E293B;font-size:15px">If you authorize this, please provide the following OTP to the hospital staff:</p>
            <h2 style="letter-spacing:8px;font-size:32px;color:#0D9488;text-align:center;margin:24px 0">${otp}</h2>
            <p style="color:#64748B;font-size:13px;text-align:center">This OTP expires in <strong>10 minutes</strong>. Do not share it if you do not authorize this test.</p>
            <p style="margin:16px 0 0;font-size:11px;color:#94A3B8;text-align:center">MediSync Security Team</p>
          </div>
        </div>
      `,
    });

    if (!emailResult?.success || !emailResult?.providerAccepted) {
      await deleteOtp(otpKey, { clearAttempts: false });
      const status =
        emailResult?.errorCode === 'invalid_recipient' ||
        emailResult?.errorCode === 'permanent_validation_failure'
          ? 400
          : emailResult?.errorCode === 'ambiguous_timeout'
            ? 504
            : emailResult?.statusCode || 503;
      return res.status(status).json({
        success: false,
        providerAccepted: false,
        deliveryQueued: Boolean(emailResult?.deliveryQueued),
        deliveryConfirmed: false,
        errorCode: emailResult?.errorCode || 'email_delivery_failed',
        message:
          emailResult?.error ||
          'Unable to send consent OTP email at this time. Please try again shortly.',
      });
    }

    await setOtp(otpKey, { otp, expiresAt }, OTP_TTL_SECONDS);
    await recordOtpRequestSent({ accountKey: otpKey, ipKey: req.ip });

    return res.json({
      message: 'Consent OTP sent to patient email',
      expiresInMinutes: 10,
      providerAccepted: true,
      deliveryQueued: false,
      deliveryConfirmed: false,
      provider: emailResult.provider,
      fallbackUsed: Boolean(emailResult.fallbackUsed),
      messageId: emailResult.messageId,
      patientName: patient.name,
      patientEmail: patient.email,
    });
  } catch (err) {
    console.error('[Lab] requestHospitalOtp error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * POST /api/lab/accept
 * Hospital accepts a lab test for a patient.
 * Requires a verified consent OTP from the patient before creating the test.
 * Generates unique labTestId and sends confirmation email to patient.
 */
exports.acceptLabTest = async (req, res) => {
  try {
    const { nic, testName, testCategory, urgency, notes, referredBy, otp } = req.body;
    const userId = req.user.id;
    const hospitalId = req.user.id;

    if (!nic || !testName) {
      return res.status(400).json({ message: 'NIC and test name are required' });
    }

    // ── OTP Verification ────────────────────────────────────────────────────
    const hash = nicHash(nic);

    if (!otp) {
      return res.status(400).json({ message: 'Patient consent OTP is required' });
    }

    const attempts = await getAttempts(OTP_NS_HOSPITAL + hash);
    if (attempts >= 5) {
      return res.status(429).json({ message: 'Too many failed OTP attempts. Please try again later.' });
    }

    const storedOtp = await getOtp(OTP_NS_HOSPITAL + hash);
    if (!storedOtp) {
      return res.status(401).json({ message: 'No OTP found. Please request a consent OTP first.' });
    }
    if (Date.now() > storedOtp.expiresAt) {
      await deleteOtp(OTP_NS_HOSPITAL + hash, { clearAttempts: false });
      return res.status(401).json({ message: 'OTP has expired. Please request a new one.' });
    }
    if (storedOtp.otp !== otp) {
      await incrementAttempts(OTP_NS_HOSPITAL + hash);
      return res.status(401).json({ message: 'Invalid OTP' });
    }
    // OTP valid — consume it (one-time use)
    await deleteOtp(OTP_NS_HOSPITAL + hash, { clearAttempts: true });

    // ── Resolve patient details ─────────────────────────────────────────────
    const patient = await Patient.findOne({ patientNic_bi: hash });
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    // Create lab test — labTestId auto-generated in schema default
    const labTest = await LabTest.create({
      patientNic:     nic,
      patientNic_bi:  hash,
      patientName:    patient.fullName || patient.name,
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

    // Resolve doctor name if referredBy is provided
    let doctorName = 'N/A';
    if (referredBy) {
      const doc = await Doctor.findOne({ _id: referredBy });
      if (doc) doctorName = doc.name;
    }

    // Prepare email HTML template
    const emailHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden">
        <div style="background:#0A1628;padding:24px;text-align:center">
          <h2 style="color:#14B8A6;margin:0;font-size:24px">Lab Test Registered</h2>
        </div>
        <div style="background:#F8FAFC;padding:32px">
          <p style="color:#1E293B;font-size:16px;margin-bottom:24px">A new lab test has been successfully registered.</p>
          
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
            <tr>
              <td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#64748B;font-weight:bold;width:140px">Lab Test ID</td>
              <td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#0F172A;font-weight:bold;font-size:18px;font-family:monospace">${labTest.labTestId}</td>
            </tr>
            <tr>
              <td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#64748B;font-weight:bold">Patient Name</td>
              <td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#0F172A">${patient.name}</td>
            </tr>
            <tr>
              <td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#64748B;font-weight:bold">Doctor (Referee)</td>
              <td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#0F172A">${doctorName}</td>
            </tr>
            <tr>
              <td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#64748B;font-weight:bold">Test Name</td>
              <td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#0F172A">${testName} (${testCategory || 'Other'})</td>
            </tr>
            <tr>
              <td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#64748B;font-weight:bold">Approved By</td>
              <td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#0F172A">${req.user.name || req.user.email} (Hospital Admin)</td>
            </tr>
          </table>

          <p style="color:#64748B;font-size:14px;text-align:center">Please provide this Lab Test ID to the lab assistant to process the sample and upload the report.</p>
        </div>
      </div>
    `;

    // Send confirmation email to patient
    await sendEmail({
      to: patient.email,
      subject: `MediSync Lab: Lab Test Registered — ${labTest.labTestId}`,
      html: emailHtml
    });

    // Send confirmation email to hospital admin
    await sendEmail({
      to: req.user.email,
      subject: `MediSync Lab: New Test Registered — ${labTest.labTestId}`,
      html: emailHtml
    });

    return res.status(201).json({
      message:   'Lab test registered successfully',
      labTestId: labTest.labTestId,
    });
  } catch (err) {
    console.error('[Lab] acceptLabTest error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// APPROVAL WORKFLOW — Doctor-prescribed test approval
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/lab/hospital/pending-tests
 * Fetch all pending lab tests for a patient by NIC (blind index lookup).
 * Used by the hospital to see which tests the doctor prescribed.
 */
exports.getPendingTests = async (req, res) => {
  try {
    const rawNic = req.body.nic || req.body.patientNic;
    if (!rawNic) return res.status(400).json({ message: 'Patient NIC is required' });

    const cleanNic = rawNic.trim();
    const hashedNic = crypto.createHash('sha256').update(cleanNic).digest('hex');

    const pendingTests = await LabTest.find({
      $or: [{ patientNic_bi: hashedNic }, { patientNic: cleanNic }],
      status: 'pending',
    })
      .sort({ createdAt: -1 })
      .select('labTestId testName testCategory urgency notes status createdAt referredBy')
      .populate('referredBy', 'fullName specialization')
      .populate('hospitalId', 'name');

    return res.json({
      count: pendingTests.length,
      tests: pendingTests,
    });
  } catch (err) {
    console.error('[Lab] getPendingTests error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * POST /api/lab/hospital/verify-fetch-tests
 * Verify the patient consent OTP, and if valid, return pending tests.
 * This secures the flow so tests are not visible until OTP is verified.
 */
exports.verifyOtpAndFetchTests = async (req, res) => {
  try {
    const { nic, otp } = req.body;
    if (!nic || !otp) return res.status(400).json({ message: 'NIC and OTP are required' });

    const cleanNic = nic.trim();
    const hashedNic = crypto.createHash('sha256').update(cleanNic).digest('hex');

    // ── OTP Verification ──────────────────────────────────────────────────────
    const attempts = await getAttempts(OTP_NS_HOSPITAL + hashedNic);
    if (attempts >= 5) {
      return res.status(429).json({ message: 'Too many failed OTP attempts. Please try again later.' });
    }

    const storedOtp = await getOtp(OTP_NS_HOSPITAL + hashedNic);
    if (!storedOtp) {
      return res.status(401).json({ message: 'No OTP found. Please request a consent OTP first.' });
    }
    if (Date.now() > storedOtp.expiresAt) {
      await deleteOtp(OTP_NS_HOSPITAL + hashedNic, { clearAttempts: false });
      return res.status(401).json({ message: 'OTP has expired. Please request a new one.' });
    }
    if (String(storedOtp.otp).trim() !== String(otp).trim()) {
      await incrementAttempts(OTP_NS_HOSPITAL + hashedNic);
      return res.status(401).json({ message: 'Invalid OTP' });
    }

    // OTP is valid. We do NOT delete it here, so it can be used for approvals.
    
    // Fetch pending tests
    const pendingTests = await LabTest.find({
      $or: [{ patientNic_bi: hashedNic }, { patientNic: cleanNic }],
      status: 'pending',
    })
      .sort({ createdAt: -1 })
      .select('labTestId testName testCategory urgency notes status createdAt referredBy')
      .populate('referredBy', 'fullName specialization')
      .populate('hospitalId', 'name');

    return res.json({
      count: pendingTests.length,
      tests: pendingTests,
    });
  } catch (err) {
    console.error('[Lab] verifyOtpAndFetchTests error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * POST /api/lab/hospital/approve-test
 * Hospital approves a doctor-prescribed test.
 * Requires: testId (LabTest _id), nic, otp.
 * Generates a unique reportId, sets status to 'Approved',
 * and sends confirmation emails to patient and hospital admin.
 */
exports.approveTest = async (req, res) => {
  try {
    const { testId, nic, otp } = req.body;
    const userId = req.user.id;
    const hospitalId = req.user.id;

    if (!testId || !nic || !otp) {
      return res.status(400).json({ message: 'testId, nic, and otp are all required' });
    }

    const cleanNic = nic.trim();
    const hashedNic = crypto.createHash('sha256').update(cleanNic).digest('hex');

    // ── OTP Verification ──────────────────────────────────────────────────────
    const attempts = await getAttempts(OTP_NS_HOSPITAL + hashedNic);
    if (attempts >= 5) {
      return res.status(429).json({ message: 'Too many failed OTP attempts. Please try again later.' });
    }

    const storedOtp = await getOtp(OTP_NS_HOSPITAL + hashedNic);
    if (!storedOtp) {
      return res.status(401).json({ message: 'No OTP found. Please request a consent OTP first.' });
    }
    if (Date.now() > storedOtp.expiresAt) {
      await deleteOtp(OTP_NS_HOSPITAL + hashedNic, { clearAttempts: false });
      return res.status(401).json({ message: 'OTP has expired. Please request a new one.' });
    }
    if (String(storedOtp.otp).trim() !== String(otp).trim()) {
      await incrementAttempts(OTP_NS_HOSPITAL + hashedNic);
      return res.status(401).json({ message: 'Invalid OTP' });
    }
    // OTP valid — consume it
    await deleteOtp(OTP_NS_HOSPITAL + hashedNic);

    // ── Find and update the lab test ──────────────────────────────────────────
    const labTest = await LabTest.findById(testId);
    if (!labTest) {
      return res.status(404).json({ message: 'Lab test not found' });
    }
    if (labTest.status !== 'pending') {
      return res.status(400).json({ message: `Test is already "${labTest.status}", cannot approve` });
    }

    // Generate unique Report ID: LAB-2026-<8 hex chars>
    const year = new Date().getFullYear();
    const hex  = crypto.randomBytes(4).toString('hex');
    const reportId = `LAB-${year}-${hex}`;

    // ── Resolve names for emails and save them to the LabTest record ──────────
    const patient = await Patient.findOne({
      $or: [{ patientNic_bi: hashedNic }, { nic: cleanNic }],
    });

    labTest.status   = 'Approved';
    labTest.reportId = reportId;
    labTest.acceptedBy = userId;
    if (hospitalId) labTest.hospitalId = hospitalId;
    if (patient) {
      labTest.patientName = patient.fullName;
      labTest.patientEmail = patient.email;
    }
    labTest.statusHistory.push({
      status:    'Approved',
      changedBy: userId,
      note:      'Test approved by hospital — Report ID generated',
    });
    await labTest.save();

    let doctorName = 'N/A';
    if (labTest.referredBy) {
      const doc = await Doctor.findById(labTest.referredBy);
      if (doc) doctorName = doc.fullName || doc.name || 'Doctor';
    }

    // ── Send approval emails ──────────────────────────────────────────────────
    const emailHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden">
        <div style="background:#0A1628;padding:24px;text-align:center">
          <h2 style="color:#14B8A6;margin:0;font-size:24px">Lab Test Approved ✅</h2>
        </div>
        <div style="background:#F8FAFC;padding:32px">
          <p style="color:#1E293B;font-size:16px;margin-bottom:24px">A lab test has been approved and is ready for sample collection.</p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
            <tr>
              <td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#64748B;font-weight:bold;width:140px">Report ID</td>
              <td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#0F172A;font-weight:bold;font-size:18px;font-family:monospace">${reportId}</td>
            </tr>
            <tr>
              <td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#64748B;font-weight:bold">Lab Test ID</td>
              <td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#0F172A;font-family:monospace">${labTest.labTestId}</td>
            </tr>
            <tr>
              <td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#64748B;font-weight:bold">Test Name</td>
              <td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#0F172A">${labTest.testName}</td>
            </tr>
            <tr>
              <td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#64748B;font-weight:bold">Prescribing Doctor</td>
              <td style="padding:12px;border-bottom:1px solid #E2E8F0;color:#0F172A">${doctorName}</td>
            </tr>
          </table>
          <p style="color:#64748B;font-size:14px;text-align:center">Please provide the Report ID to the lab assistant for sample processing.</p>
        </div>
      </div>
    `;

    // Email patient
    if (patient && patient.email) {
      await sendEmail({
        to: patient.email,
        subject: `MediSync Lab: Test Approved — Report ID: ${reportId}`,
        html: emailHtml,
      }).catch(e => console.error('[Lab] Patient email failed:', e.message));
    }

    // Email hospital admin
    if (req.user.email) {
      await sendEmail({
        to: req.user.email,
        subject: `MediSync Lab: Test Approved — ${labTest.labTestId}`,
        html: emailHtml,
      }).catch(e => console.error('[Lab] Hospital email failed:', e.message));
    }

    // ── Send real-time notification to patient ────────────────────────────────
    if (patient) {
      try {
        const io = req.app.get('io');
        const notif = await Notification.create({
          userId:      patient._id,
          role:        'patient',
          title:       'Lab Test Approved',
          message:     `Your lab test "${labTest.testName}" has been approved. Report ID: ${reportId}`,
          type:        'lab_test_approved',
          referenceId: reportId,
          actionLink:  '/patient/lab-results',
        });
        // Push real-time if patient is connected
        if (io && io.userSocketMap) {
          const socketId = io.userSocketMap.get(String(patient._id));
          if (socketId) io.to(socketId).emit('notification', notif);
        }
      } catch (notifErr) {
        console.error('[Lab] Notification error (non-fatal):', notifErr.message);
      }
    }

    return res.json({
      message:   'Lab test approved successfully',
      reportId,
      labTestId: labTest.labTestId,
      testName:  labTest.testName,
    });
  } catch (err) {
    console.error('[Lab] approveTest error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * GET /api/lab/assistant/test/:reportId
 * Lab Assistant searches for a test by its Report ID.
 * Returns the test details so the assistant can upload the PDF report.
 */
exports.getTestByReportId = async (req, res) => {
  try {
    const { reportId } = req.params;
    if (!reportId) return res.status(400).json({ message: 'Report ID is required' });

    const labTest = await findLabTestByIdentifier(reportId);
    if (!labTest) {
      return res.status(404).json({ message: 'No lab test found with this Report ID' });
    }

    return res.json(labTest);
  } catch (err) {
    console.error('[Lab] getTestByReportId error:', err);
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
    const userId = req.user.id;

    const VALID = ['pending', 'Approved', 'sample_collected', 'processing', 'report_ready', 'delivered'];
    if (!VALID.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const labTest = await findLabTestByIdentifier(labTestId);
    if (!labTest) return res.status(404).json({ message: 'Lab test not found' });

    if (typeof labTest.decryptFieldsSync === 'function') {
      try { labTest.decryptFieldsSync(); } catch (e) {}
    }
    const toEmail = labTest.patientEmail; // Capture decrypted email before save encrypts in-place
    labTest.status = status;
    labTest.statusHistory.push({ status, changedBy: userId, note: note || '' });
    await labTest.save();

    // Email patient on every status change
    await sendStatusEmail(labTest, toEmail, status);

    return res.json({ message: `Status updated to "${status}"`, labTestId });
  } catch (err) {
    console.error('[Lab] updateStatus error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * POST /api/lab/:labTestId/upload-report
 * Lab Assistant uploads the PDF report.
 * Uses envelope encryption: AES-256-GCM encrypts the file buffer in memory,
 * then the encrypted blob is pushed to Cloudinary.
 * The per-file AES key is encrypted with the Vault master key before DB storage.
 */
exports.uploadReport = async (req, res) => {
  try {
    const { labTestId } = req.params;
    if (!req.file) return res.status(400).json({ message: 'No PDF file uploaded' });

    const labTest = await findLabTestByIdentifier(labTestId);
    if (!labTest) return res.status(404).json({ message: 'Lab test not found' });

    // ── Step 1: Envelope Encryption — encrypt PDF in memory ─────────────────
    const fileKey = crypto.randomBytes(32);   // unique 32-byte AES-256 key for this file
    const iv      = crypto.randomBytes(12);   // 12-byte IV for GCM

    const cipher     = crypto.createCipheriv('aes-256-gcm', fileKey, iv);
    const encrypted  = Buffer.concat([cipher.update(req.file.buffer), cipher.final()]);
    const authTag    = cipher.getAuthTag();    // 16 bytes

    // Combine: [authTag (16 bytes) | ciphertext]
    const encryptedBlob = Buffer.concat([authTag, encrypted]);

    // ── Step 2: Upload encrypted blob to Cloudinary (authenticated) ─────────
    const uploadPromise = new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: 'raw', type: 'authenticated', folder: 'medisync/lab-reports' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(encryptedBlob);
    });

    const cloudinaryResult = await uploadPromise;

    // ── Step 3: Encrypt the file key with the Vault master key ──────────────
    const masterKey = global.ENCRYPTION_KEYS ? global.ENCRYPTION_KEYS[global.ACTIVE_KEY_VERSION] : (global.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY);
    const masterKeyBuf = Buffer.from(masterKey, 'utf-8').slice(0, 32); // ensure 32 bytes
    const cbcIV        = crypto.randomBytes(16);
    const keyCipher    = crypto.createCipheriv('aes-256-cbc', masterKeyBuf, cbcIV);
    keyCipher.setAutoPadding(false);
    const wrappedKey   = Buffer.concat([keyCipher.update(fileKey), keyCipher.final()]);

    // ── Step 4: Update lab test record ──────────────────────────────────────
    const toEmail = labTest.patientEmail; // Capture decrypted email before save encrypts in-place
    labTest.reportPath         = cloudinaryResult.secure_url;
    labTest.reportPublicId     = cloudinaryResult.public_id;
    labTest.reportOriginalName = req.file.originalname;
    labTest.reportUploadedAt   = new Date();
    labTest.encryptedFileKey   = cbcIV.toString('hex') + wrappedKey.toString('hex');
    labTest.fileIV             = iv.toString('hex');
    labTest.status             = 'report_ready';
    labTest.statusHistory.push({
      status:    'report_ready',
      changedBy: req.user.id,
      note:      'Report uploaded with envelope encryption',
    });
    await labTest.save();

    // Email patient that report is ready
    await sendStatusEmail(labTest, toEmail, 'report_ready');

    // ── Send real-time notification to patient ──────────────────────────────
    try {
      const patient = await Patient.findOne({
        $or: [
          { patientNic_bi: labTest.patientNic_bi },
          { nic: labTest.patientNic },
        ],
      });
      if (patient) {
        const io = req.app.get('io');
        const notif = await Notification.create({
          userId:      patient._id,
          role:        'patient',
          title:       'Lab Report Ready',
          message:     `Your lab report for "${labTest.testName}" is ready to download.`,
          type:        'lab_report_ready',
          referenceId: labTest.reportId || labTest.labTestId,
          actionLink:  '/patient/lab-results',
        });
        if (io && io.userSocketMap) {
          const socketId = io.userSocketMap.get(String(patient._id));
          if (socketId) io.to(socketId).emit('notification', notif);
        }
      }
    } catch (notifErr) {
      console.error('[Lab] Notification error (non-fatal):', notifErr.message);
    }

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
    const hospitalId = req.user.id;
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
    const { nic } = await resolveAuthenticatedPatient(req.user);
    const hash = nicHash(nic);

    const tests = await LabTest.find({ patientNic_bi: hash })
      .sort({ createdAt: -1 })
      .select('labTestId reportId testName testCategory status urgency reportUploadedAt createdAt statusHistory')
      .populate('hospitalId', 'name address')
      .populate('referredBy', 'name specialization');

    return res.json(tests);
  } catch (err) {
    console.error('[Lab] getMyLabTests error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * POST /api/lab/patient/request-otp/:reportId
 * Patient requests an OTP to download their own lab report.
 */
exports.patientRequestOtp = async (req, res) => {
  try {
    const idParam = req.params.reportId || req.params.labTestId;
    const { nic, patientDoc } = await resolveAuthenticatedPatient(req.user);

    const labTest = await findLabTestByIdentifier(idParam, nic);
    if (!labTest) {
      return res.status(404).json({ message: 'Lab test not found or not linked to your account' });
    }

    if (typeof labTest.decryptFieldsSync === 'function') {
      try { labTest.decryptFieldsSync(); } catch (e) {}
    }

    let patientEmail = patientDoc?.email || labTest.patientEmail || req.user?.email;
    if (!patientEmail && labTest.patientNic_bi) {
      const linkedPatient = await Patient.findOne({ patientNic_bi: labTest.patientNic_bi });
      if (linkedPatient) {
        if (typeof linkedPatient.decryptFieldsSync === 'function') {
          try { linkedPatient.decryptFieldsSync(); } catch (e) {}
        }
        patientEmail = linkedPatient.email;
      }
    }

    if (!patientEmail) {
      return res.status(400).json({ message: 'Patient email contact not found' });
    }

    const otpKey      = `${OTP_NS_PATIENT}${String(req.user.id)}:${String(labTest._id)}`;
    const fallbackKey = `${OTP_NS_PATIENT}${String(req.user.id)}`;

    if ((await getAttempts(fallbackKey)) >= 5) {
      return res.status(429).json({
        message: 'Too many failed OTP attempts. Please wait before requesting a new OTP.',
        errorCode: 'otp_attempts_locked',
      });
    }

    const throttle = await checkOtpRequestThrottle(otpKey, req.ip);
    if (!throttle.allowed) {
      return res.status(throttle.statusCode).json({
        message: throttle.message,
        retryAfterSeconds: throttle.retryAfterSeconds,
        errorCode: throttle.reason,
      });
    }

    const otp       = speakeasy.totp({ secret: speakeasy.generateSecret().base32, digits: 6 });
    const expiresAt = Date.now() + OTP_TTL_SECONDS * 1000;

    await setOtp(
      otpKey,
      {
        otp,
        purpose: 'patient-lab-download',
        patientId: String(req.user.id),
        patientNicBi: labTest.patientNic_bi,
        labTestId: labTest.labTestId,
        reportId: labTest.reportId,
        testObjectId: String(labTest._id),
        expiresAt,
      },
      OTP_TTL_SECONDS
    );

    const emailResult = await sendEmail({
      to:      patientEmail,
      subject: `MediSync — Lab Report Download Verification Code (${labTest.reportId || labTest.labTestId})`,
      html: `
        <p>Dear Patient,</p>
        <p>You requested to download your lab report <strong>${labTest.reportId || labTest.labTestId}</strong> (${labTest.testName || 'Lab Test'}).</p>
        <p>Please enter the following 6-digit verification code to complete your download:</p>
        <h2 style="letter-spacing:8px;font-size:32px;color:#0D9488">${otp}</h2>
        <p>This OTP expires in <strong>10 minutes</strong> and can only be used once.</p>
        <p>MediSync Security Team</p>
      `,
      timeSensitive: true,
      isOtp: true,
    });

    if (!emailResult || !emailResult.providerAccepted) {
      await deleteOtp(otpKey, { clearAttempts: false });
      return res.status(emailResult?.statusCode || 503).json({
        message: emailResult?.errorCode === 'invalid_recipient'
          ? 'Invalid patient email address.'
          : 'Unable to deliver verification OTP email right now. Please try again shortly.',
        providerAccepted: false,
        deliveryQueued: Boolean(emailResult?.deliveryQueued),
        deliveryConfirmed: false,
        errorCode: emailResult?.errorCode || 'email_delivery_failed',
      });
    }

    await recordOtpRequestSent(otpKey, req.ip);

    return res.json({
      message: 'Verification OTP sent to your registered email',
      expiresInMinutes: 10,
      providerAccepted: true,
      deliveryQueued: Boolean(emailResult.deliveryQueued),
      deliveryConfirmed: false,
      provider: emailResult.provider,
      fallbackUsed: Boolean(emailResult.fallbackUsed),
    });
  } catch (err) {
    console.error('[Lab] patientRequestOtp error:', err);
    return res.status(500).json({ message: 'Server error requesting lab report OTP' });
  }
};

// Atomic in-flight OTP verification lock to prevent concurrent single-OTP race conditions
const inFlightOtpVerifications = new Set();

/**
 * GET/POST /api/lab/patient/download/:labTestId
 * GET/POST /api/lab/patient/download-report/:reportId
 * Patient downloads their PDF report after strict ownership + OTP verification.
 */
exports.patientDownloadReport = async (req, res) => {
  try {
    if (req.query && req.query.otp !== undefined) {
      return res.status(400).json({ message: 'Security policy violation: OTP must not be passed in URL query parameters' });
    }

    const idParam = req.params.labTestId || req.params.reportId;
    const { nic } = await resolveAuthenticatedPatient(req.user);

    const labTest = await findLabTestByIdentifier(idParam, nic);

    if (!labTest) {
      return res.status(404).json({ message: 'Lab test not found or not linked to your account' });
    }

    const otp = req.body?.otp || req.headers['x-lab-otp'];
    if (!otp) {
      return res.status(400).json({ message: 'OTP verification is required to download this lab report' });
    }

    const primaryKey  = `${OTP_NS_PATIENT}${String(req.user.id)}:${String(labTest._id)}`;
    const fallbackKey = `${OTP_NS_PATIENT}${String(req.user.id)}`;
    const lockKey     = `patient:${String(req.user.id)}:${String(labTest._id)}`;

    if (inFlightOtpVerifications.has(lockKey)) {
      return res.status(401).json({ message: 'OTP has already been used or verification is in progress.' });
    }
    inFlightOtpVerifications.add(lockKey);

    try {
      const attempts = Math.max(await getAttempts(primaryKey), await getAttempts(fallbackKey));
      if (attempts >= 5) {
        return res.status(429).json({ message: 'Too many failed OTP attempts. Please request a new OTP.' });
      }

      let activeKey = primaryKey;
      let stored = await getOtp(primaryKey);
      if (!stored) {
        stored = await getOtp(fallbackKey);
        if (stored) activeKey = fallbackKey;
      }

      if (!stored) {
        return res.status(401).json({ message: 'No active OTP found or OTP has already been used. Please request a new OTP.' });
      }

      if (stored.purpose && stored.purpose !== 'patient-lab-download') {
        return res.status(401).json({ message: 'OTP purpose mismatch for patient lab report download' });
      }

      if (stored.patientId && String(stored.patientId) !== String(req.user.id)) {
        return res.status(401).json({ message: 'OTP was issued for a different patient account' });
      }

      const matchesReport =
        (stored.testObjectId && stored.testObjectId === String(labTest._id)) ||
        (stored.labTestId && (stored.labTestId === labTest.labTestId || stored.labTestId === idParam)) ||
        (stored.reportId && (stored.reportId === labTest.reportId || stored.reportId === idParam));

      if (!matchesReport) {
        return res.status(401).json({ message: 'OTP was issued for a different lab report' });
      }

      if (Date.now() > stored.expiresAt) {
        await deleteOtp(activeKey, { clearAttempts: false });
        return res.status(401).json({ message: 'OTP has expired. Please request a new one.' });
      }

      if (String(stored.otp).trim() !== String(otp).trim()) {
        await incrementAttempts(activeKey);
        return res.status(401).json({ message: 'Invalid OTP code. Please check and try again.' });
      }

      // Consume OTP immediately (one-time use — prevents replay)
      await deleteOtp(activeKey);
      if (activeKey !== primaryKey) {
        await deleteOtp(primaryKey);
      }
    } finally {
      inFlightOtpVerifications.delete(lockKey);
    }

    let pdfBuffer;
    if (labTest.reportPath) {
      try {
        const downloadUrl = labTest.reportPublicId
          ? generateSignedUrl(labTest.reportPublicId, { resource_type: 'raw', type: 'authenticated', expires_at: Math.floor(Date.now() / 1000) + 300 })
          : labTest.reportPath;

        const cloudinaryResponse = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
        pdfBuffer = Buffer.from(cloudinaryResponse.data);

        if (labTest.encryptedFileKey && labTest.fileIV) {
          const version = labTest.keyVersion || 1;
          const masterKey = global.ENCRYPTION_KEYS ? global.ENCRYPTION_KEYS[version] : (global.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY);
          const masterKeyBuf = Buffer.from(masterKey, 'utf-8').slice(0, 32);

          const cbcIvHex     = labTest.encryptedFileKey.substring(0, 32);
          const wrappedKeyHex = labTest.encryptedFileKey.substring(32);
          const cbcIV        = Buffer.from(cbcIvHex, 'hex');
          const wrappedKey   = Buffer.from(wrappedKeyHex, 'hex');

          const keyDecipher  = crypto.createDecipheriv('aes-256-cbc', masterKeyBuf, cbcIV);
          keyDecipher.setAutoPadding(false);
          const fileKey      = Buffer.concat([keyDecipher.update(wrappedKey), keyDecipher.final()]);

          const iv         = Buffer.from(labTest.fileIV, 'hex');
          const authTag    = pdfBuffer.slice(0, 16);
          const ciphertext = pdfBuffer.slice(16);
          const decipher   = crypto.createDecipheriv('aes-256-gcm', fileKey, iv);
          decipher.setAuthTag(authTag);
          pdfBuffer = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        }
      } catch (cloudErr) {
        console.warn('[Lab] Cloudinary download failed, generating PDF summary:', cloudErr.message);
        pdfBuffer = await pdfGenerator.generateLabReportPDF(labTest, labTest.patientName || 'Patient');
      }
    } else {
      pdfBuffer = await pdfGenerator.generateLabReportPDF(labTest, labTest.patientName || 'Patient');
    }

    const filename = `${idParam}_report.pdf`;
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      pdfBuffer.byteLength,
      'Cache-Control':       'private, no-store, no-cache, must-revalidate',
      'Pragma':              'no-cache',
      'Expires':             '0',
    });
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[Lab] patientDownload error:', err);
    return res.status(500).json({ message: 'Server error downloading lab report' });
  }
};

exports.patientDownloadReportByReportId = exports.patientDownloadReport;

// ─────────────────────────────────────────────────────────────────────────────
// DOCTOR ACTIONS  — OTP-gated download
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/lab/doctor/request-otp/:labTestId
 * Doctor requests an OTP to download a lab test report.
 * OTP is emailed to the patient's registered email.
 */
exports.doctorRequestOtp = async (req, res) => {
  try {
    const { labTestId } = req.params;
    const userId = req.user.id;

    const labTest = await findLabTestByIdentifier(labTestId);
    if (!labTest) return res.status(404).json({ message: 'Lab test not found' });

    // Decrypt fields since patientEmail is encrypted
    if (typeof labTest.decryptFieldsSync === 'function') {
      try { labTest.decryptFieldsSync(); } catch (e) {}
    }

    let patientEmail = labTest.patientEmail;
    if (!patientEmail) {
      const Patient = require('../models/Patient');
      const patient = await Patient.findOne({ patientNic_bi: labTest.patientNic_bi });
      if (patient) {
        patientEmail = patient.email;
      }
    }

    if (!patientEmail) {
      return res.status(400).json({ message: 'Patient email contact not found' });
    }

    if (!labTest.reportPath) {
      return res.status(400).json({ message: 'Report not yet available for this lab test' });
    }

    const otpKey = OTP_NS_DOCTOR + String(userId);
    const throttle = await checkOtpRequestThrottle(otpKey, req.ip);
    if (!throttle.allowed) {
      return res.status(throttle.statusCode).json({
        message: throttle.message,
        retryAfterSeconds: throttle.retryAfterSeconds,
        errorCode: throttle.reason,
      });
    }

    // Get doctor name for email
    const Doctor = require('../models/Doctor');
    const doctor = await Doctor.findById(userId);
    const doctorName = doctor ? doctor.fullName : 'Doctor';

    // Generate 6-digit OTP, valid for 10 minutes
    const otp       = speakeasy.totp({ secret: speakeasy.generateSecret().base32, digits: 6 });
    const expiresAt = Date.now() + OTP_TTL_SECONDS * 1000;

    await setOtp(
      otpKey,
      {
        otp,
        purpose: 'doctor-lab-download',
        doctorId: String(userId),
        labTestId: labTest.labTestId,
        reportId: labTest.reportId,
        testObjectId: String(labTest._id),
        expiresAt,
      },
      OTP_TTL_SECONDS
    );

    const emailResult = await sendEmail({
      to:      patientEmail,
      subject: `MediSync — Dr. ${doctorName} is requesting access to your lab report`,
      html: `
        <p>Dear Patient,</p>
        <p>Dr. <strong>${doctorName}</strong> is requesting access to your lab report <strong>${labTest.labTestId}</strong>.</p>
        <p>If you authorize this, please provide the doctor with the following OTP:</p>
        <h2 style="letter-spacing:8px;font-size:32px;color:#0D9488">${otp}</h2>
        <p>This OTP expires in <strong>10 minutes</strong>. Do not share it if you do not authorize access.</p>
        <p>MediSync Security Team</p>
      `,
      timeSensitive: true,
      isOtp: true,
    });

    if (!emailResult || !emailResult.providerAccepted) {
      await deleteOtp(otpKey, { clearAttempts: false });
      return res.status(emailResult?.statusCode || 503).json({
        message: emailResult?.errorCode === 'invalid_recipient'
          ? 'Invalid patient email address.'
          : 'Unable to deliver verification OTP email right now. Please try again shortly.',
        providerAccepted: false,
        deliveryQueued: Boolean(emailResult?.deliveryQueued),
        deliveryConfirmed: false,
        errorCode: emailResult?.errorCode || 'email_delivery_failed',
      });
    }

    await recordOtpRequestSent(otpKey, req.ip);

    return res.json({
      message: `OTP sent to patient's email`,
      expiresInMinutes: 10,
      providerAccepted: true,
      deliveryQueued: Boolean(emailResult.deliveryQueued),
      deliveryConfirmed: false,
      provider: emailResult.provider,
      fallbackUsed: Boolean(emailResult.fallbackUsed),
    });
  } catch (err) {
    console.error('[Lab] doctorRequestOtp error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * POST /api/lab/doctor/download/:labTestId
 * Doctor submits OTP and downloads the decrypted report.
 * Uses envelope decryption for new uploads, falls back to ML engine for legacy.
 */
exports.doctorDownloadReport = async (req, res) => {
  try {
    if (req.query && req.query.otp !== undefined) {
      return res.status(400).json({ message: 'Security policy violation: OTP must not be passed in URL query parameters' });
    }

    const { labTestId }  = req.params;
    const { otp }        = req.body;
    const userId         = req.user.id;

    if (!otp) return res.status(400).json({ message: 'OTP is required' });

    const otpKey  = OTP_NS_DOCTOR + String(userId);
    const lockKey = `doctor:${String(userId)}`;

    if (inFlightOtpVerifications.has(lockKey)) {
      return res.status(401).json({ message: 'OTP has already been used or verification is in progress.' });
    }
    inFlightOtpVerifications.add(lockKey);

    let labTest;
    try {
      const attempts = await getAttempts(otpKey);
      if (attempts >= 5) {
        return res.status(429).json({ message: 'Too many failed OTP attempts. Please try again later.' });
      }

      // Verify OTP via Redis store
      const stored = await getOtp(otpKey);
      if (!stored) {
        return res.status(401).json({ message: 'No OTP requested. Please request an OTP first.' });
      }
      if (stored.purpose && stored.purpose !== 'doctor-lab-download') {
        return res.status(401).json({ message: 'OTP purpose mismatch for doctor lab report download' });
      }
      if (stored.doctorId && String(stored.doctorId) !== String(userId)) {
        return res.status(401).json({ message: 'OTP was issued for a different doctor account' });
      }
      const matchesTest =
        stored.labTestId === labTestId ||
        (stored.reportId && stored.reportId === labTestId) ||
        (stored.testObjectId && stored.testObjectId === labTestId);
      if (!matchesTest) {
        return res.status(401).json({ message: 'OTP was issued for a different lab test' });
      }
      if (Date.now() > stored.expiresAt) {
        await deleteOtp(otpKey, { clearAttempts: false });
        return res.status(401).json({ message: 'OTP has expired. Please request a new one.' });
      }
      if (String(stored.otp).trim() !== String(otp).trim()) {
        await incrementAttempts(otpKey);
        return res.status(401).json({ message: 'Invalid OTP' });
      }

      // OTP valid — consume it immediately (one-time use)
      await deleteOtp(otpKey);

      labTest = await findLabTestByIdentifier(labTestId);
      if (!labTest) {
        return res.status(404).json({ message: 'Lab test not found' });
      }
    } finally {
      inFlightOtpVerifications.delete(lockKey);
    }

    let pdfBuffer;
    if (labTest.reportPath) {
      try {
        const downloadUrl = labTest.reportPublicId
          ? generateSignedUrl(labTest.reportPublicId, { resource_type: 'raw', type: 'authenticated', expires_at: Math.floor(Date.now() / 1000) + 300 })
          : labTest.reportPath;

        const cloudinaryResponse = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
        pdfBuffer = Buffer.from(cloudinaryResponse.data);

        if (labTest.encryptedFileKey && labTest.fileIV) {
          const version = labTest.keyVersion || 1;
          const masterKey = global.ENCRYPTION_KEYS ? global.ENCRYPTION_KEYS[version] : (global.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY);
          const masterKeyBuf = Buffer.from(masterKey, 'utf-8').slice(0, 32);
          
          const cbcIvHex     = labTest.encryptedFileKey.substring(0, 32);
          const wrappedKeyHex = labTest.encryptedFileKey.substring(32);
          const cbcIV        = Buffer.from(cbcIvHex, 'hex');
          const wrappedKey   = Buffer.from(wrappedKeyHex, 'hex');

          const keyDecipher  = crypto.createDecipheriv('aes-256-cbc', masterKeyBuf, cbcIV);
          keyDecipher.setAutoPadding(false);
          const fileKey      = Buffer.concat([keyDecipher.update(wrappedKey), keyDecipher.final()]);

          const iv         = Buffer.from(labTest.fileIV, 'hex');
          const authTag    = pdfBuffer.slice(0, 16);
          const ciphertext = pdfBuffer.slice(16);
          const decipher   = crypto.createDecipheriv('aes-256-gcm', fileKey, iv);
          decipher.setAuthTag(authTag);
          pdfBuffer = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        }
      } catch (cloudErr) {
        console.warn('[Lab] Cloudinary download failed for doctor, generating PDF summary:', cloudErr.message);
        pdfBuffer = await pdfGenerator.generateLabReportPDF(labTest, labTest.patientName || 'Patient');
      }
    } else {
      pdfBuffer = await pdfGenerator.generateLabReportPDF(labTest, labTest.patientName || 'Patient');
    }

    const filename = `${labTestId}_report_doctor.pdf`;
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      pdfBuffer.byteLength,
      'Cache-Control':       'private, no-store, no-cache, must-revalidate',
      'Pragma':              'no-cache',
      'Expires':             '0',
    });
    return res.send(pdfBuffer);
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
    const labTest = await findLabTestByIdentifier(labTestId);

    if (!labTest) return res.status(404).json({ message: 'Lab Test ID not found' });

    return res.json({
      labTestId:        labTest.labTestId,
      reportId:         labTest.reportId,
      testName:         labTest.testName,
      testCategory:     labTest.testCategory,
      urgency:          labTest.urgency,
      status:           labTest.status,
      orderedAt:        labTest.orderedAt,
      reportUploadedAt: labTest.reportUploadedAt,
      createdAt:        labTest.createdAt,
    });
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
  Approved:         { subject: 'Lab Test Approved',         body: 'Your lab test has been approved by the hospital and is ready for sample collection.' },
  approved:         { subject: 'Lab Test Approved',         body: 'Your lab test has been approved by the hospital and is ready for sample collection.' },
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

// ── Export helpers for test accessibility ────────────────────────────────
exports._otpHelpers              = { setOtp, getOtp, deleteOtp };
exports._findLabTestByIdentifier = findLabTestByIdentifier;
exports.OTP_NS_HOSPITAL          = OTP_NS_HOSPITAL;
exports.OTP_NS_DOCTOR            = OTP_NS_DOCTOR;
exports.OTP_NS_PATIENT           = OTP_NS_PATIENT;

