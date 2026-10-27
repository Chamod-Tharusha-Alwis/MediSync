'use strict';
function normalizeLoginIdentifier(value) {
  if (typeof value !== 'string') throw new Error('LOGIN_IDENTIFIER_INVALID');
  const identifier = value.trim();
  if (!identifier || identifier.length > 254 || /[\x00-\x1f\x7f]/.test(identifier)) throw new Error('LOGIN_IDENTIFIER_INVALID');
  return identifier;
}
function literalIdentifierPattern(value) {
  const identifier = normalizeLoginIdentifier(value);
  return new RegExp('^' + identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
}
module.exports = { normalizeLoginIdentifier, literalIdentifierPattern };
