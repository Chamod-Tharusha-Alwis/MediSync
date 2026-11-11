'use strict';

// Current clinical regression only. Each invocation retains its own receipts.
// These offline checks do not establish Atlas or five-role browser integration.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const baselinePath = 'docs/release/PROTECTED_HASHES.json';
function testTmpBase(env = process.env) {
  const configured = env && env.MEDISYNC_TEST_TMP ? path.resolve(env.MEDISYNC_TEST_TMP) : path.join(os.tmpdir(), 'medisync-test-tmp');
  fs.mkdirSync(configured, { recursive: true });
  return fs.realpathSync(configured);
}
function bestEffortCleanup(targetPath) {
  if (!targetPath) return false;
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
    return true;
  } catch (err) {
    if (err && (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'ENOTEMPTY' || err.code === 'EACCES')) return false;
    return false;
  }
}
function isAllowedTempChild(candidatePath, env = process.env) {
  if (!candidatePath) return false;
  const resolved = fs.existsSync(candidatePath) ? fs.realpathSync(candidatePath) : path.resolve(candidatePath);
  const bases = [testTmpBase(env), fs.realpathSync(os.tmpdir()), path.join(root, 'scratch')];
  return bases.some(base => resolved.startsWith(base + path.sep));
}
function isSnapshotFile(file) {
  if (/^\.github\/context-mode\/sessions\/stats-pid-\d+\.json$/.test(file)) return false;
  return !/^(scratch|research|docs|Python|medisync-qa-evidence)\//.test(file) && !/(^|\/)\.env($|\.)/i.test(file)
    && /\.(js|jsx|cjs|mjs|json|py|ya?ml|css|html)$|(^|\/)(Dockerfile|\.dockerignore|requirements\.txt|requirements\.lock)$/.test(file);
}
function git(args) {
  const result = cp.spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw Error('OFFLINE_GIT_SNAPSHOT_FAILED');
  return result.stdout;
}
function snapshot() {
  const ledgerPath = path.join(root, baselinePath);
  if (!fs.existsSync(ledgerPath)) throw Error('PROTECTED_HASH_LEDGER_MISSING');
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  if (!Array.isArray(ledger.files) || ledger.files.length !== 15) throw Error('PROTECTED_HASH_LEDGER_INVALID');
  const rows = ledger.files.map(row => {
    if (!row.path || !row.releaseCandidateSha256) throw Error('PROTECTED_HASH_ROW_INVALID');
    const fullPath = path.join(root, row.path);
    if (!fs.existsSync(fullPath)) throw Error('PROTECTED_FILE_MISSING: ' + row.path);
    const actual = sha(fullPath);
    return {
      file: row.path,
      previousApprovedSha256: row.previousApprovedSha256,
      expected: row.releaseCandidateSha256,
      actual,
      reason: row.reason
    };
  });
  if (rows.some(r => r.actual !== r.expected)) throw Error('PROTECTED_SOURCE_HASH_MISMATCH');
  const names = [...new Set(git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))]
    .filter(file => isSnapshotFile(file) && fs.existsSync(path.join(root, file))).sort();
  return { at: new Date().toISOString(), branch: git(['branch', '--show-current']).trim(), head: git(['rev-parse', 'HEAD']).trim(), index: git(['diff', '--cached', '--name-only']), files: names.map(file => ({ file, sha256: sha(path.join(root, file)) })), pins: rows };
}
function mergeResults(r1, r2) {
  if (!r1) return r2;
  return {
    numFailedTestSuites: r1.numFailedTestSuites + r2.numFailedTestSuites,
    numFailedTests: r1.numFailedTests + r2.numFailedTests,
    numPassedTestSuites: r1.numPassedTestSuites + r2.numPassedTestSuites,
    numPassedTests: r1.numPassedTests + r2.numPassedTests,
    numPendingTestSuites: r1.numPendingTestSuites + r2.numPendingTestSuites,
    numPendingTests: r1.numPendingTests + r2.numPendingTests,
    numRuntimeErrorTestSuites: (r1.numRuntimeErrorTestSuites || 0) + (r2.numRuntimeErrorTestSuites || 0),
    numTodoTests: (r1.numTodoTests || 0) + (r2.numTodoTests || 0),
    numTotalTestSuites: r1.numTotalTestSuites + r2.numTotalTestSuites,
    numTotalTests: r1.numTotalTests + r2.numTotalTests,
    openHandles: [...(r1.openHandles || []), ...(r2.openHandles || [])],
    snapshot: r1.snapshot || r2.snapshot,
    startTime: Math.min(r1.startTime || Date.now(), r2.startTime || Date.now()),
    success: Boolean(r1.success && r2.success && (r1.numFailedTestSuites + r2.numFailedTestSuites === 0)),
    testResults: [...(r1.testResults || []), ...(r2.testResults || [])],
    wasInterrupted: Boolean(r1.wasInterrupted || r2.wasInterrupted),
  };
}
function cleanEnvironment() {
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATH', 'PATHEXT', 'HOME', 'USER', 'MEDISYNC_TEST_TMP', 'NODE_OPTIONS']) if (process.env[key]) env[key] = process.env[key];
  if (!env.MEDISYNC_TEST_TMP) env.MEDISYNC_TEST_TMP = testTmpBase(process.env);
  if (!env.NODE_OPTIONS) {
    env.NODE_OPTIONS = '--max-old-space-size=6144 --expose-gc';
  } else {
    if (!env.NODE_OPTIONS.includes('--max-old-space-size')) env.NODE_OPTIONS += ' --max-old-space-size=6144';
    if (!env.NODE_OPTIONS.includes('--expose-gc')) env.NODE_OPTIONS += ' --expose-gc';
  }
  return { ...env, NODE_ENV: 'test', BABEL_ENV: 'test', CI: 'true', TZ: 'UTC', MEDISYNC_OFFLINE_ONLY: 'true', ENCRYPTION_KEY: 'synthetic-offline-key-never-for-real-data', REACT_APP_MEDISYNC_QA: 'true', REACT_APP_API_URL: '/api', REACT_APP_SERVER_URL: 'http://127.0.0.1:5100' };
}
async function main() {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (![24, 26].includes(nodeMajor)) throw Error('BLOCKED: use the existing reviewed Node 24 runtime; no installation is required');
  const tmpRoot = testTmpBase();
  const out = fs.mkdtempSync(path.join(tmpRoot, 'clinical-offline-'));
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
      // The serial backend batches can exceed five minutes on Windows.
      const timeoutMs = mode === 'backend' ? 600000 : 300000;
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
      child.once('error', failure => { error = failure.code; });
      child.once('close', (code, signal) => {
        clearTimeout(timer); fs.closeSync(log);
        const result = { mode, code, signal, error, timedOut };
        save(mode + '-exit.json', result); console.log(JSON.stringify(result)); resolve(result);
      });
    });
  }
  async function runBackendBatches(executable, args, environment = env) {
    const backendConfig = require('../server/clinical.offline.jest.cjs');
    let suites = Array.isArray(backendConfig.testMatch) ? [...backendConfig.testMatch] : [];
    if (environment.MEDISYNC_OFFLINE_CI === 'true') {
      suites = suites.filter(s => !s.includes('closureQaPreservationBaseline.local.test.js'));
    }
    const batchSize = 15;
    const totalBatches = Math.max(1, Math.ceil(suites.length / batchSize));
    const consolePath = path.join(out, 'backend-console.txt');
    fs.writeFileSync(consolePath, '');

    let aggregated = null;
    let finalCode = 0;
    let finalSignal = null;
    let finalError = undefined;
    let timedOutOverall = false;

    for (let b = 0; b < totalBatches; b++) {
      const batchEnv = {
        ...environment,
        MEDISYNC_BACKEND_BATCH: String(b),
        MEDISYNC_BACKEND_BATCH_SIZE: String(batchSize)
      };
      const logAppend = fs.openSync(consolePath, 'a');
      const batchResult = await new Promise(resolve => {
        const child = cp.spawn(executable, args, { cwd: root, env: batchEnv, windowsHide: true, shell: false, stdio: ['ignore', logAppend, logAppend] });
        let error, timedOut = false;
        const timer = setTimeout(() => { timedOut = true; child.kill(); }, 180000);
        child.once('error', failure => { error = failure.code; });
        child.once('close', (code, signal) => {
          clearTimeout(timer);
          try { fs.closeSync(logAppend); } catch (_) {}
          resolve({ code, signal, error, timedOut });
        });
      });

      if (batchResult.timedOut) timedOutOverall = true;
      if (batchResult.error) finalError = batchResult.error;
      if (batchResult.code !== 0) {
        finalCode = batchResult.code || 1;
        finalSignal = batchResult.signal;
      }

      const batchResultsFile = path.join(out, `backend-results-${b}.json`);
      if (fs.existsSync(batchResultsFile)) {
        try {
          const bRes = JSON.parse(fs.readFileSync(batchResultsFile, 'utf8'));
          aggregated = mergeResults(aggregated, bRes);
        } catch (_) {}
      }

      if (finalCode !== 0 || timedOutOverall) break;
    }

    if (aggregated) {
      fs.writeFileSync(path.join(out, 'backend-results.json'), JSON.stringify(aggregated, null, 2) + '\n');
    }
    const result = { mode: 'backend', code: finalCode, signal: finalSignal, error: finalError, timedOut: timedOutOverall };
    save('backend-exit.json', result);
    console.log(JSON.stringify(result));
    return result;
  }
  const child = path.join(root, 'scripts/clinicalOfflineChild.cjs');
  const py = path.join(root, 'ml-engine/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const mlEnv = { ...env, PYTHONDONTWRITEBYTECODE: '1', MEDISYNC_ML_QA: 'true', MEDISYNC_OFFLINE_EVIDENCE: out, MEDISYNC_ML_DB_PATH: path.join(out, 'owned_ml_test.db'), INTERNAL_API_KEY: crypto.randomBytes(32).toString('hex'), MPLBACKEND: 'Agg', OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1' };
  const exits = await Promise.all([
    ...(securityOnly ? ['backend','email-pdf'] : ['backend', 'client', 'email-pdf']).map(mode =>
      mode === 'backend'
        ? runBackendBatches(process.execPath, [child, mode], { ...env, MEDISYNC_COMBINED_MODE: mode, MEDISYNC_COMBINED_EVIDENCE: out })
        : run(mode, process.execPath, [child, mode], { ...env, MEDISYNC_COMBINED_MODE: mode, MEDISYNC_COMBINED_EVIDENCE: out })
    ),
    ...(!securityOnly ? [run('ml-scoring', py, [path.join(root, 'ml-engine/b13_r2_scoring_checks.py'), path.join(out, 'ml-scoring-results.json')], mlEnv),
    run('ml-flask', py, [path.join(root, 'ml-engine/scripts/clinical_offline_tests.py')], mlEnv)] : []),
    run('root', process.execPath, ['--test', '--test-reporter=tap', path.join(root, 'scripts/realLocalStack.test.cjs')])
  ]);
  if (!securityOnly) exits.push(await run('ml-status-contract', process.execPath,
    [path.join(root,'scripts/verifyMlStatusContractOffline.cjs'),'--evidence',out]));
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
      } else if (exit.mode === 'ml-status-contract') {
        const result = JSON.parse(fs.readFileSync(path.join(out,'ml-status-contract-results.json')));
        row = { mode: exit.mode, passed: result.passed, failed: result.failed, skipped: result.skipped, total: result.total, success: result.success === true };
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
  summary.notRun = ciProfile ? ['Local QA preservation baseline proof (private scratch evidence is not published)','Installed-local MongoMemoryReplSet seed persistence proof (no server binary download in CI)',...(securityOnly ? ['Client and ML profiles (covered by the independent full offline job)'] : [])] : [];
  save('summary.json', summary); console.log(JSON.stringify(summary, null, 2));
  if (!summary.success) {
    for (const exit of exits) {
      if (exit.code !== 0 || exit.timedOut) {
        console.error(`=== FAILURE LOG FOR ${exit.mode} (code: ${exit.code}, timedOut: ${exit.timedOut}) ===`);
        try {
          console.error(fs.readFileSync(path.join(out, exit.mode + '-console.txt'), 'utf8'));
        } catch (_) {}
      }
    }
  } else {
    for (const cacheMode of ['backend', 'client', 'email-pdf']) {
      bestEffortCleanup(path.join(out, cacheMode + '-cache'));
    }
  }
  process.exitCode = summary.success ? 0 : 1;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { cleanEnvironment, snapshot, isSnapshotFile, testTmpBase, bestEffortCleanup, isAllowedTempChild };
