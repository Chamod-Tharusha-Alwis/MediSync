const express = require('express');
const router = express.Router();
const hospitalController = require('../controllers/hospitalController');
const protect = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({ 
  windowMs: 15 * 60 * 1000, 
  max: process.env.NODE_ENV === 'development' ? 10000 : 10,
  skip: () => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
});

router.post('/register', hospitalController.registerHospital);
router.post('/login', loginLimiter, hospitalController.loginHospital);

// Protected routes
const hospAuth = protect(['hospital_admin']);

router.get('/stats', hospAuth, hospitalController.getStats);
router.get('/profile', hospAuth, hospitalController.getProfile);
router.put('/settings', hospAuth, hospitalController.updateSettings);

router.get('/doctors', hospAuth, hospitalController.getDoctors);
router.post('/doctors/link', hospAuth, hospitalController.addDoctor); // Using link/add interchangeably
router.get('/staff', hospAuth, hospitalController.getHospitalStaff);
router.put('/doctors/:doctorId/status', hospAuth, hospitalController.toggleDoctorStatus);

router.get('/patients', hospAuth, hospitalController.getPatients);
router.put('/patients/update-records', hospAuth, hospitalController.updatePatientRecords);

module.exports = router;
