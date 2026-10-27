'use strict';

// Test-only execution of unchanged startup modules. All I/O boundaries are inert.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const real = name => require(path.join(root, 'server/src', name));
const backendNames = 'ACTIVE_KEY_VERSION BREVO_API_KEY BREVO_DAILY_FREE_LIMIT BREVO_FROM_ADDRESS CLIENT_URL CLOUDINARY_API_KEY CLOUDINARY_API_SECRET CLOUDINARY_CLOUD_NAME CORS_ORIGIN EMAIL_BACKUP_PROVIDER EMAIL_PASS EMAIL_PROVIDER EMAIL_USER ENCRYPTION_KEY INTERNAL_API_KEY JWT_REFRESH_SECRET JWT_SECRET MEDISYNC_ALLOW_OPERATOR_KEYS MEDISYNC_ATLAS_ROTATION_CONFIRMED MEDISYNC_LIVE_START_APPROVED MEDISYNC_PROTOTYPE_MODE ML_ENGINE_URL MONGO_URI MONGO_URI_TEST NODE_ENV PORT REDIS_URL RESEND_FROM_ADDRESS RESEND_SMTP_HOST RESEND_SMTP_PASS RESEND_SMTP_PORT RESEND_SMTP_USER SEED_TEST_PASSWORD SESSION_SECRET VAULT_TOKEN'.split(' ');
const mlNames = 'CLIENT_URL FLASK_ENV INTERNAL_API_KEY NODE_API_URL PORT PYTHONPATH'.split(' ');
function dummyEnvironment({ corrected = false, removeForbiddenOnly = false } = {}) {
  const env = Object.fromEntries(backendNames.map(name => [name, 'inert-not-a-real-setting']));
  Object.assign(env, { NODE_ENV: 'production', ACTIVE_KEY_VERSION: '1', MEDISYNC_PROTOTYPE_MODE: 'true', MEDISYNC_ALLOW_OPERATOR_KEYS: 'true', MEDISYNC_LIVE_START_APPROVED: 'true', MEDISYNC_ATLAS_ROTATION_CONFIRMED: 'true', CLIENT_URL: 'https://client.example.invalid', ML_ENGINE_URL: 'https://ml.example.invalid', REDIS_URL: 'rediss://:inert@redis.example.invalid:6379', MONGO_URI: 'mongodb+srv://inert:inert@medisync.p7hjket.mongodb.net/medisync_prod?tls=true' });
  if (corrected || removeForbiddenOnly) { delete env.MONGO_URI_TEST; delete env.SEED_TEST_PASSWORD; }
  if (corrected) {
    for (const name of ['ENCRYPTION_KEY', 'VAULT_TOKEN', 'CORS_ORIGIN', 'EMAIL_PROVIDER', 'EMAIL_USER', 'EMAIL_PASS', 'RESEND_SMTP_HOST', 'RESEND_SMTP_PORT', 'RESEND_SMTP_USER']) delete env[name];
    env.ENCRYPTION_KEYS = JSON.stringify({ '1': crypto.randomBytes(32).toString('hex') });
    env.MEDISYNC_DEPLOYMENT_MODE = 'clinical'; env.MEDISYNC_ML_ALLOWED_ORIGIN = env.ML_ENGINE_URL;
  }
  return env;
}
async function probe(environment, { completeStorage = false } = {}) {
  const events = [], codes = [], cache = new Map();
  let inertConnects = 0, disconnects = 0, redisInitializations = 0, appLoads = 0;
  const denied = () => { throw Error('PROBE_UNEXPECTED_IO_BOUNDARY'); };
  const manifest = real('security/productionStorageAdmission').manifest;
  const cursor = rows => ({ toArray: async () => rows, close: async () => {} });
  const db = {
    databaseName: 'medisync_prod',
    command: async command => command.connectionStatus ? { authInfo: { authenticatedUsers: [{ user: 'inert', db: 'admin' }], authenticatedUserRoles: [{ role: 'readWrite', db: 'medisync_prod' }] } } : { isWritablePrimary: true, logicalSessionTimeoutMinutes: 30, maxWireVersion: 17, setName: 'inert-only' },
    listCollections: filter => { events.push('storage-metadata'); const spec = manifest.collections.find(row => row.name === filter.name); return cursor(completeStorage && spec ? [{ name: spec.name, type: 'collection', options: { ...(spec.capped ? { capped: true, ...spec.capped } : {}) } }] : []); },
    collection: name => ({ listIndexes: () => cursor(manifest.collections.find(row => row.name === name).indexes) })
  };
  const mongoose = { models: {}, set() {}, plugin() {}, Model: { deleteMany: denied }, connection: { db }, connect: async () => { inertConnects++; events.push('inert-connect'); }, disconnect: async () => { disconnects++; events.push('inert-disconnect'); } };
  const policy = real('security/productionAtlasPolicy'), storage = real('security/productionStorageAdmission');
  const instrumentedStorage = { ...storage, verifyProductionStorage: async (...args) => { try { return await storage.verifyProductionStorage(...args); } catch (error) { codes.push(error.message); throw error; } } };
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative).exports;
    const module = { exports: {} }; cache.set(relative, module);
    const source = fs.readFileSync(path.join(root, 'server/src', relative), 'utf8');
    const resolver = name => {
      if (name === 'mongoose') return mongoose;
      if (name === 'crypto') return crypto;
      if (name === 'mongodb-connection-string-url') return require('mongodb-connection-string-url');
      if (name === 'dotenv') return { config() {} };
      if (name.endsWith('/productionRuntimePolicy')) return real('security/productionRuntimePolicy');
      if (name.endsWith('/clinicalEntryPolicy')) return real('security/clinicalEntryPolicy');
      // Keep the function's default process.env in the isolated VM, not the host.
      if (name.endsWith('/clientOriginPolicy')) return load('security/clientOriginPolicy.js');
      if (name.endsWith('/productionAtlasPolicy')) return policy;
      if (name.endsWith('/productionStorageAdmission')) return instrumentedStorage;
      if (name.endsWith('/operatorKeyPolicy')) return real('security/operatorKeyPolicy');
      if (name.endsWith('/securityRuntime')) return load('security/securityRuntime.js');
      if (name === './nicBlindIndex') return real('security/nicBlindIndex');
      if (name === './authenticatedFields') return real('security/authenticatedFields');
      if (name === './config/dbGuard' || name === './dbGuard') return load('config/dbGuard.js');
      if (name === './config/db') return load('config/db.js');
      if (name === './utils/cronJobs') return denied;
      if (name === './config/redis') return { initRedis: async () => { redisInitializations++; }, closeRedis: async () => {} };
      if (name === './security/applicationShutdown') return { createApplicationShutdown: () => ({ stop: async () => events.push('shutdown'), bind: denied }) };
      if (name === './models/Admin') return { exists: async () => null };
      if (name.startsWith('./models/')) return { schema: { path() {} } };
      if (name === './utils/versionedEncryption') return real('utils/versionedEncryption');
      if (name === './controllers/doctorController') return { createConsultation() {} };
      // Framework imports are inert; no app/listener is built before the tested gates.
      if (['express', 'helmet', 'cors', 'cookie-parser', 'express-rate-limit', 'express-mongo-sanitize', 'node-vault'].includes(name)) return denied;
      if (name === 'http') return { createServer: denied };
      if (name === 'socket.io') return { Server: denied };
      throw Error('PROBE_UNEXPECTED_IMPORT');
    };
    resolver.main = null;
    vm.runInNewContext(source, { module, exports: module.exports, require: resolver, process: { env: environment, exit: code => { const error = Error('PROBE_PROCESS_EXIT'); error.exitCode = code; throw error; } }, global: {}, console: { log() {}, warn() {}, error(...args) { for (const arg of args) if (typeof arg === 'string' && (arg.startsWith('[FATAL]') || arg.startsWith('DB connection failed:'))) events.push(arg); } }, URL, Buffer, setTimeout, clearTimeout }, { filename: relative });
    return module.exports;
  }
  let error;
  try { await load('production.js').startProduction(environment, () => { appLoads++; return load('app.js'); }); }
  catch (failure) { error = failure.message; }
  return { error, codes, events, appLoads, inertConnects, disconnects, redisInitializations, networkOperations: 0, values: 'not reported' };
}
module.exports = { backendNames, mlNames, dummyEnvironment, probe };
