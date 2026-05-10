const nodemailer = require('nodemailer');

/**
 * Gmail SMTP Configuration
 * IMPORTANT: EMAIL_PASS must be a Gmail App Password (16 chars), NOT your account password.
 * How to get an App Password:
 *   1. Go to myaccount.google.com/security
 *   2. Enable 2-Step Verification
 *   3. Search for "App passwords" → Create one for "Mail"
 *   4. Copy the 16-character code and set it as EMAIL_PASS in .env
 */
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // TLS (STARTTLS), not SSL
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false // Allow self-signed certs in dev
  }
});

// Verify on startup and log result
transporter.verify((error) => {
  if (error) {
    console.warn(`⚠️  Email service not configured: ${error.message}`);
    console.warn('   Emails will be skipped. Set EMAIL_USER and EMAIL_PASS in .env');
  } else {
    console.log(`✅  Email service configured: ${process.env.EMAIL_USER}`);
  }
});


exports.sendOTPEmail = async (to, name, otp) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: "MediSync — Your Secure Login OTP",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0D3B66; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">MediSync</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <p style="font-size: 16px; color: #333333;">Hello Dr. ${name},</p>
          <p style="font-size: 16px; color: #333333;">Your secure login One-Time Password (OTP) is:</p>
          <div style="margin: 30px 0; padding: 20px; background-color: #f4f7f6; border-radius: 8px; text-align: center;">
            <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0D3B66;">${otp}</span>
          </div>
          <p style="font-size: 14px; color: #d32f2f; font-weight: bold;">Valid for 10 minutes</p>
        </div>
        <div style="background-color: #f9f9f9; padding: 15px; text-align: center; border-top: 1px solid #e0e0e0;">
          <p style="font-size: 12px; color: #777777; margin: 0;">Never share this OTP with anyone. If you didn't request this, please contact support immediately.</p>
        </div>
      </div>
    `
  };
  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

exports.sendTempPasswordEmail = async (to, name, tempPassword, loginUrl, hospitalName) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: "MediSync — Your Hospital Account Access",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0D3B66; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">${hospitalName} - MediSync Access</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <p style="font-size: 16px; color: #333333;">Hello ${name},</p>
          <p style="font-size: 16px; color: #333333;">An account has been created or updated for you to access ${hospitalName} via the MediSync platform. Your temporary credentials are:</p>
          <div style="margin: 20px 0; padding: 20px; background-color: #f4f7f6; border-radius: 8px;">
            <p style="margin: 0 0 10px 0; font-size: 14px; color: #555555;">Email / Login ID: <strong>${to}</strong></p>
            <p style="margin: 0; font-size: 14px; color: #555555;">Temporary Password: <strong style="font-family: monospace; font-size: 16px;">${tempPassword}</strong></p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginUrl}" style="background-color: #3B82F6; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Log In Now</a>
          </div>
          <p style="font-size: 14px; color: #d32f2f; font-weight: bold; text-align: center;">You must change your password on first login.</p>
        </div>
      </div>
    `
  };
  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

exports.sendWelcomeEmail = async (to, name, role) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: "Welcome to MediSync",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0D3B66; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Welcome to MediSync</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <p style="font-size: 16px; color: #333333;">Hello ${name},</p>
          <p style="font-size: 16px; color: #333333;">Welcome to Sri Lanka's Digital Health Platform.</p>
          <div style="margin: 20px 0; text-align: center;">
            <span style="display: inline-block; padding: 6px 12px; background-color: #e3f2fd; color: #1565C0; border-radius: 16px; font-size: 14px; font-weight: bold; text-transform: uppercase;">Role: ${role.replace('_', ' ')}</span>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.CLIENT_URL}" style="background-color: #3B82F6; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Access Your Portal</a>
          </div>
        </div>
      </div>
    `
  };
  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

exports.sendFollowUpReminder = async (to, patientName, doctorName, date) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: "MediSync — Follow-up Reminder",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0D3B66; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">MediSync</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <p style="font-size: 16px; color: #333333;">Hello ${patientName},</p>
          <p style="font-size: 16px; color: #333333;">This is a friendly reminder for your upcoming medical follow-up.</p>
          <div style="margin: 30px 0; padding: 20px; border-left: 4px solid #3B82F6; background-color: #f4f7f6;">
            <p style="margin: 0 0 10px 0; font-size: 16px; color: #333333;"><strong>Doctor:</strong> ${doctorName}</p>
            <p style="margin: 0; font-size: 16px; color: #333333;"><strong>Date:</strong> ${date}</p>
          </div>
          <p style="font-size: 14px; color: #777777;">Please contact the clinic if you need to reschedule.</p>
        </div>
      </div>
    `
  };
  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

exports.sendOutbreakAlert = async (emailList, district, message, zScore) => {
  if (!emailList || emailList.length === 0) return;
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    subject: `⚠ MediSync Public Health Alert — ${district}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ffcdd2; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #C62828; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px;">⚠ Public Health Alert</h1>
        </div>
        <div style="padding: 30px; background-color: #fff8f8;">
          <div style="margin-bottom: 20px;">
            <span style="display: inline-block; padding: 4px 10px; background-color: #ffebee; color: #c62828; border-radius: 4px; font-weight: bold; font-size: 14px;">District: ${district}</span>
            <span style="display: inline-block; padding: 4px 10px; background-color: #ffebee; color: #c62828; border-radius: 4px; font-weight: bold; font-size: 14px; margin-left: 10px;">Z-Score: ${zScore}</span>
          </div>
          <p style="font-size: 16px; color: #333333; line-height: 1.5;">${message}</p>
        </div>
        <div style="background-color: #f9f9f9; padding: 15px; text-align: center; border-top: 1px solid #e0e0e0;">
          <p style="font-size: 12px; color: #777777; margin: 0;">This is an automated alert from the MediSync AI Engine.</p>
        </div>
      </div>
    `
  };

  const promises = emailList.map(email => {
    return transporter.sendMail({ ...mailOptions, to: email });
  });

  try {
    await Promise.allSettled(promises);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
