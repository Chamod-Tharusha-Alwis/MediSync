'use strict';
module.exports = {
  rootDir: __dirname, testEnvironment: 'node', testTimeout: 10000,
  setupFiles: ['<rootDir>/tests/helpers/agentBOfflineBoundary.cjs'],
  testMatch: [
    '<rootDir>/tests/agentBIdentitySnapshot.test.js',
    '<rootDir>/tests/agentBFieldQuerySafety.test.js',
    '<rootDir>/tests/agentBModelMigration.test.js',
    ...['agentBModelCompatibility', 'agentBPublicDemoIsolation', 'agentBCrypto', 'agentBAuthSocket', 'agentBProviderOutbreak', 'agentBOperations', 'agentBClinicalHandlers', 'agentBFieldPlugin', 'agentBClinicalTransactions', 'agentBIntegrationCrypto', 'agentBAtomicOtp', 'agentBCommandCommit', 'agentBOutboxRecovery', 'agentBAccountSecurity', 'agentBMigrationAndInvitations', 'agentBLabEnvelopeCommit', 'agentBEndpointAdmission', 'agentBProfileLanguage',
      'dbGuard', 'qaEncryptionBootstrap', 'stagingDbGuardAdversarial', 'clinicalAuditService', 'clinicalAuditSafety', 'dispensingTransaction', 'surveillancePolicy', 'e1ZeroMutationPreflight', 'icdReference', 'medicationSafety'].map(name => `<rootDir>/tests/${name}.test.js`)
  ]
};
