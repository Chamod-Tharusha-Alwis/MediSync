'use strict';
const { assertProductionRuntime } = require('../src/security/productionRuntimePolicy');
const { assertProductionAtlasConfiguration, verifyProductionIdentity } = require('../src/security/productionAtlasPolicy');
const { assertQaConnectionConfiguration, APPROVED_QA_DB } = require('../src/security/qaConnectionAdmission');
const { ConnectionString } = require('mongodb-connection-string-url');

function selectOperatorDatabase(environment, isQa = false) {
  if (typeof isQa !== 'boolean') throw new Error('OPERATOR_DATABASE_MODE_INVALID');
  const expected = isQa ? 'MONGO_URI_TEST' : 'MONGO_URI';
  // Reject mixed names before reading any credential, including empty aliases.
  for (const name of Object.getOwnPropertyNames(environment)) {
    if (['MONGO_URI', 'MONGO_URI_TEST', 'MONGODB_URI', 'MONGODB_URI_TEST', 'DATABASE_URL', 'MONGO_URI_STAGING'].includes(name.toUpperCase()) && name !== expected) throw new Error('OPERATOR_DATABASE_MIXED_ENVIRONMENT');
  }
  const descriptor = Object.getOwnPropertyDescriptor(environment, expected);
  if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string' || !descriptor.value.trim()) throw new Error('OPERATOR_DATABASE_URI_REQUIRED');
  const rawUri = descriptor.value;
  let database;
  if (isQa) {
    if (environment.NODE_ENV !== 'test' || ['MEDISYNC_LIVE_START_APPROVED', 'MEDISYNC_ATLAS_ROTATION_CONFIRMED'].some(name => Object.hasOwn(environment, name))) throw new Error('OPERATOR_QA_MODE_REQUIRED');
    assertQaConnectionConfiguration(environment);
    database = APPROVED_QA_DB;
    const uri = new ConnectionString(environment[expected]);
    const allowed = new Set(['tls', 'ssl', 'sslvalidate', 'tlsinsecure', 'tlsallowinvalidcertificates', 'tlsallowinvalidhostnames', 'retrywrites', 'w', 'appname', 'authsource', 'authmechanism', 'readpreference']);
    for (const [rawName, rawValue] of uri.searchParams) {
      const name = rawName.toLowerCase(), value = rawValue.toLowerCase();
      if (!allowed.has(name) || (name === 'w' && value !== 'majority') || (name === 'readpreference' && value !== 'primary') || (name === 'authsource' && value !== 'admin') || (name === 'authmechanism' && rawValue !== 'SCRAM-SHA-256') || (name === 'retrywrites' && !['true', 'false'].includes(value))) throw new Error('OPERATOR_QA_URI_OPTION_FORBIDDEN');
    }
  } else {
    assertProductionRuntime(environment);
    database = assertProductionAtlasConfiguration(environment, rawUri).database;
  }
  return Object.freeze({
    mode: isQa ? 'qa' : 'production', database, uri: rawUri,
    connectionOptions: Object.freeze({ dbName: database, tls: true, authSource: 'admin', authMechanism: 'SCRAM-SHA-256', readPreference: 'primary', writeConcern: { w: 'majority' }, serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 })
  });
}

async function verifyOperatorIdentity(db, target) {
  if (target.mode === 'production') return verifyProductionIdentity(db);
  if (db?.databaseName !== APPROVED_QA_DB) throw new Error('OPERATOR_QA_DATABASE_IDENTITY_DENIED');
  let auth;
  try { auth = (await db.command({ connectionStatus: 1 })).authInfo; }
  catch (_) { throw new Error('OPERATOR_QA_ROLE_UNVERIFIED'); }
  if (!Array.isArray(auth?.authenticatedUsers) || auth.authenticatedUsers.length !== 1 || !Array.isArray(auth?.authenticatedUserRoles) || auth.authenticatedUserRoles.length !== 1 || auth.authenticatedUserRoles[0].role !== 'readWrite' || auth.authenticatedUserRoles[0].db !== APPROVED_QA_DB) throw new Error('OPERATOR_QA_ROLE_DENIED');
  return { dbName: APPROVED_QA_DB, authenticatedRoles: [{ role: 'readWrite', db: APPROVED_QA_DB }] };
}
module.exports = { selectOperatorDatabase, verifyOperatorIdentity };
