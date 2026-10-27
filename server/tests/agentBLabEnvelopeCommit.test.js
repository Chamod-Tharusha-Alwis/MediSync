'use strict';
const crypto = require('crypto');
const { encryptReport, decryptReport, encryptLegacyReport } = require('../src/security/labReportEnvelope');
const { decryptStoredReport, downloadStoredReport } = require('../src/services/labReportStorage');
const { saveLabChange } = require('../src/services/labCommitService');
const id = '000000000000000000000001', patientId = '000000000000000000000002';

test.each(['success', 'event-outage', 'expired', 'expiry-during-save', 'patient-mismatch', 'patient-inactive', 'retry'])('new laboratory registration and audit roll back safely: %s', async mode => {
  let state = { rows: [], events: [] }, attempts = 0, instances = 0, clock = Date.now();
  const expiry = mode === 'expired' ? clock - 1 : clock + 100;
  const values = { _id: id, patientId, hospitalId: id, patientNic: '900000001V', status: 'pending' };
  class Lab {
    constructor(data) { Object.assign(this, data); instances++; }
    set(data) { Object.assign(this, data); }
    async save() { state.rows.push(String(this._id)); if (mode === 'expiry-during-save') clock += 200; }
  }
  const transact = async work => {
    while (true) {
      const before = structuredClone(state); attempts++;
      try { return await work({}); } catch (error) { state = before; if (mode === 'retry' && attempts === 1) continue; throw error; }
    }
  };
  const result = saveLabChange({ record: { ...values, isNew: true, toObject: () => ({ ...values }) }, actor: { id, role: 'hospital_admin' }, sessionId: id, action: 'LAB_TEST_ORDERED', consentExpiresAt: expiry }, {
    now: () => clock, transact, LabTestModel: Lab,
    Hospital: { updateOne: async () => ({ modifiedCount: 1 }) }, SessionToken: { updateOne: async () => ({ modifiedCount: 1 }) },
    Patient: { findById: () => ({ session: async () => ({ _id: patientId, nic: mode === 'patient-mismatch' ? '900000002V' : values.patientNic, isActive: mode !== 'patient-inactive' }) }) },
    CommandModel: { create: async ([row]) => { if (mode === 'event-outage' || (mode === 'retry' && attempts === 1)) throw new Error('synthetic event outage'); state.events.push(row); } }
  });
  if (['success', 'retry'].includes(mode)) {
    await expect(result).resolves.toHaveProperty('labTestId', id); expect(state.rows).toEqual([id]); expect(state.events).toHaveLength(1);
    expect(state.events[0].outbox[0].action).toBe('LAB_TEST_ORDERED'); expect(JSON.stringify(state.events)).not.toContain(values.patientNic);
    if (mode === 'retry') expect(instances).toBe(2);
  } else { await expect(result).rejects.toBeDefined(); expect(state).toEqual({ rows: [], events: [] }); }
});
test('actual report adapter reads new AAD/key-version envelope without any legacy secret', async () => {
  const configuration = { keys: { 2: crypto.randomBytes(32) }, activeVersion: 2 }, record = { _id: id, reportPublicId: 'synthetic' };
  const encoded = encryptReport(Buffer.from('%PDF- synthetic report'), record, configuration); Object.assign(record, encoded); delete record.blob;
  expect((await downloadStoredReport(record, { sign: () => 'https://api.cloudinary.com/synthetic', download: async () => ({ data: encoded.blob }), fieldConfiguration: configuration })).toString()).toBe('%PDF- synthetic report');
});
test.each(['record', 'tag', 'key', 'version', 'nonce'])('new report rejects altered %s', variant => {
  const configuration = { keys: { 2: crypto.randomBytes(32) }, activeVersion: 2 }, original = { _id: id }, encoded = encryptReport(Buffer.from('%PDF- synthetic'), original, configuration), record = { ...original, ...encoded };
  if (variant === 'record') record._id = patientId;
  if (variant === 'tag') encoded.blob[0] ^= 1;
  if (variant === 'key') configuration.keys[2] = crypto.randomBytes(32);
  if (variant === 'version') record.encryptedFileKey = record.encryptedFileKey.replace('gcm1.2.', 'gcm1.3.');
  if (variant === 'nonce') record.fileIV = '00'.repeat(12);
  expect(() => decryptReport(encoded.blob, record, configuration)).toThrow('LAB_REPORT_AUTHENTICATION_FAILED');
});
test('explicit legacy file wrapping remains readable and invalid PDFs are rejected before encryption', () => {
  const secret = 'synthetic-only-legacy-wrap-key-32bytes', encoded = encryptLegacyReport(Buffer.from('%PDF- synthetic'), secret);
  expect(decryptStoredReport(encoded.blob, encoded, secret).toString()).toBe('%PDF- synthetic');
  expect(() => encryptLegacyReport(Buffer.from('<html>'), secret)).toThrow();
});
test.each(['success', 'event-outage', 'session-revoked', 'hospital-unverified', 'stale-version', 'retry'])('lab record and durable outbox commit together: %s', async mode => {
  let state = { saved: false, journals: [] }, attempts = 0, instances = 0;
  const transact = async work => {
    while (true) { const before = structuredClone(state); attempts++; try { return await work({}); } catch (error) { state = before; if (mode === 'retry' && attempts === 1) continue; throw error; } }
  };
  const values = { _id: id, __v: 2, hospitalId: id, patientId, patientNic: '900000001V', status: 'report_ready' };
  const record = { ...values, $where: { status: 'processing', hospitalId: id }, toObject: () => ({ ...values }) };
  const findOne = jest.fn(() => ({ session: async () => {
    if (mode === 'stale-version') return null; instances++;
    return { ...values, set(data) { Object.assign(this, data); }, async save() { state.saved = true; this.__v++; } };
  } }));
  const work = saveLabChange({ record, actor: { id, role: 'hospital_admin' }, sessionId: id, action: 'LAB_REPORT_UPLOADED' }, {
    transact, Hospital: { updateOne: async () => ({ modifiedCount: mode === 'hospital-unverified' ? 0 : 1 }) }, SessionToken: { updateOne: async () => ({ modifiedCount: mode === 'session-revoked' ? 0 : 1 }) },
    Patient: { findById: () => ({ session: async () => ({ _id: patientId, nic: values.patientNic, isActive: true }) }) }, LabTestModel: { findOne }, CommandModel: { create: async ([row]) => { if (mode === 'event-outage' || (mode === 'retry' && attempts === 1)) throw new Error('synthetic failure'); state.journals.push(row); } }
  });
  if (['success', 'retry'].includes(mode)) { await expect(work).resolves.toHaveProperty('labTestId', id); expect(state.saved).toBe(true); expect(state.journals).toHaveLength(1); expect(JSON.stringify(state.journals)).not.toContain(values.patientNic); if (mode === 'retry') expect(instances).toBe(2); }
  else { await expect(work).rejects.toBeDefined(); expect(state).toEqual({ saved: false, journals: [] }); }
  if (!['session-revoked', 'hospital-unverified'].includes(mode)) expect(findOne.mock.calls[0][0]).toMatchObject({ _id: id, __v: 2 });
});
