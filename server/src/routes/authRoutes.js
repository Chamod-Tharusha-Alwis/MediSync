const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const protect = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // Increased limit for dev/testing
  message: { error: 'Too many attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
});

router.post('/register', authController.registerDoctor);
router.post('/register-patient', authController.registerPatient);
router.post('/register-pharmacy', authController.registerPharmacyStaff);
router.post('/login', authRateLimiter, authController.login);
router.post('/verify-otp', authRateLimiter, authController.verifyLoginOTP);
router.post('/send-otp', authRateLimiter, authController.sendOTP);
router.post('/login-type', protect(['doctor']), authController.setLoginType);
router.post('/change-password', protect(), authController.changePassword);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/enable-2fa', protect(['doctor']), authController.enable2FA);
router.post('/verify-2fa', protect(['doctor']), authController.verify2FASetup);
router.post('/logout', protect(), authController.logout);
router.post('/refresh', authController.refreshToken);

module.exports = router;