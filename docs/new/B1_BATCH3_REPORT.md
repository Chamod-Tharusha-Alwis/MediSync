# MediSync — Stage B1 Batch 3 Execution & Verification Report

**Date:** 6 November 2026  
**Repository:** `C:\Users\chamo\OneDrive\Desktop\Final project\medisync`  
**Branch:** `stage-b1/fixes`  
**Starting HEAD:** `5ff124227a32f14ea9d94937d1d0f010f4f2efb8` (`5ff1242 docs(stage-b1): record Batch 2+3+4 implementation and verification report`)  
**Mode:** Unattended Offline Execution (`APPROVE B1: U7 S2 S5 S11`, `APPROVE INVESTIGATION ONLY: U2`, `APPROVE READ-ONLY CHECK: lockout patch dry-run`)

---

## 1. Repository & Working-Tree State

- **Branch Verified:** `stage-b1/fixes`
- **Prior Commits Verified on Branch:**
  - `2a73eb7` — `fix(client): Stage B1 Batch 1 fixes (U5, U3, U19, U23, U8) and Phase 1 docs`
  - `9b0d5fb` — `fix(client): add lab OTP request lock and cooldown timer (U6)`
  - `0372199` — `fix(client): render drug search suggestions in body portal (U1)`
  - `e1dc51b` — `fix(security): remove patient NIC from JWT claims (S1)`
  - `a251d04` — `fix(client): raise sub-12px font sizes to readable minimums (U22)`
  - `5ff1242` — `docs(stage-b1): record Batch 2+3+4 implementation and verification report`
- **Tracked Working Tree at Start:** 100% clean (`git status --short --untracked-files=no` empty).
- **Protected File Ledger (`docs/release/PROTECTED_HASHES.json`):**
  - **At Start:** **15/15 match** (`releaseCandidateSha256`)
  - **At End:** **15/15 match** (`releaseCandidateSha256`, `protectedAccountedFor: 15`, `sourceFrozen: true`)
- **Reserved Files Check:** `server/src/controllers/authController.js` and `server/src/controllers/pharmacyController.js` were **NOT** touched (0 bytes changed).
- **Git Commit Status in Sandbox:** Attempted `git add` + `git commit` once for S2; sandbox blocked creation of `.git/index.lock` (`fatal: Unable to create '.../.git/index.lock': Permission denied`). Per prompt boundary, git staging/commit commands were immediately stopped and all changes remain cleanly in the working tree with ready-to-paste PowerShell commit blocks in Section 8.

---

## 2. Batch 3 Item Summary Table

| Item | Scope | Status | Files Modified / Created | New / Updated Tests | Verification Result |
|:---|:---|:---:|:---|:---|:---|
| **U7** | Pharmacy pending NIC lookup 403 console error | **BLOCKED (Skipped)** | *None (0 files modified)* | *None* | **11 of 13 tests** in `client/src/__master_offline__/pharmacy-consent-flow.test.jsx` fail when `handleSearch` requires a consent token before `api.get`: 2 probe-assertion tests (`lines 32-43`, `117-128`) + **9 non-probe tests** (`lines 45-115`) that call `query('QA-ONE')` without ever granting consent. Per explicit prompt rule (*"If more than the probe assertions would need changing, SKIP and report"*), U7 was skipped. |
| **S2** | Rate-limit registration endpoints (`/register`) | **DONE_OFFLINE** | `server/src/routes/hospitalRoutes.js:14-22`<br>`server/src/routes/patientRoutes.js:15-24`<br>`server/src/routes/pharmacyRoutes.js:14-23` | `server/tests/registrationRateLimitS2.test.js` (6 tests) | **6/6 PASS** (`registrationRateLimitS2.test.js`), **1/1 PASS** (`loginRateLimitOffline.test.js`), **37/37 PASS** (`testMatrixInventory.test.js`). Confirmed failing (6/6 FAIL) prior to route edits. |
| **S5** | Rate-limit public listing, disease search, and public review endpoints | **DONE_OFFLINE** | `server/src/routes/publicRoutes.js:14-19`<br>`server/src/routes/reviewRoutes.js:8-15` | `server/tests/publicListingRateLimitS5.test.js` (7 tests) | **7/7 PASS** (`publicListingRateLimitS5.test.js`). Confirmed failing (5/7 FAIL on the 5 un-throttled routes) prior to route edits. |
| **S11** | Restrict `Permissions-Policy` Client Hints from `*` to `(self)` | **DONE_OFFLINE** | `server/src/app.js:237` | `server/tests/permissionsPolicyHeaderS11.test.js` (1 test) | **1/1 PASS** (`permissionsPolicyHeaderS11.test.js`). Confirmed failing prior to `app.js` edit. |
| **U2** | Medication safety duplicate/self-alert & `"Soap"` catalog filter (Read-Only Investigation) | **INVESTIGATION_COMPLETE** | `docs/new/B1_U2_INVESTIGATION.md` *(report only; 0 code files touched)* | *None (investigation only)* | Full read-only report written to `docs/new/B1_U2_INVESTIGATION.md` with exact `file:line` citations, catalog counts (13 `"Soap"` + 33 wash/shampoo/bar/pack = 46 non-prescribable out of 3,000), and self-comparison root cause (`ingredientResolver.js:425-455`). |
| **Lockout Patch Dry-Run** | Read-only check of `CODEX_PASSWORD_ATTEMPTS_INTEGRATED_REVIEW_20261105T141533Z.patch` | **VERIFIED CLEAN (Read-Only)** | *None (read-only `--check`)* | *None* | `git apply --check -v docs/temp/CODEX_PASSWORD_ATTEMPTS_INTEGRATED_REVIEW_20261105T141533Z.patch` exited **0** both before and after Batch 3 edits (all 9 target files apply cleanly). |

---

## 3. Offline Test Gate Results vs. Baseline

**GATE INCOMPLETE in this environment: ml-scoring, ml-flask, root, ml-status-contract**

- **Baseline Receipt (Start of Batch 3):** `scratch/clinical-offline-ny7e8c`
- **Final Receipt (Post-Batch 3):** `scratch/clinical-offline-UnvFzF`
- **Standalone Batch 3 Jest Verification:** `npx --prefix server jest tests/registrationRateLimitS2.test.js tests/publicListingRateLimitS5.test.js tests/permissionsPolicyHeaderS11.test.js tests/loginRateLimitOffline.test.js tests/testMatrixInventory.test.js` → **7 suites passed, 52/52 tests passed** (+14 new Batch 3 unit tests: 6 in S2, 7 in S5, 1 in S11).

| Suite / Profile | Baseline (`clinical-offline-ny7e8c`) | Post-Batch 3 (`clinical-offline-UnvFzF`) | Standalone New Tests | Status & Notes |
|:---|:---:|:---:|:---:|:---|
| `backend` (curated offline runner) | 2,474 PASS / 0 FAIL (107 suites) | 2,474 PASS / 0 FAIL (107 suites) | **+14 PASS** (3 new suites: S2, S5, S11) | **PASS** (0 regressions) |
| `client` | 638 PASS / 0 FAIL (71 suites) | 638 PASS / 0 FAIL (71 suites) | — | **PASS** (0 regressions) |
| `email-pdf` | 31 PASS / 0 FAIL (2 suites) | 31 PASS / 0 FAIL (2 suites) | — | **PASS** (0 regressions) |
| `root` | 38 PASS / 2 FAIL (40 total) | 38 PASS / 2 FAIL (40 total) | — | **BLOCKED in sandbox** (`connect EACCES 127.0.0.1` loopback restriction on subtests 38 & 40) |
| `ml-scoring` | Exit 103 (`BLOCKED`) | Exit 103 (`BLOCKED`) | — | **BLOCKED in sandbox** (`python.exe: Access is denied`) |
| `ml-flask` | Exit 103 (`BLOCKED`) | Exit 103 (`BLOCKED`) | — | **BLOCKED in sandbox** (`python.exe: Access is denied`) |
| `ml-status-contract` | Exit 1 (`BLOCKED`) | Exit 1 (`BLOCKED`) | — | **BLOCKED in sandbox** (`OFFLINE_ML_STATUS_CONTRACT_REJECTED`) |
| **Protected Pins** | **15/15 MATCH** | **15/15 MATCH** | **15/15 MATCH** | Verified via `PROTECTED_HASHES.json` (`releaseCandidateSha256`) |

---

## 4. Decisions Taken (and Why)

### Decision 1 — U7 Skipped and Marked `BLOCKED` (Mandatory Skip Condition Triggered)
- **Rule:** *"Existing test update: change ONLY the assertions that expect a tokenless api.get before the modal, to expect the modal to open first and api.get to run once with x-patient-access after consent. Keep every other test and assertion in that file intact. If more than the probe assertions would need changing, SKIP and report."*
- **Finding in `client/src/__master_offline__/pharmacy-consent-flow.test.jsx:1-143` (13 tests total):**
  - `PatientAccessContext.jsx:16` initializes `const [activeSession, setActiveSession] = useState(null)` with no storage hydration. Thus, every test in `pharmacy-consent-flow.test.jsx` starts with `getAccessToken(nic) === null`.
  - Only **2 of the 13 tests** click `Grant synthetic consent` and contain probe assertions:
    1. **Test 1 (`lines 32-43`)**: `'403 requiresConsent opens modal, stores token, and retries with x-patient-access'`
    2. **Test 12 (`lines 117-128`)**: `'inventory lookupFailure marks stock check unavailable while preserving prescription workflow'`
  - **9 other tests (`lines 45-115`)** call `await query('QA-ONE')` (or `query('199912345678')` / `query('NIC/100%?a=1')`) on a fresh `<PharmacyDashboard />` **without ever granting consent**, expecting `handleSearch` to immediately invoke `api.get`:
    1. **Test 2 (`lines 45-50`)**: `'changing NIC clears prior prescriptions, selection, and cart'` — calls `await query('QA-ONE')` with no consent token, expects `screen.findByText('Paracetamol')`.
    2. **Test 3 (`lines 52-58`)**: `'NIC change during loading ignores stale response'` — calls `await query('QA-ONE')` and `await query('QA-TWO')` with no consent token to test in-flight `api.get` promise race (`old.resolve(...)`).
    3. **Test 4 (`lines 60-65`)**: `'obsolete consent error does not open modal for newer NIC'` — calls `await query('QA-ONE')` and `await query('QA-TWO')` with no consent token, then rejects `old.reject(consentError())` and asserts `queryByRole('dialog')` is null. If `query()` opens the modal upfront when no token is present, the dialog is already open!
    4. **Test 5 (`lines 67-71`)**: `'account/role 403 does not open patient consent modal'` — mocks `api.get` rejecting with `{ status: 403, data: { error: 'Account deactivated' } }`, calls `await query('QA-ONE')` with no consent token, and asserts `expect(screen.queryByRole('dialog')).not.toBeInTheDocument()`. If `query()` opens the consent modal before `api.get`, `screen.queryByRole('dialog')` IS in the document and `api.get` is never called!
    5. **Test 6 (`lines 73-79`)**: `'failed repeat search clears stale prescriptions'` — calls `await query('QA-ONE')` twice without consent.
    6. **Test 7 (`lines 81-87`)**: `'invalid prescription response clears previous data'` — calls `await query('QA-ONE')` twice without consent.
    7. **Test 8 (`lines 89-92`)**: `'encodes NIC path segment before requesting prescriptions'` — calls `await query('NIC/100%?a=1')` without consent and asserts `api.get` was called with `/api/pharmacy/prescriptions/pending/NIC%2F100%25%3Fa%3D1`.
    8. **Test 10 (`lines 98-106`)**: `'losing active session clears displayed patient prescriptions and cart'` — calls `await query('199912345678')` before clicking `Grant synthetic consent`.
    9. **Test 11 (`lines 108-115`)**: `'late inventory load recalculates stock sufficiency for displayed prescriptions'` — calls `await query('QA-ONE')` without consent.
- **Conclusion:** Changing only the probe assertions in Tests 1 and 12 leaves 9 other tests in `pharmacy-consent-flow.test.jsx` broken (including Tests 3, 4, and 5 whose test mechanics fundamentally depend on `handleSearch` firing `api.get` before consent or pre-seeding a token in context). Therefore, per the prompt's mandatory skip rule, U7 was **SKIPPED** and marked **BLOCKED** with zero file modifications.

### Decision 2 — S2 Dedicated `registerLimiter` Defined After `loginLimiter`
- **Context:**
  - In `server/src/routes/patientRoutes.js:7-13`, `loginLimiter` has `max: process.env.NODE_ENV === 'development' ? 10000 : 1000` (1,000 requests per 15 minutes in production) and `message: { error: 'Too many login attempts. Try again later.' }`. Reusing `patientRoutes.js`'s `loginLimiter` for `/register` would allow 1,000 registrations per 15 minutes per IP and share rate-limit counters between `/register` and `/login`.
  - In `server/tests/loginRateLimitOffline.test.js:4-28`, the test executes `pharmacyRoutes.js` in a VM, records every `rateLimit(options)` call in `limits[]`, inspects `limits[0]`, and asserts `expect(options.max).toBe(10)`.
- **Decision:** Defined a dedicated `registerLimiter` (`windowMs: 15 * 60 * 1000`, `max: process.env.NODE_ENV === 'development' ? 10000 : 10`, `message: { error: 'Too many registration requests from this IP, please try again later.' }`, `skip: () => process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'`, `validate: { trustProxy: false }`) **after** `loginLimiter` in `hospitalRoutes.js`, `patientRoutes.js`, and `pharmacyRoutes.js`, and attached it to `router.post('/register', registerLimiter, ...)`.
- **Result:** All 3 registration endpoints are capped at 10 requests per 15 minutes per IP in production, registration counters are isolated from login counters, and `loginRateLimitOffline.test.js` (`limits[0]`) continues to pass without modification.

### Decision 3 — S5 Dedicated IP-Based `publicReviewLimiter` in `reviewRoutes.js`
- **Context:** `server/src/routes/reviewRoutes.js:5` defines `reviewLimiter` with `keyGenerator: req => req.user.id` for `router.post('/', protect(['patient']), reviewLimiter, reviewController.submitReview)`. However, `router.get('/:targetId', reviewController.getTargetReviews)` (`line 8`) is a public, unauthenticated endpoint where `req.user` is `undefined`.
- **Decision:** Defined a dedicated IP-based `publicReviewLimiter` (`windowMs: 60 * 1000`, `max: 60`, `message: { error: 'Too many requests', details: 'Please try again later.' }`, `validate: { trustProxy: false }`) in `reviewRoutes.js:8-13` matching `publicLimiter` in `publicRoutes.js:7-12`, and attached it to `router.get('/:targetId', publicReviewLimiter, reviewController.getTargetReviews)`. Attached the existing `publicLimiter` to `/doctors`, `/hospitals`, `/pharmacies`, and `/diseases/search` in `publicRoutes.js:14-19`.

---

## 5. Lockout Patch Dry-Run Result (Read-Only)

Command executed (read-only `--check`, patch **not** applied):
```powershell
git apply --check -v docs/temp/CODEX_PASSWORD_ATTEMPTS_INTEGRATED_REVIEW_20261105T141533Z.patch
```
- **Exit Code:** `0` (clean apply both before and after Batch 3 edits)
- **Per-File Output:**
  - `Checking patch server/src/controllers/authController.js... Hunk #4 succeeded at 541 (offset -3 lines).` (Cleanly offset by 3 lines due to S1's removal of the 3-line `if (modelName === 'Patient' && user.nic)` block in commit `e1dc51b`).
  - `Checking patch server/src/controllers/pharmacyController.js...` (Clean)
  - `Checking patch server/src/security/passwordAttemptPolicy.js...` (Clean)
  - `Checking patch server/clinical.offline.jest.cjs...` (Clean)
  - `Checking patch server/tests/phase0LoginDiagnostics.test.js...` (Clean)
  - `Checking patch server/tests/agentBClinicalHandlers.test.js...` (Clean)
  - `Checking patch server/tests/masterLoginAdmission.test.js...` (Clean)
  - `Checking patch server/tests/helpers/loginRequestHarness.js...` (Clean)
  - `Checking patch server/tests/passwordAttemptPolicy.test.js...` (Clean)

---

## 6. U2 Read-Only Investigation Summary (`docs/new/B1_U2_INVESTIGATION.md`)

Full report written to `docs/new/B1_U2_INVESTIGATION.md`. Key verified facts:
1. **Not in Protected Hashes:** None of the U2 candidate files (`server/src/data/drugs_clean.json`, `server/src/controllers/drugController.js`, `server/src/utils/ingredientResolver.js`, `client/src/pages/doctor/NewConsultation.jsx`, `client/src/components/DrugSearchInput.jsx`) are in `docs/release/PROTECTED_HASHES.json`. (`client/src/components/SymptomTagInput.jsx` IS protected `#5` and is completely unrelated to drug search).
2. **`"Soap"` & Non-Prescribable Catalog Items in `server/src/data/drugs_clean.json` (3,000 total entries):**
   - **13 items** match `/\bsoap\b/i` (`Acne-Aid Soap`, `Acnederm Soap`, `Acnil Soap`, `Allergan Soap`, `Badger Soap`, `Biosulfur Soap`, `Calamine Soap`, `Cetaphil Cleansing And Moisturizing Bar Soap`, `Cidal Soap`, `Cuticura Mildly Medicated Soap`, `Dermadew Acne Soap`, `Dermadew Baby Soap`, `Dermadew Glow Soap`).
   - **33 additional items** are non-prescribable personal-care washes/bars/shampoos/kits (`Acne-Aid Bar`, `Aveeno Baby Soothing Relief Creamy Wash`, ` Sebamed` / `Selsun` shampoos, `Clean & Clear` face wash, etc.).
   - Filtering via a non-prescribable regex/form exclusion in `drugController.js` (or `ingredientResolver.js`) retains **2,954 prescribable drugs** (or **2,987** if filtering only `/\bsoap\b/i`), well above the `>= 2,500` requirement in `server/tests/drugCatalog.test.js:23`.
   - **Existing Test Impact Check:** `server/tests/drugCatalog.test.js:18` asserts `expect(raw.length).toBeGreaterThanOrEqual(3000)` on raw `drugs_clean.json`, and `server/tests/clinicalSafety.test.js:181` asserts `allDrugs.length >= 2500` on `getAllDrugs()`. Filtering in `drugController.js:searchDrugs` (API search layer) or keeping `drugs_clean.json` at 3,000 raw records while excluding non-prescribable items from search results preserves both `drugCatalog.test.js` and `clinicalSafety.test.js` with zero test breakage.
3. **Self-Comparison / Duplicate Safety Alert Root Cause:**
   - **Server (`server/src/utils/ingredientResolver.js:425-455`):** `checkPrescriptionSafety` runs an outer pair loop (`i`, `j = i + 1`) over `medications`. When the same drug appears twice in `medications` (or when `NewConsultation.jsx:900-935` checks a newly selected candidate against an existing row of the same drug), `checkPairInteractions(medA, medB)` runs *both* `findInteraction(ingA, ingB)` (`lines 384-396`) AND a same-ingredient check (`ingA === ingB`, `lines 399-410`), while `checkDuplicateTherapy` (`lines 250-316`) *also* emits a `DUPLICATE_INGREDIENT` alert (`lines 274-289`) for the exact same pair!
   - **Client (`client/src/pages/doctor/NewConsultation.jsx:1098-1147`):** Renders both `safetyResult.interactions` (lines 1100-1124, showing `"DrugA + DrugA"` / `"Duplicate Active Ingredient: ..."`) AND `safetyResult.duplicates` (lines 1127-1147, showing `"Duplicate ingredient: paracetamol — found in DrugA and DrugA"`). Furthermore, if the user selects the same drug twice or edits a row, `DrugA` vs `DrugA` produces a self-comparison alert `"DrugA + DrugA"` instead of a single deduplicated duplicate-medicine notice.

---

## 7. `NOT VERIFIED` List & Surprises

### Explicit `NOT VERIFIED` Items
- **Live Render / Vercel / Atlas / Redis / ML Engine Runtime:** `NOT VERIFIED` (strictly offline run; zero network calls made).
- **Python ML Offline Suites (`ml-scoring`, `ml-flask`) & `ml-status-contract`:** `NOT VERIFIED` in this sandbox due to Windows sandbox execution policy on `python.exe` (exit code 103).
- **Root Loopback Subtests 38 & 40 (`scripts/realLocalStack.test.cjs`):** `NOT VERIFIED` in this sandbox due to `connect EACCES 127.0.0.1` sandbox loopback block (38/40 root subtests passed).
- **CI Pipeline / Deployment Status:** `NOT VERIFIED` (no `git push` or GitHub API queries performed).

### Surprises Encountered
1. **`pharmacy-consent-flow.test.jsx` Scope on U7:** While only 2 tests (`lines 32-43` and `117-128`) explicitly assert on the unauthenticated probe's 403 rejection, 9 other tests in the same file call `query(...)` without ever clicking `Grant synthetic consent` because `PatientAccessContext` starts with `activeSession = null`. Updating U7 cleanly requires also updating those 9 tests in `pharmacy-consent-flow.test.jsx` (either to grant consent first in a shared helper or to pre-populate a token for non-consent tests).
2. **`patientRoutes.js` Had `max: 1000` on `loginLimiter`:** Unlike `hospitalRoutes.js` (`max: 10`) and `pharmacyRoutes.js` (`max: 10`), `patientRoutes.js:9` had `max: 1000` on `loginLimiter`. Creating a dedicated `registerLimiter` (`max: 10`) in all 3 route files ensured `/api/patient/register` is actually rate-limited to 10 requests per 15 minutes in production rather than 1,000.

---

## 8. Morning Operator Handoff: Ready-to-Paste PowerShell Commit Blocks

Because the sandbox blocked `.git/index.lock` creation, all Batch 3 changes remain cleanly in the working tree on branch `stage-b1/fixes` (above `5ff1242`). Run the following PowerShell commands from `C:\Users\chamo\OneDrive\Desktop\Final project\medisync`:

```powershell
# 1. Verify branch and working tree status
git status --short

# 2. Commit S2 (Registration endpoints rate limiting)
git add server/src/routes/hospitalRoutes.js server/src/routes/patientRoutes.js server/src/routes/pharmacyRoutes.js server/tests/registrationRateLimitS2.test.js
git commit -m "fix(security): rate-limit registration endpoints (S2)"

# 3. Commit S5 (Public listing, disease search, and public review rate limiting)
git add server/src/routes/publicRoutes.js server/src/routes/reviewRoutes.js server/tests/publicListingRateLimitS5.test.js
git commit -m "fix(security): rate-limit public directory, disease search, and review endpoints (S5)"

# 4. Commit S11 (Permissions-Policy Client Hints restricted to self)
git add server/src/app.js server/tests/permissionsPolicyHeaderS11.test.js
git commit -m "fix(security): restrict Permissions-Policy client-hint directives to self (S11)"

# 5. Commit Batch 3 documentation & U2 investigation report
git add docs/new/B1_U2_INVESTIGATION.md docs/new/B1_BATCH3_REPORT.md docs/new/00_START_HERE_NEXT_PROMPT_TASKS_AND_PROGRESS.md docs/new/TRACKER_RECONCILIATION.md docs/new/SECURITY_AUDIT_STATIC.md
git commit -m "docs(stage-b1): record Batch 3 execution report and U2 investigation"

# 6. Run full offline gate on host (where Python and loopback are unrestricted)
node scripts/run_offline_tests.js
```

### Recommended Next Approval Prompt
- **To unblock U7:** `APPROVE U7 FULL TEST FILE UPDATE: client/src/__master_offline__/pharmacy-consent-flow.test.jsx` (authorizing the helper `query()` in `pharmacy-consent-flow.test.jsx` to grant consent or pre-seed a consent token for the 9 non-probe tests, while updating Tests 4 & 5 to test their 403/stale-request scenarios with an active consent token).
- **To implement U2 (based on `docs/new/B1_U2_INVESTIGATION.md`):** `APPROVE B1: U2` (filtering non-prescribable soap/wash/shampoo/bar items at the drug search/resolver layer while keeping raw `drugs_clean.json` intact, and deduplicating self-comparison/same-ingredient alerts in `ingredientResolver.js` and `NewConsultation.jsx`).
- **To apply the verified password-lockout patch:** `APPROVE LOCKOUT PATCH APPLY` (`git apply docs/temp/CODEX_PASSWORD_ATTEMPTS_INTEGRATED_REVIEW_20261105T141533Z.patch`).
