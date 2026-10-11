// server/src/utils/email.js
const emailService = require('./emailService');

exports.sendEmail = async (options) => {
  return emailService.sendEmail(options);
};
