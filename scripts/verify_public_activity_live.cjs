'use strict';
const kept = new Set(['SYSTEMROOT','WINDIR','PATH','PATHEXT','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PROGRAMFILES','PROGRAMFILES(X86)','SYSTEMDRIVE']);
for (const key of Object.keys(process.env)) if (!kept.has(key.toUpperCase())) delete process.env[key];
const policy = require('./liveVerificationReadOnly.cjs').install();
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const FRONT = 'https://medisync.chamodtharusha.com.lk', API = 'https://medisync-wabc.onrender.com';
const unavailableLabels = { en: 'Not available', si: 'ලබාගත නොහැක', ta: 'கிடைக்கவில்லை' };
const captions = {
  en: 'One visit is one saved consultation record, not a unique patient or a confirmed case.',
  si: 'එක් පැමිණීමක් යනු සුරැකි එක් උපදේශන වාර්තාවකි; එය අනන්‍ය රෝගියෙකු හෝ තහවුරු කළ රෝග අවස්ථාවක් නොවේ.',
  ta: 'ஒரு வருகை என்பது சேமிக்கப்பட்ட ஓர் ஆலோசனைப் பதிவு; தனித்த நோயாளியையோ உறுதிசெய்த நோய்நிலையையோ குறிக்காது.'
};
const reject = () => { throw Error('PUBLIC_ACTIVITY_VERIFICATION_FAILED'); };
function assertApi(data) {
  if (!data || data.metric !== 'recorded_consultation_visits' || data.mode !== 'real' || data.source !== 'mongodb' || data.unit !== 'visits' ||
      !Number.isSafeInteger(data.totalVisits) || data.totalVisits < 0 || data.totalVisits > 100000 || !Array.isArray(data.trend) || !Array.isArray(data.byDistrict) ||
      data.surveillance?.availability !== 'not_available' || data.surveillance.confirmedCases !== null || data.surveillance.outbreakClusters !== null || data.surveillance.forecast !== null ||
      ['totalCases','forecast','byDisease','demoBatchId','datasetVersion','testRunId'].some(key => Object.hasOwn(data,key)) ||
      ['isSimulation','isSynthetic','isDemoData','isSimulatedDemo'].some(key => data[key] !== undefined && data[key] !== false && data[key] !== null)) reject();
  if (data.trend.some(row => !Number.isSafeInteger(row.visitCount) || row.visitCount < 0) || data.trend.reduce((sum,row) => sum + row.visitCount,0) !== data.totalVisits ||
      data.byDistrict.some(row => !Number.isSafeInteger(row.visitCount) || row.visitCount < 5)) reject();
  return true;
}
function assertObservation(row) {
  if (!Object.hasOwn(captions,row.requestedLanguage) || row.language !== row.requestedLanguage || row.availability !== 'available' ||
      row.caption !== captions[row.requestedLanguage] || !row.captionVisible || !row.figureVisible || !row.headingClear || !row.districtTableFits || row.overflow || row.hasTemporaryNotice ||
      !row.scrolledToSurveillance || !Array.isArray(row.surveillanceValues) || row.surveillanceValues.length !== 3 || row.surveillanceValues.some(value => value !== unavailableLabels[row.requestedLanguage]) ||
      row.oldHealthRequests || row.consoleErrors || row.pageErrors || row.failedRequests || row.writeRequests || row.guardViolations) reject();
  return true;
}
async function main(argv = process.argv.slice(2)) {
  let browser, context, stage = 'INPUT';
  const result = { at: new Date().toISOString(), scope: 'ANONYMOUS_PUBLIC_ACTIVITY_ONLY', passed: false, authAttempts: 0, observations: [] };
  try {
    if (argv.length !== 2 || argv[0] !== '--expected-commit' || !/^[a-f0-9]{40}$/.test(argv[1])) reject();
    result.expectedCommit = argv[1]; stage = 'DEPLOYMENT_IDENTITY';
    const health = await fetch(API + '/health', { signal: AbortSignal.timeout(65000) }), state = await health.json();
    if (health.status !== 200 || state.commit !== result.expectedCommit) reject();
    result.backendCommit = state.commit;
    stage = 'ACTIVITY_API';
    const response = await fetch(API + '/api/public/consultation-activity', { signal: AbortSignal.timeout(65000) }), body = await response.json();
    result.activityHttpStatus = response.status;
    if (response.status !== 200) reject(); assertApi(body.data);
    result.totalVisits = body.data.totalVisits;
    const { chromium } = require('../client/node_modules/playwright');
    browser = await chromium.launch({ headless: true }); context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false });
    const page = await context.newPage();
    let oldHealthRequests = 0, consoleErrors = 0, pageErrors = 0, failedRequests = 0, writeRequests = 0;
    page.on('console', message => { if (message.type() === 'error') consoleErrors++; });
    page.on('pageerror', () => pageErrors++); page.on('requestfailed', () => failedRequests++);
    page.on('request', request => { if (!['GET','HEAD','OPTIONS'].includes(request.method())) writeRequests++; if (new URL(request.url()).pathname === '/api/public/health-stats') oldHealthRequests++; });
    const directory = path.join(process.env.LOCALAPPDATA, 'medisync', 'evidence', 'Q2-activity-' + crypto.randomUUID().slice(0,8)); fs.mkdirSync(directory, { recursive: true });
    for (const [width,height] of [[320,800],[375,812],[1440,1000]]) {
      stage = 'NAVIGATION'; await page.setViewportSize({ width,height });
      await page.goto(FRONT + '/public-health', { waitUntil: 'networkidle', timeout: 65000 });
      await page.locator('[data-testid="public-activity-report"][data-availability="available"]').waitFor({ timeout: 65000 });
      for (const [language,label] of [['en','English'],['si','සිංහල'],['ta','தமிழ்']]) {
        stage = 'LANGUAGE'; await page.getByRole('button',{ name: label, exact: true }).click();
        await page.waitForFunction(code => document.documentElement.lang === code, language);
        await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(200);
        await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
        stage = 'OBSERVATION';
        const row = await page.evaluate(() => ({
          language: document.documentElement.lang, availability: document.querySelector('[data-testid="public-activity-report"]')?.dataset.availability,
          caption: document.querySelector('[data-testid="activity-visit-caption"]')?.textContent,
          surveillanceValues: ['confirmed-cases','outbreak-clusters','forecast'].map(id => document.querySelector('[data-testid="surveillance-' + id + '-value"]')?.textContent),
          overflow: document.documentElement.scrollWidth > innerWidth,
          headingClear: document.querySelector('main h1').getBoundingClientRect().top >= document.querySelector('nav').getBoundingClientRect().bottom,
          districtTableFits: (() => { const table = [...document.querySelectorAll('table')].at(-1); return table.scrollWidth <= table.parentElement.clientWidth + 1; })(),
          hasTemporaryNotice: !!document.querySelector('[data-testid="prototype-notice"],[data-testid="demonstration-data-banner"],aside[role="note"]')
        }));
        const clinical = page.getByTestId('surveillance-forecast-value');
        await clinical.scrollIntoViewIfNeeded();
        row.scrolledToSurveillance = await clinical.evaluate(element => { const r = element.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
        row.bottomScreenshot = path.join(directory, 'activity-bottom-' + width + '-' + language + '.png'); await page.screenshot({ path: row.bottomScreenshot });
        await page.getByTestId('activity-visit-caption').scrollIntoViewIfNeeded();
        Object.assign(row, { at: new Date().toISOString(), requestedLanguage: language, viewport: [width,height], captionVisible: await page.getByTestId('activity-visit-caption').isVisible(), figureVisible: await page.getByTestId('activity-total-visits').isVisible(), oldHealthRequests, consoleErrors, pageErrors, failedRequests, writeRequests, guardViolations: policy.violations() });
        result.observations.push(row); assertObservation(row);
        stage = 'SCREENSHOT'; row.screenshot = path.join(directory, 'activity-' + width + '-' + language + '.png'); await page.screenshot({ path: row.screenshot });
      }
    }
    result.passed = result.observations.length === 9; result.category = 'PUBLIC_ACTIVITY_NINE_VIEWS_VERIFIED';
  } catch (_) { result.category = 'PUBLIC_ACTIVITY_CHECK_FAILED'; result.failedStage = stage; }
  finally {
    if (context) await context.close().catch(() => {}); if (browser) await browser.close().catch(() => {});
    result.guardViolations = policy.violations(); result.completedAt = new Date().toISOString();
    const filename = path.join(__dirname,'../docs/temp/CODEX_Q2_ACTIVITY_LIVE_' + Date.now() + '.json'); fs.writeFileSync(filename,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({ passed: result.passed, category: result.category, failedStage: result.failedStage, observations: result.observations.length, receipt: filename, authAttempts: 0 }));
    process.exitCode = result.passed && !result.guardViolations ? 0 : 1;
  }
}
if (require.main === module) main().catch(() => { console.log('PUBLIC_ACTIVITY_RECEIPT_FAILED'); process.exitCode = 1; });
module.exports = { assertApi, assertObservation, main, captions, unavailableLabels };
