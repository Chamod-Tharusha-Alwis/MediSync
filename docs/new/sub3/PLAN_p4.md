# Sub-Project 3 Phase 4 Implementation Plan: Final Hardening, Acceptance Matrix, & Release Readiness

## 1. Objectives
1. Perform comprehensive security and privacy hardening across all Sub-Project 3 code and assets (zero PII in logs, zero plain tokens/secrets, constant-time identity checks, safe error handlers).
2. Generate `docs/new/sub3/FINAL_REPORT.md` documenting the complete delivery of Sub-Project 3 (Phases P0 through P4), summarizing what was implemented, verified offline, and what requires owner execution on live production environments.
3. Author `docs/new/sub3/OWNER_ACTIONS_SUB3.md` providing step-by-step, copy-pasteable PowerShell commands for the owner to perform live production maintenance (MongoDB Atlas connection/whitelisting, database seeding, demo batch cleanup, Atlas index enablement for `verificationtokens`, and Render ML cold-start understanding).
4. Update `docs/new/FINAL_ACCEPTANCE_MATRIX.md` with all Sub-Project 3 features, acceptance criteria, and verification statuses.
5. Re-run complete offline gate (`node scripts/run_offline_tests.js`) and client production build (`npm --prefix client run build`) to ensure 100% compliance.
6. Update `docs/new/sub3/PROGRESS.md` marking P4 as DONE with commit hashes.

## 2. Deliverables & Actions

### 2.1 Security & Quality Hardening Pass
- Verify all new endpoints (`/api/verify/:token`, `/api/verify/:token/history-pdf`, `/api/verify/:token/revoke`, `/api/prescriptions/check-safety`) use parameterized inputs, sanitize outputs, log zero PII, and handle errors gracefully without stack trace leakage.
- Verify `client/src/pages/public/VerifyConsultation.jsx` and `client/src/components/common/MedicineSafetyPanel.jsx` respect UI constraints (min font floor: 11px uppercase badges, 12px copy; accessibility ARIA labels; trilingual key parity).
- Confirm the 15 protected files in `docs/release/PROTECTED_HASHES.json` remain 100% accounted for and untouched since P0.

### 2.2 Final Report (`docs/new/sub3/FINAL_REPORT.md`)
- Comprehensive synthesis of Sub-Project 3:
  - Phase P0: Stability, ChunkLoadError recovery, responsive emails, ML urgency calibration, seeder reconciliation.
  - Phase P1: Medicine safety engine (interactions, duplicates, duration, dosage), WHO 2008 & BNF 86 formulary limits catalog, trilingual panel.
  - Phase P2: 256-bit verification tokens, SHA-256 hash storage, constant-time NIC gate, QR code integration in PDF and email, public verification UI.
  - Phase P3: Platform master plan completion audit (5A through 5H matrix in `PHASE_STATUS.md`).
  - Phase P4: Final security hardening, owner runbook, and acceptance matrix update.

### 2.3 Owner Runbook (`docs/new/sub3/OWNER_ACTIONS_SUB3.md`)
- Clear instructions for the repository owner:
  - **Action 1: MongoDB Atlas Connectivity & IP Whitelisting**
    - Address the `Operation pharmacies.findOne() buffering timed out after 10000ms` error observed during `seed-dispensing-sample.js`.
    - Provide exact steps to check Atlas Network Access (whitelist owner's current IP address or allow `0.0.0.0/0` temporarily).
  - **Action 2: Execute Dispensing Seeder**
    - Dry-run: `node scripts/seed-dispensing-sample.js --db medisync_prod --dry-run`
    - Execution: `node scripts/seed-dispensing-sample.js --db medisync_prod`
  - **Action 3: Clean Up Demo / Synthetic Batch**
    - Dry-run: `node scripts/remove_demo_batch.js --db medisync_prod --dry-run`
    - Execution: `node scripts/remove_demo_batch.js --db medisync_prod --execute`
  - **Action 4: Atlas Index Activation for `verificationtokens`**
    - Instructions to add `MEDISYNC_VERIFICATION_TOKENS_APPROVED=true` to Render backend environment variables to enable the production storage manifest gate for verification tokens.
  - **Action 5: Render Free Tier ML Cold-Start Clarification**
    - Explain the 50-80s cold start of the Render free tier and UptimeRobot 30s timeout false alarms.
    - Provide exact curl verification command.

### 2.4 Acceptance Matrix Update (`docs/new/FINAL_ACCEPTANCE_MATRIX.md`)
- Add Sub-Project 3 deliverables to the master acceptance matrix:
  - Medicine safety limits & duplicate active ingredient checks.
  - Consultation QR code generation and public zero-PII verification endpoint.
  - Constant-time NIC gate for history PDF download.
  - Render ChunkLoadError reload guard and caching headers.

### 2.5 Verification Gates
- Execute `node scripts/run_offline_tests.js` -> 3,454/3,454 pass, 0 fail.
- Execute `npm --prefix client run build` -> exit 0.
- Update `PROGRESS.md`, commit, and push `feat/sub3-p4`.
