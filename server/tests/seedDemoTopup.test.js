'use strict';
/**
 * Scheduled synthetic demo top-up (new test file; existing tests unchanged): argument and target guards, plan rules, and an
 * end-to-end proof on an in-memory replica set (skipped if the local MongoDB binaries do not exist).
 */
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const tool = require('../scripts/demo/seedDemoTopup.cjs');
const plan = require('../scripts/demo/demoSeedPlan.cjs');

const REMOTE = 'mongodb+srv://user:secret@cluster0.example.mongodb.net/medisync_prod';
const args = (...extra) => tool.parseArgs(['--batch=run1', ...extra]);

describe('guards', () => {
  test('dry run is the default; a batch name is required; unknown arguments are refused', () => {
    expect(args().write).toBeUndefined();
    for (const bad of [[], ['--batch='], ['--batch=UPPER'], ['--batch=a'], ['--batch=run1', '--force'], ['--batch=run1', '--write', '--dry-run']]) {
      expect(() => tool.parseArgs(bad)).toThrow(tool.SeedError);
    }
  });
  test('default target is this computer', () => {
    expect(tool.resolveTarget({}, args())).toMatchObject({ local: true, dbName: 'medisync_demo_seed' });
  });
  test('a remote target needs --confirm-production and an allow-listed host; the address is never in the message', () => {
    const attempt = (env, ...extra) => { try { tool.resolveTarget({ SEED_DEMO_URI: REMOTE, ...env }, args(...extra)); return 'allowed'; } catch (e) { expect(e.message).not.toMatch(/secret|user:/); return e.message; } };
    expect(attempt({})).toMatch(/--confirm-production/);
    expect(attempt({ SEED_DEMO_ALLOWED_HOSTS: 'cluster0.example.mongodb.net' })).toMatch(/--confirm-production/);
    expect(attempt({}, '--confirm-production')).toMatch(/SEED_DEMO_ALLOWED_HOSTS/);
    expect(attempt({ SEED_DEMO_ALLOWED_HOSTS: 'other.mongodb.net' }, '--confirm-production')).toMatch(/SEED_DEMO_ALLOWED_HOSTS/);
    expect(attempt({ SEED_DEMO_ALLOWED_HOSTS: 'mongodb.net' }, '--confirm-production')).toMatch(/SEED_DEMO_ALLOWED_HOSTS/);
    expect(attempt({ SEED_DEMO_ALLOWED_HOSTS: 'cluster0.example.mongodb.net' }, '--confirm-production')).toBe('allowed');
    expect(attempt({ SEED_DEMO_ALLOWED_HOSTS: 'cluster0.example.mongodb.net' }, '--confirm-production', '--today=2026-11-25')).toMatch(/--today/);
  });
});

describe('plan', () => {
  const todayMidnight = plan.referenceMidnight('2026-11-25');
  const start = Object.fromEntries(tool.EPISODES.map(e => [e.id, plan.referenceMidnight('2026-11-21')]));
  const groups = tool.buildRows({ todayMidnight, episodeStarts: start });
  const rows = [...groups.values()].flat();
  test('covers today-70 to today-1 only, deterministic, at most three planted episodes', () => {
    const dates = [...new Set(rows.map(r => r.date))].sort();
    expect([dates[0], dates[dates.length - 1]]).toEqual(['2026-09-16', '2026-11-24']);
    expect(rows.every(r => r.time < todayMidnight)).toBe(true);
    expect(JSON.stringify([...tool.buildRows({ todayMidnight, episodeStarts: start })])).toBe(JSON.stringify([...groups]));
    expect(new Set(rows.filter(r => r.episode).map(r => r.episode)).size).toBeLessThanOrEqual(3);
  });
  test('documents are labelled synthetic and hold no personal or encrypted field', () => {
    const doc = tool.caseDocument(rows.find(r => r.episode), 1, 'run1', start);
    expect(doc).toMatchObject({ seedBatch: 'run1', isSynthetic: true, syntheticSeedBatch: plan.BATCH_TAG, plantedEpisode: expect.any(String) });
    for (const k of ['patientNic', 'patientNic_bi', 'nicHash', 'diagnosis', 'notes', 'doctorId', 'hospitalId']) expect(doc).not.toHaveProperty(k);
    for (const h of tool.HISTORY_ALERTS) {
      const alert = tool.historyDocument(h, 'run1', todayMidnight);
      expect(alert).toMatchObject({ seedBatch: 'run1', isSynthetic: true, isDemoData: true, sourceConsultationIds: [] });
      expect(['Resolved', 'Dismissed']).toContain(alert.status);
      expect(alert.message).toMatch(/Not produced by a detector scan/);
      expect(h.daysAgo).toBeGreaterThan(14);
    }
  });
});

const BINARY = process.env.MONGOMS_SYSTEM_BINARY || 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
const TOOLS = 'C:/Program Files/MongoDB/Tools/100/bin/mongorestore.exe';
(fs.existsSync(BINARY) && fs.existsSync(TOOLS) ? describe : describe.skip)('database proof (in-memory replica set)', () => {
  let r;
  beforeAll(() => {
    const env = { ...process.env }; for (const k of ['MONGO_URI', 'MONGO_URI_TEST', 'MONGODB_URI', 'REDIS_URL', 'SEED_DEMO_URI']) delete env[k];
    const out = cp.execFileSync(process.execPath, [path.join(__dirname, '../scripts/demo/seedTopupProof.cjs')], { env, encoding: 'utf8', timeout: 240000, maxBuffer: 1e8 });
    r = JSON.parse(out.split('\n').find(l => l.startsWith('{"label"')));
  }, 250000);

  test('dry run and every refusal write nothing', () => {
    expect(r.dryRun.unchanged).toBe(true);
    expect(r.dryRun.planned.consultations).toBeGreaterThan(0);
    expect(r.refusedWithoutOptIn).toMatchObject({ unchanged: true, error: expect.stringMatching(/REFUSED/) });
    expect(r.sizeGuard).toMatchObject({ unchanged: true, error: expect.stringMatching(/limit/) });
    expect(r.backupInRepo).toEqual({ unchanged: true, error: 'BACKUP_DIR_MUST_BE_OUTSIDE_THE_REPOSITORY' });
  });
  test('idempotent: the same command adds nothing; a later day adds only the new day; no combination twice', () => {
    expect(r.repeat).toEqual({ consultations: 0, historyAlerts: 0 });
    expect(r.runs.map(x => x.error)).toEqual([undefined, undefined, undefined, undefined]);
    expect(r.runs.slice(1).map(x => x.dates)).toEqual([['2026-11-25'], ['2026-11-26'], ['2026-11-27']]);
    for (const x of r.runs) expect(x.addedToDb).toBe(x.inserted.consultations);
    expect(r.noDuplicateCombos).toEqual({ combosInTwoBatches: 0, combosAlsoInOldData: 0 });
    expect(new Set(r.runs.map(x => JSON.stringify(x.episodes))).size).toBe(1); // later runs extend the same episodes
  });
  test('every row is labelled; public statistics do not change; scan alerts are demonstration alerts', () => {
    expect(r.labels).toMatchObject({ allLabelled: true, noPersonalFields: true, uniqueIds: true });
    expect(r.publicStatistics.unchanged).toBe(true);
    expect(r.publicStatistics.sample).not.toMatch(/error/);
    expect(r.scan.allDemoLabelled).toBe(true);
    expect(r.scan.pendingAlerts.length).toBeGreaterThan(0);
    expect(r.pages.monitor).toEqual({ status: 200, rows: r.scan.pendingAlerts.length });
    expect(r.pages.history).toEqual({ status: 200, rows: ['Batticaloa Dismissed', 'Kalutara Resolved', 'Trincomalee Resolved'] });
  });
  test('the backup restores; rollback removes only the batch; nothing else changed', () => {
    expect(r.restore).toMatchObject({ exit: 0, consultations: r.restore.expected });
    expect(r.rollbackDry.unchanged).toBe(true);
    expect(r.rollback.left).toBe(0);
    expect(r.rollback.dropped).toBe(r.rollback.removed.consultations);
    expect(r.rollback.otherBatches).toBeGreaterThan(0);
    expect(r.afterAllRollbacks.consultations).toBe(r.afterAllRollbacks.start);
    expect(r.afterAllRollbacks.untouched).toBe(true);
    expect(r.configLeft).toBe(false);
  });
});
