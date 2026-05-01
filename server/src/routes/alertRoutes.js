const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');
const protect = require('../middleware/auth');

router.post('/trigger', alertController.triggerAlert); // Secured by internal key in controller
router.post('/broadcast', protect(['admin']), alertController.broadcastAlert);
router.get('/active', protect(), alertController.getActiveAlerts);
router.get('/trends', protect(['admin', 'doctor', 'hospital_admin']), alertController.getDiseaseTrends);

module.exports = router;