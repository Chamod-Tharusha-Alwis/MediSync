const axios = require('axios');

const resendApiKey = process.env.RESEND_API_KEY || process.env.RESEND_SMTP_PASS || process.env.RESEND_KEY || process.env.RESEND_APIKEY;
const fromAddress = process.env.RESEND_FROM_ADDRESS || 'MediSync System <onboarding@resend.dev>';

// Startup verification log
console.log(`[EMAIL SERVICE INIT] Mode: 100% Direct Resend HTTPS REST API (Port 443) | API Key Present: ${!!resendApiKey} | Default Sender: ${fromAddress}`);
if (!resendApiKey) {
  console.warn('⚠️  [EMAIL SERVICE WARNING] Neither RESEND_API_KEY nor RESEND_SMTP_PASS is set in environment variables! Outbound emails will fail until configured.');
}

/**
 * sendMail — Core email dispatch function
 * Exclusively uses Resend HTTPS REST API (https://api.resend.com/emails) over Port 443.
 * Zero SMTP, zero nodemailer, zero port 465/587 sockets (immune to cloud host firewall blocking).
 */
const sendMail = async (options) => {
  if (!resendApiKey) {
    const errMsg = 'RESEND_API_KEY / RESEND_SMTP_PASS environment variable is not configured on this host.';
    console.error(`❌ [RESEND HTTPS ERROR] Cannot send email: ${errMsg}`);
    return { success: false, error: errMsg };
  }

  try {
    const fromFormatted = (options.from || fromAddress).includes('<')
      ? (options.from || fromAddress).match(/<([^>]+)>/)[1]
      : (options.from || fromAddress);

    const payload = {
      from: `MediSync System <${fromFormatted}>`,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text
    };

    if (options.bcc) {
      payload.bcc = Array.isArray(options.bcc) ? options.bcc : [options.bcc];
    }

    if (options.attachments && options.attachments.length > 0) {
      payload.attachments = options.attachments.map(att => ({
        filename: att.filename,
        content: Buffer.isBuffer(att.content) ? att.content.toString('base64') : att.content
      }));
    }

    const res = await axios.post('https://api.resend.com/emails', payload, {
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    console.log(`[RESEND HTTPS SUCCESS] Email delivered → ${options.to || options.bcc} | Subject: "${options.subject}" | Message ID: ${res.data?.id}`);
    return { success: true, messageId: res.data?.id, id: res.data?.id, ...res.data };
  } catch (apiErr) {
    const errorMsg = apiErr.response?.data?.message || apiErr.message;
    console.error(`[RESEND HTTPS FAILED] Status ${apiErr.response?.status || 'N/A'}: ${errorMsg}`);
    if (apiErr.response?.data) {
      console.error('[RESEND RESPONSE DATA]:', JSON.stringify(apiErr.response.data));
    }
    throw new Error(`Resend HTTPS Error: ${errorMsg}`);
  }
};

// -----------------------------------------------------------------------------
// 1. ONE-TIME PASSWORD (OTP) EMAIL
// -----------------------------------------------------------------------------
exports.sendOTPEmail = async (to, name, otp) => {
  const mailOptions = {
    from: fromAddress,
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
    const info = await sendMail(mailOptions);
    return { success: true, info };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// -----------------------------------------------------------------------------
// 2. TEMPORARY PASSWORD EMAIL
// -----------------------------------------------------------------------------
exports.sendTempPasswordEmail = async (to, name, tempPassword, loginUrl, hospitalName) => {
  const mailOptions = {
    from: fromAddress,
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
    const info = await sendMail(mailOptions);
    return { success: true, info };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// -----------------------------------------------------------------------------
// 3. WELCOME EMAIL
// -----------------------------------------------------------------------------
exports.sendWelcomeEmail = async (to, name, role) => {
  const mailOptions = {
    from: fromAddress,
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
            <a href="${process.env.CLIENT_URL || 'https://medisync.chamodtharusha.com.lk'}" style="background-color: #3B82F6; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Access Your Portal</a>
          </div>
        </div>
      </div>
    `
  };
  try {
    const info = await sendMail(mailOptions);
    return { success: true, info };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// -----------------------------------------------------------------------------
// 4. FOLLOW-UP REMINDER EMAIL
// -----------------------------------------------------------------------------
exports.sendFollowUpReminder = async (to, patientName, doctorName, date) => {
  const mailOptions = {
    from: fromAddress,
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
    const info = await sendMail(mailOptions);
    return { success: true, info };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// -----------------------------------------------------------------------------
// 5. PUBLIC HEALTH OUTBREAK ALERTS
// -----------------------------------------------------------------------------
exports.sendOutbreakAlert = async (emailList, district, message, zScore) => {
  if (!emailList || emailList.length === 0) return { success: true };
  
  const mailOptions = {
    from: fromAddress,
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

  const promises = emailList.map(email => sendMail({ ...mailOptions, to: email }));
  try {
    await Promise.allSettled(promises);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

exports.sendMassOutbreakAlert = async (emailArray, disease, district, riskLevel, spikePct) => {
  if (!emailArray || emailArray.length === 0) return { success: true };
  
  const mailOptions = {
    from: fromAddress,
    to: 'no-reply@medisync.lk',
    bcc: emailArray,
    subject: `🚨 CRITICAL: ${riskLevel} Risk ${disease} Outbreak Detected`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ffcdd2; border-radius: 8px; overflow: hidden;">
        <div style="background-color: ${riskLevel === 'High' ? '#B91C1C' : '#D97706'}; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px;">🚨 URGENT PUBLIC HEALTH ALERT</h1>
        </div>
        <div style="padding: 30px; background-color: #fff8f8;">
          <p style="font-size: 16px; color: #333333; line-height: 1.5;">
            A <strong>${riskLevel} Risk</strong> outbreak of <strong>${disease}</strong> has been detected in <strong>${district}</strong>${spikePct ? (typeof spikePct === 'number' ? ` (+${spikePct}% spike).` : '.') : '.'}
          </p>
          <p style="font-size: 16px; color: #333333; line-height: 1.5; font-weight: bold;">
            Please take immediate precautions.
          </p>
        </div>
        <div style="background-color: #f9f9f9; padding: 15px; text-align: center; border-top: 1px solid #e0e0e0;">
          <p style="font-size: 12px; color: #777777; margin: 0;">This is an automated mass alert from the MediSync AI Engine.</p>
        </div>
      </div>
    `
  };

  try {
    const info = await sendMail(mailOptions);
    return { success: true, info };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// -----------------------------------------------------------------------------
// 6. E-PRESCRIPTION EMAIL
// -----------------------------------------------------------------------------
exports.sendPrescriptionEmail = async (patientEmail, patientName, pdfBuffer, securePassword) => {
  if (!patientEmail || !pdfBuffer) {
    return { success: false, error: 'Missing recipient email or PDF buffer' };
  }

  const mailOptions = {
    from: fromAddress,
    to: patientEmail,
    subject: "MediSync — Your Secure E-Prescription",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0D3B66; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">MediSync</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <p style="font-size: 16px; color: #333333;">Hello ${patientName || 'Patient'},</p>
          <p style="font-size: 16px; color: #333333; line-height: 1.5;">
            Your recent E-Prescription is attached. To ensure your medical privacy, the PDF is locked.
            Please enter your secure 8-character PDF Key: <strong style="font-family: monospace; font-size: 18px; color: #0D3B66; letter-spacing: 1px;">${securePassword || 'N/A'}</strong> to open it.
          </p>
        </div>
      </div>
    `,
    attachments: [
      {
        filename: 'MediSync_Prescription.pdf',
        content: pdfBuffer,
        contentType: 'application/pdf'
      }
    ]
  };

  try {
    const info = await sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// -----------------------------------------------------------------------------
// 7. APPOINTMENT REMINDER EMAIL
// -----------------------------------------------------------------------------
exports.sendReminderEmail = async (patientEmail, patientName, formattedDate, doctorName) => {
  if (!patientEmail) return { success: false, error: 'No email address' };

  const mailOptions = {
    from: fromAddress,
    to: patientEmail,
    subject: `MediSync — Appointment Reminder: ${formattedDate}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #0D3B66 0%, #1a5fa8 100%); padding: 24px 28px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px;">MediSync</h1>
        </div>
        <div style="padding: 32px 28px; background-color: #ffffff;">
          <p style="font-size: 16px; color: #333333;">Hello <strong>${patientName || 'Patient'}</strong>,</p>
          <p style="font-size: 15px; color: #444444;">This is a reminder that you have a scheduled consultation with <strong>Dr. ${doctorName || 'Your Doctor'}</strong> on <strong>${formattedDate}</strong>.</p>
        </div>
      </div>
    `
  };

  try {
    const info = await sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// -----------------------------------------------------------------------------
// 8. DISPENSE NOTIFICATION EMAIL
// -----------------------------------------------------------------------------
exports.sendDispenseNotificationEmail = async (patientEmail, patientName, pharmacyName, dispenserName, medications, dispensedAt) => {
  if (!patientEmail) return { success: false, error: 'No email address' };

  const mailOptions = {
    from: fromAddress,
    to: patientEmail,
    subject: `MediSync — Your Medication Has Been Dispensed`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #065f46 0%, #047857 100%); padding: 24px 28px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 22px;">MediSync</h1>
        </div>
        <div style="padding: 32px 28px; background-color: #ffffff;">
          <p style="font-size: 16px; color: #333333;">Hello <strong>${patientName || 'Patient'}</strong>,</p>
          <p style="font-size: 15px; color: #444444;">Your medication has been dispensed at <strong>${pharmacyName || 'a MediSync Pharmacy'}</strong> by <strong>${dispenserName || 'Pharmacist'}</strong> at ${dispensedAt}.</p>
          <p>Medications: <strong>${medications}</strong></p>
        </div>
      </div>
    `
  };

  try {
    const info = await sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// -----------------------------------------------------------------------------
// 9. SECURITY ANOMALY & RECOVERY EMAILS
// -----------------------------------------------------------------------------
exports.sendAnomalyEmail = async (email, deviceModel, location) => {
  const mailOptions = {
    from: fromAddress,
    to: email,
    subject: "MediSync — Untrusted Login Attempt Detected",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px;">
        <div style="background-color: #D32F2F; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0;">Security Alert</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <p>We detected a login attempt from an unrecognized device: <strong>${deviceModel || 'Unknown Device'}</strong> (${location || 'Unknown Location'}).</p>
        </div>
      </div>
    `
  };
  try {
    const info = await sendMail(mailOptions);
    return { success: true, info };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

exports.sendRecoveryEmail = async (email, link, purpose) => {
  const mailOptions = {
    from: fromAddress,
    to: email,
    subject: `MediSync — Account Recovery: ${purpose}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px;">
        <div style="background-color: #0D3B66; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0;">Account Recovery</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <p>You requested account recovery for: <strong>${purpose}</strong></p>
          <p>Click the link below to proceed:</p>
          <a href="${link}" style="background-color: #3B82F6; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 10px;">Recover Account</a>
        </div>
      </div>
    `
  };
  try {
    const info = await sendMail(mailOptions);
    return { success: true, info };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

exports.sendDeviceRemovedEmail = async (email, deviceModel) => {
  const mailOptions = {
    from: fromAddress,
    to: email,
    subject: "MediSync — Trusted Device Removed",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px;">
        <div style="background-color: #0D3B66; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0;">Device Removed</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          <p>A device was removed from your trusted devices: <strong>${deviceModel || 'Unknown Device'}</strong>.</p>
        </div>
      </div>
    `
  };
  try {
    const info = await sendMail(mailOptions);
    return { success: true, info };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

exports.sendEmail = async ({ to, subject, html, text }) => {
  const mailOptions = {
    from: fromAddress,
    to,
    subject,
    html,
    text
  };
  try {
    const info = await sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// -----------------------------------------------------------------------------
// 10. LOGIN NOTIFICATION EMAIL (TRUSTED VS UNTRUSTED SECURITY ALERT)
// -----------------------------------------------------------------------------
exports.sendLoginNotificationEmail = async (to, name, idField, role, device, networkInfo, loginType, hospitalName, isTrusted = true) => {
  const isHospital = loginType === 'Hospital Login';
  const isNewDevice = isTrusted === false;
  const workspaceStr = isHospital && hospitalName ? "<li><strong>Workspace:</strong> " + hospitalName + "</li>" : "";

  const headerBg = isNewDevice ? '#C62828' : (isHospital ? '#1976D2' : '#2E7D32');
  const headerTitle = isNewDevice ? '🚨 New Device Login Detected' : (isHospital ? 'Hospital Login Notification' : 'Login Notification');
  const subject = isNewDevice
    ? `🚨 MediSync Security Alert: Login from NEW Unrecognized Device (${device || 'Unknown Device'})`
    : `MediSync - ${isHospital ? 'Hospital' : 'New'} Login Notification`;

  const newDeviceWarning = isNewDevice ? `
    <div style="background-color: #FFEBEE; border: 1px solid #FFCDD2; border-left: 4px solid #C62828; padding: 14px 16px; margin-bottom: 20px; border-radius: 6px;">
      <p style="margin: 0; color: #B71C1C; font-weight: bold; font-size: 14px;">
        ⚠️ Security Alert: This is a new device we haven't seen before on your account.
      </p>
      <p style="margin: 6px 0 0; color: #5F2120; font-size: 12px;">
        If you did not sign in from this device, your password may have been compromised. Change your password immediately.
      </p>
    </div>
  ` : '';

  const mailOptions = {
    from: fromAddress,
    to: to,
    subject: subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: ${headerBg}; padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 20px;">${headerTitle}</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff;">
          ${newDeviceWarning}
          <p>Hello ${name},</p>
          <p>A new login was detected on your MediSync <strong>${role}</strong> account.</p>
          <ul style="list-style: none; padding-left: 0; line-height: 1.6;">
            <li><strong>Identifier:</strong> ${idField}</li>
            ${workspaceStr}
            <li><strong>Device:</strong> ${device || 'Unknown Device'}</li>
            <li><strong>Device Status:</strong> <span style="font-weight: bold; color: ${isNewDevice ? '#C62828' : '#2E7D32'};">${isNewDevice ? '⚠️ Untrusted / New Device' : '✅ Trusted Device'}</span></li>
            <li><strong>Network Provider:</strong> ${networkInfo?.isp || 'Unknown ISP'}</li>
            <li><strong>Country:</strong> ${networkInfo?.country || 'Unknown Country'}</li>
            <li><strong>Time:</strong> ${new Date().toLocaleString()}</li>
            <li><small style="color: #777;">Nearest network hub: ${networkInfo?.city || 'Unknown'}, ${networkInfo?.region || 'Unknown'}</small></li>
          </ul>
          <p style="margin-top: 24px; color: #555; font-size: 0.9em;">If this was you, you can safely ignore this email. If not, please contact MediSync security support immediately.</p>
        </div>
      </div>
    `
  };
  try {
    const info = await sendMail(mailOptions);
    return { success: true, info };
  } catch (err) {
    console.error('[LOGIN NOTIFICATION ERROR]', err.message);
    return { success: false, error: err.message };
  }
};
