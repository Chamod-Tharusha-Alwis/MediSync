'use strict';
// Synthetic registration-date backfill (server/scripts/demo/backfillDemoRegistrations.cjs). New test file.
// Unit checks on the deterministic plan, plus the in-memory MongoDB proof run in a child process (the MongoDB
// driver handshake fails inside the Jest sandbox): before / after / revert, unflagged patients untouched.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const bf = require('../scripts/demo/backfillDemoRegistrations.cjs');
const plan = require('../scripts/demo/demoSeedPlan.cjs');

describe('backfill plan (synthetic demonstration data)', () => {
  const p = bf.buildBackfillPlan({ referenceDate: '2026-11-18' });

  test('deterministic for the same reference date', () => {
    expect(bf.buildBackfillPlan({ referenceDate: '2026-11-18' }).digest).toBe(p.digest);
    expect(bf.buildBackfillPlan({ referenceDate: '2026-11-19' }).digest).not.toBe(p.digest);
  });

  test('6 complete days before the reference day, 8 to 25 per day, inside 08:00-20:00 Colombo', () => {
    expect(Object.keys(p.perDay)).toEqual(['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17']);
    for (const n of Object.values(p.perDay)) { expect(n).toBeGreaterThanOrEqual(bf.PER_DAY.min); expect(n).toBeLessThanOrEqual(bf.PER_DAY.max); }
    const D = plan.referenceMidnight('2026-11-18');
    for (const r of p.rows) {
      const t = Date.parse(r.createdAt);
      expect(t).toBeLessThan(D);
      expect(t).toBeGreaterThanOrEqual(D - 6 * plan.DAY_MS);
      const minutes = ((t - plan.referenceMidnight(new Date(t))) / 60000);
      expect(minutes).toBeGreaterThanOrEqual(8 * 60);
      expect(minutes).toBeLessThan(20 * 60);
    }
  });

  test('targets only the synthetic demo NICs, each once', () => {
    const synthetic = new Set(plan.buildIdentities().patients.map(x => x.nic));
    expect(new Set(p.rows.map(r => r.nic)).size).toBe(p.total);
    for (const r of p.rows) { expect(synthetic.has(r.nic)).toBe(true); expect(r.nic).toMatch(/^9991\d{8}$/); }
  });

  test('every write and revert filter requires the batch flags and the synthetic identifier pattern', async () => {
    const ops = [];
    const db = { collection: () => ({ bulkWrite: async o => { ops.push(...o); return { matchedCount: o.length, modifiedCount: o.length }; } }) };
    await bf.revertBackfill(db, { digest: p.digest, originals: [{ nic: p.rows[0].nic, createdAt: null }, { nic: p.rows[1].nic, createdAt: '2026-01-01T00:00:00.000Z' }] });
    for (const [i, o] of ops.entries()) {
      const parts = o.updateOne.filter.$and;
      expect(parts[0]).toEqual({ nic: p.rows[i].nic }); // exact NIC kept (not overwritten by the pattern)
      expect(parts[1].nic.$regex).toBe('^9991[0-9]{8}$');
      expect(parts[2]).toEqual({ syntheticSeedBatch: 'viva-2026-11-outbreaks', isSynthetic: true });
      expect(parts[3]).toEqual({ [bf.MARK]: p.digest });
    }
    expect(ops[0].updateOne.update).toEqual({ $unset: { createdAt: '', [bf.MARK]: '' } });
    expect(ops[1].updateOne.update.$set.createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});

const BINARY = process.env.MONGOMS_SYSTEM_BINARY || 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
const available = fs.existsSync(BINARY);
jest.setTimeout(240000);

(available ? describe : describe.skip)('in-memory proof: registration growth before, after and after revert', () => {
  let out;
  beforeAll(() => {
    const env = { ...process.env };
    for (const k of ['MONGO_URI', 'MONGO_URI_TEST', 'MONGODB_URI', 'REDIS_URL', 'NODE_OPTIONS']) delete env[k];
    const r = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'demo', 'fixpackProof.cjs'), 'backfill'], { env, encoding: 'utf8', timeout: 230000 });
    if (r.status !== 0) throw new Error(`proof failed: ${String(r.stderr).slice(-600)}`);
    out = JSON.parse(String(r.stdout).trim().split('\n').pop()).backfill;
  });

  test('chart counts: only the 2 unflagged recent patients before; plan counts added after; back to before after revert', () => {
    const sum = rows => rows.reduce((n, r) => n + r.count, 0);
    expect(sum(out.before)).toBe(2);
    expect(sum(out.after)).toBe(2 + out.plan.total);
    expect(out.afterRevert).toEqual(out.before);
    expect(out.written.modified).toBe(out.plan.total);
    expect(out.reverted.modified).toBe(out.plan.total);
  });

  test('unflagged patients unchanged, second apply refused, no marker left, originals were absent', () => {
    expect(out.unflaggedUnchanged).toBe(true);
    expect(out.secondApplyRefused).toBe('ALREADY_BACKFILLED');
    expect(out.stillMarked).toBe(0);
    expect(out.manifestOriginalsNull).toBe(out.plan.total);
  });
});

if (!available) test('mongod binary not installed: in-memory backfill proof skipped', () => expect(available).toBe(false));
