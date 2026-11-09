'use strict';

const Prescription = require('../models/Prescription');
const Dispensing = require('../models/Dispensing');
const Pharmacy = require('../models/Pharmacy');
const PharmacyStaff = require('../models/PharmacyStaff');

/**
 * Compute unified medicine release summary for a consultation or prescription set.
 * Used identically by:
 * 1. Verification Portal (/api/verify/:token/otp/verify)
 * 2. Pharmacy History & Dispensing views
 *
 * Handles:
 * - not_released (all pending)
 * - partially_released (some pending, some dispensed)
 * - released (all dispensed)
 * - cancelled
 * - brand substitution (isAlternativeDispensed + alternativeDetails)
 * - pharmacist display name ("who released it", or "Not recorded")
 */
async function computeReleaseSummary(consultationId, options = {}) {
  if (!consultationId) {
    return {
      overallStatus: 'not_released',
      items: [],
      dispensings: [],
    };
  }

  // 1. Fetch all prescriptions bound to this consultation
  const prescriptions = await Prescription.find({ consultationId })
    .populate('dispensedBy', 'name district')
    .sort({ createdAt: 1 });

  if (!prescriptions || prescriptions.length === 0) {
    return {
      overallStatus: 'not_released',
      items: [],
      dispensings: [],
    };
  }

  // Decrypt prescription fields if encrypted
  for (const rx of prescriptions) {
    if (typeof rx.decryptFieldsSync === 'function') {
      try {
        rx.decryptFieldsSync();
      } catch (_) {}
    }
  }

  const prescriptionIds = prescriptions.map((p) => p._id);

  // 2. Fetch all dispensing records bound to these prescriptions
  const dispensingRecords = await Dispensing.find({ prescriptionId: { $in: prescriptionIds } })
    .populate('pharmacyId', 'name district')
    .populate('staffId', 'fullName role')
    .sort({ dispensedAt: 1 })
    .lean();

  // Create lookup map by prescriptionId string
  const dispensingByRxId = new Map();
  for (const d of dispensingRecords) {
    const rxKey = String(d.prescriptionId);
    if (!dispensingByRxId.has(rxKey)) {
      dispensingByRxId.set(rxKey, d);
    }
  }

  // 3. Assemble per-item release status
  const items = [];
  let dispensedCount = 0;
  let cancelledCount = 0;
  let pendingCount = 0;

  for (const rx of prescriptions) {
    const rxIdStr = String(rx._id);
    const linkedDispensing = dispensingByRxId.get(rxIdStr);

    const isReleased = rx.status === 'dispensed';
    if (isReleased) dispensedCount++;
    else if (rx.status === 'cancelled') cancelledCount++;
    else pendingCount++;

    // Resolve pharmacy details
    const pharmacyName =
      linkedDispensing?.pharmacyId?.name ||
      rx.dispensedBy?.name ||
      rx.pharmacyName ||
      (isReleased ? 'Verified Network Pharmacy' : 'Not recorded');

    const pharmacyDistrict =
      linkedDispensing?.pharmacyId?.district ||
      rx.dispensedBy?.district ||
      'Not recorded';

    // Resolve releasing pharmacist name
    const pharmacistName =
      linkedDispensing?.staffId?.fullName ||
      rx.dispensedByPharmacist ||
      (isReleased ? 'Licensed Pharmacist' : 'Not recorded');

    // Handle single drug or multiple drugs in prescription
    if (Array.isArray(rx.medications) && rx.medications.length > 0) {
      for (const med of rx.medications) {
        items.push({
          prescriptionId: rx.prescriptionId || rxIdStr,
          drugName: med.name || rx.drugName || 'Medication',
          dosage: med.dosage || rx.dosage || '',
          frequency: med.frequency || rx.frequency || '',
          durationDays: rx.durationDays || null,
          instructions: rx.instructions || '',
          released: isReleased,
          releasedAt: linkedDispensing?.dispensedAt || rx.dispensedAt || null,
          pharmacy: {
            name: pharmacyName,
            district: pharmacyDistrict,
          },
          releasedBy: {
            name: pharmacistName,
          },
          isSubstituted: Boolean(rx.isAlternativeDispensed),
          substitutionDetails: rx.alternativeDetails || '',
        });
      }
    } else {
      items.push({
        prescriptionId: rx.prescriptionId || rxIdStr,
        drugName: rx.drugName || 'Medication',
        dosage: rx.dosage || '',
        frequency: rx.frequency || '',
        durationDays: rx.durationDays || null,
        instructions: rx.instructions || '',
        released: isReleased,
        releasedAt: linkedDispensing?.dispensedAt || rx.dispensedAt || null,
        pharmacy: {
          name: pharmacyName,
          district: pharmacyDistrict,
        },
        releasedBy: {
          name: pharmacistName,
        },
        isSubstituted: Boolean(rx.isAlternativeDispensed),
        substitutionDetails: rx.alternativeDetails || '',
      });
    }
  }

  // 4. Compute overall status
  let overallStatus = 'not_released';
  if (prescriptions.length > 0) {
    if (dispensedCount === prescriptions.length) {
      overallStatus = 'released';
    } else if (dispensedCount > 0) {
      overallStatus = 'partially_released';
    } else if (cancelledCount === prescriptions.length) {
      overallStatus = 'cancelled';
    } else {
      overallStatus = 'not_released';
    }
  }

  // 5. Build unique dispensing receipts summary
  const dispensings = dispensingRecords.map((d) => ({
    receiptNo: d.receiptNumber,
    dispensedAt: d.dispensedAt,
    pharmacy: d.pharmacyId?.name || 'Verified Network Pharmacy',
    district: d.pharmacyId?.district || 'Not recorded',
    pharmacist: d.staffId?.fullName || 'Licensed Pharmacist',
    itemCount: Array.isArray(d.items) ? d.items.length : 1,
  }));

  return {
    overallStatus,
    items,
    dispensings,
  };
}

module.exports = {
  computeReleaseSummary,
};
