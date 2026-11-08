# MediSync Sub-Project 3 — Phase P0 Plan: Stability Fixes & Docs Reconcile

## Objectives
1. **ChunkLoadError Resilience**:
   - In `client/src/App.js` and `client/src/UniversityApp.jsx`, enhance `RenderErrorBoundary` to catch chunk loading failures (`ChunkLoadError`, `Loading chunk ... failed`, `Loading CSS chunk ... failed`).
   - Trigger a single automatic `window.location.reload()` guarded by `sessionStorage.getItem('medisync_chunk_reload')` to avoid infinite reload loops.
   - Clear the reload flag upon successful mount or render.
   - Provide client caching directives via `client/vercel.json` (`Cache-Control: no-cache, no-store, must-revalidate` for `index.html`; `public, max-age=31536000, immutable` for `/static/*`).
   - Add unit tests verifying `ChunkLoadError` triggers a single reload and falls back safely on loop prevention.
2. **Responsive Consultation Summary Email**:
   - In `server/src/services/consultationSummaryEmailService.js`, update HTML template with responsive layout:
     - On desktop (> 600px): clean 6-column tabular layout.
     - On mobile (<= 600px): fluid stacked card format ensuring "Instructions" column is never cut off or clipped.
     - Maintain zero NIC, sanitized IDs, and trilingual headers/disclaimers.
3. **Audit Console Warning `feature_collector.js: deprecated parameters`**:
   - Comprehensive audit confirms `feature_collector.js` is not present in repository or dependencies.
   - Identified origin: injected by third-party browser extensions (e.g. password managers, autofill, wasm glue).
   - Documented and ignored as external artifact; zero application code changes required.
4. **Doctor ML Screen Urgency Guard & Caption**:
   - In `ml-engine/app.py`:
     - Urgency requires: high severity (`avg_severity >= 4.5` or named emergency profile) AND similarity score >= 50.0% (`combined_score >= 0.50`) AND at least 2 matched symptoms (`len(matched) >= 2`).
     - Re-pin `ml-engine/app.py` in `docs/release/PROTECTED_HASHES.json` with updated hash and clear rationale.
   - In `client/src/pages/doctor/NewConsultation.jsx`:
     - Guard `URGENT` badge with `diag.urgent && diag.confidence >= 50`.
     - Display `"Reference match, not a diagnosis"` disclaimer on diagnosis suggestion cards.
     - Add EN, SI, TA translation parity for the disclaimer.
5. **Docs Sync & Seeder Reconcile**:
   - Support both `MEDISYNC_SEED_RUN_APPROVAL="SEED RUN APPROVED"` and `APPROVE_SAMPLE_DISPENSING_SEED="true"` plus `--confirm-sample-seed` in `scripts/seed-dispensing-sample.js`.
   - Update `docs/new/sub1/OWNER_ACTIONS.md`, `docs/new/sub2/OWNER_ACTIONS_SUB2.md`, and `docs/new/DEMO_BATCH_REMOVAL_RUNBOOK.md`.

## Verification Gates
1. `npm --prefix client test client/src/__master_offline__/chunk-reload-resilience.test.jsx`
2. `npm --prefix server test server/tests/phase2ConsultationEmailAndPdf.test.js`
3. `npm --prefix server test server/tests/phase3GroupingAndDispensingSeeder.test.js`
4. `node scripts/run_offline_tests.js` (3,450+ tests passing, 0 failed, 15/15 protected files accounted for)
5. `npm --prefix client run build` (exit code 0)
