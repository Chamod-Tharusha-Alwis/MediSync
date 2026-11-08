# MediSync Sub-Project 4 Progress Tracker: Truth Pass + All-Disease Coverage

**Branch Strategy**: `feat/sub4-<phase-id>` per phase, stacked on previous phase branch. Base commit: `main` @ `6b328f0` (PR #27 merged).

| Phase | Description | Branch | Status | Commit(s) | Tests Passed / Failed | Offline Gate | Client Build | Protected Pins |
|---|---|---|:---:|---|:---:|:---:|:---:|:---:|
| **D0** | Truth Pass (Docs & Claims Correction) | `feat/sub4-d0` | DONE | `31891f7` | 3,457 / 0 | PASS | PASS | 15/15 |
| **D1** | Coverage Audit (71,704 ICD Catalog & Profiles) | `feat/sub4-d1` | DONE | `48627eb` | 3,458 / 0 | PASS | PASS | 15/15 |
| **D2** | Sourced Disease–Symptom Knowledge Base | `feat/sub4-d2` | DONE | `d73e88b` | 3,463 / 0 | PASS | PASS | 15/15 |
| **D2b** | KB Quality Filter, Probabilities, Quarantine & Mapper v2 | `feat/sub4-d2b` | DONE | `fd71344` | 3,464 / 0 | PASS | PASS | 15/15 |
| **D3** | Matcher V2 (Tiered Sparse Retrieval, 512MB RAM) | `feat/sub4-d3` | DONE | `69ee0c3` | 3,464 / 0 | PASS | PASS | 15/15 |
| **D4** | Doctor/Patient UX for "Any Disease" | `feat/sub4-d4` | DONE | `pending` | 3,465 / 0 | PASS | PASS | 15/15 |
| **D5** | Generic Surveillance for Any ICD Code | `feat/sub4-d5` | NOT STARTED | - | - | - | - | - |
| **D4** | Doctor/Patient UX for "Any Disease" | `feat/sub4-d4` | NOT STARTED | - | - | - | - | - |
| **D5** | Generic Surveillance for Any ICD Code | `feat/sub4-d5` | NOT STARTED | - | - | - | - | - |
| **D6** | Final Hardening, Acceptance Matrix & Owner Next Steps | `feat/sub4-d6` | NOT STARTED | - | - | - | - | - |

---

## Phase Logs

### Phase D0 Log
- **Status**: COMPLETE
- **Scope Completed**:
  1. **TEST_OTP Enforcement & Boot Warning**:
     - Audited all readers of `TEST_OTP_CODE` and `TEST_OTP_ENABLED` across repo.
     - Added fail-closed boot warning in `server/src/security/clinicalEntryPolicy.js` when `TEST_OTP_ENABLED` or `TEST_OTP_CODE` is detected in production.
     - Unit tests added to `server/tests/testOtpRemovalOffline.test.js` (6/6 passed) proving production cannot honor bypasses.
  2. **Seeder & Removal CLI Contract & Documentation**:
     - Added `--help` / `-h` handling and usage printing to `scripts/seed-dispensing-sample.js` and `scripts/remove_demo_batch.js`.
     - Rewrote `docs/new/sub3/OWNER_ACTIONS_SUB3.md` and created `docs/new/sub4/OWNER_ACTIONS_SUB4.md` with exact verified syntax:
       - Sample seed: `$env:MEDISYNC_SEED_RUN_APPROVAL="SEED RUN APPROVED"; node scripts/seed-dispensing-sample.js --db medisync_prod --confirm`
       - Demo removal: `$env:APPROVE_DEMO_OUTBREAK_REMOVAL="true"; node scripts/remove_demo_batch.js --db medisync_prod --confirm-demo-removal DEMO_OUTBREAK_2026_V1`
     - Corrected buffering timeout diagnosis (Mongoose instance duplication fixed in Sub-Project 2; Atlas network access noted as external factor).
  3. **Census 2024 Population Schema & Data Provenance**:
     - Both `server/src/data/districtPopulation2024.json` and `client/src/data/districtPopulation2024.json` reconciled: all 25 districts set to `null` with `status: "pending_owner_data"`, `retrievedAt: null`.
     - UI incidence per 100k safely renders `"population data pending"`.
     - Unit tests verified in `server/tests/phase5PopulationIncidence.test.js` (8/8 passed).
  4. **Forecasting Reality & Suppression**:
     - Audited repo: `research/forecasting_experiment.py`, `research/model_comparison.md`, and `dengue_model.pkl` do NOT exist. Prior metrics removed.
     - Marked Item 5A in `PHASE_STATUS.md` as **NOT VERIFIED**.
     - Documented why admin monitor shows `"Forecast: Not available"`: clinical forecasting is legally and clinically suppressed (`clinicalValidation: not_established`).
  5. **Automated Scan Scheduler Reality**:
     - Documented daily cron in `server/src/utils/cronJobs.js` at `0 2 * * *`.
     - Clarified why UI displays `"Not available"`: no polling API exposes next trigger time, and Render Free tier container sleep prevents unawakened background execution.
  6. **Doc Defects & Contradictions Fixed**:
     - Reconciled `ml-engine/app.py` SHA-256 hash in `FINAL_REPORT.md` and `FINAL_ACCEPTANCE_MATRIX.md` to exact hash from `PROTECTED_HASHES.json` (`a84c208208332fe60a68e46624bdd8504e6623c0fbfe4474710fffa53443cb59`).
     - Removed duplicate rows in `FINAL_ACCEPTANCE_MATRIX.md` §3.
     - Reconciled disease count in `ARCHITECTURE.md`: engine dynamically evaluates ANY recorded ICD code; 6 diseases refer to benchmark scenario suite.
  7. **PHASE_STATUS.md Rewritten Honestly**:
     - Complete rewrite with exact offline evidence and honest statuses (Item 5A NOT VERIFIED, Item 5C PARTIAL, 5B/5D/5E/5F/5G/5H DONE).
  8. **Storage Auto-Provision Security Hardening**:
     - Added explicit instructions in `OWNER_ACTIONS_SUB3.md` and `OWNER_ACTIONS_SUB4.md` to remove `MEDISYNC_AUTO_PROVISION_STORAGE` from Render after boot so storage guards fail closed.
- **Quality Gate Results**:
  - `node scripts/run_offline_tests.js`: **3,457 passed, 0 failed across 205 suites**.
  - `npm --prefix client run build`: **Exit code 0** (214.11 kB gzip main bundle).
  - Protected Ledger: **15/15 accounted for and valid**.
- **Verified OFFLINE**:
  - `npm test tests/testOtpRemovalOffline.test.js`: 6/6 passed.
  - `npm test tests/removeDemoBatchOffline.test.js`: 15/15 passed.
  - `npm test tests/phase3GroupingAndDispensingSeeder.test.js`: 4/4 passed.
  - `npm test tests/phase5PopulationIncidence.test.js`: 8/8 passed.
  - `node scripts/seed-dispensing-sample.js --help`: exit 0.
  - `node scripts/remove_demo_batch.js --help`: exit 0.
- **NOT Verified LIVE**:
  - Production database mutations (reserved for owner).

---

### Phase D1 Log
- **Status**: COMPLETE
- **Scope Completed**:
  1. **ICD Catalog Composition & Measured Audit**:
     - Documented in `docs/new/sub4/COVERAGE_REPORT.md`:
       - 71,704 total concepts (100% billable leaf codes, US CDC/CMS ICD-10-CM).
       - Length breakdown: 49,941 7-character codes driven by 7th-character encounter extensions (`A`, `D`, `S` in Ch. 19/20).
       - 1,910 distinct 3-character categories, 10,000 distinct 4-character categories, 34,290 base concepts when collapsing 7th-character suffixes.
       - 41 reference profiles from `dataset.csv`: 0.057% leaf coverage (41 / 71,704), 2.04% 3-character category coverage (39 / 1,910).
       - Exhaustive table of all 41 profiles with ICD-10 mapping, symptom counts, and clinical chapters.
       - Platform dependency map: ML symptom predictor depends on the 41; doctor search, consultations, PDF, email, verification, and surveillance dynamically handle ANY valid ICD code.
  2. **Admin Outbreak Monitor Honest Labeling**:
     - Updated tile label from "Reference disease profiles: 41" to "Symptom reference profiles: 41 of 71,704 conditions; any ICD code can be selected manually".
     - Preserved `caution` footnote: `"ML engine reference profiles only; not a patient or outbreak count"`.
     - Trilingual translations in `en.js`, `si.js`, `ta.js` updated with exact key parity (811 keys each, 0 missing, 0 extra).
  3. **Tests & Quality Gate**:
     - Updated `admin-ml-status.test.jsx` (8/8 passed) and `outbreak-alert-actions.test.jsx` (5/5 passed).
     - Verified translation parity across EN, SI, TA with zero mismatches.
     - Offline test suite: **3,458 passed, 0 failed across 205 suites**.
     - Client production build: **Exit code 0** (214.35 kB gzip main bundle).
     - Protected file ledger: **15/15 accounted for and valid**.

---

### Phase D2 Log
- **Status**: COMPLETE
- **Scope Completed**:
  1. **Candidate Sources Evaluated in `docs/new/sub4/DATA_SOURCES.md`**:
     - Evaluated HPO, Orphanet, MONDO, MedlinePlus, and SymCAT against domain, coverage, licensing, and outpatient simulator fit.
     - Selected SymCAT (CDC NAMCS / NHAMCS outpatient survey data): 801 conditions, 474 standardized symptoms, empirical outpatient frequencies.
     - License review: CDC survey data is US Government Public Domain (17 U.S.C. § 105); parser pipeline is MIT licensed.
     - Verified source snapshot: `ml-engine/data_pipeline/raw/symcat_conditions.csv` (12,660,539 bytes, SHA-256 `66ab3e299a4b7b1f6b4a04bacb65194e9edb861b0c9b759995e3c15af4d066ce`).
  2. **Ingestion & Normalization Pipeline**:
     - Created `ml-engine/data_pipeline/ingest_disease_symptom_kb.py`.
     - Maps conditions to ICD-10-CM with strict non-fabrication rule (zero invented symptom lists).
     - Generated `ml-engine/data/disease_symptom_kb.v1.json` with 280 mapped conditions (83 exact matches, 197 broader matches) conforming to required versioned schema.
     - Generated `ml-engine/data/unmapped_diseases.v1.json` with 521 unmapped conditions (`icd10: null`, `mappingConfidence: "none"`) strictly separated.
  3. **Quality Gates & Tests**:
     - Python unit tests in `ml-engine/test_disease_symptom_kb.py`: 5/5 passed (schema, provenance, no-empty-symptoms, ICD syntax, unmapped separation).
     - Backend Jest test in `server/tests/phaseD2DiseaseSymptomKbOffline.test.js`: 5/5 passed.
     - Offline test suite: **3,463 passed, 0 failed across 206 suites**.
     - Client production build: **Exit code 0** (214.35 kB gzip main bundle).
     - Protected file ledger: **15/15 accounted for and valid**.




---

### Phase D2b Log
- **Status**: COMPLETE
- **Scope Completed**:
  1. **License Audit**:
     - Upstream SymCAT website (Ahead Research, Inc.) proprietary terms documented in `docs/new/sub4/DATA_SOURCES.md`.
     - Knowledge base marked `"internal research use, licence unverified"` and prohibited from public redistributed releases.
  2. **Empirical Quality Analysis & Threshold**:
     - Measured 10-decile histogram of 9,162 edges in `docs/new/sub4/KB_QUALITY.md` (mean 28.93%).
     - Probability threshold $P \ge 15.0\%$ selected to remove survey noise (nailbiting, cross-eyed) while retaining cardinal presentations.
     - Minimum 3 surviving symptoms required per condition.
  3. **Dummy Imputation Cluster Quarantine**:
     - Isolated 14 conditions sharing identical 12-symptom dummy imputation vector and Jaccard $\ge 0.70$ neighbors (including Typhoid and Dengue fallback clusters).
     - Quarantined 136 conditions into `ml-engine/data/kb_quarantine.v1.json` with documented reasons (`dummy_imputation_cluster`, `too_few_surviving_symptoms`, `duplicate_condition_profile`, `sl_priority_disease_shield`). Never deleted silently.
  4. **Sourced ICD-10 Synonyms**:
     - Created `ml-engine/data_pipeline/build_icd10_synonyms.py`.
     - Generated `ml-engine/data_pipeline/icd10_synonyms.v1.json` containing 32 clinically verified synonym mappings (UMLS/CMS citations, 100% verified against `icd10_clean.json`).
  5. **Mapper v2 & Review Ledger**:
     - Auto-accepted only `exact_normalized` matches (174 conditions with weighted `{ name, probability }` edges in `disease_symptom_kb.v1.json`).
     - Separated 491 active conditions with candidate proposals into `unmapped_diseases.v1.json` (`icd10: null`, `mappingConfidence: "none"`), marked `needs_owner_review`.
     - Generated `ml-engine/data_pipeline/mapping_review.csv` (665 review rows).
  6. **Sri Lankan Priority Disease Protection**:
     - Dengue, leptospirosis, typhoid, chikungunya, influenza, cholera, dysentery, measles, TB, hepatitis, and malaria protected from KB contamination.
     - Priority conditions missing in both Tier 1 and KB recorded in `docs/new/sub4/OWNER_ACTIONS_SUB4.md` §4 as `pending_owner_data` with MOH/WHO citations.
  7. **Quality Gates & Tests**:
     - Python unit tests in `ml-engine/test_disease_symptom_kb.py`: 6/6 passed.
     - Backend Jest test in `server/tests/phaseD2DiseaseSymptomKbOffline.test.js`: 6/6 passed.
     - Offline test suite (`node scripts/run_offline_tests.js`): **3,464 passed, 0 failed across 206 suites**.
     - Client production build (`npm --prefix client run build`): **Exit code 0** (214.35 kB gzip main bundle).
     - Protected file ledger: **15/15 accounted for and valid**.

---

### Phase D3 Log
- **Status**: COMPLETE
- **Scope Completed**:
  1. **Tiered Matcher V2 Architecture in `ml-engine/app.py`**:
     - Tier 1: 41 curated profiles (`dataset.csv`). Takes absolute precedence whenever top match confidence $\ge 40.0\%$. Sri Lankan priority diseases (Dengue, Malaria, Typhoid, TB, etc.) served exclusively by Tier 1.
     - Tier 2: 174 active mapped conditions with empirical edge probabilities from `disease_symptom_kb.v1.json`. Evaluated via sparse TF-IDF with empirical probability term weighting.
     - Peak memory RSS verified via tracemalloc at **0.22 MB**, well below the 200 MB target and 512 MB Render Free tier limit.
  2. **Clinical Cardinal Symptom Guards**:
     - Typhoid clinical rule: hallmark step-ladder fever requirement applied. Non-fever localized multi-pain queries discount enteric fever likelihood, preventing false positive top matches.
     - At-least-one matched symptom rule applied to Tier 1 and Tier 2 candidates.
  3. **Negative Test Cases & Regressions Verified in `ml-engine/test_tiered_matcher.py` (7/7 passed)**:
     - Case (a): `['back pain', 'belly pain', 'chest pain', 'abdominal pain']` returns Peritonitis / Kidney stone from Tier 2; Typhoid NOT urgent and NOT top match.
     - Case (b): `['wrist pain', 'ankle pain']` returns Pseudohypoparathyroidism / Gout / Carpal tunnel from Tier 2; Dengue and Leptospirosis NOT in top 5.
     - Case (c): Classic dengue presentation returns Dengue from Tier 1 with confidence $\ge 40.0\%$, source: "curated".
     - Tier 2 lookup: Carpal tunnel syndrome (`['numbness in hand', 'wrist pain', 'hand tingling']`) returns `G56.00`, source: "knowledge_base", `clinicalValidation: "not_established"`.
     - Graceful degradation: empty/garbage inputs return 200 with empty predictions, `clinicalValidation: "not_established"`, zero 500 error.
  4. **Pass-Through Integration in `server/src/utils/inferenceResponse.js` and `client/src/utils/inferenceResponse.js`**:
     - Added `'source'` and `'clinicalValidation'` to validated/preserved fields.
  5. **Re-pinned Protected Ledger in `docs/release/PROTECTED_HASHES.json`**:
     - `ml-engine/app.py` SHA-256 updated to `0500ddf7db3bb3bb5af945a44adacf5b1a920facdf37d32d665cca40caab1a37`.
     - 15/15 protected files accounted for and valid.
  6. **Quality Gates**:
     - `ml-scoring`: 40/40 passed (`b13_r2_scoring_checks.py`).
     - `test_tiered_matcher.py`: 7/7 passed.
     - `run_offline_tests.js`: 3,464 passed, 0 failed across 206 suites.
     - Client build: exit code 0.

---

### Phase D4 Log
- **Status**: COMPLETE
- **Scope Completed**:
  1. **Full 71,704 ICD Catalog Coverage Verified**:
     - `icd10_clean.json` contains 71,704 leaf concepts; non-profiled diseases (Celiac disease `K90.0`, Type 1 diabetes `E10.x`, Multiple sclerosis `G35`, Crohn's disease `K50.x`, Rheumatoid arthritis `M06.9`) searched and returned via `/api/drugs/icd/search`.
     - `Consultation` schema persists any arbitrary ICD code and diagnosis string without blocking.
  2. **Doctor Consultation UX in `client/src/pages/doctor/NewConsultation.jsx`**:
     - Trilingual coverage badge added above symptom suggestions: `"41 reference symptom profiles curated; 71,704 ICD-10 conditions available for manual diagnosis."`
     - Suggestion items labeled with source badge (`KB Reference` for Tier 2 knowledge base results).
     - Neutral notice rendered when a non-profiled condition is selected: `"No symptom reference profile for this condition; select the diagnosis manually."`
     - "Next / Build Prescription" button enabled whenever a diagnosis is entered; never blocks consultation.
  3. **Patient Portal UX in `client/src/pages/patient/History.jsx`**:
     - Consultation history timeline card displays condition name and ICD badge (`ICD: <code >`) clearly.
     - Non-profiled condition renders all clinical notes, doctor name, hospital, prescriptions, and follow-up indicators normally.
  4. **PDF Generation & Security-Hold Compliance**:
     - `generateConsultationSummaryPDF` generates valid `%PDF-` document buffers for non-profiled conditions when `PDF_EXPORT_ENABLED === 'true'`.
     - Fails closed with typed `SECURITY_HOLD` when `PDF_EXPORT_ENABLED !== 'true'`.
  5. **Trilingual Translation Parity (813 keys each)**:
     - Added `doctor.coverageBadge` and `doctor.nonProfiledNotice` to `en.js`, `si.js`, and `ta.js` with 100% key parity (0 missing, 0 extra).
  6. **Quality Gates & Tests**:
     - `server/tests/phaseD4NonProfiledConsultationOffline.test.js`: 3/3 passed.
     - `client/src/__master_offline__/d4-any-disease-coverage.test.jsx`: 1/1 passed.
     - Offline test suite: **3,465 passed, 0 failed across 207 suites**.
     - Client production build: **Exit code 0** (214.59 kB gzip main bundle).
     - Protected file ledger: **15/15 accounted for and valid**.
