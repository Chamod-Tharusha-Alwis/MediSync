'use strict';
function assertClinicalEntry(environment = process.env) {
  if ((environment.MEDISYNC_PUBLIC_DEMO !== undefined && environment.MEDISYNC_PUBLIC_DEMO !== 'false') ||
      (environment.MEDISYNC_UNIVERSITY_DEMO !== undefined && environment.MEDISYNC_UNIVERSITY_DEMO !== 'false') ||
      (environment.MEDISYNC_DEPLOYMENT_MODE !== undefined && environment.MEDISYNC_DEPLOYMENT_MODE !== 'clinical')) {
    throw new Error('CLINICAL_ENTRY_MODE_REQUIRED');
  }
}
module.exports = { assertClinicalEntry };
