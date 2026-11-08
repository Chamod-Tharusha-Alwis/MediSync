'use strict';
function assertClinicalEntry(environment = process.env) {
  if ((environment.MEDISYNC_PUBLIC_DEMO !== undefined && environment.MEDISYNC_PUBLIC_DEMO !== 'false') ||
      (environment.MEDISYNC_UNIVERSITY_DEMO !== undefined && environment.MEDISYNC_UNIVERSITY_DEMO !== 'false') ||
      (environment.MEDISYNC_DEPLOYMENT_MODE !== undefined && environment.MEDISYNC_DEPLOYMENT_MODE !== 'clinical')) {
    throw new Error('CLINICAL_ENTRY_MODE_REQUIRED');
  }
  if ((environment.TEST_OTP_ENABLED === 'true' || environment.TEST_OTP_CODE) &&
      (environment.NODE_ENV === 'production' || environment.MEDISYNC_DEPLOYMENT_MODE === 'clinical')) {
    console.warn('[SECURITY WARNING] TEST_OTP_ENABLED or TEST_OTP_CODE detected in production environment. Test OTP bypass is permanently removed and these variables are completely ignored.');
  }
}
module.exports = { assertClinicalEntry };
