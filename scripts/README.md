# MediSync — Operator Tooling & Automation Scripts

This directory houses administrative, verification, and database management scripts for MediSync.

## Key Scripts

### 1. Production Platform Seeder (`scripts/seed-platform-data.js`)
Deterministic seeding utility supporting `medisync_prod` (12,907 clinical records under namespace `SEED_2026_11_A`) and `medisync_automated_test`.
- **Dry-run (Read-only)**:
  ```powershell
  node scripts/seed-platform-data.js --dry-run --db medisync_prod
  ```
- **Guards**: Requires host validation, database allowlist (`medisync_prod`), key ring validation, `--confirm` flag, and `MEDISYNC_SEED_RUN_APPROVAL=APPROVED`.

### 2. Guarded Demo Batch Removal (`scripts/remove_demo_batch.js`)
Decommissions legacy demonstration batch `DEMO_OUTBREAK_2026_V1` while strictly isolating and protecting `SEED_2026_11_A`.
- **Dry-run (Default)**:
  ```powershell
  node scripts/remove_demo_batch.js --dry-run --db medisync_prod
  ```
- **Execution**: See `docs/new/DEMO_BATCH_REMOVAL_RUNBOOK.md` for double-barrier execution protocol.

### 3. Master Offline Test Gate (`scripts/run_offline_tests.js`)
Executes all 7 test profiles in an isolated offline environment without touching production or remote clusters.
```powershell
node scripts/run_offline_tests.js
```
Runs:
- Backend Jest tests (`server/clinical.offline.jest.cjs`)
- Client React tests (`client/`)
- Email & PDF tests
- ML scoring & Flask tests
- Root security & schema contracts

### 4. Build & Verification Scripts
- `scripts/buildClinical.cjs`: Production client packaging script asserting 0 demo imports and clinical profile enforcement.
- `scripts/verifyMlStatusContractOffline.cjs`: Validates ML Engine status payload contract and regulatory claims.
