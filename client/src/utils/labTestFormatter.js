/**
 * client/src/utils/labTestFormatter.js
 * Centralized, safe lab test extraction and formatting utility.
 * Guarantees primitive string/boolean return values; never returns raw objects as React children.
 */

// Status label map for standard capitalization and formatting
const STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  sample_collected: 'Sample Collected',
  processing: 'Processing',
  report_ready: 'Report Ready',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
};

/**
 * Safely extracts the display name of a lab test.
 * @param {string|object|null|undefined} labTest
 * @param {string} [fallback='Lab Test']
 * @returns {string}
 */
export function formatLabTestName(labTest, fallback = 'Lab Test') {
  if (labTest === null || labTest === undefined) return fallback;
  if (typeof labTest === 'string') {
    const trimmed = labTest.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }
  if (typeof labTest === 'object') {
    const candidate =
      labTest.testName ||
      labTest.name ||
      labTest.data?.testName ||
      labTest.data?.name ||
      labTest.testCategory ||
      labTest.data?.testCategory ||
      labTest.reportOriginalName ||
      labTest.data?.reportOriginalName;
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return fallback;
}

/**
 * Convenience alias for formatLabTestName.
 * @param {string|object|null|undefined} labTest
 * @param {string} [fallback='Lab Test']
 * @returns {string}
 */
export function getLabTestName(labTest, fallback = 'Lab Test') {
  return formatLabTestName(labTest, fallback);
}

/**
 * Safely extracts and formats the status of a lab test into Title Case.
 * @param {string|object|null|undefined} labTest
 * @param {string} [fallback='Pending']
 * @returns {string}
 */
export function formatLabTestStatus(labTest, fallback = 'Pending') {
  if (labTest === null || labTest === undefined) return fallback;
  let rawStatus = '';
  if (typeof labTest === 'object') {
    rawStatus = labTest.status || labTest.data?.status || '';
  } else if (typeof labTest === 'string') {
    rawStatus = labTest;
  }
  if (!rawStatus || typeof rawStatus !== 'string') return fallback;

  const normalizedKey = rawStatus.toLowerCase().trim();
  if (STATUS_LABELS[normalizedKey]) {
    return STATUS_LABELS[normalizedKey];
  }

  // Handle snake_case or arbitrary lowercase strings gracefully
  const titleCased = normalizedKey
    .split(/[_\s]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return titleCased.length > 0 ? titleCased : fallback;
}

/**
 * Safely extracts the formatted order/creation date.
 * @param {string|object|null|undefined} labTest
 * @param {string} [fallback='—']
 * @returns {string}
 */
export function formatLabTestDate(labTest, fallback = '—') {
  if (!labTest || typeof labTest !== 'object') return fallback;
  const rawDate =
    labTest.createdAt ||
    labTest.date ||
    labTest.data?.createdAt ||
    labTest.data?.date ||
    labTest.reportUploadedAt ||
    labTest.orderedAt;
  if (!rawDate) return fallback;
  try {
    const d = new Date(rawDate);
    return isNaN(d.getTime()) ? fallback : d.toLocaleDateString();
  } catch {
    return fallback;
  }
}

/**
 * Safely extracts report / lab test identifier.
 * @param {string|object|null|undefined} labTest
 * @param {string} [fallback='—']
 * @returns {string}
 */
export function formatLabTestId(labTest, fallback = '—') {
  if (labTest === null || labTest === undefined) return fallback;
  if (typeof labTest === 'string') {
    const trimmed = labTest.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }
  if (typeof labTest === 'object') {
    const candidate =
      labTest.labTestId ||
      labTest.reportId ||
      labTest._id ||
      labTest.data?.labTestId ||
      labTest.data?.reportId ||
      labTest.data?._id;
    if (candidate !== null && candidate !== undefined) {
      const s = String(candidate).trim();
      return s.length > 0 ? s : fallback;
    }
  }
  return fallback;
}

/**
 * Safely extracts a comprehensive lab test summary for cards and detail modals.
 * Every returned field (except raw) is guaranteed to be a primitive string or boolean.
 * @param {string|object|null|undefined} labTest
 * @returns {object}
 */
export function formatLabTestSummary(labTest) {
  const isObj = labTest !== null && typeof labTest === 'object';
  const name = formatLabTestName(labTest);
  const status = formatLabTestStatus(labTest);
  const reportId = formatLabTestId(labTest);
  const date = formatLabTestDate(labTest);
  const category = isObj
    ? (labTest.testCategory || labTest.data?.testCategory || 'General Diagnostics')
    : 'General Diagnostics';
  const urgency = isObj
    ? (labTest.urgency || labTest.data?.urgency || 'routine')
    : 'routine';
  const notes = isObj
    ? (labTest.notes || labTest.remarks || labTest.data?.notes || '')
    : '';
  const doctorName = isObj
    ? (labTest.doctorName ||
       labTest.doctorId?.fullName ||
       labTest.data?.doctorId?.fullName ||
       labTest.data?.doctorName ||
       'Attending Physician')
    : 'Attending Physician';
  const hospitalName = isObj
    ? (labTest.hospitalName ||
       labTest.hospitalId?.name ||
       labTest.data?.hospitalId?.name ||
       labTest.data?.hospitalName ||
       'MediSync Central Laboratory')
    : 'MediSync Central Laboratory';
  const isCompleted = ['Approved', 'Report Ready', 'Delivered', 'Completed'].includes(status);

  return {
    testName: name,
    status,
    reportId,
    date,
    category: String(category),
    urgency: String(urgency),
    notes: String(notes),
    doctorName: String(doctorName),
    hospitalName: String(hospitalName),
    isCompleted,
    raw: isObj ? labTest : null,
  };
}

/**
 * Formats a lab test into a standard structured object.
 * Provided for backwards-compatibility with explorer specifications.
 * @param {string|object|null|undefined} labTest
 * @returns {object}
 */
export function formatLabTest(labTest) {
  const summary = formatLabTestSummary(labTest);
  return {
    testName: summary.testName,
    status: summary.status,
    displayStatus: summary.status,
    date: summary.date === '—' ? '' : summary.date,
    id: summary.reportId === '—' ? '' : summary.reportId,
    urgency: summary.urgency,
  };
}

/**
 * Safely extracts and formats status history items.
 * @param {Array|null|undefined} statusHistory
 * @returns {Array<{status: string, date: string, note: string}>}
 */
export function formatStatusHistory(statusHistory) {
  if (!Array.isArray(statusHistory)) return [];
  return statusHistory.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      return {
        status: typeof entry === 'string' && entry.trim().length > 0 ? entry.trim() : 'Status Update',
        date: '—',
        note: '',
      };
    }
    const status = formatLabTestStatus(entry.status, 'Status Update');
    let date = '—';
    if (entry.changedAt) {
      try {
        const d = new Date(entry.changedAt);
        if (!isNaN(d.getTime())) date = d.toLocaleDateString();
      } catch {
        date = '—';
      }
    }
    return {
      status,
      date,
      note: typeof entry.note === 'string' ? entry.note : '',
    };
  });
}

/**
 * Safely extracts prescription drug name.
 * @param {string|object|null|undefined} rx
 * @param {string} [fallback='Medication']
 * @returns {string}
 */
export function getPrescriptionDrugName(rx, fallback = 'Medication') {
  if (rx === null || rx === undefined) return fallback;
  if (typeof rx === 'string') {
    const trimmed = rx.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }
  if (typeof rx === 'object') {
    const candidate =
      rx.drugName ||
      rx.name ||
      rx.medications?.[0]?.name ||
      rx.medications?.[0]?.drugName ||
      rx.data?.drugName ||
      rx.data?.name;
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return fallback;
}
