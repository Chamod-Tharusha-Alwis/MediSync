# MediSync Production Security Risk Register & Cryptographic Remediation Plan

**Release Target:** v1.0.0 Production Readiness  
**Document Classification:** Confidential — Security Architecture & Governance  
**Author:** MediSync Application Security & Clinical Systems Engineering  
**Date:** 2026-10-18  

---

## 1. Executive Summary

This Security Risk Register documents the formal cryptographic risk assessment for MediSync v1.0.0. In accordance with clinical information security standards and healthcare data protection regulations (including HIPAA Security Rule and national health data policies), all open cryptographic risks are analyzed with threat models, current mitigations, formal dispositions, and technical migration paths.

---

## 2. Cryptographic Risk Matrix

| Risk ID | Vulnerability / Finding | Severity | Current Status | Recommended Disposition for v1.0.0 | Target Remediation Release |
| :--- | :--- | :---: | :---: | :--- | :---: |
| **SEC-01** | Unkeyed SHA-256 Patient NIC Blind Index (`patientNic_bi`) | **HIGH** | **OPEN** | **Formal Risk Acceptance with Compensating Controls** | **v1.1.0** (Dual-Read Migration) |
| **SEC-02** | Unauthenticated AES-256-CBC Field-Level Encryption | **MEDIUM** | **OPEN** | **Accept with Defense-in-Depth Mitigations** | **v1.1.0** (AES-GCM Migration) |
| **SEC-03** | Transitive Build-Time Vulnerabilities in CRA Toolchain (95 Advisories) | **LOW** | **ASSESSED** | **ACCEPT AS RUNTIME_SAFE** | **v1.1.0** (Vite / Next.js Migration) |
| **SEC-04** | Hardcoded Fallback Secrets in Production Paths | **CRITICAL** | **CLOSED** | **VERIFIED CLEAN (0 Findings)** | Complete (Verified) |
| **SEC-05** | Transactional Clinical Audit Durability & Silent Evidence Loss | **HIGH** | **CLOSED** | **VERIFIED REMEDIATED (8/8 Tests PASS)** | Complete (Verified) |

---

## 3. Deep-Dive Risk Assessments

### SEC-01: Unkeyed SHA-256 Patient NIC Blind Index
- **Location:** `server/src/models/Patient.js`, `server/src/controllers/doctorController.js`, `server/src/controllers/patientController.js`
- **Mechanism:** Computes exact-match search tokens as $\text{patientNic\_bi} = \text{SHA-256}(\text{normalize}(\text{NIC}))$.
- **Threat Vector:** If an attacker obtains an unauthorized read-only snapshot or backup dump of the MongoDB database, they cannot decrypt AES-256 encrypted fields without Vault keys. However, because Sri Lankan NICs have an effective entropy of $\approx 2.2 \times 10^6$ combinations per birth year, an adversary can precompute SHA-256 hashes for all valid NIC combinations and invert the blind index in seconds.
- **Compensating Controls in Place (v1.0.0):**
  1. TLS 1.3 enforced for all database transports.
  2. MongoDB Atlas IP Access Lists (network isolation; no public 0.0.0.0/0 ingress).
  3. Strict database user privileges (`readWrite` restricted; zero Atlas cluster admin in application processes).
  4. Encrypted storage at rest (MongoDB Atlas storage volume encryption).
  5. Centralized auditing of all database read/write queries.
- **Remediation Plan (v1.1.0):**
  Full specification staged at [`docs/security/BLIND_INDEX_HMAC_SECURITY_SPECIFICATION.md`](BLIND_INDEX_HMAC_SECURITY_SPECIFICATION.md). Implements Keyed HMAC-SHA256 ($\text{HMAC-SHA256}(K_{\text{bi}}, \text{Domain} \parallel \text{NIC})$) using HashiCorp Vault key versioning and dual-read migration.
- **Production Gate Condition:** Requires formal sign-off by designated Security Risk Owner / Data Protection Officer.

---

### SEC-02: Unauthenticated AES-256-CBC Field-Level Encryption
- **Location:** `mongoose-field-encryption` plugin across `Patient`, `Prescription`, and `Consultation` schemas.
- **Mechanism:** Uses AES-256-CBC with a 32-byte key and random 16-byte IV per encryption operation.
- **Threat Vector:** AES-CBC lacks cryptographic message integrity verification (MAC / authentication tag). In an active attacker scenario where an adversary can directly manipulate ciphertext bytes inside the database, bit-flipping attacks could alter decrypted plaintext values without detection.
- **Compensating Controls in Place (v1.0.0):**
  1. No database direct write access permitted to untrusted actors; all updates go through Express/Mongoose schema validators.
  2. Laboratory attachments (PDFs and clinical reports) use authenticated **AES-256-GCM** with 128-bit authentication tags via `labEncryptionStorageAdapter.js` (5/5 PASS).
  3. Key rotation and multi-version key rings managed securely.
- **Remediation Plan (v1.1.0):**
  Migrate from `mongoose-field-encryption` to native Node.js `crypto` AES-256-GCM field transforms with stored authentication tags.

---

### SEC-03: CRA Build Toolchain Dependency Advisories
- **Location:** `client/package.json` (`react-scripts@5.0.1`)
- **Audit Findings:** 95 advisories reported by `npm audit --omit=dev --prefix client`.
- **Exposure Verification:** Analysis of the static build bundle (`client/build/static/js/*.js`) confirms:
  - Zero vulnerable build-time dependencies (`webpack-dev-server`, `postcss`, `svgo`, `nth-check`) are bundled into client-delivered artifacts.
  - The production client is purely static assets served via reverse proxy (Nginx / Express static).
- **Disposition:** Formally accepted as **`RUNTIME_SAFE`**.
- **Migration Plan:** Upgrade frontend build pipeline from Create React App to Vite in v1.1.0 to eliminate legacy build-tool advisories.

---

## 4. Formal Risk Acceptance Declaration

Prior to production deployment (`p7hjket.mongodb.net`), the designated Risk Owner must execute the following declaration:

```text
I, as the designated Data Protection Officer / Security Lead for MediSync, acknowledge the open status of SEC-01 (Unkeyed SHA-256 Blind Index) and SEC-02 (AES-CBC Field Integrity). Based on the documented defense-in-depth compensating controls, network isolation, and the approved v1.1 Keyed-HMAC Migration Specification, I approve proceeding with production release readiness under accepted risk.
```
