# MediSync — Project Review

> **A HIPAA-Aligned, AI-Driven National Health Information System for Sri Lanka**

---

## 1. Executive Summary

**MediSync** is a full-stack, enterprise-grade Health Information System (HIS) designed to digitize and secure Sri Lanka's healthcare ecosystem. It connects **patients, doctors, hospitals, pharmacies, and government health authorities** onto a single encrypted platform — replacing paper records, phone calls, and manual processes with a zero-trust digital architecture.

The platform solves three critical problems in the Sri Lankan healthcare system:

1. **Fragmented Medical Records** — Patients carry physical prescription slips between hospitals and pharmacies. MediSync replaces this with NIC-locked e-prescriptions and a unified patient timeline.
2. **No Early Warning System** — Disease outbreaks are detected weeks late through manual reporting. MediSync uses machine learning to detect anomalies in consultation data within hours, triggering automated district-level alerts.
3. **Zero Accountability** — No audit trail exists for who accessed patient data. MediSync logs every authenticated API request to a tamper-proof, append-only audit database.

### Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18 + CSS3 | Glassmorphic, role-based dashboard SPA |
| Backend | Node.js + Express 5 | RESTful API with 13 route groups |
| Database | MongoDB (Mongoose 9) | Document store with field-level AES-256 encryption |
| ML Engine | Python Flask + scikit-learn | Disease prediction, drug interactions, outbreak detection |
| Security | HashiCorp Vault | AES-256 encryption key management |
| OTP Store | Redis 7 (with in-memory fallback) | Persistent OTP storage surviving server restarts |
| File Storage | Cloudinary (Authenticated) | Signed-URL-gated medical document storage |
| Real-time | Socket.IO | Live outbreak alerts and broadcast notifications |
| Email | Nodemailer + Enterprise SMTP | Generic SMTP transactional email dispatch with 10 branded HTML templates |

---

## 2. Core Features

### 2.1 Zero-Trust Lab Test Management

MediSync implements an **OTP-gated Lab Test Approval Workflow** combined with **Envelope Cryptography** to secure medical reports. Hospitals do not create tests from scratch; they approve tests prescribed by doctors, ensuring full patient consent and authorization.

**Workflow:**
1. **NIC & Pending Search**: The hospital admin searches the patient's pending test orders using their NIC.
2. **Consent OTP Request**: The system hashes the NIC to check the blind index, generates a secure 6-digit consent OTP, and emails it to the patient's registered email.
3. **Approval Flow**: The patient provides the OTP to the admin. Upon OTP verification, the backend fetches the pending doctor-prescribed tests and the hospital admin approves the test order.
4. **Lab Report Upload**: The lab technician queries the test by its unique `reportId` (Option B search key) and uploads the PDF report.
5. **Envelope Encryption**: The backend generates a random 256-bit AES key and a 12-byte IV. It encrypts the PDF buffer in memory using `aes-256-gcm` and uploads the encrypted blob to Cloudinary (`type: 'authenticated'`). The AES file key is then encrypted (wrapped) with the HashiCorp Vault master key using `aes-256-cbc` and saved in MongoDB.
6. **Secure Download**: Patients can download their decrypted reports via the unified timeline, while doctors can request access which triggers a doctor-specific OTP download lifecycle.

**Security Layers:**
- **Patient Consent OTP**: Verified via Speakeasy TOTP and cached securely using Redis (with in-memory fallback).
- **In-Memory Envelope Encryption**: AES-256-GCM file encryption prevents plaintext reports from touching persistent disk storage or being readable on Cloudinary.
- **Master Key Protection**: File decryption keys are wrapped using the master key managed by HashiCorp Vault.
- **Signed URL Cloudinary Storage**: Authenticated access blocks public listing of report directories.
- **Restricted Search Keys**: Technicians search strictly via `reportId` instead of patient NICs to prevent bulk search leaks.

### 2.2 AI-Powered Consultation & Diagnosis

The doctor consultation module is a **multi-step wizard** that integrates machine learning at every stage:

**Step 1: Patient Lookup** — Doctor enters patient NIC; system retrieves the full medical history via blind-index hash.

**Step 2: Symptoms & Vitals** — Tag-based symptom input with autocomplete from a curated symptom database. Vitals capture: BP, heart rate, temperature, SpO₂, weight, height.

**Step 3: AI Diagnosis** — Symptoms are sent to the ML engine which runs an **ensemble of 3 models**:
- RandomForest Classifier (trained on 4,920 symptom-disease mappings)
- DecisionTree Classifier (secondary model)
- Rules Engine (hardcoded mappings for Dengue, COVID-19, Malaria, Typhoid, etc.)

The doctor receives a ranked list of predicted diagnoses with confidence scores and selects/modifies the final diagnosis.

**Step 4: Prescription** — Drug search with autocomplete. Real-time **drug-drug interaction checking** (severity levels: mild, moderate, severe, contraindicated). Allergy cross-referencing against patient records.

**Step 5: Release** — NIC-locked PDF e-prescription generated and emailed to patient. Anonymized consultation data sent to ML engine for population-level outbreak surveillance.

### 2.3 Smart Pharmacy Dispensing

**For Pharmacists:**
- NIC-based prescription search with blind-index querying
- Double-dispense prevention (status check before dispensing)
- Prescription expiry enforcement (30-day default validity)
- Alternative medication flagging with reason capture
- Inventory auto-decrement on dispense
- Receipt number generation (`RX-YYYYMMDD-XXXXXX`)

**For Patients:**
- Email notification on every dispense event
- Dispensing history with pharmacy name, pharmacist ID, and timestamp
- Alternative medication transparency

**For Analytics:**
- ML-powered restock prediction using time-series analysis
- District-level restock alerts
- Top-dispensed drug ranking

### 2.4 ML-Powered Outbreak Detection

The system runs **automated outbreak surveillance** every 2 hours via a cron job:

1. Aggregates consultation diagnoses by district over 30 days
2. Computes 7-day spike vs 23-day baseline
3. Sends data to ML engine for statistical anomaly detection
4. If an anomaly is detected (z-score > 2):
   - Creates an `OutbreakAlert` record with severity classification
   - Triggers mass email to all healthcare workers in the affected district
   - Emits a real-time Socket.IO event to all connected dashboards
   - Creates a `BroadcastMessage` for persistent notification history

**Admin Feedback Loop:** Administrators can mark alerts as `confirmed` or `false_positive`, and this feedback is sent back to the ML engine for model improvement.

### 2.5 Government Super Admin Dashboard

The Super Admin has a unified command centre with:

| Feature | Description |
|---|---|
| **User Management** | View, search, activate/deactivate users across all roles |
| **Ban System** | Temporary or permanent account suspension with reason tracking |
| **Audit Logs** | Searchable, filterable, paginated audit trail of all API requests |
| **Outbreak Alerts** | Active/historical alert management with manual trigger capability |
| **System Health** | Uptime, memory usage, MongoDB/Redis connection status |
| **Broadcast System** | Send priority messages to specific roles/districts via Socket.IO |
| **Analytics** | Patient registration growth, top doctors, dispensing rates, top drugs |
| **Data Export** | JSON export of consultations, prescriptions, and lab tests |

### 2.6 Public Directories, Profile Settings & 5-Star Reviews

MediSync provides public search rosters for Doctors, Hospitals, and Pharmacies, making it easy for citizens to find healthcare providers. It includes an interactive review feedback loop:

1. **Provider Customization Settings & Location Details:** Doctors, Hospital Admins, and Pharmacy Admins can modify their description profiles, specialty information, clinical hours, and upload photos/logos directly to Cloudinary. They can also register their `googleMapsUrl` and `pickupLocationAddress` to guide patients to their facilities.
2. **Affiliated Roster Mapping:** Enrolling doctors dynamically associates them with hospital records. Public rosters display these linkages automatically (e.g., matching doctors with clinics and districts).
3. **Interactive 5-Star Reviews & Consultation Lock-in:** Logged-in patients can submit star ratings (1 to 5) and written feedback comment text on any provider's public profile modal. Additionally, the patient history timeline (`History.jsx`) features a unified `RateConsultationModal` to rate the Doctor, Hospital, and Pharmacy involved in a specific consultation. This modal checks for existing submissions by `consultationId` to lock editing and prevent duplicate rating submissions.
4. **Google Maps Iframe Embeds & Pickup Indicators:** Provider profile modals dynamically parse Google Maps links into secure embed URLs via a `getEmbedMapUrl` utility, rendering an interactive map iframe. Prescription pickup locations are highlighted with distinct emerald-colored map-pin icons.
5. **Automated Score Aggregation:** Submitting a review recalculates the average rating score and total count for that provider in the database, ensuring directory cards render updated status stars instantly without on-the-fly computation.
6. **SelectRole Navigation:** The `SelectRole.jsx` screen mounts the fixed `PublicNavbar` with appropriate container padding, letting portal visitors seamlessly transition back to the public search directories.
7. **Batch N+1 Prevention & Denormalization:** The system aggregates reviews using bulk `$in` queries. To eliminate runtime name decryption overhead, patient names are decrypted once at review creation and stored in a plaintext `reviewerName` field on the review itself.

### 2.7 HIPAA-Compliant Help Desk & Support Ticketing

The system includes a zero-trust support desk that enables patients to communicate securely with platform administrators:

1. **Ticket Initiation:** Patients submit inquiries (specifying a subject and description) via `/patient/dashboard/support`. Tickets are saved with an initial status of `'Open'`.
2. **Administrative Support Roster:** System Administrators manage queries in `/admin/dashboard/support`.
3. **Zero-Trust Identity Decryption:** To maintain strict HIPAA compliance, patient full names are stored encrypted in the database. During administrative review, the name is decrypted in-memory using `decryptFieldsSync()` so admins can address the patient personally without leaking plaintext identities into system logs.
4. **Resolution Response:** Admins submit replies which automatically close the ticket (`'Closed'`) and log the timestamp.
5. **SMTP-Gated Transactional Email:** Closing a ticket automatically triggers a branded SMTP email notification containing the ticket details and admin response, delivered securely to the patient's inbox.

---

## 3. Security & Compliance

### 3.1 Encryption Architecture

```
┌─────────────────────────────────────────────────────┐
│                 HashiCorp Vault                      │
│            (AES-256 Key Storage)                     │
│       secret/data/medisync → AES_ENCRYPTION_KEY      │
└────────────────────┬────────────────────────────────┘
                     │ Fetched at server startup
                     ▼
         ┌───────────────────────┐
         │   global.ENCRYPTION_KEY   │
         └────────────┬──────────┘
                      │
     ┌────────────────┼────────────────┐
     ▼                ▼                ▼
  Patient          Consultation     Prescription
  ├─ fullName      ├─ patientNic    ├─ patientNic
  ├─ contactInfo   ├─ diagnosis     ├─ drugName
  └─ allergies     └─ notes         └─ dosage
```

**Deferred Require Pattern:** All internal `require()` calls are placed *inside* the async `startServer()` function — after `global.ENCRYPTION_KEY` is set. This prevents Mongoose's `fieldEncryption` plugin from capturing `undefined` as the secret.

### 3.2 Blind Index Pattern

Encrypted fields cannot be queried directly. MediSync solves this with **SHA-256 blind indexes**:

```
Patient NIC: "200012345678"
     │
     ├──→ Encrypted (AES-256) → stored in `patientNic` field
     │
     └──→ SHA-256 Hash → stored in `patientNic_bi` field
               │
               └──→ Used for all database queries
```

This pattern is applied across `Consultation`, `Prescription`, `LabTest`, and `TestOrder` models.

### 3.3 Redis OTP Store

| Feature | Implementation |
|---|---|
| **Storage** | Redis `SETEX` with 600-second TTL |
| **Fallback** | In-memory `Map` with manual expiry checking |
| **Namespacing** | `medisync:otp:hospital:` and `medisync:otp:doctor:` prefixes |
| **Consumption** | One-time use — deleted after successful verification |
| **Initialization** | Non-blocking — server starts even if Redis is unavailable |

### 3.4 Session-Based JWT Authentication

MediSync uses a **dual-layer auth system**:

1. **JWT Token** — Signed with `JWT_SECRET`, contains `id`, `role`, `email`
2. **SessionToken DB Record** — SHA-256 hash of the JWT stored in MongoDB with `isValid` flag

This enables **server-side session revocation** — even if a JWT hasn't expired, the session can be invalidated by setting `isValid: false`.

### 3.5 Audit Logging

Every authenticated API request is logged to a **capped MongoDB collection** (100MB / 100,000 documents):

| Field | Content |
|---|---|
| `actorId` | User's database ID |
| `actorRole` | `doctor`, `patient`, `hospitalAdmin`, etc. |
| `action` | `POST /api/lab/accept`, `GET /api/patient/timeline` |
| `accessedNic` | Patient NIC being accessed (if applicable) |
| `ipAddress` | Request IP address |
| `timestamp` | Automatic timestamp |

**Capped collections** are append-only — they cannot be modified or deleted, providing tamper-proof HIPAA-grade audit trails.

### 3.6 Cloudinary Signed URLs

Medical documents uploaded to Cloudinary use `type: 'authenticated'` — they are **not publicly accessible** via URL. Downloads require a **time-limited signed URL** (5-minute expiry) generated server-side:

```javascript
cloudinary.url(publicId, {
  sign_url: true,
  expires_at: Math.floor(Date.now() / 1000) + 300,
  type: 'authenticated',
  secure: true,
});
```

### 3.7 Internal Service Authentication

Backend → ML Engine communication uses **HMAC-SHA256 time-rotating tokens**:
- Token = HMAC of the current hour string (`YYYY-MM-DDTHH`)
- 1-hour overlap window prevents clock-skew failures
- Sent via `x-internal-key` header

---

## 4. Email Notification System

MediSync sends **10 types of branded HTML emails** throughout the patient journey:

| Email Type | Trigger | Recipient |
|---|---|---|
| Welcome Email | New user registration | Patient/Doctor/Pharmacist |
| OTP Email | Doctor 2FA login | Doctor |
| Lab Consent OTP | Hospital requests lab test consent | Patient |
| Lab Status Update | Every lab test status change | Patient |
| Lab Report Ready | Encrypted report uploaded | Patient |
| E-Prescription | Doctor releases consultation | Patient |
| Dispense Notification | Pharmacy dispenses medication | Patient |
| Follow-up Reminder | 2 days before scheduled follow-up | Patient |
| Outbreak Alert | ML detects disease anomaly | All healthcare workers in district |
| Support Response | Administrator replies to support inquiry | Patient |

---

## 5. Background Automation

Five cron jobs run continuously:

| Schedule | Job | Description |
|---|---|---|
| Hourly | Prescription Expiry | Expires unfilled prescriptions past their 30-day validity |
| Every 6 hours | Patient Risk Scoring | Calculates composite risk scores based on age, chronic conditions, and consultation frequency |
| Daily 8 AM | Follow-up Reminders | Emails patients 2 days before scheduled follow-up appointments |
| Every 30 minutes | OTP Cleanup | Purges expired OTP sessions from MongoDB |
| Daily 2 AM | Outbreak Detection | Full ML-powered outbreak surveillance cycle |

---

## 6. Future Enhancements

### Phase 2 — Geographic Outbreak Visualization
- **Interactive Heatmap Dashboard**: Real-time geographic visualization of disease density across Sri Lanka's 25 districts using Leaflet.js or Google Maps API
- **Predictive Outbreak Modeling**: Extend the current z-score detection to Prophet-based time-series forecasting for 7-day outbreak prediction
- **Cross-District Correlation**: Detect spreading patterns when adjacent districts show correlated spikes

### Phase 3 — Telemedicine Integration
- **Video Consultation Module**: WebRTC-based video calls between doctors and patients with screen sharing for lab reports
- **Digital Stethoscope Support**: IoT integration for remote vitals capture during teleconsultation
- **Multi-language Support**: Sinhala and Tamil translation for rural patient accessibility

### Phase 4 — Advanced Analytics
- **Patient Risk Prediction**: Deep learning model trained on longitudinal patient data to predict hospital readmission risk
- **Drug Efficacy Tracking**: Population-level analysis of treatment outcomes per diagnosis-drug combination
- **Hospital Performance Benchmarking**: Comparative analytics across government/private hospitals by district

### Phase 5 — Mobile & Interoperability
- **React Native Mobile App**: Offline-capable patient app with biometric authentication for report access
- **HL7 FHIR Compliance**: Standard healthcare data exchange format for interoperability with existing hospital EHR systems
- **National Health ID Integration**: Linking MediSync with Sri Lanka's proposed National Digital Health ID program

---

## 7. Test Coverage

### 7.1 Integration Testing (Backend API)

```
Test Suites:  1 passed, 1 total
Tests:        24 passed, 24 total
Time:         142.358s
```

The lab module has 24 automated integration tests covering:
- OTP-gated lab test registration (consent flow)
- OTP expiry and consumption validation
- Status lifecycle transitions
- Report upload and download
- Public status check

### 7.2 E2E Testing (Playwright Frontend & Backend Integration)

An automated, serial E2E test suite consisting of 18 comprehensive tests has been created at [medisync-live.spec.js](file:///c:/Users/chamo/Desktop/Final%20project/medisync/client/tests/medisync-live.spec.js) to validate frontend user interfaces and complete backend integration under real browser behaviors.

#### E2E Refactoring & Stability Outcomes
To eliminate random timeouts, race conditions, and selector fragility, the entire E2E test suite has been refactored for **100% stable sequential execution in serial mode**:
- **Robust Doctor Workspace Selector**: Replaced simple checks with a robust 3-second `try-catch` visibility waiter for the "Personal Clinic" workspace button (`button:has-text("Personal Clinic")`), degrading gracefully if already selected in the local storage session.
- **Concurrency Request Wrapping**: Wrapped crucial UI interactions in `Promise.all` alongside network response checkers. This eliminates race conditions by guaranteeing the backend resolves requests before the test suite proceeds. Target interactions include symptom disease prediction (`/api/doctor/predict-disease`), lab OTP verification (`/api/lab/hospital/verify-fetch-tests`), technician fetches, raw PDF file uploads (`/upload-report`), pharmacist dispense confirmations (`/api/pharmacy/dispense`), and administrative searches.
- **Brittle Selectors & Regex Fixes**: Fixed fragile selectors such as matching input placeholders using case-insensitive partial checks (`input[placeholder*="Dengue" i]`) and resolved invalid regex text selectors (`text=/System normal|.../i`).

#### Patient Sidebar Props & Real-time Alert Bell Validation
During E2E verification, a critical frontend-backend rendering mismatch was discovered and patched:
- **Sidebar Integration Bug**: The patient portal (`client/src/pages/patient/Dashboard.jsx`) was mounting the `<Sidebar />` component without passing `userName` and `userRole` props. This caused the user profile badge to remain hidden, which in turn hid the nested `<NotificationBell />` component and blocked testing of real-time alerts.
- **Resolution**: Patched `Dashboard.jsx` to pass `userName={data?.patient?.fullName}` and `userRole="Patient"` to `<Sidebar />`. This restored the user badge and the notification bell, allowing the Playwright test suite to successfully find and click the bell, validating Socket.IO real-time alert broadcasts.

#### Test Scope Covered by the 18 Sequential Tests:
- **Auth & Access Verification:**
  - Duplicate Patient Onboarding Blocks (NIC/Email registration reject validation).
  - Multi-Role RBAC Enforcement (Patient block on doctor endpoints).
  - Session Revocation Checks (JWT logout invalidation validated at API level).
- **Clinical & Diagnostic Intel:**
  - Patient lookup, consent OTP, vital entry, and symptom ML diagnostic checkouts.
  - Multi-drug prescribing with real-time drug interaction warning banners.
- **Laboratory Status Lifecycles:**
  - Consent OTP approvals, lab technician report searching, status updates, and encrypted PDF report uploads.
  - OTP-gated Doctor lab report retrieval, decrypting and streaming PDFs.
- **Smart Pharmacy Dispensing:**
  - NIC-based prescription lookups and direct dispensing.
  - Brand/Medication alternative substitutions (dispensing alternative medications with detail tracking).
  - Double fulfillment prevention checks (API level 400 error blocks).
  - Expired prescription rejection (database expiration checks and button blocks).
- **Administrative & Surveillance Controls:**
  - Super Admin audit log filtering by role.
  - District/Role-specific Socket.IO broadcast deliveries to patient notification bells.
  - On-demand outbreak trigger executions (ML Z-score surveillance checks).

### 7.3 DevOps Integration & UI/UX Polish

#### CI/CD Pipeline
An automated GitHub Actions workflow (`.github/workflows/playwright.yml`) has been established to run on every push to the `main` branch. This pipeline guarantees code correctness and security standards automatically:
1. **Dockerized Service Dependencies**: Spins up MongoDB and Redis in container services.
2. **Key Storage & Cryptography**: Runs a HashiCorp Vault dev server container in the background to serve the encryption keys.
3. **Execution**: Builds the client and server projects, installs Playwright browsers, and runs the E2E test suite in headless mode.

#### UI/UX Animation Upgrades
- Added Framer Motion page transitions on all main dashboards (`Patient`, `Doctor`, `Hospital`, `Pharmacy`, `Admin`) to support smooth route changes.
- Added premium CSS hover lifting effect `.hover-lift` and scale transition on all directory search cards and main dashboard interactive panels.
- Fixed the Google Analytics `REACT_APP_GA_MEASUREMENT_ID` warning message in development consoles by removing placeholder warning triggers.

#### Codebase Hygiene & Cleanup
- Consolidated duplicate component files (moved `PageTransition.jsx`, `Sidebar.jsx`, and `StatCard.jsx` strictly into the `common/` subdirectory).
- Removed unused dead-code templates such as `LoadingSkeleton.jsx`.
- Standardized the Express server controllers, guaranteeing clean MVC structure without routing clutter.

---

*MediSync — Securing Sri Lanka's Health Data, One Encrypted Record at a Time.*
