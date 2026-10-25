const express = require('express');
const router = express.Router();
const pharmacyController = require('../controllers/pharmacyController');
const protect = require('../middleware/verifiedAuth');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({ 
  windowMs: 15 * 60 * 1000, 
  max: process.env.NODE_ENV === 'development' ? 10000 : 10,
  skip: () => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
  validate: { trustProxy: false }
});

// Public routes
router.post('/register', pharmacyController.registerPharmacy);
router.post('/login', loginLimiter, pharmacyController.loginPharmacy);
router.post('/change-first-password', loginLimiter, pharmacyController.changeFirstPassword);

// Protected routes (any pharmacy staff role)
const pharmacyAuth = protect(['pharmacist', 'pharmacy_admin', 'assistant']);
const dispensingAuth = protect(['pharmacist', 'pharmacy_admin']);

// Profile
router.get('/staff/me', pharmacyAuth, pharmacyController.getMe);

// Staff management (all roles can list; only admin can add/toggle)
router.post('/staff', pharmacyAuth, pharmacyController.addStaff);
router.get('/staff', pharmacyAuth, pharmacyController.getStaff);
router.put('/staff/:id/toggle', pharmacyAuth, pharmacyController.toggleStaffStatus);

// Prescriptions & dispensing
router.get('/prescriptions/pending/:nic', dispensingAuth, require('../middleware/patientConsent'), pharmacyController.getPendingPrescriptions);
router.post('/dispense', dispensingAuth, require('../middleware/patientConsent'), pharmacyController.dispense);
router.post('/dispense-otc', dispensingAuth, require('../middleware/patientConsent'), pharmacyController.dispenseOTC);
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
const maintenanceDenied = (_req, res) => res.status(403).json({ error: 'Dataset maintenance requires a separately approved operator procedure' });
router.post('/seed-restock', pharmacyAuth, maintenanceDenied);
router.delete('/seed-restock', pharmacyAuth, maintenanceDenied);

module.exports = router;
