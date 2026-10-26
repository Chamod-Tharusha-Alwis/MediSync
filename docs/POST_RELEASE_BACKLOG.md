# MediSync Post-Release Backlog & Requirements for Real Patient Clearance

## Status: PROTOTYPE ONLY (Synthetic Data Only)

> **CRITICAL RELEASE POLICY**:
> This MediSync deployment is qualified strictly as a **CAPSTONE PROTOTYPE** with **SYNTHETIC DATA ONLY**.
> It is **NOT CLEARED** for real patient use, real PHI (Protected Health Information), or real clinical diagnosis/prescriptions.
> All clinical workflows display a prominent trilingual banner (English / Sinhala / Tamil) stating:
> *"Prototype: synthetic data only. Not for real patient use."*

---

## 1. Prerequisites Required Before Clearing Real Patient Data

The following seven engineering, clinical, and security milestones must be completed, audited, and approved before removing the prototype restriction and onboarding real patients:

| ID | Backlog Item | Description | Condition for Lifting Restriction | Priority |
|---|---|---|---|---|
| **BKL-01** | **Standards-Compliant Encrypted PDF Export** | PDF reports and prescriptions currently have download buttons disabled with clear notice. Standardized PDF encryption (AES-256 or password-based secure envelope adhering to ISO 32000-2 / HIPAA transit standards) is deferred. | Implementation of real crypto-locked PDF pipeline in `pdfGenerator.js` with client-side key derivation, offline verification tests, and independent security sign-off. | HIGH |
| **BKL-02** | **Full Field-Level Encryption & Blind Index Migration** | Legacy fields use single-pass AES-256-CBC with SHA-256 HMAC lookup digests. Target standard requires AES-256-GCM authenticated encryption and blind indexing (HMAC-SHA256 with pepper) across all PHI models (`Patient`, `Consultation`, `Prescription`, `LabTest`). | Completion of zero-downtime database migration script proven on test/staging records with backwards-compatibility verification and cryptographic test assertions. | HIGH |
| **BKL-03** | **Production Secret Management (HashiCorp Vault / Cloud KMS)** | For this prototype release, an operator-key policy (`operatorKeyPolicy.js`) is used via environment variables (`ENCRYPTION_KEYS` and `ACTIVE_KEY_VERSION`). A hosted Vault or Cloud KMS is not attached. | Provisioning and integration of dedicated HashiCorp Vault or AWS/GCP KMS for dynamic secret rotation, automated lease renewal, and hardware-backed master keys. | CRITICAL |
| **BKL-04** | **Fail-Closed Audit Logging Policy** | Certain non-blocking audit logging paths currently log warnings rather than crashing active user requests when audit persistence encounters transient network errors. | Transition to a strict fail-closed audit log queue with persistent dead-letter recovery (`Outbox`) before permitting legal medical transactions. | MEDIUM |
| **BKL-05** | **Real Atlas End-to-End Test Groups (Groups 1–14)** | Offline unit and integration suites (30 client suites, 256 server unit tests) pass 100%. Full multi-user concurrent automated browser E2E test execution against live Atlas cluster is deferred. | Execution and 100% green pass of all 14 end-to-end integration groups on current source against a dedicated staging Atlas replica set. | HIGH |
| **BKL-06** | **Production Atlas Dedicated Network Peering / Private Endpoint** | On free-tier Render deployment, Atlas network access requires `0.0.0.0/0` with SCRAM-SHA-256 authentication and IP access lists where possible. Real PHI demands network isolation. | Establishment of AWS/GCP VPC Peering or MongoDB Atlas PrivateLink endpoint, restricting all incoming traffic strictly to backend application IPs. | HIGH |
| **BKL-07** | **Independent Clinical & Privacy Impact Assessment (DPIA / HIPAA)** | Formal medical oversight and independent data protection impact assessment for Sri Lankan Personal Data Protection Act (PDPA) No. 9 of 2022 and HIPAA/GDPR clinical compliance. | Review and written sign-off by a qualified medical informatics specialist and healthcare privacy legal counsel. | CRITICAL |

---

## 2. Maintenance and Patch Roadmap

### Phase 1.1 (Next Immediate Minor Patch)
- Transition from `operatorKeyPolicy` to hosted KMS / Vault instance.
- Run database index optimization and background index building verification.
- Re-run full browser automation test suite in staging environment.

### Phase 1.2 (Security Hardening Patch)
- Implement encrypted PDF download with user-managed passphrase/key.
- Enable mutual TLS (mTLS) between Render Express backend and Render ML microservice.
- Complete strict rate limiting per IP + user token across all mutation routes.

---

## 3. Prototype Scope Attestation

- **Environment**: Staging / Prototype Production (`medisync_prod`)
- **Data Allowed**: Synthetic test accounts, mock prescriptions, simulated lab data, synthetic epidemiological outbreak alerts.
- **Data Prohibited**: Any real National Identity Card (NIC) numbers, real patient names, actual medical histories, real contact details, or genuine clinical observations.
