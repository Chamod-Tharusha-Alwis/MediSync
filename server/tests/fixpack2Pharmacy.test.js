'use strict';
/**
 * Fix pack 2, PR B: one medicine at a time, repeat-course block, medication update email.
 * Unit tests run offline with test doubles. The database proof (race between two pharmacies, real
 * transactions) runs in a child process on an in-memory replica set and is skipped if no local mongod exists.
 */
const path = require('path');
const cp = require('child_process');
const fs = require('fs');
const { findActiveCourse } = require('../src/services/repeatDispenseGuard');
const { buildMedicationUpdateEmail } = require('../src/services/medicationUpdateEmail');
const { markNotAvailable } = require('../src/services/pharmacyItemService');

const DAY = 86400000;
const now = new Date('2026-11-17T08:00:00Z');
const prescriptionModel = rows => {
  const find = jest.fn(() => ({ session: () => Promise.resolve(rows) }));
  return { find, db: { readyState: 1 } };
};
const earlier = (extra = {}) => ({ _id: 'prev', drugName: 'Warfarin', resolvedIngredients: ['warfarin'], status: 'dispensed', durationDays: 5,
  dispensedAt: new Date('2026-11-17T03:00:00Z'), pharmacyName: 'Ayu Arana Care Pharmacy', ...extra });

describe('B2: repeat dispensing blocked until the previous course ends', () => {
  test('blocked inside the course, with the date it becomes available', async () => {
    const out = await findActiveCourse({ Prescription: prescriptionModel([earlier()]), patientId: 'p1', rx: { _id: 'new', drugName: 'Warfarin', resolvedIngredients: ['warfarin'] }, session: {}, now });
    expect(out.code).toBe('REPEAT_COURSE_ACTIVE');
    expect(out.message).toBe('Warfarin was dispensed on 17 Nov at Ayu Arana Care Pharmacy for 5 days. Available again on 22 Nov.');
  });
  test('allowed after the course', async () => {
    const out = await findActiveCourse({ Prescription: prescriptionModel([earlier({ dispensedAt: new Date(now - 6 * DAY) })]), patientId: 'p1', rx: { _id: 'new', resolvedIngredients: ['warfarin'] }, session: {}, now });
    expect(out).toBeNull();
  });
  test('different ingredient allowed', async () => {
    const out = await findActiveCourse({ Prescription: prescriptionModel([earlier()]), patientId: 'p1', rx: { _id: 'new', drugName: 'Paracetamol', resolvedIngredients: ['paracetamol'] }, session: {}, now });
    expect(out).toBeNull();
  });
  test('only dispensed doctor prescriptions are compared: "not available" items (still pending) never count', async () => {
    const P = prescriptionModel([]);
    await findActiveCourse({ Prescription: P, patientId: 'p1', rx: { _id: 'new', resolvedIngredients: ['warfarin'] }, session: {}, now });
    const filter = P.find.mock.calls[0][0];
    expect(filter.status).toEqual({ $in: ['dispensed', 'partially_dispensed'] });
    expect(filter.isOTC).toEqual({ $ne: true });
  });
  test('unparsed duration uses a stated 7-day default', async () => {
    const out = await findActiveCourse({ Prescription: prescriptionModel([earlier({ durationDays: undefined })]), patientId: 'p1', rx: { _id: 'new', resolvedIngredients: ['warfarin'] }, session: {}, now });
    expect(out.message).toContain('for 7 days (duration not recorded; a 7-day default was used). Available again on 24 Nov.');
  });
});

describe('B1: not available at this pharmacy', () => {
  const staff = { _id: 's1', fullName: 'Kasun Silva', pharmacyId: 'ph1', role: 'pharmacist', isActive: true, isVerified: true };
  const models = rx => ({
    PharmacyStaff: { findById: jest.fn().mockResolvedValue(staff) },
    Pharmacy: { findById: jest.fn().mockResolvedValue({ _id: 'ph1', name: 'City Fixture Pharmacy', isActive: true }) },
    Prescription: { findOne: jest.fn().mockResolvedValue(rx), updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }) },
  });
  const args = { user: { id: 's1', role: 'pharmacist' }, prescriptionRef: 'RX-1', patientNic: '199912345678', reason: 'out_of_stock' };
  test('conditional update keeps the item pending and is idempotent per pharmacy', async () => {
    const m = models({ _id: 'rx1', patientNic: '199912345678', status: 'pending' });
    const out = await markNotAvailable(args, m);
    const [filter, update] = m.Prescription.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'rx1', status: { $in: ['pending', 'issued'] }, 'unavailableAt.pharmacyId': { $ne: 'ph1' } });
    expect(update.$push.unavailableAt).toMatchObject({ pharmacyName: 'City Fixture Pharmacy', pharmacistName: 'Kasun Silva', reason: 'out_of_stock' });
    expect(update.$set).toBeUndefined(); // status is never changed
    expect(out.changed).toBe(true);
  });
  test('dispensed items and unknown reasons are refused', async () => {
    await expect(markNotAvailable(args, models({ _id: 'rx1', patientNic: '199912345678', status: 'dispensed' }))).rejects.toMatchObject({ code: 'NOT_PENDING', status: 409 });
    await expect(markNotAvailable({ ...args, reason: 'cancel' }, models({}))).rejects.toMatchObject({ code: 'INVALID_REASON' });
  });
});

describe('B3: medication update email', () => {
  const input = lang => ({ lang, patientName: 'Fixture <Patient>', pharmacyName: 'City Fixture Pharmacy', pharmacistName: 'Kasun Silva', consultationRef: 'CON-FIX-0001',
    released: [{ name: 'Warfarin', quantity: 5, unit: 'tablets', at: '2026-11-17T07:34:00Z' }], notReleased: [{ name: 'Omeprazole', notAvailableHere: true }] });
  test('EN: names (never ids), Sri Lanka time, still-pending list, the other-pharmacy sentence, generic subject, escaped HTML', () => {
    const m = buildMedicationUpdateEmail(input('en'));
    expect(m.subject).toBe('Your medication update');
    expect(m.text).toContain('Update from City Fixture Pharmacy (pharmacist: Kasun Silva).');
    expect(m.text).toContain('- Warfarin: quantity 5 tablets, 17 Nov 2026, 13:04 (Sri Lanka time)');
    expect(m.text).toContain('- Omeprazole: not available at this pharmacy');
    expect(m.text).toContain('Items not available here can be collected at another pharmacy.');
    expect(m.html).toContain('Fixture &lt;Patient&gt;');
    expect(m.html).not.toMatch(/<img|https?:\/\//);
    expect(m.text).not.toMatch(/\b[0-9a-f]{24}\b/);
  });
  test('SI and TA are rendered', () => {
    expect(buildMedicationUpdateEmail(input('si')).text).toContain('මෙහි නොමැති ඖෂධ වෙනත් ඔසුසලකින් ලබා ගත හැක.');
    expect(buildMedicationUpdateEmail(input('ta')).text).toContain('இங்கு கிடைக்காத மருந்துகளை வேறு மருந்தகத்தில் பெற்றுக்கொள்ளலாம்.');
  });
  test('privacy flag off: medicine names are hidden', () => {
    process.env.DISPENSE_EMAIL_MEDICINE_NAMES = 'false';
    try { const m = buildMedicationUpdateEmail(input('en')); expect(m.text).not.toContain('Warfarin'); expect(m.text).toContain('Medicine 1'); }
    finally { delete process.env.DISPENSE_EMAIL_MEDICINE_NAMES; }
  });
});

const BINARY = process.env.MONGOMS_SYSTEM_BINARY || 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
(fs.existsSync(BINARY) ? describe : describe.skip)('B1-B3 database proof (in-memory replica set, child process)', () => {
  let r;
  beforeAll(() => {
    const env = { ...process.env }; for (const k of ['MONGO_URI', 'MONGO_URI_TEST', 'MONGODB_URI', 'REDIS_URL']) delete env[k];
    const out = cp.execFileSync(process.execPath, [path.join(__dirname, '../scripts/demo/fixpack2PharmacyProof.cjs')], { env, encoding: 'utf8', timeout: 240000 });
    r = JSON.parse(out.split('\n').find(l => l.startsWith('{"label"')));
  }, 250000);
  test('two pharmacies at the same moment: exactly one receipt', () => {
    expect(r.race.results.filter(x => x.ok)).toHaveLength(1);
    expect(r.race.results.find(x => !x.ok).code).toBe('ALREADY_DISPENSED');
    expect(r.race.receiptsForItem).toBe(1);
  });
  test('not available stays pending; repeat blocked inside the course and allowed after', () => {
    expect(r.notAvailable).toEqual({ firstChanged: true, secondChanged: false, status: 'pending', marks: 1 });
    expect(r.repeatInside.code).toBe('REPEAT_COURSE_ACTIVE');
    expect(r.repeatInside.message).toMatch(/^Warfarin was dispensed on \d+ \w+ at Ayu Arana Care Pharmacy for 5 days\. Available again on \d+ \w+\.$/);
    expect(r.differentIngredient.ok).toBe(true);
    expect(r.repeatAfter.ok).toBe(true);
    expect(r.notAvailableDoesNotBlock.ok).toBe(true);
  });
  test('captured patient emails in EN, SI, TA with names, never ids', () => {
    expect(r.emails.map(m => m.subject)).toEqual(['Your medication update', 'ඔබගේ ඖෂධ යාවත්කාලීන කිරීම', 'உங்கள் மருந்து புதுப்பிப்பு']);
    for (const m of r.emails) { expect(m.text).toContain('City Fixture Pharmacy'); expect(m.text).toContain('Kasun Silva'); expect(m.text).not.toMatch(/\b[0-9a-f]{24}\b/); }
  });
});
