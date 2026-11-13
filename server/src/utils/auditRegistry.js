'use strict';

/**
 * Task R1: Complete Mutating & Sensitive Route Audit Registry.
 * Maps every mutating HTTP method (POST, PUT, PATCH, DELETE) and sensitive read route
 * across all route files to a standardized SCREAMING_SNAKE_CASE audit action.
 */

const ROUTE_MOUNTS = {
  'adminRoutes.js': '/api/admin',
  'alertRoutes.js': '/api/alerts',
  'authRoutes.js': '/api/auth',
  'deviceRoutes.js': '/api/devices',
  'doctorRoutes.js': '/api/doctor',
  'drugRoutes.js': '/api/drugs',
  'hospitalRoutes.js': '/api/hospital',
  'labRoutes.js': '/api/lab',
  'notificationRoutes.js': '/api/notifications',
  'patientRoutes.js': '/api/patient',
  'pharmacyRoutes.js': '/api/pharmacy',
  'prescriptionRoutes.js': '/api/prescriptions',
  'publicRoutes.js': '/api/public',
  'reviewRoutes.js': '/api/reviews',
  'supportRoutes.js': '/api/support',
  'userRoutes.js': '/api/users',
  'verificationRoutes.js': '/api/verify'
};

const ROUTE_AUDIT_MAP = [
  // ── adminRoutes.js ──
  { routeFile: 'adminRoutes.js', method: 'PUT', path: '/users/toggle', action: 'ADMIN_TOGGLE_USER_STATUS' },
  { routeFile: 'adminRoutes.js', method: 'PUT', path: '/users/toggle-status', action: 'ADMIN_TOGGLE_USER_STATUS' },
  { routeFile: 'adminRoutes.js', method: 'GET', path: '/audit-logs/profile/:userId', action: 'ADMIN_VIEW_USER_AUDIT_PROFILE', sensitive: true },
  { routeFile: 'adminRoutes.js', method: 'GET', path: '/users/:userId/audit-profile', action: 'ADMIN_VIEW_USER_AUDIT_PROFILE', sensitive: true },
  { routeFile: 'adminRoutes.js', method: 'POST', path: '/outbreak/trigger', action: 'TRIGGER_ML_DETECTION' },
  { routeFile: 'adminRoutes.js', method: 'PUT', path: '/outbreak/:id/approve', action: 'ALERT_APPROVED' },
  { routeFile: 'adminRoutes.js', method: 'PUT', path: '/outbreak/:id/resolve', action: 'ALERT_RESOLVED' },
  { routeFile: 'adminRoutes.js', method: 'POST', path: '/ban', action: 'BAN_USER' },
  { routeFile: 'adminRoutes.js', method: 'PUT', path: '/bans/:id/lift', action: 'LIFT_BAN' },
  { routeFile: 'adminRoutes.js', method: 'POST', path: '/admins', action: 'ADD_ADMIN' },
  { routeFile: 'adminRoutes.js', method: 'PUT', path: '/reports/:id/review', action: 'REVIEW_USER_REPORT' },
  { routeFile: 'adminRoutes.js', method: 'POST', path: '/users/:userId/reveal-identifier', action: 'ADMIN_REVEAL_PII' },
  { routeFile: 'adminRoutes.js', method: 'DELETE', path: '/users/:id/devices/:deviceId', action: 'ADMIN_REMOVE_USER_DEVICE' },
  { routeFile: 'adminRoutes.js', method: 'POST', path: '/users/:id/recovery', action: 'ADMIN_GENERATE_RECOVERY_TOKEN' },
  { routeFile: 'adminRoutes.js', method: 'PUT', path: '/surveillance/:id/review', action: 'SURVEILLANCE_REVIEW' },
  { routeFile: 'adminRoutes.js', method: 'POST', path: '/seed-outbreak-demo', action: 'DENIED_DATASET_MAINTENANCE' },
  { routeFile: 'adminRoutes.js', method: 'DELETE', path: '/seed-outbreak-demo', action: 'DENIED_DATASET_MAINTENANCE' },

  // ── alertRoutes.js ──
  { routeFile: 'alertRoutes.js', method: 'POST', path: '/trigger', action: 'TRIGGER_ALERT' },
  { routeFile: 'alertRoutes.js', method: 'POST', path: '/broadcast', action: 'BROADCAST_ALERT' },
  { routeFile: 'alertRoutes.js', method: 'PUT', path: '/:id/verify', action: 'VERIFY_ALERT_STATUS' },

  // ── authRoutes.js ──
  { routeFile: 'authRoutes.js', method: 'POST', path: '/register', action: 'REGISTER_DOCTOR' },
  { routeFile: 'authRoutes.js', method: 'POST', path: '/register-patient', action: 'REGISTER_PATIENT' },
  { routeFile: 'authRoutes.js', method: 'POST', path: '/register-pharmacy', action: 'REGISTER_PHARMACY' },
  { routeFile: 'authRoutes.js', method: 'POST', path: '/login', action: 'USER_LOGIN' },
  { routeFile: 'authRoutes.js', method: 'POST', path: '/verify-otp', action: 'VERIFY_OTP' },
  { routeFile: 'authRoutes.js', method: 'POST', path: '/send-otp', action: 'REQUEST_OTP' },
  { routeFile: 'authRoutes.js', method: 'POST', path: '/login-type', action: 'SET_LOGIN_TYPE' },
  { routeFile: 'authRoutes.js', method: 'POST', path: '/change-org-password', action: 'CHANGE_ORG_PASSWORD' },
  { routeFile: 'authRoutes.js', method: 'POST', path: '/change-password', action: 'CHANGE_PASSWORD' },
  { routeFile: 'authRoutes.js', method: 'POST', path: '/forgot-password', action: 'FORGOT_PASSWORD' },
  { routeFile: 'authRoutes.js', method: 'POST', path: '/reset-password', action: 'RESET_PASSWORD' },
  { routeFile: 'authRoutes.js', method: 'POST', path: '/reset-password-recovery', action: 'RESET_PASSWORD_RECOVERY' },
  { routeFile: 'authRoutes.js', method: 'POST', path: '/enable-2fa', action: 'ENABLE_2FA' },
  { routeFile: 'authRoutes.js', method: 'POST', path: '/verify-2fa', action: 'VERIFY_2FA' },
  { routeFile: 'authRoutes.js', method: 'PUT', path: '/2fa', action: 'TOGGLE_2FA' },
  { routeFile: 'authRoutes.js', method: 'POST', path: '/2fa', action: 'TOGGLE_2FA' },
  { routeFile: 'authRoutes.js', method: 'POST', path: '/logout', action: 'USER_LOGOUT' },
  { routeFile: 'authRoutes.js', method: 'POST', path: '/heartbeat', action: 'USER_HEARTBEAT' },
  { routeFile: 'authRoutes.js', method: 'POST', path: '/refresh', action: 'REFRESH_TOKEN' },
  { routeFile: 'authRoutes.js', method: 'PATCH', path: '/preferences/language', action: 'UPDATE_LANGUAGE_PREFERENCE' },

  // ── deviceRoutes.js ──
  { routeFile: 'deviceRoutes.js', method: 'PUT', path: '/my/:id', action: 'UPDATE_DEVICE_LABEL' },
  { routeFile: 'deviceRoutes.js', method: 'POST', path: '/my/:id/request-trust-otp', action: 'REQUEST_DEVICE_TRUST_OTP' },
  { routeFile: 'deviceRoutes.js', method: 'POST', path: '/my/:id/trust', action: 'TRUST_DEVICE' },
  { routeFile: 'deviceRoutes.js', method: 'DELETE', path: '/my/:id', action: 'REVOKE_DEVICE' },
  { routeFile: 'deviceRoutes.js', method: 'POST', path: '/admin/sessions/:id/force-logout', action: 'ADMIN_FORCE_LOGOUT' },
  { routeFile: 'deviceRoutes.js', method: 'DELETE', path: '/admin/devices/:id/revoke', action: 'ADMIN_REVOKE_DEVICE_TRUST' },

  // ── doctorRoutes.js ──
  { routeFile: 'doctorRoutes.js', method: 'PUT', path: '/profile', action: 'DOCTOR_PROFILE_UPDATE' },
  { routeFile: 'doctorRoutes.js', method: 'POST', path: '/consultation', action: 'CREATE_CONSULTATION' },
  { routeFile: 'doctorRoutes.js', method: 'POST', path: '/predict-disease', action: 'ML_PREDICT_DISEASE' },
  { routeFile: 'doctorRoutes.js', method: 'PUT', path: '/consultation/:id/followup', action: 'CONSULTATION_FOLLOWUP_UPDATE' },

  // ── drugRoutes.js ──
  { routeFile: 'drugRoutes.js', method: 'POST', path: '/interactions', action: 'CHECK_DRUG_INTERACTIONS' },
  { routeFile: 'drugRoutes.js', method: 'POST', path: '/check-interaction', action: 'CHECK_DRUG_INTERACTIONS' },
  { routeFile: 'drugRoutes.js', method: 'POST', path: '/recommendations', action: 'RECOMMEND_DRUGS' },
  { routeFile: 'drugRoutes.js', method: 'POST', path: '/recommend', action: 'RECOMMEND_DRUGS' },
  { routeFile: 'drugRoutes.js', method: 'POST', path: '/', action: 'ADD_DRUG' },

  // ── hospitalRoutes.js ──
  { routeFile: 'hospitalRoutes.js', method: 'POST', path: '/register', action: 'REGISTER_HOSPITAL' },
  { routeFile: 'hospitalRoutes.js', method: 'POST', path: '/login', action: 'HOSPITAL_LOGIN' },
  { routeFile: 'hospitalRoutes.js', method: 'PUT', path: '/settings', action: 'HOSPITAL_UPDATE_SETTINGS' },
  { routeFile: 'hospitalRoutes.js', method: 'POST', path: '/doctors/link', action: 'HOSPITAL_LINK_DOCTOR' },
  { routeFile: 'hospitalRoutes.js', method: 'PUT', path: '/doctors/:doctorId/status', action: 'HOSPITAL_TOGGLE_DOCTOR' },
  { routeFile: 'hospitalRoutes.js', method: 'GET', path: '/patients/:nic/history', action: 'HOSPITAL_VIEW_PATIENT_HISTORY', sensitive: true },
  { routeFile: 'hospitalRoutes.js', method: 'PUT', path: '/patients/update-records', action: 'HOSPITAL_UPDATE_PATIENT_RECORDS' },

  // ── labRoutes.js ──
  { routeFile: 'labRoutes.js', method: 'POST', path: '/request-otp', action: 'REQUEST_LAB_OTP' },
  { routeFile: 'labRoutes.js', method: 'POST', path: '/verify-otp', action: 'VERIFY_LAB_OTP' },
  { routeFile: 'labRoutes.js', method: 'POST', path: '/order', action: 'CREATE_LAB_ORDER' },
  { routeFile: 'labRoutes.js', method: 'POST', path: '/:id/consent', action: 'RECORD_LAB_CONSENT' },
  { routeFile: 'labRoutes.js', method: 'POST', path: '/:id/sample', action: 'RECEIVE_LAB_SAMPLE' },
  { routeFile: 'labRoutes.js', method: 'POST', path: '/:id/progress', action: 'UPDATE_LAB_PROGRESS' },
  { routeFile: 'labRoutes.js', method: 'POST', path: '/:id/upload', action: 'UPLOAD_LAB_REPORT' },
  { routeFile: 'labRoutes.js', method: 'PUT', path: '/:id/status', action: 'UPDATE_LAB_REPORT_STATUS' },
  { routeFile: 'labRoutes.js', method: 'GET', path: '/:id/download', action: 'DOWNLOAD_LAB_REPORT', sensitive: true },
  { routeFile: 'labRoutes.js', method: 'GET', path: '/:id/report', action: 'VIEW_LAB_REPORT', sensitive: true },

  // ── notificationRoutes.js ──
  { routeFile: 'notificationRoutes.js', method: 'PUT', path: '/read-all', action: 'MARK_NOTIFICATIONS_READ' },
  { routeFile: 'notificationRoutes.js', method: 'PUT', path: '/:id/read', action: 'MARK_NOTIFICATION_READ' },

  // ── patientRoutes.js ──
  { routeFile: 'patientRoutes.js', method: 'POST', path: '/register', action: 'REGISTER_PATIENT' },
  { routeFile: 'patientRoutes.js', method: 'POST', path: '/login', action: 'PATIENT_LOGIN' },
  { routeFile: 'patientRoutes.js', method: 'PUT', path: '/profile', action: 'PATIENT_PROFILE_UPDATE' },
  { routeFile: 'patientRoutes.js', method: 'PUT', path: '/:nic', action: 'UPDATE_PATIENT_RECORD' },
  { routeFile: 'patientRoutes.js', method: 'GET', path: '/:nic', action: 'VIEW_PATIENT_RECORD', sensitive: true },
  { routeFile: 'patientRoutes.js', method: 'GET', path: '/:nic/timeline', action: 'VIEW_PATIENT_TIMELINE', sensitive: true },
  { routeFile: 'patientRoutes.js', method: 'GET', path: '/:nic/prescriptions', action: 'VIEW_PATIENT_PRESCRIPTIONS', sensitive: true },
  { routeFile: 'patientRoutes.js', method: 'POST', path: '/consultation/:id/rate', action: 'RATE_CONSULTATION' },
  { routeFile: 'patientRoutes.js', method: 'POST', path: '/consultation/:id/resend-summary', action: 'RESEND_CONSULTATION_SUMMARY' },
  { routeFile: 'patientRoutes.js', method: 'POST', path: '/request-access', action: 'REQUEST_PATIENT_ACCESS' },
  { routeFile: 'patientRoutes.js', method: 'POST', path: '/verify-access', action: 'VERIFY_PATIENT_ACCESS' },
  { routeFile: 'patientRoutes.js', method: 'POST', path: '/report', action: 'REPORT_USER' },

  // ── pharmacyRoutes.js ──
  { routeFile: 'pharmacyRoutes.js', method: 'POST', path: '/register', action: 'REGISTER_PHARMACY' },
  { routeFile: 'pharmacyRoutes.js', method: 'POST', path: '/login', action: 'PHARMACY_LOGIN' },
  { routeFile: 'pharmacyRoutes.js', method: 'POST', path: '/change-first-password', action: 'PHARMACY_CHANGE_FIRST_PASSWORD' },
  { routeFile: 'pharmacyRoutes.js', method: 'POST', path: '/staff', action: 'ADD_PHARMACY_STAFF' },
  { routeFile: 'pharmacyRoutes.js', method: 'PUT', path: '/staff/:id/toggle', action: 'TOGGLE_PHARMACY_STAFF' },
  { routeFile: 'pharmacyRoutes.js', method: 'GET', path: '/prescriptions/pending/:nic', action: 'VIEW_PENDING_PRESCRIPTIONS', sensitive: true },
  { routeFile: 'pharmacyRoutes.js', method: 'POST', path: '/dispense', action: 'DISPENSE_PRESCRIPTION' },
  { routeFile: 'pharmacyRoutes.js', method: 'POST', path: '/dispense-otc', action: 'DISPENSE_OTC' },

  // ── prescriptionRoutes.js ──
  { routeFile: 'prescriptionRoutes.js', method: 'POST', path: '/consultation-safety', action: 'CHECK_MEDICINE_SAFETY' },
  { routeFile: 'prescriptionRoutes.js', method: 'POST', path: '/check-safety', action: 'CHECK_MEDICINE_SAFETY' },
  { routeFile: 'prescriptionRoutes.js', method: 'POST', path: '/issue', action: 'ISSUE_PRESCRIPTION' },
  { routeFile: 'prescriptionRoutes.js', method: 'PUT', path: '/dispense/:id', action: 'DISPENSE_PRESCRIPTION' },
  { routeFile: 'prescriptionRoutes.js', method: 'GET', path: '/consultations/:id/export-pdf', action: 'EXPORT_CONSULTATION_PDF', sensitive: true },
  { routeFile: 'prescriptionRoutes.js', method: 'POST', path: '/consultations/:id/resend-summary', action: 'RESEND_CONSULTATION_SUMMARY' },

  // ── reviewRoutes.js ──
  { routeFile: 'reviewRoutes.js', method: 'POST', path: '/', action: 'SUBMIT_REVIEW' },

  // ── supportRoutes.js ──
  { routeFile: 'supportRoutes.js', method: 'POST', path: '/ticket', action: 'CREATE_SUPPORT_TICKET' },
  { routeFile: 'supportRoutes.js', method: 'POST', path: '/ticket/:id/reply', action: 'REPLY_SUPPORT_TICKET' },

  // ── userRoutes.js ──
  { routeFile: 'userRoutes.js', method: 'POST', path: '/upload-profile-pic', action: 'UPLOAD_PROFILE_PIC' },
  { routeFile: 'userRoutes.js', method: 'PUT', path: '/profile', action: 'UPDATE_USER_PROFILE' },

  // ── verificationRoutes.js ──
  { routeFile: 'verificationRoutes.js', method: 'POST', path: '/:token/otp/request', action: 'VERIFY_REQUEST_OTP' },
  { routeFile: 'verificationRoutes.js', method: 'POST', path: '/:token/otp/verify', action: 'VERIFY_UNLOCKED' },
  { routeFile: 'verificationRoutes.js', method: 'POST', path: '/:token/history-pdf', action: 'VERIFY_DOWNLOAD_HISTORY_PDF' },
  { routeFile: 'verificationRoutes.js', method: 'POST', path: '/:token/consultation-pdf', action: 'VERIFY_DOWNLOAD_CONSULTATION_PDF' },
  { routeFile: 'verificationRoutes.js', method: 'POST', path: '/:token/revoke', action: 'VERIFY_TOKEN_REVOKED' }
];

function routeMatches(pattern, actualPath) {
  if (pattern === actualPath) return true;
  const regexPattern = '^' + pattern.replace(/:[a-zA-Z0-9_]+/g, '[^/]+') + '$';
  return new RegExp(regexPattern).test(actualPath);
}

/**
 * Check if a route file, method, and route-level path has a registered audit action.
 */
function isAudited(routeFile, method, routePath) {
  const normMethod = String(method || '').toUpperCase();
  const cleanPath = String(routePath || '').split('?')[0];

  for (const entry of ROUTE_AUDIT_MAP) {
    if (entry.routeFile === routeFile && entry.method === normMethod) {
      if (entry.path === cleanPath || routeMatches(entry.path, cleanPath)) {
        return entry.action;
      }
    }
  }
  return null;
}

/**
 * Find audit action at runtime from request method and full URL path (e.g. '/api/auth/login').
 */
function findActionByUrl(method, urlPath) {
  const normMethod = String(method || '').toUpperCase();
  const cleanUrl = String(urlPath || '').split('?')[0];

  for (const entry of ROUTE_AUDIT_MAP) {
    if (entry.method !== normMethod) continue;
    const base = ROUTE_MOUNTS[entry.routeFile] || '';
    const fullPattern = `${base}${entry.path}`;
    if (fullPattern === cleanUrl || routeMatches(fullPattern, cleanUrl) ||
        (cleanUrl.startsWith(base) && (entry.path === cleanUrl.slice(base.length) || routeMatches(entry.path, cleanUrl.slice(base.length))))) {
      return entry.action;
    }
  }
  return null;
}

module.exports = {
  ROUTE_MOUNTS,
  ROUTE_AUDIT_MAP,
  routeMatches,
  isAudited,
  findActionByUrl
};
