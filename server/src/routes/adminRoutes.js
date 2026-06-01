const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const protect = require('../middleware/auth');

// ─── Analytics ───────────────────────────────────────────────────────────────
const analyticsController = require('../controllers/analyticsController');
router.get('/analytics/dashboard', protect(['admin', 'super_admin', 'hospital_admin']), analyticsController.getDashboardStats);

// ─── Core stats & users ──────────────────────────────────────────────────────
router.get('/stats', protect(['admin', 'super_admin']), adminController.getSystemStats);
router.get('/users', protect(['admin', 'super_admin']), adminController.getAllUsers);
router.put('/users/toggle', protect(['admin', 'super_admin']), adminController.toggleUserStatus);
router.put('/users/toggle-status', protect(['admin', 'super_admin']), adminController.toggleUserStatus); // alias

// ─── Audit logs — both canonical and alias paths ──────────────────────────────
router.get('/audit-logs', protect(['admin', 'super_admin']), adminController.getAuditLogs);
router.get('/audit',      protect(['admin', 'super_admin']), adminController.getAuditLogs);  // alias

// ─── ML Engine ───────────────────────────────────────────────────────────────
router.post('/outbreak/trigger', protect(['admin', 'super_admin', 'health_officer']), adminController.triggerMLDetection);
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

// ─── Broadcasts ──────────────────────────────────────────────────────────────
router.get('/broadcasts', protect(['admin', 'super_admin']), adminController.getBroadcasts);

module.exports = router;
