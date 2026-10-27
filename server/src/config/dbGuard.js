const crypto = require('crypto');
const mongoose = require('mongoose');
const { ConnectionString } = require('mongodb-connection-string-url');

const PROD_DB_NAME = 'medisync_prod';
const TEST_DB_NAME = 'medisync_automated_test';
const STAGING_DB_NAME = 'medisync_staging';

class DatabaseIsolationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DatabaseIsolationError';
  }
}

class DestructiveOperationBlockedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DestructiveOperationBlockedError';
  }
}

/**
 * Masks credentials and sensitive query parameters in a MongoDB URI for safe logging.
 */
function maskMongoUri(rawUri) {
  if (!rawUri || typeof rawUri !== 'string') return '<missing-uri>';
  try {
    const cs = new ConnectionString(rawUri);
    const hosts = Array.isArray(cs.hosts) ? cs.hosts.join(',') : '<hosts>';
    const protocol = cs.isSRV ? 'mongodb+srv://' : 'mongodb://';
    const userHash = cs.username
      ? `user#${crypto.createHash('sha256').update(cs.username).digest('hex').slice(0, 8)}`
      : 'anonymous';
    return `${protocol}${userHash}:****@${hosts}${cs.pathname || '/'}`;
  } catch (_) {
    return '<unparseable-mongo-uri>';
  }
}

/**
 * Parses a MongoDB Atlas connection string without regex manipulation.
 * Rejects local MongoDB (127.0.0.1 / localhost) to enforce the Atlas-Only policy.
 */
function parseAndValidateAtlasUri(rawUri, envVarName, expectedDbName) {
  if (!rawUri || typeof rawUri !== 'string' || !rawUri.trim()) {
    throw new DatabaseIsolationError(
      `[FATAL][DB-GUARD] Missing required environment variable ${envVarName}. Implicit fallback is prohibited.`
    );
  }

  let cs;
  try {
    cs = new ConnectionString(rawUri.trim());
  } catch (err) {
    throw new DatabaseIsolationError(
      `[FATAL][DB-GUARD] Invalid MongoDB connection string in ${envVarName}.`
    );
  }

  const hosts = Array.isArray(cs.hosts) ? cs.hosts : [];
  if (hosts.length === 0) {
    throw new DatabaseIsolationError(
      `[FATAL][DB-GUARD] ${envVarName} contains no MongoDB hostnames.`
    );
  }

  // Strictly prohibit local MongoDB (127.0.0.1 / localhost) per IR-02 policy
  for (const host of hosts) {
    const h = String(host).toLowerCase();
    if (h.includes('127.0.0.1') || h.includes('localhost') || h.includes('0.0.0.0')) {
      throw new DatabaseIsolationError(
        `[FATAL][DB-GUARD] Local MongoDB host (${h}) detected in ${envVarName}. MediSync is strictly MongoDB Atlas Free (M0) only.`
      );
    }
    if (!h.replace(/:\d+$/, '').endsWith('.mongodb.net')) {
      throw new DatabaseIsolationError(
        `[FATAL][DB-GUARD] Non-Atlas host (${h}) detected in ${envVarName}. Only *.mongodb.net Atlas clusters are permitted.`
      );
    }
  }

  if (!cs.username || !cs.password) {
    throw new DatabaseIsolationError(
      `[FATAL][DB-GUARD] ${envVarName} must include explicit MongoDB Atlas credentials.`
    );
  }

  const pathnameDb = (cs.pathname || '').replace(/^\/+/, '').trim();
  if (expectedDbName && pathnameDb && pathnameDb !== expectedDbName) {
    throw new DatabaseIsolationError(
      `[FATAL][DB-GUARD] ${envVarName} specifies database "${pathnameDb}", but "${expectedDbName}" is required.`
    );
  }

  const usernameHash = crypto.createHash('sha256').update(cs.username).digest('hex');

  return {
    cs,
    hosts,
    pathnameDb,
    usernameHash,
    maskedUri: maskMongoUri(rawUri)
  };
}

function isAutomatedTestEnvironment() {
  return Boolean(
    process.env.NODE_ENV === 'test' ||
      process.env.MEDISYNC_TEST_MODE === 'true' ||
      process.env.JEST_WORKER_ID !== undefined
  );
}

/**
 * Installs runtime guards on Mongoose and the underlying MongoDB driver to block:
 * - dropDatabase()
 * - dropCollection()
 * - blanket deleteMany({}) with an empty filter
 * - any attempt to open a production connection while in automated test mode
 */
let guardsInstalled = false;
function installDestructiveOpGuards() {
  if (guardsInstalled) return;

  const blockDropDatabase = async function () {
    throw new DestructiveOperationBlockedError(
      '[FATAL][DB-GUARD] dropDatabase() is permanently prohibited across all MediSync databases (including test and medisync_automated_test).'
    );
  };

  const blockDropCollection = async function (collectionName) {
    throw new DestructiveOperationBlockedError(
      `[FATAL][DB-GUARD] dropCollection("${collectionName || ''}") is permanently prohibited across all MediSync databases.`
    );
  };

  if (mongoose.Connection && mongoose.Connection.prototype) {
    mongoose.Connection.prototype.dropDatabase = blockDropDatabase;
    mongoose.Connection.prototype.dropCollection = blockDropCollection;
  }

  if (mongoose.mongo && mongoose.mongo.Db && mongoose.mongo.Db.prototype) {
    mongoose.mongo.Db.prototype.dropDatabase = blockDropDatabase;
    mongoose.mongo.Db.prototype.dropCollection = blockDropCollection;
  }

  const isBlanketFilter = (filter) => {
    if (!filter || typeof filter !== 'object' || Array.isArray(filter)) return true;
    const keys = Object.keys(filter);
    return keys.length === 0;
  };

  // Guard Mongoose Model.deleteMany
  const origModelDeleteMany = mongoose.Model.deleteMany;
  mongoose.Model.deleteMany = function (filter, options) {
    if (isBlanketFilter(filter)) {
      throw new DestructiveOperationBlockedError(
        `[FATAL][DB-GUARD] Blanket ${this.modelName || 'Model'}.deleteMany({}) is permanently prohibited. Use a scoped filter (e.g., { isTestFixture: true, testRunId }).`
      );
    }
    return origModelDeleteMany.call(this, filter, options);
  };

  // Guard native Collection.prototype.deleteMany
  if (mongoose.mongo && mongoose.mongo.Collection && mongoose.mongo.Collection.prototype) {
    const origCollDeleteMany = mongoose.mongo.Collection.prototype.deleteMany;
    mongoose.mongo.Collection.prototype.deleteMany = function (filter, options) {
      if (isBlanketFilter(filter)) {
        throw new DestructiveOperationBlockedError(
          `[FATAL][DB-GUARD] Blanket collection("${this.collectionName}").deleteMany({}) is permanently prohibited. Use a scoped filter.`
        );
      }
      return origCollDeleteMany.call(this, filter, options);
    };
  }

  // Guard mongoose.connect to fail closed if an automated test process attempts a non-test connection
  const origMongooseConnect = mongoose.connect.bind(mongoose);
  mongoose.connect = async function (uri, options = {}) {
    if (isAutomatedTestEnvironment()) {
      if (process.env.MONGO_URI) {
        throw new DatabaseIsolationError('[FATAL][DB-GUARD] MONGO_URI must not be loaded in an automated test process.');
      }
      const targetInfo = parseAndValidateAtlasUri(uri, 'MONGO_URI_TEST', TEST_DB_NAME);
      if (
        targetInfo.pathnameDb !== TEST_DB_NAME ||
        (options && options.dbName && options.dbName !== TEST_DB_NAME)
      ) {
        throw new DatabaseIsolationError(
          `[FATAL][DB-GUARD] Fail-closed: Automated test process attempted to connect to "${
            (options && options.dbName) || targetInfo.pathnameDb || '<unspecified>'
          }" instead of "${TEST_DB_NAME}".`
        );
      }
      if (process.env.MONGO_URI && typeof process.env.MONGO_URI === 'string' && process.env.MONGO_URI.trim()) {
        const prodInfo = parseAndValidateAtlasUri(process.env.MONGO_URI, 'MONGO_URI', null);
        if (targetInfo.usernameHash === prodInfo.usernameHash) {
          throw new DatabaseIsolationError(
            `[FATAL][DB-GUARD] Fail-closed: Automated test process attempted to connect using production MongoDB credentials.`
          );
        }
      }
    }
    return origMongooseConnect(uri, options);
  };

  guardsInstalled = true;
}

/**
 * Validates that a test URI is completely isolated from the production URI
 * BEFORE any network connection is opened.
 */
function validateAutomatedTestConfig({
  testUri = process.env.MONGO_URI_TEST,
  prodUri = process.env.MONGO_URI
} = {}) {
  const testInfo = parseAndValidateAtlasUri(testUri, 'MONGO_URI_TEST', TEST_DB_NAME);

  if (testInfo.pathnameDb !== TEST_DB_NAME) {
    throw new DatabaseIsolationError(
      `[FATAL][DB-GUARD] MONGO_URI_TEST must explicitly specify "/${TEST_DB_NAME}" in its URI path (found "/${testInfo.pathnameDb || ''}").`
    );
  }

  // Explicitly deny production cluster (p7hjket.mongodb.net)
  const DENIED_CLUSTERS = ['p7hjket.mongodb.net'];
  for (const host of testInfo.hosts) {
    const hostLower = String(host).toLowerCase();
    for (const denied of DENIED_CLUSTERS) {
      if (hostLower.includes(denied)) {
        throw new DatabaseIsolationError(
          `[FATAL][DB-GUARD] Cluster collision violation: MONGO_URI_TEST points to denied production cluster "${denied}". Automated tests must run on a separate dedicated Atlas project/cluster.`
        );
      }
    }
  }

  if (prodUri && typeof prodUri === 'string' && prodUri.trim()) {
    const prodInfo = parseAndValidateAtlasUri(prodUri, 'MONGO_URI', null);
    if (testInfo.usernameHash === prodInfo.usernameHash) {
      throw new DatabaseIsolationError(
        `[FATAL][DB-GUARD] Credential separation violation: MONGO_URI_TEST uses the same MongoDB Atlas database user (${testInfo.usernameHash.slice(0, 8)}) as production MONGO_URI. Automated tests must use a dedicated Atlas user restricted to readWrite@${TEST_DB_NAME}.`
      );
    }
  }

  return testInfo;
}

/**
 * Connects the production/live server to the existing Atlas 'test' database
 * with explicit dbName and runtime destructive-operation guards.
 * Fails closed immediately if called inside an automated test environment.
 */
async function connectProductionDB(uri = process.env.MONGO_URI) {
  installDestructiveOpGuards();

  if (isAutomatedTestEnvironment()) {
    throw new DatabaseIsolationError(
      `[FATAL][DB-GUARD] Fail-closed: connectProductionDB() is strictly prohibited in automated test mode (NODE_ENV=${process.env.NODE_ENV || ''}, MEDISYNC_TEST_MODE=${process.env.MEDISYNC_TEST_MODE || ''}). Automated processes must connect exclusively to "${TEST_DB_NAME}" via connectAutomatedTestDB().`
    );
  }

  if (process.env.NODE_ENV !== 'production' || process.env.MEDISYNC_LIVE_START_APPROVED !== 'true') {
    throw new DatabaseIsolationError(
      '[FATAL][DB-GUARD] Live database access requires NODE_ENV=production and explicit MEDISYNC_LIVE_START_APPROVED=true. Local startup is disabled.'
    );
  }

  const policy = require('../security/productionAtlasPolicy');
  const storageAdmission = require('../security/productionStorageAdmission');
  policy.assertProductionAtlasConfiguration(process.env, uri);
  policy.disableAutomaticModelDdl(mongoose);
  const prodInfo = parseAndValidateAtlasUri(uri, 'MONGO_URI', PROD_DB_NAME);
  try {
    await mongoose.connect(uri, {
      dbName: PROD_DB_NAME, tls: true, autoIndex: false, autoCreate: false,
      readPreference: 'primary', writeConcern: { w: 'majority' },
      serverSelectionTimeoutMS: 10000, socketTimeoutMS: 10000
    });
    const identity = await policy.verifyProductionIdentity(mongoose.connection.db);
    const storage = await storageAdmission.verifyProductionStorage(mongoose.connection.db, process.env);
    return { connection: mongoose.connection, ...identity, ...storage, maskedUri: prodInfo.maskedUri };
  } catch (_) {
    try { await mongoose.disconnect(); }
    catch (_) { throw new DatabaseIsolationError('[FATAL][DB-GUARD] Production admission failed; connection shutdown failed.'); }
    throw new DatabaseIsolationError('[FATAL][DB-GUARD] Production identity or storage prerequisites were not verified.');
  }
}

/**
 * Connects automated tests ONLY to 'medisync_automated_test' on MongoDB Atlas,
 * and verifies that the dedicated test user has ZERO read access to the live 'test' database.
 */
async function connectAutomatedTestDB({
  testUri = process.env.MONGO_URI_TEST,
  prodUri = process.env.MONGO_URI
} = {}) {
  installDestructiveOpGuards();

  if (process.env.MONGO_URI) {
    throw new DatabaseIsolationError('[FATAL][DB-GUARD] MONGO_URI must not be loaded in an automated test process.');
  }

  const testInfo = validateAutomatedTestConfig({ testUri, prodUri });

  // In automated test environments, disable automatic background index builds
  // and automatic collection creation on unseeded models to prevent unauthorized
  // collection pollution.
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
  await mongoose.connect(testUri, {
    dbName: TEST_DB_NAME,
    autoIndex: false,
    autoCreate: false
  });

  const actualDb = mongoose.connection?.db?.databaseName || mongoose.connection?.name;
  if (actualDb !== TEST_DB_NAME) {
    await mongoose.disconnect();
    throw new DatabaseIsolationError(
      `[FATAL][DB-GUARD] Expected automated test connection to "${TEST_DB_NAME}", but connected to "${actualDb}".`
    );
  }

  // Verify the connected Atlas user holds ONLY restricted privileges on TEST_DB_NAME
  // using connectionStatus (zero probes against the production 'test' database)
  let connStatus;
  try {
    connStatus = await mongoose.connection.db.command({ connectionStatus: 1 });
  } catch (_) {
    await mongoose.disconnect();
    throw new DatabaseIsolationError('[FATAL][DB-GUARD] Could not verify the authenticated test database role.');
  }
  const authUsers = connStatus?.authInfo?.authenticatedUsers || [];
  const authRoles = connStatus?.authInfo?.authenticatedUserRoles || [];

  if (authRoles.length === 0) {
    await mongoose.disconnect();
    throw new DatabaseIsolationError(
      `[FATAL][DB-GUARD] Unable to verify authenticated roles for test user on "${TEST_DB_NAME}".`
    );
  }

  const exactRole = authRoles.length === 1 && authRoles[0].db === TEST_DB_NAME && authRoles[0].role === 'readWrite';
  if (!exactRole || authUsers.length !== 1) {
    await mongoose.disconnect();
    throw new DatabaseIsolationError(
      `[FATAL][DB-GUARD] Permission isolation failure: Test user must authenticate once with exactly readWrite@${TEST_DB_NAME}.`
    );
  }

  return {
    connection: mongoose.connection,
    dbName: actualDb,
    maskedUri: testInfo.maskedUri,
    usernameHash8: testInfo.usernameHash.slice(0, 8),
    authenticatedRoles: authRoles,
    authenticatedUserCount: authUsers.length
  };
}

/**
 * Validates that a staging URI is completely isolated from production and automated test URIs
 * BEFORE any network connection is opened.
 */
function validateStagingConfig({
  stagingUri = process.env.MONGO_URI_STAGING,
  prodUri = process.env.MONGO_URI,
  testUri = process.env.MONGO_URI_TEST
} = {}) {
  const stagingInfo = parseAndValidateAtlasUri(stagingUri, 'MONGO_URI_STAGING', STAGING_DB_NAME);

  if (stagingInfo.pathnameDb !== STAGING_DB_NAME) {
    throw new DatabaseIsolationError(
      `[FATAL][DB-GUARD] MONGO_URI_STAGING must explicitly specify "/${STAGING_DB_NAME}" in its URI path (found "/${stagingInfo.pathnameDb || ''}").`
    );
  }

  // Explicitly deny production (p7hjket.mongodb.net) and QA (gwprp27.mongodb.net) clusters
  const DENIED_CLUSTERS = ['p7hjket.mongodb.net', 'gwprp27.mongodb.net'];
  for (const host of stagingInfo.hosts) {
    const hostLower = String(host).toLowerCase();
    for (const denied of DENIED_CLUSTERS) {
      if (hostLower.includes(denied)) {
        throw new DatabaseIsolationError(
          `[FATAL][DB-GUARD] Cluster collision violation: MONGO_URI_STAGING points to denied cluster "${denied}". Staging must run on a separate dedicated Atlas project/cluster.`
        );
      }
    }
  }

  // Ensure TLS is not explicitly disabled
  const searchParams = stagingInfo.cs.searchParams;
  if (searchParams && (searchParams.get('ssl') === 'false' || searchParams.get('tls') === 'false')) {
    throw new DatabaseIsolationError(
      '[FATAL][DB-GUARD] TLS/SSL encryption is strictly mandatory for MongoDB Atlas staging connections.'
    );
  }

  // Pinned staging host validation if configured
  if (process.env.STAGING_PINNED_HOST) {
    const pinned = process.env.STAGING_PINNED_HOST.toLowerCase().trim();
    const hasPinned = stagingInfo.hosts.some(h => String(h).toLowerCase().includes(pinned));
    if (!hasPinned) {
      throw new DatabaseIsolationError(
        `[FATAL][DB-GUARD] Pinned staging host mismatch: MONGO_URI_STAGING hosts do not match STAGING_PINNED_HOST "${pinned}".`
      );
    }
  }

  if (prodUri && typeof prodUri === 'string' && prodUri.trim()) {
    const prodInfo = parseAndValidateAtlasUri(prodUri, 'MONGO_URI', null);
    if (stagingInfo.usernameHash === prodInfo.usernameHash) {
      throw new DatabaseIsolationError(
        `[FATAL][DB-GUARD] Credential separation violation: MONGO_URI_STAGING uses the same MongoDB Atlas database user as production MONGO_URI. Staging must use a dedicated Atlas user restricted to readWrite@${STAGING_DB_NAME}.`
      );
    }
  }

  if (testUri && typeof testUri === 'string' && testUri.trim()) {
    const testInfo = parseAndValidateAtlasUri(testUri, 'MONGO_URI_TEST', null);
    if (stagingInfo.usernameHash === testInfo.usernameHash) {
      throw new DatabaseIsolationError(
        `[FATAL][DB-GUARD] Credential separation violation: MONGO_URI_STAGING uses the same MongoDB Atlas database user as MONGO_URI_TEST. Staging must use a dedicated Atlas user restricted to readWrite@${STAGING_DB_NAME}.`
      );
    }
  }

  return stagingInfo;
}

/**
 * Connects the staging server ONLY to 'medisync_staging' on MongoDB Atlas,
 * and verifies that the dedicated staging user holds ONLY restricted privileges.
 * Fails closed immediately if called without MEDISYNC_STAGING_MODE=true or in unauthorized environment.
 */
async function connectStagingDB({
  stagingUri = process.env.MONGO_URI_STAGING,
  prodUri = process.env.MONGO_URI
} = {}) {
  installDestructiveOpGuards();

  if (process.env.MEDISYNC_STAGING_MODE !== 'true') {
    throw new DatabaseIsolationError(
      '[FATAL][DB-GUARD] Staging database access requires explicit MEDISYNC_STAGING_MODE=true. Unauthorized startup blocked.'
    );
  }

  if (process.env.NODE_ENV === 'production' && process.env.MEDISYNC_LIVE_START_APPROVED === 'true') {
    throw new DatabaseIsolationError(
      '[FATAL][DB-GUARD] Fail-closed: Staging connection cannot be initiated in a live production approved environment.'
    );
  }

  if (process.env.MONGO_URI) {
    throw new DatabaseIsolationError('[FATAL][DB-GUARD] Production MONGO_URI must not be loaded in a staging environment.');
  }

  const stagingInfo = validateStagingConfig({ stagingUri, prodUri });

  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
  await mongoose.connect(stagingUri, {
    dbName: STAGING_DB_NAME,
    autoIndex: false,
    autoCreate: false
  });

  const actualDb = mongoose.connection?.db?.databaseName || mongoose.connection?.name;
  if (actualDb !== STAGING_DB_NAME) {
    await mongoose.disconnect();
    throw new DatabaseIsolationError(
      `[FATAL][DB-GUARD] Expected staging connection to "${STAGING_DB_NAME}", but connected to "${actualDb}".`
    );
  }

  let connStatus;
  try {
    connStatus = await mongoose.connection.db.command({ connectionStatus: 1 });
  } catch (_) {
    await mongoose.disconnect();
    throw new DatabaseIsolationError('[FATAL][DB-GUARD] Could not verify authenticated staging database role.');
  }
  const authUsers = connStatus?.authInfo?.authenticatedUsers || [];
  const authRoles = connStatus?.authInfo?.authenticatedUserRoles || [];

  if (authRoles.length === 0) {
    await mongoose.disconnect();
    throw new DatabaseIsolationError(
      `[FATAL][DB-GUARD] Unable to verify authenticated roles for staging user on "${STAGING_DB_NAME}".`
    );
  }

  const exactRole = authRoles.length === 1 && authRoles[0].db === STAGING_DB_NAME && authRoles[0].role === 'readWrite';
  if (!exactRole || authUsers.length !== 1) {
    await mongoose.disconnect();
    throw new DatabaseIsolationError(
      `[FATAL][DB-GUARD] Permission isolation failure: Staging user must authenticate once with exactly readWrite@${STAGING_DB_NAME}.`
    );
  }

  return {
    connection: mongoose.connection,
    dbName: actualDb,
    maskedUri: stagingInfo.maskedUri,
    usernameHash8: stagingInfo.usernameHash.slice(0, 8),
    authenticatedRoles: authRoles,
    authenticatedUserCount: authUsers.length
  };
}

module.exports = {
  PROD_DB_NAME,
  TEST_DB_NAME,
  STAGING_DB_NAME,
  DatabaseIsolationError,
  DestructiveOperationBlockedError,
  isAutomatedTestEnvironment,
  maskMongoUri,
  parseAndValidateAtlasUri,
  installDestructiveOpGuards,
  areDestructiveGuardsInstalled: () => guardsInstalled,
  validateAutomatedTestConfig,
  validateStagingConfig,
  connectProductionDB,
  connectAutomatedTestDB,
  connectStagingDB
};

