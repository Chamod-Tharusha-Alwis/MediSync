const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');
const protect = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 10000 : 1000,
  message: { error: 'Too many login attempts. Try again later.' },
  skip: () => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
  validate: { trustProxy: false }
});

// Auth routes
router.post('/register', patientController.registerPatient);
router.post('/login', loginLimiter, patientController.loginPatient);

// Patient data routes
// Self-service profile update — MUST be before /:nic wildcard
router.put('/profile', protect(['patient']), patientController.updatePatientProfile);
// Medical profiles: self/scoped doctor; admins receive account fields only.
// Hospital/pharmacy callers reach the controller only for an audited denial;
// their medical-profile purpose/organisation policy is unresolved.
router.get('/:nic', protect(['patient', 'doctor', 'admin', 'super_admin', 'pharmacist', 'pharmacy_admin', 'hospital_admin']), patientController.getPatient);
router.put('/:nic', protect(['patient']), patientController.updatePatient);
router.get('/:nic/timeline', protect(['patient', 'doctor', 'hospital_admin']), patientController.getTimeline);
router.get('/:nic/prescriptions', protect(['patient', 'doctor', 'admin', 'super_admin']), patientController.getPrescriptions);
router.post('/consultation/:id/rate', protect(['patient']), patientController.rateConsultation);

// Patient privacy — OTP gated access
router.post('/request-access', protect(['doctor', 'pharmacist', 'hospital_admin']), patientController.requestPatientAccess);
router.post('/verify-access', protect(['doctor', 'pharmacist', 'hospital_admin']), patientController.verifyPatientAccess);

// Patient reporting
router.post('/report', protect(['patient']), patientController.reportUser);

module.exports = router;
