'use strict';

// Current clinical regression only. Each invocation retains its own receipts.
// These offline checks do not establish Atlas or five-role browser integration.
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const baselinePath = 'docs/temp/AGENT_B_PROTECTED_HASH_EVIDENCE_20261020.json';
const baselineSha = 'aa3e708dff3c116f0ff46749c222cb529ad10626d0df05d909c7313035c7a253';
function isSnapshotFile(file) {
  return !/^(scratch|research|docs|Python|medisync-qa-evidence)\//.test(file) && !/(^|\/)\.env($|\.)/i.test(file)
    && /\.(js|jsx|cjs|mjs|json|py|ya?ml|css|html)$|(^|\/)(Dockerfile|\.dockerignore|requirements\.txt|requirements\.lock)$/.test(file);
}
function git(args) {
  const result = cp.spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw Error('OFFLINE_GIT_SNAPSHOT_FAILED');
  return result.stdout;
}
function snapshot() {
  if (sha(path.join(root, baselinePath)) !== baselineSha) throw Error('ORIGINAL_PROTECTED_BASELINE_CHANGED');
  const pins = JSON.parse(fs.readFileSync(path.join(root, baselinePath)));
  const ledger = JSON.parse(fs.readFileSync(path.join(root, 'docs/temp/CODEX_FUNCTIONAL_CLOSURE_APPROVED_HASH_CHANGES_20261021.json')));
  if (ledger.originalBaseline.sha256 !== baselineSha) throw Error('APPROVAL_LEDGER_BASELINE_MISMATCH');
  const rows = [...pins.original11, ...pins.additional4].map(row => ({ file: row.file, originalExpected: row.expected, expected: row.expected }));
  for (const event of ledger.changes) {
    const row = rows.find(pin => pin.file === event.file);
    if (!row || row.expected !== event.originalSha256 || sha(path.join(root, event.patch)) !== event.patchSha256) throw Error('APPROVED_PATCH_CHAIN_MISMATCH');
    row.expected = event.authorizedSha256;
  }
  for (const row of rows) row.actual = sha(path.join(root, row.file));
  const names = [...new Set(git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))]
    .filter(file => isSnapshotFile(file) && fs.existsSync(path.join(root, file))).sort();
  return { at: new Date().toISOString(), branch: git(['branch', '--show-current']).trim(), head: git(['rev-parse', 'HEAD']).trim(), index: git(['diff', '--cached', '--name-only']), files: names.map(file => ({ file, sha256: sha(path.join(root, file)) })), pins: rows };
}
function cleanEnvironment() {
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATH', 'PATHEXT']) if (process.env[key]) env[key] = process.env[key];
  return { ...env, NODE_ENV: 'test', BABEL_ENV: 'test', CI: 'true', TZ: 'UTC', MEDISYNC_OFFLINE_ONLY: 'true', ENCRYPTION_KEY: 'synthetic-offline-key-never-for-real-data', REACT_APP_MEDISYNC_QA: 'true', REACT_APP_API_URL: '/api', REACT_APP_SERVER_URL: 'http://127.0.0.1:5100' };
}
async function main() {
  if (Number(process.versions.node.split('.')[0]) !== 24) throw Error('BLOCKED: use the existing reviewed Node 24 runtime; no installation is required');
  fs.mkdirSync(path.join(root,'scratch'),{recursive:true});
  const out = fs.mkdtempSync(path.join(root, 'scratch/clinical-offline-'));
  const save = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  const before = snapshot(); save('before.json', before);
  if (before.pins.some(row => row.actual !== row.expected)) throw Error('PROTECTED_SOURCE_HASH_MISMATCH');
  const env = cleanEnvironment();
  const ciProfile = process.env.MEDISYNC_OFFLINE_CI === 'true';
  const securityOnly = ciProfile && process.env.MEDISYNC_OFFLINE_PROFILE === 'security';
  if (ciProfile) env.MEDISYNC_OFFLINE_CI = 'true';
  console.log('Offline regression: inert repositories/providers; no Atlas or clinical browser login. Receipts: ' + out);
  function run(mode, executable, args, environment = env) {
    const log = fs.openSync(path.join(out, mode + '-console.txt'), 'wx');
    return new Promise(resolve => {
      const child = cp.spawn(executable, args, { cwd: root, env: environment, windowsHide: true, shell: false, stdio: ['ignore', log, log] });
      let error, timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, 180000);
      child.once('error', failure => { error = failure.code; });
      child.once('close', (code, signal) => {
        clearTimeout(timer); fs.closeSync(log);
        const result = { mode, code, signal, error, timedOut };
        save(mode + '-exit.json', result); console.log(JSON.stringify(result)); resolve(result);
      });
    });
  }
  const child = path.join(root, 'scripts/clinicalOfflineChild.cjs');
  const py = path.join(root, 'ml-engine/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const mlEnv = { ...env, PYTHONDONTWRITEBYTECODE: '1', MEDISYNC_ML_QA: 'true', MEDISYNC_OFFLINE_EVIDENCE: out, MEDISYNC_ML_DB_PATH: path.join(out, 'owned_ml_test.db'), INTERNAL_API_KEY: crypto.randomBytes(32).toString('hex'), MPLBACKEND: 'Agg', OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1' };
  const exits = await Promise.all([
    ...(securityOnly ? ['backend','email-pdf'] : ['backend', 'client', 'email-pdf']).map(mode => run(mode, process.execPath, [child, mode], { ...env, MEDISYNC_COMBINED_MODE: mode, MEDISYNC_COMBINED_EVIDENCE: out })),
    ...(!securityOnly ? [run('ml-scoring', py, [path.join(root, 'ml-engine/b13_r2_scoring_checks.py'), path.join(out, 'ml-scoring-results.json')], mlEnv),
    run('ml-flask', py, [path.join(root, 'ml-engine/scripts/clinical_offline_tests.py')], mlEnv)] : []),
    run('root', process.execPath, ['--test', '--test-reporter=tap', path.join(root, 'scripts/realLocalStack.test.cjs')])
  ]);
  const totals = [];
  for (const exit of exits) {
    try {
      let row;
      if (['backend', 'client', 'email-pdf'].includes(exit.mode)) {
        const result = JSON.parse(fs.readFileSync(path.join(out, exit.mode + '-results.json')));
        row = { mode: exit.mode, passed: result.numPassedTests, failed: result.numFailedTests, skipped: result.numPendingTests, total: result.numTotalTests, suites: result.numTotalTestSuites, success: result.success === true && result.numFailedTestSuites === 0 };
      } else if (exit.mode === 'ml-scoring') {
        const result = JSON.parse(fs.readFileSync(path.join(out, 'ml-scoring-results.json')));
        row = { mode: exit.mode, passed: result.passed, failed: result.failed, skipped: result.skipped, total: result.checks.length, success: result.failed === 0 && result.checks.length === result.passed + result.failed + result.skipped };
      } else if (exit.mode === 'ml-flask') {
        const result = JSON.parse(fs.readFileSync(path.join(out, 'ml-flask-results.json')));
        row = { mode: exit.mode, passed: result.run - result.failures - result.errors - result.skipped, failed: result.failures + result.errors, skipped: result.skipped, total: result.run, success: result.success === true };
      } else {
        const tap = fs.readFileSync(path.join(out, 'root-console.txt'), 'utf8');
        const count = key => { const match = tap.match(new RegExp('^# ' + key + ' (\\d+)\\r?$', 'm')); if (!match) throw Error('MISSING_TAP_TOTAL'); return Number(match[1]); };
        row = { mode: exit.mode, passed: count('pass'), failed: count('fail'), skipped: count('skipped'), total: count('tests'), success: count('fail') === 0 && count('cancelled') === 0 };
      }
      if (!['passed', 'failed', 'skipped', 'total'].every(key => Number.isInteger(row[key]) && row[key] >= 0) || row.passed + row.failed + row.skipped !== row.total) throw Error('INVALID_TEST_TOTALS');
      row.status = exit.code === 0 && !exit.timedOut && row.success && row.total > 0 && row.skipped === 0 ? 'PASS' : 'FAIL';
      totals.push(row);
    } catch (_) { totals.push({ mode: exit.mode, status: 'BLOCKED', reason: 'Missing or invalid result receipt; inspect the retained console and exit receipt.' }); }
  }
  const after = snapshot(); save('after.json', after);
  const frozen = JSON.stringify(before.files) === JSON.stringify(after.files) && before.head === after.head && before.index === after.index && after.pins.every(row => row.actual === row.expected);
  const summary = { out, node: process.version, scope: 'Offline regression; root lifecycle uses owned loopback listeners. No Atlas, production, clinical E2E, install, commit or deployment.', totals, passed: totals.reduce((sum, row) => sum + (row.passed || 0), 0), failed: totals.reduce((sum, row) => sum + (row.failed || 0), 0), blockedProfiles: totals.filter(row => row.status === 'BLOCKED').length, sourceFrozen: frozen, protectedAccountedFor: after.pins.length, success: frozen && totals.every(row => row.status === 'PASS') };
  summary.profile = ciProfile ? (securityOnly ? 'ci-security' : 'ci-offline') : 'local-offline';
  summary.notRun = ciProfile ? ['Local QA preservation baseline proof (private scratch evidence is not published)',...(securityOnly ? ['Client and ML profiles (covered by the independent full offline job)'] : [])] : [];
  save('summary.json', summary); console.log(JSON.stringify(summary, null, 2));
  process.exitCode = summary.success ? 0 : 1;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { cleanEnvironment, snapshot, isSnapshotFile };
