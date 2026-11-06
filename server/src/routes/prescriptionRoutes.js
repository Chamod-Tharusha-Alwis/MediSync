const router = require('express').Router();
const protect = require('../middleware/verifiedAuth');
const patientRouteIdentity = require('../middleware/patientRouteIdentity');
const { validateStandaloneDuration } = require('../utils/prescriptionDuration');
const { issuePrescription, getPendingByNic, dispense, downloadPrescriptionPdf } = require('../controllers/prescriptionController');
const { getPrescriptions } = require('../controllers/patientController');

router.post('/issue', validateStandaloneDuration, protect(['doctor']), require('../middleware/clinicalWriteAuthorization'), issuePrescription);
router.get('/pending/:nic',            protect(['pharmacist']), require('../middleware/patientConsent'), getPendingByNic);
router.get('/patient/:nic',            protect(['patient', 'doctor', 'admin', 'super_admin']), patientRouteIdentity, getPrescriptions);
router.put('/dispense/:id',            protect(['pharmacist']), require('../middleware/patientConsent'), dispense);
// Patient and Staff access: download E-Prescription PDF
router.get('/download/:refId', protect(['patient']), downloadPrescriptionPdf);

module.exports = router;