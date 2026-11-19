// Offline measurement of the outbreak-monitor endpoints on an in-memory replica set with the synthetic demo seed.
// Usage: node scripts/perf/monitorEndpointsOffline.cjs [repoRoot] [label]   (prints one JSON line; set PERF_FIXTURES=0 to skip the 2,000 historical alerts)
'use strict';
const path = require('path');
const ROOT = process.argv[2] || require('path').resolve(__dirname, '../..');
const LABEL = process.argv[3] || 'run';
for (const k of ['MONGO_URI', 'MONGO_URI_TEST', 'MONGODB_URI', 'REDIS_URL']) delete process.env[k];
process.env.ML_ENGINE_URL = 'http://127.0.0.1:9'; // closed port: the ML engine is unreachable (fails fast)
const proof = require(path.join(ROOT, 'server/scripts/demo/fixpackProof.cjs'));
const ctrl = n => require(path.join(ROOT, 'server/src/controllers', n));
const median = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

(async () => {
  const env = await proof.setup();
  const out = { label: LABEL, at: new Date().toISOString() };
  try {
    out.seeded = await proof.seed(env.db);
    // Historical alerts so explain() has something to skip: 2,000 resolved/old alerts in the same policy.
    const service = require(path.join(ROOT, 'server/src/services/surveillanceService'));
    const now = Date.now();
    const old = Array.from({ length: 2000 }, (_, i) => ({ disease: 'ICD10:A90', location: 'Colombo', district: 'Colombo', severity: 'Moderate',
      status: i % 2 ? 'Resolved' : 'Pending', surveillancePolicy: service.POLICY, isSimulation: false, sourceConsultationIds: [],
      createdAt: new Date(now - (20 + (i % 300)) * 86400000), updatedAt: new Date(now - 20 * 86400000), message: 'synthetic historical alert (perf fixture)' }));
    if (process.env.PERF_FIXTURES !== '0') await env.db.collection('outbreakalerts').insertMany(old);
    out.alertsInCollection = await env.db.collection('outbreakalerts').countDocuments();
    const admin = { id: String(new env.mongoose.Types.ObjectId()), role: 'admin', email: 'admin@qa.medisync.local' };
    const req = (q = {}) => ({ query: q, params: {}, user: admin, app: { get: () => null }, headers: {}, ip: '127.0.0.1' });
    const handlers = {
      'GET /admin/outbreak/alerts': () => proof.call(ctrl('alertController').getActiveAlerts, req()),
      'GET /admin/outbreak/growth?window=72h': () => proof.call(ctrl('adminController').getOutbreakGrowth, req({ window: '72h' })),
      'GET /admin/outbreak/last-scan': () => proof.call(ctrl('adminController').getLastScan, req()),
      'GET /admin/stats': () => proof.call(ctrl('adminController').getSystemStats, req()),
      'GET /admin/ml-status (ML unreachable)': () => proof.call(ctrl('adminController').getMLStatus, req()),
    };
    out.timings = {};
    for (const [name, fn] of Object.entries(handlers)) {
      const ms = [];
      let last;
      for (let i = 0; i < 10; i++) { const t = process.hrtime.bigint(); last = await fn(); ms.push(Number(process.hrtime.bigint() - t) / 1e6); }
      out.timings[name] = { n: 10, medianMs: +median(ms).toFixed(1), maxMs: +Math.max(...ms).toFixed(1), status: last.status || 200,
        rows: Array.isArray(last.body?.data) ? last.body.data.length : undefined, pagination: last.body?.pagination };
    }
    // Parallel page load as the monitor + admin shell issue it (6 calls at once).
    const t0 = process.hrtime.bigint();
    await Promise.all([handlers['GET /admin/stats'](), handlers['GET /admin/outbreak/alerts'](), handlers['GET /admin/ml-status (ML unreachable)'](),
      handlers['GET /admin/outbreak/alerts'](), handlers['GET /admin/outbreak/growth?window=72h'](), handlers['GET /admin/outbreak/last-scan']()]);
    out.parallelPageLoadMs = +(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1);
    // explain(): the alert list query and the case-loading query.
    const alertFilter = { surveillancePolicy: service.POLICY, ...service.realAlertFilter(), syntheticSeedBatch: { $exists: false }, status: { $in: ['Active', 'Pending'] } };
    const ex1 = await env.db.collection('outbreakalerts').find(alertFilter).sort({ createdAt: -1 }).explain('executionStats');
    const since = new Date(now - 70 * 86400000);
    const ex2 = await env.db.collection('consultations').find({ createdAt: { $gte: since, $lte: new Date() } }).explain('executionStats');
    const stage = ex => { let s = ex.queryPlanner.winningPlan; const names = []; while (s) { names.push(s.stage); s = s.inputStage; } return names.join(' <- '); };
    out.explain = {
      alerts: { plan: stage(ex1), docsExamined: ex1.executionStats.totalDocsExamined, keysExamined: ex1.executionStats.totalKeysExamined, returned: ex1.executionStats.nReturned },
      consultations70d: { plan: stage(ex2), docsExamined: ex2.executionStats.totalDocsExamined, keysExamined: ex2.executionStats.totalKeysExamined, returned: ex2.executionStats.nReturned },
    };
    out.indexes = { outbreakalerts: (await env.db.collection('outbreakalerts').indexes()).map(i => JSON.stringify(i.key)), consultations: (await env.db.collection('consultations').indexes()).map(i => JSON.stringify(i.key)) };
  } finally {
    await env.mongoose.disconnect().catch(() => {});
    await env.replica.stop().catch(() => {});
    require('fs').rmSync(env.dbPath, { recursive: true, force: true });
  }
  console.log(JSON.stringify(out));
  process.exit(0);
})().catch(e => { console.error(e.stack); process.exit(1); });
