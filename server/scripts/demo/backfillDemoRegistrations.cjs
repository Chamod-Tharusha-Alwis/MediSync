'use strict';
/**
 * server/scripts/demo/backfillDemoRegistrations.cjs
 *
 * SYNTHETIC registration dates for the viva demo. The demo seed (demoStore.cjs) writes its 600 synthetic
 * patients without createdAt, so the admin "Patient Registration Growth" chart (last 7 days of
 * Patient.createdAt) is empty. The analytics query is NOT changed. This script gives a fixed, seeded subset
 * of those flagged patients a createdAt spread over the 6 complete days before the reference day (8-25 per day).
 *
 * Only patients matching ALL of: syntheticSeedBatch "viva-2026-11-outbreaks", isSynthetic true, NIC 9991xxxxxxxx
 * and email viva.demo.patient.NNNN@qa.medisync.local are touched. Unflagged patients are never touched.
 *
 *   node server/scripts/demo/backfillDemoRegistrations.cjs [--reference-date=YYYY-MM-DD]          DRY RUN (no connection)
 *   ... --confirm --expect-digest=<digest> [--qa]                                                    write (owner only)
 *   ... --revert --manifest=<file> --confirm [--qa]                                                   restore originals (owner only)
 * Before writing, the original createdAt of every target (absent -> null) is saved to the manifest file.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const plan = require('./demoSeedPlan.cjs');
const store = require('./demoStore.cjs');

const SEED = 20261117;
const PER_DAY = Object.freeze({ min: 8, max: 25 });
const DAYS = 6; // D-6 .. D-1: always fully inside the chart's rolling now-minus-7-days window on day D
const MARK = 'syntheticRegistrationBackfill';

function rng(...parts) {
  let a = crypto.createHash('sha256').update([SEED, ...parts].join('|')).digest().readUInt32LE(0);
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Deterministic plan: which synthetic NICs get which createdAt (days D-6 .. D-1, 08:00-20:00 Colombo). */
function buildBackfillPlan({ referenceDate = new Date() } = {}) {
  const D = plan.referenceMidnight(referenceDate);
  const nics = plan.buildIdentities().patients.map(p => p.nic); // 600 synthetic NICs, fixed order
  const order = [...nics].sort((x, y) => crypto.createHash('sha256').update(`${SEED}|${x}`).digest('hex').localeCompare(crypto.createHash('sha256').update(`${SEED}|${y}`).digest('hex')));
  const rows = [], perDay = {};
  let k = 0;
  for (let ago = DAYS; ago >= 1; ago--) {
    const midnight = D - ago * plan.DAY_MS, day = plan.isoDate(midnight);
    const r = rng('day', day);
    const n = PER_DAY.min + Math.floor(r() * (PER_DAY.max - PER_DAY.min + 1));
    perDay[day] = n;
    for (let i = 0; i < n; i++) rows.push({ nic: order[k++], createdAt: new Date(midnight + (8 * 60 + Math.floor(r() * 12 * 60)) * 60000).toISOString() });
  }
  const digest = crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  return { label: 'synthetic registration dates (demonstration only)', referenceDate: plan.isoDate(D), seed: SEED, perDay, total: rows.length, rows, digest };
}

const targetFilter = nic => ({ nic, ...store.SELECTORS.patients, ...store.FLAGS });

async function inspect(db, p) {
  const found = await db.collection('patients').find({ nic: { $in: p.rows.map(r => r.nic) }, ...store.SELECTORS.patients, ...store.FLAGS }, { projection: { nic: 1, createdAt: 1, [MARK]: 1 } }).toArray();
  return { found: found.length, missing: p.total - found.length, alreadyBackfilled: found.filter(d => d[MARK]).length, byNic: new Map(found.map(d => [d.nic, d])) };
}

async function applyBackfill(db, p, { manifestPath }) {
  const info = await inspect(db, p);
  if (info.missing) throw new Error(`TARGETS_MISSING: ${info.missing} of ${p.total} synthetic patients not found (seed the demo batch first)`);
  if (info.alreadyBackfilled) throw new Error(`ALREADY_BACKFILLED: ${info.alreadyBackfilled} patients carry ${MARK}; revert first`);
  const manifest = { label: p.label, digest: p.digest, referenceDate: p.referenceDate, writtenAt: new Date().toISOString(),
    originals: p.rows.map(r => ({ nic: r.nic, createdAt: info.byNic.get(r.nic).createdAt ? new Date(info.byNic.get(r.nic).createdAt).toISOString() : null })) };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n', { flag: 'wx' }); // saved BEFORE any write; never overwritten
  const res = await db.collection('patients').bulkWrite(p.rows.map(r => ({ updateOne: { filter: targetFilter(r.nic), update: { $set: { createdAt: new Date(r.createdAt), [MARK]: p.digest } } } })), { ordered: true });
  return { matched: res.matchedCount, modified: res.modifiedCount, manifestPath };
}

async function revertBackfill(db, manifest) {
  const ops = manifest.originals.map(o => ({ updateOne: { filter: { ...targetFilter(o.nic), [MARK]: manifest.digest },
    update: o.createdAt ? { $set: { createdAt: new Date(o.createdAt) }, $unset: { [MARK]: '' } } : { $unset: { createdAt: '', [MARK]: '' } } } }));
  const res = await db.collection('patients').bulkWrite(ops, { ordered: true });
  return { matched: res.matchedCount, modified: res.modifiedCount };
}

/** Same aggregation as analyticsController.getDashboardStats (registrationGrowth), for before/after printing. */
async function registrationGrowth(db, now = new Date()) {
  const since = new Date(now); since.setDate(since.getDate() - 7);
  return db.collection('patients').aggregate([{ $match: { createdAt: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray();
}

async function main(argv = process.argv.slice(2)) {
  const get = n => { const a = argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };
  const confirm = argv.includes('--confirm'), revert = argv.includes('--revert');
  if (revert) {
    const file = get('manifest');
    if (!file) throw new Error('--manifest=<file> is required for --revert');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    console.log(`REVERT (${manifest.label}): ${manifest.originals.length} patients, digest ${manifest.digest}`);
    if (!confirm) { console.log('[DRY RUN] No connection. Add --confirm to restore the saved original values.'); return; }
    const { mongoose, db } = await require('./demoCli.cjs').connect({ qa: argv.includes('--qa') });
    try { console.log('REVERTED:', JSON.stringify(await revertBackfill(db, manifest))); } finally { await mongoose.disconnect(); }
    return;
  }
  const p = buildBackfillPlan({ referenceDate: get('reference-date') || new Date() });
  console.log(`Backfill plan (${p.label}); reference day ${p.referenceDate}; seed ${p.seed}`);
  for (const [day, n] of Object.entries(p.perDay)) console.log(`  ${day}  ${String(n).padStart(3)} synthetic registrations`);
  console.log(`  total ${p.total} of 600 flagged synthetic patients; digest ${p.digest}`);
  if (!confirm) { console.log(`[DRY RUN] No connection, nothing written. To write (owner only): --confirm --expect-digest=${p.digest} --reference-date=${p.referenceDate}`); return; }
  if (get('expect-digest') !== p.digest) throw new Error('DIGEST_MISMATCH: run the dry run first and pass its digest with --expect-digest');
  const manifestPath = get('manifest') || path.resolve(process.cwd(), `backfill-registrations-${p.referenceDate}-${p.digest.slice(0, 12)}.json`);
  const { mongoose, db } = await require('./demoCli.cjs').connect({ qa: argv.includes('--qa') });
  try {
    console.log('BEFORE:', JSON.stringify(await registrationGrowth(db)));
    console.log('WRITTEN:', JSON.stringify(await applyBackfill(db, p, { manifestPath })));
    console.log('AFTER:', JSON.stringify(await registrationGrowth(db)));
    console.log(`Keep ${manifestPath}: it is needed for --revert.`);
  } finally { await mongoose.disconnect(); }
}

if (require.main === module) main().then(() => process.exit(0)).catch(e => { console.error(`ERROR: ${e.message}`); process.exit(1); });
module.exports = { buildBackfillPlan, applyBackfill, revertBackfill, registrationGrowth, inspect, MARK, PER_DAY };
