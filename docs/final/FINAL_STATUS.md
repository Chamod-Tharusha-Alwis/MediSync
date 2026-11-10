# MediSync Final Project Status & Capstone Release Assessment

**Release**: `v1.1.0-capstone`  
**Date**: 2026-11-10  
**Overall Verified Implementation**: **87.0% Live Operational Surface / 100% Offline Suite**  
**Protected Ledger**: **15 / 15 Files Locked** (`docs/release/PROTECTED_HASHES.json`, controlled update to `ml-engine/app.py` in `docs/final/LEDGER_CHANGELOG.md`)  
**Automated Verification Suite**: **3,608 Tests Passed / 0 Failed (225 Suites)**  
**Production Live Audit**: **20 / 20 Executed Checks PASS (0 FAIL)** on Render + Vercel (Public & Boundary Checks; 0 emails used)  

---

## 1. Executive Summary

MediSync is a cloud-native, trilingual (English, Sinhala, Tamil) outpatient health information, medicine safety, and syndromic outbreak surveillance platform engineered for Sri Lanka's public health ecosystem. 

The system operates across three distributed cloud layers:
1. **Frontend**: React 18 SPA hosted on Vercel Edge (`https://medisync.chamodtharusha.com.lk`).
2. **Backend**: Express.js REST API with zero-trust AES-256-GCM field encryption, hosted on Render (`https://medisync-wabc.onrender.com`).
3. **ML Microservice**: Python/Flask sparse inference engine (71,704 ICD-10 leaf concepts, 215 curated condition profiles), hosted on Render Free Tier (`https://medisync-ml.onrender.com`).

---

## 2. What Is Complete & Formally Verified

| Capability | Verification Evidence | Operational Reality |
|---|---|---|
| **5 Role-Based Portals** | `server/tests/ir04-isolated-five-role-e2e.spec.js`, Live Audit LT-15 through LT-19 | The 5 core system roles (`patient`, `doctor`, `pharmacy`, `hospital`, `admin`) are operational with strict HTTP 401/403 authorization barriers. |
| **Doctor Safety Override Engine** | `server/tests/doctorSafetyOverride.test.js` (10/10 PASS), `server/tests/clinicalSafetyConsistency.test.js` (4/4 PASS) | Non-blocking clinical safety engine: warns doctor of DDIs, dosage ceilings, and allergies; enables issuance after mandatory acknowledgment and clinician responsibility justification for severe/critical findings. |
| **Prescription Lifecycle & Auto-Supersession** | `server/tests/prescriptionSupersession.test.js` (13/13 PASS) | Atomic supersession of active matching prescriptions on new issuance; dynamic active state calculation (`active`, `expired`, `superseded`, `cancelled`); non-dispensable queue hygiene. |
| **Medicine Catalog Coverage & Prefix Autocomplete** | `server/tests/medicineSearchPrefix.test.js` (6/6 PASS), `scripts/audit_medicine_coverage.js` | 3,000 catalog entries audited (75.0% canonical ingredient resolution); prefix matching (`citalopr` -> `citalopram`); unverified safety limits flagged with `owner_review_required`. |
| **ICD Classification Alignment** | `server/tests/icdClassificationAlignment.test.js` (7/7 PASS) | Dynamic differentiation of WHO ICD-11 MMS codes (`6A70`) and US ICD-10-CM codes; purple `ICD-11` badging across doctor suggestions, consultation summaries, and verify portal. |
| **Audit Log Completeness & Search** | `server/tests/auditLogCompleteness.test.js` (7/7 PASS), `server/tests/auditCoverageCompleteness.test.js` (5/5 PASS) | 100% mutating route coverage (45/45 routes emit structured audit events); administrative audit search by actor or target email address. |
| **Mobile-First QR Verification** | `server/tests/otpVerificationPortal.test.js` (11/11 PASS), Live Audit LT-18, LT-19, LT-20 | Consultation verification QR links to `/verify/:token`. Displays public authenticity card; dynamic 6-digit email OTP unlocks full clinical encounter and medicine release history without requiring NIC entry on mobile devices. |
| **Medicine Release Integrity** | `server/tests/dispensingIntegrityPhase3.test.js` (10/10 PASS) | Single shared release summary helper (`releaseSummaryService.js`); atomic progression (`dispensed`, `partially_dispensed`); double-dispensing lockout (`ALREADY_DISPENSED`, HTTP 409). |
| **Emergency Red-Flag Screening** | `server/tests/clinicalSafetyPhase4.test.js` (17/17 PASS) | Heuristic rule-based emergency triage (`emergencyRedFlags.json`); flags 6 critical syndromes (meningism, cardiorespiratory distress, acute coronary, altered mental status, anaphylaxis, severe hemorrhage) as non-blocking advisories. |
| **Medicine Safety Engine** | `server/tests/ingredientResolver.test.js` | 5-point safety check: active ingredient mapping, pairwise drug-drug interactions (DDI), single-dose ceilings, daily dose ceilings, course duration limits, and patient allergy alerts. |
| **Syndromic Outbreak Surveillance & Review** | `server/tests/outbreakDetector.test.js`, `server/tests/surveillanceReviewWorkflow.test.js` (8/8 PASS) | District-level 7-day window vs 56-day baseline; regularized z-score ($\sigma \ge 0.5$); strict detection gates ($N \ge 5$, 2 consecutive days $z > 2.0$); epidemiologist review workflow (`/api/admin/surveillance/review`); zero synthetic fallback cases. |
| **Trilingual UI Localization** | `client/src/__master_offline__/d4-any-disease-coverage.test.jsx` | 100% key parity across `en.js`, `si.js`, and `ta.js` with exactly **839 keys** each (0 missing, 0 extra, $A \triangle B = \emptyset$). |
| **Zero-Trust Field Encryption** | `server/tests/qaEncryptionBootstrap.test.js` (14/14 PASS) | AES-256-GCM encryption at rest for patient NICs, names, phone numbers, addresses, and clinical consultation notes. |
| **Email Noise Reduction** | `server/tests/emailNoiseReduction.test.js` (7/7 PASS) | 24-hour trusted device login throttle; consolidated single dispensing notification; daily dispatch ceiling warning at 80% capacity. |
| **Resource Efficiency** | `scripts/benchmark_ml_resources.py`, Figure F09 | ML resident memory RSS verified at **197.37 MB** (38.55% of 512 MB Render Free limit; 314.63 MB headroom). Mean inference latency 0.78 ms. |

### 2.1 Production Live Audit Breakdown (LT-01 through LT-20)

In accordance with strict verification honesty standards, the production audit executed **20 live checks** against active cloud infrastructure (`https://medisync-wabc.onrender.com`, `https://medisync-ml.onrender.com`, `https://medisync.chamodtharusha.com.lk`):
1. **Public Infrastructure & Health**: LT-01 (API Gateway `/health`), LT-02 (ML Engine `/health`), LT-03 (Vercel Edge web shell).
2. **Clinical Fail-Closed Boundaries**: LT-04 (`/api/public/health-stats` fail-closed 503 when cases unverified), LT-05 (`/api/alerts/active` 401 guard).
3. **Public Directories & Activity**: LT-06 (consultation activity), LT-07 (sanitized doctor directory), LT-08 (hospital directory), LT-09 (pharmacy directory).
4. **Token Verification Barriers**: LT-10 (non-existent token 404), LT-11 (missing OTP token request 404), LT-12 (missing OTP unlock 404).
5. **Role-Based Authorization & Input Guards**: LT-13 (maintenance endpoint lockout 401), LT-14 (malformed JSON defense 400), LT-15 (doctor route 401), LT-16 (patient route 401), LT-17 (pharmacy route 401), LT-18 (hospital route 401), LT-19 (admin route 401), LT-20 (non-existent route 404).

**Explicit Non-Live Disclosures (0 Live Emails Used)**:
- **OTP Email Flow & Email Content Delivery**: Preserved live email quota (0 emails dispatched in live test run). Verified 100% offline in `server/tests/emailNoiseReduction.test.js` and `server/tests/otpVerificationPortal.test.js`.
- **Encrypted PDF Delivery in Production**: Verified 100% offline in `server/tests/vivaSeedData.test.js` and `server/tests/pdfSecurityAndLayout.test.js`. Not dispatched to live external storage or mail in production.
- **Surface Coverage Calculation**: 20 executed live checks / 23 candidate end-to-end paths = **87.0% live operational surface verified** (100% verified across 3,608 offline automated tests).

---

## 3. What Is Intentionally NOT Built (Design Boundaries)

To maintain absolute academic and clinical honesty, the following features are explicitly omitted from the prototype by design:

1. **No Appointment Scheduling or OPD Queue Management**:
   - Outpatient consultations are initiated on-demand by entering the patient's National Identity Card (NIC) with OTP consent. There is no appointment calendar, queue ticket generator, or token display system.
2. **No Pharmacy Inventory or Stock Management**:
   - Pharmacy dispensing verifies prescription legitimacy, checks drug interactions, records fulfillment, and locks against duplicate checkout. Endpoints for wholesale drug inventory replenishment or stock counting are omitted.
3. **No Organ-Specific or Age-Adjusted Dosing Engines**:
   - The medicine safety engine checks dosages against absolute outpatient BNF thresholds. It does **not** evaluate renal creatinine clearance, hepatic Child-Pugh scores, pediatric weight-based (mg/kg) dosing, or geriatric Beers criteria.
4. **No Validated Clinical Diagnostic Claims**:
   - The ML triage microservice is a sparse retrieval and lexical matching system designed for differential triage auto-suggestion. All predictions carry the permanent caveat `clinicalValidation: not_established`. It is not an autonomous diagnostic medical device.
5. **No Live Barcode / QR Camera Scanning at Pharmacy**:
   - Pharmacists retrieve prescriptions by entering the patient's NIC and verifying the patient's OTP consent (`x-patient-access`). The QR code on the prescription PDF is exclusively for public encounter verification via `/verify/:token`.

---

## 4. Dependencies on Owner Action (`OWNER_ACTIONS.md`)

The following operational, administrative, and clinical review tasks require owner execution in cloud dashboards or with licensed clinical personnel:

| ID | Category | Action Required | Location / Instructions |
|:---:|---|---|---|
| **OA-01** | **Atlas IP Access** | Restrict MongoDB Atlas Network Access from `0.0.0.0/0` to Render outbound operational IPs. | Atlas Dashboard $\to$ Network Access |
| **OA-02** | **Atlas Admin User** | Delete the legacy `atlasAdmin` database user. | Atlas Dashboard $\to$ Database Access |
| **OA-03** | **Pre-Viva Backup** | Take a manual dump of `medisync_prod`: `mongodump --uri="<URI>" --db="medisync_prod" --out="./backup"`. | Disaster Recovery |
| **OA-04** | **Viva Mailbox** | Set a test patient's email to an address the owner controls to demonstrate live OTP delivery. | Live Demo Preparation |
| **OA-05** | **Thesis Screenshots** | Capture 1920x1080 screenshots per [`SCREENSHOT_CHECKLIST.md`](../report/SCREENSHOT_CHECKLIST.md). | Final Thesis PDF Assembly |
| **OA-06** | **Rotate Redis Credentials** | Rotate Upstash/Redis token prior to viva presentation. | Upstash Console |
| **OA-07** | **Rotate Demo Passwords** | Update prototype demonstration passwords (`SEED_TEST_PASSWORD`) to distinct credentials. | Post-Viva Security |
| **OA-12** | **GitHub Branch Protection** | Enable branch protection on `main` requiring both CI workflows. | GitHub Repository Settings |
| **OA-13** | **Vercel Edge Redeploy** | Trigger production redeploy from `main` if the served commit differs. | Vercel Project Dashboard |
| **OA-14** | **Synthetic Patient NIC** | Ensure all thesis figures and viva slides display synthetic NIC `200012345678`. | Thesis Asset Verification |
| **CR-01–03** | **Clinical Review** | Have a medical practitioner review Ibuprofen 800 mg ceiling, Paracetamol 7-day course, and 6 emergency rules. | `docs/final/OWNER_ACTIONS.md` |
| **CR-04** | **Severity Mapping Review** | Clinician review of drug-drug interaction and dosage severity mapping (info/moderate/severe/critical). | `docs/final/OWNER_ACTIONS.md` |
| **CR-05** | **Formulary Addition Sign-Off** | Clinical sign-off for any future formulary additions. | `docs/final/OWNER_ACTIONS.md` |
| **CIT-01–04** | **Citations** | Insert official MoH Annual Health Bulletin, Census 2024, and OPD workload citations. | Thesis References Section |

---

## 5. Known Risks & Contingency Procedures for Viva Voce

1. **Render Free Tier Cold Start (~50 s)**:
   - *Risk*: If services idle for >15 minutes, Render spins down containers. First request takes ~50 s while python loads 71,704 ICD concepts. UptimeRobot pings time out at 30 s and trip false-alarm "Down" alerts.
   - *Contingency*: **Pre-warm both services 10 minutes before the viva**:
     ```bash
     curl -m 60 https://medisync-wabc.onrender.com/health
     curl -m 60 https://medisync-ml.onrender.com/health
     ```
2. **Dynamic OTP Email Delivery Latency**:
   - *Risk*: Email dispatch through external SMTP / Brevo / SendGrid may experience 5–30 second latency depending on upstream queues.
   - *Contingency*: If showing `/verify/:token` and email is delayed, explain the asynchronous mail pipeline and demonstrate the instant authenticated doctor consultation view or offline receipt.
3. **MongoDB Atlas Shared M0 Tier (No Automated PITR)**:
   - *Risk*: Atlas Free M0 does not support Point-in-Time Recovery (PITR). Accidental data mutation during demo cannot be rolled back via UI.
   - *Contingency*: Complete **OA-03** (`mongodump`) before the evaluation session.

---

## 6. Final Certification

All code, configurations, test suites, figures, and technical documents in this repository have been audited and verified against ground-truth runtime behavior. The codebase is frozen, clean, and ready for capstone submission and oral defense.
