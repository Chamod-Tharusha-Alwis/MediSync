'use strict';

const crypto = require('node:crypto');
const { BATCH, fail, ownedIds, ownedFilter, withOwnedBatch } = require('./vivaOwnerMaintenance.cjs');

function parseArgs(args) {
  const options = { confirm: false, revokePrevious: false, consultation: null };
  const seen = new Set();
  for (const arg of args) {
    const [flag, ...values] = arg.split('=');
    if (seen.has(flag)) fail('VIVA_MINT_ARGUMENTS_INVALID');
    seen.add(flag);
    if (arg === '--confirm') options.confirm = true;
    else if (arg === '--dry-run') continue;
    else if (arg === '--revoke-previous') options.revokePrevious = true;
    else if (flag === '--consultation' && values.length === 1 && /^[a-f0-9]{24}$/i.test(values[0])) options.consultation = values[0].toLowerCase();
    else fail('VIVA_MINT_ARGUMENTS_INVALID');
  }
  if (!options.consultation || (options.confirm && seen.has('--dry-run'))) fail('VIVA_MINT_ARGUMENTS_INVALID');
  return options;
}

async function mint({ db, manifest, session, confirm }, { consultation, revokePrevious }) {
  const target = ownedIds(manifest, 'consultations').find(id => String(id) === consultation);
  if (!target) fail('VIVA_CONSULTATION_NOT_OWNED');
  const row = await db.collection('consultations').findOne(ownedFilter([target]), {
    session, projection: { patientId: 1, doctorId: 1, consultationId: 1 },
  });
  if (!row || !ownedIds(manifest, 'patients').some(id => String(id) === String(row.patientId))) {
    fail('VIVA_PATIENT_NOT_OWNED');
  }
  if (!await db.collection('patients').findOne({
    ...ownedFilter([row.patientId]),
  }, { session, projection: { _id: 1 } })) fail('VIVA_PATIENT_NOT_OWNED');

  const tokens = db.collection('verificationtokens');
  const tracked = manifest.collections.verificationtokens || [];
  if (!Array.isArray(tracked) || tracked.length > 10000 || tracked.some(id => id?._bsontype !== 'ObjectId')) {
    fail('VIVA_MANIFEST_IDS_INVALID');
  }
  const previousFilter = {
    _id: { $in: tracked }, syntheticSeedBatch: BATCH, mintedByVivaOperator: true,
    consultationId: target, patientRef: row.patientId, revokedAt: null, expiresAt: { $gt: new Date() },
  };
  const previous = revokePrevious ? await tokens.find(previousFilter, {
    session, projection: { _id: 1 }, sort: { createdAt: -1 }, limit: 1,
  }).toArray() : [];
  if (!confirm) return { mintCount: 1, revokeCount: previous.length };

  const rawToken = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const inserted = await tokens.insertOne({
    tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'),
    consultationId: target, consultationRef: row.consultationId,
    patientRef: row.patientId, doctorRef: row.doctorId,
    expiresAt: new Date(+now + 24 * 60 * 60 * 1000), createdAt: now, updatedAt: now,
    revokedAt: null, useCount: 0, isSynthetic: true, syntheticSeedBatch: BATCH, mintedByVivaOperator: true,
  }, { session });
  if (!inserted.acknowledged) fail('VIVA_TOKEN_INSERT_UNVERIFIED');
  if (previous.length) {
    const result = await tokens.updateOne({ ...previousFilter, _id: previous[0]._id },
      { $set: { revokedAt: now, revocationReason: 'Replaced by a new demo verification link' } }, { session });
    if (result.modifiedCount !== 1) fail('VIVA_TOKEN_REVOCATION_UNVERIFIED');
  }
  const updated = await db.collection('seed_manifests').updateOne({
    _id: manifest._id, batch: BATCH, database: db.databaseName,
  }, { $addToSet: { 'collections.verificationtokens': inserted.insertedId } }, { session });
  if (updated.modifiedCount !== 1) fail('VIVA_TOKEN_MANIFEST_UPDATE_UNVERIFIED');
  return { mintCount: 1, revokeCount: previous.length, url: `https://medisync.chamodtharusha.com.lk/verify/${rawToken}` };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { url, ...counts } = await withOwnedBatch(options.confirm, context => mint(context, options));
  console.log(JSON.stringify({ result: options.confirm ? 'VIVA_TOKEN_MINTED' : 'VIVA_TOKEN_DRY_RUN', ...counts }));
  if (url) console.log(url);
}

if (require.main === module) main().catch(error => {
  console.error(error.safeCode || 'VIVA_TOKEN_MINT_FAILED');
  process.exitCode = 1;
});

module.exports = { mint, parseArgs };
