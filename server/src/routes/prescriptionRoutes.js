const router = require('express').Router();
const protect = require('../middleware/auth');
const { validateStandaloneDuration } = require('../utils/prescriptionDuration');
const { issuePrescription, getPendingByNic, dispense, downloadPrescriptionPdf } = require('../controllers/prescriptionController');
const { getPrescriptions } = require('../controllers/patientController');

router.post('/issue', validateStandaloneDuration, protect(['doctor']), issuePrescription);
router.get('/pending/:nic',            protect(['pharmacist']),  getPendingByNic);
router.get('/patient/:nic',            protect(['patient', 'doctor', 'admin', 'super_admin']), getPrescriptions);
router.put('/dispense/:id',            protect(['pharmacist']),  dispense);
// Patient and Staff access: download E-Prescription PDF
router.get('/download/:refId', protect(['patient']), downloadPrescriptionPdf);

module.exports = router;