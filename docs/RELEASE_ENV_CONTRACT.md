# MediSync Production Release Environment Contract (Names Only)

> **SAFETY MANDATE**:
> This document lists variable **NAMES ONLY**. Never insert, quote, or commit actual secrets, passwords, tokens, or private connection strings into this file or repository.

---

## 1. Render Web Service: Backend API (`MediSync`)

Primary URL: https://medisync-wabc.onrender.com. Operator-verified dashboard evidence, 27 October 2026: Auto-Deploy from main. PR #6 was merged as 096a601; its backend deployment failed with the generic production fatal while old environment settings remained. This is operator-supplied evidence, not an independently captured health result.

### A. Core Architecture & Runtime Modes
| Variable Name | Required | Specification / Verification Source |
|---|---|---|
| `NODE_ENV` | **Yes** | Must be strictly `'production'`. |
| `MEDISYNC_PROTOTYPE_MODE` | **Yes** | Must be `'true'`. Signals prototype deployment with synthetic data. |
| `MEDISYNC_ALLOW_OPERATOR_KEYS` | **Yes** | Must be `'true'`. Enables operator-key path without hosted Vault for prototype. |
| `MEDISYNC_LIVE_START_APPROVED` | **Yes** | Must be `'true'` only after operator verification. Enforced by app startup and `productionAtlasPolicy.js`; this flag does not itself prove authorization or connectivity. |
| `MEDISYNC_ATLAS_ROTATION_CONFIRMED` | **Yes** | Must be `'true'`. Human attestation verifying compromised identities have been rotated. |
| `PORT` | **Yes** | Standard port provided by Render (e.g. `10000`). |

### B. Database & Storage Credentials (Names Only)
| Variable Name | Required | Specification / Verification Source |
|---|---|---|
| `MONGO_URI` | **Yes** | Production MongoDB Atlas SRV URI targeting cluster `medisync.p7hjket.mongodb.net`, database `/medisync_prod`, with TLS (`tls=true`), write concern (`w=majority`), read preference (`readPreference=primary`), authentication source (`authSource=admin`), and authentication mechanism (`authMechanism=SCRAM-SHA-256`). |
| `REDIS_URL` | **Yes** | Persistent Redis connection string satisfying `redisConnectionPolicy.js`. For remote hosting, MUST use `rediss://` (TLS) and require authentication (`url.password`). Pathname must be `/` or numeric db index `/\d*`. |

### C. Cryptography & Session Secrets (Names Only)
| Variable Name | Required | Specification / Verification Source |
|---|---|---|
| `ENCRYPTION_KEYS` | **Yes** | THE operator-key variable: JSON dictionary mapping versions to approved high-entropy 32-byte values (64 hex characters, 32 UTF-8 bytes, or canonical Base64 encoding 32 bytes). Validated by `operatorKeyPolicy.js:80-86`. Preserve the existing approved dictionary; do not regenerate encryption keys to repair Atlas credentials. |
| `ACTIVE_KEY_VERSION` | **Yes** | String version identifier present in `ENCRYPTION_KEYS` (e.g. `'1'`). |
| `JWT_SECRET` | **Yes** | Access token HMAC-SHA256 signing secret (minimum 32 random characters). |
| `JWT_REFRESH_SECRET` | **Yes** | Refresh token HMAC-SHA256 signing secret (minimum 32 random characters). |
| `SESSION_SECRET` | **Preflight only** | Required by the retained minimum-length compatibility check in `server/scripts/preflightProduction.js:91`. UNUSED by server runtime; it is not an Express session-signing input. Check retained, not removed. |
| `INTERNAL_API_KEY` | **Yes** | Mutual pre-shared key for backend <-> ML microservice calls via header `x-internal-key`. |

For this selected operator-key mode, use **ENCRYPTION_KEYS**, not `ENCRYPTION_KEY_1` or a singular-key substitute. `ENCRYPTION_KEY_1` is unused. Singular environment `ENCRYPTION_KEY` belongs to the separate Vault/test fallback paths and is not required by the operator-key branch (`app.js:60-71`). No key values belong in this document.

### D. Networking, CORS & Upstream Services
| Variable Name | Required | Specification / Verification Source |
|---|---|---|
| `CLIENT_URL` | **Yes** | Exact HTTPS origin of the frontend (e.g. `https://medisync.chamodtharusha.com.lk` or `https://medisync-production.vercel.app`). Must NOT have trailing slash, wildcards, or paths. Validated by `clientOriginPolicy.js`. |
| `CORS_ORIGIN` | **No — unused** | UNUSED by server runtime and preflight. Actual CORS reads `CLIENT_URL` through `clientOriginPolicy.js:4-7`; do not rely on this variable to change the allowed origin. |
| `ML_ENGINE_URL` | **Yes** | Exact primary ML URL: `https://medisync-ml.onrender.com`, service **MediSync-ML**. Health URL: `https://medisync-ml.onrender.com/health`. |
| `COOKIE_DOMAIN` | Optional | Hostname for cookie domain attribute (leave unset for default host-only cookies). |

### E. Runtime Synthetic Bootstrap Passwords (Used only by `bootstrapSyntheticAccounts.js`)
| Variable Name | Required | Purpose |
|---|---|---|
| `BOOTSTRAP_ADMIN_PASSWORD` | **Yes** (at setup) | Runtime-supplied strong password for synthetic Super Admin (`admin.synth@medisync.synthetic`). |
| `BOOTSTRAP_DOCTOR_PASSWORD` | **Yes** (at setup) | Runtime-supplied strong password for synthetic Doctor (`doctor.synth@medisync.synthetic`). |
| `BOOTSTRAP_HOSPITAL_PASSWORD` | **Yes** (at setup) | Runtime-supplied strong password for synthetic Hospital (`hospital.synth@medisync.synthetic`). |
| `BOOTSTRAP_PHARMACY_PASSWORD` | **Yes** (at setup) | Runtime-supplied strong password for synthetic Pharmacist (`pharmacist.synth@medisync.synthetic`). |
| `BOOTSTRAP_PATIENT_PASSWORD` | **Yes** (at setup) | Runtime-supplied strong password for synthetic Patient (`patient.synth@medisync.synthetic`). |

Production apply requires every password to have at least 12 characters and satisfy the unchanged strength/bcrypt policy. These are setup-only inputs, not steady-state Render requirements. No password values are documented.

### F. Strictly Prohibited Variables (Server Crashes if Present)
The production runtime policy halts boot if any of the following exist in the environment:
- `MONGO_URI_TEST`, `MONGODB_URI_TEST`, `MONGO_URI_STAGING`
- `SEED_TEST_PASSWORD`, `JEST_WORKER_ID`, `SINGLE_INSTANCE_DEV_MODE`
- Any variable matching `/^MEDISYNC_(?:QA_|TEST_|COMBINED_|DEMO_)/i`

---

## 2. Render Web Service: ML Microservice (`MediSync-ML`)

Primary URL: https://medisync-ml.onrender.com; health: https://medisync-ml.onrender.com/health. Operator-verified dashboard evidence, 27 October 2026: Auto-Deploy from main; merge 096a601 auto-deployed successfully and the ML service is live. No independent HTTP check was performed in this docs-only task.

For both services: save ALL intended settings using **Save only**, ML first then backend; then one **Manual Deploy > Deploy latest commit** per service, ML first. Main already contains the runtime code. The deploy page must show **096a601 or a verified later main descendant**, never 64abeaa. No new PR/merge is needed for this environment correction. See runbook Steps 5-8 for the offline fatal-line diagnosis and ordered operator procedure.

| Variable Name | Required | Specification / Purpose |
|---|---|---|
| `PORT` | **Yes** | Port assigned by Render (e.g. `5001` or `10000`). |
| `INTERNAL_API_KEY` | **Yes** | Shared authentication secret; must match `INTERNAL_API_KEY` on backend API. |
| `PYTHONPATH` | **Yes** | Must be set to `.` so Python modules resolve properly under Gunicorn. |
| `FLASK_ENV` | Optional | Set to `'production'`. |

---

## 3. Vercel Project: Frontend SPA (`medi-sync`)

| Variable Name | Required | Specification / Purpose |
|---|---|---|
| `REACT_APP_API_URL` | **Yes** | Backend API URL: `https://medisync-wabc.onrender.com/api`, existing service **MediSync**. |
| `REACT_APP_ENVIRONMENT` | **Yes** | Must be set to `'production'`. |
| `REACT_APP_PROTOTYPE_MODE`| **Yes** | Must be set to `'true'`. Displays trilingual prototype banner. |

---

## 4. Architectural Decisions & Network Policy

### A. Redis Connection Compliance (`redisConnectionPolicy.js`)
- Must use TLS protocol: `rediss://` for all remote hosts.
- Must include username/password authentication: `rediss://default:<password>@<host>:<port>`.
- Must not specify query parameters (`?`) or hash fragments (`#`).

### B. CORS and Origin Binding (`clientOriginPolicy.js`)
- Strictly bound to `CLIENT_URL`.
- Wildcard `*` is prohibited in production.

### C. MongoDB Atlas Network Access Trade-Off (Explicit Operator Decision)
Render publishes shared outbound CIDR ranges per region, visible at the existing service > Connect > Outbound. First use separately approved allowlisting of those ranges in Atlas Network Access and test connectivity from the deployed service. Local operator tools need their own approved egress address too.
1. **Fallback only**: `0.0.0.0/0` requires a separately documented operator decision, scope, duration and removal/rollback plan. It is not required by default and must never be enabled automatically.
2. **Mitigating Controls**:
   - Compulsory TLS/SSL encryption.
   - SCRAM-SHA-256 database authentication with dedicated user credentials restricted to `readWrite@medisync_prod`.
   - Database namespace isolation (`medisync_prod` is separate from the operational `test` database); this is not a claim of physical cluster isolation.
   - Rate limiting on API gateway and strict input validation.
