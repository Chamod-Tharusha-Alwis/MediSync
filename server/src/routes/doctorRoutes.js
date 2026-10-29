const express = require('express');
const router = express.Router();
const doctorController = require('../controllers/doctorController');
const mlPredictionController = require('../controllers/mlPredictionController');
const protect = require('../middleware/verifiedAuth');
const { validateConsultationDuration } = require('../utils/prescriptionDuration');

router.get('/profile', protect(['doctor']), doctorController.getProfile);
router.put('/profile', protect(['doctor']), doctorController.updateDoctorProfile);
router.get('/stats', protect(['doctor']), doctorController.getDashboardStats);
router.post('/consultation', validateConsultationDuration, protect(['doctor']), require('../middleware/clinicalWriteAuthorization'), doctorController.createConsultation);
router.post('/predict-disease', protect(['doctor']), mlPredictionController.predictDisease);
router.get('/predict-disease/health', protect(['doctor']), mlPredictionController.getHealth);
router.get('/consultations', protect(['doctor']), doctorController.getConsultations);
router.get('/consultation-command/:key', protect(['doctor']), require('../controllers/clinicalReconciliationController').reconcile);
router.get('/patients-directory', protect(['doctor']), doctorController.getPatientDirectory);
router.put('/consultation/:id/followup', protect(['doctor']), doctorController.updateFollowUp);

module.exports = router;
