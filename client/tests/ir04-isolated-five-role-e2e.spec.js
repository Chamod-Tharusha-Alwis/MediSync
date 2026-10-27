/**
 * MEDISYNC — IR-04 Phase 4: Isolated 5-Role Playwright E2E Suite
 *
 * Target Frontend : http://127.0.0.1:3100
 * Target Backend  : http://127.0.0.1:5100 (restricted test database only)
 * Production URLs : Strictly blocked via route interception
 */

throw new Error('Phase 5X-B browser quarantine: five-role login and mutation scenarios require a separate approval and exact cleanup review.');

const { test, expect } = require('@playwright/test');
const { owner } = require('../../server/tests/helpers/browserRunConfig').readBrowserRunConfig();
process.env.MEDISYNC_QA_BROWSER_RUN = 'true';
process.env.MEDISYNC_QA_BROWSER_OWNER = owner;
process.env.MEDISYNC_QA_MANIFEST_LABEL = 'fixtures';
require('../../server/tests/helpers/qaEnvironment');
global.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
global.ENCRYPTION_KEYS = { "1": process.env.ENCRYPTION_KEY };
global.ACTIVE_KEY_VERSION = 1;

const mongoose = require('../../server/node_modules/mongoose');
const {
  TEST_DB_NAME,
  connectAutomatedTestDB,
  installDestructiveOpGuards
} = require('../../server/src/config/dbGuard');

installDestructiveOpGuards();

const crypto = require('crypto');
const Admin = require('../../server/src/models/Admin');
const Doctor = require('../../server/src/models/Doctor');
const Patient = require('../../server/src/models/Patient');
const PharmacyStaff = require('../../server/src/models/PharmacyStaff');
const Hospital = require('../../server/src/models/Hospital');
const SessionToken = require('../../server/src/models/SessionToken');
const TrustedDevice = require('../../server/src/models/TrustedDevice');
const AuditLog = require('../../server/src/models/AuditLog');
const OTPSession = require('../../server/src/models/OTPSession');

const BASE_URL = process.env.PHASE5W_BASE_URL || 'http://127.0.0.1:3100';
if (BASE_URL !== 'http://127.0.0.1:3100') throw new Error('Phase 5X browser target must be the loopback QA frontend.');
mongoose.set('autoIndex', false); mongoose.set('autoCreate', false);
const browserFixtures=require('../../server/scripts/phase5wBrowserFixtures');
let fixtureEmails, fixtureData;
const DEMO_PASSWORD = process.env.SEED_TEST_PASSWORD || 'MediSyncDemo#2026!';
const QA_UNVERIFIED_DOCTOR_EMAIL = `unverified.e2e.${Date.now()}@medisync.local`;
const E2E_ACTOR_EMAILS = [
  'superadmin@demo.medisync.local',
  'dr.silva@demo.medisync.local',
  'kamal.patient@demo.medisync.local',
  'pharmacy.admin@demo.medisync.local',
  'colombo.hospital@demo.medisync.local'
];

test.describe.configure({ mode: 'serial' });

test.describe('IR-04 Isolated 5-Role Frontend & Playwright Verification', () => {
  let qaUnverifiedDoctorId = null;
  let e2eActorIds = [];
  let e2eActorIdStrings = [];
  const preExistingIds = {
    SessionToken: new Set(),
    TrustedDevice: new Set(),
    OTPSession: new Set(),
    AuditLog: new Set()
  };
  const capturedTokenHashes = new Set();
  const pageErrors = [];
  const server5xxResponses = [];
  const consoleErrors = [], failedRequests = [], blockedProduction = [];
  let clinical;

  test.beforeAll(async ({ browser }) => {
    const { dbName, authenticatedRoles } = await connectAutomatedTestDB();
    expect(dbName).toBe(TEST_DB_NAME);
    expect(authenticatedRoles).toEqual([{role:'readWrite',db:TEST_DB_NAME}]);
    // Verify the separate process's guard BEFORE any fixture insertion.
    const page = await browser.newPage();
    try {
      await attachSafetyMonitors(page);
      await page.goto(BASE_URL);
      const status = await page.evaluate(async () => { const res = await fetch('/api/qa/status'); return { status: res.status, body: await res.json() }; });
      expect(status.status).toBe(200);
      expect(status.body).toMatchObject({ protocol: '5xd5-drain-v1', owner, frozen: false, database: TEST_DB_NAME, externalProviders: 'mocked', rejected: 0,
        nativeFixtureGuardActive:true,dbGuardActive:true,testMode:true,productionUriLoaded:false });
      expect(status.body.roles).toEqual([{ role: 'readWrite', db: TEST_DB_NAME }]);
      expect(status.body.frontend).toBe(BASE_URL);
      expect(status.body.backend).toBe('http://127.0.0.1:5100');
      expect(status.body.ml).toBe('http://127.0.0.1:5101');
    } finally { await page.close(); }
    fixtureData = await browserFixtures.setup();
    fixtureEmails = fixtureData.emails;
  });
  test.afterAll(async ({ browser }) => {
    let drain;
    try {
      if (browserFixtures.hasFixtures() && mongoose.connection.readyState === 1) {
        const page = await browser.newPage();
        try {
          await attachSafetyMonitors(page); await page.goto(BASE_URL);
          const status = await apiFromPage(page, '/qa/freeze', { method: 'POST' });
          expect(status.status).toBe(200); expect(status.body.frozen).toBe(true);
          drain = status.body;
          expect(drain).toMatchObject({protocol:'5xd5-drain-v1',owner,shutdownInitiated:true});
          // Ack is insufficient: cleanup waits for the final receipt and OS exit.
        } finally { await page.close(); }
        await browserFixtures.cleanup(drain);
      }
    }
    finally { await mongoose.disconnect(); }
  });

  async function apiFromPage(page, suffix, { method = 'GET', body, headers = {} } = {}) {
    return page.evaluate(async ({ suffix, method, body, headers, owner }) => {
      const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
      const response = await fetch(`/api${suffix}`, { method, headers: {
        'Content-Type': 'application/json', 'x-medisync-qa-owner': owner,
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() };
    }, { suffix, method, body, headers, owner });
  }

  async function assertMobileLayout(page) {
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.locator('body')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
    await page.setViewportSize({ width: 1280, height: 800 });
  }

  async function attachSafetyMonitors(page) {
    // Fail-closed guard: block any accidental request to live production domains
    await page.context().route('**/*', route => {
      const url=new URL(route.request().url());
      if (['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname)) return route.fulfill({ status: 200, body: '', contentType: 'text/css' });
      if(url.origin !== BASE_URL){ blockedProduction.push(url.origin); return route.abort('accessdenied'); }
      return route.continue({ headers: { ...route.request().headers(), 'x-medisync-qa-owner': owner } });
    });

    page.on('console', msg => {
      if (msg.type() !== 'error') return;
      // Negative test responses are intentional; retain every other console error.
      const negative = { '/api/auth/login': 401, '/api/admin/users': 403,
        '/api/pharmacy/dispense': 400, '/api/pharmacy/dispense-otc': 409 };
      let pathname = ''; try { pathname = new URL(msg.location().url).pathname; } catch (_) {}
      if (negative[pathname] && msg.text().startsWith('Failed to load resource:') && msg.text().includes(`status of ${negative[pathname]}`)) return;
      consoleErrors.push(msg.text());
    });
    page.on('requestfailed', req => failedRequests.push(new URL(req.url()).pathname));

    page.on('pageerror', (err) => {
      pageErrors.push(err.message || String(err));
    });

    page.on('response', async (resp) => {
      const url = resp.url();
      if (url.includes('/api/') && resp.status() >= 500) {
        server5xxResponses.push(`${resp.status()} ${url}`);
      }
      if (url.includes('/login') && resp.status() === 200) {
        try {
          const body = await resp.json();
          const token = body?.data?.accessToken || body?.accessToken;
          if (token) {
            capturedTokenHashes.add(crypto.createHash('sha256').update(token).digest('hex'));
          }
        } catch (_) {
          // Ignore non-JSON responses
        }
      }
    });
  }

  test('1. Public Directories, Synthetic Demo Badges, Doctor Publication Safety, Search/Filter & Protected Route Guards (Desktop & Mobile)', async ({ page }) => {
    await attachSafetyMonitors(page);
    await page.setViewportSize({ width: 1280, height: 800 });

    // 1.1 Protected route redirection when unauthenticated
    await page.goto(`${BASE_URL}/admin/dashboard`, { waitUntil: 'networkidle' });
    await expect(page).not.toHaveURL(/\/admin\/dashboard$/);

    await page.goto(`${BASE_URL}/doctor/dashboard`, { waitUntil: 'networkidle' });
    await expect(page).not.toHaveURL(/\/doctor\/dashboard$/);

    // 1.2 Public Doctor Directory (/doctors) — displays verified MEDISYNC_UNIV_DEMO_V2 synthetic doctors with explicit synthetic badge
    await page.goto(`${BASE_URL}/doctors`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toContainText(/Dr\. Arjuna Silva \(Demo\)/i, { timeout: 15000 });
    await expect(page.locator('[data-testid="synthetic-doctor-badge"]').first()).toContainText('Demo Doctor — Synthetic Profile');
    await expect(page.locator('body')).toContainText(/Synthetic University Demo Fixture — Not SLMC Registered/i);

    // Excluded doctors (unverified Chaminda Bandara & raw SLMC-DEMO- license numbers) must NEVER appear
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/Chaminda Bandara/i);
    expect(bodyText).not.toMatch(/SLMC-DEMO-/i);

    // Search filter check
    const searchInput = page.getByPlaceholder('Search doctor name or specialty...');
    await expect(searchInput).toBeVisible(); await searchInput.fill('Cardiologist');
    await expect(page.locator('body')).toContainText(/Dr\. Arjuna Silva \(Demo\)/i);

    // 1.3 Mobile viewport responsiveness check (375x812)
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    const docOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
    expect(docOverflow).toBe(true);

    // 1.4 Public Hospitals & Pharmacies directories — verify synthetic profile badges
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE_URL}/hospitals`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toContainText(/General Hospital Colombo/i, { timeout: 15000 });
    await expect(page.locator('[data-testid="synthetic-hospital-badge"]').first()).toContainText('Demo Hospital — Synthetic Profile');

    await page.goto(`${BASE_URL}/pharmacies`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toContainText(/HealthCare Pharmacy Colombo/i, { timeout: 15000 });
    await expect(page.locator('[data-testid="synthetic-pharmacy-badge"]').first()).toContainText('Demo Pharmacy — Synthetic Profile');
  });

  test('2. Role 1 — Admin Portal: Login, Dashboard, User Table/Search, Modals, Mobile Layout & Logout', async ({ page }) => {
    await attachSafetyMonitors(page);
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto(`${BASE_URL}/admin/login`, { waitUntil: 'networkidle' });

    // Invalid password validation
    await page.fill('input[type="email"]', fixtureEmails.admins);
    await page.fill('input[type="password"]', 'WrongPass123!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(/\/admin\/login/);

    // Valid Super Admin login
    await page.fill('input[type="email"]', fixtureEmails.admins);
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin/dashboard', { timeout: 15000 });

    // Verify dashboard stats and user management
    await expect(page.locator('body')).toContainText(/Admin|Overview|Users/i, { timeout: 15000 });

    // Navigate to Users tab if present
    await page.goto(`${BASE_URL}/admin/dashboard/users`);
    await expect(page.getByRole('heading', { name:'User Management', exact:true })).toBeVisible();
    await page.getByPlaceholder('Search name, email, or NIC...').fill(fixtureEmails.patients);
    await expect(page.locator('body')).toContainText(fixtureEmails.patients);
    await page.goto(`${BASE_URL}/admin/dashboard/outbreak`);
    await expect(page.locator('body')).toContainText(/Outbreak|Surveillance/i);

    // Mobile viewport check on Admin dashboard
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    const adminOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
    expect(adminOverflow).toBe(true);

    // Clear session (logout)
    await assertMobileLayout(page);
    await page.evaluate(() => localStorage.clear());
  });

  test('3. Doctor: login, form navigation, consent and ICD-10 consultation through browser API bridge', async ({ page }) => {
    await attachSafetyMonitors(page);
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto(`${BASE_URL}/doctor/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', fixtureEmails.doctors);
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/doctor/dashboard', { timeout: 15000 });

    await expect(page.locator('body')).toContainText(/Arjuna Silva|Consultations|Dashboard/i, { timeout: 15000 });

    // Role-based route guard: Doctor cannot access /admin/dashboard
    await page.goto(`${BASE_URL}/admin/dashboard`, { waitUntil: 'networkidle' });
    await expect(page).not.toHaveURL(/\/admin\/dashboard$/);

    // Navigate to Doctor Profile
    await page.goto(`${BASE_URL}/doctor/profile`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toContainText(/Cardiologist|Arjuna Silva/i, { timeout: 15000 });

    // Navigate to New Consultation page
    await page.goto(`${BASE_URL}/doctor/consultation/new`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toContainText(/Consultation|Patient|NIC/i, { timeout: 15000 });

    // Browser-driven API bridge exercises actual auth/consent/controller writes;
    // the full consultation wizard's click path is a separate readiness item.
    const access = await apiFromPage(page, '/patient/request-access', { method: 'POST', body: { patientNic: fixtureData.patientNic, requesterRole: 'doctor', requesterName: 'QA Doctor' } });
    expect(access.status).toBe(200);
    const mockMail = await apiFromPage(page, `/qa/mock-email?email=${encodeURIComponent(fixtureEmails.patients)}`);
    expect(mockMail.status).toBe(200);
    const consent = await apiFromPage(page, '/patient/verify-access', { method: 'POST', body: { sessionId: access.body.sessionId, patientNic: fixtureData.patientNic, otp: mockMail.body.otp } });
    expect(consent.status).toBe(200);
    clinical = await apiFromPage(page, '/doctor/consultation', { method: 'POST', headers: { 'x-patient-access': consent.body.accessToken }, body: {
      patientNic: fixtureData.patientNic, diagnosis: 'Dengue', icdCode: 'A90', icdVersion: 'ICD-10',
      symptoms: ['high fever'], clinicalNotes: 'Owned browser QA consultation',
      prescriptions: [{ drugName: 'Paracetamol 500mg', dosage: '500mg', frequency: 'TDS', durationDays: 3 }],
      orderedTests: [{ testName: 'Full Blood Count' }], loginType: 'personal'
    } });
    expect(clinical.status).toBe(201);
    const saved = await require('../../server/src/models/Consultation').findById(clinical.body.consultationId);
    expect(saved.icdVersion).toBe('ICD-10'); expect(saved.icdCode).toBe('A90'); expect(saved.diagnosis).toBe('Dengue');

    await assertMobileLayout(page);
    await page.evaluate(() => localStorage.clear());
  });

  test('4. Patient: login, owned medical timeline and role protection', async ({ page }) => {
    await attachSafetyMonitors(page);
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto(`${BASE_URL}/patient/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', fixtureEmails.patients);
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/patient/dashboard', { timeout: 15000 });

    await expect(page.locator('body')).toContainText(/Kamal Perera|999000001V|Dashboard|Timeline|Prescriptions/i, {
      timeout: 15000
    });

    // Mobile viewport check on Patient portal
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    await expect(page.locator('body')).toBeVisible();

    await page.goto(`${BASE_URL}/patient/dashboard/history`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toContainText('Dengue');
    const forbidden = await apiFromPage(page, '/admin/users');
    expect(forbidden.status).toBe(403);

    await assertMobileLayout(page);
    await page.evaluate(() => localStorage.clear());
  });

  test('5. Pharmacy: login, prescription dispensing and OTC retry through browser API bridge', async ({ page }) => {
    await attachSafetyMonitors(page);
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto(`${BASE_URL}/pharmacy/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', fixtureEmails.pharmacystaffs);
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/pharmacy/dashboard', { timeout: 15000 });

    await expect(page.locator('body')).toContainText(/HealthCare Pharmacy Colombo|Chief Pharmacist|Pharmacy|Dispense|Inventory/i, {
      timeout: 15000
    });

    // Navigate to Inventory tab if visible
    // This dashboard has no Inventory navigation item; stock is in the dispense modal.
    await page.goto(`${BASE_URL}/pharmacy/dashboard/dispense`);
    await expect(page.getByRole('heading', { name:'Dispense Medication', exact:true })).toBeVisible();

    const pending = await apiFromPage(page, `/pharmacy/prescriptions/pending/${fixtureData.patientNic}`);
    expect(pending.status).toBe(200);
    const rx = pending.body.data.prescriptions.find(item => item.drugName === 'Paracetamol 500mg');
    expect(rx).toBeTruthy();
    const checkout = { prescriptionId: rx.prescriptionId, patientNic: fixtureData.patientNic,
      items: [{ drugName: 'Paracetamol 500mg', quantityDispensed: 10, unit: 'tablets' }] };
    // Actual UI search, quantity selection, insufficient-stock error and submission.
    await page.getByPlaceholder('Enter Patient NIC (e.g. 981234567V)').fill(fixtureData.patientNic);
    await page.getByRole('button', { name:'Retrieve', exact:true }).click();
    await page.getByRole('button', { name:'Dispense Medication', exact:true }).click();
    await expect(page.locator('#stock-0')).not.toHaveValue('');
    await page.locator('#qty-0').fill('201');
    const rejectedStock = page.waitForResponse(res => new URL(res.url()).pathname === '/api/pharmacy/dispense' && res.request().method() === 'POST');
    await page.getByRole('button', { name:'Dispense Now', exact:true }).click();
    const stockFailure = await rejectedStock;
    expect(stockFailure.status()).toBe(400); expect((await stockFailure.json()).code).toBe('INSUFFICIENT_STOCK');
    await page.locator('#qty-0').fill('10');
    const issued = page.waitForResponse(res => new URL(res.url()).pathname === '/api/pharmacy/dispense' && res.request().method() === 'POST');
    await page.getByRole('button', { name:'Dispense Now', exact:true }).click();
    expect((await issued).status()).toBe(201);
    const stock = await apiFromPage(page, '/pharmacy/inventory');
    expect(stock.body.data.find(item => item.drugName === 'Paracetamol 500mg').stock).toBe(190);
    const duplicate = await apiFromPage(page, '/pharmacy/dispense', { method: 'POST', body: checkout });
    expect(duplicate.body.code).toBe('ALREADY_DISPENSED');
    const otc = { patientNic: fixtureData.patientNic, medications: [{ name: 'Paracetamol 500mg', qty: 2, unit: 'tablets' }] };
    const headers = { 'Idempotency-Key': `otc-${owner}` };
    const first = await apiFromPage(page, '/pharmacy/dispense-otc', { method: 'POST', body: otc, headers });
    expect(first.status).toBe(201);
    const replay = await apiFromPage(page, '/pharmacy/dispense-otc', { method: 'POST', body: otc, headers });
    expect(replay.status).toBe(200); expect(replay.body.replayed).toBe(true);
    expect(replay.body.data.receiptNumber).toBe(first.body.data.receiptNumber);
    expect((await apiFromPage(page, '/pharmacy/inventory')).body.data.find(item => item.drugName === 'Paracetamol 500mg').stock).toBe(188);
    const changed = await apiFromPage(page, '/pharmacy/dispense-otc', { method: 'POST', body: { ...otc, medications: [{ name: 'Paracetamol 500mg', qty: 3, unit: 'tablets' }] }, headers });
    expect(changed.status).toBe(409); expect(changed.body.code).toBe('IDEMPOTENCY_CONFLICT');

    await assertMobileLayout(page);
    await page.evaluate(() => localStorage.clear());
  });

  test('6. Hospital: login, lab consent/approval UI and encrypted upload through browser API bridge', async ({ page }) => {
    await attachSafetyMonitors(page);
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto(`${BASE_URL}/hospital/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', fixtureEmails.hospitals);
    await page.fill('input[type="password"]', DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/hospital/dashboard', { timeout: 15000 });

    await expect(page.locator('body')).toContainText(/General Hospital Colombo|Hospital|Doctors|Lab/i, {
      timeout: 15000
    });

    await page.goto(`${BASE_URL}/hospital/dashboard/tests`, { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toContainText('Laboratory Management');
    await page.getByPlaceholder('e.g. 200012345678').fill(fixtureData.patientNic);
    const otpResponse = page.waitForResponse(res => new URL(res.url()).pathname === '/api/lab/hospital/request-otp' && res.request().method() === 'POST');
    await page.getByRole('button', { name:'Send Verification OTP', exact:true }).click();
    expect((await otpResponse).status()).toBe(200);
    const email = await apiFromPage(page, `/qa/mock-email?email=${encodeURIComponent(fixtureEmails.patients)}`);
    expect(email.status).toBe(200); expect(email.body.otp).toMatch(/^\d{6}$/);
    for (let digit = 0; digit < 6; digit++) await page.getByLabel(`OTP Digit ${digit + 1}`, { exact:true }).fill(email.body.otp[digit]);
    const queueResponse = page.waitForResponse(res => new URL(res.url()).pathname === '/api/lab/hospital/verify-fetch-tests' && res.request().method() === 'POST');
    await page.getByRole('button', { name:'Verify & Download Report', exact:true }).click();
    const queueHttp = await queueResponse;
    const queue = { status:queueHttp.status(),body:await queueHttp.json() };
    expect(queue.status).toBe(200);
    const testRecord = queue.body.tests.find(item => item.testName === 'Full Blood Count');
    expect(testRecord).toBeTruthy();
    const approvalResponse = page.waitForResponse(res => new URL(res.url()).pathname === '/api/lab/hospital/approve-test' && res.request().method() === 'POST');
    await page.getByRole('button', { name:'Approve Test', exact:true }).click();
    const approvedHttp = await approvalResponse;
    const approved = { status:approvedHttp.status(),body:await approvedHttp.json() };
    expect(approved.status).toBe(200); expect(approved.body.reportId).toMatch(/^LAB-/);
    const uploaded = await page.evaluate(async ({ labTestId, owner }) => {
      const form = new FormData();
      form.append('report', new Blob(['%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n'], { type: 'application/pdf' }), 'owned-qa-report.pdf');
      const response = await fetch(`/api/lab/${labTestId}/upload-report`, { method: 'POST', headers: {
        Authorization: `Bearer ${localStorage.getItem('token') || localStorage.getItem('accessToken')}`, 'x-medisync-qa-owner': owner
      }, body: form });
      return { status: response.status, body: await response.json() };
    }, { labTestId: testRecord.labTestId, owner });
    expect(uploaded.status).toBe(200);
    const storedLab = await require('../../server/src/models/LabTest').collection.findOne({ _id: new mongoose.Types.ObjectId(testRecord._id) });
    expect(storedLab.phase5xOwner).toBe(owner); expect(storedLab.encryptedFileKey).toBeTruthy(); expect(storedLab.fileIV).toBeTruthy();

    await assertMobileLayout(page);
    await page.evaluate(() => localStorage.clear());
  });

  test('7. Zero Uncaught Browser Runtime Errors & Zero 5xx API Responses Across All 5 Portals', async () => {
    expect(pageErrors).toEqual([]);
    expect(server5xxResponses).toEqual([]);
    expect(consoleErrors).toEqual([]); expect(failedRequests).toEqual([]); expect(blockedProduction).toEqual([]);
  });
});
