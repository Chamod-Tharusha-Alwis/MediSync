# MEDISYNC PHASE 10 ADD-ON PROMPT
Save as: `C:\Users\chamo\OneDrive\Desktop\Final project\medisync\docs\final\PHASE_10_ADDON_PROMPT.md`
Usage: attach to the agent and send **continue**. Same autonomous rules as `MASTER_PROMPT_FINAL.md` (no questions, self-verify, log owner items in `OWNER_ACTIONS.md`, state in `docs/final/MASTER_STATE.md`, one branch per task `final/p10-<slug>`, PR, CI green, merge, confirm Render commit, live test). All outputs go in `docs/final/`.

---

# AGENT INSTRUCTIONS

## 0. Rules that still apply
- Truth rules from MASTER_PROMPT_FINAL section 0.2 and safety rules 0.3 apply unchanged (no invented numbers, no fake claims, no secrets, no PII in logs, no appointment/queue/inventory features).
- **Protected ledger (15 files) stays 15/15 byte-exact.** Prefer new files, wrappers and new routes over editing protected files. Preserve line endings exactly: first add a `.gitattributes` entry (`-text`) for every protected path so git can never convert CRLF/LF again (this already broke CI once, commit `6dfe9be`). If a protected file genuinely cannot be left alone, treat it as a controlled change: make the minimal edit, update only that file's entry in `docs/release/PROTECTED_HASHES.json`, and record file, reason, old hash, new hash in `docs/final/LEDGER_CHANGELOG.md` and the phase report. Never touch a protected file otherwise.
- ML disclaimer and `clinicalValidation: not_established` stay everywhere.

## TASK A: Doctor-responsibility override (never block the doctor)

Owner decision: the safety engine must **warn, never block**. When the engine finds a problem, the doctor can continue after explicitly accepting responsibility. The decision is recorded and visible to everyone downstream.

1. Find every place the doctor flow currently hard-blocks (drug-drug interaction, dose ceiling, duration limit, patient allergy match, duplicate ingredient, unresolved ingredient, the existing blocking modal in `NewConsultation.jsx`, and the server-side rejection in the consultation create path and `/api/prescriptions/check-safety`). List them in `PHASE_10A_REPORT.md`.
2. Replace hard blocks with a severity-based acknowledgment:
   - Each finding has a severity (`info`, `moderate`, `severe`, `critical`) taken from the existing data; if missing, map conservatively (known severe DDI, allergy match, over dose ceiling = `severe`).
   - UI: a clear warning card per finding (what, why, source file) and one **"I have reviewed these warnings and accept clinical responsibility"** confirmation covering all findings. For `severe` and `critical` findings require a short reason (min 5 characters, max 250). `info`/`moderate` need only the confirmation. The Save/Issue button is never permanently disabled; it enables after the confirmation (and reason where required).
   - Server: the create-consultation route accepts the prescription with findings when the request carries `safetyAcknowledgment: { acknowledged: true, reason, findingsHash }`. The server **recomputes the findings itself** (never trust the client), compares to `findingsHash`, and rejects only a mismatch or a missing acknowledgment when findings exist (a validation response telling the client to show the acknowledgment, not a clinical block). Without findings, no acknowledgment is needed.
3. Persist the override on the prescription/consultation (new optional fields, backward compatible): `safetyOverride: { acknowledged, acknowledgedAt, doctorId, reason, findings: [{type, severity, items, summary}] }`. Encrypt `reason` with the existing field encryption helper if free-text clinical notes are encrypted elsewhere.
4. Make the override visible:
   - Consultation Summary PDF: a line "Doctor acknowledged safety warnings: <types>" (no reason text on the public side). Do not modify protected PDF code if it is protected; extend through a new helper or config.
   - Pharmacy dispense screen: a visible badge "Prescriber acknowledged safety warnings" with finding types, so the pharmacist can apply their own judgment. The pharmacist-side allergy check should also warn-and-acknowledge instead of hard-blocking, with a reason recorded in the dispensing record. **The duplicate-dispense rule stays a hard stop** (`Prescription is not eligible for dispensing.` code `ALREADY_DISPENSED`); that is an integrity rule, not a clinical warning.
   - Verify page (after OTP unlock): show "Safety warnings acknowledged by prescriber" (types only).
   - Audit log: `PRESCRIPTION_SAFETY_OVERRIDE` with doctor id, consultation id, finding types and severities, no PII, no reason text.
5. Wording changes everywhere (code comments, UI strings in en/si/ta with key parity, `DEMO_SCRIPT.md` step 3, `API_REFERENCE.md`, `DATA_MODEL.md`, `FEATURE_EXISTENCE_MATRIX.md`, `CLAIMS_AUDIT.md`, `SLIDES_OUTLINE.md`, TECHNICAL_REPORT chapters): replace "blocks" / "instant blocking alert" with "warns and requires prescriber acknowledgment". Add to `11_limitations_future_work.md`: the engine is advisory; the prescriber carries responsibility; no medico-legal claim is made by the prototype.
6. Tests: each finding type with and without acknowledgment; tampered `findingsHash`; severe with short/missing reason; findings recomputed server-side; audit entry has no PII; pharmacist badge; PDF line; verify-page line; duplicate dispense still hard-blocked. Live-test with Warfarin + Ciprofloxacin: warning shows, acknowledgment saves, pharmacy sees the badge.

## TASK B: Medicine catalog coverage (be honest: "all medicines in the world" is not claimable)

1. Do **not** claim the platform contains every medicine. Measure and report coverage instead.
2. Locate the formulary/ingredient data (`server/reference-data`, `ingredientResolver.js`, drug search `/api/drugs/search`, `medicine_safety_limits.json`, `interactions_clean.json`). Write `scripts/audit_medicine_coverage.js` (or .py) that reports: number of brands, generic ingredients, ingredients with a safety limit, ingredients in at least one interaction pair, and ingredients with neither (these produce the "Unresolved ingredient(s)" warning seen in the UI).
3. Coverage benchmark: compare the platform's ingredient list against the WHO Model List of Essential Medicines (latest edition you can obtain from the repo, a vendored file, or the network) and, if available, an ATC substance list. If no reference list can be obtained, add the need to `OWNER_ACTIONS.md` and benchmark against the most common ~300 generic drugs you can list from the repo's own data; label this clearly as an internal list. Report `% resolved` and list every missing ingredient in `docs/final/data/medicine_coverage_gaps.json`.
4. Fix the typed-prefix problem seen live: typing `Citalopr` showed "Unresolved ingredient(s): citalopr". Required behavior:
   - Drug search/autocomplete must suggest matches by prefix and close spelling (`citalopr` -> `citalopram`), brand and generic.
   - Never auto-substitute silently. The doctor must pick a suggestion; free text stays allowed.
   - Free-text or unresolved drugs remain allowed under Task A (warning + acknowledgment), and the "Automated interaction checking is incomplete" warning stays truthful. Show it once, not twice (the screenshot repeats the same message in two cards).
5. Add missing high-frequency generics that exist in the benchmark (name, ATC code if known, common strengths, forms) to the formulary data. **Do not invent dose ceilings or interaction pairs.** New ingredients without a verified limit get `citationStatus: "unverified_owner_must_check"` and no numeric ceiling; they resolve (no more "unresolved" noise) but the UI says "No dose ceiling on file for this ingredient". Verify citalopram specifically resolves and its known coverage state is reported.
6. Document the coverage numbers (computed by the script, not typed from memory) in `docs/final/MEDICINE_COVERAGE.md`, `11_limitations_future_work.md`, report chapter on the safety engine, and `CLAIMS_AUDIT.md`. State limitation: coverage is partial; unlisted medicines are handled by the incomplete-checking warning.

## TASK C: Auto-expiry / supersession of repeated medication

Rule: when a new consultation prescribes an ingredient that the same patient already has an **active** prescription for, the older one is automatically ended (superseded) by the newer one.

1. Definitions:
   - A prescription line is **active** if its prescription is not cancelled/superseded and `now < startDate + durationDays` (startDate = consultation date, or `dispensedAt` if dispensed; document which you use). Compute `activeState` (`active`, `expired`, `superseded`, `cancelled`) with a shared helper used everywhere; no cron job required for time-based expiry.
   - **Same medicine** = identical resolved active-ingredient set. Different strength/dose of the same ingredient still counts (it is a dose change). Partial overlap (e.g., combination product sharing one ingredient) does not supersede; it triggers the existing duplicate-ingredient warning only.
2. On saving a new consultation (inside the same transaction/atomic section as creation): for each new line, find the patient's active lines with the same ingredient set, mark them `supersededBy` (new prescription id), `supersededAt`, `supersededReason: "newer_prescription_same_medicine"`. Never delete. If the older prescription was **pending (not dispensed)**, it becomes non-dispensable so the patient cannot get the same drug twice from two slips. If it was already dispensed, keep the dispensing history untouched and just end the active course.
3. `Prescription.status` enum is `pending | dispensed | cancelled`. Prefer **additive fields + the derived `activeState`** over changing the enum. If an enum change is unavoidable, make it backward compatible and migrate nothing destructively.
4. The doctor sees an informational (non-blocking) notice before saving: "Citalopram is currently active from CON-xxxx (started <date>, <n> days left). Saving will replace it." No confirmation step beyond Task A.
5. Downstream behavior:
   - Pharmacy pending list excludes superseded/expired lines; `dispensingService` re-checks supersession atomically at dispense time (race-safe) and returns the existing `Prescription is not eligible for dispensing.` style error with a distinct code (e.g., `SUPERSEDED`) for superseded lines.
   - Patient timeline and active-medication view show "Replaced by newer prescription on <date>" and "Expired on <date>" states.
   - Verify page release block: superseded lines show "Replaced by newer prescription", expired show "Course ended", not a misleading "Not released".
   - `releaseSummaryService.js` uses the shared `activeState` helper.
   - Audit log `PRESCRIPTION_SUPERSEDED` with ids only.
6. Tests: same ingredient new dose supersedes; different ingredient does not; combination partial overlap only warns; pending superseded cannot be dispensed (including a concurrent dispense race); dispensed + superseded keeps history; expiry by duration boundary (day before, day of, day after); two patients isolated; multiple lines in one consultation; patient timeline/verify page labels; trilingual strings with key parity.
7. Live test: consultation 1 prescribes Citalopram for N days; consultation 2 prescribes Citalopram again; confirm consultation 1's line shows superseded, pending slip not dispensable, verify page labels correct.

## TASK D: ICD label mismatch (found in a live screenshot)

The doctor screen showed "Single episode depressive disorder, ICD-10 `6A70`". `6A70` is an ICD-11 code (ICD-10-CM would be `F32.x`), while the docs state the catalog is US ICD-10-CM (71,704 leaf concepts).
1. Find which catalog served `6A70` and why it is labelled ICD-10 (`icdVersion` default `'ICD-10'`).
2. Either label each entry with its true classification/version everywhere (UI, PDF, verify page, data model) or restrict the doctor search to the one catalog the docs claim. Correct whichever statement is wrong (code or docs) and recompute any count quoted in `API_REFERENCE.md`, `DEMO_SCRIPT.md`, slides and report.
3. Add a test that no diagnosis shown as "ICD-10" has an ICD-11-style code.

## TASK E: Final reconcile and gates
1. Update `FEATURE_EXISTENCE_MATRIX.md` (new rows: safety acknowledgment, medicine auto-supersession, medicine coverage audit, ICD labelling), `CLAIMS_AUDIT.md`, `PROGRESS.md` (percentages only from verified evidence, with the live items listed), `OWNER_ACTIONS.md` (clinician must review severity mapping and the acknowledgment wording; formulary additions need pharmacist/clinician sign-off).
2. Offline gate (`node scripts/run_offline_tests.js`) with the real new count, client build, protected ledger 15/15 (hash check on a clean checkout), link check, CI green on `main`, Render `/health` on the final commit, live smoke of the five roles and the verify page.
3. Re-tag the release `v1.1.0-capstone` on the final `main` commit (do not move `v1.0.0-capstone`).
4. Final response: tasks A to E status, coverage numbers, PR list, final commit, open owner actions, any known issues.
