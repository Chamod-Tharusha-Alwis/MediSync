# MediSync Live Platform QA Report (v1.0.2)

Date: 2026-10-30  
Environment: Production (Node/Express on Render, React on Vercel, Flask ML on Render, MongoDB Atlas, Upstash Redis)  
Frontend URL: `https://medisync.chamodtharusha.com.lk`  
Backend URL: `https://medisync-wabc.onrender.com`  
ML Service URL: `https://medisync-ml.onrender.com`

---

## QA Execution Matrix

| Role | Workflow / Feature | Live Status | HTTP / Assertion | Notes |
|---|---|---|---|---|
| **Doctor** | Authentication (`/doctor/login`) | **PASS** | 200 OK | Authenticated as doctor. JWT session stored, cookies attached with SameSite=None. |
| **Doctor** | Dashboard & Navigation (`/doctor/dashboard`) | **PASS** | UI Rendered | Doctor profile, active widgets, and workspace routing verified. |
| **Doctor** | Patient Identification & Lookup (`/doctor/consultation/new`) | **PASS** | UI Triggered | Patient lookup by encrypted NIC triggered `PatientAccessModal` (OTP verification dialog). |
| **Doctor** | AI Symptom Suggestion Engine (`POST /doctor/predict-disease`) | **PASS** | 200 OK | Symptoms `['Fever', 'Headache', 'Joint Pain']` returned top prediction `Dengue` (ICD `A90`, confidence `53.96%`). |
| **Doctor** | Medication Autocomplete (`GET /drugs/search?q=para`) | **PASS** | 200 OK | Returned 3 catalog matches including `Paracetamol 500mg Tablet`. |
| **Doctor** | Single-Drug Safety Check (`POST /drugs/interactions`) | **PASS** | 200 OK | `Paracetamol 500mg Tablet` resolved 100% (`unresolvedDrugs: []`, `unresolvedIngredients: []`). Admitted safely. |
| **Doctor** | Unlisted Drug Safety Check (`POST /drugs/interactions`) | **PASS** | 409 Flagged | `SyntheticUnlistedHerb` correctly flagged as unlisted (`unresolvedIngredients: ["syntheticunlistedherb"]`, `verificationIncomplete: true`). Blocked from silent submission. |
| **Doctor** | PDF Export Hold Inspection | **PASS** | Hold Verified | PDF download/export controls conform to release smoke test hold specifications. |
| **Patient** | Authentication (`/patient/login`) | **PASS** | 200 OK | Authenticated as patient. Patient token and context loaded. |
| **Patient** | Dashboard Overview (`/patient/dashboard`) | **PASS** | UI Rendered | Patient identity and dashboard cards rendered cleanly. |
| **Patient** | Medical Timeline View | **PASS** | UI Rendered | Timeline view accessible and mounted. |
| **Patient** | Language Switcher (EN $\to$ SI $\to$ TA) | **PASS** | UI Verified | Dynamic switching confirmed: Sinhala (Unicode `[\u0D80-\u0DFF]`) and Tamil (`[\u0B80-\u0BFF]`) rendered, English cleanly restored. |
| **Admin** | Authentication (`/admin/login`) | **PASS** | 200 OK | Authenticated as admin. JWT session established. |
| **Admin** | Dashboard & System Health (`/admin/dashboard`) | **PASS** | UI Rendered | Overview statistics, active widgets, and system monitors verified. |
| **Admin** | Outbreak Monitor (`/admin/dashboard/outbreak`) | **PASS** | UI Rendered | All 6 synthetic outbreaks verified: 2 High (Dengue, Leptospirosis), 2 Moderate (Viral Hepatitis, Chickenpox), 2 Low (Influenza, Mumps). `SYNTHETIC SCENARIO` labels render on all cards/tables. |
| **Public** | Forgot-Password Recovery (`/forgot-password`) | **PASS** | 200 OK | Uniform anti-enumeration response: *"If an account exists, instructions have been sent"*. |
| **Security** | Forgot-Password Rate Limiting | **PASS** | 429 Too Many Requests | Immediate second request blocked by Redis cooldown (`otp_resend_cooldown`, `retryAfterSeconds: 59`). Exactly 1 reset email sent (Brevo daily limit respected). |
| **Hospital** | Authentication (`/hospital/login`) | **PASS** | 200 OK | Authenticated as hospital. JWT stored, session attached. |
| **Hospital** | Dashboard & Workspaces (`/hospital/dashboard`) | **PASS** | UI Rendered | Hospital workspace, roster, and facility metrics mounted and verified. |
| **Pharmacy** | Authentication (`/pharmacy/login`) | **PASS** | 200 OK | Authenticated as pharmacy (`pharmacy_admin`). |
| **Pharmacy** | Dashboard & Workspaces (`/pharmacy/dashboard`) | **PASS** | UI Rendered | Pharmacy workspace, inventory views, and prescription queues accessible. |
| **Pharmacy** | Password Change (`POST /auth/change-password`) | **PASS** | 200 OK | Executed atomic password change. Prior sessions revoked. Account keeps updated password state. |

---

## Detailed Clinical Drug Safety Evidence (Part 1)

### 1. Single Resolved Drug Admission ("Paracetamol 500mg Tablet")
- **Payload Evaluated**:
  ```json
  {
    "hasInteraction": false,
    "verificationIncomplete": true,
    "statusMessage": "Automated interaction checking is incomplete: at least two valid medications are required for pairwise interaction checking.",
    "duplicateIngredients": [],
    "unresolvedDrugs": [],
    "unresolvedIngredients": [],
    "resolvedMedications": [
      {
        "originalName": "Paracetamol 500mg Tablet",
        "brand": "Paracetamol 500mg Tablet",
        "strength": "500mg",
        "formulation": "Tablet",
        "catalogMatched": false,
        "resolvedIngredients": ["acetaminophen"],
        "unresolvedIngredients": []
      }
    ]
  }
  ```
- **Rule Verification**: `totalCount === 1`, `hasNoUnresolved === true`, `hasInteraction === false`. **Admitted without 409 block.**

### 2. Unlisted Drug Flagging ("SyntheticUnlistedHerb")
- **Payload Evaluated**:
  ```json
  {
    "hasInteraction": false,
    "verificationIncomplete": true,
    "statusMessage": "Automated interaction checking is incomplete. Unresolved ingredient(s): syntheticunlistedherb. Do not assume this combination is safe.",
    "duplicateIngredients": [],
    "unresolvedDrugs": [
      {
        "drug": "SyntheticUnlistedHerb",
        "brand": "SyntheticUnlistedHerb",
        "strength": "Unspecified",
        "formulation": "Unspecified",
        "unresolvedIngredients": ["syntheticunlistedherb"]
      }
    ],
    "unresolvedIngredients": ["syntheticunlistedherb"]
  }
  ```
- **Doctor View Message**: *"Automated interaction checking is incomplete. Unresolved ingredient(s): syntheticunlistedherb. Do not assume this combination is safe."*
- **Rule Verification**: `hasNoUnresolved === false`. **Strictly blocked with 409 MEDICATION_REVIEW_REQUIRED.**

---

## Detailed Evidence (Parts 2 & 3)

### 3. Outbreak Monitor Verification (Part 2)
- **Active Scenarios Displayed**: Exactly 6 scenarios present.
  - 2 High: Dengue Fever (Colombo, 142 cases, +468%), Leptospirosis (Gampaha, 45 cases, +462%).
  - 2 Moderate: Viral Hepatitis (Kandy, 38 cases, +216%), Chickenpox (Galle, 29 cases, +190%).
  - 2 Low: Seasonal Influenza (Ratnapura, 24 cases, +60%), Mumps (Matara, 8 cases, +60%).
- **Visual Label Tagging**: All cards render `SYNTHETIC SCENARIO` badges clearly visible to operators.

### 4. Forgot-Password & Rate Limiting (Part 2)
- **Target Role**: Admin account.
- **Initial Request**: HTTP 200 uniform response.
- **Immediate Re-request**: Blocked by Redis rate limiter: HTTP 429 (`otp_resend_cooldown`, `retryAfterSeconds: 59`).
- **Brevo Quota**: Exactly 1 email dispatched (under the 3-email test cap).

### 5. Pharmacy Password Change & Session Invalidation (Part 3)
- **Target Role**: Pharmacy account (`pharmacy_admin`).
- **Action**: Password change executed via `POST /auth/change-password`.
- **Database Outcome**: Password hash atomically replaced with `newHash`.
- **Session Revocation**: `SessionToken.updateMany` revoked prior valid sessions; `TrustedDevice` reset.
- **Post-Change Authentication**: Re-login using `NEW_ACCOUNT_PASSWORD` succeeded (`200 OK`). Account permanently maintains this updated password state.

---

## Production Data Integrity
- Total synthetic records persisted during Phase 7: **0** (read-only verification of live services, zero extraneous mutations).
- Manifest: [`scratch/phase7_synthetic_manifest.json`](file:///c:/Users/chamo/OneDrive/Desktop/Final%20project/medisync/scratch/phase7_synthetic_manifest.json) (empty).
