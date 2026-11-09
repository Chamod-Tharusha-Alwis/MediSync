'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { resolveVerificationToken, revokeToken } = require('../services/verificationTokenService');
const { normalizeNic } = require('../security/nicBlindIndex');
const { formatDoctorName } = require('../utils/doctorName');
const { generatePatientHistoryPDF } = require('../utils/pdfGenerator');
const { computeReleaseSummary } = require('../services/releaseSummaryService');
const Consultation = require('../models/Consultation');
const Prescription = require('../models/Prescription');
const Patient = require('../models/Patient');
const AuditLog = require('../models/AuditLog');
const OTPSession = require('../models/OTPSession');
const emailService = require('../utils/emailService');

// In-memory timestamp tracker for cooldown and rate caps per token
// Map: tokenHash -> { lastSentAt: number, sendCountHour: number, hourResetAt: number }
const tokenOtpRateMap = new Map();

function maskEmail(email) {
  if (!email || typeof email !== 'string') return 'registered contact';
  const parts = email.split('@');
  if (parts.length !== 2) return 'p***@contact';
  const [user, domain] = parts;
  const visible = user.length > 2 ? user.slice(0, 2) : user.slice(0, 1);
  return `${visible}***@${domain}`;
}

function checkAndRecordOtpRate(tokenHash) {
  const now = Date.now();
  let rate = tokenOtpRateMap.get(tokenHash);

  if (!rate || now > rate.hourResetAt) {
    rate = {
      lastSentAt: 0,
      sendCountHour: 0,
      hourResetAt: now + 3600 * 1000,
    };
    tokenOtpRateMap.set(tokenHash, rate);
  }

  // 1. Cooldown check: 60s
  if (rate.lastSentAt && now - rate.lastSentAt < 60000) {
    const remainingSeconds = Math.ceil((60000 - (now - rate.lastSentAt)) / 1000);
    return { allowed: false, reason: 'COOLDOWN_ACTIVE', remainingSeconds };
  }

  // 2. Frequency cap: max 5 sends per hour per token
  if (rate.sendCountHour >= 5) {
    const remainingSeconds = Math.ceil((rate.hourResetAt - now) / 1000);
    return { allowed: false, reason: 'HOURLY_LIMIT_EXCEEDED', remainingSeconds };
  }

  // Record dispatch
  rate.lastSentAt = now;
  rate.sendCountHour += 1;
  return { allowed: true };
}

/**
 * Public Verification Endpoint: GET /api/verify/:token
 * Returns metadata proving authenticity of the consultation record.
 * STRICTURE: NEVER returns patient name, patient NIC, symptoms, clinical notes, or medications.
 */
exports.getVerificationPublicStatus = async (req, res) => {
  try {
    const rawToken = req.params.token;
    const tokenRes = await resolveVerificationToken(rawToken);

    if (!tokenRes.valid) {
      if (tokenRes.reason === 'TOKEN_REVOKED') {
        return res.status(410).json({
          valid: false,
          authentic: false,
          reason: 'TOKEN_REVOKED',
          revokedAt: tokenRes.revokedAt,
          revocationReason: tokenRes.revocationReason || 'Revoked by clinician or patient',
          clinicalValidation: 'not_established',
        });
      }
      if (tokenRes.reason === 'TOKEN_EXPIRED') {
        return res.status(410).json({
          valid: false,
          authentic: false,
          reason: 'TOKEN_EXPIRED',
          expiresAt: tokenRes.expiresAt,
          clinicalValidation: 'not_established',
        });
      }
      return res.status(404).json({
        valid: false,
        authentic: false,
        reason: tokenRes.reason || 'TOKEN_NOT_FOUND',
        clinicalValidation: 'not_established',
      });
    }

    const { token } = tokenRes;
    const consultation = token.consultationId;
    const doctor = token.doctorRef;
    const patient = token.patientRef;

    // Masked contact hint for OTP dispatch
    const maskedContact = maskEmail(patient?.email);

    // Audit public scan (zero PII)
    try {
      if (mongoose.connection?.readyState === 1) {
        await AuditLog.create({
          actorId: String(token._id),
          actorRole: 'anonymous',
          action: 'VERIFY_SCAN',
          accessedNic: 'N/A',
          deviceModel: 'N/A',
          details: { tokenId: String(token._id), outcome: 'SUCCESS' },
        });
      }
    } catch (_) {}

    return res.json({
      valid: true,
      authentic: true,
      consultationRef: consultation?.consultationId || token.consultationRef || 'CON-RECORD',
      consultationDate: consultation?.createdAt || token.createdAt,
      doctorName: formatDoctorName(doctor?.fullName || 'Consulting Physician'),
      hospital: consultation?.sessionHospitalId || 'Verified MediSync Healthcare Network',
      district: consultation?.district || 'National',
      maskedContact,
      clinicalValidation: 'not_established',
      requiresOtpForClinical: true,
      expiresAt: token.expiresAt,
    });
  } catch (error) {
    return res.status(500).json({
      valid: false,
      authentic: false,
      error: 'Failed to verify consultation authenticity',
      clinicalValidation: 'not_established',
    });
  }
};

/**
 * OTP Request Endpoint: POST /api/verify/:token/otp/request
 * Automatically called by the verification page on scan/load.
 * Dispatches a 6-digit OTP to the registered patient email.
 */
exports.requestVerificationOtp = async (req, res) => {
  try {
    const rawToken = req.params.token;
    const tokenRes = await resolveVerificationToken(rawToken);

    if (!tokenRes.valid) {
      if (tokenRes.reason === 'TOKEN_REVOKED') {
        return res.status(410).json({ error: 'TOKEN_REVOKED', message: 'Verification link has been revoked.' });
      }
      if (tokenRes.reason === 'TOKEN_EXPIRED') {
        return res.status(410).json({ error: 'TOKEN_EXPIRED', message: 'Verification link has expired.' });
      }
      return res.status(404).json({ error: 'TOKEN_NOT_FOUND', message: 'Invalid verification token.' });
    }

    const { token } = tokenRes;
    const tokenHash = token.tokenHash;
    const patient = token.patientRef;

    if (!patient || !patient.email) {
      return res.status(404).json({
        error: 'PATIENT_UNAVAILABLE',
        message: 'Patient record or contact is unavailable for verification.',
      });
    }

    // Rate-limiting and Cooldown (60s cooldown, max 5/hr)
    const rateCheck = checkAndRecordOtpRate(tokenHash);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        error: rateCheck.reason,
        message:
          rateCheck.reason === 'COOLDOWN_ACTIVE'
            ? `Please wait ${rateCheck.remainingSeconds} seconds before requesting another code.`
            : 'Maximum hourly verification OTP limit reached. Please try again later.',
        remainingSeconds: rateCheck.remainingSeconds,
      });
    }

    // Generate secure 6-digit cryptographic numeric OTP
    const rawOtp = String(crypto.randomInt(100000, 1000000));
    const hashedOtp = await bcrypt.hash(rawOtp, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 300 seconds TTL

    // Invalidate existing unused qr_view OTPs for this patient
    await OTPSession.deleteMany({
      userId: patient._id,
      purpose: 'qr_view',
      used: false,
    });

    const otpSession = await OTPSession.create({
      userId: patient._id,
      userModel: 'Patient',
      otp: hashedOtp,
      expiresAt,
      purpose: 'qr_view',
      failedAttempts: 0,
      metadata: {
        tokenHash,
        tokenRef: String(token._id),
        revoked: false,
      },
    });

    // Decrypt patient name for email greeting if encrypted
    let patientGreetingName = 'Patient';
    if (typeof patient.decryptFieldsSync === 'function') {
      try {
        patient.decryptFieldsSync();
        patientGreetingName = patient.fullName || 'Patient';
      } catch (_) {}
    }

    // Send email via existing resilient email pipeline
    const emailResult = await emailService.sendOTPEmail(
      patient.email,
      patientGreetingName,
      rawOtp,
      { lang: patient.preferredLanguage || 'en' }
    );

    if (!emailResult || !emailResult.providerAccepted) {
      await OTPSession.deleteOne({ _id: otpSession._id });
      return res.status(503).json({
        error: 'EMAIL_DELIVERY_FAILED',
        message: 'Unable to deliver verification OTP to registered contact right now. Please try again shortly.',
      });
    }

    // Audit OTP send event (zero PII)
    try {
      if (mongoose.connection?.readyState === 1) {
        await AuditLog.create({
          actorId: String(token._id),
          actorRole: 'anonymous',
          action: 'VERIFY_OTP_SENT',
          accessedNic: 'N/A',
          deviceModel: 'N/A',
          details: { tokenId: String(token._id), ip: req.ip, outcome: 'SENT' },
        });
      }
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: 'Verification OTP sent to registered contact',
      maskedContact: maskEmail(patient.email),
      cooldownSeconds: 60,
      expiresInSeconds: 300,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'OTP_REQUEST_FAILED',
      message: 'Failed to process verification OTP request',
    });
  }
};

/**
 * OTP Verify & Unlock Endpoint: POST /api/verify/:token/otp/verify
 * Accepts { otp } -> Validates -> Unlocks Clinical & Medicine Release in one payload.
 * Issues 10-minute in-memory view session token.
 */
exports.verifyOtpAndUnlock = async (req, res) => {
  try {
    const rawToken = req.params.token;
    const { otp } = req.body || {};

    if (!otp || typeof otp !== 'string' || otp.trim().length === 0) {
      return res.status(400).json({
        error: 'OTP_REQUIRED',
        message: 'A 6-digit verification code is required.',
      });
    }

    const tokenRes = await resolveVerificationToken(rawToken);
    if (!tokenRes.valid) {
      return res.status(tokenRes.reason === 'TOKEN_REVOKED' || tokenRes.reason === 'TOKEN_EXPIRED' ? 410 : 404).json({
        error: tokenRes.reason || 'TOKEN_NOT_FOUND',
        message: 'Verification token invalid, expired, or revoked.',
      });
    }

    const { token } = tokenRes;
    const tokenHash = token.tokenHash;
    const patientId = token.patientRef?._id || token.patientRef;

    // Find active OTPSession for this patient and qr_view purpose
    const otpSession = await OTPSession.findOne({
      userId: patientId,
      purpose: 'qr_view',
      used: false,
      expiresAt: { $gt: new Date() },
    });

    if (!otpSession) {
      return res.status(401).json({
        error: 'NO_ACTIVE_OTP',
        message: 'No active verification code found. Please request a new code.',
      });
    }

    // Verify token binding
    if (otpSession.metadata?.tokenHash && otpSession.metadata.tokenHash !== tokenHash) {
      return res.status(401).json({
        error: 'TOKEN_MISMATCH',
        message: 'Verification code was not issued for this consultation token.',
      });
    }

    // Check failed attempts (max 3)
    if (otpSession.failedAttempts >= 3) {
      otpSession.used = true;
      await otpSession.save();
      return res.status(429).json({
        error: 'OTP_LOCKED',
        message: 'Maximum verification attempts exceeded. Please request a new code.',
      });
    }

    // Constant-time hash verification via bcrypt
    const isMatch = await bcrypt.compare(otp.trim(), otpSession.otp);
    if (!isMatch) {
      otpSession.failedAttempts = (otpSession.failedAttempts || 0) + 1;
      const attemptsRemaining = Math.max(0, 3 - otpSession.failedAttempts);
      if (attemptsRemaining === 0) {
        otpSession.used = true;
      }
      await otpSession.save();

      // Audit failed attempt (zero PII)
      try {
        if (mongoose.connection?.readyState === 1) {
          await AuditLog.create({
            actorId: String(token._id),
            actorRole: 'anonymous',
            action: 'VERIFY_OTP_FAILED',
            accessedNic: 'N/A',
            deviceModel: 'N/A',
            details: { tokenId: String(token._id), remaining: attemptsRemaining },
          });
        }
      } catch (_) {}

      return res.status(401).json({
        error: 'INVALID_OTP',
        message:
          attemptsRemaining > 0
            ? `Incorrect verification code. ${attemptsRemaining} attempt(s) remaining.`
            : 'Maximum verification attempts exceeded. Code has been locked.',
        attemptsRemaining,
      });
    }

    // Correct OTP: consume session atomically
    otpSession.used = true;
    await otpSession.save();

    // Fetch full Consultation and Patient records
    const consultation = await Consultation.findById(token.consultationId?._id || token.consultationId);
    const patient = await Patient.findById(patientId);

    if (!consultation || !patient) {
      return res.status(404).json({
        error: 'RECORD_NOT_FOUND',
        message: 'Clinical encounter data is currently unavailable.',
      });
    }

    // Decrypt fields in-memory
    if (typeof consultation.decryptFieldsSync === 'function') {
      try {
        consultation.decryptFieldsSync();
      } catch (_) {}
    }
    if (typeof patient.decryptFieldsSync === 'function') {
      try {
        patient.decryptFieldsSync();
      } catch (_) {}
    }

    // Compute medicine release summary
    const release = await computeReleaseSummary(consultation._id);

    // Assemble clinical encounter data matching Consultation Summary PDF
    const clinical = {
      consultation: {
        reference: consultation.consultationId || token.consultationRef || 'CON-RECORD',
        date: consultation.createdAt,
        hospital: consultation.sessionHospitalId || 'Verified MediSync Healthcare Network',
        doctor: formatDoctorName(token.doctorRef?.fullName || 'Consulting Physician'),
        district: consultation.district || 'National',
      },
      patient: {
        name: patient.fullName || 'Patient',
        ageOrDob: patient.dateOfBirth
          ? patient.dateOfBirth.toISOString().split('T')[0]
          : 'Not recorded',
        gender: patient.gender || 'Not recorded',
        bloodGroup: patient.bloodGroup || 'Not recorded',
        allergies: Array.isArray(patient.allergies) ? patient.allergies : [],
      },
      vitals: {
        bloodPressure: consultation.vitals?.bloodPressure || null,
        pulseRate: consultation.vitals?.pulseRate || null,
        temperature: consultation.vitals?.temperature || null,
        spO2: consultation.vitals?.spO2 || null,
      },
      symptoms: Array.isArray(consultation.symptoms) ? consultation.symptoms : [],
      diagnosis: {
        text: consultation.diagnosis || 'Clinical Diagnosis Recorded',
        icdCode: consultation.icdCode || null,
        icdDescription: consultation.icdDescription || null,
      },
      notes: consultation.notes || '',
      followUp: {
        isFollowUpRequired: Boolean(consultation.isFollowUpRequired),
        followUpDate: consultation.followUpDate || null,
      },
      prescriptions: (release.items || []).map((it) => ({
        drugName: it.drugName,
        dosage: it.dosage,
        frequency: it.frequency,
        durationDays: it.durationDays,
        instructions: it.instructions,
        released: it.released,
      })),
      labResults: Array.isArray(consultation.labTests) ? consultation.labTests : [],
    };

    // Issue 10-minute ephemeral view session JWT
    const jwtSecret = process.env.JWT_SECRET || 'medisync_session_secret_local';
    const sessionToken = jwt.sign(
      {
        purpose: 'qr_view_session',
        tokenId: String(token._id),
        tokenHash,
        consultationId: String(consultation._id),
        patientId: String(patient._id),
      },
      jwtSecret,
      { expiresIn: '10m', algorithm: 'HS256' }
    );

    // Audit successful unlock (zero PII)
    try {
      if (mongoose.connection?.readyState === 1) {
        await AuditLog.create({
          actorId: String(token._id),
          actorRole: 'patient',
          action: 'VERIFY_UNLOCKED',
          accessedNic: 'N/A',
          deviceModel: 'N/A',
          details: { tokenId: String(token._id), outcome: 'SUCCESS' },
        });
      }
    } catch (_) {}

    // Strict no-store headers to prevent caching on shared/public browsers
    res.set({
      'Cache-Control': 'private, no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });

    return res.status(200).json({
      success: true,
      sessionToken,
      expiresInSeconds: 600,
      clinical,
      release,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'VERIFICATION_FAILED',
      message: 'Failed to complete verification and unlock records',
    });
  }
};

/**
 * Patient History Download Endpoint: POST /api/verify/:token/history-pdf
 * Authorized by ephemeral view session token (from OTP unlock) OR backward-compatible NIC.
 */
exports.downloadHistoryPdfWithNicGate = async (req, res) => {
  try {
    const rawToken = req.params.token;
    const authHeader = req.headers['authorization'];
    const sessionTokenFromBody = req.body?.sessionToken;
    const sessionToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : sessionTokenFromBody;

    const tokenRes = await resolveVerificationToken(rawToken);
    if (!tokenRes.valid) {
      return res.status(404).json({
        error: 'VERIFICATION_FAILED',
        message: 'Verification token invalid, expired, or revoked.',
      });
    }

    const { token } = tokenRes;
    const patientId = token.patientRef?._id || token.patientRef;
    const patient = await Patient.findById(patientId);

    if (!patient) {
      return res.status(404).json({
        error: 'VERIFICATION_FAILED',
        message: 'Patient record unavailable.',
      });
    }

    if (typeof patient.decryptFieldsSync === 'function') {
      try {
        patient.decryptFieldsSync();
      } catch (_) {}
    }

    let isAuthorized = false;

    // 1. Primary Authorization: View Session Token from OTP unlock
    if (sessionToken) {
      try {
        const jwtSecret = process.env.JWT_SECRET || 'medisync_session_secret_local';
        const decoded = jwt.verify(sessionToken, jwtSecret, { algorithms: ['HS256'] });
        if (
          decoded &&
          decoded.purpose === 'qr_view_session' &&
          decoded.tokenHash === token.tokenHash &&
          String(decoded.patientId) === String(patient._id)
        ) {
          isAuthorized = true;
        }
      } catch (_) {
        // Fall through to NIC check if session token is invalid
      }
    }

    // 2. Backward Compatibility: Constant-time NIC comparison
    if (!isAuthorized && req.body?.nic) {
      const inputNormalized = normalizeNic(String(req.body.nic).trim());
      const actualNormalized = normalizeNic(patient.nic || '');

      const bufA = Buffer.from(inputNormalized, 'utf8');
      const bufB = Buffer.from(actualNormalized, 'utf8');
      if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      // Audit failure with zero PII
      try {
        if (mongoose.connection?.readyState === 1) {
          await AuditLog.create({
            actorId: String(token._id),
            actorRole: 'anonymous',
            action: 'VERIFY_PDF_DOWNLOAD_FAIL',
            accessedNic: 'REDACTED',
            deviceModel: 'N/A',
            details: { tokenId: String(token._id), outcome: 'UNAUTHORIZED' },
          });
        }
      } catch (_) {}

      return res.status(401).json({
        error: 'VERIFICATION_FAILED',
        message: 'Identity verification or active view session required to download history.',
      });
    }

    // Audit success with zero PII
    try {
      if (mongoose.connection?.readyState === 1) {
        await AuditLog.create({
          actorId: String(token._id),
          actorRole: 'patient',
          action: 'VERIFY_PDF_DOWNLOADED',
          accessedNic: 'REDACTED',
          deviceModel: 'N/A',
          details: { tokenId: String(token._id), outcome: 'DOWNLOADED' },
        });
      }
    } catch (_) {}

    // Fetch permitted clinical history
    const consultations = await Consultation.find({ patientId: patient._id })
      .populate('doctorId', 'fullName slmcNumber')
      .sort({ createdAt: -1 })
      .lean();

    const prescriptions = await Prescription.find({ patientId: patient._id }).lean();

    const pdfBuffer = await generatePatientHistoryPDF(patient, consultations, prescriptions, {
      lang: req.query?.lang || 'en',
    });

    const finalBuffer = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="MediSync-Patient-History.pdf"',
      'Content-Length': finalBuffer.length,
      'Cache-Control': 'private, no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });

    return res.send(finalBuffer);
  } catch (error) {
    if (error?.code === 'SECURITY_HOLD') {
      return res.status(503).json({
        error: 'PDF_EXPORT_UNAVAILABLE',
        message: 'Clinical history export is locked on security hold.',
      });
    }
    return res.status(500).json({
      error: 'Failed to generate history PDF',
      details: error.message,
    });
  }
};

/**
 * Token Revocation Endpoint: POST /api/verify/:token/revoke
 * Clinical & Owner revocation action
 */
exports.revokeVerificationToken = async (req, res) => {
  try {
    const rawToken = req.params.token;
    const { reason } = req.body || {};

    const tokenRes = await resolveVerificationToken(rawToken);
    if (!tokenRes.valid && tokenRes.reason === 'TOKEN_NOT_FOUND') {
      return res.status(404).json({ error: 'Token not found' });
    }

    const callerId = req.user?.id;
    const callerRole = req.user?.role;
    const patientOwnerId = String(tokenRes.token?.patientRef?._id || tokenRes.token?.patientRef || '');

    const isAuthorized =
      callerRole === 'admin' ||
      callerRole === 'super_admin' ||
      callerRole === 'doctor' ||
      (callerRole === 'patient' && callerId === patientOwnerId);

    if (!isAuthorized) {
      try {
        if (mongoose.connection?.readyState === 1) {
          await AuditLog.create({
            actorId: callerId || 'anonymous',
            actorRole: callerRole || 'anonymous',
            action: 'VERIFY_TOKEN_REVOKED_ACCESS_DENIED',
            accessedNic: 'N/A',
            deviceModel: 'N/A',
            details: { outcome: 'DENIED' },
          });
        }
      } catch (_) {}
      return res.status(403).json({ error: 'Unauthorized to revoke this verification token' });
    }

    const revokeOutcome = await revokeToken({
      rawToken,
      revokedBy: callerId,
      reason: reason || 'Revoked via clinical / patient request',
    });

    try {
      if (mongoose.connection?.readyState === 1) {
        await AuditLog.create({
          actorId: callerId,
          actorRole: callerRole,
          action: 'VERIFY_TOKEN_REVOKED',
          accessedNic: 'N/A',
          deviceModel: 'N/A',
        });
      }
    } catch (_) {}

    return res.json({
      message: 'Verification token revoked successfully',
      revokedAt: revokeOutcome.revokedAt,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to revoke verification token', details: error.message });
  }
};
