# MediSync — Technical Codebase Documentation

> Complete architectural reference for developers, code reviewers, and university grading panels.

---

## Table of Contents

1. [Directory Map](#1-directory-map)
2. [Architecture Overview](#2-architecture-overview)
3. [Backend Module Breakdown](#3-backend-module-breakdown)
4. [Frontend Module Breakdown](#4-frontend-module-breakdown)
5. [ML Engine Module Breakdown](#5-ml-engine-module-breakdown)
6. [Data Flow Diagrams](#6-data-flow-diagrams)
7. [Database Schema Reference](#7-database-schema-reference)
8. [Security Architecture](#8-security-architecture)

---

## 1. Directory Map

```
medisync/
├── .github/
│   └── workflows/
│       └── playwright.yml          # GitHub Actions CI/CD E2E test workflow
├── package.json                    # Root orchestrator (concurrently runs all services)
├── docker-compose.yml              # Vault + Redis + ML Engine containers
├── PROJECT_REVIEW.md               # Business/Academic documentation
├── BUG_REPORT.md                   # Security & Performance audit report
├── CODEBASE.md                     # This file (Technical Codebase Documentation)
│
├── client/                         # ── React 18 Frontend ──
│   └── src/
│       ├── App.js                  # Route definitions + PrivateRoute guard
│       ├── index.js                # React DOM entry point
│       ├── index.css               # Global styles (glassmorphic theme)
│       ├── api/
│       │   └── axiosInstance.js    # Centralized Axios with JWT interceptor
│       ├── components/
│       │   ├── auth/
│       │   │   └── ProtectedRoute.jsx # JWT + role route guard
│       │   └── common/
│       │       ├── Sidebar.jsx        # Role-based navigation sidebar
│       │       ├── NotificationBell.jsx # Real-time notification bell
│       │       ├── ActiveOutbreakBanner.jsx # Real-time outbreak banner
│       │       └── PublicNavbar.jsx   # Public navigation header with routing pills
│       └── pages/
│           ├── Home.jsx            # Landing page
│           ├── Login.jsx           # Universal login
│           ├── SelectRole.jsx      # Role selection screen with PublicNavbar navigation header
│           ├── admin/
│           │   ├── Dashboard.jsx   # Super Admin dashboard
│           │   └── SupportTicketsRoster.jsx # HIPAA support ticketing response center
│           ├── auth/
│           │   └── Register.jsx    # Multi-role registration form
│           ├── doctor/
│           │   ├── Dashboard.jsx   # Doctor dashboard
│           │   ├── NewConsultation.jsx # Multi-step AI consultation wizard
│           │   └── Profile.jsx     # Profile photo & biography settings
│           ├── hospital/
│           │   └── Dashboard.jsx   # Hospital admin dashboard & profile settings
│           ├── patient/
│           │   ├── Dashboard.jsx   # Patient portal dashboard
│           │   ├── History.jsx     # Medical timeline with decrypted downloads & unified multi-rating modal
│           │   ├── Profile.jsx     # Patient profile picture upload panel
│           │   ├── RateConsultationModal.jsx # Unified Doctor, Hospital, & Pharmacy rating modal
│           │   └── Support.jsx     # Help & Support ticket submission client
│           ├── pharmacy/
│           │   └── Dashboard.jsx   # Dispensation, restock analytics & settings
│           └── public/
│               ├── DoctorDirectory.jsx # Public doctor search and rating panel
│               ├── DoctorProfileModal.jsx # Doctor detail modal + review submissions
│               ├── HospitalDirectory.jsx # Public hospital search and reviews panel
│               ├── HospitalProfileModal.jsx # Hospital detail modal + rating submissions
│               ├── PharmacyDirectory.jsx # Public pharmacy search and reviews panel
│               └── PharmacyProfileModal.jsx # Pharmacy detail modal + rating submissions
│   └── tests/
│       └── medisync-live.spec.js   # 18 E2E tests for clinical workflows and RBAC
│
├── server/                         # ── Node.js + Express 5 Backend ──
│   ├── src/
│   │   ├── app.js                  # Server entry point (Vault -> DB -> Redis -> Express)
│   │   ├── config/
│   │   │   ├── db.js               # MongoDB connection setup
│   │   │   └── redis.js            # Redis OTP store + in-memory fallback
│   │   ├── middleware/
│   │   │   └── auth.js             # JWT verification + RBAC + Audit logger
│   │   ├── models/                 # Mongoose Schemas (Patient, Review, SupportTicket, etc.)
│   │   ├── controllers/            # Express controllers (auth, review, support, user, etc.)
│   │   ├── routes/                 # Express route mappings (reviewRoutes, supportRoutes, userRoutes)
│   │   └── utils/                  # Cloudinary, email, PDF generation, cron jobs
│   └── tests/
│       └── lab.test.js             # 24 integration tests for lab lifecycle
│
└── ml-engine/                      # ── Python Flask ML Microservice ──
    ├── app.py                      # Flask service endpoints (predict, check interactions)
    └── data/
        ├── dataset.csv             # Symptom-disease training data (4,920 records)
        └── interactions_clean.json # Drug interaction database (40MB)
```

---

## 2. Architecture Overview


MediSync is structured as a zero-trust split-architecture healthcare platform. It secures patient health records using envelope encryption, indexes records via blind indexes, and leverages a Python ML service for real-time diagnostic and interaction analysis.

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT (React 18)                         │
│   ┌──────┐ ┌──────┐ ┌────────┐ ┌─────────┐ ┌────────┐ ┌──────┐│
│   │Admin │ │Doctor│ │Hospital│ │ Patient │ │Pharmacy│ │Public││
│   │Dash  │ │Conslt│ │  Lab   │ │History  │ │Dispense│ │ Dir  ││
│   └──┬───┘ └──┬───┘ └───┬────┘ └────┬────┘ └───┬────┘ └──┬───┘│
│      └────────┴─────────┴───────────┴──────────┴─────────┘     │
│                              │ Axios + JWT                      │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    BACKEND (Express 5 + Node.js)                 │
│   ┌─────────────┐    ┌─────────────────┐    ┌────────────────┐  │
│   │  Middleware  │    │   Controllers   │    │    Utilities    │  │
│   │ ┌─────────┐ │    │ ┌─────────────┐ │    │ ┌────────────┐ │  │
│   │ │  auth   │ │    │ │   doctor    │ │    │ │ emailSvc   │ │  │
│   │ │(JWT+RBAC│ │    │ │  patient    │ │    │ │ pdfGen     │ │  │
│   │ │+Audit)  │ │    │ │  hospital   │ │    │ │ cronJobs   │ │  │
│   │ └─────────┘ │    │ │   lab       │ │    │ │ cloudinary │ │  │
│   │ └─────────┘ │    │ └─────────────┘ │    └────────────────┘  │
│   └─────────────┘    └────────┬────────┘                        │
│                               │                                 │
│      ┌────────────────────────┼──────────────────────┐          │
│      ▼                        ▼                      ▼          │
│ ┌──────────┐          ┌────────────┐          ┌───────────┐    │
│ │ MongoDB  │          │   Redis    │          │ Socket.IO │    │
│ │(Mongoose)│          │ (OTP Store)│          │(Real-time)│    │
│ └──────────┘          └────────────┘          └───────────┘    │
└───────────────────────────┬──────────────────────────────────────┘
                            │ HMAC-SHA256 Internal Auth
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                  ML ENGINE (Flask + scikit-learn)                 │
│   ┌────────────────┐  ┌───────────────┐  ┌────────────────────┐ │
│   │Disease Predict │  │Drug Interact  │  │ Outbreak Detect    │ │
│   │TF-IDF + Cosine │  │Pairwise check │  │ Threshold z-score  │ │
│   └────────────────┘  └───────────────┘  └────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```


---

## 3. Backend Module Breakdown


### 3.1 Entry Point: `server/src/app.js`
The Express server bootstraps as follows:
1. **HashiCorp Vault Bootstrapping**: Requests the Master Key (`AES_ENCRYPTION_KEY`) from VaultKV. If Vault is offline, falls back to `process.env.ENCRYPTION_KEY`.
2. **Database Initialization**: Binds the global key and initializes MongoDB connections.
3. **Redis OTP Store Initialization**: Starts the Redis service with an in-memory map fallback.
4. **App Initialization & Cron Jobs**: Runs user seeder, registers 5 automated background cron tasks, and starts Express on port 5005.

### 3.2 Key Express Controllers
- **`authController.js`**: Orchestrates authentication, multi-role registration, Speakeasy-based 2FA, and password reset flows.
- **`doctorController.js`**: Orchestrates consultation saves (vitals, symptoms, prescriptions), triggers ML disease prediction fallbacks, generates password-locked e-prescriptions, and spawns `LabTest` documents for any recommended tests.
- **`labController.js`**: Implements the OTP-gated Lab Test Approval Workflow, processes PDF reports using in-memory envelope encryption (AES-256-GCM + Vault unwrapping), and streams decrypted PDFs to patients/doctors.
- **`pharmacyController.js`**: Handles prescription verification, double-dispense prevention, alternative drug substitution logic, and inventory depletion tracking.
- **`adminController.js`**: Provides Super Admin aggregates, audit logs search, district broadcast delivery, and temporary/permanent user suspensions (Ban notice).
- **`reviewController.js`**: Manages patient rating submissions (1-5 stars) and feedback comments for Doctors, Hospitals, and Pharmacies, triggering automated aggregate score updates.
- **`supportController.js`**: Facilitates patient support ticket creation and administrative resolutions, utilizing secure, in-memory identity decryption and dispatching SMTP email response alerts.
- **`userController.js`**: Facilitates user profile customizations, including description edits and Multer/Cloudinary-backed profile picture and logo uploads.


---

## 4. Frontend Module Breakdown


The frontend is a React 18 Single Page Application styled with Vanilla CSS3 glassmorphic design and animated using Framer Motion.

### 4.1 Protected Routing (`client/src/App.js`)
Enforces authorization using the `ProtectedRoute` component. Restricts access to specific sub-dashboards based on the roles stored within the decrypted JWT token.

### 4.2 Dashboard Modules
- **Doctor Consultation Wizard**: A stepper-based clinical wizard implementing tag autocomplete for symptoms, query debouncing for drugs, real-time allergy alerts, and drug interaction banners.
- **Hospital Lab Dashboard**: Consists of two modules:
  1. *Approval Flow*: Requests NIC -> triggers patient OTP -> verifies OTP and fetches pending doctor-ordered tests -> patient consent approval.
  2. *Lab Assistant Upload*: Fetches approved tests strictly by `reportId` -> updates status -> performs drag-and-drop report upload.
- **Patient Portal Dashboard**: Rendered in `Dashboard.jsx`. Displays patient overview stats (active prescriptions, nearest upcoming follow-ups). Connects to `<Sidebar />` by explicitly passing `userName` and `userRole` props, resolving a critical rendering bug. This ensures the user profile badge and the real-time `<NotificationBell />` are correctly rendered and visible to the patient.
- **Patient Timeline**: Rendered in `History.jsx` using a timeline layout. Integrates dynamic colored status badges for lab tests, E-Prescription/Lab Report PDF download buttons, and a "Rate Consultation" button that triggers a unified multi-entity rating flow.
- **Pharmacy Dashboard**: Provides tabs for NIC search dispensing, dispensing logs, manual OTC logs, depletion charts, and restock analytics.
- **Public Directories & 5-Star Reviews**: An open roster for searching doctors, hospitals, and pharmacies. Integrated with a `PublicNavbar` for seamless navigation. Clicking directory cards triggers interactive modals (`DoctorProfileModal`, `HospitalProfileModal`, `PharmacyProfileModal`) displaying profile images, biographies, Google Maps iframe location embeds, specific pickup locations with map-pin icons, and a list of customer reviews. Logged-in patients can submit star ratings (1-5) and feedback comments, which immediately trigger aggregate rating recalculations on the target profile.
- **Patient Help & Support Interface**: Located at `/patient/dashboard/support`, it enables patients to create support inquiries and view historical logs of open or resolved tickets. Resolved tickets display the administrator's reply in a dedicated response card.
- **Admin Support Tickets Console**: Accessible at `/admin/dashboard/support`, this console lists all user support requests. Administrators can view details, decrypt the patient's full name in-memory, and submit a resolution reply which closes the ticket and triggers an SMTP-based response notification to the patient.
- **Profile & Settings Management**: Built into Doctor, Patient, Hospital, and Pharmacy portals. Enables real-time profile picture uploads, facility descriptions, clinic hours, and operating details settings which auto-sync with public-facing directory rosters.

---

## 5. ML Engine Module Breakdown


The ML engine is a Python Flask microservice providing analytical intelligence to the Node.js API.

### 5.1 Flask Endpoints
- **`/api/ml/predict-disease`**: Uses TF-IDF vectorization and cosine similarity to match symptom queries to diseases in `symptom_map.json`.
- **`/api/ml/check-interactions`**: Performs pairwise comparisons of input drugs against `interactions_clean.json` to flag dangerous contraindications.
- **`/analyze-realtime`**: Performs statistical z-score analysis on ingested district consultation logs to trigger outbreak alerts.
- **`/predict-district-demand`**: Pharmacy restock analyzer highlighting depletion risk zones.


---

## 6. Data Flow Diagrams


### 6.1 PDF Envelope Encryption & Upload Lifecycle
This lifecycle guarantees in-memory encryption before data ever touches Cloudinary storage.

```
    ┌──────────────┐
    │ Lab Assistant │
    │   Browser     │
    └──────┬───────┘
           │ POST /api/lab/:labTestId/upload-report
           │ (multipart/form-data: raw PDF file)
           │
           ▼
    ┌────────────────────────────────────────────────────────┐
    │             EXPRESS BACKEND (labController)            │
    │                                                        │
    │  1. Validate labTestId exists in MongoDB               │
    │  2. In-Memory Envelope Encryption:                     │
    │     a. Generate random 256-bit AES key & 12-byte IV.   │
    │     b. Encrypt PDF buffer using `aes-256-gcm`.         │
    │     c. Prepends Auth Tag (16 bytes) to Ciphertext.     │
    │                                                        │
    │  3. Upload encrypted blob to Cloudinary:               │
    │     cloudinary.uploader.upload_stream({                │
    │       resource_type: 'raw',                            │
    │       type: 'authenticated'  ← SECURE SIGNED URL ONLY  │
    │     })                                                 │
    │                                                        │
    │  4. Encrypt File AES key with Vault Master Key:        │
    │     Vault key = global.ENCRYPTION_KEY                  │
    │     Cipher = `aes-256-cbc`                             │
    │                                                        │
    │  5. Save to MongoDB (LabTest document):                │
    │     ├─ reportPath:       cloudinaryResult.url          │
    │     ├─ reportPublicId:   cloudinaryResult.public_id    │
    │     ├─ fileIV:           GCM IV (hex)                  │
    │     ├─ encryptedFileKey: CBC-encrypted AES key (hex)   │
    │     └─ status:           'report_ready'                │
    │                                                        │
    │  6. Send confirmation email to patient                 │
    │  7. Return 200 OK                                      │
    └────────────────────────────────────────────────────────┘

    ─── PATIENT/DOCTOR DOWNLOAD FLOW ───

    ┌──────────────┐
    │ Patient/Doc  │
    │   Browser    │
    └──────┬───────┘
           │ GET /api/lab/patient/download-report/:reportId (Patient)
           │ GET /api/lab/doctor/download/:labTestId (Doctor with OTP)
           │
           ▼
    ┌────────────────────────────────────────────────────────┐
    │             EXPRESS BACKEND (labController)            │
    │                                                        │
    │  1. Verify access permissions / OTP validity           │
    │  2. Generate signed URL for Cloudinary asset           │
    │  3. Fetch encrypted PDF blob from Cloudinary           │
    │  4. Decrypt wrapped file key:                          │
    │     Decipher `encryptedFileKey` using Vault Master Key │
    │  5. Decrypt PDF blob:                                  │
    │     Decipher PDF ciphertext with unwrapped file key    │
    │     and stored `fileIV` (checking Auth Tag integrity)   │
    │  6. Stream decrypted PDF file to user browser          │
    └────────────────────────────────────────────────────────┘
```


---

## 7. Database Schema Reference


### 7.1 Field-Level Cryptography Schemas (AES-256)
- **`Patient.js`**: Encrypts `fullName`, `contactInfo`, and `allergies`. Indexes via `patientNic_bi` (Blind Index).
- **`Consultation.js`**: Encrypts `patientNic`, `diagnosis`, and `notes`. Indexes via `patientNic_bi`.
- **`Prescription.js`**: Encrypts `patientNic`, `drugName`, and `dosage`. Indexes via `patientNic_bi`.
- **`LabTest.js`**: Encrypts `patientNic`, `patientName`, and `patientEmail`. Indexes via `patientNic_bi`. Tracks `status`, `reportId`, `encryptedFileKey`, and `fileIV`.

### 7.2 Special Collections
- **`AuditLog.js`**: MongoDB Capped collection restricted to 100MB, serving as a read-only, tamper-proof HIPAA audit trail.
- **`OTPSession.js`**: TTL index auto-deleting verification codes after 600 seconds.
- **Review.js**: Stores 5-star ratings and written feedback comments for Doctors, Hospitals, and Pharmacies. Associates reviews with a specific `consultationId` to lock down reviews and prevent duplicate rating submissions. Denormalizes the patient's name into `reviewerName` to avoid runtime N+1 decryption queries.
- **`SupportTicket.js`**: Stores patient support inquiries with ticket status, message details, and administrative replies. Links to the encrypted `Patient` schema, maintaining zero-trust data separation via in-memory name decryption.

---

## 8. Security Architecture


1. **NIC Blind Indexing**: Prevents leaking sensitive identity cards in database indices.
2. **Envelope Cryptography**: Ensures files stored on Cloudinary cannot be viewed by unauthorized staff or Cloudinary administrators. Keys are wrapped in HashiCorp Vault.
3. **HMAC Rotating Service Token**: Hour-rotating SHA-256 signatures for Node ↔ Python engine secure internal routing.
4. **JWT Session Validation**: Cross-checks JWTs against a Mongo-backed `SessionToken` table to enable immediate global user logouts.

---

## 9. DevOps & Codebase Health

### 9.1 CI/CD Pipeline (`.github/workflows/playwright.yml`)
The repository contains an automated GitHub Actions pipeline that triggers on any push to the `main` branch:
- **Service Containers**: Runs MongoDB (v6.0) and Redis (v7.0) services in isolated containers.
- **Node & Python Setup**: Automatically sets up Node.js and Python, installing all dependencies concurrently.
- **HashiCorp Vault Dev Instance**: Runs a Vault development server in the background, matching the Node server's key resolution.
- **Playwright Test Runner**: Installs browsers and runs the 18 sequential E2E integration tests, outputting automated reports and error trace artifacts.

### 9.2 Codebase Refactor & Duplicate Deletion
To maintain high codebase health, redundant component duplicates and unused utilities were permanently deleted:
- Deleted `client/src/components/PageTransition.jsx` (consolidated into `client/src/components/common/PageTransition.jsx`).
- Deleted `client/src/components/Sidebar.jsx` (consolidated into `client/src/components/common/Sidebar.jsx`).
- Deleted `client/src/components/StatCard.jsx` (consolidated into `client/src/components/common/StatCard.jsx`).
- Deleted `client/src/components/LoadingSkeleton.jsx` (unused visual component).
- Cleaned debug console tracer prints, keeping only critical errors and startup confirmations.

