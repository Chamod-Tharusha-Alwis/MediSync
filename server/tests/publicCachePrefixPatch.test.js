// server/tests/publicCachePrefixPatch.test.js
// Focused regression for Source B — offline, no Redis connection required.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

describe('Source B — publicController cache key prefix patch', () => {
  const controllerPath = path.resolve(
    __dirname, '../src/controllers/publicController.js'
  );

  test('controller file exists', () => {
    expect(fs.existsSync(controllerPath)).toBe(true);
  });

  test('controller SHA-256 matches expected post-patch hash', () => {
    const hash = crypto.createHash('sha256')
      .update(fs.readFileSync(controllerPath))
      .digest('hex');
    expect(hash).toBe('24aae2556bc805c4741f380272282cea93bd7e9d42cb325485965d9557198654');
  });

  test('health-stats cache key uses medisync:cache: prefix', () => {
    const content = fs.readFileSync(controllerPath, 'utf8');
    expect(content).not.toMatch(/cacheKey = `health-stats:/);
    expect(content).toMatch(/cacheKey = `medisync:cache:health-stats:/);
  });

  test('search-diseases cache key uses medisync:cache: prefix', () => {
    const content = fs.readFileSync(controllerPath, 'utf8');
    expect(content).not.toMatch(/cacheKey = `search-diseases:/);
    expect(content).toMatch(/cacheKey = `medisync:cache:search-diseases:/);
  });

  test('no other unprefixed cache keys introduced', () => {
    const content = fs.readFileSync(controllerPath, 'utf8');
    const cacheKeyLines = content.split('\n').filter(l => l.includes('cacheKey =') || l.includes('cacheKey='));
    for (const line of cacheKeyLines) {
      if (line.includes('cacheKey') && line.includes('`') && !line.includes('medisync:')) {
        throw new Error(`Unprefixed cacheKey found: ${line.trim()}`);
      }
    }
    expect(cacheKeyLines.length).toBeGreaterThan(0);
  });
});
