'use strict';
/**
 * server/scripts/demo/alert72hBacktest.cjs - back-test of the alert 72-hour projection (method v1).
 *
 * Uses the SAME pure function as the app (server/src/services/alertProjection72h.js projectFromPeriods).
 *   (a) naive: next period = last period.
 *   (b) interval: naive value plus the empirical 10th-90th percentile of past period-to-period changes
 *       (at least 8 past changes); scored for coverage, width and the MAE of its midpoint.
 * Series:
 *   1. Synthetic seeded series (server/scripts/demo/demoSeedPlan.cjs, reference 2026-11-17): 25 districts x 5
 *      diseases of daily counts summed into 72-hour periods. Synthetic: this only tests the code.
 *   2. OpenDengue V1.3.1 Sri Lanka national WEEKLY counts (ml-engine/evaluation/data, manifest entry
 *      opendengue_national): period = one week. Public national counts, not MediSync consultations.
 * History per origin: at most 20 past changes (21 periods), as in the app (63-day look-back / 72h).
 *
 * Usage (repository root):  node server/scripts/demo/alert72hBacktest.cjs
 * Writes docs/report/alert72h_backtest.md and prints the table.
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { projectFromPeriods, METHOD_VERSION, MIN_HISTORY_WINDOWS } = require('../../src/services/alertProjection72h');
const plan = require('./demoSeedPlan.cjs');

const ROOT = path.resolve(__dirname, '../../..');
const MAX_PERIODS = 21;

function score(series, label) {
  let n = 0, absNaive = 0, absMid = 0, nInt = 0, covered = 0, width = 0, noHistory = 0;
  for (const s of series) {
    for (let t = 1; t < s.length; t++) { // s[t] is the truth; periods end at t-1
      const periods = s.slice(Math.max(0, t - MAX_PERIODS), t);
      const p = projectFromPeriods(periods);
      const truth = s[t];
      n++; absNaive += Math.abs(truth - p.projected);
      if (!p.enoughHistory) { noHistory++; continue; }
      nInt++; covered += truth >= p.low && truth <= p.high ? 1 : 0; width += p.high - p.low; absMid += Math.abs(truth - (p.low + p.high) / 2);
    }
  }
  return { label, origins: n, maeNaive: absNaive / n, intervalOrigins: nInt, notEnoughHistory: noHistory,
    coverage: nInt ? covered / nInt : null, meanWidth: nInt ? width / nInt : null, maeMidpoint: nInt ? absMid / nInt : null,
    maeNaiveOnIntervalOrigins: null };
}

function syntheticSeries() {
  const b = plan.buildBulkPlan({ referenceDate: '2026-11-17' });
  const D = plan.referenceMidnight('2026-11-17');
  const nPeriods = Math.floor(365 / 3); // 121 complete 72h periods ending at D (the oldest 2 days are dropped)
  const start = D - nPeriods * 3 * plan.DAY_MS;
  const groups = new Map();
  for (const r of b.rows) {
    const key = `${r.district}|${r.disease}`;
    if (!groups.has(key)) groups.set(key, Array(nPeriods).fill(0));
    const k = Math.floor((r.time - start) / (3 * plan.DAY_MS));
    if (k >= 0 && k < nPeriods) groups.get(key)[k]++;
  }
  return { series: [...groups.values()], digest: b.digest, groups: groups.size };
}

function openDengueSeries() {
  const python = process.env.MEDISYNC_PYTHON || path.join(ROOT, 'ml-engine', '.venv', 'Scripts', 'python.exe');
  const code = 'import json,run_outbreak_backtest as r\nentry,weeks,n=r.load_weeks()\nsegs=r.build_segments(weeks,max_imputed=3)\nprint(json.dumps({"entry":{k:entry[k] for k in ("url","sha256","downloadDate")},"rows":n,"segments":[[w["count"] for w in s] for s in segs],"imputed":sum(w["imputed"] for s in segs for w in s)}))';
  const res = cp.spawnSync(python, ['-c', code], { cwd: path.join(ROOT, 'ml-engine', 'evaluation'), encoding: 'utf8', maxBuffer: 1 << 24 });
  if (res.status !== 0) throw new Error(`OpenDengue loader failed: ${res.stderr.slice(-400)}`);
  return JSON.parse(res.stdout);
}

function main() {
  const syn = syntheticSeries();
  const od = openDengueSeries();
  const rows = [score(syn.series, 'Synthetic seed (72-hour periods, 125 district-disease series)'),
    score(od.segments.filter(s => s.length > MIN_HISTORY_WINDOWS + 1), 'OpenDengue Sri Lanka (weekly periods, national)')];
  const f = (v, d = 2) => (v === null ? 'n/a' : v.toFixed(d));
  const lines = [
    '# Alert 72-hour projection: back-test',
    '',
    `Method \`${METHOD_VERSION}\` (server/src/services/alertProjection72h.js, the same function the app uses). Written by \`node server/scripts/demo/alert72hBacktest.cjs\`.`,
    '',
    '| Series | Origins | MAE (a) naive | Origins with range | Not enough history | (b) 80% range coverage | Mean range width | MAE (b) range midpoint |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map(r => `| ${r.label} | ${r.origins} | ${f(r.maeNaive)} | ${r.intervalOrigins} | ${r.notEnoughHistory} | ${r.coverage === null ? 'n/a' : (r.coverage * 100).toFixed(1) + '%'} | ${f(r.meanWidth, 1)} | ${f(r.maeMidpoint)} |`),
    '',
    '## Plain-language reading',
    '',
    `- The projected value **is** the naive "repeat the last 72 hours" value, so there is no claim that it beats the naive baseline; the midpoint of the range is reported to show whether shifting the value by past changes would help (MAE ${f(rows[0].maeMidpoint)} vs ${f(rows[0].maeNaive)} on the synthetic series, ${f(rows[1].maeMidpoint)} vs ${f(rows[1].maeNaive)} on OpenDengue).`,
    `- The range is meant to hold the next value about 80% of the time (10th-90th percentile). Observed coverage: ${(rows[0].coverage * 100).toFixed(1)}% on the synthetic series and ${(rows[1].coverage * 100).toFixed(1)}% on OpenDengue weekly counts.`,
    '- The synthetic series only test the code: they were generated by this project (gamma-Poisson noise on a seasonal shape), so the numbers say nothing about real outbreaks.',
    `- OpenDengue values are national weekly counts for Sri Lanka (${od.rows} weekly rows read; ${od.imputed} short gaps (at most 3 weeks) interpolated by the existing study rule; source ${od.entry.url}, SHA-256 ${od.entry.sha256.slice(0, 16)}..., downloaded ${od.entry.downloadDate}). They are not MediSync consultations and not 72-hour district counts; one week stands in for one period.`,
    `- Origins with fewer than ${MIN_HISTORY_WINDOWS} past changes show "not enough history" and no range, exactly as on the admin screen.`,
    '',
    `Synthetic plan digest ${syn.digest.slice(0, 16)}... (${syn.groups} series). Offline: no database, no network.`,
    '',
  ];
  const out = path.join(ROOT, 'docs', 'report', 'alert72h_backtest.md');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, lines.join('\n'));
  console.log(lines.join('\n'));
  return rows;
}

if (require.main === module) main();
module.exports = { score, projectFromPeriods };
