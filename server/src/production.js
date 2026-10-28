'use strict';
const { assertProductionRuntime } = require('./security/productionRuntimePolicy');

function startProduction(environment = process.env, loadApplication = () => require('./app')) {
  assertProductionRuntime(environment);
  // Before app/model imports: schemas must not provision collections/indexes.
  require('./security/productionAtlasPolicy').disableAutomaticModelDdl(require('mongoose'));
  // The existing app still enforces its live-start, Vault, DB and security gates.
  // Passing this pure profile check grants no clinical activation authority.
  const appModule = loadApplication();
  if (!appModule || typeof appModule.startServer !== 'function') throw new Error('APPLICATION_START_FUNCTION_REQUIRED');
  return appModule.startServer();
}

if (require.main === module) {
  // Enter the promise before admission so synchronous import/admission failures
  // and asynchronous startup failures take the same nonzero-exit path.
  Promise.resolve().then(() => startProduction()).catch(() => {
    console.error('[FATAL] Production server failed to start. Check admission and dependency configuration.');
    process.exit(1);
  });
}

module.exports = { startProduction };

