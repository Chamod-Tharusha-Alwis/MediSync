'use strict';

const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const protect = require('../middleware/verifiedAuth');
const {
  getVerificationPublicStatus,
  downloadHistoryPdfWithNicGate,
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

// Public authenticity verification status (no auth, no clinical data leaks)
router.get('/:token', getVerificationPublicStatus);

// Patient History Download Gate (NIC comparison required)
router.post('/:token/history-pdf', historyGateLimiter, downloadHistoryPdfWithNicGate);

// Revocation endpoint (patient owner or clinical staff)
router.post(
  '/:token/revoke',
  protect(['patient', 'doctor', 'admin', 'super_admin']),
  revokeVerificationToken
);

module.exports = router;
