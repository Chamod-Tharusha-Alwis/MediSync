# MediSync Production Boot Admission & Storage Requirements

> **PROVENANCE**: Derived directly from `server/src/production.js`, `server/src/security/productionRuntimePolicy.js`, `server/src/security/productionAtlasPolicy.js`, `server/src/security/productionStorageAdmission.js`, `server/src/security/productionStorageManifest.json`, `server/src/security/redisConnectionPolicy.js`, `server/src/security/clientOriginPolicy.js`, and `server/src/app.js`.

---

## 1. Exact Environment Variable Names Read at Boot

### A. Mandatory Admission & Guard Flags
- `NODE_ENV`: Must be exactly `'production'`
- `MEDISYNC_DEPLOYMENT_MODE`: Must be `'clinical'` (or unset; demo modes forbidden)
- `MEDISYNC_LIVE_START_APPROVED`: Must be exactly `'true'`
- `MEDISYNC_ATLAS_ROTATION_CONFIRMED`: Must be exactly `'true'` (human attestation)

### B. Core Infrastructure URIs
- `MONGO_URI`: Required production Atlas connection string
- `REDIS_URL`: Required Redis connection string
- `CLIENT_URL`: Required HTTPS origin (`https://medisync.chamodtharusha.com.lk`)
- `PORT`: Application port (e.g. `10000`)

### C. Security & Encryption Keys
- `VAULT_TOKEN`: HashiCorp Vault authentication token (or Vault bypass)
- `VAULT_URL`: Optional Vault API URL (default: `http://127.0.0.1:8200`)
- `ENCRYPTION_KEY` / `ENCRYPTION_KEY_1`: AES-256 encryption key
- `ACTIVE_KEY_VERSION`: Key version index (e.g. `1`)
- `JWT_SECRET`: Access token signing key (min 32 chars)
- `JWT_REFRESH_SECRET`: Refresh token signing key (min 32 chars)
- `SESSION_SECRET`: Session cookie secret (min 32 chars)
- `INTERNAL_API_KEY`: Backend <-> ML shared mutual auth key

### D. Upstream Microservices & Providers
- `ML_ENGINE_URL`: HTTPS URL to ML microservice (`https://medisync-ml-service.onrender.com`)
- `CORS_ORIGIN`: Allowed browser origin (fallback to `CLIENT_URL`)
- `COOKIE_DOMAIN`: Optional cookie domain

### E. Strictly Forbidden Variables (Crash on Presence)
Any variable matching:
- `/^MEDISYNC_(?:QA_|TEST_|COMBINED_|DEMO_)/i`
- `MONGO_URI_TEST`, `MONGODB_URI_TEST`, `MONGO_URI_STAGING`
- `SEED_TEST_PASSWORD`, `JEST_WORKER_ID`, `SINGLE_INSTANCE_DEV_MODE`
- `MEDISYNC_OFFLINE_ONLY`, `MEDISYNC_PUBLIC_DEMO`, `MEDISYNC_UNIVERSITY_DEMO`
*Failure consequence: Throws `PRODUCTION_RUNTIME_QA_MATERIAL_FORBIDDEN` and halts process.*

---

## 2. Allowed and Forbidden Database Names

| Scope | Database Name | Status | Rule / Enforcement |
|-------|---------------|--------|---------------------|
| Production Cluster (`medisync.p7hjket.mongodb.net`) | `medisync_prod` | **ALLOWED** | Required by `productionAtlasPolicy.js:13` and `productionStorageManifest.json:3` |
| Production Cluster (`medisync.p7hjket.mongodb.net`) | `test` | **FORBIDDEN** | Explicitly rejected; `uri.pathname !== '/medisync_prod'` fails |
| Production Cluster (`medisync.p7hjket.mongodb.net`) | Any other DB | **FORBIDDEN** | Rejected with `PRODUCTION_EXISTING_CLUSTER_AND_DATABASE_REQUIRED` |
| Any non-Atlas hostname / Localhost | Any DB | **FORBIDDEN** | Rejected with `PRODUCTION_EXISTING_CLUSTER_AND_DATABASE_REQUIRED` |

---

## 3. Required Collections and Indexes

`productionAtlasPolicy.disableAutomaticModelDdl` permanently disables `autoCreate` and `autoIndex` in production. The database must pre-exist with all **29 collections** and their exact indexes matching `productionStorageManifest.json`:

1. `accountinvitations` (indexes: `_id_`, `emailDigest_1`)
2. `accountsecurityevents` (indexes: `_id_`)
3. `admins` (indexes: `_id_`, `email_1`, `employeeId_1`)
4. `auditlogs` (indexes: `_id_`, `timestamp_-1`, `action_1`)
5. `banrecords` (indexes: `_id_`, `userId_1`, `bannedAt_-1`)
6. `broadcastmessages` (indexes: `_id_`, `createdAt_-1`)
7. `clinicalcommands` (indexes: `_id_`, `commandId_1`, `idempotencyKey_1`)
8. `consultations` (indexes: `_id_`, `consultationId_1`, `patient_1`, `doctor_1`)
9. `consultationratings` (indexes: `_id_`, `consultationId_1`)
10. `dispensings` (indexes: `_id_`, `dispensingId_1`, `prescription_1`, `pharmacy_1`)
11. `doctors` (indexes: `_id_`, `email_1`, `slmcNumber_1`, `licenseNo_1`)
12. `drugs` (indexes: `_id_`, `drugCode_1`, `name_1`)
13. `hospitals` (indexes: `_id_`, `email_1`, `registrationNumber_1`)
14. `icdcodes` (indexes: `_id_`, `code_1`)
15. `labtests` (indexes: `_id_`, `reportId_1`, `patient_1`)
16. `notifications` (indexes: `_id_`, `recipient_1`, `createdAt_-1`)
17. `otpsessions` (indexes: `_id_`, `sessionId_1`, `userId_1`, `expiresAt_1` [TTL])
18. `outbreakalerts` (indexes: `_id_`, `disease_1`, `district_1`)
19. `patients` (indexes: `_id_`, `email_1`, `nic_1`, `phn_1`)
20. `pharmacies` (indexes: `_id_`, `email_1`, `licenseNumber_1`)
21. `pharmacystaffs` (indexes: `_id_`, `email_1`, `pharmacy_1`)
22. `prescriptions` (indexes: `_id_`, `prescriptionRef_1`, `patient_1`, `doctor_1`)
23. `recoverytokens` (indexes: `_id_`, `tokenHash_1`, `userId_1`)
24. `reviews` (indexes: `_id_`, `targetId_1`, `author_1`)
25. `sessiontokens` (indexes: `_id_`, `tokenHash_1`, `userId_1`, `expiresAt_1` [TTL])
26. `supporttickets` (indexes: `_id_`, `ticketId_1`, `user_1`)
27. `testorders` (indexes: `_id_`, `orderId_1`, `patient_1`)
28. `trusteddevices` (indexes: `_id_`, `deviceHash_1`, `userId_1`)
29. `reminderdispatches` (indexes: `_id_`, `dispatchId_1`, `prescription_1`)

*Failure consequence: `verifyProductionStorage()` fails closed with `PRODUCTION_STORAGE_PREREQUISITES_NOT_VERIFIED` and shuts down connection.*

---

## 4. Redis Requirements

- `REDIS_URL` is mandatory in production.
- URL protocol must be `rediss:` (TLS) unless running against `127.0.0.1` or `[::1]`.
- Password authentication is mandatory (`url.password` must be present).
- No search parameters or query strings allowed.
- Pathname must be either empty or integer DB number (`/\d*`).
- *Failure consequence: Throws `REDIS_PRODUCTION_CONFIGURATION_REQUIRED`, `REDIS_AUTHENTICATION_REQUIRED`, or `REDIS_REMOTE_TLS_REQUIRED`.*

---

## 5. ML Health Expectations

- Backend initializes `createMlHealthMonitor` with `url: ${ML_ENGINE_URL}/health`.
- Expected endpoint: `GET /health` returning HTTP 200 with `{ status: "ready" }`.
- Background heartbeat polls every 5 minutes (`300000ms`) with 10s abort timeout.
- Microservice framework: Python Gunicorn worker executing Flask app.

---

## 6. Key-Version Rules

- `initializeVault()` fetches encryption key versions from HashiCorp Vault path `secret/data/medisync/keys`.
- Requires active key version (`global.ACTIVE_KEY_VERSION`) and key dictionary (`global.ENCRYPTION_KEYS`).
- All Mongoose encrypted fields resolve encryption key synchronously at require time.

---

## 7. First Failing Gates Identified in Offline Harness

When testing production startup against Render deployment configurations:
1. **First Blocker (Gate 7 — Vault Enforcement)**:
   In `server/src/app.js` (lines 102-105):
   ```javascript
   if (process.env.NODE_ENV === 'production') {
     console.error('[FATAL] Vault is required in production environments.');
     process.exit(1);
   }
   ```
   If Render does not connect to an active HashiCorp Vault server with `VAULT_TOKEN`, `initializeVault()` calls `process.exit(1)` immediately.
2. **Second Blocker (Gate 9 — Storage Pre-requisite Verification)**:
   `verifyProductionStorage()` strictly verifies all 29 collections and indexes against `test`. If collections are missing, boot halts.
