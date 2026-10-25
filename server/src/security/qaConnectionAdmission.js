'use strict';
const { ConnectionString } = require('mongodb-connection-string-url');

const APPROVED_QA_HOST = 'qa-project-medisync.gwprp27.mongodb.net';
const APPROVED_QA_DB = 'medisync_automated_test';

function assertQaConnectionConfiguration(environment) {
  if (Object.getOwnPropertyNames(environment).some(name => /^(MONGO_URI|MONGODB_URI|DATABASE_URL)$/i.test(name))) {
    throw new Error('PRODUCTION_CREDENTIALS_PRESENT_IN_QA');
  }
  if (environment.MEDISYNC_QA_BOOTSTRAPPED !== 'true') {
    throw new Error('QA_BOOTSTRAP_REQUIRED');
  }
  if (environment.MEDISYNC_QA_CREDENTIALS_ROTATED !== 'true') {
    throw new Error('OPERATOR_CREDENTIAL_ROTATION_ATTESTATION_REQUIRED');
  }
  let uri;
  try {
    uri = new ConnectionString(environment.MONGO_URI_TEST);
  } catch (_) {
    throw new Error('QA_URI_INVALID');
  }

  const host = uri.hosts?.[0]?.toLowerCase();
  const dbName = decodeURIComponent(uri.pathname || '').replace(/^\//, '');

  if (host && host.includes('p7hjket')) {
    throw new Error('QA_EXISTING_CLUSTER_AND_DATABASE_REQUIRED');
  }
  if (dbName === 'test' || dbName === 'medisync_prod') {
    throw new Error('QA_EXISTING_CLUSTER_AND_DATABASE_REQUIRED');
  }
  if (!uri.isSRV || uri.hosts.length !== 1 || !host || host !== APPROVED_QA_HOST || dbName !== APPROVED_QA_DB || !uri.username || !uri.password) {
    throw new Error('QA_EXISTING_CLUSTER_AND_DATABASE_REQUIRED');
  }

  const seen = new Set();
  for (const [rawName, rawValue] of uri.searchParams) {
    const name = rawName.toLowerCase(), value = rawValue.toLowerCase();
    if (seen.has(name)) throw new Error('QA_DUPLICATE_URI_OPTION_FORBIDDEN');
    seen.add(name);
    if ((['tls', 'ssl', 'sslvalidate'].includes(name) && value !== 'true') ||
        (['tlsinsecure', 'tlsallowinvalidcertificates', 'tlsallowinvalidhostnames'].includes(name) && value !== 'false') ||
        name === 'dbname') {
      throw new Error('QA_TLS_OR_DATABASE_OVERRIDE_FORBIDDEN');
    }
  }

  return {
    dbName: APPROVED_QA_DB,
    cluster: host,
    credentialRotationAttested: 'NOT_VERIFIED'
  };
}

module.exports = { assertQaConnectionConfiguration, APPROVED_QA_HOST, APPROVED_QA_DB };

