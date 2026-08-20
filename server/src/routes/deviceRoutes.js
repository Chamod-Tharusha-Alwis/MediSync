const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const deviceController = require('../controllers/deviceController');

// User routes (any authenticated user)
router.get('/my', protect([]), deviceController.getMyDevices);
router.put('/my/:id', protect([]), deviceController.updateMyDeviceLabel);
router.delete('/my/:id', protect([]), deviceController.revokeMyDevice);

// Admin routes
router.get('/admin/sessions/active', protect(['admin', 'super_admin']), deviceController.getActiveSessions);
router.post('/admin/sessions/:id/force-logout', protect(['admin', 'super_admin']), deviceController.forceLogout);
router.delete('/admin/devices/:id/revoke', protect(['admin', 'super_admin']), deviceController.revokeDeviceTrust);

module.exports = router;
