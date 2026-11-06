# MediSync Stage B1 Batch 6 Execution Report

**Date:** 2026-11-06  
**Operator:** Chamod  
**Branch:** `stage-b1/fixes`  
**Starting HEAD:** `eb761770ce8e108be738fe569f1bef3d49aa8e9b`  
**Protected Hashes:** 15/15 verified matching `docs/release/PROTECTED_HASHES.json` at start and end.

---

## 1. Summary of Actions & Deliverables

| Item | Scope | Status | Files Modified / Added | Commit Message | Tests Added | Gate Evidence |
|:---|:---|:---|:---|:---|:---|:---|
| **Item 1: S1 Test** | Mock lockout policy in S1 test harness & register in gate | **COMPLETED** | `server/tests/jwt-patient-nic-removal-s1.test.js`, `server/clinical.offline.jest.cjs` | `fix(test): mock lockout policy in S1 token test and include it in the gate` | `jwt-patient-nic-removal-s1.test.js` (6/6 PASS) | Backend elevated to 2,529 PASS (114 suites), receipt `scratch/clinical-offline-RgzxI1` |
| **Item 2: S6 Limiter** | Rate-limit public lab status lookup route | **COMPLETED** | `server/src/routes/labRoutes.js`, `server/tests/publicLabStatusRateLimitS6.test.js`, `server/clinical.offline.jest.cjs` | `fix(security): rate-limit public lab status lookup (S6)` | `publicLabStatusRateLimitS6.test.js` (1/1 PASS) | Backend elevated to 2,530 PASS (115 suites), receipt `scratch/clinical-offline-qC4x2s` |
| **Item 3: S3 Limiter Skip** | Invert auth limiter skip from non-production to test only | **COMPLETED** | `server/src/app.js`, `server/tests/authLimiterSkipS3.test.js`, `server/clinical.offline.jest.cjs` | `fix(security): enable auth rate limiter outside test environment (S3)` | `authLimiterSkipS3.test.js` (2/2 PASS) | Backend elevated to 2,532 PASS (116 suites), receipt `scratch/clinical-offline-MxVB0X` |

---

## 2. Gate Counts Progression vs BASELINE

| Environment / Suite | Baseline (`eb76177`) | After Item 1 (S1) | After Item 2 (S6) | After Item 3 (S3 / Final) | Net Change |
|:---|:---|:---|:---|:---|:---|
| **Backend Suites** | 113 | 114 | 115 | **116** | **+3 suites** |
| **Backend Tests Passed** | 2,523 | 2,529 | 2,530 | **2,532** | **+9 tests** |
| **Backend Tests Failed** | 0 | 0 | 0 | **0** | **0** |
| **Client Suites** | 72 | 72 | 72 | **72** | 0 |
| **Client Tests Passed** | 641 | 641 | 641 | **641** | 0 |
| **Email-PDF Tests Passed** | 31 (2 suites) | 31 (2 suites) | 31 (2 suites) | **31 (2 suites)** | 0 |
| **Root Tests Passed / Failed** | 38 / 2 | 38 / 2 | 38 / 2 | **38 / 2** | 0 (loopback restriction) |
| **ML Profiles (3)** | BLOCKED | BLOCKED | BLOCKED | **BLOCKED** | 0 (Python 3.14 access denied) |
| **Total Runnable Passed** | 3,195 | 3,201 | 3,202 | **3,204** | **+9 tests** |
| **Receipt Directory** | `scratch/clinical-offline-aQEFfE` | `scratch/clinical-offline-RgzxI1` | `scratch/clinical-offline-qC4x2s` | `scratch/clinical-offline-MxVB0X` | Verified |

*Notice: GATE INCOMPLETE in this environment: ml-scoring, ml-flask, root, ml-status-contract.*

---

## 3. Decisions Taken

1. **Item 1: S1 Test Decision (Case a):**
   - Ran `server/tests/jwt-patient-nic-removal-s1.test.js` alone.
   - Identified exactly 2 failures: patient login (line 211) and doctor login (line 361) returned HTTP 500 instead of 200.
   - Cause: `authController.js:3` requires `../security/passwordAttemptPolicy` (added by lockout patch `e123b82`). The test's `createController` mock `require` lacked `../security/passwordAttemptPolicy`, causing `passwordAttempts.canAttempt` to throw a `TypeError`.
   - Verified that zero failures showed a token containing a NIC-shaped value or missing id claim.
   - Safest resolution: Added standard lockout policy mock in `jwt-patient-nic-removal-s1.test.js:51-56` (`require('../src/security/passwordAttemptPolicy').createPasswordAttemptPolicy({ getAttempts: async () => 0, incrementAttempts: async () => 1 })`) matching `masterLoginAdmission.test.js` and `agentBClinicalHandlers.test.js`. Kept all assertions 100% unchanged. Included path in `server/clinical.offline.jest.cjs`.
2. **Item 2: S6 Rate Limiter Pattern:**
   - Kept existing controller implementation and response in `server/src/controllers/labController.js:1322` completely unchanged (`HTTP 403 Forbidden`).
   - Attached `publicLimiter` (`windowMs: 60 * 1000, max: 60`) to `router.get('/public/:labTestId/status', publicLimiter, publicStatusCheck)` in `server/src/routes/labRoutes.js:61` matching `server/src/routes/publicRoutes.js`.
   - Added unit test `server/tests/publicLabStatusRateLimitS6.test.js` (1/1 PASS) verifying middleware presence and options. Included in `server/clinical.offline.jest.cjs`.
3. **Item 3: S3 Auth Limiter Skip Inversion:**
   - Grepped entire test base in `server/tests/` for reliance on limiter skip in non-production. Confirmed zero tests rely on `authLimiter` being skipped outside `test`. Because offline tests execute with `NODE_ENV === 'test'`, `skip()` returns `true` during tests, preventing false-positive 429 errors.
   - Changed `server/src/app.js:307` from `skip: () => process.env.NODE_ENV !== 'production'` to `skip: () => process.env.NODE_ENV === 'test'`.
   - Added unit test `server/tests/authLimiterSkipS3.test.js` (2/2 PASS) verifying static configuration and dynamic evaluation across `test` (true), `production` (false), `development` (false), and `undefined` (false). Included in `server/clinical.offline.jest.cjs`.
4. **Git Lock Handling:**
   - Sandbox git commits failed with `.git/index.lock: Permission denied`. Stopped all git operations immediately per rules, left edits cleanly staged/modified in working tree, and generated exact host PowerShell blocks.

---

## 4. Important Operational Note (Render Cloud Configuration)

With `skip: () => process.env.NODE_ENV === 'test'`, the auth rate limiter is now **active for all non-test environments**.
- If `NODE_ENV` is **unset** or set to `development` on Render, `authLimiter` is active with `max: 100` requests per 15 minutes.
- If `NODE_ENV === 'production'`, `authLimiter` is active with strict `max: 10` requests per 15 minutes.
- **Action required by operator before merging/deploying:** Confirm the configured value of `NODE_ENV` on Render and verify that `max: 10` (or `max: 100`) matches intended live user traffic volumes.

---

## 5. NOT VERIFIED

- Live network behavior against Atlas, Redis, Render, or external APIs (no network calls made).
- Real browser layout, responsive styling, and UI interactions (offline tests only).
- Production deployment and CI pipeline execution.
- Full offline gate in environments with root loopback permissions (`realLocalStack.test.cjs`) or Python 3.14 executables (`ml-scoring`, `ml-flask`, `ml-status-contract`).

---

## 6. Host PowerShell Commit Commands

Run these commands in PowerShell on the host to commit the changes:

```powershell
# 1. Item 1: Fix S1 token test lockout mock and include in gate
git add server/tests/jwt-patient-nic-removal-s1.test.js server/clinical.offline.jest.cjs
git commit -m "fix(test): mock lockout policy in S1 token test and include it in the gate"

# 2. Item 2: S6 public lab status lookup rate limiting
git add server/src/routes/labRoutes.js server/tests/publicLabStatusRateLimitS6.test.js server/clinical.offline.jest.cjs
git commit -m "fix(security): rate-limit public lab status lookup (S6)"

# 3. Item 3: S3 enable auth rate limiter outside test environment
git add server/src/app.js server/tests/authLimiterSkipS3.test.js server/clinical.offline.jest.cjs
git commit -m "fix(security): enable auth rate limiter outside test environment (S3)"

# 4. Documentation deliverables
git add docs/new/B1_BATCH6_REPORT.md docs/new/00_START_HERE_NEXT_PROMPT_TASKS_AND_PROGRESS.md docs/new/TRACKER_RECONCILIATION.md
git commit -m "docs(stage-b1): record Batch 6 report"
```
