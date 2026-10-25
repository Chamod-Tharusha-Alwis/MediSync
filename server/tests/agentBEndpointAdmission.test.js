'use strict';
const { assertProductionRuntime } = require('../src/security/productionRuntimePolicy');
const { startProduction } = require('../src/production');

test('combined freeze includes deployment configuration without dropping ordinary source inputs', () => {
  const { isSnapshotInput } = require('../../scripts/agent_b_source_scope.cjs');
  for (const file of ['server/src/app.js', 'client/src/universityDemo/DemoApp.jsx', 'server/package-lock.json', '.github/workflows/security-tests.yml', 'ml-engine/app.py', 'client/src/universityDemo/demo.css', 'server/Dockerfile', 'client/Dockerfile', 'ml-engine/Dockerfile', 'server/.dockerignore', '.nvmrc', '.node-version']) expect(isSnapshotInput(file)).toBe(true);
  for (const file of ['server/.env', 'client/.env.production', 'docs/temp/private.json', 'scratch/receipt.json', 'Python/runtime.py', 'server/private.key', 'clinical.pdf']) expect(isSnapshotInput(file)).toBe(false);
});

test.each(['test', 'development', '', undefined])('production image rejects mode %p before application loading', NODE_ENV => {
  const load = jest.fn();
  expect(() => startProduction({ NODE_ENV }, load)).toThrow('PRODUCTION_RUNTIME_MODE_REQUIRED');
  expect(load).not.toHaveBeenCalled();
});

test.each(['MONGO_URI_TEST', 'MONGODB_URI_TEST', 'SEED_TEST_PASSWORD', 'MEDISYNC_QA_BOOTSTRAPPED', 'MEDISYNC_QA_BROWSER_RUN', 'MEDISYNC_TEST_MODE', 'MEDISYNC_COMBINED_MODE', 'MEDISYNC_PUBLIC_DEMO', 'MEDISYNC_OFFLINE_ONLY', 'mongo_uri_test', 'mediSYNC_qA_browser_run', 'Medisync_Test_Mode'])('production image rejects %s presence without inspecting its value', key => {
  const environment = { NODE_ENV: 'production' }, read = jest.fn(() => { throw new Error('PRIVATE_QA_VALUE'); });
  Object.defineProperty(environment, key, { enumerable: true, get: read });
  const load = jest.fn();
  expect(() => startProduction(environment, load)).toThrow('PRODUCTION_RUNTIME_QA_MATERIAL_FORBIDDEN');
  expect(read).not.toHaveBeenCalled(); expect(load).not.toHaveBeenCalled();
});

test('production admission detects a nonenumerable QA credential key without reading its getter', () => {
  const environment = { NODE_ENV: 'production' }, read = jest.fn(() => { throw new Error('PRIVATE_QA_VALUE'); });
  Object.defineProperty(environment, 'MONGO_URI_TEST', { get: read });
  expect(() => assertProductionRuntime(environment)).toThrow('PRODUCTION_RUNTIME_QA_MATERIAL_FORBIDDEN');
  expect(read).not.toHaveBeenCalled();
});

test.each(['', 'false'])('production image does not treat a QA setting of %p as removal', value => {
  expect(() => assertProductionRuntime({ NODE_ENV: 'production', MEDISYNC_QA_MODE: value })).toThrow('PRODUCTION_RUNTIME_QA_MATERIAL_FORBIDDEN');
});

test('production profile checks do not read credentials or simulate clinical activation approval', () => {
  const environment = { NODE_ENV: 'production', MEDISYNC_ATLAS_ROTATION_CONFIRMED: 'true' }, secretRead = jest.fn(() => { throw new Error('SECRET_READ'); });
  Object.defineProperty(environment, 'MONGO_URI', { enumerable: true, get: secretRead });
  expect(assertProductionRuntime(environment)).toEqual({ profile: 'production-clinical', qaMaterialPresent: false });
  const startServer = jest.fn(() => 'inert-started');
  const load = jest.fn(() => ({ startServer })); expect(startProduction(environment, load)).toBe('inert-started');
  expect(startServer).toHaveBeenCalledTimes(1);
  expect(secretRead).not.toHaveBeenCalled(); expect(load).toHaveBeenCalledTimes(1);
});

test('actual Docker source-copy projection excludes proof, seeds, credentials and private uploads while retaining the admin adapter', () => {
  const { reviewClinicalRuntime, contextAllows } = require('../scripts/reviewClinicalRuntime.cjs');
  const fs = require('fs'), path = require('path'), ignoreText = fs.readFileSync(path.join(__dirname, '../.dockerignore'), 'utf8');
  const result = reviewClinicalRuntime(), included = result.files.map(row => row.file);
  expect(included).toContain('src/production.js'); expect(included).toContain('src/app.js'); expect(included).toContain('scripts/previewSyntheticOutbreakScenarios.js');
  expect(included.some(file => /(?:^|\/)tests\/|legacyPdfProof|src\/utils\/(?:seed|wipe|cleanTest)/.test(file))).toBe(false);
  for (const file of ['tests/helpers/legacyPdfProof.js', 'src/nested/.env.production', 'src/nested/key.pem', 'uploads/clinical.pdf', 'scripts/phase5xSafeBackend.js', 'scripts/nested/operatorTool.js', 'node_modules/secret/index.js']) expect(contextAllows(file, ignoreText)).toBe(false);
  expect(result.imageBuilt).toBe(false); expect(result.clinicalActivationApproved).toBe(false);
});

test('clinical source-copy review rejects broad COPY and user-owned application source', () => {
  const fs = require('fs'), path = require('path'), dockerfile = fs.readFileSync(path.join(__dirname, '../Dockerfile'), 'utf8');
  const { reviewClinicalRuntime } = require('../scripts/reviewClinicalRuntime.cjs');
  expect(() => reviewClinicalRuntime({ dockerfile: dockerfile.replace('COPY src/ ./src/', 'COPY . .') })).toThrow('RUNTIME_COPY_SCOPE_FORBIDDEN');
  expect(() => reviewClinicalRuntime({ dockerfile: dockerfile.replace('COPY src/ ./src/', 'COPY --chown=node:node src/ ./src/') })).toThrow('RUNTIME_COPY_OWNERSHIP_OR_FLAG_UNREVIEWED');
  expect(() => reviewClinicalRuntime({ dockerfile: dockerfile.replace('COPY scripts/previewSyntheticOutbreakScenarios.js ./scripts/previewSyntheticOutbreakScenarios.js', '') })).toThrow('RUNTIME_PROFILE_INCOMPLETE');
});

test('runtime dependency closure rejects a controller import of the excluded legacy proof', () => {
  const { reviewClinicalRuntime } = require('../scripts/reviewClinicalRuntime.cjs');
  expect(() => reviewClinicalRuntime({ overrides: { 'src/controllers/notificationController.js': "require('../../tests/helpers/legacyPdfProof');" } })).toThrow('RUNTIME_LEGACY_PROOF_IMPORT_FORBIDDEN');
  expect(() => reviewClinicalRuntime({ overrides: { 'src/controllers/notificationController.js': "require('../../scripts/unreviewedOperatorTool');" } })).toThrow('RUNTIME_LOCAL_IMPORT_NOT_INCLUDED');
});

const { assertQaConnectionConfiguration } = require('../src/security/qaConnectionAdmission');
const { clientOrigin } = require('../src/security/clientOriginPolicy');
const valid = () => ({ MEDISYNC_QA_BOOTSTRAPPED: 'true', MEDISYNC_QA_CREDENTIALS_ROTATED: 'true', MONGO_URI_TEST: 'mongodb+srv://synthetic:synthetic-only@qa-project-medisync.gwprp27.mongodb.net/medisync_automated_test?tls=true' });

test.each([undefined, 'redis://127.0.0.1:6379', 'redis://:synthetic-only@remote.example.invalid:6379', 'https://:synthetic-only@remote.example.invalid', 'rediss://:synthetic-only@remote.example.invalid?tls=false'])('production Redis rejects missing auth or insecure remote configuration (%s)', REDIS_URL => {
  expect(() => require('../src/security/redisConnectionPolicy').validateRedisConnection({ NODE_ENV: 'production', REDIS_URL })).toThrow();
});

test('Redis configuration permits authenticated TLS, authenticated numeric loopback and explicit nonproduction development', () => {
  const validate = require('../src/security/redisConnectionPolicy').validateRedisConnection;
  for (const REDIS_URL of ['rediss://:synthetic-only@remote.example.invalid:6380/0', 'redis://:synthetic-only@127.0.0.1:6379']) expect(validate({ NODE_ENV: 'production', REDIS_URL })).toBe(REDIS_URL);
  expect(validate({ NODE_ENV: 'test' })).toBe('redis://127.0.0.1:6379');
});

test('actual consent routes admit the same pharmacy staff roles as the verified consent service', () => {
  const fs = require('fs'), path = require('path'), vm = require('vm'), routes = [];
  const router = new Proxy({}, { get: (_target, method) => (route, ...handlers) => routes.push({ method, route, handlers }) });
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/routes/patientRoutes.js'), 'utf8'), { module, process: { env: { NODE_ENV: 'test' } }, require(name) {
    if (name === 'express') return { Router: () => router };
    if (name === '../middleware/verifiedAuth') return roles => ({ verifiedRoles: roles });
    if (name === 'express-rate-limit') return () => () => {};
    if (name === '../controllers/patientController') return {};
    throw new Error('UNEXPECTED_ROUTE_DEPENDENCY');
  } });
  for (const route of ['/request-access', '/verify-access']) {
    const registered = routes.find(row => row.method === 'post' && row.route === route);
    expect(registered.handlers[0].verifiedRoles).toEqual(['doctor', 'pharmacist', 'pharmacy_admin', 'assistant', 'hospital_admin']);
  }
});
test('QA admission uses the existing cluster/database and only an operator rotation attestation', () => expect(assertQaConnectionConfiguration(valid())).toEqual({ dbName: 'medisync_automated_test', cluster: 'qa-project-medisync.gwprp27.mongodb.net', credentialRotationAttested: 'NOT_VERIFIED' }));
test.each(['production-loaded', 'wrong-db', 'wrong-cluster', 'tls-off', 'bad-cert', 'bad-hostname', 'no-rotation', 'no-bootstrap'])('QA pre-admission rejects %s without a connection', variant => {
  const env = valid();
  if (variant === 'production-loaded') env.MONGO_URI = 'forbidden-synthetic-sentinel';
  if (variant === 'wrong-db') env.MONGO_URI_TEST = env.MONGO_URI_TEST.replace('medisync_automated_test', 'test');
  if (variant === 'wrong-cluster') env.MONGO_URI_TEST = env.MONGO_URI_TEST.replace('qa-project-medisync.gwprp27', 'other');
  if (variant === 'tls-off') env.MONGO_URI_TEST = env.MONGO_URI_TEST.replace('tls=true', 'tls=false');
  if (variant === 'bad-cert') env.MONGO_URI_TEST += '&tlsAllowInvalidCertificates=true';
  if (variant === 'bad-hostname') env.MONGO_URI_TEST += '&tlsAllowInvalidHostnames=true';
  if (variant === 'no-rotation') delete env.MEDISYNC_QA_CREDENTIALS_ROTATED;
  if (variant === 'no-bootstrap') delete env.MEDISYNC_QA_BOOTSTRAPPED;
  expect(() => assertQaConnectionConfiguration(env)).toThrow();
});
test.each(['http://localhost:3000', 'https://production.example.invalid', 'http://0.0.0.0:3100', 'http://127.0.0.1:3100/path'])('QA origin rejects %s', value => expect(() => clientOrigin({ NODE_ENV: 'test', CLIENT_URL: value })).toThrow());
test('QA default uses the agreed loopback port and production requires an explicit HTTPS origin', () => {
  expect(clientOrigin({ NODE_ENV: 'test' })).toBe('http://127.0.0.1:3100'); expect(() => clientOrigin({ NODE_ENV: 'production' })).toThrow();
  expect(clientOrigin({ NODE_ENV: 'production', CLIENT_URL: 'https://synthetic.example.invalid' })).toBe('https://synthetic.example.invalid');
});
test('QA cookie refresh accepts only its loopback Origin without a production origin fallback', () => {
  const old = process.env.CLIENT_URL; delete process.env.CLIENT_URL;
  try {
    const guard = require('../src/middleware/trustedCookieOrigin'), next = jest.fn(), res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    guard({ cookies: { refreshToken: 'synthetic' }, headers: { origin: 'http://127.0.0.1:3100' } }, res, next); expect(next).toHaveBeenCalledTimes(1);
    guard({ cookies: { refreshToken: 'synthetic' }, headers: { origin: 'https://synthetic.example.invalid' } }, res, next); expect(res.status).toHaveBeenCalledWith(403); expect(next).toHaveBeenCalledTimes(1);
  } finally { if (old !== undefined) process.env.CLIENT_URL = old; }
});
test('legacy maintenance entry points deny before loading environment files or provider/database modules', () => {
  const fs = require('fs'), path = require('path');
  for (const name of ['seedUsers', 'seedUniversityDemoDataset', 'seedOutbreakDemo', 'seedPharmacyMLData', 'seedRestockData', 'wipeOutbreakDemo', 'wipeSeedRestockData']) {
    const source = fs.readFileSync(path.resolve(__dirname, '../src/utils', name + '.js'), 'utf8'); expect(source.split('\n')[0]).toContain("require('../security/maintenanceAdmission').denyLegacyMaintenance()");
  }
  expect(() => require('../src/security/maintenanceAdmission').denyLegacyMaintenance()).toThrow('LEGACY_DATASET_MAINTENANCE_DISABLED');
});
