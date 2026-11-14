'use strict';

/**
 * server/tests/outbreakEmailPart2.test.js
 *
 * Verifies Part 2 requirements:
 * 1. Curated disease library for Sri Lanka top endemic/epidemic diseases + generic fallback.
 * 2. Professional responsive trilingual email generation (HTML + plain text parity).
 * 3. Read-time 72h metrics & DCS population embedding.
 * 4. Demonstration data isolation: routes strictly to allowlist with [DEMONSTRATION] prefix and banner.
 * 5. Test email support with [TEST] prefix.
 * 6. Audit logging privacy: counts only, zero recipient email exposure.
 */

const {
  CLINICAL_REVIEW_STATUS,
  DISEASE_LIBRARY,
  resolveDiseaseDetails,
  getGenericDiseaseAdvisory
} = require('../src/services/outbreakDiseaseLibrary');

const {
  buildOutbreakAdvisoryEmail,
  escapeHtml
} = require('../src/services/outbreakEmailBuilder');

const {
  resolveOutbreakRecipients,
  sendOutbreakAdvisoryEmail,
  isSyntheticOrDemo
} = require('../src/services/outbreakNotificationDelivery');

describe('Part 2: Professional Outbreak Email & Advisory Delivery', () => {

  describe('1. Curated Disease Library', () => {
    test('carries exact viva demonstration clinical review status', () => {
      expect(CLINICAL_REVIEW_STATUS).toBe('Curated for viva demonstration; pending human clinical review');
    });

    const expectedDiseases = [
      'dengue', 'leptospirosis', 'influenza', 'typhoid',
      'chickenpox', 'hepatitis_a', 'cholera', 'chikungunya', 'malaria'
    ];

    test.each(expectedDiseases)('curates %s with full trilingual content (EN, SI, TA)', (diseaseKey) => {
      const entry = DISEASE_LIBRARY[diseaseKey];
      expect(entry).toBeDefined();
      expect(entry.canonicalName).toBeTruthy();
      expect(Array.isArray(entry.icdCodes)).toBe(true);

      for (const lang of ['en', 'si', 'ta']) {
        const c = entry[lang];
        expect(c).toBeDefined();
        expect(typeof c.about).toBe('string');
        expect(c.about.length).toBeGreaterThan(15);
        expect(Array.isArray(c.symptoms)).toBe(true);
        expect(c.symptoms.length).toBeGreaterThanOrEqual(3);
        expect(typeof c.transmission).toBe('string');
        expect(Array.isArray(c.prevention)).toBe(true);
        expect(c.prevention.length).toBeGreaterThanOrEqual(2);
        expect(typeof c.highRisk).toBe('string');
        expect(typeof c.whenToSeekCare).toBe('string');
      }
    });

    test('resolves canonical disease by name, alias, and ICD-10 code', () => {
      expect(resolveDiseaseDetails('Dengue').canonicalName).toBe('Dengue Fever');
      expect(resolveDiseaseDetails('ICD10:A90').canonicalName).toBe('Dengue Fever');
      expect(resolveDiseaseDetails('rat fever').canonicalName).toBe('Leptospirosis (Rat Fever)');
      expect(resolveDiseaseDetails('A27').canonicalName).toBe('Leptospirosis (Rat Fever)');
      expect(resolveDiseaseDetails('flu').canonicalName).toBe('Influenza / Acute Respiratory Infection');
      expect(resolveDiseaseDetails('J11').canonicalName).toBe('Influenza / Acute Respiratory Infection');
      expect(resolveDiseaseDetails('typhoid').canonicalName).toBe('Typhoid / Enteric Fever');
      expect(resolveDiseaseDetails('A01').canonicalName).toBe('Typhoid / Enteric Fever');
      expect(resolveDiseaseDetails('chickenpox').canonicalName).toBe('Chickenpox / Varicella');
      expect(resolveDiseaseDetails('B01').canonicalName).toBe('Chickenpox / Varicella');
      expect(resolveDiseaseDetails('hepatitis a').canonicalName).toBe('Hepatitis A');
      expect(resolveDiseaseDetails('cholera').canonicalName).toBe('Cholera / Acute Watery Diarrhea');
      expect(resolveDiseaseDetails('A00').canonicalName).toBe('Cholera / Acute Watery Diarrhea');
      expect(resolveDiseaseDetails('chikungunya').canonicalName).toBe('Chikungunya');
      expect(resolveDiseaseDetails('malaria').canonicalName).toContain('Malaria');
    });

    test('generates sensible generic advisory for uncataloged ICD codes', () => {
      const generic = resolveDiseaseDetails('ICD10:B99.9');
      expect(generic.isGenericFallback).toBe(true);
      expect(generic.en.about).toContain('General infectious disease advisory');
      expect(generic.en.prevention.length).toBeGreaterThanOrEqual(2);
      expect(generic.si.about).toContain('පොදු බෝවන රෝග උපදේශනය');
      expect(generic.ta.about).toContain('பொதுவான தொற்றுநோய் ஆலோசனை');
    });
  });

  describe('2. Professional Responsive Email Builder', () => {
    const sampleAlert = {
      disease: 'Dengue fever',
      location: 'Gampaha',
      severity: 'Critical',
      metrics72h: {
        currentCases: 12,
        previousCases: 3,
        absoluteChange: 9,
        percentChange: 300,
        formattedShare: '0.0005%',
        incidencePer100k: 0.52,
        islandCases: 20
      }
    };

    test('generates responsive single-column 600px table layout with inline CSS', () => {
      const email = buildOutbreakAdvisoryEmail(sampleAlert);

      expect(email.subject).toBe('MediSync Health Alert: Dengue Fever in Gampaha (CRITICAL)');
      expect(email.html).toContain('max-width: 600px');
      expect(email.html).toContain('role="presentation"');
      expect(email.html).toContain('MEDISYNC PUBLIC HEALTH OBSERVATORY');
      expect(email.html).toContain('CRITICAL');
      // No external stylesheets or style tags
      expect(email.html).not.toContain('<link rel="stylesheet"');
    });

    test('embeds read-time 72h metrics and population shares accurately', () => {
      const email = buildOutbreakAdvisoryEmail(sampleAlert);

      expect(email.html).toContain('Verified Cases (72h)');
      expect(email.html).toContain('12');
      expect(email.html).toContain('Previous 72h: 3 (+9, +300%)');
      expect(email.html).toContain('0.0005% of population');
      expect(email.html).toContain('0.52 per 100,000');
      expect(email.html).toContain('Island: 20 cases');

      expect(email.text).toContain('Verified Cases (72h): 12');
      expect(email.text).toContain('Previous 72h: 3 (+9, +300%)');
      expect(email.text).toContain('0.0005% of population');
      expect(email.text).toContain('Island-wide Cases: 20');
    });

    test('includes trilingual sections (English, Sinhala, Tamil) in both HTML and text', () => {
      const email = buildOutbreakAdvisoryEmail(sampleAlert);

      // HTML has language sections
      expect(email.html).toContain('English Notice');
      expect(email.html).toContain('සිංහල නිවේදනය');
      expect(email.html).toContain('தமிழ் அறிவித்தல்');

      // Sinhala medical terms
      expect(email.html).toContain('ඩෙංගු');
      expect(email.html).toContain('ඊඩිස් මදුරුවන්');

      // Tamil medical terms
      expect(email.html).toContain('டெங்கு');
      expect(email.html).toContain('ஏடிஸ்');

      // Plain text has identical sections
      expect(email.text).toContain('ENGLISH NOTICE');
      expect(email.text).toContain('SINHALA NOTICE');
      expect(email.text).toContain('TAMIL NOTICE');
      expect(email.text).toContain('ඩෙංගු');
      expect(email.text).toContain('டெங்கு');
    });

    test('includes official health authority resources and footer disclaimer', () => {
      const email = buildOutbreakAdvisoryEmail(sampleAlert);

      expect(email.html).toContain('http://www.epid.gov.lk');
      expect(email.html).toContain('https://hpb.health.gov.lk');
      expect(email.html).toContain('https://www.who.int');
      expect(email.html).toContain('/public-health');
      expect(email.html).toContain(CLINICAL_REVIEW_STATUS);
      expect(email.html).toContain('/settings');

      expect(email.text).toContain('http://www.epid.gov.lk');
      expect(email.text).toContain('https://hpb.health.gov.lk');
      expect(email.text).toContain('https://www.who.int');
      expect(email.text).toContain(CLINICAL_REVIEW_STATUS);
    });
  });

  describe('3. Demonstration Data Isolation & Test Emails', () => {
    test('correctly identifies synthetic, simulated, or seeded alerts', () => {
      expect(isSyntheticOrDemo({ isSimulation: true })).toBe(true);
      expect(isSyntheticOrDemo({ isSynthetic: true })).toBe(true);
      expect(isSyntheticOrDemo({ syntheticSeedBatch: 'viva-2026-11-outbreaks' })).toBe(true);
      expect(isSyntheticOrDemo({ isDemoData: true })).toBe(true);
      expect(isSyntheticOrDemo({ isTestFixture: true })).toBe(true);
      expect(isSyntheticOrDemo({ isSimulation: false, isSynthetic: false })).toBe(false);
    });

    test('synthetic/demo alert prefixes subject with [DEMONSTRATION] and renders warning banner', () => {
      const demoAlert = {
        disease: 'Influenza',
        location: 'Kandy',
        severity: 'High',
        syntheticSeedBatch: 'viva-2026-11-outbreaks',
        metrics72h: { currentCases: 8, previousCases: 2, absoluteChange: 6 }
      };

      const email = buildOutbreakAdvisoryEmail(demoAlert);
      expect(email.subject).toMatch(/^\[DEMONSTRATION\] MediSync Health Alert:/);
      expect(email.html).toContain('DEMONSTRATION ALERT: Generated from synthetic test data. Not an active public health notice.');
      expect(email.text).toContain('DEMONSTRATION ALERT: Generated from synthetic test data.');
    });

    test('test email prefixes subject with [TEST]', () => {
      const alert = { disease: 'Dengue', location: 'Gampaha', severity: 'Critical' };
      const email = buildOutbreakAdvisoryEmail(alert, { isTest: true });
      expect(email.subject).toMatch(/^\[TEST\] MediSync Health Alert:/);
    });

    test('resolveOutbreakRecipients isolates demonstration alerts to allowlist and excludes real users', async () => {
      process.env.OUTBREAK_DEMO_EMAIL_ALLOWLIST = 'supervisor@hospital.gov.lk, tester@medisync.lk';
      const syntheticAlert = {
        disease: 'Dengue',
        location: 'Gampaha',
        isSimulation: true
      };

      const result = await resolveOutbreakRecipients(syntheticAlert, 'district', 100, { adminEmail: 'admin@medisync.lk' });
      expect(result.isDemonstration).toBe(true);
      expect(result.recipients.map(r => r.email)).toEqual(['supervisor@hospital.gov.lk', 'tester@medisync.lk']);
      delete process.env.OUTBREAK_DEMO_EMAIL_ALLOWLIST;
    });

    test('demonstration alert defaults to logged-in admin email if allowlist is empty', async () => {
      delete process.env.OUTBREAK_DEMO_EMAIL_ALLOWLIST;
      const syntheticAlert = {
        disease: 'Leptospirosis',
        location: 'Galle',
        syntheticSeedBatch: 'viva-2026-11-outbreaks'
      };

      const result = await resolveOutbreakRecipients(syntheticAlert, 'district', 100, { adminEmail: 'doctor.admin@moh.gov.lk' });
      expect(result.isDemonstration).toBe(true);
      expect(result.recipients).toEqual([{
        email: 'doctor.admin@moh.gov.lk',
        role: 'demonstration_allowlist',
        district: 'Galle'
      }]);
    });
  });

  describe('4. Dispatch & Audit Logging Privacy', () => {
    test('sendOutbreakAdvisoryEmail returns honest sent/failed counts and never exposes recipient emails', async () => {
      const alert = {
        disease: 'Dengue',
        location: 'Gampaha',
        severity: 'Critical',
        metrics72h: { currentCases: 12, previousCases: 3, absoluteChange: 9 }
      };

      const recipients = [
        { email: 'recipient1@example.com', role: 'doctor', district: 'Gampaha' },
        { email: 'recipient2@example.com', role: 'pharmacy', district: 'Gampaha' }
      ];

      const res = await sendOutbreakAdvisoryEmail(recipients, alert, { isTest: true });
      expect(res).toBeDefined();
      expect(typeof res.sentCount).toBe('number');
      expect(typeof res.failedCount).toBe('number');
      expect(res.subject).toContain('MediSync Health Alert');
      // Ensure returned result object does not expose recipient emails
      expect(res.recipients).toBeUndefined();
    });
  });

});