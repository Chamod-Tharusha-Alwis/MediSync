# MediSync — Legacy Demo Outbreak Batch Removal Runbook

**Target Batch**: `DEMO_OUTBREAK_2026_V1`  
**Tooling**: `scripts/remove_demo_batch.js`  
**Status**: Guarded operator procedure (Owner-execution only; dry-run default)  
**Safety Classification**: HIGH RISK — Double-barrier destructive removal protection  

---

## 1. Executive Summary & Purpose

During early system development, a synthetic demonstration outbreak batch (`DEMO_OUTBREAK_2026_V1`) was generated to populate initial epidemiological visualizations and mock alert queues. With the successful execution and verification of production seed namespace `SEED_2026_11_A` (12,907 clinical records), the legacy batch `DEMO_OUTBREAK_2026_V1` is scheduled for guarded retirement.

This runbook defines the operational prerequisites, dry-run inspection steps, execution syntax, and verification queries to safely purge `DEMO_OUTBREAK_2026_V1` while guaranteeing zero impact on `SEED_2026_11_A` or genuine clinical/user accounts.

---

## 2. Safety Invariants & Guard Architecture

The removal script `scripts/remove_demo_batch.js` implements a strict four-pillar safety architecture:

1. **Dry-Run by Default**:
   Running without explicit execution flags operates strictly in read-only mode, executing `countDocuments` queries only. Zero writes, deletions, or schema mutations are possible.

2. **Double-Barrier Authorization Gate**:
   Executing destructive deletion requires **both** of the following simultaneously:
   - CLI Flag: `--confirm-demo-removal DEMO_OUTBREAK_2026_V1`
   - Environment Variable: `APPROVE_DEMO_OUTBREAK_REMOVAL=true` or `MEDISYNC_DEMO_REMOVAL_APPROVAL=APPROVED`
   If either barrier is missing, the script fails closed with error code `APPROVAL_ENV_REQUIRED` or `BATCH_UNAPPROVED`.

3. **Cryptographic Query Isolation**:
   Every query executed by `scripts/remove_demo_batch.js` explicitly includes the safeguard:
   ```javascript
   {
     syntheticSeedBatch: { $ne: 'SEED_2026_11_A' }
   }
   ```
   This ensures that even in the event of malformed document tags, no record belonging to `SEED_2026_11_A` can ever be matched or targeted.

4. **Post-Execution Integrity Assertion**:
   Before committing completion, the script verifies the exact document count of `SEED_2026_11_A`. If the post-deletion count differs from the pre-deletion count by even a single document, it throws `INTEGRITY_BREACH`.

---

## 3. Operational Prerequisites

Before executing any commands:
- [ ] Ensure working directory is repository root: `C:\Users\chamo\OneDrive\Desktop\Final project\medisync`.
- [ ] Confirm `server/.env` contains valid read/write credentials for `medisync_prod`.
- [ ] Ensure offline test gate is green: `node scripts/run_offline_tests.js`.
- [ ] Confirm no concurrent seed or clinical operations are active on Atlas.

---

## 4. Step-by-Step Execution Procedure

### Step 4.1: Pre-Flight Dry Run (Read-Only)

Execute the script in default dry-run mode:

```powershell
node scripts/remove_demo_batch.js --dry-run --db medisync_prod
```

**Expected JSON Output**:
```json
{
  "batchId": "DEMO_OUTBREAK_2026_V1",
  "database": "medisync_prod",
  "dryRun": true,
  "protectedSeedCount": 4500,
  "protectedSeedPreserved": true,
  "consultationsTargeted": 0,
  "alertsTargeted": 0,
  "consultationsDeleted": 0,
  "alertsDeleted": 0,
  "status": "DRY_RUN_COMPLETED",
  "timestamp": "2026-11-07T11:00:00.000Z"
}
```

*Note: If `consultationsTargeted` is 0, the batch was either already removed or never written to the target database. No further action is required.*

---

### Step 4.2: Guarded Deletion Execution (Repository Owner Only)

If `consultationsTargeted > 0` and decommissioning is approved, set the approval environment variable and execute the command:

```powershell
# Set approval flag in current process session
$env:APPROVE_DEMO_OUTBREAK_REMOVAL="true"

# Execute double-barrier guarded removal
node scripts/remove_demo_batch.js --confirm-demo-removal DEMO_OUTBREAK_2026_V1 --db medisync_prod

# Immediately clear approval variable from environment
Remove-Item Env:\APPROVE_DEMO_OUTBREAK_REMOVAL
```

**Expected JSON Output**:
```json
{
  "batchId": "DEMO_OUTBREAK_2026_V1",
  "database": "medisync_prod",
  "dryRun": false,
  "protectedSeedCount": 4500,
  "protectedSeedPreserved": true,
  "consultationsTargeted": <N>,
  "alertsTargeted": <M>,
  "consultationsDeleted": <N>,
  "alertsDeleted": <M>,
  "status": "DELETION_COMPLETED",
  "timestamp": "2026-11-07T11:05:00.000Z"
}
```

---

## 5. Post-Removal Verification Queries

Verify that the target batch has been cleanly decommissioned and production seed data remains intact:

```powershell
# 1. Verify 0 consultations remain for DEMO_OUTBREAK_2026_V1
node -e "
const mongoose = require('./server/node_modules/mongoose');
const { selectOperatorDatabase } = require('./server/scripts/operatorDatabaseMode');
require('dotenv').config({ path: './server/.env' });
(async () => {
  const target = selectOperatorDatabase(process.env, false);
  await mongoose.connect(target.uri);
  const db = mongoose.connection.db;
  const count = await db.collection('consultations').countDocuments({
    \$or: [
      { demoBatchId: 'DEMO_OUTBREAK_2026_V1' },
      { isSimulatedDemo: true }
    ]
  });
  console.log('Legacy demo consultations remaining:', count);
  await mongoose.disconnect();
})();
"
```
**Expected**: `Legacy demo consultations remaining: 0`.

```powershell
# 2. Verify SEED_2026_11_A inventory integrity (Expect 12,907 total records)
node scripts/seed-platform-data.js --dry-run --db medisync_prod
```
**Expected**: `wouldInsert: 0`, `existingOwned` counts exactly match 12,907 across all 9 collections.

---

## 6. Rollback & Contingency Plan

If an unexpected error occurs during deletion:
1. `remove_demo_batch.js` aborts immediately upon connection or query failure.
2. MongoDB document deletes are atomic per document; records outside the explicit `$and` query filter are never touched.
3. If necessary, re-run `node scripts/seed-platform-data.js --dry-run --db medisync_prod` to verify baseline integrity.
