const router = require('express').Router();
const protect = require('../middleware/verifiedAuth');
const patientRouteIdentity = require('../middleware/patientRouteIdentity');
const { validateStandaloneDuration } = require('../utils/prescriptionDuration');
const { issuePrescription, getPendingByNic, dispense, downloadPrescriptionPdf, exportConsultationPdf, checkMedicineSafety } = require('../controllers/prescriptionController');
const { getPrescriptions } = require('../controllers/patientController');

router.post('/check-safety', protect(['doctor', 'pharmacist', 'hospital_staff', 'admin', 'super_admin']), checkMedicineSafety);
router.post('/issue', validateStandaloneDuration, protect(['doctor']), require('../middleware/clinicalWriteAuthorization'), issuePrescription);
router.get('/pending/:nic',            protect(['pharmacist']), require('../middleware/patientConsent'), getPendingByNic);
router.get('/patient/:nic',            protect(['patient', 'doctor', 'admin', 'super_admin']), patientRouteIdentity, getPrescriptions);
router.put('/dispense/:id',            protect(['pharmacist']), require('../middleware/patientConsent'), dispense);
// Patient and Staff access: download E-Prescription PDF
router.get('/download/:refId', protect(['patient']), downloadPrescriptionPdf);
// Clinical PDF Export (Milestone 4 WP5)
router.get('/consultations/:id/export-pdf', protect(['patient', 'doctor']), exportConsultationPdf);

module.exports = router;