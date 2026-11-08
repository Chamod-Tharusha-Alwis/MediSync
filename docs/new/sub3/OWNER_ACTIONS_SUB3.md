# MediSync — Owner Production Actions & Runbook (Sub-Project 3)

This document contains instructions and exact copy-pasteable commands for the repository owner to execute in production environments (`medisync_prod`, Render, MongoDB Atlas). The automated AI agent operates strictly in offline/in-memory mode and never writes to or alters production infrastructure.

---

## Action 1: MongoDB Atlas Connectivity & IP Whitelisting

### Issue Diagnosed
When running `node scripts/seed-dispensing-sample.js --db medisync_prod --dry-run`, Mongoose reported:
```
Operation pharmacies.findOne() buffering timed out after 10000ms
```
This timeout occurs because the local IP address from which the command was executed is not whitelisted in the MongoDB Atlas Network Access control list, or the Atlas cluster was temporarily unreachable.

### Remediation Steps
1. Log in to [MongoDB Atlas Console](https://cloud.mongodb.com/).
2. Select your project and navigate to **Security** -> **Network Access**.
3. Click **Add IP Address**.
4. Choose **Add Current IP Address** (or `0.0.0.0/0` temporarily for script execution, then remove it).
5. Ensure the database user defined in `server/.env` (`MONGODB_URI`) has `readWrite` permissions on the `medisync_prod` database.
6. Verify connection from your PowerShell terminal:
   ```powershell
   node -e "const mongoose = require('mongoose'); require('dotenv').config({ path: 'server/.env' }); mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 }).then(() => { console.log('Atlas Connected Successfully!'); process.exit(0); }).catch(e => { console.error('Connection Failed:', e.message); process.exit(1); });"
   ```

---

## Action 2: Seeding Realistic Dispensing Sample Data

Once Atlas connectivity is verified, populate realistic pharmacy dispensing samples.

### Step 2A: Dry-Run (Verification Only — No Database Writes)
Run from repository root in PowerShell:
```powershell
node scripts/seed-dispensing-sample.js --db medisync_prod --dry-run
```
*Expected Output*: Displays the matched pharmacies, doctors, and simulated dispensing transactions without writing documents.

### Step 2B: Real Seeding Execution
Run from repository root in PowerShell:
```powershell
node scripts/seed-dispensing-sample.js --db medisync_prod
```
*Expected Output*: Successfully inserts the sample dispensing events and updates prescription statuses.

---

## Action 3: Purging Synthetic Demo / Test Batch Data

The database contains 6,309 synthetic consultations and 14 simulation alerts generated during test batches (tagged `SYNTHETIC EPIDEMIOLOGICAL SIMULATION — FOR SYSTEM TESTING ONLY`).

### Step 3A: Dry-Run (Safe Inspection)
Run from repository root in PowerShell:
```powershell
node scripts/remove_demo_batch.js --db medisync_prod --dry-run
```
*Expected Output*: Prints the count of targeted demo records (consultations, alerts, audit logs) without deleting any data.

### Step 3B: Permanent Execution (Only When Ready)
> [!CAUTION]
> This command permanently removes synthetic demo records. Ensure you have reviewed the dry-run output before executing.

Run from repository root in PowerShell:
```powershell
node scripts/remove_demo_batch.js --db medisync_prod --execute
```

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
4. Add the following environment variable:
   - **Key**: `MEDISYNC_VERIFICATION_TOKENS_APPROVED`
   - **Value**: `true`
5. Save changes. Render will automatically redeploy the backend and create the collection indexes (including the 90-day automatic TTL index).

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
