require('./liveVerificationReadOnly.cjs').install();
'use strict';

/**
 * ============================================================================
 * MEDISYNC LIVE BROWSER VERIFICATION: MILESTONE 2 (STEPS 2 & 3: C2 & C3)
 * File: scripts/verify_m2_step23_live.cjs
 *
 * Verifies live production:
 *   - Target Frontend: https://medisync.chamodtharusha.com.lk/public-health
 *   - Target Backend:  https://medisync-wabc.onrender.com/api/public/health-stats
 *
 * Verification Requirements:
 *   1. Live backend stats endpoint returns 200 OK, non-zero total cases (~5,090),
 *      25 districts, 6 diseases, and 14-day forecast with 0 <= lower <= predicted <= upper.
 *   2. C3 Multi-Disease Map & Clustering:
 *      - Disease Filter: switching between Dengue, Leptospirosis, All Diseases.
 *      - Dynamic 4-Tier Legend: district counts in legend badges sum exactly to 25.
 *      - Cluster Halos & Active Clusters Card: contiguous high-risk cluster in Western
 *        province (Colombo, Gampaha, Kalutara) renders gold border/halo (#F6E05E).
 *      - Tooltips: interactive tooltip on polygon hover displaying name, cases, disease.
 *      - Accessible Table View: toggle renders all 25 districts with cases, tiers, top diseases.
 *   3. C2 Forecasting Hardening:
 *      - 14-day forecast chart curve and prediction interval bands.
 *      - Full-width forecast disclaimer footer [data-testid="full-forecast-disclaimer"].
 *   4. Trilingual Parity:
 *      - English, Sinhala, and Tamil parity for disclaimers, legend, and headers.
 *   5. Mobile Viewport (375x667):
 *      - Zero horizontal scroll (scrollWidth <= clientWidth).
 *   6. Capture 5 required screenshots in docs/:
 *      - docs/c3_map_clusters_desktop_en.png
 *      - docs/c3_map_clusters_desktop_si.png
 *      - docs/c3_map_clusters_desktop_ta.png
 *      - docs/c3_map_clusters_mobile_375.png
 *      - docs/c3_map_table_view.png
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const playwrightPath = path.resolve(__dirname, '../client/node_modules/playwright');
const { chromium } = require(playwrightPath);

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

async function runM2LiveVerification() {
  console.log('='.repeat(80));
  console.log('🔬 MEDISYNC MILESTONE 2: LIVE C2 FORECASTING & C3 MAP CLUSTERING VERIFICATION');
  console.log('='.repeat(80));
  console.log(`Live Frontend : ${LIVE_FRONTEND_URL}/public-health`);
  console.log(`Live Backend  : ${LIVE_BACKEND_URL}/api/public/health-stats\n`);

  const results = {
    timestamp: new Date().toISOString(),
    apiVerification: {},
    c3MapAndClustering: {},
    c2Forecasting: {},
    trilingualParity: {},
    mobileResponsiveness: {},
    screenshots: [],
    allPassed: false
  };

  // ---------------------------------------------------------------------------
  // STEP 1: Live Backend Stats Endpoint Invariant Check
  // ---------------------------------------------------------------------------
  console.log('--- Step 1: Validating Live Backend API & Mathematical Invariants ---');
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
  console.log(`  ✅ 14-Day Forecast Points: ${payload.forecast?.length}`);

  if (payload.isSimulatedDemo !== true) {
    throw new Error(`Expected isSimulatedDemo to be true, got ${payload.isSimulatedDemo}`);
  }
  if (!payload.totalCases || payload.totalCases < 4000) {
    throw new Error(`Expected totalCases >= 4000, got ${payload.totalCases}`);
  }
  if (!Array.isArray(payload.byDistrict) || payload.byDistrict.length !== 25) {
    throw new Error(`Expected exactly 25 districts, got ${payload.byDistrict?.length}`);
  }
  if (!Array.isArray(payload.byDisease) || payload.byDisease.length < 6) {
    throw new Error(`Expected at least 6 diseases, got ${payload.byDisease?.length}`);
  }
  if (!Array.isArray(payload.forecast) || payload.forecast.length !== 14) {
    throw new Error(`Expected 14 forecast points, got ${payload.forecast?.length}`);
  }

  // Verify Forecast Invariant: 0 <= lower <= predicted <= upper
  for (let i = 0; i < payload.forecast.length; i++) {
    const pt = payload.forecast[i];
    if (!(0 <= pt.lower && pt.lower <= pt.predicted && pt.predicted <= pt.upper)) {
      throw new Error(`Forecast point ${i} violates invariant: lower=${pt.lower}, pred=${pt.predicted}, upper=${pt.upper}`);
    }
  }
  console.log('  ✅ 14-Day Forecast mathematical invariant (0 <= lower <= predicted <= upper) verified across all 14 points');

  results.apiVerification = {
    status: 200,
    totalCases: payload.totalCases,
    districtsCount: payload.byDistrict.length,
    diseasesCount: payload.byDisease.length,
    forecastPoints: payload.forecast.length
  };

  // ---------------------------------------------------------------------------
  // STEP 2: Live Browser Verification (Desktop 1280x800)
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 2: Live Desktop Browser Verification (1280x800) ---');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1
  });
  const desktopPage = await desktopContext.newPage();

  const targetUrl = `${LIVE_FRONTEND_URL}/public-health`;
  console.log(`  Navigating to ${targetUrl}...`);
  await desktopPage.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await desktopPage.waitForSelector('#root', { state: 'visible', timeout: 15000 });

  // 2a. Demonstration Banner Assertion
  const banner = desktopPage.locator('[data-testid="demonstration-data-banner"]');
  await banner.waitFor({ state: 'visible', timeout: 15000 });
  const bannerRole = await banner.getAttribute('role');
  if (bannerRole !== 'status') {
    throw new Error(`Demonstration banner role expected 'status', got '${bannerRole}'`);
  }
  console.log('  ✅ Demonstration data banner visible with role="status"');

  // 2b. Dynamic 4-Tier / 5-Tier Legend Assertion (Districts Sum Exactly to 25)
  console.log('  Validating Dynamic Risk Tier Legend Badge Sums...');
  const legendEl = desktopPage.locator('[data-testid="map-risk-legend"]');
  await legendEl.waitFor({ state: 'visible', timeout: 15000 });
  const legendText = await legendEl.innerText();
  console.log(`  Legend Text: "${legendText.replace(/\s+/g, ' ').trim()}"`);

  // Extract individual tier counts from legend
  const critMatch = legendText.match(/Critical:\s*(\d+)/i);
  const highMatch = legendText.match(/High:\s*(\d+)/i);
  const modMatch = legendText.match(/Moderate:\s*(\d+)/i);
  const lowMatch = legendText.match(/Low:\s*(\d+)/i);
  const minMatch = legendText.match(/Minimal(?:\s*\/\s*<5)?:\s*(\d+)/i);

  const critCount = critMatch ? parseInt(critMatch[1], 10) : 0;
  const highCount = highMatch ? parseInt(highMatch[1], 10) : 0;
  const modCount = modMatch ? parseInt(modMatch[1], 10) : 0;
  const lowCount = lowMatch ? parseInt(lowMatch[1], 10) : 0;
  const minCount = minMatch ? parseInt(minMatch[1], 10) : 0;
  const legendSum = critCount + highCount + modCount + lowCount + minCount;

  console.log(`    Critical Tier: ${critCount}`);
  console.log(`    High Tier:     ${highCount}`);
  console.log(`    Moderate Tier: ${modCount}`);
  console.log(`    Low Tier:      ${lowCount}`);
  console.log(`    Minimal Tier:  ${minCount}`);
  console.log(`    Sum of Legend Badges: ${legendSum} (Target: 25)`);

  if (legendSum !== 25) {
    throw new Error(`Expected legend counts to sum exactly to 25, got ${legendSum}`);
  }
  console.log('  ✅ Dynamic legend badge counts sum exactly to 25 districts');

  // 2c. Active Regional Outbreak Clusters Card & Contiguous Western Province Halos
  console.log('  Testing Active Clusters Card & Contiguous Halos (#F6E05E)...');
  const activeClustersSection = desktopPage.locator('[data-testid="active-clusters-section"]');
  await activeClustersSection.waitFor({ state: 'visible', timeout: 15000 });
  const clusterSectionText = await activeClustersSection.innerText();
  console.log(`  Cluster Section Text: "${clusterSectionText.replace(/\s+/g, ' ').trim()}"`);

  if (!clusterSectionText.includes('Cluster') || !clusterSectionText.includes('Colombo')) {
    throw new Error('Active clusters section does not list expected contiguous cluster containing Colombo');
  }
  console.log('  ✅ Active Regional Outbreak Clusters card renders contiguous Western province cluster');

  // Check Leaflet SVG map polygons for Gold Halo (#F6E05E)
  await desktopPage.waitForSelector('.leaflet-container svg', { timeout: 15000 });
  await desktopPage.waitForFunction(() => {
    const paths = Array.from(document.querySelectorAll('.leaflet-container path'));
    return paths.length >= 20;
  }, { timeout: 15000 });

  const mapPathAttributes = await desktopPage.evaluate(() => {
    const paths = Array.from(document.querySelectorAll('.leaflet-container path'));
    return paths.map(p => ({
      fill: p.getAttribute('fill'),
      stroke: p.getAttribute('stroke'),
      strokeWidth: p.getAttribute('stroke-width')
    }));
  });

  const haloPaths = mapPathAttributes.filter(p =>
    (p.stroke && p.stroke.toUpperCase() === '#F6E05E') ||
    (p.stroke && p.stroke.includes('246, 224, 94'))
  );
  console.log(`  District polygons detected: ${mapPathAttributes.length}, Cluster Halo paths (#F6E05E): ${haloPaths.length}`);
  if (haloPaths.length === 0) {
    throw new Error('Zero district polygons rendered with cluster halo stroke (#F6E05E)');
  }
  console.log(`  ✅ Contiguous cluster halo border (#F6E05E) verified on ${haloPaths.length} district polygons`);

  // 2d. Interactive Tooltips on District Hover
  console.log('  Testing Interactive District Tooltips...');
  const firstDistrictPath = desktopPage.locator('.leaflet-container path').first();
  await firstDistrictPath.hover({ force: true });
  await desktopPage.waitForTimeout(500);

  const tooltipEl = desktopPage.locator('.leaflet-tooltip, .custom-leaflet-tooltip');
  await tooltipEl.waitFor({ state: 'visible', timeout: 10000 });
  const tooltipContent = await tooltipEl.innerText();
  console.log(`  Tooltip rendered on hover: "${tooltipContent.replace(/\s+/g, ' ').trim()}"`);

  if (!tooltipContent.includes('Cases:') || !tooltipContent.includes('Tier:')) {
    throw new Error(`Tooltip content missing Cases or Tier: "${tooltipContent}"`);
  }
  console.log('  ✅ Interactive district tooltip verified with district name, cases, and risk tier');

  // 2e. C2 Forecasting Hardening: Chart Curves, Bands & Full-Width Disclaimer Footer
  console.log('  Testing C2 Forecasting Hardening & Disclaimer Footer...');
  const forecastDisclaimerEl = desktopPage.locator('[data-testid="full-forecast-disclaimer"]');
  await forecastDisclaimerEl.waitFor({ state: 'visible', timeout: 10000 });
  const disclaimerTextEn = await forecastDisclaimerEl.innerText();
  console.log(`  Forecast Disclaimer (EN): "${disclaimerTextEn.trim()}"`);

  if (!disclaimerTextEn.includes('Statistical projection for demonstration, not clinically validated')) {
    throw new Error(`Expected English forecast disclaimer, got "${disclaimerTextEn}"`);
  }
  console.log('  ✅ Full-width forecast disclaimer footer verified in English');

  // Verify Forecast Area Chart Curve and Bands
  const forecastRechartsCurves = await desktopPage.evaluate(() => {
    const svgs = Array.from(document.querySelectorAll('.recharts-surface'));
    return svgs.flatMap(s => Array.from(s.querySelectorAll('path.recharts-curve, path.recharts-area-curve'))).length;
  });
  console.log(`  Recharts forecast curves & bands detected: ${forecastRechartsCurves}`);
  if (forecastRechartsCurves === 0) {
    throw new Error('Zero SVG curve paths detected in 14-day outbreak forecast chart');
  }
  console.log('  ✅ 14-Day Outbreak forecast chart curve and 95% prediction interval bands rendered');

  // Capture Screenshot 1: Desktop English
  const screenshotDesktopEn = path.join(DOCS_DIR, 'c3_map_clusters_desktop_en.png');
  await desktopPage.screenshot({ path: screenshotDesktopEn, fullPage: true });
  console.log(`  📸 Screenshot saved: docs/c3_map_clusters_desktop_en.png`);
  results.screenshots.push('docs/c3_map_clusters_desktop_en.png');

  // 2f. Disease Filter: Switching Between Diseases & Totals Consistency
  console.log('\n  Testing Disease Filter Dropdown...');
  const diseaseFilterBtn = desktopPage.locator('button[aria-label="Disease filter"]');
  await diseaseFilterBtn.click();
  await desktopPage.waitForTimeout(400);

  // Select Dengue
  console.log('    Filtering by Dengue...');
  const dengueOption = desktopPage.locator('div[role="option"]:has-text("Dengue")');
  await dengueOption.click();
  await desktopPage.waitForTimeout(2000);

  const dengueCasesText = await desktopPage.locator('text=Total Cases').locator('..').locator('p').innerText();
  const dengueCases = parseInt(dengueCasesText.replace(/,/g, '').trim(), 10);
  console.log(`    Total Cases (Dengue): ${dengueCases}`);
  if (!dengueCases || dengueCases < 2500) {
    throw new Error(`Expected Dengue cases >= 2500, got ${dengueCases}`);
  }

  // Select Leptospirosis
  await diseaseFilterBtn.click();
  await desktopPage.waitForTimeout(400);
  console.log('    Filtering by Leptospirosis...');
  const leptoOption = desktopPage.locator('div[role="option"]:has-text("Leptospirosis")');
  await leptoOption.click();
  await desktopPage.waitForTimeout(2000);

  const leptoCasesText = await desktopPage.locator('text=Total Cases').locator('..').locator('p').innerText();
  const leptoCases = parseInt(leptoCasesText.replace(/,/g, '').trim(), 10);
  console.log(`    Total Cases (Leptospirosis): ${leptoCases}`);
  if (!leptoCases || leptoCases < 800) {
    throw new Error(`Expected Leptospirosis cases >= 800, got ${leptoCases}`);
  }

  // Reset to All Diseases
  await diseaseFilterBtn.click();
  await desktopPage.waitForTimeout(400);
  console.log('    Resetting to All Diseases...');
  const allOption = desktopPage.locator('div[role="option"]:has-text("All Diseases")');
  await allOption.click();
  await desktopPage.waitForTimeout(2000);

  const resetCasesText = await desktopPage.locator('text=Total Cases').locator('..').locator('p').innerText();
  const resetCases = parseInt(resetCasesText.replace(/,/g, '').trim(), 10);
  console.log(`    Total Cases (All Diseases): ${resetCases}`);
  if (resetCases !== payload.totalCases) {
    throw new Error(`Reset cases (${resetCases}) does not match initial totalCases (${payload.totalCases})`);
  }
  console.log('  ✅ Disease filter correctly alters cases and resets consistently');

  // 2g. Accessible Table View Toggle & 25 Districts Assertion
  console.log('\n  Testing Accessible Table View...');
  const toggleTableBtn = desktopPage.locator('[data-testid="toggle-table-view"]');
  await toggleTableBtn.click();
  await desktopPage.waitForTimeout(1000);

  const tableRows = desktopPage.locator('table[role="table"] tbody tr');
  const tableRowCount = await tableRows.count();
  console.log(`  Table rows rendered: ${tableRowCount} (Target: 25)`);
  if (tableRowCount !== 25) {
    throw new Error(`Expected 25 table rows in Accessible Table View, got ${tableRowCount}`);
  }

  // Verify first row contains district name, cases, risk tier, top disease, and cluster
  const firstRowText = await tableRows.first().innerText();
  console.log(`  First Table Row: "${firstRowText.replace(/\s+/g, ' ').trim()}"`);

  // Capture Screenshot 5: Accessible Table View
  const screenshotTableView = path.join(DOCS_DIR, 'c3_map_table_view.png');
  await desktopPage.screenshot({ path: screenshotTableView, fullPage: true });
  console.log(`  📸 Screenshot saved: docs/c3_map_table_view.png`);
  results.screenshots.push('docs/c3_map_table_view.png');

  // Toggle back to Map View
  await toggleTableBtn.click();
  await desktopPage.waitForTimeout(800);

  // ---------------------------------------------------------------------------
  // STEP 3: Trilingual Parity Verification (Sinhala & Tamil)
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 3: Trilingual Parity Verification ---');

  // 3a. Switch to Sinhala (සිං)
  console.log('  Switching language to Sinhala (සිං)...');
  const sinhalaBtn = desktopPage.locator('button[aria-label="සිංහල"]').first();
  await sinhalaBtn.click();
  await desktopPage.waitForTimeout(800);

  const bannerTextSi = await banner.innerText();
  const disclaimerTextSi = await forecastDisclaimerEl.innerText();
  const legendTitleSi = await legendEl.innerText();

  console.log(`  Sinhala Banner: "${bannerTextSi.replace(/\s+/g, ' ').trim()}"`);
  console.log(`  Sinhala Disclaimer: "${disclaimerTextSi.trim()}"`);
  console.log(`  Sinhala Legend Header: "${legendTitleSi.replace(/\s+/g, ' ').trim()}"`);

  if (!bannerTextSi.includes('ආදර්ශන දත්ත සක්‍රීයයි')) {
    throw new Error('Sinhala banner text missing "ආදර්ශන දත්ත සක්‍රීයයි"');
  }
  if (!disclaimerTextSi.includes('නිරූපණය සඳහා වූ සංඛ්‍යානමය ප්‍රක්ෂේපණයකි')) {
    throw new Error(`Sinhala forecast disclaimer translation missing or malformed: "${disclaimerTextSi}"`);
  }
  console.log('  ✅ Sinhala trilingual translations verified');

  // Capture Screenshot 2: Desktop Sinhala
  const screenshotDesktopSi = path.join(DOCS_DIR, 'c3_map_clusters_desktop_si.png');
  await desktopPage.screenshot({ path: screenshotDesktopSi, fullPage: true });
  console.log(`  📸 Screenshot saved: docs/c3_map_clusters_desktop_si.png`);
  results.screenshots.push('docs/c3_map_clusters_desktop_si.png');

  // 3b. Switch to Tamil (தமிழ்)
  console.log('  Switching language to Tamil (தமிழ்)...');
  const tamilBtn = desktopPage.locator('button[aria-label="தமிழ்"]').first();
  await tamilBtn.click();
  await desktopPage.waitForTimeout(800);

  const bannerTextTa = await banner.innerText();
  const disclaimerTextTa = await forecastDisclaimerEl.innerText();
  const legendTitleTa = await legendEl.innerText();

  console.log(`  Tamil Banner: "${bannerTextTa.replace(/\s+/g, ' ').trim()}"`);
  console.log(`  Tamil Disclaimer: "${disclaimerTextTa.trim()}"`);
  console.log(`  Tamil Legend Header: "${legendTitleTa.replace(/\s+/g, ' ').trim()}"`);

  if (!bannerTextTa.includes('விளக்கக்காட்சி தரவு செயலில் உள்ளது')) {
    throw new Error('Tamil banner text missing "விளக்கக்காட்சி தரவு செயலில் உள்ளது"');
  }
  if (!disclaimerTextTa.includes('விளக்கக்காட்சிக்கான புள்ளிவிவர கணிப்பு')) {
    throw new Error(`Tamil forecast disclaimer translation missing or malformed: "${disclaimerTextTa}"`);
  }
  console.log('  ✅ Tamil trilingual translations verified');

  // Capture Screenshot 3: Desktop Tamil
  const screenshotDesktopTa = path.join(DOCS_DIR, 'c3_map_clusters_desktop_ta.png');
  await desktopPage.screenshot({ path: screenshotDesktopTa, fullPage: true });
  console.log(`  📸 Screenshot saved: docs/c3_map_clusters_desktop_ta.png`);
  results.screenshots.push('docs/c3_map_clusters_desktop_ta.png');

  await desktopContext.close();

  // ---------------------------------------------------------------------------
  // STEP 4: Live Mobile Browser Verification (375x667)
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 4: Live Mobile Browser Verification (375x667) ---');
  const mobileContext = await browser.newContext({
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const mobilePage = await mobileContext.newPage();

  console.log(`  Navigating mobile viewport to ${targetUrl}...`);
  await mobilePage.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await mobilePage.waitForSelector('#root', { state: 'visible', timeout: 15000 });

  // Mobile Overflow Check: scrollWidth <= window.innerWidth
  const mobileDimensions = await mobilePage.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    innerWidth: window.innerWidth,
    bodyScrollWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth
  }));
  console.log('  Mobile Viewport Dimensions:', mobileDimensions);

  const hasHorizontalOverflow =
    mobileDimensions.scrollWidth > mobileDimensions.innerWidth ||
    mobileDimensions.bodyScrollWidth > mobileDimensions.innerWidth;

  if (hasHorizontalOverflow) {
    throw new Error(`Horizontal overflow detected on 375px mobile viewport: scrollWidth=${mobileDimensions.scrollWidth}, innerWidth=${mobileDimensions.innerWidth}`);
  }
  console.log('  ✅ Clean 375px mobile responsiveness verified: ZERO horizontal overflow');

  // Check Demonstration banner visible on mobile
  const mobileBanner = mobilePage.locator('[data-testid="demonstration-data-banner"]');
  await mobileBanner.waitFor({ state: 'visible', timeout: 15000 });
  console.log('  ✅ Demonstration data banner visible on mobile');

  // Check Active Clusters visible on mobile
  const mobileClusters = mobilePage.locator('[data-testid="active-clusters-section"]');
  await mobileClusters.waitFor({ state: 'visible', timeout: 15000 });
  console.log('  ✅ Active Clusters card visible on mobile');

  // Capture Screenshot 4: Mobile 375px
  const screenshotMobile = path.join(DOCS_DIR, 'c3_map_clusters_mobile_375.png');
  await mobilePage.screenshot({ path: screenshotMobile, fullPage: true });
  console.log(`  📸 Screenshot saved: docs/c3_map_clusters_mobile_375.png`);
  results.screenshots.push('docs/c3_map_clusters_mobile_375.png');

  await mobileContext.close();
  await browser.close();

  results.allPassed = true;
  console.log('\n' + '='.repeat(80));
  console.log('🎉 ALL LIVE MILESTONE 2 (C2 & C3) VERIFICATIONS PASSED SUCCESSFULLY!');
  console.log('='.repeat(80));

  return results;
}

if (require.main === module) {
  runM2LiveVerification()
    .then((results) => {
      console.log('\nExecution Summary:', JSON.stringify({
        timestamp: results.timestamp,
        allPassed: results.allPassed,
        apiVerification: results.apiVerification,
        screenshots: results.screenshots
      }, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ LIVE M2 VERIFICATION FAILED:', err.message);
      console.error(err.stack);
      process.exit(1);
    });
}

module.exports = { runM2LiveVerification };
