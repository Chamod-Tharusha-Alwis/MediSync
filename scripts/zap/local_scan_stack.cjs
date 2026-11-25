'use strict';
/**
 * scripts/zap/local_scan_stack.cjs — local, throwaway MediSync stack for a ZAP baseline scan. Never production.
 *
 *   node scripts/zap/local_scan_stack.cjs        (client :3300, API :5300, Ctrl+C or the stop file ends it)
 *
 * What is REAL: server/src/app.js startServer() with every middleware, header, route and rate limiter, in
 *   NODE_ENV=production (so the shipped limits apply and are NOT relaxed); the built client (client/build) with the
 *   headers of client/vercel.json; a password-protected throwaway Redis container.
 * What is REPLACED, in this process only (no source file is edited): server/src/config/db.js, because the protected
 *   dbGuard.js accepts only Atlas hosts. Here it connects to an in-memory MongoDB on 127.0.0.1 with no real data.
 * Not present locally: Vercel's and Render's own edge (TLS, HSTS, compression), so transport findings are not comparable.
 * Every secret is random and lives only in this process. No .env file is read (dotenv is a no-op here).
 */
const crypto = require('crypto');
const cp = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

for (const k of ['MONGO_URI', 'MONGO_URI_TEST', 'MONGODB_URI', 'REDIS_URL']) if (process.env[k]) throw new Error(`REFUSING: ${k} is set`);
const ROOT = path.resolve(__dirname, '../..');
const SERVER = path.join(ROOT, 'server');
const CLIENT_PORT = 3300, API_PORT = 5300, REDIS_PORT = 6390;
const REDIS_NAME = 'medisync-zap-redis';
const REDIS_IMAGE = process.env.ZAP_REDIS_IMAGE || 'redis:latest';
const BINARY = process.env.MONGOMS_SYSTEM_BINARY || 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
const hex = n => crypto.randomBytes(n).toString('hex');
const password = hex(24);

Object.assign(process.env, {
  NODE_ENV: 'production', PORT: String(API_PORT), CLIENT_URL: 'https://medisync-local-scan.test', ACTIVE_KEY_VERSION: '1',
  MEDISYNC_PROTOTYPE_MODE: 'true', MEDISYNC_ALLOW_OPERATOR_KEYS: 'true', MEDISYNC_DEPLOYMENT_MODE: 'clinical',
  ENCRYPTION_KEYS: JSON.stringify({ 1: hex(32) }), JWT_SECRET: hex(48), JWT_REFRESH_SECRET: hex(48), INTERNAL_API_KEY: hex(32),
  REDIS_URL: `redis://:${password}@127.0.0.1:${REDIS_PORT}`, ML_ENGINE_URL: 'http://127.0.0.1:5399',
});

const Module = require('module');
const load = Module._load;
let connectLocal;
Module._load = function (name, parent, ...rest) {
  if (name === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (name === './config/db') return () => connectLocal();
  return load.call(this, name, parent, ...rest);
};

const LOCAL_API = `(function(){var live='https://medisync-wabc.onrender.com',o=XMLHttpRequest.prototype.open,f=window.fetch;
window.__violations=[];document.addEventListener('securitypolicyviolation',function(e){window.__violations.push([location.pathname,e.violatedDirective,e.blockedURI])});
XMLHttpRequest.prototype.open=function(m,u){arguments[1]=String(u).split(live).join(location.origin);return o.apply(this,arguments)};
window.fetch=function(u,x){return f.call(window,typeof u==='string'?u.split(live).join(location.origin):u,x)};})();`;

// The same path rules Vercel applies: static file if it exists, otherwise index.html; headers from client/vercel.json.
function clientServer() {
  const build = path.join(ROOT, 'client', 'build');
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'client', 'vercel.json'), 'utf8')).headers
    .map(r => ({ re: new RegExp(`^${r.source}$`), headers: r.headers }));
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://local');
    if (url.pathname.startsWith('/api/')) {
      const upstream = http.request({ host: '127.0.0.1', port: API_PORT, path: req.url, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${API_PORT}` } }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
      upstream.on('error', () => { res.statusCode = 502; res.end(); });
      req.pipe(upstream);
      return;
    }
    if (process.env.ZAP_BROWSER_CHECK === 'true' && url.pathname === '/__local_api.js') { res.setHeader('Content-Type', types['.js']); return res.end(LOCAL_API); }
    let file = path.normalize(path.join(build, decodeURIComponent(url.pathname)));
    if (!file.startsWith(build) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(build, 'index.html');
    for (const rule of rules) if (rule.re.test(url.pathname)) for (const h of rule.headers) res.setHeader(h.key, h.value);
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    // Browser checks only (ZAP_BROWSER_CHECK=true): send the bundle's absolute live-API calls to this stack instead.
    if (process.env.ZAP_BROWSER_CHECK === 'true' && file.endsWith('index.html')) return res.end(fs.readFileSync(file, 'utf8').replace('<script defer', '<script src="/__local_api.js"></script><script defer'));
    fs.createReadStream(file).pipe(res);
  });
}

async function main() {
  const mongoose = require(path.join(SERVER, 'node_modules', 'mongoose'));
  const { MongoMemoryReplSet } = require(path.join(SERVER, 'node_modules', 'mongodb-memory-server'));
  const version = cp.spawnSync(BINARY, ['--version'], { encoding: 'utf8' }).stdout.match(/db version v([0-9.]+)/)[1];
  const dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'medisync-zap-'));
  const replica = await MongoMemoryReplSet.create({ binary: { systemBinary: BINARY, version }, replSet: { count: 1, ip: '127.0.0.1', dbName: 'zap' }, instanceOpts: [{ ip: '127.0.0.1', dbPath }] });
  cp.spawnSync('docker', ['rm', '-f', REDIS_NAME], { stdio: 'ignore' });
  // The password goes through the environment, not the command line.
  const redis = cp.spawnSync('docker', ['run', '--rm', '-d', '--name', REDIS_NAME, '-p', `127.0.0.1:${REDIS_PORT}:6379`, '-e', 'ZAP_REDIS_PASSWORD', REDIS_IMAGE, 'sh', '-c', 'exec redis-server --requirepass "$ZAP_REDIS_PASSWORD"'],
    { env: { ...process.env, ZAP_REDIS_PASSWORD: password, MSYS_NO_PATHCONV: '1' }, encoding: 'utf8' });
  if (redis.status !== 0) throw new Error(`Redis container failed: ${redis.stderr.slice(0, 200)}`);
  await new Promise(r => setTimeout(r, 2500));
  connectLocal = async () => {
    await mongoose.connect(replica.getUri('zap'), { autoIndex: false });
    // startServer refuses to start without an active super admin; this one has no usable password.
    await mongoose.connection.db.collection('admins').insertOne({ isActive: true, isSuperAdmin: true, email: 'zap-placeholder@example.invalid', password: 'not-a-hash', role: 'super_admin' });
    return { dbName: 'zap' };
  };
  const { startServer } = require(path.join(SERVER, 'src', 'app.js'));
  await startServer();
  const client = clientServer();
  await new Promise(r => client.listen(CLIENT_PORT, '127.0.0.1', r));
  console.log(`[ZAP_STACK_READY] client http://localhost:${CLIENT_PORT}  API http://localhost:${API_PORT}  database: in-memory  redis: throwaway`);
  const stop = async () => {
    client.close();
    cp.spawnSync('docker', ['rm', '-f', REDIS_NAME], { stdio: 'ignore' });
    await mongoose.disconnect().catch(() => {});
    await replica.stop().catch(() => {});
    fs.rmSync(dbPath, { recursive: true, force: true });
    process.exit(0);
  };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  const stopFile = path.join(os.tmpdir(), 'medisync-zap-stop');
  fs.rmSync(stopFile, { force: true });
  setInterval(() => { if (fs.existsSync(stopFile)) { fs.rmSync(stopFile, { force: true }); stop(); } }, 1000);
}

main().catch(e => { console.error(e.stack); cp.spawnSync('docker', ['rm', '-f', REDIS_NAME], { stdio: 'ignore' }); process.exit(1); });
