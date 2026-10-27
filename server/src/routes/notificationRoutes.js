const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const protect = require('../middleware/verifiedAuth');

const notificationRoles = ['patient', 'doctor', 'pharmacist', 'assistant', 'hospital_admin', 'pharmacy_admin', 'admin', 'super_admin', 'superadmin'];
router.get('/', protect(notificationRoles), notificationController.getNotifications);
router.put('/read-all', protect(notificationRoles), notificationController.markAllAsRead);
router.put('/:id/read', protect(notificationRoles), notificationController.markAsRead);

module.exports = router;
