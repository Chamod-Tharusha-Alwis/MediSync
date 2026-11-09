# MediSync Production Security Posture & Hardening Audit (SECURITY_STATUS.md)

**Phase**: Phase 6 — Security and Operations Hardening  
**Date**: 2026-11-09  
**Branch**: `final/p6-security-hardening`  
**Status**: AUDITED & VERIFIED  

---

## 1. Security Architecture & Threat Model Overview

MediSync processes sensitive electronic health records (EHR), clinical consultation summaries, and prescription data for an academic prototype simulating outpatient healthcare delivery. The platform implements defense-in-depth across the application runtime, network transport, cryptographic storage, and administrative boundaries.

---

## 2. Implemented Security Controls Matrix

| Security Control | Implementation Status | Code Evidence & Mechanism | Audit Verification |
|---|:---:|---|---|
| **1. Login Lockout & Brute-Force Defense** | **IMPLEMENTED** | `server/src/security/passwordAttemptPolicy.js`<br>`server/src/controllers/authController.js:309, 328` | After 5 consecutive failed password attempts, user account is locked with HTTP `429 Too Many Requests`. Separate OTP verification locks for 15 minutes after 5 invalid attempts (`authController.js:353, 555`). |
| **2. Tiered Rate Limiting** | **IMPLEMENTED** | `server/src/app.js:303-309`<br>`server/src/routes/authRoutes.js`<br>`server/src/routes/publicRoutes.js:7-12`<br>`server/src/routes/verificationRoutes.js:15-48` | - `/api/auth`: 10 req / 15 min per IP in production (`authLimiter`).<br>- `/api/public`: 60 req / min per IP (`publicLimiter`).<br>- `/verify/:token` OTP request: 10 req / 15 min (`otpRequestLimiter`).<br>- `/verify/:token` OTP submit: 15 req / 15 min (`otpVerifyLimiter`).<br>- History PDF download: 5 req / 15 min (`historyGateLimiter`). |
| **3. Input Validation & NoSQL Injection Defense** | **IMPLEMENTED** | `server/src/app.js:266-300`<br>`server/src/app.js:246` | Custom recursive `sanitizeInPlace` middleware strips all MongoDB query operators (`$` prefixes and `.` dot notation) from `req.body`, `req.params`, and `req.query`. JSON body parser restricted to `1mb`. |
| **4. Secure HTTP Headers** | **IMPLEMENTED** | `server/src/app.js:234-239` | `helmet()` enforces `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and strict transport policies. Custom middleware sets `Accept-CH` and `Permissions-Policy`. |
| **5. CORS Whitelisting** | **IMPLEMENTED** | `server/src/app.js:240-245`<br>`server/src/app.js:215-220` | Strict CORS policy bound to `clientOrigin` with `credentials: true`. WebSocket server rejects handshake requests originating from non-whitelisted origins. |
| **6. Reverse Proxy Trust Configuration** | **IMPLEMENTED** | `server/src/app.js:204` | `app.set('trust proxy', 1)` enables accurate client IP resolution behind Render / Cloudflare reverse proxies for rate limiters. |
| **7. Production Error Sanitization** | **IMPLEMENTED** | `server/src/security/apiErrorHandler.js:1-12` | Centralized API error handler reports failure diagnostics safely while returning generic HTTP `{ error: 'Internal server error' }`. Internal stack traces, database schemas, and SQL/NoSQL query details are never exposed to clients. |
| **8. Production Guardrails & Bypass Elimination** | **IMPLEMENTED** | `server/src/security/clinicalEntryPolicy.js:8-11`<br>`server/src/routes/adminRoutes.js:54-57`<br>`server/src/routes/pharmacyRoutes.js:55-57` | - `TEST_OTP_ENABLED` and `TEST_OTP_CODE` are permanently ignored and bypassed in production.<br>- Database seed endpoints (`/seed-outbreak-demo`, `/seed-restock`) return `403 Forbidden` (`maintenanceDenied`) over HTTP. |
| **9. Field-Level Encryption at Rest** | **IMPLEMENTED** | `server/src/security/operatorKeyPolicy.js`<br>`server/src/utils/versionedEncryption.js`<br>`server/tests/qaEncryptionBootstrap.test.js` | Sensitive clinical fields (patient NIC, consultation clinical notes, diagnosis text) are encrypted with AES-256-GCM authenticated envelopes before writing to MongoDB. Multi-version keyring decrypts v1 records while encrypting new writes in active version (`qaEncryptionBootstrap.test.js` 14/14 PASS). |
| **10. Zero PII Audit Trails** | **IMPLEMENTED** | `server/src/models/AuditLog.js`<br>`server/src/utils/auditLogger.js` | Audit records log opaque `actorId`, `actorRole`, `action`, and timestamp. Explicitly excludes patient names, medical histories, diagnosis text, and plain national identity numbers. |
| **11. JWT Token Refresh Rotation** | **IMPLEMENTED** | `server/src/controllers/authController.js:1840` | Refresh tokens use single-use cryptographic rotation. Detection of a reused refresh token triggers automatic invalidation of the entire token family. |
| **12. Protected File Ledger Integrity** | **IMPLEMENTED** | `docs/release/PROTECTED_HASHES.json`<br>`scripts/run_offline_tests.js` | 15 critical safety and regulatory files are cryptographically locked via SHA-256 hashes, verified at every test run. |

---

## 3. Honest Disclosure of Known Gaps & Architecture Limitations

In accordance with academic integrity and ethical engineering standards, the following known gaps exist in the current prototype:

1. **MongoDB Atlas M0 Free Tier (No Continuous Backups)**:
   - *Limitation*: The database runs on MongoDB Atlas Free Tier (M0 sandbox). Atlas M0 does not provide continuous automated backups, point-in-time recovery (PITR), or multi-region high availability.
   - *Mitigation*: The owner must execute manual backups (`mongodump`) prior to evaluations and maintain an offline dump.
2. **Key Management via Environment / Operator Keyring (No Dedicated HSM/KMS)**:
   - *Limitation*: The prototype supports HashiCorp Vault KV-v2 (`initializeVault()`) but falls back to an operator keyring (`MEDISYNC_PROTOTYPE_MODE=true` with `ENCRYPTION_KEYS`) on Render Free hosting due to lack of a dedicated cloud HSM (AWS KMS / GCP KMS).
   - *Mitigation*: Production deployment roadmap recommends migrating operator keys to a managed Cloud Hardware Security Module (HSM).
3. **Formulary Safety Limits Citation Status**:
   - *Limitation*: Dosage ceilings and duration thresholds in `medicine_safety_limits.json` are transcribed from British National Formulary (BNF 86) and WHO Model Formulary 2008. They have not been reviewed by a Sri Lankan clinical pharmacologist (`status: unverified_owner_must_check`).
   - *Mitigation*: Clearly flagged in `OWNER_ACTIONS.md` (CR-01, CR-02).
4. **Emergency Red-Flag Advisory Screen**:
   - *Limitation*: The red-flag screen (`emergencyRedFlags.json`) implements 6 conservative clinical presentation heuristics. It is an unvalidated design heuristic (`clinicalValidation: not_established`) and does not replace emergency clinical triage.
   - *Mitigation*: Clearly disclaimed with informational-only advisory banner; doctor autonomy preserved.

---

## 4. Required Owner Security Actions

The following external infrastructure actions require manual execution by the platform owner in production dashboards (documented in [`docs/final/OWNER_ACTIONS.md`](OWNER_ACTIONS.md)):
- **OA-01**: Restrict MongoDB Atlas IP allowlist (remove `0.0.0.0/0` if present, limiting to Render backend outbound IPs).
- **OA-02**: Delete legacy administrative credentials (`atlasAdmin`) in MongoDB Atlas Database Access.
- **OA-03**: Execute pre-viva database backup (`mongodump`).
- **OA-06**: Rotate Redis instance authentication tokens.
- **OA-07**: Change shared demo credentials to independent passwords following academic evaluations.
