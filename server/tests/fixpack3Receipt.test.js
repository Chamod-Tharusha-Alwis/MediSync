'use strict';
/**
 * Fix pack 3, item 2: one receipt per release. New test file; existing tests unchanged.
 * Input checks run offline without a database. The database proof (transactions, races, history, email)
 * runs in a child process on an in-memory replica set and is skipped if no local mongod exists.
 */
const path = require('path');
const cp = require('child_process');
const fs = require('fs');
const { dispenseSelection } = require('../src/services/dispensingService');

const user = { id: '64b000000000000000000001', role: 'pharmacist' };
const entry = id => ({ prescriptionId: id, items: [{ drugName: 'Paracetamol', quantity: 3 }] });

describe('selection request is checked before anything is written', () => {
  test('fewer than 2 medicines is refused (a single medicine uses the per-medicine Dispense button)', async () => {
    await expect(dispenseSelection({ user, idempotencyKey: 'sel-key-0001', body: { patientNic: '199912345678', selection: [entry('a')] } }))
      .rejects.toMatchObject({ code: 'INVALID_SELECTION' });
  });
  test('an idempotency key is required, so a retry never creates a second receipt', async () => {
    await expect(dispenseSelection({ user, body: { patientNic: '199912345678', selection: [entry('a'), entry('b')] } }))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
  });
  test('the same medicine twice and substitutions are refused', async () => {
    await expect(dispenseSelection({ user, idempotencyKey: 'sel-key-0002', body: { patientNic: '199912345678', selection: [entry('a'), entry('a')] } }))
      .rejects.toMatchObject({ code: 'INVALID_SELECTION' });
    await expect(dispenseSelection({ user, idempotencyKey: 'sel-key-0003', body: { patientNic: '199912345678', isAlternativeDispensed: true, selection: [entry('a'), entry('b')] } }))
      .rejects.toMatchObject({ code: 'ALTERNATIVE_NOT_SUPPORTED' });
  });
  test('only pharmacy staff', async () => {
    await expect(dispenseSelection({ user: { id: 'x', role: 'patient' }, idempotencyKey: 'sel-key-0004', body: {} })).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
});

const BINARY = process.env.MONGOMS_SYSTEM_BINARY || 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
(fs.existsSync(BINARY) ? describe : describe.skip)('database proof (in-memory replica set, child process)', () => {
  let r;
  beforeAll(() => {
    const env = { ...process.env }; for (const k of ['MONGO_URI', 'MONGO_URI_TEST', 'MONGODB_URI', 'REDIS_URL']) delete env[k];
    const out = cp.execFileSync(process.execPath, [path.join(__dirname, '../scripts/demo/fixpack3ReceiptProof.cjs')], { env, encoding: 'utf8', timeout: 240000 });
    r = JSON.parse(out.split('\n').find(l => l.startsWith('{"label"')));
  }, 250000);

  test('two medicines released together share ONE receipt id; a replay returns the same receipt', () => {
    expect(r.together.ok).toBe(true);
    expect(r.together.items).toEqual(['Amoxicillin', 'Paracetamol']);
    expect(r.togetherReceipt).toEqual({ items: 2, prescriptionIds: 2, statuses: ['dispensed', 'dispensed', 'pending'], receiptsForAmox: 1, receiptsForPara: 1 });
    expect(r.togetherReplay).toMatchObject({ ok: true, replay: true, receipt: r.together.receipt });
  });
  test('a separate release (later, another pharmacy) gets a DIFFERENT receipt id', () => {
    expect(r.separate.ok).toBe(true);
    expect(r.separate.receipt).not.toBe(r.together.receipt);
    expect(r.receiptsForConsultation).toHaveLength(2);
  });
  test('a repeat-course block on one item refuses the whole selection, names the item and date, writes nothing', () => {
    expect(r.blocked.code).toBe('REPEAT_COURSE_ACTIVE');
    expect(r.blocked.message).toMatch(/^Warfarin was dispensed on \d+ \w+ at City Fixture Pharmacy for 5 days\. Available again on \d+ \w+\. Nothing in this selection was dispensed\.$/);
    expect(r.blockedAfter).toEqual({ statuses: ['pending', 'pending'], newReceipts: 0 });
  });
  test('parallel requests from two pharmacies still give exactly one receipt per item', () => {
    expect(r.race.selectionVsSelection.filter(x => x.ok)).toHaveLength(1);
    expect(r.race.selectionVsSelection.find(x => !x.ok).code).toBe('ALREADY_DISPENSED');
    expect([r.race.receiptsForX, r.race.receiptsForY]).toEqual([1, 1]);
    expect(r.race.selectionVsSingle.filter(x => x.ok)).toHaveLength(1);
    expect(r.race.receiptsForZ).toBe(1);
    // If the selection lost, its other medicine stays pending with no receipt (nothing partial).
    if (!r.race.selectionVsSingle[0].ok) expect([r.race.receiptsForW, r.race.statusW]).toEqual([0, 'pending']);
  });
  test('Dispensation History: one row per receipt, listing all its medicines', () => {
    expect(r.history.status).toBe(200);
    expect(r.history.rows).toBe(r.history.receiptsAtPharmacyA);
    expect(r.history.togetherRow).toEqual(['Amoxicillin', 'Paracetamol']);
  });
  test('one patient email per receipt: medicines released together, still not available here, names never ids', () => {
    expect(r.emails).toHaveLength(1);
    const text = r.emails[0].text;
    expect(r.emails[0].subject).toBe('Your medication update');
    expect(text).toContain('Update from Ayu Arana Care Pharmacy (pharmacist: Nimali Perera).');
    expect(text).toMatch(/Released:\n- Amoxicillin: quantity 5 tablets, .*\n- Paracetamol: quantity 3 tablets, /);
    expect(text).toContain('- Omeprazole: not available at this pharmacy');
    expect(text).not.toMatch(/\b[0-9a-f]{24}\b/);
  });
});
