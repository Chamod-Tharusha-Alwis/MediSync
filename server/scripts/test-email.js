require('dotenv').config();
const emailService = require('./src/utils/emailService');

async function run() {
  console.log('Testing email using provider:', process.env.EMAIL_PROVIDER);
  const result = await emailService.sendEmail({
    to: process.env.EMAIL_USER,
    subject: 'MediSync Test Email',
    text: 'This is a test email sent via Gmail SMTP'
  });
  
  if (result.success) {
    console.log('SUCCESS! Message ID:', result.messageId);
  } else {
    console.log('FAILED:', result.error);
  }
}
run();
