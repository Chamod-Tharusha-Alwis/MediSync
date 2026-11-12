'use strict';

const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const protect = require('../middleware/verifiedAuth');
const {
  getVerificationPublicStatus,
  requestVerificationOtp,
  verifyOtpAndUnlock,
  downloadHistoryPdfWithNicGate,
  downloadConsultationPdfWithSessionGate,
  getLabTestsForVerification,
  downloadLabReportForVerification,
  revokeVerificationToken,
} = require('../controllers/verificationController');

// Rate limit history downloads to 5 attempts per 15 minutes per IP
const historyGateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many verification attempts from this IP. Please try again in 15 minutes.',
  },
});

// Rate limit OTP requests to 10 attempts per 15 minutes per IP
const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many OTP requests from this IP. Please try again shortly.',
  },
});

// Rate limit OTP verify submissions to 15 attempts per 15 minutes per IP
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many verification attempts from this IP. Please try again shortly.',
  },
});

// 1. Public authenticity verification status (no auth, no clinical data leaks)
router.get('/:token', getVerificationPublicStatus);

// 2. Automated OTP request at scan / page-load time
router.post('/:token/otp/request', otpRequestLimiter, requestVerificationOtp);

// 3. OTP verification & clinical + release data unlock
router.post('/:token/otp/verify', otpVerifyLimiter, verifyOtpAndUnlock);

// 4. Consultation Report Download Gate (authorized by view session token)
router.post('/:token/consultation-pdf', historyGateLimiter, downloadConsultationPdfWithSessionGate);
router.post('/:token/history-pdf', historyGateLimiter, downloadHistoryPdfWithNicGate);

// 5. Laboratory Tests list & download for verified encounter (Fix 4)
router.get('/:token/lab-tests', getLabTestsForVerification);
router.get('/:token/lab-tests/:labTestId/download', historyGateLimiter, downloadLabReportForVerification);

// 6. Revocation endpoint (patient owner or clinical staff)
router.post(
  '/:token/revoke',
  protect(['patient', 'doctor', 'admin', 'super_admin']),
  revokeVerificationToken
);

module.exports = router;
