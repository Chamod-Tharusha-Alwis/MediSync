const Doctor = require('../models/Doctor');
const OTPSession = require('../models/OTPSession');
const bcrypt = require('bcryptjs');

const requireOTP = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Only applies to doctors
    if (userRole !== 'doctor') {
      return next();
    }

    const doctor = await Doctor.findById(userId);
    if (!doctor || !doctor.twoFactorEnabled) {
      return next();
    }

    // If we reach here, the doctor has 2FA enabled.
    // Check if they have verified via OTP for this sensitive operation.
    // We expect the client to send an `otpToken` in the headers for sensitive routes.
    const otpToken = req.headers['x-otp-token'];

    if (!otpToken) {
      return res.status(403).json({ requiresOTP: true, message: 'OTP is required for this operation.' });
    }

    // OTP Token format: we'll treat the otpToken as a temporary token linked to a verified session
    // Or we could have an endpoint that accepts OTP and sets a cookie or returns a short-lived token
    // Actually, the prompt says "Checks if doctor has 2FA enabled. If yes, requires valid OTP before allowing sensitive operations. Returns 403 with {requiresOTP: true} if OTP not verified."
    // Usually this means the request body must contain the OTP, or a session flag is set.
    // Let's assume the user sends the raw OTP in `req.body.otp` for the sensitive request itself, or a temporary validation token.
    
    // For simplicity, let's assume they send `otp` in the request body.
    if (req.body.otp) {
      // Find valid OTP session
      const otpSession = await OTPSession.findOne({
        userId: doctor._id,
        userModel: 'Doctor',
        used: false,
        expiresAt: { $gt: Date.now() }
      });

      if (!otpSession) {
         return res.status(403).json({ requiresOTP: true, message: 'Invalid or expired OTP.' });
      }

      const isValid = await bcrypt.compare(req.body.otp, otpSession.otp);
      if (!isValid) {
         return res.status(403).json({ requiresOTP: true, message: 'Invalid OTP.' });
      }

      // Mark as used
      otpSession.used = true;
      await otpSession.save();
      
      return next();
    } else {
      return res.status(403).json({ requiresOTP: true, message: 'OTP is required for this operation.' });
    }

  } catch (err) {
    console.error('requireOTP Error:', err);
    return res.status(500).json({ error: 'Server error during OTP validation' });
  }
};

module.exports = requireOTP;
