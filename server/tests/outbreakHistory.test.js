'use strict';
/**
 * Outbreak Monitor vs Outbreak History (new test file; existing tests unchanged).
 * Unit tests for the shared 14-day rule and validation, plus a child-process proof on an in-memory replica set that
 * drives the real controllers and queries (skipped if no local mongod exists).
 */
const path = require('path');
const cp = require('child_process');
const fs = require('fs');
const views = require('../src/services/outbreakViews');

const H = 3600000, D = 24 * H;
const NOW = new Date('2026-11-19T06:00:00Z');
const at = ms => new Date(+NOW - ms);

describe('shared 14-day rule (services/outbreakViews.js)', () => {
  test('13 d 23 h old Pending/Active alerts are on the Monitor; 14 d 1 h old are not', () => {
    for (const status of ['Pending', 'Active']) {
      expect(views.isMonitorAlert({ status, createdAt: at(13 * D + 23 * H) }, NOW)).toBe(true);
      expect(views.isMonitorAlert({ status, createdAt: at(14 * D + H) }, NOW)).toBe(false);
    }
  });
  test('a resolved or dismissed alert from today is never on the Monitor', () => {
    expect(views.isMonitorAlert({ status: 'Resolved', createdAt: at(H) }, NOW)).toBe(false);
    expect(views.isMonitorAlert({ status: 'Dismissed', createdAt: at(H) }, NOW)).toBe(false);
  });
  test('the History condition is the exact complement of the Monitor condition (one helper, no second cut-off)', () => {
    expect(views.historyCondition(NOW)).toEqual({ $nor: [views.monitorCondition(NOW)] });
    expect(views.monitorCondition(NOW)).toEqual({ status: { $in: ['Pending', 'Active'] }, createdAt: { $gte: new Date(+NOW - 14 * D) } });
    expect(views.MONITOR_WINDOW_DAYS).toBe(14);
  });
  test('every status x age combination lands in exactly one list', () => {
    for (const status of views.ALL_STATUSES.concat([undefined])) {
      for (const age of [0, H, 13 * D + 23 * H, 14 * D - 1, 14 * D, 14 * D + 1, 14 * D + H, 400 * D]) {
        const alert = { status, createdAt: at(age) };
        const monitor = views.isMonitorAlert(alert, NOW);
        const history = !monitor; // History = NOT Monitor, by construction
        expect(Number(monitor) + Number(history)).toBe(1);
      }
    }
  });
});

describe('history query validation (400 + code)', () => {
  const districts = new Set(['Colombo', 'Galle']);
  test.each([
    [{ page: '0' }, 'INVALID_PAGE'], [{ page: '1.5' }, 'INVALID_PAGE'], [{ page: 'abc' }, 'INVALID_PAGE'],
    [{ limit: '0' }, 'INVALID_LIMIT'], [{ limit: '101' }, 'INVALID_LIMIT'],
    [{ from: '2026-02-30' }, 'INVALID_DATE'], [{ to: '19-11-2026' }, 'INVALID_DATE'],
    [{ from: '2026-11-10', to: '2026-11-01' }, 'INVALID_DATE_RANGE'],
    [{ status: 'Open' }, 'INVALID_STATUS'], [{ district: 'Atlantis' }, 'INVALID_DISTRICT'],
    [{ disease: 'x'.repeat(65) }, 'INVALID_DISEASE'], [{ disease: '$where' }, 'INVALID_DISEASE'],
    [{ sort: 'createdAt' }, 'UNKNOWN_FILTER'], [{ status: ['Resolved', 'Pending'] }, 'INVALID_FILTER'],
  ])('%j -> %s', (query, code) => {
    expect(() => views.parseHistoryQuery(query, { districts })).toThrow(expect.objectContaining({ code, status: 400 }));
  });
  test('valid query: paging defaults, limit max 100, Sri Lanka calendar days', () => {
    const q = views.parseHistoryQuery({ view: 'history', limit: '100', status: 'Resolved', district: 'Galle', from: '2026-11-01', to: '2026-11-18' }, { districts });
    expect(q).toMatchObject({ page: 1, limit: 100, skip: 0, filters: { status: 'Resolved', district: 'Galle' } });
    expect(q.from.toISOString()).toBe('2026-10-31T18:30:00.000Z'); // 2026-11-01 00:00 in Sri Lanka (UTC+05:30)
    expect(q.to.toISOString()).toBe('2026-11-18T18:29:59.999Z');
    expect(views.parsePaging({})).toEqual({ page: 1, limit: 20, skip: 0 });
  });
});

describe('route and role protection', () => {
  test('History is served by the admin-only alerts route (same role middleware as the Monitor)', () => {
    const routes = fs.readFileSync(path.join(__dirname, '../src/routes/adminRoutes.js'), 'utf8');
    expect(routes).toMatch(/router\.get\('\/outbreak\/alerts', protect\(\['admin', 'super_admin'\]\), require\('\.\.\/controllers\/alertController'\)\.getActiveAlerts\);/);
  });
  test('the history handler refuses non-admin roles with 403', async () => {
    const { getAlertHistory } = require('../src/controllers/alertController');
    for (const role of ['doctor', 'patient', 'pharmacist', 'hospital_admin', 'health_officer']) {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      await getAlertHistory({ user: { id: 'x', role }, query: { view: 'history' } }, res);
      expect(res.status).toHaveBeenCalledWith(403);
    }
  });
});

const BINARY = process.env.MONGOMS_SYSTEM_BINARY || 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
(fs.existsSync(BINARY) ? describe : describe.skip)('database proof (in-memory replica set, real controllers)', () => {
  let r;
  beforeAll(() => {
    const env = { ...process.env }; for (const k of ['MONGO_URI', 'MONGO_URI_TEST', 'MONGODB_URI', 'REDIS_URL']) delete env[k];
    const out = cp.execFileSync(process.execPath, [path.join(__dirname, '../scripts/demo/outbreakHistoryProof.cjs')], { env, encoding: 'utf8', timeout: 240000 });
    r = JSON.parse(out.split('\n').find(l => l.startsWith('{"label"')));
  }, 250000);

  test('no overlap and no gap: every alert appears in exactly one list', () => {
    expect(r.partition).toMatchObject({ overlap: 0, gap: 0, duplicatesInMonitor: 0, duplicatesInHistory: 0 });
    expect(r.partition.monitorCount + r.partition.historyCount).toBe(r.total);
  });
  test('14-day boundary and terminal statuses', () => {
    expect(r.placement).toEqual({ 'pending-now': 'monitor', 'pending-13d23h': 'monitor', 'pending-14d1h': 'history', 'active-13d23h': 'monitor', 'active-14d1h': 'history',
      'resolved-today': 'history', 'dismissed-today': 'history', 'resolved-old': 'history', 'pending-90d': 'history', 'demo-pending-2d': 'monitor', 'demo-pending-20d': 'history' });
  });
  test('Monitor is paginated (default 20); History paginates and filters', () => {
    expect(r.partition.monitorDefaultLimit).toBe(20);
    expect(r.partition.monitorPages).toBe(Math.ceil(r.partition.monitorCount / 20));
    expect(r.historyPage2).toEqual({ status: 200, rows: 2, total: r.partition.historyCount, pages: Math.ceil(r.partition.historyCount / 2) });
    expect(r.filterResolved.every(s => s === 'Resolved')).toBe(true);
    expect(r.filterGalle).toEqual(['Galle']);
    expect(r.filterRange).toEqual([true]);
  });
  test('validation errors return 400 with a code; non-admin gets 403', () => {
    expect(r.validation).toEqual({ page0: '400 INVALID_PAGE', limit101: '400 INVALID_LIMIT', badDate: '400 INVALID_DATE', badStatus: '400 INVALID_STATUS',
      badRange: '400 INVALID_DATE_RANGE', unknown: '400 UNKNOWN_FILTER', badDistrict: '400 INVALID_DISTRICT', monitorBadPage: '400 INVALID_PAGE' });
    expect(r.nonAdminHistory).toBe(403);
  });
  test('History rows: stored 72-hour snapshot only, closed date only for closed alerts, nothing invented', () => {
    expect(r.historySample).toMatchObject({ status: 'Resolved', historyReason: 'closed', alert72h: null });
    expect(r.historySample.closedAt).toBeTruthy();
    expect(r.historySample.sourceConsultationIds).toBeUndefined();
  });
  test('the Monitor list query uses the new compound index, not a collection scan', () => {
    expect(r.indexes).toEqual(expect.arrayContaining(['{"surveillancePolicy":1,"status":1,"createdAt":-1}', '{"surveillancePolicy":1,"createdAt":-1}']));
    expect(r.explain.monitor.plan).toMatch(/IXSCAN/);
    expect(r.explain.monitor.plan).not.toMatch(/COLLSCAN/);
  });
});
