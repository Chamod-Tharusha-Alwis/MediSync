'use strict';
/**
 * Fix pack 2, PR C: background scan job (C1), real email outcome (C2), review reminder (C3).
 * Unit tests offline with test doubles; the database proofs run in a child process on an in-memory replica set
 * (skipped if no local mongod exists). No real email: the test transport captures messages.
 */
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const { deliveryOutcome } = require('../src/services/emailOutcome');
const scanJobs = require('../src/services/scanJobs');
const { remindPendingAlerts, reminderEmail } = require('../src/services/alertReminderService');

const flush = () => new Promise(r => setTimeout(r, 10));

describe('C1: background scan job', () => {
  test('starts at once, finishes later, keeps the result; failure is reported without details', async () => {
    let release;
    const job = scanJobs.start(() => new Promise(r => { release = r; }));
    expect(job.status).toBe('running');
    expect(scanJobs.get(job.id)).toBe(job);
    await flush(); release({ results: [1, 2] }); await flush();
    expect(scanJobs.get(job.id)).toMatchObject({ status: 'done', result: { results: [1, 2] } });
    const bad = scanJobs.start(() => Promise.reject(new Error('internal detail'))); await flush();
    expect(scanJobs.get(bad.id)).toMatchObject({ status: 'failed', error: 'Surveillance analysis unavailable; no alert was broadcast.' });
    expect(scanJobs.get('not-an-id')).toBeNull();
  });
  test('GET last-scan?jobId= answers 404 for an unknown job and the status for a known one', async () => {
    const admin = require('../src/controllers/adminController');
    const res = () => { const r = { code: 200 }; r.status = c => { r.code = c; return r; }; r.json = b => { r.body = b; return r; }; return r; };
    const unknown = res(); await admin.getLastScan({ query: { jobId: 'ffffffffffffffffffffffff' } }, unknown);
    expect(unknown.code).toBe(404);
    const job = scanJobs.start(async () => ({ results: [] })); await flush();
    const known = res(); await admin.getLastScan({ query: { jobId: job.id } }, known);
    expect(known.body).toMatchObject({ jobId: job.id, status: 'done', result: { results: [] } });
  });
});

describe('C2: the real result of an outbreak email', () => {
  test('sent with provider id', () => {
    expect(deliveryOutcome({ sentCount: 1, messageIds: ['re_123'] })).toMatchObject({ outcome: 'sent', providerMessageIds: ['re_123'] });
  });
  test('captured by the test transport (.local address or test mode) is skipped, not "sent"', () => {
    expect(deliveryOutcome({ sentCount: 1, messageIds: ['test-accepted-1-abc'] })).toMatchObject({ outcome: 'skipped', reason: 'CAPTURED_NOT_SENT' });
  });
  test('kill switch, allowlist and daily cap are skipped with their reason; provider refusal is failed', () => {
    expect(deliveryOutcome({ blockedReason: 'OUTBREAK_EMAIL_DELIVERY_DISABLED' }).text).toBe('Skipped: outbreak email delivery is switched off (kill switch).');
    expect(deliveryOutcome({ blockedReason: 'NOT_ON_ALLOWLIST' }).outcome).toBe('skipped');
    expect(deliveryOutcome({ blockedReason: 'DAILY_EMAIL_CAP_REACHED' }).outcome).toBe('skipped');
    expect(deliveryOutcome({ sentCount: 0, errors: ['validation_error'] })).toMatchObject({ outcome: 'failed', reason: 'validation_error' });
  });
});

describe('C3: review reminder for pending High/Critical alerts', () => {
  const alerts = [
    { _id: 'a1', disease: 'ICD10:A90', location: 'Kurunegala', severity: 'Critical', status: 'Pending' },
    { _id: 'a2', disease: 'ICD10:A90', location: 'Kurunegala', severity: 'Critical', status: 'Pending' },
    { _id: 'a3', disease: 'ICD10:A279', location: 'Kegalle', severity: 'High', status: 'Pending' },
  ];
  const deps = (claimed = new Set()) => {
    const sent = [];
    return {
      sent,
      OutbreakAlert: {
        find: () => ({ sort: () => ({ limit: () => ({ lean: async () => alerts }) }) }),
        updateOne: async (filter) => { if (claimed.has(filter._id)) return { modifiedCount: 0 }; claimed.add(filter._id); return { modifiedCount: 1 }; },
        updateMany: async () => ({}),
      },
      Admin: { find: () => ({ select: () => ({ lean: async () => [{ _id: 'ad1', email: 'one@example.org', role: 'admin' }, { _id: 'ad2', email: 'two@example.org', role: 'super_admin' }] }) }) },
      notifications: { sendNotification: jest.fn(async () => ({})) },
      emailService: { getDailyDispatchedEmailCount: async () => 0, sendOutbreakAlert: jest.fn(async to => { sent.push(to); return { acceptedCount: to.length, messageIds: to.map((_, i) => `re_${i}`) }; }) },
      delivery: { isSyntheticOrDemo: () => false },
    };
  };
  test('once per alert: a second run reminds nothing', async () => {
    const claimed = new Set();
    const d1 = deps(claimed);
    const first = await remindPendingAlerts({ env: { FRONTEND_URL: 'https://medisync.example.invalid' } }, d1);
    expect(first.alerts).toBe(3);
    expect(first.notifications).toBe(2);
    expect(d1.emailService.sendOutbreakAlert).toHaveBeenCalledTimes(1);
    expect(first.email.outcome).toBe('sent');
    const second = await remindPendingAlerts({ env: {} }, deps(claimed));
    expect(second.alerts).toBe(0);
  });
  test('kill switch: bell entries still created, email skipped', async () => {
    const d = deps();
    const out = await remindPendingAlerts({ env: { OUTBREAK_EMAIL_DELIVERY_ENABLED: 'false' } }, d);
    expect(out.notifications).toBe(2);
    expect(d.emailService.sendOutbreakAlert).not.toHaveBeenCalled();
    expect(out.email.reason).toBe('OUTBREAK_EMAIL_DELIVERY_DISABLED');
  });
  test('demonstration alerts: only allowlisted administrators receive the email', async () => {
    const d = deps(); d.delivery.isSyntheticOrDemo = () => true;
    await remindPendingAlerts({ env: { OUTBREAK_DEMO_EMAIL_ALLOWLIST: 'two@example.org' } }, d);
    expect(d.sent).toEqual([['two@example.org']]);
  });
  test('email text: count, disease, district, severity, link; repeated signals grouped', () => {
    const m = reminderEmail(alerts, { link: 'https://medisync.example.invalid/admin/dashboard/outbreak' });
    expect(m.subject).toBe('3 outbreak alerts need review');
    expect(m.text).toContain('- Dengue, Kurunegala, Critical (2 alerts)');
    expect(m.text).toContain('Kegalle, High');
    expect(m.text).toContain('https://medisync.example.invalid/admin/dashboard/outbreak');
  });
});

const BINARY = process.env.MONGOMS_SYSTEM_BINARY || 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
const runProof = mode => {
  const env = { ...process.env }; for (const k of ['MONGO_URI', 'MONGO_URI_TEST', 'MONGODB_URI', 'REDIS_URL']) delete env[k];
  const out = cp.execFileSync(process.execPath, [path.join(__dirname, '../scripts/demo/fixpack2ExtrasProof.cjs'), mode], { env, encoding: 'utf8', timeout: 300000 });
  return JSON.parse(out.split('\n').find(l => l.startsWith('{"label"')));
};
(fs.existsSync(BINARY) ? describe : describe.skip)('C1 and C3 database proofs (in-memory replica set, child process)', () => {
  test('async trigger answers 202 at once while the scan (ML engine asleep) completes on the server', () => {
    const r = runProof('scan');
    expect(r.asyncTrigger.status).toBe(202);
    expect(r.asyncTrigger.acceptedMs).toBeLessThan(1000);
    expect(r.asyncTrigger.jobStatus).toBe('done');
    expect(r.scanMsEngineAsleep).toBeGreaterThan(r.scanMsEngineRefused.median);
    expect(r.unknownJob).toBe(404);
    expect(r.lastScan).toBe('stored');
  }, 320000);
  test('reminder: each pending High/Critical alert once; bell per administrator; allowlist and kill switch', () => {
    const r = runProof('reminder');
    expect(r.first.alerts).toBe(r.pendingHighCritical);
    expect(r.second.alerts).toBe(0);
    expect(r.first.notifications).toBe(2);
    expect(r.remindedAlerts).toBe(r.pendingHighCritical);
    expect(r.first.email.recipients).toBe(1);
    expect(r.killSwitch.email.reason).toBe('OUTBREAK_EMAIL_DELIVERY_DISABLED');
    expect(r.captured).toHaveLength(1);
    expect(r.captured[0].text).toMatch(/outbreak alerts? needs? review/);
  }, 320000);
});
