'use strict';
/**
 * server/scripts/demo/alert72hScanProof.cjs - offline proof that the real scan (runAnalysis) stores the 72-hour
 * projection snapshot once and that a later scan adds the actual next-72h outcome beside it, and that the
 * approval flow sends the detailed email (captured in memory, never sent).
 *
 * Loopback MongoMemoryReplSet from the locally installed mongod only (no download, no Atlas, no .env).
 * Synthetic demonstration data from demoSeedPlan.cjs. Prints one JSON object.
 *   node server/scripts/demo/alert72hScanProof.cjs
 */
const fs = require('fs');
const cp = require('child_process');
const crypto = require('crypto');
const path = require('path');

for (const k of ['MONGO_URI', 'MONGO_URI_TEST', 'MONGODB_URI', 'REDIS_URL']) if (process.env[k]) throw new Error(`REFUSING: ${k} is set`);
process.env.MEDISYNC_TEST_MODE = 'true'; // emailService captures mail in memory instead of contacting a provider
process.env.EMAIL_PROVIDER = 'none';
process.env.ML_ENGINE_URL = 'http://127.0.0.1:9'; // ML heuristic unreachable: rule path only
process.env.INTERNAL_API_KEY = crypto.randomBytes(16).toString('hex');
process.env.OUTBREAK_DEMO_EMAIL_ALLOWLIST = 'viva.admin@qa.medisync.local';
const Module = require('module');
const load = Module._load;
Module._load = function (name, ...rest) {
  if (/notificationService|cloudinary|config\/redis/i.test(name)) return { notifyOutbreakAlert: async () => {} };
  return load.call(this, name, ...rest);
};

const SERVER = path.resolve(__dirname, '../..');
const BINARY = process.env.MONGOMS_SYSTEM_BINARY || 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';

async function main() {
  if (!fs.existsSync(BINARY)) return { skipped: 'MONGOD_BINARY_NOT_FOUND' };
  const version = cp.spawnSync(BINARY, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([0-9.]+)/)[1];
  const mongoose = require(path.join(SERVER, 'node_modules', 'mongoose'));
  const { MongoMemoryReplSet } = require(path.join(SERVER, 'node_modules', 'mongodb-memory-server'));
  const plan = require('./demoSeedPlan.cjs');
  const store = require('./demoStore.cjs');
  const projection = require(path.join(SERVER, 'src', 'services', 'alertProjection72h'));
  const replica = await MongoMemoryReplSet.create({ binary: { systemBinary: BINARY, version }, replSet: { count: 1, ip: '127.0.0.1', dbName: 'alert72h_proof' } });
  try {
    await mongoose.connect(replica.getUri('alert72h_proof'), { serverSelectionTimeoutMS: 10000 });
    const db = mongoose.connection.db;
    const bulk = plan.buildBulkPlan({ referenceDate: '2026-11-17' });
    const rows = bulk.rows.filter(r => r.district === 'Kurunegala' && r.disease === 'dengue');
    const refs = { patients: new Map(bulk.identities.patients.map(p => [p.nic, new mongoose.Types.ObjectId()])), doctors: new Map(), hospitals: new Map() };
    const docs = rows.map(r => store.consultationDocument(r, bulk, refs));
    const D = plan.referenceMidnight('2026-11-17');
    for (let i = 0; i < 9; i++) docs.push(store.consultationDocument({ ...rows[0], consultationId: `${plan.DEMO_PREFIX}PROOF-NEXT-${i}`, time: D + Math.floor(i / 3) * plan.DAY_MS + 4 * 3600000 + i * 60000, scenario: 'PROOF' }, bulk, refs));
    await db.collection('consultations').insertMany(docs);
    const { runAnalysis } = require(path.join(SERVER, 'src', 'services', 'surveillanceService'));
    const alerts = db.collection('outbreakalerts');
    const at = days => new Date(D + days * plan.DAY_MS + 6.5 * 3600000);

    const s1 = await runAnalysis({ mode: 'real', now: at(0) });
    const a = s1.results.find(r => r.district === 'Kurunegala');
    const id = new mongoose.Types.ObjectId(a.alertId);
    const snap1 = (await alerts.findOne({ _id: id })).projection72h;
    const expected = projection.computeAlertNumbers({ district: 'Kurunegala', disease: 'ICD10:A90' }, rows.map(r => ({ district: r.district, diseaseId: 'ICD10:A90', time: r.time })), { asOf: at(0), lookbackStart: +at(0) - 63 * plan.DAY_MS });
    // Existing 72h growth fields (metrics72h) for the same alert, computed by the unchanged enrichAlertWith72h.
    const svc = require(path.join(SERVER, 'src', 'services', 'surveillanceService'));
    const sel = await svc.loadCases({ mode: 'real', now: at(0), lookbackDays: 63 });
    const metrics72h = svc.enrichAlertWith72h(await alerts.findOne({ _id: id }), svc.computeGrowthFromCases({ cases: sel.cases, windowHours: 72, now: at(0) })).metrics72h;
    const s2 = await runAnalysis({ mode: 'real', now: at(1) });
    const after2 = await alerts.findOne({ _id: id });
    const s3 = await runAnalysis({ mode: 'real', now: at(3) });
    const after3 = await alerts.findOne({ _id: id });

    // Approval flow with the detailed email (captured, never sent).
    await alerts.updateOne({ _id: id }, { $set: { status: 'Pending' } });
    global.__MEDISYNC_CAPTURED_TEST_EMAILS = [];
    const admin = require(path.join(SERVER, 'src', 'controllers', 'adminController'));
    let body = null, code = 200;
    const res = { status(c) { code = c; return this; }, json(b) { body = b; return this; } };
    const req = { params: { id: String(id) }, body: { emailScope: 'district' }, user: { id: String(new mongoose.Types.ObjectId()), role: 'admin', email: 'viva.admin@qa.medisync.local' }, app: { get: () => null } };
    const canReview = require(path.join(SERVER, 'src', 'services', 'surveillanceService'));
    canReview.canReviewSimulation = async () => true;
    await admin.approveAlert(req, res);
    const mails = (global.__MEDISYNC_CAPTURED_TEST_EMAILS || []).map(m => ({ to: m.to, subject: m.subject, textHead: String(m.text).split('\n').slice(0, 15) }));
    return {
      label: plan.LABEL, mongod: version,
      metrics72h,
      scan1: { snapshotsWritten: s1.projection72h.snapshotsWritten, snapshot: snap1, expected: { previous72h: expected.previous72h, actual72h: expected.actual72h, projected: expected.projection.projected, low: expected.projection.low, high: expected.projection.high } },
      scan2: { snapshotsWritten: s2.projection72h.snapshotsWritten, snapshotUnchanged: JSON.stringify(after2.projection72h) === JSON.stringify(snap1), outcome: after2.projection72hOutcome || null },
      scan3: { outcomesWritten: s3.projection72h.outcomesWritten, snapshotUnchanged: JSON.stringify(after3.projection72h) === JSON.stringify(snap1), outcome: after3.projection72hOutcome || null },
      approval: { status: code, emailDelivery: body && body.emailDelivery, capturedMails: mails },
    };
  } finally {
    await mongoose.disconnect().catch(() => {});
    await replica.stop().catch(() => {});
  }
}

if (require.main === module) main().then(r => { console.log(JSON.stringify(r)); process.exit(0); }).catch(e => { console.error(e.stack); process.exit(1); });
module.exports = { main };
