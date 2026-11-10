'use strict';

/**
 * Standard ICD classification detector.
 * Differentiates between WHO ICD-11 MMS codes and US ICD-10-CM codes.
 *
 * Rules:
 * - ICD-11 MMS codes have 4-character alphanumeric roots:
 *   - Start with a digit (1-9) e.g., 6A70 (Depression), 1D20 (Dengue), 5A11 (Type 2 diabetes)
 *   - Or start with 2 uppercase letters for chapters 10-26 (AA-SA) e.g., BA00 (Hypertension), CA23 (Asthma), DA42 (GERD)
 * - ICD-10-CM codes:
 *   - Single letter [A-Z] followed by 2 digits [0-9]{2}, optionally with dot and subcategories e.g., A90, F32.9, E11.9
 */
function detectIcdVersion(code) {
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

/**
 * Verifies that an ICD-10 code does not match ICD-11 syntax.
 */
function isValidIcd10Syntax(code) {
  if (!code || typeof code !== 'string') return false;
  const clean = code.trim().toUpperCase();
  return /^[A-Z][0-9]{2}(?:\.[A-Z0-9]{1,4})?$/.test(clean) && !/^[A-S][A-Z][0-9]{2}/.test(clean);
}

module.exports = {
  detectIcdVersion,
  isValidIcd10Syntax
};
