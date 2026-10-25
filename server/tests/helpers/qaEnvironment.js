// Child bootstrap. Full env-file parsing belongs exclusively to the parent.
const crypto = require('crypto');
const http = require('http');
const https = require('https');
require('./qaEnvironmentContract').validateChildEnvironment(process.env);
const secretReadAttempts=[];
require('./qaSecretReadGuard').installQaSecretReadGuard(require('fs'),secretReadAttempts);
const encryptionKey = process.env.ENCRYPTION_KEY;
global.ENCRYPTION_KEY = encryptionKey;
global.ENCRYPTION_KEYS = { '1': encryptionKey };
global.ACTIVE_KEY_VERSION = 1;

// Retain the application's OTP checks and one-use semantics in its process-local
// memory implementation. No Redis client may be initialized by these suites.
const redis = require('../../src/config/redis');
redis.initRedis = async () => { throw new Error('[QA] Redis initialization is prohibited in isolated suites'); };
if (redis.isUsingPersistentRedis()) throw new Error('[QA] Unexpected persistent Redis connection');
const otpKeys = new Set();
const originalDeleteOtp = redis.deleteOtp;
const originalClearAttempts = redis.clearAttempts;
for (const method of ['setOtp', 'deleteOtp', 'incrementAttempts', 'clearAttempts']) {
  const original = redis[method];
  redis[method] = async function (key, ...args) { otpKeys.add(key); return original(key, ...args); };
}
async function cleanupOtp() {
  for (const key of otpKeys) {
    await originalDeleteOtp(key);
    await originalClearAttempts(key);
    if (await redis.getOtp(key) || await redis.getAttempts(key)) throw new Error('[QA] Owned OTP memory cleanup failed');
  }
}

// Supertest needs ephemeral loopback HTTP ports. Every fixed QA service port
// and every non-loopback HTTP destination is blocked in legacy Jest processes.
// MongoDB uses its own driver transport and remains subject to dbGuard.
const networkAttempts = [];
require('./loopbackListenerGuard').installLoopbackListenerGuard();
function destination(input, options) {
  const first = typeof input === 'string' || input instanceof URL ? new URL(input) : null;
  const opts = first ? (options || {}) : (input || {});
  const host = String(opts.hostname || opts.host || first?.hostname || '').replace(/^\[|\]$/g, '');
  const port = Number(opts.port || first?.port || (first?.protocol === 'https:' ? 443 : 80));
  return { host: host === '::1' ? host : host.replace(/:\d+$/, ''), port };
}
function guardRequest(original, protocol) {
  return function (input, options, callback) {
    const { host, port } = destination(input, options);
    if (!['127.0.0.1', 'localhost', '::1'].includes(host) || [3100, 5100, 5101].includes(port) || protocol === 'https') {
      networkAttempts.push({ protocol, host, port, blocked: true });
      throw new Error('[QA] Outbound HTTP request blocked by legacy-test network guard');
    }
    return original.apply(this, arguments);
  };
}
http.request = guardRequest(http.request, 'http');
https.request = guardRequest(https.request, 'https');
http.get = function (input, options, callback) { const req = http.request(input, options, callback); req.end(); return req; };
https.get = function (input, options, callback) { const req = https.request(input, options, callback); req.end(); return req; };
global.fetch = async function (input) {
  const url = new URL(typeof input === 'string' ? input : input.url);
  networkAttempts.push({ protocol: url.protocol.replace(':', ''), host: url.hostname, port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)), blocked: true });
  throw new Error('[QA] Fetch request blocked by legacy-test network guard');
};

module.exports = { TEST_DB_NAME: 'medisync_automated_test', networkAttempts, secretReadAttempts, otpKeys, cleanupOtp };
