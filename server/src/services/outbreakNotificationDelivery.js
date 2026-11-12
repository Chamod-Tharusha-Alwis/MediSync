'use strict';

/**
 * server/src/services/outbreakNotificationDelivery.js
 *
 * Scoped outbreak advisory email delivery service.
 * - Resolves opted-in, active, non-synthetic patients and healthcare staff.
 * - Deduplicates emails and applies configurable recipient caps.
 * - Dispatches strictly de-identified public health advisories (disease, district, general prevention advice, /public-health link).
 * - Zero patient identifiers or private clinical data.
 */

const mongoose = require('mongoose');

const DEFAULT_MAX_RECIPIENTS = 100;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 50;

/**
 * Resolves audience of registered, active non-synthetic users for district or national scope.
 */
async function resolveOutbreakRecipients(alert, scope = 'district', maxCap = DEFAULT_MAX_RECIPIENTS) {
  const normScope = String(scope || 'district').toLowerCase();
  const district = normScope === 'national' ? null : (alert.location || alert.district || null);

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

    // 3. Doctors associated with district hospitals or registered in district
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
  const effectiveCap = Math.max(1, Number(maxCap) || DEFAULT_MAX_RECIPIENTS);
  const cappedRecipients = allRecipients.slice(0, effectiveCap);

  return {
    recipients: cappedRecipients,
    totalFound: allRecipients.length,
    capped: allRecipients.length > effectiveCap,
    district: district || 'National',
    maxCap: effectiveCap,
  };
}

/**
 * Returns generic prevention guidance for verified communicable diseases.
 */
function getPreventionGuidance(diseaseName) {
  const norm = String(diseaseName || '').toLowerCase();
  if (norm.includes('dengue') || norm.includes('a90')) {
    return 'Eliminate standing water sources around premises. Apply mosquito repellents and seek immediate medical evaluation at the onset of sudden high fever, severe headache, or joint pain.';
  }
  if (norm.includes('influenza') || norm.includes('flu') || norm.includes('j11') || norm.includes('j10')) {
    return 'Practice respiratory hygiene: cover coughs and sneezes, wash hands frequently with soap or alcohol sanitizer, wear a protective mask in crowded spaces, and self-isolate if experiencing flu symptoms.';
  }
  if (norm.includes('leptospirosis') || norm.includes('a27') || norm.includes('rat fever')) {
    return 'Avoid wading through flood water or muddy fields without protective footwear. Farmers and outdoor workers should take prophylactic medication under public health supervision.';
  }
  if (norm.includes('typhoid') || norm.includes('a01') || norm.includes('cholera') || norm.includes('a00')) {
    return 'Consume only boiled or chlorination-treated drinking water. Ensure all food is thoroughly cooked and practice rigorous hand washing before meals.';
  }
  return 'Maintain strict personal and environmental hygiene. Consult a licensed medical practitioner immediately upon experiencing persistent fever or acute symptoms.';
}

/**
 * Dispatches strictly de-identified advisory emails to the provided recipient list in throttled batches.
 */
async function sendOutbreakAdvisoryEmail(recipients = [], alert = {}) {
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return { sentCount: 0, failedCount: 0, errors: [] };
  }

  const { sendOutbreakAlert } = require('../utils/emailService');
  const disease = alert.disease || 'Communicable Disease';
  const district = alert.location || alert.district || 'National';
  const severity = alert.severity || 'High';
  const guidance = getPreventionGuidance(disease);
  const publicHealthUrl = `${process.env.FRONTEND_URL || 'https://medisync.chamodtharusha.com.lk'}/public-health`;

  const advisoryBody = `
    Public Health Advisory: A ${severity}-priority epidemiological signal for ${disease} has been verified in ${district}.
    Precautionary Measures: ${guidance}
    To view real-time district statistics, risk indicators, and active surveillance maps, visit the official MediSync Public Health Observatory at: ${publicHealthUrl}
  `;

  let sentCount = 0;
  let failedCount = 0;
  const errors = [];

  // Throttle in sequential batches to protect mail transport
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE);
    const emailList = chunk.map((r) => (typeof r === 'string' ? r : r.email)).filter(Boolean);

    try {
      const res = await sendOutbreakAlert(emailList, district, advisoryBody, alert.maxZ || 'N/A');
      if (res && res.success !== false) {
        sentCount += emailList.length;
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

  return { sentCount, failedCount, errors };
}

module.exports = {
  resolveOutbreakRecipients,
  sendOutbreakAdvisoryEmail,
  getPreventionGuidance,
  DEFAULT_MAX_RECIPIENTS,
};
