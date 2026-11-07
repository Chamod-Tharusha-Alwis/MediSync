# Sub-Project 1 — Task Board

Legend: TODO / IN-PROGRESS / DONE / BLOCKED (reason)

## Phase 0 — Plan
- [x] DONE — 00_MASTER_PLAN.md, PROGRESS_TRACKER.md, TASK_BOARD.md, DECISIONS.md, SIZE_AUDIT.md (stub), TEST_LOG.md, OWNER_ACTIONS.md
- [ ] TODO — Owner approval (reply APPROVED; answer Q1–Q6 in master plan)

## Phase 1 — Size audit and cleanup
- [ ] TODO 1.1 SIZE_AUDIT.md (directory totals only)
- [ ] TODO 1.2 git count-objects + largest historical blobs (report only)
- [ ] TODO 1.3 .gitignore update; `git rm --cached` any tracked matches
- [ ] TODO 1.4 dead-code candidates with proof; remove only clearly unused
- [ ] TODO 1.5 scripts/size_report.ps1 (read-only)
- [ ] TODO 1.6 OWNER_ACTIONS.md delete commands + OneDrive advice
- [ ] TODO Gate + build + commit + push + report

## Phase 2 — Consultation email and PDF
- [ ] TODO 2.1 patient summary email (idempotent, non-blocking, capped, NIC-free, resend button rate limited)
- [ ] TODO 2.2 PDF download root cause + fix (gate default off)
- [ ] TODO 2.3 tests
- [ ] TODO Gate + build + commit + push + report

## Phase 3 — Grouped prescriptions and dispensing
- [ ] TODO 3.1 patient grouped Active Prescriptions
- [ ] TODO 3.2 pharmacy grouped Dispensation History by receipt
- [ ] TODO 3.3 remove/repurpose Predictive Restock Warnings
- [ ] TODO 3.4 analytics zero-state + scripts/seed-dispensing-sample.js (SEED_2026_11_B, test DB only)
- [ ] TODO 3.5 tests
- [ ] TODO Gate + build + commit + push + report

## Phase 4 — Admin, outbreak, ML service
- [ ] TODO 4.1 ML status warm-up/retry/cache/states + client debounce
- [ ] TODO 4.2 Session Monitor role filter + URL query + masking + reveal audit
- [ ] TODO 4.3 6 vs 5 alerts (read-only) + DECISIONS.md + test
- [ ] TODO 4.4 District/Province/Island levels + selector + public summary
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
