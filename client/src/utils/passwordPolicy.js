/**
 * passwordPolicy.js
 * Authoritative client password evaluation mirroring server/src/utils/passwordUtils.js
 */

const MAX_BYTES = 72;
const MIN_LENGTH = 12;

function getUtf8ByteLength(str) {
  if (typeof str !== 'string') return 0;
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).length;
  }
  try {
    return encodeURIComponent(str).replace(/%[A-F0-9]{2}|./g, 'x').length;
  } catch (_) {
    return str.length;
  }
}

function evaluatePasswordStrength(password) {
  if (typeof password !== 'string' || !password) {
    return {
      score: 0,
      label: 'Empty',
      color: 'bg-slate-700',
      textColor: 'text-slate-400',
      percent: 0,
      valid: false,
      byteLength: 0,
      requirements: {
        minLength: false,
        byteLimit: true,
        hasUpper: false,
        hasLower: false,
        hasNumber: false,
        hasSpecial: false,
      },
      classCount: 0,
    };
  }

  const byteLength = getUtf8ByteLength(password);
  const minLength = password.length >= MIN_LENGTH;
  const byteLimit = byteLength <= MAX_BYTES;

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  const classes = [hasUpper, hasLower, hasNumber, hasSpecial];
  const classCount = classes.filter(Boolean).length;

  let score = 0;
  if (minLength && byteLimit) {
    if (hasUpper) score++;
    if (hasLower) score++;
    if (hasNumber) score++;
    if (hasSpecial) score++;
  }

  // 5 discrete levels (0 to 4)
  let label = 'Very Weak';
  let color = 'bg-rose-600';
  let textColor = 'text-rose-400';
  let percent = 10;

  if (!minLength || !byteLimit || score <= 1) {
    if (!byteLimit) {
      score = 0;
      label = 'Invalid length';
      color = 'bg-rose-700';
      textColor = 'text-rose-500';
      percent = 5;
    } else {
      score = score <= 1 && minLength ? 1 : 0;
      label = score === 1 ? 'Weak' : 'Very Weak';
      color = score === 1 ? 'bg-rose-500' : 'bg-rose-600';
      textColor = score === 1 ? 'text-rose-400' : 'text-rose-500';
      percent = score === 1 ? 25 : 10;
    }
  } else if (score === 2) {
    label = 'Fair';
    color = 'bg-amber-500';
    textColor = 'text-amber-400';
    percent = 50;
  } else if (score === 3) {
    label = 'Good';
    color = 'bg-teal-500';
    textColor = 'text-teal-400';
    percent = 75;
  } else if (score === 4) {
    label = 'Strong';
    color = 'bg-emerald-500';
    textColor = 'text-emerald-400';
    percent = 100;
  }

  return {
    score,
    label,
    color,
    textColor,
    percent,
    valid: score >= 3 && byteLimit,
    byteLength,
    requirements: {
      minLength,
      byteLimit,
      hasUpper,
      hasLower,
      hasNumber,
      hasSpecial,
    },
    classCount,
  };
}

function passwordAccepted(value) {
  if (value && typeof value === 'object' && typeof value.valid === 'boolean') {
    return value.valid;
  }
  const result = evaluatePasswordStrength(value);
  return result.valid;
}

const PASSWORD_REQUIREMENTS = 'Use at least 12 characters with three of uppercase, lowercase, number or symbol, and no more than 72 UTF-8 bytes.';

module.exports = {
  getUtf8ByteLength,
  evaluatePasswordStrength,
  passwordAccepted,
  PASSWORD_REQUIREMENTS,
  MAX_BYTES,
  MIN_LENGTH,
};
