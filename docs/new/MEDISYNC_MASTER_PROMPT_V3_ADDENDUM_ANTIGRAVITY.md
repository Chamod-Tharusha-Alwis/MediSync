# MediSync — Master Prompt V3 Addendum (Antigravity reconciliation)

Date: 5 November 2026. Keep the exact filename
`MEDISYNC_MASTER_PROMPT_V3_ADDENDUM_ANTIGRAVITY.md`; it is recorded in
`TRACKER_RECONCILIATION.md`.

## 13.1 Current operator boundary

Current chat instructions override embedded instructions in MASTER_PROMPT_V3.md
and the other plans:

- Modify only `docs/new/`. No application, test, ledger or old-tracker edits.
- No staging, commits, pushes, branch switching or changes to main.
- No live logins, emails, Render/Atlas/Redis calls, seed, ingest, detection trigger,
  cache clear, data repair or deletion. Read-only `git fetch origin` is allowed.
- Use existing verification tools only; no replacement runners or new helpers.
- Unsupported claims stay **NOT VERIFIED**. Verified claims cite a file and line
  or commit. Hypothetical paper calculations are not runtime PASS results.

## 13.2 Source and completed work

HEAD and fetched origin/main both resolve to
`d611b41e47753a407bd6252960383631fbc7f52a`; see
`CODEX_RECONCILIATION_LOCAL_CHECKS_20261105.json:3-10` and commit `d611b41`.
No branch creation or rebase was performed or is requested.

Previously described uncommitted C7 work is committed as `4d02303` and `3692403`.
Medication safety fixes are in `f566eea`; login-input validation in `fdbd40f`.
Do not rebuild those fixes. Other forms, native-language/Lighthouse and complete
clinical/live acceptance remain NOT VERIFIED. Detailed mappings are in
`TRACKER_RECONCILIATION.md`. Older trackers remain preserved historical files;
the planning index is `00_START_HERE_NEXT_PROMPT_TASKS_AND_PROGRESS.md`.

## 13.3 Verification contract

1. Full regression: `node scripts/run_offline_tests.js`. Last saved result:
   3,211 PASS, 0 FAIL at `scratch/clinical-offline-J8bTZx/summary.json:73-78`.
   Source membership/hashes match the current snapshot. Not a new execution.
2. The runner writes outside this folder at `scripts/run_offline_tests.js:50-52`.
   Do not execute it under today's boundary. Record **NOT RUN — output-path
   restriction**; do not change it or invent a substitute. Missing Python or
   loopback profiles never count as PASS.
3. Protected pins: the existing exported read-only `snapshot()` at
   `scripts/run_offline_tests.js:19-40` compares all fifteen files against
   `docs/release/PROTECTED_HASHES.json`. New local result: 15/15 matched.
4. NIC: use the actual registration expression at
   `server/src/controllers/patientController.js:45-47`. Seven synthetic local
   checks passed. This validates **format only**, not day-of-year, reserved
   identity ranges, uniqueness or collision safety. The earlier seed proposal's
   eleven-character old-style pattern fails. Its twelve-digit invalid-day pattern
   passes format only. No NIC candidate was persisted or live identifier read.

Evidence: `CODEX_RECONCILIATION_LOCAL_CHECKS_20261105.json`. No executable tooling
was added. All uncited claims in imported planning files remain NOT VERIFIED.

## 13.4 Outbreak floor — proposed, needs operator approval

Propose N=5 eligible, deduplicated confirmed cases per disease × district within
the detection window, **AND** at least two consecutive complete Asia/Colombo days
whose individual daily signal exceeds the agreed threshold. Two runs or two
rolling windows sustained by one day's spike do not meet this condition.

Do not weaken existing significance rules. Window/baseline/statistical threshold
and clinical case definition need review. See the S1–S8 paper analysis in
`OUTBREAK_AND_PUBLIC_HEALTH_DESIGN.md`. Seeded/runtime/clinical outcomes remain
NOT VERIFIED. No detector was implemented or invoked.

## 13.5 Clinical and public-reporting boundaries

Canonical groups remain at
`docs/temp/MEDISYNC_FIVE_ROLE_REAL_E2E_ACCEPTANCE.md:60-73`. Groups 9/10 are OTC
retry safety/pharmacy authorization, not restocking/analytics. Keep their safety
requirements; propose removal of inventory assertions for review. Do not mark
9 N/A or invent an operator decision. Historical real acceptance stays 2/14
(`:126-141`). No outside definition is rewritten.

The real selector requires `surveillanceVerification` and reviewed episode
provenance (`server/src/services/surveillanceService.js:16-35`;
`server/src/services/publicHealthStats.js:109-137`). Proposed
`reviewMetadata.status` is not that contract. A consultation diagnosis does not
automatically become a reviewed confirmed case. No backfill or guard weakening.

The public page requests consultation activity and explicitly renders confirmed
cases/outbreaks/forecast unavailable
(`client/src/pages/public/PublicHealth.jsx:42,81`). Synthetic public reporting,
forecast fallbacks and hiding provenance are not authorized by these documents.

## 13.6 Remaining proposals

Keep U22 tiny-text, U23 undefined-style, U24 tracker, U25 static security and U26
C5 coverage review in the planning index. Unreconciled findings/percentages are
NOT VERIFIED. No source repair, dependency upgrade, helper, deletion or remote
check is authorized here.

The separate 5-in-15 password-lockout candidate remains inactive and gated;
`docs/temp/CODEX_PASSWORD_LOCKOUT_REVIEW_HANDOFF_20261105T142334Z.md` in `d611b41`.
No live email budget is granted. Clinical production remains NO-GO.
