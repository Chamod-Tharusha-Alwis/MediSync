# MediSync Final Project Status & Capstone Release Assessment

**Release**: `v1.1.0-capstone`  
**Date**: 2026-11-11  
**Verification Coverage**: **20 Unauthenticated & Public Live Boundary Checks / 100% Offline Automated Regression**  
**Protected Ledger**: **15 / 15 Files Locked** (`docs/release/PROTECTED_HASHES.json`, controlled update to `ml-engine/app.py` in `docs/final/LEDGER_CHANGELOG.md`)  
**Automated Verification Suite**: **3,651 Tests Passed / 0 Failed (228 Suites)**  
**Production Live Audit**: **20 / 20 Executed Checks PASS (0 FAIL)** on Render + Vercel (Public & Boundary Checks; 0 emails used)  

---

## 1. Executive Summary

MediSync is a cloud-native, trilingual (English, Sinhala, Tamil) outpatient health information, medicine safety, and syndromic outbreak surveillance platform engineered for Sri Lanka's public health ecosystem. 

The system operates across three distributed cloud layers:
1. **Frontend**: React 18 SPA hosted on Vercel Edge (`https://medisync.chamodtharusha.com.lk`).
2. **Backend**: Express.js REST API with field-level encryption (AES-256-CBC) and HMAC blind indexing, hosted on Render (`https://medisync-wabc.onrender.com`).
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
| **Field-Level Encryption at Rest (Partial)** | `server/src/models/Patient.js`, `server/src/models/Consultation.js` | Legacy AES-256-CBC encryption at rest for patient `['fullName', 'contactInfo', 'allergies']` and consultation `['patientNic', 'diagnosis', 'notes']`. Patient NIC, email, address, and birth date are unencrypted at rest; search lookups use HMAC-SHA256 blind indexing. |
| **Email Noise Reduction** | `server/tests/emailNoiseReduction.test.js` (7/7 PASS) | 24-hour trusted device login throttle; consolidated single dispensing notification; daily dispatch ceiling warning at 80% capacity. |
| **Resource Efficiency** | `scripts/benchmark_ml_resources.py`, Figure F09 | ML resident memory RSS verified at **197.37 MB** (38.55% of 512 MB Render Free limit; 314.63 MB headroom). Mean inference latency 0.78 ms. |

### 2.1 Production Live Audit Breakdown (LT-01 through LT-20)

In accordance with strict verification honesty standards, the production audit executed **20 unauthenticated and public boundary checks** against active cloud infrastructure (`https://medisync-wabc.onrender.com`, `https://medisync-ml.onrender.com`, `https://medisync.chamodtharusha.com.lk`):
1. **Public Infrastructure & Health**: LT-01 (API Gateway `/health`), LT-02 (ML Engine `/health`), LT-03 (Vercel Edge web shell).
2. **Clinical Fail-Closed Boundaries**: LT-04 (`/api/public/health-stats` 200 with verified/awaiting state), LT-05 (`/api/alerts/active` 200 public active alerts query).
3. **Public Directories & Activity**: LT-06 (consultation activity), LT-07 (sanitized doctor directory), LT-08 (hospital directory), LT-09 (pharmacy directory).
4. **Token Verification Barriers**: LT-10 (non-existent token 404), LT-11 (missing OTP token request 404), LT-12 (missing OTP unlock 404).
5. **Role-Based Authorization & Input Guards**: LT-13 (maintenance endpoint lockout 401), LT-14 (malformed JSON defense 400), LT-15 (doctor route 401), LT-16 (patient route 401), LT-17 (pharmacy route 401), LT-18 (hospital route 401), LT-19 (admin route 401), LT-20 (non-existent route 404).

**Explicit Non-Live Disclosures (0 Live Emails Used)**:
- **OTP Email Flow & Email Content Delivery**: Preserved live email quota (0 emails dispatched in live test run). Verified 100% offline in `server/tests/emailNoiseReduction.test.js` and `server/tests/otpVerificationPortal.test.js`.
- **Encrypted PDF Delivery in Production**: Verified 100% offline in `server/tests/vivaSeedData.test.js` and `server/tests/pdfSecurityAndLayout.test.js`. Not dispatched to live external storage or mail in production.
- **Verification Distinction**: The 20 live checks test external boundary defenses and public read contracts over the network. Authenticated multi-role workflows, stateful database mutations, and encryption invariants are comprehensively verified across 3,651 offline automated tests.

---

## 3. What Is Intentionally NOT Built (Design Boundaries)

To maintain absolute academic and clinical honesty, the following features are explicitly omitted from the prototype by design:

1. **No Appointment Scheduling or OPD Queue Management**:
   - Outpatient consultations are initiated on-demand by entering the patient's National Identity Card (NIC) with OTP consent. There is no appointment calendar, queue ticket generator, or token display system.
2. **Embedded Pharmacy Stock**:
   - The application stores stock in `Pharmacy.inventory`. This candidate exposes a staff-scoped read endpoint and requires a successful conditional decrement for stock-backed checkouts.
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

## 6. Final Factual Summary & Security Review Status

The live QA repair candidate has been audited and verified across 3,670 automated offline tests (0 failed, 0 skipped across 228 test suites), client production build exit code 0, and 15/15 protected ledger files byte-exact. Source inspection and offline tests for the repair candidate are recorded in [the repair report](LIVE_QA_FIX_REPORT.md).

An independent read-only security audit was conducted on 2026-11-11 (`docs/final/SECURITY_REVIEW_20261111.md`). Core remediations have been implemented and verified:
- **Token Revocation Authorization (F01)**: Only the issuing doctor, patient owner, or administrator can revoke verification tokens; 409/410 returned for already revoked/expired tokens.
- **Encounter PDF Authorization Gate (F02)**: Direct NIC authorization parameter removed; requires a valid purpose-bound view session (`qr_view_session`); export is strictly bounded to the encounter. Full history requests return 403 `FULL_HISTORY_CONSENT_REQUIRED`.
- **Atomic OTP Race Control (F03)**: OTP attempt counting and consumption are atomic via `findOneAndUpdate` with `used: false`, `tokenHash`, expiry, and attempt ceiling predicates; losing concurrent requests fail cleanly.
- **Audit Details Schema & PII Sanitization (F06)**: Structured `details` field persisted with strict PII suppression stripping patient identifiers, emails, and credentials.
- **Controller Error Sanitization (F07)**: `verificationController.js` catch blocks return generic public error messages, never leaking internal runtime error text.
- **Allergy State Differentiation (F04 partial)**: Decryption failure is distinguished from known clean zero allergies (`allergiesStatus: 'unavailable'`, `allergies: null`).
- **OTP Invalidation Scope (F09 partial)**: Session purge predicates are bound to specific `tokenHash` to avoid cross-token interference.

Known architectural limitations remain transparently documented in `docs/report/chapters/07_security_privacy.md`, `docs/report/chapters/11_limitations_future_work.md`, and `docs/final/SECURITY_STATUS.md`:
1. Database field encryption uses AES-256-CBC with SHA-256 key hash (not AES-256-GCM AEAD); only specific fields are encrypted (`Patient`: fullName, contactInfo, allergies; `Consultation`: patientNic, diagnosis, notes; NIC, email, address unencrypted).
2. PDF export uses legacy RC4-128 via `@pdfsmaller/pdf-encrypt-lite` with identifier-derived password; the operator reported `PDF_EXPORT_ENABLED=true` on 11 November 2026. The hold returns 503 when the flag is unset or false. QR exports require a view session scoped to the encounter. The patient consultation button checks `REACT_APP_PDF_EXPORT_ENABLED`.
3. Client refresh tokens are stored in browser `localStorage`.
4. ML engine internal HMAC signatures bind to a 1-hour window (`floor(time.time() / 3600)`) without per-request replay nonces.
6. Secondary controllers returning raw `error.message` on 500 (`doctorController.js` locked under protected ledger, tracked in `OWNER_ACTIONS.md` OA-17).
