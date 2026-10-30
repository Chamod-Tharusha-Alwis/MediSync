'use strict';
const { ClinicalCommandError } = require('./clinicalErrors');
// Metadata only: never create a missing recovery journal implicitly in a write.
async function assertClinicalCommandStorage(db) {
  try {
    if (!db || !['test', 'medisync_automated_test', 'medisync_prod'].includes(db.databaseName)) throw Error();
    const rows = await db.listCollections({ name: 'clinicalcommands' }, { nameOnly: false }).toArray();
    if (rows.length !== 1 || rows[0].name !== 'clinicalcommands' || rows[0].type !== 'collection' || rows[0].options?.capped === true || rows[0].options?.expireAfterSeconds !== undefined) throw Error();
    const indexes = await db.collection('clinicalcommands').listIndexes().toArray();
    const primary = indexes.find(index => index.name === '_id_' && index.key?._id === 1 && Object.keys(index.key).length === 1);
    if (!primary || primary.unique === false || indexes.some(index => index.expireAfterSeconds !== undefined)) throw Error();
  } catch (_) {
    throw new ClinicalCommandError('CLINICAL_COMMAND_STORAGE_NOT_READY', 503);
  }
}
module.exports = { assertClinicalCommandStorage };
