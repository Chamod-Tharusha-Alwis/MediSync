const crypto = require('crypto');

/**
 * Helper to get time strings for the current and previous hour.
 * Format: YYYY-MM-DD-HH
 */
const getHourStrings = () => {
  const now = new Date();
  const currentStr = now.toISOString().slice(0, 13); // e.g. "2026-05-21T03" -> "2026-05-21T03"
  
  // Previous hour
  const prev = new Date(now.getTime() - 60 * 60 * 1000);
  const prevStr = prev.toISOString().slice(0, 13);

  return { currentStr, prevStr };
};

/**
 * Generate HMAC token for a given hour string.
 */
const generateTokenForHour = (hourStr) => {
  const secret = process.env.INTERNAL_API_KEY || 'medisync-internal-secret-2024';
  return crypto
    .createHmac('sha256', secret)
    .update(hourStr)
    .digest('hex');
};

/**
 * Generates the token for the current hour.
 */
const generateToken = () => {
  const { currentStr } = getHourStrings();
  return generateTokenForHour(currentStr);
};

/**
 * Verifies a token against the current and previous hour's expected tokens.
 */
const verifyToken = (token) => {
  if (!token) return false;
  const { currentStr, prevStr } = getHourStrings();
  
  const expectedCurrent = generateTokenForHour(currentStr);
  const expectedPrev = generateTokenForHour(prevStr);

  return token === expectedCurrent || token === expectedPrev;
};

module.exports = {
  generateToken,
  verifyToken
};
