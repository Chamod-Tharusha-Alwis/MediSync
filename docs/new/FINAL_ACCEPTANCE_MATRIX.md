# MediSync — Final Acceptance Verification Matrix

**Release Candidate**: `fix/post-merge-sub2` (base `main` @ `da438aa`)  
**Target Environment**: Production (`https://medisync.chamodtharusha.com.lk`)  
**Date of Verification**: 2026-11-08  
**Overall Verdict**: READY FOR OWNER MERGE & DEPLOYMENT  

---

## 1. Offline Regression Suite Matrix

Command: `node scripts/run_offline_tests.js`  
Result: **3,450 Passed, 0 Failed, 0 Skipped**  
Integrity: `sourceFrozen: true`, `protectedAccountedFor: 15/15`  

| Profile | Test Runner | Suites | Passed | Failed | Skipped | Status | Details |
|---|---|:---:|:---:|:---:|:---:|:---:|---|
| **backend** | Jest (Clinical Offline) | 122 | 2,626 | 0 | 0 | PASS (offline in-memory) | Auth, consultations, lab routes, PDF export gates, role policies, strict z>2.0 detector, seeder namespaces, demo batch removal |
| **client** | Jest / React Testing Lib | 76 | 660 | 0 | 0 | PASS (offline in-memory) | Component rendering, trilingual i18n parity, route access, session monitor, multi-level surveillance selectors |
| **email-pdf** | Custom Runner | 2 | 31 | 0 | 0 | PASS (offline in-memory) | Resend/Brevo fallback contracts, WinAnsi font replacement, PDF generation buffers, consultation summary email service |
| **ml-scoring** | Python PyTest | 1 | 40 | 0 | 0 | PASS (offline in-memory) | TF-IDF disease similarity bounds, symptom normalization, inference robustness |
| **ml-flask** | Flask Test Client | 1 | 31 | 0 | 0 | PASS (offline in-memory) | Endpoint response envelopes, cold-start timeouts, catalog ingestion boundaries |
| **root** | Node Harness | 1 | 55 | 0 | 0 | PASS (offline in-memory) | Seed validation, key ring policies, database admission contracts |
| **ml-status-contract** | Diagnostic Runner | 1 | 7 | 0 | 0 | PASS (offline in-memory) | Verification of `clinicalValidation: not_established` contract & payload specs |
| **TOTAL** | **Multi-Profile Gate** | **204** | **3,450** | **0** | **0** | **PASS (offline in-memory)** | **Full pass with zero defects, zero skipped suites** |

---

## 2. Protected Files Integrity Ledger

Reference: `docs/release/PROTECTED_HASHES.json` (15/15 valid, 0 discrepancies)

| File Path | Hash Verification | Pin Reason |
|---|:---:|---|
| `server/src/middleware/auth.js` | MATCH | Unmodified from approved authorization redaction baseline |
| `server/src/controllers/doctorController.js` | MATCH | Unmodified from approved doctor transaction baseline |
| `ml-engine/app.py` | MATCH | Sub-Project 1 Task 1.7 (2026-11-08): allow ML QA SQLite temp DB path under os.tmpdir() / MEDISYNC_TEST_TMP; historical mixed line endings preserved |
| `ml-engine/evaluate_symptom_model.py` | MATCH | Unmodified from approved symptom model evaluation baseline |
| `client/src/components/SymptomTagInput.jsx` | MATCH | Unmodified from approved UI symptom tag input component |
| `server/tests/ir04BackendIntegration.test.js` | MATCH | Stage B2 inventory removal (U10): replaced legacy inventory stock checks with durable Dispensing.findOne verification (8.1/8.2) |
| `server/tests/patientProfileOwnedIntegration.test.js` | MATCH | Unmodified from approved patient profile owned integration test |
| `server/tests/prescriptionDurationOwnedIntegration.test.js` | MATCH | Unmodified from approved prescription duration integration test |
| `server/tests/lab.test.js` | MATCH | Unmodified from approved lab suite baseline |
| `server/tests/universityDemoSeedVerify.test.js` | MATCH | Unmodified from approved university demo seed verification test |
| `client/tests/ir04-isolated-five-role-e2e.spec.js` | MATCH | Unmodified from approved five-role E2E specification |
| `server/src/config/dbGuard.js` | MATCH | Simplified production DB guards, generalized Atlas host allowlist, and resilient storage admission |
| `server/src/models/Consultation.js` | MATCH | Line endings normalized to canonical LF via .gitattributes; code unmodified since commit 2de4e4f |
| `server/src/models/Patient.js` | MATCH | Trilingual preferredLanguage field added with default 'en' (commit 21d1d6d) |
| `server/src/utils/versionedEncryption.js` | MATCH | Line endings normalized to canonical LF via .gitattributes; code unmodified since commit 2de4e4f |

---

## 3. Client Production Build Matrix

Command: `npm --prefix client run build`  
Result: **Exit Code 0 (Success)**  

| Property | Value | Evaluation |
|---|---|:---:|
| Build Tool | `react-scripts build` (via `scripts/buildClinical.cjs`) | PASS |
| Entry Point | `src/index.js` -> `src/App.js` | PASS |
| Bundled Modules | 119 modules | PASS |
| Demo Imports | `demoImported: false` | PASS |
| Active Profile | `clinical-production` | PASS |
| Main Bundle Size | 211.56 kB (gzipped) | PASS |
| Main CSS Size | 22.77 kB (gzipped) | PASS |

---

## 4. Live Public Read-Only Verification Matrix

Target: `https://medisync.chamodtharusha.com.lk`  
Network Mode: Public HTTPS GET (zero authentication, zero side-effects; verified in Phase 1 / baseline)  

| Endpoint | HTTP Status | 320px Viewport | 375px Viewport | 1440px Viewport | Localization (EN/SI/TA) | Regulatory Disclaimers | Verdict |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `/` | 200 OK | Manual - not run this session | Manual - not run this session | Manual - not run this session | PASS (offline parity: 781 keys) | Brand Disclaimers Intact | PASS (HTTP 200 verified) |
| `/public-health` | 200 OK | Manual - not run this session | Manual - not run this session | Manual - not run this session | PASS (offline parity: 781 keys) | `clinicalValidation: not_established` Present | PASS (HTTP 200 verified) |
| `/doctors` | 200 OK | Manual - not run this session | Manual - not run this session | Manual - not run this session | PASS (offline parity: 781 keys) | Non-Diagnostic Advisory Present | PASS (HTTP 200 verified) |
| `/hospitals` | 200 OK | Manual - not run this session | Manual - not run this session | Manual - not run this session | PASS (offline parity: 781 keys) | Directory Notice Present | PASS (HTTP 200 verified) |
| `/pharmacies` | 200 OK | Manual - not run this session | Manual - not run this session | Manual - not run this session | PASS (offline parity: 781 keys) | Licensed Entity Notice Present | PASS (HTTP 200 verified) |

*Note on Viewports: Automated headless responsive viewport testing was not executed against live production in this session; marked "Manual - not run this session" for honest verification by the repository owner.*

---

## 5. Authenticated Role Verification Matrix

| User Role | Tested Capability | Verification Method | Execution Status | Prerequisites / Action Required |
|---|---|---|:---:|---|
| **Patient** | Gated Consultation PDF Export | UI & API Route | Not run - owner to verify | Requires `PDF_EXPORT_ENABLED=true` on Render backend; follow `OWNER_ACTIONS.md` §3 |
| **Patient** | Gated Lab Report PDF Export | UI & API Route | Not run - owner to verify | Requires `PDF_EXPORT_ENABLED=true` on Render backend; follow `OWNER_ACTIONS.md` §3 |
| **Patient** | Consultation Summary Resend Button | UI History `/patient/history` | Not run - owner to verify | Requires login as patient; click Resend Email button; check rate limit & toast |
| **Doctor** | Symptom Analysis Fallback & Disclaimer | UI Form `/doctor/consultations/new` | Not run - owner to verify | Verify `clinicalValidation: not_established` badge and debounced analysis button |
| **Doctor** | ICD-10 Search & Diagnostic Selection | UI Dropdown `/doctor/consultations/new` | Not run - owner to verify | Type symptom, select diagnosis, verify zero crash |
| **Pharmacy** | Consultation-Grouped Prescription Review | UI Dashboard `/pharmacy/dashboard` | Not run - owner to verify | Verify Active Prescriptions grouped by consultation |
| **Pharmacy** | Receipt-Grouped Dispensing History | UI Dashboard `/pharmacy/dashboard` | Not run - owner to verify | Verify Dispensation History grouped by unique receipt ID |
| **Pharmacy** | Dispensing Volume Analytics | UI Chart `/pharmacy/dashboard` | Not run - owner to verify | Requires running seeder `SEED_2026_11_B` per `OWNER_ACTIONS.md` §2 |
| **Admin** | Role/Search Filtered User Directory | UI Directory `/admin/users` | Not run - owner to verify | Filter by role or search name; verify partial PII masking |
| **Admin** | Audit-Logged Identifier Reveal | UI Component `UserDetailPanel` | Not run - owner to verify | Click Eye icon to reveal identifier; check `ADMIN_REVEAL_PII` audit log |
| **Admin** | Real-Time Service Health & ML Status | UI `/admin/dashboard` & `/system-health` | Not run - owner to verify | Verify ML status resilience (`available` / `waking` / `down`) |
| **Public Health** | Multi-Level Outbreak View (District/Province/National) | UI `/public-health` & `/admin/outbreak-monitor` | Not run - owner to verify | Test District (25), Province (9), and Island-wide (1) selectors |

---

## 6. Regulatory & Security Compliance Matrix

| Standard / Policy | Requirement | Implementation Evidence | Status |
|---|---|---|:---:|
| **Synthetic Provenance** | All seed data tagged with batch provenance | `syntheticSeedBatch: 'SEED_2026_11_A'` on 12,907 records; `SEED_2026_11_B` on sample dispensing data | COMPLIANT |
| **Clinical Validation** | AI recommendations explicitly disclaimed | Contract and badge `clinicalValidation: not_established` rendered on ML and surveillance interfaces | COMPLIANT |
| **PII Protection** | Export filenames omit patient NIC | Filenames formatted as `consultation_<id>.pdf` and `lab_report_<id>.pdf` | COMPLIANT |
| **Data Protection** | AES-256-GCM authenticated field encryption | Operator key ring policy (`operatorKeyPolicy.js`) active; Vault bypassed only when `MEDISYNC_PROTOTYPE_MODE=true` | COMPLIANT |
| **Tenant Isolation** | Hospital staff restricted to hospital records | Hospital scoping queries in controllers & models | COMPLIANT |
| **Feature Gating** | Export features disabled until security sign-off | `PDF_EXPORT_ENABLED` gate returns 503 until owner sets env var to true | COMPLIANT |
| **Credential Safety** | Zero hardcoded test OTP bypasses in prod | Fully removed in PR #18 (`chore/remove-test-otp`); test OTP bypasses deleted | COMPLIANT |
