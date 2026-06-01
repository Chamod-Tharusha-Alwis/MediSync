// server/src/utils/email.js
exports.sendEmail = async (options) => {
  console.log('\n=======================================');
  console.log('✉️  MOCK EMAIL SENT');
  console.log('To:      ', options.to);
  console.log('Subject: ', options.subject);
  console.log('=======================================\n');
  return true;
};
