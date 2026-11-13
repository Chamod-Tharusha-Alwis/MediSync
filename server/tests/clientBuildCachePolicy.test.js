'use strict';

const fs = require('fs');
const path = require('path');

describe('Part 0: Stale Client Build Invalidation and Commit Derivation', () => {
  const root = path.resolve(__dirname, '../..');

  test('vercel.json invalidates HTML and dynamic routes while caching static bundles immutably', () => {
    const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, 'client/vercel.json'), 'utf8'));
    expect(vercelConfig.headers).toBeDefined();

    const catchAllHeader = vercelConfig.headers.find(h => h.source === '/(.*)');
    expect(catchAllHeader).toBeDefined();
    const cacheControl = catchAllHeader.headers.find(kv => kv.key === 'Cache-Control');
    expect(cacheControl.value).toContain('no-cache');
    expect(cacheControl.value).toContain('no-store');
    expect(cacheControl.value).toContain('must-revalidate');

    const staticHeader = vercelConfig.headers.find(h => h.source === '/static/(.*)');
    expect(staticHeader).toBeDefined();
    const staticCache = staticHeader.headers.find(kv => kv.key === 'Cache-Control');
    expect(staticCache.value).toContain('immutable');
  });

  test('index.html contains cache-control meta tags for browser-level freshness', () => {
    const html = fs.readFileSync(path.join(root, 'client/public/index.html'), 'utf8');
    expect(html).toContain('<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />');
    expect(html).toContain('<meta http-equiv="Pragma" content="no-cache" />');
    expect(html).toContain('<meta http-equiv="Expires" content="0" />');
  });

  test('buildClinical.cjs dynamically resolves commit hash from Vercel SHA or git HEAD without stale fallback', () => {
    const buildScript = fs.readFileSync(path.join(root, 'client/scripts/buildClinical.cjs'), 'utf8');
    expect(buildScript).toContain('function resolveCommitHash()');
    expect(buildScript).toContain('process.env.VERCEL_GIT_COMMIT_SHA.trim().slice(0, 7)');
    expect(buildScript).toContain("execSync('git rev-parse --short HEAD'");
  });
});
