// Row title for a past consultation: the recorded diagnosis with its ICD code, or "Consultation" when
// nothing was recorded. Display only.
const CIPHER = /^[0-9a-f]{32}:[0-9a-f]+/i;

export function consultationTitle(data = {}) {
  const diagnosis = typeof data?.diagnosis === 'string' ? data.diagnosis.trim() : '';
  if (!diagnosis || CIPHER.test(diagnosis)) return 'Consultation';
  const code = typeof data?.icdCode === 'string' ? data.icdCode.trim() : '';
  return code ? `${diagnosis} (${code})` : diagnosis;
}

export function consultationDoctor(data = {}) {
  const name = data?.doctorId?.fullName || data?.doctorName || '';
  return typeof name === 'string' ? name.trim() : '';
}
