# MediSync Gate 3 Operator Runbook: Production Deployment

> **TARGET IDENTITY & CLASSIFICATION**
> - **Product**: MediSync Capstone Prototype
> - **Scope**: **Synthetic Data Only** — Not cleared for real patient use.
> - **Frontend**: Vercel (`medi-sync`, `https://medisync.chamodtharusha.com.lk`)
> - **Backend API**: Render Web Service (`medisync-wabc`)
> - **ML Engine**: Render Web Service (`medisync-ml-service`)
> - **Production Database**: MongoDB Atlas cluster `medisync.p7hjket.mongodb.net`, database `medisync_prod`, user `medisync_prod` (`readWrite@medisync_prod`)
> - **Managed Redis**: Remote Redis with TLS (`rediss://`)

---

## Step 0: Operator Pre-Flight Checklist

Before running any deployment script, complete these manual prerequisites:

1. **Atlas Network Access**:
   - In MongoDB Atlas Dashboard -> Network Access -> IP Access List:
   - Add `0.0.0.0/0` (Allow Access from Anywhere) with a comment like `Render Dynamic Web Services`.
   - Add your current Operator Workstation IP address (e.g. `203.xxx.xxx.xxx/32`) so CLI provisioning scripts can connect directly.

2. **Managed Remote Redis**:
   - Provision a remote cloud Redis instance (e.g., Upstash, Redis Cloud, or Aiven) with TLS enabled.
   - Confirm connection protocol is strictly `rediss://` (port usually `6379` or provider-specific).
   - Local Docker Redis (`127.0.0.1:6379`) is prohibited in production by `redisConnectionPolicy.js`.

3. **Generate High-Entropy Production Secrets Locally**:
   Run these one-line commands in your local terminal to generate cryptographically secure secrets:
   ```bash
   # 32-byte encryption key (64 hex characters):
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

   # JWT signing secret (64 hex characters):
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

   # JWT refresh secret (64 hex characters):
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

   # Session secret (64 hex characters):
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

   # Internal ML shared key (64 hex characters):
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. **Transactional Email Domain Verification**:
   - Log in to your Resend (or Brevo) dashboard.
   - Confirm sender domain (e.g. `chamodtharusha.com.lk` or verified domain) shows status **Verified** (DKIM/SPF passed).
   - Set `RESEND_FROM_ADDRESS` to a verified mailbox (e.g. `noreply@medisync.chamodtharusha.com.lk`).

5. **Backup Existing Hosting Configurations**:
   - Take screenshots or export existing environment variables from Render (`medisync-wabc`, `medisync-ml-service`) and Vercel (`medi-sync`).

6. **Atlas Database User Verification & Cleanup**:
   - In MongoDB Atlas -> Database Access:
   - Ensure user `medisync_prod` exists and has **only** the `readWrite` built-in role scoped strictly to the `medisync_prod` database (`readWrite@medisync_prod`).
   - Remove or disable any unused or previously compromised database users.

---

## Step 1: Render Backend Environment Configuration (`medisync-wabc`)

Configure the following environment variables in Render Dashboard -> `medisync-wabc` -> **Environment**:

### Required Variables
| Variable Name | Value / Description |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `10000` (or Render standard port) |
| `MEDISYNC_PROTOTYPE_MODE` | `true` (enforces synthetic data notice and prototype guards) |
| `MEDISYNC_ALLOW_OPERATOR_KEYS` | `true` (enables operator key policy in place of Vault for prototype) |
| `MEDISYNC_LIVE_START_APPROVED` | `true` (attestation required by `clinicalEntryPolicy.js`) |
| `MEDISYNC_ATLAS_ROTATION_CONFIRMED` | `true` (attestation that credentials have been freshly generated) |
| `MONGO_URI` | `mongodb+srv://medisync_prod:<password>@medisync.p7hjket.mongodb.net/medisync_prod?tls=true&w=majority&readPreference=primary&authSource=admin&authMechanism=SCRAM-SHA-256` |
| `REDIS_URL` | `rediss://default:<password>@<host>:<port>` (must start with `rediss://` for TLS) |
| `ENCRYPTION_KEYS` | `{"1":"<32-byte-hex-key>"}` (Note: `operatorKeyPolicy.js` uses `ENCRYPTION_KEYS`, not `ENCRYPTION_KEY`) |
| `ACTIVE_KEY_VERSION` | `1` |
| `JWT_SECRET` | 64-hex random string generated above |
| `JWT_REFRESH_SECRET` | 64-hex random string generated above |
| `SESSION_SECRET` | 64-hex random string generated above |
| `INTERNAL_API_KEY` | 64-hex random string generated above (must match ML engine) |
| `CLIENT_URL` | `https://medisync.chamodtharusha.com.lk` (no trailing slash) |
| `CORS_ORIGIN` | `https://medisync.chamodtharusha.com.lk` (strictly identical to `CLIENT_URL`) |
| `ML_ENGINE_URL` | `https://medisync-ml-service.onrender.com` (or internal Render service URL) |
| `RESEND_API_KEY` | Production Resend API key |
| `RESEND_FROM_ADDRESS` | `noreply@<verified-domain>` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud account name |
| `CLOUDINARY_API_KEY` | Cloudinary public API key |
| `CLOUDINARY_API_SECRET` | Cloudinary private API secret |

### Forbidden Variables (Server Will Refuse to Boot if Present)
Ensure **none** of these exist in Render:
- `MONGO_URI_TEST`, `MONGODB_URI_TEST`, `MONGO_URI_STAGING`
- `SEED_TEST_PASSWORD`, `JEST_WORKER_ID`, `SINGLE_INSTANCE_DEV_MODE`
- `ENCRYPTION_KEY` (legacy singular key; use `ENCRYPTION_KEYS`)
- Any variable matching `/^MEDISYNC_(?:QA_|TEST_|COMBINED_|DEMO_)/i`

---

## Step 2: Render ML Microservice Configuration (`medisync-ml-service`)

Configure in Render Dashboard -> `medisync-ml-service` -> **Environment**:

| Variable Name | Value / Description |
|---|---|
| `PORT` | `10000` (or `5001`) |
| `INTERNAL_API_KEY` | Exact matching 64-hex random string from Backend API |
| `PYTHONPATH` | `.` |
| `FLASK_ENV` | `production` |

---

## Step 3: Vercel Frontend Configuration (`medi-sync`)

Configure in Vercel Dashboard -> `medi-sync` -> Settings -> **Environment Variables**:

| Variable Name | Value / Description |
|---|---|
| `REACT_APP_API_URL` | `https://medisync-wabc.onrender.com/api` |
| `REACT_APP_SERVER_URL` | `https://medisync-wabc.onrender.com` |
| `REACT_APP_CARTO_API_KEY` | Carto tile layer API key |
| `REACT_APP_GA_MEASUREMENT_ID` | Google Analytics measurement ID (or leave unset) |

*(Note: `REACT_APP_PROTOTYPE_NOTICE` is removed because the trilingual prototype disclaimer banner is unconditionally enabled in the client build).*

---

## Step 4: Step-by-Step Production Execution Order

Execute these steps in strict numerical sequence:

### 4.1 Offline Preflight Verification (Operator Machine)
Run without network or database connection to verify runtime rules:
```bash
node scripts/test_production_boot_harness.js
```
**Expected Real Output**:
```
[PRODUCTION BOOT HARNESS PASS] Offline boot semantics and host enforcement verified.
```

### 4.2 Online Preflight Connectivity Test
Set `MONGO_URI` in your temporary operator shell and test connection:
```bash
export MONGO_URI="mongodb+srv://medisync_prod:<password>@medisync.p7hjket.mongodb.net/medisync_prod?tls=true&w=majority&readPreference=primary&authSource=admin&authMechanism=SCRAM-SHA-256"
node server/scripts/preflightProduction.js --connect
```
**Expected Real Output**:
```
[PREFLIGHT PASS] Connected to medisync_prod on medisync.p7hjket.mongodb.net
Roles verified: [{"role":"readWrite","db":"medisync_prod"}]
```

### 4.3 Safety Backup (`mongodump` of Legacy Test Database)
Ensure existing operational test data on the cluster is preserved locally before touching production:
```bash
mongodump --uri="mongodb+srv://<admin_or_qa_user>:<password>@medisync.p7hjket.mongodb.net/test?authSource=admin" --out="./backup_legacy_test_$(date +%Y%m%d_%H%M%S)"
```

### 4.4 Provision Production Storage
Dry-run first:
```bash
node server/scripts/provisionProductionStorage.js
```
Expected output: `Storage dry-run: 29 collections, 66 indexes to provision`.

Apply provisioning:
```bash
node server/scripts/provisionProductionStorage.js --apply
```
Verify 100% compliance:
```bash
node server/scripts/provisionProductionStorage.js --verify
```
**Expected Real Output**:
```
Collections compliant: 29 / 29
Indexes compliant: 66 / 66
Storage compliance: 100.0% compliant
```

### 4.5 Bootstrap Synthetic Production Baseline
Set operator-controlled synthetic account passwords in your shell:
```bash
export BOOTSTRAP_ADMIN_PASSWORD="<strong-operator-password-1>"
export BOOTSTRAP_DOCTOR_PASSWORD="<strong-operator-password-2>"
export BOOTSTRAP_HOSPITAL_PASSWORD="<strong-operator-password-3>"
export BOOTSTRAP_PHARMACY_PASSWORD="<strong-operator-password-4>"
export BOOTSTRAP_PATIENT_PASSWORD="<strong-operator-password-5>"
```
Dry-run:
```bash
node server/scripts/bootstrapSyntheticAccounts.js
```
Apply baseline seeding:
```bash
node server/scripts/bootstrapSyntheticAccounts.js --apply --passwords-from-env
```
**Expected Real Output**:
```
Synthetic accounts bootstrapped successfully: 5 accounts, 1 prescription baseline, 1 lab test baseline.
Admin: admin.synth@medisync.synthetic
Doctor: doctor.synth@medisync.synthetic
Hospital: hospital.synth@medisync.synthetic
Pharmacist: pharmacist.synth@medisync.synthetic
Patient: patient.synth@medisync.synthetic
```

### 4.6 Resume & Verify ML Microservice
1. In Render Dashboard, resume or trigger manual deploy of `medisync-ml-service`.
2. Verify HTTP health check:
   ```bash
   curl -i https://medisync-ml-service.onrender.com/health
   ```
   Expected response: `HTTP/1.1 200 OK`, `{"status":"ready"}`.

### 4.7 Resume & Verify Backend API
1. In Render Dashboard, resume or trigger manual deploy of `medisync-wabc`.
2. Verify HTTP readiness endpoint:
   ```bash
   curl -i https://medisync-wabc.onrender.com/health
   ```
   Expected response: `HTTP/1.1 200 OK`, `{"status":"ready","service":"medisync-express"}`.

### 4.8 Merge Pull Request to Main & Deploy Frontend
1. Merge the GitHub PR `release/medisync-v1-final-integration` into `main`.
2. Monitor Vercel automatic build and deployment for project `medi-sync`.
3. Confirm deployment completes with exit code 0.

### 4.9 Post-Deployment Smoke Verification
Follow [`docs/RELEASE_SMOKE_TEST.md`](file:///c:/Users/chamo/OneDrive/Desktop/Final%20project/medisync/docs/RELEASE_SMOKE_TEST.md):
1. Navigate to `https://medisync.chamodtharusha.com.lk`.
2. Verify the trilingual prototype disclaimer banner is visible at top of page.
3. Log in as Doctor (`doctor.synth@medisync.synthetic`) -> Verify medical timeline loads and PDF download buttons are truthfully disabled.
4. Log in as Pharmacist (`pharmacist.synth@medisync.synthetic`) -> Perform prescription dispense -> Verify inventory decrement and receipt creation.
5. Log in as Patient (`patient.synth@medisync.synthetic`) -> Check `/history` -> Verify dispensed prescription and lab test appear.

---

## Step 5: Emergency Rollback Procedure

If fatal issues occur during post-deployment verification:

1. **Immediate Service Suspension**:
   - In Render Dashboard -> `medisync-wabc` -> Settings -> Click **Suspend Service** to prevent writes.
   - In Render Dashboard -> `medisync-ml-service` -> Click **Suspend Service**.

2. **Frontend Rollback**:
   - In Vercel Dashboard -> `medi-sync` -> Deployments -> Locate the previous known working deployment -> Click **Promote to Production** (or revert commit on `main`).

3. **Database Rollback / Teardown**:
   - If `medisync_prod` contains corrupted data or invalid schema:
     ```bash
     mongosh "mongodb+srv://medisync_prod:<password>@medisync.p7hjket.mongodb.net/medisync_prod?authSource=admin" --eval "db.dropDatabase()"
     ```
   - If the legacy `test` database was inadvertently affected, restore from the Step 4.3 backup:
     ```bash
     mongorestore --uri="mongodb+srv://<admin_user>:<password>@medisync.p7hjket.mongodb.net/test?authSource=admin" ./backup_legacy_test_<timestamp>/test
     ```

4. **Post-Mortem**:
   - Review Render logs for error stack traces or missing variables.
   - Re-run `node scripts/test_production_boot_harness.js` locally to reproduce before re-attempting deployment.
