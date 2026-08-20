const http = require('http');

async function testRateLimit() {
  const loginData = JSON.stringify({ email: "superadmin@medisync.com", password: "SecureCiAdminPassword2026!" });
  const sendOtpData = JSON.stringify({ email: "superadmin@medisync.com", purpose: "password-reset" });
  const resetData = JSON.stringify({ email: "superadmin@medisync.com", otp: "000000", newPassword: "Password123!" });

  const post = (path, data) => {
    return new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port: 5005,
        path: path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      }, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.write(data);
      req.end();
    });
  };

  console.log("1. Sending OTP...");
  const otpRes = await post('/api/auth/send-otp', sendOtpData);
  console.log("OTP Status:", otpRes.status, otpRes.body);

  console.log("\n2. Attempting 6 wrong OTPs...");
  for (let i = 1; i <= 6; i++) {
    const res = await post('/api/auth/reset-password', resetData);
    console.log(`Attempt ${i} Status: ${res.status}`);
  }
}

testRateLimit();
