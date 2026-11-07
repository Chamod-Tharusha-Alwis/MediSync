# Sub-Project 1 — Task Board

Legend: TODO / IN-PROGRESS / DONE / BLOCKED (reason)

## Phase 0 — Plan
- [x] DONE — 00_MASTER_PLAN.md, PROGRESS_TRACKER.md, TASK_BOARD.md, DECISIONS.md, SIZE_AUDIT.md (stub), TEST_LOG.md, OWNER_ACTIONS.md (`e1a3d6e`)
- [x] DONE — Owner approval received with Q1–Q6 answers (2026-11-07)

## Phase 1 — Size audit and cleanup
- [x] DONE 1.0 Opening baseline gate (`3,477 PASS / 0 FAIL`) + client build (`exit 0`) recorded in `TEST_LOG.md`
- [x] DONE 1.1 `SIZE_AUDIT.md` (directory totals only; covers all top-level/second-level folders, top 30 files, `scratch/` root-cause analysis)
- [x] DONE 1.2 `git count-objects -vH` + largest historical blobs (report only; no history rewrite needed)
- [x] DONE 1.3 `.gitignore` update; `git rm --cached docs/b6_live_verification_execution.log`
- [x] DONE 1.4 Dead-code candidates with search proof; removed 3 clearly unused source files (`universityProvisionPlan.js`, `requireOTP.js`, `validateRequest.js`)
- [x] DONE 1.5 `scripts/size_report.ps1` (read-only PowerShell walker with `-FastSummary` mode)
- [x] DONE 1.6 `OWNER_ACTIONS.md` copy-paste delete commands (~42.20 GB savings) + OneDrive move advice
- [x] DONE 1.7 Test temp directories outside repo (`os.tmpdir()` / `MEDISYNC_TEST_TMP`), best-effort cleanup, `tempDirsOutsideRepo.test.js`, `scratch/` not recreated
- [x] DONE Gate + build + commit + push + report (Phase 1 complete)

## Phase 2 — Consultation email and PDF
- [ ] TODO 2.1 patient summary email (idempotent, non-blocking, capped, NIC-free, PDF attached only when `PDF_EXPORT_ENABLED=true`, resend button rate limited)
- [ ] TODO 2.2 PDF download root cause + fix (gate default off)
- [ ] TODO 2.3 tests
- [ ] TODO Gate + build + commit + push + report

## Phase 3 — Grouped prescriptions and dispensing
- [ ] TODO 3.1 patient grouped Active Prescriptions
- [ ] TODO 3.2 pharmacy grouped Dispensation History by receipt
- [ ] TODO 3.3 remove Predictive Restock Warnings sidebar item (per Q4)
- [ ] TODO 3.4 analytics zero-state + scripts/seed-dispensing-sample.js (SEED_2026_11_B, test DB only)
- [ ] TODO 3.5 tests
- [ ] TODO Gate + build + commit + push + report

## Phase 4 — Admin, outbreak, ML service
- [ ] TODO 4.1 ML status warm-up/retry/cache/states + client debounce
- [ ] TODO 4.2 Session Monitor role filter + URL query + masking + reveal audit
- [ ] TODO 4.3 6 vs 5 alerts (read-only) + DECISIONS.md + test
- [ ] TODO 4.4 District (25) / Province (9) / Island-wide (1) levels + selector + public summary (per Q1 & Q6)
- [ ] TODO 4.5 remove dead ML Alerts / demo wording
- [ ] TODO Gate + build + commit + push + report

## Phase 5 — Population data
- [ ] TODO 5.1 districtPopulation2024.json from official DCS source (or nulls + BLOCKED)
- [ ] TODO 5.2 incidence per 100k + baseline offset + tests
- [ ] TODO Gate + build + commit + push + report

## Phase 6 — ML evaluation graphs
- [ ] TODO 6.1 ml-engine/evaluation scaffolding (fixed seed, 200 dpi)
- [ ] TODO 6.2 symptom / detector / forecast charts (SYNTHETIC suffix)
- [ ] TODO 6.3 leakage check
- [ ] TODO 6.4 colmozzie backtest (if network allows)
- [ ] TODO Gate + build + commit + push + report

## Phase 7 — Docs, gate, handover
- [ ] TODO 7.1 ARCHITECTURE/README/runbook corrections + prototype-mode note
- [ ] TODO 7.2 acceptance matrix regenerated honestly + protected ledger reconciled
- [ ] TODO 7.3 full gate, push, compare link, OWNER_ACTIONS live-test checklist
