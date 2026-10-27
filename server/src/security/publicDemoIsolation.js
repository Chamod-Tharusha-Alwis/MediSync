'use strict';

const DISCLAIMER = 'UNIVERSITY RESEARCH PROTOTYPE — SYNTHETIC DEMONSTRATION DATA — NOT FOR CLINICAL USE.';
const MODE = 'university-static-demo';
const SPA_ROUTES = Object.freeze(['/', '/demo', '/demo/admin', '/demo/patient', '/demo/doctor', '/demo/pharmacy', '/demo/hospital']);

// This guard is deliberately called before dotenv and all clinical imports.
function assertClinicalEntry(env = process.env) {
  if ((env.MEDISYNC_PUBLIC_DEMO !== undefined && env.MEDISYNC_PUBLIC_DEMO !== 'false') ||
      (env.MEDISYNC_DEPLOYMENT_MODE !== undefined && env.MEDISYNC_DEPLOYMENT_MODE !== 'clinical')) {
    throw new Error('PUBLIC_DEMO_REQUIRES_SEPARATE_STATIC_ENTRY');
  }
}

function assertDemoEnvironment(env) {
  if (!env || env.MEDISYNC_PUBLIC_DEMO !== 'true' ||
      (env.MEDISYNC_DEPLOYMENT_MODE !== undefined && env.MEDISYNC_DEPLOYMENT_MODE !== MODE)) {
    throw new Error('PUBLIC_DEMO_MODE_REQUIRED');
  }
  for (const [name, value] of Object.entries(env)) {
    if (!value) continue;
    if (/MONGO|DATABASE|(^|_)DB_|REDIS|VAULT|JWT|ENCRYPTION|HMAC|RESEND|BREVO|SMTP|TWILIO|CLOUDINARY|AWS_|SENDGRID|SEED_|PASSWORD|SECRET|TOKEN|PRIVATE_KEY|CLIENT_URL|API_URL|SERVER_URL|ML_ENGINE_URL|NODE_OPTIONS|NODE_PATH|PROXY/i.test(name) ||
        (/^MEDISYNC_(?:QA_|LIVE_|TEST_)/i.test(name) && value !== 'false')) {
      // Never disclose the offending value (or its credential-bearing URL).
      throw new Error('PUBLIC_DEMO_ENVIRONMENT_REJECTED');
    }
  }
  const host = env.HOST || '127.0.0.1';
  const port = env.PORT === undefined ? 3200 : Number(env.PORT);
  if (!['127.0.0.1', '::1'].includes(host) || !Number.isSafeInteger(port) || port < 1024 || port > 65535 ||
      (env.PORT !== undefined && !/^[1-9][0-9]{3,4}$/.test(env.PORT))) {
    throw new Error('PUBLIC_DEMO_LOOPBACK_CONFIGURATION_REQUIRED');
  }
  return Object.freeze({ host, port, mode: MODE });
}

module.exports = { DISCLAIMER, MODE, SPA_ROUTES, assertClinicalEntry, assertDemoEnvironment };
