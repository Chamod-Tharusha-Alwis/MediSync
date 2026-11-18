# MediSync Production Post-Seed Verification Report (Milestone 0 / R1)

**Execution Date:** 2026-11-06  
**Target Environment:** Production (`medisync_prod`)  
**Target Branch:** `chore/post-seed-verification`  
**Execution Authority:** Milestone 0 Post-Seed Verification Specification (R1)  
**Security Mode:** STRICT PRODUCTION READ-ONLY (Zero Writes, Zero Secret Disclosures)

---

## 1. Executive Summary & Verification Gate Status

The production seed state of MediSync has been verified read-only against MongoDB Atlas (`medisync_prod`). All 12,907 synthetic platform records across 9 collections are verified present, fully owned under namespace `SEED_2026_11_A`, and cryptographically consistent.

| Gate / Requirement | Target / Constraint | Observed Status | Verdict |
|---|---|---|---|
| **Production Safety** | Read-only CLI (`--dry-run`) | Zero writes, zero drops, zero index mutations | **PASS** |
| **Total Owned Documents** | Exactly 12,907 records across 9 models | 12,907 documents verified in `existingOwned` | **PASS** |
| **Idempotency** | `wouldInsert: 0`, `wouldDelete: 0` | `wouldInsert: 0`, `wouldDelete: 0` | **PASS** |
| **Collisions** | `existingOrTestAccountsTouched: 0` | 0 collisions with real operator accounts | **PASS** |
| **Namespace Provenance** | `syntheticSeedBatch: 'SEED_2026_11_A'` | 100% of seeded documents match | **PASS** |
| **Referential Integrity** | Zero orphan foreign references | `assertNoForeignReferences` clean (0 orphans) | **PASS** |
| **Field Decryption** | AES-256 operator keyring decryption | 5 Patients + 5 Consultations decrypt clean | **PASS** |
| **Outbreak Mechanism** | Safe execution boundary | State-mutating code identified; validated offline | **PASS** |
| **Public Health Probes** | Live site GET probes + $N \ge 5$ threshold | All public endpoints verified live | **PASS** |
| **Offline Test Suite** | `node scripts/run_offline_tests.js` | 0 failed, 3,440 passed (15/15 pins intact) | **PASS** |
| **Client Application Build** | `npm run build` | Exit code 0, 0 build errors | **PASS** |

---

## 2. Seed State Verification & Collection Counts

### 2.1 Dry-Run Execution Command
```bash
node --no-warnings -e "require('./scripts/seed-platform-data.js').runCli(['--dry-run','--db','medisync_prod']).then(r=>console.log(JSON.stringify(r,null,2)))"
```

### 2.2 Collection Inventory & Model Breakdown

| Model / Collection | Planned | Existing Owned | Would Insert | Would Delete | Ownership Tag / Namespace |
|---|---|---|---|---|---|
| `Patient` | 400 | 400 | 0 | 0 | `SEED_2026_11_A` (`isSynthetic: true`) |
| `Doctor` | 40 | 40 | 0 | 0 | `SEED_2026_11_A` (`isSynthetic: true`) |
| `Hospital` | 12 | 12 | 0 | 0 | `SEED_2026_11_A` (`isSynthetic: true`) |
| `Pharmacy` | 15 | 15 | 0 | 0 | `SEED_2026_11_A` (`isSynthetic: true`) |
| `PharmacyStaff` | 15 | 15 | 0 | 0 | `SEED_2026_11_A` (`isSynthetic: true`) |
| `Consultation` | 4,500 | 4,500 | 0 | 0 | `SEED_2026_11_A` (`isSynthetic: true`) |
| `Prescription` | 4,000 | 4,000 | 0 | 0 | `SEED_2026_11_A` (`isSynthetic: true`) |
| `LabTest` | 1,125 | 1,125 | 0 | 0 | `SEED_2026_11_A` (`isSynthetic: true`) |
| `Dispensing` | 2,800 | 2,800 | 0 | 0 | `SEED_2026_11_A` (`isSynthetic: true`) |
| **Total** | **12,907** | **12,907** | **0** | **0** | **Verified 100% Owned** |

### 2.3 Non-Seed & Existing Records Audit
An audit of non-seed records was performed against `medisync_prod`:
- Verified existing records:
  - Doctor: 1 real verified record (`"Dr. Chamod Alwis"`, General Medicine).
  - Hospital: 1 real verified record (`"Ayu Arana Care Hospital"`).
  - Pharmacy: 1 real verified record (`"Ayu Arana Care Pharmacy"`, Kandy district).
  - Consultations: 8 real recorded consultation visits (2 on 2026-10-30, 2 on 2026-11-02, 3 on 2026-11-03, 1 on 2026-11-05).
- Zero namespace collisions: `existingOrTestAccountsTouched: 0`. None of the real clinical or facility records share synthetic IDs (`PAT-SYNTH-*`, `DOC-SYNTH-*`, `HOSP-SYNTH-*`, `PHARM-SYNTH-*`, `CON-SYNTH-*`).

---

## 3. Seed Code Path Resilience & Deprecation Audit

### 3.1 Earlier Failed Attempt Root Cause Analysis
- **Symptom**: During initial seed preparation, connection attempts failed with `MongoServerError: Authentication failed` (Error code 8000).
- **Root Cause**: `server/scripts/operatorDatabaseMode.js` previously forced `authMechanism: 'SCRAM-SHA-256'` on production connection options. MongoDB Atlas clusters authenticate via dynamic SASL negotiation (supporting SCRAM-SHA-1 and SCRAM-SHA-256). Forcing `SCRAM-SHA-256` explicitly bypassed standard driver mechanism negotiation, causing an authentication rejection.
- **Remediation**: In PR #16 (`f9b04f5`), `authMechanism` was scoped strictly to QA mode (`isQa === true`) and omitted for production mode, aligning with `connectProductionDB` in `server/src/config/dbGuard.js`.

### 3.2 Transient & Timeout Resilience
- In `scripts/seed-platform-data.js`, `connectWithRetry` was implemented to retry transient network timeouts (`MongoServerSelectionError`, `MongoNetworkError`, `ETIMEDOUT`, `ECONNRESET`) up to 2 times with linear backoff (1000ms, 2000ms).
- Non-transient errors (e.g. auth failure code 8000, database mismatch, URI constraint violation) fail fast immediately on attempt 1 without retry.
- Tested and verified with 4 dedicated unit tests in `server/tests/seedPlatformData.test.js`.
- Chunked querying: `inspectOwned` chunks ownership verification into 500-document batches to prevent driver cursor timeouts over TLS.
- Deprecation elimination: Replaced `doc.validateSync()` with async `await doc.validate()` in `scripts/seedPlatformStore.cjs`, eliminating Mongoose 10 deprecation warnings.

---

## 4. End-to-End Field Decryption Verification

### 4.1 Cryptographic Architecture
- AES-256-CBC field encryption is managed by `server/src/utils/versionedEncryption.js`.
- Key management is governed by `server/src/security/operatorKeyPolicy.js` (`validateAndLoadOperatorKeys`).
- Raw database documents store ciphertext prefixed by a 32-byte hexadecimal initialization salt (`/^[0-9a-f]{32}:[0-9a-f]+$/i`), with boolean indicator `__enc_<fieldName>: true`.
- On document initialization (`init` hook), `doDecrypt` decrypts the field using `global.ENCRYPTION_KEYS[doc.keyVersion]`, populates the plain-text property, and toggles `__enc_<fieldName>` to `false`.

### 4.2 Decryption Test Results
A sample of 5 seeded Patients and 5 seeded Consultations was queried and hydrated through Mongoose models using local operator keys:

- **Patient Model** (`server/src/models/Patient.js`):
  - Encrypted fields: `['fullName', 'contactInfo', 'allergies']`.
  - Sample records: 5/5 patients successfully decrypted `fullName` (e.g. `"SEED Patient 00001"`), `contactInfo`, and `allergies` array.
  - Result: **PASS**.
- **Consultation Model** (`server/src/models/Consultation.js`):
  - Encrypted fields: `['patientNic', 'diagnosis', 'notes']`.
  - Sample records: 5/5 consultations successfully decrypted `diagnosis` (e.g. `"Mumps without complication"`), `patientNic` (12-digit NIC), and `notes`.
  - Result: **PASS**.
- **Overall Decryption Assessment**: **PASS** (10/10 records verified, zero plaintext secrets or cryptographic keys logged).

### 4.3 Required Hosting Environment Variables

| Variable Name | Required Value / Format | Purpose |
|---|---|---|
| `NODE_ENV` | `"production"` | Runtime operational mode |
| `PORT` | `"5000"` | HTTP listener port |
| `CLIENT_URL` | `https://medisync.chamodtharusha.com.lk` | Allowed CORS client origin |
| `MEDISYNC_PROTOTYPE_MODE` | `"true"` | Prototype runtime flag |
| `MEDISYNC_ALLOW_OPERATOR_KEYS` | `"true"` | Enables operator keyring loader |
| `ENCRYPTION_KEYS` | JSON map of 32-byte hex keys (e.g. `'{"1":"..."}'`) | Multi-version AES-256 field encryption keys |
| `ACTIVE_KEY_VERSION` | `"1"` (matching keyring active key) | Key version for active writes |
| `VAULT_TOKEN` | Token string (MUST NOT be `"bypass"`) | Production secret manager token |
| `MONGO_URI` | Atlas production connection string | MongoDB Atlas `medisync_prod` URI |
| `JWT_SECRET` | 64+ char high-entropy string | User access token signing secret |
| `JWT_REFRESH_SECRET` | 64+ char high-entropy string | User refresh token signing secret |
| `REDIS_URL` | Upstash Redis TLS URI | Distributed cache and session store |
| `INTERNAL_API_KEY` | 32+ char secret string | Internal microservice HMAC authentication |
| `ML_ENGINE_URL` | URL string (e.g. `https://medisync-ml.onrender.com`) | Microservice URL for outbreak ML |
| `RESEND_API_KEY` | API key string | Email dispatch service key |
| `PDF_EXPORT_ENABLED` | `"false"` (default) / `"true"` | Feature flag for clinical PDF generation |
| `MEDISYNC_BACKGROUND_JOBS_APPROVED` | `"true"` | Enables background cron tasks |
| `MEDISYNC_CRON_TIMEZONE` | `"Asia/Colombo"` | Timezone for scheduled surveillance |

---

## 5. Outbreak Alert Generation Mechanism Assessment

### 5.1 Code Path Audit
- Service: `server/src/services/surveillanceService.js` (`runAnalysis`).
- Database write operations:
  - Line 75: `await OutbreakAlert.updateOne({_id},{$setOnInsert:alertData},{upsert:true});`
  - Line 80: `await notifyOutbreakAlert({ _id, ...alertData }, { io });`
- **Assessment**: The outbreak alert generator performs database writes (upserting alert records into MongoDB) and dispatches real-time WebSocket notifications. It is **NOT read-only**.
- **Production Guardrail**: In strict compliance with production safety rules, the alert generator was **NOT executed against `medisync_prod`**.

### 5.2 Offline In-Memory Validation (Scenarios S1–S8)
Validation was executed offline via `server/tests/helpers/seedPlatformMemoryCases.cjs` against in-memory replica fixtures initialized with `buildSeedPlatformPlan`:
- **Detection Criteria**:
  - Eligible case floor: $N \ge 5$ distinct episodes per disease $\times$ district within the 7-complete-day window ending yesterday.
  - Baseline: 23 complete days ending 7 days prior to window $W$ (7-day buffer to eliminate contamination).
  - Anomaly threshold: at least 2 consecutive complete days above daily threshold ($z > 2$).
- **Scenarios Evaluated**:
  - S1–S7: Western province dengue cluster (Colombo, Gampaha, Kalutara), Leptospirosis, Chickenpox Galle, Influenza multi-district, Typhoid/diarrhoeal, Hepatitis A Matale trigger qualifying alerts.
  - S8: Single-day Ampara spike does NOT alert (fails 2 consecutive complete days requirement).
  - Background: Quiet baseline does NOT alert.
- **Offline Result**: Verified 100% compliant with surveillance criteria.

### 5.3 Operator Manual Trigger Steps for Staging / Production
When approved for staging or production execution:
1. **Authenticated API Trigger**:
   ```bash
   NODE_TOKEN=$(node -e "require('dotenv').config(); console.log(require('./server/src/utils/internalAuth').generateToken())")
   curl -X POST https://medisync-wabc.onrender.com/api/alerts/trigger \
     -H "x-internal-key: $NODE_TOKEN" \
     -H "Content-Type: application/json"
   ```
2. **Container CLI Trigger**:
   ```bash
   node -e "require('./server/src/services/surveillanceService').runAnalysis({ mode: 'real' }).then(r => console.log(JSON.stringify(r, null, 2)))"
   ```
3. **Scheduled Automated Cron**:
   Runs automatically at 02:00 UTC daily when `MEDISYNC_BACKGROUND_JOBS_APPROVED="true"` in `server/src/utils/cronJobs.js`.

---

## 6. Live Public GET Probes & Endpoint Verification

Live HTTP GET probes were executed against the public frontend (`https://medisync.chamodtharusha.com.lk`) and production backend API (`https://medisync-wabc.onrender.com`):

### 6.1 Summary of Probe Results

| Endpoint Path | Host | HTTP Status | Response Summary |
|---|---|---|---|
| `/public-health` | Edge (`chamodtharusha.com.lk`) | `200 OK` | HTML SPA shell, trilingual switching (EN/SI/TA), responsive viewports |
| `/health` | Backend (`onrender.com`) | `200 OK` | `status: "ready"`, `commit: "2df832d"` |
| `/api/public/doctors` | Backend (`onrender.com`) | `200 OK` | 1 verified real doctor; synthetic records excluded |
| `/api/public/hospitals` | Backend (`onrender.com`) | `200 OK` | 1 verified real hospital; synthetic records excluded |
| `/api/public/pharmacies` | Backend (`onrender.com`) | `200 OK` | 1 verified real pharmacy; synthetic records excluded |
| `/api/public/consultation-activity?rangeDays=7` | Backend (`onrender.com`) | `200 OK` | Total visits: 6; $N \ge 5$ disclosure threshold enforced (`byDistrict: []`) |
| `/api/public/consultation-activity?rangeDays=30` | Backend (`onrender.com`) | `200 OK` | Total visits: 8; 30-day daily trend; `byDistrict: []` |
| `/api/public/consultation-activity?rangeDays=90` | Backend (`onrender.com`) | `200 OK` | Total visits: 8; 90-day daily trend; `byDistrict: []` |
| `/api/public/consultation-activity?district=Colombo` | Backend (`onrender.com`) | `200 OK` | Under-threshold suppression: `totalVisits: null`, `suppressed: true` |
| `/api/public/health-stats` | Backend (`onrender.com`) | `503 Unavailable` | Expected fail-closed behavior (`REPORTING_REVIEW_REQUIRED`) |

### 6.2 District Disclosure Threshold Suppression ($N \ge 5$)
- **National View (`district=all`)**:
  - The aggregate total visits is disclosed (`totalVisits: 6` for 7d; `8` for 30d/90d).
  - Individual district breakdown rows are only included in `byDistrict` if `visitCount >= 5`. Because no single district has $\ge 5$ visits in `medisync_prod`, `byDistrict` is safely empty `[]`.
- **District-Filtered View (`district=Colombo`)**:
  - When querying a specific district where total visits $< 5$, `totalVisits` is suppressed to `null`, `byDistrict` is `[]`, `trend` is `[]`, and `disclosure: { districtMinCount: 5, suppressed: true }` is returned.
  - This prevents small-number re-identification of patients in low-density districts.

---

## 7. Gitignore & Secret Safety Compliance

- `server/.env`: Confirmed gitignored by `server/.gitignore:2` and `.gitignore:7`.
- `scratch/`: Confirmed gitignored by `.gitignore:42`.
- Verification command: `git check-ignore -v server/.env scratch/` confirmed active ignore rules.
- Secret Hygiene: Zero passwords, connection URIs, private encryption keys, JWT secrets, or sensitive hashes appear in code, test outputs, or reports.

---

## 8. Offline Test Suite & Build Verification

- **Offline Test Suite Runner**:
  - Command: `node scripts/run_offline_tests.js`
  - Result: **0 failed, 3,440 passed** (100% pass across all 7 test runners).
  - Protected Hashes: 15/15 files intact and accounted for in `docs/release/PROTECTED_HASHES.json`.
- **Client Build Runner**:
  - Command: `npm run build`
  - Result: Completed successfully with exit code 0.

---

## 9. Conclusion & Sign-Off

All Milestone 0 (R1) post-seed verification requirements are satisfied in full. Production database `medisync_prod` is verified clean, idempotent, and intact. The team is authorized to commit and push branch `chore/post-seed-verification` and proceed to Milestone 1 and Stage B2 to G on branch `feat/final-stage-b2-to-g`.
