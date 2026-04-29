const router = require('express').Router();
const protect = require('../middleware/auth');
const { getPatientByNic, createPatient } = require('../controllers/patientController');

// Only doctors, pharmacists can read; admin can create
router.get('/:nic', protect(['doctor', 'pharmacist', 'health_officer']), getPatientByNic);
router.post('/', protect(['doctor', 'admin']), createPatient);

module.exports = router;