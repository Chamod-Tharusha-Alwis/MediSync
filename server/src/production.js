'use strict';
const { assertProductionRuntime } = require('./security/productionRuntimePolicy');

function startProduction(environment = process.env, loadApplication = () => require('./app'), observeStep = () => {}) {
  observeStep('runtime_admission');
  assertProductionRuntime(environment);
  // Before app/model imports: schemas must not provision collections/indexes.
  observeStep('model_ddl');
  require('./security/productionAtlasPolicy').disableAutomaticModelDdl(require('mongoose'));
  // The existing app still enforces its live-start, Vault, DB and security gates.
  // Passing this pure profile check grants no clinical activation authority.
  observeStep('application_import');
  const appModule = loadApplication();
  observeStep('application_startup');
  if (!appModule || typeof appModule.startServer !== 'function') throw new Error('APPLICATION_START_FUNCTION_REQUIRED');
  return appModule.startServer();
}

function runProductionEntry({ environment = process.env, loadApplication, starter = startProduction, logger = console.error, exit = code => process.exit(code) } = {}) {
  let step = 'runtime_admission';
  return Promise.resolve().then(() => starter(environment, loadApplication, value => { step = value; })).catch(error => {
    // Keep admission/import ordering intact for callers of startProduction.
    // Diagnostic code is needed only after a failed entry attempt.
    try { require('./security/safeFailureDiagnostic').reportFailure(error, step, logger); }
    finally { exit(1); }
  });
}

if (require.main === module) {
  // Enter the promise before admission so synchronous import/admission failures
  // and asynchronous startup failures take the same nonzero-exit path.
  runProductionEntry();
}

module.exports = { startProduction, runProductionEntry };

