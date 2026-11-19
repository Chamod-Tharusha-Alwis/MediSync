// Read-only live timing (no login): first request recorded separately (cold if the instance was asleep), then 10 timed.
'use strict';
const https = require('https');
const ENDPOINTS = [
  ['API health', 'https://medisync-wabc.onrender.com/api/health'],
  ['ML health', 'https://medisync-ml.onrender.com/health'],
  ['admin alerts (no token: 401 path)', 'https://medisync-wabc.onrender.com/api/admin/outbreak/alerts'],
  ['admin growth (no token: 401 path)', 'https://medisync-wabc.onrender.com/api/admin/outbreak/growth?window=72h'],
  ['public outbreak alerts', 'https://medisync-wabc.onrender.com/api/public/outbreak-alerts'],
  ['public health stats', 'https://medisync-wabc.onrender.com/api/public/health-stats'],
  ['client index', 'https://medisync.chamodtharusha.com.lk/admin/dashboard/outbreak'],
];
const once = url => new Promise(resolve => {
  const t = process.hrtime.bigint();
  const r = https.get(url, { headers: { 'user-agent': 'medisync-perf-check/1.0' }, timeout: 120000 }, res => { res.resume(); res.on('end', () => resolve({ s: res.statusCode, ms: Number(process.hrtime.bigint() - t) / 1e6 })); });
  r.on('timeout', () => r.destroy(new Error('timeout'))); r.on('error', e => resolve({ s: 'ERR ' + e.message, ms: Number(process.hrtime.bigint() - t) / 1e6 }));
});
const med = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
(async () => {
  const started = new Date().toISOString(), rows = [];
  for (const [name, url] of ENDPOINTS) {
    const first = await once(url);
    const runs = []; for (let i = 0; i < 10; i++) runs.push(await once(url));
    rows.push({ name, firstMs: +first.ms.toFixed(1), firstStatus: first.s, warmMedianMs: +med(runs.map(r => r.ms)).toFixed(1), warmMaxMs: +Math.max(...runs.map(r => r.ms)).toFixed(1), statuses: [...new Set(runs.map(r => r.s))] });
  }
  console.log(JSON.stringify({ started, finished: new Date().toISOString(), rows }, null, 1));
})();
