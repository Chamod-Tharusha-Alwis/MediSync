'use strict';
const path = require('path');
const root = path.resolve(__dirname, '..'), mode = process.argv[2], out = process.env.MEDISYNC_COMBINED_EVIDENCE;
if (!['backend', 'client', 'email-pdf'].includes(mode) || mode !== process.env.MEDISYNC_COMBINED_MODE || !out || !path.resolve(out).startsWith(path.join(root, 'scratch') + path.sep)) throw Error('INVALID_OFFLINE_CHILD_CONTRACT');
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
jest.runCLI({ config: JSON.stringify(config), runInBand: true, watch: false, watchman: false, cache: false, json: true, outputFile: path.join(out, mode + '-results.json') }, [config.rootDir])
  .then(({ results }) => { process.exitCode = results.success ? 0 : 1; })
  .catch(error => { console.error(error.stack); process.exitCode = 1; });
