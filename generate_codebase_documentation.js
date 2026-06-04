const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const getDirMap = () => {
  return `medisync/
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
│       │       └── ActiveOutbreakBanner.jsx # Real-time outbreak banner
│       └── pages/
│           ├── Home.jsx            # Landing page
│           ├── Login.jsx           # Universal login
│           ├── SelectRole.jsx      # Role selection screen
│           ├── admin/
│           │   └── Dashboard.jsx   # Super Admin dashboard
│           ├── auth/
│           │   └── Register.jsx    # Multi-role registration form
│           ├── doctor/
│           │   ├── Dashboard.jsx   # Doctor dashboard
│           │   └── NewConsultation.jsx # Multi-step AI consultation wizard
│           ├── hospital/
│           │   ├── Dashboard.jsx   # Hospital admin dashboard
│           │   └── LabManagement.jsx # Lab approval + assistant uploads
│           ├── patient/
│           │   ├── Dashboard.jsx   # Patient portal dashboard
│           │   └── History.jsx     # Medical timeline with decrypted downloads
│           └── pharmacy/
│               └── Dashboard.jsx   # Dispensation and ML analytics dashboard
│
├── server/                         # ── Node.js + Express 5 Backend ──
│   ├── src/
│   │   ├── app.js                  # Server entry point (Vault -> DB -> Redis -> Express)
│   │   ├── config/
│   │   │   ├── db.js               # MongoDB connection setup
│   │   │   └── redis.js            # Redis OTP store + in-memory fallback
│   │   ├── middleware/
│   │   │   └── auth.js             # JWT verification + RBAC + Audit logger
│   │   ├── models/                 # Mongoose Schemas (Patient, Consultation, LabTest, etc.)
│   │   ├── controllers/            # Express controllers (auth, doctor, lab, pharmacy, etc.)
│   │   ├── routes/                 # Express route mappings
│   │   └── utils/                  # Cloudinary, email, PDF generation, cron jobs
│   └── tests/
│       └── lab.test.js             # 24 integration tests for lab lifecycle
│
*── ml-engine/                      # ── Python Flask ML Microservice ──
    ├── app.py                      # Flask service endpoints (predict, check interactions)
    └── data/
        ├── dataset.csv             # Symptom-disease training data (4,920 records)
        └── interactions_clean.json # Drug interaction database (40MB)
`;
};

const getArchitectureOverview = () => {
  return `
MediSync is structured as a zero-trust split-architecture healthcare platform. It secures patient health records using envelope encryption, indexes records via blind indexes, and leverages a Python ML service for real-time diagnostic and interaction analysis.

\`\`\`
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
\`\`\`
`;
};

const getBackendBreakdown = () => {
  return `
### 3.1 Entry Point: \`server/src/app.js\`
The Express server bootstraps as follows:
1. **HashiCorp Vault Bootstrapping**: Requests the Master Key (\`AES_ENCRYPTION_KEY\`) from VaultKV. If Vault is offline, falls back to \`process.env.ENCRYPTION_KEY\`.
2. **Database Initialization**: Binds the global key and initializes MongoDB connections.
3. **Redis OTP Store Initialization**: Starts the Redis service with an in-memory map fallback.
4. **App Initialization & Cron Jobs**: Runs user seeder, registers 5 automated background cron tasks, and starts Express on port 5005.

### 3.2 Key Express Controllers
- **\`authController.js\`**: Orchestrates authentication, multi-role registration, Speakeasy-based 2FA, and password reset flows.
- **\`doctorController.js\`**: Orchestrates consultation saves (vitals, symptoms, prescriptions), triggers ML disease prediction fallbacks, generates password-locked e-prescriptions, and spawns \`LabTest\` documents for any recommended tests.
- **\`labController.js\`**: Implements the OTP-gated Lab Test Approval Workflow, processes PDF reports using in-memory envelope encryption (AES-256-GCM + Vault unwrapping), and streams decrypted PDFs to patients/doctors.
- **\`pharmacyController.js\`**: Handles prescription verification, double-dispense prevention, alternative drug substitution logic, and inventory depletion tracking.
- **\`adminController.js\`**: Provides Super Admin aggregates, audit logs search, district broadcast delivery, and temporary/permanent user suspensions (Ban notice).
`;
};

const getFrontendBreakdown = () => {
  return `
The frontend is a React 18 Single Page Application styled with Vanilla CSS3 glassmorphic design and animated using Framer Motion.

### 4.1 Protected Routing (\`client/src/App.js\`)
Enforces authorization using the \`ProtectedRoute\` component. Restricts access to specific sub-dashboards based on the roles stored within the decrypted JWT token.

### 4.2 Dashboard Modules
- **Doctor Consultation Wizard**: A stepper-based clinical wizard implementing tag autocomplete for symptoms, query debouncing for drugs, real-time allergy alerts, and drug interaction banners.
- **Hospital Lab Dashboard**: Consists of two modules:
  1. *Approval Flow*: Requests NIC -> triggers patient OTP -> verifies OTP and fetches pending doctor-ordered tests -> patient consent approval.
  2. *Lab Assistant Upload*: Fetches approved tests strictly by \`reportId\` -> updates status -> performs drag-and-drop report upload.
- **Patient Timeline**: Rendered in \`History.jsx\` using a timeline layout. Integrates dynamic colored status badges for lab tests and E-Prescription/Lab Report PDF download buttons.
- **Pharmacy Dashboard**: Provides tabs for NIC search dispensing, dispensing logs, manual OTC logs, depletion charts, and restock analytics.
`;
};

const getMlEngineBreakdown = () => {
  return `
The ML engine is a Python Flask microservice providing analytical intelligence to the Node.js API.

### 5.1 Flask Endpoints
- **\`/api/ml/predict-disease\`**: Uses TF-IDF vectorization and cosine similarity to match symptom queries to diseases in \`symptom_map.json\`.
- **\`/api/ml/check-interactions\`**: Performs pairwise comparisons of input drugs against \`interactions_clean.json\` to flag dangerous contraindications.
- **\`/analyze-realtime\`**: Performs statistical z-score analysis on ingested district consultation logs to trigger outbreak alerts.
- **\`/predict-district-demand\`**: Pharmacy restock analyzer highlighting depletion risk zones.
`;
};

const getDiagrams = () => {
  return `
### 6.1 PDF Envelope Encryption & Upload Lifecycle
This lifecycle guarantees in-memory encryption before data ever touches Cloudinary storage.

\`\`\`
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
    │     b. Encrypt PDF buffer using \`aes-256-gcm\`.         │
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
    │     Cipher = \`aes-256-cbc\`                             │
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
    │     Decipher \`encryptedFileKey\` using Vault Master Key │
    │  5. Decrypt PDF blob:                                  │
    │     Decipher PDF ciphertext with unwrapped file key    │
    │     and stored \`fileIV\` (checking Auth Tag integrity)   │
    │  6. Stream decrypted PDF file to user browser          │
    └────────────────────────────────────────────────────────┘
\`\`\`
`;
};

const getSchemas = () => {
  return `
### 7.1 Field-Level Cryptography Schemas (AES-256)
- **\`Patient.js\`**: Encrypts \`fullName\`, \`contactInfo\`, and \`allergies\`. Indexes via \`patientNic_bi\` (Blind Index).
- **\`Consultation.js\`**: Encrypts \`patientNic\`, \`diagnosis\`, and \`notes\`. Indexes via \`patientNic_bi\`.
- **\`Prescription.js\`**: Encrypts \`patientNic\`, \`drugName\`, and \`dosage\`. Indexes via \`patientNic_bi\`.
- **\`LabTest.js\`**: Encrypts \`patientNic\`, \`patientName\`, and \`patientEmail\`. Indexes via \`patientNic_bi\`. Tracks \`status\`, \`reportId\`, \`encryptedFileKey\`, and \`fileIV\`.

### 7.2 Special Collections
- **\`AuditLog.js\`**: MongoDB Capped collection restricted to 100MB, serving as a read-only, tamper-proof HIPAA audit trail.
- **\`OTPSession.js\`**: TTL index auto-deleting verification codes after 600 seconds.
`;
};

const getSecurityArchitecture = () => {
  return `
1. **NIC Blind Indexing**: Prevents leaking sensitive identity cards in database indices.
2. **Envelope Cryptography**: Ensures files stored on Cloudinary cannot be viewed by unauthorized staff or Cloudinary administrators. Keys are wrapped in HashiCorp Vault.
3. **HMAC Rotating Service Token**: Hour-rotating SHA-256 signatures for Node ↔ Python engine secure internal routing.
4. **JWT Session Validation**: Cross-checks JWTs against a Mongo-backed \`SessionToken\` table to enable immediate global user logouts.
`;
};

const main = () => {
  const content = `# MediSync — Technical Codebase Documentation

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

\`\`\`
${getDirMap()}\`\`\`

---

## 2. Architecture Overview

${getArchitectureOverview()}

---

## 3. Backend Module Breakdown

${getBackendBreakdown()}

---

## 4. Frontend Module Breakdown

${getFrontendBreakdown()}

---

## 5. ML Engine Module Breakdown

${getMlEngineBreakdown()}

---

## 6. Data Flow Diagrams

${getDiagrams()}

---

## 7. Database Schema Reference

${getSchemas()}

---

## 8. Security Architecture

${getSecurityArchitecture()}
`;

  fs.writeFileSync(path.join(rootDir, 'CODEBASE.md'), content, 'utf8');
  console.log('Successfully generated full CODEBASE.md documentation!');
};

main();
