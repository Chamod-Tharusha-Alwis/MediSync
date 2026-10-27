'use strict';
const crypto = require('crypto'), mongoose = require('mongoose');
const { createVersionedFieldPlugin } = require('../src/security/versionedFieldPluginCandidate');
const names = [];
afterEach(() => names.splice(0).forEach(name => mongoose.deleteModel(name)));
function model() {
  const schema = new mongoose.Schema({ keyVersion: Number, notes: String }, { bufferCommands: false, autoCreate: false, autoIndex: false });
  schema.plugin(createVersionedFieldPlugin({ getKeyConfiguration: () => ({ keys: { 1: crypto.randomBytes(32) }, activeVersion: 1 }) }), { fields: ['notes'] });
  names.push('SyntheticQueryWriteHold'); return mongoose.model(names[0], schema);
}
test.each(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'insertMany', 'bulkWrite'])('actual detached Mongoose %s fails before database dispatch', async operation => {
  const Model = model(), id = new mongoose.Types.ObjectId('000000000000000000000001');
  const command = operation === 'insertMany' ? () => Model.insertMany([{ _id: id, notes: 'Synthetic-only' }])
    : operation === 'bulkWrite' ? () => Model.bulkWrite([{ updateOne: { filter: { _id: id }, update: { $set: { notes: 'Synthetic-only' } } } }])
      : () => Model[operation]({ _id: id }, operation.startsWith('replace') || operation === 'findOneAndReplace' ? { notes: 'Synthetic-only' } : { $set: { notes: 'Synthetic-only' } });
  await expect(command()).rejects.toThrow('FIELD_QUERY_WRITE_REQUIRES_DOCUMENT_CAS');
  expect(mongoose.connection.readyState).toBe(0);
});
