// Match the server's dispensable states. This is a display filter, not authority
// to dispense: consent, inventory, expiry and transaction checks remain server-side.
export function isActivePrescription(prescription, now = Date.now()) {
  if (!prescription || !['pending', 'issued'].includes(prescription.status)) return false;
  const expiry = new Date(prescription.expiresAt).getTime();
  return Number.isFinite(expiry) && expiry > now;
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
