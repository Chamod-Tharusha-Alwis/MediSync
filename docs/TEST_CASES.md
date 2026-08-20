# MediSync — Comprehensive Test Case Matrix

This document outlines the formal test case matrix for MediSync, a HIPAA-aligned, zero-trust National Health Information System. It serves as a verification blueprint for both automated end-to-end (E2E) testing and manual quality assurance.

---

## 1. Authentication & RBAC (Role-Based Access Control)

This module verifies user registration, secure multi-role login, session persistence, logout handling, and strict division of access privileges.

| Test ID | Scenario | Test Steps | Expected Result | Status / Coverage |
| :--- | :--- | :--- | :--- | :--- |
| **AUT-01** | Patient Registration & Login | 1. Navigate to `/register`. <br>2. Select "Patient" role.<br>3. Fill details (Name, Email, DOB, NIC, Contact).<br>4. Submit and log in at `/patient/login`. | User account is created successfully. Redirects to `/patient/dashboard` on successful login. | [✅ Automated (Playwright)] |
| **AUT-02** | Duplicate Patient Registration Rejected | 1. Attempt to register a patient with an already registered NIC or Email. <br>2. Submit the registration form. | System blocks registration and displays an error message ("NIC or Email already registered"). Status code `400` returned. | [✅ Automated (Playwright)] |
| **AUT-03** | RBAC — Patient Cannot Access Doctor Dashboard | 1. Log in as a Patient.<br>2. Attempt to navigate directly to `/doctor/dashboard`. | Navigation is blocked; user is redirected to `/patient/dashboard` or shown an unauthorized error. | [✅ Automated (Playwright)] |
| **AUT-04** | Session Revocation After Logout | 1. Log in as a Patient.<br>2. Click "Log Out".<br>3. Intercept and copy the session token.<br>4. Attempt a direct API call (e.g., `GET /api/patient/:nic`) with the logged-out token. | API call is rejected with status `401 Unauthorized` because the session is invalidated in the database. | [✅ Automated (Playwright)] |
| **AUT-05** | Unauthorized Role API Request Blocked | 1. Authenticate as a Patient.<br>2. Execute a raw HTTP request to `/api/doctor/consultation`. | API blocks the call with status `403 Forbidden` due to role mismatch. | [✅ Automated (Playwright)] |
| **AUT-06** | Rate-Limiter Activation on Auth Routes | 1. Trigger more than 10 login requests within 15 minutes in a production environment. | System blocks further attempts with status `429 Too Many Requests`. | [✋ Manual] |
| **AUT-07** | Invalid Password Strength Blocked | 1. Register with a weak password (e.g., `1234`). | Form validation blocks submission; password must contain at least 8 characters, a number, and a special character. | [✋ Manual] |

---

## 2. Patient Portal

This module covers patient-facing functions including viewing clinical records, secure report downloading, Socket.io real-time alerts, support ticketing, and public reviews.

| Test ID | Scenario | Test Steps | Expected Result | Status / Coverage |
| :--- | :--- | :--- | :--- | :--- |
| **PAT-01** | Patient Download — Verify PDF Blob | 1. Log in as a Patient.<br>2. Navigate to Medical History.<br>3. Click "Download Report" on an approved lab test.<br>4. Intercept the download stream. | Response status is `200` with `Content-Type: application/pdf` and contains a valid binary PDF stream. | [✅ Automated (Playwright)] |
| **PAT-02** | Real-time Notification Bell | 1. Log in as a Patient.<br>2. Open notifications panel.<br>3. Send a system broadcast from the Admin side. | The notification bell badge increments, and the broadcast alert appears instantly via Socket.io. | [✅ Automated (Playwright)] |
| **PAT-03** | Submit Support Ticket | 1. Log in as a Patient.<br>2. Navigate to support panel.<br>3. Fill subject and description, then submit. | Ticket is created and appears in the patient's active support list with status `pending`. | [✋ Manual] |
| **PAT-04** | Submit 5-Star Doctor Review | 1. Navigate to public doctor profiles.<br>2. Select a doctor.<br>3. Submit a 5-star rating with review text. | Review is stored and update appears on the doctor's public rating metrics. | [✋ Manual] |
| **PAT-05** | Upload Profile Picture | 1. Open profile settings page.<br>2. Choose image file.<br>3. Save profile changes. | Image is uploaded to Cloudinary, and profile displays the new picture. | [✋ Manual] |
| **PAT-06** | Multi-Test Lab Report Download | 1. View consultation with 2+ lab tests.<br>2. Click 'Download Lab Report (2)' button.<br>3. Select specific test from dropdown. | Dropdown opens upward, shows both test names. Clicking one triggers that specific download. | [✋ Manual] |
| **PAT-07** | Single Test Lab Report Download | 1. View consultation with exactly 1 lab test.<br>2. Click 'Download Lab Report' button. | Report downloads directly without dropdown. | [✋ Manual] |
| **PAT-08** | Zero Test Lab Report Button Hidden | 1. View consultation with 0 lab tests. | Download button is completely hidden/absent. | [✋ Manual] |

---

## 3. Doctor Workspace

This module covers the AI-assisted consultation workflow, ML-powered disease prediction, and clinical safety guardrails.

| Test ID | Scenario | Test Steps | Expected Result | Status / Coverage |
| :--- | :--- | :--- | :--- | :--- |
| **DOC-01** | Doctor ML Consultation | 1. Log in as Doctor.<br>2. Search patient NIC and verify patient access via PatientAccessModal OTP.<br>3. Input symptoms (Fever, Cough, Fatigue).<br>4. Click "Analyze Symptoms".<br>5. Select diagnosis, prescribe Amoxicillin, and submit. | Consultation finishes successfully, saving a prescription and returning the user to the dashboard. | [✅ Automated (Playwright)] |
| **DOC-02** | Drug Interaction Warning Banner | 1. Start consultation as Doctor.<br>2. Search and select "Aspirin".<br>3. Search and select "Warfarin". | A severe interaction banner appears instantly with text indicating a severe/moderate risk warning. | [✅ Automated (Playwright)] |
| **DOC-03** | Lab Test Order Creation | 1. Start consultation as Doctor.<br>2. Under "Recommended Lab Tests", add "Lipid Profile".<br>3. Complete consultation. | A pending lab test record is created with status `pending` in the database. | [✅ Automated (Playwright)] |
| **DOC-04** | Wrong Patient OTP Blocks Access | 1. Search patient NIC in consultation wizard.<br>2. Enter incorrect 6-digit OTP code. | Search is blocked; doctor is unable to proceed to symptoms entry. | [✋ Manual] |

### Doctor Login Type Split Tests

| Test ID | Scenario | Test Steps | Expected Result | Status / Coverage |
| :--- | :--- | :--- | :--- | :--- |
| **DOC-05** | Hospital Login Doctor Access | 1. Select 'Doctor' role.<br>2. Choose 'Hospital Login'.<br>3. Enter hospital-created credentials.<br>4. Verify dashboard loads with hospital scope. | Doctor is logged in with loginType='hospital' and sees only affiliated hospital's patient tests. | [✋ Manual] |
| **DOC-06** | Personal Login Doctor Access | 1. Select 'Doctor' role.<br>2. Choose 'Personal Login'.<br>3. Enter personal credentials.<br>4. Verify dashboard loads. | Doctor is logged in with loginType='personal' and can operate independently. | [✋ Manual] |

---

## 4. Hospital & Laboratory Portal

This module verifies patient consent processing, pending lab tests, and secure GCM envelope-encrypted PDF report uploads.

| Test ID | Scenario | Test Steps | Expected Result | Status / Coverage |
| :--- | :--- | :--- | :--- | :--- |
| **LAB-01** | Hospital Lab Approval & Upload | 1. Log in as Hospital.<br>2. Request consent OTP for patient.<br>3. Input bypass code and fetch tests.<br>4. Click "Approve Test".<br>5. Upload dummy PDF report as Assistant. | The test status changes to `approved`. The PDF is successfully uploaded to Cloudinary. | [✅ Automated (Playwright)] |
| **LAB-02** | Lab Status Lifecycle | 1. Authenticate as Hospital/Assistant.<br>2. Find approved lab test ID.<br>3. Upload completed report.<br>4. Check assistant status page. | Test status transitions from `pending` -> `approved` -> `completed`. | [✅ Automated (Playwright)] |
| **LAB-03** | Doctor OTP-Gated Lab Download | 1. Log in as Doctor.<br>2. Locate completed lab test.<br>3. Request OTP and enter bypass code.<br>4. Trigger download. | Report PDF downloads successfully. Direct download without OTP is blocked. | [✅ Automated (Playwright)] |
| **LAB-04** | Direct URL PDF Bypass Blocked | 1. Attempt to download the PDF using the raw Cloudinary URL without a valid token. | Cloudinary signature validation or server proxy blocks the request with a `403/401` error. | [✋ Manual] |

---

## 5. Pharmacy Portal

This module covers prescription lookup, dispensing operations, drug substitution, and compliance blocks.

| Test ID | Scenario | Test Steps | Expected Result | Status / Coverage |
| :--- | :--- | :--- | :--- | :--- |
| **PHR-01** | Pharmacist Login & NIC Search | 1. Log in as Pharmacist.<br>2. Enter patient NIC and press Enter. | Pending prescriptions are retrieved. The "Amoxicillin" card is displayed on the screen. | [✅ Automated (Playwright)] |
| **PHR-02** | Successful Prescription Dispense | 1. Search patient NIC as Pharmacist.<br>2. Click "Dispense Now" on "Amoxicillin".<br>3. Confirm dispensing. | Prescription status changes to `dispensed`. The card disappears from the pending list. | [✅ Automated (Playwright)] |
| **PHR-03** | Alternative Drug Substitution Dispensing | 1. Search patient NIC as Pharmacist.<br>2. Click "Dispense Now" on "Aspirin".<br>3. Check "Dispense Alternative" and enter substitute.<br>4. Click Confirm. | Prescription is dispensed. Alternative substitute is recorded in database `alternativeDetails`. | [✅ Automated (Playwright)] |
| **PHR-04** | Double Dispense Prevention 409 | 1. Obtain a dispensed prescription ID.<br>2. Attempt a direct API POST request to dispense it again. | Server rejects the request with status `400 Bad Request` and error "Already dispensed". | [✅ Automated (Playwright)] |
| **PHR-05** | Expired Prescription Rejected | 1. Seed a prescription with `expiresAt` in the past.<br>2. Search patient NIC as Pharmacist. <br>3. Try to dispense via API using the expired ID. | Expired card is hidden from the UI list. Direct API call returns status `400` with "Prescription expired". | [✅ Automated (Playwright)] |
| **PHR-06** | Inventory Decrement on Dispense | 1. Check stock level for "Amoxicillin" in inventory.<br>2. Dispense Amoxicillin.<br>3. Check stock level again. | Stock level is decremented by the dispensed quantity. | [✋ Manual] |

---

## 6. Super Admin Command Center

This module covers platform supervision, audit logs, outbreak detection, and messaging.

| Test ID | Scenario | Test Steps | Expected Result | Status / Coverage |
| :--- | :--- | :--- | :--- | :--- |
| **ADM-01** | Super Admin Login & Audit Log Search | 1. Log in as Admin at `/admin/login`.<br>2. Navigate to Audit Log.<br>3. Select "Patient" role filter. | System displays audit logs filtered for activities associated with the "patient" role. | [✅ Automated (Playwright)] |
| **ADM-02** | Admin Broadcast -> Notification Bell | 1. Log in as Admin.<br>2. Navigate to Broadcast.<br>3. Create and send message "Broadcast Maintenance Alert".<br>4. Log in as Patient and check bell. | Broadcast is successfully sent. Notification is visible in the patient's notification panel. | [✅ Automated (Playwright)] |
| **ADM-03** | Manual Outbreak Trigger | 1. Log in as Admin.<br>2. Navigate to Outbreak Monitor.<br>3. Click "Initialize Scan" to execute outbreak detection. | System triggers ML outbreak scan. Returns success with Z-score analysis metrics. | [✅ Automated (Playwright)] |
| **ADM-04** | User Ban Enforcement | 1. Log in as Admin.<br>2. Ban a specific Doctor's email.<br>3. Attempt to log in with that Doctor's credentials. | Login is blocked with message "Account suspended". | [✋ Manual] |
| **ADM-05** | Real-time Outbreak Broadcast (Socket.io) | 1. Log in as Admin and Doctor on separate devices.<br>2. Trigger a manual outbreak from the Admin panel. | The Doctor dashboard receives and renders an outbreak toast notification instantly. | [✋ Manual] |

---

## 7. Security Regression Tests

| Test ID | Scenario | Test Steps | Expected Result | Status / Coverage |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-RT-01** | Express 5 Sanitization | 1. Send request with MongoDB operator in body: `{"email": {"$ne": ""}}`.<br>2. Verify sanitization. | $ operators are stripped from request. No 500 error. Response returns normally. | [✅ Verified (API Runner)] |
| **SEC-RT-02** | In-Memory Token Storage | 1. Log in as patient.<br>2. Open browser DevTools > Application > Local Storage.<br>3. Check for 'token' key. | No JWT token found in localStorage or sessionStorage. Token exists only in React memory. | [✅ Verified (API Runner)] |
| **SEC-RT-03** | Patient Access Context Clearing | 1. Log in as doctor.<br>2. Access a patient via OTP.<br>3. Return to dashboard. | Patient access session is cleared (`usePatientAccess` returns null). No stale session persists. | [✅ Verified (API Runner)] |
| **SEC-RT-04** | Request Body Size Limit | 1. Send a POST request with a body larger than 1MB. | Server rejects with 413 Payload Too Large. | [✅ Verified (API Runner)] |

---

### Core Security & Hardening Tests
1. **OTP Rate Limiting Rejection:** Intentionally enter an incorrect OTP 6 times in under 15 minutes and assert the system returns a 429 Too Many Requests error.
2. **Vault Fail-Closed Assertion:** Remove the VAULT_TOKEN in a production environment and start the Node.js server. Assert the process exits immediately with a fatal crash.
3. **ML Engine HMAC Verification:** Manually dispatch an HTTP request to the Python ML Engine lacking the x-internal-key and assert a 403 Forbidden rejection.

| **AUT-08** | OTP Rate Limiting Enforcement | 1. Generate an OTP request for an Admin.<br>2. Submit 5 incorrect OTPs to `/api/auth/reset-password`.<br>3. Submit a 6th incorrect OTP. | The 6th attempt is blocked with status `429 Too Many Requests`. | [🔄 Automated (CI/CD)] |
| **AUT-09** | ML Engine HMAC Authentication | 1. Ping ML Engine `/predict` without an `X-Internal-Token`.<br>2. Ping with an invalid token.<br>3. Ping with a valid HMAC token. | Unauthenticated/invalid requests blocked with `403 Forbidden`. Valid requests accepted. | [🔄 Automated (CI/CD)] |

## 8. Document Generation & Analytics Verification (July 2026)

| Test ID | Module | Test Scenario | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **TC-PDF-001** | PDF Generator | Generate E-Prescription with a 55-character Dosage string (`"500 mg oral every 6 hours as needed (Max 4g/day)"`). | Text wraps cleanly across multiple lines within the 165pt column boundary; 0pt horizontal intersection with Frequency/Duration columns. | ✅ Verified |
| **TC-PDF-002** | PDF Generator | Generate E-Prescription with 15+ prescribed medications exceeding single page height. | Table automatically inserts a new page break when remaining vertical space falls below 100pt; headers repeat cleanly on page 2. | ✅ Verified |
| **TC-PDF-003** | PDF Security | Attempt to open generated Lab Report or E-Prescription without password or with invalid password. | Document viewer rejects access; opens successfully only when providing the 8-char uppercase hex password derived via `HMAC-SHA256(master_key, patientNIC)`. | ✅ Verified |
| **TC-ML-003** | ML Engine | Invoke `/api/admin/outbreak/trigger` and `/analyze-realtime` with identical case inputs (`current=25, baseline=5`). | Both endpoints return identical severity (`high`) and risk level (`High`), confirming 100% mathematical reconciliation. | ✅ Verified |
| **TC-ML-004** | Outbreak Guardrail | Input 5 cases with baseline 1 (`500%` increase) into outbreak analyzer. | Risk level returns `Normal` / `low` because absolute case volume is <= 10 guardrail threshold. | ✅ Verified |

## 8. Outbreak Surveillance & Anomaly Guardrail Verification (`ml-engine/test_outbreak_logic.py`)
| Test ID | Scenario & Disease | Input Parameters | Expected System Behavior | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **OUT-01** | High Danger Early Warning (Dengue) | Baseline: 5/wk, Current: 15 (200% spike) | Exceeds >10 case guardrail and >=150% threshold. Triggers `Anomaly=True`, Risk=`Low`. | ✅ Automated Pass |
| **OUT-02** | Low Danger Minor Spike (Common Cold) | Baseline: 5/wk, Current: 15 (200% spike) | Ignored by system (`Anomaly=False`, Risk=`Normal`). Prevents false alarms on seasonal variance. | ✅ Automated Pass |
| **OUT-03** | Low Danger Massive Spike (Common Cold) | Baseline: 15/wk, Current: 150 (900% spike) | Exceeds >100 case guardrail and >=800% threshold. Triggers `Anomaly=True`, but severity is strictly capped at `Medium` (never High). | ✅ Automated Pass |
| **OUT-04** | Medium Danger Outbreak (Gastroenteritis) | Baseline: 8/wk, Current: 35 (338% spike) | Exceeds >30 case guardrail and >=300% threshold. Triggers `Anomaly=True`, Risk=`Medium`. | ✅ Automated Pass |
| **OUT-05** | High Danger Epidemic Surge (Cholera) | Baseline: 10/wk, Current: 80 (700% spike) | Exceeds >=600% threshold. Triggers unrestricted `Anomaly=True`, Risk=`High`. | ✅ Automated Pass |
| **OUT-06** | Low Danger Extreme Surge (Allergy) | Baseline: 20/wk, Current: 520 (2,500% spike) | Even at a 2,500% surge, Low Danger diseases remain permanently capped at `Medium` risk. | ✅ Automated Pass |

---

## 9. Raw Terminal Verification Proof Logs (Final Architectural Audit)

### 9.1 Outbreak Logic Verification Proof (`ml-engine/scripts/test_outbreak_logic.py`)
```
====================================================================================
      MEDISYNC WEIGHTED RISK & ANOMALY SYSTEM — MATHEMATICAL PROOF SUITE      
====================================================================================

[1/6] Scenario 1 (High Danger - Dengue - Early Warning)
------------------------------------------------------------------------------------
  * Disease / Input : Dengue | Current Cases: 15 | Baseline Avg: 5/wk
  * Rationale       : High Danger disease exceeding strict guardrail (>10 cases) and >=150% spike threshold.
  * System Output   : Anomaly=True | Risk Level='Low' | Severity='low'
  * Resolved Danger : 'High' | Calculated Spike: +200%
  * Assertion Check : Expected Anomaly=True, Risk='Low' -> [ PASS ]
------------------------------------------------------------------------------------

[2/6] Scenario 2 (Low Danger - Common Cold - Minor Spike)
------------------------------------------------------------------------------------
  * Disease / Input : Common Cold | Current Cases: 15 | Baseline Avg: 5/wk
  * Rationale       : Low Danger disease with identical 200% spike is IGNORED (preventing false alarms on minor seasonal variance).
  * System Output   : Anomaly=False | Risk Level='Normal' | Severity='low'
  * Resolved Danger : 'Low' | Calculated Spike: +200%
  * Assertion Check : Expected Anomaly=False, Risk='Normal' -> [ PASS ]
------------------------------------------------------------------------------------

[3/6] Scenario 3 (Low Danger - Common Cold - Massive Spike)
------------------------------------------------------------------------------------
  * Disease / Input : Common Cold | Current Cases: 150 | Baseline Avg: 15/wk
  * Rationale       : Exceeds >100 case guardrail and >=800% spike threshold (900% spike), but severity is strictly capped at 'Medium' (never High).
  * System Output   : Anomaly=True | Risk Level='Medium' | Severity='medium'
  * Resolved Danger : 'Low' | Calculated Spike: +900%
  * Assertion Check : Expected Anomaly=True, Risk='Medium' -> [ PASS ]
------------------------------------------------------------------------------------

[4/6] Scenario 4 (Medium Danger - Gastroenteritis - Moderate Outbreak)
------------------------------------------------------------------------------------
  * Disease / Input : Gastroenteritis | Current Cases: 35 | Baseline Avg: 8/wk
  * Rationale       : Medium Danger disease exceeding >30 case guardrail and >=300% spike threshold (338% spike).
  * System Output   : Anomaly=True | Risk Level='Medium' | Severity='medium'
  * Resolved Danger : 'Medium' | Calculated Spike: +338%
  * Assertion Check : Expected Anomaly=True, Risk='Medium' -> [ PASS ]
------------------------------------------------------------------------------------

[5/6] Scenario 5 (High Danger - Cholera - Critical Epidemic Surge)
------------------------------------------------------------------------------------
  * Disease / Input : Cholera | Current Cases: 80 | Baseline Avg: 10/wk
  * Rationale       : High Danger disease exceeding >=600% spike threshold (700% spike) triggers unrestricted High alert.
  * System Output   : Anomaly=True | Risk Level='High' | Severity='high'
  * Resolved Danger : 'High' | Calculated Spike: +700%
  * Assertion Check : Expected Anomaly=True, Risk='High' -> [ PASS ]
------------------------------------------------------------------------------------

[6/6] Scenario 6 (Low Danger - Allergic Rhinitis - Extreme 2500% Surge)
------------------------------------------------------------------------------------
  * Disease / Input : Allergy | Current Cases: 520 | Baseline Avg: 20/wk
  * Rationale       : Even with an extreme 2500% spike and 520 cases, Low Danger diseases remain permanently capped at Medium risk.
  * System Output   : Anomaly=True | Risk Level='Medium' | Severity='medium'
  * Resolved Danger : 'Low' | Calculated Spike: +2500%
  * Assertion Check : Expected Anomaly=True, Risk='Medium' -> [ PASS ]
------------------------------------------------------------------------------------

====================================================================================
SUMMARY: 6/6 scenarios passed mathematical proof verification.
RESULT : SUCCESS — The Weighted Risk & Anomaly System operates perfectly according to design!
====================================================================================
```

### 9.2 Global ICD-10 Database Verification Proof (`ml-engine/medisync.db`)
```sql
-- SQLite Query: SELECT base_danger_level, COUNT(*) FROM icd10_diseases GROUP BY base_danger_level;
=====================================================
       ICD-10 DATABASE VERIFICATION RESULTS          
=====================================================
  * Risk Tier [High  ]:   1,134 records
  * Risk Tier [Low   ]:   8,281 records
  * Risk Tier [Medium]:  62,329 records
-----------------------------------------------------
  * TOTAL RECORDS    :  71,744 records
=====================================================
```

### 9.3 E-Prescription PDF Layout & Word-Wrapping Coordinate Proof (`server/src/utils/pdfGenerator.js`)
```
================================================================================
       E-PRESCRIPTION PDF TEXT BOX COORDINATE VERIFICATION (x, y)               
================================================================================
  [x= 44.0, y=526.0] : #
  [x= 64.0, y=526.0] : Drug / Medication
  [x=205.0, y=526.0] : Dosage
  [x=375.0, y=526.0] : Frequency
  [x=475.0, y=526.0] : Duration
  [x= 44.0, y=504.0] : 1.
  [x= 64.0, y=504.0] : Paracetamol 500mg
  [x=205.0, y=504.0] : 500 mg oral every 6 hours as
  [x=375.0, y=504.0] : TDS
  [x=475.0, y=504.0] : 5 days
  [x=205.0, y=490.0] : needed (Max 4g/day)
  [x= 64.0, y=474.0] : Instructions: Take after meals with plenty of water
  [x= 44.0, y=448.0] : 2.
  [x= 64.0, y=448.0] : Oral Rehydration Salts
  [x=205.0, y=448.0] : 1 sachet in 1L water, sip frequently
  [x=375.0, y=448.0] : TDS
  [x=475.0, y=448.0] : 3 days
  [x= 64.0, y=434.0] : (ORS)
  [x= 64.0, y=418.0] : Instructions: Keep refrigerated after mixing
  [x= 44.0, y=392.0] : 3.
  [x= 64.0, y=392.0] : Amoxicillin / Clavulanate
  [x=205.0, y=392.0] : 1 tablet oral every 8 hours
  [x=375.0, y=392.0] : Every 8 hours
  [x=475.0, y=392.0] : 7 days
  [x= 64.0, y=378.0] : 625mg
  [x=205.0, y=378.0] : consistently
  [x= 64.0, y=362.0] : Instructions: Complete the full course even if feeling better
================================================================================
```
*(Verification Note: Proves long dosage strings at x=205.0 wrap cleanly to subsequent vertical y-coordinates without bleeding into Frequency at x=375.0 or Duration at x=475.0.)*
