'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { Readable, Writable } = require('node:stream');
const { parseNames, inspectNames, main } = require('./checkRenderEnvironmentNames.cjs');
const { backendNames, mlNames, dummyEnvironment, probe } = require('../server/tests/helpers/renderEnvironmentStartupProbe.cjs');
function sink() { let text = ''; return { stream: new Writable({ write(chunk, _encoding, done) { text += chunk; done(); } }), text: () => text }; }
test('operator screenshot names: exactly two forbidden backend settings and actual missing keys', () => {
  const result = inspectNames('backend', backendNames);
  assert.deepEqual(result.rows.filter(row => row.status === 'FORBIDDEN').map(row => row.name).sort(), ['MONGO_URI_TEST', 'SEED_TEST_PASSWORD']);
  assert.deepEqual(result.rows.filter(row => row.status === 'MISSING').map(row => row.name).sort(), ['ENCRYPTION_KEYS', 'MEDISYNC_DEPLOYMENT_MODE', 'MEDISYNC_ML_ALLOWED_ORIGIN']);
  assert.match(result.rows.find(row => row.name === 'MEDISYNC_DEPLOYMENT_MODE').requirement, /omission is permitted/);
});
test('ML screenshot: NODE_API_URL and FLASK_ENV unused; CLIENT_URL and PYTHONPATH kept', () => {
  const rows = inspectNames('ml', mlNames).rows;
  assert.deepEqual(rows.filter(row => row.status === 'UNUSED').map(row => row.name).sort(), ['FLASK_ENV', 'NODE_API_URL']);
  for (const name of ['CLIENT_URL', 'PYTHONPATH', 'INTERNAL_API_KEY', 'PORT']) assert.equal(rows.find(row => row.name === name).status, 'KEEP');
});
test('legacy keys and SMTP password alias are not incorrectly called globally unused/forbidden', () => {
  const rows = inspectNames('backend', backendNames).rows;
  for (const name of ['ENCRYPTION_KEY', 'VAULT_TOKEN']) assert.equal(rows.find(row => row.name === name).status, 'LEGACY');
  assert.equal(rows.find(row => row.name === 'RESEND_SMTP_PASS').status, 'KEEP');
  assert.match(rows.find(row => row.name === 'SESSION_SECRET').requirement, /preflight-only/);
});
test('REAL email getters prefer canonical Resend API key, accept legacy alias, ignore SMTP/user provider selectors', () => {
  const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
  const source = fs.readFileSync(path.join(__dirname, '../server/src/utils/emailService.js'), 'utf8');
  let providerCalls = 0;
  const deny = () => { providerCalls++; throw Error('PROVIDER_OPERATION_FORBIDDEN'); };
  const inert = new Proxy({}, { get: () => deny });
  const environment = { RESEND_SMTP_PASS: 'inert-alias-only', EMAIL_PROVIDER: 'ignored-selector', EMAIL_USER: 'ignored-login-name', EMAIL_PASS: 'ignored-password', RESEND_SMTP_HOST: 'ignored-host', RESEND_SMTP_PORT: 'ignored-port', EMAIL_BACKUP_PROVIDER: 'brevo' };
  const module = { exports: {} };
  vm.runInNewContext(source + '\nmodule.exports.__namesProbe = { getResendApiKey, getBackupProviderName, getBrevoConfig };', { module, exports: module.exports, require: () => inert, process: { env: environment }, console: { log() {}, warn() {}, error() {} }, Buffer, URL });
  assert.equal(module.exports.__namesProbe.getResendApiKey(), 'inert-alias-only');
  environment.RESEND_API_KEY = 'inert-canonical-only';
  assert.equal(module.exports.__namesProbe.getResendApiKey(), 'inert-canonical-only');
  assert.equal(module.exports.__namesProbe.getBackupProviderName(), 'brevo');
  assert.equal(module.exports.__namesProbe.getBrevoConfig().configured, false);
  environment.BREVO_API_KEY = 'inert-backup-only';
  assert.equal(module.exports.__namesProbe.getBrevoConfig().configured, true);
  assert.equal(providerCalls, 0);
});
test('unknown names are not echoed or falsely declared unused; required names are case-sensitive', () => {
  const result = inspectNames('backend', ['node_env', 'OPERATOR_MIGHT_HAVE_PASTED_A_VALUE']);
  assert.equal(result.rows.filter(row => row.status === 'UNKNOWN').length, 2);
  assert.equal(result.rows.filter(row => row.status === 'UNKNOWN').every(row => row.name === '[unrecognized-name]'), true);
  assert.ok(result.rows.some(row => row.status === 'MISSING' && row.name === 'NODE_ENV'));
});
for (const name of ['mOnGo_UrI_tEsT', 'SEED_TEST_PASSWORD', 'MEDISYNC_QA_X', 'MEDISYNC_TEST_MODE', 'JEST_WORKER_ID', 'SINGLE_INSTANCE_DEV_MODE']) {
  test(`real production policy classifies ${name} as forbidden by presence`, () => {
    assert.equal(inspectNames('backend', [name]).rows.some(row => row.status === 'FORBIDDEN'), true);
  });
}
for (const input of ['SECRET=value', 'export SECRET=value', '$env:KEY = anything', 'mongodb+srv://inert:inert@host.invalid/db', '{"SECRET":"value"}', '["KEY=value"]', 'NAME\u0000OTHER']) {
  test('rejects accidental assignments/values with a constant error, not their content: ' + input.split(/[=:]/)[0], () => {
    assert.throws(() => parseNames(input), /^Error: NAME_LIST_INVALID$/);
  });
}
test('CSV, whitespace and JSON arrays support deduplication without reading an environment', () => {
  assert.deepEqual(parseNames('NODE_ENV, PORT\nPORT'), ['NODE_ENV', 'PORT']);
  assert.deepEqual(parseNames('["PORT","NODE_ENV"]'), ['NODE_ENV', 'PORT']);
  assert.deepEqual(parseNames(''), []);
});
test('oversize stdin and invalid service fail closed', () => {
  assert.throws(() => parseNames('A'.repeat(65537)), /NAME_LIST_INVALID/);
  assert.throws(() => inspectNames('production', []), /SERVICE_INVALID/);
});
test('CLI names-only execution prints classifications, never assignment content', async () => {
  const output = sink(), errors = sink();
  assert.equal(await main(['backend'], Readable.from(['MONGO_URI_TEST\nSEED_TEST_PASSWORD']), output.stream, errors.stream), 1);
  assert.match(output.text(), /FORBIDDEN MONGO_URI_TEST/);
  assert.equal(errors.text(), '');
  const badOutput = sink(), badErrors = sink();
  assert.equal(await main(['backend'], Readable.from(['KEY=PRIVATE_MARKER']), badOutput.stream, badErrors.stream), 2);
  assert.equal(badOutput.text(), ''); assert.doesNotMatch(badErrors.text(), /PRIVATE_MARKER/);
});
test('corrected names satisfy the linter without claiming value/connectivity verification', () => {
  const names = Object.keys(dummyEnvironment({ corrected: true }));
  const result = inspectNames('backend', names);
  assert.equal(result.findings, 0); assert.match(result.scope, /NOT VERIFIED/);
});
test('REAL production runtime and clinical entry permit omitted deployment mode', () => {
  const { assertProductionRuntime } = require('../server/src/security/productionRuntimePolicy');
  const { assertClinicalEntry } = require('../server/src/security/clinicalEntryPolicy');
  assert.equal(assertProductionRuntime({ NODE_ENV: 'production' }).profile, 'production-clinical');
  assert.doesNotThrow(() => assertClinicalEntry({ NODE_ENV: 'production' }));
});
test('REAL production startup with exactly screenshot names fails before app import', async () => {
  const env = dummyEnvironment(); assert.deepEqual(Object.keys(env).sort(), [...backendNames].sort());
  const result = await probe(env);
  assert.equal(result.error, 'PRODUCTION_RUNTIME_QA_MATERIAL_FORBIDDEN');
  assert.equal(result.appLoads, 0); assert.equal(result.inertConnects, 0); assert.equal(result.redisInitializations, 0);
});
test('removing only forbidden names exposes REAL missing ENCRYPTION_KEYS gate, still without connection', async () => {
  const result = await probe(dummyEnvironment({ removeForbiddenOnly: true }));
  assert.equal(result.error, 'OPERATOR_KEY_ERROR: ENCRYPTION_KEYS environment variable is missing.');
  assert.equal(result.inertConnects, 0); assert.equal(result.redisInitializations, 0);
});
test('corrected dummy config plus empty inert DB fails REAL storage guard, disconnects before Redis/listeners', async () => {
  const result = await probe(dummyEnvironment({ corrected: true }));
  assert.deepEqual(result.codes, ['PRODUCTION_STORAGE_PREREQUISITES_NOT_VERIFIED']);
  assert.equal(result.error, 'PROBE_PROCESS_EXIT');
  assert.ok(result.events.some(event => event.includes('Production identity or storage prerequisites were not verified')));
  assert.equal(result.inertConnects, 1); assert.equal(result.disconnects, 1); assert.equal(result.redisInitializations, 0);
});
test('with complete inert storage, REAL next boot gate is active super-admin after inert Redis init', async () => {
  const result = await probe(dummyEnvironment({ corrected: true }), { completeStorage: true });
  assert.equal(result.error, 'Approved operator account provisioning is required before live startup');
  assert.equal(result.redisInitializations, 1); assert.ok(result.events.includes('shutdown'));
});
