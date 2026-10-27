'use strict';
// Pure admission policy. Importing this module cannot read a secret or connect.
const { ConnectionString } = require('mongodb-connection-string-url');
const DATABASE = 'medisync_automated_test';
const HOST = 'medisync.p7hjket.mongodb.net';
const USER = 'medisync_autotest_user';
const allowed = new Set(['tls', 'ssl', 'retrywrites', 'w', 'authsource', 'authmechanism', 'appname', 'readpreference', 'tlsinsecure', 'tlsallowinvalidcertificates', 'tlsallowinvalidhostnames']);
function validateUri(raw, environment = {}) {
  for (const name of Object.getOwnPropertyNames(environment)) {
    if (/^(MONGO_URI|MONGODB_URI|DATABASE_URL)$/i.test(name)) throw Error('PRODUCTION_URI_CONTAMINATION: ' + name.toUpperCase());
    if (/^MEDISYNC_(LIVE_START_APPROVED|PRODUCTION)/i.test(name)) throw Error('QA_PRODUCTION_FLAGS_FORBIDDEN');
  }
  if (typeof raw !== 'string' || !raw || raw !== raw.trim()) throw Error('QA_URI_INVALID: bare database names refused');
  if (raw.startsWith('mongodb://')) throw Error('QA_NON_SRV_FORBIDDEN');
  if (!raw.startsWith('mongodb+srv://')) throw Error('QA_URI_INVALID: bare database names refused');
  const authority = raw.slice(14).split('/')[0];
  const candidateHost = authority.slice(authority.lastIndexOf('@') + 1);
  if (['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0'].includes(candidateHost)) throw Error('QA_LOOPBACK_FORBIDDEN');
  if (!authority.includes('@') || authority.startsWith(':') || authority.includes(':@')) throw Error('QA_CREDENTIALS_MISSING');
  let uri;
  try { uri = new ConnectionString(raw); } catch (_) { throw Error('QA_URI_INVALID'); }
  if (uri.hash) throw Error('QA_URI_FRAGMENT_FORBIDDEN');
  const host = uri.hosts?.[0]?.toLowerCase();
  if (['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0'].includes(host)) throw Error('QA_LOOPBACK_FORBIDDEN');
  if (!uri.isSRV || uri.hosts.length !== 1 || host !== HOST) throw Error('QA_CLUSTER_HOST_INVALID');
  let db, username, password;
  try { db = decodeURIComponent(uri.pathname); username = decodeURIComponent(uri.username); password = decodeURIComponent(uri.password); } catch (_) { throw Error('QA_URI_INVALID'); }
  if (!db || db === '/') throw Error('QA_DATABASE_PATH_MISSING');
  if (db === '/test') throw Error('TARGET_DATABASE_FORBIDDEN: Operational database "test" is strictly prohibited');
  if (db !== '/' + DATABASE) throw Error('QA_DATABASE_MISMATCH');
  if (!username || !password) throw Error('QA_CREDENTIALS_MISSING');
  if (username !== USER) throw Error('QA_EXISTING_USERNAME_REQUIRED');
  const seen = new Set();
  for (const [rawName, value] of uri.searchParams) {
    const name = rawName.toLowerCase();
    if (name === 'dbname') throw Error('QA_DATABASE_REDIRECTION_FORBIDDEN');
    if (seen.has(name) || !allowed.has(name)) throw Error('QA_URI_OPTION_FORBIDDEN');
    seen.add(name);
    if ((['tls', 'ssl'].includes(name) && value !== 'true') || (['tlsinsecure', 'tlsallowinvalidcertificates', 'tlsallowinvalidhostnames'].includes(name) && value !== 'false')) throw Error('QA_INSECURE_TLS');
    if (name === 'authsource' && value !== 'admin') throw Error('QA_AUTH_SOURCE_FORBIDDEN');
    if ((name === 'w' && value !== 'majority') || (name === 'readpreference' && value !== 'primary') || (name === 'retrywrites' && !['true', 'false'].includes(value)) || (name === 'authmechanism' && value !== 'SCRAM-SHA-256')) throw Error('QA_URI_OPTION_FORBIDDEN');
  }
  // SRV implies TLS; the guarded connector also receives a URI requiring TLS.
  return Object.freeze({ valid: true, protocol: 'mongodb+srv:', host, database: DATABASE, username, tlsEnforced: true });
}
function verifyIdentity(status, dbName) {
  const info = status?.authInfo, users = info?.authenticatedUsers, roles = info?.authenticatedUserRoles;
  if (dbName !== DATABASE || !Array.isArray(users) || users.length !== 1 || users[0].user !== USER || users[0].db !== 'admin' || !Array.isArray(roles) || roles.length !== 1 || roles[0].role !== 'readWrite' || roles[0].db !== DATABASE) throw Error('QA_AUTHENTICATED_IDENTITY_DENIED');
  return Object.freeze({ database: DATABASE, username: USER, role: 'readWrite@' + DATABASE });
}
module.exports = { DATABASE, HOST, USER, validateUri, verifyIdentity };
