# MediSync Sub-Project 4 Progress Tracker: Truth Pass + All-Disease Coverage

**Branch Strategy**: `feat/sub4-<phase-id>` per phase, stacked on previous phase branch. Base commit: `main` @ `6b328f0` (PR #27 merged).

| Phase | Description | Branch | Status | Commit(s) | Tests Passed / Failed | Offline Gate | Client Build | Protected Pins |
|---|---|---|:---:|---|:---:|:---:|:---:|:---:|
| **D0** | Truth Pass (Docs & Claims Correction) | `feat/sub4-d0` | DONE | Pending D0 Commit | 3,457 / 0 | PASS | PASS | 15/15 |
| **D1** | Coverage Audit (71,704 ICD Catalog & Profiles) | `feat/sub4-d1` | NOT STARTED | - | - | - | - | - |
| **D2** | Sourced Disease–Symptom Knowledge Base | `feat/sub4-d2` | NOT STARTED | - | - | - | - | - |
| **D3** | Matcher V2 (Tiered Sparse Retrieval, 512MB RAM) | `feat/sub4-d3` | NOT STARTED | - | - | - | - | - |
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

