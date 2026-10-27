'use strict';
// Use CRA's normal production env resolution before validating public endpoints.
process.env.BABEL_ENV = 'production';
process.env.NODE_ENV = 'production';
require('react-scripts/config/env');
require('../src/config/productionClientPolicy').assertProductionClientProfile(process.env);
const path = require('path');
const { inspectClinicalBuild } = require('./clinicalBuildPolicy.cjs');
console.log(JSON.stringify(inspectClinicalBuild(path.resolve(__dirname, '..'), process.env)));
require('react-scripts/scripts/build');
