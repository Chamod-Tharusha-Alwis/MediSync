'use strict';
// Deliberately independent of Express and every clinical/backend adapter.
const http = require('http');
const { MODE, SPA_ROUTES, assertDemoEnvironment } = require('../security/publicDemoIsolation');
const { verifiedAssets } = require('../security/publicDemoArtifact');

const CSP = "default-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; media-src 'none'; worker-src 'none'; manifest-src 'self'; frame-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'; object-src 'none'";
const MIME = { html: 'text/html; charset=utf-8', js: 'application/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', txt: 'text/plain; charset=utf-8', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf' };

function createPublicDemoHandler({ root, manifest, env }) {
  assertDemoEnvironment(env);
  // Load verified bytes once; later on-disk changes cannot replace served assets.
  const assets = verifiedAssets(root, manifest);
  return function publicDemoHandler(req, res) {
    for (const [name, value] of Object.entries({
      'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin', 'Cross-Origin-Opener-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      'Cache-Control': 'no-store', 'X-MediSync-Mode': MODE, Connection: 'close'
    })) res.setHeader(name, value);
    const send = (status, body, mime = 'application/json; charset=utf-8') => {
      const bytes = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
      res.statusCode = status; res.setHeader('Content-Type', mime); res.setHeader('Content-Length', bytes.length);
      res.end(req.method === 'HEAD' ? undefined : bytes);
    };
    if (!['GET', 'HEAD'].includes(req.method)) return send(403, { error: 'PUBLIC_DEMO_READ_ONLY' });
    if (req.headers?.['transfer-encoding'] || (req.headers?.['content-length'] && req.headers['content-length'] !== '0')) return send(400, { error: 'PUBLIC_DEMO_BODY_REJECTED' });
    let route;
    try {
      if (typeof req.url !== 'string' || req.url.length > 2048 || !req.url.startsWith('/') || /[?#]/.test(req.url)) throw new Error();
      route = decodeURIComponent(req.url);
      if (/[\\%\u0000-\u0020\u007f]/.test(route) || route.includes('//') || route.split('/').some(part => part === '.' || part === '..')) throw new Error();
    } catch (_) { return send(400, { error: 'PUBLIC_DEMO_PATH_REJECTED' }); }
    if (/^\/(?:api|socket\.io|uploads|auth|login|register|documents|reports)(?:\/|$)/i.test(route)) return send(403, { error: 'PUBLIC_DEMO_CLINICAL_ACCESS_DISABLED' });
    if (route === '/health') return send(200, { status: 'ok', mode: MODE, clinicalAccess: false });
    const file = SPA_ROUTES.includes(route) ? '/index.html' : route;
    const bytes = assets.get(file);
    if (!bytes) return send(404, { error: 'PUBLIC_DEMO_NOT_FOUND' });
    return send(200, bytes, MIME[file.split('.').pop()] || 'application/octet-stream');
  };
}

function createPublicDemoServer(options) {
  const server = http.createServer({ maxHeaderSize: 8192 }, createPublicDemoHandler(options));
  server.requestTimeout = 10000; server.headersTimeout = 5000; server.keepAliveTimeout = 1000; server.maxRequestsPerSocket = 100;
  return server;
}

module.exports = { createPublicDemoHandler, createPublicDemoServer, CSP };
