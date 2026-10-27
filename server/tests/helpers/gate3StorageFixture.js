'use strict';
const manifest = require('../../src/security/productionStorageManifest.json');

// Metadata and write recorder only. No MongoClient, transport or document store.
function storageFixture({ complete = false, optional = false } = {}) {
  const rows = new Map(), writes = [];
  const required = manifest.collections.filter(row => !row.whenAll || optional);
  if (complete) for (const spec of required) rows.set(spec.name, {
    name: spec.name, type: 'collection',
    options: { ...(spec.capped ? { capped: true, ...spec.capped } : {}), ...(spec.validator ? { validator: structuredClone(spec.validator), validationLevel: 'strict', validationAction: 'error' } : {}) },
    indexes: structuredClone(spec.indexes)
  });
  const cursor = values => ({ toArray: async () => structuredClone(values), close: jest.fn(async () => {}) });
  const db = {
    databaseName: manifest.database,
    command: jest.fn(async command => command.connectionStatus ? require('./gate3OperatorEnvironment').identity(db.databaseName) : { isWritablePrimary: true, logicalSessionTimeoutMinutes: 30, maxWireVersion: 17, setName: 'inert-replica' }),
    listCollections: jest.fn((filter = {}) => cursor([...rows.values()].filter(row => !filter.name || row.name === filter.name).map(({ indexes, ...row }) => row))),
    createCollection: jest.fn(async (name, options) => {
      writes.push({ operation: 'createCollection', name, options: structuredClone(options) });
      if (rows.has(name)) throw new Error('INERT_COLLECTION_ALREADY_EXISTS');
      rows.set(name, { name, type: 'collection', options: structuredClone(options), indexes: [{ name: '_id_', key: { _id: 1 } }] });
    }),
    collection: name => ({
      indexes: async () => structuredClone(rows.get(name).indexes),
      listIndexes: () => cursor(rows.get(name).indexes),
      createIndex: jest.fn(async (key, options) => {
        writes.push({ operation: 'createIndex', collection: name, key: structuredClone(key), options: structuredClone(options) });
        rows.get(name).indexes.push({ key: structuredClone(key), ...structuredClone(options) });
      })
    })
  };
  return { rows, writes, db, metadata: () => [...rows.values()].map(({ indexes, ...row }) => structuredClone(row)), indexes: () => Object.fromEntries([...rows].map(([name, row]) => [name, structuredClone(row.indexes)])) };
}
module.exports = { storageFixture };
