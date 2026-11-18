# MediSync Security Hardening Report

This document outlines the defensive security hardening applied to the MediSync platform to align with HIPAA standards and zero-trust architecture principles. The primary focus of these updates was to remove insecure fallbacks, enforce fail-closed defaults, and strengthen cryptographic and authentication boundaries.

## 1. ML Engine (`ml-engine/app.py`)
- **Backdoor Removal**: Completely removed the hardcoded fallback token (`medisync-secure-key-123`) from the `verify_internal_token` function. The system now strictly requires a valid HMAC signature matching the shared secret and rotating time window.
- **Fail-Closed Guard**: Added a module-level startup guard that forcibly exits the Flask application on boot (`sys.exit(1)`) if the `INTERNAL_API_KEY` environment variable is missing. It no longer fails open.
- **Debug Mode**: Disabled Flask's default `debug=True` mode in production, now driven by the `FLASK_DEBUG` environment variable.

## 2. Node.js Internal Authentication (`server/src/utils/internalAuth.js` & `alertController.js`)
- **Timing Attack Prevention**: Upgraded the HMAC token validation function (`verifyToken`) to use `crypto.timingSafeEqual` instead of a standard string comparison (`===`), mitigating timing side-channel attacks against the API token.
- **Unified Validation**: Migrated `alertController.js` to rely on this timing-safe helper rather than executing a direct string comparison against `process.env.INTERNAL_API_KEY`.

## 3. Cryptographic Secret Management (`app.js`, Controllers, & `LabTest.js`)
- **Vault Fallback Removal**: Modified the Vault bootstrapping logic in `app.js` to crash the server if HashiCorp Vault fails to provide the `AES_ENCRYPTION_KEY`. The insecure 32-byte plaintext fallback string was removed entirely.
- **Hardcoded Key Eradication**: Removed the insecure `default-owner-key-12345678` fallback key from multiple files (`doctorController.js`, `prescriptionController.js`, `pdfGenerator.js`). These endpoints now strictly enforce the use of `global.ENCRYPTION_KEY`.
- **Model Consistency**: Standardized `LabTest.js` to utilize the injected `global.ENCRYPTION_KEY` instead of redefining or falling back to local secrets.

## 4. Authentication & Authorization (Strong Passwords, OTP Bypass & Rate Limiting)
- **Strong Password Enforcement**: Test accounts now use strong passwords (`MediSync#2026!Pass`) instead of weak `password123`.
- **Password Hashing**: `seedUsers.js` updated to hash strong passwords with bcrypt.
- **Bypass Guarding**: The universal test OTP (`123456`) was discovered in multiple controllers (`labController.js`, `patientController.js`). This bypass has been strictly guarded and will only function when `process.env.NODE_ENV === 'test'` and `process.env.TEST_MODE === 'true'`.
- **Cryptographic Randomness**: The patient registration OTP generator was upgraded from a static string to a secure, cryptographically random 6-digit number using `crypto.randomInt()`.
- **Brute-Force Protection**: Introduced a Redis-backed rate limiter (`incrementAttempts` and `getAttempts`) in `redis.js`. The `labController.js` OTP verification endpoints now enforce a strict maximum of 5 failed attempts per 15-minute window to protect against automated credential stuffing.

## 5. Infrastructure Failover (`server/src/config/redis.js`)
- **Strict Redis Enforcement**: The Redis connection layer was modified to enforce a "fail-closed" model in production. If the Node environment is `production` and Redis is unavailable, the server will now crash rather than silently failing back to an insecure, ephemeral in-memory store. The memory store is now strictly reserved for local development via `SINGLE_INSTANCE_DEV_MODE`.

## 6. Data Privacy & PII Handling (`reviewController.js` & `Review.js`)
- **PII Leak Mitigation**: Removed the logic that decrypted a patient's full name to store alongside public reviews. The `reviewerName` field is now strictly hardcoded to `'Verified Patient'`, protecting the anonymity of patients submitting feedback on the public portal. The default schema definition in `Review.js` was also updated accordingly.

## 7. Key Versioning Migration Implementation (Task 8)
- **Custom Versioned Encryption Plugin**: Developed a custom, drop-in replacement Mongoose plugin (`server/src/utils/versionedEncryption.js`) because `mongoose-field-encryption` could not support dynamic, per-document keys. The new plugin encrypts and decrypts payload data using a version-specific key resolved from `global.ENCRYPTION_KEYS` based on `doc.keyVersion`.
- **Schema Key Versioning**: Upgraded all 6 sensitive models (`Patient`, `Consultation`, `Prescription`, `LabTest`, `Doctor`, `TestOrder`) to incorporate a `keyVersion` attribute.
- **Vault Multi-Key Initialization**: Updated `app.js` to initialize Vault by securely fetching and organizing a multi-key map (`activeVersion` and `versions`) from `secret/data/medisync/keys`.
- **Zero-Downtime Key Rotation**: Created a background migration script (`server/scripts/rotateKeys.js`) to iterate over aging documents, decrypt them using historical keys, and natively re-encrypt them with the active key—while safely preserving original DB `updatedAt` timestamps.

## 5. Automated CI/CD Security Validation
- **GitHub Actions:** Added `security-tests.yml` to automatically spin up the Node Server, MongoDB, Redis, and ML Engine in a headless environment.
- **OTP Rate Limit Testing:** An automated bash script (`test_security.sh`) generates a live OTP session and intentionally spams incorrect attempts to mathematically verify that the Redis 429 rate limiter activates exactly on the 6th attempt.
- **HMAC Enforcement Testing:** The pipeline mathematically verifies that the ML Engine properly rejects unauthenticated traffic and validates rotating HMAC signatures.

## 8. Express 5 Input Sanitization Compatibility
- **In-Place Sanitization**: `express-mongo-sanitize` crashes on Express 5 because it tries to reassign `req.query` wholesale, which is a read-only getter in Express 5. Replaced with custom `sanitizeInPlace()` middleware that recursively walks `req.query`, `req.body`, and `req.params`, removing/replacing keys starting with `$` or containing dots.
- **In-Place Mutation**: This approach mutates object properties in-place rather than wholesale reassignment.
- **Payload Limits**: Request body size limited to 1MB via `express.json({ limit: '1mb' })` to prevent DoS.

## 9. In-Memory Token Management
- **In-Memory Access Tokens**: JWT access tokens are now stored exclusively in React state/context (in-memory), NOT in `localStorage` or `sessionStorage`. This eliminates XSS token theft risk (previously flagged as C4 in security audit).
- **HTTP-Only Cookies**: Refresh tokens remain in `httpOnly` cookies.
- **Patient Access Session**: `PatientAccessContext` provides in-memory doctor→patient access sessions with `usePatientAccess()` hook.
- **Clear Session on Exit**: Session is cleared on dashboard return (React state reset), no browser storage involved.

## 10. Doctor Login Type Split Security
- **Scoped Hospital Access**: Hospital Login doctors are scoped to their affiliated hospital's patient tests.
- **Independent Personal Login**: Personal Login doctors operate independently.
- **Login Type Tracking**: Login type is stored as `loginType` field on `Doctor` model.
- **Admin Managed Registration**: Hospital-login accounts are created by hospital admins, preventing self-registration abuse.

## 11. Mock Email OTP Visibility (Development Only)
- **Mock OTP Terminal Output**: In development mode, mock email now logs the full email body including the 6-digit OTP to terminal.
- **Environment Checks**: This is gated behind `NODE_ENV !== 'production'` checks.
- **Real SMTP in Production**: Production email uses real SMTP transport.

## 12. Clinical Document Encryption & PDPA Compliance (July 2026)
- **True Document Encryption:** While standard `pdf-lib` does not support file encryption (`.encrypt()` is a no-op), MediSync implements real AES-256 PDF encryption via `@pdfsmaller/pdf-encrypt-lite`.
- **Deterministic Key Derivation:** To ensure patients can open their records without storing plaintext passwords in the database, document passwords are dynamically generated via HMAC-SHA256:
  $$\text{Password} = \text{HMAC-SHA256}(\text{ENCRYPTION\_KEYS.master}, \text{patientNIC}).\text{substring}(0, 8).\text{toUpperCase()}$$
- **Zero-Storage Exposure:** Passwords are generated on-the-fly during PDF export and never logged or stored in database tables or server memory.

## 13. Express 5 Query Sanitization Hardening
- **Read-Only Request Object Compatibility:** Express 5 treats `req.query` as a read-only getter property, causing standard NoSQL injection sanitizers (which attempt to reassign `req.query = cleanQuery`) to crash with runtime `TypeError` exceptions.
- **In-Place Recursive Mutation:** Implemented custom `sanitizeInPlace` middleware that recursively traverses and sanitizes object properties in-place without violating Express 5 object immutability rules.
