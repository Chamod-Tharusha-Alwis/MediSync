const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const protect = require('../middleware/auth');

router.get('/', protect(['patient', 'doctor', 'pharmacist', 'hospital_admin', 'pharmacy_admin', 'admin', 'super_admin']), notificationController.getNotifications);
router.put('/read-all', protect(['patient', 'doctor', 'pharmacist', 'hospital_admin', 'pharmacy_admin', 'admin', 'super_admin']), notificationController.markAllAsRead);
router.put('/:id/read', protect(['patient', 'doctor', 'pharmacist', 'hospital_admin', 'pharmacy_admin', 'admin', 'super_admin']), notificationController.markAsRead);

module.exports = router;
