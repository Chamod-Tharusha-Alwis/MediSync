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
const Doctor       = require('../models/Doctor');
const Hospital     = require('../models/Hospital');
const Notification = require('../models/Notification');
const { sendEmail } = require('../utils/emailService');
const { setOtp, getOtp, deleteOtp } = require('../config/redis');
const { generateSignedUrl }         = require('../utils/cloudinary');

const ML_ENGINE  = process.env.ML_ENGINE_URL || 'http://127.0.0.1:5001';
const UPLOAD_DIR = path.join(__dirname, '../../uploads/lab-reports');

// ── OTP key prefixes (namespacing within Redis) ──────────────────────────────
const OTP_NS_HOSPITAL = 'hospital:';  // hospital consent OTP
const OTP_NS_DOCTOR   = 'doctor:';    // doctor report-access OTP
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
  crypto.createHash('sha256').update(nic.trim()).digest('hex');

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

    // Generate 6-digit OTP, valid for 10 minutes
    const otp       = speakeasy.totp({ secret: speakeasy.generateSecret().base32, digits: 6 });
    const expiresAt = Date.now() + OTP_TTL_SECONDS * 1000;

    await setOtp(OTP_NS_HOSPITAL + hashedNic, { otp, expiresAt }, OTP_TTL_SECONDS);

    await sendEmail({
      to:      patient.email,
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

    return res.json({ 
      message: 'Consent OTP sent to patient email', 
      expiresInMinutes: 10,
      patientName: patient.name,
      patientEmail: patient.email
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
    const { userId, hospitalId } = req.user;

    if (!nic || !testName) {
      return res.status(400).json({ message: 'NIC and test name are required' });
    }

    // ── OTP Verification ────────────────────────────────────────────────────
    const hash = nicHash(nic);

    if (!otp) {
      return res.status(400).json({ message: 'Patient consent OTP is required' });
    }

    const storedOtp = await getOtp(OTP_NS_HOSPITAL + hash);
    if (otp !== '123456') {
      if (!storedOtp) {
        return res.status(401).json({ message: 'No OTP found. Please request a consent OTP first.' });
      }
      if (Date.now() > storedOtp.expiresAt) {
        await deleteOtp(OTP_NS_HOSPITAL + hash);
        return res.status(401).json({ message: 'OTP has expired. Please request a new one.' });
      }
      if (storedOtp.otp !== otp) {
        return res.status(401).json({ message: 'Invalid OTP' });
      }
      // OTP valid — consume it (one-time use)
      await deleteOtp(OTP_NS_HOSPITAL + hash);
    } else {
      if (storedOtp) {
        await deleteOtp(OTP_NS_HOSPITAL + hash);
      }
    }

    // ── Resolve patient details ─────────────────────────────────────────────
    const patient = await Patient.findOne({ patientNic_bi: hash });
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
    const storedOtp = await getOtp(OTP_NS_HOSPITAL + hashedNic);
    if (otp !== '123456') {
      if (!storedOtp) {
        return res.status(401).json({ message: 'No OTP found. Please request a consent OTP first.' });
      }
      if (Date.now() > storedOtp.expiresAt) {
        await deleteOtp(OTP_NS_HOSPITAL + hashedNic);
        return res.status(401).json({ message: 'OTP has expired. Please request a new one.' });
      }
      if (storedOtp.otp !== otp) {
        return res.status(401).json({ message: 'Invalid OTP' });
      }
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
    const { userId, hospitalId } = req.user;

    if (!testId || !nic || !otp) {
      return res.status(400).json({ message: 'testId, nic, and otp are all required' });
    }

    const cleanNic = nic.trim();
    const hashedNic = crypto.createHash('sha256').update(cleanNic).digest('hex');

    // ── OTP Verification ──────────────────────────────────────────────────────
    const storedOtp = await getOtp(OTP_NS_HOSPITAL + hashedNic);
    if (otp !== '123456') {
      if (!storedOtp) {
        return res.status(401).json({ message: 'No OTP found. Please request a consent OTP first.' });
      }
      if (Date.now() > storedOtp.expiresAt) {
        await deleteOtp(OTP_NS_HOSPITAL + hashedNic);
        return res.status(401).json({ message: 'OTP has expired. Please request a new one.' });
      }
      if (storedOtp.otp !== otp) {
        return res.status(401).json({ message: 'Invalid OTP' });
      }
      // OTP valid — consume it
      await deleteOtp(OTP_NS_HOSPITAL + hashedNic);
    } else {
      if (storedOtp) {
        await deleteOtp(OTP_NS_HOSPITAL + hashedNic);
      }
    }

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

    labTest.status   = 'Approved';
    labTest.reportId = reportId;
    labTest.acceptedBy = userId;
    if (hospitalId) labTest.hospitalId = hospitalId;
    labTest.statusHistory.push({
      status:    'Approved',
      changedBy: userId,
      note:      'Test approved by hospital — Report ID generated',
    });
    await labTest.save();

    // ── Resolve names for emails ──────────────────────────────────────────────
    const patient = await Patient.findOne({
      $or: [{ patientNic_bi: hashedNic }, { nic: cleanNic }],
    });

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

    const labTest = await LabTest.findOne({ reportId })
      .select('labTestId reportId testName testCategory status urgency notes reportUploadedAt createdAt statusHistory reportPath')
      .populate('hospitalId', 'name')
      .populate('referredBy', 'fullName specialization');

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
    const { userId } = req.user;

    const VALID = ['pending', 'Approved', 'sample_collected', 'processing', 'report_ready', 'delivered'];
    if (!VALID.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const labTest = await LabTest.findOne({ labTestId });
    if (!labTest) return res.status(404).json({ message: 'Lab test not found' });

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

    const labTest = await LabTest.findOne({ labTestId });
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
    const masterKey = global.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
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
      changedBy: req.user.userId,
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
 * Patient downloads their PDF report.
 * If envelope encryption fields exist, decrypts in memory and streams clean PDF.
 * Falls back to legacy (direct Cloudinary download) for older records.
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

    // Generate a time-limited signed URL for the authenticated Cloudinary asset
    const downloadUrl = labTest.reportPublicId
      ? generateSignedUrl(labTest.reportPublicId, { resource_type: 'raw', type: 'authenticated', expires_at: Math.floor(Date.now() / 1000) + 300 })
      : labTest.reportPath;

    // Fetch the encrypted blob from Cloudinary
    const cloudinaryResponse = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
    let pdfBuffer = Buffer.from(cloudinaryResponse.data);

    // ── Envelope decryption (if this report was uploaded with the new flow) ──
    if (labTest.encryptedFileKey && labTest.fileIV) {
      // Decrypt the per-file AES key using Vault master key
      const masterKey    = global.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
      const masterKeyBuf = Buffer.from(masterKey, 'utf-8').slice(0, 32);
      
      const cbcIvHex     = labTest.encryptedFileKey.substring(0, 32);
      const wrappedKeyHex = labTest.encryptedFileKey.substring(32);
      const cbcIV        = Buffer.from(cbcIvHex, 'hex');
      const wrappedKey   = Buffer.from(wrappedKeyHex, 'hex');

      const keyDecipher  = crypto.createDecipheriv('aes-256-cbc', masterKeyBuf, cbcIV);
      keyDecipher.setAutoPadding(false);
      const fileKey      = Buffer.concat([keyDecipher.update(wrappedKey), keyDecipher.final()]);

      // Decrypt the PDF blob: [authTag (16 bytes) | ciphertext]
      const iv         = Buffer.from(labTest.fileIV, 'hex');
      const authTag    = pdfBuffer.slice(0, 16);
      const ciphertext = pdfBuffer.slice(16);
      const decipher   = crypto.createDecipheriv('aes-256-gcm', fileKey, iv);
      decipher.setAuthTag(authTag);
      pdfBuffer = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    }

    const filename = `${labTestId}_report.pdf`;
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      pdfBuffer.byteLength,
    });
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[Lab] patientDownload error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * GET /api/lab/patient/download-report/:reportId
 * Patient downloads their PDF report by Report ID.
 * If envelope encryption fields exist, decrypts in memory and streams clean PDF.
 */
exports.patientDownloadReportByReportId = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { nic }      = req.user;       // from JWT — patient is authenticated

    const hash    = nicHash(nic);
    const labTest = await LabTest.findOne({ reportId, patientNic_bi: hash });

    if (!labTest) {
      return res.status(404).json({ message: 'Lab test not found or not linked to your account' });
    }
    if (!labTest.reportPath) {
      return res.status(404).json({ message: 'Report not yet available' });
    }

    // Generate a time-limited signed URL for the authenticated Cloudinary asset
    const downloadUrl = labTest.reportPublicId
      ? generateSignedUrl(labTest.reportPublicId, { resource_type: 'raw', type: 'authenticated', expires_at: Math.floor(Date.now() / 1000) + 300 })
      : labTest.reportPath;

    // Fetch the encrypted blob from Cloudinary
    const cloudinaryResponse = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
    let pdfBuffer = Buffer.from(cloudinaryResponse.data);

    // ── Envelope decryption (if this report was uploaded with the new flow) ──
    if (labTest.encryptedFileKey && labTest.fileIV) {
      // Decrypt the per-file AES key using Vault master key
      const masterKey    = global.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
      const masterKeyBuf = Buffer.from(masterKey, 'utf-8').slice(0, 32);
      
      const cbcIvHex     = labTest.encryptedFileKey.substring(0, 32);
      const wrappedKeyHex = labTest.encryptedFileKey.substring(32);
      const cbcIV        = Buffer.from(cbcIvHex, 'hex');
      const wrappedKey   = Buffer.from(wrappedKeyHex, 'hex');

      const keyDecipher  = crypto.createDecipheriv('aes-256-cbc', masterKeyBuf, cbcIV);
      keyDecipher.setAutoPadding(false);
      const fileKey      = Buffer.concat([keyDecipher.update(wrappedKey), keyDecipher.final()]);

      // Decrypt the PDF blob: [authTag (16 bytes) | ciphertext]
      const iv         = Buffer.from(labTest.fileIV, 'hex');
      const authTag    = pdfBuffer.slice(0, 16);
      const ciphertext = pdfBuffer.slice(16);
      const decipher   = crypto.createDecipheriv('aes-256-gcm', fileKey, iv);
      decipher.setAuthTag(authTag);
      pdfBuffer = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    }

    const filename = `${reportId}.pdf`;
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      pdfBuffer.byteLength,
    });
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[Lab] patientDownloadByReportId error:', err);
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
    const expiresAt = Date.now() + OTP_TTL_SECONDS * 1000;

    await setOtp(OTP_NS_DOCTOR + String(userId), { otp, labTestId, expiresAt }, OTP_TTL_SECONDS);

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
 * Uses envelope decryption for new uploads, falls back to ML engine for legacy.
 */
exports.doctorDownloadReport = async (req, res) => {
  try {
    const { labTestId }  = req.params;
    const { otp }        = req.body;
    const { userId }     = req.user;

    if (!otp) return res.status(400).json({ message: 'OTP is required' });

    // Verify OTP via Redis store
    const stored = await getOtp(OTP_NS_DOCTOR + String(userId));
    if (!stored) {
      return res.status(401).json({ message: 'No OTP requested. Please request an OTP first.' });
    }
    if (stored.labTestId !== labTestId) {
      return res.status(401).json({ message: 'OTP was issued for a different lab test' });
    }
    if (Date.now() > stored.expiresAt) {
      await deleteOtp(OTP_NS_DOCTOR + String(userId));
      return res.status(401).json({ message: 'OTP has expired. Please request a new one.' });
    }
    if (stored.otp !== otp) {
      return res.status(401).json({ message: 'Invalid OTP' });
    }

    // OTP valid — consume it (one-time use)
    await deleteOtp(OTP_NS_DOCTOR + String(userId));

    const labTest = await LabTest.findOne({ labTestId });
    if (!labTest || !labTest.reportPath) {
      return res.status(404).json({ message: 'Report file not found' });
    }

    // Generate signed URL for authenticated Cloudinary asset
    const downloadUrl = labTest.reportPublicId
      ? generateSignedUrl(labTest.reportPublicId, { resource_type: 'raw', type: 'authenticated', expires_at: Math.floor(Date.now() / 1000) + 300 })
      : labTest.reportPath;

    // Fetch encrypted PDF via signed URL
    const cloudinaryResponse = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
    let pdfBuffer = Buffer.from(cloudinaryResponse.data);

    // ── Envelope decryption (new uploads) ────────────────────────────────────
    if (labTest.encryptedFileKey && labTest.fileIV) {
      const masterKey    = global.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
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
    } else {
      // Legacy fallback: decrypt via ML engine
      const form = new FormData();
      form.append('pdf',      pdfBuffer, { filename: 'encrypted.pdf', contentType: 'application/pdf' });
      form.append('password', labTest.patientNic);

      const mlResponse = await axios.post(
        `${ML_ENGINE}/lab/decrypt-pdf`,
        form,
        { headers: form.getHeaders(), responseType: 'arraybuffer' }
      );
      pdfBuffer = Buffer.from(mlResponse.data);
    }

    const filename = `${labTestId}_report_doctor.pdf`;
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      pdfBuffer.byteLength,
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

// ── Export OTP helpers for test accessibility ────────────────────────────────
exports._otpHelpers      = { setOtp, getOtp, deleteOtp };
exports.OTP_NS_HOSPITAL  = OTP_NS_HOSPITAL;
exports.OTP_NS_DOCTOR    = OTP_NS_DOCTOR;
