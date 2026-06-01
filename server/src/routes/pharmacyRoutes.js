const express = require('express');
const router = express.Router();
const pharmacyController = require('../controllers/pharmacyController');
const protect = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

// Public routes
router.post('/register', pharmacyController.registerPharmacy);
router.post('/login', loginLimiter, pharmacyController.loginPharmacy);
router.post('/change-first-password', pharmacyController.changeFirstPassword);

// Protected routes (any pharmacy staff role)
const pharmacyAuth = protect(['pharmacist', 'pharmacy_admin', 'assistant']);

// Profile
router.get('/staff/me', pharmacyAuth, pharmacyController.getMe);

// Staff management (all roles can list; only admin can add/toggle)
router.post('/staff', pharmacyAuth, pharmacyController.addStaff);
router.get('/staff', pharmacyAuth, pharmacyController.getStaff);
router.put('/staff/:id/toggle', pharmacyAuth, pharmacyController.toggleStaffStatus);

// Prescriptions & dispensing
router.get('/prescriptions/pending/:nic', pharmacyAuth, pharmacyController.getPendingPrescriptions);
router.post('/dispense', pharmacyAuth, pharmacyController.dispense);
router.post('/dispense-otc', pharmacyAuth, pharmacyController.dispenseOTC);
router.get('/history', pharmacyAuth, pharmacyController.getDispensingHistory);
router.get('/receipt/:receiptNo', pharmacyAuth, pharmacyController.getReceipt);
router.get('/stats', pharmacyAuth, pharmacyController.getStats);

// Inventory
router.get('/inventory', pharmacyAuth, pharmacyController.getInventory);
router.put('/inventory', pharmacyAuth, pharmacyController.updateInventoryItem);

// Analytics & ML
router.get('/analytics/restock', pharmacyAuth, pharmacyController.getRestockAnalytics);
router.post('/predict-restock', pharmacyAuth, pharmacyController.predictRestock);
router.get('/restock-alerts', pharmacyAuth, pharmacyController.getDistrictRestockAlerts);

module.exports = router;