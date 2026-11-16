'use strict';
// Detailed disease notification email (outbreakDetailedEmail.js / outbreakDetailedDelivery.js). New test file.
// Synthetic demonstration fixtures; mail is captured, never sent.
const { buildDetailedOutbreakEmail, escapeHtml } = require('../src/services/outbreakDetailedEmail');
const { sendDetailedOutbreakEmail, resolveLanguages } = require('../src/services/outbreakDetailedDelivery');

const NUMBERS = { previous72h: 17, actual72h: 38, change: 21, percentChange: 123.5, projected: 38, low: 31, high: 46, enoughHistory: true,
  islandActual72h: 138, sharePct: 0.00233, per100k: 2.33, dailyCounts7d: [3, 2, 5, 10, 11, 13, 14], dataNote: 'verified MediSync consultations only (lower bound)' };
// Patient-like fields are planted on the alert to prove the email never reads them.
const ALERT = { _id: 'a1', disease: 'ICD10:A90', location: 'Kurunegala', severity: 'Critical', status: 'Active', createdAt: '2026-11-17T06:30:00Z',
  approvedAt: '2026-11-18T04:00:00Z', syntheticSeedBatch: 'viva-2026-11-outbreaks', isSynthetic: true,
  patientNic: '199912345678', fullName: 'Planted Patient Name', address: '12 Planted Road', email: 'planted.patient@example.invalid' };
const PATIENT_STRINGS = ['199912345678', 'Planted Patient Name', '12 Planted Road', 'planted.patient@example.invalid'];
const htmlText = html => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

describe('detailed email content', () => {
  test.each(['en', 'si', 'ta'])('renders in %s with every number from the fixture and no patient field', language => {
    const m = buildDetailedOutbreakEmail(ALERT, NUMBERS, { language, isSynthetic: true, approverRole: 'Administrator', frontendUrl: 'https://example.test' });
    expect(m.language).toBe(language);
    expect(m.subject).toMatch(/^\[MediSync\] Critical: /);
    for (const body of [m.text, htmlText(m.html)]) {
      for (const v of ['38', '17', '+21 (+123.5%)', '38 (', '31–46', '138', '0.00233%', '2.33', '3, 2, 5, 10, 11, 13, 14', 'verified MediSync consultations only (lower bound)', 'A90', 'Kurunegala'])
        expect(body).toContain(v);
      expect(body).toContain('SYNTHETIC DEMONSTRATION ALERT. Not an active public health notice.');
      for (const s of PATIENT_STRINGS) expect(body).not.toContain(s);
    }
    expect(m.html).not.toMatch(/<img|<script|<link|url\(/i);
  });

  test('English subject format and sections', () => {
    const m = buildDetailedOutbreakEmail(ALERT, NUMBERS, { language: 'en', isSynthetic: true });
    expect(m.subject).toBe('[MediSync] Critical: Dengue alert for Kurunegala');
    for (const h of ['Alert summary', 'What it is', 'How it spreads', 'Common symptoms', 'Danger signs and when to seek urgent care', 'Prevention and what the public can do',
      'Note for clinicians', 'What this alert means and does not mean', 'It needs review by a person', 'not a confirmed outbreak', 'No patient data is included',
      'projection, not a forecast', '/public-health', '/admin/dashboard/outbreak', 'https://www.health.gov.lk', 'opt out', 'https://www.who.int/news-room/fact-sheets/detail/dengue-and-severe-dengue', 'accessed 2026-11-16'])
      expect(m.text).toContain(h);
    expect(m.text).not.toMatch(/diagnos/i);
  });

  test('plain text carries the same facts as the HTML', () => {
    const m = buildDetailedOutbreakEmail(ALERT, NUMBERS, { language: 'en', isSynthetic: true });
    const facts = require('../src/content/diseaseFactSheets.json').sheets.A90;
    for (const key of ['whatItIs', 'howItSpreads', 'symptoms', 'dangerSigns', 'prevention', 'clinicianNote'])
      for (const item of facts[key]) { expect(m.text).toContain(item.text); expect(htmlText(m.html)).toContain(item.text); }
  });

  test('no synthetic banner for a real alert; generic sheet for an unknown code; English fallback', () => {
    const m = buildDetailedOutbreakEmail({ ...ALERT, syntheticSeedBatch: undefined, isSynthetic: false, disease: 'ICD10:B05' }, NUMBERS, { language: 'xx', isSynthetic: false });
    expect(m.language).toBe('en');
    expect(m.text).not.toContain('SYNTHETIC DEMONSTRATION ALERT');
    expect(m.text).toContain('MediSync has no reviewed fact sheet for this disease code yet');
  });

  test('dynamic values are HTML-escaped', () => {
    const m = buildDetailedOutbreakEmail({ ...ALERT, location: '<script>alert(1)</script>', status: '"><b>x' }, NUMBERS, { language: 'en', isSynthetic: true });
    expect(m.html).not.toContain('<script>alert(1)</script>');
    expect(m.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(m.html).not.toContain('"><b>x');
    expect(escapeHtml(`<a href="x">'&`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  });

  test('insufficient history shows no range', () => {
    const m = buildDetailedOutbreakEmail(ALERT, { ...NUMBERS, enoughHistory: false, low: null, high: null }, { language: 'en', isSynthetic: true });
    expect(m.text).toContain('not enough history for a range');
  });
});

function fakeMail({ sentToday = 0 } = {}) {
  const sent = [];
  return { sent, getDailyDispatchedEmailCount: async () => sentToday,
    sendMail: async o => { sent.push(o); return { providerAccepted: true, messageId: `m-${sent.length}` }; } };
}
const base = { numbers: NUMBERS, languages: new Map(), approverRole: 'Administrator' };

describe('detailed email delivery controls', () => {
  let logSpy;
  beforeEach(() => { logSpy = jest.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => logSpy.mockRestore());

  test('kill switch blocks sending', async () => {
    const mail = fakeMail();
    const r = await sendDetailedOutbreakEmail(['ok@example.test'], ALERT, { ...base, isDemo: true, emailService: mail, env: { OUTBREAK_EMAIL_DELIVERY_ENABLED: 'false', OUTBREAK_DEMO_EMAIL_ALLOWLIST: 'ok@example.test' } });
    expect(r).toMatchObject({ sentCount: 0, blockedReason: 'OUTBREAK_EMAIL_DELIVERY_DISABLED', skippedCount: 1 });
    expect(mail.sent).toHaveLength(0);
    const real = await sendDetailedOutbreakEmail(['ok@example.test'], { ...ALERT, syntheticSeedBatch: undefined, isSynthetic: false }, { ...base, isDemo: false, emailService: mail, env: {} });
    expect(real.blockedReason).toBe('OUTBREAK_EMAIL_DELIVERY_DISABLED'); // real alerts fail closed unless the flag is 'true'
    expect(mail.sent).toHaveLength(0);
  });

  test('allowlist is respected for demonstration alerts', async () => {
    const mail = fakeMail();
    const r = await sendDetailedOutbreakEmail(['ok@example.test', 'stranger@example.test'], ALERT, { ...base, isDemo: true, emailService: mail, env: { OUTBREAK_DEMO_EMAIL_ALLOWLIST: 'ok@example.test' } });
    expect(r).toMatchObject({ sentCount: 1, skippedCount: 1 });
    expect(mail.sent.map(m => m.to)).toEqual(['ok@example.test']);
  });

  test('test email goes only to the administrator', async () => {
    const mail = fakeMail();
    const r = await sendDetailedOutbreakEmail(['admin@example.test'], ALERT, { ...base, isTest: true, isDemo: true, adminEmail: 'admin@example.test', emailService: mail, env: { OUTBREAK_DEMO_EMAIL_ALLOWLIST: 'someone@example.test' } });
    expect(r.sentCount).toBe(1);
    expect(mail.sent[0].subject).toBe('[TEST] [MediSync] Critical: Dengue alert for Kurunegala');
  });

  test('daily cap is respected', async () => {
    const mail = fakeMail({ sentToday: 99 });
    const env = { OUTBREAK_DEMO_EMAIL_ALLOWLIST: 'a@example.test,b@example.test,c@example.test', DAILY_EMAIL_CAP: '100' };
    const r = await sendDetailedOutbreakEmail(['a@example.test', 'b@example.test', 'c@example.test'], ALERT, { ...base, isDemo: true, emailService: mail, env });
    expect(r).toMatchObject({ sentCount: 1, skippedCount: 2 });
    const full = await sendDetailedOutbreakEmail(['a@example.test'], ALERT, { ...base, isDemo: true, emailService: fakeMail({ sentToday: 100 }), env });
    expect(full).toMatchObject({ sentCount: 0, blockedReason: 'DAILY_EMAIL_CAP_REACHED' });
  });

  test('language comes from the stored account preference, English fallback; logs hold subject and id only', async () => {
    const db = { collection: name => ({ find: () => ({ toArray: async () => (name === 'patients' ? [{ email: 'si@example.test', preferredLanguage: 'si' }] : name === 'doctors' ? [{ email: 'ta@example.test', preferredLanguage: 'ta' }] : []) }) }) };
    const langs = await resolveLanguages(['si@example.test', 'ta@example.test', 'en@example.test'], { db });
    expect([...langs.values()]).toEqual(['si', 'ta', 'en']);
    const mail = fakeMail();
    const env = { OUTBREAK_DEMO_EMAIL_ALLOWLIST: 'si@example.test,ta@example.test,en@example.test' };
    const r = await sendDetailedOutbreakEmail(['si@example.test', 'ta@example.test', 'en@example.test'], ALERT, { numbers: NUMBERS, languages: langs, isDemo: true, emailService: mail, env });
    expect(r.sentCount).toBe(3);
    expect(Object.keys(r.subjects).sort()).toEqual(['en', 'si', 'ta']);
    const logged = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(logged).toContain('messageId=m-1');
    expect(logged).not.toMatch(/@example\.test|Danger signs|<html/);
  });
});
