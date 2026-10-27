'use strict';
// Verification-only preload. Never imported by the application.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.resolve(__dirname, '..');
const mode = process.env.MEDISYNC_COMBINED_MODE;
const directory = process.env.MEDISYNC_COMBINED_EVIDENCE;
const receipt = { mode, pid: process.pid, networkDenied: 0, envReadDenied: 0, envDiscoverySuppressed: 0, childDenied: 0, approvedPdfChecks: 0, approvedJestFeatureProbes: 0 };
const write = fs.writeFileSync.bind(fs);
const deny = category => { receipt[category]++; throw new Error('COMBINED_OFFLINE_' + category); };
const noNetwork = () => deny('networkDenied');
for (const [mod, names] of Object.entries({ net: ['connect', 'createConnection'], tls: ['connect'], http: ['request', 'get'], https: ['request', 'get'], dns: ['lookup', 'resolve', 'resolveSrv', 'resolveTxt'] })) for (const name of names) require(mod)[name] = noNetwork;
require('net').Socket.prototype.connect = noNetwork;
require('net').Server.prototype.listen = noNetwork;
require('dgram').createSocket = noNetwork;
for (const name of ['lookup', 'resolve', 'resolveSrv', 'resolveTxt']) require('dns').promises[name] = noNetwork;
global.fetch = noNetwork;
const sensitive = p => /(?:^|[\\/])\.env(?:$|\.)/i.test(String(p));
for (const name of ['readFileSync', 'readFile', 'openSync', 'open', 'createReadStream']) {
  const original = fs[name];
  fs[name] = function (p, ...args) { if (sensitive(p)) return deny('envReadDenied'); return original.call(this, p, ...args); };
}
for (const name of ['readFile', 'open']) {
  const original = fs.promises[name].bind(fs.promises);
  fs.promises[name] = (p, ...args) => { if (sensitive(p)) return deny('envReadDenied'); return original(p, ...args); };
}
const exists = fs.existsSync.bind(fs);
fs.existsSync = p => { if (sensitive(p)) { receipt.envDiscoverySuppressed++; return false; } return exists(p); };
const originalSpawnSync = cp.spawnSync.bind(cp);
for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) cp[name] = () => deny('childDenied');
cp.spawnSync = (command, args, options) => {
  if (mode === 'client' && command === 'node' && args?.length === 2 && args[0] === '--eval' && args[1] === 'import("node:fs").then(() => console.log(true), () => console.log(false));' && options?.shell !== true) {
    receipt.approvedJestFeatureProbes++;
    return originalSpawnSync(process.execPath, ['--require', __filename, ...args], { ...options, env: { ...process.env }, shell: false, windowsHide: true, timeout: 10000, maxBuffer: 65536 });
  }
  // No PDF/Python/interpreter exception, even for an absolute binary. The revised
  // PDF suite and independent stream proof run entirely inside this Node process.
  return deny('childDenied');
};
process.on('exit', () => { if (directory) write(path.join(directory, mode + '-boundary-' + process.pid + '.json'), JSON.stringify(receipt, null, 2)); });
