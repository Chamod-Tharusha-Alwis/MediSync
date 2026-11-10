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
| **9. Field-Level Encryption at Rest** | **PARTIAL (AES-256-CBC)** | `server/src/models/Patient.js`<br>`server/src/models/Consultation.js`<br>`server/src/utils/versionedEncryption.js` | Uses `mongoose-field-encryption` (AES-256-CBC with SHA-256 key hash derived from `ENCRYPTION_KEY`). Not AES-256-GCM everywhere. Exact coverage: `Patient` encrypts only `['fullName', 'contactInfo', 'allergies']` (NIC, email, address, DOB, emergencyContact unencrypted). `Consultation` encrypts only `['patientNic', 'diagnosis', 'notes']` (symptoms, icdCode, district unencrypted). |
| **10. Zero PII Audit Trails & Structured Details** | **IMPLEMENTED** | `server/src/models/AuditLog.js`<br>`server/src/utils/auditLogger.js` | Audit records log opaque `actorId`, `actorRole`, `action`, timestamp, and optional sanitized `details`. Strictly excludes patient names, medical histories, diagnosis text, and plain NICs. Sensitive keys stripped by `recordAudit`. |
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
5. **CODEX 20261111 Independent Security Audit Findings**:
   - **F04 (Partial Field Encryption)**: Patient `nic`, `email`, `address`, `dateOfBirth` and Consultation `symptoms`, `icdCode`, `district` remain unencrypted in MongoDB. Handled in verification flows by explicitly setting `allergiesStatus: 'unavailable'` when decryption fails. Complete fix requires envelope encryption across all PII.
   - **F05 (Legacy RC4-128 PDF Encryption)**: `@pdfsmaller/pdf-encrypt-lite` uses RC4-128 with identifier-derived password. Currently held under active administrative lockout (`SECURITY_HOLD`, HTTP 503 `PDF_EXPORT_UNAVAILABLE`).
   - **F07 (Controller Internal Error Leakage)**: `verificationController.js` has been remediated to return fixed generic strings. Other controllers returning raw `error.message` on 500 (`drugController.js`, `prescriptionController.js`, `alertController.js`, `adminController.js`, and protected `doctorController.js`) require remediation under controlled updates (cataloged in `OWNER_ACTIONS.md` OA-17).
   - **F08 (LocalStorage Refresh Tokens)**: Refresh tokens stored in browser `localStorage` are exposed if XSS occurs. Future remediation will migrate to HttpOnly SameSite=Strict cookies.
   - **F10 (ML Engine Internal HMAC Hour-Bound Window)**: `ml_auth.py` binds internal signatures to a 1-hour window (`floor(time.time() / 3600)`) with no replay cache or nonce.
   - **F11 (Admin Emergency Reveal Quorum)**: Emergency identifier reveal is audited but lacks dual-officer quorum authorization.
   - **F12 (Storage Cipher Authenticity)**: Active field encryption uses AES-256-CBC with SHA-256 key hash, not AES-256-GCM AEAD.

---

## 4. Required Owner Security Actions

The following external infrastructure actions require manual execution by the platform owner in production dashboards (documented in [`docs/final/OWNER_ACTIONS.md`](OWNER_ACTIONS.md)):
- **OA-01**: Restrict MongoDB Atlas IP allowlist (remove `0.0.0.0/0` if present, limiting to Render backend outbound IPs).
- **OA-02**: Delete legacy administrative credentials (`atlasAdmin`) in MongoDB Atlas Database Access.
- **OA-03**: Execute pre-viva database backup (`mongodump`).
- **OA-06**: Rotate Redis instance authentication tokens.
- **OA-07**: Change shared demo credentials to independent passwords following academic evaluations.
