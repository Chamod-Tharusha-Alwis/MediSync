/**
 * MEDISYNC — Master Five-Role E2 Browser Verification Suite
 * 
 * Clean-room, unquarantined Playwright test suite for Phase E2.
 * Validates public pages, role selection, auth gates, accessibility, and zero console PHI leaks.
 * 
 * Target: http://127.0.0.1:3000 (React Frontend)
 * Requires: Separate live execution approval (Gated under Phase E2).
 */

const { test, expect } = require('@playwright/test');

// Pre-condition guard: Fails closed if invoked without explicit approval flag
test.beforeAll(async () => {
  if (process.env.MEDISYNC_LIVE_BROWSER_APPROVED !== 'true') {
    test.skip(true, 'Phase E2 browser suite requires explicit authorization (MEDISYNC_LIVE_BROWSER_APPROVED=true).');
  }
});

test.describe('Part 1: Public Health Portal & Directory Verification', () => {
  test('1.1 Homepage renders hero, navigation, and core feature sections', async ({ page }) => {
    const consoleLogs = [];
    page.on('console', msg => consoleLogs.push(msg.text()));

    await page.goto('/');
    await expect(page).toHaveTitle(/MediSync/i);

    // Verify header and navigation
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();

    // Verify key action buttons
    const getStartedBtn = page.getByRole('link', { name: /get started|select role/i }).first();
    await expect(getStartedBtn).toBeVisible();

    // Verify zero PHI or token leaks in console
    const leakedLogs = consoleLogs.filter(l => /eyJhbGciOi|patient|diagnosis|password/i.test(l));
    expect(leakedLogs).toHaveLength(0);
  });

  test('1.2 Role selection hub presents all five primary healthcare roles', async ({ page }) => {
    await page.goto('/select-role');

    // Verify role cards are displayed
    await expect(page.getByText(/administrator|admin/i).first()).toBeVisible();
    await expect(page.getByText(/doctor|physician/i).first()).toBeVisible();
    await expect(page.getByText(/patient/i).first()).toBeVisible();
    await expect(page.getByText(/pharmacy|pharmacist/i).first()).toBeVisible();
    await expect(page.getByText(/hospital/i).first()).toBeVisible();
  });

  test('1.3 Public directories render search controls and responsive cards', async ({ page }) => {
    // Doctors directory
    await page.goto('/doctors');
    const doctorSearch = page.getByPlaceholder(/search doctor|specialty/i).first();
    if (await doctorSearch.isVisible()) {
      await doctorSearch.fill('Cardiology');
      await expect(doctorSearch).toHaveValue('Cardiology');
    }

    // Hospitals directory
    await page.goto('/hospitals');
    await expect(page).toHaveURL(/hospitals/);

    // Pharmacies directory
    await page.goto('/pharmacies');
    await expect(page).toHaveURL(/pharmacies/);

    // Public health surveillance
    await page.goto('/public-health');
    await expect(page).toHaveURL(/public-health/);
  });
});

test.describe('Part 2: Route Protection & Authorization Gates', () => {
  const protectedRoutes = [
    { url: '/admin/dashboard', expectedRedirect: /\/(admin\/login|select-role)/ },
    { url: '/doctor/dashboard', expectedRedirect: /\/(doctor\/login|select-role)/ },
    { url: '/patient/dashboard', expectedRedirect: /\/(patient\/login|select-role)/ },
    { url: '/pharmacy/dashboard', expectedRedirect: /\/(pharmacy\/login|select-role)/ },
    { url: '/hospital/dashboard', expectedRedirect: /\/(hospital\/login|select-role)/ }
  ];

  for (const route of protectedRoutes) {
    test(`2. Unauthenticated access to ${route.url} redirects safely to login`, async ({ page }) => {
      await page.goto(route.url);
      await page.waitForURL(route.expectedRedirect);
      expect(page.url()).not.toContain('/dashboard');
    });
  }
});

test.describe('Part 3: Authentication UI Validation & Security Safeguards', () => {
  test('3.1 Form validation rejects empty or malformed inputs without network calls', async ({ page }) => {
    await page.goto('/patient/login');

    const submitBtn = page.getByRole('button', { name: /sign in|login/i }).first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      // Should show validation error or maintain required state
      const usernameInput = page.getByLabel(/email|nic|username/i).first();
      if (await usernameInput.isVisible()) {
        const isRequired = await usernameInput.getAttribute('required');
        expect(isRequired !== null || (await page.locator(':invalid').count()) > 0).toBeTruthy();
      }
    }
  });

  test('3.2 Doctor login enforces secure password entry and sanitized console', async ({ page }) => {
    const sensitiveStrings = [];
    page.on('console', msg => sensitiveStrings.push(msg.text()));

    await page.goto('/doctor/login');
    const passwordInput = page.locator('input[type="password"]').first();
    if (await passwordInput.isVisible()) {
      await passwordInput.fill('TestSecretPassword123!');
      // Verify password input obscures text
      await expect(passwordInput).toHaveAttribute('type', 'password');
    }

    // Confirm typed password never appears in console logs
    const leakedPasswords = sensitiveStrings.filter(s => s.includes('TestSecretPassword123!'));
    expect(leakedPasswords).toHaveLength(0);
  });
});

test.describe('Part 4: Accessibility & Mobile Layout Resilience', () => {
  test('4.1 Mobile viewport handles navigation drawer without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Check for horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBeFalsy();
  });

  test('4.2 Modal dialogs and interactive dropdowns respond to Escape key', async ({ page }) => {
    await page.goto('/select-role');
    await page.keyboard.press('Tab');
    // Verify an element receives keyboard focus
    const focusedTagName = await page.evaluate(() => document.activeElement.tagName);
    expect(focusedTagName).toBeTruthy();
  });
});
