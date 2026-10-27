'use strict';
// Pure admission before dotenv, application, provider or database imports.
function assertProductionRuntime(environment) {
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)) throw new Error('PRODUCTION_RUNTIME_CONFIGURATION_INVALID');
  const forbidden = rawName => {
    // Windows environment lookup is case-insensitive; admission must not accept
    // a mixed-case alias that the application later reads under its normal key.
    const name = rawName.toUpperCase();
    return /^MEDISYNC_(?:QA_|TEST_|COMBINED_|DEMO_)/.test(name) || [
    'JEST_WORKER_ID', 'SINGLE_INSTANCE_DEV_MODE', 'MONGO_URI_STAGING', 'MONGO_URI_TEST', 'MONGODB_URI_TEST', 'SEED_TEST_PASSWORD',
    'MEDISYNC_OFFLINE_ONLY', 'MEDISYNC_LIVE_BROWSER_APPROVED',
    'MEDISYNC_PUBLIC_DEMO', 'MEDISYNC_UNIVERSITY_DEMO', 'ALLOW_SYNTHETIC_DEMO_DIRECTORY'
    ].includes(name);
  };
  // Reject names before reading any value. A false/empty QA setting must be
  // removed, not passed through a production image as supposed authorization.
  if (Object.getOwnPropertyNames(environment).some(forbidden)) throw new Error('PRODUCTION_RUNTIME_QA_MATERIAL_FORBIDDEN');
  if (environment.MEDISYNC_DEPLOYMENT_MODE !== undefined && environment.MEDISYNC_DEPLOYMENT_MODE !== 'clinical') throw new Error('PRODUCTION_RUNTIME_MODE_REQUIRED');
  const mode = Object.getOwnPropertyDescriptor(environment, 'NODE_ENV');
  if (!mode || !Object.hasOwn(mode, 'value') || mode.value !== 'production') throw new Error('PRODUCTION_RUNTIME_MODE_REQUIRED');
  return Object.freeze({ profile: 'production-clinical', qaMaterialPresent: false });
}
module.exports = { assertProductionRuntime };
