'use strict';
/**
 * Read-side helpers for clinical PDFs: decrypted medication rows, readable lab rows and the clinician /
 * facility shown on the document. Nothing here writes to the database.
 */
const mongoose = require('mongoose');

// A stored field-encryption payload looks like "<32 hex IV>:<hex ciphertext>". It must never reach a PDF.
const CIPHER_TOKEN = /\b[0-9a-f]{32}:[0-9a-f]{8,}/i;
const LAB_RESULT_PENDING = 'Unavailable until the laboratory uploads the result';
const LAB_UNAVAILABLE_MESSAGE = 'Lab result unavailable. It will appear after the laboratory uploads the result.';

function readableText(value, fallback = 'Unavailable') {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  if (!text || CIPHER_TOKEN.test(text)) return fallback;
  return text;
}

/**
 * Rows read with .lean() skip the model's init hook, which is where encrypted fields are decrypted.
 * hydrate() runs that hook (the same decryption the portal path gets from a normal query).
 */
function decryptLeanRows(Model, rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(row => {
    if (!row || typeof row !== 'object') return row;
    try {
      if (typeof row.decryptFieldsSync === 'function') { row.decryptFieldsSync(); return row.toObject ? row.toObject() : row; }
      if (Model && typeof Model.hydrate === 'function') { const doc = Model.hydrate(row); return doc.toObject ? doc.toObject() : doc; }
    } catch (_) { /* fall through: readableText() hides anything still encrypted */ }
    return row;
  });
}

const STATUS_LABELS = {
  pending: 'Pending', issued: 'Pending', dispensed: 'Dispensed', partially_dispensed: 'Partly dispensed',
  not_available: 'Not available', expired: 'Expired', cancelled: 'Cancelled',
};
function statusLabel(status) {
  if (!status) return 'Pending';
  return STATUS_LABELS[String(status).toLowerCase()] || readableText(String(status).replace(/_/g, ' '), 'Pending');
}

function durationText(rx) {
  if (rx.duration) return readableText(rx.duration, '-');
  if (Number.isFinite(Number(rx.durationDays)) && Number(rx.durationDays) > 0) return `${Number(rx.durationDays)} days`;
  return '-';
}

/** One row per medicine: Medicine, Dose, Frequency, Duration, Status. Multi-drug records are expanded. */
function medicationRows(list) {
  const rows = [];
  for (const rx of Array.isArray(list) ? list : []) {
    if (!rx || typeof rx !== 'object') continue;
    const multi = Array.isArray(rx.medications) && rx.medications.length && !rx.drugName ? rx.medications : null;
    const items = multi ? multi.map(m => ({ ...m, status: m.status || rx.status, durationDays: m.durationDays || rx.durationDays })) : [rx];
    for (const item of items) {
      rows.push([
        readableText(item.drugName || item.name, 'Unavailable'),
        readableText(item.dosage, '-'),
        readableText(item.frequency, '-'),
        durationText(item),
        statusLabel(item.status),
      ]);
    }
  }
  return rows;
}

function labResultReady(lab) {
  if (!lab) return false;
  const status = String(lab.status || '').toLowerCase();
  return ['completed', 'report_ready', 'delivered'].includes(status)
    || Boolean(lab.reportPath || lab.reportUploadedAt || lab.encryptedBlob || lab.reportFile?.data || lab.reportFile?.url);
}

function labRows(labTests, formatDate) {
  return (Array.isArray(labTests) ? labTests : []).map(lab => {
    const ready = labResultReady(lab);
    const result = ready
      ? readableText(typeof lab.results === 'string' ? lab.results : (lab.resultSummary || 'Result uploaded; see the laboratory report'), 'Result uploaded; see the laboratory report')
      : LAB_RESULT_PENDING;
    return [
      readableText(lab.testName || lab.name, 'Laboratory test'),
      lab.createdAt ? formatDate(lab.createdAt) : '-',
      readableText(String(lab.status || 'pending').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), 'Pending'),
      result,
    ];
  });
}

/**
 * Doctor and facility shown on a consultation PDF, from stored records:
 * populated consultation.doctorId -> the verification token's doctorRef -> Doctor.findById.
 * Facility: consultation hospital -> doctor's first hospital (hospital login) -> private practice.
 */
async function resolveClinician(consultation = {}, fallbackDoctor = null) {
  const ready = mongoose.connection?.readyState === 1;
  const isDoc = d => d && typeof d === 'object' && (d.fullName || d.name);
  let doctor = isDoc(consultation.doctorId) ? consultation.doctorId : (isDoc(fallbackDoctor) ? fallbackDoctor : null);
  const doctorId = consultation.doctorId?._id || consultation.doctorId;
  if (!doctor && doctorId && ready) {
    try { doctor = await mongoose.model('Doctor').findById(doctorId).select('fullName specialization licenseNo loginType clinicAddress hospitals'); } catch (_) { doctor = null; }
  }
  if (doctor && typeof doctor.decryptFieldsSync === 'function') { try { doctor.decryptFieldsSync(); } catch (_) {} }
  let facility = null;
  const hospitalId = consultation.hospitalId?._id || consultation.hospitalId
    || (doctor?.loginType === 'hospital' && Array.isArray(doctor.hospitals) && doctor.hospitals[0]) || null;
  if (hospitalId && typeof hospitalId === 'object' && hospitalId.name) facility = hospitalId.name;
  else if (hospitalId && ready) {
    try { facility = (await mongoose.model('Hospital').findById(hospitalId).select('name').lean())?.name || null; } catch (_) { facility = null; }
  }
  if (!facility) facility = doctor?.clinicAddress ? `Private practice, ${readableText(doctor.clinicAddress, '')}`.replace(/, $/, '') : 'Private practice';
  if (!doctor) return { hospitalName: facility };
  const plain = typeof doctor.toObject === 'function' ? doctor.toObject() : { ...doctor };
  return {
    _id: plain._id,
    fullName: readableText(plain.fullName || plain.name, 'Unavailable'),
    specialization: plain.specialization,
    slmcNumber: plain.slmcNumber || (plain.licenseNo ? readableText(plain.licenseNo, undefined) : undefined),
    hospitalName: facility,
  };
}

module.exports = {
  CIPHER_TOKEN, LAB_RESULT_PENDING, LAB_UNAVAILABLE_MESSAGE,
  readableText, decryptLeanRows, medicationRows, labRows, labResultReady, resolveClinician, statusLabel,
};
