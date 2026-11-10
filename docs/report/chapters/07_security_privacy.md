# Chapter 7: Security, Privacy & Regulatory Compliance

## 7.1 Security Architecture & Threat Model
MediSync implements a **defense-in-depth, zero-trust security architecture** designed to safeguard sensitive health data across untrusted public networks and shared clinical hardware. The threat model accounts for four primary attack vectors:
1. **Database Exfiltration / Insider Threat**: Unauthorized access to physical database storage or MongoDB backups.
2. **Prescription Tampering & Interception**: Forgery of digital prescription slips, alteration of quantities, or intercepting tokens in transit.
3. **Identity Impersonation & Dispensing Fraud**: Presenting stolen prescription tokens to obtain controlled substances.
4. **Malicious Payload Injection**: Uploading executable exploit scripts disguised as laboratory PDF reports.

---

## 7.2 Cryptographic Pipeline & Key Management

### 7.2.1 Field-Level Encryption Reality & Cipher Details
In the current implementation, sensitive clinical and demographic attributes utilize field-level encryption at rest via `mongoose-field-encryption`:
- **Cipher**: Advanced Encryption Standard in Cipher Block Chaining mode (AES-256-CBC) parameterized by a SHA-256 key hash (derived from runtime `ENCRYPTION_KEY`). Note: It does not utilize authenticated Galois/Counter Mode (AES-256-GCM) with AEAD authentication tags.
- **Exact Field Encryption Coverage**:
  - `Patient` collection: Only `['fullName', 'contactInfo', 'allergies']` are encrypted at rest.
  - `Consultation` collection: Only `['patientNic', 'diagnosis', 'notes']` are encrypted at rest.
- **Unencrypted (Plaintext) Fields at Rest**:
  - `Patient`: `nic`, `email`, `address`, `dateOfBirth`, `emergencyContact`, `chronicConditions`, `gender`, `bloodGroup` are stored in plaintext.
  - `Consultation`: `symptoms`, `icdCode`, `icdDescription`, `district` are stored in plaintext.
- **Payload Composition**: Encrypted fields are stored with the prefix `__enc_` followed by base64-encoded ciphertext blocks.
- **Key Derivation & Rotation**: Cryptographic keys are loaded from environment variables (`ENCRYPTION_KEY`). Key rotation requires re-encrypting existing documents.

### 7.2.2 Blind Indexing for Privacy-Preserving Search
Standard deterministic encryption permits pattern analysis, while randomized IV encryption precludes database index lookups. To enable $O(1)$ equality searching on patient identifiers without decrypting the entire database:
- A cryptographic blind index (`nic_bi`, `phone_bi`) is generated using HMAC-SHA-256 parameterized with an independent, dedicated blind indexing salt:
  $$\text{BlindIndex} = \text{HMAC-SHA256}(\text{Salt}_{\text{blind}}, \text{Normalize}(\text{Field}))$$
- The database indexes `nic_bi` uniquely. Equality searches query the blind index directly; plaintext identifiers remain unrecoverable from the index alone.

---

## 7.3 Ephemeral Tokens & Automated Database TTLs
To prevent token accumulation and credential replay attacks, MediSync leverages MongoDB engine-level Time-To-Live (TTL) indexes:

| Collection Name | Ephemeral Token Type | TTL Duration | Engine Action |
|---|---|---|---|
| `OTPSession` | Two-factor SMS/Email OTPs | 300 seconds (5 min) | Document automatically dropped |
| `RecoveryToken` | Account password recovery | 900 seconds (15 min) | Document automatically dropped |
| `VerificationToken` | Email/phone verification | 90 days | Document dropped upon expiry |
| `ClinicalCommand` | Staged high-risk operations | 86,400 seconds (24h) | Staged command purged |

---

## 7.4 Protected File Ledger (Cryptographic Release Integrity)
To guarantee that core security policies, authentication mechanisms, and critical clinical calculations are never inadvertently weakened during ongoing maintenance, MediSync enforces a **15-File Protected Ledger** (`docs/release/PROTECTED_HASHES.json`). 

Every offline gate execution independently recalculates SHA-256 hashes across all 15 locked files:
1. `server/src/middleware/auth.js` (`92e99e0...`)
2. `server/src/controllers/doctorController.js` (`9191291...`)
3. `ml-engine/app.py` (`3b51e3f...` — updated under controlled ledger update in `docs/final/LEDGER_CHANGELOG.md` for structured logging, telemetry, and `/metrics`; historical CRLF preserved)
4. `ml-engine/evaluate_symptom_model.py` (`6999cf2...`)
5. `client/src/components/SymptomTagInput.jsx` (`1a9fce8...`)
6. `server/tests/ir04BackendIntegration.test.js` (`e40d7c7...`)
7. `server/tests/patientProfileOwnedIntegration.test.js` (`7335e2a...`)
8. `server/tests/prescriptionDurationOwnedIntegration.test.js` (`562ba59...`)
9. `server/tests/lab.test.js` (`227e2fa...`)
10. `server/tests/universityDemoSeedVerify.test.js` (`fc472f5...`)
11. `client/tests/ir04-isolated-five-role-e2e.spec.js` (`496dbcc...`)
12. `server/src/config/dbGuard.js` (`1b62d44...`)
13. `server/src/models/Consultation.js` (`3538ea8...`)
14. `server/src/models/Patient.js` (`14b60b7...`)
15. `server/src/utils/versionedEncryption.js` (`5dd15b2...`)

Any unauthorized modification immediately halts the release pipeline with an exit code 1 integrity failure.

---

## 7.5 Known Security Limitations & Audit Review (CODEX 20261111 Audit)
Honesty and transparency are paramount in academic engineering evaluation. Following the comprehensive security audit (`docs/final/SECURITY_REVIEW_20261111.md`), the following limitations and architectural trade-offs are explicitly recognized along with their defined repair paths:

1. **F04: Partial Field Encryption Coverage & Allergy State Handling**
   - *Current State*: As detailed in Section 7.2.1, only patient `fullName`, `contactInfo`, and `allergies`, and consultation `patientNic`, `diagnosis`, and `notes` are encrypted. Patient demographics (`nic`, `email`, `address`, `dateOfBirth`) and consultation metadata (`symptoms`, `icdCode`, `district`) remain plaintext in MongoDB. In verification flows, decryption failure is now strictly surfaced as `allergiesStatus: 'unavailable'` (`allergies: null`) rather than silently defaulting to an empty array.
   - *Repair Path*: Complete database schema migration to envelope encryption using a unified cryptographic layer encrypting all sensitive PII and clinical fields.

2. **F05: Legacy PDF Encryption Cipher & Active Export Lockout**
   - *Current State*: `@pdfsmaller/pdf-encrypt-lite` uses RC4-128 (V=2, R=3, Length=128) with passwords derived from patient NIC and consultation identifiers. Because RC4 is cryptographically broken, clinical PDF export is currently held under an active administrative lockout (`SECURITY_HOLD`, `PDF_EXPORT_ENABLED !== 'true'`), returning HTTP 503 `PDF_EXPORT_UNAVAILABLE`.
   - *Repair Path*: Migrate PDF generation to modern AES-256 PDF encryption (ISO 32000-2 / PDF 2.0) with cryptographically random per-document keys before lifting the export hold.

3. **F08: Client Refresh Token Storage in LocalStorage**
   - *Current State*: Refresh tokens are persisted in browser `localStorage` for cross-tab session maintenance, leaving tokens vulnerable to exfiltration if a cross-site scripting (XSS) vulnerability exists.
   - *Repair Path*: Migrate refresh token exchange to `HttpOnly`, `SameSite=Strict`, `Secure` browser cookies with server-side sliding window expiration and automatic token family revocation upon reuse.

4. **F10: ML Service Internal HMAC Hour-Bound Window**
   - *Current State*: The internal API HMAC signature in `ml_auth.py` binds each timestamp to a 1-hour window (`floor(time.time() / 3600)`) without a replay cache or nonce, allowing captured requests to be replayed within the same clock hour.
   - *Repair Path*: Implement per-request unique nonces cached in Redis with short TTL (e.g. 60 seconds) or require signed timestamps within a 30-second skew window.

5. **F11: Administrative Emergency Unmasking Quorum**
   - *Current State*: The administrative PII reveal endpoint records access in `AuditLog` but does not enforce multi-party quorum approval or cryptographic dual custody.
   - *Repair Path*: Implement a multi-officer approval workflow requiring dual digital signatures prior to revealing decrypted identifiers.

6. **F12: Field Encryption Cipher Mode Authenticity**
   - *Current State*: The active database field encryption utilizes AES-256-CBC with SHA-256 key hashing without authenticated ciphertext tags (AEAD), lacking built-in cryptographic tampering detection at the block level.
   - *Repair Path*: Migrate database field encryption from CBC mode to AES-256-GCM or integrate with cloud KMS envelope encryption.

7. **Prototype Key Management & Cloud Free-Tier Surfaces**
   - Master cryptographic keys reside in runtime environment variables (`ENCRYPTION_KEY`). Cloud deployment operates on Render Free and MongoDB Atlas M0 tiers, lacking hardware security module (HSM) key isolation, enterprise DDoS shielding, and automated point-in-time recovery (PITR).
