// server/src/routes/labRoutes.js
const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const router   = express.Router();
const protect  = require('../middleware/auth');
const { 
  publicStatusCheck,
  searchPatientByNic,
  requestHospitalOtp,
  acceptLabTest,
  updateStatus,
  uploadReport,
  getHospitalLabTests,
  getMyLabTests,
  patientDownloadReport,
  doctorRequestOtp,
  doctorDownloadReport,
  getPendingTests,
  verifyOtpAndFetchTests,
  approveTest,
  getTestByReportId,
  patientDownloadReportByReportId
} = require('../controllers/labController');

// ── Multer config — memory storage for envelope encryption before Cloudinary ──
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },  // 20 MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are accepted'), false);
  },
});

// Legacy disk-based multer (kept for backward compatibility if needed)
const uploadDisk = multer({
  dest: path.join(__dirname, '../../uploads/lab-temp'),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are accepted'), false);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — no auth needed
// ─────────────────────────────────────────────────────────────────────────────
router.get('/public/:labTestId/status', publicStatusCheck);

// ─────────────────────────────────────────────────────────────────────────────
// HOSPITAL routes — role: 'hospital_admin' or 'labTechnician'
// ─────────────────────────────────────────────────────────────────────────────
// CRITICAL: Static routes MUST be placed above dynamic routes like /:labTestId/...
router.post  ('/hospital/request-otp',       protect(['hospital_admin', 'labTechnician']), requestHospitalOtp);
router.post  ('/hospital/pending-tests',     protect(['hospital_admin', 'labTechnician']), getPendingTests);
router.post  ('/hospital/verify-fetch-tests', protect(['hospital_admin', 'labTechnician']), verifyOtpAndFetchTests);
router.post  ('/hospital/approve-test',      protect(['hospital_admin', 'labTechnician']), approveTest);
router.get   ('/hospital/all',               protect(['hospital_admin', 'labTechnician']), getHospitalLabTests);
router.post  ('/search-patient',             protect(['hospital_admin', 'labTechnician']), searchPatientByNic);
router.post  ('/accept',                     protect(['hospital_admin', 'labTechnician']), acceptLabTest);

// ─────────────────────────────────────────────────────────────────────────────
// LAB ASSISTANT routes — searches by reportId, uploads encrypted PDF
// ─────────────────────────────────────────────────────────────────────────────
router.get   ('/assistant/test/:reportId',   protect(['hospital_admin', 'labTechnician']), getTestByReportId);

// Dynamic Parameter Routes
router.patch ('/:labTestId/status',          protect(['hospital_admin', 'labTechnician']), updateStatus);
router.post  ('/:labTestId/upload-report',   protect(['hospital_admin', 'labTechnician']), uploadMemory.single('report'), uploadReport);

// ─────────────────────────────────────────────────────────────────────────────
// PATIENT routes — role: 'patient'
// ─────────────────────────────────────────────────────────────────────────────
router.get   ('/patient/my-tests',                protect(['patient']), getMyLabTests);
router.get   ('/patient/download/:labTestId',     protect(['patient']), patientDownloadReport);
router.get   ('/patient/download-report/:reportId', protect(['patient']), patientDownloadReportByReportId);

// ─────────────────────────────────────────────────────────────────────────────
// DOCTOR routes — OTP-gated download
// ─────────────────────────────────────────────────────────────────────────────
router.post  ('/doctor/request-otp/:labTestId',   protect(['doctor']), doctorRequestOtp);
router.post  ('/doctor/download/:labTestId',      protect(['doctor']), doctorDownloadReport);

module.exports = router;
