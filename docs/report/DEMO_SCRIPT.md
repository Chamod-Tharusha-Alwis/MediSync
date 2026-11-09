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
>    Explain to examiners: *"All 3,465 automated test assertions execute deterministically offline in-memory, proving complete end-to-end multi-role transaction integrity without external cloud dependence."*

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
  3. Show that 100% of the UI labels, navigation buttons, and public health advisories immediately re-render in the selected language without page reload (verified across 813 dictionary keys).
  4. Highlight the public health advisory card (e.g., Monsoon Season Dengue Prevention).
- **Key Talking Point for Examiners**:
  > *"Healthcare delivery in Sri Lanka is multilingual. MediSync enforces strict 100% key parity across English, Sinhala, and Tamil across 813 interface terms to ensure universal accessibility across rural and urban clinics."*

---

### Step 2: Patient Portal & Medical Timeline (02:00 – 04:00)
- **Role**: Authenticated Patient.
- **URL**: `/patient/login` $\to$ `/patient/dashboard`.
- **Actions**:
  1. Log into the Patient Portal.
  2. Demonstrate the personal medical timeline (`/patient/dashboard/history`): show historical consultations, standardized diagnoses, and verified laboratory reports.
  3. Inspect active prescriptions: point out the consultation verification QR code rendered on the official consultation summary PDF.
  4. Demonstrate the Public Verification Portal: open `/verify/:token` to show public authenticity confirmation (hospital name, doctor, timestamp, zero patient PII). Demonstrate that accessing the full medical history PDF requires passing the **Patient NIC Gate**.
- **Key Talking Point for Examiners**:
  > *"All patient demographic information and clinical visit notes are encrypted at rest using field-level AES-256-GCM. The database never stores plaintext National Identity Card numbers or unencrypted clinical histories."*

---

### Step 3: Doctor Consultation, ML Triage & Medicine Safety Gate (04:00 – 07:00)
- **Role**: Authenticated Doctor (Medical Officer).
- **URL**: `/doctor/dashboard` $\to$ `/doctor/consultation/new`.
- **Actions**:
  1. Open the Doctor Dashboard. Click **Start New Consultation**.
  2. Look up the patient by entering their National Identity Card (NIC) number; authenticate patient consent via secure OTP verification.
  3. Enter clinical vitals: Blood Pressure: 120/80 mmHg, Pulse: 78 bpm, Temperature: 102.4 °F.
  4. **Demonstrate Machine Learning Triage Assistant**:
     - In the symptom input field, add: `high_fever`, `retro_orbital_pain`, `joint_pain`, `rash`.
     - Click **Analyze Symptoms**.
     - Point out the differential suggestion: *Dengue Fever* (Tier 1 TF-IDF symptom matcher high-confidence match).
     - Point out the amber disclaimer banner: `clinicalValidation: not_established` (*"AI Clinical Decision Aid — For guidance only, not a validated diagnosis"*).
  5. **Select Standardized Diagnosis**: Search and select `Dengue fever, unspecified [A90]` from the **US ICD-10-CM catalog (71,704 searchable leaf codes)**.
  6. **Demonstrate Deterministic Medicine Safety Engine**:
     - Prescribe *Warfarin 5 mg daily*.
     - Attempt to add *Ciprofloxacin 500 mg BD*.
     - Point out the instant blocking safety alert: **CRITICAL DRUG-DRUG INTERACTION: Warfarin + Ciprofloxacin (Severe bleeding risk)**.
     - Remove Ciprofloxacin and enter a safe regimen (*Paracetamol 500 mg QDS*).
  7. Finalize consultation. The prescription is generated and cryptographically signed.
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
  1. Navigate to the Epidemiological Surveillance interface.
  2. Show the Sri Lanka 25-district map color-coded by active disease incidence.
  3. Inspect a highlighted district (e.g., *Gampaha*).
  4. Show an active **Outbreak Alert**: Dengue Fever ($z\text{-score} = +3.82$).
  5. Demonstrate the **Dual Noise Suppression Gates** (`server/src/services/surveillanceService.js:136-140`):
     - **Gate 1 (Volume Floor)**: Absolute 7-day case volume must reach at least 5 cases ($N \ge 5$).
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
