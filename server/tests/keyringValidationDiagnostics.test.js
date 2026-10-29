'use strict';
const crypto = require('crypto'), fs = require('fs'), path = require('path'), vm = require('vm');
const mongoose = require('mongoose');
const { safeFailureDiagnostic, reportFailure } = require('../src/security/safeFailureDiagnostic');
const { formatKeyringDiagnostic, reportKeyring } = require('../src/security/keyringDiagnostic');
const syntheticKey = 'synthetic-key-for-metadata-tests-only';
const fingerprint = key => crypto.createHash('sha256').update(key).digest('hex').slice(0, 8);

test('real Mongoose ValidationError emits only its allowlisted field paths', () => {
  const error = new mongoose.Error.ValidationError();
  for (const field of ['licenseNo', 'fullName']) error.addError(field, new mongoose.Error.ValidatorError({ path: field, value: 'PRIVATE_REJECTED_VALUE', message: 'PRIVATE_MESSAGE' }));
  const logger = jest.fn();
  reportFailure(error, 'account_last_login', logger);
  const output = JSON.parse(logger.mock.calls[0][1]);
  expect(output.validationPaths).toEqual(['fullName', 'licenseNo']);
  expect(output.errorName).toBe('ValidationError');
  expect(Object.hasOwn(output, 'message')).toBe(false);
  expect(output.step).toBe('account_last_login');
  expect(JSON.stringify(logger.mock.calls)).not.toContain('PRIVATE');
});

test('validation logging never reads individual errors, values or the message getter', () => {
  const errors = {};
  Object.defineProperty(errors, 'fullName', { enumerable: true, get() { throw Error('PRIVATE_VALUE_ACCESS'); } });
  const error = { name: 'ValidationError', errors, get message() { throw Error('PRIVATE_MESSAGE_ACCESS'); } };
  expect(safeFailureDiagnostic(error, 'account_last_login').validationPaths).toEqual(['fullName']);
});

test('unreviewed paths and attacker-controlled map keys are omitted', () => {
  const errors = Object.fromEntries(['email', 'PRIVATE_IDENTIFIER', 'patient.PRIVATE_IDENTIFIER', 'licenseNo.PRIVATE_IDENTIFIER'].map(field => [field, {}]));
  const output = safeFailureDiagnostic({ name: 'ValidationError', errors }, 'account_last_login');
  expect(output.validationPaths).toEqual(['email']);
  expect(JSON.stringify(output)).not.toContain('PRIVATE');
});

test('array positions are canonicalized to public schema path names', () => {
  const output = safeFailureDiagnostic({ name: 'ValidationError', errors: { 'allergies.0': {}, 'orgLogins.2.hospitalId': {}, 'orgLogins.7.hospitalId': {} } }, 'account_last_login');
  expect(output.validationPaths).toEqual(['allergies', 'orgLogins.hospitalId']);
});

test('hostile validation errors getter fails closed without exception details', () => {
  const output = safeFailureDiagnostic({ name: 'ValidationError', get errors() { throw Error('PRIVATE_ERROR'); } }, 'account_last_login');
  expect(output.validationPaths).toEqual([]);
  expect(JSON.stringify(output)).not.toContain('PRIVATE');
});

test('non-validation error contract remains unchanged without reading errors', () => {
  const output = safeFailureDiagnostic({ name: 'TypeError', get errors() { throw Error('UNEXPECTED_READ'); } }, 'request_handler');
  expect(output).toEqual({ step: 'request_handler', errorName: 'TypeError', message: 'Failure details redacted.' });
});

test('keyring log sorts version numbers and emits exactly eight digest characters per raw key', () => {
  const keys = { 10: syntheticKey + '-second', 2: syntheticKey };
  const logger = jest.fn();
  const line = reportKeyring(keys, '10', logger);
  expect(line).toBe(`[KEYRING] versions=[2,10] active=10 fp={2:${fingerprint(keys[2])},10:${fingerprint(keys[10])}}`);
  expect(logger).toHaveBeenCalledTimes(1);
  expect(logger).toHaveBeenCalledWith(line);
  expect(line).not.toContain(syntheticKey);
  expect(line.match(/[a-f0-9]{8}/g)).toHaveLength(2);
});

test('fingerprint hashes raw UTF-8 spelling without trimming or decoding', () => {
  const raw = Buffer.alloc(32, 19).toString('base64');
  const line = formatKeyringDiagnostic({ 1: raw }, 1);
  expect(line).toContain(`fp={1:${fingerprint(raw)}}`);
  expect(line).not.toContain(crypto.createHash('sha256').update(Buffer.from(raw, 'base64')).digest('hex').slice(0,8));
  expect(formatKeyringDiagnostic({ 1: ' ' + syntheticKey }, 1)).toContain(fingerprint(' ' + syntheticKey));
});

test('keyring diagnostics do not mutate key material, order or active configuration', () => {
  const keys = Object.freeze({ 2: syntheticKey + '-second', 1: syntheticKey });
  const before = JSON.stringify(keys);
  formatKeyringDiagnostic(keys, '2');
  expect(JSON.stringify(keys)).toBe(before);
});

test.each([
  [null, 1], [[], 1], [{}, 1], [{ invalidVersion: syntheticKey }, 1],
  [{ 1: '' }, 1], [{ 1: Buffer.alloc(32) }, 1], [{ 1: syntheticKey }, 2],
  [{ 1: syntheticKey }, { toString() { throw Error('PRIVATE_ACTIVE'); } }],
])('invalid logging metadata has a fixed safe fallback %#', (keys, active) => {
  expect(formatKeyringDiagnostic(keys, active)).toBe('[KEYRING] metadata unavailable');
});

test('key getters and oversized rings are rejected without reading secrets', () => {
  const keys = {};
  Object.defineProperty(keys, '1', { enumerable: true, get() { throw Error('PRIVATE_KEY_ACCESS'); } });
  expect(formatKeyringDiagnostic(keys, 1)).toBe('[KEYRING] metadata unavailable');
  expect(formatKeyringDiagnostic(Object.fromEntries(Array.from({length:33}, (_,i)=>[String(i+1),syntheticKey])), 1)).toBe('[KEYRING] metadata unavailable');
});

test('logger failure cannot alter startup or trigger repeated output', () => {
  const logger = jest.fn(() => { throw Error('PRIVATE_LOGGER_FAILURE'); });
  expect(() => reportKeyring({ 1: syntheticKey }, 1, logger)).not.toThrow();
  expect(logger).toHaveBeenCalledTimes(1);
});

test.each([false, true])('actual app boot logs once only after successful key loading (failure=%s)', async fail => {
  const source = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
  const body = source.slice(source.indexOf('async function startServer()'), source.lastIndexOf('if (require.main === module)'));
  const events = [], globalState = {}, logger = jest.fn(() => events.push('keyring')), module = { exports: {} };
  vm.runInNewContext(body + '\nmodule.exports = startServer;', {
    module, global: globalState, process: { env: { NODE_ENV: 'production' } },
    console: { log: logger },
    initializeVault: async () => { events.push('keyload'); if (fail) throw Error('STOP_KEY_LOAD'); globalState.ENCRYPTION_KEYS = { 1: syntheticKey }; globalState.ACTIVE_KEY_VERSION = '1'; },
    require(name) {
      if (name === './security/clinicalEntryPolicy') return require('../src/security/clinicalEntryPolicy');
      if (name === './config/dbGuard') return { isAutomatedTestEnvironment: () => false };
      if (name === './security/clientOriginPolicy') return { clientOrigin: () => 'https://frontend.example.invalid' };
      if (name === './security/keyringDiagnostic') return { reportKeyring };
      if (name === './security/securityRuntime') return { initialize() { events.push('runtime'); throw Error('STOP_AFTER_LOG'); } };
      throw Error('UNAPPROVED_IMPORT');
    }
  });
  await expect(module.exports()).rejects.toThrow(fail ? 'STOP_KEY_LOAD' : 'STOP_AFTER_LOG');
  expect(events).toEqual(fail ? ['keyload'] : ['keyload', 'keyring', 'runtime']);
  expect(logger).toHaveBeenCalledTimes(fail ? 0 : 1);
  expect(JSON.stringify(logger.mock.calls)).not.toContain(syntheticKey);
});
