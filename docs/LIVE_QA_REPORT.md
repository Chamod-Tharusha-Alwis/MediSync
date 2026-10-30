# MediSync Live Platform QA Report (v1.0.2)

Date: 2026-10-30  
Environment: Production (Node/Express on Render, React on Vercel, Flask ML on Render, MongoDB Atlas `medisync_prod`, Upstash Redis)  
Frontend URL: `https://medisync.chamodtharusha.com.lk`  
Backend URL: `https://medisync-wabc.onrender.com`  
ML Service URL: `https://medisync-ml.onrender.com`

---

## QA Execution Matrix

| Role | Workflow / Feature | Live Status | HTTP / Assertion | Notes |
|---|---|---|---|---|
| **Doctor** | Authentication (`/doctor/login`) | **PASS** | 200 OK | Authenticated as `Dr. Chamod Alwis`. JWT session stored, cookies attached with SameSite=None. |
| **Doctor** | Dashboard & Navigation (`/doctor/dashboard`) | **PASS** | UI Rendered | Doctor profile, active widgets, and workspace routing verified. |
| **Doctor** | Patient Identification & Lookup (`/doctor/consultation/new`) | **PASS** | UI Triggered | Patient lookup by encrypted NIC triggered `PatientAccessModal` (OTP verification dialog). |
| **Doctor** | AI Symptom Suggestion Engine (`POST /doctor/predict-disease`) | **PASS** | 200 OK | Symptoms `['Fever', 'Headache', 'Joint Pain']` returned top prediction `Dengue` (ICD `A90`, confidence `53.96%`). |
| **Doctor** | Medication Autocomplete (`GET /drugs/search?q=para`) | **PASS** | 200 OK | Returned 3 catalog matches including `Paracetamol 500mg Tablet`. |
| **Doctor** | Single-Drug Safety Check (`POST /drugs/interactions`) | **PASS** | 200 OK | `Paracetamol 500mg Tablet` resolved 100% (`unresolvedDrugs: []`, `unresolvedIngredients: []`). Admitted safely. |
| **Doctor** | Unlisted Drug Safety Check (`POST /drugs/interactions`) | **PASS** | 409 Flagged | `SyntheticUnlistedHerb` correctly flagged as unlisted (`unresolvedIngredients: ["syntheticunlistedherb"]`, `verificationIncomplete: true`). Blocked from silent submission. |
| **Doctor** | PDF Export Hold Inspection | **PASS** | Hold Verified | PDF download/export controls conform to release smoke test hold specifications. |
| **Patient** | Authentication (`/patient/login`) | **PASS** | 200 OK | Authenticated as `Chamod Tharusha`. Patient token and NIC context loaded. |
| **Patient** | Dashboard Overview (`/patient/dashboard`) | **PASS** | UI Rendered | Patient identity and dashboard cards rendered cleanly. |
| **Patient** | Medical Timeline View | **PASS** | UI Rendered | Timeline view accessible and mounted. |
| **Patient** | Language Switcher (EN $\to$ SI $\to$ TA) | **PASS** | UI Verified | Dynamic switching confirmed: Sinhala (Unicode `[\u0D80-\u0DFF]`) and Tamil (`[\u0B80-\u0BFF]`) rendered, English cleanly restored. |

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

## Production Data Integrity
- Total synthetic records persisted during Part 1: **0** (read-only verification of live services and APIs).
- Manifest: [`scratch/phase7_synthetic_manifest.json`](file:///c:/Users/chamo/OneDrive/Desktop/Final%20project/medisync/scratch/phase7_synthetic_manifest.json) (empty).
