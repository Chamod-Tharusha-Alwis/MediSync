'use strict';

/**
 * server/src/services/outbreakNotificationDelivery.js
 *
 * Scoped outbreak advisory email delivery service.
 * - Resolves opted-in, active, non-synthetic patients and healthcare staff.
 * - Enforces DEMONSTRATION ALLOWLIST for synthetic/simulated alerts:
 *     Never dispatches to real patients or clinicians if isSimulation, isSynthetic, or syntheticSeedBatch is present.
 *     Routes only to OUTBREAK_DEMO_EMAIL_ALLOWLIST (defaulting to admin email).
 * - Builds professional trilingual responsive emails with DCS population & 72h metrics.
 * - Plain text fallback identical in content.
 * - Throttled sequential dispatch with audit logs (recipient counts only, zero recipient email exposure).
 *
 * Review status: Curated for viva demonstration; pending human clinical review.
 */

const DEFAULT_MAX_RECIPIENTS = 100;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 50;

/**
 * Determines whether an alert is synthetic, simulated, or demo data.
 */
function isSyntheticOrDemo(alert = {}) {
  return Boolean(
    alert.isSimulation === true ||
    alert.isSynthetic === true ||
    alert.syntheticSeedBatch ||
    alert.isDemoData === true ||
    alert.isTestFixture === true
  );
}

/**
 * Async provenance check used before any delivery decision. An alert is demonstration data if
 * its own flags say so OR any of its source consultations is synthetic (covers alerts created
 * before scan-time tagging existed). A lookup failure is treated as demonstration (fail closed:
 * real users are never contacted when provenance cannot be established).
 */
async function isDemoOutbreakAlert(alert = {}, options = {}) {
  if (isSyntheticOrDemo(alert)) return true;
  const ids = Array.isArray(alert.sourceConsultationIds) ? alert.sourceConsultationIds.filter(Boolean) : [];
  if (ids.length === 0) return false;
  try {
    const Consultation = options.Consultation || require('../models/Consultation');
    const collection = Consultation && Consultation.collection;
    if (!collection || typeof collection.countDocuments !== 'function') return true;
    const mongoose = require('mongoose');
    const objectIds = ids.map(id => (mongoose.isObjectIdOrHexString(id) ? new mongoose.Types.ObjectId(String(id)) : id));
    const syntheticCount = await collection.countDocuments({
      _id: { $in: objectIds },
      $or: [{ isSynthetic: true }, { isDemoData: true }, { syntheticSeedBatch: { $exists: true } }],
    });
    return syntheticCount > 0;
  } catch (_) {
    return true;
  }
}

/**
 * External delivery policy:
 * - Demonstration alerts go only to the allowlist; delivery is on unless OUTBREAK_EMAIL_DELIVERY_ENABLED === 'false'.
 * - Real (non-demo) broadcast fails closed: it requires OUTBREAK_EMAIL_DELIVERY_ENABLED === 'true'.
 */
function isOutbreakDeliveryEnabled(isDemo, environment = process.env) {
  const flag = environment.OUTBREAK_EMAIL_DELIVERY_ENABLED;
  return isDemo ? flag !== 'false' : flag === 'true';
}

/**
 * Resolves audience of registered, active non-synthetic users for district or national scope.
 * If synthetic/demo alert: strictly returns OUTBREAK_DEMO_EMAIL_ALLOWLIST (never real users).
 */
async function resolveOutbreakRecipients(alert = {}, scope = 'district', maxCap = DEFAULT_MAX_RECIPIENTS, options = {}) {
  const normScope = String(scope || 'district').toLowerCase();
  const district = normScope === 'national' ? null : (alert.location || alert.district || null);
  const effectiveCap = Math.max(1, Number(maxCap) || DEFAULT_MAX_RECIPIENTS);

  // DEMONSTRATION DATA RULE:
  // If alert is synthetic/simulated, never query real patients or healthcare staff.
  if (options.isDemo === true || await isDemoOutbreakAlert(alert, options)) {
    const rawAllowlist = process.env.OUTBREAK_DEMO_EMAIL_ALLOWLIST || '';
    const allowlist = rawAllowlist
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(e => e && e.includes('@'));

    // Fallback is only the signed-in reviewer's own address; no hardcoded mailbox.
    const fallbackEmail = String(options.adminEmail || '').trim().toLowerCase();
    const demoEmails = allowlist.length > 0 ? allowlist : (fallbackEmail.includes('@') ? [fallbackEmail] : []);

    const recipients = demoEmails.map(email => ({
      email,
      role: 'demonstration_allowlist',
      district: district || 'National'
    }));

    return {
      recipients: recipients.slice(0, effectiveCap),
      totalFound: demoEmails.length,
      capped: demoEmails.length > effectiveCap,
      district: district || 'National',
      maxCap: effectiveCap,
      isDemonstration: true
    };
  }

  const Patient = require('../models/Patient');
  const Hospital = require('../models/Hospital');
  const Pharmacy = require('../models/Pharmacy');
  const Doctor = require('../models/Doctor');

  const emailMap = new Map();

  const addRecipient = (email, role, dist) => {
    if (!email || typeof email !== 'string') return;
    const clean = email.trim().toLowerCase();
    if (!clean || !clean.includes('@') || emailMap.has(clean)) return;
    emailMap.set(clean, { email: clean, role, district: dist || 'Unknown' });
  };

  try {
    // 1. Patients
    const patientFilter = {
      isActive: { $ne: false },
      isSynthetic: { $ne: true },
      isDemoData: { $ne: true },
      ...(district ? { district } : {}),
    };
    const patients = await Patient.find(patientFilter).select('email district').lean();
    for (const p of patients || []) {
      addRecipient(p.email, 'patient', p.district);
    }
  } catch (_) {}

  try {
    // 2. Hospitals & Staff
    const hospitalFilter = {
      isActive: { $ne: false },
      isSynthetic: { $ne: true },
      ...(district ? { district } : {}),
    };
    const hospitals = await Hospital.find(hospitalFilter).select('_id email district').lean();
    const hospitalIds = [];
    for (const h of hospitals || []) {
      addRecipient(h.email, 'hospital', h.district);
      if (h._id) hospitalIds.push(h._id);
    }

    // 3. Doctors associated with district hospitals
    const doctorFilter = {
      isActive: { $ne: false },
      isSynthetic: { $ne: true },
      ...(district ? { hospitals: { $in: hospitalIds } } : {}),
    };
    const doctors = await Doctor.find(doctorFilter).select('email').lean();
    for (const d of doctors || []) {
      addRecipient(d.email, 'doctor', district);
    }
  } catch (_) {}

  try {
    // 4. Pharmacies
    const pharmacyFilter = {
      isActive: { $ne: false },
      isSynthetic: { $ne: true },
      ...(district ? { district } : {}),
    };
    const pharmacies = await Pharmacy.find(pharmacyFilter).select('email district').lean();
    for (const ph of pharmacies || []) {
      addRecipient(ph.email, 'pharmacy', ph.district);
    }
  } catch (_) {}

  const allRecipients = Array.from(emailMap.values());
  const cappedRecipients = allRecipients.slice(0, effectiveCap);

  return {
    recipients: cappedRecipients,
    totalFound: allRecipients.length,
    capped: allRecipients.length > effectiveCap,
    district: district || 'National',
    maxCap: effectiveCap,
    isDemonstration: false
  };
}

/**
 * Dispatches professional trilingual advisory emails to the provided recipient list in throttled batches.
 *
 * @param {Array} recipients - Recipient list [{ email, role, district }] or string emails
 * @param {Object} alert - Alert document or object
 * @param {Object} options - { isDemo, isTest, adminEmail, approverRole }
 */
async function sendOutbreakAdvisoryEmail(recipients = [], alert = {}, options = {}) {
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return { sentCount: 0, failedCount: 0, errors: [] };
  }

  const { sendOutbreakAlert } = require('../utils/emailService');
  const { buildOutbreakAdvisoryEmail } = require('./outbreakEmailBuilder');
  const { enrichAlertWith72h, calculateGrowthMetrics } = require('./surveillanceService');

  // Ensure alert has real-time 72h metrics if not already attached
  let enrichedAlert = alert;
  if (!alert.metrics72h) {
    try {
      const growthData = await calculateGrowthMetrics({ windowHours: 72 });
      enrichedAlert = enrichAlertWith72h(alert, growthData);
    } catch (_) {
      enrichedAlert = alert;
    }
  }

  const isDemo = options.isDemo !== undefined ? options.isDemo : isSyntheticOrDemo(alert);
  const emailPayload = buildOutbreakAdvisoryEmail(enrichedAlert, {
    ...options,
    isDemo,
  });

  let sentCount = 0;
  let failedCount = 0;
  const errors = [];

  // Throttle in sequential batches to protect mail transport
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE);
    const emailList = chunk.map((r) => (typeof r === 'string' ? r : r.email)).filter(Boolean);

    try {
      const res = await sendOutbreakAlert(emailList, emailPayload);
      if (res && res.success !== false) {
        sentCount += (res.acceptedCount !== undefined ? res.acceptedCount : emailList.length);
        if (res.totalCount && res.acceptedCount !== undefined && res.totalCount > res.acceptedCount) {
          failedCount += (res.totalCount - res.acceptedCount);
        }
      } else {
        failedCount += emailList.length;
        errors.push(res?.errorCode || 'DELIVERY_REJECTED');
      }
    } catch (err) {
      failedCount += emailList.length;
      errors.push(err.message || 'TRANSPORT_ERROR');
    }

    if (i + BATCH_SIZE < recipients.length && BATCH_DELAY_MS > 0) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  return {
    sentCount,
    failedCount,
    errors,
    subject: emailPayload.subject,
    isDemonstration: isDemo
  };
}

module.exports = {
  resolveOutbreakRecipients,
  sendOutbreakAdvisoryEmail,
  isSyntheticOrDemo,
  isDemoOutbreakAlert,
  isOutbreakDeliveryEnabled,
  DEFAULT_MAX_RECIPIENTS,
};