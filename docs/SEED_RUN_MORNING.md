# MediSync Production Seed Execution Runbook (Morning Run)

## 1. Summary of Changes
- **File**: `server/scripts/operatorDatabaseMode.js`
  - In `selectOperatorDatabase(environment, isQa = false)`: Updated `connectionOptions` so `authMechanism: 'SCRAM-SHA-256'` is only set when `isQa` is `true`. When `isQa` is `false` (production seed path), `authMechanism` is omitted, allowing the MongoDB driver to negotiate the authentication mechanism (supporting SCRAM-SHA-1 in Atlas), matching `connectProductionDB` in `server/src/config/dbGuard.js`.
  - Retained all existing connection options: `dbName: database`, `tls: true`, `authSource: 'admin'`, `readPreference: 'primary'`, `writeConcern: { w: 'majority' }`, `serverSelectionTimeoutMS: 5000`, `connectTimeoutMS: 5000`.
- **Tests Updated**:
  - `server/tests/gate3DatabaseMode.test.js`: Verified `connectionOptions` includes `authMechanism: 'SCRAM-SHA-256'` only for QA (`isQa = true`), and confirms `authMechanism` is `undefined` in production mode.
  - `server/tests/seedPlatformData.test.js`: Verified production seed target connection options do not enforce `authMechanism` (`toBeUndefined()`).
  - `server/tests/preflightProduction.test.js`: Updated preflight assertion to verify production `MongoClient` call does not force `authMechanism`.
  - `server/tests/productionAtlasDiagnostic.test.js`: Updated `authMechanismEnforcedByDriver` expectation to `false` for production target diagnostic.
- **Security Invariants Preserved**:
  - All host allowlist checks, database name verification (`medisync_prod`), `--confirm` + `MEDISYNC_SEED_RUN_APPROVAL` guard, `verifyProductionIdentity`, `verifySeedStorage`, namespace ownership, and NIC checks remain strictly active and unmodified.
  - No protected hashes in `docs/release/PROTECTED_HASHES.json` required modification.

## 2. Test Results
- **Offline Test Suite Runner**:
  - Command: `node scripts/run_offline_tests.js`
  - Result: **0 failed, 3,440 passed** (100% pass across all 7 test runners).
  - Breakdown:
    - `backend`: 2,620 passed, 0 failed (119 suites)
    - `client`: 656 passed, 0 failed (75 suites)
    - `email-pdf`: 31 passed, 0 failed (2 suites)
    - `ml-scoring`: 40 passed, 0 failed
    - `ml-flask`: 31 passed, 0 failed
    - `root`: 55 passed, 0 failed
    - `ml-status-contract`: 7 passed, 0 failed
  - Gate Status: `sourceFrozen: true`, `protectedAccountedFor: 15`.

## 3. Dry-Run Verification Result
- **Dry-Run Command**:
  ```bash
  node -e "require('./scripts/seed-platform-data.js').runCli(['--dry-run','--db','medisync_prod']).then(r=>console.log(JSON.stringify(r))).catch(e=>console.log('CODE:',e.code,'| NAME:',e.name,'| MSG:',String(e.message).slice(0,200)))"
  ```
- **Execution Outcome**: Success (Exit code: 0). MongoServerError 8000 ("bad auth") resolved.
- **Dry-Run Output**:
  ```json
  {
    "mode": "seed",
    "dryRun": true,
    "existingOwned": {
      "Patient": 0,
      "Doctor": 0,
      "Hospital": 0,
      "Pharmacy": 0,
      "PharmacyStaff": 0,
      "Consultation": 0,
      "Prescription": 0,
      "LabTest": 0,
      "Dispensing": 0
    },
    "planned": {
      "Patient": 400,
      "Hospital": 12,
      "Doctor": 40,
      "Pharmacy": 15,
      "PharmacyStaff": 15,
      "Consultation": 4500,
      "Prescription": 4000,
      "LabTest": 1125,
      "Dispensing": 2800
    },
    "existingOrTestAccountsTouched": 0,
    "wouldInsert": 12907,
    "wouldDelete": 0
  }
  ```
- **Record Plan Total**: **12,907** records planned for insertion across 9 models.

## 4. Exact Morning Run Commands (Operators Only)

> **Important**: Ensure environment variables (`MEDISYNC_SEED_RUN_APPROVAL="SEED RUN APPROVED"` and valid operator encryption keys) are loaded in the environment or operator shell before running live commands. Never log or echo sensitive credentials.

### Step 1: Pre-execution Dry-Run Verification
Verify connectivity and plan without writing data:
```bash
node -e "require('./scripts/seed-platform-data.js').runCli(['--dry-run','--db','medisync_prod']).then(r=>console.log(JSON.stringify(r))).catch(e=>console.log('CODE:',e.code,'| NAME:',e.name,'| MSG:',String(e.message).slice(0,200)))"
```
Expected output: `wouldInsert: 12907`, `wouldDelete: 0`, `dryRun: true`.

### Step 2: Live Seed Execution
Once approved by the operator, execute live seed:
```bash
node scripts/seed-platform-data.js --db medisync_prod --confirm
```
*Note: Requires `MEDISYNC_SEED_RUN_APPROVAL="SEED RUN APPROVED"` in the environment.*

### Step 3: Post-Execution Verification
Verify the seeded database state using read-only verification:
```bash
node -e "require('./scripts/seed-platform-data.js').runCli(['--dry-run','--db','medisync_prod']).then(r=>console.log(JSON.stringify(r)))"
```
Expected output: `existingOwned` matches 12,907 records; `wouldInsert: 0`.
