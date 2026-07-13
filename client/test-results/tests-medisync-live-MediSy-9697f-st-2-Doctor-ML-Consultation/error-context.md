# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests\medisync-live.spec.js >> MediSync E2E Live User Journeys >> Test 2: Doctor ML Consultation
- Location: tests\medisync-live.spec.js:259:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.click: Target page, context or browser has been closed
Call log:
  - waiting for locator('button:has-text("Add")')
    - locator resolved to <button tabindex="0" class="px-5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors">Add</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">…</div> intercepts pointer events
    - retrying click action
    - waiting 20ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">…</div> intercepts pointer events
  - retrying click action
    - waiting 100ms
    - waiting for element to be visible, enabled and stable
    - element is not stable
  - retrying click action
    - waiting 100ms
    44 × waiting for element to be visible, enabled and stable
       - element is visible, enabled and stable
       - scrolling into view if needed
       - done scrolling
       - <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">…</div> intercepts pointer events
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - region "Notifications Alt+T"
  - generic [ref=e5]:
    - complementary "Sidebar" [ref=e6]:
      - generic [ref=e7]:
        - generic [ref=e8]:
          - img [ref=e10]
          - generic [ref=e13]:
            - heading "Doctor Portal" [level=1] [ref=e14]
            - paragraph [ref=e15]: doctor portal
        - navigation "Primary navigation" [ref=e16]:
          - link "Dashboard" [ref=e17] [cursor=pointer]:
            - /url: /doctor/dashboard
            - img [ref=e18]
            - generic [ref=e23]: Dashboard
          - link "New Consultation" [ref=e24] [cursor=pointer]:
            - /url: /doctor/consultation/new
            - img [ref=e26]
            - generic [ref=e27]: New Consultation
            - img [ref=e28]
          - link "Patient Directory" [ref=e30] [cursor=pointer]:
            - /url: /doctor/patients
            - img [ref=e31]
            - generic [ref=e36]: Patient Directory
          - link "My Profile" [ref=e37] [cursor=pointer]:
            - /url: /doctor/profile
            - img [ref=e38]
            - generic [ref=e41]: My Profile
        - generic [ref=e42]:
          - generic [ref=e43]:
            - generic [ref=e44]: D
            - generic [ref=e45]:
              - paragraph [ref=e46]: Dr. Test Doctor
              - paragraph [ref=e47]: Verified Doctor
            - button [ref=e49] [cursor=pointer]:
              - img [ref=e50]
          - button "Log Out" [ref=e53] [cursor=pointer]:
            - img [ref=e54]
            - generic [ref=e57]: Log Out
    - generic [ref=e58]:
      - banner [ref=e59]:
        - generic [ref=e60]:
          - heading "Doctor Portal" [level=1] [ref=e61]
          - paragraph [ref=e62]: Welcome back, Dr. Test Doctor
        - generic [ref=e63]:
          - button [ref=e66] [cursor=pointer]:
            - img [ref=e67]
          - generic [ref=e70]:
            - generic [ref=e71]: D
            - generic [ref=e72]: Dr. Test Doctor
      - main [ref=e73]:
        - generic [ref=e74]:
          - generic [ref=e76]:
            - heading "New Consultation" [level=1] [ref=e77]
            - paragraph [ref=e78]: Complete the wizard to record a clinical assessment.
          - generic [ref=e79]:
            - generic [ref=e80]:
              - generic [ref=e81]:
                - img [ref=e83]
                - generic [ref=e86]: Patient & Symptoms
              - generic [ref=e88]:
                - img [ref=e90]
                - generic [ref=e92]: ML Prediction
              - generic [ref=e94]:
                - img [ref=e96]
                - generic [ref=e99]: E-Prescription
            - generic [ref=e101]:
              - generic [ref=e102]:
                - generic [ref=e103]:
                  - img [ref=e105]
                  - heading "Identify Patient" [level=2] [ref=e108]
                  - paragraph [ref=e109]: Enter the patient's NIC number to begin the consultation.
                - generic [ref=e110]:
                  - textbox "e.g. 200312345699" [ref=e111]: 888777147V
                  - button [ref=e112] [cursor=pointer]:
                    - img [ref=e113]
                - button "Verify Again" [ref=e117] [cursor=pointer]
              - generic [ref=e119]:
                - generic [ref=e120]:
                  - generic [ref=e121]:
                    - img [ref=e123]
                    - generic [ref=e125]:
                      - heading "Patient Verification Required" [level=2] [ref=e126]
                      - paragraph [ref=e127]: "NIC: 888777147V"
                  - button [ref=e128] [cursor=pointer]:
                    - img [ref=e129]
                - generic [ref=e132]:
                  - generic [ref=e133]:
                    - generic [ref=e134]:
                      - img [ref=e135]
                      - generic [ref=e138]: 9:35
                    - paragraph [ref=e139]: Enter the 6-digit code
                    - paragraph [ref=e140]: Sent to patient's registered email address
                  - generic [ref=e141]:
                    - textbox [active] [ref=e142]
                    - textbox [ref=e143]
                    - textbox [ref=e144]
                    - textbox [ref=e145]
                    - textbox [ref=e146]
                    - textbox [ref=e147]
                  - paragraph [ref=e148]: Incorrect OTP
                  - button "Verify Access" [disabled] [ref=e149]
              - generic [ref=e150]:
                - generic [ref=e151]:
                  - generic [ref=e153]:
                    - paragraph [ref=e154]: Patient
                    - paragraph [ref=e155]: E2E Test Patient (—y)
                  - generic [ref=e156]:
                    - paragraph [ref=e157]: Blood Group
                    - paragraph [ref=e158]: N/A
                  - generic [ref=e159]:
                    - paragraph [ref=e160]: Allergies
                    - paragraph [ref=e161]: None
                  - generic [ref=e162]:
                    - paragraph [ref=e163]: Chronic Conditions
                    - paragraph [ref=e164]: None
                - generic [ref=e165]:
                  - generic [ref=e166]:
                    - img [ref=e167]
                    - text: Presenting Symptoms
                  - generic [ref=e170]:
                    - generic [ref=e171]:
                      - text: Fever
                      - button [ref=e172] [cursor=pointer]:
                        - img [ref=e173]
                    - generic [ref=e176]:
                      - text: Cough
                      - button [ref=e177] [cursor=pointer]:
                        - img [ref=e178]
                    - generic [ref=e181]:
                      - text: Fatigue
                      - button [ref=e182] [cursor=pointer]:
                        - img [ref=e183]
                    - textbox [ref=e186]
                - generic [ref=e187]:
                  - generic [ref=e188]:
                    - img [ref=e189]
                    - text: Clinical Notes
                  - textbox "Detailed observation notes…" [ref=e192]: Patient exhibits mild respiratory issues.
                - generic [ref=e193]:
                  - generic [ref=e194]:
                    - img [ref=e195]
                    - text: Order Lab Tests
                  - generic [ref=e197]:
                    - textbox "e.g. Full Blood Count" [ref=e198]: Full Blood Count
                    - button "Add" [ref=e199] [cursor=pointer]
              - button "Continue to AI Diagnosis" [disabled] [ref=e201] [cursor=pointer]:
                - text: Continue to AI Diagnosis
                - img [ref=e202]
```

# Test source

```ts
  222 | 
  223 |     // Fill registration details
  224 |     await page.fill('input[name="fullName"]', 'E2E Test Patient');
  225 |     await page.fill('input[name="email"]', patientEmail);
  226 |     await page.fill('input[name="password"]', testPassword);
  227 |     await page.fill('input[name="confirmPassword"]', testPassword);
  228 |     
  229 |     await page.locator('button', { hasText: /Continue/i }).click();
  230 | 
  231 |     await page.fill('input[name="nic"]', patientNic);
  232 |     await page.fill('input[name="dateOfBirth"]', '1998-05-15');
  233 |     await page.fill('input[name="contactInfo"]', '0771234567');
  234 | 
  235 |     // Submit registration
  236 |     await page.locator('button[type="submit"]:visible').first().click();
  237 | 
  238 |     // Wait for redirect to patient login
  239 |     await page.waitForURL('**/patient/login');
  240 | 
  241 |     // Log in as the newly registered patient
  242 |     await page.fill('input[type="email"]', patientEmail);
  243 |     await page.fill('input[type="password"]', testPassword);
  244 |     await page.locator('button[type="submit"]:visible').first().click();
  245 | 
  246 |     // Assert that we reach the Patient Dashboard
  247 |     await page.waitForURL('**/patient/dashboard');
  248 |     // Force reload to reset router/app memory state
  249 |     await page.goto('http://localhost:3000/patient/dashboard');
  250 |     await expect(page.locator('h1:has-text("Welcome back")')).toContainText('Welcome back, E2E');
  251 | 
  252 |     // Check that patient profile shows correct NIC
  253 |     await expect(page.locator('text=' + patientNic)).toBeVisible();
  254 |   });
  255 | 
  256 |   // ─────────────────────────────────────────────────────────────────────────────
  257 |   // 2. Doctor ML Consultation
  258 |   // ─────────────────────────────────────────────────────────────────────────────
  259 |   test('Test 2: Doctor ML Consultation', async () => {
  260 |     const { patientNic } = getPatientDetails();
  261 |     console.log(`Test 2 started with patientNic=${patientNic}`);
  262 | 
  263 |     // 1. Log in as Doctor
  264 |     await page.goto('http://localhost:3000/doctor/login?type=personal');
  265 |     await page.fill('input[type="email"]', 'doctor@test.com');
  266 |     await page.fill('input[type="password"]', 'StrongPassword123!');
  267 |     await page.locator('button[type="submit"]:visible').first().click();
  268 | 
  269 |     await page.waitForURL('**/doctor/dashboard');
  270 |     // Force reload to clean up memory/state mismatch from previous role sessions
  271 |     await page.goto('http://localhost:3000/doctor/dashboard');
  272 | 
  273 |     // Select workspace mode if visible
  274 |     try {
  275 |       await page.locator('button:has-text("Personal Clinic")').waitFor({ state: 'visible', timeout: 3000 });
  276 |       await page.click('button:has-text("Personal Clinic")');
  277 |     } catch (e) {
  278 |       console.log('Doctor Personal Clinic workspace selection skipped or already set.');
  279 |     }
  280 |     await expect(page.locator('main h1')).toContainText('Dr. Test Doctor');
  281 | 
  282 |     // 2. Open New Consultation Wizard
  283 |     await page.click('a:has-text("New Consultation")');
  284 |     await page.waitForURL('**/doctor/consultation/new');
  285 |     await page.waitForTimeout(500); // Allow transition animation to settle
  286 | 
  287 |     // 3. Enter patient NIC and search by pressing Enter
  288 |     await page.fill('input[placeholder*="200312345699" i]:visible', patientNic);
  289 |     await page.press('input[placeholder*="200312345699" i]:visible', 'Enter');
  290 | 
  291 |     // 4. Handle OTP verification Modal (Use mock code 123456)
  292 |     await page.waitForSelector('input[inputmode="numeric"]');
  293 |     const otpInputs = page.locator('input[inputmode="numeric"]');
  294 |     await otpInputs.nth(0).fill('1');
  295 |     await otpInputs.nth(1).fill('2');
  296 |     await otpInputs.nth(2).fill('3');
  297 |     await otpInputs.nth(3).fill('4');
  298 |     await otpInputs.nth(4).fill('5');
  299 |     await otpInputs.nth(5).fill('6');
  300 | 
  301 |     // Wait for modal to verify and close
  302 |     await page.waitForSelector('text=Presenting Symptoms');
  303 |     await page.waitForTimeout(500); // Allow step transition to settle
  304 | 
  305 |     // 5. Type symptoms into SymptomTagInput
  306 |     const symptomInput = page.locator('div.min-h-\\[50px\\] input:visible');
  307 | 
  308 |     await symptomInput.fill('Fever');
  309 |     await page.keyboard.press('Enter');
  310 | 
  311 |     await symptomInput.fill('Cough');
  312 |     await page.keyboard.press('Enter');
  313 | 
  314 |     await symptomInput.fill('Fatigue');
  315 |     await page.keyboard.press('Enter');
  316 | 
  317 |     // 6. Enter clinical notes
  318 |     await page.fill('textarea[placeholder="Detailed observation notes…"]', 'Patient exhibits mild respiratory issues.');
  319 | 
  320 |     // 7. Order Lab Test "Full Blood Count"
  321 |     await page.fill('input[placeholder="e.g. Full Blood Count"]', 'Full Blood Count');
> 322 |     await page.click('button:has-text("Add")');
      |                ^ Error: page.click: Target page, context or browser has been closed
  323 | 
  324 |     // 8. Continue to AI Diagnosis page
  325 |     await page.click('button:has-text("Continue to AI Diagnosis")');
  326 |     await page.waitForSelector('h3:has-text("AI Diagnosis Engine")');
  327 |     await page.waitForTimeout(500); // Allow step transition to settle
  328 | 
  329 |     // 9. Click "Analyze Symptoms" and wait for suggestions
  330 |     await Promise.all([
  331 |       page.waitForResponse(response =>
  332 |         response.url().includes('/api/doctor/predict-disease') && response.request().method() === 'POST'
  333 |       ),
  334 |       page.click('button:has-text("Analyze Symptoms")')
  335 |     ]);
  336 |     await page.waitForSelector('.border.cursor-pointer:visible');
  337 | 
  338 |     // Select the first diagnosis suggestion card
  339 |     const firstDiagnosis = page.locator('.border.cursor-pointer:visible').first();
  340 |     await expect(firstDiagnosis).toBeVisible();
  341 |     await firstDiagnosis.click();
  342 | 
  343 |     // 10. Continue to prescription stage and add a drug (Amoxicillin)
  344 |     await page.click('button:has-text("Build Prescription")');
  345 |     await page.waitForSelector('h3:has-text("Recommended Lab Tests")');
  346 |     await page.waitForTimeout(500); // Allow step transition to settle
  347 | 
  348 |     // Search and select Amoxicillin to generate a valid prescription record
  349 |     await page.fill('input[placeholder="Search medication name or generic..."]', 'Amoxicillin');
  350 |     await page.waitForSelector('text=Amoxicillin');
  351 |     await page.click('text=Amoxicillin');
  352 | 
  353 |     // 11. Complete the Consultation wizard
  354 |     await page.click('button:has-text("Complete Consultation")');
  355 | 
  356 |     // Assert redirect back to Doctor Dashboard (indicates success)
  357 |     await page.waitForURL('**/doctor/dashboard');
  358 |   });
  359 | 
  360 |   // ─────────────────────────────────────────────────────────────────────────────
  361 |   // 3. Hospital Lab Approval & Upload
  362 |   // ─────────────────────────────────────────────────────────────────────────────
  363 |   test('Test 3: Hospital Lab Approval & Upload', async () => {
  364 |     const details = getPatientDetails();
  365 |     const { patientNic } = details;
  366 |     console.log(`Test 3 started with patientNic=${patientNic}`);
  367 | 
  368 |     // 1. Log in as Hospital Admin
  369 |     await page.goto('http://localhost:3000/hospital/login');
  370 |     await page.fill('input[type="email"]', 'hospital@test.com');
  371 |     await page.fill('input[type="password"]', 'StrongPassword123!');
  372 |     await page.locator('button[type="submit"]:visible').first().click();
  373 | 
  374 |     await page.waitForURL('**/hospital/dashboard');
  375 |     // Force reload to clean up memory/state mismatch from previous role sessions
  376 |     await page.goto('http://localhost:3000/hospital/dashboard');
  377 |     await expect(page.locator('main h1')).toContainText('Hospital Administration');
  378 | 
  379 |     // 2. Go to Laboratory Management
  380 |     await page.click('a:has-text("Lab Tests")');
  381 |     await page.waitForURL('**/hospital/dashboard/tests');
  382 |     await page.waitForTimeout(500);
  383 | 
  384 |     // 3. Search NIC under "Approve Tests" by pressing Enter
  385 |     await page.fill('input[id="register-nic-input"]', patientNic);
  386 |     await page.press('input[id="register-nic-input"]', 'Enter');
  387 | 
  388 |     // 4. Enter mock OTP bypass '123456'
  389 |     await page.fill('input[id="register-otp-input"]', '123456');
  390 |     await Promise.all([
  391 |       page.waitForResponse(response =>
  392 |         response.url().includes('/api/lab/hospital/verify-fetch-tests') && response.request().method() === 'POST'
  393 |       ),
  394 |       page.press('input[id="register-otp-input"]', 'Enter')
  395 |     ]);
  396 | 
  397 |     // 5. Wait for pending tests to display and click "Approve Test"
  398 |     await page.waitForSelector('text=Pending Prescribed Tests');
  399 |     
  400 |     // Set up interceptor to extract Report ID and Lab Test ID from the approval response concurrently
  401 |     const [approveResponse] = await Promise.all([
  402 |       page.waitForResponse(response =>
  403 |         response.url().includes('/api/lab/hospital/approve-test') && response.request().method() === 'POST'
  404 |       ),
  405 |       page.click('.grid button:has-text("Approve Test")')
  406 |     ]);
  407 | 
  408 |     // Parse IDs
  409 |     const approveData = await approveResponse.json();
  410 |     const reportId = approveData.reportId;
  411 |     const labTestId = approveData.labTestId;
  412 |     console.log(`Lab test approved. Extracted Report ID: ${reportId}, Lab Test ID: ${labTestId}`);
  413 | 
  414 |     expect(reportId).toMatch(/^LAB-\d{4}-[a-f0-9]{8}$/);
  415 | 
  416 |     // Save reportId and labTestId back to temp file
  417 |     details.reportId = reportId;
  418 |     details.labTestId = labTestId;
  419 |     fs.writeFileSync(tempFilePath, JSON.stringify(details, null, 2));
  420 | 
  421 |     // 6. Switch to "Lab Assistant Upload" tab
  422 |     await page.click('button:has-text("Lab Assistant Upload")');
```