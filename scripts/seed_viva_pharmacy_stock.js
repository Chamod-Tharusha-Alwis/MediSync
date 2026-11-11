'use strict';

const { BATCH, fail, ownedIds, ownedFilter, withOwnedBatch } = require('./vivaOwnerMaintenance.cjs');

function plannedStockNames() {
  const { buildVivaSeedPlan } = require('./seedVivaPlan.cjs');
  const prescriptions = buildVivaSeedPlan().documentsByModel.Prescription;
  const names = [
    ...prescriptions.flatMap(row => [row.drugName, ...(row.medications || []).map(med => med.name)]),
    'Paracetamol 500mg', 'Amoxicillin', 'Cetirizine', 'Salbutamol', 'Citalopram', 'Warfarin', 'Ciprofloxacin',
  ].filter(name => typeof name === 'string' && name.trim());
  return [...new Map(names.map(name => [name.toLowerCase().trim(), name.trim()])).values()].sort();
}

async function appendStock({ db, manifest, session, confirm, pharmacyEmail }) {
  let rows = [];
  if (pharmacyEmail) {
    const emailNorm = String(pharmacyEmail).toLowerCase().trim();
    let row = await db.collection('pharmacies').findOne({ email: emailNorm }, { session, projection: { inventory: 1 } });
    if (!row) {
      const staff = await db.collection('pharmacystaffs').findOne({ email: emailNorm }, { session, projection: { pharmacyId: 1 } });
      if (staff?.pharmacyId) {
        row = await db.collection('pharmacies').findOne({ _id: staff.pharmacyId }, { session, projection: { inventory: 1 } });
      }
    }
    if (!row) fail('VIVA_PHARMACY_EMAIL_NOT_FOUND');
    rows = [row];
  } else {
    const ids = ownedIds(manifest, 'pharmacies');
    const pharmacies = db.collection('pharmacies');
    rows = await pharmacies.find(ownedFilter(ids), { session, projection: { inventory: 1 } }).toArray();
    if (rows.length !== ids.length) fail('VIVA_PHARMACY_OWNERSHIP_MISMATCH');
  }

  const names = plannedStockNames();
  const { ObjectId } = require('../server/node_modules/mongodb');
  const plans = rows.map(row => {
    if (row.inventory != null && !Array.isArray(row.inventory)) fail('VIVA_STOCK_SHAPE_INVALID');
    const existing = new Set((row.inventory || []).map(item => String(item.drugName || '').trim().toLowerCase()));
    return { id: row._id, items: names.filter(name => !existing.has(name.toLowerCase()))
      .map(drugName => ({ _id: new ObjectId(), drugName, stock: 100, unit: 'units', reorderLevel: 20 })) };
  });

  if (confirm) {
    for (const plan of plans) {
      if (!plan.items.length) continue;
      const updateFilter = pharmacyEmail ? { _id: plan.id } : { ...ownedFilter([plan.id]) };
      const result = await db.collection('pharmacies').updateOne({
        ...updateFilter,
        inventory: { $not: { $elemMatch: { drugName: { $in: plan.items.map(item => item.drugName) } } } },
      }, { $push: { inventory: { $each: plan.items } } }, { session });
      if (result.modifiedCount !== 1) fail('VIVA_STOCK_CONCURRENT_CHANGE');
      if (manifest && manifest._id) {
        await db.collection('seed_manifests').updateOne({
          _id: manifest._id, batch: BATCH, database: db.databaseName,
        }, { $addToSet: { ['pharmacyStock.' + String(plan.id)]: { $each: plan.items.map(item => item._id) } } }, { session }).catch(() => {});
      }
    }
  }
  return { pharmacies: plans.length, stockEntries: plans.reduce((sum, plan) => sum + plan.items.length, 0) };
}

function parseStockArgs(args) {
  let confirm = false;
  let pharmacyEmail = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--confirm') {
      confirm = true;
    } else if (arg === '--dry-run') {
      confirm = false;
    } else if (arg.startsWith('--pharmacy-email=')) {
      pharmacyEmail = arg.slice('--pharmacy-email='.length).trim();
    } else if (arg === '--pharmacy-email') {
      pharmacyEmail = args[++i]?.trim();
      if (!pharmacyEmail || pharmacyEmail.startsWith('--')) fail('VIVA_STOCK_ARGUMENTS_INVALID');
    } else {
      fail('VIVA_STOCK_ARGUMENTS_INVALID');
    }
  }
  return { confirm, pharmacyEmail };
}

if (require.main === module) {
  try {
    const { confirm, pharmacyEmail } = parseStockArgs(process.argv.slice(2));
    withOwnedBatch(confirm, ctx => appendStock({ ...ctx, pharmacyEmail })).then(result => {
      console.log(JSON.stringify({ result: confirm ? 'VIVA_STOCK_APPLIED' : 'VIVA_STOCK_DRY_RUN', ...result }));
    }).catch(error => {
      console.error(error.safeCode || 'VIVA_STOCK_FAILED');
      process.exitCode = 1;
    });
  } catch (error) {
    console.error(error.safeCode || 'VIVA_STOCK_ARGUMENTS_INVALID');
    process.exitCode = 1;
  }
}

module.exports = { appendStock, plannedStockNames, parseStockArgs };
