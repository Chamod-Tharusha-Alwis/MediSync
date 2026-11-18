#!/usr/bin/env node
// Live screenshots of PUBLIC pages only (no login, no form submission). 1440x900, deviceScaleFactor 2.
// Usage (repo root): node report-evidence/scripts/live_screenshots.cjs
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'report-evidence', 'screenshots', 'live');
const BASE = 'https://medisync.chamodtharusha.com.lk';
const { chromium } = require(path.join(ROOT, 'client', 'node_modules', 'playwright'));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const log = [];
  // L1: login page as served (nothing typed).
  await page.goto(`${BASE}/doctor/login`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, 'L1_login.png') });
  log.push({ file: 'L1_login.png', url: page.url(), at: new Date().toISOString() });
  // L6: public page, "Recorded Consultation Visits" tab, click the first district that has a visit count.
  await page.goto(`${BASE}/public-health?tab=visits`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(4000);
  const table = page.getByRole('table', { name: 'District visit counts' });
  const rows = table.locator('tbody tr');
  const n = await rows.count();
  let clicked = null;
  for (let i = 0; i < n; i++) {
    const text = (await rows.nth(i).locator('td').first().innerText().catch(() => '')).trim();
    if (/^\d[\d,]*$/.test(text)) { const b = rows.nth(i).getByRole('button'); clicked = (await b.innerText()).replace(/[▸▾]/g, '').trim(); await b.click(); break; }
  }
  await page.waitForTimeout(3000);
  const section = page.locator('section', { has: page.locator('h2', { hasText: 'District visit counts' }) }).first();
  const panel = page.getByTestId('district-drilldown-row');
  if (await panel.count()) await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, 'L6_district_drilldown.png') });
  await section.screenshot({ path: path.join(OUT, 'L6_district_drilldown_table.png') });
  log.push({ file: 'L6_district_drilldown.png', url: page.url(), district: clicked, inlineRowPresent: (await panel.count()) > 0, at: new Date().toISOString() });
  await browser.close();
  console.log(JSON.stringify(log, null, 1));
})().catch(e => { console.error(e.message); process.exit(1); });
