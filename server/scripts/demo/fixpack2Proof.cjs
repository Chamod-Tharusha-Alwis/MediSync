'use strict';
/**
 * server/scripts/demo/fixpack2Proof.cjs — offline proof harness for fix pack 2 (synthetic demonstration data).
 * In-memory MongoDB only (same guard as fixpackProof.cjs: refuses to run when a real database URI is set).
 *
 *   node server/scripts/demo/fixpack2Proof.cjs fixtures <out.json>   response bodies for offline screenshots
 *
 * Every value comes from the real handlers over the seeded synthetic records. For the public-page screenshot
 * one seeded alert is approved inside the throwaway in-memory database (never anywhere else).
 */
const fs = require('fs');
const path = require('path');
const proof = require('./fixpackProof.cjs');

const SERVER = path.resolve(__dirname, '../..');
const ctrl = n => require(path.join(SERVER, 'src', 'controllers', n));

async function withDatabase(fn) {
  const env = await proof.setup();
  try { return await fn(env); } finally {
    await env.mongoose.disconnect().catch(() => {});
    await env.replica.stop().catch(() => {});
    fs.rmSync(env.dbPath, { recursive: true, force: true });
  }
}

async function fixtures(env) {
  const seeded = await proof.seed(env.db);
  const adminId = new env.mongoose.Types.ObjectId();
  const top = await env.db.collection('outbreakalerts').find({}).sort({ severity: 1, affectedCount: -1 }).limit(1).toArray();
  if (top[0]) await env.db.collection('outbreakalerts').updateOne({ _id: top[0]._id }, { $set: { status: 'Active', approvedBy: adminId, approvedAt: new Date(Date.now() - 3600000) } });
  const user = { id: String(adminId), role: 'admin', email: 'admin@qa.medisync.local' };
  const req = (q = {}) => ({ query: q, params: {}, user, app: { get: () => null }, headers: {}, ip: '127.0.0.1' });
  const pub = (q = {}) => ({ query: q, params: {}, app: { get: () => null }, headers: {}, ip: '127.0.0.1' });
  return {
    seeded,
    fixtures: {
      '/admin/outbreak/alerts': (await proof.call(ctrl('alertController').getActiveAlerts, req())).body,
      '/admin/outbreak/growth?window=72h': (await proof.call(ctrl('adminController').getOutbreakGrowth, req({ window: '72h' }))).body,
      '/public/outbreak-alerts': (await proof.call(ctrl('alertController').getPublicApprovedAlerts, pub())).body,
      '/public/health-stats': (await proof.call(ctrl('publicController').getHealthStats, pub())).body,
      '/public/consultation-activity': (await proof.call(ctrl('publicConsultationActivityController').getConsultationActivity, pub())).body,
    },
  };
}

async function main(mode, arg) {
  if (mode === 'fixtures') {
    const out = await withDatabase(fixtures);
    if (arg) fs.writeFileSync(arg, JSON.stringify(out.fixtures));
    return { label: 'synthetic demonstration data', seeded: out.seeded, endpoints: Object.keys(out.fixtures) };
  }
  throw new Error(`unknown mode ${mode}`);
}

if (require.main === module) {
  main(process.argv[2], process.argv[3]).then(r => { console.log(JSON.stringify(r)); process.exit(0); })
    .catch(e => { console.error(e.stack); process.exit(1); });
}
module.exports = { main, withDatabase };
