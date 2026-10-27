'use strict';
module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testTimeout: 10000,
  setupFiles: ['<rootDir>/tests/helpers/agentBOfflineBoundary.cjs'],
  testMatch: [
    'gate3StorageRepair', 'gate3BootstrapRepair', 'gate3DatabaseMode', 'provisionProductionStorage',
    'bootstrapSyntheticAccounts', 'preflightProduction', 'productionStorageAdmission',
    'productionAtlasAdmission', 'operatorKeyPolicy', 'clinicalProductionEntry', 'productionAccountAndProfile'
  ].map(name => `<rootDir>/tests/${name}.test.js`)
};
