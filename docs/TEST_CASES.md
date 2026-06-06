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

---

## 3. Doctor Workspace

This module covers the AI-assisted consultation workflow, ML-powered disease prediction, and clinical safety guardrails.

| Test ID | Scenario | Test Steps | Expected Result | Status / Coverage |
| :--- | :--- | :--- | :--- | :--- |
| **DOC-01** | Doctor ML Consultation | 1. Log in as Doctor.<br>2. Search patient NIC and input bypass OTP (`123456`).<br>3. Input symptoms (Fever, Cough, Fatigue).<br>4. Click "Analyze Symptoms".<br>5. Select diagnosis, prescribe Amoxicillin, and submit. | Consultation finishes successfully, saving a prescription and returning the user to the dashboard. | [✅ Automated (Playwright)] |
| **DOC-02** | Drug Interaction Warning Banner | 1. Start consultation as Doctor.<br>2. Search and select "Aspirin".<br>3. Search and select "Warfarin". | A severe interaction banner appears instantly with text indicating a severe/moderate risk warning. | [✅ Automated (Playwright)] |
| **DOC-03** | Lab Test Order Creation | 1. Start consultation as Doctor.<br>2. Under "Recommended Lab Tests", add "Lipid Profile".<br>3. Complete consultation. | A pending lab test record is created with status `pending` in the database. | [✅ Automated (Playwright)] |
| **DOC-04** | Wrong Patient OTP Blocks Access | 1. Search patient NIC in consultation wizard.<br>2. Enter incorrect 6-digit OTP code. | Search is blocked; doctor is unable to proceed to symptoms entry. | [✋ Manual] |

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
