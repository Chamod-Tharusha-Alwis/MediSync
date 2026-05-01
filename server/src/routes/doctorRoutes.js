const express = require('express');
const router = express.Router();
const doctorController = require('../controllers/doctorController');
const protect = require('../middleware/auth');

router.get('/profile', protect(['doctor']), doctorController.getProfile);
router.put('/profile', protect(['doctor']), doctorController.updateProfile);
router.get('/stats', protect(['doctor']), doctorController.getDashboardStats);
router.post('/consultation', protect(['doctor']), doctorController.createConsultation);
router.get('/consultations', protect(['doctor']), doctorController.getConsultations);
router.put('/consultation/:id/followup', protect(['doctor']), doctorController.updateFollowUp);

module.exports = router;
