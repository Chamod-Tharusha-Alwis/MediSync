# Sub-Project 3 Phase 2 Implementation Plan: QR-Verified Consultation PDF + Email + NIC History Gate

## 1. Objectives
1. Provide a tamper-evident, cryptographically secure public verification endpoint (`/api/verify/:token` & UI `/verify/:token`) that proves a consultation record is authentic without leaking any sensitive clinical information or patient PII.
2. Require patient NIC authentication to download complete historical clinical records (`POST /api/verify/:token/history-pdf`), enforced via constant-time comparison against AES-256 decrypted NIC.
3. Generate high-entropy 256-bit verification tokens with SHA-256 storage hashing, 90-day TTL index, revocation capabilities, and rate-limiting against brute force.
4. Integrate QR code generation (`https://medisync.chamodtharusha.com.lk/verify/<token>`) directly into the consultation PDF and embed it in the post-consultation summary email when `PDF_EXPORT_ENABLED=true`.
5. Maintain strict zero PII logging, `clinicalValidation: not_established` disclaimers, and 100% trilingual (EN, SI, TA) localization.

## 2. Technical Architecture

### 2.1 Mongoose Model: `VerificationToken` (`server/src/models/VerificationToken.js`)
- `tokenHash`: String, required, indexed (SHA-256 digest of the raw 32-byte hex token).
- `consultationId`: ObjectId / String reference to `Consultation`.
- `patientRef`: ObjectId / String reference to `Patient`.
- `doctorRef`: ObjectId / String reference to `Doctor`.
- `createdAt`: Date, default `Date.now`.
- `expiresAt`: Date, default 90 days from creation (`new Date(Date.now() + 90 * 86400000)`), indexed with MongoDB TTL index `{ expireAfterSeconds: 0 }`.
- `revokedAt`: Date, nullable (if set, token is considered revoked).
- `revokedBy`: String / ObjectId, nullable.
- `useCount`: Number, default 0.
- `lastUsedAt`: Date, nullable.

### 2.2 Token Creation Helper (`server/src/services/verificationTokenService.js`)
- `issueVerificationToken({ consultationId, patientId, doctorId, expiresInDays = 90 })`:
  - Generates raw 32-byte cryptographically secure random token: `crypto.randomBytes(32).toString('hex')`.
  - Computes `tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')`.
  - Saves token record and returns `{ rawToken, verificationUrl, expiresAt }`.
  - Base verification URL: `https://medisync.chamodtharusha.com.lk/verify/${rawToken}`.

### 2.3 Public Verification Controller & Route (`server/src/controllers/verificationController.js`)
- `GET /api/verify/:token`:
  - Hashes incoming token (`sha256`).
  - Finds `VerificationToken`. If missing or expired: returns 404 `{ valid: false, reason: 'TOKEN_NOT_FOUND_OR_EXPIRED' }`.
  - If `revokedAt` is present: returns 200/410 `{ valid: false, reason: 'TOKEN_REVOKED', revokedAt }`.
  - If valid: fetches consultation metadata (consultationId, date, doctor name, hospital name).
  - Sanitization rule: **Never** expose patient name, patient NIC, symptoms, diagnosis, clinical notes, or medications.
  - Returns:
    ```json
    {
      "valid": true,
      "consultationRef": "CON-...",
      "consultationDate": "2026-11-08T...",
      "doctorName": "Dr. ...",
      "hospital": "...",
      "clinicalValidation": "not_established",
      "requiresNicForHistory": true
    }
    ```
  - Increments `useCount` and logs `VERIFY_VIEW` audit event without PII.

### 2.4 Authenticated Patient History Download Gate
- `POST /api/verify/:token/history-pdf`:
  - Body: `{ nic }`.
  - Rate limiting: max 5 attempts per IP / per token per 15 minutes.
  - Constant-time comparison: normalizes entered NIC, decrypts patient's registered NIC, and compares using `crypto.timingSafeEqual`.
  - If mismatched: returns generic 401 `{ error: 'VERIFICATION_FAILED', message: 'Verification could not be confirmed.' }` and logs `VERIFY_HISTORY_DOWNLOAD_FAIL`.
  - If matched: generates comprehensive consultation history PDF for the patient, attaches `clinicalValidation: not_established` header, and streams PDF with headers `Content-Type: application/pdf` and `Content-Disposition: attachment; filename="MediSync-History.pdf"`. Logs `VERIFY_HISTORY_DOWNLOAD_OK`.

### 2.5 QR Code Integration
- Uses `qrcode` library to generate QR data URL / buffer for `https://medisync.chamodtharusha.com.lk/verify/<token>`.
- Embeds QR code onto the top right / header area of the consultation PDF generated in `server/src/controllers/prescriptionController.js`.
- If `PDF_EXPORT_ENABLED=true`, attaches the PDF with QR code to the post-consultation summary email.

### 2.6 Frontend Verification Page (`client/src/pages/public/VerifyConsultation.jsx`)
- Route: `/verify/:token`.
- Public, mobile-optimized, trilingual (EN, SI, TA).
- Renders:
  - Shield / authenticity badge (Authentic / Expired / Revoked).
  - Consultation reference ID, timestamp in Sri Lanka Time (SLST), issuing physician, hospital.
  - Clinical validation disclaimer: `clinicalValidation: not_established`.
  - Interactive "Download Patient Medical History" section:
    - NIC input field with National Identity Card validation (9V/X or 12 digits).
    - Rate-limit friendly submission button.
    - Direct PDF download trigger upon successful validation.

## 3. Verification Plan & Offline Test Matrix
1. Unit tests in `server/tests/phase2VerificationTokenAndHistoryGate.test.js`:
   - Token creation with 256-bit entropy and SHA-256 storage hash.
   - Public metadata lookup excludes PII, diagnoses, and medications.
   - Revoked token rejection.
   - Constant-time NIC validation with valid and invalid inputs.
   - Rate limiting on NIC download gate.
   - Zero PII in audit logs.
2. Full offline gate `node scripts/run_offline_tests.js`.
3. Client production build `npm --prefix client run build`.
