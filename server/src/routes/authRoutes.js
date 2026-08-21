const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const protect = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 15 : 100, // Reasonable limit instead of 10000 / total skip
  message: { error: 'Too many attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false }
});

const regRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'production' ? 5 : 50,
  message: { error: 'Too many registration requests from this IP.' },
  validate: { trustProxy: false }
});

router.post('/register', regRateLimiter, authController.registerDoctor);
router.post('/register-patient', regRateLimiter, authController.registerPatient);
router.post('/register-pharmacy', regRateLimiter, authController.registerPharmacyStaff);
router.post('/login', authRateLimiter, authController.login);
router.post('/verify-otp', authRateLimiter, authController.verifyLoginOTP);
router.post('/send-otp', authRateLimiter, authController.sendOTP);
router.post('/login-type', protect(['doctor']), authController.setLoginType);
router.post('/change-password', protect(), authController.changePassword); // protect() with no roles allows any authenticated user
router.post('/forgot-password', authRateLimiter, authController.forgotPassword);
router.post('/reset-password', authRateLimiter, authController.resetPassword);
router.post('/reset-password-recovery', authRateLimiter, authController.resetPasswordRecovery);
router.post('/enable-2fa', protect(['doctor']), authController.enable2FA);
router.post('/verify-2fa', protect(['doctor']), authController.verify2FASetup);
router.post('/logout', protect(), authController.logout); // protect() with no roles allows any authenticated user
router.post('/heartbeat', protect(), authController.heartbeat);
router.post('/refresh', authController.refreshToken);

module.exports = router;