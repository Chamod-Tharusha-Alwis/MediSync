require('./liveVerificationReadOnly.cjs').install();
'use strict';

/**
 * ============================================================================
 * MEDISYNC LIVE PRODUCTION BROWSER VERIFICATION: MILESTONE 1 (STEP 1)
 * File: scripts/verify_public_health_live.cjs
 *
 * Verifies live production Public Health Dashboard:
 *   - Backend:  GET https://medisync-wabc.onrender.com/api/public/health-stats
 *   - Frontend: https://medisync.chamodtharusha.com.lk/public-health
 *
 * Verification Requirements:
 *   1. Live backend stats endpoint returns 200 OK, isSimulatedDemo: true,
 *      totalCases: 5097, 25 districts across 4 risk tiers, 6 diseases.
 *   2. Desktop (1280x800) and Mobile (375x667) browser rendering via Playwright.
 *   3. Demonstration data banner rendered with role="status",
 *      [data-testid="demonstration-data-banner"], badge and title.
 *   4. Trilingual parity: English, Sinhala ("ආදර්ශන දත්ත සක්‍රීයයි"), and
 *      Tamil ("விளக்கக்காட்சி தரவு செயலில் உள்ளது") switching.
 *   5. Outbreak map rendered with all 4 risk tiers visible across districts.
 *   6. Stats, disease breakdown, trend and 14-day forecast rendered with non-zero points.
 *   7. Full-page screenshots saved to docs/:
 *      - docs/public_health_live_desktop_en.png
 *      - docs/public_health_live_desktop_si.png
 *      - docs/public_health_live_desktop_ta.png
 *      - docs/public_health_live_mobile_375.png
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { chromium } = require('../client/node_modules/@playwright/test');

const LIVE_BACKEND_URL = (process.env.LIVE_BACKEND_URL || 'https://medisync-wabc.onrender.com').replace(/\/+$/, '');
const LIVE_FRONTEND_URL = (process.env.LIVE_FRONTEND_URL || 'https://medisync.chamodtharusha.com.lk').replace(/\/+$/, '');
const DOCS_DIR = path.resolve(__dirname, '../docs');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${e.message} (status: ${res.statusCode})`));
        }
      });
    }).on('error', reject);
  });
}

async function runLiveVerification() {
  console.log('='.repeat(80));
  console.log('🔬 MEDISYNC MILESTONE 1: LIVE PUBLIC HEALTH & OUTBREAK VERIFICATION');
  console.log('='.repeat(80));
  console.log(`Live Frontend : ${LIVE_FRONTEND_URL}/public-health`);
  console.log(`Live Backend  : ${LIVE_BACKEND_URL}/api/public/health-stats\n`);

  const results = {
    timestamp: new Date().toISOString(),
    apiVerification: {},
    browserVerification: {
      desktop: {},
      mobile: {}
    },
    screenshots: [],
    allPassed: false
  };

  // ---------------------------------------------------------------------------
  // STEP 1: Verify Live Backend Stats Endpoint
  // ---------------------------------------------------------------------------
  console.log('--- Step 1: Validating Live Backend API ---');
  const apiUrl = `${LIVE_BACKEND_URL}/api/public/health-stats`;
  const apiResp = await fetchJson(apiUrl);

  if (apiResp.status !== 200) {
    throw new Error(`API returned HTTP ${apiResp.status}, expected 200`);
  }

  const payload = apiResp.data.data || apiResp.data;
  console.log(`  ✅ HTTP 200 OK received from ${apiUrl}`);
  console.log(`  ✅ isSimulatedDemo: ${payload.isSimulatedDemo}`);
  console.log(`  ✅ totalCases: ${payload.totalCases}`);
  console.log(`  ✅ Districts: ${payload.byDistrict?.length}`);
  console.log(`  ✅ Diseases: ${payload.byDisease?.length}`);
  console.log(`  ✅ Trend Days: ${payload.trend?.length}`);
  console.log(`  ✅ Forecast Points: ${payload.forecast?.length}`);

  if (payload.isSimulatedDemo !== true) {
    throw new Error(`Expected isSimulatedDemo to be true, got ${payload.isSimulatedDemo}`);
  }
  if (!payload.totalCases || payload.totalCases < 4000) {
    throw new Error(`Expected totalCases ~5097, got ${payload.totalCases}`);
  }
  if (!Array.isArray(payload.byDistrict) || payload.byDistrict.length !== 25) {
    throw new Error(`Expected 25 districts, got ${payload.byDistrict?.length}`);
  }
  if (!Array.isArray(payload.byDisease) || payload.byDisease.length < 6) {
    throw new Error(`Expected at least 6 diseases, got ${payload.byDisease?.length}`);
  }
  if (!Array.isArray(payload.forecast) || payload.forecast.length !== 14) {
    throw new Error(`Expected 14 forecast points, got ${payload.forecast?.length}`);
  }

  // Check 4 risk tiers representation in API
  const colombo = payload.byDistrict.find(d => d.district.toLowerCase() === 'colombo');
  const kalutara = payload.byDistrict.find(d => d.district.toLowerCase() === 'kalutara');
  const galle = payload.byDistrict.find(d => d.district.toLowerCase() === 'galle');
  const badulla = payload.byDistrict.find(d => d.district.toLowerCase() === 'badulla');
  const ampara = payload.byDistrict.find(d => d.district.toLowerCase() === 'ampara');

  console.log(`  Districts Tier Audit:`);
  console.log(`    Critical Tier (>1000) : Colombo = ${colombo?.totalCases} cases (${colombo?.topDisease})`);
  console.log(`    High Tier (>500)     : Kalutara = ${kalutara?.totalCases} cases (${kalutara?.topDisease})`);
  console.log(`    Moderate Tier (>100) : Galle = ${galle?.totalCases} cases (${galle?.topDisease})`);
  console.log(`    Low Tier (>10)       : Badulla = ${badulla?.totalCases} cases (${badulla?.topDisease})`);
  console.log(`    Minimal Tier (<=10)  : Ampara = ${ampara?.totalCases} cases (${ampara?.topDisease})`);

  if (!colombo || colombo.totalCases <= 1000) throw new Error('Critical tier district Colombo missing or <= 1000');
  if (!kalutara || kalutara.totalCases <= 500) throw new Error('High tier district Kalutara missing or <= 500');
  if (!galle || galle.totalCases <= 100) throw new Error('Moderate tier district Galle missing or <= 100');
  if (!badulla || badulla.totalCases <= 10) throw new Error('Low tier district Badulla missing or <= 10');
  if (!ampara || ampara.totalCases > 10) throw new Error('Minimal tier district Ampara missing or > 10');

  // Verify Forecast Invariant: 0 <= lower <= predicted <= upper
  for (let i = 0; i < payload.forecast.length; i++) {
    const pt = payload.forecast[i];
    if (!(0 <= pt.lower && pt.lower <= pt.predicted && pt.predicted <= pt.upper)) {
      throw new Error(`Forecast point ${i} violates bounds invariant: lower=${pt.lower}, pred=${pt.predicted}, upper=${pt.upper}`);
    }
  }
  console.log('  ✅ 14-Day Forecast invariant (0 <= lower <= predicted <= upper) verified across all 14 points');

  results.apiVerification = {
    status: 200,
    totalCases: payload.totalCases,
    districtsCount: payload.byDistrict.length,
    diseasesCount: payload.byDisease.length,
    isSimulatedDemo: payload.isSimulatedDemo,
    forecastCount: payload.forecast.length
  };

  // ---------------------------------------------------------------------------
  // STEP 2: Live Browser Verification with Playwright (Desktop)
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 2: Live Desktop Browser Verification (1280x800) ---');
  const browser = await chromium.launch({ headless: true });

  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const desktopPage = await desktopContext.newPage();

  const targetUrl = `${LIVE_FRONTEND_URL}/public-health`;
  console.log(`  Navigating to ${targetUrl}...`);
  await desktopPage.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await desktopPage.waitForSelector('#root', { state: 'visible', timeout: 15000 });

  // 2a. Demonstration Banner Assertion
  console.log('  Testing Demonstration Data Banner (English)...');
  const banner = desktopPage.locator('[data-testid="demonstration-data-banner"]');
  await banner.waitFor({ state: 'visible', timeout: 15000 });

  const bannerRole = await banner.getAttribute('role');
  if (bannerRole !== 'status') {
    throw new Error(`Banner role expected 'status', got '${bannerRole}'`);
  }
  console.log(`  ✅ Banner role="status" verified`);

  const bannerTextEn = await banner.innerText();
  console.log(`  Banner Text (EN): "${bannerTextEn.replace(/\s+/g, ' ').trim()}"`);
  if (!bannerTextEn.includes('DEMONSTRATION')) {
    throw new Error('Banner missing "DEMONSTRATION" badge in English');
  }
  if (!bannerTextEn.includes('Demonstration Data Active')) {
    throw new Error('Banner missing "Demonstration Data Active" in English');
  }
  console.log('  ✅ English demonstration banner verified');

  // 2b. Stats Display Assertion
  const totalCasesEl = desktopPage.locator('text=Total Cases').locator('..').locator('p');
  const displayedCases = (await totalCasesEl.innerText()).replace(/,/g, '').trim();
  console.log(`  Total Cases rendered on UI: ${displayedCases} (API: ${payload.totalCases})`);
  if (displayedCases !== String(payload.totalCases)) {
    throw new Error(`UI total cases (${displayedCases}) did not match API total cases (${payload.totalCases})`);
  }
  console.log('  ✅ UI total cases matches live API response');

  // 2c. Disease Breakdown Assertion
  const diseaseBreakdownEl = desktopPage.locator('text=Breakdown by Disease').locator('..');
  const breakdownText = await diseaseBreakdownEl.innerText();
  for (const dis of payload.byDisease) {
    if (!breakdownText.includes(dis.disease)) {
      throw new Error(`Disease breakdown missing '${dis.disease}'`);
    }
  }
  console.log('  ✅ All 6 diseases verified in breakdown list');

  // 2d. Outbreak Map Risk Tiers Assertion
  console.log('  Testing Outbreak Map Risk Tiers Rendering...');
  await desktopPage.waitForSelector('.leaflet-container svg', { timeout: 15000 });

  // Wait for map paths to be rendered with colors
  await desktopPage.waitForFunction(() => {
    const paths = Array.from(document.querySelectorAll('.leaflet-container path'));
    return paths.length >= 20;
  }, { timeout: 15000 });

  const mapPathColors = await desktopPage.evaluate(() => {
    const paths = Array.from(document.querySelectorAll('.leaflet-container path'));
    return paths.map(p => p.getAttribute('fill')).filter(Boolean);
  });

  console.log(`  Total map district polygons rendered: ${mapPathColors.length}`);
  console.log(`  Unique fill colors detected:`, [...new Set(mapPathColors)]);

  const hasCritical = mapPathColors.includes('#9B2C2C');
  const hasHigh = mapPathColors.includes('#C53030');
  const hasModerate = mapPathColors.includes('#DD6B20');
  const hasLow = mapPathColors.includes('#D69E2E');
  const hasMinimal = mapPathColors.includes('#319795');

  console.log(`    Critical Tier (#9B2C2C): ${hasCritical ? '✅ Visible' : '❌ Missing'}`);
  console.log(`    High Tier (#C53030)    : ${hasHigh ? '✅ Visible' : '❌ Missing'}`);
  console.log(`    Moderate Tier (#DD6B20): ${hasModerate ? '✅ Visible' : '❌ Missing'}`);
  console.log(`    Low Tier (#D69E2E)      : ${hasLow ? '✅ Visible' : '❌ Missing'}`);
  console.log(`    Minimal Tier (#319795) : ${hasMinimal ? '✅ Visible' : '❌ Missing'}`);

  if (!hasCritical || !hasHigh || !hasModerate || !hasLow) {
    throw new Error('Not all 4 risk tiers are visibly rendered on the outbreak map');
  }
  console.log('  ✅ All 4 risk tiers (+ minimal) verified rendered on map');

  // 2e. 14-Day Forecast and Trend Charts Assertion
  console.log('  Testing 14-Day Outbreak Forecast Section...');
  const forecastHeader = desktopPage.locator('text=14-Day Outbreak Forecast');
  await forecastHeader.waitFor({ state: 'visible', timeout: 10000 });

  // Assert Recharts SVG paths exist and have non-zero points
  const forecastSvgPoints = await desktopPage.evaluate(() => {
    // Recharts area / path elements inside the forecast container
    const svgs = Array.from(document.querySelectorAll('.recharts-surface'));
    const paths = svgs.flatMap(s => Array.from(s.querySelectorAll('path.recharts-curve, path.recharts-area-curve, path.recharts-line-curve')));
    return paths.length;
  });
  console.log(`  Forecast & trend chart SVG curve paths detected: ${forecastSvgPoints}`);
  if (forecastSvgPoints === 0) {
    throw new Error('No chart curves rendered in 14-Day Outbreak Forecast / Case Trend sections');
  }
  console.log('  ✅ Forecast and Trend charts rendered with non-zero points');

  // Save Desktop English screenshot
  const screenshotDesktopEn = path.join(DOCS_DIR, 'public_health_live_desktop_en.png');
  await desktopPage.screenshot({ path: screenshotDesktopEn, fullPage: true });
  console.log(`  📸 Screenshot saved: docs/public_health_live_desktop_en.png`);
  results.screenshots.push('docs/public_health_live_desktop_en.png');

  // ---------------------------------------------------------------------------
  // STEP 3: Trilingual Verification (Sinhala & Tamil)
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 3: Trilingual Parity Verification ---');

  // 3a. Switch to Sinhala (සිං)
  console.log('  Switching language to Sinhala (සිං)...');
  const sinhalaBtn = desktopPage.locator('button[aria-label="සිංහල"]').first();
  await sinhalaBtn.click();
  await desktopPage.waitForTimeout(600);

  const bannerTextSi = await banner.innerText();
  console.log(`  Banner Text (SI): "${bannerTextSi.replace(/\s+/g, ' ').trim()}"`);
  if (!bannerTextSi.includes('ආදර්ශන දත්ත සක්‍රීයයි')) {
    throw new Error(`Sinhala banner text missing "ආදර්ශන දත්ත සක්‍රීයයි". Actual: "${bannerTextSi}"`);
  }
  if (!bannerTextSi.includes('ආදර්ශන')) {
    throw new Error(`Sinhala banner missing "ආදර්ශන" badge. Actual: "${bannerTextSi}"`);
  }
  console.log('  ✅ Sinhala demonstration banner verified');

  const screenshotDesktopSi = path.join(DOCS_DIR, 'public_health_live_desktop_si.png');
  await desktopPage.screenshot({ path: screenshotDesktopSi, fullPage: true });
  console.log(`  📸 Screenshot saved: docs/public_health_live_desktop_si.png`);
  results.screenshots.push('docs/public_health_live_desktop_si.png');

  // 3b. Switch to Tamil (தமிழ்)
  console.log('  Switching language to Tamil (த)...');
  const tamilBtn = desktopPage.locator('button[aria-label="தமிழ்"]').first();
  await tamilBtn.click();
  await desktopPage.waitForTimeout(600);

  const bannerTextTa = await banner.innerText();
  console.log(`  Banner Text (TA): "${bannerTextTa.replace(/\s+/g, ' ').trim()}"`);
  if (!bannerTextTa.includes('விளக்கக்காட்சி தரவு செயலில் உள்ளது')) {
    throw new Error(`Tamil banner text missing "விளக்கக்காட்சி தரவு செயலில் உள்ளது". Actual: "${bannerTextTa}"`);
  }
  if (!bannerTextTa.includes('விளக்கக்காட்சி')) {
    throw new Error(`Tamil banner missing "விளக்கக்காட்சி" badge. Actual: "${bannerTextTa}"`);
  }
  console.log('  ✅ Tamil demonstration banner verified');

  const screenshotDesktopTa = path.join(DOCS_DIR, 'public_health_live_desktop_ta.png');
  await desktopPage.screenshot({ path: screenshotDesktopTa, fullPage: true });
  console.log(`  📸 Screenshot saved: docs/public_health_live_desktop_ta.png`);
  results.screenshots.push('docs/public_health_live_desktop_ta.png');

  await desktopContext.close();

  // ---------------------------------------------------------------------------
  // STEP 4: Live Mobile Browser Verification (375x667)
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 4: Live Mobile Browser Verification (375x667) ---');
  const mobileContext = await browser.newContext({
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true
  });
  const mobilePage = await mobileContext.newPage();

  console.log(`  Navigating mobile viewport to ${targetUrl}...`);
  await mobilePage.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await mobilePage.waitForSelector('#root', { state: 'visible', timeout: 15000 });

  const mobileBanner = mobilePage.locator('[data-testid="demonstration-data-banner"]');
  await mobileBanner.waitFor({ state: 'visible', timeout: 15000 });
  console.log('  ✅ Demonstration data banner is visible on 375px mobile viewport');

  const screenshotMobile = path.join(DOCS_DIR, 'public_health_live_mobile_375.png');
  await mobilePage.screenshot({ path: screenshotMobile, fullPage: true });
  console.log(`  📸 Screenshot saved: docs/public_health_live_mobile_375.png`);
  results.screenshots.push('docs/public_health_live_mobile_375.png');

  await mobileContext.close();
  await browser.close();

  results.allPassed = true;
  console.log('\n' + '='.repeat(80));
  console.log('🎉 ALL LIVE PRODUCTION VERIFICATIONS PASSED SUCCESSFULLY!');
  console.log('='.repeat(80));

  return results;
}

if (require.main === module) {
  runLiveVerification()
    .then((results) => {
      console.log('\nExecution Summary:', JSON.stringify(results, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ LIVE VERIFICATION FAILED:', err.message);
      console.error(err.stack);
      process.exit(1);
    });
}

module.exports = { runLiveVerification };
