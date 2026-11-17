'use strict';
/**
 * Fix pack 2, B1: per-medicine "not available at this pharmacy" and consultation progress.
 * A not-available mark never cancels the prescription: it stays pending so another pharmacy can dispense it.
 */
const mongoose = require('mongoose');

const REASONS = Object.freeze({ out_of_stock: 'Out of stock', not_stocked: 'Not stocked at this pharmacy', other: 'Other' });

class ItemError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

async function markNotAvailable({ user, prescriptionRef, patientNic, reason, note = '', now = new Date() }, models = {}) {
  const Prescription = models.Prescription || require('../models/Prescription');
  const PharmacyStaff = models.PharmacyStaff || require('../models/PharmacyStaff');
  const Pharmacy = models.Pharmacy || require('../models/Pharmacy');
  if (!user?.id || !['pharmacist', 'pharmacy_admin'].includes(user.role)) throw new ItemError('FORBIDDEN', 'Authorized pharmacy staff required.', 403);
  if (!Object.hasOwn(REASONS, reason)) throw new ItemError('INVALID_REASON', 'Choose a reason: out of stock, not stocked, or other.');
  const cleanNote = typeof note === 'string' ? note.trim().slice(0, 200) : '';
  if (reason === 'other' && !cleanNote) throw new ItemError('REASON_NOTE_REQUIRED', 'Add a short note for "other".');
  const nic = typeof patientNic === 'string' ? patientNic.trim().toUpperCase() : '';
  if (!nic) throw new ItemError('INVALID_PATIENT', 'Patient NIC is required.');
  if (typeof prescriptionRef !== 'string' || !prescriptionRef.trim()) throw new ItemError('INVALID_PRESCRIPTION', 'Prescription identifier is required.');

  const staff = await PharmacyStaff.findById(user.id);
  if (!staff || staff.isActive !== true || staff.isVerified !== true || staff.role !== user.role) throw new ItemError('FORBIDDEN', 'Pharmacy staff account is not eligible.', 403);
  const pharmacy = await Pharmacy.findById(staff.pharmacyId);
  if (!pharmacy || pharmacy.isActive !== true) throw new ItemError('FORBIDDEN', 'Pharmacy is not active.', 403);

  const rx = await Prescription.findOne(mongoose.isObjectIdOrHexString(prescriptionRef) ? { _id: prescriptionRef } : { prescriptionId: prescriptionRef });
  if (!rx) throw new ItemError('PRESCRIPTION_NOT_FOUND', 'Prescription not found.', 404);
  if (String(rx.patientNic || '').trim().toUpperCase() !== nic) throw new ItemError('PATIENT_MISMATCH', 'Prescription does not belong to this patient.', 403);
  if (!['pending', 'issued'].includes(rx.status)) throw new ItemError('NOT_PENDING', 'Only a pending medicine can be marked not available.', 409);

  const mark = { pharmacyId: pharmacy._id, pharmacyName: pharmacy.name, staffId: String(staff._id), pharmacistName: staff.fullName, reason, note: cleanNote, at: now };
  // Conditional update: still pending, and not already marked by this pharmacy (idempotent per pharmacy).
  const res = await Prescription.updateOne(
    { _id: rx._id, status: { $in: ['pending', 'issued'] }, 'unavailableAt.pharmacyId': { $ne: pharmacy._id } },
    { $push: { unavailableAt: mark } });
  return { prescription: rx, pharmacy, staff, mark, changed: res.modifiedCount === 1 };
}

/** Per consultation: total medicines, dispensed, and still pending (not-available items count as pending). */
async function consultationProgress(consultationRefs = [], models = {}) {
  const Prescription = models.Prescription || require('../models/Prescription');
  const refs = [...new Set(consultationRefs.filter(r => typeof r === 'string' && r))];
  if (!refs.length) return {};
  const rows = await Prescription.aggregate([
    { $match: { consultationRef: { $in: refs }, isOTC: { $ne: true }, status: { $ne: 'cancelled' } } },
    { $group: { _id: '$consultationRef', total: { $sum: 1 }, dispensed: { $sum: { $cond: [{ $eq: ['$status', 'dispensed'] }, 1, 0] } } } },
  ]);
  return Object.fromEntries(rows.map(r => [r._id, { total: r.total, dispensed: r.dispensed, complete: r.total > 0 && r.dispensed === r.total }]));
}

module.exports = { markNotAvailable, consultationProgress, REASONS, ItemError };
