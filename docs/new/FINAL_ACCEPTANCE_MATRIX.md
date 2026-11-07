# MediSync — Final Acceptance Verification Matrix

**Release Candidate**: `feat/final-stage-b2-to-g`  
**Target Environment**: Production (`https://medisync.chamodtharusha.com.lk`)  
**Date of Verification**: 2026-11-07  
**Overall Verdict**: READY FOR OWNER MERGE & DEPLOYMENT  

---

## 1. Offline Regression Suite Matrix

Command: `node scripts/run_offline_tests.js`  
Result: **3,479 Passed, 0 Failed, 0 Skipped**  
Integrity: `sourceFrozen: true`, `protectedAccountedFor: 15/15`  

| Profile | Test Runner | Suites | Passed | Failed | Skipped | Status | Details |
|---|---|:---:|:---:|:---:|:---:|:---:|---|
| **backend** | Jest (Clinical Offline) | 121 | 2,659 | 0 | 0 | PASS | Includes auth, consultations, lab routes, PDF export gates, role policies, demo batch removal |
| **client** | Jest / React Testing Lib | 75 | 656 | 0 | 0 | PASS | Component rendering, trilingual i18n parity, route access, UI responsiveness |
| **email-pdf** | Custom Runner | 2 | 31 | 0 | 0 | PASS | Resend/Brevo fallback contracts, WinAnsi font replacement, PDF generation buffers |
| **ml-scoring** | Python PyTest | 1 | 40 | 0 | 0 | PASS | TF-IDF disease similarity bounds, symptom normalization, inference robustness |
| **ml-flask** | Flask Test Client | 1 | 31 | 0 | 0 | PASS | Endpoint response envelopes, cold-start timeouts, catalog ingestion boundaries |
| **root** | Node Harness | 1 | 55 | 0 | 0 | PASS | Seed validation, key ring policies, database admission contracts |
| **ml-status-contract** | Diagnostic Runner | 1 | 7 | 0 | 0 | PASS | Verification of `clinicalValidation: not_established` contract & payload specs |
| **TOTAL** | **Multi-Profile Gate** | **202** | **3,479** | **0** | **0** | **PASS** | **Full pass with zero defects or bypassed suites** |

---

## 2. Protected Files Integrity Ledger

Reference: `docs/release/PROTECTED_HASHES.json` (15/15 valid, 0 discrepancies)

| File Path | Hash Verification | Pin Reason |
|---|:---:|---|
| `server/src/middleware/auth.js` | MATCH | Unmodified from approved authorization redaction baseline |
| `server/src/controllers/doctorController.js` | MATCH | Unmodified from approved doctor transaction baseline |
| `ml-engine/app.py` | MATCH | Operator approved batch snapshot ingestion & historical line endings |
| `ml-engine/evaluate_symptom_model.py` | MATCH | Unmodified from approved symptom model evaluation baseline |
| `client/src/components/SymptomTagInput.jsx` | MATCH | Unmodified from approved UI symptom tag input component |
| `server/tests/ir04BackendIntegration.test.js` | MATCH | Re-pinned in M2 after surgical inventory subsystem removal |
| `server/tests/patientProfileOwnedIntegration.test.js` | MATCH | Unmodified from approved patient profile owned integration test |
| `server/tests/prescriptionDurationOwnedIntegration.test.js` | MATCH | Unmodified from approved duration validation baseline |
| `server/tests/prescriptionItemOwnedIntegration.test.js` | MATCH | Unmodified from approved prescription item owned integration baseline |
| `server/src/security/operatorKeyPolicy.js` | MATCH | Unmodified operator cryptographic key ring policy |
| `server/src/security/productionAtlasPolicy.js` | MATCH | Unmodified production database connection guards |
| `server/src/security/qaConnectionAdmission.js` | MATCH | Unmodified QA environment connection admission guard |
| `server/scripts/operatorDatabaseMode.js` | MATCH | Driver SASL SCRAM-SHA-1 negotiation fix (PR #16) |
| `scripts/seedPlatformStore.cjs` | MATCH | Unmodified from approved platform seed storage adapter |
| `scripts/seed-platform-data.js` | MATCH | Exponential backoff retry addition verified |

---

## 3. Client Production Build Matrix

Command: `npm --prefix client run build`  
Result: **Exit Code 0 (Success)**  

| Property | Value | Evaluation |
|---|---|:---:|
| Build Tool | `react-scripts build` (via `scripts/buildClinical.cjs`) | PASS |
| Entry Point | `src/index.js` -> `src/App.js` | PASS |
| Bundled Modules | 117 modules | PASS |
| Demo Imports | `demoImported: false` | PASS |
| Active Profile | `clinical-production` | PASS |
| Main Bundle Size | 210.66 kB (gzipped) | PASS |
| Main CSS Size | 22.71 kB (gzipped) | PASS |

---

## 4. Live Public Read-Only Verification Matrix

Target: `https://medisync.chamodtharusha.com.lk`  
Network Mode: Public HTTPS GET (zero authentication, zero side-effects)  

| Endpoint | HTTP Status | 320px Viewport | 375px Viewport | 1440px Viewport | Localization (EN/SI/TA) | Regulatory Disclaimers | Verdict |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `/` | 200 OK | PASS | PASS | PASS | PASS (Full Parity) | Brand Disclaimers Intact | PASS |
| `/public-health` | 200 OK | PASS | PASS | PASS | PASS (Full Parity) | `clinicalValidation: not_established` Present | PASS |
| `/doctors` | 200 OK | PASS | PASS | PASS | PASS (Full Parity) | Non-Diagnostic Advisory Present | PASS |
| `/hospitals` | 200 OK | PASS | PASS | PASS | PASS (Full Parity) | Directory Notice Present | PASS |
| `/pharmacies` | 200 OK | PASS | PASS | PASS | PASS (Full Parity) | Licensed Entity Notice Present | PASS |

---

## 5. Authenticated Role Verification Matrix

| User Role | Tested Capability | Verification Method | Execution Status | Prerequisites / Blocking Reason |
|---|---|---|:---:|---|
| **Patient** | Gated Consultation PDF Export | UI & API Route | NOT RUN | Requires production deployment of `feat/final-stage-b2-to-g` by owner |
| **Patient** | Gated Lab Report PDF Export | UI & API Route | NOT RUN | Requires production deployment of `feat/final-stage-b2-to-g` by owner |
| **Doctor** | Symptom Analysis Fallback & Disclaimer | UI Form `/doctor/consultations/new` | NOT RUN | Requires production deployment of `feat/final-stage-b2-to-g` by owner |
| **Doctor** | ICD-10 Search & Diagnostic Selection | UI Dropdown `/doctor/consultations/new` | NOT RUN | Requires production deployment of `feat/final-stage-b2-to-g` by owner |
| **Pharmacy** | Consultation-Grouped Prescription Review | UI Dashboard `/pharmacy/dashboard` | NOT RUN | Requires production deployment of `feat/final-stage-b2-to-g` by owner |
| **Pharmacy** | District Health Burden Analytic View | UI Widget `/pharmacy/dashboard` | NOT RUN | Requires production deployment of `feat/final-stage-b2-to-g` by owner |
| **Admin** | Role-Filtered User Directory | UI Directory `/admin/users` | NOT RUN | Requires production deployment of `feat/final-stage-b2-to-g` by owner |
| **Admin** | Slide-Over PII Masked User Panel | UI Component `UserDetailPanel` | NOT RUN | Requires production deployment of `feat/final-stage-b2-to-g` by owner |
| **Admin** | Real-Time Service Health Check | API `/api/admin/system-health` | NOT RUN | Requires production deployment of `feat/final-stage-b2-to-g` by owner |
| **Public Health** | Stage D 2-Day Spike Outbreak Alerting | Surveillance Service Scheduler | NOT RUN | Requires production deployment of `feat/final-stage-b2-to-g` by owner |

---

## 6. Regulatory & Security Compliance Matrix

| Standard / Policy | Requirement | Implementation Evidence | Status |
|---|---|---|:---:|
| **Synthetic Provenance** | All seed data tagged with batch provenance | `syntheticSeedBatch: 'SEED_2026_11_A'` on 12,907 records | COMPLIANT |
| **Clinical Validation** | AI recommendations explicitly disclaimed | Badge `clinicalValidation: not_established` rendered | COMPLIANT |
| **PII Protection** | Export filenames omit patient NIC | Filenames formatted as `consultation_<id>.pdf` | COMPLIANT |
| **Data Protection** | AES-256-GCM authenticated field encryption | Operator key ring policy (`operatorKeyPolicy.js`) active | COMPLIANT |
| **Tenant Isolation** | Hospital staff restricted to hospital records | Hospital scoping queries in controllers & models | COMPLIANT |
| **Feature Gating** | Export features disabled until security sign-off | `PDF_EXPORT_ENABLED` gate returns 503 until true | COMPLIANT |
| **Credential Safety** | Zero hardcoded test OTP bypasses in prod | Complete removal on branch `chore/remove-test-otp` | COMPLIANT |
