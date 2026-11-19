'use strict';
/**
 * server/scripts/demo/outbreakHistoryProof.cjs — offline proof for Outbreak Monitor vs Outbreak History
 * (synthetic fixture alerts only). In-memory MongoDB replica set; refuses to run if a real database URI is set.
 *
 *   node server/scripts/demo/outbreakHistoryProof.cjs
 *
 * Proves, through the real controllers and real Mongo queries: every alert is in exactly one of the two lists
 * (no overlap, no gap); the 14-day boundary (13 d 23 h -> Monitor, 14 d 1 h -> History); a resolved alert from today is
 * only in History; pagination; validation codes; non-admin refusal; explain() of the Monitor list query.
 */
const fs = require('fs');
const os = require('os');
const cp = require('child_process');
const path = require('path');

for (const k of ['MONGO_URI', 'MONGO_URI_TEST', 'MONGODB_URI', 'REDIS_URL']) if (process.env[k]) throw new Error(`REFUSING: ${k} is set`);
process.env.MEDISYNC_TEST_MODE = 'true';
process.env.ML_ENGINE_URL = 'http://127.0.0.1:9';
const Module = require('module');
const load = Module._load;
const SERVER = path.resolve(__dirname, '../..');
Module._load = function (name, parent, ...rest) {
  if (/notificationService|cloudinary|config\/redis/i.test(name)) return { notifyOutbreakAlert: async () => {}, isUsingPersistentRedis: () => false, getRedisClient: () => null };
  return load.call(this, name, parent, ...rest);
};
const BINARY = process.env.MONGOMS_SYSTEM_BINARY || 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
const H = 3600000, D = 24 * H;

function call(handler, req) {
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(body) { resolve({ status: this.statusCode, body }); return this; } };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

async function main() {
  if (!fs.existsSync(BINARY)) return { skipped: 'MONGOD_BINARY_NOT_FOUND' };
  const version = cp.spawnSync(BINARY, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([0-9.]+)/)[1];
  const mongoose = require(path.join(SERVER, 'node_modules', 'mongoose'));
  const { MongoMemoryReplSet } = require(path.join(SERVER, 'node_modules', 'mongodb-memory-server'));
  const dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'medisync-history-'));
  const replica = await MongoMemoryReplSet.create({ binary: { systemBinary: BINARY, version }, replSet: { count: 1, ip: '127.0.0.1', dbName: 'history' }, instanceOpts: [{ ip: '127.0.0.1', dbPath }] });
  try {
    await mongoose.connect(replica.getUri('history'), { serverSelectionTimeoutMS: 10000 });
    const OutbreakAlert = require(path.join(SERVER, 'src/models/OutbreakAlert'));
    const service = require(path.join(SERVER, 'src/services/surveillanceService'));
    const alerts = require(path.join(SERVER, 'src/controllers/alertController'));
    const now = Date.now();
    const base = { surveillancePolicy: service.POLICY, isSimulation: false, severity: 'High', sourceConsultationIds: [] };
    const docs = [];
    const add = (label, ageMs, status, extra = {}) => docs.push({ _id: new mongoose.Types.ObjectId(), label, ...base, disease: 'ICD10:A90', location: 'Colombo', district: 'Colombo',
      status, createdAt: new Date(now - ageMs), updatedAt: new Date(now - Math.min(ageMs, H)), message: `fixture ${label}`, ...extra });
    add('pending-now', 5 * 60000, 'Pending');
    add('pending-13d23h', 13 * D + 23 * H, 'Pending');
    add('pending-14d1h', 14 * D + H, 'Pending');
    add('active-13d23h', 13 * D + 23 * H, 'Active');
    add('active-14d1h', 14 * D + H, 'Active');
    add('resolved-today', 2 * H, 'Resolved');
    add('dismissed-today', 3 * H, 'Dismissed');
    add('resolved-old', 40 * D, 'Resolved');
    add('pending-90d', 90 * D, 'Pending', { district: 'Galle', location: 'Galle', disease: 'ICD10:A01' });
    add('demo-pending-2d', 2 * D, 'Pending', { isDemoData: true, isSynthetic: true, syntheticSeedBatch: service.VIVA_DEMO_SEED_BATCH });
    add('demo-pending-20d', 20 * D, 'Pending', { isDemoData: true, isSynthetic: true, syntheticSeedBatch: service.VIVA_DEMO_SEED_BATCH });
    for (let i = 0; i < 45; i++) add(`bulk-pending-${i}`, (i + 1) * H, 'Pending', { district: 'Kandy', location: 'Kandy' });
    await OutbreakAlert.collection.insertMany(docs);
    const idOf = Object.fromEntries(docs.map(d => [d.label, String(d._id)]));

    const admin = { id: String(new mongoose.Types.ObjectId()), role: 'admin' };
    const req = (query = {}, user = admin) => ({ query, params: {}, user, app: { get: () => null }, headers: {}, ip: '127.0.0.1' });
    const collect = async (query, pages) => { const ids = []; let page = 1, meta; do { const r = await call(alerts.getActiveAlerts, req({ ...query, page: String(page) })); meta = r.body.pagination; ids.push(...r.body.data.map(a => String(a._id))); page++; } while (page <= meta.pages && page <= pages); return { ids, meta }; };
    const monitor = await collect({}, 50);
    const history = await collect({ view: 'history', limit: '100' }, 50);
    const all = docs.map(d => String(d._id));
    const inMonitor = new Set(monitor.ids), inHistory = new Set(history.ids);
    const out = { label: 'synthetic fixture alerts', mongod: version, total: all.length };
    out.partition = {
      monitorCount: monitor.ids.length, historyCount: history.ids.length, monitorPages: monitor.meta.pages, monitorDefaultLimit: monitor.meta.limit,
      overlap: all.filter(id => inMonitor.has(id) && inHistory.has(id)).length, gap: all.filter(id => !inMonitor.has(id) && !inHistory.has(id)).length,
      duplicatesInMonitor: monitor.ids.length - inMonitor.size, duplicatesInHistory: history.ids.length - inHistory.size,
    };
    const where = label => (inMonitor.has(idOf[label]) ? 'monitor' : inHistory.has(idOf[label]) ? 'history' : 'none');
    out.placement = Object.fromEntries(['pending-now', 'pending-13d23h', 'pending-14d1h', 'active-13d23h', 'active-14d1h', 'resolved-today', 'dismissed-today', 'resolved-old', 'pending-90d', 'demo-pending-2d', 'demo-pending-20d'].map(l => [l, where(l)]));
    // Pagination and filters on History.
    const p2 = await call(alerts.getActiveAlerts, req({ view: 'history', page: '2', limit: '2' }));
    out.historyPage2 = { status: p2.status, rows: p2.body.data.length, total: p2.body.pagination.total, pages: p2.body.pagination.pages };
    const resolved = await call(alerts.getActiveAlerts, req({ view: 'history', status: 'Resolved' }));
    out.filterResolved = resolved.body.data.map(a => a.status);
    const galle = await call(alerts.getActiveAlerts, req({ view: 'history', district: 'Galle' }));
    out.filterGalle = galle.body.data.map(a => a.district);
    const range = await call(alerts.getActiveAlerts, req({ view: 'history', from: new Date(now - 45 * D).toISOString().slice(0, 10), to: new Date(now - 30 * D).toISOString().slice(0, 10) }));
    out.filterRange = range.body.data.map(a => String(a._id) === idOf['resolved-old']);
    out.historySample = history.ids.length ? (await call(alerts.getActiveAlerts, req({ view: 'history', status: 'Resolved', limit: '1' }))).body.data[0] : null;
    // Validation and role checks.
    const bad = {};
    for (const [name, q] of Object.entries({ page0: { page: '0' }, limit101: { limit: '101' }, badDate: { from: '2026-02-30' }, badStatus: { status: 'Open' }, badRange: { from: '2026-11-10', to: '2026-11-01' }, unknown: { sort: 'x' }, badDistrict: { district: 'Atlantis' } })) {
      const r = await call(alerts.getActiveAlerts, req({ view: 'history', ...q }));
      bad[name] = `${r.status} ${r.body.code}`;
    }
    const monitorBadPage = await call(alerts.getActiveAlerts, req({ page: 'x' }));
    bad.monitorBadPage = `${monitorBadPage.status} ${monitorBadPage.body.code}`;
    out.validation = bad;
    const doctor = await call(alerts.getAlertHistory, req({ view: 'history' }, { id: admin.id, role: 'doctor' }));
    out.nonAdminHistory = doctor.status;
    // explain() of the Monitor list query: documents examined vs returned (no new index is declared; see the findings doc).
    const views = require(path.join(SERVER, 'src/services/outbreakViews'));
    const stage = ex => { let s = ex.queryPlanner.winningPlan; const n = []; while (s) { n.push(s.stage + (s.indexName ? `(${s.indexName})` : '')); s = s.inputStage || (s.inputStages && s.inputStages[0]); } return n.join(' <- '); };
    const monitorEx = await OutbreakAlert.collection.find({ surveillancePolicy: service.POLICY, ...service.realAlertFilter(), syntheticSeedBatch: { $exists: false }, ...views.monitorCondition(new Date(now)) }).sort({ createdAt: -1 }).explain('executionStats');
    out.explain = { monitor: { plan: stage(monitorEx), docsExamined: monitorEx.executionStats.totalDocsExamined, returned: monitorEx.executionStats.nReturned } };
    out.expectedMonitorReal = docs.filter(d => !d.syntheticSeedBatch && views.isMonitorAlert(d, new Date(now))).length;
    out.indexes = (await OutbreakAlert.collection.indexes()).map(i => JSON.stringify(i.key));
    return out;
  } finally {
    await mongoose.disconnect().catch(() => {});
    await replica.stop().catch(() => {});
    fs.rmSync(dbPath, { recursive: true, force: true });
  }
}

if (require.main === module) main().then(r => { console.log(JSON.stringify(r)); process.exit(0); }).catch(e => { console.error(e.stack); process.exit(1); });
module.exports = { main };
