const {
  isAutomatedTestEnvironment,
  connectProductionDB,
  connectAutomatedTestDB
} = require('./dbGuard');

const connectDB = async () => {
  try {
    if (isAutomatedTestEnvironment()) {
      const { dbName, maskedUri, authenticatedRoles, authenticatedUserCount } = await connectAutomatedTestDB();
      if (dbName !== 'medisync_automated_test' || authenticatedUserCount !== 1 ||
        !Array.isArray(authenticatedRoles) || authenticatedRoles.length !== 1 ||
        authenticatedRoles[0]?.role !== 'readWrite' || authenticatedRoles[0]?.db !== dbName) {
        throw new Error('[QA] Incomplete restricted database runtime proof.');
      }
      console.log(
        `MongoDB automated test DB connected [db=${dbName}, roles=${JSON.stringify(authenticatedRoles)}, uri=${maskedUri}]`
      );
      return { dbName, authenticatedRoles, authenticatedUserCount };
    }

    const { dbName, maskedUri } = await connectProductionDB(process.env.MONGO_URI);
    console.log(`MongoDB connected [db=${dbName}, uri=${maskedUri}]`);
    return { dbName };
  } catch (err) {
    console.error('DB connection failed:', err.message);
    if (isAutomatedTestEnvironment()) throw err;
    process.exit(1);
  }
};

module.exports = connectDB;