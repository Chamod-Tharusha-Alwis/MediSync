#!/usr/bin/env node
// Writes report-evidence/MANIFEST.md (every file, size, SHA-256) and report-evidence/report-evidence.zip.
// node_modules and the zip itself are excluded. Usage (repo root): node report-evidence/scripts/manifest.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const DIR = path.resolve(__dirname, '..');
const ZIP = path.join(DIR, 'report-evidence.zip');
const skip = rel => rel.split('/').includes('node_modules') || rel === 'report-evidence.zip';
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
  const full = path.join(d, e.name);
  return e.isDirectory() ? walk(full) : [full];
});
const DESCRIBE = [
  [/^01_facts\.md$/, 'Task A: facts pack (repo, gate, live URLs, roles, versions)'],
  [/^02_outbreak_ml\.md$/, 'Task D: outbreak ML evidence, tables, chart readings, DISCREPANCIES, sub-modules'],
  [/^03_validation\.md$/, 'Task E: validation summary and five viva lines'],
  [/^03_validation_routes\.md$/, 'Task E: generated table of all 228 API routes, Flask endpoints, client forms'],
  [/^04_optimization\.md$/, 'Task F: optimization inventory and live timings'],
  [/^05_viva_facts\.md$/, 'Task H: viva fact sheet'],
  [/^live_timings\.json$/, 'Task F: raw live timing output'],
  [/^MANIFEST\.md$/, 'This file'],
  [/^charts\//, 'Task D: chart (1600 x 900)'],
  [/^snippets\/INDEX\.md$/, 'Task B: snippet index and report-section mapping'],
  [/^snippets\/S\d+\.md$/, 'Task B: code snippet with explanation'],
  [/^screenshots\/INDEX\.md$/, 'Task C/G: screenshot index and NOT CAPTURED list'],
  [/^screenshots\/code\/html\//, 'Task C: HTML source rendered to PNG'],
  [/^screenshots\/code\/S\d+\.png$/, 'Task C: code screenshot'],
  [/^screenshots\/live\//, 'Task G: live public-page screenshot'],
  [/^scripts\//, 'Helper script (re-run commands in MANIFEST)'],
];
const files = walk(DIR).map(f => path.relative(DIR, f).replace(/\\/g, '/')).filter(r => !skip(r)).sort();
if (!files.includes('MANIFEST.md')) files.push('MANIFEST.md');
const rows = files.filter(r => r !== 'MANIFEST.md').map(r => {
  const buf = fs.readFileSync(path.join(DIR, r));
  return `| \`${r}\` | ${buf.length} | \`${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16)}\` | ${(DESCRIBE.find(([re]) => re.test(r)) || [, ''])[1]} |`;
});
const md = [
  '# report-evidence MANIFEST', '',
  `Generated ${new Date().toISOString()} from commit \`${cp.execSync('git rev-parse HEAD', { cwd: DIR, encoding: 'utf8' }).trim()}\` (branch \`docs/report-evidence\`).`,
  '`node_modules/` (highlight.js for the code screenshots) is not listed and not zipped; `npm install` in `report-evidence/scripts` restores it.', '',
  '| File | Bytes | SHA-256 (first 16) | Purpose |', '|---|---|---|---|', ...rows,
  '| `MANIFEST.md` | - | - | This file |', '| `report-evidence.zip` | - | - | Zip of everything above |', '',
  '## Re-run commands (from the repository root)', '', '```',
  'MEDISYNC_OFFLINE_CI=true node scripts/run_offline_tests.js                 # test gate (01_facts.md)',
  'npm --prefix report-evidence/scripts install                                 # highlight.js for code screenshots',
  'node report-evidence/scripts/snippets.cjs                                    # snippets S1-S10 + code PNGs (Tasks B, C)',
  'ml-engine/.venv/Scripts/python.exe report-evidence/scripts/charts.py         # three charts (Task D)',
  'node report-evidence/scripts/validation_inventory.cjs                        # 03_validation_routes.md (Task E)',
  'node report-evidence/scripts/measure_live.cjs 10 > report-evidence/live_timings.json   # live timings (Task F)',
  'node report-evidence/scripts/live_screenshots.cjs                            # public live screenshots (Task G)',
  'node report-evidence/scripts/manifest.cjs                                    # this manifest + zip',
  '```', ''].join('\n');
fs.writeFileSync(path.join(DIR, 'MANIFEST.md'), md);
// Zip with PowerShell Compress-Archive (Windows) or zip (POSIX); files listed explicitly so node_modules is excluded.
if (fs.existsSync(ZIP)) fs.rmSync(ZIP);
const list = files.map(r => path.join(DIR, r));
if (process.platform === 'win32') {
  const listFile = path.join(require('os').tmpdir(), 'report-evidence-files.txt');
  fs.writeFileSync(listFile, list.join('\n'));
  const ps = `$stage = Join-Path $env:TEMP ('re-stage-' + [guid]::NewGuid()); $root = '${DIR.replace(/'/g, "''")}';` +
    ` Get-Content -LiteralPath '${listFile}' | ForEach-Object { $rel = $_.Substring($root.Length + 1); $dst = Join-Path (Join-Path $stage 'report-evidence') $rel; New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null; Copy-Item -LiteralPath $_ -Destination $dst };` +
    ` Compress-Archive -Path (Join-Path $stage 'report-evidence') -DestinationPath '${ZIP.replace(/'/g, "''")}' -Force; Remove-Item -Recurse -Force $stage`;
  cp.execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });
} else {
  cp.execFileSync('zip', ['-q', ZIP, ...files.map(r => path.join('report-evidence', r))], { cwd: path.dirname(DIR), stdio: 'inherit' });
}
console.log('manifest rows', rows.length + 1, 'zip bytes', fs.statSync(ZIP).size);
