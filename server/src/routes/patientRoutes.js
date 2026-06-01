const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');
const protect = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: 'Too many login attempts. Try again later.' }
});

// Auth routes
router.post('/register', patientController.registerPatient);
router.post('/login', loginLimiter, patientController.loginPatient);

// Patient data routes
// Self-service profile update — MUST be before /:nic wildcard
router.put('/profile', protect(['patient']), patientController.updatePatientProfile);
router.get('/:nic', protect(['patient', 'doctor', 'admin', 'super_admin', 'pharmacist', 'hospital_admin']), patientController.getPatient);
router.put('/:nic', protect(['patient']), patientController.updatePatient);
router.get('/:nic/timeline', protect(['patient', 'doctor', 'hospital_admin']), patientController.getTimeline);
router.get('/:nic/prescriptions', protect(['patient', 'doctor']), patientController.getPrescriptions);
router.post('/consultation/:id/rate', protect(['patient']), patientController.rateConsultation);

// Patient privacy — OTP gated access
router.post('/request-access', protect(['doctor', 'pharmacist', 'hospital_admin']), patientController.requestPatientAccess);
router.post('/verify-access', protect(['doctor', 'pharmacist', 'hospital_admin']), patientController.verifyPatientAccess);

// Patient reporting
router.post('/report', protect(['patient']), patientController.reportUser);

module.exports = router;