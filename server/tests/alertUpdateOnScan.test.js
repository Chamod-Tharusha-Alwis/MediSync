'use strict';
/**
 * A scan updates the existing active alert (new test file; existing tests unchanged). Unit tests with fakes, plus a
 * child-process proof with the real scan, queries, notifications and audit on an in-memory replica set (skipped without a
 * local mongod).
 */
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const views = require('../src/services/outbreakViews');
const upsert = require('../src/services/alertUpsert');

const H = 3600000, D = 24 * H;
const NOW = new Date('2026-11-25T06:00:00Z');
const at = ms => new Date(+NOW - ms);

describe('14-day rule uses the first detection', () => {
  test('firstDetectedAt decides; createdAt is the fallback; updates do not move the boundary', () => {
    expect(views.isMonitorAlert({ status: 'Pending', firstDetectedAt: at(13 * D + 23 * H), createdAt: at(40 * D), lastUpdatedAt: NOW }, NOW)).toBe(true);
    expect(views.isMonitorAlert({ status: 'Pending', firstDetectedAt: at(14 * D + H), createdAt: at(H), lastUpdatedAt: NOW }, NOW)).toBe(false);
    expect(views.isMonitorAlert({ status: 'Active', createdAt: at(13 * D) }, NOW)).toBe(true);
    expect(views.firstDetected({ createdAt: 'c' })).toBe('c');
    expect(views.firstDetected(null)).toBeNull();
  });
  test('the page form of the condition has the same cut-off, and History is its exact complement', () => {
    const recent = { $gte: views.monitorCutoff(NOW) };
    expect(views.monitorCondition(NOW, { detectedAt: true })).toEqual({ status: { $in: ['Pending', 'Active'] }, $or: [{ firstDetectedAt: recent }, { firstDetectedAt: null, createdAt: recent }] });
    expect(views.historyCondition(NOW, { detectedAt: true })).toEqual({ $nor: [views.monitorCondition(NOW, { detectedAt: true })] });
  });
});

describe('what counts as a change', () => {
  const m = (extra = {}) => ({ caseCount: 8, severity: 'High', previous72h: 1, actual72h: 8, projected72h: 8, ...extra });
  test.each([[{}, false], [{ caseCount: 9 }, true], [{ severity: 'Critical' }, true], [{ actual72h: 9 }, true], [{ projected72h: 9 }, true]])('%j -> %s', (extra, expected) => {
    expect(upsert.isChanged(m(), m(extra))).toBe(expected);
  });
  test('an old alert without 72-hour figures is not "changed" just because figures exist now', () => {
    expect(upsert.isChanged(upsert.lastMeasurement({ affectedCount: 8, severity: 'High' }), m())).toBe(false);
  });
});

const signal = extra => ({ surveillancePolicy: 'p', mode: 'real', isSimulation: false, disease: 'ICD10:A90', location: 'Colombo', caseCount: 8, severity: 'High', message: 'm', flags: { isDemoData: false }, sourceConsultationIds: ['a'], source: 'statistical_rule', triggeredBy: 'scheduled', ...extra });

test('a lost race is retried: the second scan reads the winner and changes nothing', async () => {
  const stored = { _id: 'x', status: 'Pending', affectedCount: 8, severity: 'High', updateCount: 1, sourceConsultationIds: ['a'], lastMeasured: { caseCount: 8, severity: 'High', previous72h: null, actual72h: null, projected72h: null } };
  const reads = [{ ...stored, updateCount: 0, affectedCount: 5, lastMeasured: { ...stored.lastMeasured, caseCount: 5 } }, stored];
  const Model = { findOne: jest.fn(() => ({ sort: () => ({ lean: async () => reads.shift() }) })), findOneAndUpdate: jest.fn(() => ({ lean: async () => null })), updateOne: jest.fn() };
  const r = await upsert.saveScanAlert(Model, signal());
  expect(r.action).toBe('unchanged');
  expect(Model.findOneAndUpdate).toHaveBeenCalledTimes(1);
  expect(Model.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ _id: 'x', disease: 'ICD10:A90', location: 'Colombo', status: { $in: ['Pending', 'Active'] }, updateCount: { $in: [0, null] } });
  expect(Model.updateOne).not.toHaveBeenCalled();
});

test('a duplicate-key error on creation is retried as an update of the alert that won', async () => {
  const winner = { _id: 'w', status: 'Pending', affectedCount: 8, severity: 'High', sourceConsultationIds: ['a'], lastMeasured: { caseCount: 8, severity: 'High', previous72h: null, actual72h: null, projected72h: null } };
  const reads = [null, winner];
  const Model = { findOne: () => ({ sort: () => ({ lean: async () => reads.shift() }) }), find: () => ({ select: () => ({ lean: async () => [] }) }), updateOne: jest.fn().mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 })) };
  expect((await upsert.saveScanAlert(Model, signal())).alert._id).toBe('w');
});

test('a database error is not swallowed', async () => {
  const Model = { findOne: () => ({ sort: () => ({ lean: async () => null }) }), find: () => ({ select: () => ({ lean: async () => [] }) }), updateOne: jest.fn().mockRejectedValue(new Error('down')) };
  await expect(upsert.saveScanAlert(Model, signal())).rejects.toThrow('down');
});

const BINARY = process.env.MONGOMS_SYSTEM_BINARY || 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
(fs.existsSync(BINARY) ? describe : describe.skip)('database proof (in-memory replica set, real scan)', () => {
  let r;
  beforeAll(() => {
    const env = { ...process.env }; for (const k of ['MONGO_URI', 'MONGO_URI_TEST', 'MONGODB_URI', 'REDIS_URL']) delete env[k];
    const out = cp.execFileSync(process.execPath, [path.join(__dirname, '../scripts/demo/alertUpdateProof.cjs')], { env, encoding: 'utf8', timeout: 240000, maxBuffer: 1e8 });
    r = JSON.parse(out.split('\n').find(l => l.startsWith('{"label"')));
  }, 250000);

  test('first scan creates one alert with first-detected = last-updated = created, and notifies every recipient once', () => {
    expect(r.first.saved).toEqual({ created: 1, updated: 0, unchanged: 0, closed: 0 });
    expect(r.first).toMatchObject({ alerts: 1, notifications: r.recipients, alert: { severity: 'High', updateCount: 0, history: 0, hasFirstSnapshot: true } });
    expect(r.first.alert.first).toBe(r.first.alert.created);
    expect(r.first.alert.last).toBe(r.first.alert.created);
  });
  test('identical data changes nothing and notifies nobody', () => {
    expect(r.identical).toEqual({ saved: { created: 0, updated: 0, unchanged: 1, closed: 0 }, alertsUnchanged: true, newNotifications: 0, newSockets: 0, newAudits: 0 });
  });
  test('more cases at the same severity update the SAME alert; no notification', () => {
    expect(r.sameSeverity).toMatchObject({ alerts: 1, newNotifications: 0, newSockets: 0, audits: 1, alert: { id: r.first.alert.id, affectedCount: 10, severity: 'High', updateCount: 1, history: 1, first: r.first.alert.first, created: r.first.alert.created } });
    expect(r.sameSeverity.alert.last).toBeGreaterThan(r.first.alert.last);
    expect(r.sameSeverity.entry).toMatchObject({ caseCountBefore: 8, caseCountAfter: 10, severityBefore: 'High', severityAfter: 'High', triggeredBy: 'admin_manual' });
    expect(r.sameSeverity.entry).toMatchObject({ actual72hBefore: 8, previous72h: expect.any(Number), actual72h: expect.any(Number), projected72h: expect.any(Number) });
  });
  test('a severity rise sends exactly one notification per recipient; a repeat sends none', () => {
    expect(r.escalation).toMatchObject({ alerts: 1, newNotifications: r.recipients, references: 2, afterRepeat: 0, alert: { id: r.first.alert.id, severity: 'Critical', updateCount: 2, history: 2, first: r.first.alert.first } });
    expect(r.escalation.titles).toEqual([expect.stringContaining('severity raised: High to Critical')]);
  });
  test('a smaller window never lowers the displayed count and is flagged in the history', () => {
    expect(r.lowerWindow.alert.affectedCount).toBe(r.lowerWindow.before);
    expect(r.lowerWindow.entry).toMatchObject({ note: 'WINDOW_RESULT_LOWER', caseCountBefore: 16, caseCountAfter: 14, displayedCaseCount: 16 });
  });
  test('an approved alert is updated and stays approved', () => {
    expect(r.approved).toMatchObject({ alerts: 1, status: 'Active', updateCount: 4 });
  });
  test.each(['Resolved', 'Dismissed'])('a %s alert is never changed; unchanged data makes no alert; a new case makes a new one', status => {
    expect(r.closed[status]).toMatchObject({ sameData: { created: 0, closed: 1 }, newAlertsSameData: 0, newData: { created: 1 }, newAlertsNewData: 1, closedUnchanged: true, newId: true, freshHistory: 0 });
  });
  test('another district or another disease is a separate alert', () => {
    expect(r.separate).toMatchObject({ saved: { created: 2 }, galle: 1, colomboOther: 1 });
  });
  test('five scans at the same moment: one alert, then one update', () => {
    expect(r.concurrent).toEqual({ created: { total: 1, alerts: 1, notifications: r.recipients }, updates: 1, alertsAfter: 1, history: 1, updateCount: 1, differentData: 1 });
  });
  test('old alerts: the newest of an old duplicate pair is updated, the other is untouched, createdAt stands in', () => {
    expect(r.legacy).toMatchObject({ saved: { updated: 1, created: 0 }, alerts: 2, olderUntouched: true, firstEqualsCreated: true, createdAtKept: true, noFirstSnapshotInvented: true });
    expect(r.api.oldRow).toEqual({ listed: true, hasNewFields: false });
    expect(r.api.monitorSorted).toBe(true);
  });
  test('Monitor and History: exactly one list each; an updated alert keeps its 14-day boundary', () => {
    expect(r.boundary).toEqual({ updatedThere: 2, placement: { Badulla: 'monitor', Ampara: 'history', Mannar: 'history', Vavuniya: 'monitor' }, updateCounts: { Badulla: 1, Ampara: 1 } });
    expect(r.partition).toMatchObject({ both: 0, none: 0, jsRuleAgrees: true });
  });
  test('the API returns the new fields and the newest 72-hour figures with the projection label', () => {
    expect(r.api.row).toEqual({ firstDetectedAt: true, lastUpdatedAt: true, updateCount: 1, history: 1, latest: true, first: true, caveat: 'projection, not a forecast' });
    expect(r.api.historyHasIds).toBe(false);
  });
  test('one audit entry per update, with before and after; the scheduled scan is recorded as the system', () => {
    expect(r.audit.entries).toBe(r.audit.updates);
    expect(r.audit.sample).toMatchObject({ actorId: true, actorRole: 'admin', details: { severityBefore: 'High', severityAfter: 'High', caseCountBefore: 8, caseCountAfter: 10 } });
    expect(r.scheduled).toEqual({ saved: 1, actor: 'system', role: 'system', triggeredBy: 'scheduled' });
  });
  test('no e-mail is sent by the scan and no index is added', () => {
    expect(r.emails).toBe(0);
    expect(r.indexes).toEqual(['{"_id":1}']);
  });
});
