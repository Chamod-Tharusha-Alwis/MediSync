'use strict';

const assert = require('assert');
const url = require('url');

// The SOLE approved QA database name under the accepted environment contract
const APPROVED_DATABASES = Object.freeze(['medisync_automated_test']);
const DISALLOWED_DATABASES = Object.freeze(['test', 'medisync_qa_isolated', 'admin', 'local', 'config', '']);

const DEFAULT_POLICY = Object.freeze({
  minMaxPoolSize: 5,
  maxMaxPoolSize: 50,
  maxConnectTimeoutMS: 10000,
  maxServerSelectionTimeoutMS: 5000,
  requiredAuthSource: 'admin',
  permittedDatabase: 'medisync_automated_test',
  permittedRole: 'readWrite'
});

const PERMITTED_QUERY_KEYS = Object.freeze([
  'authSource',
  'tls',
  'ssl',
  'tlsInsecure',
  'sslValidate',
  'connectTimeoutMS',
  'serverSelectionTimeoutMS',
  'maxPoolSize'
]);

/**
 * Validates connection options and URI against strict B01 native driver security policy.
 * Throws an Error with descriptive code if policy is violated, failing closed.
 */
function validateDriverPolicy(uriString, options = {}, profile = 'qa_isolated') {
  if (!uriString || typeof uriString !== 'string') {
    const err = new Error('B01: Connection URI is required and must be a string');
    err.code = 'B01_INVALID_URI';
    throw err;
  }

  // Parse URI safely
  let parsed;
  try {
    parsed = new url.URL(uriString);
  } catch (e) {
    const err = new Error('B01: Malformed MongoDB URI: ' + e.message);
    err.code = 'B01_MALFORMED_URI';
    throw err;
  }

  const isSrv = parsed.protocol === 'mongodb+srv:';
  const isStandard = parsed.protocol === 'mongodb:';

  if (!isSrv && !isStandard) {
    const err = new Error(`B01: Unsupported protocol ${parsed.protocol}`);
    err.code = 'B01_UNSUPPORTED_PROTOCOL';
    throw err;
  }

  // Check for duplicate query parameters in search string (e.g. ?tls=true&tls=false)
  const rawQuery = (parsed.search || '').replace(/^\?/, '');
  if (rawQuery) {
    const seenKeys = new Set();
    const pairs = rawQuery.split('&');
    for (const pair of pairs) {
      if (!pair) continue;
      const [rawKey] = pair.split('=');
      const lowerKey = decodeURIComponent(rawKey).toLowerCase();
      if (seenKeys.has(lowerKey)) {
        const err = new Error(`B01: Duplicate or ambiguous query parameter "${rawKey}" detected`);
        err.code = 'B01_DUPLICATE_OPTION';
        throw err;
      }
      seenKeys.add(lowerKey);

      // Check for mixed-case option bypass attempts
      const exactKey = decodeURIComponent(rawKey);
      if (exactKey !== exactKey.toLowerCase() && !PERMITTED_QUERY_KEYS.includes(exactKey)) {
        const err = new Error(`B01: Mixed-case or unauthorized option key "${exactKey}" detected`);
        err.code = 'B01_INVALID_OPTION_KEY';
        throw err;
      }

      // Check against unauthorized driver options (e.g. retryWrites, directConnection, unreviewed flags)
      if (!PERMITTED_QUERY_KEYS.includes(exactKey) && !PERMITTED_QUERY_KEYS.includes(lowerKey)) {
        const err = new Error(`B01: Unauthorized driver query option "${exactKey}" prohibited`);
        err.code = 'B01_UNAUTHORIZED_DRIVER_OPTION';
        throw err;
      }
    }
  }

  // Extract database name from pathname (e.g. /medisync_automated_test)
  const dbName = (parsed.pathname || '').replace(/^\//, '').split('?')[0].trim();
  if (!dbName || DISALLOWED_DATABASES.includes(dbName.toLowerCase())) {
    const err = new Error(`B01: Database name "${dbName}" is forbidden. Ambiguous, system, or unapproved DB names prohibited`);
    err.code = 'B01_FORBIDDEN_DATABASE';
    throw err;
  }

  if (dbName !== DEFAULT_POLICY.permittedDatabase) {
    const err = new Error(`B01: Database name "${dbName}" is not the sole approved QA database "${DEFAULT_POLICY.permittedDatabase}"`);
    err.code = 'B01_UNAPPROVED_DATABASE';
    throw err;
  }

  // Hostname validation
  const hostname = parsed.hostname.toLowerCase();
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

  if (isLocal) {
    const err = new Error(`B01: Target host "${hostname}" is localhost/loopback, strictly forbidden`);
    err.code = 'B01_FORBIDDEN_HOST';
    throw err;
  }

  // Hostname must be an approved Atlas cluster (must end with .mongodb.net)
  if (!hostname.endsWith('.mongodb.net')) {
    const err = new Error(`B01: Host "${hostname}" is not an approved MongoDB Atlas domain (*.mongodb.net)`);
    err.code = 'B01_UNAPPROVED_HOST';
    throw err;
  }

  // TLS / SSL verification (mandatory)
  const isTls = isSrv || options.tls === true || options.ssl === true || parsed.searchParams.get('tls') === 'true' || parsed.searchParams.get('ssl') === 'true';
  if (!isTls) {
    const err = new Error('B01: Plaintext connection refused; TLS is mandatory');
    err.code = 'B01_PLAINTEXT_REFUSED';
    throw err;
  }

  // Check for insecure TLS overrides
  if (options.tlsInsecure === true || options.sslValidate === false || parsed.searchParams.get('tlsInsecure') === 'true' || parsed.searchParams.get('tlsInsecure')?.toLowerCase() === 'true') {
    const err = new Error('B01: Insecure TLS / disabled certificate validation is prohibited');
    err.code = 'B01_INSECURE_TLS';
    throw err;
  }

  // Timeouts
  const connectTimeoutMS = options.connectTimeoutMS || parseInt(parsed.searchParams.get('connectTimeoutMS') || '0', 10);
  if (connectTimeoutMS && connectTimeoutMS > DEFAULT_POLICY.maxConnectTimeoutMS) {
    const err = new Error(`B01: connectTimeoutMS (${connectTimeoutMS}) exceeds maximum allowed (${DEFAULT_POLICY.maxConnectTimeoutMS})`);
    err.code = 'B01_TIMEOUT_EXCEEDED';
    throw err;
  }

  const serverSelectionTimeoutMS = options.serverSelectionTimeoutMS || parseInt(parsed.searchParams.get('serverSelectionTimeoutMS') || '0', 10);
  if (serverSelectionTimeoutMS && serverSelectionTimeoutMS > DEFAULT_POLICY.maxServerSelectionTimeoutMS) {
    const err = new Error(`B01: serverSelectionTimeoutMS (${serverSelectionTimeoutMS}) exceeds maximum allowed (${DEFAULT_POLICY.maxServerSelectionTimeoutMS})`);
    err.code = 'B01_TIMEOUT_EXCEEDED';
    throw err;
  }

  // MaxPoolSize
  const maxPoolSize = options.maxPoolSize || parseInt(parsed.searchParams.get('maxPoolSize') || '0', 10);
  if (maxPoolSize && (maxPoolSize < DEFAULT_POLICY.minMaxPoolSize || maxPoolSize > DEFAULT_POLICY.maxMaxPoolSize)) {
    const err = new Error(`B01: maxPoolSize (${maxPoolSize}) outside allowed range [${DEFAULT_POLICY.minMaxPoolSize}, ${DEFAULT_POLICY.maxMaxPoolSize}]`);
    err.code = 'B01_INVALID_POOL_SIZE';
    throw err;
  }

  // authSource
  const authSource = options.authSource || parsed.searchParams.get('authSource');
  if (authSource !== DEFAULT_POLICY.requiredAuthSource) {
    const err = new Error(`B01: authSource must be "${DEFAULT_POLICY.requiredAuthSource}", found "${authSource}"`);
    err.code = 'B01_INVALID_AUTH_SOURCE';
    throw err;
  }

  return {
    valid: true,
    profile,
    dbName,
    isTls,
    hostname,
    sanitizedOptions: {
      tls: true,
      authSource: DEFAULT_POLICY.requiredAuthSource,
      connectTimeoutMS: connectTimeoutMS || DEFAULT_POLICY.maxConnectTimeoutMS,
      serverSelectionTimeoutMS: serverSelectionTimeoutMS || DEFAULT_POLICY.maxServerSelectionTimeoutMS
    }
  };
}

/**
 * Validates authenticated principal and roles proof against strict QA environment contract.
 * - Exactly one authenticated user.
 * - Exactly one role: readWrite on medisync_automated_test.
 */
function validatePrincipalAndRoles(authInfo) {
  if (!authInfo || typeof authInfo !== 'object') {
    const err = new Error('B01: Missing or invalid authentication info object');
    err.code = 'B01_INVALID_AUTH_INFO';
    throw err;
  }

  const users = authInfo.authenticatedUsers;
  const roles = authInfo.authenticatedUserRoles;

  if (!Array.isArray(users) || users.length !== 1) {
    const err = new Error(`B01: Exactly one authenticated principal required, found ${Array.isArray(users) ? users.length : 0}`);
    err.code = 'B01_INVALID_PRINCIPAL_COUNT';
    throw err;
  }

  if (typeof users[0]?.user !== 'string' || !users[0].user || users[0].db !== 'admin') {
    const err = new Error('B01: Principal must be defined with authSource db="admin"');
    err.code = 'B01_INVALID_PRINCIPAL_DB';
    throw err;
  }

  if (!Array.isArray(roles) || roles.length !== 1) {
    const err = new Error(`B01: Exactly one restricted role required, found ${Array.isArray(roles) ? roles.length : 0}`);
    err.code = 'B01_INVALID_ROLE_COUNT';
    throw err;
  }

  const role = roles[0];
  if (role?.role !== DEFAULT_POLICY.permittedRole || role?.db !== DEFAULT_POLICY.permittedDatabase) {
    const err = new Error(`B01: Role must be "${DEFAULT_POLICY.permittedRole}" on "${DEFAULT_POLICY.permittedDatabase}", found "${role?.role}" on "${role?.db}"`);
    err.code = 'B01_INVALID_ROLE_BINDING';
    throw err;
  }

  return { valid: true, user: users[0].user, role: role.role, db: role.db };
}

/**
 * Creates a disconnected test double for MongoClient that validates policy
 * before any network socket can be opened. Refuses ALL write operations
 * under E1 read-only policy. Never connects to actual network.
 */
function createDisconnectedMongoClientDouble(policyValidator = validateDriverPolicy) {
  return class DisconnectedMongoClientDouble {
    constructor(uri, options = {}) {
      this.uri = uri;
      this.options = options;
      this.connected = false;
      this.socketOpened = false; // Always false, proving zero network IO
      this.validated = false;
      this.profile = options.profile || 'qa_isolated';
      this.authInfo = options.authInfo || null;
    }

    async connect() {
      // Validate policy first - fail closed before any socket initiation
      const validation = policyValidator(this.uri, this.options, this.profile);
      if (this.authInfo) {
        validatePrincipalAndRoles(this.authInfo);
      }
      this.validated = true;
      // In disconnected double, connection succeeds virtually without opening socket
      this.connected = true;
      return this;
    }

    db(dbName) {
      if (!this.connected) throw new Error('Client must be connected before calling db()');
      if (dbName !== DEFAULT_POLICY.permittedDatabase) {
        throw new Error(`B01: db() target "${dbName}" is forbidden. Sole permitted DB is "${DEFAULT_POLICY.permittedDatabase}"`);
      }
      return {
        databaseName: dbName,
        collection: (colName) => ({
          collectionName: colName,
          // E1 is strictly read-only: ALL mutation methods throw immediately
          insertOne: async () => {
            const err = new Error('B01: Read-only E1 runtime policy strictly refuses every mutation (insertOne)');
            err.code = 'B01_MUTATION_PROHIBITED';
            throw err;
          },
          updateOne: async () => {
            const err = new Error('B01: Read-only E1 runtime policy strictly refuses every mutation (updateOne)');
            err.code = 'B01_MUTATION_PROHIBITED';
            throw err;
          },
          deleteOne: async () => {
            const err = new Error('B01: Read-only E1 runtime policy strictly refuses every mutation (deleteOne)');
            err.code = 'B01_MUTATION_PROHIBITED';
            throw err;
          },
          deleteMany: async () => {
            const err = new Error('B01: Read-only E1 runtime policy strictly refuses every mutation (deleteMany)');
            err.code = 'B01_MUTATION_PROHIBITED';
            throw err;
          },
          // Read-only operations allowed in test double
          findOne: async (query) => ({ _id: 'MOCK_ID', simulationOnly: true }),
          find: (query) => ({
            toArray: async () => []
          })
        })
      };
    }

    async close() {
      this.connected = false;
    }
  };
}

module.exports = {
  APPROVED_DATABASES,
  DISALLOWED_DATABASES,
  DEFAULT_POLICY,
  PERMITTED_QUERY_KEYS,
  validateDriverPolicy,
  validatePrincipalAndRoles,
  createDisconnectedMongoClientDouble
};
