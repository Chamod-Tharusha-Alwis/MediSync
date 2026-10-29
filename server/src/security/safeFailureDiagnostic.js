'use strict';

// Only fixed categories leave this boundary. Never copy exception text, stack,
// request data or environment values into a diagnostic.
const steps = new Set([
  'runtime_admission', 'model_ddl', 'application_import', 'application_startup',
  'request_handler', 'login', 'account_lookup', 'password_verification',
  'account_verification', 'token_access', 'token_refresh', 'session_persistence',
  'account_last_login', 'audit_persistence', 'login_lookup', 'password_compare',
  'device_lookup', 'otp', 'response', 'unknown'
]);
const names = new Set(['Error', 'TypeError', 'RangeError', 'ReferenceError',
  'SyntaxError', 'JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError',
  'ValidationError', 'CastError', 'MongoServerError', 'MongooseError', 'DatabaseIsolationError']);
// Finite public Patient/Doctor schema paths. Never forward a path supplied by
// an arbitrary exception: map keys can contain identifiers or rejected input.
const validationPathNames = new Set([
  'preferredLanguage', 'nic', 'patientNic_bi', 'fullName', 'dateOfBirth', 'gender',
  'district', 'contactInfo', 'address', 'email', 'bloodGroup', 'allergies', 'password',
  'isActive', 'reportedDoctors', 'reportedDoctors.doctorId', 'reportedDoctors.reason',
  'reportedDoctors.reportedAt', 'reportedDoctors.status', 'emergencyContact.name',
  'emergencyContact.relationship', 'emergencyContact.phone', 'insurance.provider',
  'insurance.policyNumber', 'insurance.expiryDate', 'chronicConditions', 'riskScore',
  'riskLevel', 'height', 'weight', 'profilePicture', 'twoFactorEnabled', 'keyVersion',
  'lastLoginAt', 'lastSignOutAt', 'doctorId', 'specialization', 'licenseNo', 'hospitals',
  'role', 'loginType', 'otpSecret', 'personalEmail', 'contactNumber', 'clinicAddress',
  'orgLogins', 'orgLogins.hospitalId', 'orgLogins.orgEmail', 'orgLogins.tempPassword',
  'orgLogins.mustChangePassword', 'orgLogins.isActive', 'passwordChangedAt',
  'description', 'googleMapsUrl', 'averageRating', 'ratingCount', 'isVerified',
  'clinicalUseVersion', 'isSynthetic', 'isDemoData', 'isDemoAccount', 'datasetVersion',
  'verificationSource'
]);
const messages = Object.freeze({
  PRODUCTION_RUNTIME_CONFIGURATION_INVALID: 'Production runtime configuration is invalid.',
  PRODUCTION_RUNTIME_QA_MATERIAL_FORBIDDEN: 'Production runtime contains forbidden QA settings.',
  PRODUCTION_RUNTIME_MODE_REQUIRED: 'Production runtime mode is required.',
  MONGOOSE_DDL_POLICY_REQUIRED: 'Automatic model DDL policy could not be applied.',
  APPLICATION_START_FUNCTION_REQUIRED: 'Application startup function is unavailable.',
  PRODUCTION_ATLAS_QA_MATERIAL_FORBIDDEN: 'Production Atlas configuration contains forbidden QA settings.',
  PRODUCTION_ATLAS_URI_INVALID: 'Production Atlas connection configuration is invalid.',
  PRODUCTION_EXISTING_CLUSTER_AND_DATABASE_REQUIRED: 'Required production Atlas database configuration is unavailable.',
  PRODUCTION_ATLAS_URI_OPTION_FORBIDDEN: 'Production Atlas connection option is forbidden.',
  PRODUCTION_ATLAS_TLS_REQUIRED: 'Production Atlas TLS configuration is required.',
  PRODUCTION_DATABASE_IDENTITY_MISMATCH: 'Production database identity could not be verified.',
  PRODUCTION_AUTHENTICATED_ROLE_UNVERIFIED: 'Production database authenticated role could not be verified.',
  PRODUCTION_AUTHENTICATED_ROLE_DENIED: 'Production database authenticated role is denied.',
  'secretOrPrivateKey must have a value': 'JWT signing key is unavailable.'
});
function safeFailureDiagnostic(error, step) {
  let name, message;
  try { name = error?.name; if (name !== 'ValidationError') message = error?.message; } catch (_) { /* Redact hostile accessors too. */ }
  const diagnostic = {
    step: steps.has(step) ? step : 'unknown',
    errorName: names.has(name) ? name : 'Error',
    message: typeof message === 'string' && Object.hasOwn(messages, message) ? messages[message]
      : typeof message === 'string' && /^Missing encryption key for version .+$/.test(message)
        ? 'Encryption key for stored record version is unavailable.'
        : 'Failure details redacted.'
  };
  if (name === 'ValidationError') {
    delete diagnostic.message;
    diagnostic.validationPaths = [];
    try {
      const errors = error.errors;
      if (errors && typeof errors === 'object') {
        diagnostic.validationPaths = [...new Set(Object.keys(errors)
          .map(field => field.replace(/\.[0-9]+(?=\.|$)/g, ''))
          .filter(field => validationPathNames.has(field)))].sort();
      }
    } catch (_) { /* Never inspect individual validation errors or values. */ }
  }
  return diagnostic;
}
function reportFailure(error, step, logger = console.error) {
  const diagnostic = safeFailureDiagnostic(error, step);
  logger('[Failure]', JSON.stringify(diagnostic));
  return diagnostic;
}
module.exports = { safeFailureDiagnostic, reportFailure };
