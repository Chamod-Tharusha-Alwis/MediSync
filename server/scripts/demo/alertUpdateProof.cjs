'use strict';
/**
 * server/scripts/demo/alertUpdateProof.cjs — offline proof that a scan updates an existing active alert
 * (fixture cases only, in-memory MongoDB replica set; refuses to run if a real database address is set).
 *
 *   node server/scripts/demo/alertUpdateProof.cjs      prints one JSON line
 *
 * Everything is real (runAnalysis, the detector rule, Mongo queries, notificationService, audit helper, controllers) except
 * e-mail and Redis, which are denied, and the ML engine, which is unreachable.
 */
const crypto = require('crypto');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

for (const k of ['MONGO_URI', 'MONGO_URI_TEST', 'MONGODB_URI', 'REDIS_URL']) if (process.env[k]) throw new Error(`REFUSING: ${k} is set`);
process.env.MEDISYNC_TEST_MODE = 'true';
process.env.ML_ENGINE_URL = 'http://127.0.0.1:9';
global.ENCRYPTION_KEYS = { 1: crypto.randomBytes(32).toString('hex') }; global.ACTIVE_KEY_VERSION = 1; global.ENCRYPTION_KEY = global.ENCRYPTION_KEYS[1];
let emails = 0;
const Module = require('module');
const load = Module._load;
Module._load = function (name, parent, ...rest) {
  if (/emailService/i.test(name)) return new Proxy({}, { get: () => async () => { emails++; return {}; } });
  if (/cloudinary|config\/redis/i.test(name)) return { isUsingPersistentRedis: () => false, getRedisClient: () => null, getCache: async () => null, setCache: async () => {} };
  return load.call(this, name, parent, ...rest);
};
const SERVER = path.resolve(__dirname, '../..');
const BINARY = process.env.MONGOMS_SYSTEM_BINARY || 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
const DAY = 86400000;

const call = (handler, req) => new Promise((resolve, reject) => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(body) { resolve({ status: this.statusCode, body }); return this; } };
  Promise.resolve(handler(req, res)).catch(reject);
});

async function main() {
  if (!fs.existsSync(BINARY)) return { skipped: 'MONGOD_BINARY_NOT_FOUND' };
  const version = cp.spawnSync(BINARY, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([0-9.]+)/)[1];
  const mongoose = require(path.join(SERVER, 'node_modules', 'mongoose'));
  const { MongoMemoryReplSet } = require(path.join(SERVER, 'node_modules', 'mongodb-memory-server'));
  const dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'medisync-alertupd-'));
  const replica = await MongoMemoryReplSet.create({ binary: { systemBinary: BINARY, version }, replSet: { count: 1, ip: '127.0.0.1', dbName: 'alertupd' }, instanceOpts: [{ ip: '127.0.0.1', dbPath }] });
  try {
    await mongoose.connect(replica.getUri('alertupd'), { serverSelectionTimeoutMS: 10000 });
    const db = mongoose.connection.db;
    const OutbreakAlert = require(path.join(SERVER, 'src/models/OutbreakAlert'));
    const service = require(path.join(SERVER, 'src/services/surveillanceService'));
    const views = require(path.join(SERVER, 'src/services/outbreakViews'));
    const controller = require(path.join(SERVER, 'src/controllers/alertController'));
    const alerts = OutbreakAlert.collection, cases = db.collection('consultations'), notes = db.collection('notifications'), audits = db.collection('auditlogs');
    await require(path.join(SERVER, 'src/models/AuditLog')).createCollection().catch(() => {});
    // Recipients: 2 doctors, 1 hospital, 1 administrator.
    await db.collection('doctors').insertMany(['1', '2'].map(i => ({ doctorId: `D${i}`, email: `d${i}@example.invalid`, licenseNo: `L${i}`, nic: `N${i}`, isActive: true })));
    await db.collection('hospitals').insertOne({ regNo: 'H1', email: 'h1@example.invalid', isActive: true });
    await db.collection('admins').insertOne({ isActive: true, role: 'admin', email: 'fixture@example.invalid' });
    const RECIPIENTS = 4;
    const ACTOR = { id: String(new mongoose.Types.ObjectId()), role: 'admin' };

    const now = new Date(), midnight = service.getColomboMidnight(now);
    let n = 0;
    const add = async (district, icd, daysAgo, count) => {
      const docs = [];
      for (let i = 0; i < count; i++) {
        const when = new Date(midnight - daysAgo * DAY + 9 * 3600000 + i * 60000);
        n++;
        docs.push({ _id: new mongoose.Types.ObjectId(), consultationId: `FIXTURE-${n}`, patientId: new mongoose.Types.ObjectId(), district, icdCode: icd, icdVersion: 'ICD-10', createdAt: when,
          surveillanceVerification: { status: 'verified', diagnosisStatus: 'confirmed', source: 'clinical_review', verifiedBy: 'fixture-reviewer', verifiedAt: when, episodeId: `EP-${n}`, caseDefinitionReference: 'fixture' } });
      }
      if (docs.length) await cases.insertMany(docs);
      return docs.map(d => d._id);
    };
    const baseline = async (district, icd) => { for (let d = 8; d <= 63; d++) await add(district, icd, d, 1); }; // one case a day: mean 1, so 4 in a day is High and 5 is Critical
    const sockets = [];
    const io = { emitToVerifiedUser: async () => { sockets.push('user'); }, emitToVerifiedAdmins: async () => { sockets.push('admins'); } };
    const scan = (extra = {}) => service.runAnalysis({ mode: 'real', io, actor: ACTOR, ...extra });
    const of = (location, disease = 'ICD10:A90') => alerts.find({ location, disease }).sort({ createdAt: 1 }).toArray();
    const digest = async (collection, filter = {}) => { const h = crypto.createHash('sha256'); for await (const d of collection.find(filter).sort({ _id: 1 })) h.update(JSON.stringify(d)); return h.digest('hex'); };
    const view = a => a && ({ id: String(a._id), status: a.status, affectedCount: a.affectedCount, severity: a.severity, alertLevel: a.alertLevel, updateCount: a.updateCount, history: (a.updateHistory || []).length,
      first: a.firstDetectedAt && +a.firstDetectedAt, last: a.lastUpdatedAt && +a.lastUpdatedAt, created: a.createdAt && +a.createdAt, actual72h: a.latest72h ? a.latest72h.actual72h : null, hasFirstSnapshot: Boolean(a.projection72h) });
    const out = { label: 'fixture data only, in-memory database', mongod: version, recipients: RECIPIENTS };

    // 1. First scan creates one alert.
    await baseline('Colombo', 'A90'); await add('Colombo', 'A90', 3, 4); await add('Colombo', 'A90', 2, 4);
    const s1 = await scan();
    let [a] = await of('Colombo');
    out.first = { saved: s1.saved, alerts: (await of('Colombo')).length, alert: view(a), notifications: await notes.countDocuments() };

    // 2. Identical data changes nothing.
    const d0 = await digest(alerts), n0 = await notes.countDocuments(), k0 = sockets.length, u0 = await audits.countDocuments();
    const s2 = await scan();
    out.identical = { saved: s2.saved, alertsUnchanged: (await digest(alerts)) === d0, newNotifications: await notes.countDocuments() - n0, newSockets: sockets.length - k0, newAudits: await audits.countDocuments() - u0 };

    // 3. More cases, same severity: same alert, no notification.
    const extra = await add('Colombo', 'A90', 4, 2);
    await new Promise(r => setTimeout(r, 5));
    const s3 = await scan();
    [a] = await of('Colombo');
    out.sameSeverity = { saved: s3.saved, alerts: (await of('Colombo')).length, alert: view(a), entry: a.updateHistory[0], newNotifications: await notes.countDocuments() - n0, newSockets: sockets.length - k0, audits: await audits.countDocuments() - u0 };

    // 4. Severity rises: exactly one notification per recipient; a repeat scan adds none.
    await add('Colombo', 'A90', 1, 6);
    const s4 = await scan();
    [a] = await of('Colombo');
    const afterEsc = await notes.countDocuments();
    const titles = await notes.distinct('title', { referenceId: { $regex: ':update-' } });
    await scan();
    out.escalation = { saved: s4.saved, alerts: (await of('Colombo')).length, alert: view(a), newNotifications: afterEsc - n0, references: (await notes.distinct('referenceId')).length, titles, afterRepeat: await notes.countDocuments() - afterEsc };

    // 5. A smaller window result never lowers the displayed count.
    const before5 = a.affectedCount;
    await cases.deleteMany({ _id: { $in: extra } });
    const s5 = await scan();
    [a] = await of('Colombo');
    out.lowerWindow = { saved: s5.saved, before: before5, alert: view(a), entry: a.updateHistory[a.updateHistory.length - 1] };

    // 6. An approved (Active) alert is also updated.
    await alerts.updateOne({ _id: a._id }, { $set: { status: 'Active' } });
    await add('Colombo', 'A90', 1, 1);
    const s6 = await scan();
    [a] = await of('Colombo');
    out.approved = { saved: s6.saved, alerts: (await of('Colombo')).length, status: a.status, updateCount: a.updateCount };

    // 7. Closed alerts are never changed; unchanged data makes no new alert; one new case does.
    out.closed = {};
    for (const status of ['Resolved', 'Dismissed']) {
      const open = (await of('Colombo')).find(x => ['Pending', 'Active'].includes(x.status));
      await alerts.updateOne({ _id: open._id }, { $set: { status, updatedAt: new Date() } });
      const closedDigest = await digest(alerts, { _id: open._id });
      const total = (await of('Colombo')).length;
      const same = await scan();
      const afterSame = (await of('Colombo')).length;
      await add('Colombo', 'A90', 1, 1);
      const more = await scan();
      const list = await of('Colombo');
      const fresh = list.find(x => ['Pending', 'Active'].includes(x.status));
      out.closed[status] = { sameData: same.saved, newAlertsSameData: afterSame - total, newData: more.saved, newAlertsNewData: list.length - afterSame, closedUnchanged: (await digest(alerts, { _id: open._id })) === closedDigest, newId: fresh && String(fresh._id) !== String(open._id), freshHistory: fresh && (fresh.updateHistory || []).length };
    }

    // 8. Another district and another disease are separate alerts.
    await baseline('Galle', 'A90'); await add('Galle', 'A90', 3, 4); await add('Galle', 'A90', 2, 4);
    await baseline('Colombo', 'A09'); await add('Colombo', 'A09', 3, 4); await add('Colombo', 'A09', 2, 4);
    const s8 = await scan();
    out.separate = { saved: s8.saved, galle: (await of('Galle')).length, colomboOther: (await of('Colombo', 'ICD10:A09')).length };

    // 9. Scans at the same moment: one new alert, then one update.
    await baseline('Kandy', 'A90'); await add('Kandy', 'A90', 3, 4); await add('Kandy', 'A90', 2, 4);
    const nBefore = await notes.countDocuments();
    const c1 = await Promise.all([scan(), scan(), scan(), scan(), scan()]);
    const kandy = await of('Kandy');
    const created = { total: c1.reduce((x, r) => x + r.saved.created, 0), alerts: kandy.length, notifications: await notes.countDocuments() - nBefore };
    await add('Kandy', 'A90', 1, 2);
    const c2 = await Promise.all([scan(), scan(), scan(), scan(), scan()]);
    const kandy2 = await of('Kandy');
    out.concurrent = { created, updates: c2.reduce((x, r) => x + r.saved.updated, 0), alertsAfter: kandy2.length, history: kandy2[0].updateHistory.length, updateCount: kandy2[0].updateCount };
    // Same moment but different data: one scan sees a case that the other does not.
    await baseline('Matale', 'A90'); await add('Matale', 'A90', 3, 4); await add('Matale', 'A90', 2, 4);
    await Promise.all([scan(), add('Matale', 'A90', 1, 1).then(() => scan())]);
    out.concurrent.differentData = (await of('Matale')).length;

    // 10. Alerts saved before this feature: no new fields, and an old duplicate pair.
    await baseline('Jaffna', 'A90'); await add('Jaffna', 'A90', 3, 4); await add('Jaffna', 'A90', 2, 4);
    const base = { surveillancePolicy: service.POLICY, isSimulation: false, disease: 'ICD10:A90', location: 'Jaffna', severity: 'High', status: 'Pending', affectedCount: 3, sourceConsultationIds: [] };
    const older = { _id: new mongoose.Types.ObjectId(), ...base, createdAt: new Date(+now - 10 * DAY), updatedAt: new Date(+now - 10 * DAY) };
    const newer = { _id: new mongoose.Types.ObjectId(), ...base, createdAt: new Date(+now - 5 * DAY), updatedAt: new Date(+now - 5 * DAY) };
    await alerts.insertMany([older, newer]);
    const olderDigest = await digest(alerts, { _id: older._id });
    const s10 = await scan();
    const upd = await alerts.findOne({ _id: newer._id });
    out.legacy = { saved: s10.saved, alerts: (await of('Jaffna')).length, olderUntouched: (await digest(alerts, { _id: older._id })) === olderDigest, updated: view(upd), firstEqualsCreated: +upd.firstDetectedAt === +newer.createdAt, createdAtKept: +upd.createdAt === +newer.createdAt, noFirstSnapshotInvented: !upd.projection72h };

    // 11. 14-day rule: an updated alert keeps its original boundary, and every alert is in exactly one list.
    const edge = [['Badulla', 13 * DAY + 23 * 3600000, 'monitor'], ['Ampara', 14 * DAY + 3600000, 'history']];
    for (const [district, age] of edge) {
      await baseline(district, 'A90'); await add(district, 'A90', 3, 4); await add(district, 'A90', 2, 4);
      await alerts.insertOne({ ...base, _id: new mongoose.Types.ObjectId(), location: district, createdAt: new Date(+now - age), updatedAt: new Date(+now - age) });
    }
    const s11 = await scan();
    await alerts.insertMany([ // dates that differ: firstDetectedAt decides
      { ...base, _id: new mongoose.Types.ObjectId(), location: 'Mannar', firstDetectedAt: new Date(+now - 20 * DAY), createdAt: new Date(+now - DAY), updatedAt: now },
      { ...base, _id: new mongoose.Types.ObjectId(), location: 'Vavuniya', firstDetectedAt: new Date(+now - 2 * DAY), createdAt: new Date(+now - 30 * DAY), updatedAt: now },
    ]);
    const req = query => ({ query, params: {}, user: { id: ACTOR.id, role: 'admin' }, app: { get: () => null }, headers: {}, ip: '127.0.0.1' });
    const monitor = (await call(controller.getActiveAlerts, req({ limit: '100' }))).body, history = (await call(controller.getActiveAlerts, req({ view: 'history', limit: '100' }))).body;
    const inM = new Set(monitor.data.map(x => String(x._id))), inH = new Set(history.data.map(x => String(x._id)));
    const all = await alerts.find().toArray();
    const listOf = district => (monitor.data.some(x => x.location === district) ? 'monitor' : history.data.some(x => x.location === district) ? 'history' : 'none');
    out.boundary = { updatedThere: s11.saved.updated, placement: Object.fromEntries([...edge.map(e => e[0]), 'Mannar', 'Vavuniya'].map(d => [d, listOf(d)])),
      updateCounts: Object.fromEntries((await alerts.find({ location: { $in: ['Badulla', 'Ampara'] } }).toArray()).map(x => [x.location, x.updateCount])) };
    out.partition = { total: all.length, both: all.filter(x => inM.has(String(x._id)) && inH.has(String(x._id))).length, none: all.filter(x => !inM.has(String(x._id)) && !inH.has(String(x._id))).length,
      jsRuleAgrees: all.every(x => views.isMonitorAlert(x, now) === inM.has(String(x._id))) };
    const row = monitor.data.find(x => x.location === 'Kandy'), oldRow = monitor.data.find(x => String(x._id) === String(older._id));
    out.api = { row: { firstDetectedAt: Boolean(row.firstDetectedAt), lastUpdatedAt: Boolean(row.lastUpdatedAt), updateCount: row.updateCount, history: row.updateHistory.length, latest: row.alert72h.actual72h === row.latest72h.actual72h, first: Boolean(row.alert72hFirst), caveat: row.alert72h.caveat },
      oldRow: { listed: Boolean(oldRow), hasNewFields: ['firstDetectedAt', 'lastUpdatedAt', 'updateCount', 'updateHistory'].some(k => k in oldRow) }, monitorSorted: monitor.data.every((x, i, l) => i === 0 || +new Date(l[i - 1].createdAt) >= +new Date(x.createdAt)),
      historyHasIds: history.data.some(x => 'sourceConsultationIds' in x) };

    // 12. Audit: one entry per update, with before and after.
    const entries = await audits.find({ action: 'ALERT_UPDATED_BY_SCAN' }).toArray();
    const updates = (await alerts.find().toArray()).reduce((x, d) => x + (d.updateCount || 0), 0);
    out.audit = { entries: entries.length, updates, sample: entries[0] && { actorId: entries[0].actorId === ACTOR.id, actorRole: entries[0].actorRole, details: entries[0].details } };
    const scheduled = await add('Kandy', 'A90', 1, 1).then(() => service.runAnalysis({ mode: 'real' }));
    const last = await audits.find({ action: 'ALERT_UPDATED_BY_SCAN' }).sort({ _id: -1 }).limit(1).next();
    out.scheduled = { saved: scheduled.saved.updated, actor: last.actorId, role: last.actorRole, triggeredBy: last.details.triggeredBy };
    out.emails = emails;
    out.indexes = (await alerts.indexes()).map(i => JSON.stringify(i.key));
    return out;
  } finally {
    await mongoose.disconnect().catch(() => {});
    await replica.stop().catch(() => {});
    fs.rmSync(dbPath, { recursive: true, force: true });
  }
}

if (require.main === module) main().then(r => { console.log(JSON.stringify(r)); process.exit(0); }).catch(e => { console.error(e.stack); process.exit(1); });
module.exports = { main };
