# Sub-Project 1 — Progress Tracker

Git is the source of truth. If this file and git disagree, trust git and fix this file.
Branch: `feat/phase2-polish-and-cleanup` (base `main` @ `0871fd3`).

| Phase | Task | Status | Commit | Evidence |
|---|---|---|---|---|
| 0 | Plan and tracking docs | DONE (Approved) | `e1a3d6e` | `docs/new/sub1/*` |
| 1 | 1.0 Opening baseline gate + client build | DONE | `06f13a3` | `docs/new/sub1/TEST_LOG.md` (3,477 PASS / 0 FAIL; client build exit 0) |
| 1 | 1.1 Size audit (`SIZE_AUDIT.md`) | DONE | `06f13a3` | `docs/new/sub1/SIZE_AUDIT.md` (43.81 GB audited; `scratch/` = 41.18 GB explained) |
| 1 | 1.2 Git history report | DONE | `06f13a3` | `docs/new/sub1/SIZE_AUDIT.md` §5 (`git count-objects -vH`: 85.94 MiB packed + 15.12 MiB loose) |
| 1 | 1.3 `.gitignore` + `git rm --cached` | DONE | `06f13a3` | `.gitignore` updated; `docs/b6_live_verification_execution.log` untracked via `git rm --cached` |
| 1 | 1.4 Dead code audit & safe removal | DONE | `06f13a3` | `SIZE_AUDIT.md` §6; removed 3 verified unreferenced files (`universityProvisionPlan.js`, `requireOTP.js`, `validateRequest.js`) |
| 1 | 1.5 `scripts/size_report.ps1` | DONE | `06f13a3` | `scripts/size_report.ps1` (supports full walk and `-FastSummary`) |
| 1 | 1.6 Owner delete commands & OneDrive advice | DONE | `06f13a3` | `docs/new/sub1/OWNER_ACTIONS.md` §1 (~42.20 GB reclaimable) |
| 1 | 1.7 Test temp directories outside repo (`os.tmpdir()`) | DONE | `146ab90` | `scripts/run_offline_tests.js`, `server/tests/tempDirsOutsideRepo.test.js` (`Test-Path scratch` = `False`, 3,418 PASS / 0 FAIL) |
| 2 | 2.1 Consultation summary email | DONE | `35db3eb` | `server/src/services/consultationSummaryEmailService.js`, `clinicalCommandController.js`, `History.jsx` (`POST /api/patient/consultation/:id/resend-summary`) |
| 2 | 2.2 PDF download fix | DONE | `35db3eb` | `prescriptionController.js`, `labController.js`, `client/src/utils/pdfDownload.js`, `DECISIONS.md` (`D-011`) |
| 2 | 2.3 Tests | DONE | `35db3eb` | `server/tests/phase2ConsultationEmailAndPdf.test.js` (3,423 PASS / 0 FAIL; client build exit 0) |
| 3 | 3.1 Patient grouped prescriptions | DONE | `44b4908` | `client/src/utils/patientPrescriptionStatus.js`, `client/src/pages/patient/Dashboard.jsx`, `client/src/pages/patient/Prescriptions.jsx` |
| 3 | 3.2 Pharmacy grouped receipts | DONE | `44b4908` | `server/src/controllers/pharmacyController.js` (`groupDispensingHistoryByReceipt`), `client/src/pages/pharmacy/Dashboard.jsx` |
| 3 | 3.3 Restock warnings removal | DONE | `44b4908` | `client/src/pages/pharmacy/Dashboard.jsx` (`/pharmacy/dashboard/restock` removed per Owner Q4) |
| 3 | 3.4 Dispensing analytics + SEED_2026_11_B seeder | DONE | `44b4908` | `scripts/seed-dispensing-sample.js`, `client/src/pages/pharmacy/Dashboard.jsx`, `docs/new/sub1/OWNER_ACTIONS.md` |
| 3 | 3.5 Tests | DONE | `44b4908` | `server/tests/phase3GroupingAndDispensingSeeder.test.js` (3,426 PASS / 0 FAIL; client build exit 0) |
| 4 | 4.1 ML status resilience | DONE | `pending` | `server/src/services/adminMlStatusService.js` (available/waking/down, cache, retry jitter), `NewConsultation.jsx` debounce |
| 4 | 4.2 Session Monitor filter + masking | DONE | `pending` | `server/src/controllers/deviceController.js` (role/search filter), `adminController.js` (`revealIdentifier`), `SessionMonitor.jsx` |
| 4 | 4.3 6 vs 5 alerts investigation | DONE | `pending` | Root cause in `DECISIONS.md` (`D-013`), strict detector `dailyZ > 2.0` in `surveillanceService.js`, S3 fixture in `seedPlatformPlan.cjs` |
| 4 | 4.4 Outbreak 3 levels | DONE | `pending` | Bijective 9 province / 25 district mapping, `evaluateMultiLevelOutbreakCriteria`, selectors in `OutbreakMonitor.jsx` & `PublicHealth.jsx` |
| 4 | 4.5 Wording cleanup | DONE | `pending` | Removed dead `nav.mlalerts`, audited UI translation parity (781 keys exact parity across en/si/ta) |
| 5 | 5.1 Population JSON | TODO | - | - |
| 5 | 5.2 Incidence + offset | TODO | - | - |
| 6 | 6.1–6.4 ML evaluation | TODO | - | - |
| 7 | 7.1–7.3 Docs, gate, handover | TODO | - | - |

## Session log

| Date | Event |
|---|---|
| 2026-11-07 | Branch created off `main` @ `0871fd3` (PRs #17, #18, #19). Phase 0 docs written and pushed (`e1a3d6e`). Stopped for owner approval. |
| 2026-11-07 | Owner replied APPROVED with Q1–Q6 answers (recorded in `DECISIONS.md` D-003..D-008). Ran Phase 1 opening baseline gate (3,477 PASS / 0 FAIL) and client build (exit 0). Completed Tasks 1.1–1.6, ran post-Phase-1 gate + client build, committed, pushed, and stopped for Phase 2 go-ahead. |
| 2026-11-08 | Resumed in full-autonomy mode. Completed Step 0 (restored workspace synced to `origin/feat/phase2-polish-and-cleanup` @ `ef1b30c`, backup diffs stashed in `stash@{0}`/`stash@{1}`, recorded in `DECISIONS.md` D-009) and Task 1.7 (moved offline test temp dirs to `os.tmpdir()`, verified `scratch/` not recreated, 3,418 PASS / 0 FAIL, client build exit 0, commit `146ab90`). |
| 2026-11-08 | Completed Phase 2 (Tasks 2.0–2.3): root-cause analysis in `DECISIONS.md` D-011, `consultationSummaryEmailService.js` (idempotent, zero-NIC, exponential backoff, conditional PDF attachment when `PDF_EXPORT_ENABLED=true`, rate-limited resend endpoint + trilingual UI button), consultation & lab PDF fixes, and `phase2ConsultationEmailAndPdf.test.js`. Offline gate: 3,423 PASS / 0 FAIL; client build exit 0 (118 modules). Committed & pushed (`35db3eb`). |
| 2026-11-08 | Completed Phase 3 (Tasks 3.1–3.5): consultation-grouped Active Prescriptions in patient dashboard/prescriptions, receipt-grouped Dispensation History in pharmacy dashboard/controller, removed `/pharmacy/dashboard/restock` sidebar item per Q4, added trilingual empty-range hint in Dispensing Volume Analytics, created `scripts/seed-dispensing-sample.js` (`SEED_2026_11_B`), and added `phase3GroupingAndDispensingSeeder.test.js`. Offline gate: 3,426 PASS / 0 FAIL; client build exit 0 (118 modules). Committed & pushed (`44b4908`). |
| 2026-11-08 | Completed Phase 4 (Tasks 4.1–4.5): ML status resilience (`adminMlStatusService.js` available/waking/down states, short-TTL cache, retry with jitter, debounced analysis button in `NewConsultation.jsx`), Session Monitor role/search filtering and PII masking with audit-logged `ADMIN_REVEAL_PII`, resolved 6-vs-5 alert root cause with strict $z > 2.0$ detector, implemented official 9-province / 25-district bijective mapping and multi-level outbreak evaluation (`evaluateMultiLevelOutbreakCriteria`) with selectors in `OutbreakMonitor.jsx` and `PublicHealth.jsx`, and audited UI translations (781 keys exact parity across en/si/ta). Offline gate: 3,436 PASS / 0 FAIL; client build exit 0 (118 modules). |
