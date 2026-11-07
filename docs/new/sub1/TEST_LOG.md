# Sub-Project 1 — Test Log

| Date | Branch @ commit | Command | Counts | Result |
|---|---|---|---|---|
| 2026-11-07 | `feat/final-stage-b2-to-g` @ `5fce3b4` (pre-merge reference) | `node scripts/run_offline_tests.js` | 3,479 passed / 0 failed (backend 2,659, client 656, email-pdf 31, ml-scoring 40, ml-flask 31, root 55, ml-status-contract 7) | PASS |
| 2026-11-07 | `feat/final-stage-b2-to-g` @ `9f6d015` tree | `npm --prefix client run build` | 117 modules, exit 0 (6 eslint no-unused-vars warnings) | PASS |
| 2026-11-07 18:54 | `feat/phase2-polish-and-cleanup` @ `e1a3d6e` (Phase 1 opening baseline) | `node scripts/run_offline_tests.js` | **3,477 passed / 0 failed** (backend 2,657 / 121 suites, client 656 / 75 suites, email-pdf 31 / 2 suites, ml-scoring 40, ml-flask 31, root 55, ml-status-contract 7; `sourceFrozen: true`, `protectedAccountedFor: 15`) | **PASS** |
| 2026-11-07 19:00 | `feat/phase2-polish-and-cleanup` @ `e1a3d6e` (Phase 1 opening baseline) | `npm --prefix client run build` | **Exit 0** (117 modules, `demoImported: false`, `clinical-production`, main JS 210.66 kB gzip, main CSS 22.71 kB gzip) | **PASS** |
| 2026-11-07 23:24 | `feat/phase2-polish-and-cleanup` (Phase 1 closing gate, receipt `scratch/clinical-offline-gnlvho`) | `node scripts/run_offline_tests.js` | **3,477 passed / 0 failed** (backend 2,657 / 121 suites, client 656 / 75 suites, email-pdf 31 / 2 suites, ml-scoring 40, ml-flask 31, root 55, ml-status-contract 7; `sourceFrozen: true`, `protectedAccountedFor: 15`) | **PASS** |
| 2026-11-07 23:24 | `feat/phase2-polish-and-cleanup` (Phase 1 closing build) | `npm --prefix client run build` | **Exit 0** (117 modules, `demoImported: false`, `clinical-production`, main JS 210.66 kB gzip, main CSS 22.71 kB gzip) | **PASS** |

*Note on 3,477 vs 3,479*: PR #18 (`chore/remove-test-otp`) merged into `main` at `b74ca6f`, replacing 6-test `testOtpHarnessOffline.test.js` with 4-test `testOtpRemovalOffline.test.js` (-2 net tests).
