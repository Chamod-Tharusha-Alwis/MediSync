'use strict';
/**
 * server/scripts/demo/alert72hMailCapture.cjs - capture the detailed alert email in EN, SI and TA through the real
 * emailService in test mode (mail is held in memory; no provider is contacted) and print subject + first 15 lines.
 * Numbers are computed from the synthetic demonstration seed plan (Kurunegala dengue, scan day 2026-11-17) by
 * alertProjection72h.js. Also writes the English HTML to docs/demo/alert72h/email_preview_en.html.
 *   node server/scripts/demo/alert72hMailCapture.cjs
 */
const fs = require('fs');
const path = require('path');
for (const k of ['MONGO_URI', 'MONGO_URI_TEST', 'MONGODB_URI', 'REDIS_URL']) if (process.env[k]) throw new Error(`REFUSING: ${k} is set`);
process.env.MEDISYNC_TEST_MODE = 'true';
process.env.EMAIL_PROVIDER = 'none';

async function main() {
  const plan = require('./demoSeedPlan.cjs');
  const projection = require('../../src/services/alertProjection72h');
  const { sendDetailedOutbreakEmail } = require('../../src/services/outbreakDetailedDelivery');
  const emailService = require('../../src/utils/emailService');
  const bulk = plan.buildBulkPlan({ referenceDate: '2026-11-17' });
  const cases = bulk.rows.map(r => ({ district: r.district, diseaseId: `ICD10:${plan.diseaseByKey.get(r.disease).condition.icdCode.replace('.', '')}`, time: r.time }));
  const asOf = new Date(plan.referenceMidnight('2026-11-17') + 6.5 * 3600000);
  const alert = { _id: 'capture', disease: 'ICD10:A90', location: 'Kurunegala', severity: 'Critical', status: 'Active', createdAt: asOf, approvedAt: new Date(+asOf + 3600000), syntheticSeedBatch: plan.BATCH_TAG, isSynthetic: true };
  const n = projection.computeAlertNumbers(alert, cases, { asOf, lookbackStart: +asOf - 63 * projection.DAY });
  const pop = projection.populationFigures('Kurunegala', n.actual72h);
  const numbers = { previous72h: n.previous72h, actual72h: n.actual72h, change: n.change, percentChange: n.percentChange, projected: n.projection.projected,
    low: n.projection.low, high: n.projection.high, enoughHistory: n.projection.enoughHistory, islandActual72h: n.islandActual72h,
    sharePct: pop.sharePct, per100k: pop.per100k, dailyCounts7d: n.dailyCounts7d, dataNote: n.dataNote };
  const recipients = { en: 'en.reviewer@qa.medisync.local', si: 'si.reviewer@qa.medisync.local', ta: 'ta.reviewer@qa.medisync.local' };
  const languages = new Map(Object.entries(recipients).map(([l, e]) => [e, l]));
  global.__MEDISYNC_CAPTURED_TEST_EMAILS = [];
  const log = console.log; console.log = () => {};
  const result = await sendDetailedOutbreakEmail(Object.values(recipients), alert, { numbers, languages, isDemo: true, approverRole: 'Administrator', emailService,
    env: { ...process.env, OUTBREAK_DEMO_EMAIL_ALLOWLIST: Object.values(recipients).join(',') } });
  console.log = log;
  const mails = global.__MEDISYNC_CAPTURED_TEST_EMAILS;
  console.log(`numbers from records: ${JSON.stringify(numbers)}`);
  console.log(`delivery: sent ${result.sentCount}, failed ${result.failedCount}, skipped ${result.skippedCount}`);
  for (const [lang, to] of Object.entries(recipients)) {
    const m = mails.find(x => x.to.includes(to));
    console.log(`\n===== ${lang.toUpperCase()} (captured, not sent) =====\nSubject: ${m.subject}`);
    console.log(String(m.text).split('\n').slice(0, 15).join('\n'));
    if (lang === 'en') {
      const out = path.resolve(__dirname, '../../../docs/demo/alert72h/email_preview_en.html');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, m.html);
    }
  }
}

if (require.main === module) main().then(() => process.exit(0)).catch(e => { console.error(e.stack); process.exit(1); });
module.exports = { main };
