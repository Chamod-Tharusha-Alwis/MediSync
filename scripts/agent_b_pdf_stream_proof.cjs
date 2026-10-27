'use strict';
// Verification-only synthetic artifact. Does not import the encryptor's key or
// RC4 routines. pdf-lib is used as a structural parser, not as a decryptor.
const assert = require('assert/strict'), crypto = require('crypto'), zlib = require('zlib');
const { PDFDocument, PDFName, PDFRawStream } = require('../server/node_modules/pdf-lib');
const padding = Buffer.from('28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a', 'hex');
const md5 = bytes => crypto.createHash('md5').update(bytes).digest();
function crypt(key, input) {
  const state = Uint8Array.from({ length: 256 }, (_, n) => n);
  let j = 0;
  for (let i = 0; i < 256; i++) { j = (j + state[i] + key[i % key.length]) & 255; [state[i], state[j]] = [state[j], state[i]]; }
  let i = 0; j = 0;
  const output = Buffer.alloc(input.length);
  for (let n = 0; n < input.length; n++) { i = (i + 1) & 255; j = (j + state[i]) & 255; [state[i], state[j]] = [state[j], state[i]]; output[n] = input[n] ^ state[(state[i] + state[j]) & 255]; }
  return output;
}
function fileKey(password, owner, permissions, id) {
  const bytes = Buffer.from(password, 'latin1'), padded = Buffer.concat([bytes, padding]).subarray(0, 32), p = Buffer.alloc(4);
  p.writeInt32LE(permissions);
  let digest = md5(Buffer.concat([padded, owner, p, id]));
  for (let n = 0; n < 50; n++) digest = md5(digest.subarray(0, 16));
  return digest.subarray(0, 16);
}
function authenticates(key, id, user) {
  let verification = crypt(key, md5(Buffer.concat([padding, id])));
  for (let n = 1; n <= 19; n++) verification = crypt(Buffer.from(key.map(byte => byte ^ n)), verification);
  return crypto.timingSafeEqual(verification.subarray(0, 16), user.subarray(0, 16));
}
function ownerAuthenticates(password, owner, permissions, id, user) {
  const padded = Buffer.concat([Buffer.from(password, 'latin1'), padding]).subarray(0, 32);
  let digest = md5(padded);
  for (let n = 0; n < 50; n++) digest = md5(digest);
  const key = digest.subarray(0, 16);
  let recovered = Buffer.from(owner);
  for (let n = 19; n >= 0; n--) recovered = crypt(Buffer.from(key.map(byte => byte ^ n)), recovered);
  return authenticates(fileKey(recovered, owner, permissions, id), id, user);
}
async function runProof() {
  // Classic RC4 reference vector verifies the independent primitive first.
  assert.equal(crypt(Buffer.from('Key'), Buffer.from('Plaintext')).toString('hex'), 'bbf316e8d940af0ad3');
  global.ENCRYPTION_KEYS = { 1: 'a'.repeat(64) }; global.ACTIVE_KEY_VERSION = 1;
  const { generateIsolatedSyntheticProofPDF } = require('../server/tests/helpers/legacyPdfProof');
  // The verifier owns a synthetic user secret; do not obtain credentials from
  // public Buffer properties or authorize a new production delivery channel.
  const documentPassword = crypto.randomBytes(16).toString('hex').toUpperCase();
  const bytes = await generateIsolatedSyntheticProofPDF([{ drugName: 'Paracetamol', dosage: '500mg', frequency: 'PRN', durationDays: 2 }], 'Synthetic QA Subject', 'NIC-SYNTHETIC-ONLY', 'Synthetic Doctor', 'Synthetic Workspace', { lang: 'en', documentPassword });
  assert.ok(Buffer.isBuffer(bytes));
  for (const property of ['documentPassword', 'ownerPassword', 'userPassword']) assert.equal(Object.hasOwn(bytes, property), false, 'Public PDF buffer must not carry credential properties');
  await assert.rejects(() => PDFDocument.load(bytes), /encrypted/i);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const context = doc.context, dictionary = context.lookup(context.trailerInfo.Encrypt);
  const get = name => context.lookup(dictionary.get(PDFName.of(name)));
  const version = get('V').asNumber(), revision = get('R').asNumber(), length = get('Length').asNumber();
  assert.equal(version, 2); assert.equal(revision, 3); assert.equal(length, 128);
  const owner = Buffer.from(get('O').asBytes()), user = Buffer.from(get('U').asBytes());
  const ids = context.lookup(context.trailerInfo.ID); assert.ok(ids);
  const id = Buffer.from(context.lookup(ids.get(0)).asBytes()); assert.ok(id.length);
  const key = fileKey(documentPassword, owner, get('P').asNumber(), id);
  assert.equal(authenticates(key, id, user), true);
  assert.equal(authenticates(fileKey('INCORRECT_SYNTHETIC_PASSWORD', owner, get('P').asNumber(), id), id, user), false);
  assert.equal(ownerAuthenticates(global.ENCRYPTION_KEYS[1], owner, get('P').asNumber(), id, user), false, 'Database master secret must not open the PDF as owner');
  // Positive control prevents an always-false owner verifier from hiding reuse.
  const controlOwner = crypto.randomBytes(32).toString('hex');
  const controlBytes = await generateIsolatedSyntheticProofPDF([], 'Synthetic Owner Control', 'NIC-SYNTHETIC-ONLY', null, null, { documentPassword, ownerPassword: controlOwner });
  const control = (await PDFDocument.load(controlBytes, { ignoreEncryption: true })).context;
  const controlDictionary = control.lookup(control.trailerInfo.Encrypt);
  const controlGet = name => control.lookup(controlDictionary.get(PDFName.of(name)));
  const controlId = Buffer.from(control.lookup(control.lookup(control.trailerInfo.ID).get(0)).asBytes());
  assert.equal(ownerAuthenticates(controlOwner, Buffer.from(controlGet('O').asBytes()), controlGet('P').asNumber(), controlId, Buffer.from(controlGet('U').asBytes())), true);
  const text = []; let streams = 0;
  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    const suffix = Buffer.alloc(5); suffix.writeUIntLE(ref.objectNumber & 0xffffff, 0, 3); suffix.writeUIntLE(ref.generationNumber & 0xffff, 3, 2);
    const objectKey = md5(Buffer.concat([key, suffix])).subarray(0, 16);
    let plaintext = crypt(objectKey, Buffer.from(object.getContents()));
    const filter = object.dict.get(PDFName.of('Filter'));
    if (filter) { assert.equal(filter.toString(), '/FlateDecode'); plaintext = zlib.inflateSync(plaintext); }
    streams++;
    for (const match of plaintext.toString('latin1').matchAll(/<([A-Fa-f0-9\s]+)>\s*Tj/g)) text.push(Buffer.from(match[1].replace(/\s/g, ''), 'hex').toString('latin1'));
  }
  assert.ok(streams > 0);
  assert.ok(text.some(value => value.includes('Paracetamol')), 'Decrypted content must contain the expected medication');
  assert.ok(text.some(value => value.includes('500mg')), 'Decrypted content must contain the expected dosage');
  return { status: 'PASS_SYNTHETIC_RC4_STREAM_PROOF', cipher: 'RC4-128', version, revision, length, encryptedPdfSha256: crypto.createHash('sha256').update(bytes).digest('hex'), streamsDecrypted: streams, correctPasswordAuthenticated: true, wrongPasswordRejected: true, expectedMedicationAndDosageRecovered: true, publicBufferCredentialsAbsent: true, databaseMasterRejectedAsOwner: true, fixture: 'Synthetic in-memory document with verifier-supplied user password only', authorizedPasswordDelivery: 'NOT_VERIFIED', noFilesOrSubprocesses: true, independentReaderInterop: 'NOT_RUN', clinicalCipherApproval: 'NOT_GRANTED' };
}
module.exports = { runProof };
