/**
 * MediSync React Frontend E2E Playwright Test Suite
 * File: client/tests/medisync-live.spec.js
 * 
 * Setup Instructions:
 * 1. Open a terminal in the "client" directory.
 * 2. Run the following command to install Playwright and its dependencies:
 *    npm install --save-dev @playwright/test
 * 3. Install Playwright browsers:
 *    npx playwright install
 * 4. Ensure backend, frontend, and ML engine are running in other terminal windows:
 *    - Backend: cd server && npm run dev (or node src/app.js)
 *    - Frontend: cd client && npm start (runs on http://localhost:3000)
 *    - ML Engine: cd ml-engine && python app.py (runs on http://localhost:5001)
 * 5. Run the tests:
 *    npx playwright test --headed
 * 6. (Optional) View report:
 *    npx playwright show-report
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const tempFilePath = path.join(__dirname, 'temp-patient.json');

// Retrieve patient details from the temp file to ensure state persistency across sequential tests
function getPatientDetails() {
  if (fs.existsSync(tempFilePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(tempFilePath, 'utf8'));
      if (data.patientNic && data.patientEmail) {
        return data;
      }
    } catch (e) {
      console.error('Error reading temp-patient.json:', e);
    }
  }
  
  // Generate fresh credentials if not yet initialized
  const randSuffix = Math.floor(100 + Math.random() * 900); // 3 digits
  const data = {
    patientNic: `888777${randSuffix}V`,
    patientEmail: `patient_e2e_${Date.now()}_${randSuffix}@medisync.local`,
    testPassword: 'StrongPassword123!',
    reportId: ''
  };
  fs.writeFileSync(tempFilePath, JSON.stringify(data, null, 2));
  console.log(`Generated and stored new patient credentials: NIC=${data.patientNic}, Email=${data.patientEmail}`);
  return data;
}

test.describe.configure({ mode: 'serial' }); // Run tests sequentially as they depend on state

test.describe('MediSync E2E Live User Journeys', () => {
  
  test.beforeEach(async ({ page }) => {
    // Print browser console logs to backend/terminal for easier debugging
    page.on('console', msg => console.log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => console.error(`[BROWSER ERROR] ${err.message}\n${err.stack || ''}`));
    page.on('request', request => {
      if (request.url().includes('/api/')) {
        console.log(`>> [NET REQ] ${request.method()} ${request.url()}`);
      }
    });
    page.on('response', response => {
      if (response.url().includes('/api/')) {
        console.log(`<< [NET RES] ${response.status()} ${response.url()}`);
      }
    });
  });

  test.afterAll(async () => {
    // Clean up temp file after all tests in this suite are finished
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log('Successfully cleaned up temp-patient.json');
      } catch (e) {
        console.error('Failed to clean up temp-patient.json:', e);
      }
    }
  });

  test('Test 1: Patient Registration & Login', async ({ page }) => {
    const { patientNic, patientEmail, testPassword } = getPatientDetails();
    console.log(`Test 1 started for patientNic=${patientNic}, patientEmail=${patientEmail}`);

    // 1. Navigate to register page
    await page.goto('http://localhost:3000/register');
    await expect(page).toHaveURL(/.*register/);

    // Make sure patient role tab is active
    await page.click('button:has-text("patient")');

    // Fill registration details
    await page.fill('input[name="fullName"]', 'E2E Test Patient');
    await page.fill('input[name="email"]', patientEmail);
    await page.fill('input[name="nic"]', patientNic);
    await page.fill('input[name="dateOfBirth"]', '1998-05-15');
    await page.fill('input[name="contactInfo"]', '0771234567');
    await page.fill('input[name="password"]', testPassword);
    await page.fill('input[name="confirmPassword"]', testPassword);

    // Submit registration
    await page.click('button[type="submit"]');

    // Wait for redirect to patient login
    await page.waitForURL('**/patient/login');

    // Log in as the newly registered patient
    await page.fill('input[type="email"]', patientEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');

    // Assert that we reach the Patient Dashboard
    await page.waitForURL('**/patient/dashboard');
    await expect(page.locator('h1:has-text("Welcome back")')).toContainText('Welcome back, E2E');
    
    // Check that patient profile shows correct NIC
    await expect(page.locator('text=' + patientNic)).toBeVisible();
  });

  test('Test 2: Doctor ML Consultation', async ({ page }) => {
    const { patientNic } = getPatientDetails();
    console.log(`Test 2 started with patientNic=${patientNic}`);

    // 1. Log in as Doctor (using seeded test account details)
    await page.goto('http://localhost:3000/doctor/login?type=personal');
    await page.fill('input[type="email"]', 'doctor@test.com');
    await page.fill('input[type="password"]', 'StrongPassword123!');
    await page.click('button[type="submit"]');

    // Wait to land on Doctor Dashboard
    await page.waitForURL('**/doctor/dashboard');

    // Select workspace mode (Selector modal auto-waits)
    await page.locator('button:has-text("Personal Clinic")').click();

    await expect(page.locator('main h1')).toContainText('Dr. Test Doctor');

    // 2. Open New Consultation Wizard
    await page.click('a:has-text("New Consultation")');
    await page.waitForURL('**/doctor/consultation/new');

    // 3. Enter patient NIC and search
    await page.fill('input[placeholder="e.g. 200312345699"]', patientNic);
    // Click search button next to the input
    await page.locator('input[placeholder="e.g. 200312345699"] ~ button').click();

    // 4. Handle OTP verification Modal (Use mock code 123456)
    await page.waitForSelector('input[inputmode="numeric"]');
    const otpInputs = page.locator('input[inputmode="numeric"]');
    await otpInputs.nth(0).fill('1');
    await otpInputs.nth(1).fill('2');
    await otpInputs.nth(2).fill('3');
    await otpInputs.nth(3).fill('4');
    await otpInputs.nth(4).fill('5');
    await otpInputs.nth(5).fill('6');

    // Wait for modal to verify and close
    await page.waitForSelector('text=Presenting Symptoms');

    // 5. Type symptoms into SymptomTagInput
    const symptomInput = page.locator('div.min-h-\\[50px\\] input');
    
    await symptomInput.fill('Fever');
    await page.keyboard.press('Enter');
    
    await symptomInput.fill('Cough');
    await page.keyboard.press('Enter');
    
    await symptomInput.fill('Fatigue');
    await page.keyboard.press('Enter');

    // 6. Enter clinical notes
    await page.fill('textarea[placeholder="Detailed observation notes…"]', 'Patient exhibits mild respiratory issues.');

    // 7. Order Lab Test "Full Blood Count"
    await page.fill('input[placeholder="e.g. Full Blood Count"]', 'Full Blood Count');
    await page.click('button:has-text("Add")');

    // 8. Continue to AI Diagnosis page
    await page.click('button:has-text("Continue to AI Diagnosis")');
    await page.waitForSelector('h3:has-text("AI Diagnosis Engine")');

    // 9. Click "Analyze Symptoms" and wait for suggestions
    await page.click('button:has-text("Analyze Symptoms")');

    // Wait for ML engine response to populate the screen with disease cards
    await page.waitForSelector('.border.cursor-pointer');
    
    // Select the first diagnosis suggestion card
    const firstDiagnosis = page.locator('.border.cursor-pointer').first();
    await expect(firstDiagnosis).toBeVisible();
    await firstDiagnosis.click();

    // 10. Continue to prescription stage
    await page.click('button:has-text("Build Prescription")');
    await page.waitForSelector('h3:has-text("Recommended Lab Tests")');

    // 11. Complete the Consultation wizard
    await page.click('button:has-text("Complete Consultation")');

    // Assert redirect back to Doctor Dashboard (indicates success)
    await page.waitForURL('**/doctor/dashboard');
  });

  test('Test 3: Hospital Lab Approval & Assistant Upload', async ({ page }) => {
    const details = getPatientDetails();
    const { patientNic } = details;
    console.log(`Test 3 started with patientNic=${patientNic}`);

    // 1. Log in as Hospital Admin
    await page.goto('http://localhost:3000/hospital/login');
    await page.fill('input[type="email"]', 'hospital@test.com');
    await page.fill('input[type="password"]', 'StrongPassword123!');
    await page.click('button[type="submit"]');

    // Wait to land on Hospital Dashboard
    await page.waitForURL('**/hospital/dashboard');
    await expect(page.locator('main h1')).toContainText('Hospital Administration');

    // 2. Go to Laboratory Management
    await page.click('a:has-text("Lab Tests")');
    await page.waitForURL('**/hospital/dashboard/tests');

    // 3. Search NIC under "Approve Tests"
    await page.fill('input[id="register-nic-input"]', patientNic);
    await page.click('button:has-text("Send Consent OTP")');

    // 4. Enter mock OTP bypass '123456'
    await page.fill('input[id="register-otp-input"]', '123456');
    await page.click('button:has-text("Verify & View Tests")');

    // 5. Wait for pending tests to display and click "Approve Test"
    await page.waitForSelector('text=Pending Prescribed Tests');
    await page.click('.grid button:has-text("Approve Test")');

    // 6. Extract generated Report ID from success container
    await page.waitForSelector('p.text-2xl.font-mono.font-bold.text-emerald-400');
    const reportIdText = await page.locator('p.text-2xl.font-mono.font-bold.text-emerald-400').innerText();
    const reportId = reportIdText.trim();
    console.log(`Successfully approved lab test. Extracted Report ID: ${reportId}`);
    expect(reportId).toMatch(/^LAB-\d{4}-[a-f0-9]{8}$/);

    // Save reportId back to temp file
    details.reportId = reportId;
    fs.writeFileSync(tempFilePath, JSON.stringify(details, null, 2));

    // 7. Switch to "Lab Assistant Upload" tab
    await page.click('button:has-text("Lab Assistant Upload")');
    await page.waitForSelector('input[id="assistant-report-id"]');

    // 8. Search using the extracted Report ID
    await page.fill('input[id="assistant-report-id"]', reportId);
    await page.click('button:has-text("Fetch")');

    // Wait for test details to show up
    await page.waitForSelector('text=Upload Lab Report (PDF)');

    // 9. Create a dummy PDF file locally for upload
    const dummyPdfPath = path.join(__dirname, 'dummy.pdf');
    fs.writeFileSync(dummyPdfPath, '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 595 842]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000060 00000 n\n0000000111 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF');

    // 10. Upload the dummy PDF file
    await page.setInputFiles('input[id="assistant-upload-input"]', dummyPdfPath);

    // 11. Assert that the status badge changes to "Report Ready" (which is displayed as Report Ready)
    await page.waitForSelector('text=Report already uploaded and encrypted');
    const statusBadge = page.locator('span:has-text("Report Ready")').first();
    await expect(statusBadge).toBeVisible();

    // Clean up local dummy pdf file
    try {
      fs.unlinkSync(dummyPdfPath);
    } catch (e) {
      // ignore
    }
  });

  test('Test 4: Patient Secure Download', async ({ page }) => {
    const { patientEmail, testPassword } = getPatientDetails();
    console.log(`Test 4 started for patientEmail=${patientEmail}`);

    // 1. Log back in as the Patient
    await page.goto('http://localhost:3000/patient/login');
    await page.fill('input[type="email"]', patientEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');

    // Wait for Dashboard
    await page.waitForURL('**/patient/dashboard');

    // 2. Navigate to Medical History timeline
    await page.click('button[id="go-history"]');
    await page.waitForURL('**/patient/dashboard/history');

    // Expand the first consultation card in the timeline to make details visible
    await page.locator('.pl-14 .glass-card').first().click();

    // 3. Verify that the "Download Report" button is visible and clickable
    await page.waitForSelector('text=Recommended Lab Tests');
    
    // Find the Download Report button
    const downloadBtn = page.locator('button:has-text("Download Report")');
    await expect(downloadBtn).toBeVisible();
    
    // Ensure it's clickable (enabled)
    await expect(downloadBtn).toBeEnabled();
  });
});
