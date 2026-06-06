# MediSync QA Test Case Matrix
## Zero-Trust National Health Information System

This document outlines the formal test case suite for **MediSync**, a HIPAA-aligned, zero-trust National Health Information System. The matrix covers multi-role access control, data encryption, real-time communication, machine learning diagnostics, pharmacy inventory workflows, and super admin audit logging.

---

## 1. Authentication & RBAC

This module verifies authentication security, role-based access control, session revocation, rate-limiting, and zero-trust verification boundaries.

| Test ID | Scenario | Test Steps | Expected Result | Status / Coverage |
| :--- | :--- | :--- | :--- | :--- |
| **MS-AUT-001** | Patient Registration & Login | 1. Navigate to `/register`. <br>2. Fill in registration fields with unique NIC and credentials. <br>3. Submit and verify success. <br>4. Navigate to `/login` and authenticate. | User account is created successfully; login returns a valid JWT, and patient is redirected to `/patient/dashboard`. | [✅ Automated (Playwright)] |
| **MS-AUT-004** | Duplicate Patient Registration Rejected | 1. Attempt to register a patient using an already registered National Identity Card (NIC) number. <br>2. Attempt to register using an already registered email. | API returns a `409 Conflict` status; front-end displays a clear error indicating the duplicate identity. | [✅ Automated (Playwright)] |
| **MS-AUT-005** | RBAC Page Access Block | 1. Authenticate as a Patient. <br>2. Manually navigate the browser URL to `/doctor/dashboard`. | System blocks navigation and automatically redirects the user back to `/select-role` or `/unauthorized`. | [✅ Automated (Playwright)] |
| **MS-AUT-006** | Session Revocation After Logout | 1. Authenticate as any user role. <br>2. Perform actions to verify active session. <br>3. Click "Logout". <br>4. Attempt to send an authenticated API request with the cleared token. | Local storage credentials are deleted; API returns `401 Unauthorized` for subsequent requests; user redirected to login. | [✅ Automated (Playwright)] |
| **MS-MAN-001** | Multi-Role Login Verification | 1. Authenticate sequentially using Doctor, Hospital, Pharmacist, and Admin credentials. | Each role successfully logs in and is navigated to its respective role-specific dashboard. | [✋ Manual] |
| **MS-MAN-002** | Login Rate-Limiting Protection | 1. Attempt to log in with incorrect passwords repeatedly (> 5 times in 1 minute). | System blocks subsequent attempts with a `429 Too Many Requests` error and temporarily locks the account or IP. | [✋ Manual (Negative)] |
| **MS-MAN-003** | Tampered JWT Verification | 1. Copy an active session JWT. <br>2. Modify the payload or signature using a token editor. <br>3. Submit API request with modified token. | The backend middleware rejects the token as invalid and returns a `401 Unauthorized` response. | [✋ Manual (Negative)] |

---

## 2. Patient Portal

This module verifies the patient workspace, including medical history timelines, file downloads, real-time alerts, support tickets, and public reviews.

| Test ID | Scenario | Test Steps | Expected Result | Status / Coverage |
| :--- | :--- | :--- | :--- | :--- |
| **MS-AUT-008** | E-Prescription & Lab PDF Download | 1. Authenticate as a Patient. <br>2. Navigate to medical records. <br>3. Click download on a verified lab report/prescription. | The request triggers a binary stream download; file is validated as a non-empty PDF document blob. | [✅ Automated (Playwright)] |
| **MS-MAN-004** | Medical Timeline Navigation | 1. Access the patient dashboard. <br>2. View the chronological list of consultations, lab reports, and prescriptions. | Timeline displays all records sorted by date with proper formatting. | [✋ Manual] |
| **MS-MAN-005** | Notification Bell Interaction | 1. Click the notification bell in the navbar. <br>2. Mark individual notifications as read. <br>3. Click "Mark all as read". | Unread count badge decrements dynamically; UI updates notification style to read state. | [✋ Manual] |
| **MS-MAN-006** | Support Ticketing Submission | 1. Open Support page. <br>2. Enter ticket subject, description, and category. <br>3. Click submit. | Support ticket is created and saved; confirmation alert displays; ticket appears in history. | [✋ Manual] |
| **MS-MAN-007** | 5-Star Public Doctor Review | 1. Navigate to doctor listings. <br>2. Select a doctor, select 5 stars, write comments, and submit review. | Review is persisted; doctor's average rating recalculates; review appears on doctor's public page. | [✋ Manual] |
| **MS-MAN-008** | Patient Profile Picture Upload | 1. Navigate to Profile settings. <br>2. Choose a valid JPG/PNG image. <br>3. Click upload. | The image is saved, crop handles work as expected, and profile avatar updates instantly. | [✋ Manual] |

---

## 3. Doctor Workspace

This module covers clinical tools, AI Consultation Wizard, disease classification (TF-IDF), lab orders, and drug interaction safety checks.

| Test ID | Scenario | Test Steps | Expected Result | Status / Coverage |
| :--- | :--- | :--- | :--- | :--- |
| **MS-AUT-002** | Doctor ML Consultation & Diagnosis | 1. Authenticate as a Doctor. <br>2. Open AI consultation wizard. <br>3. Input patient symptoms. <br>4. Trigger ML diagnosis. | ML model returns a ranked list of predicted conditions based on TF-IDF analysis. | [✅ Automated (Playwright)] |
| **MS-AUT-007** | Drug-Drug Interaction Warning | 1. Create a prescription. <br>2. Add **Aspirin** to the drug list. <br>3. Add **Warfarin** to the drug list. <br>4. Trigger safety checks. | A high-risk drug interaction warning banner is displayed alerting the doctor of bleeding risks. | [✅ Automated (Playwright)] |
| **MS-MAN-009** | Lab Test Order Creation | 1. Select active patient record. <br>2. Click "Order Lab Test". <br>3. Select lab tests (e.g., CBC, Lipid Profile). <br>4. Submit request. | Lab request is created in pending status; hospital/laboratory immediately receives the order. | [✋ Manual] |
| **MS-MAN-010** | Restricted Drug Prescribing Without Authorization | 1. Authenticate as Doctor. <br>2. Try prescribing a highly restricted/narcotic drug without inputting mandatory authorization codes. | Form displays validation block; submission fails; API returns `400 Bad Request` or `403 Forbidden`. | [✋ Manual (Negative)] |

---

## 4. Hospital & Laboratory

This module covers laboratory test management, patient consent checks, and Cloudinary-integrated secure uploads.

| Test ID | Scenario | Test Steps | Expected Result | Status / Coverage |
| :--- | :--- | :--- | :--- | :--- |
| **MS-AUT-003** | Lab Approval & AES-256 PDF Upload | 1. Log in as Laboratory. <br>2. Select pending test order. <br>3. Enter test results and upload PDF report. <br>4. Approve report. | PDF is AES-256-GCM envelope-encrypted, uploaded to secure storage, and test status transitions to "Completed". | [✅ Automated (Playwright)] |
| **MS-AUT-009** | Lab Status Lifecycle transitions | 1. Follow a lab test from status `Ordered` -> `Pending Consent` -> `Processing` -> `Completed`. | Database and UI update states correctly; timeline shows appropriate checkpoints. | [✅ Automated (Playwright)] |
| **MS-AUT-010** | Doctor OTP Lab Report Download | 1. Authenticate as Doctor. <br>2. Try downloading completed patient lab PDF. <br>3. Request SMS/Email OTP, input OTP. <br>4. Verify download. | Access is locked until correct OTP is supplied; upon verification, decrypts and streams the PDF. | [✅ Automated (Playwright)] |
| **MS-MAN-011** | Accessing Lab Results Without Patient Consent | 1. Authenticate as Laboratory. <br>2. Attempt to fetch or view results for a patient who hasn't approved laboratory consent. | API returns `403 Forbidden` with a message "Consent required from patient". | [✋ Manual (Negative)] |
| **MS-MAN-012** | Uploading Malformed/Executable Files | 1. Attempt to upload a `.exe` or malformed file disguised as a PDF lab report. | Backend file validation catches the bad extension/mime type; upload is blocked with `400 Bad Request`. | [✋ Manual (Negative)] |

---

## 5. Pharmacy

This module covers NIC search, dispensation, drug substitutions, and preventing double-dispensing or expired prescription use.

| Test ID | Scenario | Test Steps | Expected Result | Status / Coverage |
| :--- | :--- | :--- | :--- | :--- |
| **MS-AUT-011** | Pharmacist Login & NIC Search | 1. Log in as Pharmacist. <br>2. Input patient National Identity Card (NIC) number. <br>3. Trigger search. | System returns all active, undispensed prescriptions associated with the patient's NIC. | [✅ Automated (Playwright)] |
| **MS-AUT-012** | Successful Prescription Dispensation | 1. Locate active prescription. <br>2. Review prescribed items (e.g. Amoxicillin). <br>3. Click "Mark as Dispensed". | Prescription status updates to "Dispensed"; audit log records transaction; inventory decrements. | [✅ Automated (Playwright)] |
| **MS-AUT-013** | Alternative Drug Substitution | 1. Select prescription with out-of-stock drug. <br>2. Select system-suggested equivalent substitute. <br>3. Log dispensation. | Dispensation completes successfully; record links substitute drug details and pharmacist notes. | [✅ Automated (Playwright)] |
| **MS-AUT-014** | Double-Dispensation Prevention | 1. Attempt to dispense a prescription that is already marked as "Dispensed" (concurrently or sequentially). | System throws a `409 Conflict` or `400 Bad Request`; dispensation action is aborted. | [✅ Automated (Playwright) (Negative)] |
| **MS-AUT-015** | Expired Prescription Rejection | 1. Locate a prescription whose validity date has passed. <br>2. Attempt to dispense items. | Dispensation button is disabled; API rejects the request with `400 Bad Request` citing expired prescription. | [✅ Automated (Playwright) (Negative)] |
| **MS-MAN-013** | Dispensing for Non-Existent NIC | 1. Query a random, unregistered NIC in the search bar. | UI shows "No active records found for this NIC"; API returns empty result safely. | [✋ Manual (Negative)] |

---

## 6. Super Admin Command Center

This module covers administrative controls, global audit logs, real-time broadcasts, and automated disease outbreak triggers.

| Test ID | Scenario | Test Steps | Expected Result | Status / Coverage |
| :--- | :--- | :--- | :--- | :--- |
| **MS-AUT-016** | Tamper-Proof Audit Log Search | 1. Log in as Super Admin. <br>2. Navigate to Audit logs. <br>3. Filter logs by role "patient" or target action. | Logs match filters; each log displays cryptographic hash validating metadata integrity. | [✅ Automated (Playwright)] |
| **MS-AUT-017** | Admin Broadcast Notification | 1. Log in as Admin. <br>2. Create a district-level system broadcast alert. <br>3. Verify real-time push to target users via Socket.IO. | Connected patients in target district receive instant notifications; unread badge increments. | [✅ Automated (Playwright)] |
| **MS-AUT-018** | Manual ML Outbreak Trigger | 1. Open Outbreak panel. <br>2. Run manual Z-score anomaly detector. <br>3. Verify statistical output analysis. | System processes consultation counts; triggers global alert notifications if anomalies exceed threshold. | [✅ Automated (Playwright)] |
| **MS-MAN-014** | User Banning & Instant Session Revocation | 1. Select a user account in Ban management. <br>2. Click "Ban User". <br>3. Simultaneously, test active sessions on banned user's browser. | Banned flag is set in DB; all active session tokens for the banned user are instantly invalidated via Redis blocklist. | [✋ Manual] |
| **MS-MAN-015** | Tampering/Deleting Audit Logs | 1. Attempt to run a database query to delete or modify an entry in the Audit Log collection. | Database rules and write-once policies block updates; system integrity checker throws alert. | [✋ Manual (Negative)] |

---

### Verification and Quality Summary

- **Total Automated Scenarios:** 18
- **Total Manual / Edge Cases Scenarios:** 15
- **Automation Tooling:** Playwright E2E Suite, Node.js Test Environment
- **Security Coverage:** AES-256-GCM Envelope Encryption validation, OAuth JWT session check, Redis-based token revocation lists, and Socket.IO real-time delivery guarantees.
