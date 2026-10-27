// Prepared only; the selected spec still stops at its approval quarantine.
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', testMatch: 'ir04-isolated-five-role-e2e.spec.js',
  workers: 1, fullyParallel: false, retries: 0, timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:3100', serviceWorkers: 'block' },
  outputDir: '../scratch/phase5x-evidence/5xc-browser-results',
  reporter: [['list'], ['json', { outputFile: '../scratch/phase5x-evidence/5xc-browser-results.json' }]],
});
