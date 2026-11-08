# MediSync — Owner Production Actions & Runbook (Sub-Project 3)

This document contains instructions and exact copy-pasteable commands for the repository owner to execute in production environments (`medisync_prod`, Render, MongoDB Atlas). The automated AI agent operates strictly in offline/in-memory mode and never writes to or alters production infrastructure.

---

## Action 1: MongoDB Atlas Connectivity & Network Access

### Technical Context
When executing administrative scripts from a local terminal, connections to MongoDB Atlas require:
1. **Network Access**: Your current public IP address must be in the Atlas Network Access allowlist (or `0.0.0.0/0` temporarily).
2. **Shared Mongoose Instance**: Mongoose instance duplication previously caused `Operation buffering timed out` when scripts resolved a distinct Mongoose copy from models. This was resolved in Sub-Project 2 by explicitly resolving Mongoose from `server/node_modules`.

### Verification Steps
1. Log in to [MongoDB Atlas Console](https://cloud.mongodb.com/).
2. Select your project and navigate to **Security** -> **Network Access**.
3. Verify your IP is added (click **Add Current IP Address** if changed).
4. Ensure the database user in `server/.env` (`MONGODB_URI`) has `readWrite` permissions on `medisync_prod`.
5. Quick connection test from repository root:
   ```powershell
   node -e "const mongoose = require(require.resolve('mongoose', { paths: [require('path').resolve('server')] })); require('dotenv').config({ path: 'server/.env' }); mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 }).then(() => { console.log('Atlas Connected Successfully!'); process.exit(0); }).catch(e => { console.error('Connection Failed:', e.message); process.exit(1); });"
   ```

---

## Action 2: Seeding Realistic Dispensing Sample Data

Namespace: `SEED_2026_11_B` (additive & idempotent 30-day pharmacy dispensing samples).

### Step 2A: View CLI Contract / Help
```powershell
node scripts/seed-dispensing-sample.js --help
```

### Step 2B: Dry-Run (Verification Only — Read-Only Count, No Database Writes)
```powershell
node scripts/seed-dispensing-sample.js --db medisync_prod --dry-run
```
*Expected Output*: Displays matched pharmacies, doctors, and simulated dispensing transactions without writing documents.

### Step 2C: Real Seeding Execution (Writes Enabled)
> [!IMPORTANT]
> Applying database writes requires both the `--confirm` flag and the approval environment variable `MEDISYNC_SEED_RUN_APPROVAL="SEED RUN APPROVED"`.

Run in PowerShell:
```powershell
$env:MEDISYNC_SEED_RUN_APPROVAL="SEED RUN APPROVED"
node scripts/seed-dispensing-sample.js --db medisync_prod --confirm
```
*Expected Output*: Inserts sample dispensing events under namespace `SEED_2026_11_B` and updates prescription statuses.

---

## Action 3: Purging Synthetic Demo / Test Batch Data

Target batch: `DEMO_OUTBREAK_2026_V1` (6,309 synthetic consultations and 14 simulation alerts tagged `SYNTHETIC EPIDEMIOLOGICAL SIMULATION — FOR SYSTEM TESTING ONLY`). Excludes and protects `SEED_2026_11_A`.

### Step 3A: View CLI Contract / Help
```powershell
node scripts/remove_demo_batch.js --help
```

### Step 3B: Dry-Run (Safe Inspection — Read-Only Count, No Deletions)
```powershell
node scripts/remove_demo_batch.js --db medisync_prod --dry-run
```
*Expected Output*: Prints counts of targeted demo consultations and alerts without deleting data.

### Step 3C: Permanent Deletion Execution (Destructive Removal)
> [!CAUTION]
> This command permanently removes targeted demo batch records. Both the explicit `--confirm-demo-removal DEMO_OUTBREAK_2026_V1` CLI argument and the approval environment variable `APPROVE_DEMO_OUTBREAK_REMOVAL=true` are required.

Run in PowerShell:
```powershell
$env:APPROVE_DEMO_OUTBREAK_REMOVAL="true"
node scripts/remove_demo_batch.js --db medisync_prod --confirm-demo-removal DEMO_OUTBREAK_2026_V1
```
*Expected Output*: Deletes targeted records, confirms 0 clinical records affected, and verifies `SEED_2026_11_A` remains intact.

---

## Action 4: Enabling Verification Tokens Collection in Production

In Phase P2, the `VerificationToken` model was introduced to power QR-verified consultation summaries and the public patient history gate. In `server/src/security/productionStorageManifest.json`, the collection is gated behind an approval flag:

```json
"whenAll": ["MEDISYNC_VERIFICATION_TOKENS_APPROVED"]
```

### Steps to Activate on Render:
1. Open the [Render Dashboard](https://dashboard.render.com/).
2. Select your `medisync-backend` web service.
3. Navigate to **Environment**.
4. Add the following environment variables:
   - **Key**: `MEDISYNC_VERIFICATION_TOKENS_APPROVED`
   - **Value**: `true`
   - **Key**: `MEDISYNC_AUTO_PROVISION_STORAGE`
   - **Value**: `true`
5. Save changes. Render will redeploy the backend and automatically create the missing collection and 5 indexes additively.
6. **Security Hardening Post-Boot**: Once the `verificationtokens` collection exists on Atlas, remove `MEDISYNC_AUTO_PROVISION_STORAGE` from Render environment variables so the storage boot guard resumes failing closed against unexpected schema modifications.

---

## Action 5: Understanding Render Free Tier ML Service Cold Starts

### Context (UptimeRobot Alert Clarification)
The ML Engine (`medisync-ml.onrender.com`) is hosted on the Render **Free Tier**.
- Render spins down free tier instances after **15 minutes** of inactivity.
- When an incoming HTTP request arrives while the service is asleep, Render wakes the container. This "cold start" takes approximately **45 to 60 seconds** (loading Python dependencies and 71,704 ICD-10 medical concepts).
- **Why UptimeRobot reported "Down"**: UptimeRobot probes every 10 minutes with a default HTTP timeout of **30 seconds**. If the container was asleep, the 30s timeout triggered a "Down" incident, but the request successfully triggered the spin-up, resulting in the ~435ms response seen on subsequent checks.

### Verifying Service Health Manually
To check the live status of the ML service at any time:
```powershell
curl.exe -i -m 90 https://medisync-ml.onrender.com/health
```
*Expected Response*:
```json
HTTP/1.1 200 OK
{"references":{"clinicalValidation":"not_established","files":7,"icd10Concepts":71704},"status":"ready"}
```

### Recommendation
In the UptimeRobot monitor settings for `medisync-ml.onrender.com/health`:
1. Change the monitor interval to **5 minutes** (this prevents the 15-minute inactivity spin-down altogether).
2. If available on your plan, adjust the HTTP timeout threshold to **60 seconds**.

---

## Action 6: Production PR Merge & Deployment

1. The Sub-Project 3 delivery is stacked across:
   - `feat/sub3-p0`
   - `feat/sub3-p1`
   - `feat/sub3-p2`
   - `feat/sub3-p3`
   - `feat/sub3-p4`
2. Open Pull Request on GitHub:
   - **Base branch**: `main`
   - **Compare branch**: `feat/sub3-p4`
3. Review the CI check results (offline gate & client build).
4. Merge the pull request. Vercel (frontend) and Render (backend) will trigger automatic deployment.
