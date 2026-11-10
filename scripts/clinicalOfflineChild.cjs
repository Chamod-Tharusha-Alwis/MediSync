'use strict';
const path = require('path');
const { isAllowedTempChild } = require('./run_offline_tests.js');
const root = path.resolve(__dirname, '..'), mode = process.argv[2], out = process.env.MEDISYNC_COMBINED_EVIDENCE;
if (!['backend', 'client', 'email-pdf'].includes(mode) || mode !== process.env.MEDISYNC_COMBINED_MODE || !out || !isAllowedTempChild(out)) throw Error('INVALID_OFFLINE_CHILD_CONTRACT');
require('./agent_b_combined_boundary.cjs');
let config, jest;
if (mode === 'backend') {
  config = require('../server/clinical.offline.jest.cjs'); jest = require('../server/node_modules/jest');
  if (process.env.MEDISYNC_OFFLINE_CI === 'true') config = {...config,testPathIgnorePatterns:[...(config.testPathIgnorePatterns||[]),'closureQaPreservationBaseline.local.test.js']};
} else if (mode === 'client') {
  const client = path.join(root, 'client'); process.chdir(client);
  const create = require('../client/node_modules/react-scripts/scripts/utils/createJestConfig.js');
  config = create(rel => require.resolve(path.join(client, 'node_modules/react-scripts', rel)), client, false);
  config.setupFiles = [path.join(root, 'scripts/agent_b_combined_test_boundary.cjs'), ...config.setupFiles];
  config.testPathIgnorePatterns = [...(config.testPathIgnorePatterns || []), 'university-demo.test.jsx'];
  config.testEnvironmentOptions = { ...config.testEnvironmentOptions, url: 'http://127.0.0.1:3100/' };
  jest = require('../client/node_modules/jest');
} else {
  config = { rootDir: path.join(root, 'server'), testEnvironment: 'node', testTimeout: 30000, setupFiles: [path.join(root, 'scripts/agent_b_combined_test_boundary.cjs')], testMatch: ['<rootDir>/tests/emailTemplatesPhase6.test.js', '<rootDir>/tests/pdfGeneratorPhase6.test.js'] };
  jest = require('../server/node_modules/jest');
}
config.cacheDirectory = path.join(out, mode + '-cache');

function mergeResults(r1, r2) {
  if (!r1) return r2;
  return {
    numFailedTestSuites: r1.numFailedTestSuites + r2.numFailedTestSuites,
    numFailedTests: r1.numFailedTests + r2.numFailedTests,
    numPassedTestSuites: r1.numPassedTestSuites + r2.numPassedTestSuites,
    numPassedTests: r1.numPassedTests + r2.numPassedTests,
    numPendingTestSuites: r1.numPendingTestSuites + r2.numPendingTestSuites,
    numPendingTests: r1.numPendingTests + r2.numPendingTests,
    numRuntimeErrorTestSuites: (r1.numRuntimeErrorTestSuites || 0) + (r2.numRuntimeErrorTestSuites || 0),
    numTodoTests: (r1.numTodoTests || 0) + (r2.numTodoTests || 0),
    numTotalTestSuites: r1.numTotalTestSuites + r2.numTotalTestSuites,
    numTotalTests: r1.numTotalTests + r2.numTotalTests,
    openHandles: [...(r1.openHandles || []), ...(r2.openHandles || [])],
    snapshot: r1.snapshot || r2.snapshot,
    startTime: Math.min(r1.startTime || Date.now(), r2.startTime || Date.now()),
    success: Boolean(r1.success && r2.success && (r1.numFailedTestSuites + r2.numFailedTestSuites === 0)),
    testResults: [...(r1.testResults || []), ...(r2.testResults || [])],
    wasInterrupted: Boolean(r1.wasInterrupted || r2.wasInterrupted),
  };
}

async function runJest() {
  const outputFile = path.join(out, mode + '-results.json');
  if (mode === 'backend' && Array.isArray(config.testMatch) && config.testMatch.length > 25) {
    const allSuites = config.testMatch;
    const batchSize = 25;
    let aggregated = null;
    for (let i = 0; i < allSuites.length; i += batchSize) {
      const chunk = allSuites.slice(i, i + batchSize);
      const batchConfig = { ...config, testMatch: chunk };
      const { results } = await jest.runCLI(
        { config: JSON.stringify(batchConfig), runInBand: true, watch: false, watchman: false, cache: false, json: true, logHeapUsage: true },
        [config.rootDir]
      );
      aggregated = mergeResults(aggregated, results);
      if (typeof global.gc === 'function') {
        try { global.gc(); } catch (_) {}
      }
    }
    const fs = require('fs');
    fs.writeFileSync(outputFile, JSON.stringify(aggregated, null, 2) + '\n');
    process.exitCode = aggregated && aggregated.success ? 0 : 1;
  } else {
    const { results } = await jest.runCLI(
      { config: JSON.stringify(config), runInBand: true, watch: false, watchman: false, cache: false, json: true, logHeapUsage: true, outputFile },
      [config.rootDir]
    );
    process.exitCode = results && results.success ? 0 : 1;
  }
}

runJest().catch(error => { console.error(error.stack); process.exitCode = 1; });
