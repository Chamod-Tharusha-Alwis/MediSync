// Match the server's dispensable states. This is a display filter, not authority
// to dispense: consent, inventory, expiry and transaction checks remain server-side.
export function isActivePrescription(prescription, now = Date.now()) {
  if (!prescription || !['pending', 'issued'].includes(prescription.status)) return false;
  const expiry = new Date(prescription.expiresAt).getTime();
  return Number.isFinite(expiry) && expiry > now;
}

export function resolvePrescriptionStatus(prescription, now = Date.now()) {
  if (!prescription) return 'expired';
  if (prescription.status === 'dispensed') return 'dispensed';
  if (prescription.status === 'cancelled') return 'cancelled';
  if (prescription.status === 'expired') return 'expired';
  const expiry = new Date(prescription.expiresAt).getTime();
  if (Number.isFinite(expiry) && expiry <= now) return 'expired';
  if (prescription.status === 'pending') return 'pending';
  return 'issued';
}

export function groupPrescriptionsByConsultation(prescriptions = [], consultations = [], now = Date.now()) {
  if (!Array.isArray(prescriptions)) return [];
  const consultationList = Array.isArray(consultations) ? consultations : [];

  const consultationByRxId = new Map();
  const consultationById = new Map();
  for (const c of consultationList) {
    if (!c || typeof c !== 'object') continue;
    if (c._id) consultationById.set(String(c._id), c);
    if (Array.isArray(c.prescriptions)) {
      for (const rx of c.prescriptions) {
        const rxKey = String(rx?._id || rx?.prescriptionId || '');
        if (rxKey && c._id) consultationByRxId.set(rxKey, c);
      }
    }
  }

  const groups = new Map();

  for (const rx of prescriptions) {
    if (!rx || typeof rx !== 'object') continue;
    const rxKey = String(rx._id || rx.prescriptionId || '');
    const explicitConsultId = rx.consultationRef || rx.consultationId || null;
    const matchedConsultation =
      (explicitConsultId && consultationById.get(String(explicitConsultId))) ||
      (rxKey && consultationByRxId.get(rxKey)) ||
      null;

    const groupKey = String(
      explicitConsultId ||
      matchedConsultation?._id ||
      rx._id ||
      rx.prescriptionId ||
      Math.random()
    );

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        _id: groupKey,
        groupKey,
        consultationRef: explicitConsultId || (matchedConsultation?._id ? String(matchedConsultation._id) : null),
        prescriptionId: rx.prescriptionId || null,
        doctorId: rx.doctorId || matchedConsultation?.doctorId || null,
        doctorName:
          rx.doctorName ||
          rx.doctorId?.fullName ||
          matchedConsultation?.doctorId?.fullName ||
          'Doctor',
        hospitalName:
          rx.hospitalName ||
          rx.hospitalId?.name ||
          matchedConsultation?.hospitalId?.name ||
          '',
        diagnosis: rx.diagnosis || matchedConsultation?.diagnosis || '',
        consultationDate: rx.consultationDate || matchedConsultation?.createdAt || rx.createdAt || null,
        expiresAt: rx.expiresAt || null,
        instructions: rx.instructions || '',
        labTests: [],
        medications: [],
        prescriptions: [],
      });
    }

    const group = groups.get(groupKey);
    group.prescriptions.push(rx);
    if (!group.prescriptionId && rx.prescriptionId) group.prescriptionId = rx.prescriptionId;
    if (!group.diagnosis && rx.diagnosis) group.diagnosis = rx.diagnosis;
    if (!group.expiresAt && rx.expiresAt) group.expiresAt = rx.expiresAt;
    if (rx.expiresAt && group.expiresAt && new Date(rx.expiresAt) > new Date(group.expiresAt)) {
      group.expiresAt = rx.expiresAt;
    }

    const labs = Array.isArray(rx.labTests)
      ? rx.labTests
      : Array.isArray(matchedConsultation?.labTests)
      ? matchedConsultation.labTests
      : [];
    for (const lab of labs) {
      const label = typeof lab === 'string' ? lab : lab?.testName || lab?.name || JSON.stringify(lab);
      if (label && !group.labTests.some(existing => (typeof existing === 'string' ? existing : existing?.testName || existing?.name || JSON.stringify(existing)) === label)) {
        group.labTests.push(lab);
      }
    }

    const rxStatus = resolvePrescriptionStatus(rx, now);
    const rxActive = isActivePrescription(rx, now);
    const rawMeds = Array.isArray(rx.medications) && rx.medications.length > 0
      ? rx.medications
      : [{
          name: rx.drugName || rx.name || 'Prescription',
          dosage: rx.dosage || '',
          frequency: rx.frequency || '',
          durationDays: rx.durationDays || null,
          instructions: rx.instructions || '',
        }];

    rawMeds.forEach((m, idx) => {
      const medName = m?.name || m?.drugName || rx.drugName || 'Prescription';
      group.medications.push({
        _id: `${rx._id || rx.prescriptionId || groupKey}-${idx}`,
        prescriptionId: rx.prescriptionId || null,
        name: medName,
        drugName: medName,
        dosage: m?.dosage || rx.dosage || '',
        frequency: m?.frequency || rx.frequency || '',
        durationDays: m?.durationDays || rx.durationDays || null,
        instructions: m?.instructions || rx.instructions || '',
        status: rxStatus,
        isActive: rxActive,
        expiresAt: rx.expiresAt || null,
      });
    });
  }

  return [...groups.values()].map(group => {
    const hasActiveMedication = group.medications.some(m => m.isActive);
    const hasDispensedMedication = group.medications.some(m => m.status === 'dispensed');
    const overallStatus = hasActiveMedication
      ? 'issued'
      : hasDispensedMedication
      ? 'dispensed'
      : 'expired';
    return {
      ...group,
      status: overallStatus,
      hasActiveMedication,
      activeMedicationCount: group.medications.filter(m => m.isActive).length,
    };
  });
}

export function patientDashboardTimeline(timeline) {
  if (!Array.isArray(timeline)) throw new Error('Invalid medical timeline response');
  const consultations = timeline.filter(event => event?.type === 'consultation').map(event => event.data);
  if (consultations.some(row => !row || typeof row !== 'object' || (row.prescriptions !== undefined && !Array.isArray(row.prescriptions)))) throw new Error('Invalid consultation timeline response');
  const rows = [...timeline.filter(event => event?.type === 'prescription').map(event => event.data), ...consultations.flatMap(row => row.prescriptions || [])];
  const prescriptions = new Map();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || !(row._id || row.prescriptionId)) throw new Error('Invalid prescription timeline response');
    prescriptions.set(String(row._id || row.prescriptionId), row);
  }
  return { consultations, prescriptions: [...prescriptions.values()] };
}
