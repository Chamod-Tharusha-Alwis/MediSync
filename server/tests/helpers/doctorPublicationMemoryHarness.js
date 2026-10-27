// Load the actual controller into a VM with read-only in-memory dependencies.
// No database driver/config, env file, HTTP listener or provider is imported.
const fs = require('fs'), path = require('path'), vm = require('vm');
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function publicationHarness(doctors, { nodeEnv = 'test', allowDemo = 'false', testMode = true,
  database = 'medisync_automated_test', readyState = 1, bans = [] } = {}) {
  const immutable = freeze(JSON.parse(JSON.stringify(doctors))), queries = [];
  const chain = values => { const query = { select: () => query, populate: () => query, sort: () => query, lean: async () => values }; return query; };
  const model = values => new Proxy({ find: query => { queries.push(JSON.parse(JSON.stringify(query))); return chain(values); } }, {
    get(target, key) { if (key in target) return target[key]; throw new Error(`Read-only publication seam refuses model operation ${String(key)}`); }
  });
  const doctorModel = model(immutable), empty = model([]), banModel = model(freeze(JSON.parse(JSON.stringify(bans))));
  const exports = {}, context = { exports, process: { env: { NODE_ENV: nodeEnv, ALLOW_SYNTHETIC_DEMO_DIRECTORY: allowDemo } },
    console: { error: () => {}, warn: () => {} }, require(name) {
      if (name === '../models/Doctor') return doctorModel;
      if (name === '../models/BanRecord') return banModel;
      if (/^\.\.\/models\//.test(name)) return empty;
      if (name === 'mongoose') return { connection: { name: database, readyState } };
      if (name === '../config/dbGuard') return { TEST_DB_NAME:'medisync_automated_test', PROD_DB_NAME:'test', isAutomatedTestEnvironment: () => testMode };
      if (name === '../config/redis') return { getCache: async () => null, setCache: async () => { throw new Error('Cache mutation unavailable in publication seam'); } };
      if (name === 'axios' || name === '../utils/internalAuth') return new Proxy({}, { get: () => { throw new Error('External integration unavailable in publication seam'); } });
      throw new Error(`Unapproved publication dependency ${name}`);
    } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../src/controllers/publicController.js'),'utf8'), context, { filename:'actual-publicController-memory-only.js' });
  async function directory(query = {}) {
    let status = 200, body;
    const res = { status(value) { status=value; return res; }, json(value) { body=value; return res; } };
    await exports.getDoctors({ query },res);
    return { status, body };
  }
  return { policy: exports.isPublicVerifiedDoctor, demoAllowed: exports.isIsolatedDemoDoctorDirectoryAllowed,
    directory, queries, immutableDoctors: immutable };
}
module.exports = { publicationHarness };
