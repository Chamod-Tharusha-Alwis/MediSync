'use strict';
const noNetwork = () => { throw new Error('COMBINED_JEST_OFFLINE_BOUNDARY'); };
global.fetch = noNetwork;
if (global.XMLHttpRequest) global.XMLHttpRequest.prototype.open = noNetwork;
if (global.WebSocket) global.WebSocket = noNetwork;
if (global.EventSource) global.EventSource = noNetwork;
// Jest's module registry is separate from the preload registry.
for (const [mod, names] of Object.entries({ net: ['connect', 'createConnection'], tls: ['connect'], http: ['request', 'get'], https: ['request', 'get'], dns: ['lookup', 'resolve', 'resolveSrv', 'resolveTxt'] })) for (const name of names) require(mod)[name] = noNetwork;
require('net').Socket.prototype.connect = noNetwork;
require('net').Server.prototype.listen = noNetwork;
if (process.env.MEDISYNC_COMBINED_MODE === 'email-pdf') {
  const mongoose = require('../server/node_modules/mongoose');
  mongoose.set('autoIndex', false); mongoose.set('autoCreate', false); mongoose.set('bufferCommands', false);
  mongoose.connect = noNetwork; mongoose.createConnection = noNetwork; mongoose.Connection.prototype.openUri = noNetwork;
  require('../server/node_modules/mongodb').MongoClient.prototype.connect = noNetwork;
}
