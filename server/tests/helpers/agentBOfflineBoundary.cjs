'use strict';
// Defense in depth: the parent also supplies an allowlisted environment.
const forbidden = () => { throw new Error('AGENT_B_OFFLINE_BOUNDARY'); };
for (const [module, names] of Object.entries({
  net: ['connect', 'createConnection'], tls: ['connect'],
  http: ['request', 'get'], https: ['request', 'get'],
  dns: ['lookup', 'resolve', 'resolveSrv', 'resolveTxt'],
  child_process: ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']
})) for (const name of names) require(module)[name] = forbidden;
require('net').Socket.prototype.connect = forbidden;
require('net').Server.prototype.listen = forbidden;
require('dgram').createSocket = forbidden;
for (const name of ['lookup', 'resolve', 'resolveSrv', 'resolveTxt']) require('dns').promises[name] = forbidden;
global.fetch = forbidden;
const fs = require('fs');
const sensitive = p => /(?:^|[\\/])\.env(?:$|\.)/i.test(String(p));
for (const name of ['readFileSync', 'readFile', 'openSync', 'open', 'createReadStream']) {
  const original = fs[name];
  fs[name] = function (p, ...args) { if (sensitive(p)) return forbidden(); return original.call(this, p, ...args); };
}
const originalRead = fs.promises.readFile.bind(fs.promises);
fs.promises.readFile = (p, ...args) => { if (sensitive(p)) return forbidden(); return originalRead(p, ...args); };
const mongoose = require('mongoose');
mongoose.set('autoIndex', false); mongoose.set('autoCreate', false); mongoose.set('bufferCommands', false);
mongoose.connect = forbidden; mongoose.createConnection = forbidden;
mongoose.Connection.prototype.openUri = forbidden;
require('mongodb').MongoClient.prototype.connect = forbidden;
