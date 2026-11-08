'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const { resolveVerificationToken, revokeToken } = require('../services/verificationTokenService');
const { normalizeNic } = require('../security/nicBlindIndex');
const { formatDoctorName } = require('../utils/doctorName');
const { generatePatientHistoryPDF } = require('../utils/pdfGenerator');
const Consultation = require('../models/Consultation');
const Prescription = require('../models/Prescription');
const Patient = require('../models/Patient');
const AuditLog = require('../models/AuditLog');

/**
 * Public Verification Endpoint: GET /api/verify/:token
 * Returns metadata proving authenticity of the consultation record.
 * STRICTURE: NEVER returns patient name, patient NIC, symptoms, clinical notes, or medications in public view.
 */
exports.getVerificationPublicStatus = async (req, res) => {
  try {
    const rawToken = req.params.token;
    const tokenRes = await resolveVerificationToken(rawToken);

    if (!tokenRes.valid) {
      if (tokenRes.reason === 'TOKEN_REVOKED') {
        return res.status(410).json({
          valid: false,
          reason: 'TOKEN_REVOKED',
          revokedAt: tokenRes.revokedAt,
          revocationReason: tokenRes.revocationReason || 'Revoked by clinician or patient',
          clinicalValidation: 'not_established',
        });
      }
      if (tokenRes.reason === 'TOKEN_EXPIRED') {
        return res.status(410).json({
          valid: false,
          reason: 'TOKEN_EXPIRED',
          expiresAt: tokenRes.expiresAt,
          clinicalValidation: 'not_established',
        });
      }
      return res.status(404).json({
        valid: false,
        reason: tokenRes.reason || 'TOKEN_NOT_FOUND',
        clinicalValidation: 'not_established',
      });
    }

    const { token } = tokenRes;
    const consultation = token.consultationId;
    const doctor = token.doctorRef;

    // Log public audit verification view (zero PII)
    try {
      if (mongoose.connection?.readyState === 1) {
        await AuditLog.create({
          actorId: 'public_verifier',
          actorRole: 'anonymous',
          action: 'VERIFY_VIEW',
          accessedNic: 'N/A',
          deviceModel: 'N/A',
        });
      }
    } catch (_) {}

    return res.json({
      valid: true,
      consultationRef: consultation?.consultationId || token.consultationRef || 'CON-RECORD',
      consultationDate: consultation?.createdAt || token.createdAt,
      doctorName: formatDoctorName(doctor?.fullName || 'Consulting Physician'),
      hospital: consultation?.sessionHospitalId || 'Verified MediSync Healthcare Network',
      clinicalValidation: 'not_established',
      requiresNicForHistory: true,
      expiresAt: token.expiresAt,
    });
  } catch (error) {
    return res.status(500).json({
      valid: false,
      error: 'Failed to verify consultation authenticity',
      clinicalValidation: 'not_established',
    });
  }
};

/**
 * Patient History Download Gate: POST /api/verify/:token/history-pdf
 * Requires patient's NIC. Uses constant-time comparison against decrypted NIC.
 */
exports.downloadHistoryPdfWithNicGate = async (req, res) => {
  try {
    const rawToken = req.params.token;
    const { nic } = req.body || {};

    if (!nic || typeof nic !== 'string' || nic.trim().length === 0) {
      return res.status(400).json({
        error: 'NIC_REQUIRED',
        message: 'National Identity Card number is required to download medical history.',
      });
    }

    const tokenRes = await resolveVerificationToken(rawToken);
    if (!tokenRes.valid) {
      return res.status(404).json({
        error: 'VERIFICATION_FAILED',
        message: 'Verification token invalid, expired, or revoked.',
      });
    }

    const patientId = tokenRes.token.patientRef?._id || tokenRes.token.patientRef;
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

    // Constant-time NIC verification
    const inputNormalized = normalizeNic(nic.trim());
    const actualNormalized = normalizeNic(patient.nic || '');

    const bufA = Buffer.from(inputNormalized, 'utf8');
    const bufB = Buffer.from(actualNormalized, 'utf8');
    const isMatch = bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);

    if (!isMatch) {
      // Audit failure with zero PII
      try {
        if (mongoose.connection?.readyState === 1) {
          await AuditLog.create({
            actorId: 'public_gate',
            actorRole: 'anonymous',
            action: 'VERIFY_HISTORY_DOWNLOAD_FAIL',
            accessedNic: 'REDACTED',
            deviceModel: 'N/A',
          });
        }
      } catch (_) {}

      return res.status(401).json({
        error: 'VERIFICATION_FAILED',
        message: 'Identity verification could not be confirmed.',
      });
    }

    // Audit success with zero PII
    try {
      if (mongoose.connection?.readyState === 1) {
        await AuditLog.create({
          actorId: 'public_gate',
          actorRole: 'patient',
          action: 'VERIFY_HISTORY_DOWNLOAD_OK',
          accessedNic: 'REDACTED',
          deviceModel: 'N/A',
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

    // Role-check: caller must be admin, doctor, or the patient who owns the record
    const callerId = req.user?.id;
    const callerRole = req.user?.role;
    const patientOwnerId = String(tokenRes.token?.patientRef?._id || tokenRes.token?.patientRef || '');

    const isAuthorized =
      callerRole === 'admin' ||
      callerRole === 'super_admin' ||
      callerRole === 'doctor' ||
      (callerRole === 'patient' && callerId === patientOwnerId);

    if (!isAuthorized) {
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
