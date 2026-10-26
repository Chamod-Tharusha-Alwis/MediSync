# MediSync Production Release Environment Contract (Names Only)

> **SAFETY MANDATE**:
> This document lists variable **NAMES ONLY**. Never insert, quote, or commit actual secrets, passwords, tokens, or private connection strings into this file or repository.

---

## 1. Render Web Service: Backend API (`medisync-backend`)

### A. Core Architecture & Runtime Modes
| Variable Name | Required | Specification / Verification Source |
|---|---|---|
| `NODE_ENV` | **Yes** | Must be strictly `'production'`. |
| `MEDISYNC_PROTOTYPE_MODE` | **Yes** | Must be `'true'`. Signals prototype deployment with synthetic data. |
| `MEDISYNC_ALLOW_OPERATOR_KEYS` | **Yes** | Must be `'true'`. Enables operator-key path without hosted Vault for prototype. |
| `MEDISYNC_LIVE_START_APPROVED` | **Yes** | Must be `'true'`. Mandatory production gate attestation in `clinicalEntryPolicy.js`. |
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
| `ENCRYPTION_KEYS` | **Yes** | JSON string mapping key version to high-entropy 32-byte key (64 hex characters or 44 base64 characters). Validated by `operatorKeyPolicy.js`. Example format: `{"1":"<32-byte-hex>"}`. |
| `ACTIVE_KEY_VERSION` | **Yes** | String version identifier present in `ENCRYPTION_KEYS` (e.g. `'1'`). |
| `JWT_SECRET` | **Yes** | Access token HMAC-SHA256 signing secret (minimum 32 random characters). |
| `JWT_REFRESH_SECRET` | **Yes** | Refresh token HMAC-SHA256 signing secret (minimum 32 random characters). |
| `SESSION_SECRET` | **Yes** | Express session signing secret (minimum 32 random characters). |
| `INTERNAL_API_KEY` | **Yes** | Mutual pre-shared key for backend <-> ML microservice calls via header `x-internal-key`. |

### D. Networking, CORS & Upstream Services
| Variable Name | Required | Specification / Verification Source |
|---|---|---|
| `CLIENT_URL` | **Yes** | Exact HTTPS origin of the frontend (e.g. `https://medisync.chamodtharusha.com.lk` or `https://medisync-production.vercel.app`). Must NOT have trailing slash, wildcards, or paths. Validated by `clientOriginPolicy.js`. |
| `CORS_ORIGIN` | **Yes** | Browser CORS origin. Must match `CLIENT_URL` exactly. Zero wildcards permitted. |
| `ML_ENGINE_URL` | **Yes** | HTTPS URL pointing to the Render ML microservice (e.g. `https://medisync-ml.onrender.com`). |
| `COOKIE_DOMAIN` | Optional | Hostname for cookie domain attribute (leave unset for default host-only cookies). |

### E. Runtime Synthetic Bootstrap Passwords (Used only by `bootstrapSyntheticAccounts.js`)
| Variable Name | Required | Purpose |
|---|---|---|
| `BOOTSTRAP_ADMIN_PASSWORD` | **Yes** (at setup) | Runtime-supplied strong password for synthetic Super Admin (`admin.synth@medisync.local`). |
| `BOOTSTRAP_DOCTOR_PASSWORD` | **Yes** (at setup) | Runtime-supplied strong password for synthetic Doctor (`doctor.synth@medisync.local`). |
| `BOOTSTRAP_HOSPITAL_PASSWORD` | **Yes** (at setup) | Runtime-supplied strong password for synthetic Hospital (`hospital.synth@medisync.local`). |
| `BOOTSTRAP_PHARMACY_PASSWORD` | **Yes** (at setup) | Runtime-supplied strong password for synthetic Pharmacist (`pharmacist.synth@medisync.local`). |
| `BOOTSTRAP_PATIENT_PASSWORD` | **Yes** (at setup) | Runtime-supplied strong password for synthetic Patient (`patient.synth@medisync.local`). |

### F. Strictly Prohibited Variables (Server Crashes if Present)
The production runtime policy halts boot if any of the following exist in the environment:
- `MONGO_URI_TEST`, `MONGODB_URI_TEST`, `MONGO_URI_STAGING`
- `SEED_TEST_PASSWORD`, `JEST_WORKER_ID`, `SINGLE_INSTANCE_DEV_MODE`
- Any variable matching `/^MEDISYNC_(?:QA_|TEST_|COMBINED_|DEMO_)/i`

---

## 2. Render Web Service: ML Microservice (`medisync-ml-engine`)

| Variable Name | Required | Specification / Purpose |
|---|---|---|
| `PORT` | **Yes** | Port assigned by Render (e.g. `5001` or `10000`). |
| `INTERNAL_API_KEY` | **Yes** | Shared authentication secret; must match `INTERNAL_API_KEY` on backend API. |
| `PYTHONPATH` | **Yes** | Must be set to `.` so Python modules resolve properly under Gunicorn. |
| `FLASK_ENV` | Optional | Set to `'production'`. |

---

## 3. Vercel Project: Frontend SPA (`medisync-client`)

| Variable Name | Required | Specification / Purpose |
|---|---|---|
| `REACT_APP_API_URL` | **Yes** | Full HTTPS URL of the backend API including path (e.g. `https://medisync-backend.onrender.com/api`). |
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
Render web services operate on dynamic egress IP pools that fluctuate across cloud availability zones.
Because Render does not provide a fixed static IP on standard free/hobby tiers, the operator must make an explicit operational decision:
1. **Configured Access**: Add `0.0.0.0/0` (Allow Access from Anywhere) to MongoDB Atlas Network Access IP Access List.
2. **Mitigating Controls**:
   - Compulsory TLS/SSL encryption.
   - SCRAM-SHA-256 database authentication with dedicated user credentials restricted to `readWrite@medisync_prod`.
   - Complete physical and namespace isolation (`medisync_prod` is separate from any test or operational database).
   - Rate limiting on API gateway and strict input validation.
