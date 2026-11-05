'use strict';

// Display only: never use this result for addressing, authentication or storage.
function maskLoginAlertIdentifier(input) {
  if (typeof input !== 'string') return '***';
  const value = input.trim();
  if (!value) return '***';
  if (value.includes('@')) {
    const match = value.match(/^([^\s@]+)@([A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)$/);
    return match ? `${Array.from(match[1])[0]}***@${match[2]}` : '***';
  }
  if (/^(?:\d{12}|\d{9}[VX])$/i.test(value)) {
    return value.slice(0, 4) + '*'.repeat(value.length - 7) + value.slice(-3);
  }
  // Staff/registration IDs: at most three prefix and two suffix characters.
  // Short/unknown inputs are fully hidden instead of exposing the whole value.
  const characters = Array.from(value);
  if (characters.length <= 5) return '***';
  return characters.slice(0, 3).join('') + '*'.repeat(characters.length - 5) + characters.slice(-2).join('');
}

module.exports = { maskLoginAlertIdentifier };
