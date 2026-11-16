'use strict';
// In-memory database test (new file). The MongoDB driver handshake fails inside the Jest sandbox, so the scan runs
// in a child Node process (server/scripts/demo/alert72hScanProof.cjs) against a loopback MongoMemoryReplSet from the
// locally installed mongod; this test asserts on its JSON output. Synthetic demonstration data; mail is captured.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const BINARY = process.env.MONGOMS_SYSTEM_BINARY || 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
const available = fs.existsSync(BINARY);
jest.setTimeout(180000);

(available ? describe : describe.skip)('real scan stores the projection snapshot once (in-memory MongoDB)', () => {
  let out;
  beforeAll(() => {
    const env = { ...process.env };
    for (const k of ['MONGO_URI', 'MONGO_URI_TEST', 'MONGODB_URI', 'REDIS_URL', 'NODE_OPTIONS']) delete env[k];
    const r = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'demo', 'alert72hScanProof.cjs')], { env, encoding: 'utf8', timeout: 170000 });
    if (r.status !== 0) throw new Error(`proof failed: ${String(r.stderr).slice(-600)}`);
    out = JSON.parse(String(r.stdout).trim().split('\n').pop());
  });

  test('snapshot written at scan time equals the numbers computed from the records', () => {
    expect(out.scan1.snapshotsWritten).toBe(1);
    expect(out.scan1.snapshot).toMatchObject(out.scan1.expected);
    expect(out.scan1.snapshot.methodVersion).toBe('alert72h-naive-empirical-v1');
  });

  test('later scans never overwrite it; the outcome is added after the next 72 hours with the absolute error', () => {
    expect(out.scan2.snapshotUnchanged).toBe(true);
    expect(out.scan2.outcome).toBeNull();
    expect(out.scan3.snapshotUnchanged).toBe(true);
    expect(out.scan3.outcomesWritten).toBe(1);
    expect(out.scan3.outcome).toMatchObject({ actualNext72h: 9, absoluteError: Math.abs(9 - out.scan1.snapshot.projected) });
  });

  test('approval sends the detailed email to the allowlist only (captured, not sent)', () => {
    expect(out.approval.status).toBe(200);
    expect(out.approval.emailDelivery).toMatchObject({ attempted: true, sentCount: 1, isDemonstration: true });
    expect(out.approval.capturedMails).toHaveLength(1);
    expect(out.approval.capturedMails[0].to).toEqual(['viva.admin@qa.medisync.local']);
    expect(out.approval.capturedMails[0].subject).toBe('[MediSync] Critical: Dengue alert for Kurunegala');
    expect(out.approval.capturedMails[0].textHead[1]).toBe('SYNTHETIC DEMONSTRATION ALERT. Not an active public health notice.');
  });
});

if (!available) test('mongod binary not installed: in-memory scan test skipped', () => expect(available).toBe(false));
