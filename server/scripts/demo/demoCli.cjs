'use strict';
/**
 * server/scripts/demo/demoCli.cjs - shared command line for the synthetic demonstration seed.
 *
 *   node server/scripts/demo/seedDemoBulk.cjs           [--reference-date=YYYY-MM-DD] [--write-manifest=<file>]
 *   node server/scripts/demo/seedDemoLiveOutbreak.cjs   [--district=Badulla] [--reference-date=YYYY-MM-DD]
 *   node server/scripts/demo/cleanDemo.cjs
 *
 * DRY RUN is the default and never connects to any database. Writing needs BOTH --confirm and
 * --expect-digest=<digest printed by the dry run>; only the owner runs that. --qa targets the approved
 * QA database instead of production (through the existing operatorDatabaseMode guard).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const plan = require('./demoSeedPlan.cjs');

const MEASUREMENT_PATH = path.join(__dirname, 'storage_measurement.json');

function parseArgs(argv) {
  const get = name => { const a = argv.find(x => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; };
  return { confirm: argv.includes('--confirm'), qa: argv.includes('--qa'), referenceDate: get('reference-date'), district: get('district'),
    expectDigest: get('expect-digest'), bulkReferenceDate: get('bulk-reference-date'), writeManifest: get('write-manifest'), scanDates: get('scan-dates') };
}

function readMeasurement() {
  try { return JSON.parse(fs.readFileSync(MEASUREMENT_PATH, 'utf8')); } catch (_) { return null; }
}

function projection(p) {
  const m = readMeasurement();
  if (!m) return { measured: false, text: 'not measured yet (run prove_offline.cjs)' };
  const mb = p.total * m.bytesPerConsultationUsed / 1048576;
  const parentMb = (m.bytesPerParentDocument || 0) * (new Set(p.rows.map(r => r.patientIndex)).size + 50) / 1048576;
  return { measured: true, mb: mb + parentMb, consultationsMb: mb, parentMb, bytesPerConsultation: m.bytesPerConsultationUsed, measuredOn: m.measuredOn };
}

function printPlan(p, args) {
  const proj = projection(p);
  const log = console.log;
  log('='.repeat(78));
  log(`MediSync demo seed (${plan.LABEL}) - ${p.kind === 'bulk' ? 'BULK BACKGROUND + 4 SCENARIOS' : `LIVE OUTBREAK (${p.district})`}`);
  log(`Mode: ${args.confirm ? 'WRITE (--confirm)' : 'DRY RUN - no database connection, nothing written'}`);
  log(`Batch tag: ${p.batchTag}   seed: ${p.seed}   reference day D: ${p.referenceDate} (records end on D-1)`);
  log('='.repeat(78));
  log(`Total consultations: ${p.total}`);
  log(`By disease: ${Object.entries(p.byDisease).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  log(`Districts touched: ${Object.keys(p.byDistrict).length}  (${Object.entries(p.byDistrict).sort().map(([k, v]) => `${k} ${v}`).join(', ')})`);
  log(`Synthetic patients used: ${new Set(p.rows.map(r => r.patientIndex)).size}`);
  log('Per scenario:');
  for (const [k, s] of Object.entries(p.scenarios)) {
    const def = plan.SCENARIOS.find(x => x.id === k);
    log(`  ${k.padEnd(10)} ${String(s.count).padStart(6)} cases  ${def ? `${def.name}: ${def.district} ${def.disease}` : k === 'LIVE' ? `live demo: ${p.district} dengue` : 'background, all districts'}  dates ${s.firstDate}..${s.lastDate} (${s.days} days)`);
  }
  if (proj.measured) {
    log(`Projected storage: ${proj.mb.toFixed(1)} MB (consultations ${proj.consultationsMb.toFixed(1)} MB at ${proj.bytesPerConsultation.toFixed(0)} B each incl. indexes, measured ${proj.measuredOn}; parents ${proj.parentMb.toFixed(1)} MB)`);
    log(`Storage cap for this batch: ${plan.STORAGE_CAP_MB} MB. Atlas free tier (M0) limit: ${plan.ATLAS_FREE_TIER_MB} MB.  ${proj.mb < plan.STORAGE_CAP_MB ? 'WITHIN CAP' : 'OVER CAP - REFUSING'}`);
  } else log(`Projected storage: ${proj.text}`);
  log(`Plan digest: ${p.digest}`);
  return proj;
}

function printPrediction(p, args, extraRows) {
  const dates = (args.scanDates || p.referenceDate).split(',');
  const scenarioKeys = new Map(plan.SCENARIOS.map(s => [`${s.district}|ICD10:${plan.diseaseByKey.get(s.disease).condition.icdCode.replace('.', '')}`, s]));
  const isLive = x => p.kind === 'live' && x.district === p.district && x.disease === `ICD10:${plan.diseaseByKey.get('dengue').condition.icdCode}`;
  for (const d of dates) {
    const r = plan.predictRule(p, { scanDate: d, extraRows });
    console.log(`Unchanged rule (evaluateOutbreakCriteria) on this plan, scan on ${d}:`);
    for (const x of r.filter(x => x.triggered || scenarioKeys.has(`${x.district}|${x.disease}`) || isLive(x))) {
      const s = scenarioKeys.get(`${x.district}|${x.disease}`);
      console.log(`  ${x.triggered ? 'FLAG    ' : 'no flag '} ${x.district} ${x.disease}  n7=${x.count} maxZ=${x.maxZ} consecutive=${x.maxConsecutiveDays} ${x.severity}${x.reason && !x.triggered ? ` (${x.reason})` : ''}  daily=${x.dailyCounts.join(',')}  ${s ? `[scenario ${s.id}: ${s.name}]` : isLive(x) ? '[live demo]' : '[background]'}`);
    }
  }
}

async function connect(args) {
  const dotenv = require(require.resolve('dotenv', { paths: [path.resolve(__dirname, '../..')] }));
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
  const mongoose = require(require.resolve('mongoose', { paths: [path.resolve(__dirname, '../..')] }));
  const { selectOperatorDatabase, verifyOperatorIdentity } = require('../operatorDatabaseMode');
  const target = selectOperatorDatabase(process.env, args.qa);
  await mongoose.connect(target.uri, target.connectionOptions);
  await verifyOperatorIdentity(mongoose.connection.db, target);
  console.log(`Connected to ${target.mode} database "${target.database}".`);
  return { mongoose, db: mongoose.connection.db };
}

async function randomPasswordHash() {
  const bcrypt = require(require.resolve('bcryptjs', { paths: [path.resolve(__dirname, '../..')] }));
  return bcrypt.hash(crypto.randomBytes(48).toString('hex'), 12); // secret discarded: these accounts cannot log in
}

async function runSeed(kind, argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const p = kind === 'bulk'
    ? plan.buildBulkPlan({ referenceDate: args.referenceDate || new Date() })
    : plan.buildLivePlan({ referenceDate: args.referenceDate || new Date(), district: args.district || plan.LIVE.defaultDistrict });
  if (kind === 'bulk' && (p.total < plan.BOUNDS.min || p.total > plan.BOUNDS.max)) throw new Error(`PLAN_OUTSIDE_BOUNDS: ${p.total}`);
  const proj = printPlan(p, args);
  let extraRows = [];
  if (kind === 'live') { // predict against the bulk background as seeded (default: the day before the live run)
    const bulkRef = args.bulkReferenceDate || plan.isoDate(p.referenceMidnight - plan.DAY_MS);
    console.log(`Prediction background: bulk plan seeded on ${bulkRef} (override with --bulk-reference-date=YYYY-MM-DD)`);
    extraRows = plan.buildBulkPlan({ referenceDate: bulkRef }).rows;
  }
  printPrediction(p, args, extraRows);
  if (args.writeManifest) {
    const out = { label: plan.LABEL, batchTag: p.batchTag, seed: p.seed, kind: p.kind, referenceDate: p.referenceDate, digest: p.digest,
      total: p.total, byDisease: p.byDisease, byDistrict: p.byDistrict, scenarios: p.scenarios,
      expected: plan.SCENARIOS.map(s => ({ id: s.id, name: s.name, district: s.district, disease: s.disease, expected: s.expected })),
      ruleOnPlan: Object.fromEntries((args.scanDates || p.referenceDate).split(',').map(d => [d, plan.predictRule(p, { scanDate: d, extraRows }).filter(x => x.triggered)
        .map(x => ({ district: x.district, disease: x.disease, count: x.count, maxZ: x.maxZ, consecutiveDays: x.maxConsecutiveDays, severity: x.severity }))])),
      dengueShapeSource: plan.DENGUE_SHAPE_SOURCE, countsPerDistrictDiseaseWeek: p.manifest };
    fs.writeFileSync(args.writeManifest, JSON.stringify(out, null, 1) + '\n', { encoding: 'utf8' });
    console.log(`Manifest written: ${args.writeManifest}`);
  }
  if (!args.confirm) {
    console.log('\n[DRY RUN] Zero connections, zero writes.');
    console.log(`To write (owner only): add --confirm --expect-digest=${p.digest}${args.referenceDate ? ` --reference-date=${args.referenceDate}` : ` --reference-date=${p.referenceDate}`}`);
    return { plan: p, projection: proj, written: false };
  }
  if (args.expectDigest !== p.digest) throw new Error('DIGEST_MISMATCH: run the dry run first and pass its digest with --expect-digest');
  if (!proj.measured || !(proj.mb < plan.STORAGE_CAP_MB)) throw new Error('STORAGE_PROJECTION_MISSING_OR_OVER_CAP');
  const { mongoose, db } = await connect(args);
  try {
    const store = require('./demoStore.cjs');
    const report = await store.writePlan(db, p, { passwordHash: await randomPasswordHash() });
    console.log('WRITE COMPLETE:', JSON.stringify(report));
    console.log('No outbreak alerts were written. Run one surveillance scan from the admin outbreak monitor.');
    return { plan: p, report, written: true };
  } finally { await mongoose.disconnect(); }
}

async function runClean(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.confirm) {
    console.log(`cleanDemo (${plan.LABEL}). DRY RUN - no connection. It would delete only documents that carry`);
    console.log(`syntheticSeedBatch="${plan.BATCH_TAG}" AND isSynthetic=true AND one of these identifier prefixes:`);
    for (const [c, s] of Object.entries(require('./demoStore.cjs').SELECTORS)) console.log(`  ${c}: ${JSON.stringify(s)}`);
    console.log('plus outbreak alerts whose source consultations are ALL this seed\'s consultations.');
    console.log('To see live counts and delete (owner only): add --confirm. It prints matched counts, deletes, then re-counts.');
    return { written: false };
  }
  const { mongoose, db } = await connect(args);
  try {
    const store = require('./demoStore.cjs');
    const report = await store.cleanDemo(db, { confirm: true });
    console.log(JSON.stringify(report, null, 2));
    if (report.unflaggedRemoved !== 0) throw new Error('INTEGRITY: removed count differs from matched count');
    return report;
  } finally { await mongoose.disconnect(); }
}

function main(fn) {
  fn().then(() => process.exit(0)).catch(err => { console.error(`\nERROR: ${err.message}`); process.exit(1); });
}

module.exports = { parseArgs, runSeed, runClean, main, MEASUREMENT_PATH, projection };
