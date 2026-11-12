'use strict';
// Use CRA's normal production env resolution before validating public endpoints.
process.env.BABEL_ENV = 'production';
process.env.NODE_ENV = 'production';

function resolveCommitHash() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.trim().slice(0, 7);
  }
  try {
    const { execSync } = require('child_process');
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    if (hash) return hash;
  } catch (_) {}
  if (process.env.REACT_APP_COMMIT_HASH && process.env.REACT_APP_COMMIT_HASH !== 'dev') {
    return process.env.REACT_APP_COMMIT_HASH.trim().slice(0, 7);
  }
  return 'dev';
}
process.env.REACT_APP_COMMIT_HASH = resolveCommitHash();

require('react-scripts/config/env');
require('../src/config/productionClientPolicy').assertProductionClientProfile(process.env);
const path = require('path');
const { inspectClinicalBuild } = require('./clinicalBuildPolicy.cjs');
console.log(JSON.stringify(inspectClinicalBuild(path.resolve(__dirname, '..'), process.env)));
require('react-scripts/scripts/build');
