'use strict';
const { eventHash } = require('../src/services/clinicalCommandService');
const { reconcileClinicalCommands } = require('../src/services/clinicalOutboxWorker');
const { currentMedicationNames } = require('../src/services/currentMedicationSafety');
function event() { const row = { eventId: '000000000000000000000002', actorId: 'owned-actor', actorRole: 'doctor', action: 'PRESCRIPTION_ISSUED', resourceType: 'Prescription', resourceId: '000000000000000000000003', eventAt: new Date('2026-01-01T00:00:00Z') }; return { ...row, eventHash: eventHash(row) }; }
test('outbox recovery projects the original event and marks only the confirmed exact event', async () => {
  const row = event(), updateOne = jest.fn(async () => ({ modifiedCount: 1 })), limit = jest.fn(() => ({ lean: async () => [{ _id: 'command', outbox: [row] }] }));
  const project = jest.fn(async () => ({ _id: row.eventId }));
  expect(await reconcileClinicalCommands({ CommandModel: { find: () => ({ limit }), updateOne }, project })).toEqual({ inspected: 1, projected: 1 });
  expect(limit).toHaveBeenCalledWith(100); expect(project.mock.calls[0][0]).toMatchObject({ eventAt: row.eventAt, projectionId: row.eventId });
  expect(updateOne.mock.calls[0][0]).toEqual({ _id: 'command', outbox: { $elemMatch: { eventId: row.eventId, eventHash: row.eventHash, projectedAt: { $exists: false } } } });
});
test.each(['outage', 'unconfirmed', 'tampered'])('outbox %s retains the recovery record', async mode => {
  const row = event(); if (mode === 'tampered') row.actorRole = 'admin';
  const updateOne = jest.fn(), project = jest.fn(async () => { if (mode === 'outage') throw new Error('projection unavailable'); return null; });
  const work = reconcileClinicalCommands({ CommandModel: { find: () => ({ limit: () => ({ lean: async () => [{ _id: 'command', outbox: [row] }] }) }), updateOne }, project });
  if (mode === 'unconfirmed') await expect(work).resolves.toEqual({ inspected: 1, projected: 0 }); else await expect(work).rejects.toBeDefined();
  expect(updateOne).not.toHaveBeenCalled(); if (mode === 'tampered') expect(project).not.toHaveBeenCalled();
});
test.each(['valid', 'missing-expiry', 'unreadable', 'oversized'])('existing medication reconciliation: %s', async mode => {
  const patientId = '000000000000000000000001';
  const row = { drugName: 'SyntheticDrug', expiresAt: new Date(Date.now() + 60000), ...(mode === 'unreadable' ? { __enc_drugName: true } : {}) };
  if (mode === 'missing-expiry') delete row.expiresAt;
  const rows = mode === 'oversized' ? Array(101).fill(row) : [row], limit = jest.fn(() => Promise.resolve(rows)), find = jest.fn(() => ({ limit }));
  const work = currentMedicationNames(patientId, { PrescriptionModel: { find } });
  if (mode === 'valid') await expect(work).resolves.toEqual(['SyntheticDrug']); else await expect(work).rejects.toThrow('MEDICATION_RECONCILIATION_REQUIRED');
  expect(limit).toHaveBeenCalledWith(101); expect(find.mock.calls[0][0]).toMatchObject({ patientId, status: { $in: ['pending', 'issued', 'dispensed'] } });
});
