#!/usr/bin/env node
// Builds report-evidence/snippets/S*.md and report-evidence/screenshots/code/S*.png from EXACT repository lines.
// Read-only on source code. Usage (from the repo root):
//   node report-evidence/scripts/snippets.cjs            # Markdown + HTML + PNG
//   node report-evidence/scripts/snippets.cjs --no-png   # Markdown + HTML only
// Lines are copied byte-for-byte; omitted lines are shown as one "// ..." (JavaScript) or "# ..." (Python) line.
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_MD = path.join(ROOT, 'report-evidence', 'snippets');
const OUT_HTML = path.join(ROOT, 'report-evidence', 'screenshots', 'code', 'html');
const OUT_PNG = path.join(ROOT, 'report-evidence', 'screenshots', 'code');
const hljs = require(path.join(__dirname, 'node_modules', 'highlight.js'));
const CSS = fs.readFileSync(path.join(__dirname, 'node_modules', 'highlight.js', 'styles', 'github.css'), 'utf8');
const COMMIT = cp.execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
const MAX_LINES = 25;

const SNIPPETS = [
  { id: 'S1', title: 'Outbreak detector core: case floor, z-score and 2-day persistence', parts: [
    { file: 'server/src/services/surveillanceService.js', ranges: [[440, 440], [466, 471], [478, 478], [482, 491]] }],
    explain: 'For each district and disease, the detector skips groups with fewer than 5 distinct episodes in the last 7 complete days, then turns each day\'s count into a z-score against the mean and standard deviation of the previous 56 days. A signal is raised only when at least two consecutive days have z above 2.0, which is the rule the daily surveillance scan and the admin "Force System Scan" both run.' },
  { id: 'S2', title: '72-hour projection: last value repeated with an 80% (10th-90th percentile) range', parts: [
    { file: 'server/src/services/alertProjection72h.js', ranges: [[23, 24], [48, 57], [78, 78], [85, 85]] }],
    explain: 'The expected count for the next 72 hours is simply the actual count of the last 72 hours, and the range adds the 10th and 90th percentiles of past 72-hour-to-next-72-hour changes (only when at least 8 past windows exist). These numbers are attached to every outbreak alert and shown on the admin alert detail and in the alert email.' },
  { id: 'S3', title: 'Trend projection with a prediction interval (OLS, client side)', parts: [
    { file: 'client/src/utils/outbreakForecasting.js', ranges: [[301, 302], [305, 316], [384, 384], [392, 397]] }],
    explain: 'The 14-day trend projection fits an ordinary least-squares line to the daily counts and widens each future point by a Student-t prediction interval (se x sqrt(1 + 1/n + (x - mean)^2 / Sxx)). It runs in the browser for the public and admin trend charts; statsmodels is used only in the offline study, not in this production code.' },
  { id: 'S4', title: 'Surveillance scan to alert record: deterministic id, Pending status, severity', parts: [
    { file: 'server/src/services/surveillanceService.js', ranges: [[110, 114], [132, 140], [150, 151], [157, 159]] }],
    explain: 'Every triggered detector result becomes an OutbreakAlert document whose id is a hash of the policy, mode, district, disease and source consultations, so a repeated scan updates the same alert instead of creating duplicates. New alerts are always stored as Pending with the severity from the z-score bands, and wait for an administrator to approve them.' },
  { id: 'S5', title: 'Alert email: kill switch, demo allowlist and daily cap', parts: [
    { file: 'server/src/services/outbreakDetailedDelivery.js', ranges: [[55, 55], [64, 85]] }],
    explain: 'Before any outbreak email is sent, the function stops if OUTBREAK_EMAIL_DELIVERY_ENABLED is "false", keeps only allowlisted addresses for demonstration alerts, and trims the list to the remaining daily email cap. It is called when an administrator approves an alert or sends the test email, and the result (sent, skipped with a reason, or failed) is shown in the admin UI.' },
  { id: 'S6', title: 'Authentication: bcrypt cost 12, failed-attempt lockout, JWT expiry', parts: [
    { file: 'server/src/utils/passwordUtils.js', ranges: [[55, 56]] },
    { file: 'server/src/security/passwordAttemptPolicy.js', ranges: [[2, 2], [21, 22]] },
    { file: 'server/src/controllers/authController.js', ranges: [[336, 336], [351, 357], [493, 495]] }],
    explain: 'New passwords are hashed with bcrypt using a cost factor of 12; at login, 5 failed password attempts within 900 seconds block further attempts with HTTP 429. A successful login issues a 15-minute access JWT and a 7-day refresh JWT (no age-based password expiry exists; only temporary passwords must be changed on first login).' },
  { id: 'S7', title: 'Authorization: role check and patient consent check', parts: [
    { file: 'server/src/middleware/auth.js', ranges: [[8, 8], [17, 23], [43, 46]] },
    { file: 'server/src/middleware/patientConsent.js', ranges: [[1, 9]] }],
    explain: '`protect([...roles])` verifies the JWT, checks the stored session, and returns 403 when the token\'s role is not in the route\'s allowed list. Clinical routes that read a patient\'s records also require the patient-access consent token (granted by the patient\'s OTP), otherwise they return 403 "Patient consent required".' },
  { id: 'S8', title: 'Data validation: prescription duration rule and the route that uses it', parts: [
    { file: 'server/src/utils/prescriptionDuration.js', ranges: [[3, 8], [13, 21]] },
    { file: 'server/src/routes/doctorRoutes.js', ranges: [[11, 11]] }],
    explain: 'Every prescribed medicine must carry durationDays as a positive whole number; anything else (missing, decimal, negative, or the legacy text field) is rejected with HTTP 400 INVALID_DURATION before the controller runs. The doctor consultation route applies this check first, then authentication and clinical write authorization (validation is hand-written; the joi package is listed but not used).' },
  { id: 'S9', title: 'Idempotent dispense inside one transaction (ALREADY_DISPENSED)', parts: [
    { file: 'server/src/services/dispensingService.js', ranges: [[44, 44], [48, 48], [116, 116], [125, 132], [137, 137], [190, 193], [216, 216]] }],
    explain: 'A dispense runs in a MongoDB transaction with a receipt id derived from the prescription, so a retry with the same idempotency key returns the stored receipt and any other second attempt fails with ALREADY_DISPENSED. The prescription is claimed with a conditional update (only while still pending), which is what guarantees one receipt per item when two pharmacies click at the same moment.' },
  { id: 'S10', title: 'Symptom matcher (sub-module): TF-IDF and cosine similarity', parts: [
    { file: 'ml-engine/app.py', ranges: [[377, 380], [561, 564]] }],
    explain: 'The Flask ML service builds a TF-IDF matrix (1-2 word n-grams) from the curated disease symptom profiles at start-up and scores a doctor\'s entered symptoms by cosine similarity against every profile. The doctor\'s consultation page shows the ranked suggestions as reference only; it is a sub-module, and its accuracy on real patients is not established.' },
];

function lang(file) { return file.endsWith('.py') ? 'python' : 'javascript'; }
function gap(file) { return file.endsWith('.py') ? '# ...' : '// ...'; }

function build(s) {
  const blocks = [];
  let total = 0;
  for (const part of s.parts) {
    const lines = fs.readFileSync(path.join(ROOT, part.file), 'utf8').replace(/\r\n/g, '\n').split('\n');
    const rows = [];
    part.ranges.forEach(([a, b], i) => {
      if (i > 0 && a > part.ranges[i - 1][1] + 1) rows.push({ n: null, text: gap(part.file) });
      for (let n = a; n <= b; n++) rows.push({ n, text: lines[n - 1] });
    });
    total += rows.length;
    const range = part.ranges.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ');
    blocks.push({ file: part.file, range, rows });
  }
  if (total > MAX_LINES) throw new Error(`${s.id} has ${total} lines (max ${MAX_LINES})`);
  return { blocks, total };
}

function markdown(s, { blocks }) {
  const out = [`# ${s.id}: ${s.title}`, '', `Commit: \`${COMMIT}\``, ''];
  for (const b of blocks) {
    out.push(`**File:** \`${b.file}\`  **Lines:** ${b.range}`, '', '```' + lang(b.file));
    for (const r of b.rows) out.push(r.text);
    out.push('```', '');
  }
  out.push('**What it does:** ' + s.explain, '');
  return out.join('\n');
}

const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function html(s, { blocks }) {
  const body = blocks.map(b => {
    const code = b.rows.map(r => {
      const hl = r.n === null ? `<span class="hljs-comment">${esc(r.text)}</span>` : hljs.highlight(r.text, { language: lang(b.file), ignoreIllegals: true }).value;
      return `<tr><td class="ln">${r.n ?? ''}</td><td class="code">${hl || '&nbsp;'}</td></tr>`;
    }).join('');
    return `<div class="cap">${esc(b.file)} &nbsp;·&nbsp; lines ${esc(b.range)}</div><table>${code}</table>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}
body{margin:0;background:#fff;font-family:Consolas,"Courier New",monospace}
#card{display:inline-block;min-width:900px;max-width:1360px;border:1px solid #d0d7de;border-radius:6px;margin:16px;overflow:hidden}
.title{background:#24292f;color:#fff;font:600 15px Arial,sans-serif;padding:10px 14px}
.cap{background:#f6f8fa;border-top:1px solid #d0d7de;border-bottom:1px solid #d0d7de;color:#57606a;font:13px Arial,sans-serif;padding:6px 14px}
table{border-collapse:collapse;font-size:14px;line-height:1.45}
td.ln{color:#8c959f;text-align:right;padding:0 10px 0 14px;user-select:none;vertical-align:top;min-width:36px}
td.code{white-space:pre-wrap;word-break:break-word;padding:0 14px 0 4px;color:#24292f}
</style></head><body><div id="card"><div class="title">${s.id} · ${esc(s.title)}</div>${body}</div></body></html>`;
}

async function main() {
  const png = !process.argv.includes('--no-png');
  fs.mkdirSync(OUT_MD, { recursive: true });
  fs.mkdirSync(OUT_HTML, { recursive: true });
  const built = SNIPPETS.map(s => ({ s, b: build(s) }));
  for (const { s, b } of built) {
    fs.writeFileSync(path.join(OUT_MD, `${s.id}.md`), markdown(s, b));
    fs.writeFileSync(path.join(OUT_HTML, `${s.id}.html`), html(s, b));
  }
  console.log('markdown and html:', built.map(x => `${x.s.id}(${x.b.total} lines)`).join(' '));
  if (!png) return;
  let chromium;
  try { ({ chromium } = require(path.join(ROOT, 'client', 'node_modules', 'playwright'))); } catch (e) { throw new Error('PLAYWRIGHT_NOT_AVAILABLE: ' + e.message); }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  for (const { s } of built) {
    await page.goto('file:///' + path.join(OUT_HTML, `${s.id}.html`).replace(/\\/g, '/'));
    await page.locator('#card').screenshot({ path: path.join(OUT_PNG, `${s.id}.png`) });
  }
  await browser.close();
  console.log('png:', built.map(x => `${x.s.id}.png`).join(' '));
}

module.exports = { SNIPPETS };
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
