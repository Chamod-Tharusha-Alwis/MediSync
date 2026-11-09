'use strict';

const mongoose = require('mongoose');
const Consultation = require('../models/Consultation');
const Prescription = require('../models/Prescription');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const AuditLog = require('../models/AuditLog');
const emailService = require('../utils/emailService');
const { generateConsultationSummaryPDF } = require('../utils/pdfGenerator');
const { nicFilter } = require('../security/nicPersistence');

const { formatSriLankaDateTime } = require('../utils/sriLankaTime');

const sentConsultationSet = new Set();
const inFlightConsultationSet = new Set();
const resendThrottleMap = new Map();

const NIC_PATTERN_GLOBAL = /\b(?:[0-9]{9}[vVxX]|[0-9]{12})\b/g;

function stripNicFromText(input, explicitNic) {
  if (input === null || input === undefined) return '';
  let out = String(input).replace(NIC_PATTERN_GLOBAL, '[REDACTED]');
  if (explicitNic && typeof explicitNic === 'string' && explicitNic.trim().length >= 4) {
    const escaped = explicitNic.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'gi'), '[REDACTED]');
  }
  return out;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeConsultationIdForFilename(rawId) {
  const cleaned = stripNicFromText(String(rawId || 'record'), null)
    .replace(/\[REDACTED\]/g, 'record')
    .replace(/[^A-Za-z0-9_-]/g, '');
  return cleaned || 'record';
}

function sanitizeErrorCode(rawCode) {
  const cleaned = String(rawCode || 'EMAIL_DELIVERY_FAILED')
    .replace(NIC_PATTERN_GLOBAL, '')
    .replace(/[^A-Za-z0-9_:-]/g, '_')
    .slice(0, 64);
  return cleaned || 'EMAIL_DELIVERY_FAILED';
}

async function hasSentConsultationEmail(idempotencyKey) {
  if (!idempotencyKey) return false;
  if (sentConsultationSet.has(idempotencyKey)) return true;
  try {
    if (mongoose.connection?.readyState === 1) {
      const existing = await AuditLog.findOne({
        action: `consultation_summary_email_sent:${idempotencyKey}`,
      })
        .select('_id')
        .lean();
      if (existing) {
        sentConsultationSet.add(idempotencyKey);
        return true;
      }
    }
  } catch (_) {
    // Non-fatal: fall back to in-memory idempotency set
  }
  return false;
}

async function markConsultationEmailSent(idempotencyKey, patientId) {
  if (!idempotencyKey) return;
  sentConsultationSet.add(idempotencyKey);
  try {
    if (mongoose.connection?.readyState === 1) {
      await AuditLog.create({
        actorId: String(patientId || 'system'),
        actorRole: 'system',
        action: `consultation_summary_email_sent:${idempotencyKey}`,
        accessedNic: 'N/A',
        deviceModel: 'N/A',
      });
    }
  } catch (_) {
    // Non-fatal: in-memory set already guards current process
  }
}

function checkResendRateLimit(patientId, consultationKey, options = {}) {
  const windowMs = Number(options.windowMs ?? 15 * 60 * 1000);
  const maxPerWindow = Number(options.maxPerWindow ?? 3);
  const cooldownMs = Number(options.cooldownMs ?? 30 * 1000);
  const now = Date.now();
  const key = `${String(patientId)}:${String(consultationKey)}`;
  const history = (resendThrottleMap.get(key) || []).filter((ts) => now - ts < windowMs);

  if (history.length > 0 && cooldownMs > 0) {
    const elapsedSinceLast = now - history[history.length - 1];
    if (elapsedSinceLast < cooldownMs) {
      const retryAfterSeconds = Math.max(1, Math.ceil((cooldownMs - elapsedSinceLast) / 1000));
      return {
        allowed: false,
        statusCode: 429,
        errorCode: 'RESEND_COOLDOWN_ACTIVE',
        retryAfterSeconds,
      };
    }
  }

  if (history.length >= maxPerWindow) {
    const oldest = history[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    return {
      allowed: false,
      statusCode: 429,
      errorCode: 'RESEND_RATE_LIMITED',
      retryAfterSeconds,
    };
  }

  history.push(now);
  resendThrottleMap.set(key, history);
  return { allowed: true, statusCode: 200, errorCode: null, retryAfterSeconds: 0 };
}

function isPersistenceReadyOrMocked() {
  return (
    mongoose.connection?.readyState === 1 ||
    Boolean(Consultation.findById?._isMockFunction) ||
    Boolean(Consultation.findOne?._isMockFunction)
  );
}

async function resolveConsultationAndContext(consultationIdentifier, fallbackPatientId, fallbackDoctorId) {
  if (!isPersistenceReadyOrMocked()) return null;
  let consultation = null;
  const idStr = String(consultationIdentifier || '').trim();
  if (!idStr) return null;

  if (mongoose.Types.ObjectId.isValid(idStr)) {
    consultation = await Consultation.findById(idStr);
  }
  if (!consultation) {
    consultation = await Consultation.findOne({ consultationId: idStr });
  }
  if (!consultation) return null;

  if (typeof consultation.decryptFieldsSync === 'function') {
    try {
      consultation.decryptFieldsSync();
    } catch (_) {}
  }

  let patient = null;
  const targetPatientId = consultation.patientId || fallbackPatientId;
  if (targetPatientId && mongoose.Types.ObjectId.isValid(String(targetPatientId))) {
    patient = await Patient.findById(targetPatientId);
  }
  if (!patient && consultation.patientNic) {
    patient = await Patient.findOne(nicFilter(consultation.patientNic, { plainFields: ['nic'] }));
  }
  if (patient && typeof patient.decryptFieldsSync === 'function') {
    try {
      patient.decryptFieldsSync();
    } catch (_) {}
  }

  let doctor = null;
  const targetDoctorId = consultation.doctorId || fallbackDoctorId;
  if (targetDoctorId && mongoose.Types.ObjectId.isValid(String(targetDoctorId))) {
    doctor = await Doctor.findById(targetDoctorId).select('fullName specialization slmcNumber').lean();
  }

  const orConditions = [{ consultationId: consultation._id }];
  if (consultation.consultationId) {
    orConditions.push({ consultationRef: consultation.consultationId });
  }
  const rawPrescriptions = await Prescription.find({ $or: orConditions }).sort({ issuedAt: 1, createdAt: 1 });
  const prescriptions = rawPrescriptions.map((rx) => {
    if (typeof rx.decryptFieldsSync === 'function') {
      try {
        rx.decryptFieldsSync();
      } catch (_) {}
    }
    return rx.toObject ? rx.toObject() : rx;
  });

  return {
    consultation,
    patient,
    doctor,
    prescriptions,
  };
}

function buildSummaryEmailContent({ consultation, patient, doctor, verificationUrl }) {
  const explicitNic = patient?.nic || consultation?.patientNic || null;
  const fullName = stripNicFromText(patient?.fullName || 'Patient', explicitNic);
  const patientFirstName = fullName.trim().split(/\s+/)[0] || 'Patient';
  const doctorName = stripNicFromText(doctor?.fullName || 'Consulting Physician', explicitNic);
  const consultRef = sanitizeConsultationIdForFilename(consultation.consultationId || consultation._id);
  const consultDate = formatSriLankaDateTime(consultation.createdAt || new Date(), 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const subject = 'MediSync: your consultation summary is ready';
  const secureLink = verificationUrl || 'https://medisync.chamodtharusha.com.lk/patient/dashboard';

  const html = stripNicFromText(
    `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  .email-container { width: 100% !important; max-width: 600px !important; margin: 0 auto !important; font-family: Inter, Arial, sans-serif !important; }
</style>
</head>
<body style="margin:0;padding:0;background:#f8fafc;color:#0f172a;">
    <div class="email-container" style="max-width:600px;margin:20px auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#ffffff;">
      <div style="background:#0f3b66;color:#ffffff;padding:24px 28px;text-align:left;">
        <h2 style="margin:0;font-size:20px;font-weight:700;letter-spacing:-0.02em;">MediSync</h2>
        <p style="margin:6px 0 0;font-size:13px;color:#93c5fd;">Official Clinical Encounter Notification</p>
      </div>
      <div style="padding:28px 28px 32px;">
        <p style="margin:0 0 16px;font-size:16px;color:#0f172a;">Dear <strong>${escapeHtml(patientFirstName)}</strong>,</p>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#334155;">Your consultation record has been finalized and securely stored in your personal health records.</p>
        
        <div style="background:#f8fafc;padding:16px 20px;border-radius:8px;margin-bottom:24px;border:1px solid #e2e8f0;font-size:13px;line-height:1.7;">
          <div><strong style="color:#64748b;">Consultation Reference:</strong> <span style="font-family:monospace;font-weight:600;color:#0f3b66;">${escapeHtml(consultRef)}</span></div>
          <div><strong style="color:#64748b;">Consulting Physician:</strong> <span style="color:#0f172a;">${escapeHtml(doctorName)}</span></div>
          <div><strong style="color:#64748b;">Encounter Date & Time:</strong> <span style="color:#0f172a;">${escapeHtml(consultDate)}</span></div>
        </div>

        <div style="margin:28px 0;text-align:center;">
          <a href="${escapeHtml(secureLink)}" style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,0.05);">Access Secure Consultation Record</a>
        </div>

        <div style="background:#f1f5f9;border-left:4px solid #0d9488;padding:12px 16px;border-radius:4px;font-size:12px;color:#475569;line-height:1.5;margin-bottom:20px;">
          <strong>Privacy & Confidentiality Standard:</strong> To protect your medical confidentiality, clinical details such as diagnoses, clinical notes, and medication regimens are never transmitted via unencrypted email. Please log in or use the secure verification link above to view your full clinical documentation.
        </div>

        <div style="border-top:1px solid #e2e8f0;padding-top:16px;font-size:11px;color:#64748b;line-height:1.5;">
          <p style="margin:0 0 4px;"><strong>English:</strong> Confidential clinical notification. For your medical records only.</p>
          <p style="margin:0 0 4px;"><strong>සිංහල:</strong> රහස්‍ය සායනික දැනුම්දීමකි. ඔබගේ වෛද්‍ය වාර්තා සඳහා පමණි.</p>
          <p style="margin:0;"><strong>தமிழ்:</strong> இரகசிய மருத்துவ அறிவிப்பு. உங்கள் மருத்துவ பதிவுகளுக்காக மட்டுமே.</p>
        </div>
      </div>
    </div>
</body>
</html>`,
    explicitNic
  );

  const text = stripNicFromText(
    [
      `MediSync: your consultation summary is ready`,
      ``,
      `Dear ${patientFirstName},`,
      ``,
      `Your consultation record has been finalized and securely stored.`,
      `Reference: ${consultRef}`,
      `Consulting Physician: ${doctorName}`,
      `Date & Time: ${consultDate}`,
      ``,
      `Access your verified consultation summary and digital prescription:`,
      `${secureLink}`,
      ``,
      `Privacy Notice: For patient confidentiality, medical diagnoses, notes, and medication lists are not transmitted via email. Access your complete record via the secure link above.`,
    ].join('\n'),
    explicitNic
  );

  return {
    subject,
    html,
    text,
    consultRef,
    explicitNic,
  };
}

const NON_RETRYABLE_CODES = new Set([
  'daily_quota_exceeded',
  'brevo_daily_allowance_exhausted',
  'brevo_quota_exceeded',
  'invalid_recipient',
  'permanent_validation_failure',
  'provider_auth_configuration_error',
  'sender_domain_configuration_error',
]);

async function sleep(ms) {
  if (!ms || ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendConsultationSummaryEmail({
  consultationId,
  patientId,
  doctorId,
  forceResend = false,
  retryBaseDelayMs = process.env.NODE_ENV === 'test' ? 10 : 300,
  maxAttempts = 3,
  sendMailFn = emailService.sendMail,
} = {}) {
  try {
    const ctx = await resolveConsultationAndContext(consultationId, patientId, doctorId);
    if (!ctx || !ctx.consultation) {
      return { sent: false, skipped: true, errorCode: 'CONSULTATION_NOT_FOUND' };
    }

    const { consultation, patient, doctor, prescriptions } = ctx;
    const idempotencyKey = String(consultation._id || consultation.consultationId);

    if (!forceResend) {
      if (inFlightConsultationSet.has(idempotencyKey) || (await hasSentConsultationEmail(idempotencyKey))) {
        return { sent: false, skipped: true, reason: 'already_sent' };
      }
    }

    const recipientEmail = patient?.email ? String(patient.email).trim() : '';
    if (!recipientEmail || !emailService.isValidEmailAddress(recipientEmail)) {
      return { sent: false, skipped: true, errorCode: 'PATIENT_EMAIL_MISSING_OR_INVALID' };
    }

    inFlightConsultationSet.add(idempotencyKey);

    try {
      let verificationUrl = null;
      if (mongoose.connection?.readyState === 1) {
        try {
          const { issueVerificationToken } = require('./verificationTokenService');
          const tokenRes = await issueVerificationToken({
            consultationId: consultation?._id,
            patientId: patient?._id,
            doctorId: doctor?._id,
            consultationRef: sanitizeConsultationIdForFilename(consultation.consultationId || consultation._id),
          });
          verificationUrl = tokenRes?.verificationUrl;
        } catch (_) {}
      }
      if (!verificationUrl) {
        const ref = sanitizeConsultationIdForFilename(consultation.consultationId || consultation._id);
        const baseClientUrl = process.env.CLIENT_URL || 'https://medisync.chamodtharusha.com.lk';
        verificationUrl = `${baseClientUrl}/verify/${ref}`;
      }

      const { subject, html, text } = buildSummaryEmailContent({
        consultation,
        patient,
        doctor,
        prescriptions,
        verificationUrl,
      });

      // Per Privacy Mandate Task P11-A1: Consultation email is notification-only;
      // zero PDF attachment in email preview to prevent clinical leak in Gmail/mail client.
      const attachments = [];

      let lastResult = null;
      let attempts = 0;
      const totalAttempts = Math.max(1, Number(maxAttempts) || 3);

      for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
        attempts = attempt;
        try {
          lastResult = await sendMailFn({
            to: recipientEmail,
            subject,
            html,
            text,
            attachments,
          });
        } catch (err) {
          lastResult = {
            success: false,
            providerAccepted: false,
            errorCode: sanitizeErrorCode(err?.code || 'SEND_EXCEPTION'),
          };
        }

        if (lastResult && (lastResult.success === true || lastResult.providerAccepted === true)) {
          await markConsultationEmailSent(idempotencyKey, patient?._id);
          return {
            sent: true,
            attempts,
            pdfAttached: attachments.length > 0,
            attachmentFilename: attachments[0]?.filename || null,
            messageId: lastResult.messageId || lastResult.id || null,
          };
        }

        const errCode = sanitizeErrorCode(
          lastResult?.errorCode || lastResult?.primaryErrorCode || 'EMAIL_DELIVERY_FAILED'
        );
        if (NON_RETRYABLE_CODES.has(errCode) || attempt >= totalAttempts) {
          console.warn(`[CONSULTATION_EMAIL] Delivery failed: code=${errCode}`);
          return {
            sent: false,
            attempts,
            pdfAttached: attachments.length > 0,
            errorCode: errCode,
          };
        }

        const backoffMs = retryBaseDelayMs * Math.pow(2, attempt - 1);
        await sleep(backoffMs);
      }

      const fallbackCode = sanitizeErrorCode(lastResult?.errorCode || 'EMAIL_DELIVERY_FAILED');
      console.warn(`[CONSULTATION_EMAIL] Delivery failed: code=${fallbackCode}`);
      return { sent: false, attempts, errorCode: fallbackCode };
    } finally {
      inFlightConsultationSet.delete(idempotencyKey);
    }
  } catch (unexpectedErr) {
    const safeCode = sanitizeErrorCode(unexpectedErr?.code || 'UNEXPECTED_EMAIL_ERROR');
    console.warn(`[CONSULTATION_EMAIL] Delivery failed: code=${safeCode}`);
    return { sent: false, errorCode: safeCode };
  }
}

function schedulePostConsultationSummaryEmail(params = {}) {
  if (!isPersistenceReadyOrMocked()) return;
  setImmediate(() => {
    if (!isPersistenceReadyOrMocked()) return;
    sendConsultationSummaryEmail(params).catch((err) => {
      const safeCode = sanitizeErrorCode(err?.code || 'ASYNC_DISPATCH_ERROR');
      console.warn(`[CONSULTATION_EMAIL] Delivery failed: code=${safeCode}`);
    });
  });
}

function _resetTestState() {
  sentConsultationSet.clear();
  inFlightConsultationSet.clear();
  resendThrottleMap.clear();
}

module.exports = {
  sendConsultationSummaryEmail,
  schedulePostConsultationSummaryEmail,
  checkResendRateLimit,
  stripNicFromText,
  sanitizeConsultationIdForFilename,
  _resetTestState,
};
