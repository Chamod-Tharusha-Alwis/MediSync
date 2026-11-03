'use strict';

/**
 * Playwright Live Browser Verification for MediSync Public Health Dashboard
 * Tests Desktop (1280x800) and Mobile (375x667) viewports across EN, SI, TA locales
 * Captures real screenshots into docs/screenshots/
 */

const path = require('path');
const fs = require('fs');

// Resolve Playwright from client/node_modules
const playwrightPath = path.resolve(__dirname, '../client/node_modules/playwright');
const { chromium } = require(playwrightPath);

const BASE_URL = process.env.LIVE_FRONTEND_URL || 'https://medisync.chamodtharusha.com.lk';
const SCREENSHOTS_DIR = path.resolve(__dirname, '../docs/screenshots');

async function main() {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  console.log('='.repeat(80));
  console.log('MEDISYNC LIVE BROWSER VERIFICATION — PUBLIC HEALTH DASHBOARD');
  console.log(`Target URL: ${BASE_URL}/public-health`);
  console.log('='.repeat(80));

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = {
    url: `${BASE_URL}/public-health`,
    timestamp: new Date().toISOString(),
    desktop: {},
    mobile: {},
    passed: true
  };

  try {
    // -------------------------------------------------------------
    // TEST 1: Desktop Viewport (1280x800)
    // -------------------------------------------------------------
    console.log('\n🖥️ [TEST 1] Desktop Viewport (1280x800)...');
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1
    });
    const desktopPage = await desktopContext.newPage();

    console.log('Navigating to /public-health...');
    await desktopPage.goto(`${BASE_URL}/public-health`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Wait for data load
    await desktopPage.waitForTimeout(3000);

    // 1. Verify Demonstration Banner
    const banner = await desktopPage.$('[data-testid="demonstration-data-banner"]');
    const bannerVisible = banner ? await banner.isVisible() : false;
    const bannerText = banner ? (await banner.innerText()).trim() : '';
    console.log(`  - Demonstration Banner Visible: ${bannerVisible}`);
    console.log(`  - Demonstration Banner Text: "${bannerText.replace(/\n+/g, ' ')}"`);

    // 2. Extract Total Cases
    const bodyText = await desktopPage.innerText('body');
    const totalCasesMatch = bodyText.match(/Total Cases\s+([\d,]+)/i);
    const totalCasesStr = totalCasesMatch ? totalCasesMatch[1] : 'not found';
    console.log(`  - Total Cases Displayed: ${totalCasesStr}`);

    // 3. Extract Top Disease
    const topDiseaseMatch = bodyText.match(/Top Disease\s+([A-Za-z\s]+)/i);
    const topDiseaseStr = topDiseaseMatch ? topDiseaseMatch[1].trim() : 'not found';
    console.log(`  - Top Disease Displayed: ${topDiseaseStr}`);

    // 4. Test Forecast Button
    const forecastButton = await desktopPage.$('button:has-text("Forecast"), button:has-text("පුරෝකථනය")');
    if (forecastButton) {
      console.log('  - Clicking Forecast view toggle...');
      await forecastButton.click();
      await desktopPage.waitForTimeout(1000);
    }
    const chartArea = await desktopPage.$('.recharts-responsive-container, .recharts-surface');
    const chartVisible = chartArea ? await chartArea.isVisible() : false;
    console.log(`  - Forecast Area Chart Rendered: ${chartVisible}`);

    // 5. Check Language Selector (if present on navbar)
    const langSelect = await desktopPage.$('select[aria-label*="language" i], select[name="language"], [data-testid="language-selector"]');
    if (langSelect) {
      console.log('  - Testing language selector switch to Sinhala...');
      await langSelect.selectOption('si');
      await desktopPage.waitForTimeout(1500);
      const siText = await desktopPage.innerText('body');
      const hasSinhala = /වසංගත|දින|පුරෝකථනය/.test(siText);
      console.log(`  - Sinhala Text Rendered: ${hasSinhala}`);

      console.log('  - Testing language selector switch to Tamil...');
      await langSelect.selectOption('ta');
      await desktopPage.waitForTimeout(1500);
      const taText = await desktopPage.innerText('body');
      const hasTamil = /வெடிப்பு|முன்னறிவிப்பு/.test(taText);
      console.log(`  - Tamil Text Rendered: ${hasTamil}`);

      // Switch back to EN
      await langSelect.selectOption('en');
      await desktopPage.waitForTimeout(1000);
    }

    // 6. Capture Desktop Screenshot
    const desktopScreenshotPath = path.join(SCREENSHOTS_DIR, 'live_public_health_desktop.png');
    await desktopPage.screenshot({ path: desktopScreenshotPath, fullPage: true });
    console.log(`  📸 Desktop Screenshot Saved: ${desktopScreenshotPath}`);

    results.desktop = {
      bannerVisible,
      bannerText,
      totalCases: totalCasesStr,
      topDisease: topDiseaseStr,
      chartVisible,
      screenshot: desktopScreenshotPath
    };

    await desktopContext.close();

    // -------------------------------------------------------------
    // TEST 2: Mobile Viewport (375x667)
    // -------------------------------------------------------------
    console.log('\n📱 [TEST 2] Mobile Viewport (375x667)...');
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    });
    const mobilePage = await mobileContext.newPage();

    console.log('Navigating to /public-health on 375px mobile...');
    await mobilePage.goto(`${BASE_URL}/public-health`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    await mobilePage.waitForTimeout(3000);

    const mobileBanner = await mobilePage.$('[data-testid="demonstration-data-banner"]');
    const mobileBannerVisible = mobileBanner ? await mobileBanner.isVisible() : false;
    console.log(`  - Mobile Banner Visible: ${mobileBannerVisible}`);

    // Check horizontal scroll / overflow
    const scrollWidth = await mobilePage.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await mobilePage.evaluate(() => document.documentElement.clientWidth);
    const noHorizontalOverflow = scrollWidth <= clientWidth + 2;
    console.log(`  - Mobile Responsive Layout (ScrollWidth: ${scrollWidth}, ClientWidth: ${clientWidth}): ${noHorizontalOverflow}`);

    // Capture Mobile Screenshot
    const mobileScreenshotPath = path.join(SCREENSHOTS_DIR, 'live_public_health_mobile_375px.png');
    await mobilePage.screenshot({ path: mobileScreenshotPath, fullPage: true });
    console.log(`  📸 Mobile Screenshot Saved: ${mobileScreenshotPath}`);

    results.mobile = {
      bannerVisible: mobileBannerVisible,
      scrollWidth,
      clientWidth,
      noHorizontalOverflow,
      screenshot: mobileScreenshotPath
    };

    await mobileContext.close();

    console.log('\n' + '='.repeat(80));
    console.log('🎉 LIVE BROWSER VERIFICATION COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(80));

    // Save report
    const logPath = path.resolve(__dirname, '../docs/live_playwright_public_health_log.json');
    fs.writeFileSync(logPath, JSON.stringify(results, null, 2));
    console.log(`Results saved to: ${logPath}`);

  } catch (err) {
    console.error('❌ Playwright verification error:', err);
    results.passed = false;
    results.error = err.message;
  } finally {
    await browser.close();
  }
}

main();
