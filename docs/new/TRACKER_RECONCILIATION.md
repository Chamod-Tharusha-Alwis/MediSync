# MediSync — Tracker Reconciliation

Reconciled locally on 5 November 2026. Documentation only; no application changes.

## Authority and scope

The addendum filename is **MEDISYNC_MASTER_PROMPT_V3_ADDENDUM_ANTIGRAVITY.md** in
`docs/new/`. Do not rename it to `MASTER_PROMPT_V3_ADDENDUM.md`.

Current operator instructions override imported planning documents: writes only
inside `docs/new/`; no staging, commits, pushes, branch changes, live logins,
emails or Render/Atlas/Redis calls. An authorized read-only `git fetch origin`
completed. HEAD and fetched origin/main both were
`d611b41e47753a407bd6252960383631fbc7f52a`. The tracked tree and index were clean.
Evidence: `CODEX_RECONCILIATION_LOCAL_CHECKS_20261105.json:3-10`; commit `d611b41`.

`00_START_HERE_NEXT_PROMPT_TASKS_AND_PROGRESS.md` is the planning index in this
folder. Older trackers are **historical, preserved, and NOT archived or modified**
by this task. Earlier instructions to move them, add pointers outside this
folder, create a branch, rebase or push are inactive. Source/test evidence takes
precedence over planning status labels.

## Corrected current-source status

| Old items | Evidence and status | Remaining boundary |
| --- | --- | --- |
| W1 / Q4 — Doctor AI resilience | Verifier correction exists in commit `d6c8040`. | Full current clinical/live acceptance NOT VERIFIED. |
| W2 / Q5 / Q3 — Drug and consultation safety | Commit `f566eea` fences stale interaction replies and validates medication-safety replies, with tests. | Catalog counts are not clinical validation. Live wizard geometry, consent and save NOT VERIFIED here. Soap-filter proposal not claimed implemented. |
| W3 / Q6 — C7 | `4d02303` adds shell recovery/loading and five login/OTP submission locks; `3692403` localizes/sanitizes history recovery and enlarges language targets. These are committed. | Other forms, full authenticated accessibility and Lighthouse NOT VERIFIED. |
| W4 / Q7 — Trilingual parity | `192e1d4` registers twelve missing keys; `3692403` adds three history keys. Recorded current-source result: 754 keys per language; `docs/temp/CODEX_PHASE2_OFFLINE_STATUS_20261105T142334Z.md:17`. | Native-language quality/all-page layout NOT VERIFIED. Source positions are not translation percentages. |
| W5 / Q8 — UI polish | Language targets/recovery are in `3692403`; medication warning races fixed in `f566eea`. | U22/U23 and broader polish remain proposals, NOT VERIFIED. |
| W6 / Q9 — Security | `fdbd40f` validates login input before lookup. Separate 5-failures/15-minutes candidate remains inactive; review committed in `d611b41`, `docs/temp/CODEX_PASSWORD_LOCKOUT_REVIEW_HANDOFF_20261105T142334Z.md`. | No activation, distributed quota qualification or API-wide validation claim. |
| W7 / Q10 — Five-role QA | Historical session checks are not fourteen clinical groups; `docs/temp/MEDISYNC_FIVE_ROLE_REAL_E2E_ACCEPTANCE.md:126-141`. | Historical real backend acceptance 2/14; no new live result. |
| Q11 — OTP harness removal | Deferred item in `docs/agent-work/MASTER_TRACKER.md:21`. This is not W8's title. | No cleanup authorized or performed. |
| Q1 / Q2 — Public presentation/activity | `05824ae`, `7e0d9c0`; `client/src/pages/public/PublicHealth.jsx:42` requests consultation activity; `:81` renders surveillance figures unavailable. | Current live figures/deployments/provider counters NOT VERIFIED here. Synthetic visits must not become confirmed cases. |
| W8 / Q12 — Cleanup/handover | Original W8 is Cleanup & Handover (`docs/WORK_TRACKING.md:119`); Q12 is cleanup/release evidence (`docs/agent-work/MASTER_TRACKER.md:22`). | No deletion, evidence retirement or implementation approval implied. |

## Regression and verification accounting

Saved full regression: **3,211 PASS / 0 FAIL**, from
`scratch/clinical-offline-J8bTZx/summary.json:73-78`. Its raw source-file membership
and hashes match the current snapshot. This is a verified **historical receipt
and source match**, not a newly executed regression. Saved CI/deployment receipt:
`docs/temp/CODEX_PHASE2_FINAL_CI_DEPLOY_CONFIRMATION_20261105T143407Z.json`.
Remote CI/deployment states were not fetched again and are NOT VERIFIED now.

New local checks: **15/15 protected pins**, **7/7 synthetic NIC-format checks**,
empty index and matching source snapshot. Evidence:
`CODEX_RECONCILIATION_LOCAL_CHECKS_20261105.json`. Pin validation uses the existing
`scripts/run_offline_tests.js:19-40` against
`docs/release/PROTECTED_HASHES.json`. No ledger change.

Full verification command remains `node scripts/run_offline_tests.js`. It was
**NOT RUN** because it unconditionally creates `scratch/clinical-offline-*` at
`scripts/run_offline_tests.js:50-52`, violating today's write boundary. No new
runner or output-redirection workaround was invented. A rerun needs permission
for those runtime writes; it cannot be reported as a new PASS now.

## Clinical groups: preserve meaning and history

Canonical definitions: `docs/temp/MEDISYNC_FIVE_ROLE_REAL_E2E_ACCEPTANCE.md:60-73`.
Imported reconciliation incorrectly called group 9 restocking and group 10
inventory analytics. Actual definitions and proposed changes:

| Group | Existing definition | Proposed no-inventory reconciliation — not implemented |
| --- | --- | --- |
| 8 | Prescription dispensing (`:67`) | Keep consent, one dispensing/receipt, replay/concurrency and ownership; propose removing only stock assertions. |
| 9 | OTC retry safety (`:68`) | Keep operation identity, duplicate/conflicting requests and lost-response recovery. Do not mark N/A because inventory is out of scope. |
| 10 | Pharmacy authorization (`:69`) | Keep institution isolation, role restrictions and history/receipt ownership; propose replacing inventory/restock paths with approved current flows. |

No canonical definition/result outside this folder was rewritten. No D10 approval
is fabricated. Operator review is needed for replacement criteria and the online
plan. Groups 3–14 remain unaccepted in the canonical history; acceptance stays 2/14.

## Outbreak proposal and S1–S8

**N=5 confirmed episodes per disease × district in the detection window plus two
consecutive complete days above the daily threshold** is **proposed, needs
operator approval**. Paper cases, including the rolling-window trap that could
otherwise alert on S8, are in `OUTBREAK_AND_PUBLIC_HEALTH_DESIGN.md`. No scenario
was seeded/detected/live-tested. Runtime outcomes and clinical suitability are
NOT VERIFIED.

## Unverified imported claims

All uncited implementation, security, catalog, runtime and live claims in the
imported Stage A documents remain **NOT VERIFIED** unless reconciled above.
Wireframes, seed volumes, thresholds, forecasts and removal lists are proposals,
not implemented behavior or authorization. Forecast fallbacks, provenance
shortcuts and synthetic public reporting are not approved.

The last operator report was 8 combined emails of a 25-email limit; not a fresh
counter reading. No emails sent here. Clinical production remains NO-GO.

---

## Stage B1 Phase 0 & Phase 1 Reconciliation (November 2026)

Branch `stage-b1/fixes` verified at commit `08fb047`. Tracked tree clean, `scratch/` git-ignored, 15/15 release candidate protected pins match `docs/release/PROTECTED_HASHES.json`. Phase 1 static investigation completed in `docs/new/B1_INVESTIGATION_REPORT.md`.

### Scoped Items Reconciliation (U1, U3, U5, U6, U7, U8, U19, U22, U23, S1)

| Item | Scope | Code Evidence & Root Cause | Overlap with Pushed Commits | Protected File Impact | Status & Verification Result |
|:---|:---|:---|:---|:---|:---|
| **U1** | Medication search dropdown overlaps table | `DrugSearchInput.jsx:382-390`: In-DOM rendering with `absolute top-full` within `.glass-card` (`NewConsultation.jsx:1338-1470`) without portal clipping over table | OPEN (`f566eea` added safety warnings, not portal) | UNPROTECTED (0/15) | **COMPLETED**: Rendered suggestions via `createPortal` to `document.body` with `position: fixed`, `zIndex: 9999`, responsive scroll/resize listeners, outside click and Escape dismissal, and full ARIA listbox semantics (`aria-expanded`, `aria-controls`, `role="listbox"`, `role="option"`, `aria-selected`, `aria-activedescendant`). New test `client/src/__master_offline__/drug-search-dropdown-u1.test.jsx` (4/4 PASS). |
| **U3** | Password strength bar shows no fill | `PasswordStrengthMeter.jsx:45-56`: `isFilled = index < score`. Passwords < 12 chars receive `score = 0` (`passwordPolicy.js:55-82`), leaving all segments inactive | FIXED in Batch 1 | UNPROTECTED (0/15) | **COMPLETED**: Modified `PasswordStrengthMeter.jsx` (`activeSegments = Math.max(score, password ? 1 : 0)`), added progressbar ARIA attributes, localized strength keys in `en.js`, `si.js`, `ta.js`, and cleaned unparsed classes in registration pages. New test `client/src/__master_offline__/password-strength-fill.test.jsx` (8/8 PASS). Committed in `2a73eb7`. |
| **U5** | Hospital lab button shows raw `{t(...)}` text | `LabManagement.jsx:187`: String literal `'{t("common.verify", "Send Verification OTP")}'` renders verbatim | FIXED in Batch 1 | UNPROTECTED (0/15) | **COMPLETED**: Evaluated `t('consent.requestingConsentOtp', ...)` and `t('common.verify', ...)` in `LabManagement.jsx:187`. Added `requestingConsentOtp` to `en.js`, `si.js`, `ta.js`. New test `client/src/__master_offline__/lab-button-i18n.test.jsx` (6/6 PASS). Committed in `2a73eb7`. |
| **U6** | Five HTTP 429 from one action | `LabManagement.jsx:180-189, 211`: Missing click concurrency lock and cooldown timer on button; `<OtpInput>` missing `loading`. Hits Redis throttles (`labController.js:174-184`, `redis.js:370-380`). Mount/re-render trigger disproven (`RegisterNewTest` has 0 `useEffect` hooks). | OPEN (`4d02303` locked login pages, not lab) | UNPROTECTED (0/15) | **COMPLETED**: Integrated `useSubmissionLock` hook in `LabManagement.jsx:45-132`, introduced `cooldownSeconds` state (default 60s) with unmount interval cleanup, handled HTTP 429 server `retryAfterSeconds`, bound disabled/countdown text to submit/resend buttons, passed `loading` and `cooldownSeconds` to `<OtpInput>`, and registered trilingual keys in `en.js`, `si.js`, `ta.js` (770 keys each). New test `client/src/__master_offline__/hospital-lab-otp-u6.test.jsx` (6/6 PASS). |
| **U7** | Pharmacy 403 on pending NIC lookup | `Dashboard.jsx:87-90`: Client dispatches unauthenticated GET probe before opening modal. `pharmacyRoutes.js:32` + `patientConsent.js:5-8` return 403. Modal OTP verification then dispatches authenticated request with `x-patient-access`, succeeding with 200. (Hypothesis C + probe-first flow confirmed). | OPEN (Untouched in pushed commits) | UNPROTECTED (0/15) | **BLOCKED**: Root cause verified in `Dashboard.jsx:87-90`. Fix tested in `pharmacy-consent-u7.test.jsx` (3/3 PASS on patch) eliminating speculative GET probe. Safely reverted to baseline per Hard Boundary Rule 198 and Section 5(f) due to mutual contract conflict with legacy test `pharmacy-consent-flow.test.jsx:32-43` which explicitly asserts unauthenticated probe GET. Awaiting operator authorization. |
| **U8** | Notification dropdown clipped at left edge | `NotificationBell.jsx:216`: Fixed width `w-80` (320px) with `absolute right-0` inside 280px drawer (`Sidebar.jsx:169, 256`) clips off left screen edge | FIXED in Batch 1 | UNPROTECTED (0/15) | **COMPLETED**: Updated `NotificationBell.jsx:216` to responsive layout `fixed inset-x-2 top-16 sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:w-80`. Keeps dropdown fully within bounds at 320/375px viewports (left >= 0, right <= viewportWidth). New test `client/src/__master_offline__/notification-bell-responsive.test.jsx` (4/4 PASS). Committed in `2a73eb7`. |
| **U19** | District names display lower-case / underscored | UI components (`GeographicMap.jsx:92, 143`, `OutbreakMonitor.jsx:338, 410`, `Dashboard.jsx:79`, `pharmacy/Dashboard.jsx:999, 1037`, `Broadcast.jsx:220, 296`) interpolate raw database strings directly. In `GeographicMap.jsx:104`, lowercase keys fail coordinate lookup. | FIXED in Batch 1 | UNPROTECTED (0/15) | **COMPLETED**: Exported `formatDistrictName(name)` in `client/src/utils/districtAdjacency.js` and wrapped UI rendering points; resolved coordinate dictionary lookup in `GeographicMap.jsx:104`; preserved backend/query keys. New test `client/src/__master_offline__/district-display-format.test.jsx` (6/6 PASS). Committed in `2a73eb7`. |
| **U22** | Tiny text (< 12px readable / < 11px badge) | 280 occurrences across 53 files (36 instances <= 9px; 208 instances at 10px; 36 instances at 11px) + `index.css:246`. Sub-10px text breaks WCAG 1.4.4 and renders Sinhala/Tamil glyphs unreadable. | OPEN (Untouched in pushed commits) | UNPROTECTED (0/15; `SymptomTagInput.jsx` clean) | **COMPLETED**: Upgraded 280 occurrences across 54 files (53 component/page files + `client/src/index.css`) to approved minimums (11px uppercase badge, 12px readable text). `SymptomTagInput.jsx` audited and confirmed 0 occurrences of sub-12px text (100% untouched). New test `client/src/__master_offline__/min-font-size.test.js` (4/4 PASS). |
| **U23** | Undefined Tailwind classes | 216 occurrences across 37 files of unconfigured shades (`slate-550`, `bg-slate-850`), fractional spacing (`w-4.5`, `h-4.5`), invalid opacity (`/6`, `/12`), missing utilities (`text-gradient-blue`), and dynamic templates (`bg-${color}-500/10`). PostCSS confirmed 0 CSS rules generated. | FIXED in Batch 1 | UNPROTECTED (0/15; `SymptomTagInput.jsx` clean) | **COMPLETED**: Added spacing tokens (`4.5`, `5.5`, `6.5`, `18`) in `tailwind.config.js`, added gradient text rules in `index.css`, cleaned up invalid color shades/scale/opacity, and replaced dynamic templates with static maps. New test `client/src/__master_offline__/tailwind-undefined-classes.test.js` (12/12 PASS). Committed in `2a73eb7`. |
| **S1** | Patient NIC in JWT `sub` claim | `patientController.js:85` signs `sub: patient.nic`. `authController.js:454, 686` signs `sub: user.nic` and `nic: user.nic`. Exposes unencrypted National Identity Card. Full consumer audit confirms safe migration to `String(patient._id)`. | OPEN (Untouched in pushed commits) | UNPROTECTED (0/15; neither in protected ledger) | **COMPLETED**: Migrated patient JWT `sub` to `String(patient._id)` in `patientController.js:85` and `authController.js:454, 686`. Removed `tokenPayload.nic` claim across login and OTP verification. Removed `decoded.nic` propagation in `authController.js:1924` (token refresh). Preserved DB NIC resolution in `patientController.js:140-151`. Protected `middleware/auth.js:93` preserved intact. New test `server/tests/jwt-patient-nic-removal-s1.test.js` (6/6 PASS). |

### Phase 2 Batch 2 Status & Protocol Confirmation
- **Batch 2 (U6, U7, U1, S1, U22) Completed**:
  - 4 items DONE_OFFLINE: U6, U1, S1, U22. 20 new unit tests added across 4 test suites, 100% passing. Client test suite elevated to 638 tests / 71 suites. Backend test suite passes 2,474 / 107 suites (+6 standalone S1 tests). Email-pdf suite passes 31 / 2 suites.
  - 1 item BLOCKED: U7 safely reverted to baseline without regressions to comply with Hard Boundary Rule 198 and Section 5(f) due to collision with legacy release candidate test `pharmacy-consent-flow.test.jsx:32-43`.
- **Protected File Status**: 15/15 release candidate protected file hashes confirmed matching `docs/release/PROTECTED_HASHES.json`.
- **Sandbox Git Status**: `git commit` within sandbox was blocked by `.git/index.lock: Permission denied`. Changes remain clean in working tree with ready-to-paste PowerShell commit blocks documented in `docs/new/B1_BATCH2_REPORT.md`.

### Phase 2 Batch 3 Status & Protocol Confirmation (6 November 2026)
- **Batch 3 (`U7`, `S2`, `S5`, `S11`, `U2 Investigation`, `Lockout Patch Dry-Run`) Completed**:
  - **S2 (`DONE_OFFLINE`)**: Added dedicated `registerLimiter` (`windowMs: 15 * 60 * 1000, max: 10` in production, isolated from `loginLimiter`) to `POST /register` in `server/src/routes/hospitalRoutes.js:14-22`, `server/src/routes/patientRoutes.js:15-24`, and `server/src/routes/pharmacyRoutes.js:14-23`. Verified by `server/tests/registrationRateLimitS2.test.js` (6/6 PASS) and `server/tests/loginRateLimitOffline.test.js` (1/1 PASS).
  - **S5 (`DONE_OFFLINE`)**: Attached `publicLimiter` (`60 req / 60s`) to `/doctors`, `/hospitals`, `/pharmacies`, and `/diseases/search` in `server/src/routes/publicRoutes.js:14-19`, and added IP-based `publicReviewLimiter` (`60 req / 60s`) to unauthenticated `GET /:targetId` in `server/src/routes/reviewRoutes.js:8-15`. Verified by `server/tests/publicListingRateLimitS5.test.js` (7/7 PASS).
  - **S11 (`DONE_OFFLINE`)**: Restricted `Permissions-Policy` header in `server/src/app.js:237` from `ch-ua-model=*, ch-ua-platform=*, ch-ua-platform-version=*` to `ch-ua-model=(self), ch-ua-platform=(self), ch-ua-platform-version=(self)`. Verified by `server/tests/permissionsPolicyHeaderS11.test.js` (1/1 PASS).
  - **U2 (`INVESTIGATION_COMPLETE`)**: Read-only investigation report written to `docs/new/B1_U2_INVESTIGATION.md` documenting 13 `"Soap"` items + 33 wash/bar/shampoo/kit items (46/3,000 non-prescribable) in `server/src/data/drugs_clean.json` and the self-comparison / duplicate safety alert root cause in `server/src/utils/ingredientResolver.js:425-455` and `client/src/pages/doctor/NewConsultation.jsx:1098-1147`. Zero code files touched.
  - **U7 (`BLOCKED` / Skipped)**: Inspection of `client/src/__master_offline__/pharmacy-consent-flow.test.jsx:1-143` (13 tests) proved that **11 of 13 tests** fail if `handleSearch` requires a consent token before `api.get` (2 probe-assertion tests at `lines 32-43`, `117-128` + 9 non-probe tests at `lines 45-115` that call `query('QA-ONE')` without ever granting consent). Skipped per explicit Batch 3 rule; 0 files modified.
  - **Lockout Patch Dry-Run (`VERIFIED CLEAN`)**: Read-only `git apply --check -v docs/temp/CODEX_PASSWORD_ATTEMPTS_INTEGRATED_REVIEW_20261105T141533Z.patch` exited `0` (all 9 target files apply cleanly).
  - **Offline Gate Receipt (`scratch/clinical-offline-UnvFzF`)**: `backend` 2,474 PASS (+14 new standalone Batch 3 unit tests in `server/tests/`), `client` 638 PASS, `email-pdf` 31 PASS, `15/15` protected pins match `docs/release/PROTECTED_HASHES.json`. `GATE INCOMPLETE in this environment: ml-scoring, ml-flask, root, ml-status-contract`. See `docs/new/B1_BATCH3_REPORT.md`.
