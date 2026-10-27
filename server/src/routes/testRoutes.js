const express = require('express');
const router = express.Router();
const testController = require('../controllers/testController');
const protect = require('../middleware/verifiedAuth');
const clinicalWriteAuthorization = require('../middleware/clinicalWriteAuthorization');

// Order a test (doctor only)
router.post('/order', protect(['doctor']), clinicalWriteAuthorization, testController.orderTest);

// Get all tests for a patient
router.get('/patient/:nic', protect(['doctor', 'patient', 'hospital_admin']), testController.getPatientTests);

// Get tests for a specific consultation
router.get('/consultation/:id', protect(['doctor', 'hospital_admin']), testController.getConsultationTests);

// Upload result file (hospital_admin only)
// Legacy upload lacks the encrypted, ownership-checked lab storage contract.
// Hold it before parsing or uploading any file; use /api/lab's approved flow.
router.put('/:id/upload', protect(['hospital_admin']), (_req, res) => res.status(403).json({ error: 'Use the encrypted laboratory upload workflow' }));

// Update status (hospital_admin only)
router.put('/:id/status', protect(['hospital_admin']), testController.updateTestStatus);

// Cancel a test (doctor only, status must be 'ordered')
router.delete('/:id', protect(['doctor']), testController.cancelTest);

// Get all tests for a hospital
router.get('/hospital', protect(['hospital_admin']), testController.getHospitalTests);

module.exports = router;
