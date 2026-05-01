const bcrypt = require('bcryptjs');

exports.generateTempPassword = () => {
  const length = 10;
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let retVal = "";
  for (let i = 0, n = charset.length; i < length; ++i) {
    retVal += charset.charAt(Math.floor(Math.random() * n));
  }
  // Ensure at least one uppercase, one lowercase, one number
  const hasUpper = /[A-Z]/.test(retVal);
  const hasLower = /[a-z]/.test(retVal);
  const hasNumber = /[0-9]/.test(retVal);
  if (!hasUpper || !hasLower || !hasNumber) {
    return exports.generateTempPassword();
  }
  return retVal;
};

exports.validatePasswordStrength = (password) => {
  const requirements = {
    minLength: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password)
  };

  let score = 0;
  if (requirements.minLength) {
    if (requirements.hasUpper) score++;
    if (requirements.hasLower) score++;
    if (requirements.hasNumber) score++;
    if (requirements.hasSpecial) score++;
  }

  let message = "";
  if (score === 0 || score === 1) message = "Very weak";
  else if (score === 2) message = "Weak";
  else if (score === 3) message = "Good";
  else if (score === 4) message = "Strong";

  return {
    valid: score >= 2, // minimum threshold generally
    score,
    message,
    requirements
  };
};

exports.hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
};
