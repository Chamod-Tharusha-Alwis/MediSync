'use strict';
/**
 * server/scripts/demo/fixpack2PharmacyProof.cjs — offline proof for fix pack 2, PR B (synthetic fixture data).
 * In-memory MongoDB replica set only; refuses to run if a real database URI is set. No real email: sendMail
 * captures messages in test mode. The patient-consent claim is stubbed (it is not what this proof checks).
 *
 *   node server/scripts/demo/fixpack2PharmacyProof.cjs
 *
 * Proves: two pharmacies dispensing the same medicine at the same moment -> exactly one receipt;
 * "not available" keeps the item pending; repeat dispensing of the same ingredient is refused inside the
 * course and allowed after it; a different ingredient is allowed; patient email text in EN, SI, TA.
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
  const dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'medisync-fixpack2b-'));
  const replica = await MongoMemoryReplSet.create({ binary: { systemBinary: BINARY, version }, replSet: { count: 1, ip: '127.0.0.1', dbName: 'fixpack2b' }, instanceOpts: [{ ip: '127.0.0.1', dbPath }] });
  try {
    await mongoose.connect(replica.getUri('fixpack2b'), { serverSelectionTimeoutMS: 10000 });
    global.ENCRYPTION_KEYS = { 1: crypto.randomBytes(32).toString('hex') }; global.ACTIVE_KEY_VERSION = 1;
    const models = {};
    for (const n of ['Prescription', 'Dispensing', 'Patient', 'Pharmacy', 'PharmacyStaff']) { models[n] = require(path.join(SERVER, 'src', 'models', n)); await models[n].createCollection().catch(() => {}); }
    const db = mongoose.connection.db;
    const { dispense } = require(path.join(SERVER, 'src', 'services', 'dispensingService'));
    const { markNotAvailable } = require(path.join(SERVER, 'src', 'services', 'pharmacyItemService'));
    const { notifyMedicationUpdate } = require(path.join(SERVER, 'src', 'services', 'medicationUpdateEmail'));
    const mail = require(path.join(SERVER, 'src', 'utils', 'emailService'));

    const nic = '199912345678';
    const patientId = new mongoose.Types.ObjectId();
    await db.collection('patients').insertOne({ _id: patientId, nic, fullName: 'Fixture Patient', email: 'fixture.patient@qa.medisync.local', isActive: true, allergies: [], preferredLanguage: 'en' });
    const pharmacies = [{ name: 'Ayu Arana Care Pharmacy' }, { name: 'City Fixture Pharmacy' }].map((p, i) => ({ _id: new mongoose.Types.ObjectId(), ...p, email: `pharmacy.${i}@qa.medisync.local`, isActive: true }));
    await db.collection('pharmacies').insertMany(pharmacies);
    const staff = pharmacies.map((p, i) => ({ _id: new mongoose.Types.ObjectId(), fullName: ['Nimali Perera', 'Kasun Silva'][i], email: `staff.${i}@qa.medisync.local`, pharmacyId: p._id, role: 'pharmacist', isActive: true, isVerified: true, mustChangePassword: false }));
    await db.collection('pharmacystaffs').insertMany(staff);
    const rx = (name, ref, days, ingredient, extra = {}) => ({ _id: new mongoose.Types.ObjectId(), prescriptionId: `RX-FIX-${crypto.randomBytes(3).toString('hex')}`, consultationRef: ref, patientId, patientNic: nic,
      drugName: name, dosage: '5 mg', frequency: 'Once daily', durationDays: days, resolvedIngredients: [ingredient], status: 'pending', issuedAt: new Date(), expiresAt: new Date(Date.now() + 30 * DAY), ...extra });
    const warfarin = rx('Warfarin', 'CON-FIX-0001', 5, 'warfarin');
    const omeprazole = rx('Omeprazole', 'CON-FIX-0001', 14, 'omeprazole');
    const warfarinAgain = rx('Warfarin', 'CON-FIX-0002', 5, 'warfarin');
    const paracetamol = rx('Paracetamol', 'CON-FIX-0002', 3, 'paracetamol');
    await db.collection('prescriptions').insertMany([warfarin, omeprazole, warfarinAgain, paracetamol]);

    const ack = { acknowledged: true, reason: 'Fixture: pharmacist reviewed' };
    const call = (s, r, key) => dispense({ user: { id: String(s._id), role: 'pharmacist' }, prescriptionRef: String(r._id), idempotencyKey: key, skipAuditProjection: true,
      authorization: { patientId: String(patientId), sessionId: String(new mongoose.Types.ObjectId()) },
      body: { patientNic: nic, items: [{ drugName: r.drugName, quantity: r.durationDays, unit: 'tablets' }], safetyAcknowledgment: ack } })
      .then(o => ({ ok: true, receipt: o.receipt.receiptNumber })).catch(e => ({ ok: false, code: e.code, message: e.message }));
    const out = { label: 'synthetic fixture data', mongod: version };

    // 1. Race: two pharmacies dispense the same medicine at the same moment.
    const race = await Promise.all([call(staff[0], warfarin, 'race-key-pharmacy-a'), call(staff[1], warfarin, 'race-key-pharmacy-b')]);
    out.race = { results: race, receiptsForItem: await db.collection('dispensings').countDocuments({ prescriptionId: warfarin._id }),
      status: (await db.collection('prescriptions').findOne({ _id: warfarin._id })).status };

    // 2. Not available at pharmacy B: stays pending, idempotent.
    const na1 = await markNotAvailable({ user: { id: String(staff[1]._id), role: 'pharmacist' }, prescriptionRef: String(omeprazole._id), patientNic: nic, reason: 'out_of_stock' });
    const na2 = await markNotAvailable({ user: { id: String(staff[1]._id), role: 'pharmacist' }, prescriptionRef: String(omeprazole._id), patientNic: nic, reason: 'out_of_stock' });
    const omeDoc = await db.collection('prescriptions').findOne({ _id: omeprazole._id });
    out.notAvailable = { firstChanged: na1.changed, secondChanged: na2.changed, status: omeDoc.status, marks: omeDoc.unavailableAt.length };

    // 3. Repeat block: Warfarin again inside the 5-day course; a different ingredient is allowed.
    out.repeatInside = await call(staff[1], warfarinAgain, 'repeat-key-inside');
    out.differentIngredient = await call(staff[1], paracetamol, 'paracetamol-key-1');
    // ...and allowed once the course has ended (earlier dispensation moved 6 days back, inside the in-memory DB only).
    await db.collection('prescriptions').updateOne({ _id: warfarin._id }, { $set: { dispensedAt: new Date(Date.now() - 6 * DAY) } });
    out.repeatAfter = await call(staff[1], warfarinAgain, 'repeat-key-after');

    // 4. Not-available items never count as dispensed: Omeprazole (pending, marked) does not block a new Omeprazole.
    const omeAgain = rx('Omeprazole', 'CON-FIX-0003', 14, 'omeprazole');
    await db.collection('prescriptions').insertOne(omeAgain);
    out.notAvailableDoesNotBlock = await call(staff[0], omeAgain, 'omeprazole-key-1');

    // 5. Patient email after a dispense / not-available action, EN, SI, TA (captured, never sent).
    global.__MEDISYNC_CAPTURED_TEST_EMAILS = [];
    for (const lang of ['en', 'si', 'ta']) {
      await db.collection('patients').updateOne({ _id: patientId }, { $set: { preferredLanguage: lang } });
      await notifyMedicationUpdate({ prescriptionId: omeprazole._id, pharmacyId: pharmacies[1]._id, pharmacistName: staff[1].fullName, pharmacyName: pharmacies[1].name });
    }
    out.emails = mail.__getCapturedTestEmails().map(m => ({ to: m.to, subject: m.subject, text: m.text }));
    return out;
  } finally {
    await mongoose.disconnect().catch(() => {});
    await replica.stop().catch(() => {});
    fs.rmSync(dbPath, { recursive: true, force: true });
  }
}

if (require.main === module) main().then(r => { console.log(JSON.stringify(r)); process.exit(0); }).catch(e => { console.error(e.stack); process.exit(1); });
module.exports = { main };
