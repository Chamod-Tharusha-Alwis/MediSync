'use strict';
/**
 * server/scripts/demo/seedTopupProof.cjs — end-to-end proof of seedDemoTopup.cjs on a throwaway in-memory MongoDB.
 * Synthetic data only. Refuses to run if a real database address is set. Backups go to a temporary folder.
 *
 *   node server/scripts/demo/seedTopupProof.cjs          (prints the tool's own output, then one JSON line)
 */
const crypto = require('crypto');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

for (const k of ['MONGO_URI', 'MONGO_URI_TEST', 'MONGODB_URI', 'REDIS_URL', 'SEED_DEMO_URI']) if (process.env[k]) throw new Error(`REFUSING: ${k} is set`);
process.env.MEDISYNC_TEST_MODE = 'true';
process.env.ML_ENGINE_URL = 'http://127.0.0.1:9';
global.ENCRYPTION_KEYS = { 1: crypto.randomBytes(32).toString('hex') }; global.ACTIVE_KEY_VERSION = 1; global.ENCRYPTION_KEY = global.ENCRYPTION_KEYS[1];
const Module = require('module');
const load = Module._load;
Module._load = function (name, parent, ...rest) {
  if (/notificationService|cloudinary|config\/redis|emailService/i.test(name)) return { notifyOutbreakAlert: async () => {}, isUsingPersistentRedis: () => false, getRedisClient: () => null };
  return load.call(this, name, parent, ...rest);
};
const SERVER = path.resolve(__dirname, '../..');
const BINARY = process.env.MONGOMS_SYSTEM_BINARY || 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
const RESTORE = 'C:/Program Files/MongoDB/Tools/100/bin/mongorestore.exe';
const tool = require('./seedDemoTopup.cjs');
const plan = require('./demoSeedPlan.cjs');
const store = require('./demoStore.cjs');

const call = (handler, query) => new Promise((resolve, reject) => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(body) { resolve({ status: this.statusCode, body }); return this; } };
  Promise.resolve(handler({ query, params: {}, user: { id: 'x', role: 'admin' }, app: { get: () => null }, headers: {}, ip: '127.0.0.1' }, res)).catch(reject);
});

async function main() {
  if (!fs.existsSync(BINARY) || !fs.existsSync(RESTORE)) return { skipped: 'MONGODB_BINARIES_NOT_FOUND' };
  const version = cp.spawnSync(BINARY, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([0-9.]+)/)[1];
  const mongoose = require(path.join(SERVER, 'node_modules', 'mongoose'));
  const { MongoMemoryReplSet } = require(path.join(SERVER, 'node_modules', 'mongodb-memory-server'));
  const dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'medisync-topup-'));
  const backups = fs.mkdtempSync(path.join(os.tmpdir(), 'medisync-topup-backups-'));
  const replica = await MongoMemoryReplSet.create({ binary: { systemBinary: BINARY, version }, replSet: { count: 1, ip: '127.0.0.1', dbName: 'topup' }, instanceOpts: [{ ip: '127.0.0.1', dbPath }] });
  const out = { label: 'in-memory database, synthetic data only', mongod: version };
  try {
    const uri = replica.getUri('topup');
    const env = { SEED_DEMO_URI: uri };
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    const db = mongoose.connection.db;
    for (const n of ['Consultation', 'OutbreakAlert', 'OutbreakScan']) { const M = require(path.join(SERVER, 'src', 'models', n)); await M.createCollection().catch(() => {}); await M.createIndexes(); }
    // Existing state: the bulk demo seed of 2026-11-17, plus control records that must stay untouched.
    await store.writePlan(db, plan.buildBulkPlan({ referenceDate: '2026-11-17' }), { passwordHash: 'x'.repeat(60) });
    await db.collection('consultations').insertOne({ consultationId: 'CONTROL-REAL-1', district: 'Colombo', icdCode: 'A90', icdVersion: 'ICD-10', createdAt: new Date('2026-11-24T05:00:00Z'), patientId: new mongoose.Types.ObjectId() });
    for (const c of ['admins', 'prescriptions', 'auditlogs', 'users']) await db.collection(c).insertOne({ control: c });
    const digest = async (c, filter = {}) => { const h = crypto.createHash('sha256'); for await (const d of db.collection(c).find(filter).sort({ _id: 1 })) h.update(JSON.stringify(d)); return h.digest('hex'); };
    const untouched = async () => { const o = {}; for (const c of ['admins', 'prescriptions', 'auditlogs', 'users', 'patients', 'doctors', 'hospitals']) o[c] = await digest(c); o.oldConsultations = await digest('consultations', { seedBatch: { $exists: false } }); return JSON.stringify(o); };
    const before = await untouched();
    const count = () => db.collection('consultations').countDocuments();
    const start = await count();
    const { loadPublicHealthStats } = require(path.join(SERVER, 'src/services/publicHealthStats'));
    const { loadConsultationActivity } = require(path.join(SERVER, 'src/services/publicConsultationActivity'));
    const publicNow = new Date('2026-11-28T04:30:00Z');
    const publicView = async () => JSON.stringify([
      await loadPublicHealthStats(db.collection('consultations'), { connection: mongoose.connection, rangeDays: 30, district: 'all', disease: 'all', mode: 'real', now: publicNow }).catch(e => `error ${e.code || e.message}`),
      await loadConsultationActivity(db.collection('consultations'), { connection: mongoose.connection, rangeDays: 30, district: 'all', now: publicNow }).catch(e => `error ${e.message}`)]);
    const publicBefore = await publicView();
    const flags = ['--write', '--allow-synthetic-consultations', `--backup-dir=${backups}`];
    const log = line => console.log(`  ${line.split(backups).join('<temporary backup folder>')}`);
    const go = async (title, argv, extra = {}) => {
      console.log(`\n$ npm run seed:demo -- ${argv.map(a => (a.startsWith('--backup-dir') ? '--backup-dir=<folder>' : a)).join(' ')}   # ${title}`);
      try { return await tool.run(argv, { env, log, ...extra }); } catch (e) { log(`STOPPED: ${e.message}`); return { error: e.message }; }
    };
    const dry = await go('dry run', ['--batch=run1', '--dry-run', '--today=2026-11-25']);
    out.dryRun = { mode: dry.mode, planned: dry.planned, dates: Object.keys(dry.perDate || {}).sort(), unchanged: (await count()) === start };
    const refused = await go('write without the consultations opt-in', ['--batch=run1', '--write', '--today=2026-11-25', `--backup-dir=${backups}`]);
    out.refusedWithoutOptIn = { error: refused.error, unchanged: (await count()) === start };
    const tooBig = await go('size limit (test limit 1 MB)', ['--batch=run1', '--today=2026-11-25', ...flags], { capMB: 1 });
    out.sizeGuard = { error: tooBig.error, unchanged: (await count()) === start };
    const inRepo = await go('backup folder inside the repository', ['--batch=run1', '--today=2026-11-25', '--write', '--allow-synthetic-consultations', `--backup-dir=${path.join(SERVER, 'x')}`]);
    out.backupInRepo = { error: inRepo.error, unchanged: (await count()) === start };
    const runs = [];
    for (const [batch, today] of [['run1', '2026-11-25'], ['run2', '2026-11-26'], ['run3', '2026-11-27'], ['run5', '2026-11-28']]) {
      const n0 = await count();
      const r = await go(`seed (${today})`, [`--batch=${batch}`, `--today=${today}`, ...flags]);
      runs.push({ batch, today, error: r.error, inserted: r.inserted, addedToDb: (await count()) - n0, dates: Object.keys(r.perDate || {}).sort(), bySeverity: r.detector && r.detector.bySeverity, byLevel: r.detector && r.detector.byLevel,
        signals: r.detector && r.detector.signals.map(s => `${s.district} ${s.disease} ${s.level}/${s.severity}`), episodes: r.episodes, sizeMB: r.after && [r.before.totalMB, r.after.totalMB].map(v => +v.toFixed(2)) });
      if (batch === 'run1') {
        const again = await go('same command again', [`--batch=${batch}`, `--today=${today}`, ...flags]);
        out.repeat = again.inserted;
        // The backup must restore: into a second database of the same throwaway server.
        const res = cp.spawnSync(RESTORE, [`--uri=${replica.getUri()}`, '--gzip', `--archive=${r.backup}`, '--nsFrom=topup.*', '--nsTo=restored.*'], { encoding: 'utf8', windowsHide: true });
        out.restore = { exit: res.status, consultations: await mongoose.connection.getClient().db('restored').collection('consultations').countDocuments(), expected: start };
        await mongoose.connection.getClient().db('restored').dropDatabase();
      }
    }
    out.runs = runs;
    const tops = await db.collection('consultations').find({ consultationId: { $regex: `^${tool.PREFIX}` } }).toArray();
    out.labels = { rows: tops.length, allLabelled: tops.every(d => d.seedBatch && d.isSynthetic === true && d.syntheticSeedBatch === plan.BATCH_TAG && Boolean(d.syntheticLabel)),
      noPersonalFields: tops.every(d => ['patientNic', 'diagnosis', 'notes', 'nicHash', 'doctorId', 'hospitalId'].every(k => !(k in d))), uniqueIds: new Set(tops.map(d => d.consultationId)).size === tops.length };
    const key = d => `${d.district}|${d.icdCode}|${new Date(+d.createdAt + 330 * 60000).toISOString().slice(0, 10)}`;
    const batches = new Map();
    for (const d of tops) { const k = key(d); if (!batches.has(k)) batches.set(k, new Set()); batches.get(k).add(d.seedBatch); }
    const oldKeys = new Set((await db.collection('consultations').find({ seedBatch: { $exists: false } }).toArray()).map(key));
    out.noDuplicateCombos = { combosInTwoBatches: [...batches.values()].filter(s => s.size > 1).length, combosAlsoInOldData: [...batches.keys()].filter(k => oldKeys.has(k)).length };
    out.publicStatistics = { unchanged: (await publicView()) === publicBefore, sample: publicBefore.slice(0, 160) };
    // A real scan on the stored rows (viva morning), with notifications captured instead of sent.
    const service = require(path.join(SERVER, 'src/services/surveillanceService'));
    await service.runAnalysis({ mode: 'real', now: publicNow });
    const alerts = await db.collection('outbreakalerts').find({ status: 'Pending' }).toArray();
    out.scan = { pendingAlerts: alerts.map(a => `${a.location} ${a.disease} ${a.severity}`).sort(), allDemoLabelled: alerts.every(a => a.isDemoData === true && a.isSynthetic === true) };
    const controller = require(path.join(SERVER, 'src/controllers/alertController'));
    const monitor = await call(controller.getActiveAlerts, {}), history = await call(controller.getActiveAlerts, { view: 'history', limit: '100' });
    out.pages = { monitor: { status: monitor.status, rows: (monitor.body.data || []).length }, history: { status: history.status, rows: (history.body.data || []).map(a => `${a.district} ${a.status}`).sort() } };
    const n1 = await count();
    const rbDry = await go('rollback dry run', ['--batch=run1', '--rollback']);
    out.rollbackDry = { found: rbDry.found, unchanged: (await count()) === n1 };
    const rb = await go('rollback', ['--batch=run1', '--rollback', '--write', `--backup-dir=${backups}`]);
    out.rollback = { removed: rb.removed, linkedAlerts: rb.linkedAlerts, left: await db.collection('consultations').countDocuments({ seedBatch: 'run1' }), otherBatches: await db.collection('consultations').countDocuments({ seedBatch: { $in: ['run2', 'run3', 'run5'] } }), dropped: n1 - await count() };
    for (const b of ['run2', 'run3', 'run5']) await tool.run([`--batch=${b}`, '--rollback', '--write', `--backup-dir=${backups}`], { env, log: () => {} });
    out.afterAllRollbacks = { consultations: await count(), start, untouched: (await untouched()) === before };
    out.configLeft = fs.readdirSync(backups).some(d => fs.existsSync(path.join(backups, d, '.dump-config.yaml')));
    return out;
  } finally {
    await mongoose.disconnect().catch(() => {});
    await replica.stop().catch(() => {});
    fs.rmSync(dbPath, { recursive: true, force: true });
    fs.rmSync(backups, { recursive: true, force: true });
  }
}

if (require.main === module) main().then(r => { console.log(JSON.stringify(r)); process.exit(0); }).catch(e => { console.error(e.stack); process.exit(1); });
module.exports = { main };
