// server/src/utils/email.js
exports.sendEmail = async (options) => {
  console.log('\n=======================================');
  console.log('✉️  MOCK EMAIL SENT');
  console.log('To:      ', options.to);
  console.log('Subject: ', options.subject);

  const plainText = (options.text || (options.html ? options.html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ') : ''))
    .replace(/\s+/g, ' ')
    .trim();

  const otpMatch = plainText.match(/\b\d{6}\b/);
  if (otpMatch) {
    console.log('🔑 OTP CODE: ', otpMatch[0]);
  }

  if (plainText) {
    console.log('Body:    ', plainText.slice(0, 300));
  }

  console.log('=======================================\n');
  return true;
};
