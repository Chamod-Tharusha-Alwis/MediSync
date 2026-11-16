'use strict';
/**
 * server/scripts/demo/prove_offline.cjs - Phase 3 offline proof for the synthetic demonstration seed.
 *
 * Runs ONLY against a loopback MongoMemoryReplSet started from the locally installed mongod (no
 * download, no Atlas) and a locally served copy of the unchanged ml-engine/app.py. It never reads .env.
 * It seeds the bulk plan, runs the real surveillance scan (runAnalysis, mode 'real'), runs the live demo,
 * scans again, runs cleanDemo and checks that every pre-existing record is untouched.
 *
 * Usage (from the repository root):  node server/scripts/demo/prove_offline.cjs
 * Writes docs/demo/OFFLINE_PROOF.json and server/scripts/demo/storage_measurement.json.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
const { performance } = require('perf_hooks');

const SERVER = path.resolve(__dirname, '../..');
const ROOT = path.resolve(SERVER, '..');
for (const k of ['MONGO_URI', 'MONGO_URI_TEST', 'MONGODB_URI', 'REDIS_URL']) if (process.env[k]) throw new Error(`REFUSING: ${k} is set; this proof runs only in memory`);
process.env.EMAIL_PROVIDER = 'none';

// Notification and e-mail providers are denied: an alert must never leave this process.
const Module = require('module');
const load = Module._load;
Module._load = function (name, ...rest) {
  if (/emailService|notificationService|cloudinary|resend|brevo|config\/redis/i.test(name)) throw new Error('PROVIDER_IMPORT_DENIED_IN_PROOF');
  return load.call(this, name, ...rest);
};

const plan = require('./demoSeedPlan.cjs');
const store = require('./demoStore.cjs');
const REFERENCE = '2026-11-17'; // Tuesday: bulk seed day in the runbook
const LIVE_DAY = '2026-11-18'; // Wednesday: viva day
const scanNow = day => new Date(plan.referenceMidnight(day) + 12 * 3600000); // 12:00 Colombo

function startMlEngine(apiKey) {
  const python = process.env.MEDISYNC_PYTHON || path.join(ROOT, 'ml-engine', '.venv', 'Scripts', 'python.exe');
  const port = 15000 + Math.floor(Math.random() * 2000);
  const child = cp.spawn(python, [path.join(__dirname, 'ml_engine_local.py'), String(port)], { env: { ...process.env, INTERNAL_API_KEY: apiKey }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  return new Promise((resolve, reject) => {
    let err = '';
    const timer = setTimeout(() => reject(new Error(`ML engine did not start: ${err.slice(-400)}`)), 120000);
    child.stdout.on('data', d => { if (String(d).includes('ML_ENGINE_READY')) { clearTimeout(timer); resolve({ child, url: `http://127.0.0.1:${port}` }); } });
    child.stderr.on('data', d => { err += d; });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`ML engine exited ${code}: ${err.slice(-400)}`)); });
  });
}

const digestOf = docs => crypto.createHash('sha256').update(JSON.stringify(docs)).digest('hex');

async function main() {
  const t0 = performance.now();
  const evidence = { label: plan.LABEL, referenceDate: REFERENCE, liveDay: LIVE_DAY, seed: plan.SEED };
  const binary = process.env.MONGOMS_SYSTEM_BINARY || 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
  if (!fs.existsSync(binary)) throw new Error('MONGOD_BINARY_NOT_FOUND (no download is attempted)');
  const version = cp.spawnSync(binary, ['--version'], { encoding: 'utf8', windowsHide: true }).stdout.match(/db version v([0-9.]+)/)[1];
  const apiKey = crypto.randomBytes(32).toString('hex');
  process.env.INTERNAL_API_KEY = apiKey;
  global.ENCRYPTION_KEYS = { 1: crypto.randomBytes(32).toString('hex') }; global.ACTIVE_KEY_VERSION = 1; global.ENCRYPTION_KEY = global.ENCRYPTION_KEYS[1];

  const mongoose = require(path.join(SERVER, 'node_modules', 'mongoose'));
  const { MongoMemoryReplSet } = require(path.join(SERVER, 'node_modules', 'mongodb-memory-server'));
  const dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'medisync-demo-proof-'));
  const replica = new MongoMemoryReplSet({ binary: { systemBinary: binary, version }, replSet: { count: 1, ip: '127.0.0.1', dbName: 'medisync_demo_proof' }, instanceOpts: [{ ip: '127.0.0.1', dbPath }] });
  let ml;
  try {
    await replica.start();
    const uri = replica.getUri('medisync_demo_proof');
    if (new URL(uri).hostname !== '127.0.0.1') throw new Error('NOT_LOOPBACK');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    const db = mongoose.connection.db;
    evidence.database = { host: '127.0.0.1 (MongoMemoryReplSet, local mongod ' + version + ')', name: db.databaseName };
    const models = ['Consultation', 'Patient', 'Doctor', 'Hospital', 'OutbreakAlert', 'OutbreakScan'].map(n => require(path.join(SERVER, 'src', 'models', n)));
    for (const M of models) { await M.createCollection().catch(() => {}); await M.createIndexes(); }

    ml = await startMlEngine(apiKey);
    process.env.ML_ENGINE_URL = ml.url;
    evidence.mlEngine = 'unchanged ml-engine/app.py served on 127.0.0.1 (random internal key, temporary SQLite)';

    // Pre-existing records that cleanDemo must not touch: unflagged records and records of the same batch
    // written by the other viva seeder (different identifiers).
    const ctrl = { consultations: [], patients: [], doctors: [], hospitals: [], outbreakalerts: [] };
    for (let i = 0; i < 300; i++) ctrl.consultations.push({ consultationId: `CTRL-UNFLAGGED-${i}`, district: 'Colombo', diagnosis: 'Control', icdCode: 'A90', icdVersion: 'ICD-10', patientNic: '200000000000', createdAt: new Date('2026-10-01T05:00:00Z') });
    for (let i = 0; i < 20; i++) ctrl.consultations.push({ consultationId: `viva-2026-11-outbreaks-CON-${String(i).padStart(4, '0')}`, district: 'Gampaha', diagnosis: 'Control', icdCode: 'A90', icdVersion: 'ICD-10', isSynthetic: true, syntheticSeedBatch: plan.BATCH_TAG, createdAt: new Date('2026-10-01T05:00:00Z') });
    for (let i = 0; i < 10; i++) ctrl.patients.push({ nic: `20000000${String(i).padStart(4, '0')}`, fullName: `Control ${i}`, email: `control.${i}@example.invalid` });
    ctrl.patients.push({ nic: '999000000001', fullName: 'Surveillance Case Subject 1', email: 'viva.outbreak.patient.1@qa.medisync.local', isSynthetic: true, syntheticSeedBatch: plan.BATCH_TAG });
    ctrl.doctors.push({ doctorId: 'DOC-CONTROL-1', fullName: 'Control Doctor', email: 'control.doctor@example.invalid', licenseNo: 'X' }, { doctorId: `${plan.BATCH_TAG}-DOC-01`, fullName: 'Other viva seed doctor', email: 'dr.kasun.outbreaks@qa.medisync.local', licenseNo: 'Y', isSynthetic: true, syntheticSeedBatch: plan.BATCH_TAG });
    ctrl.hospitals.push({ regNo: 'CONTROL-HOSP-1', name: 'Control Hospital', email: 'control.hospital@example.invalid' }, { regNo: 'VIVA-OUTBREAK-HOSP-01', name: 'Other viva seed hospital', email: 'viva.outbreak.hosp.01@qa.medisync.local', isSynthetic: true, syntheticSeedBatch: plan.BATCH_TAG });
    ctrl.outbreakalerts.push({ disease: 'ICD10:A90', district: 'Gampaha', status: 'Pending', isSynthetic: true, isDemoData: true, syntheticSeedBatch: plan.BATCH_TAG, sourceConsultationIds: ['000000000000000000000001'] }, { disease: 'ICD10:A01', district: 'Colombo', status: 'Approved', isSimulation: false });
    for (const [c, docs] of Object.entries(ctrl)) if (docs.length) await db.collection(c).insertMany(docs);
    const controlSnapshot = async () => { const out = {}; for (const c of Object.keys(ctrl)) out[c] = digestOf(await db.collection(c).find({ _id: { $in: (await db.collection(c).find({}, { projection: { _id: 1 } }).toArray()).map(d => d._id).filter(id => controlIds[c].has(String(id))) } }).sort({ _id: 1 }).toArray()); return out; };
    const controlIds = Object.fromEntries(await Promise.all(Object.keys(ctrl).map(async c => [c, new Set((await db.collection(c).find({}, { projection: { _id: 1 } }).toArray()).map(d => String(d._id)))])));
    const startCounts = await store.countAll(db);
    const controlBefore = await controlSnapshot();
    evidence.startCounts = startCounts;

    // 1. Seed bulk batch and scan.
    const bulk = plan.buildBulkPlan({ referenceDate: REFERENCE });
    const bcrypt = require(path.join(SERVER, 'node_modules', 'bcryptjs'));
    const passwordHash = await bcrypt.hash(crypto.randomBytes(48).toString('hex'), 12);
    let t = performance.now();
    const written = await store.writePlan(db, bulk, { passwordHash });
    evidence.bulkWrite = { ...written, planTotal: bulk.total, planDigest: bulk.digest, seconds: +((performance.now() - t) / 1000).toFixed(2) };
    const again = await store.writePlan(db, bulk, { passwordHash });
    evidence.bulkRewriteIdempotent = again;
    const everyFlagged = await db.collection('consultations').countDocuments({ ...store.SELECTORS.consultations, $or: [{ syntheticSeedBatch: { $ne: plan.BATCH_TAG } }, { isSynthetic: { $ne: true } }] });
    evidence.unflaggedDemoConsultations = everyFlagged;

    // Storage: as written, then the same documents with the Consultation model's field encryption applied.
    const asWritten = await store.measureConsultationBytes(db);
    const seedOnly = await db.collection('consultations').find(store.SELECTORS.consultations).toArray();
    const Consultation = models[0];
    const enc = db.collection('consultations_encrypted_probe');
    await enc.insertMany(seedOnly.map(({ _id, ...d }) => { const m = new Consultation(d); m.encryptFieldsSync(); const o = m.toObject(); delete o._id; return o; }));
    for (const [keys, options] of Consultation.schema.indexes()) await enc.createIndex(keys, { unique: !!options.unique, sparse: !!options.sparse });
    const es = await db.command({ collStats: 'consultations_encrypted_probe' });
    await enc.drop();
    const seedStats = { count: seedOnly.length, bytes: seedOnly.reduce((n, d) => n + Buffer.byteLength(JSON.stringify(d)), 0) };
    const parents = await db.command({ collStats: 'patients' });
    const used = Math.max(asWritten.bytesPerConsultation, (es.size + es.totalIndexSize) / es.count);
    const measurement = { label: plan.LABEL, measuredOn: new Date().toISOString().slice(0, 10), mongod: version,
      asWritten: { count: asWritten.count, size: asWritten.size, totalIndexSize: asWritten.totalIndexSize, bytesPerConsultation: +asWritten.bytesPerConsultation.toFixed(1) },
      encryptedForm: { count: es.count, size: es.size, totalIndexSize: es.totalIndexSize, bytesPerConsultation: +((es.size + es.totalIndexSize) / es.count).toFixed(1) },
      bytesPerConsultationUsed: +used.toFixed(1), bytesPerParentDocument: +((parents.size + parents.totalIndexSize) / parents.count).toFixed(1),
      note: 'collStats size (uncompressed BSON) + totalIndexSize, averaged over the collection; the larger of the two forms is used for projections.' };
    fs.writeFileSync(path.join(__dirname, 'storage_measurement.json'), JSON.stringify(measurement, null, 2) + '\n');
    const totalMb = (bulk.total * used + measurement.bytesPerParentDocument * (written.patients.inserted + written.doctors.inserted + written.hospitals.inserted)) / 1048576;
    evidence.storage = { ...measurement, projectedBulkMb: +totalMb.toFixed(2), capMb: plan.STORAGE_CAP_MB, atlasFreeTierMb: plan.ATLAS_FREE_TIER_MB, seedOnlyJsonBytes: seedStats };

    const { runAnalysis } = require(path.join(SERVER, 'src', 'services', 'surveillanceService'));
    const scan = async (day) => {
      const s = performance.now();
      const res = await runAnalysis({ mode: 'real', now: scanNow(day) });
      for (const a of await db.collection('outbreakalerts').find({}, { projection: { sourceConsultationIds: 1 } }).toArray()) storedSources.set(String(a._id), (a.sourceConsultationIds || []).length);
      return { seconds: +((performance.now() - s) / 1000).toFixed(2), res };
    };
    const storedSources = new Map();
    const describe = r => ({ district: r.district, disease: r.disease, severity: r.severity, count: r.count ?? r.latest_actual, maxZ: r.maxZ ?? null,
      consecutiveDays: r.consecutiveDays ?? null, path: r.dailyCounts ? 'rule' : 'ml-heuristic', sourceConsultations: storedSources.get(r.alertId),
      status: r.status, isSynthetic: r.isSynthetic === true, label: r.syntheticLabel || null });
    const s1 = await scan(REFERENCE);
    evidence.scanBulk = { day: REFERENCE, seconds: s1.seconds, casesScanned: s1.res.consultations_analysed, excluded: s1.res.excluded,
      alerts: s1.res.results.map(describe), suppressedScenarioBuckets: s1.res.suppressed.filter(x => ['Anuradhapura', 'Hambantota'].includes(x.district)) };
    const s1b = await scan(LIVE_DAY);
    evidence.scanBulkNextDay = { day: LIVE_DAY, seconds: s1b.seconds, casesScanned: s1b.res.consultations_analysed, alerts: s1b.res.results.map(describe) };

    // 2. Live demo on the viva day, then one scan.
    const live = plan.buildLivePlan({ referenceDate: LIVE_DAY });
    evidence.liveWrite = await store.writePlan(db, live, { passwordHash });
    evidence.liveRewriteIdempotent = await store.writePlan(db, live, { passwordHash });
    const s2 = await scan(LIVE_DAY);
    const liveAlert = s2.res.results.find(r => r.district === live.district);
    const liveDoc = liveAlert ? await db.collection('outbreakalerts').findOne({ _id: new mongoose.Types.ObjectId(liveAlert.alertId) }) : null;
    evidence.scanLive = { day: LIVE_DAY, seconds: s2.seconds, casesScanned: s2.res.consultations_analysed, liveCasesAdded: live.total, alerts: s2.res.results.map(describe),
      liveAlert: liveDoc ? { id: String(liveDoc._id), status: liveDoc.status, location: liveDoc.location, disease: liveDoc.disease, severity: liveDoc.severity,
        affectedCount: liveDoc.affectedCount, scanMaxZ: liveAlert.maxZ, scanConsecutiveDays: liveAlert.consecutiveDays, scanDailyCounts: liveAlert.dailyCounts, message: liveDoc.message,
        sourceConsultationCount: (liveDoc.sourceConsultationIds || []).length, isSynthetic: liveDoc.isSynthetic, isDemoData: liveDoc.isDemoData, syntheticLabel: liveDoc.syntheticLabel } : null };

    // 3. Clean-up.
    evidence.cleanDryRun = await store.cleanDemo(db, { confirm: false });
    evidence.clean = await store.cleanDemo(db, { confirm: true });
    const endCounts = await store.countAll(db);
    const controlAfter = await controlSnapshot();
    evidence.endCounts = endCounts;
    evidence.countsReturnedToStart = Object.keys(startCounts).every(c => startCounts[c] === endCounts[c]);
    evidence.controlRecordsUnchanged = JSON.stringify(controlBefore) === JSON.stringify(controlAfter);
    evidence.remainingDemoConsultations = await db.collection('consultations').countDocuments(store.SELECTORS.consultations);
    evidence.totalSeconds = +((performance.now() - t0) / 1000).toFixed(1);
    fs.writeFileSync(path.join(ROOT, 'docs', 'demo', 'OFFLINE_PROOF.json'), JSON.stringify(evidence, null, 2) + '\n');
    return evidence;
  } finally {
    if (ml) ml.child.kill();
    await mongoose.disconnect().catch(() => {});
    await replica.stop().catch(() => {});
    fs.rmSync(dbPath, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().then(e => {
    const p = x => console.log(x);
    p(`Offline proof (${e.label}); database ${e.database.host}; ML engine: ${e.mlEngine}`);
    p(`start counts ${JSON.stringify(e.startCounts)}`);
    p(`bulk write: ${JSON.stringify(e.bulkWrite)}`);
    p(`bulk re-run (idempotent): consultations ${JSON.stringify(e.bulkRewriteIdempotent.consultations)}`);
    p(`demo consultations lacking batch tag or isSynthetic: ${e.unflaggedDemoConsultations}`);
    p(`storage: as written ${e.storage.asWritten.bytesPerConsultation} B/consultation, encrypted form ${e.storage.encryptedForm.bytesPerConsultation} B; used ${e.storage.bytesPerConsultationUsed} B -> projected bulk ${e.storage.projectedBulkMb} MB (cap ${e.storage.capMb} MB; Atlas M0 limit ${e.storage.atlasFreeTierMb} MB)`);
    for (const [k, s] of [['SCAN after bulk seed', e.scanBulk], ['SCAN next day (no live demo yet)', e.scanBulkNextDay], ['SCAN after live demo', e.scanLive]]) {
      p(`${k}, day ${s.day}: ${s.seconds} s, ${s.casesScanned ?? ''} verified cases scanned, ${s.alerts.length} alert(s)`);
      for (const a of s.alerts) p(`   ${a.path.padEnd(12)} ${a.district} ${a.disease} severity=${a.severity} n7=${a.count} maxZ=${a.maxZ} consecutive=${a.consecutiveDays} sources=${a.sourceConsultations} status=${a.status} synthetic=${a.isSynthetic}`);
    }
    p(`scenario buckets suppressed by the rule: ${JSON.stringify(e.scanBulk.suppressedScenarioBuckets.map(x => [x.district, x.disease, x.reason, x.count, x.maxZ, x.maxConsecutiveDays]))}`);
    p(`live alert: ${JSON.stringify(e.scanLive.liveAlert)}`);
    p(`clean: matched ${JSON.stringify(e.clean.matched)} deleted ${JSON.stringify(e.clean.deleted)} mixedAlertsLeft ${JSON.stringify(e.clean.mixedAlertsLeft)} unflaggedRemoved ${e.clean.unflaggedRemoved}`);
    p(`end counts ${JSON.stringify(e.endCounts)}; counts returned to start: ${e.countsReturnedToStart}; control records unchanged: ${e.controlRecordsUnchanged}; demo consultations left: ${e.remainingDemoConsultations}`);
    p(`total ${e.totalSeconds} s`);
    process.exit(0);
  }).catch(err => { console.error('PROOF FAILED:', err.stack || err.message); process.exit(1); });
}

module.exports = { main };
