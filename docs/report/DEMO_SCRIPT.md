# MediSync: Comprehensive Demonstration Script & Viva Walkthrough

**Target Presentation Window:** 12–15 Minutes  
**Audience:** Academic Viva Examiners & Software Engineering Evaluators  
**Platform URL:** `https://medisync.chamodtharusha.com.lk`  
**Git Branch Baseline:** `release/final-master-nov13`  

---

## 1. Executive Summary & Pre-Flight Preparation

This document outlines the exact, click-by-click demonstration sequence for the MediSync viva voce capstone examination.

### 1.1 Pre-Flight Preparation (Execute 3 Minutes Prior to Presentation)
Render Free microservices enter dormancy after 15 minutes of inactivity. **Always wake containers prior to the examination:**

```bash
# Pre-warm backend and ML microservice containers
curl.exe -i -m 60 https://medisync-wabc.onrender.com/health
curl.exe -i -m 60 https://medisync-ml.onrender.com/health
```
- Confirm HTTP 200 OK responses with commit hash and `"status": "ready"`.
- If dormant, spin-up completes in ~45–50 seconds. Once warm, subsequent requests execute in sub-second latency.

### 1.2 Demonstration Data vs. Production Accounts Notice
> [!IMPORTANT]
> **Clinical Honesty & Persona Policy:**  
> - **Login Accounts:** The presenter logs into doctor, pharmacist, hospital admin, and system admin portals using **existing, authorized non-synthetic accounts**. By design, production rejects synthetic accounts (`isSynthetic: true`) for login.
> - **Patient & Outbreak Data:** Patient NIC `200012345678` and outbreak consultation series were seeded using deterministic synthetic batches (`syntheticSeedBatch: "viva-2026-11-outbreaks"`).
> - **Demonstration Email Protection:** All outbound alert broadcasts generated from demonstration batches are restricted to the `OUTBREAK_DEMO_EMAIL_ALLOWLIST`, include a `[DEMONSTRATION]` subject prefix, and display a prominent demonstration banner in the email body. Real citizens are never emailed for demo alerts.

---

## 2. Structured Walkthrough Sequence (12 Minutes)

```
[00:00 - 02:00] Trilingual Public Health Observatory & Incidence Map
[02:00 - 04:00] Patient Consent, Verification Portal & Single-Encounter PDF
[04:00 - 06:30] Doctor Consultation, ML Triage & Medicine Safety Gate
[06:30 - 08:30] Pharmacy Safety Review, Direct Dispense & Anti-Duplicate Fraud Gate
[08:30 - 10:30] Epidemiological Outbreak Surveillance, Dual-Gate Filtering & Approval Email
[10:30 - 11:30] Syndromic Disease Analytics & 71,704 ICD Autocomplete
[11:30 - 12:00] Cryptographic Audit Ledger & 15-File Protected Baseline
```

---

### Step 1: Trilingual Public Health Observatory (00:00 – 02:00)
- **Role**: Public Citizen (Unauthenticated).
- **URL**: `/` and `/public-health`.
- **Click-by-Click Sequence**:
  1. Open the landing page (`/`).
  2. In the top navigation bar, toggle the language selector between **English**, **Sinhala (සිංහල)**, and **Tamil (தமிழ்)**.
  3. Navigate to `/public-health`.
  4. Observe the **Public Health Overview Cards**:
     - *Verified Consultations (30d)*: Shows total confirmed patient consultations across the island.
     - *Active Outbreak Advisories*: Shows currently gazetted epidemic alerts approved by public health administrators.
     - *Epidemiological Projection Status*: Displays active monitoring status.
  5. Inspect the **Choropleth District Map**: Demonstrates color-coded incident densities normalized by official DCS Census 2012 district populations (National total: 20,358,680).
  6. Scroll to the **14-Day Epidemiological Projection Chart**:
     - Point out the honest chart title: *"Statistical trend projection (linear regression with a 95% prediction band). Not a validated epidemic forecast."*
     - Point out the privacy threshold footnote: *"Districts or conditions with <5 cases are suppressed for privacy."*
- **Key Talking Point for Examiners**:
  > *"Every rate shown is calculated using official Department of Census and Statistics denominators. The projection is an Ordinary Least Squares (OLS) trend with a Student's t 95% prediction band, not a speculative AI prophecy."*

---

### Step 2: Patient Consent, Verification & Single-Encounter PDF (02:00 – 04:00)
- **Role**: Patient & Public Verifier.
- **URL**: `/patient/login` $\to$ `/verify/:token`.
- **Click-by-Click Sequence**:
  1. Log into the Patient Portal. Show the medical timeline with consultation encounters and lab results.
  2. Open the public verification link (`/verify/:token`) corresponding to a consultation QR code.
  3. **Zero-PII Public Stance**: Notice that prior to patient authentication, the verification page reveals only high-level cryptographic proof (issuing hospital, consulting physician, verification timestamp)—zero patient names, NICs, or diagnoses are exposed.
  4. Click **Request Unlock OTP**: The system sends a one-time passcode to the patient's registered email.
  5. Enter the OTP: The encounter details unlock instantly.
  6. Inspect the **Laboratory Tests** section and click **Download Consultation Report (PDF)**.
  7. Open the generated PDF: Demonstrate that the document contains strictly that single clinical encounter, with zero leaks of past medical history.
  8. **Demonstrate 5-Wrong-OTP Lockout**:
     - Attempt 5 incorrect OTP attempts on a fresh verification session.
     - The backend locks the session with HTTP 429 (`OTP_LOCKED`).
- **Key Talking Point for Examiners**:
  > *"All patient PII is stored using AES-256-CBC field-level encryption with HMAC-SHA256 blind indexing for lookups. Public verification links act as cryptographically signed bearer tokens that require 2FA patient consent to reveal clinical notes."*

---

### Step 3: Doctor Consultation, ML Triage & Drug Safety (04:00 – 06:30)
- **Role**: Authenticated Medical Officer.
- **URL**: `/doctor/dashboard` $\to$ `/doctor/consultation/new`.
- **Click-by-Click Sequence**:
  1. Click **Start New Consultation**.
  2. Enter Patient NIC `200012345678` and verify consent via OTP.
  3. **Demonstrate ML Triage Assistance**:
     - Enter chief complaints: `high_fever`, `retro_orbital_pain`, `joint_pain`, `rash`.
     - Click **Analyze Symptoms**.
     - Notice the differential suggestion: *Dengue Fever* with lexical similarity score.
     - Point out the honest disclaimer: *"Reference suggestion only. Clinical diagnosis requires physician judgment."*
  4. **Select Diagnosis from Catalog**: Search and select `Dengue fever, unspecified [A90]` from the **US ICD-10-CM catalog (71,704 validated leaf concepts)**.
  5. **Demonstrate Deterministic Drug Safety Engine**:
     - In the prescription builder, add *Warfarin 5 mg* (anticoagulant).
     - Add *Ciprofloxacin 500 mg* (antibiotic).
     - The safety engine immediately triggers a **CRITICAL DRUG-DRUG INTERACTION** card: *Severe bleeding risk due to CYP1A2 inhibition*.
  6. **Physician Clinical Override**:
     - Check *"I have reviewed these warnings and accept clinical responsibility"*.
     - Enter clinical reason: *"Monitored with daily INR checks"*.
     - Finalize consultation. The prescription is signed and dispatched to the pharmacy queue.
- **Key Talking Point for Examiners**:
  > *"The ML engine is a lightweight lexical TF-IDF model over 41 reference profiles, while the drug safety engine is a deterministic rule-based knowledge graph. Clinical safety cannot rely on probabilistic AI hallucinations."*

---

### Step 4: Pharmacy Dispensing Console (Direct Dispense) (06:30 – 08:30)
- **Role**: Authenticated Pharmacist.
- **URL**: `/pharmacy/dashboard/dispense`.
- **Click-by-Click Sequence**:
  1. Open the Pharmacy Dispense Console.
  2. Enter Patient NIC `200012345678`.
  3. The active pending prescription for Warfarin + Ciprofloxacin loads.
  4. **Direct Prescription Dispensing (No Inventory Management)**:
     - Notice that MediSync does **not** manage pharmacy inventory or stock balances.
     - The pharmacist reviews the physician's prescribed medications, dosage instructions, and active drug interaction warnings.
     - The pharmacist checks the clinical acknowledgment.
  5. Click **Confirm Dispense**:
     - The prescription transitions atomically to `dispensed`.
     - A digital dispensing receipt with timestamp and pharmacist registration number is generated.
  6. **Anti-Duplicate Fraud Prevention**:
     - Immediately attempt to click dispense or reload and dispense again.
     - The server atomically rejects the request with HTTP 409: `ALREADY_DISPENSED`.
- **Key Talking Point for Examiners**:
  > *"MediSync deliberately omits retail pharmacy inventory management to maintain a clean clinical scope. A pharmacist's primary duty is clinical verification and dispensing integrity. Atomic database transactions prevent double-dispensing fraud."*

---

### Step 5: Epidemiological Surveillance & Approval Email (08:30 – 10:30)
- **Role**: System Administrator / Epidemiologist.
- **URL**: `/admin/dashboard/outbreak`.
- **Click-by-Click Sequence**:
  1. Navigate to `/admin/dashboard/outbreak` (Outbreak Monitor).
  2. **Inspect Top Overall Outbreak Summary Tiles**:
     - *Outbreaks Detected*: Combined count of Pending + Active outbreaks.
     - *Verified Outbreak Cases (Last 72h)*: Total cases across all outbreak diseases island-wide.
     - *Previous 72h*: Comparison volume.
     - *Overall Change (%)*: Relative surge percentage (or "new").
     - *Highest Incidence District*: District with the greatest population-normalized case rate.
  3. **Inspect Last Scan Status Line**:
     - Shows: *"Scan complete: N outbreaks detected, M signals suppressed. Last scan: [Timestamp], [N] cases scanned."*
  4. **Click "Run Statistical Detection Scan"**:
     - Dispatches `POST /api/admin/outbreak/trigger`.
     - Dual-gated EARS C2 scans verified consultations:
       - **Gampaha Dengue**: Triggers Pending Alert ($N \ge 5$, 4 consecutive days $z > 2.0$).
       - **Kandy Influenza**: Triggers Pending Alert ($N \ge 5$, 4 consecutive days $z > 2.0$).
       - **Kalutara (Negative Control)**: 1-day spike of 6 cases; **suppressed by Gate 2** (`PERSISTENCE_CRITERIA_NOT_MET`).
       - **Matara (Negative Control)**: Cluster of 4 cases; **suppressed by Gate 1** (`CASE_FLOOR_NOT_MET`).
  5. **Inspect Filtered Growth Table**:
     - Lists **only** diseases with an active/pending outbreak alert (Top 10 by last 72h cases).
     - Columns: Disease & ICD, Region, Last 72h, Previous 72h, Net Change, Change %, Share of Population (e.g. `0.0005%`, never `0%` if cases > 0), Cases per 100k, 7-Day Trend.
  6. **Inspect Suppressed Signals Panel**:
     - Expand the collapsed panel to prove noise suppression for Kalutara and Matara.
  7. **Outbreak Approval & Demonstration Email Workflow**:
     - Click **Approve** on the Gampaha Dengue alert.
     - The Approval Modal opens:
       - Notice primary metric: *"12 verified cases in the last 72h (previous 72h: 3, +9). 0.0005% of district population, 0.52 per 100,000."*
       - Click **"Preview Recipients"**: displays recipient breakdown by role.
       - Click **"Send Me a Test Email"**: delivers an immediate preview to the administrator.
       - Select Broadcast Scope: **Affected District Only**.
       - Notice the **Demonstration Banner**: Because the alert originates from synthetic seed data, emails are restricted to `OUTBREAK_DEMO_EMAIL_ALLOWLIST` with `[DEMONSTRATION]` subject prefix.
       - Click **Confirm Approval**: The alert transitions to `Active`.
- **Key Talking Point for Examiners**:
  > *"Our dual-gate statistical engine reduces annual simulated false alarms from 6.06 to 0.92 per year while maintaining a 1.0-day median detection delay. Real citizens are protected from test panic by strict demonstration email allowlisting."*

---

### Step 6: Syndromic Disease Analytics & ICD Autocomplete (10:30 – 11:30)
- **Role**: Epidemiological Officer.
- **URL**: `/admin/dashboard/analytics`.
- **Click-by-Click Sequence**:
  1. Open `/admin/dashboard/analytics` (Disease Analytics).
  2. Search for any condition in the autocomplete box: type `dengue`, `A90`, or Sinhala `ඩෙංගු`.
  3. Select `A90 - Dengue fever`.
  4. Select preset time range: `72h`, `7d`, `30d`.
  5. Observe the loaded metrics:
     - Total verified cases, affected districts, net change, peak day.
     - Continuous chronological AreaChart with zero-filled empty days.
     - Breakdown toggles: District table (with DCS population and incidence), Province breakdown, and Island-wide aggregate.
  6. Point out the honesty disclosure footnote: *"Verified MediSync clinical cases only (lower bound)."*
- **Key Talking Point for Examiners**:
  > *"Every recorded ICD code in the system can be tracked longitudinally in real time without creating pre-configured database indexes for each disease."*

---

### Step 7: Cryptographic Audit Ledger & Protected Release Baseline (11:30 – 12:00)
- **Role**: System Administrator / Security Officer.
- **URL**: `/admin/dashboard/sessions` and terminal.
- **Click-by-Click Sequence**:
  1. Open the Admin Audit Log: demonstrate append-only entries capturing actor identity, action type, IP address, and timestamp.
  2. Present the **15-File Protected Ledger** (`docs/release/PROTECTED_HASHES.json`):
     - Explain how SHA-256 cryptographic hashes protect core security invariants (authentication middleware, doctor controllers, encryption helpers, clinical safety boundaries).
     - Run the automated verification command:
       ```bash
       node -e "const fs=require('fs'), crypto=require('crypto'), m=JSON.parse(fs.readFileSync('docs/release/PROTECTED_HASHES.json','utf8')); console.log(m.files.every(f => crypto.createHash('sha256').update(fs.readFileSync(f.path)).digest('hex') === f.releaseCandidateSha256) ? '15/15 Protected Files Intact' : 'Ledger Tampered');"
       ```
     - Output confirms: `15/15 Protected Files Intact`.
- **Concluding Viva Statement**:
  > *"MediSync demonstrates that clinical utility, epidemiological intelligence, and strict data protection can coexist seamlessly on modern web architecture."*
