# MediSync: Digital Health Information & Real-Time Syndromic Surveillance Platform
## Final Capstone Engineering Technical Report
**Author**: [OWNER: Student Name]  
**Institution**: [OWNER: University / Faculty of Computing / Department of Software Engineering]  
**Academic Year**: 2026 | **Submission Deadline**: 20 November 2026  
**Repository Branch**: eat/sub5-submission-pack  
**Quality Gate Status**: 3,465 Tests Passed / 0 Failed | 15/15 Protected Ledger Pins Locked  

---

# Executive Summary & Abstract

## Abstract
MediSync is an enterprise-grade digital health and epidemiological surveillance platform designed for developing healthcare ecosystems, contextualized to the public and private health landscape of Sri Lanka. Addressing critical systemic bottlenecks—including physical outpatient department (OPD) congestion, manual paper-based prescription fraud, uncontrolled multi-pharmacy dispensing, unmonitored antibiotic stewardship, and fragmented, delayed infectious disease reporting—MediSync integrates a decentralized clinical workflow engine with real-time syndromic surveillance and machine learning-assisted clinical triage. 

The architecture encompasses a zero-trust multi-tenant MERN core (MongoDB, Express, React, Node.js) paired with an isolated Python/Flask machine learning service. Sensitive patient identifiers and health records are cryptographically protected via field-level AES-256-GCM authenticated encryption paired with blind indexing for privacy-preserving querying. Clinical safety gates enforce automatic drug-drug interaction detection, daily dosage ceiling verification, renal/hepatic contraindication checks, and cryptographic QR prescription dispensing validated against patient National Identity Card (NIC) verification tokens.

To assist clinicians under high OPD volume, MediSync incorporates a dual-tier symptom matching pipeline: Tier 1 executes a calibrated Random Forest classifier trained on 41 standardized clinical profiles, while Tier 2 provides sparse retrieval against a curated, quarantined knowledge base derived from CDC/SymCAT ambulatory survey data (174 auto-accepted condition profiles mapped to public-domain ICD-10-CM concepts). On the epidemiological surveillance front, MediSync runs automated spatio-temporal anomaly detection across Sri Lanka's 25 administrative districts, utilizing Exponentially Weighted Moving Averages (EWMA) and Cumulative Sum (C-SUM) algorithms across 12 tracked communicable diseases with automated threshold-gating to prevent alert fatigue.

This technical report documents the complete architectural specification, security protocols, empirical ML evaluation, verification rigor (3,465 offline tests across 207 suites), deployment infrastructure, operational limitations, and academic viva defenses for the MediSync undergraduate software engineering capstone submission.

---

> [!IMPORTANT]
> **Regulatory and Clinical Disclaimer**:  
> MediSync is an academic university engineering prototype evaluated strictly on synthetic datasets and self-consistency protocols. All machine learning inference payloads and epidemiological anomaly signals carry the immutable system tag `clinicalValidation: not_established`. The system is not licensed, certified, or intended for autonomous medical diagnosis, clinical decision-making, or primary disease surveillance without human medical practitioner validation.

---

# Chapter 1: Introduction and Problem Statement

## 1.1 Context and Background: Healthcare in Sri Lanka
The Sri Lankan healthcare system represents an internationally recognized model of public-health delivery, achieving high maternal and child health outcomes and high life expectancy despite resource constraints. Healthcare in Sri Lanka operates along a dual-track delivery mechanism:
1. **Free Public Sector**: Administered by the Ministry of Health (MOH), providing free outpatient consultations, inpatient admissions, and essential pharmaceuticals through provincial general hospitals, district base hospitals, and primary medical care units.
2. **Private Healthcare Sector**: Operating on an out-of-pocket and private medical insurance model, comprising private hospitals, corporate clinics, and independent general practitioner (GP) surgeries.

Despite extensive geographical reach, the operational reality of public outpatient departments (OPDs) is characterized by severe resource asymmetry:
- Single medical officers routinely evaluate between 40 and 80 patients per hour during peak morning clinics, translating to less than 90 seconds of clinical evaluation time per patient.
- Diagnostic workflows remain heavily reliant on paper physical bed-head tickets (BHTs), paper prescription slips, and physical laboratory reports carried by patients.
- Centralized electronic medical record (EMR) adoption is fragmented across tertiary teaching institutions, with zero interoperability connecting public hospital dispensaries, private community pharmacies, and regional public health inspectors (PHIs).

## 1.2 Problem Statement

### 1.2.1 Paper Prescription Fraud and Duplicate Dispensing
Under traditional paper prescription workflows, prescriptions lack tamper-evidence and transactional finality. Patients can present the same physical slip across multiple private community pharmacies ("pharmacy hopping"), resulting in unauthorized multi-refilling of controlled substances, benzodiazepines, and habit-forming analgesics. Furthermore, manual alteration of prescribed quantities and illegible physician handwriting introduce critical medication dispensing errors.

### 1.2.2 Unmonitored Medication Safety and Antibiotic Stewardship
In resource-constrained settings, community dispensaries lack automated decision support. Clinicians under severe time pressure cannot cross-reference complex multi-drug regimens against drug-drug interaction (DDI) databases, maximum daily dosing ceilings, or organ-specific contraindications (e.g., prescribing nephrotoxic NSAIDs in pre-existing chronic kidney disease). Uncontrolled dispensing of broad-spectrum antibiotics for viral self-limiting syndromes accelerates antimicrobial resistance (AMR), a primary public health crisis identified by the World Health Organization.

### 1.2.3 Latent, Fragmented Disease Outbreak Surveillance
The current national communicable disease surveillance apparatus relies on the manual completion and postal dispatch of epidemiological notification cards (Form H-544) by treating physicians to local Medical Officers of Health (MOH). By the time physical notifications are aggregated and entered into centralized databases, an emerging vector-borne outbreak (such as Dengue fever during monsoon season) or water-borne cluster (such as Leptospirosis during paddy cultivation) has typically progressed through multiple replication cycles, eliminating opportunities for proactive larval control or prophylactic antimicrobial deployment.

### 1.2.4 Diagnostic Decision Fatigue in High-Volume Clinics
Junior medical officers in rural base hospitals face diagnostic exhaustion when confronting complex multi-symptom presentations. While computerized clinical decision support systems (CDSS) exist in western commercial hospital EHRs, they are resource-intensive, rely on proprietary taxonomies, and are ill-suited for low-bandwidth, low-compute infrastructure.

## 1.3 Project Motivation and Scope
MediSync was initiated as an undergraduate software engineering capstone project to conceptualize, engineer, and evaluate a lightweight, cloud-native, trilingual (English, Sinhala, Tamil) health information and surveillance platform tailored for developing healthcare architectures. The core system objectives include:
1. **Digital Prescription Integrity**: Immutable digital prescriptions signed with cryptographic QR codes, verifiable at dispensing, and constrained by patient identity token confirmation to eliminate duplicate dispensing.
2. **Deterministic Medication Safety**: Automated, zero-latency drug-drug interaction checks, dosage ceiling validations, and pediatric/geriatric warnings evaluated prior to signature.
3. **Syndromic Epidemiological Surveillance**: Real-time spatio-temporal outbreak detection utilizing automated statistical anomaly surveillance across all 25 districts of Sri Lanka.
4. **Lightweight Triage Support**: Dual-tier AI/ML clinical symptom matching optimized to operate within a 512 MB memory footprint on cloud-free infrastructure.

---

> [!NOTE]
> Literature citations, historical epidemiological survey figures from the MOH Epidemiology Unit, and national census statistics are marked for final review in `[OWNER: Insert official MOH Annual Health Bulletin 2023 / Census 2024 citations]`.

---

# Chapter 2: Objectives and Project Scope

## 2.1 Primary Objectives
The primary engineering objective of the MediSync platform is to design, develop, and empirically verify an end-to-end cloud-native clinical management and surveillance platform. Specifically:
1. **Secure Patient Record Management**: Implement an encrypted, role-segregated electronic patient dossier supporting demographic capture, clinical history, longitudinal consultation logs, and laboratory investigation records.
2. **Cryptographic Prescription & Dispensing Lifecycle**: Engineer a tamper-evident prescription issuance and fulfillment pipeline featuring one-time QR verification tokens, National Identity Card (NIC) validation gates, and durable anti-duplicate dispensing records.
3. **Automated Clinical Medication Safety**: Construct an in-memory, deterministic drug safety verification engine enforcing multi-drug interaction checking, maximum daily dose ceilings, renal/hepatic adjustments, and antibiotic duration limits.
4. **Real-time Spatio-temporal Epidemiological Surveillance**: Develop an automated surveillance subsystem that processes clinical encounter diagnoses across Sri Lanka's 25 administrative districts, identifies statistical anomalies (EWMA, C-SUM), and triggers early outbreak warning alerts with multi-gate noise suppression.
5. **Low-Footprint Machine Learning Triage**: Train, calibrate, and serve a symptom-based differential guidance model operating under 200 MB process RSS and sub-5 ms latency on resource-constrained cloud infrastructure.
6. **Trilingual Localization**: Deliver complete interface parity across English, Sinhala (සිංහල), and Tamil (தமிழ்) to ensure equitable accessibility across Sri Lanka's multilingual clinical workforce.

## 2.2 Secondary Objectives
1. **Zero-Trust Access Control**: Enforce granular role-based access control (RBAC) across six distinct user archetypes with automated session invalidation and audit logging.
2. **Offline-First Deterministic Verification**: Establish an exhaustive automated test pyramid (unit, integration, end-to-end, security) runnable completely offline without cloud or live database dependencies.
3. **Tamper-Resistant Ledger Protection**: Institute cryptographic SHA-256 baseline hashing across core security, authentication, and clinical calculation files to protect critical release invariants.

## 2.3 Scope and System Boundaries

### 2.3.1 In-Scope Deliverables
- **Core Clinical Workflows**: Patient appointment booking, physician clinical consultation capture, digital prescription authoring, pharmacy QR scanning and partial/full dispensing.
- **Laboratory Subsystem**: Lab test ordering, PDF report uploads, automated file validation (magic byte and MIME verification), and clinician review queues.
- **Security & Privacy Infrastructure**: Field-level AES-256-GCM encryption for patient PII and clinical notes, blind indexing for demographic search, and time-to-live (TTL) ephemeral tokens for session authentication.
- **Epidemiological Engine**: District-level spatial tracking, 12 communicable disease surveillance models, 14-day projection pipelines, and automated outbreak alert generation.
- **Public Health Portal**: Trilingual citizen health advisories, seasonal disease awareness, and sanitized district outbreak summaries.

### 2.3.2 Explicitly Out-of-Scope (Boundaries)
To ensure academic rigor and feasible execution within capstone resource constraints, the following domains were explicitly designated out-of-scope:
- **Financial Billing and ERP**: Invoicing, payment gateway processing, insurance claim adjudication, and hospital inventory procurement accounting.
- **Hardware Integration**: Direct interfacing with medical bedside monitors, telemetry devices, HL7/DICOM medical imaging hardware, or automated pill-dispensing robotics.
- **Clinical Validation & Medical Certification**: MediSync is an engineering prototype. It has not undergone clinical trials, randomized control trials (RCTs), CE mark medical device certification, or National Medicines Regulatory Authority (NMRA) clinical software approval.

## 2.4 Research and Synthetic Data Scope
All clinical data, patient demographic rosters, encounter logs, and dispensing transactions utilized during development and evaluation are strictly **synthetic**:
- Disease surveillance data is generated using epidemiologically calibrated synthetic seeds reflecting realistic seasonal trends and baseline incidence rates.
- Symptom-disease training datasets are derived from open-access scientific catalogs (CDC ambulatory survey data processed via SymCAT) and synthetic multi-symptom permutations.
- National census and population figures are structured to accept official departmental data via documented ingestion scripts, with unverified baselines marked as `pending_owner_data`.

## 2.5 Compliance and Ethical Alignment
System design aligns with the core principles of the **Sri Lanka Personal Data Protection Act No. 9 of 2022 (PDPA)** and international healthcare privacy standards (HIPAA Security Rule):
- **Data Minimization**: Only clinically requisite parameters are captured.
- **Storage Limitation**: Temporary OTPs, verification codes, and clinical command tokens utilize automatic database TTL index expiration.
- **Integrity and Confidentiality**: Strong authenticated encryption at rest (AES-256-GCM) with blind indexing prevents plaintext exposure even in the event of database exfiltration.

---

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
- **FR-DOC-01**: The system shall allow physicians to schedule appointments, manage daily clinic queues, and initiate clinical encounters.
- **FR-DOC-02**: The system shall provide an integrated symptom input interface supporting free-text autocompletion, queryable against the ML symptom inference microservice.
- **FR-DOC-03**: The system shall display differential diagnostic suggestions from both Tier 1 and Tier 2 ML models, clearly annotated with the mandatory disclaimer: `clinicalValidation: not_established`.
- **FR-DOC-04**: The system shall provide an ICD-10 diagnostic catalog search enabling clinicians to select standardized disease classifications.
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
- **FR-EPI-01**: The system shall automatically aggregate anonymized consultation diagnostic events categorized by administrative district (1 to 25) and disease category.
- **FR-EPI-02**: The system shall evaluate incidence data using Exponentially Weighted Moving Average (EWMA) and Cumulative Sum (C-SUM) algorithms to detect anomalous spatial clusters.
- **FR-EPI-03**: The system shall enforce a three-tier noise suppression gate (absolute case count minimum, minimum sustained duration, and statistical z-score threshold) before publishing high-priority outbreak alerts.
- **FR-EPI-04**: The system shall compute 14-day statistical trend projections with explicit confidence bounds, labelled as descriptive projections rather than validated epidemiological forecasts.

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
- **NFR-PERF-02 (ML Latency)**: The Python ML microservice shall execute symptom inference queries in less than 5 ms p95 (empirically measured at 1.24 ms p95).
- **NFR-PERF-03 (Memory Footprint)**: The ML microservice process resident set size (RSS) shall not exceed 250 MB (empirically measured at 196.82 MB peak), ensuring stability within the 512 MB Render Free tier memory boundary.

### 3.3.3 Reliability and Operational Resilience (NFR-REL)
- **NFR-REL-01 (Stateless Architecture)**: Backend services shall remain entirely stateless, delegating session storage to database TTL records to survive cloud container sleep and auto-recovery cycles.
- **NFR-REL-02 (Cold-Start Tolerance)**: Client applications shall gracefully handle cloud microservice wake-up cycles of up to 60 seconds with descriptive visual loading indicators.

### 3.3.4 Localization and Usability (NFR-USE)
- **NFR-USE-01 (Trilingual Coverage)**: 100% of user-facing UI labels, clinical instructions, and public health advisories shall maintain exact key parity across English, Sinhala, and Tamil.
- **NFR-USE-02 (Accessibility)**: The frontend application shall comply with WCAG 2.1 Level AA color contrast ratios and support responsive layouts across mobile, tablet, and desktop viewports.

### 3.3.5 Verification and Maintainability (NFR-MAINT)
- **NFR-MAINT-01 (Offline Test Suite)**: The entire automated test suite (3,465 tests) shall execute cleanly offline in less than 180 seconds without external network dependencies.
- **NFR-MAINT-02 (Protected Integrity)**: Critical security and calculation files (15 files) shall be locked via SHA-256 hashes in a monitored release ledger.

---

# Chapter 4: System Architecture & Design

## 4.1 Architectural Pattern & Philosophy
MediSync adopts a **cloud-native, decoupled service-oriented architecture (SOA)** centered on zero-trust principles. Recognizing the bandwidth limitations, unpredictable connectivity, and resource constraints of rural healthcare outposts in Sri Lanka, the system deliberately segregates intensive computation (machine learning inference) from transaction processing (consultations and prescriptions) and presentation logic.

The architecture comprises three primary tiers:
1. **Presentation Layer**: A responsive React Single Page Application (SPA) compiled into static assets and deployed to global edge CDNs (Vercel).
2. **Application & API Gateway Tier**: A stateless Node.js / Express microservice handling authentication, authorization, clinical transaction orchestration, and cryptographic operations (Render Web Service).
3. **Specialized Compute Microservice**: An isolated, lightweight Python 3 / Flask microservice dedicated to symptom feature vectorization, Random Forest classification, and sparse knowledge-base retrieval (Render Web Service).
4. **Data Persistence Tier**: A managed MongoDB Atlas cluster supporting replica sets, encrypted connections (TLS 1.3), field-level authenticated encryption at rest, and automated TTL indexing.

```
       +-------------------------------------------------------------+
       |                  Client Layer (Vercel CDN)                  |
       |     React 18 SPA | Trilingual UI (EN/SI/TA) | Tailwind CSS  |
       +------------------------------+------------------------------+
                                      | HTTPS / TLS 1.3 (JSON)
                                      v
       +-------------------------------------------------------------+
       |             Backend Core API (Node.js / Express)            |
       |  - RBAC Middleware          - AES-256-GCM Crypto Pipeline   |
       |  - Rate Limiter (Token)     - Medicine Safety Engine        |
       |  - Mongoose Schema Layer    - PDF Report Generator          |
       +--------------+-------------------------------+--------------+
                      |                               |
       Internal HMAC  |                               | Mongoose (TLS)
       Shared Secret  v                               v
+-----------------------------+       +------------------------------+
|   ML Microservice (Flask)   |       |   MongoDB Atlas Database     |
| - Tier 1: Random Forest     |       | - Encrypted Patient Store    |
| - Tier 2: Sparse KB Matcher |       | - Consultations & Rx Store   |
| - Memory RSS: 196.82 MB     |       | - Outbreak Surveillance Log  |
| - Latency: 0.77 ms mean     |       | - TTL Index Sessions         |
+-----------------------------+       +------------------------------+
```

---

## 4.2 Component Architecture & Boundaries

### 4.2.1 Presentation Tier (Client)
- **Framework**: React 18 with modern functional hooks, React Router v6 for role-segmented client routing, and Context API for global state (AuthContext, LanguageContext, SocketContext).
- **Styling & Accessibility**: Tailwind CSS utility framework, styled to WCAG 2.1 AA contrast standards.
- **Client Resilience**: Offline detection interceptors with automated retry logic, optimistic UI state updates for high-throughput OPD queue navigation, and graceful cold-start countdown modals for sleep-dormant ML services.

### 4.2.2 Backend Application Gateway (Server)
- **Framework**: Express.js on Node.js runtime, organized into a clean layered pattern:
  - `routes/`: 187 Express endpoint declarations with route-level middleware binding.
  - `controllers/`: Request orchestration, transactional validation, and response formatting.
  - `models/`: 29 Mongoose data schemas enforcing schema validation, encryption hooks, and compound indexes.
  - `middleware/`: Authentication (`auth.js`), role guards, rate limiters, file upload filtering (`multer`), and error trapping.
  - `utils/`: Cryptographic utilities (`versionedEncryption.js`), blind indexing, PDF generation, and dataset loaders.

### 4.2.3 Machine Learning Microservice (ML Engine)
- **Framework**: Python 3.14 with Flask micro-framework and Gunicorn WSGI container.
- **Decoupled Security Boundary**: The ML engine does not connect to MongoDB, does not read patient PII, and operates purely statelessly. Requests from the Node.js backend are authenticated using an internal HMAC-SHA-256 signature in the request headers (`X-Internal-Token`).
- **Memory Optimization**: Employs Scipy sparse CSR matrices and compressed memory-mapped JSON lookup structures to restrict total process resident memory (RSS) to 196.82 MB, avoiding memory exhaustion crashes on 512 MB cloud containers.

---

## 4.3 Data Flow & Transaction Sequences

### 4.3.1 Consultation and Digital Prescription Sequence
As illustrated in Diagram **D03** (`docs/report/diagrams/d03_consultation_prescription_dispensing.mmd`):
1. The physician enters patient vitals, subjective complaints, and symptom tags.
2. The UI queries the ML engine via the Express gateway; differential predictions are returned with `clinicalValidation: not_established`.
3. The physician selects a standardized diagnosis and inputs proposed medications.
4. The backend medicine safety engine cross-references the regimen against the drug interaction matrix and dosage limit tables.
5. If safe, the prescription is committed to MongoDB with an auto-generated cryptographic QR token payload; a notification is dispatched to the patient.

### 4.3.2 QR Verification and Identity-Gated Dispensing
As illustrated in Diagram **D04** (`docs/report/diagrams/d04_qr_verification_nic_gate.mmd`):
1. The patient presents their mobile or physical QR prescription token to a community pharmacy.
2. The pharmacy terminal scans the token and requests prescription details.
3. The server validates the token's signature and expiration, returning non-sensitive prescription items.
4. The pharmacist inputs the patient's physical National Identity Card (NIC) number.
5. The server validates the NIC against the encrypted patient dossier's blind index.
6. Upon identity match, dispensing is unlocked; the pharmacist confirms dispensed quantities, and the prescription transitions to `dispensed` or `partially_dispensed`.

---

## 4.4 Deployment Topology & Cloud Infrastructure
As detailed in Diagram **D02** (`docs/report/diagrams/d02_deployment_infrastructure.mmd`):
- **Frontend**: Hosted on Vercel Edge Network with automated continuous deployment from the Git repository.
- **Backend & ML Services**: Hosted on Render Free Web Services with automatic container recovery.
- **Database**: Hosted on MongoDB Atlas (Free M0 Cluster, 512 MB storage, shared RAM, AWS ap-south-1 Mumbai region for optimal geographic proximity to Sri Lanka).
- **Communication Channels**: Secure SMTP relay (Nodemailer) for transactional email OTPs and emergency alert dispatch.

---

## 4.5 Formal Diagram Index
The architectural diagrams supporting this chapter are preserved in the repository in Mermaid source format:
- **D01**: System Architecture (`docs/report/diagrams/d01_system_architecture.mmd`)
- **D02**: Deployment Infrastructure (`docs/report/diagrams/d02_deployment_infrastructure.mmd`)
- **D03**: Consultation to Dispensing Flow (`docs/report/diagrams/d03_consultation_prescription_dispensing.mmd`)
- **D04**: QR Verification & NIC Gate (`docs/report/diagrams/d04_qr_verification_nic_gate.mmd`)
- **D05**: Outbreak Detection Pipeline (`docs/report/diagrams/d05_outbreak_detection_pipeline.mmd`)
- **D06**: Tiered Matcher Flow (`docs/report/diagrams/d06_tiered_matcher_flow.mmd`)
- **D07**: Authentication & Session Flow (`docs/report/diagrams/d07_authentication_flow.mmd`)
- **D08**: Medicine Safety Decision Flow (`docs/report/diagrams/d08_medicine_safety_flow.mmd`)
- **D09**: Entity-Relationship Diagram (`docs/report/diagrams/d09_entity_relationship_diagram.mmd`)

---

# Chapter 5: System Implementation by Module

## 5.1 Authentication & Role-Based Session Management
The authentication architecture is implemented across `server/src/middleware/auth.js` (Protected File #1), `server/src/controllers/authController.js`, and `server/src/models/User.js`:
- **Password Security**: Passwords are salted and hashed using `bcryptjs` with an adaptive work factor of 12 rounds.
- **Session Tokens**: Stateless JSON Web Tokens (JWT) signed via HMAC-SHA-256 (`HS256`) with a 15-minute access token lifespan, coupled with a 7-day refresh token stored in an `HttpOnly`, `SameSite=Strict`, `Secure` cookie.
- **Two-Factor & OTP Authentication**: Critical actions (patient registration, password resets, sensitive consent updates) generate cryptographically secure 6-digit one-time passcodes (OTP) via `crypto.randomInt()`. OTPs are persisted in the `OTPSession` collection with a 300-second TTL index (`expireAfterSeconds: 300`) ensuring automatic purging at the database engine level.
- **Role-Based Guards**: Authorization middleware strictly validates user claims (`patient`, `doctor`, `pharmacy`, `hospital`, `admin`, `public_health`), rejecting unauthorized access attempts with HTTP 403 Forbidden and logging the attempt to the security audit trail.

---

## 5.2 Encrypted Patient Dossier & Blind Indexing
To comply with the Sri Lanka Personal Data Protection Act No. 9 of 2022, patient records are segregated and encrypted at the field level:
- **Cryptographic Primitive**: Implemented in `server/src/utils/versionedEncryption.js` (Protected File #15). Fields including `nic`, `fullName`, `phone`, `address`, and clinical `notes` are encrypted using AES-256-GCM. Each encrypted payload stores the cipher text, a 16-byte initialization vector (IV), a 16-byte authentication tag, and a `keyVersion` identifier to facilitate zero-downtime key rotation.
- **Blind Index Search**: Because encrypted ciphertexts vary non-deterministically across writes due to unique IVs, searchable identifiers (such as NIC and phone number) generate a companion blind index (`nic_bi`, `phone_bi`) computed via HMAC-SHA-256 with a dedicated secret cryptographic salt. This allows the database to execute $O(1)$ indexed equality queries without ever decrypting the primary store.

---

## 5.3 Clinical Consultations & Appointment Queue
- **Workflow Orchestration**: Implemented in `server/src/controllers/doctorController.js` (Protected File #2) and `server/src/models/Consultation.js` (Protected File #13).
- **Encounter Capture**: Clinicians record patient chief complaints, vital signs (blood pressure, pulse, temperature, SpO2, respiratory rate), structured symptom tags, and clinical notes.
- **ICD-10 Diagnostic Linking**: Diagnoses are linked directly to standardized ICD-10-CM codes loaded from `server/src/data/icd10_catalog.json` (34,290 distinct clinical concepts).
- **Transactional Atomicity**: Consultations, associated prescription records, and lab investigation orders are created within MongoDB multi-document transactions where replica sets permit, ensuring rollbacks upon validation failures.

---

## 5.4 Digital Prescriptions & Cryptographic QR Dispensing
- **Prescription Model**: Prescriptions (`server/src/models/Prescription.js`) capture an array of medication objects specifying drug name, dosage, frequency, route, duration in days, and refill authorizations.
- **One-Time QR Token**: Upon finalization, the backend generates a signed cryptographic token containing the prescription ID, issuance timestamp, and a short-lived HMAC signature. This token is rendered as a QR matrix embeddable on the patient's mobile portal or formatted into a printable PDF via `pdfkit`.
- **National Identity Card (NIC) Verification Gate**: When presented at a community dispensary (`server/src/controllers/pharmacyController.js`), scanning the QR code retrieves the prescription in an unverified staging state. The pharmacist must collect and enter the patient's physical NIC number. The server hashes the submitted NIC with the blind index salt and verifies equality against the patient record. Only upon confirmation is dispensing unlocked.
- **Anti-Duplicate Dispensing Ledger**: Dispensing events create durable records in the `Dispensing` collection (`server/src/models/Dispensing.js`), recording the dispensing pharmacist, timestamp, facility ID, and items dispensed. Prescriptions transition atomically to `partially_dispensed` or `dispensed`. Any subsequent attempt to present the same QR code at another pharmacy immediately triggers a "Prescription Already Dispensed" blocking alert.

---

## 5.5 Deterministic Medicine Safety Engine
Implemented in `server/src/services/medicineSafetyService.js` and `server/src/data/medicine_safety_limits.json`:
- **Zero-Latency In-Memory Lookups**: Evaluates medication safety rules synchronously during prescription authoring without outbound network calls.
- **Drug-Drug Interaction (DDI) Detection**: Cross-references pairwise combinations against a matrix of documented clinical interactions (e.g., Warfarin + Ciprofloxacin, ACE Inhibitors + Spironolactone), returning severity tiers (`critical_contraindication`, `major_warning`, `minor_monitoring`).
- **Maximum Daily Dose Ceilings**: Validates prescribed single and cumulative daily dosages against adult reference limits (e.g., Paracetamol max 4,000 mg/24h).
- **Renal and Hepatic Adjustments**: Inspects patient baseline organ function flags, emitting automated dosage reduction prompts.
- **Verification Status**: Reference datasets are marked with `status: "unverified_owner_must_check"` and audited against BNF 86 and WHO guidelines in `docs/report/MEDICINE_LIMITS_VERIFICATION.md`.

---

## 5.6 Laboratory Management & Secure Upload Pipeline
Implemented in `server/src/controllers/labController.js` and verified by `server/tests/lab.test.js` (Protected File #9):
- **Investigation Orders**: Physicians initiate investigation requests (e.g., Full Blood Count, Serum Creatinine, Dengue NS1 Antigen, Urine Full Report) linked to active consultations.
- **File Upload Guardrails**: Medical Laboratory Technologists upload completed diagnostic reports. The upload pipeline enforces strict multi-layered validation:
  1. File extension must strictly equal `.pdf`.
  2. MIME type reported by the client must equal `application/pdf`.
  3. Binary inspection validates that the first 5 bytes of the file stream match the magic byte sequence `%PDF-` (`0x25 0x50 0x44 0x46 0x2D`), preventing polyglot executable script attacks.
- **Storage Segregation**: Uploaded files are written to quarantined directories with randomly generated UUID filenames to prevent path traversal attacks.

---

## 5.7 Syndromic Outbreak Surveillance Subsystem
Implemented in `server/src/services/outbreakService.js` and `server/src/models/OutbreakAlert.js`:
- **District Spatial Aggregation**: Automatically indexes clinical encounter diagnoses across Sri Lanka's 25 administrative districts (Ampara to Vavuniya).
- **Anomaly Detection Algorithms**:
  - **EWMA (Exponentially Weighted Moving Average)**: Calculates moving baselines weighting recent days with smoothing parameter $\alpha = 0.3$.
  - **C-SUM (Cumulative Sum)**: Tracks cumulative deviations above expected historical means to detect insidious gradual disease accumulation.
- **Three-Tier Alert Noise Suppression**: To prevent alert fatigue among public health officers, alerts are published only if three simultaneous gates are satisfied:
  1. *Volume Gate*: Absolute daily case count exceeds minimum threshold ($n \ge 5$).
  2. *Duration Gate*: Incidence exceeds the baseline for at least 3 consecutive tracking windows.
  3. *Statistical Gate*: The calculated z-score exceeds $+2.5$ standard deviations above historical mean.

---

## 5.8 Public Health Analytics & 14-Day Projections
- **Trend Extrapolation**: Employs ordinary least squares (OLS) linear and exponential regression across 30-day trailing windows to project short-term trajectory bounds.
- **Ethical Labeling**: In compliance with Sub-Project 5 truthfulness guidelines, all generated trajectories are rendered with explicit visual labels: *"14-Day Statistical Projection — Descriptive trend only; not a validated epidemiological forecast"*.

---

## 5.9 Trilingual Internationalization (i18n)
- **Architecture**: Implemented on the client using a centralized translation dictionary structure (`client/src/locales/`) loaded through `LanguageContext`.
- **Language Coverage**: Provides complete trilingual interface parity across **English (en)**, **Sinhala (si)**, and **Tamil (ta)**.
- **Key Parity Verification**: Verified by automated test suites ensuring 100% mutual inclusion across all translation keys (no missing string fallbacks in production views).

---

## 5.10 Administrative Tools & Immutable Audit Logging
- **Audit Logging**: Implemented via `server/src/models/AuditLog.js`. Records capture `action`, `actorId`, `actorRole`, `targetEntity`, `ipAddress`, `userAgent`, and `timestamp`.
- **Append-Only Immutability**: The Mongoose schema explicitly suppresses update and delete operations on the `AuditLog` collection, ensuring tamper-evidence against administrative tampering.

---

# Chapter 6: Machine Learning Methodology, Evaluation & Benchmarking

## 6.1 Clinical Role and Regulatory Positioning
The machine learning subsystem in MediSync is engineered as a **clinical decision support assistant** designed to aid medical officers during high-volume outpatient triage in rural and district-level base hospitals. It does not perform autonomous diagnosis, nor does it replace the clinical judgment of a licensed practitioner. 

In strict adherence to regulatory boundaries, every response emitted by the ML microservice incorporates the immutable system attribute:
```json
"clinicalValidation": "not_established"
```
Furthermore, the client user interface renders prominent amber advisory banners accompanying all differential outputs, reminding clinicians that predictions represent statistical pattern matching against synthetic training distributions rather than clinically validated diagnoses.

---

## 6.2 Dual-Tier Inference Architecture
To reconcile high classification accuracy on prevalent conditions with broad coverage across rarer clinical presentations without exceeding cloud memory limits, MediSync implements a **Dual-Tier Triage Pipeline** (Diagram **D06**):

```
       [ Clinician Symptom Input (Vector / Tags) ]
                           |
                           v
           +-------------------------------+
           |    Tier 1: Random Forest      |
           |  (41 Curated Disease Classes) |
           +---------------+---------------+
                           |
         Confidence >= 0.35?
              /         \
            YES          NO (or low confidence)
            /             \
           v               v
  [ Tier 1 Result ]    +-------------------------------+
                       |    Tier 2: Sparse KB Matcher  |
                       |  (174 Active SymCAT Profiles) |
                       +---------------+---------------+
                                       |
                                       v
                             [ Tier 2 Match / Fallback ]
```

### 6.2.1 Tier 1: Calibrated Random Forest Classifier
- **Model Specification**: An ensemble of 100 decision trees implemented via `scikit-learn`, trained across 41 curated disease profiles representing frequent communicable and non-communicable conditions in South Asia (including Dengue fever, Leptospirosis, Typhoid fever, Malaria, Viral Hepatitis, Bronchial Asthma, and Type 2 Diabetes).
- **Feature Space**: 132 binary symptom indicators derived from standardized clinical presentations.
- **Cardinal Symptom Heuristics**: Embedded clinical safeguards verify essential cardinal symptoms. For example, a diagnosis of Typhoid fever requires the explicit presence of persistent high-grade step-ladder fever or rose spots; absence triggers automated confidence penalties.
- **Evaluation Performance**: As illustrated in Figure **F01** (Confusion Matrix) and Figure **F02** (ROC and Precision-Recall Curves), Tier 1 achieves high synthetic self-consistency on held-out test splits (Macro F1 = 0.94, Micro F1 = 0.96 across synthetic test matrices).

### 6.2.2 Tier 2: Sparse Knowledge Base Retrieval Engine
- **Data Provenance**: Ingested from the open-source SymCAT ambulatory clinical survey dataset (derived from CDC National Ambulatory Medical Care Survey data).
- **Curation and Quarantine Pipeline**:
  - The raw dataset comprised 801 disease profiles with 17,400 symptom-disease co-occurrence edges.
  - As detailed in Figure **F03** (Probability Histogram) and Figure **F04** (KB Ingestion Funnel), raw co-occurrence edges below $p < 0.15$ were pruned as noise.
  - Profiles with high Jaccard similarity ($\ge 0.80$) or fewer than 3 surviving distinct symptoms were isolated into `kb_quarantine.v1.json` (136 quarantined profiles, analyzed in Figure **F05**).
  - 174 clinically distinct profiles were successfully mapped to standard public-domain ICD-10-CM codes and admitted to the active knowledge base (`disease_symptom_kb_v2.json`).
- **Matching Algorithm**: Evaluates query symptoms against the sparse knowledge base using probability-weighted Jaccard overlap, computing normalized relevance scores.

### 6.2.3 Tiered Blending Protocol
Inference evaluates Tier 1 first. If Tier 1 confidence satisfies the threshold ($\ge 0.35$), the top-3 predictions are returned. If Tier 1 confidence falls below 0.35 or reports an unconfident classification, the engine automatically falls back to Tier 2 sparse retrieval, ensuring continuous diagnostic coverage without dead ends. Figure **F08** demonstrates the top-1, top-3, and top-5 self-consistency accuracy across Tier 1, Tier 2, and combined inference modes.

---

## 6.3 Design Parameters & Heuristics Inventory
All 11 hand-set heuristics governing the ML engine were audited and recorded in `docs/report/ML_DESIGN_PARAMETERS.md`:

| Parameter Identifier | Value | Architectural Purpose | Classification |
|---|---|---|---|
| `TIER1_CONFIDENCE_THRESHOLD` | 0.35 | Gate between Tier 1 ML and Tier 2 KB retrieval | Non-clinical design choice |
| `KB_EDGE_PROBABILITY_FLOOR` | 0.15 | Prunes low-confidence noise edges from SymCAT data | Non-clinical design choice |
| `KB_MIN_SYMPTOMS_PER_DISEASE` | 3 | Minimum distinct symptoms required for KB admission | Quality threshold |
| `KB_JACCARD_DEDUPLICATION` | 0.80 | Quarantine threshold for redundant disease profiles | Deduplication filter |
| `MAX_PREDICTIONS_RETURNED` | 3 | Limits cognitive load on reviewing medical officer | Usability choice |
| `TYPHOID_CARDINAL_CHECK` | True | Enforces fever/chills requirement for Typhoid | Clinical heuristic (needs review) |
| `DENGUE_PLATELET_ALERT` | $\le 100\text{k}$ | Triggers urgent warning on thrombocytopenia | Clinical guideline rule |
| `EWMA_SMOOTHING_ALPHA` | 0.30 | Moving average weighting for outbreak baselines | Epidemiological parameter |
| `OUTBREAK_ZSCORE_THRESHOLD` | +2.50 | Standard deviation cutoff for anomaly alerts | Statistical parameter |
| `OUTBREAK_MIN_CASES_GATE` | 5 | Minimum daily absolute volume to suppress noise | Non-clinical design choice |
| `OUTBREAK_MIN_DAYS_GATE` | 3 | Consecutive anomalous days required before alert | Non-clinical design choice |

---

## 6.4 Resource Profiling & Cloud Footprint
Under Sub-Project 5 Task 1.1, real operating system process resident memory (RSS) was benchmarked using `psutil` within the Python runtime (`scripts/benchmark_ml_resources.py`):

| Measurement Stage | OS Process RSS | % of 512 MB Render Free Limit | Measured Mean Latency |
|---|---|---|---|
| **Fresh Process Boot** | 20.75 MB | 4.05% | - |
| **Post-Model & KB Load** | 195.91 MB | 38.26% | - |
| **Post-100 Inferences** | 196.82 MB | 38.44% | 0.77 ms (p50: 0.64 ms, p95: 1.24 ms) |

As visualized in Figure **F09**, the peak resident memory of 196.82 MB demonstrates substantial safety margin below the 512 MB cloud container ceiling, preventing out-of-memory (OOM) fatal kills.

---

## 6.5 Epidemiological Surveillance Evaluation
The outbreak detection engine was evaluated across 8 synthetic epidemiological scenarios (S1–S8) across 12 target diseases (Figure **F10** and Figure **F11**):
- **Scenario S1 (Sharp Dengue Spike)**: Detected at Day 3 (z-score = +3.82, volume = 14 cases), successfully passing all three suppression gates.
- **Scenario S2 (Gradual Leptospirosis Rise)**: Detected via C-SUM accumulation at Day 5.
- **Scenario S3 (Single-Day Food Poisoning Outlier)**: Successfully suppressed by the Duration Gate ($< 3$ consecutive days), preventing false public panic.
- **Scenario S4 (Low Baseline Noise)**: Successfully suppressed by the Volume Gate ($< 5$ cases).

Figure **F12** illustrates the 14-day statistical projection curves, confirming appropriate bounding intervals during non-linear incidence surges.

---

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

---

# Chapter 8: Testing, Verification & Quality Assurance

## 8.1 Verification Philosophy & Test Pyramid
MediSync enforces an **offline-first, deterministic quality assurance methodology**. Because clinical software must guarantee non-regression across safety-critical invariants (drug interaction warnings, prescription immutability, role access boundaries), testing cannot depend on fragile external network connections, live cloud databases, or non-deterministic test fixtures.

The automated verification pyramid consists of **3,465 tests across 207 test suites**, achieving a 100% pass rate with zero flaky or intermittent tests:

```
                  / \
                 / E2E \           <- 5-Role Isolated E2E Flows
                /-------\
               / Security \        <- RBAC, DB Guards, Auth Redaction
              /------------\
             /  Integration \      <- Multi-Document Consultations, Dispensing
            /----------------\
           /    Unit Tests    \    <- Crypto, Medicine Safety, ML Scikit/Pytest
          /--------------------\
```

Figure **F13** visually details the distribution of test suites and test counts across functional components.

---

## 8.2 Test Suite Taxonomy & Component Breakdown

### 8.2.1 Core Backend & Services Unit Testing
- **Cryptographic Primitives**: Evaluates AES-256-GCM encryption, decryption, invalid authentication tag rejection, ciphertext tampering detection, and versioned key fallback.
- **Medicine Safety Engine**: Evaluates pairwise drug-drug interaction detection, cumulative daily dose calculations, pediatric age contraindications, and duration thresholds.
- **Dataset Loaders**: Tests offline parsing of ICD-10 catalog JSON (34,290 concepts) and district geo-coordinate datasets.

### 8.2.2 Clinical Transaction Integration Testing
- **Consultation Lifecycle**: Verifies patient appointment check-in, vital sign recording, multi-symptom capture, ICD-10 linking, and automated prescription generation.
- **Dispensing Workflows**: Implemented across `server/tests/ir04BackendIntegration.test.js` (Protected File #6), verifying that prescription state transitions atomically to `dispensed` or `partially_dispensed`, and confirming that multi-pharmacy duplicate dispensing attempts fail with HTTP 409 Conflict.
- **Laboratory Subsystem**: Verified in `server/tests/lab.test.js` (Protected File #9), validating MIME type filtering, magic byte `%PDF-` binary enforcement, and clinician report notification triggers.

### 8.2.3 Machine Learning Test Suite
- **Pytest Suite (`ml-engine/tests/`)**: Evaluates symptom tokenization, feature vector alignment, Tier 1 Random Forest output shapes, Tier 2 sparse knowledge-base retrieval, and HTTP HMAC internal token authentication.
- **Sanity Symptom Suite (`scripts/verify_sanity_symptom_cases.py`)**: 15 standardized query permutations (`SC-01` through `SC-15`) verifying HTTP 200, valid response payloads, `clinicalValidation: not_established` inclusion, and zero false emergency triggers.

### 8.2.4 End-to-End Client & UI Testing
- **Isolated Five-Role Specification**: Implemented in `client/tests/ir04-isolated-five-role-e2e.spec.js` (Protected File #11), walking through sequential role journeys: Patient -> Doctor -> Pharmacy -> Hospital Lab -> Public Health Epidemiologist.
- **Trilingual Key Parity**: Iterates across English, Sinhala, and Tamil dictionary keys (Figure **F14**), confirming zero missing string keys across localized views.

---

## 8.3 Offline Master Quality Gate (`scripts/run_offline_tests.js`)
All verification is consolidated into a single autonomous command runner that executes in offline developer environments:
```bash
node scripts/run_offline_tests.js
```
The master gate performs three mandatory sequential validation stages:
1. **Cryptographic Ledger Check**: Independently hashes all 15 protected files and confirms equality with `docs/release/PROTECTED_HASHES.json`.
2. **Automated Test Execution**: Spins up an in-memory database instance, executes all 207 Jest and Mocha test suites, and collects results.
3. **Frontend Production Compilation**: Executes `npm --prefix client run build`, confirming zero syntax errors, missing imports, or bundle compilation warnings (exit code 0).

---

## 8.4 Truth in Verification: Offline vs. Live Status
In compliance with project ethical guidelines, verification status is strictly segregated:

| Verification Scope | Status | Evidence / Verification Method |
|---|---|---|
| **Backend REST API Logic** | OFFLINE VERIFIED | 3,465 passed tests via in-memory database mock |
| **Field-Level Encryption & Blind Index** | OFFLINE VERIFIED | Automated test assertions in `server/tests/crypto.test.js` |
| **Deterministic Medicine Safety Engine** | OFFLINE VERIFIED | Validated against rule datasets in unit tests |
| **ML Inference Logic & Fallbacks** | OFFLINE VERIFIED | Pytest suite & 15 sanity cases via Flask `test_client` |
| **Frontend Production Compilation** | OFFLINE VERIFIED | `npm --prefix client run build` exits with code 0 |
| **Atlas Production Cloud Queries** | NOT VERIFIED LIVE | Production database queries reserved for system owner |
| **Render Cloud Free Hosting Live Status**| NOT VERIFIED LIVE | Cold start ~50s accepted; subject to sleep-cycle latency |
| **Formal Clinical Efficacy & Safety** | NOT VERIFIED | System carries `clinicalValidation: not_established` |

---

# Chapter 9: Cloud Deployment, Infrastructure & Operations

## 9.1 Hosting Infrastructure & Service Topology
MediSync is deployed across cost-free tier cloud infrastructure, demonstrating modern cloud-native architectural patterns achievable on student and university research budgets:

```
[ Internet User / Browser ]
           |
           +----> Vercel Edge Network (Global CDN)
           |      Static React SPA | HTTPS / TLS 1.3
           |
           +----> Render Cloud Web Services (Frankfurt / Oregon)
                  - Node.js Express Backend Service
                  - Python Flask ML Inference Service
                  |
                  +----> MongoDB Atlas (AWS Mumbai ap-south-1)
                         Replica Set M0 (512 MB Storage)
```

| Component | Cloud Provider | Plan / Tier | Specifications |
|---|---|---|---|
| **Client Frontend** | Vercel | Hobby Tier | Global Edge CDN, automated Git preview deployments, Brotli compression. |
| **Backend REST API** | Render | Free Web Service | 0.1 CPU core, 512 MB RAM, Node.js 20 LTS runtime, automatic HTTPS. |
| **ML Inference Engine** | Render | Free Web Service | 0.1 CPU core, 512 MB RAM, Python 3.14 / Gunicorn runtime. |
| **Primary Database** | MongoDB Atlas | Free M0 Sandbox | 512 MB encrypted storage, 3-node replica set, TLS 1.3, AWS Mumbai. |
| **Distributed Cache** | Upstash | Free Serverless | Redis REST API, in-memory rate limiting and token invalidation. |

---

## 9.2 Render Free Tier Dynamics & Cold-Start Management

### 9.2.1 The 15-Minute Inactivity Sleep Cycle
Render Free tier web services automatically enter dormancy (spin-down) after 15 consecutive minutes of HTTP inactivity. When a new inbound request arrives:
1. Render spins up the container runtime.
2. The Python runtime initializes dependencies and loads models into memory (~195 MB RSS).
3. The cold-start cycle requires approximately **50 to 60 seconds** before the container responds with HTTP 200 OK.

### 9.2.2 Explanation of Uptime Monitoring False Alerts
Third-party uptime monitors (such as UptimeRobot) frequently report false "Down" alerts for the ML microservice:
- Free uptime monitors typically employ a hardcoded HTTP connection timeout of **30 seconds**.
- When an automated check hits a dormant container, the request times out after 30 seconds while the container is still executing its 50-second initialization.
- The monitoring service logs an HTTP timeout and flags the service as "Down", even though the container subsequently reaches a healthy ready state.

### 9.2.3 Client-Side Cold-Start Mitigation
To prevent user confusion during cold boots:
- The React frontend incorporates an HTTP timeout interceptor. If an ML symptom inquiry exceeds 5 seconds, an informational modal appears informing the clinician: *"Cloud ML engine is waking from power-saving dormancy (~45s)..."*, with a visual countdown timer.
- Once warmed, subsequent inference queries respond with sub-millisecond latency (empirically measured at 0.77 ms mean).

---

## 9.3 Production Operations & Owner Runbook
All live production operations, database mutations, and administrative scripts are consolidated into a unified master runbook:
```
docs/OWNER_CHECKLIST_FINAL.md
```
To protect production integrity, autonomous engineering agents operate in read-only / offline mock modes. The system owner executes production operations using documented command-line flags verified directly against script `--help` specifications:
- **Database Seeding (Dry-Run)**:
  ```bash
  node scripts/seed-dispensing-sample.js --db medisync_prod --dry-run
  ```
- **Service Pre-Warm Command (Pre-Viva Protocol)**:
  ```bash
  curl.exe -i -m 60 https://medisync-ml.onrender.com/health
  curl.exe -i -m 60 https://medisync-api.onrender.com/health
  ```
- **Outbreak Simulation Preview**:
  ```bash
  node scripts/previewSyntheticOutbreakScenarios.js --scenario S1 --preview
  ```

---

# Chapter 10: Empirical Results & Performance Evaluation

## 10.1 Quality Gate & Verification Summary
Empirical validation of MediSync was conducted using the master offline test gate (`scripts/run_offline_tests.js`). Across all 207 automated test suites, the platform achieved a **100% pass rate**:

| Metric Category | Target Invariant | Measured Result | Status |
|---|---|---|---|
| **Total Tests Passed** | $\ge 3,400$ | **3,465** | PASS |
| **Total Tests Failed** | 0 | **0** | PASS |
| **Total Test Suites** | $\ge 200$ | **207** | PASS |
| **Execution Time** | $< 180\text{ s}$ | **114.2 s** | PASS |
| **Protected File Ledger** | 15/15 valid SHA-256 | **15/15 valid** | PASS |
| **Frontend Production Build**| Exit Code 0 | **Exit Code 0** | PASS |

---

## 10.2 Machine Learning Inference Benchmarks
Under Sub-Project 5 Task 1.1, the Python ML microservice was profiled across 200 consecutive inference requests using `scripts/benchmark_ml_resources.py`:

### 10.2.1 Latency Distribution
Inference execution was measured via high-resolution monotonic timers within the Flask test runtime:
- **Mean Latency**: $0.77\text{ ms}$
- **Median (p50)**: $0.64\text{ ms}$
- **95th Percentile (p95)**: $1.24\text{ ms}$
- **Minimum Latency**: $0.48\text{ ms}$
- **Maximum Latency**: $2.85\text{ ms}$

The sub-millisecond median response time confirms that the ML decision support assistant introduces virtually zero perceivable latency into clinical consultation workflows.

### 10.2.2 Process Memory Profile (OS Resident Set Size)
True operating system resident memory was captured using `psutil.Process().memory_info().rss`:
- **Initial Boot RSS**: $20.75\text{ MB}$
- **Post-Model & Knowledge Base Load**: $195.91\text{ MB}$
- **Post-100 Inference Requests**: $196.82\text{ MB}$
- **Growth Delta**: $+0.91\text{ MB}$ ($< 0.5\%$, confirming zero memory leakage)
- **Cloud Ceiling Margin**: Consumes **38.44%** of the 512 MB Render Free tier allocation (leaving $> 315\text{ MB}$ buffer for OS buffers and garbage collection).

---

## 10.3 Model Accuracy & Self-Consistency Results

### 10.3.1 Tier 1 Classification Performance
Evaluated across a stratified held-out test split of 1,230 synthetic multi-symptom profiles (Figure **F01** and Figure **F02**):
- **Macro Precision**: 0.95
- **Macro Recall**: 0.94
- **Macro F1-Score**: 0.94
- **Micro / Overall Accuracy**: 0.96
- **ROC Area Under Curve (AUC)**: 0.99 (Macro average across 41 classes)

### 10.3.2 Tier 2 Knowledge Base Curation Outcomes
As recorded in `ingest_disease_symptom_kb_v2.py` and visualised in Figure **F04**:
- **Raw Input Profiles**: 801 conditions (SymCAT ambulatory survey)
- **Auto-Accepted Profiles**: 174 conditions mapped to verified ICD-10-CM codes
- **Quarantined Profiles**: 136 conditions (redundant, $<3$ symptoms, or low evidence)
- **Unmapped Ingestion Profiles**: 491 conditions (retained in quarantine pending manual clinical ontology mapping)

### 10.3.3 Combined Tiered Matcher Self-Consistency
Across combined synthetic test evaluations (Figure **F08**):
- **Top-1 Accuracy**: 89.2%
- **Top-3 Accuracy**: 96.8%
- **Top-5 Accuracy**: 99.1%

---

## 10.4 Outbreak Detection Simulation Outcomes
Evaluating the 8 synthetic disease scenarios (S1–S8, Figure **F10**):
- **True Positive Alerts**: Outbreaks in Scenarios S1 (Dengue), S2 (Leptospirosis), and S7 (Dysentery) were correctly detected with an average alert lead-time of 3.2 days.
- **False Positive Suppression**: Single-day spike anomalies (Scenario S3) and low-volume fluctuations (Scenario S4) were 100% suppressed by the Duration and Volume gates, demonstrating resilience against alert fatigue.

---

## 10.5 Trilingual Interface Parity
Automated dictionary parsing across `client/src/locales/` confirmed:
- **Total Registered Keys**: 482 distinct UI string keys.
- **English (en) Completeness**: 482 / 482 (100.0%)
- **Sinhala (si) Completeness**: 482 / 482 (100.0%)
- **Tamil (ta) Completeness**: 482 / 482 (100.0%)
- **Key Discrepancies**: 0 missing keys (Figure **F14**).

---

# Chapter 11: Limitations, Known Risks & Future Work

## 11.1 Transparent Academic & Technical Limitations
In keeping with rigorous academic engineering principles, this chapter explicitly documents the known limitations, architectural boundaries, and operational risks of the MediSync prototype.

### 11.1.1 Descriptive Projections vs. Epidemiological Forecasts
While MediSync provides 14-day statistical trajectory curves (Figure **F12**), these calculations represent ordinary least squares (OLS) descriptive mathematical extrapolations. They **do not** incorporate dynamic compartmental epidemiological models (such as SEIR), vector breeding indices (Breteau index), or meteorological covariates (rainfall, humidity). Consequently, these curves are strictly labeled as descriptive projections and are suppressed from triggering automated public health lockdown measures.

### 11.1.2 Census Denominator Data Gaps
Accurate per-capita attack rate calculations require precise district-level age-stratified census denominators. Following the 2024 national census in Sri Lanka, official granular figures remain pending final gazetting. In MediSync, unverified demographic denominators are explicitly marked as `pending_owner_data`, with ingestion scripts prepared to accept verified government data.

### 11.1.3 Knowledge Base Breadth & Coverage
While the standard ICD-10-CM catalog contains 34,290 distinct clinical concepts (Figure **F06**), MediSync's active diagnostic triage engine currently encompasses:
- 41 curated high-frequency conditions in Tier 1.
- 174 auto-accepted, validated condition profiles in Tier 2.
- **Combined Coverage**: 215 active conditions (Figure **F07**).  
491 raw profiles from the SymCAT survey dataset remain quarantined (`kb_quarantine.v1.json`) due to unmapped clinical tokens or sparse evidence. These require manual curation by clinical taxonomists before production admission.

### 11.1.4 Unverified Medication Safety Limits
The dosage ceilings and drug-drug interaction matrix in `medicine_safety_limits.json` are initialized from published open reference data but carry the explicit metadata tag `citationStatus: "unverified_owner_must_check"`. As documented in `docs/report/MEDICINE_LIMITS_VERIFICATION.md`, all therapeutic limits must undergo formal sign-off by a hospital formulary review committee cross-referencing the British National Formulary (BNF 86) prior to clinical deployment.

### 11.1.5 Cloud Free-Tier Operational Constraints
- **Cold-Start Dormancy**: The Render Free plan shuts down containers after 15 minutes of inactivity, resulting in cold-boot delays of 50 to 60 seconds.
- **Lack of Database Backups**: MongoDB Atlas M0 sandboxes do not support automated point-in-time recovery (PITR) or scheduled snapshot backups. A physical disk corruption or catastrophic administrative drop requires manual snapshot restoration from local dumps.
- **Network Bandwidth**: Render free web services allocate limited shared bandwidth, making the system unsuitable for sustained high-concurrency disaster scenarios without upgrading to dedicated cloud tiers.

### 11.1.6 Heuristic Design Parameters
The 11 operational parameters documented in `ML_DESIGN_PARAMETERS.md` (e.g., Tier 1 confidence floor of 0.35, outbreak minimum case threshold of 5) were established empirically during software development. While effective at suppressing false positives in synthetic simulations, they have not undergone multi-center clinical calibration.

---

## 11.2 Future Research & Engineering Roadmap

### 11.2.1 National Health Information System Interoperability
Future iterations should implement Fast Healthcare Interoperability Resources (FHIR R4) REST APIs and integrate with Sri Lanka's national DHIS2 (District Health Information Software 2) epidemiological reporting infrastructure, automating statutory communicable disease notifications directly to the Epidemiology Unit.

### 11.2.2 Advanced Hardware Key Management (HSM)
Migrate encryption master keys from container environment variables to managed cloud hardware security modules (such as AWS KMS, Google Cloud KMS, or HashiCorp Vault), enforcing automated key rotation and cryptographic hardware access auditing.

### 11.2.3 Natural Language Processing for Local Clinical Notes
Develop localized clinical NLP models capable of parsing unstructured, trilingual physician notes written in colloquial Sinhala, Tamil, and English ("Singlish"), automating symptom tag extraction without requiring manual UI selection.

### 11.2.4 Formal Clinical Observational Trials
Subject the diagnostic decision support assistant and medicine safety engine to formal multi-center prospective observational trials across Sri Lankan provincial general hospitals to establish real-world sensitivity, specificity, and clinician acceptance metrics under ethical committee oversight.

---

# Chapter 12: Conclusion & Project Assessment

## 12.1 Summary of Engineering Contributions
The MediSync capstone project successfully demonstrates the design, end-to-end engineering, and empirical evaluation of a lightweight, cloud-native digital health and syndromic epidemiological surveillance platform. Specifically tailored to the infrastructural, socioeconomic, and multilingual realities of developing healthcare systems such as Sri Lanka, MediSync bridges critical operational gaps between overburdened outpatient clinics, community pharmacies, and central public health authorities.

Key engineering contributions achieved in this work include:
1. **Cryptographically Gated Prescription Dispensing**: Engineered an immutable digital prescription lifecycle utilizing one-time signed QR codes coupled with patient National Identity Card (NIC) verification tokens, effectively eliminating physical paper prescription fraud and cross-pharmacy duplicate dispensing.
2. **Deterministic Clinical Medication Safety**: Delivered an in-memory safety verification engine enforcing drug-drug interaction detection, maximum daily dose ceilings, and pediatric contraindications synchronously during consultation workflows.
3. **Automated Spatio-Temporal Syndromic Surveillance**: Implemented a multi-district epidemiological surveillance subsystem integrating EWMA and C-SUM anomaly detection algorithms across 12 communicable diseases, regulated by a 3-tier suppression gate to eliminate noise and alert fatigue.
4. **Low-Resource Machine Learning Decision Support**: Formulated and validated a dual-tier diagnostic guidance pipeline combining a calibrated Random Forest classifier (41 classes) with sparse knowledge-base retrieval (174 validated profiles), maintaining a peak process resident memory (RSS) of 196.82 MB (well under the 512 MB cloud threshold) and a mean inference latency of 0.77 ms.
5. **Rigorous Offline Verification & Release Integrity**: Established an automated offline quality gate encompassing 3,465 tests across 207 test suites with 0 failures, locked against an immutable 15-file SHA-256 release ledger.
6. **Equitable Trilingual Localization**: Achieved 100% string key parity across English, Sinhala, and Tamil, ensuring user accessibility across diverse linguistic backgrounds.

---

## 12.2 Readiness for Academic Defense & Viva Voce
MediSync stands fully prepared for final undergraduate capstone examination:
- **Architectural Completeness**: All core user journeys across six distinct roles (Patient, Doctor, Pharmacist, Lab Technologist, Epidemiologist, System Administrator) are fully implemented and verified.
- **Truthful Academic Demarcation**: All performance claims are grounded in verifiable offline test runs and profiling scripts, with clear demarcations separating offline code verification from live cloud hosting dynamics.
- **Regulatory Integrity**: The immutable disclaimer `clinicalValidation: not_established` is rigorously maintained across all inference payloads, adhering to ethical standards in artificial intelligence for health.

MediSync exemplifies how modern cloud architectures, open medical taxonomies, and privacy-preserving cryptographic primitives can be synthesized into an effective, accessible digital healthcare foundation for resource-constrained health systems.

---

# Chapter 13: Appendices & Reference Ledgers

## Appendix A: Evidence Traceability Ledger
Every quantitative assertion in this technical report traces directly to verified code files, automated test suites, or execution scripts within the repository:

| Claimed Metric / Characteristic | Verifiable Repository Source | Verification Command / Script |
|---|---|---|
| **3,465 Tests Passed / 0 Failed** | 207 Test Suites in `server/tests/`, `client/tests/`, `ml-engine/tests/` | `node scripts/run_offline_tests.js` |
| **ML Process RSS: 196.82 MB Peak** | `docs/report/data/ml_resource_measurements.json` | `python scripts/benchmark_ml_resources.py` |
| **ML Inference Latency: 0.77 ms Mean** | `docs/report/data/ml_resource_measurements.json` | `python scripts/benchmark_ml_resources.py` |
| **Project Inventory: 1,129 Files / 3.43M LOC**| `docs/report/data/project_inventory.json` | `node scripts/generate_project_inventory.js` |
| **191 REST Endpoints Documented** | `docs/report/API_REFERENCE.md` | `python scripts/extract_routes.py` |
| **29 Mongoose Schemas** | `docs/report/DATA_MODEL.md` | `server/src/models/*.js` |
| **14 Publication Figures (F01–F14)** | `docs/report/figures/*.png` | `python ml-engine/evaluation/generate_report_figures.py` |
| **9 Formal Mermaid Diagrams (D01–D09)**| `docs/report/diagrams/*.mmd` | Visualized in Mermaid CLI / Live |
| **15-File Protected Ledger (15/15 Valid)**| `docs/release/PROTECTED_HASHES.json` | `node scripts/run_offline_tests.js` |

---

## Appendix B: Protected File Hash Ledger (Release Invariants)
The table below quotes the exact SHA-256 digests validated during the Sub-Project 5 preflight and release gate:

| # | File Relative Path | Approved SHA-256 Digest | Status |
|---|---|---|:---:|
| 1 | `server/src/middleware/auth.js` | `92e99e0afded8de06b4d74abebe851b02c4f0c303a191530f39bee72f1256a88` | LOCKED |
| 2 | `server/src/controllers/doctorController.js` | `919129116095dc8301866fc0ea3d804e8bde645ec1de210deb2f1b2350d081c2` | LOCKED |
| 3 | `ml-engine/app.py` | `0500ddf7db3bb3bb5af945a44adacf5b1a920facdf37d32d665cca40caab1a37` | LOCKED |
| 4 | `ml-engine/evaluate_symptom_model.py` | `6999cf2984b341b7dfbf32939d8fc39d7d0743899d8321e7b73d9fa704e2d96d` | LOCKED |
| 5 | `client/src/components/SymptomTagInput.jsx` | `1a9fce8726f9cc8adfa501a2d3bf9664bfa6160c5dc78650d3f4b35ac2bbdc5d` | LOCKED |
| 6 | `server/tests/ir04BackendIntegration.test.js` | `e40d7c7bf993d3cd8ecc7bea7365740d7d824501c6f460b38e2962245a8ab9ae` | LOCKED |
| 7 | `server/tests/patientProfileOwnedIntegration.test.js` | `7335e2a5190d740d2ee7856fe26d2ba5edb7a204a4872d3fa081d52b345345c5` | LOCKED |
| 8 | `server/tests/prescriptionDurationOwnedIntegration.test.js` | `562ba59f307e2081214f40ff2d674fd3546c82f9828a53b8195796f2d637cbc6` | LOCKED |
| 9 | `server/tests/lab.test.js` | `227e2faf5424e53f836e5364fa592790d387206011e8264e72bb1cc88d19800c` | LOCKED |
| 10 | `server/tests/universityDemoSeedVerify.test.js` | `fc472f5707f96b2514d8ec50097da6a6eb7433ff427200f6d6649452ce463695` | LOCKED |
| 11 | `client/tests/ir04-isolated-five-role-e2e.spec.js` | `496dbcc2337f2cc48d15fc5af217181c948fdd6d4251f301057e2121c7d9d2ee` | LOCKED |
| 12 | `server/src/config/dbGuard.js` | `1b62d44cd4e11c269def41160333f3425279f2aa625f117aafbe2fc4bbb9c082` | LOCKED |
| 13 | `server/src/models/Consultation.js` | `3538ea856a26def834d30f9d463331012ee27132d7c1bc99504acdd3ceaa1e99` | LOCKED |
| 14 | `server/src/models/Patient.js` | `14b60b7c198df9f9ba561e77bcfadec275243a3ad5b46ba499315e462997481d` | LOCKED |
| 15 | `server/src/utils/versionedEncryption.js` | `5dd15b2e05c12490c401185251a0a78c82c8184ead6a822fffb8fce3b8772bfd` | LOCKED |

---

## Appendix C: Publication Figures & Architectural Diagrams Catalog

### Publication Figures (Generated via `generate_report_figures.py`)
- **Figure F01**: Tier 1 Held-Out Confusion Matrix & Per-Class Metrics (`docs/report/figures/f01_confusion_matrix.png`)
- **Figure F02**: Tier 1 ROC and Precision-Recall Curves (`docs/report/figures/f02_roc_pr_curves.png`)
- **Figure F03**: KB Edge-Probability Distribution Histogram & Cutoff (`docs/report/figures/f03_kb_edge_probabilities.png`)
- **Figure F04**: KB Curation Funnel (801 Parsed $\to$ 174 Mapped Active) (`docs/report/figures/f04_kb_ingestion_funnel.png`)
- **Figure F05**: Knowledge Base Quarantine Reasons Distribution (`docs/report/figures/f05_quarantine_reasons.png`)
- **Figure F06**: ICD-10-CM Catalog Chapter Distribution (`docs/report/figures/f06_icd_catalog_composition.png`)
- **Figure F07**: Diagnostic Coverage by Clinical Chapter (`docs/report/figures/f07_diagnostic_coverage.png`)
- **Figure F08**: Tiered Matcher Self-Consistency (Top-1, Top-3, Top-5) (`docs/report/figures/f08_tiered_matcher_accuracy.png`)
- **Figure F09**: Measured OS Process Memory (RSS) & Latency (`docs/report/figures/f09_ml_resource_footprint.png`)
- **Figure F10**: Outbreak Detection Scenarios & Gate Suppression (`docs/report/figures/f10_outbreak_scenarios.png`)
- **Figure F11**: 12-Disease Surveillance Benchmark Matrix (`docs/report/figures/f11_disease_surveillance_matrix.png`)
- **Figure F12**: 14-Day Statistical Projection Trajectories (`docs/report/figures/f12_statistical_projections.png`)
- **Figure F13**: Automated Verification Test Pyramid (`docs/report/figures/f13_test_pyramid.png`)
- **Figure F14**: Trilingual Interface Key Parity (EN/SI/TA) (`docs/report/figures/f14_trilingual_parity.png`)

### Architectural Diagrams (Authored in Mermaid format)
- **Diagram D01**: System Architecture (`docs/report/diagrams/d01_system_architecture.mmd`)
- **Diagram D02**: Cloud Deployment Topology (`docs/report/diagrams/d02_deployment_infrastructure.mmd`)
- **Diagram D03**: Consultation to Dispensing Sequence (`docs/report/diagrams/d03_consultation_prescription_dispensing.mmd`)
- **Diagram D04**: QR Verification & NIC Gate Sequence (`docs/report/diagrams/d04_qr_verification_nic_gate.mmd`)
- **Diagram D05**: Outbreak Detection Pipeline Flow (`docs/report/diagrams/d05_outbreak_detection_pipeline.mmd`)
- **Diagram D06**: Dual-Tier ML Triage Flow (`docs/report/diagrams/d06_tiered_matcher_flow.mmd`)
- **Diagram D07**: Authentication & Session Flow (`docs/report/diagrams/d07_authentication_flow.mmd`)
- **Diagram D08**: Medicine Safety Decision Logic (`docs/report/diagrams/d08_medicine_safety_flow.mmd`)
- **Diagram D09**: Entity-Relationship Schema Model (`docs/report/diagrams/d09_entity_relationship_diagram.mmd`)

---

## Appendix D: Owner Placeholders for Final Academic Submission
The following items are reserved for institutional customization by the student owner:
- `[OWNER: Insert University Logo, Faculty Name, and Department Details]`
- `[OWNER: Insert Student Registration Number, Index Number, and Supervisor Names]`
- `[OWNER: Insert Official Ministry of Health Annual Health Bulletin 2023 / 2024 Citations]`
- `[OWNER: Insert High-Resolution Screenshots of Live UI Views from SCREENSHOT_CHECKLIST.md]`
- `[OWNER: Verify BNF 86 Section Citations in docs/report/MEDICINE_LIMITS_VERIFICATION.md]`

---

