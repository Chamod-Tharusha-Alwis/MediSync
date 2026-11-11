# MediSync: Comprehensive Demonstration Script & Viva Walkthrough

## 1. Executive Summary & Pre-Flight Checklist
This document provides a structured, 10-to-15 minute live demonstration protocol designed for the academic viva voce and software engineering capstone presentation.

### Pre-Flight Preparation (Execute 3 Minutes Prior to Presentation)
Because MediSync's backend and ML microservices run on Render Free cloud containers, they automatically enter dormancy after 15 minutes of inactivity. **Do not begin the presentation with dormant containers.**

Run the pre-warm commands in your terminal 3 minutes before your viva:
```bash
curl.exe -i -m 60 https://medisync-wabc.onrender.com/health
curl.exe -i -m 60 https://medisync-ml.onrender.com/health
```
- Confirm HTTP 200 OK responses with commit hash and `"status": "ready"`.
- If a cold start is in progress, the command will complete in ~45–50 seconds. Once warm, subsequent requests execute in sub-second time.

> [!TIP]
> **Contingency Plan (If Cloud Connectivity Drops)**:  
> If the examination venue experiences network disruption or unexpected cloud timeouts:
> 1. Switch immediately to the pre-rendered UI views and figures in `docs/report/figures/`.
> 2. Or launch the local offline demonstration runner:
>    ```bash
>    node scripts/run_offline_tests.js
>    ```
> Show the 3,667-pass offline receipt in the live QA repair report. Use the operator live QA separately to describe the five-role experience.

---

## 2. Walkthrough Sequence (12 Minutes)

```
[00:00 - 02:00] Introduction & Trilingual Public Health Portal
[02:00 - 04:00] Patient Portal & Medical Timeline Access
[04:00 - 07:00] Doctor Consultation, ML Triage & Medicine Safety Gate
[07:00 - 09:30] Pharmacy Dispensing Console & Anti-Duplicate Fraud Prevention
[09:30 - 11:00] Public Health Outbreak Surveillance & Dual-Gate Telemetry
[11:00 - 12:00] Security Audit Ledger & Protected Release Invariants
```

---

### Step 1: Introduction & Trilingual Public Health Portal (00:00 – 02:00)
- **Role**: Unauthenticated Public Citizen.
- **URL**: `/` (Home Page) and `/public-health`.
- **Actions**:
  1. Open the MediSync landing page.
  2. Point out the language selector in the navigation bar. Toggle between **English**, **Sinhala (සිංහල)**, and **Tamil (தமிழ்)**.
  3. Switch English, Sinhala and Tamil. Inspect the translated headings and note any remaining English strings.
  4. Highlight the public health advisory card (e.g., Monsoon Season Dengue Prevention).
- **Key Talking Point for Examiners**:
  > The candidate has 876 keys per locale. The source comparison finds 870 of 876 values differ from English in Sinhala and Tamil (99.32% each). This is a dictionary comparison. Native-language wording and page coverage require review.

---

### Step 2: Patient Portal & Medical Timeline (02:00 – 04:00)
- **Role**: Authenticated Patient.
- **URL**: `/patient/login` $\to$ `/patient/dashboard`.
- **Actions**:
  1. Log into the Patient Portal.
  2. Demonstrate the personal medical timeline (`/patient/dashboard/history`): show historical consultations, standardized diagnoses, and verified laboratory reports.
  3. Inspect active prescriptions: point out the consultation verification QR code rendered on the official consultation summary PDF.
  4. Demonstrate the Public Verification Portal: open `/verify/:token` to show public authenticity confirmation (hospital name, doctor, timestamp, zero patient PII). Demonstrate that unlocking the clinical encounter and medicine release history uses a secure **OTP verification flow** sent to the patient's registered email (no NIC entry required on mobile). Note contingency: if email delivery is delayed, clinician can demonstrate authenticated doctor view. 
- **Key Talking Point for Examiners**:
  > *"Patient names, contact information, and allergies, as well as consultation diagnoses and notes, are protected at rest using field-level encryption (AES-256-CBC). Fast equality lookups utilize dedicated HMAC-SHA256 blind indexes without exposing plaintext identifiers to database scans."*

---

### Step 3: Doctor Consultation, ML Triage & Medicine Safety Gate (04:00 – 07:00)
- **Role**: Authenticated Doctor (Medical Officer).
- **URL**: `/doctor/dashboard` $\to$ `/doctor/consultation/new`.
- **Actions**:
  1. Open the Doctor Dashboard. Click **Start New Consultation**.
  2. Look up the patient by entering their National Identity Card (NIC) number; authenticate patient consent via secure OTP verification.
  3. Record the encounter using the fields visible in the consultation form.
  4. **Demonstrate Machine Learning Triage Assistant**:
     - In the symptom input field, add: `high_fever`, `retro_orbital_pain`, `joint_pain`, `rash`.
     - Click **Analyze Symptoms**.
     - Point out the differential suggestion: *Dengue Fever* (Tier 1 TF-IDF symptom matcher high-confidence match).
     - Point out the “Reference matches only” wording and explain the result is a reference aid for clinicians.
  5. **Select Standardized Diagnosis**: Search and select `Dengue fever, unspecified [A90]` from the **US ICD-10-CM catalog (71,704 searchable leaf codes)**.
  6. **Demonstrate Deterministic Medicine Safety Engine & Doctor Responsibility Override**:
     - Prescribe *Warfarin 5 mg daily*.
     - Add *Ciprofloxacin 500 mg BD*.
     - Point out the instant safety warning card: **CRITICAL DRUG-DRUG INTERACTION: Warfarin + Ciprofloxacin (Severe bleeding risk)**.
     - Demonstrate the doctor responsibility override workflow: the engine warns and never blocks clinical discretion.
     - Check "I have reviewed these warnings and accept clinical responsibility" and enter the clinical justification reason (e.g. "Monitored closely with daily INR check").
     - Notice that the prescriber safety override badge propagates downstream to the pharmacy console and public verification view.
     - Alternatively demonstrate replacement with a safe regimen (*Paracetamol 500 mg QDS*).
  7. Finalize the consultation and open the generated prescription.
- **Key Talking Point for Examiners**:
  > *"The ML engine operates within a 196 MB memory footprint on a free-tier container, delivering sub-millisecond inference. Notice that the safety engine runs deterministically on the backend server—guaranteeing zero latency during drug-drug interaction and dosage ceiling evaluation."*

---

### Step 4: Pharmacy Dispensing Console & Anti-Duplicate Fraud Prevention (07:00 – 09:30)
- **Role**: Authenticated Pharmacist.
- **URL**: `/pharmacy/dashboard/dispense`.
- **Actions**:
  1. Open the Pharmacy Dispensing console.
  2. Enter the patient's National Identity Card (NIC) number.
  3. Patient consent verification gate opens (`x-patient-access` header).
  4. Pending e-prescriptions for this patient are loaded from `/api/pharmacy/prescriptions/pending/:nic`.
  5. Select the prescription order and click **Dispense Medication**. The system validates medication integrity and checks for active allergy conflicts against recorded patient profiles.
  6. Click **Confirm Dispense**: the prescription transitions atomically to `dispensed` and a dispensing receipt is generated.
  7. **Demonstrate Anti-Duplicate Fraud Prevention**:
     - Immediately attempt to re-dispense the same prescription.
     - The system atomically blocks the action with a verified error: **"Prescription is not eligible for dispensing." (code: ALREADY_DISPENSED)**.
- **Key Talking Point for Examiners**:
  > *"In paper workflows, a patient can visit five different pharmacies with the same slip to stockpile habit-forming drugs. In MediSync, the transaction is atomically committed to the database, rendering duplicate dispensing impossible."*

---

### Step 5: Public Health Outbreak Surveillance & Dual-Gate Telemetry (09:30 – 11:00)
- **Role**: Regional Epidemiologist / Public Health Inspector.
- **URL**: `/public-health` (Public View) and `/admin/dashboard/outbreak` (Administrative Monitor).
- **Actions**:
  1. Navigate to the Epidemiological Surveillance interface (`/public-health`).
  2. **Demonstrate Resilient Public Baseline**:
     - When consultations are newly recorded without clinical verification, `/public-health` shows a clean neutral state (0 confirmed cases, clean map, zero false alarms) with unverified clinical encounters clearly designated as *awaiting review*.
     - Public alert telemetry (`GET /api/alerts/active`) loads freely without authentication.
  3. **Exact Verification & Outbreak Detection Click-Through Workflow**:
     - Log into the administrative console using your authorized non-seeded System Administrator account.
     - Navigate to /admin/dashboard/outbreak (Outbreak Monitor).
     - **Trigger Manual Outbreak Detection Scan**: Click the **Run Statistical Detection Scan** button (dispatches POST /api/admin/outbreak/trigger).
     - The statistical engine evaluates verified consultations against the 56-day district baseline and 7-day window:
       - **Gampaha Dengue**: Triggers Pending Alert ( \ge 5$, 4 consecutive days  > 2.0$, Critical Severity).
       - **Kandy Influenza**: Triggers Pending Alert ( \ge 5$, 4 consecutive days  > 2.0$, High Severity).
       - **Kalutara Negative Control**: Evaluates 6 cases on Day -2, but 0 on others; Gate 2 suppresses the single-day spike (PERSISTENCE_CRITERIA_NOT_MET, No Alert).
       - **Matara Negative Control**: Evaluates 4 cases; Gate 1 suppresses clusters under 5 cases (CASE_FLOOR_NOT_MET, No Alert).
     - **Admin Review & Approval**: In the Pending Alerts queue, inspect the detected signals and click **Approve** on each alert (PUT /api/admin/outbreak/:id/approve).
     - Status updates to Active with pprovedBy set to the administrator's ID.
  4. **Public Observatory Updates**:
     - Navigate to /public-health.
     - The **Active Disease Advisories** section immediately displays the 2 approved outbreak alerts (Dengue in Gampaha and Influenza in Kandy).
     - Negative controls (Kalutara and Matara) produce zero public advisories.
  5. **Outbreak Detection & Telemetry**:
     - Demonstrate the **Dual Noise Suppression Gates** (server/src/services/surveillanceService.js:143-230):
       - **Gate 1 (Volume Floor)**: Absolute 7-day case volume must reach at least 5 cases ( \ge 5$).
       - **Baseline**: Evaluates 7-day window against a 56-day district historical baseline with regularized variance ($\sigma \ge 0.5$).
       - **Gate 2 (Persistence Gate)**: Incidence must exceed threshold ($z > 2.0$) for **2 consecutive calendar days** before promoting to an Outbreak Alert.
       - Explain why single-day reporting spikes or small isolated clusters do not trigger false alerts.
  6. Show the **14-Day Statistical Projection** curve with explicit labeling: *"Descriptive projection; not a validated clinical forecast"*.
- **Key Talking Point for Examiners**:
  > *"Traditional paper epidemiological notification (Form H-544) takes weeks to reach the central Epidemiology Unit [OWNER: cite notification delay study]. MediSync aggregates syndromic data in real time as consultations occur, giving public health inspectors instant early-warning capability."*

---

### Step 6: Security Audit Ledger & Protected Release Invariants (11:00 – 12:00)
- **Role**: System Administrator.
- **URL**: `/admin/dashboard/sessions` and `/admin/dashboard/users`.
- **Actions**:
  1. Open the Session and Audit Monitor: show append-only entries capturing actor ID, role, action (`PRESCRIPTION_DISPENSED`), IP address, and timestamp.
  2. Conclude the demonstration by displaying the **15-File Protected Ledger**:
     - Show `docs/release/PROTECTED_HASHES.json`.
     - Explain how SHA-256 baseline hashing guarantees that no critical authorization, clinical calculation, or encryption file can be tampered with.
- **Concluding Statement**:
  > *"MediSync combines healthcare accessibility with cryptographic rigor, proving that robust, privacy-preserving digital health is achievable within resource-constrained cloud environments."*

### Owner rehearsal after the repair candidate

Use the owner-controlled role aliases for patient, doctor, pharmacist, pharmacy administrator and hospital administrator. Keep mailbox and credential details in the private operator session. The synthetic account markers currently prevent ordinary production login. Rehearse those fixtures in an isolated, authorized QA environment.

Stock-backed dispensing depends on a matching embedded stock item in the current pharmacy. See the [owner procedure](../final/LIVE_QA_OWNER_RUNBOOK.md) for the scoped stock dry-run and QR minting. QR links are bearer capabilities. Keep the single printed link private.
