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
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 10000 : 10,
  message: { error: 'Too many registration requests from this IP, please try again later.' },
  skip: () => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test',
  validate: { trustProxy: false }
});

router.post('/register', registerLimiter, pharmacyController.registerPharmacy);
router.post('/login', loginLimiter, pharmacyController.loginPharmacy);
router.post('/change-first-password', loginLimiter, pharmacyController.changeFirstPassword);

// Protected routes (any pharmacy staff role)
const pharmacyAuth = protect(['pharmacist', 'pharmacy_admin', 'assistant']);
const dispensingAuth = protect(['pharmacist', 'pharmacy_admin']);

// Inventory management is decommissioned; the route is kept only to return 410 Gone
// to stale clients (removing it would turn that into an ambiguous 404).
router.get('/inventory', pharmacyAuth, pharmacyController.getInventory);

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

// District demand & epidemiological burden (U11)
router.get('/district-demand', pharmacyAuth, pharmacyController.getDistrictDemand);

// Dispensing volume by medicine in Asia/Colombo (U12). Counts dispensed items only; no stock.
router.get('/analytics/dispensing', pharmacyAuth, pharmacyController.getDispensingAnalytics);

module.exports = router;
