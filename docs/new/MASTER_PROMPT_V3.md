# MediSync — Master Prompt V3: Fix, Redesign, Seed, Outbreak, Online Test, Clean

> **5 November 2026 operator override — DOCUMENTATION ONLY.** This is an imported
> plan, not current execution authority. Modify only `docs/new/`; no staging,
> commits, pushes, changes to main, live logins/emails or Render/Atlas/Redis calls.
> Only read-only git fetch is allowed remotely. Read
> `MEDISYNC_MASTER_PROMPT_V3_ADDENDUM_ANTIGRAVITY.md` and
> `TRACKER_RECONCILIATION.md` for verified current-source corrections. Instructions
> below to branch, implement, seed, delete, commit, push or test live are inactive.
> Unreconciled claims remain NOT VERIFIED. Proposed outbreak floor: N=5 per
> disease × district plus two consecutive complete days above the daily threshold;
> **proposed, needs operator approval**. The older 60-email budget below grants
> no permission; no live email is authorized now. C7 is committed (`4d02303`,
> `3692403`), and main is `d611b41`. Historical receipts are not new live results.

Date issued: 5 November 2026
Operator: Chamod (sole owner of repo, Render, Vercel, Atlas, Resend, Brevo)
Repo: `Chamod-Tharusha-Alwis/MediSync`, branch `main`
Works in: Codex, Antigravity, or any coding agent. The rules are tool-neutral.

Save as `docs/new/MASTER_PROMPT_V3.md` and paste it (or tell the agent to read it first). It continues V1 and V2. **V3 wins** where they differ. V1/V2 hard rules still apply unless V3 changes them in section 3.

---

## 0. Read first: coordination

- **One tool writes at a time.** Codex is rate-limited until about 6:34 PM Sri Lanka time on 5 Nov. If you are the agent that starts now, finish and push your work, update the tracker, then tell the operator before any other tool starts.
- **Do not discard local work.** Codex left roughly 10 uncommitted files (+279 −10) for item C7 (recovery screen, login-form submit locks, translation audit, tests). Never run `git reset --hard`, `git checkout .`, `git clean` or stash-drop. First `git status`, then finish C7 (Phase 0), run the full regression, commit and push.
- Always `git fetch && git pull --rebase origin main` before work and before each push. Direct pushes to `main`, one verified item per commit, `type(scope): summary`.
- Trackers live in `docs/agent-work/` (V1/V2) and the new plans live in `docs/new/` (section 5).

---

## 1. State on 5 Nov 2026

**Verified live (evidence in `docs/temp/`):** public site and role dashboards free of demo/prototype banners; public consultation-activity page; Sri Lanka time in emails and UI; masked identifiers in login alerts; admin ML status returns 200 (`available`) after the `e163f40` ML deploy (cause of earlier `bad_response` unproven); admin socket cleanup (0 blocked requests); translation keys fix `192e1d4` (12 missing keys); public 404 page.

**Still true:** MediSync-ML is on the Render Free plan (no disk, cold starts, ephemeral SQLite); clinical real acceptance 2 of 14 groups (definitions in `docs/temp/MEDISYNC_FIVE_ROLE_REAL_E2E_ACCEPTANCE.md`); `TEST_MATRIX.md` has 846 rows (R 560, W-low 78, W-clin 41, W-sec 99, W-adm 37, X 31); email so far today: Resend 8, Brevo 0.

**Issues the operator found by hand on the live site (fix all):**

| ID | Where | Problem |
| --- | --- | --- |
| U1 | Doctor → new consultation → Rx step | Medication search dropdown overlaps and clips the table below it. |
| U2 | Same | Safety alert is a long raw text; the same product is compared against itself ("Duplicate active ingredient … present in both X and X"); the warning shows three times (red box, amber box, big panel). A soap is prescribable with "1 tab TDS". |
| U3 | Security/settings (all roles) | Password strength says STRONG but the bar shows no fill. |
| U4 | Patient consultation + lab report | "PDF export temporarily unavailable"; the operator wants working, secure downloads. |
| U5 | Hospital → Laboratory Test Orders | Button prints raw code: `{t("common.verify", "Send Verification OTP")}`. |
| U6 | `POST /api/lab/hospital/request-otp` | HTTP 429 five times in a row from one action. Wasted emails and a rate-limit hit. |
| U7 | Pharmacy dispense | `GET /api/pharmacy/prescriptions/pending/<NIC>` returned 403 in the console while a list still appeared. Find the cause. |
| U8 | Hospital (all roles) | Notification dropdown is cut off at the left edge; text is clipped. |
| U9 | Pharmacy dispense and any prescription list | Each medication is its own card. Group by **consultation**: show the consultation reference and doctor name once, with its medications as rows under it. |
| U10 | Pharmacy | **Remove medication inventory completely** (dispense modal "Select inventory", quantity-from-stock, inventory API/models/pages, analytics, tests, docs). Dispensing is a record, not a stock movement. OTC walk-in too. |
| U11 | `/pharmacy/dashboard/restock` | Replace with a page showing district disease/health burden and the **most-sold medications**. District names are lower-case ("kandy"). |
| U12 | `/pharmacy/dashboard/analytics` | Show this pharmacy's sold medications for 24 h, 48 h, 72 h, 7 d, 14 d, 30 d, this month, and a custom date range (Sri Lanka time). The operator wrote "23h"; treat as 24 h and state that assumption in the plan. |
| U13 | `/admin/dashboard/users` | Remove the Users/Hospitals toggle. One list with a role filter that includes hospitals. |
| U14 | `/admin/dashboard/identity` | Remove as a separate page. Fold identity, trusted devices, sessions and recovery links into a **user detail panel** opened from the Users list. Redesign it. |
| U15 | `/admin/dashboard/alerts` (ML Alerts) | Remove (page, nav, routes, tests). Outbreak Monitor covers surveillance. |
| U16 | Admin overview | "Infrastructure configuration (live health not verified)" shows only "Not verified". Replace with real health checks (DB, cache, email, ML) or remove. Stats look inconsistent (6,317 fulfilments with 1 patient): investigate and explain. |
| U17 | Whole product | Remove all demo, testing, synthetic or temporary wording: "SYNTHETIC EPIDEMIOLOGICAL SIMULATION — FOR SYSTEM TESTING ONLY" tags, `TMP-…` display names, test OTP, demo scripts, flags exposed to any UI. |
| U18 | Browser console | `feature_collector.js … deprecated parameters`: check whether it comes from a browser extension (likely). Fix only app-owned console messages. |
| U19 | Lists and headings | Capitalize district names everywhere. |
| U20 | Notifications | Rewrite outbreak notification text for the new case definition (section 8). Fix clipped layout. |
| U21 | Public pages | Day buckets are UTC. Propose Sri Lanka days (Asia/Colombo) in the plan. |

---

## 2. Operator decisions already made (record in `DECISIONS.md`)

- **D1** This is a university project. Synthetic data is expected and acceptable. No banner, ribbon or "demo/test" label anywhere on the site.
- **D2** Create **fake accounts and fake consultations directly in the database**, across many diseases, so the outbreak, public-health, hospital, doctor and pharmacy views have real content.
- **D3** Medication inventory is out of the product.
- **D4** **Test on the live platform, not offline.** Stop growing the offline suite. Add an offline test only to guard a specific bug you fix. Keep CI green.
- **D5** Admin page changes in U13–U15; pharmacy page changes in U9–U12.
- **D6** Plan first: agents write `.md` plans, the operator approves, then implement.
- **D7** Combined email limit for live testing: **60 per day** (Resend 100/day and Brevo 300/day are the provider caps). The operator may change this number in chat. Stop at 50 and ask.
- **D8** Provenance stays **internal only**: every seeded record carries a private `seedBatchId` (never shown in any UI/API). README and the viva documents state that the data is synthetic. No on-site labels.

---

## 3. Authority

### 3.1 Standing approvals (given by this prompt)
- Commit and push to `main`, one verified item per commit.
- Finish and push C7 and other work already in progress (Phase 0).
- Live logins on the five role accounts and live functional tests as defined in the approved `ONLINE_TEST_PLAN.md`, within the email limit in D7, using one session per role and reusing it.
- Live write tests on the **seeded fake data** and on the operator's named test patient, per the approved plan.

### 3.2 Needs the operator's typed phrase
- `APPROVE PLAN <file or ALL>` — before implementing anything from the Stage A documents.
- `APPROVE PDF-DESIGN` — before enabling PDF export (security-sensitive).
- `APPROVE SEED` — before the first write by the seed script. Give a dry-run summary first (counts per collection only).
- `APPROVE DELETE-DEMO` — before removing the old demo batch (`DEMO_OUTBREAK_2026_V1`, `CON-DEMO`, `CON-SYNTH` records, ML SQLite demo rows). Give a dry-run count first.
- Any change to the live-session allowlist beyond the plan (show diff and tests first).

### 3.3 Operator-only (write exact steps in `OPERATOR_ACTIONS.md`)
Atlas network/users, Redis rotation, Render/Vercel environment variables and plans, passwords, Resend/Brevo settings, the `MEDISYNC_PROTOTYPE_MODE`/vault decision.

### 3.4 Never
- Print or commit secrets, tokens, passwords, OTPs, connection strings, real identifiers or message bodies. Keep screenshots outside the repo and OneDrive.
- Claim a result you did not observe: mark it NOT VERIFIED.
- Weaken a guard, loosen validation or delete a test to get green.
- Delete or change anything that does not carry the seed marker or was not listed and approved.
- Send an email to any address the operator does not control.
- Force-push or rewrite history.

### 3.5 Email policy
- Fake users get **no email address**, or an operator-controlled plus-alias (for example `patient.owner+fake001@example.org`) for the few accounts used in OTP tests. Bounces to made-up addresses can harm the Resend account.
- Reuse sessions; one login per role per test run. Plan emails per flow in the test plan; prefer splitting tests across days to exceeding D7.
- Seed scripts must not trigger notifications or emails.

---

## 4. Stages

| Stage | What | Gate |
| --- | --- | --- |
| 0 | Housekeeping: finish and push C7; sync trackers; baseline | none |
| A | Write the planning documents (section 5). No product code changes. | operator `APPROVE PLAN` |
| B | Implement fixes and redesigns U1–U21 in batches: B1 bugs (U1–U9, U18, U19), B2 removals and redesigns (U10–U16), B3 OTP fixes, B4 PDF export | `APPROVE PLAN`, then `APPROVE PDF-DESIGN` for B4 |
| C | Seed fake data (dry run → write) | `APPROVE SEED` |
| D | Build outbreak and public health on the seeded data (section 8); remove demo labels (U17, U20); retire legacy demo data | `APPROVE DELETE-DEMO` for deletions |
| E | Full online test of every role and function (section 9) | standing approval |
| F | Cleanup, comments and documentation (section 10) | none |
| G | Final acceptance matrix and report | none |

Order matters: seed (C) before building the outbreak views (D); verify U11 and U12 after seeding.

Per-item cycle (V1 section 5): claim → implement → minimal tests → hygiene scan → commit → pull --rebase → push → wait for Render/Vercel to show the SHA → **online verification** → record → next. Two failed fix attempts → `git revert` and mark BLOCKED. Never batch unverified items.

---

## 5. Stage A documents (create in `docs/new/`, then stop for approval)

Each file: purpose, current state with evidence, proposed change, acceptance criteria, risks, effort (S/M/L), and which U-items it covers. Plain language, short tables, no secrets.

1. `00_START_HERE_NEXT_PROMPT_TASKS_AND_PROGRESS.md` — the master task list with status per item (TODO / IN_PROGRESS / PUSHED / LIVE_VERIFIED / BLOCKED / DEFERRED), commit SHA, deploy confirmation, live evidence file, owner, next action. This is the file the operator reads first; update it after every item.
2. `PAGE_CHANGE_PROPOSALS.md` — one section per changed page: U1–U21, with a text wireframe of the new layout, the exact fields shown, empty/loading/error states, trilingual labels, mobile behavior. Include the pharmacy restock/demand page, pharmacy analytics, admin users + user detail panel, grouped prescription view, medication search and safety alert redesign, notification dropdown.
3. `UX_ENGAGEMENT_REVIEW.md` — for each role, the 5 to 8 most common tasks, current steps and clicks, friction found by reading the code and the live pages, and the proposed improvement (fewer steps, clearer wording, better defaults, shortcuts, helpful empty states, confirmation of success, error messages that say what to do). Include accessibility and mobile findings. Rank by user value.
4. `OTP_WORKFLOW_AUDIT.md` — every OTP/consent flow (patient consent for doctor and hospital lab, pharmacy retrieval, password reset, login), its endpoint, rate limit, cool-down and UI feedback. Root cause of U6 (duplicate or automatic OTP requests) and U7. Proposed fix: single-fire guard, disabled button with countdown, clear 429 message, no request on mount. Estimated email cost per flow.
5. `PDF_EXPORT_DESIGN.md` — secure download design for consultation and lab PDFs: ownership and consent checks, encryption approach and key delivery independent of patient identifiers, wrong-key/tamper/missing-key rejection with no plaintext fallback, Sinhala/Tamil fonts and layout, file naming, audit log. Include 2 options with a recommendation. Needs `APPROVE PDF-DESIGN`.
6. `SEED_DATA_PLAN.md` — section 7.
7. `OUTBREAK_AND_PUBLIC_HEALTH_DESIGN.md` — section 8.
8. `ONLINE_TEST_PLAN.md` — section 9, including the email cost table and the test-account list.
9. `CLEANUP_AND_COMMENTING_PLAN.md` — section 10, with the list of files and folders proposed for deletion or archive.
10. `DEMO_DATA_REMOVAL_PLAN.md` — every place demo/testing/synthetic data or wording exists (UI strings, i18n keys, models/fields, scripts, Mongo batches, ML SQLite, env variables, docs), how to remove each, and the dry-run query to count records. No deletion until `APPROVE DELETE-DEMO`.

When all ten exist, commit them, push, and message the operator: list the files with one line each and ask for `APPROVE PLAN ALL` (or per file).

---

## 6. Implementation guidance (Stage B)

- **U1/U2:** the medication dropdown must render in a portal or with correct stacking and scroll, never overlapping the table; keyboard navigation works. Interaction/duplicate warnings: compare **different** products only, deduplicate ingredient names, show one consolidated warning with a short list, and collapse the "unresolved ingredients" note. Exclude non-medicine products (soaps, cosmetics) from prescribable suggestions or mark them non-prescribable in the catalog layer.
- **U3:** render the strength bar with a visible fill, colour and text; test every role's password screen.
- **U9/U10:** shared grouped-prescription component; inventory removal touches UI, routes, controllers, models, seeds, tests and docs. List every file in the plan first. Dispensing records: prescription item, quantity dispensed if needed, substitution flag, pharmacist, timestamp.
- **U13–U15:** remove routes and nav items, add redirects from old URLs to the new places, update tests.
- **U16:** real health checks must not leak secrets and must not call the ML service on every page load; cache for a short time.
- **U5/U6/U8/U18/U19:** small fixes; add one guard test each only where it prevents regression.
- Every UI string goes through the translation system in EN/SI/TA; no raw template text.

---

## 7. Seed data (Stage C) — defaults for approval in `SEED_DATA_PLAN.md`

Goal: believable data for outbreak detection, forecasting, hospital/doctor/pharmacy pages and public pages.

- **Mechanism:** a script `scripts/seed-platform-data.js` that uses the application's own models and services so field encryption and blind indexes apply. `--dry-run` is the default and prints counts per collection only; `--confirm` writes; `--remove --batch <id>` deletes only records carrying that batch. Idempotent. Never prints personal data. Reads credentials from the local untracked env file only.
- **Marker:** a private `seedBatchId` (suggested `SEED_2026_11_A`) on every created document, excluded from all serializers and responses.
- **Volumes (defaults):** all 25 districts; about 12 hospitals, 40 doctors, 15 pharmacies with staff, 400 patients, 4,500 consultations over the last 120 days ending today (Sri Lanka time); 1 to 3 medicines per prescription from the real drug catalog (prescribable items only); about 25% of consultations with lab orders; about 70% of prescriptions dispensed with dispensing logs.
- **Diseases (proposed; confirm against the existing 41 reference profiles and use the ICD-10 codes already in the catalog):**
  - outbreak-capable: dengue (A90/A91), leptospirosis (A27.9), influenza (J11.1), chickenpox (B01.9), mumps (B26.9), acute diarrhoeal disease (A09), typhoid (A01.0), hepatitis A (B15.9), chikungunya (A92.0), COVID-19 (U07.1), hand-foot-and-mouth (B08.4);
  - background load: upper respiratory infection (J06.9), hypertension (I10), type 2 diabetes (E11.9), asthma (J45.9), gastritis (K29.7), migraine (G43.9), back pain (M54.5), urinary tract infection (N39.0).
  - If a code is missing from the catalog, choose the nearest present one and say so in the plan.
- **Planted scenarios (each with an expected detection result used as the test oracle in Stage E):**
  - S1 dengue: Colombo, Gampaha, Kalutara rising over 5 weeks, peak in the last 10 days;
  - S2 leptospirosis: Ratnapura, Kalutara, Galle spike about 3 weeks ago, decaying;
  - S3 chickenpox: school-age cluster in Galle, 10 to 14 days;
  - S4 influenza: national seasonal rise, higher in Kandy and Nuwara Eliya;
  - S5 typhoid and diarrhoeal disease: small cluster in Jaffna and Batticaloa;
  - S6 hepatitis A: cluster in Matale;
  - S7 quiet baseline elsewhere;
  - S8 one single-day spike that must **not** raise an alert (tests the detector).
- **Realism:** weekday/weekend pattern, plausible age and sex mix, population-weighted district volumes, doctors affiliated with hospitals in the same district, medicines matched to diagnoses (fever → paracetamol and so on) so the pharmacy "most sold" page is meaningful.
- **Accounts:** synthetic Sri Lankan-style names; fictional phone numbers; **no login** (unusable password hash) except accounts the operator names; NIC-style identifiers must be impossible for a real person: use a day-of-year code outside 001–366 and 501–866 if the app's validator allows it, otherwise propose another safe pattern in the plan.
- **Existing accounts:** never modify the five role accounts, the operator's test patient or any record without the seed marker.
- **ML SQLite:** not part of this. Public/admin outbreak views read Mongo.

---

## 8. Outbreak and public health (Stage D) — design in `OUTBREAK_AND_PUBLIC_HEALTH_DESIGN.md`

- **Case definition (decision D9, for approval):** in this prototype, a **doctor-confirmed diagnosis (ICD-10) saved with the consultation** counts as a confirmed case. Store the review metadata the existing admission gate expects at save time, and have the seed write the same fields. Keep the gate's meaning intact. The full clinical-review workflow stays in `FUTURE_FEATURES.md`.
- **Detection:** per disease × district daily counts against an 8-week baseline (z-score or CUSUM, whichever the existing OutbreakMonitor uses), alert levels, de-duplicated alerts persisted in Mongo, a resolve/expire rule.
- **Forecast:** 14-day forecast with intervals from the daily series; must not depend on the ML service's storage. Either compute in the backend or send the series to a stateless ML endpoint, with a backend fallback. Show a short statistical caption beside forecasts. Never fabricate: show "insufficient data" instead of zeros.
- **Public Health page v2 (`/public-health`):** summary cards (cases last 7/14/30 days and change), district map with risk tiers, disease ranking with a disease selector, trend chart, active alerts list, 14-day forecast, data-updated time in Sri Lanka time, trilingual, mobile-first. Keep the district suppression threshold (minimum 5) for display. The existing "recorded consultation visits" view stays as a secondary tab.
- **Role views:** admin overview map and Outbreak Monitor; hospital and doctor outbreak banner for alerts in their district; pharmacy district health and top-selling medications (U11); notifications to admin and hospital with the rewritten text (U20).
- **Oracle:** the online test must show each planted scenario S1–S8 producing the expected alert/ranking/forecast direction, and S8 producing none.

---

## 9. Online test (Stage E) — plan in `ONLINE_TEST_PLAN.md`

- Test on the **live** platform with the real browser. Offline tests only where a fix needs a regression guard.
- Roles: admin, patient, doctor, hospital, pharmacy, public. Languages: EN, SI, TA. Viewports: 320, 375, 1440.
- Cover every row of `TEST_MATRIX.md` classes R, W-low, W-sec, W-clin, W-adm. Class X (delete, ban, reset, trigger, cache-clear) stays offline only.
- Complete flows, end to end: login/logout and session; password change; patient consent OTP; doctor consultation with symptoms → AI suggestion → Rx with safety check → labs → save; patient timeline and PDF download; hospital lab consent, queue and upload; pharmacy NIC retrieval, grouped prescriptions, dispense (no inventory), OTC walk-in, analytics ranges, district demand; admin users and user detail panel, approvals, outbreak monitor, broadcast, session monitor, ban management (view only), support tickets, admin accounts; public pages.
- Add: OTP workflow (each flow, 429 behavior, cool-down); cold start behavior of Render free services (first request after idle); accessibility checks; Lighthouse if the operator allows a local install; console and network error scan; Sri Lanka time everywhere.
- **Runner:** a new opt-in `full-function-live` mode that allows the application's normal API calls for authenticated roles on live, still blocking class X endpoints, unknown hosts, seed/ingest/cache-clear/trigger endpoints and any method/path not in the plan. Show the diff and the offline negatives before first use.
- **Email cost table** per flow and a schedule that respects D7; stop at 50.
- **Evidence:** per page and per flow: URL pattern, role, language, viewport, result, console errors, blocked requests, email count after. Screenshots outside the repo and OneDrive. Keep `FINAL_ACCEPTANCE_MATRIX.md` current (no blank cells).
- **User-engagement quality:** for each role measure the number of clicks and steps for the top tasks, record confusing text, missing feedback and slow screens; file findings as tracker items.

---

## 10. Cleanup and commenting (Stage F) — plan in `CLEANUP_AND_COMMENTING_PLAN.md`

- Remove dead code, unused components, routes, services, dependencies, i18n keys and tests for removed features (alerts, identity page, inventory, demo flags). Clear all ESLint warnings.
- Reorganize `scripts/`: keep what ships or runs in production; move one-off verification and harness scripts to `scripts/archive/` or delete after the operator confirms the list. Consolidate `docs/temp` into `docs/archive/` with an index. No file deleted without being listed.
- Add short comments that explain **why** (intent, security reasons, edge cases) to controllers, services, models, middleware and complex components; JSDoc for exported functions; a README per top-level folder (`client`, `server`, `ml-engine`, `scripts`, `docs`) with purpose and run steps; a root `ARCHITECTURE.md` with the request flow and data model; a complete `.env.example` with no real values.
- Consistent naming and error handling; no `console.log` in shipped code; no secrets, no personal data in the repo or history. Protected files follow the ledger rule in V1 section 2.3.

---

## 11. Stop conditions and reporting

Stop and ask (write it in `BLOCKERS.md`) when: a step needs a phrase in 3.2 or an action in 3.3; the email total would pass 50; a definition is missing; a live check fails twice after fixes; a secret appears anywhere; a deploy does not reach the pushed SHA within 15 minutes; or anything would delete or rewrite data not carrying the seed marker. Keep working on the next independent item.

Report each item like this:

```
ITEM: <id> — <title>
COMMIT: <sha> (pushed <UTC time>)
DEPLOY: <service> showed <sha> at <UTC time>
ONLINE: PASS|FAIL|NOT VERIFIED — <roles/languages/viewports>, evidence file
EMAIL: combined total after = <n> / 60
OPEN: <anything NOT VERIFIED or left for the operator>
NEXT: <id>
```

---

## 12. First actions

1. Read this file, V1, V2, `docs/agent-work/`, and the 4 to 5 Nov receipts in `docs/temp/`.
2. `git fetch`; show `git status` and `git log origin/main --oneline -5`. Protect the uncommitted C7 work (section 0).
3. Finish C7: run the full regression and production build, commit, push, confirm CI and deploy.
4. Create the ten Stage A documents in `docs/new/`, starting with `00_START_HERE_NEXT_PROMPT_TASKS_AND_PROGRESS.md`. Do not change product code in this step.
5. Commit and push the documents, then message the operator with the file list and ask for `APPROVE PLAN ALL`.

Be exact and conservative. A smaller verified result is better than a larger unverified one.


