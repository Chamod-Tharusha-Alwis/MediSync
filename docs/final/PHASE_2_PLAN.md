# Phase 2 Engineering Plan: OTP-Gated QR Verification Portal (docs/final/PHASE_2_PLAN.md)

- **Feature Target**: OTP-Gated QR Verification Page (`/verify/:token`)
- **Status**: Ready for implementation
- **Author**: Autonomous Multi-Agent Engineering Lead

---

## 1. Architectural Overview & User Flow

### 1.1 Objective
Scanning the QR code on a MediSync Consultation Summary PDF opens a lightweight, public, mobile-first web page.
- At scan / page-load time, the verification token is authenticated.
- If authentic, an OTP is dispatched to the patient's registered contact without displaying private identity data.
- The user inputs the 6-digit OTP into the page.
- Upon successful verification, the server unlocks and returns both the **clinical encounter record** and the **medicine release status** in a single atomic payload, and issues an ephemeral 10-minute in-memory session token.
- **No National Identity Card (NIC) input is required from the user.**

### 1.2 State Machine
```
[ QR Code Scanned / Page Loaded ]
                |
                v
       [ GET /api/verify/:token ]
         /                    \
  (Valid Token)         (Invalid / Revoked / Expired)
       /                        \
      v                          v
[ AWAITING_OTP ]          [ ERROR_CARD ]
- Masked Contact Hint     (404 Not Found / 410 Expired / 410 Revoked)
- Auto-requests OTP
- 60s Resend Countdown
- 6-Digit Input Box
       |
       | POST /api/verify/:token/otp/verify { otp }
       +-----------------------+
       |                       |
   (Wrong OTP)           (Correct OTP)
       |                       |
       v                       v
[ RETRY_OTP ]             [ UNLOCKED ]
- Decrement attempts left - Clinical Summary (Vitals, Diagnosis, Notes, Follow-up)
- If attempts <= 0:       - Prescriptions with Released / Not released badges
  -> Lockout (LOCKED)     - Medicine Release Timeline (Pharmacy, Pharmacist, Timestamp)
                          - Download Medical History PDF (Authorized by View Session)
                          - 10-Minute Ephemeral In-Memory Countdown Timer
                          - "Lock Now" Button (Clears State Instantly)
```

---

## 2. API Specifications & Data Contracts

### 2.1 `GET /api/verify/:token` (Public Authenticity Check)
- **Rate Limit**: Standard public rate limiter (e.g. 60 req/min per IP).
- **Behavior**: Validates token format, resolves `VerificationToken` from DB, checks expiry and revocation.
- **Public Response (200 OK)**:
  ```json
  {
    "authentic": true,
    "consultationRef": "CON-202611-829140",
    "consultationDate": "2026-11-09T08:30:00.000Z",
    "doctorName": "Dr. Sarah Perera",
    "hospital": "Colombo General Hospital",
    "district": "Colombo",
    "maskedContact": "c***@gmail.com",
    "clinicalValidation": "not_established",
    "expiresAt": "2027-02-07T08:30:00.000Z"
  }
  ```
- **Error Responses**:
  - `404 Not Found`: `{ "authentic": false, "reason": "TOKEN_NOT_FOUND" }`
  - `410 Gone`: `{ "authentic": false, "reason": "TOKEN_REVOKED", "revokedAt": "..." }`
  - `410 Gone`: `{ "authentic": false, "reason": "TOKEN_EXPIRED", "expiresAt": "..." }`
- **Security Rule**: Contains **ZERO** patient PII (no name, no NIC, no phone, no diagnosis, no medications).

### 2.2 `POST /api/verify/:token/otp/request` (OTP Dispatch)
- **Rate Limit & Throttling**:
  - Cooldown: Minimum 60 seconds between OTP requests per token.
  - Frequency Cap: Maximum 5 OTP dispatches per token per hour.
  - IP Rate Limiter: Maximum 10 requests per 15 minutes per IP.
- **Behavior**:
  - Generates secure random 6-digit numeric OTP (`crypto.randomInt(100000, 1000000)`).
  - Bcrypt-hashes OTP with salt rounds 10.
  - Stores in `OTPSession` with:
    - `purpose: "qr_view"`
    - `userModel: "Patient"`
    - `userId: patient._id`
    - `expiresAt: Date.now() + 300 * 1000` (5 minutes TTL)
    - `metadata.tokenHash: tokenHash`
    - `metadata.failedAttempts: 0`
  - Dispatches OTP via `emailService.sendOTPEmail` to `patient.email` with patient's preferred language (`options.lang`).
  - Audits `VERIFY_OTP_SENT` with token ID and IP (zero PII).
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Verification OTP sent to registered contact",
    "maskedContact": "c***@gmail.com",
    "cooldownSeconds": 60,
    "expiresInSeconds": 300
  }
  ```
- **Error Responses**:
  - `429 Too Many Requests`: `{ "error": "COOLDOWN_ACTIVE", "message": "Please wait before requesting another OTP." }`
  - `503 Service Unavailable`: If email delivery fails closed.

### 2.3 `POST /api/verify/:token/otp/verify` (The Unlock Call)
- **Body**: `{ "otp": "123456" }`
- **Behavior**:
  - Finds active `OTPSession` for `purpose: "qr_view"` and matching `metadata.tokenHash`.
  - Checks if session is expired (`expiresAt < Date.now()`) or exhausted (`used: true`).
  - Checks failed attempt count: if `failedAttempts >= 3`, marks session invalid and rejects with `LOCKED`.
  - Compares input OTP with hashed OTP using `bcrypt.compare`.
  - If match fails:
    - Increments `failedAttempts`.
    - Audits `VERIFY_OTP_FAILED`.
    - Returns `401 Unauthorized` with `attemptsRemaining` (`3 - failedAttempts`).
  - If match succeeds:
    - Marks session `used: true`.
    - Generates signed in-memory view session token (`HS256` signed JWT with 10-minute TTL, containing `{ tokenHash, purpose: 'qr_view_session' }`).
    - Fetches `Consultation`, `Patient`, `Prescription`, and `Dispensing` records.
    - Decrypts fields using existing `decryptFieldsSync()` methods.
    - Assembles `clinical` and `release` payload.
    - Audits `VERIFY_UNLOCKED` (zero PII).
- **Headers**: `Cache-Control: private, no-store, no-cache, must-revalidate`
- **Response Shape (200 OK)**:
  ```json
  {
    "success": true,
    "sessionToken": "<ephemeral-jwt>",
    "expiresInSeconds": 600,
    "clinical": {
      "consultation": {
        "reference": "CON-202611-829140",
        "date": "2026-11-09T08:30:00.000Z",
        "hospital": "Colombo General Hospital",
        "doctor": "Dr. Sarah Perera",
        "district": "Colombo"
      },
      "patient": {
        "name": "Kamal Perera",
        "ageOrDob": "1985-04-12",
        "gender": "Male",
        "bloodGroup": "O+",
        "allergies": ["Penicillin"]
      },
      "vitals": {
        "bloodPressure": "120/80",
        "pulseRate": 72,
        "temperature": 37.0,
        "spO2": 98
      },
      "symptoms": ["Fever", "Headache"],
      "diagnosis": {
        "text": "Viral fever, unspecified",
        "icdCode": "B34.9",
        "icdDescription": "Viral infection, unspecified"
      },
      "notes": "Patient advised rest and oral hydration.",
      "followUp": {
        "isFollowUpRequired": true,
        "followUpDate": "2026-11-16T00:00:00.000Z"
      },
      "prescriptions": [
        {
          "drugName": "Paracetamol 500mg",
          "dosage": "500mg",
          "frequency": "TDS",
          "durationDays": 3,
          "instructions": "After meals"
        }
      ],
      "labResults": []
    },
    "release": {
      "overallStatus": "released",
      "items": [
        {
          "drugName": "Paracetamol 500mg",
          "dosage": "500mg",
          "frequency": "TDS",
          "durationDays": 3,
          "released": true,
          "releasedAt": "2026-11-09T09:15:00.000Z",
          "pharmacy": {
            "name": "State Pharmaceuticals Corporation - Colombo",
            "district": "Colombo"
          },
          "releasedBy": {
            "name": "Sunil Shantha (Pharmacist)"
          }
        }
      ],
      "dispensings": [
        {
          "receiptNo": "REC-20261109-847291",
          "dispensedAt": "2026-11-09T09:15:00.000Z",
          "pharmacy": "State Pharmaceuticals Corporation - Colombo",
          "pharmacist": "Sunil Shantha (Pharmacist)",
          "itemCount": 1
        }
      ]
    }
  }
  ```

### 2.4 `POST /api/verify/:token/history-pdf` (Authorized History PDF Export)
- **Headers**: `Authorization: Bearer <sessionToken>` OR body `{ sessionToken }`.
- **Gating**: Verified against `PDF_EXPORT_ENABLED`.
- **Headers**: `Cache-Control: private, no-store, no-cache, must-revalidate`
- **Output**: Binary PDF stream.

---

## 3. Threat Model & Security Defenses

| Threat Scenario | Attack Vector | Engineering Mitigation |
|---|---|---|
| **Brute-Force OTP Guessing** | Attacker scans public QR URL and scripts random 6-digit submissions | Maximum 3 failed attempts per OTP session; session invalidates permanently on 3rd failure; 60s cooldown; IP rate limiting (10 req / 15 min). |
| **Replay Attack** | Attacker intercepts used OTP and replays `POST /otp/verify` | Single-use flag (`used: true`) updated atomically; subsequent attempts fail. |
| **Token Cross-Use** | Attacker uses OTP issued for Token A against Token B | OTP session metadata explicitly binds `tokenHash`; verification checks `session.metadata.tokenHash === currentTokenHash`. |
| **Session Hijacking / Storage Leak** | Malicious script steals view token from browser storage | Client holds `sessionToken` strictly in React component memory state; **never written to `localStorage` or `sessionStorage`**; cleared on component unmount or manual "Lock Now". |
| **Browser Cache Snooping** | Shared public terminal caches unlocked medical details | `Cache-Control: private, no-store, no-cache, must-revalidate` on all unlock and PDF endpoints. |
| **PII Leakage in Audit Trails** | Logging services store patient name or NIC in cleartext | Audit events (`VERIFY_SCAN`, `VERIFY_OTP_SENT`, `VERIFY_OTP_FAILED`, `VERIFY_UNLOCKED`, `VERIFY_PDF_DOWNLOADED`) store token Mongo ObjectId, actor IP, and timestamp. Zero patient NIC or demographic text. |
| **Test OTP Fallback Exploitation** | Production environment falling back to dummy `123456` OTP | Test OTP mechanisms are strictly barred; OTP generator uses cryptographic entropy; non-production bypass disabled. |

---

## 4. Frontend Component Specifications (`VerifyConsultation.jsx`)

1. **Lightweight & Standalone**:
   - Clean viewport without navbar, global footer, or authenticated user context.
   - Mobile-first responsive grid (optimized for 360 px width).
2. **State Progression**:
   - `LOADING`: Initial token lookup spinner.
   - `AWAITING_OTP`: Display hospital name, consulting doctor, masked email hint, 6-digit numeric input with auto-focus, Submit button, Resend button with 60s live countdown.
   - `WRONG_OTP`: Red warning with attempts remaining banner.
   - `LOCKED`: Warning indicating OTP is locked after 3 failures with "Request New OTP" button.
   - `UNLOCKED`:
     - Verification Banner with green authentic badge and `clinicalValidation: not_established` notice.
     - Patient Demographic Summary: Name, DOB, Gender, Blood Group, Allergies.
     - Encounter Vitals & Diagnosis: Blood pressure, pulse, SpO₂, temperature, ICD-10 code & WHO description.
     - Prescribed Medications & Release Badges:
       - Green badge: `Released` (with dispensing time, pharmacy, dispensing pharmacist name).
       - Amber badge: `Not Released` / `Pending`.
     - History PDF Download Button: Triggers authorized download using in-memory session token.
     - Session Expiry Bar: "Session active — auto-locking in mm:ss" with progress indicator.
     - "Lock Now" Action: Clears all state and returns to pre-auth view.
3. **Trilingual Localization**:
   - Keys added to `en.js`, `si.js`, and `ta.js` maintaining 100% key parity across all 3 languages.
   - Key parity tests updated to verify exact new key count.

---

## 5. Verification Test Suite Plan

1. **Backend Integration Tests (`server/tests/otpVerificationPortal.test.js`)**:
   - `GET /api/verify/:token`: Returns authentic metadata and masked contact, zero patient PII.
   - `POST /api/verify/:token/otp/request`: Sends OTP via email, sets cooldown, blocks on rapid replay.
   - `POST /api/verify/:token/otp/verify`:
     - Wrong OTP decrements attempts and returns 401.
     - 3 wrong OTPs triggers lockout.
     - Correct OTP returns full `clinical` and `release` structure with `no-store` headers.
     - Replayed OTP is rejected.
   - `POST /api/verify/:token/history-pdf`:
     - Rejects unauthorized requests without view session token.
     - Returns valid PDF stream when supplied with active session token.
   - Token revocation: Revoked token prevents OTP request and unlock.
2. **Key Parity & UI Tests**:
   - Parity test verifies `en`, `si`, and `ta` dictionaries have exact identical keys.
   - Frontend component test validates render states and mobile layout.
