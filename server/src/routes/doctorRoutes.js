const express = require('express');
const router = express.Router();
const doctorController = require('../controllers/doctorController');
const protect = require('../middleware/auth');
const { validateConsultationDuration } = require('../utils/prescriptionDuration');

router.get('/profile', protect(['doctor']), doctorController.getProfile);
router.put('/profile', protect(['doctor']), doctorController.updateDoctorProfile);
router.get('/stats', protect(['doctor']), doctorController.getDashboardStats);
router.post('/consultation', validateConsultationDuration, protect(['doctor']), doctorController.createConsultation);
router.post('/predict-disease', protect(['doctor']), doctorController.predictDisease);
router.get('/consultations', protect(['doctor']), doctorController.getConsultations);
router.get('/patients-directory', protect(['doctor']), doctorController.getPatientDirectory);
router.put('/consultation/:id/followup', protect(['doctor']), doctorController.updateFollowUp);

module.exports = router;
