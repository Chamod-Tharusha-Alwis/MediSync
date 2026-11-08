# MediSync: Final Capstone Presentation Slide Deck Outline (19 Slides)

This outline provides the slide structure, visual layout recommendations, and detailed speaker notes for the final undergraduate capstone viva presentation (15–20 minutes).

---

### Slide 1: Title & Project Metadata
- **Slide Title**: MediSync: Cloud-Native Digital Health & Real-Time Syndromic Surveillance Platform
- **Subtitle**: An Integrated Healthcare Information Architecture for Developing Health Ecosystems
- **Presenter**: [OWNER: Student Full Name] ([OWNER: Student Registration / Index Number])
- **Supervisors**: [OWNER: Academic Supervisor Name], [OWNER: Co-Supervisor / Industrial Mentor Name]
- **Department**: Faculty of Computing / Department of Software Engineering, [OWNER: University Name]
- **Date**: November 2026
- **Speaker Notes**:
  > *"Good morning respected examiners and supervisors. Today I am pleased to present MediSync—an enterprise-grade digital health and real-time syndromic surveillance platform designed specifically for the operational realities of healthcare delivery in Sri Lanka."*

---

### Slide 2: Problem Statement & Sri Lankan Healthcare Context
- **Visuals**: Diagram contrasting the overburdened OPD clinic environment with paper prescription lifecycle risks.
- **Key Points**:
  - Dual-track healthcare: Free universal public healthcare + private out-of-pocket sector.
  - High OPD volume: Physicians evaluate 40–80 patients/hour ($< 90\text{ s}$ per consultation).
  - Paper prescription vulnerabilities: Fraudulent alterations, illegibility, and unmonitored "pharmacy hopping" duplicate dispensing.
  - Delayed surveillance: Paper-based epidemic notification (Form H-544) takes weeks to reach the Epidemiology Unit.
- **Speaker Notes**:
  > *"In Sri Lanka, despite achieving remarkable health outcomes, public outpatient departments face immense pressure. A single doctor often sees up to 80 patients an hour. Prescriptions remain on paper, making duplicate dispensing of habit-forming medications easy and untraceable. Furthermore, communicable disease reporting relies on postal cards, meaning outbreak interventions often lag weeks behind transmission."*

---

### Slide 3: Project Vision & Core Objectives
- **Visuals**: Four pillar icons: Secure Clinical EMR, Anti-Fraud Dispensing, Real-Time Surveillance, Low-Cost ML Triage.
- **Key Points**:
  1. Immutable digital prescriptions with cryptographic QR tokens and National Identity Card (NIC) verification gates.
  2. Zero-latency in-memory medication safety engine (drug interactions and dosage ceilings).
  3. Real-time spatio-temporal disease tracking across Sri Lanka's 25 administrative districts.
  4. Ultra-lightweight ML symptom decision support operating under a 200 MB memory footprint.
  5. 100% trilingual interface parity across English, Sinhala, and Tamil.
- **Speaker Notes**:
  > *"MediSync was engineered to solve these exact challenges through four integrated pillars: zero-trust clinical records, tamper-proof prescription fulfillment, automated outbreak detection across all 25 districts, and lightweight AI triage optimized for zero-cost cloud infrastructure."*

---

### Slide 4: System Architecture & Deployment Topology
- **Visuals**: Mermaid Diagram **D01** / **D02** showing React SPA on Vercel Edge, Express API and Flask ML on Render, MongoDB Atlas, and Upstash Redis.
- **Key Points**:
  - Decoupled Service-Oriented Architecture (SOA).
  - Microservice isolation: ML engine decoupled from primary clinical transaction gateway.
  - Internal HMAC-SHA-256 service-to-service authentication.
  - Managed persistence: MongoDB Atlas replica sets with field-level encryption at rest.
- **Speaker Notes**:
  > *"The architecture follows a decoupled service-oriented pattern. The React single-page application is hosted globally on Vercel's edge CDN. The Node.js Express application gateway manages business logic, while the Python Flask ML service runs in complete isolation, communicating via internal HMAC-authenticated tokens."*

---

### Slide 5: Zero-Trust Security, Field Encryption & Privacy
- **Visuals**: Diagram illustrating AES-256-GCM cipher payload structure and HMAC blind indexing.
- **Key Points**:
  - Sri Lanka Personal Data Protection Act No. 9 of 2022 (PDPA) compliance.
  - AES-256-GCM authenticated field encryption for all patient PII and clinical notes.
  - HMAC-SHA-256 Blind Indexing (`nic_bi`) for deterministic $O(1)$ database searches without decryption.
  - Ephemeral database engine TTL indexes (OTPs drop in 300s, recovery tokens in 900s).
  - Append-only immutable security audit logs.
- **Speaker Notes**:
  > *"To ensure compliance with the Sri Lanka Personal Data Protection Act, we implement field-level AES-256-GCM authenticated encryption. Searchable identifiers like National Identity Card numbers use salted blind indexes, allowing instant lookup without ever decrypting the entire database. If an adversary steals our database, all patient names, IDs, and notes remain encrypted."*

---

### Slide 6: Clinical Workflow: Consultation & Appointment Lifecycle
- **Visuals**: Screenshots **SS-09** and **SS-10** showing OPD queue, vitals entry, and ICD-10 selection.
- **Key Points**:
  - Instant OPD queue progression for fast clinic throughput.
  - Vitals capture: Blood pressure, pulse, temperature, oxygen saturation.
  - WHO ICD-10-CM clinical catalog integration (34,290 searchable concepts).
  - Multi-document transactional atomicity.
- **Speaker Notes**:
  > *"The consultation workflow is tailored for high-speed clinical encounters. Doctors can view their waiting queue, record vitals, and link standardized ICD-10 disease codes with minimal clicks."*

---

### Slide 7: Machine Learning Triage: Dual-Tier Architecture
- **Visuals**: Figure **F08** (Tiered Matcher Accuracy) and Diagram **D06** (Tiered Matcher Flow).
- **Key Points**:
  - **Tier 1 (High Confidence)**: Calibrated Random Forest (100 trees, 41 curated South Asian disease classes, Macro F1 = 0.94).
  - **Tier 2 (Broad Coverage)**: Sparse Knowledge Base retrieval (174 validated SymCAT conditions mapped to ICD-10-CM).
  - Blended inference logic: Confidence floor of 0.35 gates fallback to Tier 2.
  - Combined accuracy: Top-1 = 89.2%, Top-3 = 96.8%, Top-5 = 99.1%.
- **Speaker Notes**:
  > *"To provide broad clinical coverage without bloating memory, we engineered a Dual-Tier triage pipeline. Tier 1 uses a calibrated Random Forest covering 41 high-frequency tropical conditions with 94% Macro F1. If confidence falls below 35%, the engine falls back to Tier 2 sparse knowledge-base retrieval across 174 additional conditions."*

---

### Slide 8: ML Resource Benchmarks & Latency Profiling
- **Visuals**: Figure **F09** (Process RSS and Latency Distribution).
- **Key Points**:
  - Measured true OS process Resident Set Size (RSS) via `psutil`:
    - Boot: 20.75 MB | Post-Model Load: 195.91 MB | Post-100 Queries: 196.82 MB.
    - Consumes **38.44%** of the 512 MB Render Free container ceiling.
  - Latency: Mean $0.77\text{ ms}$, Median $0.64\text{ ms}$, 95th Percentile $1.24\text{ ms}$.
- **Speaker Notes**:
  > *"We rigorously measured true operating system memory using psutil. Total process memory stabilizes at 196.82 MB—comfortably beneath the 512 MB free-tier limit. Inference latency averages just 0.77 milliseconds, ensuring zero lag for the examining doctor."*

---

### Slide 9: Regulatory Positioning & Ethical AI Boundaries
- **Visuals**: Screenshot **SS-11** displaying the amber banner: `clinicalValidation: not_established`.
- **Key Points**:
  - University capstone prototype evaluated on synthetic distributions.
  - Mandatory system payload tag: `clinicalValidation: not_established`.
  - Non-autonomous AI: Acts strictly as an advisory clinical decision aid.
  - Medical practitioner retains complete legal and clinical autonomy.
- **Speaker Notes**:
  > *"We emphasize strict academic truthfulness: MediSync is an engineering prototype evaluated on synthetic data. Every ML response carries an immutable 'clinicalValidation: not_established' attribute, accompanied by visual UI disclaimers. It is an assistive aid, never an autonomous diagnostic authority."*

---

### Slide 10: Deterministic Clinical Medication Safety Engine
- **Visuals**: Diagram **D08** (Medicine Safety Flow) and Screenshot **SS-13** (Drug Interaction Modal).
- **Key Points**:
  - Zero-latency synchronous evaluation on the backend API server.
  - Pairwise drug-drug interaction matrix (e.g., Warfarin + Ciprofloxacin $\to$ Severe bleeding alert).
  - Maximum single and cumulative adult daily dose ceilings (e.g., Paracetamol max 4g/24h).
  - Renal and hepatic contraindication prompts.
  - Documented BNF 86 / WHO audit status (`unverified_owner_must_check`).
- **Speaker Notes**:
  > *"Prescriptions are checked synchronously before finalization. The deterministic safety engine catches dangerous drug-drug interactions and dosage limit overages instantly without making external network calls."*

---

### Slide 11: Cryptographic Prescriptions & QR Dispensing Gate
- **Visuals**: Screenshots **SS-07**, **SS-16**, and **SS-18** (Prescription QR, NIC Input Gate, Duplicate Block).
- **Key Points**:
  - One-time dynamic HMAC-signed QR token issued to patient.
  - Identity verification gate: Pharmacist must input patient's physical National Identity Card (NIC).
  - Server confirms NIC blind index equality before unlocking dispensing.
  - Atomic database status transition to `dispensed`.
  - Instant blocking alert if presented a second time at any pharmacy.
- **Speaker Notes**:
  > *"To eliminate paper prescription fraud, prescriptions carry dynamic cryptographic QR codes. When presented at a pharmacy, the pharmacist must verify the patient's physical NIC number. Once dispensed, the transaction commits atomically. Any subsequent attempt to fill the same prescription at another pharmacy is instantly blocked."*

---

### Slide 12: Laboratory Subsystem & Secure File Ingestion
- **Visuals**: Screenshot **SS-20** (Lab Upload Modal).
- **Key Points**:
  - End-to-end investigation ordering and report retrieval.
  - Three-layer file upload defense:
    1. Extension whitelist (`.pdf` only).
    2. MIME-type validation (`application/pdf`).
    3. Binary magic byte inspection: Verifies first 5 bytes match `%PDF-` (`0x25 0x50 0x44 0x2D`).
  - Quarantined storage with UUID naming to prevent path traversal.
- **Speaker Notes**:
  > *"Our laboratory subsystem protects against polyglot script attacks by inspecting the physical file stream for PDF binary magic bytes before accepting uploaded investigation reports."*

---

### Slide 13: Real-Time Spatio-Temporal Syndromic Surveillance
- **Visuals**: Figure **F10** (Outbreak Scenarios) and Figure **F11** (Surveillance Benchmark Matrix).
- **Key Points**:
  - Continuous district-level aggregation across Sri Lanka's 25 districts.
  - Dual statistical anomaly detection: EWMA (moving baseline) and C-SUM (cumulative deviation).
  - **Three-Tier Alert Noise Suppression Gate**:
    - Volume Gate ($n \ge 5\text{ cases}$).
    - Duration Gate ($d \ge 3\text{ consecutive days}$).
    - Statistical Gate ($z\text{-score} \ge +2.5\sigma$).
  - 14-day descriptive statistical projections with confidence intervals.
- **Speaker Notes**:
  > *"For disease surveillance, MediSync aggregates clinical diagnoses across all 25 districts in real time. Using EWMA and C-SUM algorithms, outbreaks are detected in days rather than weeks. Crucially, our 3-tier suppression gate filters out isolated spikes, preventing false alarms."*

---

### Slide 14: Trilingual Localization (English, Sinhala, Tamil)
- **Visuals**: Figure **F14** (Trilingual Parity Chart) and screenshots **SS-01**, **SS-02**, **SS-03**.
- **Key Points**:
  - Complete language parity across English, Sinhala (සිංහල), and Tamil (தமிழ்).
  - 482 distinct UI keys tested; zero missing string discrepancies ($A \triangle B = \emptyset$).
  - Dynamic client-side language switching without page refresh.
- **Speaker Notes**:
  > *"Healthcare accessibility requires native language support. MediSync provides 100% string parity across English, Sinhala, and Tamil across all 482 interface keys, verified by automated tests."*

---

### Slide 15: Automated Quality Gate & Verification Rigor
- **Visuals**: Figure **F13** (Verification Test Pyramid).
- **Key Points**:
  - **3,465 Tests Passed / 0 Failed across 207 Test Suites** (100% Pass Rate).
  - Master offline runner (`run_offline_tests.js`) executes in ~114 seconds.
  - **15-File Protected Ledger**: SHA-256 cryptographic hashes locked in `PROTECTED_HASHES.json`.
  - Frontend production build exit code 0.
- **Speaker Notes**:
  > *"Quality assurance is enforced through a deterministic offline test pyramid of 3,465 automated tests across 207 suites with zero failures. Furthermore, a 15-file SHA-256 cryptographic ledger locks down all security, encryption, and calculation code against accidental modification."*

---

### Slide 16: Cloud Infrastructure & Render Free Tier Dynamics
- **Visuals**: Graph showing cold-start latency vs warm inference response.
- **Key Points**:
  - Zero-budget cloud deployment on Vercel, Render Free, and MongoDB Atlas M0.
  - Reality of Free Tier: 15-minute inactivity dormancy $\to$ ~50-second container cold start.
  - Explaining UptimeRobot "Down" blips: 30s monitor timeout vs 50s boot time.
  - Client mitigation: Informative countdown modals during cold-start cycles.
  - Pre-viva pre-warming protocol (`curl.exe -i -m 60`).
- **Speaker Notes**:
  > *"MediSync runs on free cloud tiers. Render containers sleep after 15 minutes of inactivity, requiring about 50 seconds to cold-boot. Free uptime monitors time out after 30 seconds, causing temporary false 'Down' alerts. In our client, we display an informative warming modal during sleep wake-up."*

---

### Slide 17: Limitations & Future Roadmap
- **Visuals**: Roadmap timeline graphic.
- **Key Points**:
  - **Limitations**: Synthetic evaluation data, descriptive OLS projections (not SEIR forecasts), unverified BNF dosage limits, lack of automated Atlas M0 backups.
  - **Roadmap**:
    1. Clinical formulary sign-off by hospital review committee.
    2. Cloud migration to dedicated instances (Render Paid / AWS KMS).
    3. Integration with Sri Lanka Ministry of Health DHIS2 infrastructure.
    4. Trilingual clinical NLP for doctor free-text notes.
- **Speaker Notes**:
  > *"We acknowledge our limitations: clinical safety limits require formal BNF formulary sign-off, and projections are descriptive trends. Future work includes FHIR R4 interoperability and direct integration with Sri Lanka's national DHIS2 surveillance tracker."*

---

### Slide 18: Summary of Engineering Contributions
- **Key Points**:
  1. Tamper-evident digital prescription pipeline with QR and NIC-gate verification.
  2. Sub-millisecond deterministic medicine safety engine.
  3. Real-time syndromic surveillance with automated 3-tier outbreak gating.
  4. Ultra-lightweight ML triage operating in $< 200\text{ MB}$ memory.
  5. 100% trilingual interface parity (EN/SI/TA).
  6. 3,465 automated test verifications and 15-file cryptographic release lock.
- **Speaker Notes**:
  > *"In summary, MediSync demonstrates that rigorous, privacy-preserving digital healthcare and early disease detection can be achieved on modern cloud platforms within developing nation resource limits."*

---

### Slide 19: Live Demonstration & Viva Examination (Q&A)
- **Visuals**: MediSync Dashboard view with QR code to repository.
- **Presenter Contact**: [OWNER: Student Email / Contact Details]
- **Repository**: `feat/sub5-submission-pack`
- **Speaker Notes**:
  > *"Thank you for your time and attention. I am now delighted to present a live demonstration of the system and answer your questions."*
