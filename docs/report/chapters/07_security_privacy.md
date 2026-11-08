# Chapter 7: Security, Privacy & Regulatory Compliance

## 7.1 Security Architecture & Threat Model
MediSync implements a **defense-in-depth, zero-trust security architecture** designed to safeguard sensitive health data across untrusted public networks and shared clinical hardware. The threat model accounts for four primary attack vectors:
1. **Database Exfiltration / Insider Threat**: Unauthorized access to physical database storage or MongoDB backups.
2. **Prescription Tampering & Interception**: Forgery of digital prescription slips, alteration of quantities, or intercepting tokens in transit.
3. **Identity Impersonation & Dispensing Fraud**: Presenting stolen prescription tokens to obtain controlled substances.
4. **Malicious Payload Injection**: Uploading executable exploit scripts disguised as laboratory PDF reports.

---

## 7.2 Cryptographic Pipeline & Key Management

### 7.2.1 Authenticated Field-Level Encryption (AES-256-GCM)
In accordance with modern healthcare privacy mandates, patient personally identifiable information (PII) and confidential consultation notes are never persisted in plaintext. Implemented in `server/src/utils/versionedEncryption.js`:
- **Cipher**: Advanced Encryption Standard in Galois/Counter Mode (AES-256-GCM), providing confidentiality and cryptographic message integrity.
- **Payload Composition**: Each encrypted record field stores a compound string formatted as:
  $$\text{Payload} = \text{keyVersion} : \text{IV (16 bytes base64)} : \text{AuthTag (16 bytes base64)} : \text{Ciphertext (base64)}$$
- **Zero-Downtime Rotation**: The prefix `keyVersion` enables the application to decrypt historical records with legacy keys while encrypting subsequent writes with rotated active keys.

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
3. `ml-engine/app.py` (`0500ddf...`)
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

## 7.5 Known Security Weaknesses & Architectural Trade-offs
Honesty and transparency are paramount in academic engineering evaluation. The following architectural weaknesses are recognized:
1. **Low-Entropy National Identity Card (NIC) Credentials**: In Sri Lanka, citizen NICs follow predictable deterministic formats (9 digits + 'V' for pre-2016 cards, or 12 digits post-2016 encoding birth year and sequential gender offsets). An attacker possessing a victim's birthdate can brute-force candidate NICs. *Mitigation*: The NIC gate in MediSync is strictly paired with one-time dynamic QR tokens and rate-limited.
2. **Prototype Key Management**: Currently, cryptographic master keys reside in runtime environment variables (`ENCRYPTION_KEY`). In a commercial production deployment, keys must be managed via hardware security modules (HSM) or dedicated key management services (AWS KMS / HashiCorp Vault).
3. **Free-Tier Denial-of-Service Surface**: While in-memory rate limiting throttles API endpoints, the Render Free tier provides limited network-layer DDoS mitigation compared to enterprise cloud firewalls.
4. **Absence of Point-in-Time Database Recovery (PITR)**: MongoDB Atlas Free M0 clusters do not support continuous automated snapshot backups or PITR. Production migration requires Atlas M10+ tier provisioning.
