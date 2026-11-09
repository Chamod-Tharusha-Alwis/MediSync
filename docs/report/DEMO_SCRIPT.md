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
[00:00 - 02:00] Introduction & Public Citizen Portal
[02:00 - 04:00] Patient Registration & Appointment Booking
[04:00 - 07:00] Doctor Consultation, ML Triage & Medicine Safety Gate
[07:00 - 09:30] Pharmacy QR Scan, NIC Verification Gate & Anti-Fraud Dispensing
[09:30 - 11:00] Public Health Outbreak Surveillance & District Telemetry
[11:00 - 12:00] Security Audit Ledger & Protected Release Invariants
```

---

### Step 1: Introduction & Trilingual Public Health Portal (00:00 – 02:00)
- **Role**: Unauthenticated Public Citizen.
- **URL**: `/` (Home Page).
- **Actions**:
  1. Open the MediSync landing page.
  2. Point out the language selector in the navigation bar. Toggle between **English**, **Sinhala (සිංහල)**, and **Tamil (தமிழ்)**.
  3. Show that 100% of the UI labels, navigation buttons, and public health advisories immediately re-render in the selected language without page reload.
  4. Highlight the public health advisory card (e.g., Monsoon Season Dengue Prevention).
- **Key Talking Point for Examiners**:
  > *"Healthcare delivery in Sri Lanka is multilingual. MediSync enforces strict 100% key parity across English, Sinhala, and Tamil to ensure universal accessibility across rural and urban clinics."*

---

### Step 2: Patient Portal & Appointment Booking (02:00 – 04:00)
- **Role**: Authenticated Patient.
- **URL**: `/login` $\to$ `/patient/dashboard`.
- **Actions**:
  1. Log into the Patient Portal.
  2. Demonstrate the personal medical timeline: show historical consultations, diagnoses, and lab results.
  3. Click **Book Appointment**: Select District (e.g., *Colombo*), Specialty (*General OPD*), and Doctor. Confirm booking.
  4. View active prescriptions: show the secure QR code badge and explain that prescriptions are cryptographically signed.
- **Key Talking Point for Examiners**:
  > *"All patient demographic information and clinical visit notes are encrypted at rest using field-level AES-256-GCM. The database never stores plaintext National Identity Card numbers or medical histories."*

---

### Step 3: Doctor Consultation, ML Triage & Medicine Safety Gate (04:00 – 07:00)
- **Role**: Authenticated Doctor (Medical Officer).
- **URL**: `/doctor/dashboard`.
- **Actions**:
  1. Open the Doctor Dashboard. Select the patient from the daily OPD queue.
  2. Click **Start Consultation**: enter patient vitals (Blood Pressure: 120/80, Pulse: 78, Temperature: 102.4 °F).
  3. **Demonstrate Machine Learning Triage Assistant**:
     - In the symptom input field, add: `high_fever`, `retro_orbital_pain`, `joint_pain`, `rash`.
     - Click **Analyze Symptoms**.
     - Point out the differential suggestion: *Dengue Fever* (Tier 1 TF-IDF symptom matcher high-confidence match).
     - Point out the amber disclaimer banner: `clinicalValidation: not_established` (*"AI Clinical Decision Aid — For guidance only, not a validated diagnosis"*).
  4. **Select Standardized Diagnosis**: Search and select `Dengue fever, unspecified [A90]` from the ICD-10 catalog.
  5. **Demonstrate Deterministic Medicine Safety Engine**:
     - Prescribe *Warfarin 5 mg daily*.
     - Attempt to add *Ciprofloxacin 500 mg BD*.
     - Point out the instant blocking safety alert: **CRITICAL DRUG-DRUG INTERACTION: Warfarin + Ciprofloxacin (Severe bleeding risk)**.
     - Remove Ciprofloxacin and enter a safe regimen (*Paracetamol 500 mg QDS*).
  6. Finalize consultation. The prescription is generated and cryptographically signed.
- **Key Talking Point for Examiners**:
  > *"The ML engine operates within a 196 MB memory footprint on a free-tier container, delivering sub-millisecond inference. Notice that the safety engine runs deterministically on the backend server—guaranteeing zero latency during drug-drug interaction evaluation."*

---

### Step 4: Pharmacy QR Scan, NIC Verification & Anti-Fraud Gate (07:00 – 09:30)
- **Role**: Authenticated Pharmacist.
- **URL**: `/pharmacy/dispense`.
- **Actions**:
  1. Open the Pharmacy Dispensing console.
  2. Scan or enter the Patient's Prescription QR Token.
  3. The prescription loads in an **unverified staging state**: medication details are visible, but the **Dispense Medication** action button is locked.
  4. **Demonstrate Identity Verification Gate**:
     - Explain: *"To prevent prescription theft or unauthorized collection, the pharmacist requests the patient's physical National Identity Card."*
     - Enter an incorrect NIC: the system rejects the entry with an error (*"Identity verification failed"*).
     - Enter the correct patient NIC: the gate unlocks, turning the dispense button green.
  5. Click **Confirm Dispense**: the prescription transitions to `dispensed`.
  6. **Demonstrate Anti-Duplicate Fraud Prevention**:
     - Immediately re-scan or enter the same prescription token.
     - The system blocks the action: **"ALREADY DISPENSED: This prescription was fulfilled at Colombo Central Dispensary at 10:14 AM"**.
- **Key Talking Point for Examiners**:
  > *"In paper workflows, a patient can visit five different pharmacies with the same slip to stockpile habit-forming drugs. In MediSync, the transaction is atomically committed to the database, rendering duplicate dispensing impossible."*

---

### Step 5: Public Health Outbreak Surveillance & District Telemetry (09:30 – 11:00)
- **Role**: Regional Epidemiologist / Public Health Inspector.
- **URL**: `/public-health/dashboard`.
- **Actions**:
  1. Navigate to the Epidemiological Surveillance Dashboard.
  2. Show the Sri Lanka 25-district choropleth map color-coded by active disease incidence.
  3. Click on a highlighted district (e.g., *Gampaha*).
  4. Show an active **Outbreak Alert**: Dengue Fever ($z\text{-score} = +3.82$).
  5. Demonstrate the **Three-Tier Noise Suppression Gate**:
     - Show the minimum volume threshold ($n \ge 5$).
     - Show the consecutive duration requirement ($d \ge 3\text{ days}$).
     - Explain why single-day anomalies do not trigger false alerts.
  6. Show the **14-Day Statistical Projection** curve with explicit labeling: *"Descriptive projection; not a validated clinical forecast"*.
- **Key Talking Point for Examiners**:
  > *"Traditional paper epidemiological notification (Form H-544) takes weeks to reach the central Epidemiology Unit. MediSync aggregates syndromic data in real time as consultations occur, giving public health inspectors instant early-warning capability."*

---

### Step 6: Security Audit Ledger & Protected Release Invariants (11:00 – 12:00)
- **Role**: System Administrator.
- **URL**: `/admin/audit-logs`.
- **Actions**:
  1. Open the Audit Log console: show append-only entries capturing actor ID, role, action (`PRESCRIPTION_DISPENSED`), IP address, and timestamp.
  2. Conclude the demonstration by displaying the **15-File Protected Ledger**:
     - Show `docs/release/PROTECTED_HASHES.json`.
     - Explain how SHA-256 baseline hashing guarantees that no critical authorization, clinical calculation, or encryption file can be tampered with.
- **Concluding Statement**:
  > *"MediSync combines healthcare accessibility with cryptographic rigor, proving that robust, privacy-preserving digital health is achievable within resource-constrained cloud environments."*
