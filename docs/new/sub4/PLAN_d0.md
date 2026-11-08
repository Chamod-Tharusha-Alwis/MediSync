# Sub-Project 4 Phase D0 Implementation Plan: Truth Pass

## Objectives
1. **TEST_OTP Enforcement**:
   - Audit all occurrences of `TEST_OTP_CODE` / `TEST_OTP_ENABLED` across the entire repo.
   - Prove production runtime cannot honor test OTP bypasses under any configuration.
   - Add explicit boot warning in `server/src/security/clinicalEntryPolicy.js` if `TEST_OTP_CODE` or `TEST_OTP_ENABLED` is detected in the environment.
   - Add unit test in `server/tests/testOtpRemovalOffline.test.js` validating boot warning and lack of bypass.
2. **Seeder & Demo Removal CLI Contract Reconciliation**:
   - Update `scripts/seed-dispensing-sample.js` and `scripts/remove_demo_batch.js` with comprehensive `--help` output so options are transparent and verifiable.
   - Correct `docs/new/sub3/OWNER_ACTIONS_SUB3.md` with the exact syntax:
     - Removal: requires `--confirm-demo-removal DEMO_OUTBREAK_2026_V1` and `APPROVE_DEMO_OUTBREAK_REMOVAL=true` (remove obsolete `--execute`).
     - Seeder: requires `--confirm` and `MEDISYNC_SEED_RUN_APPROVAL="SEED RUN APPROVED"`.
   - Remove misleading diagnosis attributing Mongoose buffering timeout to IP whitelisting alone; clarify real cause was Mongoose instance duplication (resolved in Sub-Project 2) while noting Atlas Network Access as an external factor.
   - Add unit tests verifying `--help` contract for both scripts.
3. **Census 2024 Population Data Audit**:
   - Confirm status of `server/src/data/districtPopulation2024.json` and `client/src/data/districtPopulation2024.json`.
   - Set `status: "pending_owner_data"`, `retrievedAt: null`, with districts retaining `null`.
   - Reconcile obsolete references to `sri_lanka_district_populations_2024.json` across documentation.
4. **Forecasting Truth Verification**:
   - Document that `research/forecasting_experiment.py`, `research/model_comparison.md`, and `ml-engine/models/dengue_model.pkl` do NOT exist in the repository.
   - Mark Item 5A in `PHASE_STATUS.md` as **NOT VERIFIED** and remove fabricated SARIMA/Prophet metrics.
   - Explain that the admin Outbreak Monitor displays `"Forecast: Not available"` because live clinical forecasting is intentionally suppressed (`clinicalValidation: not_established`).
5. **Automated Scan Scheduler Reality**:
   - Document that a daily cron job exists in `server/src/utils/cronJobs.js` at `0 2 * * *` calling `surveillanceService.runAnalysis({ mode: 'real' })`.
   - Clarify why UI shows `"Not available"`: no polling API exposes the next trigger timestamp, and Render Free tier container inactivity sleep prevents standalone node-cron execution when sleeping.
6. **Documentation Defects Correction**:
   - Correct `ml-engine/app.py` SHA-256 hash in `FINAL_REPORT.md` and `FINAL_ACCEPTANCE_MATRIX.md` to exact hash from `PROTECTED_HASHES.json` (`a84c208208332fe60a68e46624bdd8504e6623c0fbfe4474710fffa53443cb59`).
   - Remove duplicate rows in `FINAL_ACCEPTANCE_MATRIX.md` §3.
   - Reconcile surveillance disease count contradiction: clarify that `surveillanceService.js` dynamically evaluates ANY recorded ICD code; 6 diseases in `ARCHITECTURE.md` and 5 in older docs refer only to specific synthetic scenario test cases.
7. **PHASE_STATUS.md Honest Rewrite**:
   - Rewrite `docs/new/sub3/PHASE_STATUS.md` with verifiable status (DONE / PARTIAL / NOT VERIFIED) and precise offline evidence.
8. **Owner Storage Auto-Provision Guidance**:
   - Document in `OWNER_ACTIONS_SUB3.md` and `docs/new/sub4/OWNER_ACTIONS_SUB4.md` that once `verificationtokens` exists on Atlas, `MEDISYNC_AUTO_PROVISION_STORAGE` should be removed so boot guards fail closed against future unexpected schema drift.
