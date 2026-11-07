# Sub-Project 1 — Test Log

| Date | Branch @ commit | Command | Counts | Result |
|---|---|---|---|---|
| 2026-11-07 | `feat/final-stage-b2-to-g` @ `5fce3b4` (pre-merge reference) | `node scripts/run_offline_tests.js` | 3,479 passed / 0 failed (backend 2,659, client 656, email-pdf 31, ml-scoring 40, ml-flask 31, root 55, ml-status-contract 7) | PASS |
| 2026-11-07 | `feat/final-stage-b2-to-g` @ `9f6d015` tree | `npm --prefix client run build` | 117 modules, exit 0 (6 eslint no-unused-vars warnings) | PASS |

Phase 0 changed docs only; no gate run on this branch yet. First gate on `feat/phase2-polish-and-cleanup` (base `0871fd3`) runs at the start of Phase 1.
