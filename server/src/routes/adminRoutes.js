const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const protect = require('../middleware/auth');

router.get('/stats', protect(['admin']), adminController.getSystemStats);
router.get('/users', protect(['admin']), adminController.getAllUsers);
router.put('/users/toggle-status', protect(['admin']), adminController.toggleUserStatus);
router.get('/audit-logs', protect(['admin']), adminController.getAuditLogs);

module.exports = router;
