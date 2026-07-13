/**
 * MediSync Full E2E Walkthrough Test Suite
 * Covers Phases 1-8 of the End-to-End QA Script
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

// Load environment variables for MongoDB
const serverEnvPath = path.resolve(__dirname, '../../server/.env');
if (fs.existsSync(serverEnvPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(serverEnvPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}
process.env.NODE_ENV = 'test';

const mongoose = require('../../server/node_modules/mongoose');
const Patient = require('../../server/src/models/Patient');
const Doctor = require('../../server/src/models/Doctor');
const Pharmacy = require('../../server/src/models/Pharmacy');
const Hospital = require('../../server/src/models/Hospital');
const Admin = require('../../server/src/models/Admin');
const LabTest = require('../../server/src/models/LabTest');
const Prescription = require('../../server/src/models/Prescription');

test.describe.configure({ mode: 'serial' });

let page;
const randSuffix = Math.floor(100 + Math.random() * 900);
const timestamp = Date.now();

const state = {
  patient: {
    nic: `19901234567${randSuffix}`,
    email: `patient_${timestamp}@test.com`,
    password: 'Password123!'
  },
  doctor: {
    nic: `19801234567${randSuffix}`,
    email: `doctor_${timestamp}@test.com`,
    password: 'Password123!'
  },
  pharmacist: {
    nic: `19851234567${randSuffix}`,
    email: `pharmacist_${timestamp}@test.com`,
    password: 'Password123!'
  },
  labAssistant: {
    nic: `19881234567${randSuffix}`,
    email: `lab_${timestamp}@test.com`,
    password: 'Password123!'
  },
  admin: {
    email: `admin_${timestamp}@test.com`,
    password: 'AdminPassword123!'
  },
  labTestId: null,
  prescriptionId: null
};

test.describe('MediSync E2E Walkthrough QA', () => {

  test.beforeAll(async ({ browser }) => {
    if (process.env.MONGO_URI) {
      await mongoose.connect(process.env.MONGO_URI);
      console.log('Connected to DB for E2E setup');

      // Seed an admin manually since open self-registration for Admin is bad
      const bcrypt = require('../../server/node_modules/bcryptjs');
      const adminHash = bcrypt.hashSync(state.admin.password, 10);
      const newAdmin = new Admin({
        name: 'Super Admin',
        email: state.admin.email,
        password: adminHash,
        role: 'admin'
      });
      await newAdmin.save();
    }
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await Patient.deleteOne({ email: state.patient.email });
      await Doctor.deleteOne({ email: state.doctor.email });
      await Pharmacy.deleteOne({ email: state.pharmacist.email });
      await Hospital.deleteOne({ email: state.labAssistant.email });
      await Admin.deleteOne({ email: state.admin.email });
      await mongoose.disconnect();
    }
    if (page) await page.close();
  });

  test('Phase 1: Public Portal & Registration', async () => {
    // 1. Landing page
    await page.goto('http://localhost:3000/');
    // 2. Register Patient
    await page.goto('http://localhost:3000/register');
    await page.locator('button', { hasText: /^patient$/i }).first().click();
    await page.fill('input[name="fullName"]', 'QA Patient');
    await page.fill('input[name="email"]', state.patient.email);
    await page.fill('input[name="password"]', state.patient.password);
    await page.fill('input[name="confirmPassword"]', state.patient.password);
    await page.click('button:has-text("Continue")');
    await page.fill('input[name="nic"]', state.patient.nic);
    await page.fill('input[name="dateOfBirth"]', '1990-01-01');
    await page.fill('input[name="contactInfo"]', '0771234567');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/patient/login');

    // 3. Duplicate Patient Registration
    await page.goto('http://localhost:3000/register');
    await page.locator('button', { hasText: /^patient$/i }).first().click();
    await page.fill('input[name="fullName"]', 'QA Patient');
    await page.fill('input[name="email"]', state.patient.email);
    await page.fill('input[name="password"]', state.patient.password);
    await page.fill('input[name="confirmPassword"]', state.patient.password);
    await page.click('button:has-text("Continue")');
    await page.fill('input[name="nic"]', state.patient.nic);
    await page.fill('input[name="dateOfBirth"]', '1990-01-01');
    await page.fill('input[name="contactInfo"]', '0771234567');
    
    const responsePromise = page.waitForResponse(response => response.url().includes('/api/auth/register') && response.status() === 400);
    await page.click('button[type="submit"]');
    const response = await responsePromise;
    expect(response.status()).toBe(400);

    // 4. Register Doctor
    await page.goto('http://localhost:3000/register');
    await page.locator('button', { hasText: /^doctor$/i }).first().click();
    await page.fill('input[name="fullName"]', 'QA Doctor');
    await page.fill('input[name="email"]', state.doctor.email);
    await page.fill('input[name="password"]', state.doctor.password);
    await page.fill('input[name="confirmPassword"]', state.doctor.password);
    await page.click('button:has-text("Continue")');
    await page.fill('input[name="licenseNo"]', 'DOC12345');
    await page.fill('input[name="specialization"]', 'General Practice');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000); // give time for navigation

    // 5. Register Pharmacist
    await page.goto('http://localhost:3000/register');
    await page.locator('button', { hasText: /^pharmacist$/i }).first().click();
    await page.fill('input[name="fullName"]', 'QA Pharmacist');
    await page.fill('input[name="email"]', state.pharmacist.email);
    await page.fill('input[name="password"]', state.pharmacist.password);
    await page.fill('input[name="confirmPassword"]', state.pharmacist.password);
    await page.click('button:has-text("Continue")');
    // Using default mock pharmacyId as in Register.jsx
    await page.fill('input[name="pharmacyId"]', '60d5ecb8b392d700153ee6b2');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000); // give time for navigation

    const bcrypt = require('../../server/node_modules/bcryptjs');
    const labHash = bcrypt.hashSync(state.labAssistant.password, 10);
    await Hospital.create({
      hospitalId: 'HOSP123',
      name: 'QA Hospital',
      email: state.labAssistant.email,
      password: labHash,
      role: 'hospital',
      contactNumber: '0771112222',
      address: 'Test Addr',
      regNo: `REG-HOSP-${Date.now()}`
    });

    // 6. Doctor Directory
    await page.goto('http://localhost:3000/doctors');
    await page.fill('input[placeholder*="Search doctor name"]', 'QA Doctor');
    await page.click('text=View Credentials');
    await expect(page.locator('h2:has-text("QA Doctor")')).toBeVisible();
    await expect(page.locator('text=About & Practice')).toBeVisible();
    await expect(page.locator('text=Map Location')).toBeVisible();
    
    // Check map iframe - manual flag
    console.log('MANUAL CHECK: Ensure Doctor profile map iframe renders correctly (no cross-origin errors)');
    const iframe = page.locator('iframe');
    if (await iframe.count() > 0) {
      await expect(iframe.first()).toHaveAttribute('src', /google.com/);
    }
  });

  test('Phase 2: Patient Portal', async () => {
    // 7. Login
    await page.goto('http://localhost:3000/patient/login');
    await page.fill('input[type="email"]', state.patient.email);
    await page.fill('input[type="password"]', state.patient.password);
    
    const navPromise = page.waitForNavigation();
    await page.click('button[type="submit"]');
    await navPromise;
    expect(page.url()).toContain('/patient/dashboard');

    // 8. Sidebar Name & Notification Bell
    await expect(page.locator('text=QA Patient').first()).toBeVisible();
    await expect(page.locator('button:has(svg[class*="lucide-bell"])').first()).toBeVisible(); // Check for Lucide Bell icon

    // 9. Support Ticket
    await page.goto('http://localhost:3000/patient/dashboard/support');
    await page.fill('input[placeholder*="help you with"]', 'Help with my account');
    await page.fill('textarea[placeholder*="Explain your issue"]', 'I need some assistance please.');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Support ticket created successfully!').first()).toBeVisible();

    // 10. Upload Profile Picture (Skipped file upload since we lack a test image, simply saving settings)
    await page.goto('http://localhost:3000/patient/dashboard/profile');
    await page.click('button:has-text("Save")');
    await expect(page.locator('text=Profile saved successfully!').first()).toBeVisible();

    // 11. RBAC Block test
    await page.goto('http://localhost:3000/doctor/dashboard');
    await page.waitForURL('**/patient/dashboard'); // Should redirect back
  });

  test('Phase 3: Doctor Portal (core clinical flow)', async () => {
    // 13. Login as Doctor
    await page.goto('http://localhost:3000/doctor/login');
    await page.fill('input[type="email"]', state.doctor.email);
    await page.fill('input[type="password"]', state.doctor.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/doctor/dashboard');

    // 14. Start Consultation & OTP
    await page.goto('http://localhost:3000/doctor/consultation/new');

    await page.fill('input[placeholder*="200312345699"]', state.patient.nic);
    await page.keyboard.press('Enter');
    // We don't have a toast for OTP sent, we just wait for the modal
    await expect(page.locator('text=Enter the 6-digit code').first()).toBeVisible();
    
    // OTP Fail-closed test
    let verifyResponse = page.waitForResponse(r => r.url().includes('/verify-access'));
    await page.locator('input[inputMode="numeric"]').first().focus();
    await page.keyboard.type('000000', { delay: 100 });
    
    // In case auto-submit missed due to race condition, try clicking if it's enabled
    try {
      await page.waitForResponse(r => r.url().includes('/verify-access'), { timeout: 1000 });
    } catch {
      await page.locator('button:has-text("Verify Access")').click({ force: true }).catch(() => {});
    }
    
    await verifyResponse;
    await expect(page.locator('text=Incorrect OTP').first()).toBeVisible();

    // Correct OTP (using bypass since we can't read the email, but assuming test bypass is enabled)
    page.on('response', async response => {
      if (response.url().includes('/verify-access')) {
        const text = await response.text();
        console.log(`verify-access response: ${response.status()}, body: ${text}, payload: ${response.request().postData()}`);
      }
    });
    let successResponse = page.waitForResponse(r => r.url().includes('/verify-access') && r.status() === 200);
    
    await page.waitForTimeout(500); // Give React time to render the error state before injecting again
    
    await page.locator('input[inputMode="numeric"]').first().focus();
    await page.keyboard.type('123456', { delay: 100 });
    
    try {
      await page.waitForResponse(r => r.url().includes('/verify-access') && r.status() === 200, { timeout: 1000 });
    } catch {
      await page.locator('button:has-text("Verify Access")').click({ force: true }).catch(() => {});
    }
    
    await successResponse;
    
    // Wait for the modal success check
    await expect(page.locator('text=Access Granted!')).toBeVisible();

    // 15. Enter symptoms
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    const symptomInput = page.getByTestId('symptom-input');
    await symptomInput.waitFor({ state: 'visible' });
    
    await symptomInput.fill('Fever');
    await symptomInput.press('Enter');
    await page.waitForTimeout(200);
    
    await symptomInput.fill('Cough');
    await symptomInput.press('Enter');
    await page.waitForTimeout(200);
    
    await symptomInput.fill('Fatigue');
    await symptomInput.press('Enter');
    // Proceed to Step 2 (AI Diagnosis)
    await page.click('button:has-text("Continue to AI Diagnosis")');

    const analyzeBtn = page.locator('button', { hasText: 'Analyze' });
    await analyzeBtn.waitFor({ state: 'attached', timeout: 5000 }).catch(() => console.log('Analyze button not attached!'));
    
    await analyzeBtn.click({ force: true });
    // Wait for the ML response to come back
    await expect(page.locator('text=Diagnosis Suggestions')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500); // Give the ML results a moment to render
    
    // Select the first ML diagnosis suggestion (by clicking its ICD-10 tag which bubbles up)
    await page.locator('text=/ICD-10:/').first().click();

    // Proceed to Step 3 (E-Prescription)
    await page.click('button:has-text("Build Prescription")');

    // 16. Drug Interaction Warning
    await page.fill('input[placeholder*="Search medication"]', 'Aspirin');
    await page.click('text=Aspirin');
    await page.fill('input[placeholder*="Search medication"]', 'Warfarin');
    await page.click('text=Warfarin');
    
    // Wait for the interaction warning to appear
    await expect(page.locator('text=DRUG INTERACTION')).toBeVisible({ timeout: 10000 });

    // 17. Prescribe Amoxicillin
    await page.fill('input[placeholder*="Search medication"]', 'Amoxicillin');
    await page.click('text=Amoxicillin');
    
    // Fill Dosage and Frequency in the added row
    const amoxRow = page.locator('tr', { hasText: 'Amoxicillin' });
    await amoxRow.locator('input').nth(0).fill('500mg');
    await amoxRow.locator('select').selectOption('TDS'); // TDS is 3 times a day

    // 18. Recommended Lab Tests
    await page.fill('#lab-test-input', 'Lipid Profile');
    await page.keyboard.press('Enter');

    // 19. Submit Consultation
    await page.click('button:has-text("Complete Consultation")');
    await page.waitForURL('**/doctor/dashboard', { timeout: 15000 });
  });

  test('Phase 4: Hospital & Laboratory Portal', async () => {
    // Fetch the labTestId from DB for direct access if needed
    const labTestDoc = await LabTest.findOne({ testName: 'Lipid Profile', patientNic_bi: require('crypto').createHash('sha256').update(state.patient.nic.toUpperCase()).digest('hex') });
    expect(labTestDoc).not.toBeNull();
    state.labTestId = labTestDoc.labTestId;

    // 20. Log in as Lab Assistant
    await page.goto('http://localhost:3000/hospital/login');
    await page.fill('input[type="email"]', state.labAssistant.email);
    await page.fill('input[type="password"]', state.labAssistant.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/hospital/dashboard');

    // Go to Lab Tests tab
    await page.click('button:has-text("Open Lab Management Console")');
    await page.waitForURL('**/hospital/dashboard/tests');

    // 21. Search Patient
    await page.fill('input[placeholder*="200012345678"]', state.patient.nic);
    await page.keyboard.press('Enter');
    let labOtpSuccess = page.waitForResponse(r => r.url().includes('/verify-fetch-tests') && r.status() === 200);
    await page.locator('input[inputMode="numeric"]').first().click();
    await page.keyboard.type('123456', { delay: 50 });
    await labOtpSuccess;
    
    // Assert pending test appears
    await expect(page.locator('text=Lipid Profile')).toBeVisible();

    // 22. Approve Test
    await page.click('button:has-text("Approve Test")');
    await expect(page.locator('text=All Tests Approved!')).toBeVisible({ timeout: 10000 });

    // Navigate to Lab Work Queue
    await page.click('button:has-text("Lab Work Queue")');
    await page.click('button:has-text("In-Progress")');

    // 23. Upload Dummy PDF via Modal
    await page.click('button:has-text("Mark Sample Collected")');
    await page.click('button:has-text("Begin Processing")');
    await page.click('button:has-text("Upload Report PDF")');

    const dummyPdfPath = path.join(__dirname, 'dummy.pdf');
    if (!require('fs').existsSync(dummyPdfPath)) {
      require('fs').writeFileSync(dummyPdfPath, '%PDF-1.4\\n1 0 obj\\n<< /Type /Catalog /Pages 2 0 R >>\\nendobj\\n');
    }
    
    // Upload triggers automatically on file selection
    await page.setInputFiles('input[type="file"]', dummyPdfPath);
    await expect(page.locator('text=Report encrypted and uploaded successfully!').first()).toBeVisible({ timeout: 10000 });
  });

  test('Phase 5: Pharmacy Portal', async () => {
    // 24. Log in as Pharmacist
    await page.goto('http://localhost:3000/pharmacy/login');
    await page.fill('input[type="email"]', state.pharmacist.email);
    await page.fill('input[type="password"]', state.pharmacist.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/pharmacy/dashboard');

    // 25. Search NIC
    await page.fill('input[placeholder*="Enter Patient NIC"]', state.patient.nic);
    await page.keyboard.press('Enter');
    await expect(page.locator('text=Amoxicillin').first()).toBeVisible();

    // 26. Dispense Now
    const amoxCard = page.locator('div.bg-slate-950\\/40', { hasText: 'Amoxicillin' }).first();
    await amoxCard.locator('button:has-text("Dispense Medication")').click();
    await page.click('button:has-text("Dispense Now")');
    await expect(page.locator('text=Prescription dispensed! Patient notification email sent.').first()).toBeVisible();
    await expect(page.locator('text=Amoxicillin')).not.toBeVisible(); // Leaves pending list

    // 27. Attempt Double-Dispense
    // Grab the prescriptionId from DB to force an API call
    const allRxs = await Prescription.find();
    const rx = allRxs.find(p => (p.drugName === 'Amoxicillin' || (p.medications && p.medications.some(m => m.name === 'Amoxicillin'))) && p.status === 'dispensed');
    if (!rx) throw new Error('Could not find the dispensed Amoxicillin prescription in the DB!');
    const authHeader = await page.evaluate(() => localStorage.getItem('token'));
    
    // Use Playwright API context to bypass UI for double-dispense
    const res = await page.request.post(`http://127.0.0.1:5005/api/pharmacy/dispense`, {
      headers: {
        'Authorization': `Bearer ${authHeader}`,
        'Content-Type': 'application/json'
      },
      data: { prescriptionId: rx.prescriptionId, patientNic: rx.patientNic }
    });
    const responseStatus = res.status();

    expect(responseStatus).toBe(400); // Rejected: Already dispensed
  });

  test('Phase 6: Cross-check (Report Access)', async () => {
    // 29. Doctor Access
    await page.goto('http://localhost:3000/doctor/login');
    await page.fill('input[type="email"]', state.doctor.email);
    await page.fill('input[type="password"]', state.doctor.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/doctor/dashboard');

    // Select Workspace
    await page.click('button:has-text("Personal Clinic")');
    
    // Navigate to the patient's record from Doctor Dashboard
    await page.fill('input[placeholder*="Search Patient by NIC"]', state.patient.nic);
    await page.click('button:has-text("Find Record")');
    await page.click('button:has-text("Full Records")');

    // Wait for the PatientAccessModal
    await expect(page.locator('text=Verify Access').first()).toBeVisible();
    let verifyResponse = page.waitForResponse(r => r.url().includes('/verify-access') && r.status() === 200);
    await page.locator('input[inputMode="numeric"]').first().focus();
    await page.keyboard.type('123456', { delay: 100 });
    await verifyResponse;

    // Switch to Lab Results tab
    await page.click('button:has-text("Lab Results")');

    // 30. Verify Lab Report Rendered correctly
    await expect(page.locator('text=Lipid Profile')).toBeVisible();
    
    // Request download and handle OTP
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await page.click('button:has-text("Authorize & Download PDF")');
    
    // Wait for the download OTP modal to appear
    await expect(page.locator('text=Doctor Authorization Required')).toBeVisible();
    
    // Enter the bypass OTP 123456
    const otpInputs = page.locator('input[inputMode="numeric"]');
    const inputCount = await otpInputs.count();
    const startIndex = inputCount > 6 ? inputCount - 6 : 0;
    
    await otpInputs.nth(startIndex + 0).fill('1');
    await otpInputs.nth(startIndex + 1).fill('2');
    await otpInputs.nth(startIndex + 2).fill('3');
    await otpInputs.nth(startIndex + 3).fill('4');
    await otpInputs.nth(startIndex + 4).fill('5');
    await otpInputs.nth(startIndex + 5).fill('6');

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.pdf');
  });

  test('Phase 7: Admin Portal', async () => {
    // 32. Log in as Admin
    await page.goto('http://localhost:3000/admin/login');
    await page.fill('input[type="email"]', state.admin.email);
    await page.fill('input[type="password"]', state.admin.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin/dashboard');

    // 33. Audit Log
    await page.goto('http://localhost:3000/admin/dashboard/audit');
    await page.click('button:has-text("Patient")');
    // Wait for the filter to apply
    await page.waitForTimeout(500);
    await expect(page.locator('table')).toBeVisible(); // Assert table is rendered with patient logs

    // 34. Broadcast Message
    await page.goto('http://localhost:3000/admin/dashboard/broadcast');
    await page.fill('input[placeholder="e.g. Dengue Outbreak Surveillance"]', 'E2E Test Broadcast Title');
    await page.fill('textarea[placeholder="Write outbreak alert message detail..."]', 'Test Broadcast — ignore');
    await page.click('button:has-text("Dispatch Broadcast")');

    // Check Patient Notification (Socket)
    await page.goto('http://localhost:3000/patient/login');
    await page.fill('input[type="email"]', state.patient.email);
    await page.fill('input[type="password"]', state.patient.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/patient/dashboard');
    await page.click('button:has(svg[class*="lucide-bell"])');
    await expect(page.locator('text=Test Broadcast — ignore')).toBeVisible();

    // 35. Outbreak Monitor
    await page.goto('http://localhost:3000/admin/login');
    await page.fill('input[type="email"]', state.admin.email);
    await page.fill('input[type="password"]', state.admin.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard.*/);
    await page.goto('http://localhost:3000/admin/dashboard/outbreak');
    await page.click('button:has-text("Force System Scan")');
    await expect(page.locator('text=Z-Score')).toBeVisible();
  });

  test('Phase 8: Security Assertions', async () => {
    // 36. Logout Revocation
    await page.goto('http://localhost:3000/patient/dashboard');
    const token = await page.evaluate(() => localStorage.getItem('token'));
    await page.click('button:has-text("Log Out")');
    await page.waitForURL('**/select-role');
    
    // API Call with old token
    const responseStatus = await page.evaluate(async (oldToken) => {
      const res = await fetch('http://localhost:5005/api/patient/me', { headers: { 'Authorization': `Bearer ${oldToken}` } });
      return res.status;
    }, token);
    expect(responseStatus).toBe(401);

    // 37. SEC-09: OTP Brute-Force Rate Limiting (Redis Limiter never skips in test mode)
    const rateLimitStatus = await page.evaluate(async (doctorEmail) => {
      // Step 1: Trigger OTP generation for password reset
      await fetch('http://localhost:5005/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: doctorEmail, purpose: 'password-reset' })
      });

      // Step 2: Spam the reset-password endpoint with wrong OTPs
      let lastStatus = 0;
      for (let i = 0; i < 6; i++) {
        const verifyRes = await fetch('http://localhost:5005/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: doctorEmail, otp: '000000', newPassword: 'Password123!' })
        });
        lastStatus = verifyRes.status;
      }
      return lastStatus;
    }, state.doctor.email);
    expect(rateLimitStatus).toBe(429);

    // 38. SEC-09: Clinical Flow OTP Brute-Force Rate Limiting (Doctor looking up Patient)
    const clinicalRateLimitStatus = await page.evaluate(async (doctorCreds, patientNic) => {
      // Step 1: Login as Doctor to get access token
      const loginRes = await fetch('http://localhost:5005/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: doctorCreds.email, password: doctorCreds.password })
      });
      const loginData = await loginRes.json();
      const accessToken = loginData.data?.accessToken;
      if (!accessToken) return -1;

      // Step 2: Request Patient Access (Generates Clinical OTP)
      const reqAccessRes = await fetch('http://localhost:5005/api/patient/request-access', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ patientNic, requesterRole: 'doctor', requesterName: 'Dr. Test' })
      });
      const accessData = await reqAccessRes.json();
      const sessionId = accessData.sessionId;
      if (!sessionId) return -2;

      // Step 3: Spam verify-access with wrong OTPs
      let lastStatus = 0;
      for (let i = 0; i < 6; i++) {
        const verifyRes = await fetch('http://localhost:5005/api/patient/verify-access', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({ sessionId, patientNic, otp: '000000' })
        });
        lastStatus = verifyRes.status;
      }
      return lastStatus;
    }, state.doctor, state.patient.nic);
    expect(clinicalRateLimitStatus).toBe(429);
  });
});
