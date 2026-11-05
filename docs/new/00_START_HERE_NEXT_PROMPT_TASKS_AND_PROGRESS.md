# MediSync — Stage A Master Task List

**Planning index.** Reconciles the older trackers, which remain preserved and
unmodified, not archived with pointers. Read `TRACKER_RECONCILIATION.md` and
`MEDISYNC_MASTER_PROMPT_V3_ADDENDUM_ANTIGRAVITY.md` first.

Last reconciled: 5 November 2026, docs-only on existing main `d611b41`.
Fetched origin/main matches. Evidence:
`CODEX_RECONCILIATION_LOCAL_CHECKS_20261105.json:3-10`.

**Current boundary:** edits only inside `docs/new/`. No staging, commits, pushes,
branch changes, live logins, emails or Render/Atlas/Redis calls. Older execution
instructions below are proposals only, not authorization. Uncited imported
implementation/live claims are NOT VERIFIED.

The saved regression baseline is **3,211 PASS / 0 FAIL** (`scratch/clinical-offline-J8bTZx/summary.json:73-78`).
Post-Batch 1 offline run receipt: `scratch/clinical-offline-NxAZLP/summary.json`:
- Product suites passing: **3,167 PASS** (backend: 2,474 / 107 suites; client: 624 / 68 suites [elevated by 30 net new tests]; email-pdf: 31 / 2 suites).
- Protected pins: **15/15 match** `docs/release/PROTECTED_HASHES.json`.
- Gate profile notes: Python (`ml-scoring`, `ml-flask`, exit 103: Access is denied in sandbox) and loopback socket (`root`, exit 1: `connect EACCES 127.0.0.1:61726`) are blocked by Windows sandbox restrictions. No new clinical acceptance; historical 2/14 (`docs/temp/MEDISYNC_FIVE_ROLE_REAL_E2E_ACCEPTANCE.md:126-141`).

Completed source steps: translations `192e1d4`; C7 `4d02303`, `3692403`;
medication safety `f566eea`; malformed login requests `fdbd40f`. The separate
5-in-15 lockout candidate remains inactive (review handoff committed in `d611b41`).
U22/U23, other forms, native-language quality, Lighthouse and broader clinical
work remain NOT VERIFIED. Outbreak N=5 + two-day rule is **proposed, needs
operator approval**, with paper-only S1–S8 analysis in the outbreak design.

**Test-gate rule:** a run where Python (`ml-scoring`, `ml-flask`, exit 103) or loopback
(`root`, exit 1) cannot execute is NOT a pass. Report as "gate incomplete in this environment".

---

## Status legend

| Symbol | Meaning |
|--------|---------|
| TODO | Not started |
| IN_PROGRESS | Work under way |
| PUSHED | Committed and pushed to main |
| LIVE_VERIFIED | Live URL/API test passed, evidence filed |
| BLOCKED | Blocked — see BLOCKERS.md |
| DEFERRED | Intentionally deferred |
| PLAN_ONLY | Planning document written; awaiting APPROVE PLAN |
| INVESTIGATION_COMPLETE | Phase 1 investigation finished; awaiting operator approval |
| COMPLETED | Phase finished and verified |

---

## Stage B1 Execution Progress: Phase 0 & Phase 1 (COMPLETED)

### Phase 0: Repository Sync & Orientation — COMPLETED
- **Branch**: `stage-b1/fixes`
- **HEAD Commit**: `08fb0470c6eb77bb21edf2027ad0e1a6c4dec537`
- **Tracked Working Tree**: Clean (`git status --untracked-files=no` reported `nothing to commit`)
- **Remote Origin**: Last known `d611b41`, not re-fetched (network prohibition observed)
- **`scratch/` Git-Ignore Check**: Verified at `.gitignore:42:scratch/`
- **Protected Pins (`snapshot()`)**: **15/15 files match** `docs/release/PROTECTED_HASHES.json` exactly

### Phase 1: Codebase Investigation — COMPLETED
Comprehensive synthesis report generated at `docs/new/B1_INVESTIGATION_REPORT.md`. All 10 scoped items (U1, U3, U5, U6, U7, U8, U19, U22, U23, S1) audited across the codebase with exact file:line citations.

### Master Investigation Summary Table (10 Scoped Items)

| Item | Bug Present? | Exact Root Cause | Prospective Files to Modify | In Protected Hashes? | Implementation Ready? |
|:---|:---:|:---|:---|:---:|:---:|
| **U1**: Medication search dropdown overlaps table | **YES** | `client/src/components/DrugSearchInput.jsx:382-390`: In-DOM rendering using `absolute top-full` without `createPortal` inside `.glass-card` (`NewConsultation.jsx:1338-1470`), causing suggestion list to clip/overlap subsequent cards and tables. | `client/src/components/DrugSearchInput.jsx`, `client/src/__master_offline__/drug-search-stress.test.jsx` | **NO** (0/15) | **YES** (Portal design + bounding rect logic verified) |
| **U3**: Password strength bar shows no fill | **YES** | `PasswordStrengthMeter.jsx:45-56` evaluates `isFilled = index < score`. Passwords < 12 chars receive `score = 0` (`passwordPolicy.js:55-82`), leaving all 4 segments `bg-slate-800` (no fill). Also unconfigured classes (`text-slate-350`, `bg-slate-850`) in registration pages. | `client/src/components/common/PasswordStrengthMeter.jsx`, `client/src/pages/auth/Register.jsx`, `client/src/pages/*/Register.jsx`, `client/src/pages/doctor/ChangeOrgPassword.jsx` | **NO** (0/15) | **YES** (Level 0 segment-1 color fix + class normalization ready) |
| **U5**: Hospital lab button shows raw `{t(...)}` text | **YES** | `client/src/pages/hospital/LabManagement.jsx:187`: String literal syntax bug `'{t("common.verify", "Send Verification OTP")}'` passes verbatim text rather than evaluating JSX translation expression. | `client/src/pages/hospital/LabManagement.jsx` | **NO** (0/15) | **YES** (Surgical JSX expression replacement ready) |
| **U6**: Five HTTP 429 from one action | **YES** | `client/src/pages/hospital/LabManagement.jsx:180-189, 211`: Missing click concurrency lock (`isSubmittingRef`) and missing cooldown timer state on submit button; `<OtpInput>` missing `loading={loading}`. Rapid double-clicks/retries hit Redis throttle (`labController.js:174-184`, `redis.js:370-380`). (Mount/re-render trigger refuting proof documented). | `client/src/pages/hospital/LabManagement.jsx`, `client/src/components/ui/OtpInput.jsx` | **NO** (0/15) | **YES** (Submission lock + 60s countdown timer state ready) |
| **U7**: Pharmacy pending prescriptions returns 403 while list renders | **YES** | `client/src/pages/pharmacy/Dashboard.jsx:87-90`: Client dispatches unauthenticated `GET /api/pharmacy/prescriptions/pending/:nic` probe without `x-patient-access` header before opening consent modal. `server/src/routes/pharmacyRoutes.js:32` and `patientConsent.js:5-8` return 403 (logged in console). Modal OTP verification then fires second request with token, succeeding with 200. | `client/src/pages/pharmacy/Dashboard.jsx` | **NO** (0/15) | **YES** (Probe-elimination: check token upfront, open modal directly) |
| **U8**: Notification dropdown clipped at left edge at 320/375px | **YES** | `client/src/components/common/NotificationBell.jsx:216`: Fixed width `w-80` (320px) with `absolute right-0` inside narrow parents (e.g. 280px drawer in `Sidebar.jsx:169, 256`) forces left coordinates into negative screen space. | `client/src/components/common/NotificationBell.jsx` | **NO** (0/15) | **YES** (Responsive `fixed inset-x-2 sm:absolute sm:right-0 sm:w-80` ready) |
| **U19**: District names display lower-case / underscored | **YES** | Multiple UI pages (`GeographicMap.jsx:92, 143`, `OutbreakMonitor.jsx:338, 410`, `admin/Dashboard.jsx:79`, `pharmacy/Dashboard.jsx:999, 1037`, `Broadcast.jsx:220, 296`) interpolate raw DB/ML district strings directly. In `GeographicMap.jsx:104`, lowercase keys fail coordinate lookup and fall back to Nationwide. | `client/src/utils/districtAdjacency.js`, `client/src/components/common/GeographicMap.jsx`, `client/src/pages/admin/*`, `client/src/pages/pharmacy/*` | **NO** (0/15) | **YES** (Export `formatDistrictName` display-only helper; query params preserved) |
| **U22**: Tiny text (< 12px readable / < 11px badge) | **YES** | 280 occurrences across 53 files (`text-[9px]`: 35, `fontSize: 9`: 1, `text-[10px]`: 208, `text-[11px]`: 34, `fontSize: '11px'`: 2) + `index.css:246` (`.label-caps`). 36 instances <= 9px violate WCAG 1.4.4 and render Sinhala/Tamil glyphs unreadable. | 53 component files in `client/src/` (full catalog in `B1_INVESTIGATION_REPORT.md`) | **NO** (0/15; `SymptomTagInput.jsx` has 0 occurrences) | **YES** (Exhaustive line catalog & upgrade targets ready) |
| **U23**: Undefined Tailwind classes | **YES** | 216 occurrences across 37 files of invalid, non-standard, or ungenerated classes: unconfigured palette shades (`text-slate-550`, `bg-slate-850`), fractional spacing (`w-4.5`, `h-4.5`), invalid opacity syntax (`border-white/6`, `/12`), missing utilities (`text-gradient-blue`, `glass-btn`), and dynamic template strings (`bg-${color}-500/10`). PostCSS confirmed 0 CSS rules generated. | `client/tailwind.config.js`, `client/src/index.css`, and 37 UI components | **NO** (0/15; `SymptomTagInput.jsx` has 0 occurrences) | **YES** (Dual strategy: config extend for `w-4.5`/`slate-550` + surgical source cleanup) |
| **S1**: Patient NIC in JWT `sub` claim | **YES** | `server/src/controllers/patientController.js:85` signs `sub: patient.nic`. `authController.js:454, 686` signs `sub: subId` (resolves to `user.nic` for Patient) and `tokenPayload.nic = user.nic`. Exposes unencrypted National Identity Card in base64url token payload. | `server/src/controllers/patientController.js`, `server/src/controllers/authController.js` | **NO** (0/15) | **YES** (Audited safe migration to `String(patient._id)`; 0 client/server breakage) |

### ⚠️ Phase 2 Implementation Status: BATCH 1 COMPLETED (U5, U3, U19, U23, U8)
**BATCH 1 EXECUTION COMPLETE**: Pursuant to operator authorization, Phase 2 Batch 1 (U5, U3, U19, U23, U8) has been implemented, independently verified by peer review agents, and offline test verified.
- **Completed in Batch 1**: U5, U3, U19, U23, U8 (36 new unit tests added across 5 suites, 100% passing; client test suite elevated to 624 tests / 68 suites).
- **Strictly Untouched**: U1, U6, U7, U22, S1 remain untouched in `INVESTIGATION_COMPLETE` state awaiting future batch authorization. Zero modifications were made to these items.
- **Sandbox Git Status**: `git commit` inside sandbox was halted due to `.git/index.lock: Permission denied`. All changes are intact and clean in the working tree ready for host commit.
- **Protected Pins**: `snapshot()` confirms **15/15 protected files match** `docs/release/PROTECTED_HASHES.json`.

### Phase 2: Batch 1 Item Details & Verification
1. **U5 (Hospital Lab Button `{t(...)}` String Bug)**:
   - Fixed `client/src/pages/hospital/LabManagement.jsx:187` to evaluate `t('consent.requestingConsentOtp', ...)` and `t('common.verify', ...)`.
   - Added `requestingConsentOtp` to `client/src/i18n/translations/{en,si,ta}.js`.
   - Test `client/src/__master_offline__/lab-button-i18n.test.jsx`: 6/6 PASS.
   - Planned commit: `fix(hospital): evaluate lab verification button translation expression (U5)`
2. **U3 (Password Strength Bar Fill & Accessibility)**:
   - Modified `client/src/components/common/PasswordStrengthMeter.jsx` with `activeSegments = Math.max(score, (password || evalData) ? 1 : 0)`, ensuring non-empty passwords with score 0 show 1 segment in `bg-rose-600`.
   - Added WCAG progressbar attributes (`role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="4"`, `aria-valuetext`).
   - Added localized password strength dictionary keys across `en.js`, `si.js`, and `ta.js`.
   - Cleaned up non-standard Tailwind tokens in registration pages (`auth/Register.jsx`, `doctor/Register.jsx`, `hospital/Register.jsx`, `patient/Register.jsx`, `pharmacy/Register.jsx`, `doctor/ChangeOrgPassword.jsx`).
   - Test `client/src/__master_offline__/password-strength-fill.test.jsx`: 8/8 PASS.
   - Planned commit: `fix(auth): render visible password strength fill and accessible meter (U3)`
3. **U19 (District Names Display Formatting & Map Lookup)**:
   - Implemented `formatDistrictName(name)` in `client/src/utils/districtAdjacency.js` using `ALL_DISTRICTS` and `normalizeDistrictName`.
   - Wrapped UI interpolation points in `GeographicMap.jsx`, `OutbreakMonitor.jsx`, `admin/Dashboard.jsx`, `pharmacy/Dashboard.jsx`, and `Broadcast.jsx`.
   - Fixed coordinate dictionary lookup in `GeographicMap.jsx:104` via `districtCoordinates[formatDistrictName(districtName)]`, eliminating fallback to Nationwide for lowercase/snake_case alert keys.
   - Preserved all database storage and API query parameter strings intact.
   - Test `client/src/__master_offline__/district-display-format.test.jsx`: 6/6 PASS.
   - Planned commit: `fix(ui): format district names for display while preserving query keys (U19)`
4. **U23 (Undefined Tailwind Classes)**:
   - Extended `client/tailwind.config.js` theme spacing with `4.5`, `5.5`, `6.5`, `18` tokens.
   - Added `.text-gradient-{blue,rose,purple,amber}` utilities in `client/src/index.css`.
   - Surgically replaced undefined shades (`slate-550`, `slate-555`, `rose-455`, `emerald-450`, `bg-slate-850`) with standard palette tokens (`500`, `400`, `800`).
   - Corrected opacity syntax (`/[0.06]`, `/[0.12]`), non-standard scale (`scale-[1.02]`), animation classes (`animate-fade-in`), and typos (`glass-button`).
   - Converted dynamic template strings in `doctor/Dashboard.jsx` and `hospital/Dashboard.jsx` to static color maps.
   - Test `client/src/__master_offline__/tailwind-undefined-classes.test.js`: 12/12 PASS.
   - Planned commit: `fix(ui): eliminate undefined Tailwind classes and support standard icon tokens (U23)`
5. **U8 (Notification Dropdown Mobile Viewport Clipping)**:
   - Replaced fixed width right-anchored layout in `client/src/components/common/NotificationBell.jsx:216` with responsive classes: `fixed inset-x-2 top-16 sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:w-80`.
   - Strictly keeps dropdown within screen bounds at 320px and 375px viewports (left >= 0, right <= viewportWidth).
   - Test `client/src/__master_offline__/notification-bell-responsive.test.jsx`: 4/4 PASS.
   - Planned commit: `fix(ui): prevent notification dropdown clipping on mobile viewports (U8)`

---

## Phase 0 — Housekeeping (no approval required)

| ID | Item | Status | Commit | Deploy | Live evidence | Owner | Notes |
|----|------|--------|--------|--------|---------------|-------|-------|
| P0-A | C7 recovery/login-lock work | COMMITTED | `4d02303`, `3692403` | NOT REVERIFIED | NOT VERIFIED here | Codex | Broader C7 remains open; do not reimplement finished changes. |
| P0-B | Source comparison only | VERIFIED LOCALLY | `d611b41` | Not queried | Not queried | Codex | Fetched origin/main equals HEAD; no branch/rebase action. |
| P0-C | Full regression | HISTORICAL RECEIPT VERIFIED; NOT RERUN | `fdbd40f` runtime, docs `d611b41` | NOT REVERIFIED | Not applicable | Codex | 3,211 PASS source match; scratch-writing rerun outside current scope. |
| P0-D | Reconcile planning index | DOCS ONLY | No new commit | Not queried | Not queried | Codex | See local receipt and TRACKER_RECONCILIATION.md. |

---

## Stage A — Planning documents (write first, no product code)

Gate: operator types `APPROVE PLAN <file>` or `APPROVE PLAN ALL` before Stage B.

| ID | File | Status | Notes |
|----|------|--------|-------|
| A-01 | `00_START_HERE_NEXT_PROMPT_TASKS_AND_PROGRESS.md` (this file) | COMPLETED | Updated with Phase 0 & Phase 1 synthesis and halt status |
| A-02 | `TRACKER_RECONCILIATION.md` | COMPLETED | Reconciled for Stage B1 |
| A-03 | `PAGE_CHANGE_PROPOSALS.md` | PLAN_ONLY | U1–U21+U22–U25 wireframes |
| A-04 | `UX_ENGAGEMENT_REVIEW.md` | PLAN_ONLY | Per-role task analysis |
| A-05 | `OTP_WORKFLOW_AUDIT.md` | COMPLETED | Refreshed with verified code facts for U6, U7, and quota |
| A-06 | `PDF_EXPORT_DESIGN.md` | PLAN_ONLY | U4 — needs APPROVE PDF-DESIGN |
| A-07 | `SEED_DATA_PLAN.md` | PLAN_ONLY | V3 §7 — needs APPROVE SEED |
| A-08 | `OUTBREAK_AND_PUBLIC_HEALTH_DESIGN.md` | PLAN_ONLY | V3 §8 |
| A-09 | `ONLINE_TEST_PLAN.md` | PLAN_ONLY | V3 §9 |
| A-10 | `CLEANUP_AND_COMMENTING_PLAN.md` | PLAN_ONLY | V3 §10 |
| A-11 | `DEMO_DATA_REMOVAL_PLAN.md` | PLAN_ONLY | Needs APPROVE DELETE-DEMO |
| A-12 | `SECURITY_AUDIT_STATIC.md` | COMPLETED | Refreshed with verified citations & consumer audit for S1 |
| A-13 | `C5_COVERAGE.md` | PLAN_ONLY | U26 — reference counts |
| A-14 | `B1_INVESTIGATION_REPORT.md` | COMPLETED | Comprehensive Phase 1 investigation report synthesizing all 10 items |

---

## Stage B — Implement fixes (needs APPROVE PLAN)

### B1 — Bugs and polish (U1–U9, U18, U19, U22, U23)

| ID | Item | Status | Commit | Deploy | Evidence | Notes |
|----|------|--------|--------|--------|----------|-------|
| B1-U1 | Medication search dropdown — portal/stacking fix | INVESTIGATION_COMPLETE | | | `B1_INVESTIGATION_REPORT.md` §3 | Untouched in Batch 1; awaiting authorization |
| B1-U2 | Interaction/duplicate safety alert dedup + soap filter | TODO | | | | U2 |
| B1-U3 | Password strength bar fill | COMPLETED | Pending Host Commit | Offline verified | `password-strength-fill.test.jsx` (8/8 PASS) | Score 0 fill + progressbar ARIA + translations + registration cleanup |
| B1-U5 | Hospital lab button raw `{t(...)}` text | COMPLETED | Pending Host Commit | Offline verified | `lab-button-i18n.test.jsx` (6/6 PASS) | Evaluated JSX `t()` helper + trilingual loading states |
| B1-U6 | OTP duplicate-request guard + 429 handling | INVESTIGATION_COMPLETE | | | `B1_INVESTIGATION_REPORT.md` §3 | Untouched in Batch 1; awaiting authorization |
| B1-U7 | Pharmacy 403 on pending NIC lookup — root cause + fix | INVESTIGATION_COMPLETE | | | `B1_INVESTIGATION_REPORT.md` §3 | Untouched in Batch 1; awaiting authorization |
| B1-U8 | Notification dropdown left-edge clip | COMPLETED | Pending Host Commit | Offline verified | `notification-bell-responsive.test.jsx` (4/4 PASS) | Responsive fixed inset-x-2 positioning on mobile (320/375px) |
| B1-U18 | App-owned console warnings (not extension) | TODO | | | | U18 |
| B1-U19 | Capitalize district names everywhere | COMPLETED | Pending Host Commit | Offline verified | `district-display-format.test.jsx` (6/6 PASS) | `formatDistrictName()` helper + coordinate resolution + query preservation |
| B1-U22 | Tiny text audit and fix (`text-[9px]` → ≥12 px) | INVESTIGATION_COMPLETE | | | `B1_INVESTIGATION_REPORT.md` §3 | Untouched in Batch 1; awaiting authorization |
| B1-U23 | Undefined Tailwind classes (slate-550, etc.) | COMPLETED | Pending Host Commit | Offline verified | `tailwind-undefined-classes.test.js` (12/12 PASS) | Theme config extension + gradient CSS + component cleanup |

### B2 — Removals and redesigns (U9–U16)

| ID | Item | Status | Commit | Deploy | Evidence | Notes |
|----|------|--------|--------|--------|----------|-------|
| B2-U9 | Pharmacy: group prescriptions by consultation | TODO | | | | U9 |
| B2-U10 | Remove medication inventory entirely | TODO | | | | U10 — list all files in plan first |
| B2-U11 | Pharmacy restock → district demand + most-sold page | TODO | | | | U11 |
| B2-U12 | Pharmacy analytics — time-range sold medications | TODO | | | | U12 |
| B2-U13 | Admin users: remove toggle, add role filter | TODO | | | | U13 |
| B2-U14 | Admin identity page → user detail panel | TODO | | | | U14 |
| B2-U15 | Remove admin ML Alerts page | TODO | | | | U15 |
| B2-U16 | Admin overview: real health checks, explain stats | TODO | | | | U16 |
| B2-U20 | Rewrite outbreak notification text | TODO | | | | U20 |
| B2-U21 | Public page: propose Sri Lanka day buckets | TODO | | | | U21 |

### B3 — OTP and test harness removal (U17)

| ID | Item | Status | Notes |
|----|------|--------|-------|
| B3-U17 | Remove all demo/synthetic/test wording from UI; remove test OTP harness after Stage E | TODO | Only after Stage E passes |

### B4 — PDF export (U4)

| ID | Item | Status | Notes |
|----|------|--------|-------|
| B4-U4 | Secure PDF download for consultations and lab reports | TODO | Needs APPROVE PDF-DESIGN |

---

## Stage C — Seed fake data

| ID | Item | Status | Notes |
|----|------|--------|-------|
| C-DRY | Seed dry-run: print counts per collection only | TODO | Needs APPROVE SEED |
| C-WRITE | Seed write (--confirm) | TODO | After operator approves dry-run summary |

---

## Stage D — Outbreak + public health on seeded data

| ID | Item | Status | Notes |
|----|------|--------|-------|
| D1 | Public Health v2 page (summary cards, map, ranking, forecast, Sri Lanka time) | TODO | |
| D2 | Outbreak detection (z-score/CUSUM, district×disease, alerts in Mongo) | TODO | |
| D3 | 14-day forecast — stateless ML endpoint + backend fallback | TODO | |
| D4 | Role views: admin map, hospital/doctor banner, pharmacy demand | TODO | |
| D5 | Remove demo labels (U17, U20) on seeded views | TODO | Needs APPROVE DELETE-DEMO for old batch |
| D6 | Delete old demo batch DEMO_OUTBREAK_2026_V1 | TODO | Needs APPROVE DELETE-DEMO |

---

## Stage E — Future online test (NO current execution approval)

| ID | Item | Status | Notes |
|----|------|--------|-------|
| E1 | Full role matrix (admin, patient, doctor, hospital, pharmacy, public) | TODO | EN/SI/TA × 320/375/1440 |
| E2 | Oracle: S1–S8 planted scenario verification | TODO | |
| E3 | FINAL_ACCEPTANCE_MATRIX.md — no blank cells | TODO | |

---

## Stage F — Cleanup and commenting

| ID | Item | Status | Notes |
|----|------|--------|-------|
| F1 | Remove dead code, unused components, old demo scripts | TODO | Per CLEANUP_AND_COMMENTING_PLAN.md |
| F2 | Add why-comments, JSDoc, README per folder, ARCHITECTURE.md | TODO | |
| F3 | .env.example with no real values | TODO | |

---

## Stage G — Final acceptance

| ID | Item | Status | Notes |
|----|------|--------|-------|
| G1 | HANDOVER_REPORT.md | TODO | |
| G2 | All cells in FINAL_ACCEPTANCE_MATRIX.md green | TODO | |

---

## Already done — do not redo (re-verify only in Stage E)

| Item | Commit | Evidence |
|------|--------|---------|
| Public banner removal | `800d87a` | TEST_LOG.md |
| Public consultation-activity page (Q2) | `7e0d9c0` | docs/temp/ |
| Sri Lanka time in emails and UI (P1) | `a4952b5` | docs/temp/CODEX_P1_* |
| Identifier masking in login alerts | `4383d63`, `37c4bf7` | docs/temp/ |
| Admin socket cleanup (0 blocked requests) | `dce6bbe` | docs/temp/ |
| Admin ML status contract + diagnostics | `40979ff`, `e163f40` | docs/temp/ |
| Public 404 / recovery page (C7 partial) | `b911713` | TEST_LOG.md |
| 12 missing translation keys | `192e1d4` | docs/temp/ |

---

## Open blockers

See `docs/agent-work/BLOCKERS.md`. Key items as of this writing:

1. **Live access** — forbidden in this task; current remote states NOT VERIFIED. Historical Antigravity network constraints are not a current environment diagnosis.
2. **Git** — no branch, staging, commit or push authorized. The earlier branch-creation request is withdrawn; read-only fetch completed.
3. **C7** — finished recovery/login-lock changes are committed (`4d02303`, `3692403`); other forms/accessibility remain open. No pending C7 source changes were found.
4. **Email accounting** — last operator-confirmed combined count 8/25, not a fresh dashboard reading. No sends or logins authorized now. The older 60-email proposal is inactive.
5. **New gate not run** — the full existing runner writes scratch outside the permitted folder. The recorded 3,211-check source-equivalent result is historical, not a rerun. Older partial counts do not replace it.

---

## Next actions (review only)

1. Review the reconciled statuses and exact addendum filename.
2. Review the proposed N=5 floor, daily persistence interpretation and hypothetical
   S1–S8 outcomes. No clinical/runtime efficacy is claimed.
3. Resolve case-definition, detection-window, baseline and replacement group 8–10
   criteria before approving implementation. Do not mark OTC retry safety N/A.
4. Any future full gate needs permission for the existing runner's scratch writes.
   Application changes, commits/pushes and live work remain outside current scope.

Other inherited TODO rows and historical blocker statements above are not newly
verified facts; apply the current reconciliation first. No old tracker was moved.
