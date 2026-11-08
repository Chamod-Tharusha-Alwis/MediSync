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

function buildSummaryEmailContent({ consultation, patient, doctor, prescriptions }) {
  const explicitNic = patient?.nic || consultation?.patientNic || null;
  const patientName = stripNicFromText(patient?.fullName || 'Patient', explicitNic);
  const doctorName = stripNicFromText(doctor?.fullName || 'Consulting Physician', explicitNic);
  const consultRef = sanitizeConsultationIdForFilename(consultation.consultationId || consultation._id);
  const consultDate = consultation.createdAt
    ? new Date(consultation.createdAt).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
  const diagnosis = stripNicFromText(consultation.diagnosis || 'Clinical Consultation', explicitNic);
  const notes = stripNicFromText(consultation.notes || 'Follow clinical guidance as discussed.', explicitNic);
  const followUpStr = consultation.followUpDate
    ? new Date(consultation.followUpDate).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : null;

  const subject = stripNicFromText(`MediSync Consultation Summary & Prescriptions (${consultDate})`, explicitNic);

  const rxRowsHtml =
    prescriptions.length > 0
      ? prescriptions
          .map((rx, idx) => {
            const drug = escapeHtml(stripNicFromText(rx.drugName || rx.name || 'Medication', explicitNic));
            const dosage = escapeHtml(stripNicFromText(rx.dosage || '-', explicitNic));
            const freq = escapeHtml(stripNicFromText(rx.frequency || '-', explicitNic));
            const dur = escapeHtml(
              stripNicFromText(rx.duration || (rx.durationDays ? `${rx.durationDays} days` : '-'), explicitNic)
            );
            const instr = escapeHtml(stripNicFromText(rx.instructions || '-', explicitNic));
            return `<tr>
              <td style="padding:10px 8px;border:1px solid #cbd5e1;text-align:center;">${idx + 1}</td>
              <td style="padding:10px 8px;border:1px solid #cbd5e1;font-weight:600;color:#0f172a;">${drug}</td>
              <td style="padding:10px 8px;border:1px solid #cbd5e1;">${dosage}</td>
              <td style="padding:10px 8px;border:1px solid #cbd5e1;">${freq}</td>
              <td style="padding:10px 8px;border:1px solid #cbd5e1;">${dur}</td>
              <td style="padding:10px 8px;border:1px solid #cbd5e1;word-break:break-word;">${instr}</td>
            </tr>`;
          })
          .join('')
      : `<tr><td colspan="6" style="padding:12px;border:1px solid #cbd5e1;color:#64748b;text-align:center;">No medications prescribed during this consultation.</td></tr>`;

  const rxCardsHtml =
    prescriptions.length > 0
      ? prescriptions
          .map((rx, idx) => {
            const drug = escapeHtml(stripNicFromText(rx.drugName || rx.name || 'Medication', explicitNic));
            const dosage = escapeHtml(stripNicFromText(rx.dosage || '-', explicitNic));
            const freq = escapeHtml(stripNicFromText(rx.frequency || '-', explicitNic));
            const dur = escapeHtml(
              stripNicFromText(rx.duration || (rx.durationDays ? `${rx.durationDays} days` : '-'), explicitNic)
            );
            const instr = escapeHtml(stripNicFromText(rx.instructions || '-', explicitNic));
            return `<div style="background:#ffffff;border:1px solid #cbd5e1;border-radius:6px;padding:12px;margin-bottom:10px;">
              <div style="font-weight:700;color:#0f3b66;font-size:14px;margin-bottom:6px;">${idx + 1}. ${drug}</div>
              <table style="width:100%;font-size:12px;border-collapse:collapse;">
                <tr><td style="color:#64748b;padding:2px 0;width:35%;">Dosage:</td><td style="font-weight:600;padding:2px 0;color:#0f172a;">${dosage}</td></tr>
                <tr><td style="color:#64748b;padding:2px 0;">Frequency:</td><td style="font-weight:600;padding:2px 0;color:#0f172a;">${freq}</td></tr>
                <tr><td style="color:#64748b;padding:2px 0;">Duration:</td><td style="font-weight:600;padding:2px 0;color:#0f172a;">${dur}</td></tr>
                <tr><td style="color:#64748b;padding:2px 0;vertical-align:top;">Instructions:</td><td style="font-weight:500;padding:2px 0;color:#0f172a;word-break:break-word;">${instr}</td></tr>
              </table>
            </div>`;
          })
          .join('')
      : `<div style="padding:12px;border:1px solid #cbd5e1;color:#64748b;border-radius:6px;text-align:center;">No medications prescribed during this consultation.</div>`;

  const rxLinesText =
    prescriptions.length > 0
      ? prescriptions
          .map((rx, idx) => {
            const drug = stripNicFromText(rx.drugName || rx.name || 'Medication', explicitNic);
            const dosage = stripNicFromText(rx.dosage || '-', explicitNic);
            const freq = stripNicFromText(rx.frequency || '-', explicitNic);
            const dur = stripNicFromText(
              rx.duration || (rx.durationDays ? `${rx.durationDays} days` : '-'),
              explicitNic
            );
            const instr = stripNicFromText(rx.instructions || '', explicitNic);
            return `${idx + 1}. ${drug} | Dosage: ${dosage} | Frequency: ${freq} | Duration: ${dur}${instr ? ` | Instructions: ${instr}` : ''}`;
          })
          .join('\n')
      : 'No medications prescribed during this consultation.';

  const html = stripNicFromText(
    `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  @media only screen and (max-width: 600px) {
    .rx-desktop-table { display: none !important; }
    .rx-mobile-cards { display: block !important; }
    .email-container { width: 100% !important; padding: 12px !important; }
  }
  @media only screen and (min-width: 601px) {
    .rx-desktop-table { display: table !important; width: 100% !important; }
    .rx-mobile-cards { display: none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f8fafc;">
    <div class="email-container" style="font-family:Inter,Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a;">
      <div style="background:#0f3b66;color:#ffffff;padding:18px 24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:18px;">MediSync Consultation Summary</h2>
        <p style="margin:4px 0 0;font-size:13px;color:#cbd5e1;">Reference: ${escapeHtml(consultRef)} | Date: ${escapeHtml(consultDate)}</p>
      </div>
      <div style="padding:20px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;background:#ffffff;">
        <p style="margin:0 0 12px;">Dear <strong>${escapeHtml(patientName)}</strong>,</p>
        <p style="margin:0 0 16px;">Your consultation with <strong>${escapeHtml(doctorName)}</strong> has been recorded. Below is your clinical summary and prescription list.</p>
        <div style="background:#f8fafc;padding:12px 16px;border-radius:6px;margin-bottom:16px;border:1px solid #f1f5f9;">
          <p style="margin:0 0 6px;"><strong>Diagnosis:</strong> ${escapeHtml(diagnosis)}</p>
          <p style="margin:0 0 6px;"><strong>Clinical Notes:</strong> ${escapeHtml(notes)}</p>
          ${followUpStr ? `<p style="margin:0;"><strong>Recommended Follow-Up:</strong> ${escapeHtml(followUpStr)}</p>` : ''}
        </div>
        <h3 style="font-size:15px;margin:16px 0 8px;color:#0d9488;">Prescribed Medications</h3>
        
        <!-- Desktop Table view (horizontally scrollable fallback) -->
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
          <table class="rx-desktop-table" style="width:100%;border-collapse:collapse;font-size:13px;table-layout:auto;">
            <thead>
              <tr style="background:#f1f5f9;text-align:left;">
                <th style="padding:8px;border:1px solid #cbd5e1;width:32px;">#</th>
                <th style="padding:8px;border:1px solid #cbd5e1;">Medication</th>
                <th style="padding:8px;border:1px solid #cbd5e1;">Dosage</th>
                <th style="padding:8px;border:1px solid #cbd5e1;">Frequency</th>
                <th style="padding:8px;border:1px solid #cbd5e1;">Duration</th>
                <th style="padding:8px;border:1px solid #cbd5e1;">Instructions</th>
              </tr>
            </thead>
            <tbody>${rxRowsHtml}</tbody>
          </table>
        </div>

        <!-- Mobile Stacked Card View (responsive for narrow viewports) -->
        <div class="rx-mobile-cards" style="display:none;margin-top:8px;">
          ${rxCardsHtml}
        </div>

        <!-- Trilingual Confidentiality Notice -->
        <div style="margin-top:20px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;color:#64748b;line-height:1.5;">
          <p style="margin:0 0 4px;"><strong>English:</strong> Confidential clinical consultation summary. Keep for medical records.</p>
          <p style="margin:0 0 4px;"><strong>සිංහල:</strong> රහස්‍ය සායනික උපදේශන සාරාංශයකි. ඔබගේ වෛද්‍ය වාර්තා සඳහා සුරක්ෂිතව තබා ගන්න.</p>
          <p style="margin:0;"><strong>தமிழ்:</strong> இரகசிய மருத்துவ ஆலோசனைக் குறிப்பு. மருத்துவ பதிவுகளுக்காக இதை வைத்திருக்கவும்.</p>
        </div>
      </div>
    </div>
</body>
</html>`,
    explicitNic
  );

  const text = stripNicFromText(
    [
      `MediSync Consultation Summary`,
      `Reference: ${consultRef} | Date: ${consultDate}`,
      `Patient: ${patientName}`,
      `Doctor: ${doctorName}`,
      `Diagnosis: ${diagnosis}`,
      `Clinical Notes: ${notes}`,
      followUpStr ? `Recommended Follow-Up: ${followUpStr}` : null,
      ``,
      `Prescribed Medications:`,
      rxLinesText,
    ]
      .filter((line) => line !== null)
      .join('\n'),
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
      const { subject, html, text, consultRef, explicitNic } = buildSummaryEmailContent({
        consultation,
        patient,
        doctor,
        prescriptions,
      });

      const attachments = [];
      if (process.env.PDF_EXPORT_ENABLED === 'true') {
        const consultationObj = consultation.toObject ? consultation.toObject() : { ...consultation };
        delete consultationObj.patientNic;
        delete consultationObj.patientNic_bi;
        delete consultationObj.patientNic_hmac;
        delete consultationObj.nicHash;

        const safePrescriptions = prescriptions.map((rx) => {
          const copy = { ...rx };
          delete copy.patientNic;
          delete copy.patientNic_bi;
          delete copy.patientNic_hmac;
          delete copy.nicHash;
          return copy;
        });

        const pdfBytes = await generateConsultationSummaryPDF(
          {
            ...consultationObj,
            consultationId: consultRef,
            medications: safePrescriptions,
            prescriptions: safePrescriptions,
          },
          {
            fullName: stripNicFromText(patient?.fullName || 'Patient', explicitNic),
            dateOfBirth: patient?.dateOfBirth,
            gender: patient?.gender,
            nic: 'N/A',
          },
          {
            fullName: stripNicFromText(doctor?.fullName || 'Consulting Physician', explicitNic),
            slmcNumber: doctor?.slmcNumber,
          }
        );

        attachments.push({
          filename: `consultation_${consultRef}.pdf`,
          content: Buffer.from(pdfBytes),
          contentType: 'application/pdf',
        });
      }

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
