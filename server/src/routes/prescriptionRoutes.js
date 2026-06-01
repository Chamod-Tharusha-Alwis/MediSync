const router = require('express').Router();
const protect = require('../middleware/auth');
const { issuePrescription, getPendingByNic, dispense, downloadPrescriptionPdf } = require('../controllers/prescriptionController');

router.post('/issue',                  protect(['doctor']),      issuePrescription);
router.get('/pending/:nic',            protect(['pharmacist']),  getPendingByNic);
router.put('/dispense/:id',            protect(['pharmacist']),  dispense);
// Patient and Staff access: download E-Prescription PDF
router.get('/download/:refId', protect(['patient']), downloadPrescriptionPdf);

module.exports = router;