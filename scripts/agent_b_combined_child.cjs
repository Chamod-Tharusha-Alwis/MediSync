'use strict';
const path = require('path'), fs = require('fs');
const root = path.resolve(__dirname, '..'), mode = process.env.MEDISYNC_COMBINED_MODE;
const evidence = process.env.MEDISYNC_COMBINED_EVIDENCE;
const setup = path.join(root, 'scripts/agent_b_combined_test_boundary.cjs');
async function main() {
  if (mode === 'translation') return require('./audit_ui_translations.js');
  if (mode === 'pdf-proof') {
    const result = await require('./agent_b_pdf_stream_proof.cjs').runProof();
    fs.writeFileSync(path.join(evidence, 'pdf-proof-results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result)); return;
  }
  if (mode === 'build') {
    process.chdir(path.join(root, 'client'));
    const target = path.resolve(process.env.BUILD_PATH);
    const expected = path.join(evidence, 'build');
    if (target !== expected || !target.startsWith(path.join(root, 'scratch') + path.sep) || fs.existsSync(target)) throw new Error('UNSAFE_BUILD_DESTINATION');
    fs.mkdirSync(target);
    if (fs.realpathSync(target) !== target) throw new Error('BUILD_REALPATH_MISMATCH');
    if (process.env.MEDISYNC_OFFLINE_UI_PROFILE === 'university') {
      const paths=require('../client/node_modules/react-scripts/config/paths.js');
      paths.appIndexJs=path.join(root,'client/src/universityIndex.jsx');
    }
    // Keep minification enabled, but avoid child worker processes.
    const configPath = require.resolve('../client/node_modules/react-scripts/config/webpack.config.js');
    const factory = require(configPath);
    require.cache[configPath].exports = (...args) => {
      const config = factory(...args);
      for (const minimizer of config.optimization?.minimizer || []) if (minimizer?.options && 'parallel' in minimizer.options) minimizer.options.parallel = false;
      return config;
    };
    return require('../client/node_modules/react-scripts/scripts/build.js');
  }
  let config, jest;
  if (mode === 'client') {
    const client = path.join(root, 'client'); process.chdir(client);
    const create = require('../client/node_modules/react-scripts/scripts/utils/createJestConfig.js');
    config = create(rel => require.resolve(path.join(client, 'node_modules/react-scripts', rel)), client, false);
    config.setupFiles = [setup, ...config.setupFiles];
    config.testEnvironmentOptions = { ...config.testEnvironmentOptions, url: 'http://127.0.0.1:3100/' };
    jest = require('../client/node_modules/jest');
  } else if (mode === 'email-pdf') {
    config = { rootDir: path.join(root, 'server'), testEnvironment: 'node', testTimeout: 30000, setupFiles: [setup], testMatch: ['<rootDir>/tests/emailTemplatesPhase6.test.js', '<rootDir>/tests/pdfGeneratorPhase6.test.js'] };
    jest = require('../server/node_modules/jest');
  } else throw new Error('INVALID_VERIFICATION_MODE');
  config.cacheDirectory = path.join(evidence, mode + '-cache');
  const { results } = await jest.runCLI({ config: JSON.stringify(config), runInBand: true, watch: false, watchman: false, cache: false, json: true, outputFile: path.join(evidence, mode + '-results.json') }, [config.rootDir]);
  process.exitCode = results.success ? 0 : 1;
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
