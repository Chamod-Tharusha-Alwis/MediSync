'use strict';

// Offline-only companion diagnostic. No driver, dotenv, filesystem or network
// import: importing or running this file cannot initiate an Atlas connection.
const { ConnectionString } = require('mongodb-connection-string-url');
const { selectOperatorDatabase } = require('./operatorDatabaseMode');
const { verifyProductionIdentity } = require('../src/security/productionAtlasPolicy');

const REQUESTED_USER = 'chamodtharusha13_db_user';
const TARGET = Object.freeze({ host: 'medisync.p7hjket.mongodb.net', database: 'medisync_prod', authSource: 'admin', authMechanism: 'SCRAM-SHA-256' });
const SAFE_CODES = new Set([
  'OPERATOR_DATABASE_MODE_INVALID', 'OPERATOR_DATABASE_MIXED_ENVIRONMENT', 'OPERATOR_DATABASE_URI_REQUIRED',
  'PRODUCTION_RUNTIME_CONFIGURATION_INVALID', 'PRODUCTION_RUNTIME_QA_MATERIAL_FORBIDDEN', 'PRODUCTION_RUNTIME_MODE_REQUIRED',
  'PRODUCTION_ATLAS_ACCESS_APPROVAL_REQUIRED', 'BOTH_COMPROMISED_ATLAS_IDENTITIES_MUST_BE_ROTATED', 'PRODUCTION_ATLAS_QA_MATERIAL_FORBIDDEN',
  'PRODUCTION_ATLAS_URI_INVALID', 'PRODUCTION_EXISTING_CLUSTER_AND_DATABASE_REQUIRED', 'PRODUCTION_ATLAS_URI_OPTION_FORBIDDEN', 'PRODUCTION_ATLAS_TLS_REQUIRED',
  'REQUESTED_ATLAS_USERNAME_REQUIRED', 'PRODUCTION_DATABASE_IDENTITY_MISMATCH', 'PRODUCTION_AUTHENTICATED_ROLE_UNVERIFIED', 'PRODUCTION_AUTHENTICATED_ROLE_DENIED',
  'PRODUCTION_EXPLICIT_SCRAM_CONFIGURATION_REQUIRED',
  'REQUESTED_ATLAS_AUTHENTICATION_IDENTITY_REQUIRED', 'PRODUCTION_STORAGE_PREREQUISITES_NOT_VERIFIED'
]);
const ownValue = (object, name) => {
  if (!object || (typeof object !== 'object' && typeof object !== 'function')) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(object, name);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
};

function inspectProductionConnection(environment) {
  try {
    const target = selectOperatorDatabase(environment, false);
    const parsed = new ConnectionString(target.uri);
    if (decodeURIComponent(parsed.username) !== REQUESTED_USER) throw new Error('REQUESTED_ATLAS_USERNAME_REQUIRED');
    // Operator tools force these driver options, but production boot uses the
    // URI. Do not call a URI ready for that boot if it relies on auth defaults.
    const options = new Map([...parsed.searchParams].map(([key, value]) => [key.toLowerCase(), value]));
    if (options.get('authsource') !== TARGET.authSource || options.get('authmechanism') !== TARGET.authMechanism) {
      throw new Error('PRODUCTION_EXPLICIT_SCRAM_CONFIGURATION_REQUIRED');
    }
    const currentTarget = Object.freeze({ ...TARGET, host: parsed.hosts?.[0] || TARGET.host });
    return Object.freeze({
      status: 'OFFLINE_CONFIGURATION_PASS', code: 'PRODUCTION_TARGET_CONFIGURATION_VERIFIED_OFFLINE', target: currentTarget,
      requestedUsernameMatches: true, tlsEnforcedByDriver: target.connectionOptions.tls === true,
      authSourceEnforcedByDriver: target.connectionOptions.authSource === TARGET.authSource,
      authMechanismEnforcedByDriver: target.connectionOptions.authMechanism === TARGET.authMechanism,
      credentialRotation: 'OPERATOR_ATTESTATION_ONLY', authentication: 'NOT_VERIFIED', roles: 'NOT_VERIFIED',
      storage: 'NOT_VERIFIED', topology: 'NOT_VERIFIED', networkOperations: 0
    });
  } catch (error) {
    const message = ownValue(error, 'message');
    return Object.freeze({ status: 'BLOCKED', code: SAFE_CODES.has(message) ? message : 'OFFLINE_CONFIGURATION_REJECTED', networkOperations: 0 });
  }
}

// Verify a supplied/inert connectionStatus proof, not a live db handle. This
// augments (never replaces) the real production policy's exact-role check.
async function verifyRequestedAuthenticationProof(databaseName, proof) {
  const result = await verifyProductionIdentity({ databaseName, command: async () => proof });
  const user = proof.authInfo.authenticatedUsers[0];
  if (user.user !== REQUESTED_USER || user.db !== TARGET.authSource) throw new Error('REQUESTED_ATLAS_AUTHENTICATION_IDENTITY_REQUIRED');
  return Object.freeze({ ...result, requestedUsernameMatches: true, authenticationDatabaseMatches: true });
}

function classifyAtlasFailure(error) {
  // Never return raw driver text or properties. Inspect a bounded cause chain,
  // using data descriptors so diagnostic classification cannot invoke getters.
  let current = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const code = ownValue(current, 'code');
    const codeName = ownValue(current, 'codeName');
    const name = ownValue(current, 'name');
    const message = ownValue(current, 'message');
    if (SAFE_CODES.has(message)) return Object.freeze({ category: 'ADMISSION', code: message });
    if (code === 18 || codeName === 'AuthenticationFailed') return Object.freeze({ category: 'AUTHENTICATION', code: 'ATLAS_AUTHENTICATION_FAILED' });
    if (code === 13 || codeName === 'Unauthorized') return Object.freeze({ category: 'AUTHORIZATION', code: 'ATLAS_PERMISSION_DENIED' });
    if (['ENOTFOUND', 'EAI_AGAIN', 'ENODATA', 'ESERVFAIL'].includes(code)) return Object.freeze({ category: 'DNS', code: 'ATLAS_DNS_UNAVAILABLE' });
    if (['CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION'].includes(code)) return Object.freeze({ category: 'TLS', code: 'ATLAS_TLS_VALIDATION_FAILED' });
    if (['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET'].includes(code) || ['MongoNetworkTimeoutError', 'MongoServerSelectionError', 'MongoNetworkError'].includes(name)) {
      // A nested specific cause is more useful than the outer network wrapper.
      const cause = ownValue(current, 'cause');
      if (cause && depth < 4) { current = cause; continue; }
      return Object.freeze({ category: 'NETWORK', code: 'ATLAS_CONNECTION_UNAVAILABLE' });
    }
    current = ownValue(current, 'cause');
  }
  return Object.freeze({ category: 'UNKNOWN', code: 'ATLAS_FAILURE_UNCLASSIFIED' });
}

if (require.main === module) {
  if (process.argv.length !== 2) {
    console.error(JSON.stringify({ status: 'BLOCKED', code: 'OFFLINE_DIAGNOSTIC_ACCEPTS_NO_FLAGS', networkOperations: 0 }));
    process.exitCode = 2;
  } else {
    const result = inspectProductionConnection(process.env);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === 'OFFLINE_CONFIGURATION_PASS' ? 0 : 1;
  }
}

module.exports = { inspectProductionConnection, verifyRequestedAuthenticationProof, classifyAtlasFailure, REQUESTED_USER, TARGET };
