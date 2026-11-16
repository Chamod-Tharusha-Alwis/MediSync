'use strict';
// Alert 72-hour numbers and projection (server/src/services/alertProjection72h.js). New test file.
// Fixtures are synthetic demonstration data; no database, no network.
const p = require('../src/services/alertProjection72h');
const { getColomboMidnight } = require('../src/services/surveillanceService');

const DAY = 86400000, H72 = 3 * DAY;
const asOf = new Date('2026-11-17T06:30:00Z'); // 12:00 Colombo
const E = getColomboMidnight(asOf);
const alert = { _id: '64b000000000000000000001', disease: 'ICD10:A90', location: 'Kurunegala' };

// periods oldest -> newest; the last one ends at E. Each case sits 1 hour into its period.
function casesFor(periods, district = 'Kurunegala', disease = 'ICD10:A90', endAt = E) {
  const rows = [];
  periods.forEach((count, i) => {
    const start = endAt - (periods.length - i) * H72;
    for (let k = 0; k < count; k++) rows.push({ district, diseaseId: disease, time: start + 3600000 + k * 60000 });
  });
  return rows;
}
const PERIODS = [2, 3, 2, 4, 3, 5, 4, 6, 5, 7, 6]; // changes: +1,-1,+2,-1,+2,-1,+2,-1,+2,-1

describe('alert 72-hour numbers (synthetic demonstration fixtures)', () => {
  test('previous, actual and projected values and the empirical range are computed from the records', () => {
    const cases = [...casesFor(PERIODS), ...casesFor([4, 4], 'Colombo'), ...casesFor([9], 'Kurunegala', 'ICD10:A01')];
    const n = p.computeAlertNumbers(alert, cases, { asOf, lookbackStart: +asOf - 63 * DAY });
    expect(n.previous72h).toBe(7);
    expect(n.actual72h).toBe(6);
    expect(n.change).toBe(-1);
    expect(n.percentChange).toBe(-14.3);
    expect(n.projection.projected).toBe(6); // naive: the actual last 72 hours
    expect(n.projection.historyWindows).toBe(10);
    // sorted changes [-1 x5, +1, +2 x4]: q10 = -1, q90 = +2 -> range 5..8
    expect([n.projection.low, n.projection.high]).toEqual([5, 8]);
    expect(n.projection.enoughHistory).toBe(true);
    expect(n.islandActual72h).toBe(6 + 4); // same disease, all districts
    expect(n.dailyCounts7d.slice(4).reduce((a, b) => a + b, 0)).toBe(6); // last 3 complete days = actual window
    expect(n.window.actualEnd.getTime()).toBe(E);
    expect(n.caveat).toBeUndefined();
    expect(n.projection.caveat).toBe('projection, not a forecast');
  });

  test('fewer than 8 past windows gives "not enough history" and no range', () => {
    const n = p.computeAlertNumbers(alert, casesFor([3, 4, 5, 6, 7]), { asOf, lookbackStart: +asOf - 63 * DAY });
    expect(n.projection.historyWindows).toBe(4);
    expect(n.projection.enoughHistory).toBe(false);
    expect(n.projection.low).toBeNull();
    expect(n.projection.high).toBeNull();
    expect(n.projection.projected).toBe(7);
  });

  test('cases on or after the alert day are never used for the projection', () => {
    const later = casesFor([50], 'Kurunegala', 'ICD10:A90', E + H72);
    const a = p.computeAlertNumbers(alert, casesFor(PERIODS), { asOf, lookbackStart: +asOf - 63 * DAY });
    const b = p.computeAlertNumbers(alert, [...casesFor(PERIODS), ...later], { asOf, lookbackStart: +asOf - 63 * DAY });
    expect(b.projection).toEqual(a.projection);
    expect(b.actual72h).toBe(a.actual72h);
  });

  test('quantile and projectFromPeriods follow the documented method', () => {
    expect(p.quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(p.projectFromPeriods(PERIODS)).toMatchObject({ projected: 6, low: 5, high: 8, historyWindows: 10, methodVersion: 'alert72h-naive-empirical-v1' });
    expect(p.projectFromPeriods([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toMatchObject({ projected: 0, low: 0, high: 0 });
  });
});

function fakeCollection(docs) {
  const store = new Map(docs.map(d => [String(d._id), { ...d }]));
  const match = (d, f) => Object.entries(f).every(([k, v]) => (v && typeof v === 'object' && '$exists' in v ? (k in d) === v.$exists : String(d[k]) === String(v)));
  return {
    store,
    async updateOne(filter, update) {
      const d = [...store.values()].find(x => match(x, filter));
      if (!d) return { modifiedCount: 0 };
      Object.assign(d, JSON.parse(JSON.stringify(update.$set)));
      return { modifiedCount: 1 };
    },
    find(filter) { return { toArray: async () => [...store.values()].filter(d => match(d, filter)).map(d => JSON.parse(JSON.stringify(d))) }; },
  };
}

describe('prediction snapshot is stored once and the outcome is added later', () => {
  const mongoose = require('mongoose');
  const id = new mongoose.Types.ObjectId('64b000000000000000000001');

  test('write-once snapshot, never overwritten; outcome with absolute error after the next scan covers the period', async () => {
    const col = fakeCollection([{ _id: id, disease: 'ICD10:A90', location: 'Kurunegala' }]);
    const cases = casesFor(PERIODS);
    const first = await p.recordSnapshotsAndOutcomes(col, [{ alertId: String(id), disease: 'ICD10:A90', location: 'Kurunegala' }], cases, { asOf, lookbackStart: +asOf - 63 * DAY });
    expect(first).toEqual({ snapshotsWritten: 1, outcomesWritten: 0 });
    const snap = col.store.get(String(id)).projection72h;
    expect(snap).toMatchObject({ previous72h: 7, actual72h: 6, projected: 6, low: 5, high: 8, methodVersion: 'alert72h-naive-empirical-v1' });

    // A later scan with very different data must not change the stored snapshot.
    const nextDay = new Date(+asOf + DAY);
    const changed = [...cases, ...casesFor([40], 'Kurunegala', 'ICD10:A90', E + DAY)];
    const second = await p.recordSnapshotsAndOutcomes(col, [{ alertId: String(id), disease: 'ICD10:A90', location: 'Kurunegala' }], changed, { asOf: nextDay, lookbackStart: +nextDay - 63 * DAY });
    expect(second).toEqual({ snapshotsWritten: 0, outcomesWritten: 0 }); // next period not yet complete
    expect(col.store.get(String(id)).projection72h).toEqual(snap);

    // Three days later the next 72 hours are complete: 9 cases -> error |9 - 6| = 3, inside 5..8? no.
    const later = new Date(+asOf + 3 * DAY);
    const withNext = [...cases, ...casesFor([9], 'Kurunegala', 'ICD10:A90', E + H72)];
    const third = await p.recordSnapshotsAndOutcomes(col, [], withNext, { asOf: later, lookbackStart: +later - 63 * DAY });
    expect(third.outcomesWritten).toBe(1);
    const doc = col.store.get(String(id));
    expect(doc.projection72h).toEqual(snap);
    expect(doc.projection72hOutcome).toMatchObject({ actualNext72h: 9, absoluteError: 3, withinRange: false });

    // The outcome is also written once.
    const fourth = await p.recordSnapshotsAndOutcomes(col, [], [...withNext, ...casesFor([30], 'Kurunegala', 'ICD10:A90', E + H72)], { asOf: later, lookbackStart: +later - 63 * DAY });
    expect(fourth.outcomesWritten).toBe(0);
    expect(col.store.get(String(id)).projection72hOutcome.actualNext72h).toBe(9);
  });

  test('alertView shows the stored snapshot and the outcome beside it', () => {
    const v = p.alertView({ projection72h: { previous72h: 7, actual72h: 6, projected: 6, low: 5, high: 8, enoughHistory: true, historyWindows: 10, window: {} },
      projection72hOutcome: { actualNext72h: 9, absoluteError: 3, withinRange: false } });
    expect(v).toMatchObject({ previous72h: 7, actual72h: 6, change: -1, projected: 6, low: 5, high: 8, stored: true, caveat: 'projection, not a forecast' });
    expect(v.outcome.absoluteError).toBe(3);
    expect(v.helpText).toMatch(/not been shown to beat repeating the last 72 hours/);
  });
});
