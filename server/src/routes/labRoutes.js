// server/src/routes/labRoutes.js
const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const router   = express.Router();
const auth     = require('../middleware/auth');
const lab      = require('../controllers/labController');

// ── Multer config — temp storage for raw PDF before ML engine encrypts it ─────
const upload = multer({
  dest: path.join(__dirname, '../../uploads/lab-temp'),
  limits: { fileSize: 20 * 1024 * 1024 },  // 20 MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are accepted'), false);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — no auth needed
// ─────────────────────────────────────────────────────────────────────────────
router.get('/public/lab/:labTestId/status', lab.publicStatusCheck);
router.get('/public/migrate-nic',           lab.migrateNic);

// ─────────────────────────────────────────────────────────────────────────────
// HOSPITAL routes — role: 'hospitalAdmin' or 'labTechnician'
// ─────────────────────────────────────────────────────────────────────────────
router.post  ('/lab/search-patient',             auth(['hospitalAdmin', 'labTechnician']), lab.searchPatientByNic);
router.post  ('/lab/accept',                     auth(['hospitalAdmin', 'labTechnician']), lab.acceptLabTest);
router.patch ('/lab/:labTestId/status',          auth(['hospitalAdmin', 'labTechnician']), lab.updateStatus);
router.post  ('/lab/:labTestId/upload-report',   auth(['hospitalAdmin', 'labTechnician']), upload.single('report'), lab.uploadReport);
router.get   ('/lab/hospital/all',               auth(['hospitalAdmin', 'labTechnician']), lab.getHospitalLabTests);

// ─────────────────────────────────────────────────────────────────────────────
// PATIENT routes — role: 'patient'
// ─────────────────────────────────────────────────────────────────────────────
router.get   ('/lab/patient/my-tests',                auth(['patient']), lab.getMyLabTests);
router.get   ('/lab/patient/download/:labTestId',     auth(['patient']), lab.patientDownloadReport);

// ─────────────────────────────────────────────────────────────────────────────
// DOCTOR routes — OTP-gated download
// ─────────────────────────────────────────────────────────────────────────────
router.post  ('/lab/doctor/request-otp/:labTestId',   auth(['doctor']), lab.doctorRequestOtp);
router.post  ('/lab/doctor/download/:labTestId',      auth(['doctor']), lab.doctorDownloadReport);

module.exports = router;

// ─────────────────────────────────────────────────────────────────────────────
// In server/src/app.js add:
//   const labRoutes = require('./routes/labRoutes');
//   app.use('/api', labRoutes);
// ─────────────────────────────────────────────────────────────────────────────
