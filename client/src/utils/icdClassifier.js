/**
 * Standard ICD classification detector for client UI.
 * Differentiates between WHO ICD-11 MMS codes and US ICD-10-CM codes.
 */
export function detectIcdVersion(code) {
  if (!code || typeof code !== 'string') return 'ICD-10';
  const clean = code.trim().toUpperCase();

  // ICD-11: 4-character code starting with digit 1-9 (e.g. 6A70, 1D20)
  if (/^[1-9][A-Z0-9]{3}(?:\.[A-Z0-9]{1,3})?$/.test(clean)) {
    return 'ICD-11';
  }

  // ICD-11: 4-character code starting with double letters for chapters 10-26 (e.g. BA00, CA23, DA42)
  if (/^[A-S][A-Z][0-9]{2}(?:\.[A-Z0-9]{1,3})?$/.test(clean)) {
    return 'ICD-11';
  }

  // ICD-10: Single letter followed by 2 digits [A-Z][0-9]{2}
  if (/^[A-Z][0-9]{2}(?:\.[A-Z0-9]{1,4})?$/.test(clean)) {
    return 'ICD-10';
  }

  return 'ICD-10';
}
