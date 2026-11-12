/**
 * Extracts a single language message from a trilingual string.
 * MediSync format:
 * Line 0: English
 * Line 1: Sinhala
 * Line 2: Tamil
 */
export function getLocalizedMessage(rawMessage, lang = 'en') {
  if (!rawMessage || typeof rawMessage !== 'string') return '';
  const lines = rawMessage.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length <= 1) return rawMessage.trim();

  const normalized = (lang || 'en').toLowerCase();
  if (lines.length >= 3) {
    if (normalized === 'si') return lines[1];
    if (normalized === 'ta') return lines[2];
    return lines[0];
  }
  if (lines.length === 2) {
    if (normalized === 'si') return lines[1];
    return lines[0];
  }
  return lines[0];
}

const ICD_NAMES = {
  A90: 'Dengue',
  A91: 'Dengue Haemorrhagic Fever',
  J09: 'Influenza',
  J10: 'Influenza',
  J11: 'Influenza',
  'J11.1': 'Influenza',
  J111: 'Influenza',
  A09: 'Gastroenteritis',
  B01: 'Chickenpox',
  B05: 'Measles',
  A01: 'Typhoid Fever',
  'A01.0': 'Typhoid Fever',
  A010: 'Typhoid Fever',
  A27: 'Leptospirosis',
  'A27.9': 'Leptospirosis',
  A279: 'Leptospirosis',
  A82: 'Rabies',
  'U07.1': 'COVID-19',
};

export function formatFriendlyDisease(disease) {
  if (!disease) return 'Outbreak';
  const clean = String(disease).trim();
  const upper = clean.toUpperCase();
  if (ICD_NAMES[upper]) {
    return `${ICD_NAMES[upper]} (${upper})`;
  }
  for (const [code, name] of Object.entries(ICD_NAMES)) {
    if (upper === name.toUpperCase()) {
      return `${name} (${code})`;
    }
  }
  return clean;
}
