#!/usr/bin/env node
// Read-only live timing: N sequential GET requests per endpoint, prints JSON (median, max, statuses).
// No login, no writes, no secrets. Usage: node report-evidence/scripts/measure_live.cjs [N]
'use strict';
const https = require('https');
const N = Number(process.argv[2]) || 10;
const ENDPOINTS = [
  ['server health', 'https://medisync-wabc.onrender.com/api/health'],
  ['ML service health', 'https://medisync-ml.onrender.com/health'],
  ['public list: /api/public/hospitals', 'https://medisync-wabc.onrender.com/api/public/hospitals'],
  ['public outbreak dashboard: /api/public/outbreak-alerts', 'https://medisync-wabc.onrender.com/api/public/outbreak-alerts'],
  ['public dashboard data: /api/public/health-stats', 'https://medisync-wabc.onrender.com/api/public/health-stats'],
];
function once(url) {
  return new Promise(resolve => {
    const t0 = process.hrtime.bigint();
    const req = https.get(url, { headers: { 'user-agent': 'medisync-report-evidence/1.0' }, timeout: 90000 }, res => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode, ms: Number(process.hrtime.bigint() - t0) / 1e6 }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', e => resolve({ status: 'ERR ' + e.message, ms: Number(process.hrtime.bigint() - t0) / 1e6 }));
  });
}
const median = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
(async () => {
  const started = new Date();
  const results = [];
  for (const [name, url] of ENDPOINTS) {
    await once(url); // warm-up request (Render free instances sleep); not counted
    const runs = [];
    for (let i = 0; i < N; i++) runs.push(await once(url));
    const ms = runs.map(r => r.ms);
    results.push({ name, url, n: N, statuses: [...new Set(runs.map(r => r.status))], medianMs: +median(ms).toFixed(1), maxMs: +Math.max(...ms).toFixed(1), allMs: ms.map(x => +x.toFixed(1)) });
  }
  console.log(JSON.stringify({ started: started.toISOString(), finished: new Date().toISOString(), warmUpRequestPerEndpoint: 'excluded', results }, null, 1));
})();
