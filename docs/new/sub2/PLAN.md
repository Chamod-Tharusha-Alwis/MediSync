# Sub-Project 2 — Post-Merge Polish and Fix Plan

Branch: `fix/post-merge-sub2` (base `main` @ `da438aa`).

## Goals and Sequence
1. **Task A (Seeder Mongoose Resolution)**:
   - Investigate mongoose instance mismatch across `scripts/` (root vs `server/node_modules/mongoose`).
   - Standardize mongoose resolution before model imports.
   - Offline test asserting single instance and `--dry-run` zero-writes.
2. **Task B (Alert Lifecycle & Action State Machine)**:
   - Investigate `OutbreakAlert` lifecycle in `OutbreakAlert.js`, `outbreakAlertController.js`, `surveillanceRoutes.js`, and `OutbreakMonitor.jsx`.
   - Restore missing transitions: `Confirmed -> Resolved`, ensure non-terminal states show valid actions.
   - Add audit logging without PII, trilingual error feedback, and offline unit/client tests.
   - Explain why batch has 14 alerts vs 6 active alerts.
3. **Task C (ML Service Status Resilience & Cold-Start Warm-up)**:
   - Trace ML engine status pipeline from UI to `adminMlStatusService.js` to Render ML service `/health`.
   - Accommodate Render free-tier cold starts (>60s) with proper `'waking'` state, automated retry, and non-blocking warm-up ping.
   - Verify `ml-engine/app.py` startup, memory bounds, and production database paths.
   - Contract tests for ML asleep/slow/5xx/missing. Owner actions in `docs/new/sub2/OWNER_ACTIONS_SUB2.md`.
4. **Task D (Synthetic Simulation Label Scope)**:
   - Audit where synthetic banner/tags are rendered.
   - Ensure tag only displays on records with `isSimulatedDemo === true`.
5. **Task E (Documentation Corrections)**:
   - Align backend URL in `README.md` to `https://medisync-wabc.onrender.com`.
   - Recalculate exact trilingual translation key parity (audit `en.json`, `si.json`, `ta.json`).
   - Clarify illustrative counts and decision checklist in `DEMO_BATCH_REMOVAL_RUNBOOK.md`.
   - Update verified facts in `FINAL_ACCEPTANCE_MATRIX.md`.
6. **Task F (Final Verification & Handover)**:
   - Run `node scripts/run_offline_tests.js` and `npm --prefix client run build`.
   - Verify 15 protected file hashes.
   - Author `docs/new/sub2/FINAL_REPORT.md`.
   - Push branch and output GitHub compare link.
