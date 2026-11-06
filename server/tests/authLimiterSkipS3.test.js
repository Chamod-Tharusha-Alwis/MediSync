'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('S3 — Auth limiter skip configuration in server/src/app.js', () => {
  const appPath = path.resolve(__dirname, '../src/app.js');
  const appSource = fs.readFileSync(appPath, 'utf8');

  test('server/src/app.js configures authLimiter to skip only in test environment', () => {
    expect(appSource).not.toMatch(/skip:\s*\(\)\s*=>\s*process\.env\.NODE_ENV\s*!==\s*['"]production['"]/);
    expect(appSource).toMatch(/skip:\s*\(\)\s*=>\s*process\.env\.NODE_ENV\s*===\s*['"]test['"]/);
  });

  test('authLimiter skip function returns true in test and false in production, development, or undefined', () => {
    // Extract the rateLimit options object for authLimiter from appSource
    const match = appSource.match(/const\s+authLimiter\s*=\s*rateLimit\((\{[\s\S]*?\n\s*\})\);/);
    expect(match).toBeTruthy();

    const optionsLiteral = match[1];

    function evaluateSkip(envValue) {
      const sandbox = {
        process: {
          env: envValue !== undefined ? { NODE_ENV: envValue } : {}
        }
      };
      const context = vm.createContext(sandbox);
      const opts = vm.runInContext(`(${optionsLiteral})`, context);
      return opts.skip();
    }

    // Must skip during automated test runs
    expect(evaluateSkip('test')).toBe(true);

    // Must NOT skip in production (strict max: 10 enforced)
    expect(evaluateSkip('production')).toBe(false);

    // Must NOT skip in development (relaxed max: 100 enforced)
    expect(evaluateSkip('development')).toBe(false);

    // Must NOT skip when NODE_ENV is unset (e.g. default cloud host environment)
    expect(evaluateSkip(undefined)).toBe(false);
  });
});
