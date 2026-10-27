'use strict';
const LANGUAGES = Object.freeze(['en', 'si', 'ta']);
class LanguagePreferenceError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
function normalizePreferredLanguage(value) {
  if (typeof value !== 'string' || value.length > 16) throw new LanguagePreferenceError('INVALID_PREFERRED_LANGUAGE', 400);
  const language = value.trim().toLowerCase();
  if (!LANGUAGES.includes(language)) throw new LanguagePreferenceError('INVALID_PREFERRED_LANGUAGE', 400);
  return language;
}
// Historical invalid/missing values are read as English without rewriting records.
function savedPreferredLanguage(value) {
  try { return normalizePreferredLanguage(value); } catch (_) { return 'en'; }
}
function preferredLanguageField() { return { type: String, enum: [...LANGUAGES], default: 'en' }; }
function supportsLanguagePersistence(model) {
  const field = model?.schema?.path('preferredLanguage');
  return field?.instance === 'String' && field.defaultValue === 'en' && Array.isArray(field.enumValues) && field.enumValues.length === LANGUAGES.length && LANGUAGES.every(value => field.enumValues.includes(value));
}
module.exports = { LANGUAGES, LanguagePreferenceError, normalizePreferredLanguage, savedPreferredLanguage, preferredLanguageField, supportsLanguagePersistence };
