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
| 2 | 2.1 Consultation summary email | TODO | - | - |
| 2 | 2.2 PDF download fix | TODO | - | - |
| 2 | 2.3 Tests | TODO | - | - |
| 3 | 3.1 Patient grouped prescriptions | TODO | - | - |
| 3 | 3.2 Pharmacy grouped receipts | TODO | - | - |
| 3 | 3.3 Restock warnings removal | TODO | - | - |
| 3 | 3.4 Dispensing analytics + SEED_2026_11_B seeder | TODO | - | - |
| 3 | 3.5 Tests | TODO | - | - |
| 4 | 4.1 ML status resilience | TODO | - | - |
| 4 | 4.2 Session Monitor filter + masking | TODO | - | - |
| 4 | 4.3 6 vs 5 alerts investigation | TODO | - | - |
| 4 | 4.4 Outbreak 3 levels | TODO | - | - |
| 4 | 4.5 Wording cleanup | TODO | - | - |
| 5 | 5.1 Population JSON | TODO | - | - |
| 5 | 5.2 Incidence + offset | TODO | - | - |
| 6 | 6.1–6.4 ML evaluation | TODO | - | - |
| 7 | 7.1–7.3 Docs, gate, handover | TODO | - | - |

## Session log

| Date | Event |
|---|---|
| 2026-11-07 | Branch created off `main` @ `0871fd3` (PRs #17, #18, #19). Phase 0 docs written and pushed (`e1a3d6e`). Stopped for owner approval. |
| 2026-11-07 | Owner replied APPROVED with Q1–Q6 answers (recorded in `DECISIONS.md` D-003..D-008). Ran Phase 1 opening baseline gate (3,477 PASS / 0 FAIL) and client build (exit 0). Completed Tasks 1.1–1.6, ran post-Phase-1 gate + client build, committed, pushed, and stopped for Phase 2 go-ahead. |
