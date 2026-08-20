/**
 * MediSync E2E Test Suite — AI Medication Suggestions & Safety Checks
 */
const { test, expect } = require('@playwright/test');

test.describe('AI Medication Suggestions & Safety Checks', () => {

  test('Backend API - GET /api/drugs/suggestions returns expected medications for Dengue', async ({ request }) => {
    const loginRes = await request.post('http://localhost:5005/api/auth/login', {
      data: {
        email: 'doctor@example.com',
        password: 'MediSync#2026!Pass',
        role: 'doctor'
      }
    });
    expect(loginRes.status()).toBe(200);
    const body = await loginRes.json();
    const token = body.data.accessToken;
    expect(token).toBeTruthy();

    const sugRes = await request.get('http://localhost:5005/api/drugs/suggestions?disease=Dengue', {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(sugRes.status()).toBe(200);
    const sugBody = await sugRes.json();
    expect(sugBody.data).toBeInstanceOf(Array);
    expect(sugBody.data.length).toBeGreaterThan(0);

    const paracetamol = sugBody.data.find(d => d.drugName === 'Paracetamol');
    expect(paracetamol).toBeTruthy();
    expect(paracetamol.category).toContain('Analgesic');
  });

  test('Backend API - POST /api/drugs/interactions detects Aspirin + Warfarin conflict', async ({ request }) => {
    const loginRes = await request.post('http://localhost:5005/api/auth/login', {
      data: {
        email: 'doctor@example.com',
        password: 'MediSync#2026!Pass',
        role: 'doctor'
      }
    });
    const body = await loginRes.json();
    const token = body.data.accessToken;

    const interRes = await request.post('http://localhost:5005/api/drugs/interactions', {
      headers: { Authorization: `Bearer ${token}` },
      data: { drugs: ['Aspirin', 'Warfarin'] }
    });
    expect(interRes.status()).toBe(200);
    const interBody = await interRes.json();
    expect(interBody.data.hasInteraction).toBe(true);
    expect(interBody.data.warnings.length).toBeGreaterThan(0);
  });

  test('Frontend UI - Medication Suggestions panel and Interaction Toast in New Consultation', async ({ page }) => {
    // 1. Log in as Doctor via Personal Doctor login page
    await page.goto('http://localhost:3000/doctor/login?type=personal');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
    await emailInput.fill('doctor@example.com');

    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();
    await passwordInput.fill('MediSync#2026!Pass');

    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Assert URL lands on doctor dashboard
    await page.waitForURL('**/doctor/dashboard');
    await expect(page).toHaveURL(/.*\/doctor\/dashboard/);

    // 2. Open New Consultation Wizard directly
    await page.goto('http://localhost:3000/doctor/consultation/new');
    await page.waitForURL('**/doctor/consultation/new');

    // 3. Search Patient by NIC (981234567V)
    const nicInput = page.locator('input[placeholder*="200312345699" i]');
    await expect(nicInput).toBeVisible();
    await nicInput.fill('981234567V');
    await nicInput.press('Enter');

    // 4. Wait for OTP modal inputs to render and fill digits (1 2 3 4 5 6)
    const firstOtpInput = page.locator('input[inputmode="numeric"]').first();
    await expect(firstOtpInput).toBeVisible({ timeout: 10000 });

    const otpInputs = page.locator('input[inputmode="numeric"]');
    for (let i = 0; i < 6; i++) {
      await otpInputs.nth(i).fill(String(i + 1));
    }

    // Wait for OTP modal verification to complete and step 1 presenting symptoms to load
    await page.waitForSelector('text=Presenting Symptoms', { timeout: 10000 });

    // Step 1: Add a symptom
    const symptomInput = page.locator('div.min-h-\\[50px\\] input:visible');
    await expect(symptomInput).toBeVisible();
    await symptomInput.fill('Fever');
    await page.keyboard.press('Enter');

    // Continue to Step 2
    const continueBtn = page.locator('button:has-text("Continue to AI Diagnosis")');
    await expect(continueBtn).toBeEnabled({ timeout: 5000 });
    await continueBtn.click();

    await page.waitForSelector('h3:has-text("AI Diagnosis Engine")');

    // Enter Dengue into Manual Diagnosis input
    const manualDiagInput = page.locator('input[placeholder="Enter custom illness..."]');
    await expect(manualDiagInput).toBeVisible();
    await manualDiagInput.fill('Dengue');

    // Click "Build Prescription" to move to Step 3
    const buildPrescriptionBtn = page.locator('button:has-text("Build Prescription")');
    await expect(buildPrescriptionBtn).toBeEnabled({ timeout: 5000 });
    await buildPrescriptionBtn.click();

    // 5. Hard assertions for AI Medication Suggestions Panel and cards
    const aiBadge = page.locator('text=AI-Suggested — Doctor Must Confirm');
    await expect(aiBadge).toBeVisible({ timeout: 10000 });

    const paracetamolCard = page.locator('text=Paracetamol').first();
    await expect(paracetamolCard).toBeVisible();

    const orsCard = page.locator('text=Oral Rehydration Salts (ORS)').first();
    await expect(orsCard).toBeVisible();

    // 6. Click "+ Add to Prescription" on Paracetamol card
    const addBtn = page.locator('button:has-text("+ Add to Prescription")').first();
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // 7. Add Warfarin via manual drug search input
    const drugSearchInput = page.locator('input[placeholder="Search medication name or generic..."]');
    await expect(drugSearchInput).toBeVisible();
    await drugSearchInput.fill('Warfarin');
    await page.waitForTimeout(600);

    const warfarinOption = page.locator('text=Warfarin').first();
    await expect(warfarinOption).toBeVisible({ timeout: 5000 });
    await warfarinOption.click();

    // 8. Add Aspirin via manual drug search input to trigger interaction warning
    await drugSearchInput.fill('Aspirin');
    await page.waitForTimeout(600);

    const aspirinOption = page.locator('text=Aspirin').first();
    await expect(aspirinOption).toBeVisible({ timeout: 5000 });
    await aspirinOption.click();

    // 9. Assert red drug interaction warning element or toast appears on screen with exact text
    const toast = page.locator('text=DRUG INTERACTION').first();
    await expect(toast).toBeVisible({ timeout: 10000 });
    await expect(toast).toContainText('DRUG INTERACTION');
  });

});
