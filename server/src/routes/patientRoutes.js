const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');
const protect = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Try again later.' }
});

router.post('/register', patientController.registerPatient);
router.post('/login', loginLimiter, patientController.loginPatient);

router.get('/:nic', protect(['patient', 'doctor', 'admin']), patientController.getPatient);
router.put('/:nic', protect(['patient']), patientController.updatePatient);
router.get('/:nic/timeline', protect(['patient', 'doctor']), patientController.getTimeline);
router.post('/consultation/:id/rate', protect(['patient']), patientController.rateConsultation);

module.exports = router;