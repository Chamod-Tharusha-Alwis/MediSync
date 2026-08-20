require('dotenv').config({ path: './server/.env' });
const { sendOTP } = require('./server/src/utils/emailService');

(async () => {
  try {
    console.log("Starting SMTP test...");
    await sendOTP('medisync.system.lk@gmail.com', '123456');
    console.log("Success: Test OTP sent!");
  } catch (err) {
    console.error("Failed:", err);
  }
})();
