/**
 * client/src/utils/doctorName.js
 * Presentation-layer doctor name normalization utility.
 * Guarantees zero duplicate "Dr. Dr." prefixes without modifying database models.
 */

const INSTITUTIONAL_REGEX = /\b(laboratory|hospital|administrator|medisync)\b/i;

/**
 * Strips any leading "Dr.", "Dr ", "Doctor ", "Dr. Dr.", etc. (case-insensitively).
 * Preserves names starting with Dr- root words (e.g. "Drew", "Drake").
 *
 * @param {string} name - Raw name string
 * @returns {string} - Unprefixed clean name (e.g. "Chamod Alwis")
 */
export function stripDoctorPrefix(name) {
  if (!name || typeof name !== 'string') return '';
  return name.trim().replace(/^(?:(?:dr|doctor)\b[.\s]*)+/i, '').trim();
}

/**
 * Formats a doctor's display name to ensure exactly one clean "Dr. " prefix.
 *
 * @param {string} name - Raw name string (e.g. "Dr. Dr. Silva", "Chamod", "Doctor Perera")
 * @param {string} [fallback=''] - Optional fallback if name is empty or falsy
 * @returns {string} - Normalized name (e.g. "Dr. Silva"), or fallback if empty
 */
export function formatDoctorName(name, fallback = '') {
  const target = (name && typeof name === 'string' && name.trim())
    ? name
    : (fallback && typeof fallback === 'string' ? fallback : '');

  if (!target || typeof target !== 'string') return '';
  const trimmed = target.trim();
  if (!trimmed) return '';

  // Preserve institutional facility labels without prepending "Dr."
  if (INSTITUTIONAL_REGEX.test(trimmed)) {
    return trimmed;
  }

  const stripped = stripDoctorPrefix(trimmed);
  if (!stripped) {
    return 'Dr. Doctor';
  }

  return `Dr. ${stripped}`;
}

export default formatDoctorName;
