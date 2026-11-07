# Sub-Project 1 — Decisions

Format: ID — decision — alternatives — reason.

## D-001 — Separate tracking folder `docs/new/sub1/`
- Decision: keep this sub-project's plan and tracking in `docs/new/sub1/`, leaving `docs/new/PROGRESS_TRACKER.md` and `docs/new/DECISIONS.md` as the record of M0–M5.
- Alternatives: append to the existing files.
- Reason: brief requires the new folder; keeps history readable.

## D-002 — "Outbreak 3 levels" confirmed as geographic aggregation (Owner Q1: YES)
- Decision: District (25), Province (9), and Island-wide (1), each evaluated using unchanged rules (N >= 5, 2 consecutive days, z > 2) and existing tiers (Watch / Alert / Critical).
- Alternatives: interpret as the three severity tiers only (already implemented).
- Reason: confirmed by owner; tiers already exist, spatial hierarchy provides regional and national epidemiological visibility.

## D-003 — Ignore `medisync-qa-evidence/` in git (Owner Q2: YES)
- Decision: add `medisync-qa-evidence/` to `.gitignore` and do not track bulk evidence artifacts (optionally small curated PNGs in `docs/evidence/` later).
- Alternatives: commit full QA evidence directory.
- Reason: confirmed by owner; prevents bloating git history.

## D-004 — PDF attachment respects `PDF_EXPORT_ENABLED` (Owner Q3: YES)
- Decision: attach `consultation_<id>.pdf` to consultation summary email only when `PDF_EXPORT_ENABLED === 'true'`; otherwise send the prescription list email without PDF attachment.
- Alternatives: always attach PDF regardless of flag.
- Reason: confirmed by owner; preserves existing security hold without bypassing `PDF_EXPORT_ENABLED`.

## D-005 — Remove "Predictive Restock Warnings" sidebar item (Owner Q4: YES)
- Decision: remove the "Predictive Restock Warnings" navigation item from the Pharmacy sidebar.
- Alternatives: repurpose as link to district health burden.
- Reason: confirmed by owner; inventory subsystem was removed in M2, and district health burden is already surfaced on the Pharmacy dashboard.

## D-006 — Read-only aggregate/count queries allowed on `medisync_prod` for 6-vs-5 alert check (Owner Q5: YES)
- Decision: read-only `countDocuments` / `aggregate` queries on `medisync_prod` are permitted to diagnose the 6-vs-5 active alert count; never print document contents or PII, zero writes. Owner runs `remove_demo_batch` dry-run first.
- Alternatives: offline simulation only.
- Reason: confirmed by owner; allows exact diagnosis of production alert state while upholding strict read-only and zero-PII invariants.

## D-007 — Official 9 Provinces / 25 Districts mapping with bijection test (Owner Q6: YES)
- Decision: use the official Sri Lankan administrative division of 9 provinces and 25 districts, enforced by a unit test verifying every district maps to irritably/exactly one province (25 districts total, 9 provinces).
- Alternatives: custom regional clustering.
- Reason: confirmed by owner; matches official Sri Lankan public health administration.

## D-008 — Agent deletes no large folders
- Decision: Phase 1 produces `SIZE_AUDIT.md`, `scripts/size_report.ps1`, `.gitignore` updates, and copy-paste owner deletion commands in `OWNER_ACTIONS.md`; agent only uses `git rm --cached` and removes small, proven-unused code.
- Alternatives: agent deletes `scratch/`, `Python/`, `.venv/` directly.
- Reason: brief rule; prevents irreversible data loss.

## D-009 — Step 0 Backup Restore Sync and Git Stash Preservation
- Decision: After the working directory was restored from a pre-Phase-1 backup without `.git/`, re-initialized git, attached `origin` (`https://github.com/Chamod-Tharusha-Alwis/MediSync.git`), fetched all branches, aligned `HEAD` to `origin/feat/phase2-polish-and-cleanup` (`ef1b30c`), and preserved the pre-Phase-1 backup differences in `stash@{0}` (`restored-backup`, containing 332 untracked pre-Phase-1 backup files such as `research/`, `docs/brand/`, `server/scripts/phase5x*`, and 4 untracked local recovery test files) and `stash@{1}` (`restored-backup-tracked`, containing 14 tracked files from the pre-PR-#18 / pre-Phase-1 snapshot).
- Alternatives: overwrite working directory destructively.
- Reason: strictly obeys the no-destructive-commands rule (`git stash push` preserves every byte of the restored backup while keeping the branch clean and matched to `origin/feat/phase2-polish-and-cleanup`).

## D-010 — Task 1.7 Test Temp Directories Moved Outside Repo (`os.tmpdir()`)
- Decision: Updated `scripts/run_offline_tests.js`, `scripts/clinicalOfflineChild.cjs`, `scripts/seedPlatformMemoryProof.cjs`, `server/tests/helpers/seedPlatformMemoryCases.cjs`, `scripts/realLocalStack.cjs`, `scripts/realLocalStack.test.cjs`, `scripts/verifyMlStatusContractOffline.cjs`, `server/tests/websiteReferencePackaging.test.js`, `ml-engine/scripts/clinical_offline_tests.py`, `ml-engine/scripts/seed_platform_contract.py`, `ml-engine/test_reference_catalog.py`, and `ml-engine/app.py` to allocate all offline test/MongoMemoryReplSet/SQLite temp directories under `process.env.MEDISYNC_TEST_TMP || path.join(os.tmpdir(), 'medisync-test-tmp')` with non-fatal `bestEffortCleanup` (`EBUSY`/`EPERM`/`ENOTEMPTY` ignored so Windows file locks never fail the gate). Re-pinned `ml-engine/app.py` in `docs/release/PROTECTED_HASHES.json` (`220581f4e4...` -> `5a73ed87b1...`).
- Alternatives: keep writing to `<repo>/scratch` and delete after each run.
- Reason: prevents `scratch/` from ever being recreated inside the repo (or synced by OneDrive) and satisfies Task 1.7 verified by `server/tests/tempDirsOutsideRepo.test.js`.

## D-011 — Task 2.0 Exact Root Cause of PDF Download Failure & Consultation Summary Email Architecture
- Decision: Diagnosed five distinct root causes across the PDF export pipeline and implemented targeted fixes plus the post-consultation summary email workflow:
  1. **Security Gate (`PDF_EXPORT_ENABLED`)**: `server/src/utils/pdfGenerator.js:307-311` (`applyPDFEncryption`), `server/src/controllers/prescriptionController.js:138-145` (`exportConsultationPdf`), and `server/src/controllers/labController.js:1374-1381` (`exportLabReportPdf`) fail closed with HTTP `503 { code: 'PDF_EXPORT_UNAVAILABLE' }` unless `process.env.PDF_EXPORT_ENABLED === 'true'`. Default remains `false` (`503`).
  2. **Missing Medications on Consultation PDF (`exportConsultationPdf`)**: `server/src/controllers/prescriptionController.js:147-210` passed the raw `Consultation` document to `generateConsultationSummaryPDF(consultation, patientDetails, doctorDetails)`. Because `Consultation` schema (`server/src/models/Consultation.js`) does not embed `medications` or `prescriptions` (they are stored in the `Prescription` collection linked by `consultationId` / `consultationRef`), `consultationData.medications || consultationData.prescriptions` (`pdfGenerator.js:940`) evaluated to `[]`. Fix: query and decrypt matching `Prescription` documents in `exportConsultationPdf` before calling `generateConsultationSummaryPDF`.
  3. **Patient Ownership Check on Lab Report PDF (`exportLabReportPdf`)**: `server/src/controllers/labController.js:1384-1390` checked `req.user.nic` for `isOwnerNic`. Following JWT S1 hardening (`jwt-patient-nic-removal-s1.test.js`), patient JWTs carry `req.user.id` (`Patient._id`) without `req.user.nic`. When a legacy `LabTest` document lacked `patientId` and only stored `patientNic`, both `isOwnerId` and `isOwnerNic` evaluated to `false` (`403`). Fix: resolve the authenticated patient's NIC via `Patient.findById(req.user.id)` when `isOwnerId` is not already matched.
  4. **Client Blob Error Handling & Gate State (`Prescriptions.jsx`, `History.jsx`, `LabReportDownloadButton.jsx`, `LabDetailModal.jsx`, `MedicalTimeline.jsx`)**: Client download helpers using `axiosInstance.get(..., { responseType: 'blob' })` attempted to read `err.response?.data?.error` directly (`Prescriptions.jsx:41-43`), which is `undefined` because Axios returns an unparsed `Blob` instance for non-2xx responses when `responseType: 'blob'` is set. Additionally, UI buttons were unconditionally disabled without checking `REACT_APP_PDF_EXPORT_ENABLED === 'true'`. Fix: added `client/src/utils/pdfDownload.js` which sends the `Authorization` bearer token via `axiosInstance`, parses `Blob` JSON payloads on `503` (`PDF_EXPORT_UNAVAILABLE`) to display the localized hold message (`t('pdfUnavailable', 'PDF export temporarily unavailable')`), preserves the default-off disabled state expected by `pdf-disabled-state.test.jsx` and `pdf-hold-label-locales.test.jsx`, and streams/saves the PDF when `REACT_APP_PDF_EXPORT_ENABLED === 'true'`.
  5. **Sinhala/Tamil Font Fallback (`pdfGenerator.js:87-137`)**: `pdf-lib` `StandardFonts.Helvetica` only supports WinAnsi (`0x20-0x7E`, `0xA0-0xFF`). `sanitizeForPDF` + `wrapPdfDoc` maps common Sinhala/Tamil clinical/pharmaceutical terms to ASCII equivalents and strips remaining non-WinAnsi codepoints while appending a footer notice so PDF generation never throws a WinAnsi encoding error.
  6. **Consultation Summary Email Idempotency & Zero-NIC Design**: Created `server/src/services/consultationSummaryEmailService.js`, invoked non-blockingly from `clinicalCommandController.js` after consultation creation and via `POST /api/patient/consultation/:id/resend-summary` (and `/api/prescriptions/consultations/:id/resend-summary`). Idempotency is tracked via an in-memory `Set` plus append-only `AuditLog` (`action: 'consultation_summary_email_sent:<consultationId>'`, `accessedNic: 'N/A'`) so `Consultation.js` in `PROTECTED_HASHES.json` remains untouched.
- Alternatives: add an `emailSentAt` field to `Consultation.js` and re-pin `PROTECTED_HASHES.json`.
- Reason: using `AuditLog` + in-memory guard achieves persistent idempotency without modifying protected `Consultation.js`, guarantees zero NIC in subject/body/filename/logs, attaches `consultation_<id>.pdf` only when `PDF_EXPORT_ENABLED === 'true'`, retries transient email failures with exponential backoff without blocking consultation creation, and enforces per-patient resend rate limiting.

## D-012 — Phase 3 Consultation-Grouped Prescriptions, Receipt-Grouped History & `SEED_2026_11_B` Seeder (Tasks 3.1–3.5)
- Decision:
  1. **Task 3.1**: Added `groupPrescriptionsByConsultation(prescriptions, consultations, now)` in `client/src/utils/patientPrescriptionStatus.js` and updated `client/src/pages/patient/Dashboard.jsx` (`Overview`) and `client/src/pages/patient/Prescriptions.jsx` so Active Prescriptions render one card per consultation containing all medications and their individual statuses (`issued`, `pending`, `dispensed`, `expired`).
  2. **Task 3.2**: Added `groupDispensingHistoryByReceipt(records)` in `server/src/controllers/pharmacyController.js` (`getDispensingHistory`) and updated `client/src/pages/pharmacy/Dashboard.jsx` (`History`) so Dispensation History shows one row per `receiptNumber` with all medications (`items`, `medications`, `medicationSummary`) listed together.
  3. **Task 3.3**: Removed the `District Demand` / `Predictive Restock Warnings` sidebar item (`/pharmacy/dashboard/restock`) and route from `client/src/pages/pharmacy/Dashboard.jsx` per Owner Answer Q4 (`D-005`) without dropping any collections.
  4. **Task 3.4**: Updated `RestockAnalytics` in `client/src/pages/pharmacy/Dashboard.jsx` with trilingual empty-state guidance (`pharmacy.noDispensingLogsInInterval`, `pharmacy.emptyRangeHint`) and quick-switch buttons (`7 Days`, `30 Days`), and created `scripts/seed-dispensing-sample.js` under namespace `SEED_2026_11_B` (additive only, dry-run default, idempotent 60-receipt 30-day sample, requiring `--confirm` + `MEDISYNC_SEED_RUN_APPROVAL="SEED RUN APPROVED"`).

## D-013 — Phase 4 Root Cause of 6 vs 5 Alerts, Strict Outbreak Detector ($z > 2.0$), Multi-Level Surveillance & Session Monitor
- Decision:
  1. **Root Cause Analysis (Task 4.3)**:
     - On production `medisync_prod`, `scripts/seedSyntheticOutbreaks.js` (batch `PHASE6_SYNTHETIC_V1`) explicitly seeded 6 synthetic active alert records (`SIM-HIGH-DENGUE-COLOMBO`, `SIM-HIGH-LEPTO-GAMPAHA`, `SIM-MED-HEPATITIS-KANDY`, `SIM-MED-CHICKENPOX-GALLE`, `SIM-LOW-FLU-RATNAPURA`, `SIM-LOW-MUMPS-MATARA`).
     - In the platform seed verification (`scripts/seedPlatformPlan.cjs`), exactly 5 scenarios (S1, S3, S4, S5, S6) are expected to alert, while S2, S7, S8 do not alert.
     - A previous commit had weakened the outbreak detector condition in `server/src/services/surveillanceService.js` to `(dailyZ[i] > 2.0 || dailyZ[i] >= 1.9)` because S3 Galle Chickenpox alternated counts of 2 and 3 cases ($z = 1.92$ on count 2 due to baseline contamination from days 8–14).
  2. **Detector Strictness Restored**:
     - Restored strict `dailyZ[i] > 2.0` in `server/src/services/surveillanceService.js`, strictly enforcing $N \ge 5$, 2 consecutive days, $z > 2.0$.
     - Updated S3 in `scripts/seedPlatformPlan.cjs` to generate 3 cases/day ($z = 3.06 > 2.0$), ensuring all 5 target scenarios trigger cleanly without weakening statistical bounds.
  3. **Multi-Level Outbreak Surveillance (Task 4.4)**:
     - Bijective mapping between Sri Lanka's official 9 administrative provinces and 25 districts (`DISTRICT_TO_PROVINCE`, `PROVINCE_TO_DISTRICTS`, `OFFICIAL_PROVINCES`) exported in `server/src/services/surveillanceService.js` and `client/src/utils/districtAdjacency.js`.
     - Added `evaluateMultiLevelOutbreakCriteria` evaluating District (25), Province (9), and Island-wide (1) levels under identical statutory rules ($N \ge 5$, 2 consecutive days, $z > 2.0$). A provincial cluster can trigger an alert when multiple districts in a province each have $< 5$ cases (e.g. 2 cases/day in Galle + 2 cases/day in Matara = 4 cases/day = 8 window cases $\ge 5$ in Southern Province).
     - Added scope toggle and provincial/national views in `client/src/pages/public/PublicHealth.jsx` (respecting disclosure threshold $< 5$ suppressed) and `client/src/pages/admin/OutbreakMonitor.jsx`.
  4. **Admin ML Status Resilience & Waking State (Task 4.1)**:
     - Implemented `availabilityState` (`'available'`, `'waking'`, `'down'`) in `server/src/services/adminMlStatusService.js` with in-memory short-TTL cache, non-blocking warm-up ping, and exponential backoff retry with random jitter.
     - Added client debounce in `client/src/pages/doctor/NewConsultation.jsx` with disabled state while waking/loading, preventing HTTP 429 floods while preserving manual clinician assessment.
  5. **Session Monitor & Audit-Logged PII Reveal (Task 4.2)**:
     - Added `role` and `search` query filtering in `server/src/controllers/deviceController.js` (`getActiveSessions`).
     - Added `POST /api/admin/users/:userId/reveal-identifier` in `server/src/controllers/adminController.js` protected for admin/super_admin, creating an append-only `AuditLog` entry (`action: 'ADMIN_REVEAL_PII'`).
     - Rewritten `client/src/pages/admin/SessionMonitor.jsx` with URL query persistence, accurate session and audit counts, and default PII masking (`maskNic`, `maskEmail`) with audit-logged reveal action.

## D-014 — Phase 5 Census 2024 Population Schema & Neutral Null Safeguards (Tasks 5.1–5.2)
- Decision:
  1. **Task 5.1 Schema & Neutral Nulls**: Per instruction ("If official report numbers cannot be verified from official DCS response, create server/src/data/districtPopulation2024.json with null values for all 25 districts, source URL, and year 2024, mark Task 5.1 BLOCKED in TASK_BOARD.md, and write exact owner instructions in OWNER_ACTIONS.md (NEVER type numbers from memory)"), created `server/src/data/districtPopulation2024.json` and `client/src/data/districtPopulation2024.json` with official schema (`year: 2024`, `source: 'https://www.statistics.gov.lk'`, `status: 'pending_official_verification'`) and all 25 official districts defaulted strictly to `null`.
  2. **Task 5.2 Incidence per 100k Calculation**: Implemented `server/src/services/incidenceService.js` and `client/src/utils/populationIncidence.js`. When district/province population is `null`, incidence returns `{ incidence: null, display: 'population data pending', hasPopulation: false }`. When population is verified, incidence evaluates to `((cases / population) * 100000).toFixed(2)` and displays `${rate} / 100k`.
  3. **UI Integration**: Added incidence column/badges to `client/src/pages/admin/OutbreakMonitor.jsx` surveillance table and `client/src/pages/public/PublicHealth.jsx` (district map tooltips, provincial cards, and national island-wide summary).
  4. **Task 5.1 Marked BLOCKED**: Marked Task 5.1 `BLOCKED` awaiting owner manual population entry from DCS Table 2, while Task 5.2 and full incidence architecture are complete and tested (`server/tests/phase5PopulationIncidence.test.js`).
