'use strict';
/**
 * server/scripts/demo/fixpackProof.cjs - offline measurements and proofs for the admin dashboard fix pack.
 * Loopback MongoMemoryReplSet from the locally installed mongod only; no .env, no Atlas, no network.
 * Synthetic demonstration data: the full demo seed plan (about 30,000 consultations), real scans to create
 * alerts, and 20,000 synthetic audit events.
 *
 *   node server/scripts/demo/fixpackProof.cjs measure     -> median of 5 runs (ms) and DB commands per endpoint
 *   node server/scripts/demo/fixpackProof.cjs backfill    -> registration growth before / after / after revert
 * Prints one JSON object on the last line.
 */
const fs = require('fs');
const os = require('os');
const cp = require('child_process');
const crypto = require('crypto');
const path = require('path');
const { performance } = require('perf_hooks');

for (const k of ['MONGO_URI', 'MONGO_URI_TEST', 'MONGODB_URI', 'REDIS_URL']) if (process.env[k]) throw new Error(`REFUSING: ${k} is set`);
process.env.MEDISYNC_TEST_MODE = 'true';
process.env.EMAIL_PROVIDER = 'none';
process.env.ML_ENGINE_URL = 'http://127.0.0.1:9'; // replaced by a hanging local server in measure mode
process.env.INTERNAL_API_KEY = crypto.randomBytes(16).toString('hex');
const Module = require('module');
const load = Module._load;
Module._load = function (name, ...rest) {
  if (/notificationService|cloudinary|config\/redis/i.test(name)) return { notifyOutbreakAlert: async () => {}, isUsingPersistentRedis: () => false, getRedisClient: () => null };
  return load.call(this, name, ...rest);
};

const SERVER = path.resolve(__dirname, '../..');
const BINARY = process.env.MONGOMS_SYSTEM_BINARY || 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
const net = require('net');
const RTT_MS = Number((process.argv.find(a => a.startsWith('--rtt=')) || '--rtt=0').slice(6)); // one-way delay per packet
// Delaying TCP proxy between the driver and mongod, to reproduce a remote database round trip (Atlas) offline.
function delayProxy(targetPort, delay) {
  return new Promise(resolve => {
    const server = net.createServer(c => {
      const up = net.connect(targetPort, '127.0.0.1');
      c.on('data', d => setTimeout(() => up.write(d), delay)); up.on('data', d => setTimeout(() => c.write(d), delay));
      c.on('error', () => up.destroy()); up.on('error', () => c.destroy()); c.on('close', () => up.destroy()); up.on('close', () => c.destroy());
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}
// A sleeping ML engine: accepts the connection and never answers.
function hangingServer() { return new Promise(resolve => { const sockets = []; const s = net.createServer(c => sockets.push(c)); s.listen(0, '127.0.0.1', () => resolve({ s, close: () => { sockets.forEach(x => x.destroy()); s.close(); } })); }); }
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

async function setup() {
  const version = cp.spawnSync(BINARY, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([0-9.]+)/)[1];
  const mongoose = require(path.join(SERVER, 'node_modules', 'mongoose'));
  const { MongoMemoryReplSet } = require(path.join(SERVER, 'node_modules', 'mongodb-memory-server'));
  const dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'medisync-fixpack-'));
  const replica = await MongoMemoryReplSet.create({ binary: { systemBinary: BINARY, version }, replSet: { count: 1, ip: '127.0.0.1', dbName: 'fixpack' }, instanceOpts: [{ ip: '127.0.0.1', dbPath }] });
  let uri = replica.getUri('fixpack'), proxy = null;
  if (RTT_MS > 0) {
    const port = Number(new URL(uri.replace('mongodb://', 'http://')).port);
    proxy = await delayProxy(port, RTT_MS);
    uri = `mongodb://127.0.0.1:${proxy.address().port}/fixpack?directConnection=true`;
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, monitorCommands: true });
  global.ENCRYPTION_KEYS = { 1: crypto.randomBytes(32).toString('hex') }; global.ACTIVE_KEY_VERSION = 1; global.ENCRYPTION_KEY = global.ENCRYPTION_KEYS[1];
  for (const n of ['Consultation', 'Patient', 'Doctor', 'Hospital', 'OutbreakAlert', 'OutbreakScan', 'AuditLog', 'Prescription', 'PharmacyStaff']) {
    const M = require(path.join(SERVER, 'src', 'models', n));
    await M.createCollection().catch(() => {}); await M.createIndexes().catch(() => {});
  }
  return { mongoose, replica, dbPath, db: mongoose.connection.db, version, proxy };
}

async function seed(db) {
  const plan = require('./demoSeedPlan.cjs');
  const store = require('./demoStore.cjs');
  const bulk = plan.buildBulkPlan({ referenceDate: plan.isoDate(plan.referenceMidnight(new Date())) });
  await store.writePlan(db, bulk, { passwordHash: '$2a$04$offlineproofonlyoffline.proofonlyofflineproofonlyof' });
  // Unflagged control patients: two registered recently, eight without createdAt.
  await db.collection('patients').insertMany(Array.from({ length: 10 }, (_, i) => ({ nic: `20000000${String(i).padStart(4, '0')}`, fullName: `Control ${i}`, email: `control.${i}@example.invalid`,
    ...(i < 2 ? { createdAt: new Date(Date.now() - (i + 1) * 86400000) } : {}) })));
  const audit = [];
  const now = Date.now();
  for (let i = 0; i < 20000; i++) {
    const r = i % 10;
    const action = r < 7 ? 'USER_HEARTBEAT' : r < 9 ? 'GET__API_ADMIN_STATS' : ['USER_LOGIN', 'ALERT_APPROVED', 'CREATE_CONSULTATION'][i % 3];
    audit.push({ actorId: crypto.randomBytes(12).toString('hex'), actorRole: r === 9 ? 'doctor' : 'admin', action, accessedNic: 'REDACTED', deviceModel: 'Desktop Browser', timestamp: new Date(now - (20000 - i) * 30000) });
  }
  await db.collection('auditlogs').insertMany(audit);
  const { runAnalysis } = require(path.join(SERVER, 'src', 'services', 'surveillanceService'));
  // Scans on the last 3 days create alerts (and their snapshots), as the scheduled scan would.
  for (const daysAgo of [2, 1, 0]) await runAnalysis({ mode: 'real', now: new Date(now - daysAgo * 86400000) });
  return { consultations: bulk.total, alerts: await db.collection('outbreakalerts').countDocuments(), auditEvents: audit.length };
}

function call(handler, req) {
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); return this; }, send(b) { resolve({ status: this.statusCode, body: b }); return this; }, set() { return this; }, setHeader() {} };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

async function measure(mongoose) {
  const admin = require(path.join(SERVER, 'src', 'controllers', 'adminController'));
  const alerts = require(path.join(SERVER, 'src', 'controllers', 'alertController'));
  const analytics = require(path.join(SERVER, 'src', 'controllers', 'analyticsController'));
  const user = { id: String(new mongoose.Types.ObjectId()), _id: String(new mongoose.Types.ObjectId()), role: 'admin', email: 'admin@qa.medisync.local' };
  const endpoints = [
    ['GET /admin/outbreak/alerts', alerts.getActiveAlerts, {}],
    ['GET /admin/outbreak/growth?window=72h', admin.getOutbreakGrowth, { window: '72h' }],
    ['GET /admin/outbreak/last-scan', admin.getLastScan, {}],
    ['GET /admin/ml-status (ML engine asleep)', admin.getMLStatus, {}],
    ['GET /admin/stats (incl. audit feed)', admin.getSystemStats, {}],
    ['GET /admin/analytics/dashboard', analytics.getDashboardStats, {}],
    ['GET /admin/audit-logs?limit=100', admin.getAuditLogs, { limit: '100', actorId: user.id }],
  ];
  const client = mongoose.connection.getClient();
  let commands = [];
  const listener = e => commands.push(`${e.commandName}:${e.command[e.commandName] || ''}`);
  client.on('commandStarted', listener);
  const out = [];
  for (const [name, handler, query] of endpoints) {
    const times = [], counts = [];
    let status = null;
    for (let i = 0; i < 5; i++) {
      commands = [];
      const t = performance.now();
      const r = await call(handler, { query, params: {}, user, app: { get: () => null }, headers: {} });
      times.push(performance.now() - t); counts.push(commands.length); status = r.status;
    }
    const byKind = {}; for (const c of commands) byKind[c] = (byKind[c] || 0) + 1;
    out.push({ endpoint: name, status, medianMs: +median(times).toFixed(1), runsMs: times.map(x => +x.toFixed(1)), dbCommands: median(counts), lastRunCommands: byKind });
  }
  client.off('commandStarted', listener);
  return out;
}

async function backfill(db) {
  const bf = require('./backfillDemoRegistrations.cjs');
  const analytics = require(path.join(SERVER, 'src', 'controllers', 'analyticsController'));
  const user = { role: 'admin' };
  const growth = async () => (await call(analytics.getDashboardStats, { user, query: {} })).body;
  const pick = b => (b && (b.data?.registrationGrowth || b.registrationGrowth)) || b;
  const before = pick(await growth());
  const p = bf.buildBackfillPlan({ referenceDate: new Date() });
  const manifestPath = path.join(os.tmpdir(), `fixpack-backfill-${Date.now()}.json`);
  const controlsBefore = await db.collection('patients').find({ nic: /^2000/ }).sort({ nic: 1 }).toArray();
  const written = await bf.applyBackfill(db, p, { manifestPath });
  const after = pick(await growth());
  let refused = null; try { await bf.applyBackfill(db, p, { manifestPath: manifestPath + '.2' }); } catch (e) { refused = e.message.split(':')[0]; }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const reverted = await bf.revertBackfill(db, manifest);
  const afterRevert = pick(await growth());
  const controlsAfter = await db.collection('patients').find({ nic: /^2000/ }).sort({ nic: 1 }).toArray();
  const stillMarked = await db.collection('patients').countDocuments({ [bf.MARK]: { $exists: true } });
  return { plan: { referenceDate: p.referenceDate, perDay: p.perDay, total: p.total, digest: p.digest }, before, written, after, secondApplyRefused: refused, reverted, afterRevert,
    unflaggedUnchanged: JSON.stringify(controlsBefore) === JSON.stringify(controlsAfter), stillMarked, manifestOriginalsNull: manifest.originals.filter(o => o.createdAt === null).length };
}

async function main(mode) {
  if (!fs.existsSync(BINARY)) return { skipped: 'MONGOD_BINARY_NOT_FOUND' };
  const env = await setup();
  try {
    const t = performance.now();
    const seeded = await seed(env.db);
    const result = { label: 'synthetic demonstration data', mongod: env.version, seeded, seedSeconds: +((performance.now() - t) / 1000).toFixed(1) };
    if (mode === 'measure') {
      const ml = await hangingServer();
      process.env.ML_ENGINE_URL = `http://127.0.0.1:${ml.s.address().port}`;
      try { result.rttMsEachWay = RTT_MS; result.endpoints = await measure(env.mongoose); } finally { ml.close(); }
    }
    if (mode === 'backfill') result.backfill = await backfill(env.db);
    if (mode === 'fixtures') {
      // Response bodies computed by the real handlers from the seeded records, for the offline screenshots.
      const bf = require('./backfillDemoRegistrations.cjs');
      await bf.applyBackfill(env.db, bf.buildBackfillPlan({ referenceDate: new Date() }), { manifestPath: path.join(os.tmpdir(), `fixpack-fixtures-${Date.now()}.json`) });
      const user = { id: String(new env.mongoose.Types.ObjectId()), role: 'admin', email: 'admin@qa.medisync.local' };
      const req = q => ({ query: q || {}, params: {}, user, app: { get: () => null }, headers: {} });
      const admin = require(path.join(SERVER, 'src', 'controllers', 'adminController'));
      result.fixtures = {
        '/admin/stats': (await call(admin.getSystemStats, req())).body,
        '/admin/outbreak/alerts': (await call(require(path.join(SERVER, 'src', 'controllers', 'alertController')).getActiveAlerts, req())).body,
        '/admin/analytics/dashboard': (await call(require(path.join(SERVER, 'src', 'controllers', 'analyticsController')).getDashboardStats, req())).body,
        '/admin/outbreak/growth?window=72h': (await call(admin.getOutbreakGrowth, req({ window: '72h' }))).body,
      };
    }
    return result;
  } finally {
    await env.mongoose.disconnect().catch(() => {});
    if (env.proxy) env.proxy.close();
    await env.replica.stop().catch(() => {});
    fs.rmSync(env.dbPath, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main(process.argv[2] || 'measure').then(r => {
    if (r.endpoints) for (const e of r.endpoints) console.log(`${e.endpoint.padEnd(44)} status ${e.status}  median ${String(e.medianMs).padStart(8)} ms  db commands ${e.dbCommands}`);
    console.log(JSON.stringify(r));
    process.exit(0);
  }).catch(e => { console.error(e.stack); process.exit(1); });
}
module.exports = { main };
