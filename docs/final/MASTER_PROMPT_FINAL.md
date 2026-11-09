# MEDISYNC FINAL MASTER PROMPT (Complete Platform, One Run)

Save this file as:
`C:\Users\chamo\OneDrive\Desktop\Final project\medisync\docs\final\MASTER_PROMPT_FINAL.md`

Paste the section "AGENT INSTRUCTIONS" (everything below the line) into Codex or Antigravity (full access, one long run).

---

# AGENT INSTRUCTIONS

You are a senior full-stack engineer, QA lead and technical writer finishing the MediSync capstone (BSc Data Science, deadline 20 Nov 2026). You will complete every phase below, one at a time, in order. Finish a phase, verify it, push it, verify the live site, then move to the next phase automatically. Do not ask the owner for permission between phases. Stop only on the STOP CONDITIONS.

## 0. Ground rules (apply to every phase)

### 0.1 Output location
All new documentation, plans, logs, reports and state files go in:
`C:\Users\chamo\OneDrive\Desktop\Final project\medisync\docs\final\`
(repo-relative: `docs/final/`). Create the folder if missing. Existing docs elsewhere in `docs/` may be edited only where a phase says so.

Files you must create and keep updated in `docs/final/`:
- `MASTER_STATE.md` : current phase, status of every phase, last commit, next action. **Update after every task.** If your session is interrupted, a fresh agent must be able to resume from this file alone.
- `PROGRESS.md` : per-area development progress table (see Phase 9 for format). Update at the end of each phase.
- `LIVE_TEST_LOG.md` : every live-site test: date/time, role, URL, steps, expected, actual, PASS/FAIL, evidence file name.
- `OWNER_ACTIONS.md` : things only the owner can do (Atlas, Render dashboard, screenshots, citations, clinician review). Never block on these; list them and continue.
- `PHASE_<N>_REPORT.md` : one per phase: what changed, files touched, tests added, commands run, results, known gaps.
- `FINAL_STATUS.md` : written in Phase 9.
- `evidence/` : screenshots or text captures from live tests.

### 0.2 Truth rules (most important)
1. Never claim a feature exists, passes, or is deployed unless you verified it in code, a passing test, or the live site in this run. Cite file:line or the test name.
2. Never invent numbers, citations, test counts, accuracy figures or screenshots. If you cannot verify, write `UNVERIFIED` and add it to `OWNER_ACTIONS.md`.
3. These features do NOT exist and must not be claimed anywhere in code comments, UI text, docs, slides or report: appointment booking / doctor scheduling, OPD waiting queue / queue numbers, pharmacy inventory / stock endpoints, renal / hepatic / pediatric / geriatric dosing rules, QR scanning at the pharmacy to dispense, SVM / Random Forest / Naive Bayes ensemble. Do not build them either.
4. The ML triage is an unweighted lexical similarity aid with `clinicalValidation: not_established`. Never describe it as diagnostic, validated or accurate for real patients.
5. Medicine safety limits stay marked `citationStatus: "unverified_owner_must_check"` unless the owner supplies a formulary sign-off.
6. Keep honest limitation chapters (11_limitations_future_work.md, ML_DESIGN_PARAMETERS.md section 3). Update them if behavior changes; never soften them.

### 0.3 Safety rules
- The **15 protected-ledger files** (`docs/release/PROTECTED_HASHES.json`) must not be modified. Run the ledger check at the start and end of every phase; it must stay 15/15. If a task seems to need editing a protected file, STOP that task, write the reason to `OWNER_ACTIONS.md`, and implement around it (new file, wrapper, new route) instead.
- Never print, log, commit or store secrets (env values, keys, tokens, OTPs, passwords, connection strings). Never hardcode an OTP. The temporary `TEST_OTP` mechanism must stay ignored/disabled in production.
- Never put PII (NIC, name, phone, email, diagnosis) in `AuditLog.details`, console logs or error messages.
- Do not delete or modify production data except through the guarded seed tooling the repo already has. Do not create new Atlas users or databases. Use `medisync_prod` only.
- Live email budget: at most 60 emails per day total across all tests. Count them in `LIVE_TEST_LOG.md`.
- Do not add demo / temporary / synthetic labels to the live UI (owner decision). Synthetic-data disclosure belongs in docs only.

### 0.4 Git workflow
- One branch per phase: `final/pN-<slug>`. Small commits, patch-note style messages (`fix(verify): ...`, `feat(verify): ...`, `docs(final): ...`).
- Open a PR per phase, wait for CI green, merge to `main`, then confirm the Render backend `/health` shows the new commit hash before live testing. Allow up to 10 minutes for deploy; the ML service cold start of about 50 s is expected (use a 60 s timeout and retry once).
- Run before every push: `node scripts/run_offline_tests.js` (must report failed 0) and `npm --prefix client run build` (exit 0). Record counts in the phase report. Do not hardcode old counts anywhere; use the real numbers from the latest run.
- Do not add more offline-only test suites as a substitute for live testing. Add tests only for new behavior you build, plus live-site tests in Phase 7.

### 0.5 STOP CONDITIONS
Stop and write the situation to `MASTER_STATE.md` and `OWNER_ACTIONS.md` only if: (a) the protected ledger cannot stay 15/15 and no workaround exists, (b) production data would be destroyed, (c) a secret is exposed, (d) CI or live site fails the same way 3 times after real fixes. For anything else, log it, work around it, and continue.

---

## PHASE 0: Preflight, merge S10, baseline

1. Create `docs/final/` and the state files from 0.1.
2. Verify branch `fix/sub5-doc-code-reconcile` (S10): open its PR to `main` if not open, confirm CI green, merge. Confirm `main` builds and the offline gate passes (record numbers). Confirm protected ledger 15/15.
3. Wait for Render deploy; record `/health` commit hash for backend and ML in `LIVE_TEST_LOG.md`.
4. Write a **baseline** `PROGRESS.md` using only verified facts (code scan + a quick live smoke: five role logins, public health page, `/verify/:token` for one existing token).
5. Commit docs, update `MASTER_STATE.md`.

Exit criteria: S10 merged, baseline written, ledger 15/15, live smoke recorded.

---

## PHASE 1: Documentation leftover sweep (no appointments / queue / QR-at-pharmacy anywhere)

Scope: every `.md` under the repo (excluding `node_modules`, `docs/agent-work` history, `docs/temp`) plus slide outline, report chapters and exports.

1. Case-insensitive search for: `appointment`, `queue`, `book`, `schedul`, `scan` (QR context), `scans the QR`, `QR code issued`, `inventory`, `stock`, `renal`, `hepatic`, `pediatric`, `geriatric`, `Random Forest`, `SVM`, `Naive Bayes`, `482`, `34,290`, `30-day`, `3 days`, `2.5`, `NIC gate` (will be replaced in Phase 2), `[OWNER:`.
2. Known leftovers to fix in `PROJECT_OVERVIEW.md`:
   - Section 1 point 3: QR does not prevent re-filling; atomic `dispensed` status does.
   - Section 2.1 Patient: remove "Appointments / queue position"; replace with profile and language preference.
   - Section 2.1: QR is on the Consultation Summary PDF and opens the public verification page; it is not shown at pharmacies to dispense.
   - Section 2.2 Doctor: replace "Queue Management" with NIC lookup + OTP consent.
   - Section 3 data-flow diagram: remove "Books Appointment", "Prescription QR Code Issued", "Pharmacist Scans QR Code"; use NIC lookup with OTP consent for pharmacy.
3. Fix every other hit in the same truthful way. Do not edit protected files.
4. Do NOT yet rewrite the NIC-gate wording (Phase 2 replaces it); leave a `<!-- TODO-P2 -->` marker where it appears so Phase 8 can find them all.
5. Run `scripts/check_report_links.py`; must pass.
6. Add a table to `PHASE_1_REPORT.md`: file, line, old claim, new text.

Exit criteria: grep for the banned terms returns zero stale claims (list any intentional mentions, e.g., "does not exist" statements in the matrix).

---

## PHASE 2: OTP-gated QR verification page (core new feature)

### Goal
Scanning the QR on the Consultation Summary PDF opens a standalone public page (no login, no platform shell, minimal JS bundle). At scan time the server sends an OTP to the patient's registered contact. After the correct OTP, the page shows the full clinical data and the medicine release data at once. No NIC entry.

### 2.1 Plan first
Write `docs/final/PHASE_2_PLAN.md` (endpoints, data shapes, state machine, threat model, test list). Then implement without waiting for approval.

### 2.2 Backend
Reuse existing models and services where possible: `VerificationToken`, `OTPSession`, `Consultation`, `Prescription`, `Dispensing`, `Patient`, `Pharmacy`, `PharmacyStaff`, `AuditLog`, the existing email service (Resend primary, Brevo backup).

Endpoints (under `/api/verify`, keep existing public authenticity check):
1. `GET /api/verify/:token` : authenticity only. Returns `authentic`, hospital name, doctor name, consultation timestamp, `revoked/expired` state, and masked OTP destination hint (e.g., `p***@gmail.com`). **No** patient identity or clinical data. Does NOT send an OTP by itself if you can avoid it; see next.
2. `POST /api/verify/:token/otp/request` : generates and sends the OTP to the patient's registered email/phone at scan time (called automatically by the page on load). Cooldown 60 s between sends, max 5 sends per token per hour, per-IP rate limit. Always returns a generic success shape that does not reveal whether contact data exists beyond the masked hint.
3. `POST /api/verify/:token/otp/verify` (this is the "unlock" call) : body `{ otp }`. On success returns, in one response: clinical data + medicine release data (shapes below) and issues a short-lived view session (10 minutes) bound to the token, held in memory on the page (not in URL, not localStorage). On failure returns a generic error; max 3 wrong attempts per OTP session, then the OTP is invalidated and a new one must be requested.
4. `POST /api/verify/:token/history-pdf` : now authorized by the view session (or a fresh OTP) instead of the NIC. Keep `PDF_EXPORT_ENABLED` gating. Also allow downloading this consultation's PDF.
5. Keep `POST /api/verify/:token/revoke` (authorized/admin) unchanged.

OTP rules: use `OTPSession` with a new purpose value (e.g., `qr_view`), 300 s TTL, single use, constant-time comparison, hashed at rest as the existing OTP implementation does. Never log the OTP. Never use a fixed or test OTP. If the environment would fall back to a test OTP, fail closed.

Response shape (documented in `API_REFERENCE.md` later):
```
clinical: {
  consultation: { reference, date, hospital, doctor, district },
  patient: { name, ageOrDob, gender, bloodGroup, allergies },   // only what the PDF already contains
  vitals, symptoms, diagnosis: { text, icdCode, icdDescription },
  notes, followUp, prescriptions: [...], labResults: [...]
}
release: {
  overallStatus: "released" | "partially_released" | "not_released" | "cancelled",
  items: [{ drugName, dosage, frequency, durationDays, released: true|false,
            releasedAt, pharmacy: { name, district }, releasedBy: { name } }],
  dispensings: [{ receiptNo, dispensedAt, pharmacy, pharmacist, itemCount }]
}
```
Rules for the data:
- Everything in `clinical` must match what the Consultation Summary PDF contains; no extra fields.
- `release` is computed from `Prescription.status`, `Dispensing.dispensedItems`, `pharmacyId`, `staffId`. Handle: nothing dispensed, partially dispensed, fully dispensed, cancelled, OTC-originated prescription, brand substitution (`isAlternativeDispensed` + `alternativeDetails` shown as "substituted").
- Pharmacist name is shown (the owner wants "who released it"). If the data model lacks it for old records, show "not recorded", never guess.
- Decrypt fields server-side only after OTP success, using the existing encryption helpers. Do not touch protected encryption files; call them.

Audit (no PII in details): `VERIFY_SCAN`, `VERIFY_OTP_SENT`, `VERIFY_OTP_FAILED`, `VERIFY_UNLOCKED`, `VERIFY_PDF_DOWNLOADED`, `VERIFY_TOKEN_REVOKED_ACCESS_DENIED`. Include token id (not the token), IP, outcome.

Security checks to implement and test: expired/revoked token returns the same generic page state; brute-force lockout; replayed OTP rejected; OTP bound to the token; view session expires and cannot be reused across tokens; no caching headers (`Cache-Control: no-store`) on unlocked responses; no clinical data in the HTML before unlock; rate limits hold behind Render's proxy (`trust proxy` correctly set).

### 2.3 Frontend (`client/src/pages/public/VerifyConsultation.jsx` or a new standalone page)
- Route `/verify/:token`, public, **no navbar/footer/auth context loading**, lazy chunk, fast first paint. Mobile-first (the user scans with a phone).
- States: loading, authentic (with OTP box + "OTP sent to p***@..." + resend with countdown), invalid/expired/revoked, wrong OTP (attempts left), locked, unlocked, error with retry.
- Unlocked view: sectioned, readable layout: Verification banner, Clinical summary, Prescription with per-medicine **Released / Not released** badges, Release timeline (pharmacy, pharmacist, date/time), Lab results, Download PDF button, "Session expires in mm:ss", Lock now button.
- Trilingual: all new strings added to `en.js`, `si.js`, `ta.js` with exact key parity (update the parity test expectation to the real new key count, computed, not guessed).
- No demo/synthetic labels. Keep the amber "prototype, not a clinical record" disclaimer wording already used by the project if one exists in current UI; do not add new banners that the owner removed.
- Accessibility: focus management on the OTP input, aria-live for errors, 44px touch targets, works at 360 px width.
- Do not store data in localStorage/sessionStorage; clear state on lock/expiry/unload.

### 2.4 PDF QR
Confirm the QR in `server/src/utils/pdfGenerator.js` encodes `<FRONTEND_URL>/verify/<token>` with the production frontend URL and that tokens are generated for every newly exported summary. Do not modify protected files; if the generator is protected, only change the URL via config.

### 2.5 Tests (new behavior only)
Backend: OTP request cooldown and caps; wrong OTP x3 lockout; success path returns both blocks; release states (none/partial/full/cancelled/OTC/substituted); revoked/expired; replay; audit entries have no PII; `no-store` headers. Frontend: all page states, resend countdown, expiry, trilingual keys. Contract: response never contains clinical fields before unlock.

### 2.6 Live verification (Phase 7 repeats this fully, but do it here too)
Use an existing seeded patient whose contact is a mailbox the owner controls (look in `OWNER_ACTIONS.md`; if none is known, ask by writing the need there and test the pre-unlock states only). Record in `LIVE_TEST_LOG.md`. Count emails.

Exit criteria: PR merged, CI green, ledger 15/15, live page loads without platform shell, OTP email arrives, unlock shows clinical + release data, wrong OTP locks, revoked token blocked.

---

## PHASE 3: Medicine release data integrity (feeds the verify page)

1. Audit `dispensingService.js`, `Prescription`, `Dispensing` for what is recorded at release: pharmacy, staff, items, quantities, time, receipt number. Document gaps in `PHASE_3_REPORT.md`.
2. If any field the verify page needs is not captured for new dispensings (e.g., pharmacist display name, per-item released flag, partial dispense), add it in a backward-compatible way (new optional fields, no migration of protected files, no destructive changes). Old records display "not recorded".
3. Make sure duplicate dispensing still returns `Prescription is not eligible for dispensing.` (`ALREADY_DISPENSED`) and partial dispensing does not break that rule. Add tests for partial/complete transitions.
4. Make the pharmacy history and the verify page agree on the same release facts (single helper used by both).

Exit criteria: one shared release-summary function, tests passing, live check: dispense one prescription, then open its verify page after OTP and see the exact release data.

---

## PHASE 4: Clinical safety gaps (honest, minimal, deterministic)

Write `PHASE_4_PLAN.md` first.

1. **Emergency red-flag advisory (small, conservative):** add a deterministic, rule-based check that runs next to the ML suggestion on the doctor consultation screen and flags possible emergency presentations (for example: sudden severe headache with neck stiffness or photophobia; chest pain with sweating or radiation to arm/jaw; shortness of breath at rest; confusion or loss of consciousness; signs of anaphylaxis; heavy bleeding). Behavior: show a prominent **advisory** ("Possible emergency presentation: urgent clinical assessment recommended"), never change the ML ranking, never auto-diagnose, never block the doctor.
   - Keep rules in one data file with a clear `needs_clinician_review` status and source note "design heuristic, not clinically validated". Do not claim guideline provenance you cannot cite.
   - Add the 4 known failing sanity cases (SC-03, SC-05, SC-09, SC-10) as tests asserting the advisory behavior where applicable (SC-09 must trigger the advisory; SC-03 should trigger for dependent edema + breathlessness only if you include that rule).
   - Update `06_machine_learning.md`, `11_limitations_future_work.md`, `ML_DESIGN_PARAMETERS.md` honestly: the engine is now "advisory red-flag screen present, limited rule set, unvalidated"; remove the statements "zero red-flag rules" only where they are no longer true; keep the limitation that it is not a complete engine.
   - Add to `OWNER_ACTIONS.md`: have a clinician review the rule list.
2. **Medicine safety engine:** verify the five implemented checks in `ingredientResolver.js` still work end-to-end live (Warfarin + Ciprofloxacin blocks; dose ceiling; duration limit; allergy; duplicate ingredient). Do not add renal/hepatic/pediatric/geriatric claims. Optionally add a UI line stating "Checks performed: DDI, duplicate ingredient, allergy, dose ceiling, duration limit" so the doctor sees the real scope.
3. Keep `clinicalValidation: not_established` in every ML response and the amber banner.

Exit criteria: advisory live on the consultation screen, tests pass, docs updated, ledger 15/15.

---

## PHASE 5: ML coverage improvement (time-boxed, honest)

Time box: do not exceed this phase's scope; if blocked, document and move on.

1. Review `ml-engine/data/unmapped_diseases.v1.json` (491 conditions, `needs_owner_review`). Using the existing ICD-10-CM catalog and the existing mapper, try to safely auto-map additional **clearly equivalent** conditions (exact/normalized name or synonym match only). Never accept fuzzy guesses for clinical conditions. Anything uncertain stays unmapped.
2. Re-run the KB build, the evaluation scripts and `generate_report_figures.py`. Report new coverage numbers computed from the data (Tier 1 curated count, Tier 2 count, combined). Do not reuse the old 41/174/215 if they changed. Update every place the numbers appear (grep for the old values) and `CLAIMS_AUDIT.md`.
3. Re-check memory footprint with `scripts/benchmark_ml_resources.py`; must stay well under the 512 MB Render Free limit. If it does not, revert the coverage increase.
4. Keep the Tier 2 noise caveat for tropical disease profiles documented.

Exit criteria: numbers recomputed and consistent across code, docs, slides and report; or a documented "no safe additional mappings" outcome.

---

## PHASE 6: Security and operations hardening (what the agent can do)

1. Confirm and, if missing, implement: login lockout, rate limits on auth/OTP/verify endpoints, input validation on all public endpoints, secure headers, CORS limited to the production frontend, `trust proxy` correct, no stack traces in production errors.
2. Confirm field encryption round trip live (create via UI, inspect that DB-level value is ciphertext through the guarded scripts only; never print real values).
3. Confirm the production guards: `TEST_OTP*` ignored, no debug endpoints, no seed endpoints exposed.
4. Write `docs/final/SECURITY_STATUS.md`: implemented / partial / not done, with evidence. Honest list of known gaps (Atlas M0 has no automated backups; operator-key path instead of KMS/HSM; unverified medicine limits).
5. Add to `OWNER_ACTIONS.md` (agent cannot do these): tighten Atlas IP allowlist (remove 0.0.0.0/0 if still present), delete the old atlasAdmin user, rotate Redis credentials, change shared demo passwords, take a manual `mongodump` backup before the viva and store it.

Exit criteria: SECURITY_STATUS.md complete and consistent with code; ledger 15/15.

---

## PHASE 7: Full live-site testing (production), every role, every function

Rules: test on the live Vercel frontend + Render backend, using the existing five role accounts and seeded data. No new offline suites. Record every step in `LIVE_TEST_LOG.md` with evidence in `docs/final/evidence/`. If you cannot take screenshots, save response bodies with secrets/PII removed. Pre-warm both Render services first (60 s timeout).

Test matrix (each item: PASS/FAIL, fix FAILs, retest):
- **Public:** home, language switch EN/SI/TA, `/public-health` map and counts, advisories display, 503 handling when ML is cold, no broken routes (`/advisories`, `/lab/orders` must not be linked).
- **Auth:** all five roles login/logout, wrong password lockout behavior, OTP flow, password reset (budget emails), token refresh, session expiry.
- **Patient:** timeline, prescriptions list, profile and language preference, consent flow, summary email resend, PDF download.
- **Doctor:** NIC lookup + OTP consent, vitals, symptom entry, ML analysis (cold start tolerant), red-flag advisory, ICD-10-CM search, prescription authoring, safety engine blocks (Warfarin + Ciprofloxacin), save consultation (no 409), idempotency, summary email, PDF with QR.
- **Pharmacy:** NIC + consent, pending prescriptions, dispense, duplicate dispense error exact message, OTC dispense, history, receipt, district demand, analytics date presets.
- **Hospital/Lab:** lab test management at `/hospital/dashboard/tests`, report upload (valid PDF accepted, non-PDF rejected), notifications to doctor and patient.
- **Admin:** user management, audit logs (entries for new verify actions), outbreak monitor, manual scan, approve/resolve alert (note >= 5 chars), system health, ML status.
- **Verify page (end to end):** scan flow using the real PDF QR or its URL: authentic state, OTP email arrives, wrong OTP, correct OTP unlock, clinical data equals the PDF, release data matches pharmacy history, PDF download, session expiry, lock now, revoked token, expired token.
- **Surveillance:** alerts consistent with 7-day vs 56-day baseline, N >= 5, 2 consecutive days, z > 2.0; map colors; 14-day projection label "Descriptive projection; not a validated clinical forecast".
- **Cross-cutting:** mobile width (360 px) for public pages and verify page, no console errors, no secrets in network responses, ChunkLoadError after deploy handled with a reload prompt (implement a minimal handler if absent).

Fix any FAIL on a phase branch, merge, redeploy, retest. Summarize in `PHASE_7_REPORT.md` with counts of PASS/FAIL and remaining known issues.

---

## PHASE 8: Final reconciliation

1. Update `FEATURE_EXISTENCE_MATRIX.md`: re-audit all features, add new rows for the OTP-gated verify page, release data page, red-flag advisory. Every row needs file:line or test evidence.
2. Replace every `<!-- TODO-P2 -->` and every "NIC gate" mention with the OTP-gated description (`API_REFERENCE.md`, `DATA_MODEL.md` incl. OTP purpose and audit actions, `DEMO_SCRIPT.md` step 2, `PROJECT_OVERVIEW.md`, slides, report chapters, `CLAIMS_AUDIT.md`).
3. Recompute and update all numbers from real gates: test suites/tests, translation key count, ML counts, memory footprint, endpoint list. No stale values.
4. Regenerate all figures (`generate_report_figures.py`) and the technical report assembly; run `scripts/check_report_links.py`.
5. Add citation placeholders list to `OWNER_ACTIONS.md` for every remaining `[OWNER: cite ...]`.
6. Update `DEMO_SCRIPT.md` so the viva walkthrough matches the live flow exactly (including the verify page OTP flow and a contingency if OTP email is slow).
7. Update `CLAIMS_AUDIT.md` with a Phase-final section.

Exit criteria: zero stale claims by grep; link check passes; matrix matches code.

---

## PHASE 9: Release readiness and honest final status

1. Final gates: offline suite failed 0, client build 0, protected ledger 15/15, CI green on `main`, Render backend and ML `/health` on the final commit, live smoke of all five roles + verify page.
2. Tag the release (`v1.0.0-capstone`) on the final `main` commit.
3. Write `docs/final/PROGRESS.md` in this exact format (percent = verified items / total items in that area; list the items):

| Area | Items | Verified live | Verified in tests only | Not done / limitation | % |
|---|---|---|---|---|---|

Areas: Auth & roles; Patient portal; Doctor consultation; ML triage; Medicine safety; Pharmacy dispensing; Lab; Outbreak surveillance; Public health & map; Trilingual UI; QR verification + release page; PDF export; Security; Deployment & operations; Documentation consistency.

4. Write `FINAL_STATUS.md`: overall verified percentage, what is complete, what is intentionally not built (appointments, queue, inventory, organ/age rules, validated clinical accuracy), what depends on the owner (`OWNER_ACTIONS.md`), and known risks for the viva (cold start, OTP email latency, Atlas M0 without backups).
5. Update `MASTER_STATE.md` to `COMPLETE` and print a short final summary.

---

## Order of work and resume protocol
Phase 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9. After each task update `MASTER_STATE.md`. If you start a new session, read `docs/final/MASTER_STATE.md` first and continue from the recorded next action. Never redo completed phases; re-run only the cheap verification gates.

## Final response format (after Phase 9)
Reply with: overall verified progress %, table from `PROGRESS.md`, list of PRs merged, final commit hash, open items in `OWNER_ACTIONS.md`, and any FAIL left in `LIVE_TEST_LOG.md`.
