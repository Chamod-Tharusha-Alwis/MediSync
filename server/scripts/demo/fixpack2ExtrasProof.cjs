'use strict';
/**
 * server/scripts/demo/fixpack2ExtrasProof.cjs — offline proof for fix pack 2, PR C (synthetic demonstration data).
 * In-memory MongoDB only (fixpackProof.cjs refuses to run when a real database URI is set). No real email.
 *
 *   node server/scripts/demo/fixpack2ExtrasProof.cjs scan        scan timing on the seeded batch; 202 + poll
 *   node server/scripts/demo/fixpack2ExtrasProof.cjs <mode> ...  further modes are added by later commits
 */
const fs = require('fs');
const net = require('net');
const path = require('path');
const { performance } = require('perf_hooks');
const proof = require('./fixpackProof.cjs');

const SERVER = path.resolve(__dirname, '../..');
const ctrl = n => require(path.join(SERVER, 'src', 'controllers', n));
const median = xs => { const s = [...xs].sort((a, b) => a - b); return +s[Math.floor(s.length / 2)].toFixed(1); };
const sleepingEngine = () => new Promise(resolve => { const sockets = []; const s = net.createServer(c => sockets.push(c)); s.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${s.address().port}`, close: () => { sockets.forEach(x => x.destroy()); s.close(); } })); });

async function withDatabase(fn) {
  const env = await proof.setup();
  try { return await fn(env); } finally {
    await env.mongoose.disconnect().catch(() => {});
    await env.replica.stop().catch(() => {});
    fs.rmSync(env.dbPath, { recursive: true, force: true });
  }
}

async function scan(env) {
  const seeded = await proof.seed(env.db);
  const { runAnalysis } = require(path.join(SERVER, 'src', 'services', 'surveillanceService'));
  const admin = ctrl('adminController');
  const user = { id: String(new env.mongoose.Types.ObjectId()), role: 'admin' };
  const out = { label: 'synthetic demonstration data', seeded };

  // 1. Scan duration with the ML engine unreachable (connection refused at once): median of 5.
  process.env.ML_ENGINE_URL = 'http://127.0.0.1:9';
  const fast = [];
  for (let i = 0; i < 5; i++) { const t = performance.now(); await runAnalysis({ mode: 'real' }); fast.push(performance.now() - t); }
  out.scanMsEngineRefused = { median: median(fast), runs: fast.map(x => +x.toFixed(1)) };

  // 2. Same scan while the ML engine is asleep (accepts the connection, never answers): one run.
  const engine = await sleepingEngine();
  process.env.ML_ENGINE_URL = engine.url;
  try {
    let t = performance.now(); await runAnalysis({ mode: 'real' }); out.scanMsEngineAsleep = +(performance.now() - t).toFixed(0);

    // 3. Synchronous trigger (old client behaviour) vs async trigger (202 + poll), engine still asleep.
    t = performance.now();
    const started = await proof.call(admin.triggerMLDetection, { user, body: { async: true }, query: {}, app: { get: () => null } });
    const acceptedMs = +(performance.now() - t).toFixed(1);
    let job;
    for (;;) { await new Promise(r => setTimeout(r, 500)); job = (await proof.call(admin.getLastScan, { query: { jobId: started.body.jobId }, user })).body; if (job.status !== 'running') break; }
    out.asyncTrigger = { status: started.status, acceptedMs, jobStatus: job.status, jobDurationMs: job.durationMs, alertsInResult: (job.result?.results || []).length };
    // 4. A trigger whose browser request was cut off still completes on the server: the job (and the scan's
    //    own stored record) finish without any client attached.
    out.unknownJob = (await proof.call(admin.getLastScan, { query: { jobId: 'ffffffffffffffffffffffff' }, user })).status;
  } finally { engine.close(); }
  out.lastScan = (await proof.call(admin.getLastScan, { query: {}, user })).body?.lastScan ? 'stored' : 'missing';
  return out;
}

// C3: reminder once per pending High/Critical alert; bell notifications; email through the existing controls.
async function reminder(env) {
  const seeded = await proof.seed(env.db);
  process.env.MEDISYNC_TEST_MODE = 'true'; // capture email in memory; never sent
  process.env.FRONTEND_URL = 'https://medisync.example.invalid';
  const admins = [{ email: 'admin.one@qa.medisync.local' }, { email: 'admin.two@qa.medisync.local' }]
    .map(a => ({ _id: new env.mongoose.Types.ObjectId(), ...a, fullName: 'Fixture Admin', password: 'x', role: 'admin', isActive: true }));
  await env.db.collection('admins').insertMany(admins);
  process.env.OUTBREAK_DEMO_EMAIL_ALLOWLIST = admins[0].email; // seeded alerts are demonstration alerts
  const { remindPendingAlerts } = require(path.join(SERVER, 'src', 'services', 'alertReminderService'));
  const mail = require(path.join(SERVER, 'src', 'utils', 'emailService'));
  global.__MEDISYNC_CAPTURED_TEST_EMAILS = [];
  const pendingHighCritical = await env.db.collection('outbreakalerts').countDocuments({ status: 'Pending', severity: { $in: ['High', 'Critical'] } });
  // The harness stubs notificationService (fixpackProof.cjs); this recorder writes the same Notification documents.
  const Notification = require(path.join(SERVER, 'src', 'models', 'Notification'));
  const notifications = { sendNotification: (io, userId, n) => Notification.create({ userId, role: n.role, title: n.title, message: n.message, type: n.type, referenceId: n.referenceId }) };
  const first = await remindPendingAlerts({}, { notifications });
  const second = await remindPendingAlerts({}, { notifications });
  process.env.OUTBREAK_EMAIL_DELIVERY_ENABLED = 'false';
  const killSwitch = await remindPendingAlerts({ force: true }, { notifications });
  delete process.env.OUTBREAK_EMAIL_DELIVERY_ENABLED;
  const captured = mail.__getCapturedTestEmails().map(m => ({ to: m.to, subject: m.subject, text: m.text }));
  return {
    label: 'synthetic demonstration data', seeded, pendingHighCritical,
    first: { alerts: first.alerts, notifications: first.notifications, email: first.email },
    second: { alerts: second.alerts },
    killSwitch: { alerts: killSwitch.alerts, email: killSwitch.email },
    bellNotifications: await env.db.collection('notifications').countDocuments({ type: 'outbreak_alert' }),
    remindedAlerts: await env.db.collection('outbreakalerts').countDocuments({ reminderSentAt: { $exists: true } }),
    captured,
  };
}

const MODES = { scan, reminder };

async function main(mode) {
  if (!MODES[mode]) throw new Error(`unknown mode ${mode}`);
  return withDatabase(MODES[mode]);
}

if (require.main === module) {
  main(process.argv[2]).then(r => { console.log(JSON.stringify(r)); process.exit(0); }).catch(e => { console.error(e.stack); process.exit(1); });
}
module.exports = { main, withDatabase, MODES };
