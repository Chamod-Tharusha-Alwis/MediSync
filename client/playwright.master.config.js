// Playwright Master Configuration for MediSync Five-Role E2 Verification
// Strict isolation: Targets clean-room local frontend, blocks unapproved network traffic.
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: 'e2-five-role-master.spec.js',
  fullyParallel: false,
  workers: 1, // Deterministic sequential execution to prevent session cross-contamination
  retries: 0,
  timeout: 45000,
  expect: {
    timeout: 10000
  },
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    serviceWorkers: 'block'
  },
  outputDir: '../scratch/phase5x-evidence/playwright-artifacts',
  reporter: [
    ['list'],
    ['json', { outputFile: '../scratch/phase5x-evidence/playwright-master-results.json' }],
    ['html', { outputFolder: '../scratch/phase5x-evidence/playwright-report', open: 'never' }]
  ],
  projects: [
    {
      name: 'Desktop Chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }
    },
    {
      name: 'Mobile Viewport',
      use: { ...devices['Pixel 5'], viewport: { width: 393, height: 851 } }
    }
  ]
});
