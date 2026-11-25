'use strict';
// The approval and test e-mail of an UPDATED alert use the newest stored 72-hour figures, like the Monitor (new test file;
// existing tests unchanged). Fixture values only; no e-mail leaves this process.
const projection = require('../src/services/alertProjection72h');
const service = require('../src/services/surveillanceService');
const { numbersForAlert, sendDetailedOutbreakEmail } = require('../src/services/outbreakDetailedDelivery');

const DAY = projection.DAY;
const firstAt = new Date('2026-11-20T06:00:00Z'), updatedAt = new Date('2026-11-25T06:00:00Z');
const E1 = service.getColomboMidnight(firstAt), E2 = service.getColomboMidnight(updatedAt);
const cases = [];
const add = (end, daysBefore, count) => { for (let i = 0; i < count; i++) cases.push({ district: 'Colombo', diseaseId: 'ICD10:A90', time: end - daysBefore * DAY + (9 * 60 + i) * 60000 }); };
for (let d = 8; d <= 60; d++) add(E1, d, 1);
add(E1, 2, 4); add(E1, 1, 4); // first detection: 8 in the last 72 hours
add(E2, 3, 5); add(E2, 2, 6); add(E2, 1, 7); // later: 18 in the last 72 hours
const alert = { _id: 'a1', disease: 'ICD10:A90', location: 'Colombo', severity: 'Critical', status: 'Active', createdAt: firstAt, isSimulation: false };
const opts = asOf => ({ asOf, lookbackStart: +asOf - 63 * DAY });
const first = projection.buildSnapshot(alert, cases, opts(firstAt)), newest = projection.buildSnapshot(alert, cases, opts(updatedAt));

test('the fixture really differs between first detection and update', () => {
  expect([first.actual72h, newest.actual72h]).toEqual([8, 18]);
});

test('updated alert: newest figures, and the island count, daily counts and population share of the same date', async () => {
  const n = await numbersForAlert({ ...alert, projection72h: first, latest72h: newest }, { cases });
  const live = projection.computeAlertNumbers(alert, cases, opts(updatedAt));
  expect(n).toMatchObject({ previous72h: newest.previous72h, actual72h: 18, projected: newest.projected, low: newest.low, high: newest.high, islandActual72h: live.islandActual72h, dailyCounts7d: live.dailyCounts7d });
  expect(n.change).toBe(newest.actual72h - newest.previous72h);
  expect(n.dailyCounts7d.slice(-3)).toEqual([5, 6, 7]);
  expect(n.per100k).toBe(projection.populationFigures('Colombo', 18).per100k);
});

test('dates that came back from JSON as text work the same', async () => {
  const n = await numbersForAlert({ ...alert, latest72h: JSON.parse(JSON.stringify(newest)) }, { cases });
  expect(n).toMatchObject({ actual72h: 18, dailyCounts7d: expect.arrayContaining([5, 6, 7]) });
});

test('an alert that was never updated is unchanged: stored snapshot, or a computation as of its creation', async () => {
  expect(await numbersForAlert({ ...alert, projection72h: first }, { cases })).toMatchObject({ actual72h: 8, previous72h: first.previous72h });
  expect(await numbersForAlert(alert, { cases })).toMatchObject({ actual72h: 8, previous72h: first.previous72h });
});

test('the e-mail text shows the newest numbers with the projection label, through the existing transport, once', async () => {
  const sent = [];
  const emailService = { getDailyDispatchedEmailCount: async () => 0, sendOutbreakAlert: async (to, mail) => { sent.push(mail); return { success: true, acceptedCount: to.length }; } };
  const r = await sendDetailedOutbreakEmail(['admin@example.invalid'], { ...alert, projection72h: first, latest72h: newest },
    { env: { OUTBREAK_EMAIL_DELIVERY_ENABLED: 'true' }, emailService, languages: new Map(), isDemo: false, cases });
  expect(r.sentCount).toBe(1);
  expect(sent).toHaveLength(1);
  expect(sent[0].text).toMatch(/18/);
  expect(sent[0].text).toMatch(/projection, not a forecast/i);
});

test('a missing figure is never invented when the newest figures exist but records cannot be loaded', async () => {
  const sent = [];
  const emailService = { getDailyDispatchedEmailCount: async () => 0, sendOutbreakAlert: async (to, mail) => { sent.push(mail); return { success: true }; } };
  jest.spyOn(service, 'loadCases').mockRejectedValueOnce(new Error('offline'));
  await sendDetailedOutbreakEmail(['admin@example.invalid'], { ...alert, latest72h: newest }, { env: { OUTBREAK_EMAIL_DELIVERY_ENABLED: 'true' }, emailService, languages: new Map(), isDemo: false });
  expect(sent[0].text).not.toMatch(/undefined|NaN/);
});

test('works on the model document that the approval route passes, not only on plain objects', async () => {
  const OutbreakAlert = require('../src/models/OutbreakAlert');
  const doc = new OutbreakAlert({ disease: 'ICD10:A90', location: 'Colombo', severity: 'Critical', status: 'Active', createdAt: firstAt, latest72h: newest });
  expect(await numbersForAlert(doc, { cases })).toMatchObject({ actual72h: 18, projected: newest.projected });
});
