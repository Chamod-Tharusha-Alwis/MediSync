/**
 * server/src/utils/doctorName.js
 * Server-side doctor name normalization utility for PDFs, emails, and controllers.
 */

const INSTITUTIONAL_REGEX = /\b(laboratory|hospital|administrator|medisync)\b/i;

function stripDoctorPrefix(name) {
  if (!name || typeof name !== 'string') return '';
  return name.trim().replace(/^(?:(?:dr|doctor)\b[.\s]*)+/i, '').trim();
}

function formatDoctorName(name, fallback = '') {
  const target = (name && typeof name === 'string' && name.trim())
    ? name
    : (fallback && typeof fallback === 'string' ? fallback : '');

  if (!target || typeof target !== 'string') return '';
  const trimmed = target.trim();
  if (!trimmed) return '';

  if (INSTITUTIONAL_REGEX.test(trimmed)) {
    return trimmed;
  }

  const stripped = stripDoctorPrefix(trimmed);
  if (!stripped) {
    return 'Dr. Doctor';
  }

  return `Dr. ${stripped}`;
}

module.exports = {
  stripDoctorPrefix,
  formatDoctorName,
};
