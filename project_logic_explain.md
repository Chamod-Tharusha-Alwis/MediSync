# MediSync — Platform Logic Flows Explained

This document describes the key algorithmic lifecycles and logic sequences executed across the MediSync platform's Node.js gateway, MongoDB database, HashiCorp Vault key store, and Python ML microservice.

---

## 1. Zero-Trust Registration & Authentication Flow

MediSync uses a cryptographic schema to protect patient identity (PII) and doctors' login state.

```
[Patient Registration]
  1. Enters NIC, Name, Email, Password, Vitals, Allergies.
  2. Frontend sends payload to `POST /api/auth/register/patient`.
  3. Backend generates SHA-256 hash of NIC:
     `patientNic_bi = SHA-256(NIC.trim())`
  4. Mongoose executes schema hook:
     - Decrypts global encryption key fetched from HashiCorp Vault during server start.
     - Encrypts PII fields (`fullName`, `contactInfo`, `allergies`) in-memory using `aes-256-cbc`.
  5. Document is saved to MongoDB. Patient identifiers are never stored in plaintext.

[Universal Multi-Role Login]
  1. User submits Email and Password.
  2. If role is 'doctor':
     a. Checks password hash (bcrypt).
     b. Generates a 6-digit 2FA OTP using Speakeasy.
     c. Cache OTP in Redis under `medisync:otp:doctor:<userId>` (expires in 10 minutes).
     d. Sends OTP to doctor's registered email.
     e. Returns status `200 { requireOTP: true }` to the frontend, showing the 2FA screen.
  3. Doctor submits OTP:
     a. Backend matches the code against the Redis cached value.
     b. Deletes cached OTP to prevent reuse.
     c. Issues a signed JWT access token.
     d. Saves token hash in MongoDB (`SessionToken` schema) to allow session revocation.
```

---

## 2. Doctor Consultation & Machine Learning Integration

The consultation module acts as a smart diagnostic assistant, querying the Python ML microservice and generating secure records.

```
[Wizard Execution Steps]
  1. Patient Lookup: Doctor inputs patient's NIC.
     - System hashes NIC and queries MongoDB using `patientNic_bi` to retrieve patient file.
     - Retrieves allergies and medical history timeline.
  2. Diagnostic Prediction: Doctor inputs patient symptoms.
     - Sends symptoms array to `POST /api/doctor/predict-disease`.
     - Backend signs request using hourly rotating HMAC-SHA256 signature (`x-internal-key`).
     - Flask ML service receives array, executes TF-IDF cosine similarity mapping against `symptom_map.json`, and returns top 5 disease predictions with ICD-10 codes and confidence values.
     - Fallback: If Python service is down, Node backend catches timeout after 10 seconds, returning 200 OK with safe hardcoded disease recommendations (e.g. Dengue, COVID-19, Malaria) to ensure the consultation flow is not interrupted.
  3. Drug-Drug Interactions: Doctor enters prescription list.
     - Frontend queries `/api/drugs/check-interaction` as drugs are added.
     - Backend queries Mongo to resolve brand names to generic components in batch.
     - Queries ML service to cross-check combinations against `interactions_clean.json`.
     - Flags warning severity (mild, moderate, severe, contraindicated) to the doctor in the UI.
  4. Consultation Complete (Release):
     - Saves consultation document (encrypted) and prescription records.
     - Automatically creates matching `LabTest` documents with status `'pending'` for recommended lab tests.
     - Generates A4 prescription PDF and password-locks it using a truncated HMAC-SHA256 hash of the patient's NIC (first 8 characters, capitalized).
     - Emails the PDF directly to the patient along with the secure 8-character PDF Key using `emailService.js`.
```

---

## 3. Lab Test Approval Workflow & Consent Lifecycle

Hospitals cannot register or perform tests on patients without explicit consent. Tests are prescribed by doctors, verified by patients, and approved by hospital administrators.

```
[Approval Lifecycle Sequence]
  1. Patients present their NIC to a hospital lab.
  2. Hospital Admin searches pending orders. The system hashes the NIC, queries `Patient` to retrieve the patient's email, generates a 6-digit Speakeasy consent OTP, and caches it in Redis:
     `medisync:otp:hospital:<NIC_hash>` -> { otp, expiresAt } (TTL 10 mins).
  3. Sends OTP email to the patient.
  4. Patient provides the OTP to the admin.
  5. Admin submits the OTP and patient NIC.
  6. Backend verifies the OTP, deletes it from Redis, queries `LabTest` where `patientNic_bi === hashedNic` and `status === 'pending'`, and returns the list of pending test orders.
  7. Admin selects the appropriate test and clicks "Approve":
     - Backend updates the test document: status changes to `'Approved'`.
     - Generates a unique `reportId` (e.g., `LAB-2026-6b21c4`).
     - Sends approval emails to the patient and hospital administrators.
```

---

## 4. In-Memory Envelope Encryption & Decryption Lifecycle

To prevent medical report leaks on Cloudinary storage, MediSync implements in-memory envelope encryption. PDF files are encrypted in memory before upload, and decrypted in memory during download.

```
[In-Memory Envelope Encryption (Upload)]
  1. Lab Assistant searches for the test by `reportId` and uploads the PDF report.
  2. Backend captures PDF buffer in-memory (`multer.memoryStorage()`).
  3. Generates a random 256-bit AES key (Data Encryption Key - DEK) and 12-byte IV.
  4. Encrypts PDF buffer using `aes-256-gcm`:
     `encryptedBuffer = cipher.update(pdfBuffer) + cipher.final()`
     `authTag = cipher.getAuthTag()`
  5. Concatenates Auth Tag (16 bytes) and ciphertext:
     `uploadBlob = Buffer.concat([authTag, encryptedBuffer])`
  6. Streams `uploadBlob` to Cloudinary as raw authenticated resource.
  7. Encrypts (wraps) the DEK using the Vault Master Key (`global.ENCRYPTION_KEY`) using `aes-256-cbc`.
     - Explicitly generates a 16-byte `cbcIV = crypto.randomBytes(16)`.
     - Disables auto-padding since input is exactly 32 bytes (multiple of 16).
  8. Saves the wrapped `encryptedFileKey` (prepended `cbcIV` hex + `wrappedKey` hex, precisely 96 characters), the `fileIV` (hex), and Cloudinary URLs to MongoDB.
  9. Updates status to `'report_ready'` and emails the patient.

[In-Memory Decryption (Download)]
  1. Patient requests download: `GET /api/lab/patient/download-report/:reportId`
  2. Backend fetches the encrypted PDF blob from Cloudinary using a 5-minute signed URL.
  3. Decrypts (unwraps) the DEK:
     - Fetches Vault master key.
     - Extracts the first 32 characters as the CBC IV.
     - Decrypts the remaining 64 characters as the wrapped key using `aes-256-cbc` (with disabled padding).
  4. Decrypts the PDF blob:
     - Extracts the first 16 bytes as the GCM Auth Tag.
     - Extracts the remaining bytes as the ciphertext.
     - Decrypts the ciphertext using `aes-256-gcm` with the unwrapped key, stored `fileIV`, and extracted Auth Tag.
  5. Streams the clean decrypted PDF directly to the browser.
```

---

## 5. Automated Outbreak Surveillance Logic

An automated system tracks diagnostic anomalies to detect infectious outbreaks early.

```
[Outbreak Surveillance Workflow]
  1. A background cron job runs every night at 2:00 AM (configured in `cronJobs.js`).
  2. Queries all consultations created within the last 30 days.
  3. Aggregates diagnosis counts by district and disease type.
  4. Feeds metrics to Flask ML engine (`/analyze-realtime`).
  5. ML engine evaluates z-score spike metrics:
     - Compares the last 7 days of cases (activity spike) against the preceding 23 days (baseline).
     - Standard Deviation threshold check:
       `zScore = (recentCount - baselineMean) / baselineStdDev`
  6. If z-score exceeds 2.0 (representing a statistically significant spike):
     - Creates an `OutbreakAlert` document in MongoDB.
     - Sends emails to all healthcare professionals in the affected district using `emailService.js`.
     - Emits a real-time Socket.IO notification to all active dashboards.
     - Triggers a banner overlay and updates the district on the interactive Leaflet map.
```
