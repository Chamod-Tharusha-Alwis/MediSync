# Chapter 3: Requirements Engineering

## 3.1 Stakeholder Analysis & User Personas
MediSync supports six authenticated operational roles and an unauthenticated public citizen interface. User personas reflect the reality of the Sri Lankan healthcare context:

| Role Identifier | Operational Context | Primary Responsibilities |
|---|---|---|
| **Patient** | Citizen receiving outpatient care | Access personal medical records, view active prescriptions, retrieve QR dispensing tokens, review laboratory reports. |
| **Doctor** | Medical Officer (OPD/Clinic) | Conduct consultations, select standardized ICD diagnoses, utilize ML triage suggestions, author digital prescriptions, order investigations. |
| **Pharmacy** | Registered Pharmacist / Dispenser | Scan and decrypt prescription QR tokens, execute identity verification (NIC check), dispense medication, log partial fills. |
| **Hospital / Lab** | Medical Laboratory Technologist (MLT) | Ingest lab investigation orders, upload PDF diagnostic reports with integrity verification, mark results finalized. |
| **Admin** | System / Facility Administrator | Provision clinical accounts, configure facility profiles, inspect immutable audit logs, review security anomalies. |
| **Public Health** | Regional Epidemiologist / MOH | Monitor district disease incidence, review automated outbreak detection alerts, track seasonal curves. |
| **Public Citizen** | Unauthenticated Public User | View public health warnings, educational disease advisories, district risk classifications (EN/SI/TA). |

---

## 3.2 Functional Requirements

### 3.2.1 Patient Subsystem
- **FR-PAT-01**: The system shall permit patients to register and authenticate using either National Identity Card (NIC) credentials or email/phone OTP verification.
- **FR-PAT-02**: The system shall provide patients with an encrypted personal health timeline displaying past consultations, diagnoses, and laboratory reports.
- **FR-PAT-03**: The system shall generate a secure, time-bound QR code payload for active prescriptions, embeddable on mobile screens or printable as a PDF.
- **FR-PAT-04**: The system shall allow patients to grant or revoke clinician access to their historical electronic health record.

### 3.2.2 Doctor Subsystem
- **FR-DOC-01**: The system shall allow physicians to look up patients via National Identity Card (NIC) blind indexing, verify patient OTP consent, and initiate clinical consultation encounters.
- **FR-DOC-02**: The system shall provide an integrated symptom input interface supporting free-text autocompletion, queryable against the ML symptom inference microservice.
- **FR-DOC-03**: The system shall display differential diagnostic suggestions from both Tier 1 (curated) and Tier 2 (sparse KB) models, clearly annotated with the mandatory disclaimer: `clinicalValidation: not_established`.
- **FR-DOC-04**: The system shall provide an ICD-10 diagnostic catalog search enabling clinicians to select standardized disease classifications across 71,704 validated concepts.
- **FR-DOC-05**: The system shall validate prescribed medications against the deterministic medicine safety engine, rendering blocking or non-blocking alerts for drug-drug interactions, maximum daily dosage overages, and age-related limits.
- **FR-DOC-06**: The system shall allow clinicians to order laboratory investigations linked directly to the consultation encounter.

### 3.2.3 Pharmacy & Dispensing Subsystem
- **FR-PHA-01**: The system shall allow pharmacists to retrieve prescriptions via direct ID lookup or by scanning a patient's cryptographic QR token.
- **FR-PHA-02**: The system shall mandate an identity verification gate: dispensing shall be locked until the pharmacist inputs a valid patient National Identity Card (NIC) token.
- **FR-PHA-03**: The system shall support both full and partial dispensing of multi-item prescriptions, recording exact quantities, dispensing timestamps, and pharmacist IDs.
- **FR-PHA-04**: The system shall atomically transition prescription status to `dispensed` or `partially_dispensed`, preventing duplicate dispensing across different pharmacy terminals.

### 3.2.4 Laboratory Subsystem
- **FR-LAB-01**: The system shall maintain an investigation queue for pending laboratory orders generated during consultations.
- **FR-LAB-02**: The system shall allow lab staff to upload report files restricted strictly to PDF format, validating file headers using binary magic bytes (`%PDF-`) to prevent malicious executable injection.
- **FR-LAB-03**: The system shall notify the prescribing doctor and patient upon report finalization.

### 3.2.5 Epidemiological Surveillance Subsystem
- **FR-EPI-01**: The system shall automatically aggregate anonymized consultation diagnostic events categorized by administrative district (1 to 25), province (9), or national level.
- **FR-EPI-02**: The system shall evaluate incidence data using a 7-day calendar window compared against a 56-day baseline to compute standardized daily deviations ($z_k = (c_k - \mu) / \sigma$).
- **FR-EPI-03**: The system shall enforce a three-tier noise suppression gate before publishing outbreak alerts:
  1. *Volume Floor Gate*: Absolute case volume in the 7-day window must reach at least 5 distinct episodes ($N \ge 5$).
  2. *Persistence Gate*: At least 2 consecutive complete calendar days in the window must exhibit elevated daily deviation ($z > 2.0$ with $c_k > 0$).
  3. *Statistical Severity Classification*: Categorizes triggered signals into Watch ($z \in [2.0, 3.0)$), Alert ($z \in [3.0, 4.0)$), or Critical ($z \ge 4.0$).
- **FR-EPI-04**: The system shall compute 14-day statistical trend projections with explicit prediction bounds, labelled as descriptive projections rather than validated epidemiological forecasts.

### 3.2.6 Administrative & Public Subsystems
- **FR-ADM-01**: The system shall log all sensitive read and write actions to an immutable, append-only security audit log capturing user ID, IP address, timestamp, and target entity.
- **FR-PUB-01**: The system shall serve public health education advisories in English, Sinhala, and Tamil without requiring authentication.

---

## 3.3 Non-Functional Requirements

### 3.3.1 Security and Privacy (NFR-SEC)
- **NFR-SEC-01 (Encryption at Rest)**: Sensitive patient demographic fields (NIC, full name, phone number, address) and clinical consultation notes shall be encrypted using AES-256-GCM authenticated encryption with versioned cryptographic keys.
- **NFR-SEC-02 (Blind Indexing)**: Searchable sensitive fields shall generate HMAC-SHA-256 blind indexes with salt to allow deterministic database querying without decryption.
- **NFR-SEC-03 (Authentication)**: Authentication shall utilize short-lived JSON Web Tokens (JWT) coupled with secure, HttpOnly, SameSite cookies and Redis-backed token revocation.
- **NFR-SEC-04 (Brute-Force Protection)**: Public and sensitive endpoints (login, OTP request, password reset) shall be rate-limited using in-memory token bucket algorithms.

### 3.3.2 Performance and Scalability (NFR-PERF)
- **NFR-PERF-01 (API Latency)**: Core backend Express REST endpoints shall achieve p95 response latencies under 150 ms under synthetic load.
- **NFR-PERF-02 (ML Latency)**: The Python ML microservice shall execute symptom inference queries in less than 5 ms p95 (empirically measured at 1.24 ms p95, mean 0.77 ms).
- **NFR-PERF-03 (Memory Footprint)**: The ML microservice process resident set size (RSS) shall not exceed 250 MB (empirically measured at 196.82 MB peak), ensuring stability within the 512 MB Render Free tier memory boundary.

### 3.3.3 Reliability and Operational Resilience (NFR-REL)
- **NFR-REL-01 (Stateless Architecture)**: Backend services shall remain entirely stateless, delegating session storage to database TTL records to survive cloud container sleep and auto-recovery cycles.
- **NFR-REL-02 (Cold-Start Tolerance)**: Client applications shall gracefully handle cloud microservice wake-up cycles of up to 60 seconds with descriptive visual loading indicators.

### 3.3.4 Localization and Usability (NFR-USE)
- **NFR-USE-01 (Trilingual Coverage)**: The three locale dictionaries contain 876 keys each. The source audit found 99.32% of Sinhala and Tamil values differ from English. Coverage of every visible string remains under review.
- **NFR-USE-02 (Accessibility)**: The frontend application shall comply with WCAG 2.1 Level AA color contrast ratios and support responsive layouts across mobile, tablet, and desktop viewports.

### 3.3.5 Verification and Maintainability (NFR-MAINT)
- **NFR-MAINT-01 (Offline Test Suite)**: The entire automated test suite (3,768 tests) shall execute cleanly offline in less than 180 seconds without external network dependencies.
- **NFR-MAINT-02 (Protected Integrity)**: Critical security and calculation files (15 files) shall be locked via SHA-256 hashes in a monitored release ledger.
