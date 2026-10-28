'use strict';

const { inspectProductionConnection, verifyRequestedAuthenticationProof, classifyAtlasFailure, REQUESTED_USER } = require('../scripts/diagnoseProductionAtlas');
const dummyPassword = 'dummy-not-a-real-credential';
const uri = (host = 'medisync.p7hjket.mongodb.net', database = 'medisync_prod', user = REQUESTED_USER, options = 'tls=true&w=majority&authSource=admin&authMechanism=SCRAM-SHA-256&readPreference=primary') =>
  `mongodb+srv://${encodeURIComponent(user)}:${encodeURIComponent(dummyPassword)}@${host}/${database}?${options}`;
const env = () => ({ NODE_ENV: 'production', MONGO_URI: uri() });
const proof = () => ({ authInfo: { authenticatedUsers: [{ user: REQUESTED_USER, db: 'admin' }], authenticatedUserRoles: [{ role: 'readWrite', db: 'medisync_prod' }] } });

test('exact requested target passes real policy offline without claiming authentication', () => {
  const result = inspectProductionConnection(env());
  expect(result).toMatchObject({ status: 'OFFLINE_CONFIGURATION_PASS', requestedUsernameMatches: true, tlsEnforcedByDriver: true, authSourceEnforcedByDriver: true, authMechanismEnforcedByDriver: true, authentication: 'NOT_VERIFIED', roles: 'NOT_VERIFIED', storage: 'NOT_VERIFIED', topology: 'NOT_VERIFIED', networkOperations: 0 });
  expect(JSON.stringify(result)).not.toContain(dummyPassword);
  expect(JSON.stringify(result)).not.toContain('mongodb+srv://');
});

test.each(['barehost.mongodb.net', 'medisync.p7hjket.mongodb.net.attacker.invalid', '127.0.0.1', 'localhost', '*.mongodb.net'])('rejects invalid or unvetted host %s', host => {
  expect(inspectProductionConnection({ ...env(), MONGO_URI: uri(host) })).toMatchObject({ status: 'BLOCKED', code: 'PRODUCTION_EXISTING_CLUSTER_AND_DATABASE_REQUIRED', networkOperations: 0 });
});
test.each(['medisync.xton2tj.mongodb.net', 'newcluster.abc12.mongodb.net'])('accepts valid generalized host %s', host => {
  expect(inspectProductionConnection({ ...env(), MONGO_URI: uri(host) })).toMatchObject({ status: 'OFFLINE_CONFIGURATION_PASS', networkOperations: 0 });
});
test.each(['test', 'medisync', 'medisync_automated_test', ''])('rejects substitute or omitted database %s', database => {
  expect(inspectProductionConnection({ ...env(), MONGO_URI: uri(undefined, database) }).status).toBe('BLOCKED');
});
test('requested username is independently pinned without weakening existing runtime policy', () => {
  expect(inspectProductionConnection({ ...env(), MONGO_URI: uri(undefined, undefined, 'different_offline_user') })).toMatchObject({ status: 'BLOCKED', code: 'REQUESTED_ATLAS_USERNAME_REQUIRED' });
});

test.each(['tls=true', 'tls=true&authSource=admin', 'tls=true&authMechanism=SCRAM-SHA-256'])('boot-ready diagnostic requires explicit SCRAM source and mechanism: %s', options => {
  expect(inspectProductionConnection({ ...env(), MONGO_URI: uri(undefined, undefined, undefined, options) })).toMatchObject({ status: 'BLOCKED', code: 'PRODUCTION_EXPLICIT_SCRAM_CONFIGURATION_REQUIRED', networkOperations: 0 });
});
test.each(['tls=false', 'tlsAllowInvalidCertificates=true', 'authSource=medisync_prod', 'authMechanism=PLAIN', 'readPreference=secondary', 'w=0', 'tls=true&TLS=false'])('rejects insecure or incompatible options %s', options => {
  expect(inspectProductionConnection({ ...env(), MONGO_URI: uri(undefined, undefined, undefined, options) }).status).toBe('BLOCKED');
});
test.each(['MONGO_URI_TEST', 'MONGODB_URI_TEST', 'DATABASE_URL', 'MONGO_URI_STAGING'])('rejects mixed credential name %s even if blank', name => {
  expect(inspectProductionConnection({ ...env(), [name]: '' }).status).toBe('BLOCKED');
});
test('non-production NODE_ENV fails closed', () => {
  const candidate = env(); candidate.NODE_ENV = 'development';
  expect(inspectProductionConnection(candidate).code).toBe('PRODUCTION_RUNTIME_MODE_REQUIRED');
});
test('percent-encoded requested username remains equivalent; output reveals no credential', () => {
  const candidate = env(); candidate.MONGO_URI = candidate.MONGO_URI.replace('chamodtharusha13_db_user', '%63hamodtharusha13_db_user');
  expect(inspectProductionConnection(candidate).status).toBe('OFFLINE_CONFIGURATION_PASS');
});
test('credential accessor rejected without invoking it', () => {
  const candidate = env(); let accessed = false;
  Object.defineProperty(candidate, 'MONGO_URI', { get() { accessed = true; throw new Error('do-not-echo'); } });
  expect(inspectProductionConnection(candidate).code).toBe('OPERATOR_DATABASE_URI_REQUIRED');
  expect(accessed).toBe(false);
});
test('exact requested authentication proof uses the real exact-role verifier', async () => {
  await expect(verifyRequestedAuthenticationProof('medisync_prod', proof())).resolves.toMatchObject({ authenticatedUserCount: 1, requestedUsernameMatches: true, authenticationDatabaseMatches: true });
});
test.each(['atlasAdmin', 'readWriteAnyDatabase', 'dbAdmin', 'read'])('denies broad or insufficient role %s', role => {
  const candidate = proof(); candidate.authInfo.authenticatedUserRoles = [{ role, db: role === 'atlasAdmin' || role === 'readWriteAnyDatabase' ? 'admin' : 'medisync_prod' }];
  return expect(verifyRequestedAuthenticationProof('medisync_prod', candidate)).rejects.toThrow('PRODUCTION_AUTHENTICATED_ROLE_DENIED');
});
test('rejects an additional role even with readWrite production role', async () => {
  const candidate = proof(); candidate.authInfo.authenticatedUserRoles.push({ role: 'read', db: 'test' });
  await expect(verifyRequestedAuthenticationProof('medisync_prod', candidate)).rejects.toThrow('PRODUCTION_AUTHENTICATED_ROLE_DENIED');
});
test.each([['other_offline_user', 'admin'], [REQUESTED_USER, 'medisync_prod']])('rejects wrong authenticated user or auth database', async (user, db) => {
  const candidate = proof(); candidate.authInfo.authenticatedUsers = [{ user, db }];
  await expect(verifyRequestedAuthenticationProof('medisync_prod', candidate)).rejects.toThrow('REQUESTED_ATLAS_AUTHENTICATION_IDENTITY_REQUIRED');
});
test('rejects wrong selected database before inspecting proof', async () => {
  await expect(verifyRequestedAuthenticationProof('test', proof())).rejects.toThrow('PRODUCTION_DATABASE_IDENTITY_MISMATCH');
});
test.each([
  [{ code: 18, message: 'dummy-secret-do-not-echo' }, 'AUTHENTICATION'],
  [{ codeName: 'AuthenticationFailed' }, 'AUTHENTICATION'],
  [{ code: 13 }, 'AUTHORIZATION'],
  [{ code: 'ENOTFOUND' }, 'DNS'],
  [{ code: 'EAI_AGAIN' }, 'DNS'],
  [{ code: 'ERR_TLS_CERT_ALTNAME_INVALID' }, 'TLS'],
  [{ code: 'CERT_HAS_EXPIRED' }, 'TLS'],
  [{ code: 'ETIMEDOUT' }, 'NETWORK'],
  [{ name: 'MongoServerSelectionError', cause: { code: 'ENOTFOUND' } }, 'DNS'],
  [new Error('PRODUCTION_AUTHENTICATED_ROLE_DENIED'), 'ADMISSION'],
  [new Error('PRODUCTION_STORAGE_PREREQUISITES_NOT_VERIFIED'), 'ADMISSION'],
  [new Error('unknown dummy secret'), 'UNKNOWN']
])('classifies supplied inert error safely %#', (error, category) => {
  const result = classifyAtlasFailure(error);
  expect(result.category).toBe(category);
  expect(JSON.stringify(result)).not.toMatch(/dummy|secret|mongodb\+/i);
});
test('does not invoke getters or loop indefinitely on cyclic causes', () => {
  const candidate = {}; Object.defineProperty(candidate, 'message', { get() { throw new Error('unsafe getter'); } }); candidate.cause = candidate;
  expect(classifyAtlasFailure(candidate).code).toBe('ATLAS_FAILURE_UNCLASSIFIED');
});
