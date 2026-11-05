# MediSync Stage B1 Phase 1 — Comprehensive Investigation Report

**Milestone**: MediSync Stage B1 (Phase 0 & Phase 1 Synthesis)  
**Date**: 2026-11-05  
**Working Directory**: `c:\Users\chamo\OneDrive\Desktop\Final project\medisync`  
**Git Branch**: `stage-b1/fixes`  
**Commit Baseline**: `08fb0470c6eb77bb21edf2027ad0e1a6c4dec537` (`08fb047 docs(stage-a): refresh planning docs at d611b41`)  
**Investigated Items**: U1, U3, U5, U6, U7, U8, U19, U22, U23, S1  
**Safety & Integrity Boundary**: Read-only codebase static investigation. Zero product code files in `client/src/`, `server/src/`, or `ml-engine/` were modified. No network requests, live logins, emails, or database operations were performed. Phase 2 implementation is strictly HALTED pending explicit operator approval.

---

## 1. Executive Summary & Master Status Table

Phase 0 repository synchronization and orientation verified a clean tracked git tree on branch `stage-b1/fixes`, matching HEAD `08fb047`, origin/main last known `d611b41` not re-fetched, `scratch/` git-ignored, and 15/15 release candidate protected pins identical to hashes in `docs/release/PROTECTED_HASHES.json`.

Phase 1 codebase investigation conducted an exhaustive static analysis across all 10 scoped items (U1, U3, U5, U6, U7, U8, U19, U22, U23, S1). All 10 items have been verified as **ACTIVE BUGS (YES)** on HEAD commit `08fb047`. None of the recent 5 pushed commits (`f566eea`, `4d02303`, `3692403`, `fdbd40f`, `192e1d4`) resolved these bugs. All prospective edit targets were verified against `docs/release/PROTECTED_HASHES.json`, confirming that **0 prospective product changes touch protected paths**.

### Master Investigation Summary Table

| Item | Bug Present? | Exact Root Cause | Prospective Files to Modify | In Protected Hashes? | Implementation Ready? |
|:---|:---:|:---|:---|:---:|:---:|
| **U1**: Medication search dropdown overlaps table | **YES** | `client/src/components/DrugSearchInput.jsx:382-390`: In-DOM rendering using `absolute top-full` without `createPortal` inside `.glass-card` (`NewConsultation.jsx:1338-1470`), causing suggestion list to clip/overlap subsequent cards and tables. | `client/src/components/DrugSearchInput.jsx`, `client/src/__master_offline__/drug-search-stress.test.jsx` | **NO** (0/15) | **YES** (Portal design + bounding rect logic verified) |
| **U3**: Password strength bar shows no fill | **YES** | `PasswordStrengthMeter.jsx:45-56` evaluates `isFilled = index < score`. Passwords < 12 chars receive `score = 0` (`passwordPolicy.js:55-82`), leaving all 4 segments `bg-slate-800` (no fill). Also unconfigured classes (`text-slate-350`, `bg-slate-850`) in registration pages. | `client/src/components/common/PasswordStrengthMeter.jsx`, `client/src/pages/auth/Register.jsx`, `client/src/pages/*/Register.jsx`, `client/src/pages/doctor/ChangeOrgPassword.jsx` | **NO** (0/15) | **YES** (Level 0 segment-1 color fix + class normalization ready) |
| **U5**: Hospital lab button shows raw `{t(...)}` text | **YES** | `client/src/pages/hospital/LabManagement.jsx:187`: String literal syntax bug `'{t("common.verify", "Send Verification OTP")}'` passes verbatim text rather than evaluating JSX translation expression. | `client/src/pages/hospital/LabManagement.jsx` | **NO** (0/15) | **YES** (Surgical JSX expression replacement ready) |
| **U6**: Five HTTP 429 from one action | **YES** | `client/src/pages/hospital/LabManagement.jsx:180-189, 211`: Missing click concurrency lock (`isSubmittingRef`) and missing cooldown timer state on submit button; `<OtpInput>` missing `loading={loading}`. Rapid double-clicks/retries hit Redis throttle (`labController.js:174-184`, `redis.js:370-380`). (Mount/re-render trigger refuting proof documented). | `client/src/pages/hospital/LabManagement.jsx`, `client/src/components/ui/OtpInput.jsx` | **NO** (0/15) | **YES** (Submission lock + 60s countdown timer state ready) |
| **U7**: Pharmacy pending prescriptions returns 403 while list renders | **YES** | `client/src/pages/pharmacy/Dashboard.jsx:87-90`: Client dispatches unauthenticated `GET /api/pharmacy/prescriptions/pending/:nic` probe without `x-patient-access` header before opening consent modal. `server/src/routes/pharmacyRoutes.js:32` and `patientConsent.js:5-8` return 403 (logged in console). Modal OTP verification then fires second request with token, succeeding with 200. | `client/src/pages/pharmacy/Dashboard.jsx` | **NO** (0/15) | **YES** (Probe-elimination: check token upfront, open modal directly) |
| **U8**: Notification dropdown clipped at left edge at 320/375px | **YES** | `client/src/components/common/NotificationBell.jsx:216`: Fixed width `w-80` (320px) with `absolute right-0` inside narrow parents (e.g. 280px drawer in `Sidebar.jsx:169, 256`) forces left coordinates into negative screen space. | `client/src/components/common/NotificationBell.jsx` | **NO** (0/15) | **YES** (Responsive `fixed inset-x-2 sm:absolute sm:right-0 sm:w-80` ready) |
| **U19**: District names display lower-case / underscored | **YES** | Multiple UI pages (`GeographicMap.jsx:92, 143`, `OutbreakMonitor.jsx:338, 410`, `admin/Dashboard.jsx:79`, `pharmacy/Dashboard.jsx:999, 1037`, `Broadcast.jsx:220, 296`) interpolate raw DB/ML district strings directly. In `GeographicMap.jsx:104`, lowercase keys fail coordinate lookup and fall back to Nationwide. | `client/src/utils/districtAdjacency.js`, `client/src/components/common/GeographicMap.jsx`, `client/src/pages/admin/*`, `client/src/pages/pharmacy/*` | **NO** (0/15) | **YES** (Export `formatDistrictName` display-only helper; query params preserved) |
| **U22**: Tiny text (< 12px readable / < 11px badge) | **YES** | 280 occurrences across 53 files (`text-[9px]`: 35, `fontSize: 9`: 1, `text-[10px]`: 208, `text-[11px]`: 34, `fontSize: '11px'`: 2) + `index.css:246` (`.label-caps`). 36 instances <= 9px violate WCAG 1.4.4 and render Sinhala/Tamil glyphs unreadable. | 53 component files in `client/src/` (full inventory below) | **NO** (0/15; `SymptomTagInput.jsx` has 0 occurrences) | **YES** (Exhaustive line catalog & upgrade targets ready) |
| **U23**: Undefined Tailwind classes | **YES** | 216 occurrences across 37 files of invalid, non-standard, or ungenerated classes: unconfigured palette shades (`text-slate-550`, `bg-slate-850`), fractional spacing (`w-4.5`, `h-4.5`), invalid opacity syntax (`border-white/6`, `/12`), missing utilities (`text-gradient-blue`, `glass-btn`), and dynamic template strings (`bg-${color}-500/10`). PostCSS confirmed 0 CSS rules generated. | `client/tailwind.config.js`, `client/src/index.css`, and 37 UI components | **NO** (0/15; `SymptomTagInput.jsx` has 0 occurrences) | **YES** (Dual strategy: config extend for `w-4.5`/`slate-550` + surgical source cleanup) |
| **S1**: Patient NIC in JWT `sub` claim | **YES** | `server/src/controllers/patientController.js:85` signs `sub: patient.nic`. `authController.js:454, 686` signs `sub: subId` (resolves to `user.nic` for Patient) and `tokenPayload.nic = user.nic`. Exposes unencrypted National Identity Card in base64url token payload. | `server/src/controllers/patientController.js`, `server/src/controllers/authController.js` | **NO** (0/15) | **YES** (Audited safe migration to `String(patient._id)`; 0 client/server breakage) |

---

## 2. Phase 0 Verification & Repository State

The following baseline checks were executed and confirmed in Phase 0:

1. **Git State & Tracked Tree Cleanliness**:
   - Current branch: `stage-b1/fixes`
   - HEAD commit SHA: `08fb0470c6eb77bb21edf2027ad0e1a6c4dec537`
   - Git log (recent 8 commits):
     ```
     08fb047 docs(stage-a): refresh planning docs at d611b41
     d611b41 docs: record offline phase 2 results and inactive lockout review
     fdbd40f fix(auth): reject malformed login requests before account access
     f566eea fix(doctor): preserve current medication safety warnings and validate replies
     3692403 fix(ui): sanitize history recovery and enlarge language touch targets
     4d02303 fix(ui): contain shell failures and lock concurrent login actions
     192e1d4 fix(i18n): register missing labels and report source audit findings
     fcfbffd test(qa): cap admin status checks to one guarded GET
     ```
   - Tracked working tree: 100% clean (`git status --untracked-files=no` reported `nothing to commit`). Only untracked files (`??`) exist.
2. **Remote Origin Integrity**:
   - `origin/main` last known `d611b41`, not re-fetched. Per network constraint, zero remote network operations were attempted.
3. **Git-Ignore Rule for `scratch/`**:
   - Verified via `git check-ignore -v scratch/x`: matched `.gitignore:42:scratch/`. `scratch/` is strictly ignored by Git.
4. **Protected Pins Verification (`snapshot()`)**:
   - Executed `scripts/run_offline_tests.js` exported `snapshot()`.
   - Verified: **15 of 15 protected file hashes match** `docs/release/PROTECTED_HASHES.json` exactly.
   - Pinned files:
     1. `server/src/middleware/auth.js`
     2. `server/src/controllers/doctorController.js`
     3. `ml-engine/app.py`
     4. `ml-engine/evaluate_symptom_model.py`
     5. `client/src/components/SymptomTagInput.jsx`
     6. `server/tests/ir04BackendIntegration.test.js`
     7. `server/tests/patientProfileOwnedIntegration.test.js`
     8. `server/tests/prescriptionDurationOwnedIntegration.test.js`
     9. `server/tests/lab.test.js`
     10. `server/tests/universityDemoSeedVerify.test.js`
     11. `client/tests/ir04-isolated-five-role-e2e.spec.js`
     12. `server/src/config/dbGuard.js`
     13. `server/src/models/Consultation.js`
     14. `server/src/models/Patient.js`
     15. `server/src/utils/versionedEncryption.js`

---

## 3. Detailed Investigation of Scoped Items (U1–U23, S1)

### Item U1: Medication Search Dropdown Overlaps Table

1. **Bug Presence on Current Commit**: **YES**.
   - Evidence: `client/src/components/DrugSearchInput.jsx:382-390`, `client/src/pages/doctor/NewConsultation.jsx:1338-1470`.
2. **Exact Root Cause**:
   - In `DrugSearchInput.jsx:382-390`, the suggestions dropdown is rendered in-DOM with `className="absolute left-0 right-0 z-50 w-full bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl max-h-60 overflow-y-auto..."`.
   - In `NewConsultation.jsx:1338-1350`, `DrugSearchInput` is placed inside a standard `.glass-card`.
   - In `NewConsultation.jsx:1436-1470`, the Prescriptions Table is rendered immediately below the search card.
   - Because the dropdown renders within the local DOM flow of the card rather than in a top-level React Portal, it expands into and visually collides with the subsequent card and interactive table elements, creating z-index stacking conflicts and boundary clipping.
3. **Overlap with Pushed Commits**: **OPEN**.
   - Inspection of commit `f566eea` (`git show f566eea -- client/src/components/DrugSearchInput.jsx`) demonstrates changes only to lines 2, 117-118, 203, and 226-248 (importing `medicationSafetyResponse`, adding `interactionRequestRef`, and handling warning text). `f566eea` did NOT implement React Portal rendering or alter dropdown placement.
4. **Files That Would Change**:
   - `client/src/components/DrugSearchInput.jsx`
   - `client/src/__master_offline__/drug-search-stress.test.jsx` (to adapt portal hierarchy assertions)
   - *Protected check*: Neither file is in `docs/release/PROTECTED_HASHES.json`. Both are **UNPROTECTED**.
5. **Smallest Proposed Fix Description**:
   - In `client/src/components/DrugSearchInput.jsx`:
     - Import `createPortal` from `'react-dom'`.
     - When `isOpen && query.trim().length >= 2`, render the suggestions list via `createPortal(listElement, document.body)`.
     - Position the portal container using `fixed` coordinates computed from `wrapperRef.current.getBoundingClientRect()` (`top: rect.bottom + 4`, `left: rect.left`, `width: rect.width`, `zIndex: 9999`).
     - Update `handleClickOutside` to verify that clicked targets are not contained in `wrapperRef.current` NOR `listRef.current`.
6. **Proposed Offline Test**:
   - In `client/src/__master_offline__/drug-search-portal.test.jsx`, render `DrugSearchInput`, fire change event on input with query `"Para"`, and assert:
     - `document.body.querySelector('#medication-suggestions-list')` exists directly under `document.body`.
     - The element has `style.position === 'fixed'` and `style.zIndex === '9999'`.
     - Clicking inside the portal does not dismiss the list; clicking outside dismisses it.
7. **Risk & Rollback Analysis**:
   - Low risk. Confined to UI rendering layer.
   - Note on existing tests: `client/src/__master_offline__/drug-search-stress.test.jsx:210-229` currently asserts `searchWrapper.nextElementSibling === cardAfter` and `listbox.className.includes('absolute')`. Updating `DrugSearchInput` to portal rendering requires updating this test's DOM expectations.
   - Rollback: `git checkout client/src/components/DrugSearchInput.jsx client/src/__master_offline__/drug-search-stress.test.jsx`.

---

### Item U3: Password Strength Bar Shows No Fill

1. **Bug Presence on Current Commit**: **YES**.
   - Evidence: `client/src/components/common/PasswordStrengthMeter.jsx:45-56`, `client/src/utils/passwordPolicy.js:55-82`, `client/src/pages/auth/Register.jsx:220-225`.
2. **Exact Root Cause**:
   - In `PasswordStrengthMeter.jsx:45-56`, `isFilled` is determined by `index < score`.
   - In `client/src/utils/passwordPolicy.js:55-82`, passwords shorter than 12 characters receive `score = 0` (e.g. `"abc"`, `"Pass123"`, or any 11-character string).
   - When `score === 0`, `isFilled` is false for all four segment indices `[0, 1, 2, 3]`, causing every segment to render `bg-slate-800` (neutral dark slate). Although the text label reads `"Very Weak"`, the visual bar displays zero colored fill.
   - Additionally, role registration pages (`client/src/pages/*/Register.jsx`) contain unconfigured and undefined Tailwind classes (`text-slate-350`, `text-slate-355`, `bg-slate-850`, `bg-slate-855`, `duration-350`), breaking color and transition rendering.
3. **Overlap with Pushed Commits**: **OPEN**.
   - None of `f566eea`, `4d02303`, `3692403`, `fdbd40f`, or `192e1d4` modified `PasswordStrengthMeter.jsx` or registration password indicators.
4. **Files That Would Change**:
   - `client/src/components/common/PasswordStrengthMeter.jsx`
   - `client/src/pages/auth/Register.jsx`
   - `client/src/pages/hospital/Register.jsx`
   - `client/src/pages/doctor/Register.jsx`
   - `client/src/pages/patient/Register.jsx`
   - `client/src/pages/pharmacy/Register.jsx`
   - `client/src/pages/doctor/ChangeOrgPassword.jsx`
   - *Protected check*: None are in `docs/release/PROTECTED_HASHES.json`. All are **UNPROTECTED**.
5. **Smallest Proposed Fix Description**:
   - In `PasswordStrengthMeter.jsx:45-56`: When `password` is non-empty and `score === 0`, render segment 0 with `bg-rose-600` (or give Level 0 a 1-segment red active state) so users receive immediate, responsive visual feedback that their input is being evaluated.
   - In registration pages: Replace undefined classes with standard utilities:
     - `text-slate-350` / `text-slate-355` -> `text-slate-400`
     - `bg-slate-850` / `bg-slate-855` -> `bg-slate-800`
     - `duration-350` -> `duration-300`
6. **Proposed Offline Test**:
   - In `client/src/__master_offline__/password-strength-fill.test.jsx`, render `PasswordStrengthMeter` with `password="abc"`, and assert:
     - At least one segment contains an active fill color (`bg-rose-600` or `segmentColors[0]`).
     - Password meter displays accessible ARIA attributes (`role="progressbar"` with `aria-valuenow`).
7. **Risk & Rollback Analysis**:
   - Very low risk. Purely visual styling and DOM class replacement.
   - Rollback: `git checkout client/src/components/common/PasswordStrengthMeter.jsx client/src/pages/*/Register.jsx`.

---

### Item U5: Hospital Lab Button Shows Raw "{t(...)}" Text

1. **Bug Presence on Current Commit**: **YES**.
   - Evidence: `client/src/pages/hospital/LabManagement.jsx:187`.
2. **Exact Root Cause**:
   - `client/src/pages/hospital/LabManagement.jsx:187`:
     ```jsx
     {loading ? 'Requesting Consent OTP...' : '{t("common.verify", "Send Verification OTP")}'}
     ```
   - Single quotes wrap the curly braces, causing React to render the string literal `'{t("common.verify", "Send Verification OTP")}'` directly into the DOM instead of evaluating the i18n translation hook.
   - Repository-wide grep confirmed this is the single occurrence of this string-wrapped translation bug.
3. **Overlap with Pushed Commits**: **OPEN**.
   - Commit `192e1d4` registered missing keys in translation dictionaries (`en.js`, `si.js`, `ta.js`), but did NOT edit `LabManagement.jsx`.
4. **Files That Would Change**:
   - `client/src/pages/hospital/LabManagement.jsx`
   - *Protected check*: Not in `docs/release/PROTECTED_HASHES.json`. **UNPROTECTED**.
5. **Smallest Proposed Fix Description**:
   - In `client/src/pages/hospital/LabManagement.jsx:187`:
     ```jsx
     // Change line 187 from:
     {loading ? 'Requesting Consent OTP...' : '{t("common.verify", "Send Verification OTP")}'}
     // To:
     {loading ? t('consent.requestingConsentOtp', 'Requesting Consent OTP...') : t('common.verify', 'Send Verification OTP')}
     ```
6. **Proposed Offline Test**:
   - In `client/src/__master_offline__/lab-button-i18n.test.jsx`, render `LabManagement`, query the submit button, and assert:
     - `button.textContent` contains `"Send Verification OTP"`.
     - `button.textContent` does NOT contain `"{t("`.
7. **Risk & Rollback Analysis**:
   - Zero risk. Single-line syntax correction.
   - Rollback: `git checkout client/src/pages/hospital/LabManagement.jsx`.

---

### Item U6: Five HTTP 429 From One Action (Hospital Lab OTP Throttle)

1. **Bug Presence on Current Commit**: **YES**.
   - Evidence: `client/src/pages/hospital/LabManagement.jsx:180-189, 211`, `server/src/controllers/labController.js:174-184`, `server/src/config/redis.js:370-380`.
2. **Exact Root Cause & Refutation of Mount/Re-render Hypothesis**:
   - **Refutation of Mount/Re-render**:
     - `client/src/pages/hospital/LabManagement.jsx:45-132` contains component `RegisterNewTest`.
     - Exhaustive inspection confirms **zero `useEffect` hooks** exist in `RegisterNewTest`. The only `useEffect` in `LabManagement.jsx` is at line 327 in `LabWorkQueue` (fetching queue tests via `GET /lab/hospital/all`).
     - Handler `handleSendOtp` is wired strictly to `<form onSubmit={handleSendOtp}>` (line 168) and `<OtpInput onResend={handleSendOtp} />` (line 213).
     - Therefore, the hypothesis in earlier documentation that `POST /api/lab/hospital/request-otp` fires automatically on mount or component re-render is **objectively disproven**.
   - **Real Root Cause**:
     - `LabManagement.jsx:180-189`: The submit button lacks a submission concurrency lock (`isSubmittingRef`) and maintains no cooldown countdown state.
     - `LabManagement.jsx:211`: `<OtpInput onSubmit={handleVerifyOtpCode} onResend={handleSendOtp} initialSeconds={120} />` is rendered WITHOUT passing `loading={loading}`. In `OtpInput.jsx:125-134`, the resend button disabled check is `disabled={loading}`. Because `loading` is omitted, it defaults to `false`, leaving the Resend button clickable during active requests.
     - Backend: `server/src/controllers/labController.js:174-184` invokes `checkOtpRequestThrottle({ accountKey: otpKey, ipKey: req.ip, attemptKey: otpKey })`.
     - `server/src/config/redis.js:283-305` sets defaults `cooldownSeconds: 60`, `maxPerAccount: 5`, `windowSeconds: 900`.
     - Rapid double-clicking or rapid clicking of "Send Verification OTP" / "Resend OTP" sends concurrent network dispatches. The first request succeeds and sets Redis cooldown (`COOLDOWN_PREFIX + accountKey`). The immediate second, third, fourth, and fifth requests are blocked with HTTP 429 (`otp_resend_cooldown`). Once 5 requests accumulate within 15 minutes, requests are blocked with HTTP 429 (`otp_account_rate_limit`).
3. **Overlap with Pushed Commits**: **OPEN**.
   - Commit `4d02303` introduced `useSubmissionLock.js` to login pages (`client/src/pages/*/Login.jsx`), but did NOT apply it to `LabManagement.jsx`.
4. **Files That Would Change**:
   - `client/src/pages/hospital/LabManagement.jsx`
   - `client/src/components/ui/OtpInput.jsx`
   - *Protected check*: Neither file is in `docs/release/PROTECTED_HASHES.json`. Both are **UNPROTECTED**.
5. **Smallest Proposed Fix Description**:
   - In `client/src/pages/hospital/LabManagement.jsx`:
     - Add `isSubmittingRef` to prevent re-entrant execution of `handleSendOtp`.
     - Maintain a `cooldownSeconds` state (default 0). On successful dispatch or 429 response, initialize countdown from `err.response?.data?.retryAfterSeconds || 60` using an interval.
     - Disable the submit button when `loading || cooldownSeconds > 0`. When cooldown is active, render button text: `"Wait {cooldownSeconds}s before resending"`.
     - On line 211, pass `loading={loading}` to `<OtpInput>`.
6. **Proposed Offline Test**:
   - In `client/src/__master_offline__/hospital-lab-otp-lock.test.jsx`:
     - Render `RegisterNewTest`.
     - Trigger rapid double-click on "Send Verification OTP"; assert mock `api.post('/lab/hospital/request-otp')` is called exactly once.
     - Simulate 429 response with `{ retryAfterSeconds: 45 }`; assert button is disabled and displays `"Wait 45s"`.
7. **Risk & Rollback Analysis**:
   - Very low risk. Confined entirely to UI component state.
   - Rollback: `git checkout client/src/pages/hospital/LabManagement.jsx client/src/components/ui/OtpInput.jsx`.

---

### Item U7: Pharmacy Pending Prescriptions Returns 403 While List Renders

1. **Bug Presence on Current Commit**: **YES**.
   - Evidence: `client/src/pages/pharmacy/Dashboard.jsx:87-90, 340-348`, `server/src/routes/pharmacyRoutes.js:32`, `server/src/middleware/patientConsent.js:5-8`.
2. **Exact Root Cause (Hypothesis C + Client Probe-First Flow)**:
   - In `server/src/routes/pharmacyRoutes.js:32`:
     ```javascript
     router.get('/prescriptions/pending/:nic', dispensingAuth, require('../middleware/patientConsent'), pharmacyController.getPendingPrescriptions);
     ```
   - In `server/src/middleware/patientConsent.js:5-8`:
     The middleware checks `req.headers['x-patient-access'] || req.headers['x-patient-access-token']`. If missing, it immediately returns `res.status(403).json({ error: 'Patient consent required' })`.
   - In `client/src/pages/pharmacy/Dashboard.jsx:87-90` (`handleSearch`):
     ```javascript
     const patientToken = forcedToken || (getPatientToken ? getPatientToken(lookupNic) : null);
     const headers = patientToken ? { 'x-patient-access': patientToken } : {};
     const { data } = await api.get('/pharmacy/prescriptions/pending/' + encodeURIComponent(lookupNic), { headers });
     ```
   - On the first lookup for a patient, `patientToken` is null/undefined. The client issues an unauthenticated `GET` request with empty headers (`headers = {}`).
   - The server correctly returns HTTP 403 Forbidden. The browser console logs this network 403 error.
   - In `Dashboard.jsx:106-111`, the catch block detects `requiresPatientConsent(err)` and opens `<PatientAccessModal>`.
   - The user completes the OTP flow. In `Dashboard.jsx:345-349`, `onSuccess` receives the valid token and calls `handleSearch(null, token)`.
   - This second request sends `headers: { 'x-patient-access': token }`. The server validates consent and returns HTTP 200 with the prescription array.
   - **Conclusion**: The list renders successfully from the second request, but an unnecessary 403 error is logged to console on the first request because the frontend employs a speculative "probe-and-catch-403" pattern rather than checking for consent token presence upfront.
3. **Overlap with Pushed Commits**: **OPEN**.
   - None of the 5 pushed commits touched `pharmacyRoutes.js` or `Dashboard.jsx`.
4. **Files That Would Change**:
   - `client/src/pages/pharmacy/Dashboard.jsx`
   - *Protected check*: Not in `docs/release/PROTECTED_HASHES.json`. **UNPROTECTED**.
5. **Smallest Proposed Fix Description**:
   - In `client/src/pages/pharmacy/Dashboard.jsx` (`handleSearch`):
     - Before calling `api.get`, inspect `patientToken`:
       ```javascript
       const patientToken = forcedToken || (getPatientToken ? getPatientToken(lookupNic) : null);
       if (!patientToken) {
         setShowConsentModal(true);
         setLoading(false);
         return;
       }
       ```
     - This immediately prompts for consent without dispatching an unauthenticated probe, completely eliminating the 403 network error while preserving the exact modal and dispensing flow.
6. **Proposed Offline Test**:
   - In `client/src/__master_offline__/pharmacy-consent-probe.test.jsx`:
     - Render pharmacy dispense view.
     - Submit NIC search with empty consent session.
     - Assert `api.get` is NOT called.
     - Assert `PatientAccessModal` is opened immediately.
     - Simulate modal `onSuccess` with `'valid-consent-token'`; assert `api.get` is called once with `headers: { 'x-patient-access': 'valid-consent-token' }`.
7. **Risk & Rollback Analysis**:
   - Very low risk. Eliminates an unnecessary failing network roundtrip. Matches doctor consultation UX.
   - Rollback: `git checkout client/src/pages/pharmacy/Dashboard.jsx`.

---

### Item U8: Notification Dropdown Clipped at Left Edge at 320/375px

1. **Bug Presence on Current Commit**: **YES**.
   - Evidence: `client/src/components/common/NotificationBell.jsx:216`, `client/src/components/common/Sidebar.jsx:169, 256`.
2. **Exact Root Cause**:
   - In `NotificationBell.jsx:216`:
     ```jsx
     className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1rem)] glass-panel border border-slate-700/50 rounded-xl overflow-hidden shadow-2xl"
     ```
   - `w-80` = 20rem = 320px width. `absolute right-0` anchors the right edge of this 320px dropdown to the right edge of the bell button container.
   - In `Sidebar.jsx:169, 256`, `NotificationBell` is mounted inside the user card within the mobile drawer (`w-[280px]`). Because the drawer is only 280px wide and the bell is positioned ~240px from the screen's left edge, anchoring `right-0` forces the dropdown to span leftward from 240px to `240 - 320 = -80px`, clipping 80px off the left side of the display.
   - On standalone 320px mobile viewports, any non-zero container padding similarly forces the dropdown's left edge into negative screen space.
3. **Overlap with Pushed Commits**: **OPEN**.
   - None of the 5 pushed commits modified `NotificationBell.jsx` or `Sidebar.jsx`.
4. **Files That Would Change**:
   - `client/src/components/common/NotificationBell.jsx`
   - *Protected check*: Not in `docs/release/PROTECTED_HASHES.json`. **UNPROTECTED**.
5. **Smallest Proposed Fix Description**:
   - In `NotificationBell.jsx:216`, make dropdown positioning responsive to screen size:
     ```jsx
     className="fixed inset-x-2 top-16 sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:w-80 sm:max-w-[calc(100vw-1rem)] mt-2 glass-panel border border-slate-700/50 rounded-xl overflow-hidden shadow-2xl"
     ```
   - On mobile screens (<640px), `fixed inset-x-2` pins the dropdown 8px from both left and right screen edges, guaranteeing zero clipping on 320px and 375px viewports. On desktop (`sm:`), standard `absolute right-0 w-80` dropdown positioning is preserved.
6. **Proposed Offline Test**:
   - In `client/src/__master_offline__/notification-bell-responsive.test.jsx`, render `NotificationBell`, trigger click on bell icon, and assert dropdown classes contain `fixed inset-x-2 sm:absolute sm:right-0`.
7. **Risk & Rollback Analysis**:
   - Very low risk. Pure CSS class adjustment.
   - Rollback: `git checkout client/src/components/common/NotificationBell.jsx`.

---

### Item U19: District Names Display Lower-case / Underscored

1. **Bug Presence on Current Commit**: **YES**.
   - Evidence: `client/src/components/common/GeographicMap.jsx:92, 103-104, 143`, `client/src/pages/admin/OutbreakMonitor.jsx:338, 410`, `client/src/pages/admin/Dashboard.jsx:79`, `client/src/pages/pharmacy/Dashboard.jsx:999, 1037`, `client/src/pages/admin/Broadcast.jsx:220, 296`.
2. **Exact Root Cause**:
   - MongoDB consultation records and ML outbreak models store district names in normalized/lowercase or snake_case formats (e.g. `"kandy"`, `"nuwara_eliya"`).
   - UI components interpolate these raw database strings directly into JSX without title-casing or underscore replacement (e.g. rendering `"nuwara_eliya District"` in `GeographicMap.jsx:143`).
   - In `GeographicMap.jsx:104`, coordinate lookup `districtCoordinates[districtName]` fails when `districtName` is lowercase (since dictionary keys are canonical `"Kandy"`, `"Nuwara Eliya"`), causing pins to fall back to `Nationwide`.
   - While `client/src/utils/districtAdjacency.js:36` contains canonical list `ALL_DISTRICTS` and normalization function `normalizeDistrictName`, it lacks an inverse display formatter.
3. **Overlap with Pushed Commits**: **OPEN**.
   - None of the 5 pushed commits implemented district name display formatting.
4. **Files That Would Change**:
   - `client/src/utils/districtAdjacency.js`
   - `client/src/components/common/GeographicMap.jsx`
   - `client/src/pages/admin/OutbreakMonitor.jsx`
   - `client/src/pages/admin/Dashboard.jsx`
   - `client/src/pages/pharmacy/Dashboard.jsx`
   - `client/src/pages/admin/Broadcast.jsx`
   - *Protected check*: None are in `docs/release/PROTECTED_HASHES.json`. All are **UNPROTECTED**.
5. **Smallest Proposed Fix Description**:
   - Export display-only helper in `client/src/utils/districtAdjacency.js`:
     ```javascript
     export function formatDistrictName(name) {
       if (!name || typeof name !== 'string') return '';
       const norm = normalizeDistrictName(name);
       const canonical = ALL_DISTRICTS.find(d => normalizeDistrictName(d) === norm);
       if (canonical) return canonical;
       return name.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
     }
     ```
   - In UI JSX render sites, wrap district strings in `formatDistrictName(...)`.
   - In `GeographicMap.jsx:104`, look up coordinates via `districtCoordinates[formatDistrictName(districtName)] || districtCoordinates['Nationwide']`.
   - **Crucial Invariant**: Filter query parameters sent to `/public/consultation-activity` or `/predict-district-demand` remain unchanged (e.g. `district=kandy`).
6. **Proposed Offline Test**:
   - In `client/src/__master_offline__/district-display-format.test.jsx`, test `formatDistrictName`:
     - `formatDistrictName('kandy')` -> `'Kandy'`
     - `formatDistrictName('nuwara_eliya')` -> `'Nuwara Eliya'`
     - `formatDistrictName('moneragala')` -> `'Monaragala'`
     - `formatDistrictName('COLOMBO')` -> `'Colombo'`
7. **Risk & Rollback Analysis**:
   - Zero risk to backend/ML queries. Pure display formatting.
   - Rollback: `git checkout client/src/utils/districtAdjacency.js client/src/components/common/GeographicMap.jsx client/src/pages/admin/* client/src/pages/pharmacy/*`.

---

### Item U22: Tiny Text (Comprehensive Quantitative Audit)

1. **Bug Presence on Current Commit**: **YES**.
   - Total occurrences: **280** across **53 product files**, plus `.label-caps` in `client/src/index.css:246`.
2. **Exact Root Cause**:
   - Pervasive use of arbitrary sub-12px Tailwind utilities (`text-[9px]`, `text-[10px]`, `text-[11px]`) and Recharts inline SVG font styles.
   - Sub-10px text severely degrades legibility on mobile viewports (320px/375px) and causes Sinhala (`සිංහල`) and Tamil (`தமிழ்`) Unicode characters to render as illegible pixel blobs.
3. **Overlap with Pushed Commits**: **OPEN**.
   - None of the 5 pushed commits touched tiny text utilities.
4. **Files That Would Change**:
   - 53 UI component files (see table below) and `client/src/index.css:246`.
   - *Protected check*: Verified that `client/src/components/SymptomTagInput.jsx` (the only client file in `docs/release/PROTECTED_HASHES.json`) has **zero sub-12px occurrences**. 0/15 protected files are affected.
5. **Classification Against Proposed Minimums**:
   - **12px Minimum** (`text-xs`): Required for all readable content (body text, hints, helper messages, table values, input text, timestamps, action links).
   - **11px Minimum** (`text-[11px]`): Permitted strictly for short uppercase badges/labels, status pills, and micro-headers.
   - **< 11px (< 11px)**: Strictly prohibited across the entire product.

| Size Category | Count | Classification | Proposed Action |
|:---|:---:|:---|:---|
| **9px** (`text-[9px]`, `fontSize: 9`) | **36** | Critical accessibility violation. Sub-10px text is illegible on mobile and breaks Sinhala/Tamil script rendering. | 25 badge/status instances -> `text-[11px] uppercase tracking-wider`; 11 body/hint/overlay/SVG instances -> `text-xs` (12px). |
| **10px** (`text-[10px]`) | **208** | Severe accessibility violation. Violates the 11px minimum for badges and the 12px minimum for readable text. | 108 uppercase badges/labels -> `text-[11px]`; 100 body/hints/dates/hashes/table cells -> `text-xs` (12px). |
| **11px** (`text-[11px]`, `fontSize: '11px'`) | **36** | Conditional violation. 12 instances are uppercase badges (compliant); 24 instances are readable body text/links/hints (violation). | 12 uppercase badges -> Retain at `text-[11px]`; 24 body/hint/link instances -> Upgrade to `text-xs` (12px). |

#### Exhaustive Line Citations for All 36 Instances of <= 9px Text
1. `client/src/components/common/ActiveOutbreakBanner.jsx:96`: `text-[9px]` (Simulation badge)
2. `client/src/components/common/GeographicMap.jsx:167`: `text-[9px]` (District risk sub-label)
3. `client/src/components/common/LabDetailModal.jsx:65`: `text-[9px]` (Field header "Requested Date")
4. `client/src/components/common/LabDetailModal.jsx:75`: `text-[9px]` (Field header "Prescribed By")
5. `client/src/components/common/LabDetailModal.jsx:83`: `text-[9px]` (Field header "Testing Facility / Hospital")
6. `client/src/pages/admin/Broadcast.jsx:263`: `text-[9px]` (Target description "To: ROLE • DISTRICT")
7. `client/src/pages/admin/Dashboard.jsx:532`: `text-[9px]` (Status badge)
8. `client/src/pages/admin/OutbreakMonitor.jsx:191`: `text-[9px]` ("Next Automated Scan" label)
9. `client/src/pages/admin/OutbreakMonitor.jsx:283`: `fontSize: 9` (Recharts `<ReferenceLine>` label "Warning Limit (Z = 2.0)")
10. `client/src/pages/admin/OutbreakMonitor.jsx:333`: `text-[9px]` (Outbreak severity badge)
11. `client/src/pages/admin/OutbreakMonitor.jsx:344`: `text-[9px]` ("Z-Score" label)
12. `client/src/pages/admin/OutbreakMonitor.jsx:350`: `text-[9px]` ("Deviation" label)
13. `client/src/pages/admin/SessionMonitor.jsx:326`: `text-[9px]` (Status badge "Online")
14. `client/src/pages/admin/SessionMonitor.jsx:328`: `text-[9px]` (Status badge "Offline")
15. `client/src/pages/admin/UserManagement.jsx:128`: `text-[9px]` (Role badge)
16. `client/src/pages/auth/Register.jsx:220`: `text-[9px]` (Step indicator header)
17. `client/src/pages/doctor/NewConsultation.jsx:1060`: `text-[9px]` (Critical alert badge)
18. `client/src/pages/doctor/Profile.jsx:243`: `text-[9px]` (Avatar drag & drop instruction)
19. `client/src/pages/doctor/Register.jsx:149`: `text-[9px]` (Step indicator header)
20. `client/src/pages/hospital/Dashboard.jsx:269`: `text-[9px]` (Logo upload overlay text)
21. `client/src/pages/hospital/Dashboard.jsx:285`: `text-[9px]` (Upload progress percentage)
22. `client/src/pages/hospital/Register.jsx:214`: `text-[9px]` (Step indicator header)
23. `client/src/pages/patient/History.jsx:273`: `text-[9px]` (Timeline type badge)
24. `client/src/pages/patient/History.jsx:277`: `text-[9px]` (Timeline status badge)
25. `client/src/pages/patient/Prescriptions.jsx:71`: `text-[9px]` (Prescription status badge)
26. `client/src/pages/patient/Profile.jsx:263`: `text-[9px]` (Notice text)
27. `client/src/pages/patient/Register.jsx:160`: `text-[9px]` (Step indicator header)
28. `client/src/pages/pharmacy/Dashboard.jsx:1051`: `text-[9px]` (Alert status badge)
29. `client/src/pages/pharmacy/Dashboard.jsx:1371`: `text-[9px]` (Logo upload overlay text)
30. `client/src/pages/pharmacy/Dashboard.jsx:1387`: `text-[9px]` (Upload progress percentage)
31. `client/src/pages/pharmacy/Register.jsx:214`: `text-[9px]` (Step indicator header)
32. `client/src/pages/public/HospitalProfileModal.jsx:104`: `text-[9px]` (Hospital category badge)
33. `client/src/pages/public/HospitalProfileModal.jsx:169`: `text-[9px]` ("Pickup Location" label)
34. `client/src/pages/public/PharmacyDirectory.jsx:105`: `text-[9px]` (Pharmacy open badge)
35. `client/src/pages/public/PharmacyProfileModal.jsx:106`: `text-[9px]` (Verified pharmacy badge)
36. `client/src/pages/public/PharmacyProfileModal.jsx:170`: `text-[9px]` ("Pickup Location" label)

#### Exhaustive Line Citations for All 36 Instances of 11px Text
1. `client/src/components/common/ChangePasswordCard.jsx:137`: `text-[11px]` (Password hint paragraph) — *Violation: readable text*
2. `client/src/components/common/LanguagePreferenceCard.jsx:232`: `text-[11px]` (Language description paragraph) — *Violation: readable text*
3. `client/src/components/common/LanguagePreferenceCard.jsx:241`: `text-[11px]` (Language hint paragraph) — *Violation: readable text*
4. `client/src/components/common/LoginOtpStep.jsx:131`: `text-[11px]` (Uppercase label "Enter 6-digit Code") — *Compliant uppercase label*
5. `client/src/components/common/PasswordCriteriaTips.jsx:58`: `text-[11px]` (Uppercase header "Password Requirements") — *Compliant uppercase label*
6. `client/src/components/common/PasswordCriteriaTips.jsx:87`: `text-[11px]` (Criteria list items) — *Violation: readable text*
7. `client/src/pages/admin/Broadcast.jsx:253`: `text-[11px]` (Uppercase header "Notifications (Live)") — *Compliant uppercase label*
8. `client/src/pages/admin/Broadcast.jsx:262`: `text-[11px]` (Live message preview body) — *Violation: readable text*
9. `client/src/pages/admin/Dashboard.jsx:255`: `text-[11px]` (Table header uppercase text) — *Compliant uppercase label*
10. `client/src/pages/admin/Dashboard.jsx:295`: `text-[11px]` (Status pill uppercase) — *Compliant uppercase badge*
11. `client/src/pages/admin/Dashboard.jsx:299`: `text-[11px]` (Status pill uppercase) — *Compliant uppercase badge*
12. `client/src/pages/admin/Dashboard.jsx:341`: `text-[11px]` (Table body monospaced value) — *Violation: readable text*
13. `client/src/pages/admin/Login.jsx:160`: `text-[11px]` ("Forgot Password?" action link) — *Violation: readable text*
14. `client/src/pages/admin/OutbreakMonitor.jsx:280`: `fontSize: '11px'` (Recharts tooltip labelStyle) — *Violation: readable text*
15. `client/src/pages/admin/OutbreakMonitor.jsx:281`: `fontSize: '11px'` (Recharts tooltip itemStyle) — *Violation: readable text*
16. `client/src/pages/admin/UserAuditProfile.jsx:225`: `text-[11px]` (Monospaced creation date) — *Violation: readable text*
17. `client/src/pages/admin/UserAuditProfile.jsx:229`: `text-[11px]` (Monospaced last login date) — *Violation: readable text*
18. `client/src/pages/admin/UserAuditProfile.jsx:233`: `text-[11px]` (Monospaced last sign-out date) — *Violation: readable text*
19. `client/src/pages/doctor/Login.jsx:202`: `text-[11px]` ("Forgot Password?" action link) — *Violation: readable text*
20. `client/src/pages/doctor/NewConsultation.jsx:1036`: `text-[11px]` (`clinicalValidation: not_established` badge) — *Compliant uppercase badge*
21. `client/src/pages/doctor/NewConsultation.jsx:1066`: `text-[11px]` (Confidence score monospaced badge) — *Compliant uppercase badge*
22. `client/src/pages/doctor/NewConsultation.jsx:1069`: `text-[11px]` (Model latency badge) — *Compliant uppercase badge*
23. `client/src/pages/doctor/NewConsultation.jsx:1138`: `text-[11px]` (ICD category pill button) — *Compliant uppercase badge*
24. `client/src/pages/doctor/PatientDetail.jsx:366`: `text-[11px]` (Prescription issue date) — *Violation: readable text*
25. `client/src/pages/hospital/LabManagement.jsx:261`: `text-[11px]` (Reference number button) — *Violation: readable text*
26. `client/src/pages/hospital/LabManagement.jsx:468`: `text-[11px]` (Action confirmation text) — *Violation: readable text*
27. `client/src/pages/hospital/Login.jsx:159`: `text-[11px]` ("Forgot Password?" action link) — *Violation: readable text*
28. `client/src/pages/patient/Login.jsx:163`: `text-[11px]` ("Forgot Password?" action link) — *Violation: readable text*
29. `client/src/pages/pharmacy/Dashboard.jsx:597`: `text-[11px]` (Prescription action button) — *Violation: readable text*
30. `client/src/pages/pharmacy/Dashboard.jsx:717`: `text-[11px]` (Prescription details row) — *Violation: readable text*
31. `client/src/pages/pharmacy/Dashboard.jsx:772`: `text-[11px]` (Prescription dosage label) — *Violation: readable text*
32. `client/src/pages/pharmacy/Dashboard.jsx:781`: `text-[11px]` (Dismiss button label) — *Violation: readable text*
33. `client/src/pages/pharmacy/Dashboard.jsx:787`: `text-[11px]` (Dispense button label) — *Violation: readable text*
34. `client/src/pages/pharmacy/Login.jsx:156`: `text-[11px]` ("Forgot Password?" action link) — *Violation: readable text*
35. `client/src/pages/public/ForgotPassword.jsx:97`: `text-[11px]` (Help hint paragraph) — *Violation: readable text*
36. `client/src/pages/public/ResetPassword.jsx:197`: `text-[11px]` (Password instructions block) — *Violation: readable text*

#### 53-File Sub-12px Summary Table for U22
| File Path | Total Sub-12px | 9px | 10px | 11px |
|:---|:---:|:---:|:---:|:---:|
| `client/src/pages/admin/UserAuditProfile.jsx` | 23 | 0 | 20 | 3 |
| `client/src/pages/pharmacy/Dashboard.jsx` | 21 | 3 | 13 | 5 |
| `client/src/pages/admin/OutbreakMonitor.jsx` | 17 | 5 | 10 | 2 |
| `client/src/pages/admin/Dashboard.jsx` | 15 | 1 | 10 | 4 |
| `client/src/pages/admin/Broadcast.jsx` | 13 | 1 | 10 | 2 |
| `client/src/pages/admin/SessionMonitor.jsx` | 13 | 2 | 11 | 0 |
| `client/src/pages/doctor/NewConsultation.jsx` | 11 | 1 | 6 | 4 |
| `client/src/pages/public/HospitalProfileModal.jsx` | 11 | 2 | 9 | 0 |
| `client/src/pages/public/PharmacyProfileModal.jsx` | 11 | 2 | 9 | 0 |
| `client/src/pages/hospital/LabManagement.jsx` | 10 | 0 | 8 | 2 |
| `client/src/pages/patient/History.jsx` | 10 | 2 | 8 | 0 |
| `client/src/pages/public/DoctorProfileModal.jsx` | 10 | 0 | 10 | 0 |
| `client/src/components/TrustedDevices.jsx` | 9 | 0 | 9 | 0 |
| `client/src/pages/doctor/Profile.jsx` | 6 | 1 | 5 | 0 |
| `client/src/pages/auth/Register.jsx` | 5 | 1 | 4 | 0 |
| `client/src/pages/doctor/PatientDetail.jsx` | 5 | 0 | 4 | 1 |
| `client/src/pages/hospital/Dashboard.jsx` | 5 | 2 | 3 | 0 |
| `client/src/pages/patient/Register.jsx` | 5 | 1 | 4 | 0 |
| `client/src/components/common/LabDetailModal.jsx` | 4 | 3 | 1 | 0 |
| `client/src/pages/doctor/Register.jsx` | 4 | 1 | 3 | 0 |
| `client/src/pages/hospital/Register.jsx` | 4 | 1 | 3 | 0 |
| `client/src/pages/patient/Prescriptions.jsx` | 4 | 1 | 3 | 0 |
| `client/src/pages/pharmacy/Register.jsx` | 4 | 1 | 3 | 0 |
| `client/src/pages/public/DoctorDirectory.jsx` | 4 | 0 | 4 | 0 |
| `client/src/pages/public/HospitalDirectory.jsx` | 4 | 0 | 4 | 0 |
| `client/src/pages/public/PharmacyDirectory.jsx` | 4 | 1 | 3 | 0 |
| `client/src/components/common/GeographicMap.jsx` | 3 | 1 | 2 | 0 |
| `client/src/components/common/LanguagePreferenceCard.jsx` | 3 | 0 | 1 | 2 |
| `client/src/components/common/MedicalTimeline.jsx` | 3 | 0 | 3 | 0 |
| `client/src/pages/admin/Login.jsx` | 3 | 0 | 2 | 1 |
| `client/src/pages/admin/UserManagement.jsx` | 3 | 1 | 2 | 0 |
| `client/src/pages/patient/Profile.jsx` | 3 | 1 | 2 | 0 |
| `client/src/components/common/ChangePasswordCard.jsx` | 2 | 0 | 1 | 1 |
| `client/src/components/common/LoginShell.jsx` | 2 | 0 | 2 | 0 |
| `client/src/components/common/PasswordCriteriaTips.jsx` | 2 | 0 | 0 | 2 |
| `client/src/components/common/Sidebar.jsx` | 2 | 0 | 2 | 0 |
| `client/src/components/DrugSearchInput.jsx` | 2 | 0 | 2 | 0 |
| `client/src/pages/doctor/Login.jsx` | 2 | 0 | 1 | 1 |
| `client/src/pages/patient/Dashboard.jsx` | 2 | 0 | 2 | 0 |
| `client/src/pages/patient/RateConsultationModal.jsx` | 2 | 0 | 2 | 0 |
| `client/src/pages/patient/Support.jsx` | 2 | 0 | 2 | 0 |
| `client/src/components/common/ActiveOutbreakBanner.jsx` | 1 | 1 | 0 | 0 |
| `client/src/components/common/LoginOtpStep.jsx` | 1 | 0 | 0 | 1 |
| `client/src/components/common/PasswordStrengthMeter.jsx` | 1 | 0 | 1 | 0 |
| `client/src/components/common/PublicNavbar.jsx` | 1 | 0 | 1 | 0 |
| `client/src/index.css` | 1 | 0 | 1 | 0 |
| `client/src/pages/admin/SupportTicketsRoster.jsx` | 1 | 0 | 1 | 0 |
| `client/src/pages/hospital/Login.jsx` | 1 | 0 | 0 | 1 |
| `client/src/pages/patient/Login.jsx` | 1 | 0 | 0 | 1 |
| `client/src/pages/pharmacy/Login.jsx` | 1 | 0 | 0 | 1 |
| `client/src/pages/public/ForgotPassword.jsx` | 1 | 0 | 0 | 1 |
| `client/src/pages/public/ResetPassword.jsx` | 1 | 0 | 0 | 1 |
| `client/src/pages/SelectRole.jsx` | 1 | 0 | 1 | 0 |
| **Total** | **280** | **36** | **208** | **36** |

---

### Item U23: Undefined Tailwind Classes

1. **Bug Presence on Current Commit**: **YES**.
   - Total occurrences: **216** across **37 product files**.
2. **Identification Methodology**:
   - Automated token scanner extracted class candidates from `className` string literals, JSX template strings, conditional branches, and dictionary maps across all 201 `.js`/`.jsx` files in `client/src`.
   - PostCSS compilation against `client/tailwind.config.js` with Tailwind CSS `3.4.19` proved that 216 classes generate **zero CSS rules** in the output stylesheet.
3. **Overlap with Pushed Commits**: **OPEN**.
   - None of the 5 pushed commits fixed undefined Tailwind classes.
4. **Files That Would Change**:
   - `client/tailwind.config.js` (extend spacing and colors), `client/src/index.css` (add missing gradient utilities), and component files.
   - *Protected check*: Verified that `client/src/components/SymptomTagInput.jsx` contains **zero undefined classes**. 0/15 protected files are affected.
5. **Categorized Inventory of Undefined Classes & Proposed Replacements**:

#### Category A: Nonexistent Color Palette Shades (132 Occurrences)
- Standard Tailwind defines `50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950`. MediSync's `tailwind.config.js` does NOT extend slate or emerald.
- `text-slate-550` (27 occurrences, e.g. `Register.jsx:162`, `DoctorProfileModal.jsx:215`): Generates NO CSS. Replace with `text-slate-500` or add `slate: { 550: '#64748b' }` to config.
- `text-slate-555` (9 occurrences, `doctor/Register.jsx:105-170`): Typo. Generates NO CSS. Replace with `text-slate-500`.
- `bg-slate-850` (9 occurrences, e.g. `doctor/Register.jsx:18`, `hospital/Dashboard.jsx:274`): Generates NO CSS. Replace with `bg-slate-800` or `bg-slate-900`.
- `text-slate-350` (6 occurrences, e.g. `Register.jsx:222`, `admin/Dashboard.jsx:218`): Generates NO CSS. Replace with `text-slate-400`.
- `text-emerald-450` (10 occurrences, e.g. `Register.jsx:151`, `PharmacyDirectory.jsx:105`): Generates NO CSS. Replace with `text-emerald-400`.
- `text-rose-455` (5 occurrences, `doctor/Register.jsx:173-185`): Typo. Replace with `text-rose-400`.
- Others: `hover:text-slate-350` (2), `hover:text-slate-355` (2), `text-slate-355` (1), `bg-slate-855` (1), `text-indigo-450` (1), `text-amber-450` (1).

#### Category B: Non-Standard Spacing Scale (94 Occurrences)
- Standard Tailwind defines `4` (16px) and `5` (20px). `4.5` (18px) and `5.5` (22px) do not exist.
- `w-4.5` (43 occurrences, e.g. `PublicNavbar.jsx:88`, `SessionMonitor.jsx:220`): Icon width. Generates NO CSS (width falls back to 0/auto).
- `h-4.5` (43 occurrences, e.g. `PublicNavbar.jsx:88`, `SessionMonitor.jsx:220`): Icon height. Generates NO CSS.
- `w-5.5` (1) / `h-5.5` (1) (`PublicNavbar.jsx:27`): Replace with `w-5` / `h-5` or `w-[22px]`.
- `w-6.5` (1) / `h-6.5` (1) (`AppShell.jsx:67`): Replace with `w-6` / `h-6` or `w-[26px]`.
- `py-0.2` (3 occurrences, `UserAuditProfile.jsx:254, 269, 284`): Replace with `py-0.5`.
- `pt-18` (1 occurrence, `Home.jsx:113`): Replace with `pt-20` or `pt-[72px]`.

#### Category C: Non-Standard Transitions & Scale (9 Occurrences)
- `duration-350` (5 occurrences, `Register.jsx:225`, role registers): Replace with `duration-300`.
- `scale-102` (2 occurrences, `doctor/Profile.jsx:400`): Replace with `scale-[1.02]`.
- `hover:scale-103` (2 occurrences, `Home.jsx:148`): Replace with `hover:scale-[1.03]`.

#### Category D: Invalid Color Opacity Syntax (16 Occurrences)
- Bare slash numbers like `/6`, `/12`, `/8` generate zero CSS unless defined in Tailwind opacity scale.
- `border-white/6` (4 occurrences, `Sidebar.jsx:111, 147`): Replace with `border-white/[0.06]` or `border-white/5`.
- `via-white/12` (1 occurrence, `StatCard.jsx:84`): Replace with `via-white/[0.12]`.
- `bg-purple-500/12` (4 occurrences, `patient/History.jsx:59`): Replace with `bg-purple-500/[0.12]` or `bg-purple-500/10`.
- Others: `bg-indigo-500/12` (1), `bg-indigo-500/8` (1), `bg-amber-500/8` (1), `bg-blue-500/12` (1), `bg-teal-500/12` (1), `bg-red-500/12` (1).

#### Category E: Missing Custom Utilities & Typo Classes (18 Occurrences)
- `text-gradient-blue` (3 occurrences, `AnalyticsDashboard.jsx:112, 126, 140`): Add utility rule in `index.css`.
- `text-gradient-rose` (3 occurrences, `patient/Dashboard.jsx:92, 106, 120`): Add utility rule in `index.css`.
- `text-gradient-purple` (1) / `text-gradient-amber` (1): Add utility rules in `index.css`.
- `glass-btn` (2 occurrences, `LabReportDownloadButton.jsx:20`): Typo for `glass-button` (defined in `index.css:186`).
- `animate-in` (3), `fade-in` (3), `slide-in-from-bottom-2` (2) (`SessionMonitor.jsx:168, 204, 240`): Missing `tailwindcss-animate` plugin. Replace with MediSync's defined `animate-fade-in` and `animate-fade-in-up`.
- `warnings-slot` (1 occurrence, `DrugSearchInput.jsx:350`): Non-styling test class.

#### Category F: Dynamic Template String Concatenations (5 Occurrences)
- In `client/src/pages/doctor/Dashboard.jsx:27` (`bg-${color}-500/10`) and `client/src/pages/hospital/Dashboard.jsx:383` (`bg-${stat.color}-500/5`). Dynamic template strings are invisible to the Tailwind scanner. Replace with static lookup dictionaries (`COLOR_MAP[color]`).

---

### Item S1: Patient NIC in JWT `sub` Claim

1. **Bug Presence on Current Commit**: **YES**.
   - Evidence: `server/src/controllers/patientController.js:85`, `server/src/controllers/authController.js:454, 457, 686, 689`.
2. **Exact Root Cause**:
   - In `patientController.js:85` (patient registration):
     ```javascript
     const accessToken = jwt.sign({ id: patient._id, role: 'patient', sub: patient.nic }, process.env.JWT_SECRET, { expiresIn: '15m' });
     ```
   - In `authController.js:454, 457` (login) and lines 686, 689 (verifyOTP):
     ```javascript
     const subId = user.doctorId || user.nic || user.regNo || user._id;
     const tokenPayload = { id: user._id, role: actualRole, sub: subId };
     if (modelName === 'Patient' && user.nic) {
       tokenPayload.nic = user.nic;
     }
     ```
   - Raw NIC string is encoded in the base64url unencrypted token payload under `sub` and `nic`. Anyone holding or inspecting the JWT token can directly extract the citizen's National Identity Card number.
3. **Overlap with Pushed Commits**: **OPEN**.
   - None of the 5 pushed commits touched `patientController.js:85` or JWT claims.
4. **Files That Would Change**:
   - `server/src/controllers/patientController.js`
   - `server/src/controllers/authController.js`
   - *Protected check*: Neither file is in `docs/release/PROTECTED_HASHES.json`. Both are **UNPROTECTED**.
5. **Consumer Audit Across Entire Codebase & Impact Analysis**:
   - **Consumer 1 (`server/src/controllers/patientController.js:143-150` — `resolveAuthenticatedPatientNic`)**:
     ```javascript
     const resolveAuthenticatedPatientNic = async (reqUser) => {
       if (!reqUser) return null;
       if (reqUser.nic) return String(reqUser.nic).trim().toUpperCase();
       if (reqUser.id) {
         const doc = await Patient.findById(reqUser.id).select('nic');
         if (doc?.nic) return String(doc.nic).trim().toUpperCase();
       }
       if (reqUser.sub && String(reqUser.sub) !== String(reqUser.id)) {
         return String(reqUser.sub).trim().toUpperCase();
       }
       return null;
     };
     ```
     *Impact*: Lines 143-146 safely look up NIC from the database via `Patient.findById(reqUser.id).select('nic')`. Lines 147-149 were legacy fallback when `sub` was the NIC. When `sub` becomes `String(patient._id)`, `reqUser.sub !== reqUser.id` evaluates to `false`, safely bypassing the fallback and correctly resolving NIC from MongoDB.
   - **Consumer 2 (`server/src/middleware/auth.js:93`)**:
     `actorId: decoded.id || decoded.sub || 'unknown'`
     *Impact*: Pinned file (`PROTECTED_HASHES.json`). Evaluates `decoded.id` first (`patient._id`). Changing `sub` to `String(patient._id)` preserves exact consistency with `decoded.id`.
   - **Consumer 3 (`server/src/controllers/authController.js:1923`)**:
     `const tokenPayload = { id: decoded.id, role: decoded.role, sub: decoded.sub };`
     *Impact*: Token refresh handler simply copies `decoded.sub`. Continues working seamlessly.
   - **Consumer 4 (`client/src/`)**:
     *Impact*: Exhaustive search in `client/src` found zero consumers reading `decoded.sub` or `token.sub`. `client/src/hooks/usePatientConsent.js:7` only inspects `.exp` from `x-patient-access` tokens. Zero frontend code is broken.
6. **Smallest Proposed Fix Description**:
   - In `patientController.js:85`:
     ```javascript
     // Change:
     const accessToken = jwt.sign({ id: patient._id, role: 'patient', sub: patient.nic }, process.env.JWT_SECRET, { expiresIn: '15m' });
     // To:
     const accessToken = jwt.sign({ id: patient._id, role: 'patient', sub: String(patient._id) }, process.env.JWT_SECRET, { expiresIn: '15m' });
     ```
   - In `authController.js:454, 686`:
     Change `subId` derivation so Patient role uses `String(user._id)` rather than `user.nic`, and remove `tokenPayload.nic = user.nic` (lines 458-460, 690-692).
7. **Proposed Offline Test**:
   - In `server/tests/patientJwtSanitization.test.js`:
     - Register a test patient via `patientController.registerPatient`.
     - Decode the returned `accessToken`.
     - Assert `decoded.sub === String(patient._id)`.
     - Assert `decoded.sub` does not match NIC regex `/^([0-9]{9}[VX]|[0-9]{12})$/`.
     - Assert `decoded.nic` is `undefined`.
8. **Risk & Rollback Analysis**:
   - Very low risk. Fully backwards-compatible with `auth.js` and `resolveAuthenticatedPatientNic`.
   - Rollback: `git checkout server/src/controllers/patientController.js server/src/controllers/authController.js`.

---

## 4. Operational Boundaries & Stop Protocol

- **Zero Product Code Modifications**: No product files under `client/src/`, `server/src/`, or `ml-engine/` were modified during Phase 0 or Phase 1.
- **Documentation Only**: All updates were confined exclusively to `docs/new/`.
- **Phase 2 Status**: Implementation is strictly **HALTED**. Execution will resume only upon receipt of explicit operator approval naming approved items.
