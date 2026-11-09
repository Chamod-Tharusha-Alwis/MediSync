'use strict';
// Use CRA's normal production env resolution before validating public endpoints.
process.env.BABEL_ENV = 'production';
process.env.NODE_ENV = 'production';

if (!process.env.REACT_APP_COMMIT_HASH) {
  try {
    const { execSync } = require('child_process');
    process.env.REACT_APP_COMMIT_HASH = process.env.VERCEL_GIT_COMMIT_SHA || execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch (e) {
    process.env.REACT_APP_COMMIT_HASH = 'dev';
  }
}

require('react-scripts/config/env');
require('../src/config/productionClientPolicy').assertProductionClientProfile(process.env);
const path = require('path');
const { inspectClinicalBuild } = require('./clinicalBuildPolicy.cjs');
console.log(JSON.stringify(inspectClinicalBuild(path.resolve(__dirname, '..'), process.env)));
require('react-scripts/scripts/build');
