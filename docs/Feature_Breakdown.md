# MediSync Healthcare Platform — Comprehensive Feature Breakdown

MediSync is an enterprise-grade, localized, zero-trust healthcare intelligence and management platform tailored specifically for Sri Lanka's clinical, geographical, and regulatory ecosystem. Designed to bridge the gap between fragmented healthcare providers while maintaining uncompromising patient data privacy under national PDPA guidelines, MediSync unites patients, clinicians, hospital laboratories, dispensing pharmacies, and public health epidemiologists into a synchronized digital network.

Below is an exhaustive, professional breakdown of the platform's core functional and architectural modules.

---

## 1. AI-Powered Doctor Consultation

The Doctor Consultation module transforms traditional clinical encounters into intelligent, safety-guarded digital workflows by embedding real-time machine learning diagnostics and pharmaceutical safety checks directly into the clinician's workspace.

### Core Capabilities & Technical Highlights:
* **Multi-Step Clinical Wizard (`NewConsultation.jsx`)**: A structured, ergonomic user interface that guides clinicians through a logical four-stage examination workflow: (1) Patient Verification & Vitals, (2) Symptom Logging & AI Diagnostics, (3) Medication Prescribing & Safety Checks, and (4) E-Prescription Review & Issuance.
* **Vital Signs Logging & Clinical Triage**: Capture and trend essential physiological parameters including systolic/diastolic blood pressure (`mmHg`), pulse rate (`bpm`), body temperature (`°C`), oxygen saturation (`SpO2 %`), and respiratory rate. Vitals are permanently bound to the encounter record for longitudinal health tracking.
* **Intelligent Symptom Autocomplete (`SymptomTagInput.jsx`)**: Tokenized symptom selection field featuring instant autocomplete against a standardized clinical database of over 130 recognized medical symptoms, eliminating free-text ambiguity and standardizing inputs for machine learning evaluation.
* **3-Model ML Diagnostic Ensemble**: Queries the Python ML Engine (`/predict_disease`) to analyze selected symptoms using a weighted ensemble of three supervised algorithms:
  * **Support Vector Machine (SVM)** — Exceeds at finding complex, high-dimensional decision boundaries across overlapping symptom clusters.
  * **Random Forest Classifier** — Provides robust, ensemble-tree probability scoring resistant to clinical noise and minor symptom omissions.
  * **Naïve Bayes Classifier** — Delivers rapid probabilistic baseline evaluations based on clinical frequency distributions.
  * *Output*: Returns the top predicted disease, confidence percentage, corresponding WHO ICD-10 diagnostic code, clinical descriptions, recommended triage urgency, and actionable home care precautions.
* **Real-Time Drug-Drug Interaction Warnings**: As clinicians add medications to the treatment regimen, the system cross-references the patient's active prescription list against an in-memory pharmaceutical interaction database (`interactions_clean.json`). If an adverse combination (e.g., *Aspirin + Warfarin* or *Amoxicillin + Methotrexate*) is detected, a high-priority modal alert (`MedicationAlertModal`) interrupts the workflow, detailing interaction severity (`Major`, `Moderate`, `Minor`), pharmacological mechanisms, and recommended clinical management.
* **Encrypted PDF E-Prescription Generation**: Dynamically compiles the verified consultation into a professional, printable E-Prescription document using `pdf-lib`. The document features a hospital branding header, clinician registration credentials, patient demographic summaries, structured medication tables (with custom word-wrapping to prevent column overlap), and a unique alphanumeric verification barcode. To ensure zero-trust transmission, the PDF is encrypted at rest using AES-256 before being stored and made available to the patient.

---

## 2. Weighted Outbreak Anomaly System (ML Engine)

MediSync features an advanced epidemiological intelligence engine designed to detect early-stage disease outbreaks across Sri Lanka's 25 administrative districts without generating disruptive false alarms for common seasonal illnesses.

### AI Symptom Checker & Diagnosis
**Status**: `Implemented`
**Purpose**: Allow patients to input symptoms and receive a preliminary diagnosis.
**Disease Scope Strategy (Option B: Full 71k Integration)**:
- **Scope Expansion**: The symptom checker has been fully decoupled from the limited 41-disease JSON map. It now leverages the comprehensive `icd10_diseases` database containing 71,744 entries.
- **Fuzzy Semantic Matching**: Because the massive 71k database lacks explicitly curated symptom lists for every condition, the ML Engine's TF-IDF vectorizer has been retrained to use the *disease names* themselves as the semantic ground truth. 
- **Unified Truth**: The ML engine and the Public Health Outbreak Map now both share the same `medisync.db` SQLite database as their single source of truth.
**Key Features**:
- **NLP / ML Processing**: Uses `TF-IDF + Cosine Similarity` (via Scikit-Learn) on the Python ML Engine to fuzzy-match raw input strings across the entire 71,744 disease index.
- **Disease Confidence**: Returns percentage confidence.
- **Urgency Flags**: Flags conditions with high base severity (e.g., Dengue) or dangerous keywords (e.g., "chest pain") as urgent.
- **Specialist Routing**: Automatically recommends the appropriate specialist (e.g., Pulmonologist, Neurologist) based on the ICD-10 chapter of the predicted disease.

### Core Capabilities & Technical Highlights:
* **Automated Nightly Surveillance Cron Jobs (`cronJobs.js`)**: A background orchestration engine that fires every midnight (`0 0 * * *`), automatically aggregating daily disease case counts from consultation logs and diagnostic laboratory test confirmations across all healthcare facilities in Sri Lanka.
* **Z-Score Epidemiological Surveillance**: For every disease within each district, the engine calculates a rolling historical baseline average and standard deviation over a 4-week window. It then computes the real-time statistical **Z-score** ($Z = \frac{X - \mu}{\sigma}$) to quantify exact standard deviation departures from expected seasonal norms.
* **ICD-10 Weighted Risk Rules & Panic Caps (`app.py`)**: To prevent common endemic spikes (such as seasonal common colds or allergic rhinitis) from triggering nationwide health panics, the system implements a strict, clinical-risk-weighted threshold architecture based on WHO ICD-10 chapters:
  * **High Danger Tier (e.g., Dengue, Cholera A00, Typhoid, Tuberculosis, AIDS)**: Highly sensitive surveillance guardrails. Requires only **>10 cases** in a district and a **>=150% spike** over baseline to trigger an immediate, unrestricted **`High`** severity alert across public health dashboards.
  * **Medium Danger Tier (e.g., Acute Gastroenteritis, Urinary Tract Infections, Asthma)**: Balanced surveillance guardrails. Requires **>30 cases** and a **>=300% spike** over baseline to trigger an anomaly, with alert severity capped at **`Medium`**.
  * **Low Danger Tier (e.g., Common Cold J00-J06, Allergic Rhinitis, Fungal Infections)**: Restricted surveillance guardrails. Requires a massive **>100 case volume** and an **>=800% spike** over baseline to register as an anomaly. Crucially, the system enforces a hard architectural guardrail: **Low Danger diseases are permanently capped at `Medium` risk and can never trigger a `High` severity red alert**, regardless of case volume (e.g., even a 2,500% surge in colds remains a Medium advisory).
* **Global ICD-10 Directory Integration**: Backed by a high-performance SQLite relational database (`medisync.db`) containing **71,704 WHO ICD-10 diagnostic codes**, allowing clinicians to search and tag any known medical condition globally while maintaining sub-millisecond local Sri Lankan disease mapping.

---

## 3. Zero-Trust Laboratory Management

The Laboratory Management module establishes a cryptographic, consent-driven diagnostic pipeline between prescribing clinicians, diagnostic laboratories, and patients, ensuring test results remain strictly confidential and tamper-evident.

### Core Capabilities & Technical Highlights:
* **OTP-Gated Patient Consent Workflow (`requireOTP.js` & `PatientAccessModal.jsx`)**: In adherence to zero-trust privacy principles, laboratory technologists and doctors cannot view a patient's historical lab catalog or clinical records without explicit, real-time patient consent. When access is requested, the system generates an ephemeral 6-digit One-Time Password (OTP) dispatched via SMS/email (`OTPSession.js`). The clinician must input this token into a verification modal to unlock a temporary, in-memory access token valid only for the duration of the active session.
* **Pending Test Order Lookups & Workflow Tracking**: Laboratory technologists access a centralized facility queue (`LabManagement.jsx`) displaying all pending diagnostic orders issued by affiliated doctors. Orders are filterable by patient NIC, receipt number, or urgency status (`Stat` vs. `Routine`), providing clear visibility into diagnostic bottlenecks.
* **AES-256-GCM Envelope Encryption at Rest**: Before any laboratory report PDF is uploaded to cloud storage (Cloudinary), it undergoes client-side/server-side envelope encryption (`pdfGenerator.js` & `versionedEncryption.js`):
  1. The PDF binary is encrypted in server memory using an ephemeral **Data Encryption Key (DEK)** via AES-256-GCM.
  2. The DEK is subsequently encrypted using the master **Key Encryption Key (KEK)** managed by HashiCorp Vault.
  3. Only the encrypted ciphertext payload is transmitted to Cloudinary. The cloud storage provider never receives raw plaintext documents or decryption keys, guaranteeing complete data sovereignty and zero-trust cloud storage.
* **Structured Measurement Tracking**: In addition to PDF report attachments, technologists input discrete numerical lab measurements (e.g., Fasting Blood Sugar: `110 mg/dL`, Hemoglobin: `13.5 g/dL`) directly into structured schemas (`LabTest.js`), enabling automated reference range flagging (`Normal`, `High`, `Low`, `Critical`) and longitudinal patient charting.

---

## 4. Smart Pharmacy Dispensing

The Pharmacy Dispensing module prevents medication errors, unauthorized prescription refills, and inventory discrepancies by connecting licensed pharmacists directly to the verified E-Prescription network.

### Core Capabilities & Technical Highlights:
* **NIC Blind-Index Lookups (`versionedEncryption.js`)**: To locate a patient's pending prescriptions without exposing raw National Identity Card (NIC) numbers or storing searchable plaintext PII in MongoDB, the pharmacy portal utilizes cryptographic **Blind Indexing**. When a pharmacist inputs an NIC, the system generates a deterministic `HMAC-SHA256` hash using a secret pepper, executing an indexed database lookup against `patient.nic_blind_index` in sub-millisecond time while preserving encryption-at-rest across all demographic fields.
* **Double-Dispense Prevention Engine**: Each prescription item maintains an atomic, stateful lifecycle (`Pending` $\rightarrow$ `Partially Dispensed` $\rightarrow$ `Fully Dispensed`). When a pharmacist fulfills a prescription, the backend (`pharmacyController.js`) executes a transactional lock, updating the fulfillment status and recording the exact dispensing timestamp and pharmacy license number. If a patient attempts to present the same prescription barcode at another facility, the system blocks the transaction and displays a double-dispensing warning.
* **Expiry Enforcement & Batch Tracking**: Pharmacists log medication batch numbers and expiration dates during inventory onboarding. During the dispensing verification workflow, the system automatically validates batch expiration timestamps, physically blocking the dispensing of expired or near-expiry pharmaceuticals and triggering automated restocking alerts.
* **Inventory Depletion & Drug Substitution Logging (`Dispensing.js`)**: When a prescribed brand-name drug is out of stock, licensed pharmacists can select an approved generic equivalent from the integrated pharmaceutical catalog (`Drug.js`). The system mandates that the pharmacist record a formal substitution reason, which is permanently logged in the dispensing audit trail and transmitted as an informational notification to the prescribing clinician.

---

## 5. Public Directories & 5-Star Reviews

MediSync promotes healthcare transparency and accessibility by providing citizens with open, unauthenticated public search portals and verified quality feedback mechanisms.

### Core Capabilities & Technical Highlights:
* **Public Search Rosters for Healthcare Providers (`publicRoutes.js`)**: Citizens can explore interactive, high-speed directories for verified Doctors, Hospitals, and Pharmacies across all 25 Sri Lankan administrative districts. Directories feature responsive filtering by medical specialization (e.g., *Cardiology, Pediatrics, Dermatology*), district location (e.g., *Colombo, Kandy, Galle*), operational hours, and facility type (`Private` vs. `Government`).
* **Google Maps Interactive iframe Integrations**: Every hospital and pharmacy profile modal (`HospitalProfileModal.jsx`, `PharmacyProfileModal.jsx`) embeds an interactive Google Maps iframe dynamically centered on the facility's verified geographical coordinates, enabling seamless geolocation navigation and route planning for patients in emergency situations.
* **Interactive 5-Star Patient Rating & Review System (`RateConsultationModal.jsx`)**: Following the completion of a consultation or laboratory test, authenticated patients are invited to submit a structured 5-star rating and qualitative review evaluating clinician bedside manner, facility cleanliness, and diagnostic punctuality.
* **Runtime Patient Name Denormalization (`reviewController.js`)**: To uphold patient privacy while preventing review database bloat and maintaining synchronization with encrypted patient profiles, review documents store only the immutable `patient_id` reference. When public directories or clinician profiles are rendered, the backend executes a high-speed runtime denormalization join, decrypting the patient's full name in memory and masking it (e.g., *C. Alwis* or *Anonymized Patient*) before serving it to the frontend DOM.

---

## 6. Super Admin Command Center

The Super Admin Command Center provides platform operators and Ministry of Health officials with total visibility, governance, and emergency communication capabilities across the entire national healthcare network.

### Core Capabilities & Technical Highlights:
* **Unified Session Monitor (`SessionMonitor.jsx`)**: A consolidated administrative surveillance interface featuring an instant tab-toggle architecture. It merges the **Online Now** real-time session tracking dashboard with the **Audit Log** system, providing administrators with immediate visibility into active platform users, hardware device models, connection IP states, and the ability to instantly force-logout compromised accounts via targeted Socket.io events.
* **Intelligent Login Notifications (`emailService.js` & `authController.js`)**: A comprehensive email notification system active across all roles (Admin, Doctor, Patient, Hospital, Pharmacy). Upon successful authentication, users instantly receive a responsive HTML email detailing the login timestamp, identifier (NIC/License/Reg No.), device model, and approximate IP location.
  * **Context-Aware Workspace Routing**: For clinicians, the system dynamically routes "Hospital Login" notifications directly to the affiliated organization's email address when switching workspaces, while maintaining default "Individual Login" alerts for personal logins.
* **Tamper-Proof Immutable Audit Logs (`AuditLog.js` & `AuditLog.jsx`)**: Every critical system event—including clinician login attempts, OTP patient data unlocks, prescription fulfillments, administrative privilege elevations, and database schema queries—is automatically recorded in an append-only audit collection. Each log entry captures the actor's ID, role, target resource, exact timestamp, action description, and originating IP address, ensuring complete forensic accountability.
* **Granular User Ban & Governance System (`BanManagement.jsx` & `BanRecord.js`)**: Administrators can issue temporary or permanent account suspensions against compromised or violating doctor, hospital, pharmacy, or patient accounts. The ban workflow requires administrators to input a detailed justification note and select a violation category. Suspended users are instantly terminated from active WebSocket channels and presented with an informative restriction modal (`BanNotice.jsx`) upon subsequent login attempts.
* **District-Wide Emergency Broadcast Messaging (`Broadcast.jsx` & `Socket.io`)**: In the event of a severe epidemiological outbreak (such as a localized Dengue epidemic in Colombo), super administrators can utilize the Emergency Broadcast portal to dispatch high-priority alerts. The system leverages **Socket.io WebSockets** (`notificationService.js`) to push instant, floating real-time notifications (`ActiveOutbreakBanner.jsx`) to all online medical facilities and citizens currently connected within the targeted geographical district, supplemented by automated email and SMS dispatches.
* **Real-Time System Health Metrics (`AnalyticsDashboard.jsx`)**: An executive graphical monitoring dashboard built with Recharts, displaying live operational telemetry including daily consultation volumes, lab test turnaround times, active user distribution across districts, server CPU/memory load, and ML engine prediction latency.

---

## 7. Security & Cryptographic Architecture

MediSync is engineered from the ground up upon a defense-in-depth, zero-trust security model designed to exceed international healthcare data protection standards and comply with Sri Lankan PDPA regulations.

### Core Capabilities & Technical Highlights:
* **In-Memory JWT Session Management (No `localStorage`)**: Addressing a primary web storage vulnerability where XSS scripts can exfiltrate tokens from browser `localStorage`, MediSync strictly prohibits persistent client-side token storage. Authentication JSON Web Tokens (JWTs) are maintained exclusively inside short-lived React in-memory state (`PatientAccessContext.jsx` & `AuthContext`). When a browser tab closes or a session times out, the cryptographic token is instantly wiped from memory, rendering stolen device attacks ineffective.
* **HashiCorp Vault Multi-Key Versioning (`versionedEncryption.js`)**: Cryptographic keys are never hardcoded or stored in plaintext database configuration files. The backend integrates with an external **HashiCorp Vault** instance (`node-vault`) to manage cryptographic key lifecycles. Key encryption uses an explicit versioning architecture (`v1`, `v2`, etc.), allowing administrators to execute live cryptographic key rotations (`rotateKeys.js`) and re-encrypt existing database records without incurring system downtime or data loss.
* **Express 5 In-Place Query Sanitization (`app.js`)**: In modern Express 5.x architectures, the `req.query` object is strictly read-only by default, which causes legacy NoSQL injection sanitizers (like `express-mongo-sanitize`) to crash when attempting to reassign sanitized objects. MediSync implements a proprietary recursive sanitation engine (`sanitizeInPlace`) that traverses incoming query parameters, body payloads, and URL params in place, stripping out MongoDB operator characters (`$`, `.`) to permanently neutralize NoSQL injection attacks.
* **Redis-Backed API Rate Limiting & DDoS Protection (`redis.js` & `rate-limit`)**: All public-facing API gateways, authentication endpoints (`/api/auth/*`), and OTP verification routes are shielded by high-speed Redis in-memory rate limiters. The system enforces strict sliding-window request ceilings (e.g., maximum 5 login attempts per 15 minutes per IP fingerprint), automatically blacklisting abusive IP addresses and preventing brute-force credential stuffing or denial-of-service floods.
* **Cryptographic Blind Indexing for Encrypted PII**: To resolve the fundamental database conflict between strong encryption-at-rest (which randomizes ciphertext on every write via initialization vectors) and high-speed indexing, MediSync separates Personally Identifiable Information (PII) into dual storage layers:
  1. **Encrypted Payload**: Patient names, NICs, dates of birth, and medical histories are encrypted using AES-256-GCM with unique initialization vectors, rendering raw database dumps completely unreadable.
  2. **Blind Index**: For searchable unique identifiers (such as Sri Lankan NIC numbers), the system computes a deterministic `HMAC-SHA256` token combining the lowercase NIC string with a high-entropy server-side pepper (`nic_blind_index`). MongoDB indexes this un-reversable hash, enabling sub-millisecond exact-match patient lookups without ever exposing plaintext identity data to database administrators or cloud storage providers.

---
*End of Feature Breakdown Documentation.*