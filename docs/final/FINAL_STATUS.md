# MediSync Final Project Status & Capstone Release Assessment

**Release**: `v1.2.0-final-master`  
**Date**: 13 November 2026  
**Git Branch Baseline**: `release/final-master-nov13`  
**Protected Ledger**: **15 / 15 Files Locked & Byte-Exact** (`docs/release/PROTECTED_HASHES.json`)  
**Automated Verification Suite**: `MEDISYNC_OFFLINE_CI=true node scripts/run_offline_tests.js` (ci-offline profile). Latest totals are recorded in the hardening-run commit messages; 0 failed is required for every commit.  
**Client Production Build**: `npm --prefix client run build`, exit code 0 (warnings are listed by ESLint, not errors)  
**Reconciled with code**: 14 November 2026 (hardening run, Tasks 1–4)  

---

## 1. Executive Summary

MediSync is a cloud-native, trilingual (English, Sinhala, Tamil) outpatient health information, medicine safety, and syndromic outbreak surveillance platform engineered for Sri Lanka's public health ecosystem. 

The system operates across three distributed cloud layers:
1. **Frontend**: React 19 (19.2.x, Create React App / react-scripts 5) SPA hosted on Vercel (`https://medisync.chamodtharusha.com.lk`).
2. **Backend**: Express 5 REST API on Mongoose 9, with field-level encryption (AES-256-CBC, no authentication tag; see `FIELD_ENCRYPTION.md`) and HMAC blind indexing, hosted on Render (`https://medisync-wabc.onrender.com`).
3. **ML Microservice**: Python/Flask lexical information retrieval engine, hosted on Render Free Tier (`https://medisync-ml.onrender.com`). Two symptom-profile tiers are loaded by `ml-engine/app.py`:
   - **Tier 1:** 41 curated disease labels from `ml-engine/data/dataset.csv` (4,920 rows).
   - **Tier 2:** 174 knowledge-base profiles from `ml-engine/data/disease_symptom_kb.v1.json` (SymCAT-derived; licence unverified; `exact_normalized` ICD-10 mappings only).
   - 71,704 searchable ICD-10-CM leaf concepts for manual diagnosis.

---

## 2. What Is Complete & Formally Verified

| Capability | Verification Evidence | Operational Reality |
|---|---|---|
| **5 Role-Based Portals** | `server/tests/ir04BackendIntegration.test.js` (needs a local MongoDB replica set; not part of the ci-offline profile), `client/tests/ir04-isolated-five-role-e2e.spec.js` (Playwright; stale pharmacy-stock assertions, not run offline), Live Audit LT-15 through LT-19 | The 5 core system roles (`patient`, `doctor`, `pharmacy`, `hospital`, `admin`) are operational with strict HTTP 401/403 authorization barriers. |
| **Doctor Safety Override Engine** | `server/tests/doctorSafetyOverride.test.js`, `server/tests/medicationSafetyWorkflow.test.js` | Non-blocking clinical safety engine: warns doctor of DDIs, dosage ceilings, and allergies; enables issuance after mandatory acknowledgment and clinician responsibility justification for severe/critical findings. |
| **Prescription Lifecycle & Auto-Supersession** | `server/tests/prescriptionSupersession.test.js` | Atomic supersession of active matching prescriptions on new issuance; dynamic active state calculation (`active`, `expired`, `superseded`, `cancelled`); non-dispensable queue hygiene. |
| **Medicine Catalogue Coverage** | `server/tests/medicineCoverageAndPrefixSearch.test.js`, `server/tests/hardcodedMetricAudit.test.js` | The server's medicine catalogue is **3,000 entries** in `server/reference-data/drugs_clean.json` (4,615 brand/trade names; 69% resolve cleanly to active ingredients; see `MEDICINE_COVERAGE.md`). `ml-engine/data/medicines.csv` (23,939 rows) is a scrape of an Indian online retail pharmacy listing (INR prices, 6,378 unique generic names). It is **not** a list of approved medicines, is read only by `ml-engine/preprocess_datasets.py`, and is **not used by the server**. |
| **ICD Classification Alignment & Universal Surveillance** | `server/tests/icdClassificationAlignment.test.js`, `server/tests/universalIcdOutbreakCoverage.test.js` | Full support for 71,704 US ICD-10-CM leaf concepts and WHO ICD-11 codes. Surveillance engine proved to detect outbreaks across 300+ sampled codes across all 21 ICD chapters. |
| **Audit Log Completeness & Search** | `server/tests/auditCoverage.test.js` | Every mutating route found by the route scanner must emit a structured audit event (the test requires more than 80; `server/src/routes` declares 96 POST/PUT/PATCH/DELETE handlers as of 14 Nov 2026). Administrative audit search by actor or target email address. |
| **Mobile-First QR Verification** | `server/tests/otpVerificationPortal.test.js`, `server/tests/testOtpRemovalOffline.test.js` | Consultation verification QR links to `/verify/:token`. Displays public authenticity card; dynamic 6-digit email OTP unlocks single clinical encounter without requiring NIC entry on mobile devices; 5-wrong-OTP lockout protection. |
| **Prescription-Verification Dispensing (No Inventory)** | `server/tests/dispenseInventoryFree.test.js`, `server/tests/dispensingIntegrityPhase3.test.js`, `server/tests/pharmacyInventoryRemovalTask3.test.js` | Pharmacists verify a prescription against the patient (consent OTP) and record dispensing; double-dispensing lockout (`ALREADY_DISPENSED`). No stock, batches, reorder levels, restock analytics or manual OTC checkout in the UI. `GET /api/pharmacy/inventory` returns 410 Gone. The legacy `POST /api/pharmacy/dispense-otc` endpoint still exists server-side (used by a protected e2e spec) but has no UI. |
| **Emergency Red-Flag Screening** | `server/tests/clinicalSafetyPhase4.test.js` | Heuristic rule-based emergency triage (`emergencyRedFlags.json`); flags 6 critical syndromes (meningism, cardiorespiratory distress, acute coronary, altered mental status, anaphylaxis, severe hemorrhage) as non-blocking advisories. |
| **Medicine Safety Engine** | `server/tests/medicationSafety.test.js`, `server/tests/medicationSafetyWorkflow.test.js` | 5-point safety check: active ingredient mapping, pairwise drug-drug interactions (DDI), single-dose ceilings, daily dose ceilings, course duration limits, and patient allergy alerts. |
| **Dual-Gated Outbreak Surveillance** | `server/tests/surveillanceOutbreakDetector.test.js`, `server/tests/outbreakDetectorConsistency.test.js`, `scripts/ml_eval/evaluate_outbreak_detector.py` | Modified EARS C2 algorithm with Dual Noise Suppression Gates ($N \ge 5$ in the 7-day window; at least 2 consecutive days with strict $z > 2.0$, per `surveillanceService.js`). Severity bands use $z \ge 2.0$ / $3.0$ / $4.0$. Detection runs at **district level only**. Province and island evaluators exist in code but are not called by the scan. Reduces simulated false alarms from 6.06 to 0.92 per year while maintaining a 1.0-day median detection delay. |
| **Calibrated Trend Projection** | `server/tests/outbreakForecasting.test.js`, `scripts/ml_eval/backtest_projection.py` | Ordinary Least Squares (OLS) trend line with Student's t 95% prediction intervals (94.9%–95.5% empirical coverage in 200-series backtest). Honestly labeled as statistical trend projection, not epidemic forecast. |
| **Official DCS Demographics** | `server/tests/hardcodedMetricAudit.test.js`, `server/src/data/districtPopulation2024.json` | All 25 administrative districts normalized using official Department of Census and Statistics (DCS) Census 2012 figures (Island total: 20,358,680) byte-identical across server and client. |
| **Trilingual UI Localization** | `client/src/__master_offline__/d4-any-disease-coverage.test.jsx` | 100% key parity across `en.js`, `si.js`, and `ta.js`: **900 leaf keys** each as of 14 Nov 2026 (one demonstration label added, 17 inventory keys removed). The test asserts identical key sets rather than a fixed total. Some pages, for example parts of `Home.jsx`, still contain English-only literals. |
| **Field-Level Encryption at Rest** | `server/src/models/Patient.js`, `server/src/models/Consultation.js` | AES-256-CBC encryption at rest (via `mongoose-field-encryption`; **no authentication tag**; key = first 32 hex characters of SHA-256 of the secret) for patient `['fullName', 'contactInfo', 'allergies']` and consultation `['patientNic', 'diagnosis', 'notes']`. Search lookups use HMAC-SHA256 blind indexing. Limitations and a GCM migration plan are in `FIELD_ENCRYPTION.md`. |
| **Clinical PDF Export** | `server/tests/pdfEncryptionHonestyTask2.test.js`, `server/tests/pdfSecurityAndLayout.test.js` | Off by default (`PDF_EXPORT_ENABLED`, `REACT_APP_PDF_EXPORT_ENABLED`). When enabled, files are **RC4-128** (`/V 2 /R 3`) with an NIC- or reference-derived password, and are refused if neither exists. This is a casual-access deterrent only; see `PDF_ENCRYPTION_LIMITATION.md`. |
| **Zero Hardcoded Fake UI Metrics** | `server/tests/hardcodedMetricAudit.test.js` | Automated CI test confirms zero unapproved literal statistics in JSX across all pages and components. Hardcoded AI risk percentages excised. |

---

## 3. What Is Intentionally NOT Built (Design Boundaries)

To maintain absolute academic and clinical honesty, the following features are explicitly omitted from the prototype by design:

1. **No Pharmacy Inventory, Stock or Restock Management**:
   - Dispensing is prescription verification only. MediSync does not track stock levels, batches, reorder thresholds, restock predictions or shelf counts, and the pharmacy UI has no manual over-the-counter checkout.
2. **No Appointment Scheduling or OPD Queue Management**:
   - Outpatient consultations are initiated on-demand by entering the patient's National Identity Card (NIC) with OTP consent. There is no appointment calendar or token ticket dispenser.
3. **No Organ-Specific or Age-Adjusted Dosing Engines**:
   - The medicine safety engine checks dosages against absolute outpatient BNF thresholds. It does **not** evaluate renal creatinine clearance, hepatic Child-Pugh scores, pediatric weight-based (mg/kg) dosing, or geriatric Beers criteria.
4. **No Validated Clinical Diagnostic Claims**:
   - The ML triage microservice is a sparse retrieval and lexical matching system designed for differential triage auto-suggestion. All predictions carry the permanent caveat `clinicalValidation: not_established`. It is not an autonomous diagnostic medical device.
5. **No Speculative SEIR Dynamic Epidemic Modeling**:
   - Outbreak projections are linear statistical trends with 95% confidence bounds, not dynamic compartmental transmission forecasts with viral reproduction numbers ($R_0/R_t$).

---

## 4. What Is Simulated Versus Real

- **Real / Non-Synthetic User Accounts**:
  - The presenter and testers log in using real, non-seeded accounts for Doctor, Pharmacist, Hospital Admin, and System Admin roles.
  - Production security actively rejects synthetic persona accounts (`isSynthetic: true`) for login.
- **Synthetic Demonstration Fixtures**:
  - Demo Patient NIC `200012345678` and outbreak consultation clusters are seeded with `isSynthetic: true` and `syntheticSeedBatch: "viva-2026-11-outbreaks"`:
    - triggering scenarios: Gampaha Dengue, Kandy Influenza, Galle Leptospirosis, Ratnapura Typhoid and Colombo Chickenpox
    - negative controls: Kalutara Dengue (one-day spike of 6, suppressed by persistence) and Matara Dengue (3 cases, suppressed by the N ≥ 5 floor)
  - The seeded viva cases are excluded from the public health statistics and public consultation activity endpoints. They are counted in admin-only views (outbreak scan, 72-hour growth tiles, disease analytics).
  - These records exist strictly to demonstrate consent-based patient lookups and public health surveillance.
- **Demonstration Alert Broadcast Allowlist** (fixed in the 14 Nov 2026 hardening run; before that, seeded viva alerts were not flagged and approval could email real users):
  - The surveillance scan flags any alert built from synthetic consultations (`isSynthetic` or `syntheticSeedBatch`) with `isDemoData: true`, `isSynthetic: true` and the seed batch id.
  - Approval emails for such alerts go only to `OUTBREAK_DEMO_EMAIL_ALLOWLIST` (or, if that is empty, only to the approving reviewer's own address), with a `[DEMONSTRATION]` subject prefix and a red banner.
  - Alerts created before the fix are checked through their source consultations. If that lookup fails, the alert is treated as demonstration (fail closed).
  - Real (non-demo) outbreak broadcast is **off unless `OUTBREAK_EMAIL_DELIVERY_ENABLED=true`**.
  - Approved viva alerts still appear on `/public-health` with a "Demonstration data" label.
  - Verified by `server/tests/outbreakDemoTaggingTask1.test.js` (offline). Not live-verified.

---

## 5. Security & Protected Ledger Status

The 15 most safety-critical files in the repository are locked and continuously verified against `docs/release/PROTECTED_HASHES.json`:
- All 15 files are **100% byte-exact matches** (SHA-256 verified).
- No unapproved modifications have occurred.
