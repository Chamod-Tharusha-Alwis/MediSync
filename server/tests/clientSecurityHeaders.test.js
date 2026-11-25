'use strict';
// Browser security headers of the client (ZAP baseline 2026-11-25). New test file; existing tests unchanged.
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../../client/vercel.json'), 'utf8'));
const headers = Object.fromEntries(config.headers.find(h => h.source === '/(.*)').headers.map(h => [h.key, h.value]));
const csp = Object.fromEntries(headers['Content-Security-Policy'].split(';').map(d => d.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));

describe('client security headers (client/vercel.json)', () => {
  test('anti-clickjacking, nosniff, opener, referrer and permissions headers', () => {
    expect(headers).toMatchObject({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Cross-Origin-Opener-Policy': 'same-origin' });
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Permissions-Policy']).toMatch(/camera=\(\)/);
  });
  test('CSP: own scripts only, no eval, no wildcard, no plugins', () => {
    expect(csp['script-src']).toEqual(["'self'"]);
    expect(csp['object-src']).toEqual(["'none'"]);
    expect(csp['frame-ancestors']).toEqual(["'self'"]);
    expect(headers['Content-Security-Policy']).not.toMatch(/unsafe-eval|\*/);
    for (const values of Object.values(csp)) expect(values).not.toContain('https:');
  });
  test('CSP allows what the client uses: API over HTTPS and WSS, Cloudinary pictures, the map frame', () => {
    expect(csp['connect-src']).toEqual(expect.arrayContaining(["'self'", 'https://medisync-wabc.onrender.com', 'wss://medisync-wabc.onrender.com']));
    expect(csp['img-src']).toEqual(expect.arrayContaining(["'self'", 'data:', 'blob:', 'https://res.cloudinary.com']));
    expect(csp['frame-src']).toEqual(expect.arrayContaining(['https://maps.google.com', 'https://www.google.com']));
  });
});
