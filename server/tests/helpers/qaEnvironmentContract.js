// Pure child contract: no fs, dotenv, provider initialization or connection.
const { validateAutomatedTestConfig } = require('../../src/config/dbGuard');
// Windows may inject these identity/path keys when creating a process even if
// the parent supplies an explicit environment. They are not application secrets.
const OS_KEYS = ['SystemRoot','SYSTEMROOT','WINDIR','PATH','Path','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA',
  'HOMEDRIVE','HOMEPATH','LOGONSERVER','SYSTEMDRIVE','USERDOMAIN','USERNAME'];
const QA_KEYS = ['MEDISYNC_QA_CHILD_CONFIG','NODE_ENV','MEDISYNC_TEST_MODE','MONGO_URI_TEST','ENCRYPTION_KEY',
  'JWT_SECRET','JWT_REFRESH_SECRET','INTERNAL_API_KEY','SEED_TEST_PASSWORD','CLIENT_URL','ML_ENGINE_URL',
  'EMAIL_SERVICE_LIVE_TEST','ALLOW_SYNTHETIC_DEMO_DIRECTORY','NO_PROXY', 'JEST_WORKER_ID',
  'MEDISYNC_QA_LEGACY_OWNER','MEDISYNC_QA_BROWSER_RUN','MEDISYNC_QA_BROWSER_OWNER','MEDISYNC_QA_MANIFEST_LABEL',
  'MEDISYNC_QA_BOOTSTRAPPED','MEDISYNC_QA_BROWSER_EXECUTION_APPROVED','PORT'];
const allowed = new Set([...OS_KEYS, ...QA_KEYS]);
function validateChildEnvironment(env) {
  if (Object.keys(env).some(key => !allowed.has(key))) throw new Error('[QA] Unapproved child environment key');
  if (env.MEDISYNC_QA_CHILD_CONFIG !== '5xd5-v1' || env.NODE_ENV !== 'test' || env.MEDISYNC_TEST_MODE !== 'true' ||
      env.CLIENT_URL !== 'http://127.0.0.1:3100' || env.ML_ENGINE_URL !== 'http://127.0.0.1:5101' ||
      env.EMAIL_SERVICE_LIVE_TEST !== 'false') throw new Error('[QA] Trusted parent QA contract required');
  if(env.PORT!==undefined && env.PORT!=='5100')throw new Error('[QA] Unexpected QA backend port');
  for (const key of ['ENCRYPTION_KEY','JWT_SECRET','JWT_REFRESH_SECRET','INTERNAL_API_KEY','SEED_TEST_PASSWORD']) {
    if (!env[key] || !String(env[key]).trim()) {
      const error = new Error('[QA] Required child QA configuration missing');
      error.qaMissingKey = key; // Key name only; never include configuration values.
      throw error;
    }
  }
  // Credential separation was checked by the parent; child only validates target.
  validateAutomatedTestConfig({ testUri: env.MONGO_URI_TEST, prodUri: '' });
  return env;
}
module.exports = { OS_KEYS, QA_KEYS, validateChildEnvironment };
