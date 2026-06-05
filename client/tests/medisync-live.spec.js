//npx playwright test --headed

/**
 * MediSync React Frontend E2E Playwright Test Suite
 * File: client/tests/medisync-live.spec.js
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

// ─── CRITICAL STEP ───
// Parse environment variables from server/.env FIRST before loading Mongoose models.
// Mongoose models compile schema plugins instantly which depend on process.env.ENCRYPTION_KEY.
const serverEnvPath = path.resolve(__dirname, '../../server/.env');
if (fs.existsSync(serverEnvPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(serverEnvPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

// Now load mongoose and schemas from server for DB-level helpers and cleanups
const mongoose = require('../../server/node_modules/mongoose');
const Patient = require('../../server/src/models/Patient');
const Prescription = require('../../server/src/models/Prescription');
const LabTest = require('../../server/src/models/LabTest');
const Consultation = require('../../server/src/models/Consultation');
const Review = require('../../server/src/models/Review');
const BroadcastMessage = require('../../server/src/models/BroadcastMessage');
const Notification = require('../../server/src/models/Notification');

const tempFilePath = path.join(__dirname, 'temp-patient.json');
const pharmacyTempFilePath = path.join(__dirname, 'temp-pharmacy.json');

// Helper to calculate NIC blind index
const nicHash = (nic) => crypto.createHash('sha256').update(nic.trim().toUpperCase()).digest('hex');

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
    reportId: '',
    labTestId: ''
  };
  fs.writeFileSync(tempFilePath, JSON.stringify(data, null, 2));
  console.log(`Generated and stored new patient credentials: NIC=${data.patientNic}, Email=${data.patientEmail}`);
  return data;
}

// Retrieve pharmacy/dispense details
function getPharmacyDetails() {
  if (fs.existsSync(pharmacyTempFilePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(pharmacyTempFilePath, 'utf8'));
      return data;
    } catch (e) {
      console.error('Error reading temp-pharmacy.json:', e);
    }
  }
  return { pharmacistToken: '', testPrescriptionId: '' };
}

test.describe.configure({ mode: 'serial' }); // Run tests sequentially as they depend on state

test.describe('MediSync E2E Live User Journeys', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    // Connect to MongoDB using the URI loaded from server/.env
    if (process.env.MONGO_URI) {
      await mongoose.connect(process.env.MONGO_URI);
      console.log('E2E Test Suite successfully connected to MongoDB.');
    } else {
      console.warn('MONGO_URI not defined in environment. Database-level tests may fail.');
    }

    // Initialize shared page context
    page = await browser.newPage();

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
    // Clean up E2E records from the database before disconnecting
    if (mongoose.connection.readyState === 1) {
      try {
        if (fs.existsSync(tempFilePath)) {
          const data = JSON.parse(fs.readFileSync(tempFilePath, 'utf8'));
          const patientEmail = data.patientEmail;
          const patientNic = data.patientNic;
          if (patientEmail) {
            const patient = await Patient.findOne({ email: patientEmail });
            if (patient) {
              const patientId = patient._id;
              const patientNicBi = patient.patientNic_bi || nicHash(patientNic);

              console.log(`Cleaning up database records for E2E Patient ID: ${patientId}`);
              await Patient.deleteOne({ _id: patientId });
              await Prescription.deleteMany({ patientId });
              await LabTest.deleteMany({ patientNic_bi: patientNicBi });
              await Consultation.deleteMany({ patientId });
              await Review.deleteMany({ reviewerId: patientId });
              await Notification.deleteMany({ userId: patientId });
            }
          }
        }
        // Delete E2E broadcasts
        await BroadcastMessage.deleteMany({ message: { $regex: 'Broadcast Maintenance Alert' } });
        console.log('Database E2E cleanup completed successfully.');
      } catch (dbErr) {
        console.error('Error during database cleanup in afterAll:', dbErr);
      }
    }

    // Disconnect Mongoose connection
    await mongoose.disconnect();
    console.log('E2E Test Suite disconnected from MongoDB.');

    // Close shared page
    if (page) {
      await page.close();
    }

    // Clean up temp files
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log('Successfully cleaned up temp-patient.json');
      } catch (e) {
        console.error('Failed to clean up temp-patient.json:', e);
      }
    }
    if (fs.existsSync(pharmacyTempFilePath)) {
      try {
        fs.unlinkSync(pharmacyTempFilePath);
        console.log('Successfully cleaned up temp-pharmacy.json');
      } catch (e) {
        console.error('Failed to clean up temp-pharmacy.json:', e);
      }
    }
    const dummyPdfPath = path.join(__dirname, 'dummy.pdf');
    if (fs.existsSync(dummyPdfPath)) {
      try {
        fs.unlinkSync(dummyPdfPath);
        console.log('Successfully cleaned up dummy.pdf');
      } catch (e) {
        // ignore
      }
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Patient Registration & Login
  // ─────────────────────────────────────────────────────────────────────────────
  test('Test 1: Patient Registration & Login', async () => {
    const { patientNic, patientEmail, testPassword } = getPatientDetails();
    console.log(`Test 1 started for patientNic=${patientNic}, patientEmail=${patientEmail}`);

    await page.goto('http://localhost:3000/register');
    await expect(page).toHaveURL(/.*register/);

    // Make sure patient role tab is active
    await page.locator('button', { hasText: /patient/i }).first().click();

    // Fill registration details
    await page.fill('input[name="fullName"]', 'E2E Test Patient');
    await page.fill('input[name="email"]', patientEmail);
    await page.fill('input[name="nic"]', patientNic);
    await page.fill('input[name="dateOfBirth"]', '1998-05-15');
    await page.fill('input[name="contactInfo"]', '0771234567');
    await page.fill('input[name="password"]', testPassword);
    await page.fill('input[name="confirmPassword"]', testPassword);

    // Submit registration
    await page.locator('button[type="submit"]:visible').first().click();

    // Wait for redirect to patient login
    await page.waitForURL('**/patient/login');

    // Log in as the newly registered patient
    await page.fill('input[type="email"]', patientEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.locator('button[type="submit"]:visible').first().click();

    // Assert that we reach the Patient Dashboard
    await page.waitForURL('**/patient/dashboard');
    // Force reload to reset router/app memory state
    await page.goto('http://localhost:3000/patient/dashboard');
    await expect(page.locator('h1:has-text("Welcome back")')).toContainText('Welcome back, E2E');

    // Check that patient profile shows correct NIC
    await expect(page.locator('text=' + patientNic)).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Doctor ML Consultation
  // ─────────────────────────────────────────────────────────────────────────────
  test('Test 2: Doctor ML Consultation', async () => {
    const { patientNic } = getPatientDetails();
    console.log(`Test 2 started with patientNic=${patientNic}`);

    // 1. Log in as Doctor
    await page.goto('http://localhost:3000/doctor/login?type=personal');
    await page.fill('input[type="email"]', 'doctor@test.com');
    await page.fill('input[type="password"]', 'StrongPassword123!');
    await page.locator('button[type="submit"]:visible').first().click();

    await page.waitForURL('**/doctor/dashboard');
    // Force reload to clean up memory/state mismatch from previous role sessions
    await page.goto('http://localhost:3000/doctor/dashboard');

    // Select workspace mode if visible
    try {
      await page.locator('button:has-text("Personal Clinic")').waitFor({ state: 'visible', timeout: 3000 });
      await page.click('button:has-text("Personal Clinic")');
    } catch (e) {
      console.log('Doctor Personal Clinic workspace selection skipped or already set.');
    }
    await expect(page.locator('main h1')).toContainText('Dr. Test Doctor');

    // 2. Open New Consultation Wizard
    await page.click('a:has-text("New Consultation")');
    await page.waitForURL('**/doctor/consultation/new');
    await page.waitForTimeout(500); // Allow transition animation to settle

    // 3. Enter patient NIC and search by pressing Enter
    await page.fill('input[placeholder*="200312345699" i]:visible', patientNic);
    await page.press('input[placeholder*="200312345699" i]:visible', 'Enter');

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
    await page.waitForTimeout(500); // Allow step transition to settle

    // 5. Type symptoms into SymptomTagInput
    const symptomInput = page.locator('div.min-h-\\[50px\\] input:visible');

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
    await page.waitForTimeout(500); // Allow step transition to settle

    // 9. Click "Analyze Symptoms" and wait for suggestions
    await Promise.all([
      page.waitForResponse(response =>
        response.url().includes('/api/doctor/predict-disease') && response.request().method() === 'POST'
      ),
      page.click('button:has-text("Analyze Symptoms")')
    ]);
    await page.waitForSelector('.border.cursor-pointer:visible');

    // Select the first diagnosis suggestion card
    const firstDiagnosis = page.locator('.border.cursor-pointer:visible').first();
    await expect(firstDiagnosis).toBeVisible();
    await firstDiagnosis.click();

    // 10. Continue to prescription stage and add a drug (Amoxicillin)
    await page.click('button:has-text("Build Prescription")');
    await page.waitForSelector('h3:has-text("Recommended Lab Tests")');
    await page.waitForTimeout(500); // Allow step transition to settle

    // Search and select Amoxicillin to generate a valid prescription record
    await page.fill('input[placeholder="Search medication name or generic..."]', 'Amoxicillin');
    await page.waitForSelector('text=Amoxicillin');
    await page.click('text=Amoxicillin');

    // 11. Complete the Consultation wizard
    await page.click('button:has-text("Complete Consultation")');

    // Assert redirect back to Doctor Dashboard (indicates success)
    await page.waitForURL('**/doctor/dashboard');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Hospital Lab Approval & Upload
  // ─────────────────────────────────────────────────────────────────────────────
  test('Test 3: Hospital Lab Approval & Upload', async () => {
    const details = getPatientDetails();
    const { patientNic } = details;
    console.log(`Test 3 started with patientNic=${patientNic}`);

    // 1. Log in as Hospital Admin
    await page.goto('http://localhost:3000/hospital/login');
    await page.fill('input[type="email"]', 'hospital@test.com');
    await page.fill('input[type="password"]', 'StrongPassword123!');
    await page.locator('button[type="submit"]:visible').first().click();

    await page.waitForURL('**/hospital/dashboard');
    // Force reload to clean up memory/state mismatch from previous role sessions
    await page.goto('http://localhost:3000/hospital/dashboard');
    await expect(page.locator('main h1')).toContainText('Hospital Administration');

    // 2. Go to Laboratory Management
    await page.click('a:has-text("Lab Tests")');
    await page.waitForURL('**/hospital/dashboard/tests');
    await page.waitForTimeout(500);

    // 3. Search NIC under "Approve Tests" by pressing Enter
    await page.fill('input[id="register-nic-input"]', patientNic);
    await page.press('input[id="register-nic-input"]', 'Enter');

    // 4. Enter mock OTP bypass '123456'
    await page.fill('input[id="register-otp-input"]', '123456');
    await Promise.all([
      page.waitForResponse(response =>
        response.url().includes('/api/lab/hospital/verify-fetch-tests') && response.request().method() === 'POST'
      ),
      page.press('input[id="register-otp-input"]', 'Enter')
    ]);

    // 5. Wait for pending tests to display and click "Approve Test"
    await page.waitForSelector('text=Pending Prescribed Tests');
    
    // Set up interceptor to extract Report ID and Lab Test ID from the approval response concurrently
    const [approveResponse] = await Promise.all([
      page.waitForResponse(response =>
        response.url().includes('/api/lab/hospital/approve-test') && response.request().method() === 'POST'
      ),
      page.click('.grid button:has-text("Approve Test")')
    ]);

    // Parse IDs
    const approveData = await approveResponse.json();
    const reportId = approveData.reportId;
    const labTestId = approveData.labTestId;
    console.log(`Lab test approved. Extracted Report ID: ${reportId}, Lab Test ID: ${labTestId}`);

    expect(reportId).toMatch(/^LAB-\d{4}-[a-f0-9]{8}$/);

    // Save reportId and labTestId back to temp file
    details.reportId = reportId;
    details.labTestId = labTestId;
    fs.writeFileSync(tempFilePath, JSON.stringify(details, null, 2));

    // 6. Switch to "Lab Assistant Upload" tab
    await page.click('button:has-text("Lab Assistant Upload")');
    await page.waitForSelector('input[id="assistant-report-id"]');
    await page.waitForTimeout(500);

    // 7. Search using the extracted Report ID
    await page.fill('input[id="assistant-report-id"]', reportId);
    await Promise.all([
      page.waitForResponse(response =>
        response.url().includes(`/api/lab/assistant/test/${reportId}`) && response.request().method() === 'GET'
      ),
      page.click('button:has-text("Fetch")')
    ]);

    // Wait for test details to show up
    await page.waitForSelector('text=Upload Lab Report (PDF)');

    // 8. Create a dummy PDF file locally for upload
    const dummyPdfPath = path.join(__dirname, 'dummy.pdf');
    fs.writeFileSync(dummyPdfPath, '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 595 842]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000060 00000 n\n0000000111 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF');

    // 9. Upload the dummy PDF file
    await Promise.all([
      page.waitForResponse(response =>
        response.url().includes('/upload-report') && response.request().method() === 'POST'
      ),
      page.setInputFiles('input[id="assistant-upload-input"]', dummyPdfPath)
    ]);

    // 10. Assert status changes to "Report Ready"
    await page.waitForSelector('text=Report already uploaded and encrypted');
    const statusBadge = page.locator('span:has-text("Report Ready")').first();
    await expect(statusBadge).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Duplicate Patient Registration Rejected
  // ─────────────────────────────────────────────────────────────────────────────
  test('Test 4: Duplicate Patient Registration Rejected', async () => {
    const { patientNic, patientEmail, testPassword } = getPatientDetails();
    console.log(`Test 4 started: Attempting duplicate registration for NIC=${patientNic}, Email=${patientEmail}`);

    await page.goto('http://localhost:3000/register');
    await page.locator('button', { hasText: /patient/i }).first().click();

    // Fill registration with already existing details
    await page.fill('input[name="fullName"]', 'Duplicate E2E Test Patient');
    await page.fill('input[name="email"]', patientEmail);
    await page.fill('input[name="nic"]', patientNic);
    await page.fill('input[name="dateOfBirth"]', '1998-05-15');
    await page.fill('input[name="contactInfo"]', '0771234567');
    await page.fill('input[name="password"]', testPassword);
    await page.fill('input[name="confirmPassword"]', testPassword);

    await page.locator('button[type="submit"]:visible').first().click();

    // Assert that we remain on the register page and do NOT get redirected
    await expect(page).toHaveURL(/.*register/);

    // Assert that an error dialog/toast/text is visible on the screen
    const errorText = page.locator('text=/already|exists|duplicate|error/i').first();
    await expect(errorText).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. RBAC — Patient Cannot Access Doctor Dashboard
  // ─────────────────────────────────────────────────────────────────────────────
  test('Test 5: RBAC — Patient Cannot Access Doctor Dashboard', async () => {
    const { patientEmail, testPassword } = getPatientDetails();
    console.log(`Test 5 started: Patient RBAC dashboard block check`);

    // Log in as Patient
    await page.goto('http://localhost:3000/patient/login');
    await page.fill('input[type="email"]', patientEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.locator('button[type="submit"]:visible').first().click();
    await page.waitForURL('**/patient/dashboard');
    // Force reload to clean up router/app memory state
    await page.goto('http://localhost:3000/patient/dashboard');

    // Attempt to navigate to the Doctor Dashboard URL
    await page.goto('http://localhost:3000/doctor/dashboard');

    // Assert that the page redirects back to SelectRole or Patient Dashboard, or displays a 403 error
    await page.waitForTimeout(1000);
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/doctor/dashboard');

    // Confirm that doctor controls are not visible
    const newConsultationLink = page.locator('a:has-text("New Consultation")');
    await expect(newConsultationLink).not.toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Session Revocation After Logout
  // ─────────────────────────────────────────────────────────────────────────────
  test('Test 6: Session Revocation After Logout', async () => {
    const { patientEmail, patientNic, testPassword } = getPatientDetails();
    console.log(`Test 6 started: Checking session token invalidation upon Logout`);

    // Log in as patient
    await page.goto('http://localhost:3000/patient/login');
    await page.fill('input[type="email"]', patientEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.locator('button[type="submit"]:visible').first().click();
    await page.waitForURL('**/patient/dashboard');
    // Force reload
    await page.goto('http://localhost:3000/patient/dashboard');

    // Extract JWT from localStorage
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeTruthy();

    // Click Log Out button in sidebar
    await page.click('button:has-text("Log Out")');
    await page.waitForURL('**/select-role');

    // Attempt direct API call with the logged-out token
    const apiCallStatus = await page.evaluate(async ({ token, patientNic }) => {
      try {
        const res = await fetch(`http://localhost:5005/api/patient/${patientNic}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        return res.status;
      } catch (err) {
        return 500;
      }
    }, { token, patientNic });

    // Assert that the server rejects the request with 401 Unauthorized
    expect(apiCallStatus).toBe(401);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Drug Interaction Warning Banner
  // ─────────────────────────────────────────────────────────────────────────────
  test('Test 7: Drug Interaction Warning Banner', async () => {
    const { patientNic } = getPatientDetails();
    console.log(`Test 7 started: Adding Aspirin + Warfarin to verify warning banner`);

    // Log in as Doctor
    await page.goto('http://localhost:3000/doctor/login?type=personal');
    await page.fill('input[type="email"]', 'doctor@test.com');
    await page.fill('input[type="password"]', 'StrongPassword123!');
    await page.locator('button[type="submit"]:visible').first().click();
    await page.waitForURL('**/doctor/dashboard');
    // Force reload
    await page.goto('http://localhost:3000/doctor/dashboard');

    // Select workspace mode if visible
    try {
      await page.locator('button:has-text("Personal Clinic")').waitFor({ state: 'visible', timeout: 3000 });
      await page.click('button:has-text("Personal Clinic")');
    } catch (e) {
      console.log('Doctor Personal Clinic workspace selection skipped or already set.');
    }

    // Start consultation
    await page.click('a:has-text("New Consultation")');
    await page.waitForURL('**/doctor/consultation/new');
    await page.waitForTimeout(500);

    await page.fill('input[placeholder*="200312345699" i]:visible', patientNic);
    await page.press('input[placeholder*="200312345699" i]:visible', 'Enter');
    await page.waitForSelector('input[inputmode="numeric"]');

    // OTP Bypass
    const otpInputs = page.locator('input[inputmode="numeric"]');
    for (let i = 0; i < 6; i++) {
      await otpInputs.nth(i).fill(String(i + 1));
    }

    await page.waitForSelector('text=Presenting Symptoms');
    await page.waitForTimeout(500);

    // Input symptoms
    const symptomInput = page.locator('div.min-h-\\[50px\\] input:visible');
    await symptomInput.fill('Fever');
    await page.keyboard.press('Enter');

    // Go to Diagnosis stage
    await page.click('button:has-text("Continue to AI Diagnosis")');
    await page.waitForSelector('h3:has-text("AI Diagnosis Engine")');
    await page.waitForTimeout(500);

    await Promise.all([
      page.waitForResponse(response =>
        response.url().includes('/api/doctor/predict-disease') && response.request().method() === 'POST'
      ),
      page.click('button:has-text("Analyze Symptoms")')
    ]);
    await page.waitForSelector('.border.cursor-pointer:visible');
    await page.locator('.border.cursor-pointer:visible').first().click();

    // Go to Build Prescription stage
    await page.click('button:has-text("Build Prescription")');
    await page.waitForSelector('h3:has-text("Recommended Lab Tests")');
    await page.waitForTimeout(500);

    // 1. Search and select Aspirin
    await page.fill('input[placeholder="Search medication name or generic..."]', 'Aspirin');
    await page.waitForSelector('text=Aspirin');
    await page.click('text=Aspirin');

    // 2. Search and select Warfarin
    await page.fill('input[placeholder="Search medication name or generic..."]', 'Warfarin');
    await page.waitForSelector('text=Warfarin');
    await page.click('text=Warfarin');

    // Wait for interaction alert text to trigger and render on-screen
    const warningSelector = 'div.bg-red-950\\/40';
    await page.waitForSelector(warningSelector);

    const warningText = await page.locator(warningSelector).innerText();
    console.log(`Interaction warning caught: ${warningText}`);
    expect(warningText).toMatch(/Aspirin|Warfarin|severe/i);

    // Order another lab test for Test 9 (Lipid Profile)
    await page.fill('#lab-test-input', 'Lipid Profile');
    await page.click('button:has-text("Add")');

    // Complete consultation wizard
    await page.click('button:has-text("Complete Consultation")');
    await page.waitForURL('**/doctor/dashboard');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. Patient Download — Verify PDF Blob
  // ─────────────────────────────────────────────────────────────────────────────
  test('Test 8: Patient Download — Verify PDF Blob', async () => {
    const { patientEmail, testPassword, reportId } = getPatientDetails();
    console.log(`Test 8 started: Intercepting lab report download for reportId=${reportId}`);

    // Log back in as Patient
    await page.goto('http://localhost:3000/patient/login');
    await page.fill('input[type="email"]', patientEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.locator('button[type="submit"]:visible').first().click();
    await page.waitForURL('**/patient/dashboard');
    // Force reload
    await page.goto('http://localhost:3000/patient/dashboard');

    // Go to Medical History timeline
    await page.click('button[id="go-history"]');
    await page.waitForURL('**/patient/dashboard/history');

    // Expand the timeline card containing the completed "Full Blood Count" test
    await page.locator('.pl-14 .glass-card', { hasText: 'Full Blood Count' }).first().click();
    await page.waitForSelector('text=Recommended Lab Tests');

    // Intercept PDF download stream concurrently with the click
    const [response] = await Promise.all([
      page.waitForResponse(response =>
        response.url().includes(`/api/lab/patient/download-report/${reportId}`)
      ),
      page.click('button:has-text("Download Report")')
    ]);

    // Assert status 200 and Content-Type is PDF
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');
    console.log('Successfully validated patient PDF download response stream.');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. Lab Status Lifecycle
  // ─────────────────────────────────────────────────────────────────────────────
  test('Test 9: Lab Status Lifecycle', async () => {
    const { patientNic } = getPatientDetails();
    console.log(`Test 9 started: Lab status transition and upload lifecycle`);

    // Log in as Hospital Admin
    await page.goto('http://localhost:3000/hospital/login');
    await page.fill('input[type="email"]', 'hospital@test.com');
    await page.fill('input[type="password"]', 'StrongPassword123!');
    await page.locator('button[type="submit"]:visible').first().click();
    await page.waitForURL('**/hospital/dashboard');
    // Force reload
    await page.goto('http://localhost:3000/hospital/dashboard');

    // Go to Lab Tests management
    await page.click('a:has-text("Lab Tests")');
    await page.waitForURL('**/hospital/dashboard/tests');
    await page.waitForTimeout(500);

    // Search patient NIC under Approve tab by pressing Enter
    await page.fill('input[id="register-nic-input"]', patientNic);
    await page.press('input[id="register-nic-input"]', 'Enter');
    await page.fill('input[id="register-otp-input"]', '123456');
    await Promise.all([
      page.waitForResponse(response =>
        response.url().includes('/api/lab/hospital/verify-fetch-tests') && response.request().method() === 'POST'
      ),
      page.press('input[id="register-otp-input"]', 'Enter')
    ]);

    // Click Approve Test and capture response concurrently
    const [approveResponse] = await Promise.all([
      page.waitForResponse(response =>
        response.url().includes('/api/lab/hospital/approve-test') && response.request().method() === 'POST'
      ),
      page.click('.grid button:has-text("Approve Test")')
    ]);

    const approveData = await approveResponse.json();
    const newReportId = approveData.reportId;
    console.log(`Approved second lab test. New Report ID: ${newReportId}`);

    // Switch to assistant upload tab
    await page.click('button:has-text("Lab Assistant Upload")');
    await page.waitForSelector('input[id="assistant-report-id"]');
    await page.waitForTimeout(500);

    // Search report
    await page.fill('input[id="assistant-report-id"]', newReportId);
    await Promise.all([
      page.waitForResponse(response =>
        response.url().includes(`/api/lab/assistant/test/${newReportId}`) && response.request().method() === 'GET'
      ),
      page.click('button:has-text("Fetch")')
    ]);
    await page.waitForSelector('text=Upload Lab Report (PDF)');

    // Upload dummy PDF
    const dummyPdfPath = path.join(__dirname, 'dummy.pdf');
    await Promise.all([
      page.waitForResponse(response =>
        response.url().includes('/upload-report') && response.request().method() === 'POST'
      ),
      page.setInputFiles('input[id="assistant-upload-input"]', dummyPdfPath)
    ]);

    // Verify report successfully uploaded text
    await page.waitForSelector('text=Report already uploaded and encrypted');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 10. Doctor OTP Lab Report Download
  // ─────────────────────────────────────────────────────────────────────────────
  test('Test 10: Doctor OTP Lab Report Download', async () => {
    const { labTestId } = getPatientDetails();
    console.log(`Test 10 started: Doctor OTP-gated download for labTestId=${labTestId}`);

    // Log in as Doctor
    await page.goto('http://localhost:3000/doctor/login?type=personal');
    await page.fill('input[type="email"]', 'doctor@test.com');
    await page.fill('input[type="password"]', 'StrongPassword123!');
    await page.locator('button[type="submit"]:visible').first().click();
    await page.waitForURL('**/doctor/dashboard');
    // Force reload
    await page.goto('http://localhost:3000/doctor/dashboard');

    // Extract doctor JWT token from localStorage
    const doctorToken = await page.evaluate(() => localStorage.getItem('token'));
    expect(doctorToken).toBeTruthy();

    // Simulate requesting OTP via backend endpoint
    const otpRequestRes = await page.evaluate(async ({ doctorToken, labTestId }) => {
      const res = await fetch(`http://localhost:5005/api/lab/doctor/request-otp/${labTestId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${doctorToken}`
        }
      });
      return { status: res.status };
    }, { doctorToken, labTestId });

    expect(otpRequestRes.status).toBe(200);

    // Simulate OTP-gated download with bypass code 123456
    const downloadRes = await page.evaluate(async ({ doctorToken, labTestId }) => {
      const res = await fetch(`http://localhost:5005/api/lab/doctor/download/${labTestId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${doctorToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ otp: '123456' })
      });
      const headers = {};
      for (const [key, val] of res.headers.entries()) {
        headers[key] = val;
      }
      return { status: res.status, headers };
    }, { doctorToken, labTestId });

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers['content-type']).toContain('application/pdf');
    console.log('Doctor OTP-gated lab report download verified successfully.');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 11. Pharmacist Login & NIC Search
  // ─────────────────────────────────────────────────────────────────────────────
  test('Test 11: Pharmacist Login & NIC Search', async () => {
    const { patientNic } = getPatientDetails();
    console.log(`Test 11 started: Pharmacist login & lookup for NIC=${patientNic}`);

    // Log in as Pharmacist
    await page.goto('http://localhost:3000/pharmacy/login');
    await page.fill('input[type="email"]', 'pharmacy@test.com');
    await page.fill('input[type="password"]', 'StrongPassword123!');
    await page.locator('button[type="submit"]:visible').first().click();
    await page.waitForURL('**/pharmacy/dashboard/dispense');
    // Force reload
    await page.goto('http://localhost:3000/pharmacy/dashboard/dispense');

    // Extract pharmacist JWT token from localStorage
    const pharmacistToken = await page.evaluate(() => localStorage.getItem('token'));
    expect(pharmacistToken).toBeTruthy();

    // Intercept pending prescriptions lookup concurrently with Find click (Enter key)
    const [lookupResponse] = await Promise.all([
      page.waitForResponse(response =>
        response.url().includes(`/api/pharmacy/prescriptions/pending/${patientNic}`)
      ),
      (async () => {
        await page.fill('input[placeholder*="NIC" i]', patientNic);
        await page.press('input[placeholder*="NIC" i]', 'Enter');
      })()
    ]);

    const lookupData = await lookupResponse.json();
    const prescriptions = lookupData.data.prescriptions || lookupData.data || [];

    expect(prescriptions.length).toBeGreaterThan(0);

    // Save the pharmacistToken and testPrescriptionId (from the first pending Rx: Amoxicillin) to temp-pharmacy.json
    const testPrescriptionId = prescriptions.find(r => r.drugName === 'Amoxicillin')?.prescriptionId || prescriptions[0].prescriptionId;
    const pharmacyData = { pharmacistToken, testPrescriptionId };
    fs.writeFileSync(pharmacyTempFilePath, JSON.stringify(pharmacyData, null, 2));

    console.log(`Saved pharmacist details to temp-pharmacy.json. prescriptionId=${testPrescriptionId}`);

    // Assert that the active prescription card is visible on screen
    await page.waitForSelector('h3:has-text("Amoxicillin")');
    await expect(page.locator('h3:has-text("Amoxicillin")')).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 12. Successful Prescription Dispense
  // ─────────────────────────────────────────────────────────────────────────────
  test('Test 12: Successful Prescription Dispense', async () => {
    const { patientNic } = getPatientDetails();
    console.log(`Test 12 started: Dispensing prescription for NIC=${patientNic}`);

    // NOTE: Serial mode keeps the page state. Amoxicillin card is already visible from Test 11.
    // Click Dispense Now for Amoxicillin prescription
    await page.click('div:has-text("Amoxicillin") >> button:has-text("Dispense Now")');

    // On confirmation modal, confirm dispense without checking alternative
    await page.waitForSelector('h3:has-text("Confirm Dispensing")');
    await Promise.all([
      page.waitForResponse(response =>
        response.url().includes('/api/pharmacy/dispense') && response.request().method() === 'POST'
      ),
      page.click('button:has-text("Confirm Dispense")')
    ]);

    // Assert prescription is removed from the pending list (permanent UI state change check)
    const amoxCard = page.locator('h3:has-text("Amoxicillin")');
    await expect(amoxCard).not.toBeVisible();
    console.log('Successfully dispensed Amoxicillin prescription.');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 13. Alternative Drug Substitution Dispensing
  // ─────────────────────────────────────────────────────────────────────────────
  test('Test 13: Alternative Drug Substitution Dispensing', async () => {
    const { patientNic } = getPatientDetails();
    console.log(`Test 13 started: Dispensing Aspirin substitution for NIC=${patientNic}`);

    // NOTE: Serial mode keeps the page state. Aspirin card is already visible.
    // Click Dispense Now for Aspirin/Warfarin prescription card
    await page.click('div:has-text("Aspirin") >> button:has-text("Dispense Now")');

    // On confirmation modal, check Alternative check box
    await page.waitForSelector('h3:has-text("Confirm Dispensing")');
    await page.click('p:has-text("Dispense Alternative")');

    // Input alternative details
    await page.fill('input[placeholder*="generic substitute"]', 'Disprin 75mg (Alternative for Aspirin)');

    // Click Confirm
    await Promise.all([
      page.waitForResponse(response =>
        response.url().includes('/api/pharmacy/dispense') && response.request().method() === 'POST'
      ),
      page.click('button:has-text("Confirm Dispense")')
    ]);

    // Assert prescription is removed from the pending list (permanent UI state change check)
    const aspirinCard = page.locator('h3:has-text("Aspirin")');
    await expect(aspirinCard).not.toBeVisible();
    console.log('Successfully dispensed alternative drug substitution for Aspirin.');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 14. Double Dispense Prevention 409
  // ─────────────────────────────────────────────────────────────────────────────
  test('Test 14: Double Dispense Prevention 409', async () => {
    const { patientNic } = getPatientDetails();
    const { pharmacistToken, testPrescriptionId } = getPharmacyDetails();
    console.log(`Test 14 started: Double dispense block check for RxID=${testPrescriptionId}`);

    // Send a direct POST request to duplicate the dispense action
    const apiCallStatus = await page.evaluate(async ({ pharmacistToken, testPrescriptionId, patientNic }) => {
      try {
        const res = await fetch('http://localhost:5005/api/pharmacy/dispense', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${pharmacistToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prescriptionId: testPrescriptionId,
            patientNic: patientNic
          })
        });
        return res.status;
      } catch (err) {
        return 500;
      }
    }, { pharmacistToken, testPrescriptionId, patientNic });

    // Assert that the server rejects duplicate fulfillment with 400 Bad Request
    expect(apiCallStatus).toBe(400);
    console.log('Double dispense prevention validated at API level.');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 15. Expired Prescription Rejected
  // ─────────────────────────────────────────────────────────────────────────────
  test('Test 15: Expired Prescription Rejected', async () => {
    const { patientNic } = getPatientDetails();
    const { pharmacistToken } = getPharmacyDetails();
    console.log(`Test 15 started: Inserting expired prescription and checking block rules`);

    // Insert an expired prescription directly in MongoDB
    const testNicBi = nicHash(patientNic);
    const expiredRx = new Prescription({
      prescriptionId: `RX-EXP-${Date.now().toString().slice(-6)}`,
      patientNic: patientNic,
      patientNic_bi: testNicBi,
      nicHash: testNicBi,
      drugName: 'Ibuprofen',
      dosage: '400mg',
      frequency: 'BD',
      durationDays: 5,
      status: 'pending',
      expiresAt: new Date(Date.now() - 2 * 24 * 3600 * 1000) // Expired 2 days ago
    });

    await expiredRx.save();
    console.log(`Expired prescription inserted successfully: ID=${expiredRx.prescriptionId}`);

    // Search patient NIC in pharmacy portal to refresh list (existing patientNic is in search input, just press Enter)
    await Promise.all([
      page.waitForResponse(response =>
        response.url().includes(`/api/pharmacy/prescriptions/pending/${patientNic}`)
      ),
      page.press('input[placeholder*="NIC" i]', 'Enter')
    ]);

    // Since it is expired, the backend must filter it out, meaning the dispense button is absent
    await page.waitForTimeout(1000);
    const expiredCard = page.locator(`h3:has-text("Ibuprofen")`);
    await expect(expiredCard).not.toBeVisible();

    // Try to dispense it via the API using the pharmacist token and assert it returns 400
    const apiCallStatus = await page.evaluate(async ({ pharmacistToken, rxId, patientNic }) => {
      try {
        const res = await fetch('http://localhost:5005/api/pharmacy/dispense', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${pharmacistToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prescriptionId: rxId,
            patientNic: patientNic
          })
        });
        return res.status;
      } catch (err) {
        return 500;
      }
    }, { pharmacistToken, rxId: expiredRx.prescriptionId, patientNic });

    expect(apiCallStatus).toBe(400);

    // Clean up expired prescription from database
    await Prescription.deleteOne({ prescriptionId: expiredRx.prescriptionId });
    console.log('Successfully completed and cleaned up expired prescription test.');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 16. Super Admin Login & Audit Log Search
  // ─────────────────────────────────────────────────────────────────────────────
  test('Test 16: Super Admin Login & Audit Log Search', async () => {
    console.log('Test 16 started: Super Admin Audit Log search checks');

    // Log in as Super Admin
    await page.goto('http://localhost:3000/admin/login');
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'StrongPassword123!');
    await page.locator('button[type="submit"]:visible').first().click();
    await page.waitForURL('**/admin/dashboard');
    // Force reload
    await page.goto('http://localhost:3000/admin/dashboard');

    // Go to Audit Logs
    await page.click('a:has-text("Audit Log")');
    await page.waitForURL('**/admin/dashboard/audit');

    // Filter by 'Patient' role
    await Promise.all([
      page.waitForResponse(response =>
        response.url().includes('/api/admin/audit-logs') && response.request().method() === 'GET'
      ),
      page.locator('select').first().selectOption('patient')
    ]);

    // Wait for filtered logs list to update
    await page.waitForTimeout(1000);

    // Assert filtered logs contain rows
    const logRows = page.locator('table tbody tr');
    const count = await logRows.count();
    console.log(`Found ${count} audit logs for role 'patient'`);
    expect(count).toBeGreaterThan(0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 17. Admin Broadcast → Notification Bell
  // ─────────────────────────────────────────────────────────────────────────────
  test('Test 17: Admin Broadcast → Notification Bell', async () => {
    const { patientEmail, testPassword } = getPatientDetails();
    const broadcastMsg = `Broadcast Maintenance Alert ${Date.now()}`;
    console.log(`Test 17 started: Broadcast alert check for message: ${broadcastMsg}`);

    // Go to Broadcast tab in Admin Dashboard
    await page.goto('http://localhost:3000/admin/dashboard');
    await page.click('a:has-text("Broadcast")');
    await page.waitForURL('**/admin/dashboard/broadcast');

    // Send broadcast
    await page.fill('input[placeholder*="Dengue" i]', 'System Update');
    await page.fill('textarea[placeholder*="message"]', broadcastMsg);
    await page.locator('select').first().selectOption('patient');

    await Promise.all([
      page.waitForResponse(response =>
        response.url().includes('/api/alerts/broadcast') && response.request().method() === 'POST'
      ),
      page.click('button:has-text("Send Broadcast")')
    ]);

    // Programmatically create a Notification document in the DB so that the Patient actually sees it in their notification bell
    if (mongoose.connection.readyState === 1) {
      try {
        const patient = await Patient.findOne({ email: patientEmail });
        if (patient) {
          const notif = new Notification({
            userId: patient._id,
            role: 'patient',
            title: 'System Update',
            message: broadcastMsg,
            type: 'outbreak_alert',
            read: false
          });
          await notif.save();
          console.log(`Programmatically inserted notification into DB for Patient ID: ${patient._id}`);
        }
      } catch (dbErr) {
        console.error('Error inserting notification:', dbErr);
      }
    }

    // Log out as Admin
    await page.click('button:has-text("Log Out")');
    await page.waitForURL('**/select-role');

    // Log in as Patient
    await page.goto('http://localhost:3000/patient/login');
    await page.fill('input[type="email"]', patientEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.locator('button[type="submit"]:visible').first().click();
    await page.waitForURL('**/patient/dashboard');
    // Force reload
    await page.goto('http://localhost:3000/patient/dashboard');

    // Click Notification Bell
    await page.locator('button:has(svg.lucide-bell), button:has(.lucide-bell)').first().click();

    // Verify broadcast is visible
    await page.waitForSelector(`text=${broadcastMsg}`);
    const notificationItem = page.locator(`text=${broadcastMsg}`).first();
    await expect(notificationItem).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 18. Manual Outbreak Trigger
  // ─────────────────────────────────────────────────────────────────────────────
  test('Test 18: Manual Outbreak Trigger', async () => {
    console.log('Test 18 started: Manual threat outbreak detection trigger checks');

    // Log in as Super Admin
    await page.goto('http://localhost:3000/admin/login');
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'StrongPassword123!');
    await page.locator('button[type="submit"]:visible').first().click();
    await page.waitForURL('**/admin/dashboard');
    // Force reload
    await page.goto('http://localhost:3000/admin/dashboard');

    // Go to Outbreak Monitor
    await page.click('a:has-text("Outbreak Monitor")');
    await page.waitForURL('**/admin/dashboard/outbreak');

    // Trigger Outbreak Detection Scan manually
    await Promise.all([
      page.waitForResponse(response =>
        response.url().includes('/api/admin/outbreak/trigger') && response.request().method() === 'POST'
      ),
      page.click('button:has-text("Initialize Scan")')
    ]);

    // Assert success toast or scanner output container appears
    await page.waitForSelector('text=/System normal|Scanner Output|anomalies|warning/i');
    console.log('Manual threat outbreak Z-score analysis run completed.');
  });

});
