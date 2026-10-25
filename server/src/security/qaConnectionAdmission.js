'use strict';
const { ConnectionString } = require('mongodb-connection-string-url');
function assertQaConnectionConfiguration(environment) {
  if (Object.getOwnPropertyNames(environment).some(name => /^(MONGO_URI|MONGODB_URI|DATABASE_URL)$/i.test(name))) throw new Error('PRODUCTION_CREDENTIALS_PRESENT_IN_QA');
  if (environment.MEDISYNC_QA_BOOTSTRAPPED !== 'true') throw new Error('QA_BOOTSTRAP_REQUIRED');
  if (environment.MEDISYNC_QA_CREDENTIALS_ROTATED !== 'true') throw new Error('OPERATOR_CREDENTIAL_ROTATION_ATTESTATION_REQUIRED');
  let uri; try { uri = new ConnectionString(environment.MONGO_URI_TEST); } catch (_) { throw new Error('QA_URI_INVALID'); }
  const host = uri.hosts?.[0]?.toLowerCase();
  if (!uri.isSRV || uri.hosts.length !== 1 || !host || !host.endsWith('.mongodb.net') || host.includes('p7hjket') || decodeURIComponent(uri.pathname) !== '/medisync_automated_test' || !uri.username || !uri.password) throw new Error('QA_EXISTING_CLUSTER_AND_DATABASE_REQUIRED');
  const seen = new Set();
  for (const [rawName, rawValue] of uri.searchParams) {
    const name = rawName.toLowerCase(), value = rawValue.toLowerCase();
    if (seen.has(name)) throw new Error('QA_DUPLICATE_URI_OPTION_FORBIDDEN');
    seen.add(name);
    if ((['tls', 'ssl', 'sslvalidate'].includes(name) && value !== 'true') || (['tlsinsecure', 'tlsallowinvalidcertificates', 'tlsallowinvalidhostnames'].includes(name) && value !== 'false') || name === 'dbname') throw new Error('QA_TLS_OR_DATABASE_OVERRIDE_FORBIDDEN');
  }
  return { dbName: 'medisync_automated_test', cluster: host, credentialRotationAttested: true };
}
module.exports = { assertQaConnectionConfiguration };
