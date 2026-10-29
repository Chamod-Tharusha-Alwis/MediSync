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
  try { name = error?.name; message = error?.message; } catch (_) { /* Redact hostile accessors too. */ }
  return {
    step: steps.has(step) ? step : 'unknown',
    errorName: names.has(name) ? name : 'Error',
    message: typeof message === 'string' && Object.hasOwn(messages, message) ? messages[message]
      : typeof message === 'string' && /^Missing encryption key for version .+$/.test(message)
        ? 'Encryption key for stored record version is unavailable.'
        : 'Failure details redacted.'
  };
}
function reportFailure(error, step, logger = console.error) {
  const diagnostic = safeFailureDiagnostic(error, step);
  logger('[Failure]', JSON.stringify(diagnostic));
  return diagnostic;
}
module.exports = { safeFailureDiagnostic, reportFailure };
