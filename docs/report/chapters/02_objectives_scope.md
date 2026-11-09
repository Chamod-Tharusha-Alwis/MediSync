# Chapter 2: Objectives and Project Scope

## 2.1 Primary Objectives
The primary engineering objective of the MediSync platform is to design, develop, and empirically verify an end-to-end cloud-native clinical management and surveillance platform. Specifically:
1. **Secure Patient Record Management**: Implement an encrypted, role-segregated electronic patient dossier supporting demographic capture, clinical history, longitudinal consultation logs, and laboratory investigation records.
2. **Cryptographic Prescription & Dispensing Lifecycle**: Engineer a tamper-evident prescription issuance and fulfillment pipeline featuring one-time QR verification tokens, National Identity Card (NIC) validation gates, and durable anti-duplicate dispensing records.
3. **Automated Clinical Medication Safety**: Construct an in-memory, deterministic drug safety verification engine enforcing multi-drug interaction checking, maximum daily dose ceilings, active allergy conflicts, and course duration limits.
4. **Real-time Spatio-temporal Epidemiological Surveillance**: Develop an automated surveillance subsystem that processes clinical encounter diagnoses across Sri Lanka's 25 administrative districts, identifies statistical anomalies using a 7-day window vs. 56-day baseline, and triggers early outbreak warning alerts with multi-gate noise suppression ($N \ge 5$, 2 consecutive days, $z > 2.0$).
5. **Low-Footprint Machine Learning Triage**: Train, calibrate, and serve a dual-tier symptom-based differential guidance model (TF-IDF cosine similarity in Tier 1 and sparse KB retrieval in Tier 2) operating under 200 MB process RSS and sub-5 ms latency on resource-constrained cloud infrastructure.
6. **Trilingual Localization**: Deliver complete interface parity across English, Sinhala (සිංහල), and Tamil (தமிழ்) to ensure equitable accessibility across Sri Lanka's multilingual clinical workforce.

## 2.2 Secondary Objectives
1. **Zero-Trust Access Control**: Enforce granular role-based access control (RBAC) across six distinct user archetypes with automated session invalidation and audit logging.
2. **Offline-First Deterministic Verification**: Establish an exhaustive automated test pyramid (unit, integration, end-to-end, security) runnable completely offline without cloud or live database dependencies.
3. **Tamper-Resistant Ledger Protection**: Institute cryptographic SHA-256 baseline hashing across core security, authentication, and clinical calculation files to protect critical release invariants.

## 2.3 Scope and System Boundaries

### 2.3.1 In-Scope Deliverables
- **Core Clinical Workflows**: Patient registration and medical timeline review, physician clinical encounter capture with NIC-gated consent, digital prescription authoring, public QR capability verification, and atomic pharmacy dispensing.
- **Laboratory Subsystem**: Lab test ordering, PDF report uploads, automated file validation (magic byte and MIME verification), and clinician review queues.
- **Security & Privacy Infrastructure**: Field-level AES-256-GCM encryption for patient PII and clinical notes, blind indexing for demographic search, and time-to-live (TTL) ephemeral tokens for session authentication.
- **Epidemiological Engine**: District-level spatial tracking, cross-chapter communicable disease surveillance models, 14-day projection pipelines, and automated outbreak alert generation.
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
