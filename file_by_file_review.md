# MediSync — File-by-File Codebase Review

This document provides a detailed technical breakdown of every key file in the MediSync platform, outlining its primary role, lines of code, internal logic, and interactions with other modules.

---

## 1. Backend Service (`server/src`)

### 1.1 Entry & Configuration
- **[`app.js`](file:///c:/Users/chamo/Desktop/Final%20project/medisync/server/src/app.js)**
  - **Purpose:** Entry point for the Node.js backend.
  - **Key Logic:** Bootstraps HashiCorp Vault securely. Fetches `global.ENCRYPTION_KEY` synchronously before any models are loaded to avoid Mongoose field encryption initialization errors. Auto-seeds the Super Admin, connects to MongoDB, starts the background cron jobs, and configures the Express middleware and real-time Socket.IO mapping.
- **[`config/db.js`](file:///c:/Users/chamo/Desktop/Final%20project/medisync/server/src/config/db.js)**
  - **Purpose:** Database connector.
  - **Key Logic:** Connects to MongoDB via Mongoose. Sets up connection event listeners and configures indices.
- **[`config/redis.js`](file:///c:/Users/chamo/Desktop/Final%20project/medisync/server/src/config/redis.js)**
  - **Purpose:** Redis OTP store.
  - **Key Logic:** Initiates Redis client connections with automated exponential backoff retry. Implements a thread-safe in-memory JS Map fallback with manual TTL expiry checks if the Redis server goes offline, guaranteeing system resilience.

### 1.2 Express Controllers (`controllers/`)
- **[`authController.js`](file:///c:/Users/chamo/Desktop/Final%20project/medisync/server/src/controllers/authController.js)**
  - **Purpose:** Manages registration and session lifecycles for all roles.
  - **Key Logic:** Registers Patients, Doctors, Pharmacists, and Hospital Admins. Encrypts patient credentials, validates doctor licenses, supports dual-layer JWT + MongoDB session validation, and handles MFA OTP generation via the Speakeasy package.
- **[`doctorController.js`](file:///c:/Users/chamo/Desktop/Final%20project/medisync/server/src/controllers/doctorController.js)**
  - **Purpose:** Controls doctor diagnostic workflows.
  - **Key Logic:** Manages consultation sessions. Features symptom prediction with a robust **10-second timeout fallback** (returns 200 OK with hardcoded symptoms/diseases if the Flask ML engine fails). Saves consultations and creates parallel pending `LabTest` documents for recommended tests.
- **[`labController.js`](file:///c:/Users/chamo/Desktop/Final%20project/medisync/server/src/controllers/labController.js)**
  - **Purpose:** Manages the lab lifecycle, consent workflow, and report security.
  - **Key Logic:**
    - `requestHospitalOtp`: Hashes patient NIC to check patient status and emails OTP.
    - `verifyOtpAndFetchTests`: Verifies OTP and returns pending prescribed tests.
    - `approveTest`: Completes consent verification, assigns a unique `reportId` (e.g. `LAB-2026-XXXX`), and triggers confirmation emails.
    - `uploadReport`: Performs **in-memory envelope encryption** using `aes-256-gcm`, uploads the encrypted blob to Cloudinary, encrypts the file key with the Vault master key (`aes-256-cbc`), and writes references to MongoDB.
    - `patientDownloadReportByReportId`: Decrypts report in-memory and streams the clean PDF to the patient.
- **[`pharmacyController.js`](file:///c:/Users/chamo/Desktop/Final%20project/medisync/server/src/controllers/pharmacyController.js)**
  - **Purpose:** Coordinates pharmacy dispensing and inventory.
  - **Key Logic:** Matches patients via NIC blind index, retrieves active prescriptions, checks drug-drug interactions, decrements stock levels, and prevents double-dispensation of prescription IDs.
- **[`publicController.js`](file:///c:/Users/chamo/Desktop/Final%20project/medisync/server/src/controllers/publicController.js)**
  - **Purpose:** Exposes public directory listings.
  - **Key Logic:** Fetches doctors, hospitals, and pharmacies without requiring authentication. Resolved performance bottleneck `PERF-01` by batching doctor review ratings via a single Mongo `$in` aggregation.

### 1.3 Mongoose Schemas (`models/`)
- **[`models/Patient.js`](file:///c:/Users/chamo/Desktop/Final%20project/medisync/server/src/models/Patient.js)**
  - **Purpose:** Schema for patient records.
  - **Key Logic:** Implements `mongoose-field-encryption` on fields containing PII (`fullName`, `contactInfo`, `allergies`). Provides `patientNic_bi` (Blind Index SHA-256 hash) for zero-trust NIC lookups.
- **[`models/LabTest.js`](file:///c:/Users/chamo/Desktop/Final%20project/medisync/server/src/models/LabTest.js)**
  - **Purpose:** Lab test metadata store.
  - **Key Logic:** Declares keys for `reportId`, `status` (`pending`, `Approved`, `sample_collected`, `processing`, `report_ready`, `delivered`), and envelope parameters (`encryptedFileKey`, `fileIV`).
- **[`models/AuditLog.js`](file:///c:/Users/chamo/Desktop/Final%20project/medisync/server/src/models/AuditLog.js)**
  - **Purpose:** Audit ledger for HIPAA compliance.
  - **Key Logic:** Uses a capped MongoDB collection (max 100MB/100,000 documents) to enforce write-once, append-only security logs of all sensitive API requests.

### 1.4 System Utilities (`utils/`)
- **[`utils/emailService.js`](file:///c:/Users/chamo/Desktop/Final%20project/medisync/server/src/utils/emailService.js)**
  - **Purpose:** Branded notification engine.
  - **Key Logic:** Formulates 9 responsive HTML email templates (Welcome, MFA OTP, Outbreak Alerts, Lab Status Updates, E-Prescriptions). Binds to Nodemailer and SMTP configurations.
- **[`utils/cronJobs.js`](file:///c:/Users/chamo/Desktop/Final%20project/medisync/server/src/utils/cronJobs.js)**
  - **Purpose:** Background task schedulers.
  - **Key Logic:** Orchestrates 5 cron schedules: Rx validity expiration (hourly), risk scoring calculation (6 hours), follow-up notifications (daily at 8 AM), OTP cleanup (30 mins), and outbreak surveillance analytics (daily at 2 AM).
- **[`utils/pdfGenerator.js`](file:///c:/Users/chamo/Desktop/Final%20project/medisync/server/src/utils/pdfGenerator.js)**
  - **Purpose:** Prescription PDF generator.
  - **Key Logic:** Compiles diagnostic summaries into clean A4 PDFs with dynamic QR codes. Password-encrypts the resulting file using `pdf-encrypt-lite` with the patient's NIC.

---

## 2. Machine Learning Engine (`ml-engine`)

- **[`app.py`](file:///c:/Users/chamo/Desktop/Final%20project/medisync/ml-engine/app.py)**
  - **Purpose:** Python Flask service hosting the system's ML predictors.
  - **Key Logic:** 
    - `/api/ml/predict-disease`: Processes symptoms using TF-IDF vectorization and Cosine Similarity mapping.
    - `/api/ml/check-interactions`: Scans incoming medication lists pairwise against the 40MB database `interactions_clean.json`.
    - `/analyze-realtime`: Tracks anomalies using standard deviation (z-score) spikes over district boundaries.

---

## 3. Frontend Client (`client/src`)

- **[`App.js`](file:///c:/Users/chamo/Desktop/Final%20project/medisync/client/src/App.js)**
  - **Purpose:** Client-side router.
  - **Key Logic:** Sets up layouts and maps routes. Wraps admin, doctor, pharmacy, hospital, and patient dashboards in `ProtectedRoute` checks.
- **[`pages/patient/History.jsx`](file:///c:/Users/chamo/Desktop/Final%20project/medisync/client/src/pages/patient/History.jsx)**
  - **Purpose:** Comprehensive clinical timeline for patient portal.
  - **Key Logic:** Maps consultations, prescriptions, and lab tests chronologically. Incorporates our newly added **Recommended Lab Tests** section displaying test names, status badges (Yellow for Pending, Blue for Approved, Green for Completed), and a secure `Download Report` trigger calling the decrypted buffer stream.
- **[`pages/hospital/LabManagement.jsx`](file:///c:/Users/chamo/Desktop/Final%20project/medisync/client/src/pages/hospital/LabManagement.jsx)**
  - **Purpose:** Hospital admin and technician dashboard.
  - **Key Logic:** Integrates the patient consent OTP flow. Shows pending doctor orders only after verified OTP submission. Incorporates the report upload portal utilizing search by `reportId`.
