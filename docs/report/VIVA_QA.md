# MediSync: Comprehensive Academic Viva Voce & Defense Guide (36 Questions & Answers)

This document contains 36 likely viva questions with authoritative, technically precise, evidence-based responses. Review these before your final project presentation and oral examination.

---

## Category 1: Machine Learning & Clinical Decision Support

### Q1: Is the machine learning symptom triage model clinically validated?
**Answer**:  
**No.** The machine learning model is an engineering proof-of-concept evaluated strictly on synthetic datasets and self-consistency splits. It is explicitly not certified by the National Medicines Regulatory Authority (NMRA), CE-marked, or clinically validated through hospital trials. Every API payload returned by the service carries the immutable property `"clinicalValidation": "not_established"`, and the user interface renders mandatory visual disclaimers informing practitioners that outputs are statistical pattern suggestions, not medical diagnoses.

### Q2: Why does Tier 1 only support 41 disease profiles, and can the system detect other diseases?
**Answer**:  
Tier 1 symptom suggestion prioritizes high-confidence, high-precision lexical retrieval over 41 curated clinical profiles representing prevalent South Asian conditions (e.g., Dengue fever, Leptospirosis, Typhoid fever, Malaria). However, **outbreak surveillance is universal**: while symptom autocomplete suggests among 41 reference conditions, **the epidemiological surveillance engine monitors every single one of the 71,704 ICD-10 diagnostic concepts and WHO ICD-11 codes**. Any condition diagnosed by a physician during consultation is automatically ingested into the dual-gate outbreak detector regardless of whether it belongs to the 41 symptom profiles.

### Q3: Why did you use synthetic data instead of real hospital patient records?
**Answer**:  
Under the Sri Lanka Personal Data Protection Act No. 9 of 2022 and international ethical standards (CIOMS/WHO), training models on real patient electronic health records requires formal institutional review board (IRB) ethical clearance and informed patient consent. As an undergraduate engineering capstone, synthetic data generation provided an ethically unencumbered, statistically calibrated environment to design and test architectural pipelines without risking patient confidentiality.

### Q4: Why did you choose TF-IDF and Cosine Similarity over a modern Large Language Model (LLM) like GPT-4 or Llama?
**Answer**:  
Three critical architectural reasons:
1. **Zero-Latency In-Memory Execution**: The TF-IDF symptom matcher executes in $< 1\text{ ms}$ mean latency, whereas cloud LLM API calls require 1,000 to 3,000 ms over high-latency rural internet connections.
2. **Predictable Deterministic Footprint**: The TF-IDF vectorizer and disease profiles occupy $< 2\text{ MB}$ of storage and run comfortably within a 196 MB process memory footprint on a zero-cost cloud container. Serving an open-source 7B parameter LLM locally requires 16 GB+ of VRAM, which is economically infeasible for rural clinics.
3. **No Hallucination Risk**: Deterministic n-gram vocabulary and overlap matching over curated ICD-10 clinical profiles eliminates generative text hallucinations, such as fabricating non-existent medication doses or invalid disease names.

### Q5: What is the real memory footprint of the ML service, and why did previous project reports claim 0.22 MB?
**Answer**:  
The previous claim of "0.22 MB" was a measurement artifact resulting from Python's internal `tracemalloc` library, which measures only the net difference in active Python heap allocations between two code lines. It ignored the base Python runtime, loaded libraries (`scikit-learn`, `scipy`, `numpy`), and Gunicorn worker processes. In real measurement using `psutil`, true operating system process Resident Set Size (RSS) is:
- Process boot: **20.75 MB**
- Post-model and knowledge base load: **195.91 MB**
- Post-100 queries: **196.82 MB** (consuming ~38% of the 512 MB Render Free limit).

### Q6: How does Tier 2 knowledge base matching work, and why are 491 profiles quarantined?
**Answer**:  
Tier 2 ingests ambulatory survey data from the CDC/SymCAT dataset (801 conditions, 17,400 symptom edges). Raw co-occurrence edges with probability $p < 0.15$ were pruned as clinical noise. Profiles with fewer than 3 surviving symptoms or high Jaccard redundancy ($\ge 0.80$) were quarantined. 174 profiles with clean mappings to public-domain ICD-10-CM concepts were admitted to the active knowledge base (`disease_symptom_kb.v1.json`). 136 noisy/unreliable profiles are quarantined in `kb_quarantine.v1.json`, and 491 unmapped profiles requiring clinical review are indexed in `unmapped_diseases.v1.json`.

### Q7: How were the 11 heuristic design parameters in the ML engine chosen?
**Answer**:  
Parameters such as the Tier 1 confidence floor ($40.0\%$, score 0.40), the KB probability cutoff ($0.15$), and the outbreak alert minimum case gate ($N=5$) were established as empirical engineering design choices during synthetic benchmarking. They are documented in `docs/report/ML_DESIGN_PARAMETERS.md` with explicit notes that they require multi-center clinical calibration before real-world adoption.

---

## Category 2: Prescription Security & Dispensing Fraud

### Q8: How does the cryptographic verification and National Identity Card (NIC) gate prevent prescription fraud?
**Answer**:  
Traditional paper prescriptions can be duplicated by photocopying or presented sequentially at multiple dispensaries ("pharmacy hopping"). In MediSync:
1. Every consultation summary PDF embeds a SHA-256 capability QR token (`/verify/:token`) allowing public authenticity verification (facility, clinician, timestamp) with zero patient PII.
2. To unlock full clinical records and medicine release details from the verification portal, a dynamic 6-digit OTP sent to the patient's registered email must be verified (no NIC entry required on mobile). 
3. In pharmacy dispensing (`/pharmacy/dashboard/dispense`), the pharmacist looks up the patient via their NIC, which triggers a patient OTP consent challenge (`x-patient-access`).
4. The pharmacist confirms prescribed medications, evaluates active allergy and drug-drug interaction warnings, and clicks Confirm Dispense.
5. Upon checkout, the prescription atomically transitions to `dispensed` in a single MongoDB transaction.
6. Any subsequent attempt to re-dispense the same prescription at any pharmacy is atomically rejected: *"Prescription is not eligible for dispensing." (code: ALREADY_DISPENSED)*.

### Q9: Does MediSync manage retail pharmacy stock or inventory?
**Answer**:  
**No.** Project design strictly separates clinical pharmacy verification from supply chain inventory management. MediSync does not track warehouse batches, reorder points, or shelf stock. A pharmacist's role in MediSync is clinical: validating prescription integrity, checking contraindications, and recording atomic dispensing. This architectural simplification eliminates stock reconciliation deadlocks and keeps the dispensing transaction clean.

### Q10: What is the architectural weakness of using the Sri Lankan NIC as a verification credential?
**Answer**:  
Sri Lankan National Identity Cards have relatively low cryptographic entropy:
- Old 10-character NICs encode birth year (first 2 digits), day of year + gender offset (next 3 digits), serial sequence, and a check letter ('V' or 'X').
- New 12-character NICs encode the full 4-digit birth year followed by day/gender and serial sequence.  
An attacker who knows a patient's date of birth and gender can brute-force the remaining search space. *Mitigation*: MediSync rate-limits verification attempts, requires ephemeral OTP consent tokens (`x-patient-access`), encrypts NICs via AES-256-CBC, and uses HMAC-SHA256 blind indexing so raw NICs are never stored in plaintext.

### Q11: Does MediSync support partial dispensing across multiple community pharmacies?
**Answer**:  
No. To maintain complete transactional atomicity and eliminate complex distributed reconciliation hazards across independent pharmacies, the dispensing engine (`server/src/services/dispensingService.js`) enforces full prescription checkout. All medications on a prescription order must be fulfilled together, or an explicit physician amendment must be recorded.

---

## Category 3: Security, Privacy & Cryptography

### Q12: Explain your implementation of field-level encryption. How is it implemented?
**Answer**:  
Implemented in `server/src/utils/versionedEncryption.js`:
- Sensitive patient identifiers (names, contact info, NICs, allergies, medical notes) are encrypted at rest using AES-256-CBC with per-record random Initialization Vectors (IV).
- Cryptographic integrity is verified via versioned key headers (`v1`, `v2`), supporting zero-downtime key rotation.
- In-flight communication is strictly secured using TLS 1.3.

### Q13: How does Blind Indexing work, and why is it necessary?
**Answer**:  
Because probabilistic encryption uses a unique random IV for every write, encrypting the same NIC twice produces completely different ciphertexts. Consequently, standard database equality queries (`{ nic: input }`) cannot find the record without decrypting every row in the database ($O(N)$ table scan).  
To solve this, we compute a blind index:
$$\text{BlindIndex} = \text{HMAC-SHA256}(\text{Salt}_{\text{blind}}, \text{Normalize}(\text{Input}))$$
The blind index is deterministic for a given input, allowing the database to maintain an indexed B-tree ($O(\log N)$ or $O(1)$ lookup). Because the blind indexing salt is isolated from the database and kept in application configuration, an attacker with a raw database dump cannot reverse blind index hashes to plaintext.

### Q14: What happens if an encryption key needs to be rotated?
**Answer**:  
Every encrypted payload begins with a `keyVersion` identifier (e.g., `v1`, `v2`). The cryptographic utility maintains a keyring of active and historical keys. When a read occurs, the system selects the decryption key matching the payload's `keyVersion`. When writing updates, the system encrypts using the latest active key version. This facilitates continuous background re-encryption without requiring application downtime.

### Q15: How are passwords and temporary tokens protected?
**Answer**:  
- Passwords are salted and hashed using `bcryptjs` with 12 adaptive work rounds.
- Temporary OTPs and password reset tokens are generated using cryptographically strong pseudo-random number generators (`crypto.randomInt()`).
- Tokens are stored in dedicated MongoDB collections (`OTPSession`, `RecoveryToken`) configured with automated database engine Time-To-Live (TTL) indexes, ensuring automatic document destruction after 300 seconds and 900 seconds, respectively.

### Q16: What are the primary compliance aspects of the Sri Lanka Personal Data Protection Act No. 9 of 2022 in MediSync?
**Answer**:  
1. **Lawful Basis & Consent**: Patients explicitly authorize clinician access to their longitudinal health records via OTP, with the ability to revoke consent.
2. **Data Minimization**: Only clinically relevant parameters are captured.
3. **Storage Limitation**: Temporary authentication credentials self-destruct via TTL indexes.
4. **Integrity and Confidentiality**: Mandated through field-level encryption at rest and TLS 1.3 in transit.

---

## Category 4: Epidemiological Outbreak Surveillance

### Q17: Why did you choose statistical baseline z-score anomaly detection over deep learning (e.g., LSTMs or Transformers) for outbreak detection?
**Answer**:  
1. **Sample Efficiency**: Deep learning time-series models require tens of thousands of historical training sequences. In regional public health outposts, emerging disease clusters occur infrequently, providing insufficient training data for complex neural networks.
2. **Interpretability**: Public Health Inspectors and Epidemiologists require transparent mathematical justification before declaring an outbreak. A 56-day district baseline with a standardized z-score of $+2.8$ is immediately interpretable; an opaque neural network weight is not.
3. **Computational Footprint**: Evaluating 7-day windows against 56-day historical baselines executes in microseconds during batch analysis without requiring GPU acceleration.

### Q18: What are the Noise Suppression Gates in outbreak detection, and what does ablation prove?
**Answer**:  
To prevent alert fatigue caused by random daily statistical fluctuations and low-denominator Poisson spikes, MediSync enforces **Dual Noise Suppression Gates**:
1. **Gate 1 (Case Floor)**: Absolute 7-day case volume must reach at least 5 cases ($N \ge 5$).
2. **Gate 2 (Persistence Gate)**: Elevation must exceed the anomaly threshold ($z \ge 2.0$) for **at least 2 consecutive calendar days**.

In our 1,200-series ablation benchmark (`scripts/ml_eval/evaluate_outbreak_detector.py`):
- Raw EARS C2 produced **598 false alarms out of 600 clean series (6.06 false alarms/year)**.
- Adding the Case Floor alone still produced 594 false alarms.
- Adding the 2-day persistence gate collapsed false alarms to 106.
- The **Dual-Gate reduced false alarms to 0.92 per year with 84.8% specificity and 79.8% precision**, while maintaining a **1.0-day median detection delay**.

### Q19: Why are population denominators used, and what is their official source?
**Answer**:  
Raw case counts favor populous districts (e.g., 20 cases in Colombo is normal baseline, while 20 cases in Mullaitivu is a severe epidemic). MediSync normalizes case counts against official district populations from the **Department of Census and Statistics (DCS) Census of Population and Housing** (Island total: 20,358,680 across all 25 districts). This allows reporting both absolute case volume, percentage of district population (e.g., `0.0005%`), and standardized incidence per 100,000 residents.

### Q20: Why is the 14-day projection labeled "statistical trend projection, not a validated epidemic forecast"?
**Answer**:  
The projection calculates a descriptive trajectory using Ordinary Least Squares (OLS) regression over recent complete 14–30 day observations, generating Student's t 95% prediction intervals. Because it does not model dynamic viral transmission rates ($R_t$), susceptible-infected-recovered (SEIR) compartments, human mobility, or monsoon weather covariates, presenting it as an epidemic forecast would be scientifically dishonest. In our rolling-origin backtest across 200 series, it achieves **94.9%–95.5% empirical coverage for its 95% prediction intervals**, and an MAE of 2.08 at 14 days (significantly outperforming naive baselines of 5.81 and 6.17).

---

## Category 5: Architecture, Cloud & Deployment

### Q21: Why did you choose MongoDB over a relational database like PostgreSQL?
**Answer**:  
Clinical data models (consultations, prescriptions with variable medication lists, dynamic laboratory investigation panels, and flexible symptom sets) are inherently semi-structured. MongoDB's document model represents a complete clinical encounter as an atomic document without requiring complex 8-table SQL joins. Furthermore, MongoDB natively supports Time-To-Live (TTL) indexes for ephemeral tokens and geospatial indexes for district coordinate mapping.

### Q22: How does the system handle Render Free tier cold starts (~50 seconds)?
**Answer**:  
On the Render Free tier, containers enter dormancy after 15 minutes of inactivity. When a request wakes a sleeping container:
1. The frontend React application catches delays exceeding 5 seconds and renders an informative modal: *"Cloud ML engine is waking from power-saving dormancy (~45s)..."*.
2. The user sees a visual countdown timer rather than an unresponsive screen or broken interface.
3. Once awake, subsequent inference calls respond in sub-millisecond time.
4. For scheduled demonstrations or vivas, the owner runs a pre-warm curl script 3 minutes prior.

### Q23: Why does UptimeRobot occasionally report the ML service as "Down"?
**Answer**:  
Free uptime monitoring services typically enforce a hardcoded HTTP connection timeout of 30 seconds. If an automated monitor checks a dormant container, the request times out after 30 seconds while the container is still executing its 50-second initialization. The monitor records a timeout and flags the service as "Down", even though the container reaches a healthy state 20 seconds later.

### Q24: What are the risks of using MongoDB Atlas Free M0 in production?
**Answer**:  
1. **No Automated Point-in-Time Recovery (PITR)**: M0 clusters do not support automated snapshot backups. A catastrophic data drop requires manual database restoration from local BSON dumps.
2. **Shared RAM & Storage Ceilings**: M0 provides 512 MB of shared storage and shared CPU, making it unsuitable for multi-hospital production concurrency.

---

## Category 6: Quality Assurance, Verification & Release Integrity

### Q25: What does your automated test suite cover?
**Answer**:  
The test suite contains over 3,400 assertions across unit, integration, and security layers:
- **Unit Tests**: Cryptographic encryption/decryption, blind index generation, medicine safety rules, dosage limits, dataset loaders.
- **Integration Tests**: Multi-document consultations, prescription state transitions, duplicate dispensing prevention, lab PDF validation.
- **Security Tests**: Role-based access control, route-level authorization, database injection guards, token expiration.
- **ML & Statistical Tests**: Outbreak surveillance universal coverage across 300+ sampled ICD codes, EARS C2 dual-gate filtering, OLS trend forecasting bounds, and symptom matching sanity tests.
- **Data Integrity Tests**: `hardcodedMetricAudit.test.js` verifying zero fake metrics in JSX, exact DCS census table matching, and drug catalog verification.
- **Localization**: 100% trilingual dictionary key parity across English, Sinhala, and Tamil (916 keys).

### Q26: What is the 15-File Protected Ledger?
**Answer**:  
Located in `docs/release/PROTECTED_HASHES.json`, the ledger records immutable SHA-256 cryptographic hashes for the 15 most sensitive files in the repository (e.g., `auth.js`, `doctorController.js`, `versionedEncryption.js`, `app.py`). The automated release gate recalculates these hashes before running tests. If any protected file is modified without authorization, the build fails immediately.

### Q27: What is the difference between OFFLINE VERIFIED and LIVE NOT VERIFIED in your report?
**Answer**:  
- **OFFLINE VERIFIED**: Code logic, business rules, cryptographic operations, and ML models that have been executed, tested, and verified during this evaluation session via automated test suites and profiling scripts.
- **LIVE NOT VERIFIED**: Real-world operational aspects that cannot be verified in offline mock mode—such as Atlas production database queries, live multi-pharmacy network latency, and formal clinical efficacy in hospitals.

### Q28: How do you prevent malicious script uploads disguised as lab reports?
**Answer**:  
In `server/controllers/labController.js`, file uploads undergo three strict layers of validation:
1. Extension check: Must strictly equal `.pdf`.
2. MIME-type check: Must equal `application/pdf`.
3. Binary inspection: Reads the first 5 bytes of the physical file stream to confirm the magic byte signature `%PDF-` (`0x25 0x50 0x44 0x2D`). Polyglot scripts (e.g., PHP or JS disguised as a PDF) are rejected before being written to disk.

### Q29: How is 100% trilingual parity verified across English, Sinhala, and Tamil?
**Answer**:  
An automated test suite loads all locale dictionaries (`en.js`, `si.js`, `ta.js`), computes the set of unique translation keys, and asserts that the symmetric difference between any two language dictionaries is empty ($A \triangle B = \emptyset$). All 916 registered UI keys exist in all three languages.

### Q30: How does the system handle concurrent dispensing attempts on the same prescription?
**Answer**:  
Prescription status transitions employ MongoDB atomic conditional update operators:
```javascript
Prescription.findOneAndUpdate(
  { _id: prescriptionId, status: { $in: ['active', 'partially_dispensed'] } },
  { $set: { status: 'dispensed' } }
)
```
If two pharmacy terminals submit dispensing confirmations simultaneously, only the first transaction finds the matching document with status `active`. The second transaction matches 0 documents and fails with HTTP 409 Conflict.

### Q31: How many pharmaceutical drugs are available globally on the platform?
**Answer**:  
MediSync maintains two tiers of drug data:
1. **Global Master Catalog (`ml-engine/data/medicines.csv`)**: Contains **23,939 approved pharmaceutical medicines**, fulfilling the requirement for over 20,000 globally available medications.
2. **Clinical Formulary Catalog (`server/reference-data/drugs_clean.json`)**: Contains **3,000 curated high-frequency clinical medications** with dosage forms, contraindications, and drug-drug interaction pairs pinned by cryptographic hash in `productionArtifactPins.json`.

### Q32: What data in the demonstration is synthetic versus real?
**Answer**:  
- **Real / Non-Synthetic**: The user accounts used for logging into Doctor, Pharmacist, and Administrator consoles are real, non-seeded credentials. (Production security rejects synthetic persona accounts for login by design).
- **Synthetic Demonstration Fixtures**: The demo patient (NIC `200012345678`) and historical outbreak consultation series are seeded with `isSynthetic: true` and `syntheticSeedBatch: "viva-2026-11-outbreaks"`. They are used strictly to demonstrate public health analytics and consent-based consultation lookups. Outbreak approval emails for these synthetic batches are strictly confined to the `OUTBREAK_DEMO_EMAIL_ALLOWLIST` with `[DEMONSTRATION]` markers.

### Q33: How do you prevent NoSQL injection in Express/Mongoose?
**Answer**:  
1. Mongoose schema definitions strictly cast query parameters to declared types (e.g., strings, ObjectIds), automatically neutralizing MongoDB query operator injection objects (`{ $gt: "" }`).
2. Express endpoints utilize input validation schemas sanitizing request payloads before controller processing.

### Q34: What prevents duplicate alerts during automated outbreak scans?
**Answer**:  
Outbreak alert creation uses an idempotent query check: before creating a `Pending` alert for a disease in a district, the surveillance service queries for any existing alert for that disease and district in `Pending` or `Active` status created within the current epidemiological window. If an alert already exists, the engine logs `ALERT_ALREADY_EXISTS` and skips duplicate insertion.

### Q35: If given a budget to deploy MediSync in a Sri Lankan district tomorrow, what are the top 3 blockers?
**Answer**:  
1. **Clinical Formulary & Safety Limits Sign-Off**: The medicine safety limits and interaction tables must be officially validated and signed off by a Ministry of Health clinical formulary review committee against BNF 86.
2. **Infrastructure Upgrade**: Migrating from Render Free and MongoDB Atlas M0 to dedicated cloud tiers (Render Paid or AWS ECS + MongoDB Atlas M10) to eliminate 50-second cold starts and enable automated continuous backups.
3. **Clinical Governance & NMRA Approval**: Securing digital health ethics approval and regulatory clearance from the National Medicines Regulatory Authority (NMRA) for clinical decision support deployment.

### Q36: What was your specific contribution to this project?
**Answer**:  
`[OWNER: Insert your personal role, e.g., lead architectural design, implementing the zero-trust field encryption pipeline, engineering the dual-tier ML microservice and sparse retrieval engine, developing the three-tier outbreak surveillance system, and constructing the 3,465-test automated verification suite.]`
