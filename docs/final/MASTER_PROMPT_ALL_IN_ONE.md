# MEDISYNC ALL-IN-ONE PROMPT: FINISH EVERYTHING THAT REMAINS

Save as: `C:\Users\chamo\OneDrive\Desktop\Final project\medisync\docs\final\MASTER_PROMPT_ALL_IN_ONE.md`
Usage: attach to the agent (full access) and send **continue**. This file is self-contained. It replaces the unfinished parts of `MASTER_PROMPT_FINAL.md`, `PHASE_10_ADDON_PROMPT.md` and `MASTER_PROMPT_PHASE_11.md`. Anything those files describe that is already merged and verified stays as is.

---

# AGENT INSTRUCTIONS

## 0. Non-negotiable run rules

1. **Never end your turn, never ask a question, never summarize between tasks, never wait for approval.** Keep working until every task below is finished and `docs/final/MASTER_STATE.md` says `COMPLETE`. Saying "Ready for next task" and stopping is a failure. Only two things may halt the run: production data about to be destroyed, or an exposed secret.
2. **You are the verifier.** Run tests, build, ledger check, CI check and live checks yourself. A task is done only when your own evidence shows it.
3. **Owner-only items** (a mailbox, screenshots, Atlas/Render/Vercel/GitHub dashboard actions, clinician review, citations): write them to `docs/final/OWNER_ACTIONS.md`, test everything around them, mark the item `BLOCKED-OWNER`, and continue.
4. **After a real failure,** fix, redeploy, retest, up to 3 times; then log `KNOWN ISSUE` and continue.
5. **Save state** to `docs/final/MASTER_STATE.md` after every task (current task, last commit, next action). On "continue" read it and resume; never redo finished work.
6. **Truth rules:** claim nothing unverified; cite file:line, a passing test, or a live check; never invent numbers, counts or citations. These do not exist and must not be built or claimed: appointment booking, OPD queue, pharmacy inventory/stock, renal/hepatic/pediatric/geriatric dosing rules, QR scan to dispense, SVM/RF/NB ensemble. The ML triage is a lexical similarity aid, `clinicalValidation: not_established` stays in API payloads (never as raw text in the UI).
7. **Protected ledger stays 15/15 byte-exact** (`docs/release/PROTECTED_HASHES.json`); `.gitattributes` keeps protected paths `-text`. Prefer new files and wrappers. If a protected file must change, make the minimal edit, update only that file's hash entry, and record file, reason, old and new hash in `docs/final/LEDGER_CHANGELOG.md`. Verify the ledger on a clean checkout before every merge.
8. **No PII or secrets** in logs, audit `details`, commits or reports (no NIC, name, email, phone, diagnosis, drug names, OTPs, tokens, connection strings). Never hardcode an OTP.
9. **Email budget:** at most 40 live emails for this whole run; count them in `LIVE_TEST_LOG.md`. Use mocked transport in automated tests.
10. **Git:** one branch per task `final/rem-<slug>`, small commits, PR, wait for both CI workflows ("Security Hardening & Trust Governance Tests" and "MediSync Clinical Offline Verification") green, merge to `main`, confirm Render backend and ML `/health` commit, confirm the Vercel build serves the new client commit, then live-test. Run `node scripts/run_offline_tests.js` (failed 0) and `npm --prefix client run build` before every push.
11. No demo/synthetic labels in the live UI. UI strings in en/si/ta with exact key parity; recompute the key count from the parity test, never guess.
12. All reports, evidence and logs go in `docs/final/` (`PHASE_*_REPORT.md`, `LIVE_TEST_LOG.md`, `evidence/`).

## 1. Order of work

R0 integrity audit -> R1 audit log and email search -> R2 ML logging -> R3 email noise -> R4 data quality -> R5 medicine coverage -> R6 auto-supersede -> R7 ICD labelling -> R8 final reconcile, live test, release.

Already merged and CI-green (do not redo, only spot-check in R0): privacy fixes (emails without clinical data, locked/encrypted PDF, PDF layout/time zone/doctor ID, no NIC on pharmacy screens, no raw `clinicalValidation` text), lab upload idempotency and status badges, OTC atomic retry and label cleanup, public health 200 and alerts 200, doctor override engine (warn, never block).

---

## R0. Integrity audit (do first; fix what fails)

**R0.1 Test count mismatch.** The last run reported 3,462 passed across 207 suites, but earlier runs reported 3,465 across 207, and since then at least 48 tests were added in new files (OTP portal 11, release 10, clinical safety 17, doctor override 10). The total went down and the suite count did not move.
- List every test file added, changed or deleted since tag `v1.0.0-capstone` (`git diff --stat v1.0.0-capstone..main -- '*test*'`).
- Confirm `scripts/run_offline_tests.js` actually discovers and runs the new files; run each new file directly and compare with the runner's totals.
- Explain every deleted or rewritten test in `docs/final/R0_REPORT.md`. Restore any that were dropped without a valid reason. Fix the runner if it skips files.
- Replace all quoted test/suite counts in docs, slides and report with numbers from the corrected run.

**R0.2 Public health must not invent data.** The agent reported the endpoint "always returns 200 with fallback surveillance counts and district baselines".
- Inspect `/api/public/health-stats`, its UI and its tests. Required behavior: counts come **only** from consultations whose `surveillanceVerification.status` is `verified`; a separate `awaitingReviewCount` is shown as a labelled count (never on the map as cases); an empty or unverified database returns zeros and a clear "no verified data yet" state (en/si/ta). **No seeded, default or synthetic numbers may be presented as real surveillance data.**
- If fallback numbers exist, remove them and fix the tests. Document what the response contains.
- Confirm there is a working way for consultations to become `verified`: an admin/epidemiologist review action (list with district/disease/date filters, single and bulk verify/reject, audit-logged, role-restricted, no auto-verify). If it is missing, build it. Confirm verified consultations feed the 7-day vs 56-day detector, the map, and the gates (N >= 5, 2 consecutive days, z > 2.0).
- Update `DEMO_SCRIPT.md` step 5 with the exact click path (review -> map updates -> alert).

**R0.3 Spot-check the claimed fixes on the live site** (deployed commit must match `main`; expose the client commit via `<meta name="app-commit">` and the footer if not already): consultation email has no clinical content and no attachment; PDF requires the password and has no overlap, correct Sri Lanka time and doctor SLMC number (placeholder `SLMC-REG-VERIFIED` gone); pharmacy history shows names, not NICs; no raw `clinicalValidation` text anywhere in the UI; lab upload updates status in hospital, doctor and patient views; OTC checkout works; doctor override flow (Warfarin + Ciprofloxacin shows warning, checkbox and reason, saves, pharmacy shows the prescriber badge, verify page shows types only). Record PASS/FAIL in `LIVE_TEST_LOG.md`; fix FAILs.

**R0.4 Safety panel consistency.** The client safety panel and the server must use **one shared function** that evaluates the current prescription **plus the patient's active medications**. The panel must name conflicts ("Ciprofloxacin (this prescription) vs Warfarin (active, CON-xxxx)"), show each finding once, and never say "no interactions" when the server would report one. Add a test that panel findings equal server findings for the same input.

---

## R1. Audit log completeness and search by email

1. Write `docs/final/AUDIT_COVERAGE.md`: every mutating route (POST/PUT/PATCH/DELETE) and sensitive read mapped to an audit action. Add a test that scans route files and fails if a mutating route has no audit call or documented exemption.
2. Ensure audit entries for at least: login success/failure/lockout, logout, OTP request/verify, password reset, device trust/revoke, consent request/verify, patient record view, consultation create/update/follow-up, prescription create, safety override, supersede, dispense, OTC dispense, receipt view, lab order/consent/sample/progress/upload/report view/download, PDF export, summary email sent/resent, verify scan/OTP/unlock/PDF, token revoke, user create/suspend/activate/role change, outbreak trigger/approve/resolve, surveillance review verify/reject, settings changes, admin audit-log views.
3. **Search by email without storing PII:** entries keep only `actorId` and `actorRole`. The admin audit endpoint resolves an email (or name) to user ids at query time (blind index/lookup across patients, doctors, pharmacy staff, hospital, admin) and filters by id; the admin UI joins and shows name/email at read time (admin-only). Filters: action, role, date range, outcome. Entries stay append-only.
4. Users page (`/admin/dashboard/users`): search by email, name, role, status; pagination.
5. Tests: coverage scan, email-resolved search, no PII in stored entries, admin-only access, pagination. Live-check that new actions appear in the audit page.

## R2. ML service logging and proof of use

The ML engine works (live doctor screen returns reference matches) but Render shows "No logs to show" because the service does not log requests.
1. Add structured logging in `ml-engine/app.py` and the start command: startup line (model/KB versions, concept counts, RSS memory), one line per request (`request_id`, method, path, status, latency ms, number of input symptoms, tier used, top confidence), error lines. Flush to stdout. **No symptom text, no PII.**
2. Backend logs `[ML] predict_disease status=<code> latency_ms=<n> tier=<...>` per call. If any fallback exists when ML fails, the response carries `source: "ml-engine" | "fallback"` and the UI states when the ML service was unavailable; fallback output must never be presented as ML output.
3. Proof: warm both services, read `/metrics` counter, run one analysis through the live doctor flow, read `/metrics` again and show the increase; add Render log instructions to `OWNER_ACTIONS.md` if the agent cannot read them.
4. `OWNER_ACTIONS.md`: set UptimeRobot timeouts to 60 s (Render cold start is about 50 s); pre-viva warm-up routine (curl `/health` on both services 3 minutes before).

## R3. Email noise

1. Persist a trusted-device marker after a successful OTP login (hashed record or httpOnly cookie) so the "Login from NEW Unrecognized Device" email fires only for genuinely new devices, throttled to once per device per 24 h. (The log showed about 26 emails in an hour, one per login from the same Chrome.)
2. One "medication dispensed" email per dispensing event (per order), not per line or double-click (six were sent in 90 seconds).
3. Per-day email counter in the server log (counts only) with a warning at 80% of the provider cap (config, default 100).
4. Tests: repeated logins from one device, new device, multi-line dispense, throttle.

## R4. Data quality

1. Fix the formulary typo "Penicitin" -> "Penicillin" (brand names, search index, tests); scan brand names for other suspected typos and list them without guessing clinical corrections.
2. Patient detail screens: missing contact, blood group or date of birth show a neutral "Not provided", not a red N/A.

## R5. Medicine catalog coverage (honest: "all medicines in the world" is not claimable)

1. Do not claim every medicine exists in the platform. Measure and report coverage.
2. Write `scripts/audit_medicine_coverage.js` (or .py) reporting: brands, generic ingredients, ingredients with a safety limit, ingredients in at least one interaction pair, ingredients with neither (they cause "Unresolved ingredient(s)").
3. Benchmark against the WHO Model List of Essential Medicines (latest edition obtainable from the repo, a vendored file or the network) and an ATC substance list if available; otherwise benchmark against the ~300 most common generics from the repo's own data and label it an internal list (and add the need to `OWNER_ACTIONS.md`). Save gaps to `docs/final/data/medicine_coverage_gaps.json`; report `% resolved` computed by the script.
4. Fix prefix/close-spelling search: `Citalopr` must suggest `Citalopram` (brand and generic). Never auto-substitute silently; the doctor picks a suggestion; free text stays allowed under the override flow, with the "Automated interaction checking is incomplete" warning shown once.
5. Add missing high-frequency generics from the benchmark (name, ATC if known, common strengths, forms). **Do not invent dose ceilings or interaction pairs.** New ingredients without verified limits get `citationStatus: "unverified_owner_must_check"` and no numeric ceiling; the UI says "No dose ceiling on file for this ingredient". Verify Citalopram and Penicillin resolve.
6. Document in `docs/final/MEDICINE_COVERAGE.md`, `11_limitations_future_work.md`, the report's safety chapter and `CLAIMS_AUDIT.md`.

## R6. Auto-expiry / supersession of repeated medication

Rule: when a new consultation prescribes an ingredient that the same patient already has **active**, the older one is automatically ended (superseded).
1. **Active** = not cancelled/superseded and `now < startDate + durationDays` (startDate = consultation date, or `dispensedAt` if dispensed; document the choice). Provide one shared helper returning `activeState` (`active | expired | superseded | cancelled`); time-based expiry is computed, no cron needed.
2. **Same medicine** = identical resolved active-ingredient set (a different dose still counts). Partial overlap (combination product sharing one ingredient) does not supersede; it only triggers the duplicate-ingredient warning.
3. On saving a consultation, atomically mark older matching lines `supersededBy`, `supersededAt`, `supersededReason: "newer_prescription_same_medicine"`. Never delete. A superseded **pending** prescription becomes non-dispensable; a dispensed one keeps its history and just ends its active course. Prefer additive fields plus the derived state over changing the `status` enum.
4. Doctor sees a non-blocking notice: "Citalopram is currently active from CON-xxxx (started <date>, <n> days left). Saving will replace it."
5. Downstream: pharmacy pending list excludes superseded/expired lines (the live pharmacy view showed "8 items across 7 orders" of overlapping prescriptions; show the before/after); `dispensingService` re-checks supersession atomically and returns a distinct `SUPERSEDED` code; patient timeline shows "Replaced by newer prescription" / "Expired"; verify page release block shows "Replaced by newer prescription" or "Course ended", not "Not released"; `releaseSummaryService.js` uses the shared helper; audit `PRESCRIPTION_SUPERSEDED` with ids only.
6. Tests: new dose supersedes; different ingredient does not; combination overlap only warns; pending superseded cannot be dispensed (including a concurrent race); dispensed + superseded keeps history; expiry boundary (day before, day of, day after); patient isolation; multi-line; labels; key parity.
7. Live test: consultation 1 prescribes Citalopram for N days; consultation 2 prescribes it again; confirm supersession, non-dispensable pending slip and correct verify-page labels.

## R7. ICD labelling

The doctor screen showed "Single episode depressive disorder, ICD-10 `6A70`". `6A70` is an ICD-11 code (ICD-10-CM would be `F32.x`), while docs claim a US ICD-10-CM catalog of 71,704 leaf concepts.
1. Find which catalog served it and why it is labelled ICD-10 (`icdVersion` default `'ICD-10'`).
2. Either label every entry with its true classification/version everywhere (UI, PDF, verify page, data model) or restrict doctor search to the catalog the docs claim. Correct whichever of code or docs is wrong and recompute every quoted count.
3. Add a test that nothing shown as "ICD-10" has an ICD-11-style code.

---

## R8. Final reconcile, live test, release

1. **Live test matrix** (all five roles, public pages, verify page; log every step with PASS/FAIL and evidence): login/logout and device trust; patient timeline/prescriptions/lab status; doctor consultation with ML analysis, red-flag advisory, override flow, supersession notice, save, summary email (generic), PDF (encrypted, clean, doctor ID, Sri Lanka time); pharmacy dispense, partial dispense, duplicate hard stop, OTC, history by name; lab upload and status propagation; admin audit search by email, users search, surveillance review, outbreak flow; public health in en/si/ta with verified and empty data; alerts banner when logged out; verify page OTP flow end to end (mailbox known from earlier runs, otherwise `BLOCKED-OWNER`); ML `/metrics` increments; mobile width 360 px.
2. **Docs reconcile:** update `FEATURE_EXISTENCE_MATRIX.md` (new rows: safety acknowledgment, supersession, coverage audit, ICD labelling, audit coverage, surveillance review, encrypted PDF), `CLAIMS_AUDIT.md`, `API_REFERENCE.md`, `DATA_MODEL.md`, `DEMO_SCRIPT.md` (replace "blocking alert" with "warning and acknowledgment"), `SLIDES_OUTLINE.md`, report chapters, `SECURITY_STATUS.md`, `11_limitations_future_work.md`, `SCREENSHOT_CHECKLIST.md` (rename SS-13 to `ss13_medicine_safety_acknowledgment.png`), `PROGRESS.md` (percentages only from verified evidence, listing the live checks). Recompute test counts, key counts, ML and medicine coverage from real runs. Regenerate figures; run `scripts/check_report_links.py`.
3. **`OWNER_ACTIONS.md` must contain:** enable GitHub branch protection on `main` requiring both CI workflows; redeploy Vercel from `main` if the served commit differs; UptimeRobot timeouts 60 s; use a **synthetic patient NIC** for all report and viva screenshots (current screenshots show a NIC in several screens); confirm the patient mailbox for the OTP demo; clinician review of severity mapping, the 6 red-flag rules and the acknowledgment wording; pharmacist/clinician sign-off for any added formulary entries; Atlas IP allowlist, delete legacy atlasAdmin user, rotate Redis token, rotate shared demo passwords, take a `mongodump` backup before the viva; the four citation placeholders.
4. **Final gates:** offline suite failed 0 with the corrected, verified count; client build 0; ledger 15/15 on a clean checkout; both CI workflows green on `main`; Render backend and ML `/health` on the final commit; Vercel serves the final commit; live smoke of five roles plus the verify page.
5. Tag `v1.1.0-capstone` on the final `main` commit (do not move `v1.0.0-capstone`). Write `docs/final/FINAL_STATUS.md` with an honest per-area table (verified live / tests only / limitation), open `BLOCKED-OWNER` items and known issues. Set `MASTER_STATE.md` to `COMPLETE`.
