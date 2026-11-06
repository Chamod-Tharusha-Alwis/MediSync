'use strict';

const fs = require('fs');
const path = require('path');

describe('S11 — Permissions-Policy header restricts Client Hints to (self)', () => {
  test('server/src/app.js sets Permissions-Policy to (self) for ch-ua-model, ch-ua-platform, and ch-ua-platform-version with no wildcard *', () => {
    const appPath = path.join(__dirname, '../src/app.js');
    const source = fs.readFileSync(appPath, 'utf8');

    // Extract the Client Hints / Permissions-Policy middleware block from app.js
    const match = source.match(
      /app\.use\(\(req,\s*res,\s*next\)\s*=>\s*\{\s*res\.setHeader\('Accept-CH'[\s\S]*?next\(\);\s*\}\);/
    );
    expect(match).not.toBeNull();

    let capturedMiddleware = null;
    const app = {
      use(fn) {
        capturedMiddleware = fn;
      }
    };

    // Execute the exact middleware registration from app.js
    // eslint-disable-next-line no-new-func
    new Function('app', match[0])(app);
    expect(typeof capturedMiddleware).toBe('function');

    const headers = {};
    let nextCalled = false;
    capturedMiddleware(
      {},
      {
        setHeader(name, value) {
          headers[name] = value;
        }
      },
      () => {
        nextCalled = true;
      }
    );

    expect(nextCalled).toBe(true);
    expect(headers['Accept-CH']).toBe(
      'Sec-CH-UA-Model, Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version, Sec-CH-UA, Sec-CH-UA-Mobile'
    );
    expect(headers['Permissions-Policy']).toBe(
      'ch-ua-model=(self), ch-ua-platform=(self), ch-ua-platform-version=(self)'
    );
    expect(headers['Permissions-Policy']).not.toContain('*');
  });
});
