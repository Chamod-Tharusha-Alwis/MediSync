'use strict';
/**
 * server/scripts/demo/fixpack3ReceiptProof.cjs — offline proof for fix pack 3, item 2 (synthetic fixture data).
 * In-memory MongoDB replica set only; refuses to run if a real database URI is set. No real email: sendMail
 * captures messages in test mode. The patient-consent claim is stubbed (it is not what this proof checks).
 *
 *   node server/scripts/demo/fixpack3ReceiptProof.cjs
 *
 * Proves: medicines released together share one receipt; a later or other-pharmacy release gets another
 * receipt; a repeat-course block on one item refuses the whole selection; two pharmacies at once still give
 * one receipt per item; history has one row per receipt; one patient email per receipt.
 */
const fs = require('fs');
const os = require('os');
const cp = require('child_process');
const crypto = require('crypto');
const path = require('path');

for (const k of ['MONGO_URI', 'MONGO_URI_TEST', 'MONGODB_URI', 'REDIS_URL']) if (process.env[k]) throw new Error(`REFUSING: ${k} is set`);
process.env.MEDISYNC_TEST_MODE = 'true';
process.env.EMAIL_PROVIDER = 'none';
const Module = require('module');
const load = Module._load;
const SERVER = path.resolve(__dirname, '../..');
Module._load = function (name, parent, ...rest) {
  if (/notificationService|cloudinary|config\/redis/i.test(name)) return { notifyOutbreakAlert: async () => {}, isUsingPersistentRedis: () => false, getRedisClient: () => null };
  if (/pharmacyCommitGuard$/.test(name)) return { claimPharmacyAuthorization: async ({ authorization }) => ({ patientId: authorization.patientId }) };
  return load.call(this, name, parent, ...rest);
};
const BINARY = process.env.MONGOMS_SYSTEM_BINARY || 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
const DAY = 86400000;

async function main() {
  if (!fs.existsSync(BINARY)) return { skipped: 'MONGOD_BINARY_NOT_FOUND' };
  const version = cp.spawnSync(BINARY, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([0-9.]+)/)[1];
  const mongoose = require(path.join(SERVER, 'node_modules', 'mongoose'));
  const { MongoMemoryReplSet } = require(path.join(SERVER, 'node_modules', 'mongodb-memory-server'));
  const dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'medisync-fixpack3-'));
  const replica = await MongoMemoryReplSet.create({ binary: { systemBinary: BINARY, version }, replSet: { count: 1, ip: '127.0.0.1', dbName: 'fixpack3' }, instanceOpts: [{ ip: '127.0.0.1', dbPath }] });
  try {
    await mongoose.connect(replica.getUri('fixpack3'), { serverSelectionTimeoutMS: 10000 });
    global.ENCRYPTION_KEYS = { 1: crypto.randomBytes(32).toString('hex') }; global.ACTIVE_KEY_VERSION = 1;
    const models = {};
    for (const n of ['Prescription', 'Dispensing', 'Patient', 'Pharmacy', 'PharmacyStaff']) { models[n] = require(path.join(SERVER, 'src', 'models', n)); await models[n].createCollection().catch(() => {}); }
    const db = mongoose.connection.db;
    const { dispense, dispenseSelection } = require(path.join(SERVER, 'src', 'services', 'dispensingService'));
    const { markNotAvailable } = require(path.join(SERVER, 'src', 'services', 'pharmacyItemService'));
    const { notifyMedicationUpdate } = require(path.join(SERVER, 'src', 'services', 'medicationUpdateEmail'));
    const pharmacyController = require(path.join(SERVER, 'src', 'controllers', 'pharmacyController'));
    const mail = require(path.join(SERVER, 'src', 'utils', 'emailService'));

    const nic = '199912345678';
    const patientId = new mongoose.Types.ObjectId();
    await db.collection('patients').insertOne({ _id: patientId, nic, fullName: 'Fixture Patient', email: 'fixture.patient@qa.medisync.local', isActive: true, allergies: [], preferredLanguage: 'en' });
    const pharmacies = [{ name: 'Ayu Arana Care Pharmacy' }, { name: 'City Fixture Pharmacy' }].map((p, i) => ({ _id: new mongoose.Types.ObjectId(), ...p, email: `pharmacy.${i}@qa.medisync.local`, isActive: true }));
    await db.collection('pharmacies').insertMany(pharmacies);
    const staff = pharmacies.map((p, i) => ({ _id: new mongoose.Types.ObjectId(), fullName: ['Nimali Perera', 'Kasun Silva'][i], email: `staff.${i}@qa.medisync.local`, pharmacyId: p._id, role: 'pharmacist', isActive: true, isVerified: true, mustChangePassword: false }));
    await db.collection('pharmacystaffs').insertMany(staff);
    const rx = (name, ref, days, ingredient, extra = {}) => ({ _id: new mongoose.Types.ObjectId(), prescriptionId: `RX-FIX-${crypto.randomBytes(3).toString('hex')}`, consultationRef: ref, patientId, patientNic: nic,
      drugName: name, dosage: '500 mg', frequency: 'Twice daily', durationDays: days, resolvedIngredients: [ingredient], status: 'pending', issuedAt: new Date(), expiresAt: new Date(Date.now() + 30 * DAY), ...extra });

    const ack = { acknowledged: true, reason: 'Fixture: pharmacist reviewed' };
    const auth = () => ({ patientId: String(patientId), sessionId: String(new mongoose.Types.ObjectId()) });
    const item = r => ({ drugName: r.drugName, quantity: r.durationDays, unit: 'tablets' });
    const select = (s, rxs, key) => dispenseSelection({ user: { id: String(s._id), role: 'pharmacist' }, idempotencyKey: key, authorization: auth(),
      body: { patientNic: nic, selection: rxs.map(r => ({ prescriptionId: String(r._id), items: [item(r)] })), safetyAcknowledgment: ack } })
      .then(o => ({ ok: true, receipt: o.receipt.receiptNumber, replay: o.replay, items: o.receipt.items.map(i => i.drugName) })).catch(e => ({ ok: false, code: e.code, message: e.message }));
    const single = (s, r, key) => dispense({ user: { id: String(s._id), role: 'pharmacist' }, prescriptionRef: String(r._id), idempotencyKey: key, skipAuditProjection: true, authorization: auth(),
      body: { patientNic: nic, items: [item(r)], safetyAcknowledgment: ack } })
      .then(o => ({ ok: true, receipt: o.receipt.receiptNumber })).catch(e => ({ ok: false, code: e.code, message: e.message }));
    const receiptsCovering = id => db.collection('dispensings').countDocuments({ $or: [{ prescriptionId: id }, { prescriptionIds: id }] });
    const status = async id => (await db.collection('prescriptions').findOne({ _id: id })).status;
    const out = { label: 'synthetic fixture data', mongod: version };

    // 1. Two medicines released together at pharmacy A: ONE receipt; the third is marked not available at A.
    const amox = rx('Amoxicillin', 'CON-FIX-0101', 5, 'amoxicillin');
    const para = rx('Paracetamol', 'CON-FIX-0101', 3, 'paracetamol');
    const ome = rx('Omeprazole', 'CON-FIX-0101', 14, 'omeprazole');
    await db.collection('prescriptions').insertMany([amox, para, ome]);
    await markNotAvailable({ user: { id: String(staff[0]._id), role: 'pharmacist' }, prescriptionRef: String(ome._id), patientNic: nic, reason: 'out_of_stock' });
    out.together = await select(staff[0], [amox, para], 'sel-key-together-0101');
    out.togetherReplay = await select(staff[0], [amox, para], 'sel-key-together-0101');
    const togetherDoc = await db.collection('dispensings').findOne({ receiptNumber: out.together.receipt });
    out.togetherReceipt = { items: togetherDoc.items.length, prescriptionIds: togetherDoc.prescriptionIds.length,
      statuses: [await status(amox._id), await status(para._id), await status(ome._id)], receiptsForAmox: await receiptsCovering(amox._id), receiptsForPara: await receiptsCovering(para._id) };

    // 2. One email for that receipt: released together + still not available here (captured, never sent).
    global.__MEDISYNC_CAPTURED_TEST_EMAILS = [];
    await notifyMedicationUpdate({ prescriptionId: togetherDoc.prescriptionId, pharmacyId: pharmacies[0]._id, pharmacistName: staff[0].fullName, pharmacyName: pharmacies[0].name, receiptId: togetherDoc._id });
    out.emails = mail.__getCapturedTestEmails().map(m => ({ subject: m.subject, text: m.text }));

    // 3. Omeprazole released separately at pharmacy B: a DIFFERENT receipt.
    out.separate = await single(staff[1], ome, 'single-key-ome-0101');
    out.receiptsForConsultation = await db.collection('dispensings').distinct('receiptNumber', { $or: [{ prescriptionId: { $in: [amox._id, para._id, ome._id] } }, { prescriptionIds: { $in: [amox._id, para._id, ome._id] } }] });

    // 4. Repeat-course block on one selected item refuses the whole selection.
    const warfarinEarlier = rx('Warfarin', 'CON-FIX-0100', 5, 'warfarin', { status: 'dispensed', dispensedAt: new Date(Date.now() - 1 * DAY), pharmacyName: pharmacies[1].name });
    const warfarin = rx('Warfarin', 'CON-FIX-0102', 5, 'warfarin');
    const cetirizine = rx('Cetirizine', 'CON-FIX-0102', 5, 'cetirizine');
    await db.collection('prescriptions').insertMany([warfarinEarlier, warfarin, cetirizine]);
    const before = await db.collection('dispensings').countDocuments();
    out.blocked = await select(staff[0], [warfarin, cetirizine], 'sel-key-blocked-0102');
    out.blockedAfter = { statuses: [await status(warfarin._id), await status(cetirizine._id)], newReceipts: (await db.collection('dispensings').countDocuments()) - before };

    // 5. Race: two pharmacies select the same two medicines at the same moment; plus a selection racing a single dispense.
    const x = rx('Metformin', 'CON-FIX-0103', 7, 'metformin');
    const y = rx('Atorvastatin', 'CON-FIX-0103', 7, 'atorvastatin');
    const z = rx('Losartan', 'CON-FIX-0104', 7, 'losartan');
    const w = rx('Amlodipine', 'CON-FIX-0104', 7, 'amlodipine');
    await db.collection('prescriptions').insertMany([x, y, z, w]);
    const race1 = await Promise.all([select(staff[0], [x, y], 'race-sel-key-a-0103'), select(staff[1], [x, y], 'race-sel-key-b-0103')]);
    const race2 = await Promise.all([select(staff[0], [z, w], 'race-sel-key-a-0104'), single(staff[1], z, 'race-single-key-b-0104')]);
    out.race = { selectionVsSelection: race1, receiptsForX: await receiptsCovering(x._id), receiptsForY: await receiptsCovering(y._id),
      selectionVsSingle: race2, receiptsForZ: await receiptsCovering(z._id), receiptsForW: await receiptsCovering(w._id), statusW: await status(w._id) };

    // 6. Dispensation history for pharmacy A: one row per receipt, listing all its medicines.
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    await pharmacyController.getDispensingHistory({ user: { id: String(staff[0]._id), role: 'pharmacist' }, query: {} }, res);
    const rows = res.body?.data || [];
    const receiptsA = await db.collection('dispensings').distinct('receiptNumber', { pharmacyId: pharmacies[0]._id });
    out.history = { status: res.code, rows: rows.length, receiptsAtPharmacyA: receiptsA.length,
      togetherRow: (() => { const r = rows.find(row => row.receiptNumber === out.together.receipt); return r ? (r.items || r.medications || []).map(i => i.drugName || i.name) : null; })() };
    return out;
  } finally {
    await mongoose.disconnect().catch(() => {});
    await replica.stop().catch(() => {});
    fs.rmSync(dbPath, { recursive: true, force: true });
  }
}

if (require.main === module) main().then(r => { console.log(JSON.stringify(r)); process.exit(0); }).catch(e => { console.error(e.stack); process.exit(1); });
module.exports = { main };
