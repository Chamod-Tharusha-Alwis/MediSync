# MediSync: Comprehensive Academic Viva Voce & Defense Guide (32 Questions & Answers)

This document contains 32 likely viva questions with authoritative, technically precise, evidence-based responses. Review these before your final project presentation and oral examination.

---

## Category 1: Machine Learning & Clinical Decision Support

### Q1: Is the machine learning symptom triage model clinically validated?
**Answer**:  
**No.** The machine learning model is an engineering proof-of-concept evaluated strictly on synthetic datasets and self-consistency splits. It is explicitly not certified by the National Medicines Regulatory Authority (NMRA), CE-marked, or clinically validated through hospital trials. Every API payload returned by the service carries the immutable property `"clinicalValidation": "not_established"`, and the user interface renders mandatory visual disclaimers informing practitioners that outputs are statistical pattern suggestions, not medical diagnoses.

### Q2: Why does Tier 1 only support 41 disease profiles?
**Answer**:  
Tier 1 prioritizes high-confidence, high-precision classification over sheer volume. The 41 disease classes represent the most prevalent communicable and non-communicable conditions encountered in outpatient departments in South Asia (e.g., Dengue fever, Leptospirosis, Typhoid fever, Malaria, Bronchial Asthma, Type 2 Diabetes). Training a curated set of 41 clinical profiles evaluated with n-gram TF-IDF vectorization, cosine similarity, and exact overlap scoring ensures high macro F1 (1.000) and 98.4% Top-1 accuracy while maintaining an ultra-lightweight memory footprint. Diagnostic coverage for conditions outside these 41 classes is delegated to Tier 2 sparse retrieval.

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
The previous claim of "0.22 MB" was a measurement artifact resulting from Python's internal `tracemalloc` library, which measures only the net difference in active Python heap allocations between two code lines. It ignored the base Python runtime, loaded libraries (`scikit-learn`, `scipy`, `numpy`), and Gunicorn worker processes. In Sub-Project 5, we measured true operating system process Resident Set Size (RSS) using `psutil`:
- Process boot: **20.75 MB**
- Post-model and knowledge base load: **195.91 MB**
- Post-100 queries: **196.82 MB** (consuming 38.44% of the 512 MB Render Free limit).

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
2. To download full longitudinal medical records from the verification portal, a constant-time Patient NIC gate must be satisfied.
3. In pharmacy dispensing (`/pharmacy/dashboard/dispense`), the pharmacist looks up the patient via their NIC, which triggers a patient OTP consent challenge (`x-patient-access`).
4. The pharmacist confirms prescribed medications, evaluates active allergy conflicts, and submits dispensing.
5. Upon checkout, the prescription atomically transitions to `dispensed` in a single MongoDB transaction.
6. Any subsequent attempt to re-dispense the same prescription at any pharmacy is atomically rejected: *"Prescription is not eligible for dispensing." (code: ALREADY_DISPENSED)*.

### Q9: What is the architectural weakness of using the Sri Lankan NIC as a verification credential?
**Answer**:  
Sri Lankan National Identity Cards have relatively low cryptographic entropy:
- Old 10-character NICs encode birth year (first 2 digits), day of year + gender offset (next 3 digits), serial sequence, and a check letter ('V' or 'X').
- New 12-character NICs encode the full 4-digit birth year followed by day/gender and serial sequence.  
An attacker who knows a patient's date of birth and gender can brute-force the remaining search space. *Mitigation*: MediSync rate-limits verification attempts, requires ephemeral OTP consent tokens (`x-patient-access`), encrypts NICs via AES-256-GCM, and uses blind indexing so raw NICs are never stored in plaintext.

### Q10: Does MediSync support partial dispensing across multiple community pharmacies?
**Answer**:  
No. To maintain complete transactional atomicity and eliminate complex distributed reconciliation hazards across independent pharmacies, the dispensing engine (`server/src/services/dispensingService.js:69`) explicitly enforces:
```javascript
if (item.status && item.status !== 'dispensed') {
  fail('PARTIAL_DISPENSE_REQUIRES_REVIEW', 'Partial dispensing is not supported by this full-prescription checkout.');
}
```
All medications on a prescription order must be fulfilled together in a single checkout, or an explicit brand substitution with clinical justification must be recorded. If a patient requires split fulfillment across facilities, the prescribing clinician authors distinct prescription orders.

---

## Category 3: Security, Privacy & Cryptography

### Q11: Explain your implementation of field-level encryption (AES-256-GCM). Why GCM instead of CBC?
**Answer**:  
Implemented in `server/src/utils/versionedEncryption.js`:
- AES in Galois/Counter Mode (AES-256-GCM) is an **Authenticated Encryption with Associated Data (AEAD)** cipher. Unlike AES-CBC (which requires separate HMAC signing to prevent padding oracle attacks), GCM provides both confidentiality and data origin authentication via an integrated 16-byte authentication tag.
- If a database adversary tampers with a single bit of the stored ciphertext, GCM decryption fails immediately with an authentication tag error, preventing corrupted data from entering the application.
- Each payload stores `keyVersion:IV:AuthTag:Ciphertext`, supporting zero-downtime key rotation.

### Q12: How does Blind Indexing work, and why is it necessary?
**Answer**:  
Because AES-256-GCM uses a unique 16-byte random IV for every write, encrypting the same NIC twice produces completely different ciphertexts. Consequently, standard database equality queries (`{ nic: input }`) cannot find the record without decrypting every row in the database ($O(N)$ table scan).  
To solve this, we compute a blind index:
$$\text{BlindIndex} = \text{HMAC-SHA256}(\text{Salt}_{\text{blind}}, \text{Normalize}(\text{Input}))$$
The blind index is deterministic for a given input, allowing the database to maintain an indexed B-tree ($O(\log N)$ or $O(1)$ lookup). Because the blind indexing salt is isolated from the database and kept in application configuration, an attacker with a raw database dump cannot reverse blind index hashes to plaintext.

### Q13: What happens if an encryption key needs to be rotated?
**Answer**:  
Every encrypted payload begins with a `keyVersion` identifier (e.g., `v1`, `v2`). The cryptographic utility maintains a keyring of active and historical keys. When a read occurs, the system selects the decryption key matching the payload's `keyVersion`. When writing updates, the system encrypts using the latest active key version. This facilitates continuous background re-encryption without requiring application downtime.

### Q14: How are passwords and temporary tokens protected?
**Answer**:  
- Passwords are salted and hashed using `bcryptjs` with 12 adaptive work rounds.
- Temporary OTPs and password reset tokens are generated using cryptographically strong pseudo-random number generators (`crypto.randomInt()`).
- Tokens are stored in dedicated MongoDB collections (`OTPSession`, `RecoveryToken`) configured with automated database engine Time-To-Live (TTL) indexes, ensuring automatic document destruction after 300 seconds and 900 seconds, respectively.

### Q15: What are the primary compliance aspects of the Sri Lanka Personal Data Protection Act No. 9 of 2022 in MediSync?
**Answer**:  
1. **Lawful Basis & Consent**: Patients explicitly authorize clinician access to their longitudinal health records, with the ability to revoke consent.
2. **Data Minimization**: Only clinically relevant parameters are captured.
3. **Storage Limitation**: Temporary authentication credentials self-destruct via TTL indexes.
4. **Integrity and Confidentiality**: Mandated through AES-256-GCM authenticated encryption at rest and TLS 1.3 in transit.

---

## Category 4: Epidemiological Outbreak Surveillance

### Q16: Why did you choose statistical baseline z-score anomaly detection over deep learning (e.g., LSTMs or Transformers) for outbreak detection?
**Answer**:  
1. **Sample Efficiency**: Deep learning time-series models require tens of thousands of historical training sequences. In regional public health outposts, emerging disease clusters occur infrequently, providing insufficient training data for complex neural networks.
2. **Interpretability**: Public Health Inspectors and Epidemiologists require transparent mathematical justification before declaring an outbreak. A 56-day district baseline with a standardized z-score of $+2.8$ is immediately interpretable; an opaque neural network weight is not.
3. **Computational Footprint**: Evaluating 7-day windows against 56-day historical baselines executes in microseconds during batch analysis without requiring GPU acceleration.

### Q17: What are the Noise Suppression Gates in outbreak detection?
**Answer**:  
To prevent alert fatigue caused by random daily statistical fluctuations and data-entry artifacts, MediSync enforces strict code-verified anomaly gates (`server/src/services/surveillanceService.js:136-140`):
1. **Gate 1 (Case Threshold)**: Absolute 7-day case volume must reach at least 5 cases ($N \ge 5$).
2. **Historical Baseline**: Compares 7-day window rate against a 56-day historical district baseline with regularized variance ($\sigma \ge 0.5$).
3. **Gate 2 (Persistence Gate)**: Incidence must exceed threshold ($z > 2.0$) for **2 consecutive calendar days** before promoting to an Outbreak Alert. Severity is categorized into Watch ($z \in [2.0, 3.0)$), Alert ($z \in [3.0, 4.0)$), and Critical ($z \ge 4.0$).

### Q18: Why is the 14-day projection labeled "projection, not validated forecast"?
**Answer**:  
The projection calculates a descriptive trajectory using ordinary least squares (OLS) regression over recent 30-day windows. Because it does not model dynamic viral transmission rates ($R_t$), human mobility, or weather covariates (monsoon rainfall), presenting it as a "validated forecast" would be scientifically misleading. We maintain strict academic truthfulness by labeling it a descriptive projection.

---

## Category 5: Architecture, Cloud & Deployment

### Q19: Why did you choose MongoDB over a relational database like PostgreSQL?
**Answer**:  
Clinical data models (consultations, prescriptions with variable medication lists, dynamic laboratory investigation panels, and flexible symptom sets) are inherently semi-structured. MongoDB's document model represents a complete clinical encounter as an atomic document without requiring complex 8-table SQL joins. Furthermore, MongoDB natively supports Time-To-Live (TTL) indexes for ephemeral tokens and geospatial indexes for district coordinate mapping.

### Q20: How does the system handle Render Free tier cold starts (~50 seconds)?
**Answer**:  
On the Render Free tier, containers enter dormancy after 15 minutes of inactivity. When a request wakes a sleeping container:
1. The frontend React application catches delays exceeding 5 seconds and renders an informative modal: *"Cloud ML engine is waking from power-saving dormancy (~45s)..."*.
2. The user sees a visual countdown timer rather than an unresponsive screen or broken interface.
3. Once awake, subsequent inference calls respond in sub-millisecond time.
4. For scheduled demonstrations or vivas, the owner runs a pre-warm curl script 3 minutes prior.

### Q21: Why does UptimeRobot occasionally report the ML service as "Down"?
**Answer**:  
Free uptime monitoring services typically enforce a hardcoded HTTP connection timeout of 30 seconds. If an automated monitor checks a dormant container, the request times out after 30 seconds while the container is still executing its 50-second initialization. The monitor records a timeout and flags the service as "Down", even though the container reaches a healthy state 20 seconds later.

### Q22: What are the risks of using MongoDB Atlas Free M0 in production?
**Answer**:  
1. **No Automated Point-in-Time Recovery (PITR)**: M0 clusters do not support automated snapshot backups. A catastrophic data drop requires manual database restoration from local BSON dumps.
2. **Shared RAM & Storage Ceilings**: M0 provides 512 MB of shared storage and shared CPU, making it unsuitable for multi-hospital production concurrency.

---

## Category 6: Quality Assurance, Verification & Release Integrity

### Q23: Why does MediSync have 3,465 automated tests? What do they cover?
**Answer**:  
The test suite enforces complete non-regression across all critical clinical invariants across 207 test suites:
- **Unit Tests**: Cryptographic encryption/decryption, blind index generation, medicine safety rules, dosage limits, dataset loaders.
- **Integration Tests**: Multi-document consultations, prescription state transitions, duplicate dispensing prevention, lab PDF validation.
- **Security Tests**: Role-based access control, route-level authorization, database injection guards, token expiration.
- **ML Tests**: Feature vectorization, TF-IDF cosine similarity symptom matching, Tier 2 sparse KB retrieval, and 15 standardized sanity symptom cases.
- **E2E & Localization**: 5-role isolated user journeys and 100% trilingual dictionary key parity.

### Q24: What is the 15-File Protected Ledger?
**Answer**:  
Located in `docs/release/PROTECTED_HASHES.json`, the ledger records immutable SHA-256 cryptographic hashes for the 15 most sensitive files in the repository (e.g., `auth.js`, `doctorController.js`, `versionedEncryption.js`, `app.py`). The automated release gate recalculates these hashes before running tests. If any protected file is modified without updating the ledger and documenting the reason in the commit, the build fails immediately.

### Q25: What is the difference between OFFLINE VERIFIED and LIVE NOT VERIFIED in your report?
**Answer**:  
- **OFFLINE VERIFIED**: Code logic, business rules, cryptographic operations, and ML models that have been executed, tested, and verified during this evaluation session via automated test suites and profiling scripts.
- **LIVE NOT VERIFIED**: Real-world operational aspects that cannot be verified in offline mock mode—such as Atlas production database queries, live multi-pharmacy network latency, and formal clinical efficacy in hospitals.

### Q26: How do you prevent malicious script uploads disguised as lab reports?
**Answer**:  
In `server/controllers/labController.js`, file uploads undergo three strict layers of validation:
1. Extension check: Must strictly equal `.pdf`.
2. MIME-type check: Must equal `application/pdf`.
3. Binary inspection: Reads the first 5 bytes of the physical file stream to confirm the magic byte signature `%PDF-` (`0x25 0x50 0x44 0x2D`). Polyglot scripts (e.g., PHP or JS disguised as a PDF) are rejected before being written to disk.

### Q27: How is 100% trilingual parity verified across English, Sinhala, and Tamil?
**Answer**:  
An automated test suite loads all locale JSON dictionaries in `client/src/locales/` (`en.json`, `si.json`, `ta.json`), computes the set of unique translation keys, and asserts that the symmetric difference between any two language dictionaries is empty ($A \triangle B = \emptyset$). All 482 registered UI keys exist in all three languages.

### Q28: How does the system handle concurrent dispensing attempts on the same prescription?
**Answer**:  
Prescription status transitions employ MongoDB atomic conditional update operators:
```javascript
Prescription.findOneAndUpdate(
  { _id: prescriptionId, status: { $in: ['active', 'partially_dispensed'] } },
  { $set: { status: 'dispensed' } }
)
```
If two pharmacy terminals submit dispensing confirmations simultaneously, only the first transaction finds the matching document with status `active`. The second transaction matches 0 documents and fails with HTTP 409 Conflict.

### Q29: Why did `npm audit` report 36 vulnerabilities in the client component?
**Answer**:  
As documented in `docs/report/QUALITY_SCAN.md`, all 36 client vulnerabilities reside in legacy build dependencies inside Create React App (`react-scripts 5.0.1`), such as `webpack-dev-server` and `postcss`. These development toolchain libraries are executed only during compilation on developer workstations. In production, the client is compiled into static HTML, JavaScript, and CSS bundles served from Vercel's edge CDN, where build-time packages do not execute.

### Q30: If you were given a budget to deploy MediSync in a Sri Lankan district tomorrow, what are the top 3 blockers?
**Answer**:  
1. **Clinical Formulary & Safety Limits Sign-Off**: The medicine safety limits and interaction tables must be officially validated and signed off by a Ministry of Health clinical formulary review committee against BNF 86.
2. **Infrastructure Upgrade**: Migrating from Render Free and MongoDB Atlas M0 to dedicated cloud tiers (Render Paid or AWS ECS + MongoDB Atlas M10) to eliminate 50-second cold starts and enable automated continuous backups.
3. **Clinical Governance & NMRA Approval**: Securing digital health ethics approval and regulatory clearance from the National Medicines Regulatory Authority (NMRA) for clinical decision support deployment.

### Q31: How do you protect against NoSQL injection in Express/Mongoose?
**Answer**:  
1. Mongoose schema definitions strictly cast query parameters to declared types (e.g., strings, ObjectIds), automatically neutralizing MongoDB query operator injection objects (`{ $gt: "" }`).
2. Express endpoints utilize input validation middleware (`Joi` schemas) sanitizing request payloads before controller processing.

### Q32: What was your specific contribution to this project?
**Answer**:  
`[OWNER: Insert your personal role, e.g., lead architectural design, implementing the zero-trust field encryption pipeline, engineering the dual-tier ML microservice and sparse retrieval engine, developing the three-tier outbreak surveillance system, and constructing the 3,465-test automated verification suite.]`
