function passwordAccepted(value) {
  if (typeof value !== 'string' || value.length < 12) return false;
  let bytes; try { bytes = encodeURIComponent(value).replace(/%[A-F0-9]{2}|./g, 'x').length; } catch (_) { return false; }
  return bytes <= 72 && [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(rule => rule.test(value)).length >= 3;
}
const PASSWORD_REQUIREMENTS = 'Use at least 12 characters with three of uppercase, lowercase, number or symbol, and no more than 72 UTF-8 bytes.';
module.exports = { passwordAccepted, PASSWORD_REQUIREMENTS };
