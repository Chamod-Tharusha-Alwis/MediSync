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

The saved regression is **3,211 PASS / 0 FAIL**, source-equivalent to this checkout
(`scratch/clinical-offline-J8bTZx/summary.json:73-78`; new local receipt above).
No new full regression ran: the existing runner writes outside this folder
(`scripts/run_offline_tests.js:50-52`). New checks: 15/15 protected pins and seven
synthetic NIC-format checks. No new clinical acceptance; historical 2/14
(`docs/temp/MEDISYNC_FIVE_ROLE_REAL_E2E_ACCEPTANCE.md:126-141`).

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
| A-01 | `00_START_HERE_NEXT_PROMPT_TASKS_AND_PROGRESS.md` (this file) | PLAN_ONLY | Written in no-network mode |
| A-02 | `TRACKER_RECONCILIATION.md` | PLAN_ONLY | Maps W*/Q* → V3 items |
| A-03 | `PAGE_CHANGE_PROPOSALS.md` | PLAN_ONLY | U1–U21+U22–U25 wireframes |
| A-04 | `UX_ENGAGEMENT_REVIEW.md` | PLAN_ONLY | Per-role task analysis |
| A-05 | `OTP_WORKFLOW_AUDIT.md` | PLAN_ONLY | U6, U7 root cause + fix |
| A-06 | `PDF_EXPORT_DESIGN.md` | PLAN_ONLY | U4 — needs APPROVE PDF-DESIGN |
| A-07 | `SEED_DATA_PLAN.md` | PLAN_ONLY | V3 §7 — needs APPROVE SEED |
| A-08 | `OUTBREAK_AND_PUBLIC_HEALTH_DESIGN.md` | PLAN_ONLY | V3 §8 |
| A-09 | `ONLINE_TEST_PLAN.md` | PLAN_ONLY | V3 §9 |
| A-10 | `CLEANUP_AND_COMMENTING_PLAN.md` | PLAN_ONLY | V3 §10 |
| A-11 | `DEMO_DATA_REMOVAL_PLAN.md` | PLAN_ONLY | Needs APPROVE DELETE-DEMO |
| A-12 | `SECURITY_AUDIT_STATIC.md` | PLAN_ONLY | U25 — static only, no network |
| A-13 | `C5_COVERAGE.md` | PLAN_ONLY | U26 — reference counts |

---

## Stage B — Implement fixes (needs APPROVE PLAN)

### B1 — Bugs and polish (U1–U9, U18, U19, U22, U23)

| ID | Item | Status | Commit | Deploy | Evidence | Notes |
|----|------|--------|--------|--------|----------|-------|
| B1-U1 | Medication search dropdown — portal/stacking fix | TODO | | | | U1 |
| B1-U2 | Interaction/duplicate safety alert dedup + soap filter | TODO | | | | U2 |
| B1-U3 | Password strength bar fill | TODO | | | | U3 |
| B1-U5 | Hospital lab button raw `{t(...)}` text | TODO | | | | U5 |
| B1-U6 | OTP duplicate-request guard + 429 handling | TODO | | | | U6 |
| B1-U7 | Pharmacy 403 on pending NIC lookup — root cause + fix | TODO | | | | U7 |
| B1-U8 | Notification dropdown left-edge clip | TODO | | | | U8 |
| B1-U18 | App-owned console warnings (not extension) | TODO | | | | U18 |
| B1-U19 | Capitalize district names everywhere | TODO | | | | U19 |
| B1-U22 | Tiny text audit and fix (`text-[9px]` → ≥12 px) | TODO | | | | U22 |
| B1-U23 | Undefined Tailwind classes (slate-550, etc.) | TODO | | | | U23 |

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
