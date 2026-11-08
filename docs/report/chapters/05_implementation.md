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
