const express = require('express');
const router = express.Router();
const pharmacyController = require('../controllers/pharmacyController');
const protect = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

router.post('/register', pharmacyController.registerPharmacy);
router.post('/login', loginLimiter, pharmacyController.loginPharmacy);
router.post('/change-first-password', pharmacyController.changeFirstPassword);

// Protected routes
const pharmacyAuth = protect(['pharmacist', 'pharmacy_admin']);

router.post('/staff', pharmacyAuth, pharmacyController.addStaff);
router.get('/staff', pharmacyAuth, pharmacyController.getStaff);
router.put('/staff/:id/toggle', pharmacyAuth, pharmacyController.toggleStaffStatus);

router.get('/prescriptions/pending/:nic', pharmacyAuth, pharmacyController.getPendingPrescriptions);
router.post('/dispense', pharmacyAuth, pharmacyController.dispense);
router.get('/history', pharmacyAuth, pharmacyController.getDispensingHistory);
router.get('/receipt/:receiptNo', pharmacyAuth, pharmacyController.getReceipt);
router.get('/stats', pharmacyAuth, pharmacyController.getStats);

module.exports = router;