'use strict';

const Prescription = require('../models/Prescription');
const Dispensing = require('../models/Dispensing');
const Pharmacy = require('../models/Pharmacy');
const PharmacyStaff = require('../models/PharmacyStaff');
const { getPrescriptionActiveState } = require('../utils/prescriptionLifecycle');

/**
 * Standard group helper for dispensing receipts.
 * Shared between Pharmacy History controller and Public Verification views.
 */
function groupDispensingHistoryByReceipt(records = []) {
  const byReceipt = new Map();

  for (const raw of records) {
    if (!raw) continue;
    const rec = typeof raw.toObject === 'function' ? raw.toObject() : { ...raw };
    const receiptKey = String(rec.receiptNumber || rec._id || Math.random());

    const extractedItems = [];
    if (Array.isArray(rec.items) && rec.items.length > 0) {
      for (const item of rec.items) {
        if (!item) continue;
        extractedItems.push({
          drugName: item.drugName || item.name || 'Medication',
          dosage: item.dosage || '',
          quantityDispensed: Number(item.quantityDispensed) || 1,
          unit: item.unit || 'units',
          status: item.status || 'dispensed',
        });
      }
    } else if (Array.isArray(rec.prescriptionId?.medications) && rec.prescriptionId.medications.length > 0) {
      for (const med of rec.prescriptionId.medications) {
        if (!med) continue;
        extractedItems.push({
          drugName: med.name || med.drugName || 'Medication',
          dosage: med.dosage || '',
          quantityDispensed: Number(med.quantity || med.quantityDispensed) || 1,
          unit: med.unit || 'units',
          status: 'dispensed',
        });
      }
    } else if (rec.prescriptionId?.drugName) {
      extractedItems.push({
        drugName: rec.prescriptionId.drugName,
        dosage: rec.prescriptionId.dosage || '',
        quantityDispensed: 1,
        unit: 'units',
        status: 'dispensed',
      });
    }

    if (!byReceipt.has(receiptKey)) {
      byReceipt.set(receiptKey, {
        ...rec,
        receiptNumber: rec.receiptNumber || receiptKey,
        pharmacyName: rec.pharmacyName || rec.pharmacyId?.name || 'Verified Network Pharmacy',
        pharmacistName: rec.pharmacistName || rec.staffId?.fullName || 'Licensed Pharmacist',
        district: rec.pharmacyId?.district || 'Not recorded',
        isAlternativeDispensed: Boolean(rec.isAlternativeDispensed || rec.prescriptionId?.isAlternativeDispensed),
        alternativeDetails: rec.alternativeDetails || rec.prescriptionId?.alternativeDetails || '',
        items: [],
        medications: [],
      });
    }

    const group = byReceipt.get(receiptKey);
    for (const item of extractedItems) {
      const existing = group.items.find(
        (i) => i.drugName.toLowerCase() === item.drugName.toLowerCase() && (i.dosage || '') === (item.dosage || '')
      );
      if (existing) {
        existing.quantityDispensed = (Number(existing.quantityDispensed) || 0) + (Number(item.quantityDispensed) || 1);
      } else {
        group.items.push({ ...item });
      }
    }
  }

  return [...byReceipt.values()].map((group) => {
    const medications = group.items.map((i) => ({
      name: i.drugName,
      drugName: i.drugName,
      dosage: i.dosage,
      quantityDispensed: i.quantityDispensed,
      unit: i.unit,
      status: i.status || 'dispensed',
    }));
    return {
      ...group,
      medications,
      medicationCount: medications.length,
      medicationSummary: medications
        .map(
          (m) =>
            m.drugName +
            (m.dosage ? ' ' + m.dosage : '') +
            (m.quantityDispensed ? ' (' + m.quantityDispensed + ' ' + (m.unit || 'units') + ')' : '')
        )
        .join(', '),
    };
  });
}

/**
 * Compute unified medicine release summary for a consultation or prescription set.
 * Used identically by:
 * 1. Verification Portal (/api/verify/:token/otp/verify)
 * 2. Pharmacy History & Dispensing views
 *
 * Handles:
 * - not_released (all pending)
 * - partially_released (some pending, some dispensed, or partially_dispensed)
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
  let partialCount = 0;
  let cancelledCount = 0;
  let pendingCount = 0;

  for (const rx of prescriptions) {
    const rxIdStr = String(rx._id);
    const linkedDispensing = dispensingByRxId.get(rxIdStr);

    const isReleased = rx.status === 'dispensed';
    const isPartial = rx.status === 'partially_dispensed';

    if (isReleased) dispensedCount++;
    else if (isPartial) partialCount++;
    else if (rx.status === 'cancelled') cancelledCount++;
    else pendingCount++;

    // Resolve pharmacy details
    const pharmacyName =
      linkedDispensing?.pharmacyName ||
      linkedDispensing?.pharmacyId?.name ||
      rx.dispensedBy?.name ||
      rx.pharmacyName ||
      (isReleased || isPartial ? 'Verified Network Pharmacy' : 'Not recorded');

    const pharmacyDistrict =
      linkedDispensing?.pharmacyId?.district ||
      rx.dispensedBy?.district ||
      'Not recorded';

    // Resolve releasing pharmacist name
    const pharmacistName =
      linkedDispensing?.pharmacistName ||
      linkedDispensing?.staffId?.fullName ||
      rx.dispensedByPharmacist ||
      (isReleased || isPartial ? 'Licensed Pharmacist' : 'Not recorded');

    const activeState = getPrescriptionActiveState(rx);
    let itemReleaseStatus;
    let statusLabel;

    if (isReleased) {
      itemReleaseStatus = 'released';
      statusLabel = activeState === 'expired' ? 'Course ended' : (activeState === 'superseded' ? 'Replaced by newer prescription' : 'Released');
    } else if (isPartial) {
      itemReleaseStatus = 'partially_released';
      statusLabel = 'Partially Released';
    } else if (rx.status === 'cancelled') {
      itemReleaseStatus = 'cancelled';
      statusLabel = 'Cancelled';
    } else if (activeState === 'superseded') {
      itemReleaseStatus = 'superseded';
      statusLabel = 'Replaced by newer prescription';
    } else if (activeState === 'expired') {
      itemReleaseStatus = 'expired';
      statusLabel = 'Course ended';
    } else {
      itemReleaseStatus = 'not_released';
      statusLabel = 'Not Released';
    }

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
          status: itemReleaseStatus,
          statusLabel: statusLabel,
          activeState: activeState,
          isSuperseded: activeState === 'superseded',
          isExpired: activeState === 'expired',
          releasedAt: linkedDispensing?.dispensedAt || rx.dispensedAt || null,
          pharmacy: {
            name: pharmacyName,
            district: pharmacyDistrict,
          },
          releasedBy: {
            name: pharmacistName,
          },
          isSubstituted: Boolean(rx.isAlternativeDispensed || linkedDispensing?.isAlternativeDispensed),
          substitutionDetails: rx.alternativeDetails || linkedDispensing?.alternativeDetails || '',
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
        status: itemReleaseStatus,
        statusLabel: statusLabel,
        activeState: activeState,
        isSuperseded: activeState === 'superseded',
        isExpired: activeState === 'expired',
        releasedAt: linkedDispensing?.dispensedAt || rx.dispensedAt || null,
        pharmacy: {
          name: pharmacyName,
          district: pharmacyDistrict,
        },
        releasedBy: {
          name: pharmacistName,
        },
        isSubstituted: Boolean(rx.isAlternativeDispensed || linkedDispensing?.isAlternativeDispensed),
        substitutionDetails: rx.alternativeDetails || linkedDispensing?.alternativeDetails || '',
      });
    }
  }

  // 4. Compute overall status
  let overallStatus = 'not_released';
  if (prescriptions.length > 0) {
    if (dispensedCount === prescriptions.length) {
      overallStatus = 'released';
    } else if (dispensedCount > 0 || partialCount > 0) {
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
    pharmacy: d.pharmacyName || d.pharmacyId?.name || 'Verified Network Pharmacy',
    district: d.pharmacyId?.district || 'Not recorded',
    pharmacist: d.pharmacistName || d.staffId?.fullName || 'Licensed Pharmacist',
    itemCount: Array.isArray(d.items) ? d.items.length : 1,
    isAlternativeDispensed: Boolean(d.isAlternativeDispensed),
    alternativeDetails: d.alternativeDetails || '',
  }));

  return {
    overallStatus,
    items,
    dispensings,
  };
}

module.exports = {
  computeReleaseSummary,
  groupDispensingHistoryByReceipt,
};
