// Non-mutating page-load verification only. Never run logins or API workflows here.
const { chromium } = require('@playwright/test');

async function main() {
  const base = 'http://127.0.0.1:3100';
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const blocked = [];
    const blockedOrigins = new Set();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    await page.route('**/*', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== base || !['GET', 'HEAD'].includes(request.method()) ||
          url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) {
        blocked.push(`${request.method()} ${url.origin}${url.pathname}`);
        blockedOrigins.add(url.origin);
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    for (const path of ['/', '/select-role', '/register', '/doctors']) {
      const response = await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.locator('#root').waitFor({ state: 'visible', timeout: 10000 });
      await page.waitForTimeout(500);
      const length = (await page.locator('#root').innerText()).trim().length;
      if (response.status() !== 200 || length < 40) throw new Error(`${path} did not render usable React content`);
      console.log(`[QA_PAGE] ${path} HTTP ${response.status()} | renderedText=${length}`);
    }
    console.log(`[QA_PAGE_GUARD] blocked=${blocked.length} | origins=${Array.from(blockedOrigins).sort().join(',')} | pageErrors=${pageErrors.length}`);
    if (pageErrors.length) throw new Error(`React page errors: ${pageErrors.join(' | ')}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => { console.error('[QA_PAGE_FAILED]', err.message); process.exitCode = 1; });
