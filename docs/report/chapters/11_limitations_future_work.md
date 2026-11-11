# Chapter 11: Limitations, Known Risks & Future Work

## 11.1 Transparent Academic & Technical Limitations
In keeping with rigorous academic engineering principles, this chapter explicitly documents the known limitations, architectural boundaries, and operational risks of the MediSync prototype.

### 11.1.1 Descriptive Projections vs. Epidemiological Forecasts
While MediSync provides 14-day statistical trajectory curves (Figure **F12**), these calculations represent ordinary least squares (OLS) descriptive mathematical extrapolations. They **do not** incorporate dynamic compartmental epidemiological models (such as SEIR), vector breeding indices (Breteau index), or meteorological covariates (rainfall, humidity). Consequently, these curves are strictly labeled as descriptive projections and are suppressed from triggering automated public health lockdown measures.

### 11.1.2 Census Denominator Data Gaps
Accurate per-capita attack rate calculations require precise district-level age-stratified census denominators. Following the 2024 national census in Sri Lanka, official granular figures remain pending final gazetting. In MediSync, unverified demographic denominators are explicitly marked as `pending_owner_data`, with ingestion scripts prepared to accept verified government data.

### 11.1.3 Knowledge Base Breadth & Coverage
While the standard ICD-10-CM catalog contains 71,704 validated leaf diagnostic concepts (Figure **F06**), MediSync's active diagnostic triage engine currently encompasses:
- 41 curated high-frequency disease profiles in Tier 1.
- 174 auto-accepted, validated condition profiles in Tier 2.
- **Combined Active Coverage**: 215 active conditions (Figure **F07**).  
491 raw profiles from the SymCAT survey dataset remain in `ml-engine/data/unmapped_diseases.v1.json` due to unmapped clinical tokens or sparse evidence. These require manual curation by clinical taxonomists before production admission.

### 11.1.4 Unverified Medication Safety Limits & Items for Review
The dosage ceilings and drug-drug interaction matrix in `medicine_safety_limits.json` carry the explicit metadata tag `citationStatus: "unverified_owner_must_check"`. As documented in `docs/report/MEDICINE_LIMITS_VERIFICATION.md`, all therapeutic limits must undergo formal sign-off by a hospital formulary review committee cross-referencing the British National Formulary (BNF) prior to clinical deployment. Specific items flagged for clinical review include:
- **Ibuprofen Single-Dose 800 mg**: Elevated risk of acute gastric mucosal erosion and nephrotoxicity in primary care; evaluate lowering to 400 mg or 600 mg.
- **Paracetamol 7-Day Course Duration**: Hepatotoxicity risks during continuous maximum daily dosing (4 g/day); evaluate capping uncomplicated antipyretic therapy at 3–5 days.

### 11.1.5 Cloud Free-Tier Operational Constraints
- **Cold-Start Dormancy**: The Render Free plan shuts down containers after 15 minutes of inactivity, resulting in cold-boot delays of 50 to 60 seconds.
- **Lack of Database Backups**: MongoDB Atlas M0 sandboxes do not support automated point-in-time recovery (PITR) or scheduled snapshot backups. A physical disk corruption or catastrophic administrative drop requires manual snapshot restoration from local dumps.
- **Network Bandwidth**: Render free web services allocate limited shared bandwidth, making the system unsuitable for sustained high-concurrency disaster scenarios without upgrading to dedicated cloud tiers.

### 11.1.6 Heuristic Design Parameters
The 11 operational parameters documented in `ML_DESIGN_PARAMETERS.md` (e.g., Tier 1 confidence floor of 40.0%, outbreak minimum case threshold of 5, persistence gate of 2 consecutive days, $z > 2.0$) were established empirically during software development. While effective at suppressing false positives in synthetic simulations, they have not undergone multi-center clinical calibration.

### 11.1.7 Heuristic Red-Flag Advisory Screen & Diagnostic Plausibility Limits
Evaluation of the 15 sanity symptom scenarios (`docs/report/ML_DESIGN_PARAMETERS.md`) demonstrates that while MediSync implements a deterministic, rule-based emergency red-flag screen (`server/src/utils/emergencyAdvisory.js`, `server/src/data/emergencyRedFlags.json`) surfacing informational banners for acute critical presentations (meningism, cardiorespiratory distress, chest pain, altered consciousness, anaphylaxis, hemorrhage), this screen is strictly an informational prototype heuristic (`clinicalValidation: not_established`) and does not constitute a comprehensive clinical triage system. The underlying ML engine operates solely as an unweighted lexical similarity reference aid:
- **SC-03** (*Dependent edema + exertional breathlessness*): Triggers the acute cardiorespiratory distress advisory banner, while the underlying lexical similarity still ranks *Acanthosis nigricans*.
- **SC-09** (*Sudden severe headache + stiff neck + photophobia*): Triggers the acute meningism advisory banner, while the underlying lexical similarity still suggests *Migraine*.
- **SC-05** (*Resting tremor, bradykinesia, rigidity*) and **SC-10** (*Malar rash, joint stiffness*): Correctly do not trigger emergency red flags, but their lexical suggestions reflect catalog gaps (*Malaria* and *Fungal infection*, respectively).
- Consequently, the system makes no claim of clinical diagnostic plausibility or algorithmic quality, and must strictly remain disclaimed with `clinicalValidation: not_established`.

### 11.1.8 Known Security Limitations & Audit Review (CODEX 20261111 Audit)
Independent security analysis (`docs/final/SECURITY_REVIEW_20261111.md`) identified architectural security limitations across the prototype implementation:
1. **F04: Partial Field Encryption Coverage**: At-rest database encryption is limited to patient `['fullName', 'contactInfo', 'allergies']` and consultation `['patientNic', 'diagnosis', 'notes']`. Identifiers, email addresses, residential addresses, and dates of birth remain in plaintext. In verification flows, decryption failure is explicitly distinguished from known-clean zero allergies (`allergiesStatus: 'unavailable'` vs `'none'`). *Repair path*: Full schema envelope encryption across all PII.
2. **F05: Legacy PDF Encryption Cipher**: Encrypted PDFs generated via `@pdfsmaller/pdf-encrypt-lite` utilize RC4-128 with identifier-derived passwords. The operator reported server export enabled on 11 November 2026. The hold returns HTTP 503 when the flag is unset or false. *Repair path*: Migrate to AES-256 PDF encryption (ISO 32000-2) with randomized per-document keys.
3. **F08: LocalStorage Refresh Tokens**: Refresh tokens stored in browser `localStorage` are exposed if XSS occurs. *Repair path*: Migrate to HttpOnly, SameSite=Strict cookies with rotating refresh tokens.
4. **Additional observation: ML Engine Internal HMAC Hour-Bound Window**: `ml-engine/app.py` accepts credentials for the current and previous UTC hour without binding the signature to a request. *Repair path*: Redis-backed per-request nonce validation or 30-second timestamp freshness window.
6. **F12: sensitive patient fields remain outside field encryption**: Storage encryption uses AES-256-CBC with SHA-256 key hashing without AEAD authentication tags. *Repair path*: Upgrade to AES-256-GCM or cloud KMS envelope encryption.

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

The remaining Codex review findings include F10 “production storage verification may execute DDL during startup” and F11 “production cluster selection is broad, not an exact existing-cluster pin.” QR history export requires an OTP-issued view session and is scoped to the linked encounter. The patient consultation PDF button also checks the frontend build flag `REACT_APP_PDF_EXPORT_ENABLED`.
