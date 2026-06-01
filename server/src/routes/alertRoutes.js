const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');
const protect = require('../middleware/auth');

router.post('/trigger', alertController.triggerAlert); // Secured by internal key in controller
router.post('/broadcast', protect(['admin', 'super_admin', 'pharmacist', 'pharmacy_admin']), alertController.broadcastAlert);
router.get('/broadcasts/latest', protect(['patient', 'doctor', 'hospital_admin', 'super_admin', 'superadmin', 'admin', 'pharmacist', 'pharmacy_admin']), alertController.getLatestBroadcast);
router.get('/active', protect(['patient', 'doctor', 'hospital_admin', 'super_admin', 'superadmin', 'admin', 'pharmacist', 'pharmacy_admin']), alertController.getActiveAlerts);
router.get('/trends', protect(['admin', 'super_admin', 'doctor', 'hospital_admin', 'pharmacist', 'pharmacy_admin']), alertController.getDiseaseTrends);
router.put('/:id/verify', protect(['admin', 'super_admin', 'health_officer', 'pharmacist', 'pharmacy_admin']), alertController.verifyAlertStatus);

module.exports = router;