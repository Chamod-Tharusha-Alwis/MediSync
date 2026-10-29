'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const diagnostics = require('../src/security/safeFailureDiagnostic');
const { apiErrorHandler } = require('../src/security/apiErrorHandler');
const privateText = 'mongodb+srv://synthetic-user:PRIVATE_PASSWORD@offline.invalid/private?token=PRIVATE_TOKEN patient@example.invalid 900000001V';
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
function production({ ddl = () => {}, main = false, loadApplication = () => ({ startServer: () => Promise.resolve() }), environment = { NODE_ENV: 'production' } } = {}) {
  const logger = jest.fn(), exit = jest.fn(), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/production.js'), 'utf8'), {
    module, process: { env: environment, exit }, console: { error: logger },
    require: Object.assign(name => {
      if (name === './security/productionRuntimePolicy') return require('../src/security/productionRuntimePolicy');
      if (name === './security/safeFailureDiagnostic') return diagnostics;
      if (name === './security/productionAtlasPolicy') return { disableAutomaticModelDdl: ddl };
      if (name === 'mongoose') return {};
      if (name === './app') return loadApplication();
      throw Error('IMPORT_DENIED');
    }, { main: main ? module : null })
  });
  return { ...module.exports, logger, exit };
}
const diagnosticOf = logger => JSON.parse(logger.mock.calls[0][1]);
afterEach(() => jest.restoreAllMocks());

test('unknown exception fields, arbitrary names, stacks and input steps are redacted', () => {
  const logger = jest.fn();
  diagnostics.reportFailure({ name: privateText, message: privateText, stack: privateText, request: privateText }, privateText, logger);
  expect(logger).toHaveBeenCalledWith('[Failure]', JSON.stringify({ step: 'unknown', errorName: 'Error', message: 'Failure details redacted.' }));
  expect(JSON.stringify(logger.mock.calls)).not.toContain('PRIVATE');
});
test.each([
  ['PRODUCTION_RUNTIME_MODE_REQUIRED', 'Production runtime mode is required.'],
  ['PRODUCTION_AUTHENTICATED_ROLE_DENIED', 'Production database authenticated role is denied.'],
  ['secretOrPrivateKey must have a value', 'JWT signing key is unavailable.'],
  [`Missing encryption key for version ${privateText}`, 'Encryption key for stored record version is unavailable.']
])('known failure is classified without forwarding supplied text %#', (message, expected) => {
  expect(diagnostics.safeFailureDiagnostic(Error(message), 'token_access')).toEqual({ step: 'token_access', errorName: 'Error', message: expected });
});
test('known error name does not authorize arbitrary message or a suffix on known message', () => {
  expect(diagnostics.safeFailureDiagnostic({ name: 'JsonWebTokenError', message: `secretOrPrivateKey must have a value ${privateText}` }, 'token_refresh')).toEqual({ step: 'token_refresh', errorName: 'JsonWebTokenError', message: 'Failure details redacted.' });
});
test('diagnostic tolerates throwing exception accessors and nonstring message', () => {
  const hostile = { get name() { throw Error(privateText); } };
  expect(diagnostics.safeFailureDiagnostic(hostile, 'request_handler').message).toBe('Failure details redacted.');
  expect(diagnostics.safeFailureDiagnostic({ message: { toString() { throw Error(privateText); } } }, 'request_handler').message).toBe('Failure details redacted.');
});
test('API unexpected error logs safe classification and preserves response shape/status', () => {
  const logger = jest.spyOn(console, 'error').mockImplementation(() => {}), res = response();
  apiErrorHandler({ name: 'TypeError', message: privateText, stack: privateText, status: 409 }, { body: privateText }, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(409);
  expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  expect(diagnosticOf(logger)).toEqual({ step: 'request_handler', errorName: 'TypeError', message: 'Failure details redacted.' });
  expect(JSON.stringify(logger.mock.calls)).not.toContain('PRIVATE');
});
test.each([
  [{ type: 'entity.too.large' }, 413, { error: 'Payload too large', message: 'Request entity too large' }],
  [{ name: 'CastError' }, 400, { error: 'Invalid data format' }],
  [{ type: 'entity.parse.failed' }, 400, { error: 'Invalid JSON body' }],
  [{ status: '500' }, 500, { error: 'Internal server error' }]
])('API existing error contract remains intact %#', (error, status, body) => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const res = response(); apiErrorHandler(error, {}, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(status); expect(res.json).toHaveBeenCalledWith(body);
});
test('API delegates an already sent response unchanged', () => {
  const res = { ...response(), headersSent: true }, next = jest.fn(), error = Error(privateText);
  apiErrorHandler(error, {}, res, next);
  expect(next).toHaveBeenCalledWith(error); expect(res.status).not.toHaveBeenCalled();
});
test.each(['runtime_admission', 'model_ddl', 'application_import', 'application_startup'])('production entry labels actual failing stage %s and exits once', async stage => {
  const loadApplication = jest.fn(() => {
    if (stage === 'application_import') throw Error(privateText);
    return { startServer: jest.fn(() => Promise.reject(Error(privateText))) };
  });
  const runtime = production({ ddl: () => { if (stage === 'model_ddl') throw Error(privateText); } });
  await runtime.runProductionEntry({ environment: stage === 'runtime_admission' ? { NODE_ENV: 'test' } : { NODE_ENV: 'production' }, loadApplication, logger: runtime.logger, exit: runtime.exit });
  expect(diagnosticOf(runtime.logger).step).toBe(stage);
  expect(runtime.exit).toHaveBeenCalledTimes(1); expect(runtime.exit).toHaveBeenCalledWith(1);
  expect(JSON.stringify(runtime.logger.mock.calls)).not.toContain('PRIVATE');
  if (stage === 'runtime_admission' || stage === 'model_ddl') expect(loadApplication).not.toHaveBeenCalled();
});
test('production missing start function uses application startup classification', async () => {
  const runtime = production();
  await runtime.runProductionEntry({ environment: { NODE_ENV: 'production' }, loadApplication: () => ({}), logger: runtime.logger, exit: runtime.exit });
  expect(diagnosticOf(runtime.logger)).toEqual({ step: 'application_startup', errorName: 'Error', message: 'Application startup function is unavailable.' });
});
test('successful entry returns startup result without logging or exiting', async () => {
  const runtime = production();
  expect(await runtime.runProductionEntry({ environment: { NODE_ENV: 'production' }, loadApplication: () => ({ startServer: () => 'inert-ready' }), logger: runtime.logger, exit: runtime.exit })).toBe('inert-ready');
  expect(runtime.logger).not.toHaveBeenCalled(); expect(runtime.exit).not.toHaveBeenCalled();
});
test('production entry still exits when the diagnostic logger fails', async () => {
  const runtime = production();
  await expect(runtime.runProductionEntry({ environment: { NODE_ENV: 'test' }, logger: () => { throw Error('INERT_LOG_FAILURE'); }, exit: runtime.exit })).rejects.toThrow('INERT_LOG_FAILURE');
  expect(runtime.exit).toHaveBeenCalledTimes(1); expect(runtime.exit).toHaveBeenCalledWith(1);
});
test('actual production main branch catches import error through fixed diagnostic', async () => {
  const runtime = production({ main: true, loadApplication: () => { throw Error(privateText); } });
  await new Promise(resolve => setImmediate(resolve));
  expect(diagnosticOf(runtime.logger).step).toBe('application_import'); expect(runtime.exit).toHaveBeenCalledWith(1);
});
test('actual direct app main catch never reads or prints raw stack', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
  const logger = jest.fn(), exit = jest.fn(), module = { exports: {} };
  const error = { name: 'Error', message: privateText, get stack() { throw Error('RAW_STACK_READ'); } };
  vm.runInNewContext(source.slice(source.lastIndexOf('if (require.main === module)')), {
    module, startServer: () => Promise.reject(error), process: { exit },
    require: Object.assign(name => { if (name === './security/safeFailureDiagnostic') return { reportFailure: (failure, step) => diagnostics.reportFailure(failure, step, logger) }; throw Error('IMPORT_DENIED'); }, { main: module })
  });
  await new Promise(resolve => setImmediate(resolve));
  expect(diagnosticOf(logger).step).toBe('application_startup'); expect(exit).toHaveBeenCalledWith(1);
  expect(JSON.stringify(logger.mock.calls)).not.toContain('PRIVATE');
});
