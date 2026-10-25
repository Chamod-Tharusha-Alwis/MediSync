// Trusted launcher only. Never import this module from a Jest suite/bootstrap.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { validateAutomatedTestConfig } = require('../../src/config/dbGuard');
const { OS_KEYS, validateChildEnvironment } = require('./qaEnvironmentContract');
function buildQaChildEnvironment({ inherited = process.env, fileValues } = {}) {
  if (inherited.JEST_WORKER_ID !== undefined) throw new Error('[QA] Parent bootstrap prohibited inside Jest');
  const values = fileValues === undefined ? require('dotenv').parse(fs.readFileSync(path.resolve(__dirname,'../../.env'))) : fileValues;
  const testUri = inherited.MONGO_URI_TEST || values.MONGO_URI_TEST;
  const prodUri = inherited.MONGO_URI || values.MONGO_URI;
  if (!prodUri) throw new Error('[QA] Parent cannot prove credential separation');
  validateAutomatedTestConfig({ testUri, prodUri });
  const env = Object.fromEntries(OS_KEYS.filter(key => inherited[key]).map(key => [key,inherited[key]]));
  Object.assign(env, {
    MEDISYNC_QA_CHILD_CONFIG: '5xd5-v1', NODE_ENV: 'test', MEDISYNC_TEST_MODE: 'true', MONGO_URI_TEST: testUri,
    ENCRYPTION_KEY: inherited.ENCRYPTION_KEY || values.ENCRYPTION_KEY,
    JWT_SECRET: crypto.randomBytes(48).toString('hex'), JWT_REFRESH_SECRET: crypto.randomBytes(48).toString('hex'),
    INTERNAL_API_KEY: crypto.randomBytes(48).toString('hex'), SEED_TEST_PASSWORD: values.SEED_TEST_PASSWORD,
    CLIENT_URL:'http://127.0.0.1:3100', ML_ENGINE_URL:'http://127.0.0.1:5101', EMAIL_SERVICE_LIVE_TEST:'false',
    ALLOW_SYNTHETIC_DEMO_DIRECTORY:'true', NO_PROXY:'127.0.0.1,localhost'
  });
  return validateChildEnvironment(env);
}
module.exports = { buildQaChildEnvironment };
