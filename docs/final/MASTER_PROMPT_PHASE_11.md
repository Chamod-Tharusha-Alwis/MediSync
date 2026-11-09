# MEDISYNC MASTER PROMPT: PHASE 11 (fix everything found in live testing) + PHASE 10 (override, medicine coverage, auto-supersede)

Save as: `C:\Users\chamo\OneDrive\Desktop\Final project\medisync\docs\final\MASTER_PROMPT_PHASE_11.md`
Usage: attach this file to the agent (full access) and send **continue**. It runs everything below, in order, with no questions, until `docs/final/MASTER_STATE.md` says `COMPLETE`.

---

# AGENT INSTRUCTIONS

## 0. Autonomous mode and ground rules

All rules from `docs/final/MASTER_PROMPT_FINAL.md` (sections 0.1 to 0.5 and AUTONOMOUS MODE) still apply: never ask the owner anything or wait for approval, self-verify every task, log owner-only items in `docs/final/OWNER_ACTIONS.md` and continue, save state in `docs/final/MASTER_STATE.md` after every task, resume from it on "continue". Only two things halt the run: production data about to be destroyed, or an exposed secret.

Additional rules for this run:
1. **Truth rules:** never claim anything unverified; cite file:line, a passing test, or a live check. No appointment, queue, inventory, organ/age dosing, or QR-scan-to-dispense features exist or may be claimed.
2. **Protected ledger stays 15/15 byte-exact.** `.gitattributes` already locks protected paths to `-text`; keep it. Prefer new files, wrappers, new routes. If a protected file truly must change, make the minimal edit, update only that file's entry in `docs/release/PROTECTED_HASHES.json`, and record file, reason, old hash, new hash in `docs/final/LEDGER_CHANGELOG.md`. Check the ledger on a clean checkout before every merge.
3. **No PII in logs or audit `details`** (no NIC, name, email, phone, diagnosis, drug names, OTP, token). Never hardcode an OTP.
4. **Email budget:** the live tests share the daily email cap. Count every email you trigger in `LIVE_TEST_LOG.md`; stay under 40 for this whole run. Prefer automated tests with the mail transport mocked, and use live email only for final confirmation.
5. Git: one branch per task `final/p11-<slug>`, small commits, PR, CI green (both workflows: "Security Hardening & Trust Governance Tests" and "MediSync Clinical Offline Verification"), merge, confirm the Render backend `/health` commit hash, and confirm the Vercel production build contains the new client commit (see Task A5), then live-test.
6. UI must not show demo/synthetic labels (owner decision). Disclosures belong in docs.
7. Run `node scripts/run_offline_tests.js` (failed 0) and `npm --prefix client run build` before every push. Use real test counts everywhere; never copy old numbers.

## 1. Evidence from the owner's live test (reproduce each one first, record in `docs/final/PHASE_11_FINDINGS.md`)

| # | Observation (10 Nov 2026, live site) | Severity |
|---|---|---|
| F1 | "Consultation Summary" email body shows diagnosis, clinical notes, follow-up and every medication in the Gmail preview; the PDF attachment preview in Gmail also renders the full clinical page. PDF is not password-locked. | **Privacy: critical** |
| F2 | PDF layout: header "Consult Ref" is hidden under the QR code; diagonal watermark text overlaps body text; "SLMC Registration: SLMC-REG-VERIFIED" is a placeholder, not a real number; no doctor ID; Patient NIC and Age print "N/A"; PDF date/time shows UTC (09 Nov, 06:33 pm) while the app and email show Sri Lanka time (10 Nov, 12:03 am). | High |
| F3 | Pharmacy "Dispensation History" and receipts show the patient NIC in a column; OTC checkout and dispense screens print the NIC again in headers/summaries. Owner wants the patient's name instead. | **Privacy: high** |
| F4 | Raw text `clinicalValidation: not_established` shown to users on the public verify page (top bar), on the ML card, and on the Medicine Safety card. It is an internal API key, not user-facing text. The verify page is not an ML feature at all. | Medium |
| F5 | Lab report upload for `LT-20261109-4514`: toast "Upload failed. Check file content." with `POST .../upload-report` returning **409**; the server log shows a "Your Report Is Ready" email for that test was already sent at 19:07 UTC, so a first upload succeeded. The hospital lab view and the patient timeline still show the test as **Pending**. | High |
| F6 | OTC checkout: toast "Dispensing could not be completed atomically. Retry the same checkout." Dropdown label reads "Select Stock Drug..." (implies inventory, which does not exist). | High |
| F7 | Doctor safety panel says "No known reference interactions detected" and "at least two valid medications are required for pairwise interaction checking", but saving shows a red toast "Medication Safety Conflict: Prescribed drugs conflict with patient active medications or safety rules". The client panel and the server use different checks (the server includes the patient's active medications; the panel does not). | High |
| F8 | Console: `GET /api/alerts/active` returns **401** although API_REFERENCE documents it as Public; `GET /api/public/...?days=30&district=all` returns **503** (`REPORTING_REVIEW_REQUIRED`, logged as `[PublicHealth] stage=SOURCE_READ_AND_VERIFY`) on every public health load. | High |
| F9 | Render ML service dashboard shows "No logs to show" (last logs 14 hours ago) even though ML suggestions are working on the doctor screen (hepatitis A 44.82%, Dengue 41.24%, Chicken pox 40.99% for high fever + joint pain + mild fever). The ML service has no request logging, so nothing proves traffic reaches it and a silent fallback could hide an outage. | Medium |
| F10 | Server log: about 26 emails in one hour. Every login sends "Login from NEW Unrecognized Device (Windows - Chrome)" for the same browser; six "Medication Has Been Dispensed" emails within 90 seconds. Wastes the email quota and trains users to ignore security alerts. | Medium |
| F11 | Audit log does not cover every action; admin cannot search users or audit entries by email. | Medium |
| F12 | Formulary typo "Penicitin Capsule 10'S" (should be Penicillin) and typed "Citalopr" showed "Unresolved ingredient(s)". Diagnosis `6A70` (an ICD-11 code) is labelled ICD-10. Patient has many overlapping active prescriptions (pharmacy shows "8 items across 7 orders"). | Medium |

## 2. Task order

P11-A privacy fixes -> P11-B lab upload and status -> P11-C OTC atomic error -> P11-D (merged into Phase 10 Task A) -> P11-E audit + search -> P11-F public health and alerts -> P11-G ML logging -> P11-H email noise -> P11-I data quality -> **Phase 10 Tasks A to D** (read `docs/final/PHASE_10_ADDON_PROMPT.md` and execute exactly as written, with the additions in Section 4) -> P11-Z final reconcile.

---

## 3. P11 tasks

### P11-A: Privacy fixes (do first)

**A1. Emails carry no clinical data.**
- Replace the consultation summary email with a notification only: generic subject ("MediSync: your consultation summary is ready"), greeting by first name, the consultation reference, date (Asia/Colombo), and a secure link to `/verify/:token` (OTP-gated, already built) or the patient portal. **No diagnosis, notes, drug names, doses, lab names or follow-up details in subject, preheader or body, and no PDF attachment.**
- Sweep every email template (consultation summary and resend, medication dispensed, lab consent, lab approved/sample collected/in progress/report ready, outbreak or advisory mails, OTP, login alerts, password reset). Remove diagnosis, drug names, test names and any other clinical or identifying detail. Keep only generic status text plus a link. List each template and its before/after in the phase report.
- Add a test that renders every template with realistic clinical input and asserts none of the input's clinical strings appear in the HTML, text, or subject.

**A2. PDF is locked.**
- Patient/doctor PDF downloads (consultation summary, history PDF, lab report) must be **encrypted**: AES-256 with a user password and owner permissions that disallow copying and editing (printing allowed). Use the PDF library's built-in encryption if available, otherwise a small post-processing step (e.g., qpdf or pdf-lib) in a **new module**; do not edit protected PDF code unless unavoidable (see ledger rule).
- Default user password: the patient's NIC (upper case, no spaces). If the NIC is unavailable, use the consultation reference and say so in the UI. Show a clear instruction next to every download button ("Open with your NIC number"), in en/si/ta with key parity.
- Do not claim the PDF password is strong security; the OTP-gated page is the primary secure channel. Document this in `SECURITY_STATUS.md`.
- Test: the generated bytes contain the `/Encrypt` dictionary, cannot be text-extracted without the password, and open with it.

**A3. PDF content and layout.**
- Fix the header so Consult Ref, date and time are never covered by the QR code (place the QR in its own box with spacing).
- Remove or move the diagonal watermark so it never overlaps readable text (light, behind content, or only in the footer band).
- Add the doctor's identifier block: doctor name, specialty, hospital/workspace, and the doctor's **real SLMC registration number from the doctor profile**. Delete the placeholder `SLMC-REG-VERIFIED`; if no number is on file print "SLMC reg. no.: not on file". Add the internal doctor ID (short, non-sensitive form).
- Patient block: print name; show NIC masked (e.g., first 3 and last 3 characters) only; compute age from date of birth when present; **omit** lines that would print "N/A".
- Time zone: render all dates and times in Asia/Colombo and label it ("Sri Lanka time"). Use the same helper in the email, PDF, verify page and timeline so they agree.
- Layout robustness: wrap long text, paginate cleanly with repeated header and page numbers, no overlap with long diagnosis, 20 medications, or Sinhala/Tamil text (use the existing safe-text fallback and do not emit tofu boxes).
- Verification: render PDFs for a short case, a very long case (20 drugs, long notes) and an unlocked-for-test copy; convert pages to PNG, inspect them yourself at full size, and save under `docs/final/evidence/`.

**A4. No NIC on pharmacy screens.**
- Dispensation History table, receipts (screen and PDF), dispense console result header ("Active prescriptions for NIC ..."), OTC order summary, analytics tables, exports, and the admin audit view: show the **patient's full name** (decrypted server-side) instead of the NIC. The NIC may appear only inside the input field where the user types it for lookup.
- Sweep the whole client for other places that display a NIC (doctor lists, lab views, patient pages, admin tables, toasts, PDF/CSV exports) and apply the same rule except the patient's own profile page. List every place changed.
- Test: API responses for pharmacy history/receipts contain `patientName` and no `nic`/`patientNic` plaintext fields.

**A5. Remove raw `clinicalValidation` text from the UI.**
- Search the whole client for rendered `clinicalValidation` strings. The key stays in API responses and ML payloads (and in docs as an API field). In the UI show human wording only:
  - ML card: "Reference matches only. A clinician must assess; matches are not diagnoses and scores are not probabilities."
  - Medicine safety card: "Advisory reference. Clinical assessment required."
  - Public verify page: **remove it completely** (the page is not about ML).
- Update the tests that currently assert the raw text (e.g., `c4-ai-resilience.test.jsx`) so they assert the human-readable advisory component and that the API field is still present. This is a deliberate UI change, not removal of the disclaimer; keep a test that an advisory is always visible next to ML output.
- Deployment proof: expose the client build commit (build-time env into a `<meta name="app-commit">` tag and the footer), then confirm on the live domain `medisync.chamodtharusha.com.lk` that the served commit equals `main`. If Vercel did not deploy the latest commit, record it in `OWNER_ACTIONS.md` with the exact step (redeploy production from `main`).

### P11-B: Lab report upload (409) and status updates
1. Reproduce with test `LT-20261109-4514` (or a fresh lab test). Find why the endpoint returns 409 (already uploaded, status guard, idempotency key reuse, or version conflict) and why the UI still says "Upload failed. Check file content."
2. Define and document the lab test state machine (approved/consented -> sample collected -> in progress -> report uploaded/ready) with allowed transitions.
3. Upload must be **idempotent**: re-uploading the same file hash returns the existing result (200) not 409. A different file for a test that already has a report is either rejected with a clear 409 body (`REPORT_ALREADY_EXISTS`) or handled as an explicit "replace report" with version history; pick one, document it.
4. Frontend: map error codes to precise messages (not a PDF -> "Please choose a valid PDF"; already uploaded -> "A report is already attached to this test"; auth/expired -> reason), and **refetch state after every upload attempt** so the status badge updates immediately.
5. Status must propagate everywhere: hospital lab list, doctor's view of ordered tests, **patient timeline "Recommended lab tests"** (currently stuck on Pending), and the notification. Add a derived `labStatus` used by all views.
6. Tests: first upload OK and status becomes ready everywhere; repeat upload; non-PDF; oversized; wrong lab; consent missing. Live-test with a valid PDF (count emails).

### P11-C: OTC and dispense atomic failures
1. Reproduce "Dispensing could not be completed atomically. Retry the same checkout." on OTC checkout (Paracetamol 500mg, qty 1).
2. Root cause (likely a transient Mongo transaction error on the Atlas M0 replica set or idempotency key reuse after a first success). Implement bounded retry with backoff for `TransientTransactionError` / `UnknownTransactionCommitResult` inside the service, keep the idempotency guarantee (same key + same payload returns the original receipt), and keep `ALREADY_DISPENSED` ("Prescription is not eligible for dispensing.") as a hard stop for real duplicates.
3. UI: replace "Select Stock Drug..." with "Select drug". No inventory wording anywhere.
4. Tests for retry, idempotent replay, genuine duplicate, concurrent double-click. Live-test one OTC checkout.

### P11-E: Audit log completeness and email search
1. Build an **audit coverage matrix** (`docs/final/AUDIT_COVERAGE.md`): every state-changing or sensitive-read route (all POST/PUT/PATCH/DELETE and sensitive GETs) mapped to an audit action. Write a test that scans the route files and fails if any mutating route lacks an audit call or an explicit documented exemption.
2. Ensure audit entries exist for at least: login success/failure/lockout, logout, OTP request/verify, password reset, device trust/revoke, consent request/verify, patient record view, consultation create/update/follow-up, prescription create, safety override (Phase 10), supersede (Phase 10), dispense, OTC dispense, receipt view, lab order/consent/sample/progress/upload/report view/download, PDF export, summary email sent/resent, verify scan/OTP/unlock/PDF, token revoke, user create/suspend/activate/role change, outbreak trigger/approve/resolve/review, settings changes, audit-log views and exports by admins.
3. **Search by email without storing PII in the log:** keep `actorId` and `actorRole` in the entry; in the admin audit endpoint, resolve `email` -> user id(s) (patients, doctors, pharmacy staff, hospital, admin) at query time using the existing blind index or lookup, then filter by id. The admin UI shows the resolved name/email next to each row (admin-only, joined at read time). Add filters for action, role, date range, outcome. Keep entries append-only.
4. Users page (`/admin/dashboard/users`): add search by email, name, role and status, with pagination.
5. Tests for the coverage scan, email-resolved search, no PII stored, admin-only access, pagination. Live-check that the audit page shows the new actions after performing them.

### P11-F: Public health 503 and alerts 401
1. **`/api/alerts/active` 401:** API_REFERENCE says Public. Find why it requires auth (middleware order or a banner calling the wrong endpoint). Make a public endpoint that returns only active/confirmed alerts with no PII and no auth, rate-limited; the banner must work for logged-out visitors and for all roles. Fix whichever of code or docs is wrong.
2. **`REPORTING_REVIEW_REQUIRED` 503:** the fail-closed rule (never publish unverified counts as verified) stays, but the public endpoint must not return 503 for the normal case "no verified data yet". Return 200 with: `verifiedCases` (only consultations whose `surveillanceVerification.status` is `verified`), `awaitingReviewCount` (count only, clearly labelled "awaiting epidemiologist review", never shown as cases on the map), `state` (`ok` / `no_verified_data`), and a UI banner explaining the state in en/si/ta. Excluding unverified rows must be transparent, never silent.
3. **Make the surveillance pipeline demonstrable:** find how a consultation becomes `verified`. If an admin or epidemiologist review action already exists, verify it works end to end live. If not, add a minimal admin "Surveillance review" list (filters: district, disease, date) with verify/reject for single and bulk selection, audit-logged, role-restricted, no auto-verification. Then confirm that verified consultations feed the 7-day vs 56-day detector, the map, and the alert gates (N >= 5, 2 consecutive days, z > 2.0).
4. Update `DEMO_SCRIPT.md` step 5 with the exact click path (review consultations -> map updates -> alert), and the report chapter.
5. Tests: 200 with zero verified; mixed verified/unverified; reviewer verifies -> counts appear; public alert endpoint without auth; gates unchanged. Live-test all three public views in en/si/ta.

### P11-G: ML service logging and proof of use
1. Determine why Render ML logs are empty: no request logging (e.g., gunicorn without access log), logs only at startup, or traffic not reaching the service (silent backend fallback). Do not assume the ML engine is broken: it answers on the live doctor screen.
2. Add structured logging to `ml-engine/app.py` and the Procfile/start command: startup line (model and KB versions, concept counts, RSS memory), one line per request (`request_id`, method, path, status, latency ms, number of input symptoms, tier used, top confidence), error lines with stack summary. **No symptom text and no PII in logs.** Flush to stdout so Render shows it.
3. Backend: log `[ML] predict_disease status=<code> latency_ms=<n> tier=<...>` per call. If any fallback path exists when the ML call fails, the response must carry `source: "ml-engine" | "fallback"` and the UI must say when the ML service was unavailable; it must never silently present fallback output as ML output. Document the finding.
4. Proof: pre-warm, read `/metrics` (query counter), run one analysis through the live doctor flow, read `/metrics` again and show the counter increased; capture the new log lines if readable, otherwise add to `OWNER_ACTIONS.md` how to open them in the Render dashboard.
5. Add to `OWNER_ACTIONS.md`: raise the UptimeRobot timeout for the ML and backend monitors to 60 s (Render cold start is about 50 s) or accept the expected "Down" flaps; add a pre-viva warm-up routine (curl `/health` for both services 3 minutes before).

### P11-H: Email noise
1. Fix "new unrecognized device" alerts firing on every login from the same browser: persist the trusted-device marker after a successful OTP login (hashed, httpOnly cookie or device record), send the alert only for genuinely new devices, and throttle to once per device per 24 hours.
2. Send one "medication dispensed" email per dispensing event (per consultation order), not per line item or double-click.
3. Add a per-day email counter in the server log (counts only) and a warning line at 80% of the provider's daily cap (read the cap from config; default 100).
4. Tests: repeated logins from one device, new device, multi-line dispense, throttle.

### P11-I: Data quality
1. Fix formulary typo "Penicitin" -> "Penicillin" (brand names, search index, tests); run a spell/duplicate sanity scan over brand names and list suspected typos in the report without guessing clinical corrections you cannot verify.
2. Phase 10 Task D covers the ICD-11 `6A70` mislabel.
3. Patient detail screens: when contact, blood group or date of birth are missing, show "Not provided" in a neutral style (not red N/A) and never imply an error.

---

## 4. Phase 10 (execute from `docs/final/PHASE_10_ADDON_PROMPT.md`) with these additions

- **Task A (doctor override):** include finding F7. The safety panel and the server must use **one shared function** that evaluates the current prescription **plus the patient's active medications** (using Task C's `activeState`). The panel must name the conflict ("Ciprofloxacin (this prescription) vs Warfarin (active, CON-xxxx, ends dd Mmm)"), show each finding once (no duplicate cards), and show the acknowledgment flow instead of the red blocking toast. Doctors are never blocked; severe/critical need a reason; override is audited and shown downstream. Rename screenshot SS-13 in `SCREENSHOT_CHECKLIST.md` to `ss13_medicine_safety_acknowledgment.png` and update its description.
- **Task B (medicine coverage):** also verify the `Penicillin` fix and `Citalopram` resolution; report coverage numbers computed by the script.
- **Task C (auto-supersede):** include the case seen live (patient with 8 active items across 7 orders: duplicates must collapse by the supersede rule; show the before/after on the pharmacy pending list).
- **Task D (ICD label):** unchanged.

## 5. P11-Z: Final reconcile and release
1. Re-run the full live test matrix from MASTER_PROMPT_FINAL Phase 7, plus new checks: encrypted PDF opens only with the password and looks clean; email previews contain no clinical data (inspect the sent HTML in tests and one real email); no NIC on pharmacy screens; no raw `clinicalValidation` text; lab upload and status propagation; OTC checkout; public health 200 with and without verified data; alerts banner as logged-out visitor; ML `/metrics` increments; audit coverage and email search; verify page OTP flow end to end (owner mailbox known from earlier runs; if not available mark `BLOCKED-OWNER`).
2. Update `FEATURE_EXISTENCE_MATRIX.md`, `CLAIMS_AUDIT.md`, `API_REFERENCE.md`, `DATA_MODEL.md`, `DEMO_SCRIPT.md`, `SLIDES_OUTLINE.md`, report chapters, `SECURITY_STATUS.md`, `11_limitations_future_work.md`, `SCREENSHOT_CHECKLIST.md`, `PROGRESS.md` (percentages only from verified evidence, listing the live checks). Recompute translation key counts, test counts and ML/medicine coverage from real runs. Regenerate figures, run `check_report_links.py`.
3. `OWNER_ACTIONS.md` must contain at least: enable GitHub branch protection on `main` requiring both CI workflows (GitHub shows "Your main branch isn't protected"); redeploy Vercel production from `main` if the served commit differs; set UptimeRobot timeout to 60 s; use a **synthetic patient NIC** for all report/viva screenshots (current screenshots show a NIC in several screens, including pharmacy history); confirm the patient mailbox for the OTP demo; clinician review of severity mapping, red-flag rules and the acknowledgment wording; Atlas IP allowlist, delete legacy atlasAdmin user, rotate Redis token, rotate shared demo passwords, take a `mongodump` backup before the viva; the four citation placeholders.
4. Final gates: offline suite failed 0, client build 0, ledger 15/15 on a clean checkout, CI green on `main`, Render backend and ML `/health` on the final commit, live smoke for all five roles and the verify page.
5. Tag `v1.1.0-capstone` on the final `main` commit (do not move `v1.0.0-capstone`). Write `docs/final/FINAL_STATUS.md` with an honest per-area table (verified live / tests only / limitation), the open `BLOCKED-OWNER` items, and known issues. Set `MASTER_STATE.md` to `COMPLETE`.

## 6. Final response format
Overall verified progress, table from `PROGRESS.md`, findings F1 to F12 each marked FIXED / PARTIAL / BLOCKED-OWNER with evidence pointers, PR list, final commit hash, test counts, email count used, open owner actions.
