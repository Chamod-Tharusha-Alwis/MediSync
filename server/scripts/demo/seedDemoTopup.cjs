'use strict';
/**
 * server/scripts/demo/seedDemoTopup.cjs — one safe, idempotent command that tops up the SYNTHETIC viva demo data
 * (docs/evidence/viva/seeding/SEEDING_GUIDE.md). It reuses demoSeedPlan.cjs and edits no existing seeder.
 *
 *   npm run seed:demo -- --batch=run1                                   dry run (default): counts and size, writes nothing
 *   npm run seed:demo -- --batch=run1 --write --allow-synthetic-consultations
 *   npm run seed:demo -- --batch=run1 --rollback                        dry run of the rollback
 *   npm run seed:demo -- --batch=run1 --rollback --write
 *
 * Target: env SEED_DEMO_URI (default mongodb://127.0.0.1:27017/medisync_demo_seed). A host that is not this computer needs
 * --confirm-production AND every host listed in env SEED_DEMO_ALLOWED_HOSTS (comma separated). No .env file is read.
 *
 * Only inserts documents labelled seedBatch, isSynthetic:true and syntheticSeedBatch. It never updates an existing
 * document and never reads or writes accounts, users, prescriptions, audit logs or encrypted fields. It inserts synthetic
 * rows in `consultations`, because the detector reads cases from nowhere else: that is why
 * --allow-synthetic-consultations must be given. Old-alert examples go to `outbreakalerts`.
 */
const crypto = require('crypto');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const SERVER = path.join(ROOT, 'server');
const mongoose = require(path.join(SERVER, 'node_modules', 'mongoose'));
const seedPlan = require('./demoSeedPlan.cjs');

const { BSON, MongoClient, ObjectId } = mongoose.mongo;
const { DAY_MS, BATCH_TAG } = seedPlan;
const DAYS = 70;
const PREFIX = `${BATCH_TAG}-TOPUP-`;
const LABEL = 'Synthetic demonstration data for the viva. Not a real patient, not a real case.';
const CAP_MB = 300;
const FREE_TIER_MB = 512;
const INDEX_BYTES_PER_DOC = 400; // allowance for the collection's indexes
const CHUNK = 500;
const MB = 1024 * 1024;
const DEFAULT_URI = 'mongodb://127.0.0.1:27017/medisync_demo_seed';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
// At most three planted episodes, in district and disease pairs that no existing seed uses. Index 0 is the first day.
const EPISODES = Object.freeze([
  { id: 'TOPUP-1', district: 'Matara', disease: 'dengue', added: [5, 7, 9, 10, 10, 9, 8] },
  { id: 'TOPUP-2', district: 'Polonnaruwa', disease: 'leptospirosis', added: [1, 2, 1, 1, 1, 1, 1] },
  { id: 'TOPUP-3', district: 'Jaffna', disease: 'diarrhoeal', added: [1, 2, 2, 2, 2, 1, 1] },
]);
const EPISODE_START_DAYS_AGO = 4;
// Old, closed example alerts so that the History page has rows. They are labelled as NOT produced by a detector scan.
const HISTORY_ALERTS = Object.freeze([
  { key: 'H1', district: 'Trincomalee', disease: 'dengue', daysAgo: 21, status: 'Resolved', severity: 'High', count: 24 },
  { key: 'H2', district: 'Kalutara', disease: 'leptospirosis', daysAgo: 33, status: 'Resolved', severity: 'Moderate', count: 11 },
  { key: 'H3', district: 'Batticaloa', disease: 'influenza', daysAgo: 47, status: 'Dismissed', severity: 'Moderate', count: 9 },
]);

const hexId = (...parts) => new ObjectId(crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24));
const conditionOf = key => seedPlan.diseaseByKey.get(key).condition;
const icdKey = code => String(code || '').toUpperCase().replace('.', '');
const comboKey = (district, icd, date) => `${district}|${icdKey(icd)}|${date}`;

class SeedError extends Error {}

// ---------------------------------------------------------------- arguments and target
function parseArgs(argv) {
  const known = new Set(['batch', 'write', 'dry-run', 'rollback', 'confirm-production', 'allow-synthetic-consultations', 'flush-cache', 'backup-dir', 'today']);
  const args = {};
  for (const raw of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(raw);
    if (!m || !known.has(m[1])) throw new SeedError(`UNKNOWN_ARGUMENT: ${raw}`);
    args[m[1]] = m[2] === undefined ? true : m[2];
  }
  if (typeof args.batch !== 'string' || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(args.batch)) throw new SeedError('BATCH_REQUIRED: --batch=<lower-case letters, digits, hyphens; 2 to 40 characters>');
  if (args.write && args['dry-run']) throw new SeedError('CHOOSE_ONE: --write or --dry-run');
  return args;
}

function resolveTarget(env, args) {
  const { ConnectionString } = require(path.join(SERVER, 'node_modules', 'mongodb-connection-string-url'));
  const uri = env.SEED_DEMO_URI || DEFAULT_URI;
  let parsed;
  try { parsed = new ConnectionString(uri); } catch (_) { throw new SeedError('SEED_DEMO_URI_INVALID'); } // the value is never printed
  const hosts = parsed.hosts.map(h => h.replace(/:\d+$/, '').toLowerCase());
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!dbName) throw new SeedError('DATABASE_NAME_REQUIRED in SEED_DEMO_URI');
  const local = !parsed.isSRV && hosts.every(h => LOCAL_HOSTS.has(h));
  if (!local) {
    if (!args['confirm-production']) throw new SeedError('REFUSED: the target is not this computer and --confirm-production was not given');
    const allowed = String(env.SEED_DEMO_ALLOWED_HOSTS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!allowed.length || !hosts.every(h => allowed.includes(h))) throw new SeedError('REFUSED: target host is not in SEED_DEMO_ALLOWED_HOSTS');
    if (args.today) throw new SeedError('REFUSED: --today is only for local tests');
  }
  return { uri, dbName, local, hosts };
}

// ---------------------------------------------------------------- plan (pure, deterministic)
function buildRows({ todayMidnight, episodeStarts }) {
  // Asking for a reference date 70 days ahead keeps every date we use outside the seed's own planted scenarios, so the
  // rows are the plain weekly-seasonal background, identical to the existing background for the same calendar days.
  const far = seedPlan.buildBulkPlan({ referenceDate: seedPlan.isoDate(todayMidnight + DAYS * DAY_MS) });
  const groups = new Map();
  const add = (district, disease, date, time, patientIndex, episode) => {
    const key = comboKey(district, conditionOf(disease).icdCode, date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ district, disease, date, time, patientIndex, episode });
  };
  const first = todayMidnight - DAYS * DAY_MS;
  for (const r of far.rows) if (r.time >= first && r.time < todayMidnight) add(r.district, r.disease, r.date, r.time, r.patientIndex, null);
  for (const ep of EPISODES) {
    const start = episodeStarts[ep.id];
    ep.added.forEach((count, i) => {
      const midnight = start + i * DAY_MS;
      if (midnight < first || midnight >= todayMidnight) return;
      for (let n = 0; n < count; n++) add(ep.district, ep.disease, seedPlan.isoDate(midnight), midnight + (8 * 60 + (n * 37) % 540) * 60000, 900 + n, ep.id);
    });
  }
  return groups;
}

function caseDocument(row, n, batch, episodeStarts) {
  const c = conditionOf(row.disease);
  const when = new Date(row.time);
  const consultationId = `${PREFIX}${row.date.replace(/-/g, '')}-${seedPlan.districtCode(row.district)}-${icdKey(c.icdCode)}-${String(n).padStart(3, '0')}`;
  return {
    consultationId,
    patientId: hexId('TOPUP-SYNTHETIC-PERSON', row.district, row.patientIndex), // refers to no account
    icdCode: c.icdCode, icdDescription: c.icdDescription, icdVersion: c.icdVersion, district: row.district,
    seedBatch: batch, isSynthetic: true, syntheticSeedBatch: BATCH_TAG, syntheticLabel: LABEL,
    ...(row.episode ? { plantedEpisode: row.episode, plantedStart: new Date(episodeStarts[row.episode]) } : {}),
    surveillanceVerification: { status: 'verified', diagnosisStatus: 'confirmed', source: 'clinical_review', verifiedBy: BATCH_TAG,
      verifiedAt: when, episodeId: `EP-${consultationId}`, caseDefinitionReference: 'WHO-SL-EPI-2026' },
    createdAt: when, updatedAt: when,
  };
}

function historyDocument(h, batch, todayMidnight) {
  const { POLICY } = require('../../src/services/surveillanceService');
  const created = new Date(todayMidnight - h.daysAgo * DAY_MS + 9 * 3600000);
  return {
    _id: hexId('TOPUP-HISTORY', h.key), surveillancePolicy: POLICY, sourceConsultationIds: [],
    disease: `ICD10:${icdKey(conditionOf(h.disease).icdCode)}`, location: h.district, district: h.district, severity: h.severity,
    status: h.status, affectedCount: h.count, caseCount: h.count, emailScope: 'none', feedbackStatus: 'unverified',
    message: '[SYNTHETIC EXAMPLE] Example row for the History page. Not produced by a detector scan and not a real outbreak.',
    isSimulation: false, isDemoData: true, isSynthetic: true, syntheticSeedBatch: BATCH_TAG, syntheticLabel: LABEL, seedBatch: batch,
    createdAt: created, updatedAt: new Date(+created + 3 * DAY_MS),
  };
}

// ---------------------------------------------------------------- database helpers
async function sizes(db) {
  const s = await db.stats();
  return { dataMB: s.dataSize / MB, indexMB: s.indexSize / MB, storageMB: s.storageSize / MB, totalMB: (s.dataSize + s.indexSize) / MB };
}
const showSize = s => `data ${s.dataMB.toFixed(2)} MB + indexes ${s.indexMB.toFixed(2)} MB = ${s.totalMB.toFixed(2)} MB (${(100 * s.totalMB / FREE_TIER_MB).toFixed(1)} % of ${FREE_TIER_MB} MB); storage ${s.storageMB.toFixed(2)} MB`;

async function existingCombos(db, from, to, batch) {
  const rows = await db.collection('consultations').aggregate([
    { $match: { createdAt: { $gte: new Date(from), $lt: new Date(to) } } },
    { $group: { _id: { d: '$district', i: '$icdCode', t: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d', timezone: '+05:30' } },
      mine: { $and: [{ $eq: ['$seedBatch', batch] }, { $eq: ['$isSynthetic', true] }] } }, n: { $sum: 1 } } },
  ]).toArray();
  const other = new Set(), mine = new Map();
  for (const r of rows) {
    const key = comboKey(r._id.d, r._id.i, r._id.t);
    if (r._id.mine) mine.set(key, r.n); else other.add(key);
  }
  return { other, mine };
}

async function episodeStartDates(db, todayMidnight) {
  const planted = await db.collection('consultations').aggregate([
    { $match: { createdAt: { $gte: new Date(todayMidnight - DAYS * DAY_MS) }, plantedEpisode: { $in: EPISODES.map(e => e.id) }, isSynthetic: true } },
    { $group: { _id: '$plantedEpisode', start: { $min: '$plantedStart' } } },
  ]).toArray();
  const found = new Map(planted.map(p => [p._id, +p.start]));
  return Object.fromEntries(EPISODES.map(e => [e.id, found.get(e.id) ?? todayMidnight - EPISODE_START_DAYS_AGO * DAY_MS]));
}

// Read-only: the real selection and the real rule on the stored rows. It creates no alert and sends no notification.
async function detectorPreview(db, now) {
  const { selectCases, evaluateOutbreakCriteria } = require('../../src/services/surveillanceService');
  const docs = await db.collection('consultations').find({ createdAt: { $gte: new Date(+now - 63 * DAY_MS), $lte: now } }, { projection: {
    _id: 1, patientId: 1, createdAt: 1, district: 1, icdCode: 1, icdVersion: 1, surveillanceVerification: 1, isSimulation: 1, isTestFixture: 1, isDemoData: 1,
    isSynthetic: 1, isUniversityDemo: 1, isSyntheticUniversityData: 1, datasetVersion: 1, datasetBatch: 1, testRunId: 1, phase5wOwner: 1, syntheticSeedBatch: 1 } }).toArray();
  const { cases } = selectCases(docs, { now, lookbackDays: 63 });
  const signals = evaluateOutbreakCriteria({ cases, now, baselineDays: 56, level: 'district' }).filter(r => r.triggered);
  const bySeverity = {}, byLevel = {};
  for (const s of signals) { bySeverity[s.severity] = (bySeverity[s.severity] || 0) + 1; byLevel[s.alertLevel] = (byLevel[s.alertLevel] || 0) + 1; }
  return { casesConsidered: cases.length, signals: signals.map(s => ({ district: s.district, disease: s.disease, count7d: s.count, level: s.alertLevel, severity: s.severity, dailyCounts: s.dailyCounts })), bySeverity, byLevel };
}

function backup(target, args, env, log) {
  const base = path.resolve(args['backup-dir'] || path.join(os.homedir(), 'medisync-backups'));
  const rel = path.relative(ROOT, base);
  if (!rel || (!rel.startsWith('..') && !path.isAbsolute(rel))) throw new SeedError('BACKUP_DIR_MUST_BE_OUTSIDE_THE_REPOSITORY');
  const bin = env.MONGODUMP_PATH || ['C:/Program Files/MongoDB/Tools/100/bin/mongodump.exe', '/usr/bin/mongodump'].find(p => fs.existsSync(p));
  if (!bin) throw new SeedError('MONGODUMP_NOT_FOUND: set MONGODUMP_PATH');
  const dir = path.join(base, `${new Date().toISOString().replace(/[:.]/g, '-')}-${args.batch}${args.rollback ? '-rollback' : ''}`);
  fs.mkdirSync(dir, { recursive: true });
  const config = path.join(dir, '.dump-config.yaml'); // keeps the connection string off the command line; deleted below
  const archive = path.join(dir, `${target.dbName}.archive.gz`);
  try {
    fs.writeFileSync(config, `uri: ${JSON.stringify(target.uri)}\n`, { mode: 0o600 });
    const r = cp.spawnSync(bin, [`--config=${config}`, `--archive=${archive}`, '--gzip'], { encoding: 'utf8', windowsHide: true });
    if (r.status !== 0 || !fs.existsSync(archive) || fs.statSync(archive).size === 0) throw new SeedError(`BACKUP_FAILED (mongodump exit ${r.status}); nothing was written`);
  } finally { fs.rmSync(config, { force: true }); }
  log(`Backup: ${archive} (${(fs.statSync(archive).size / MB).toFixed(2)} MB). Restore help: mongorestore --gzip --archive=<file>`);
  return archive;
}

async function flushPublicCache(env, args, target, log) {
  const note = 'Public cache: entries expire by themselves within 300 s.';
  if (!args['flush-cache']) return log(`${note} (--flush-cache not given)`);
  if (!env.REDIS_URL) return log(`${note} (REDIS_URL not set, nothing flushed)`);
  const host = new URL(env.REDIS_URL).hostname.toLowerCase();
  const allowed = String(env.SEED_DEMO_ALLOWED_HOSTS || '').split(',').map(s => s.trim().toLowerCase());
  if (!LOCAL_HOSTS.has(host) && !(args['confirm-production'] && allowed.includes(host))) return log(`${note} (Redis host is not allowed, nothing flushed)`);
  const client = require(path.join(SERVER, 'node_modules', 'redis')).createClient({ url: env.REDIS_URL, socket: { reconnectStrategy: false, connectTimeout: 5000 } });
  client.on('error', () => {});
  try {
    await client.connect();
    let removed = 0;
    for (const pattern of ['medisync:cache:health-stats:*', 'medisync:cache:consultation-activity:*']) {
      for (const key of await client.keys(pattern)) removed += await client.del(key);
    }
    log(`Public cache: ${removed} cached statistics entries removed.`);
  } catch (_) { log(`Public cache: could not be flushed. ${note}`); } finally { await client.quit().catch(() => {}); }
}

// ---------------------------------------------------------------- commands
async function seed({ db, target, args, env, log, todayMidnight, now, capMB }) {
  const before = await sizes(db);
  log(`Size before: ${showSize(before)}`);
  const from = todayMidnight - DAYS * DAY_MS;
  const starts = await episodeStartDates(db, todayMidnight);
  const groups = buildRows({ todayMidnight, episodeStarts: starts });
  const { other, mine } = await existingCombos(db, from, todayMidnight, args.batch);
  const docs = [], perDate = {}, skippedEpisodeDays = [];
  let skippedCombos = 0;
  for (const [key, rows] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    if (other.has(key)) {
      skippedCombos++;
      for (const ep of new Set(rows.filter(r => r.episode).map(r => `${r.episode} ${r.date}`))) skippedEpisodeDays.push(ep);
      continue;
    }
    if (mine.get(key) >= rows.length) continue; // this batch already has it in full
    rows.forEach((r, i) => docs.push(caseDocument(r, i + 1, args.batch, starts)));
    perDate[rows[0].date] = (perDate[rows[0].date] || 0) + rows.length;
  }
  const historyAll = HISTORY_ALERTS.map(h => historyDocument(h, args.batch, todayMidnight));
  const have = new Set((await db.collection('outbreakalerts').find({ _id: { $in: historyAll.map(h => h._id) } }, { projection: { _id: 1 } }).toArray()).map(r => String(r._id)));
  const history = historyAll.filter(h => !have.has(String(h._id)));
  const bytes = [...docs, ...history].reduce((n, d) => n + BSON.calculateObjectSize(d) + 30 + INDEX_BYTES_PER_DOC, 0);
  const planned = { consultations: docs.length, historyAlerts: history.length, estimatedMB: bytes / MB, skippedExistingCombos: skippedCombos };
  log(`Window: ${seedPlan.isoDate(from)} to ${seedPlan.isoDate(todayMidnight - DAY_MS)} (Asia/Colombo).`);
  log(`Planned: ${docs.length} synthetic consultations on ${Object.keys(perDate).length} date(s), ${history.length} history example alert(s); estimated ${planned.estimatedMB.toFixed(2)} MB. ` +
    `Skipped ${skippedCombos} (disease, district, date) combinations that already exist.`);
  for (const [date, n] of Object.entries(perDate).sort().slice(-10)) log(`  ${date}: ${n}`);
  if (Object.keys(perDate).length > 10) log(`  (earlier dates not listed: ${Object.keys(perDate).length - 10})`);
  const episodes = EPISODES.map(e => ({ id: e.id, disease: e.disease, district: e.district, start: seedPlan.isoDate(starts[e.id]) }));
  for (const e of episodes) log(`Planted episode ${e.id}: ${e.disease}, ${e.district}, starts ${e.start}`);
  if (skippedEpisodeDays.length) log(`Planted days already present (from an earlier batch or other data), left alone: ${skippedEpisodeDays.sort().join(', ')}`);
  if (before.totalMB + planned.estimatedMB > capMB) throw new SeedError(`REFUSED: size would reach ${(before.totalMB + planned.estimatedMB).toFixed(1)} MB, above the ${capMB} MB limit`);
  if (!args.write) { log('DRY RUN: nothing written. Add --write --allow-synthetic-consultations to write.'); return { mode: 'dry-run', planned, episodes, before, perDate }; }
  if (docs.length && !args['allow-synthetic-consultations']) {
    throw new SeedError('REFUSED: the detector reads cases only from the consultations collection, so this run would INSERT labelled synthetic consultations. Add --allow-synthetic-consultations if you accept that.');
  }
  if (!docs.length && !history.length) log('Nothing new to add.');
  const result = { mode: 'write', planned, episodes, before, perDate, inserted: { consultations: 0, historyAlerts: 0 } };
  if (docs.length || history.length) {
    result.backup = backup(target, args, env, log);
    try {
      for (let i = 0; i < docs.length; i += CHUNK) {
        const r = await db.collection('consultations').bulkWrite(docs.slice(i, i + CHUNK).map(d => ({ updateOne: { filter: { consultationId: d.consultationId }, update: { $setOnInsert: d }, upsert: true } })), { ordered: false });
        result.inserted.consultations += r.upsertedCount;
      }
      for (const h of history) {
        const { _id, ...rest } = h;
        result.inserted.historyAlerts += (await db.collection('outbreakalerts').updateOne({ _id }, { $setOnInsert: rest }, { upsert: true })).upsertedCount;
      }
    } catch (error) {
      log(`FAILED after inserting ${result.inserted.consultations} consultations. Do not retry. Roll back with: npm run seed:demo -- --batch=${args.batch} --rollback --write${target.local ? '' : ' --confirm-production'}`);
      throw error;
    }
  }
  result.after = await sizes(db);
  log(`Inserted: ${result.inserted.consultations} consultations, ${result.inserted.historyAlerts} history example alerts.`);
  log(`Size after: ${showSize(result.after)}`);
  if (result.after.totalMB > capMB) log(`WARNING: size is above ${capMB} MB`);
  result.detector = await detectorPreview(db, now);
  log(`Detector preview (read-only, real rule, no alert created): ${result.detector.casesConsidered} cases, ${result.detector.signals.length} signal(s); severity ${JSON.stringify(result.detector.bySeverity)}, level ${JSON.stringify(result.detector.byLevel)}`);
  const plantedKeys = new Set(EPISODES.map(e => `${e.district}|ICD10:${icdKey(conditionOf(e.disease).icdCode)}`));
  for (const s of result.detector.signals) log(`  ${s.district} ${s.disease}: ${s.level}/${s.severity}, ${s.count7d} cases in 7 days ${JSON.stringify(s.dailyCounts)} (${plantedKeys.has(`${s.district}|${s.disease}`) ? 'planted' : 'NOT planted by this tool: background or other data'})`);
  log('To create the alerts, use "Force System Scan" in the admin page: a real scan also notifies users, so this tool does not run it.');
  await flushPublicCache(env, args, target, log);
  return result;
}

async function rollback({ db, target, args, env, log }) {
  const before = await sizes(db);
  log(`Size before: ${showSize(before)}`);
  const caseFilter = { seedBatch: args.batch, isSynthetic: true, syntheticSeedBatch: BATCH_TAG, consultationId: { $regex: `^${PREFIX}` } };
  const alertFilter = { seedBatch: args.batch, isSynthetic: true, syntheticSeedBatch: BATCH_TAG, _id: { $in: HISTORY_ALERTS.map(h => hexId('TOPUP-HISTORY', h.key)) } };
  const cases = db.collection('consultations'), alerts = db.collection('outbreakalerts');
  const found = { consultations: await cases.countDocuments(caseFilter), historyAlerts: await alerts.countDocuments(alertFilter) };
  const ids = (await cases.find(caseFilter, { projection: { _id: 1 } }).toArray()).map(d => d._id);
  const linked = ids.length ? await alerts.find({ sourceConsultationIds: { $in: ids } }, { projection: { _id: 1, status: 1, location: 1 } }).toArray() : [];
  log(`Rollback of batch "${args.batch}": ${found.consultations} consultations and ${found.historyAlerts} history example alerts carry this seedBatch.`);
  if (linked.length) log(`NOT removed: ${linked.length} alert(s) that a scan created from these rows (${linked.map(a => `${a.location} ${a.status}`).join('; ')}). Resolve or dismiss them in the admin page.`);
  if (!args.write) { log('DRY RUN: nothing deleted. Add --write to delete.'); return { mode: 'rollback-dry-run', found, linkedAlerts: linked.length }; }
  if (!found.consultations && !found.historyAlerts) { log('Nothing to remove.'); return { mode: 'rollback', found, removed: { consultations: 0, historyAlerts: 0 }, linkedAlerts: 0 }; }
  const archive = backup(target, args, env, log);
  const removed = { consultations: (await cases.deleteMany(caseFilter)).deletedCount, historyAlerts: (await alerts.deleteMany(alertFilter)).deletedCount };
  const after = await sizes(db);
  log(`Removed: ${removed.consultations} consultations, ${removed.historyAlerts} history example alerts. Size after: ${showSize(after)}`);
  await flushPublicCache(env, args, target, log);
  return { mode: 'rollback', found, removed, linkedAlerts: linked.length, backup: archive, after };
}

async function run(argv, { env = process.env, log = console.log, now = new Date(), capMB = CAP_MB } = {}) {
  const args = parseArgs(argv);
  const target = resolveTarget(env, args);
  if (args.today) { if (!/^\d{4}-\d{2}-\d{2}$/.test(args.today)) throw new SeedError('TODAY_FORMAT'); now = new Date(seedPlan.referenceMidnight(args.today) + 10 * 3600000); }
  const todayMidnight = seedPlan.referenceMidnight(now);
  log(`seed:demo batch=${args.batch} ${args.rollback ? 'ROLLBACK' : 'SEED'} ${args.write ? 'WRITE' : 'DRY RUN'} | target ${target.local ? 'local' : 'REMOTE (confirmed, host on the allow-list)'} database "${target.dbName}" | ${new Date().toISOString()} | today ${seedPlan.isoDate(todayMidnight)} Asia/Colombo`);
  const client = new MongoClient(target.uri, { serverSelectionTimeoutMS: 8000 });
  try {
    try { await client.connect(); } catch (_) { throw new SeedError('CONNECTION_FAILED (details hidden because they can contain the address)'); }
    const db = client.db(target.dbName);
    return await (args.rollback ? rollback : seed)({ db, target, args, env, log, todayMidnight, now, capMB });
  } finally { await client.close().catch(() => {}); }
}

if (require.main === module) {
  run(process.argv.slice(2)).then(() => process.exit(0)).catch(e => { console.error(e instanceof SeedError ? `STOPPED: ${e.message}` : `STOPPED: ${e.name} ${e.code || ''}`); process.exit(1); });
}
module.exports = { run, parseArgs, resolveTarget, buildRows, caseDocument, historyDocument, SeedError, EPISODES, HISTORY_ALERTS, PREFIX, CAP_MB, DAYS, DEFAULT_URI };
