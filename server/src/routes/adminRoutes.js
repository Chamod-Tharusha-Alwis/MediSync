const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const protect = require('../middleware/verifiedAuth');

// ─── Analytics ───────────────────────────────────────────────────────────────
const analyticsController = require('../controllers/analyticsController');
router.get('/analytics/dashboard', protect(['admin', 'super_admin']), analyticsController.getDashboardStats);

// ─── Core stats & users ──────────────────────────────────────────────────────
router.get('/stats', protect(['admin', 'super_admin']), adminController.getSystemStats);
router.get('/users', protect(['admin', 'super_admin']), adminController.getAllUsers);
router.put('/users/toggle', protect(['admin', 'super_admin']), adminController.toggleUserStatus);
router.put('/users/toggle-status', protect(['admin', 'super_admin']), adminController.toggleUserStatus); // alias

// ─── Audit logs — both canonical and alias paths ──────────────────────────────
router.get('/audit-logs', protect(['admin', 'super_admin']), adminController.getAuditLogs);
router.get('/audit',      protect(['admin', 'super_admin']), adminController.getAuditLogs);  // alias
router.get('/audit-logs/profile/:userId', protect(['admin', 'super_admin']), adminController.getUserAuditProfile);
router.get('/users/:userId/audit-profile', protect(['admin', 'super_admin']), adminController.getUserAuditProfile);

// ─── ML Engine ───────────────────────────────────────────────────────────────
router.post('/outbreak/trigger', protect(['admin', 'super_admin', 'health_officer']), adminController.triggerMLDetection);
router.put('/outbreak/:id/approve', protect(['admin', 'super_admin', 'health_officer']), adminController.approveAlert);
router.put('/outbreak/:id/resolve', protect(['admin', 'super_admin', 'health_officer']), adminController.resolveAlert);
router.get('/ml-status', protect(['admin', 'super_admin']), adminController.getMLStatus);

// ─── Ban management ──────────────────────────────────────────────────────────
router.post('/ban', protect(['admin', 'super_admin']), adminController.banUser);
router.put('/bans/:id/lift', protect(['admin', 'super_admin']), adminController.liftBan);
router.get('/bans', protect(['admin', 'super_admin']), adminController.getBans);
router.get('/bans/active', protect(['admin', 'super_admin']), adminController.getActiveBans);

// ─── Admin management (super admin only) ─────────────────────────────────────
router.post('/admins', protect(['admin', 'super_admin']), adminController.addAdmin);

// ─── Patient reports ─────────────────────────────────────────────────────────
router.get('/reports', protect(['admin', 'super_admin']), adminController.getPatientReports);
router.put('/reports/:id/review', protect(['admin', 'super_admin']), adminController.reviewReport);

// ─── Users & Devices ──────────────────────────────────────────────────────────
router.get('/users/search', protect(['admin', 'super_admin']), adminController.searchUsers);
router.get('/users/:id/devices', protect(['admin', 'super_admin']), adminController.getUserDevices);
router.delete('/users/:id/devices/:deviceId', protect(['admin', 'super_admin']), adminController.removeUserDevice);
router.get('/users/:id/recovery', protect(['admin', 'super_admin']), adminController.getUserRecoveryInfo);
router.post('/users/:id/recovery', protect(['admin', 'super_admin']), adminController.generateRecoveryToken);

// ─── Broadcasts ──────────────────────────────────────────────────────────────
router.get('/broadcasts', protect(['admin', 'super_admin']), adminController.getBroadcasts);

// Dataset maintenance requires a separately approved exact-ID operator procedure.
const maintenanceDenied = (_req, res) => res.status(403).json({ error: 'Dataset maintenance is not available over HTTP' });
router.post('/seed-outbreak-demo', protect(['admin', 'super_admin']), maintenanceDenied);
router.delete('/seed-outbreak-demo', protect(['admin', 'super_admin']), maintenanceDenied);
router.get('/outbreak/preview', protect(['admin', 'super_admin']), maintenanceDenied);

module.exports = router;
