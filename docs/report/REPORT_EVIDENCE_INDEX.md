# MediSync Report Evidence & Verification Index

**Date:** 13 November 2026  
**Auditor:** Principal Release Engineering  
**Branch:** `main` (as of `88beef8`)  
**Purpose:** Maps every technical, clinical, security, and algorithmic claim in the MediSync capstone report directly to its underlying verification evidence (test file, benchmark script, publication figure, or commit hash).

---

## 1. Master Claims & Evidence Mapping Table

| # | Report Claim | Evidence Type | Primary File / Artifact | Verifying Command / Test | Supporting Figures / Notes |
| :- | :--- | :--- | :--- | :--- | :--- |
| **C01** | **Universal Outbreak Surveillance**<br>Surveillance engine monitors any diagnosed condition across all 71,704 ICD-10 leaf concepts and WHO ICD-11 codes. | Automated Test Suite | `server/tests/universalIcdOutbreakCoverage.test.js` | `node server/node_modules/jest/bin/jest.js server/tests/universalIcdOutbreakCoverage.test.js` | Proved on 335 sampled codes across all 21 ICD-10 chapters and ICD-11. (Commit `4573fef`). |
| **C02** | **Dual-Gate Outbreak Filtering**<br>Reduces false alarms from 6.06 to 0.92 per year while maintaining a 1.0-day median detection delay. | Simulation Benchmark & Artifact | `scripts/ml_eval/evaluate_outbreak_detector.py`<br>`docs/report/results_ml_eval.json` | `python scripts/ml_eval/evaluate_outbreak_detector.py` | `docs/report/figures/ml/fig5_gate_ablation.png`<br>`docs/report/figures/ml/fig1_confusion_matrix.png`<br>`docs/report/figures/ml/fig3_detection_delay_hist.png` |
| **C03** | **Calibrated Epidemiological Trend Projection**<br>14-day OLS linear trend achieves MAE 2.08 at 14d (vs 5.81 and 6.17 naive) and 94.9%–95.5% 95% band coverage. | Backtest Benchmark & Artifact | `scripts/ml_eval/backtest_projection.py`<br>`docs/report/results_ml_eval.json` | `python scripts/ml_eval/backtest_projection.py` | `docs/report/figures/ml/fig6_projection_backtest_errors.png`<br>`docs/report/figures/ml/fig7_prediction_band_coverage.png` |
| **C04** | **Truthful ML Engine Architecture**<br>Symptom suggestion uses TF-IDF + cosine similarity over 41 curated profiles; no fake Random Forest or SVM classifiers. | Architectural Inventory | `docs/report/ML_ENGINE_INVENTORY.md`<br>`ml-engine/app.py` | `curl.exe https://medisync-ml.onrender.com/health` | Validated memory RSS: 196 MB under peak load. |
| **C05** | **Zero Hardcoded Fake Metrics in UI**<br>All user-facing components display real dynamic metrics or approved constants; fake AI risk cards excised. | Automated Test Suite | `server/tests/hardcodedMetricAudit.test.js` | `node server/node_modules/jest/bin/jest.js server/tests/hardcodedMetricAudit.test.js` | Scans all JSX in `client/src/pages` and `client/src/components`. (Commit `e884233`). |
| **C06** | **Official DCS Population Denominators**<br>All 25 administrative districts use official DCS Census 2012 figures (Island total: 20,358,680) identical across server and client. | Reference Dataset & Test | `server/src/data/districtPopulation2024.json`<br>`client/src/data/districtPopulation2024.json` | `node server/node_modules/jest/bin/jest.js server/tests/hardcodedMetricAudit.test.js` | Source: `http://www.statistics.gov.lk/Population/StaticalInformation/CPH2011`. |
| **C07** | **Medicine Catalogue**<br>The server catalogue is 3,000 product entries, built by `ml-engine/preprocess_datasets.py` from the first 3,000 unique names in the retail listing; licence and clinical validation are not established (`server/reference-data/manifest.json`). A separate 23,939-row Indian retail-pharmacy listing (`ml-engine/data/medicines.csv`) is a local, uncommitted preprocessing input and is not used by the server. | Reference Catalog & Test | `server/reference-data/drugs_clean.json` | `node server/node_modules/jest/bin/jest.js server/tests/hardcodedMetricAudit.test.js` | Verifies 3,000 JSON entries and that no doc presents the retail CSV as the server catalogue. |
| **C08** | **Field-Level Data Encryption at Rest**<br>Patient PII and clinical notes encrypted via AES-256-CBC with per-value random IVs (no integrity tag; see C16), plus HMAC-SHA256 blind indexing for lookups. | Security Middleware & Tests | `server/src/utils/versionedEncryption.js` | `node server/node_modules/jest/bin/jest.js server/tests/masterAuthRedaction.test.js` | Zero plaintext NICs, patient names, or phone numbers in database storage. |
| **C09** | **Cryptographic Verification & Single-Encounter PDF**<br>QR verification URLs are signed capability tokens; PDF exports strictly isolate single clinical encounter. | Security Controller & Tests | `server/src/controllers/verificationController.js` | `node server/node_modules/jest/bin/jest.js server/tests/prescriptionPdfHoldResponse.test.js` | Prevents cross-encounter leakage of historical patient health records. |
| **C10** | **5-Wrong-OTP Brute-Force Lockout**<br>Entering 5 consecutive incorrect OTP passcodes permanently locks the verification session with HTTP 429. | Security Controller & Tests | `server/src/controllers/verificationController.js` | `node server/node_modules/jest/bin/jest.js server/tests/testOtpRemovalOffline.test.js` | Defense against brute-force guessing of ephemeral 6-digit consent tokens. |
| **C11** | **Direct Pharmacy Dispensing (No Inventory)**<br>Pharmacists clinically verify prescriptions and dispense directly without retail stock tracking. | Service Architecture & Tests | `server/src/services/dispensingService.js`<br>`client/src/pages/pharmacy/Dashboard.jsx` | `node server/node_modules/jest/bin/jest.js server/tests/dispenseInventoryFree.test.js` | Inventory dropdowns and stock requirements completely removed. |
| **C12** | **Atomic Anti-Duplicate Dispensing Fraud Gate**<br>Prescription status transitions atomically via a conditional `updateOne` inside a transaction; double-dispensing is rejected with `ALREADY_DISPENSED` (HTTP 400). | Service Architecture & Tests | `server/src/services/dispensingService.js` | `node server/node_modules/jest/bin/jest.js server/tests/dispensingIntegrityPhase3.test.js` | Re-dispensing attempt returns `ALREADY_DISPENSED`. |
| **C13** | **Demonstration Seed Isolation & Allowlist**<br>Synthetic seed fixtures are tagged with `isSynthetic: true` and cannot log in; demo alert emails restricted to allowlist. | Seeder Scripts & Policy | `scripts/seed_viva_outbreaks.js`<br>`server/src/services/surveillanceService.js` | `node server/node_modules/jest/bin/jest.js server/tests/outbreakApprovalDelivery.test.js` | Real users are never emailed for demonstration data; subject tagged `[DEMONSTRATION]`. |
| **C14** | **15-File Protected Release Ledger**<br>Core security and clinical computation files are pinned by SHA-256 hashes in `PROTECTED_HASHES.json`. | Cryptographic Ledger | `docs/release/PROTECTED_HASHES.json` | `node -e "const fs=require('fs'), crypto=require('crypto'), m=JSON.parse(fs.readFileSync('docs/release/PROTECTED_HASHES.json','utf8')); console.log(m.files.every(f => crypto.createHash('sha256').update(fs.readFileSync(f.path)).digest('hex') === f.releaseCandidateSha256));"` | 15/15 files byte-exact locked against unapproved modifications. |
| **C15** | **100% Trilingual UI Key Parity**<br>Complete interface internationalization across English, Sinhala, and Tamil with exact dictionary key alignment (900 leaf keys in each language). | Localization Dictionaries & Test | `client/src/i18n/translations/` | `npm --prefix client test -- src/__master_offline__/d4-any-disease-coverage.test.jsx --watchAll=false` | Zero missing translation keys ($A \triangle B = \emptyset$). The test asserts exact parity and a floor of 800, not a fixed total. |
| **C16** | **Field-Encryption Limits (documented)**<br>Field encryption is AES-256-CBC with no MAC or authentication tag; the key comes from a hex SHA-256 digest (at most 128-bit effective); decrypt failures return `""` silently. A GCM migration is planned, not implemented. | Design Document | `docs/final/FIELD_ENCRYPTION.md`<br>`server/src/utils/versionedEncryption.js` | Read `server/node_modules/mongoose-field-encryption/lib/` (`algorithm = "aes-256-cbc"`) | Limitation, not a passing claim. (Commit `eb8da44`). |
| **C17** | **PDF Encryption Is RC4-128 (documented)**<br>Exported PDFs use the Standard Security Handler via `@pdfsmaller/pdf-encrypt-lite`, which supports RC4-128 only (PDF 1.4, `/V 2 /R 3`). The user password is a low-entropy identifier, so the lock is a casual-access deterrent. Exports are off by default (`PDF_EXPORT_ENABLED`). | Code Note, Design Doc & Tests | `server/src/utils/pdfSecurity.js`<br>`docs/final/PDF_ENCRYPTION_LIMITATION.md` | `node server/node_modules/jest/bin/jest.js server/tests/pdfEncryptionHonestyTask2.test.js` | Limitation, not a passing claim. No password means no PDF (`SECURITY_HOLD`). (Commit `03b816d`). |

---

## 2. Commit Provenance Chain (`main`)

Every commit on `main` after `ae13248` (Merge PR #43), from `git log --oneline --reverse ae13248..origin/main`:

1. `44e7f0c` - `feat(outbreak): cleanup outbreak monitor, add scan telemetry and filtered growth table (Part 1)`
2. `679a493` - `feat(outbreak-email): implement trilingual outbreak approval emails and demo allowlist (Part 2)`
3. `4573fef` - `test(surveillance): prove universal icd outbreak detection coverage across 300+ sampled codes (Part 3)`
4. `973fcfa` - `feat(seed): implement relative-date outbreak seeder and refresh script (Part 4)`
5. `ead70e5` - `fix(public-health): resolve projection zero-drop and align public summary cards (Part 5)`
6. `6401708` - `feat(ml-eval): verify ml and statistical engines with simulation benchmarks and figures (Part 6)`
7. `e884233` - `refactor(audit): eliminate hardcoded UI metrics and document data provenance (Part 7)`
8. `275c9a0` - `docs(viva): deliver comprehensive demo script, viva qa, and evidence index (Part 8)`
9. `b9d01ac` - `chore(ci): align test assertions and manifest ordering for 100% green offline suite (Part 9)`
10. `09ff499` - `fix(outbreak): tag synthetic scan alerts and fail closed on real broadcast (Task 1)`
11. `03b816d` - `fix(pdf): remove fixed PDF password fallback and document RC4-128 honestly (Task 2)`
12. `37e8228` - `refactor(pharmacy): remove remaining inventory, stock and restock features (Task 3)`
13. `746f6ad` - `docs(final): reconcile FINAL_STATUS and LIVE_SITE_CHECK_PROMPT with the code (Task 4)`
14. `1ff7234` - `fix(ci): stop the offline suite rewriting docs/final coverage files (Task 5)`
15. `d384dcc` - `chore(hygiene): retire OTP live runners, untrack docs/temp, scrub owner emails, fix lint (Task 6)`
16. `eb8da44` - `docs(security): document AES-256-CBC field encryption limits and a GCM migration plan (Task 7)`
17. `88beef8` - `Merge pull request #44 from Chamod-Tharusha-Alwis/release/final-master-nov13`
