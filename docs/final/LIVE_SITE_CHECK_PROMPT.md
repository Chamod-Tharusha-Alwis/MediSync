# MediSync Live Production Site Verification Prompt (LIVE_SITE_CHECK_PROMPT.md)

**Role**: Production Release Validator & Clinical QA Lead  
**Target Environment**: `https://medisync.chamodtharusha.com.lk` (Production)  
**Database**: `medisync_prod` (MongoDB Atlas M0 Sandbox)  
**Audit Reference**: Viva Live Demonstration Candidate (11 November 2026)

---

## 1. Authentication Boundary & Account Roles

> [!IMPORTANT]
> **Production rejects synthetic accounts by design**: All accounts seeded by `seed-viva-data.js` are flagged with `isSynthetic: true` and `syntheticSeedBatch: "viva-2026-11"`. The production admission policy (`accountState.js`) blocks login attempts for synthetic personas.
> 
> **Live demonstrations strictly use the owner's existing, non-seeded role accounts**. Seeded data is used exclusively for public health epidemiological aggregations and the demo patient record (NIC `200012345678`).

### Owner Demonstration Accounts
Fill in your authorized live credentials before starting the demonstration:

| Role | Email / Username | Password | Purpose in Demonstration |
|---|---|---|---|
| **System Administrator** | `<OWNER_ADMIN_EMAIL>` | `<OWNER_ADMIN_PASSWORD>` | Outbreak detection scan trigger, alert approval, audit log review |
| **Medical Officer (Doctor)** | `<OWNER_DOCTOR_EMAIL>` | `<OWNER_DOCTOR_PASSWORD>` | Patient consent OTP request, safety engine preview, consultation commit |
| **Pharmacist** | `<OWNER_PHARMACIST_EMAIL>` | `<OWNER_PHARMACIST_PASSWORD>` | Prescription lookup, populated stock selector, dispense checkout, duplicate lock |
| **Hospital Administrator** | `<OWNER_HOSPITAL_EMAIL>` | `<OWNER_HOSPITAL_PASSWORD>` | Laboratory management, completed diagnostic report download |

---

## 2. End-to-End Walkthrough Sequence

### Phase 1: Doctor Consultation & Patient Consent OTP
1. Navigate to `/login` and sign in with `<OWNER_DOCTOR_EMAIL>`.
2. Click **Start New Consultation** (`/doctor/consultation/new`).
3. Enter Demonstration Patient NIC: `200012345678` (Patient: **Chamod Tharusha**).
4. Click **Request Patient Consent**:
   - System dispatches a 6-digit OTP to the patient's registered contact email.
   - Enter the OTP received by the patient to unlock full medical history.
5. Enter clinical encounter details:
   - Primary Diagnosis: Enter symptoms or search ICD-10/ICD-11 (e.g., `A90` Dengue fever or `J11.1` Influenza).
   - Prescribe medications: Select `Warfarin 5mg` and add `Ciprofloxacin 500mg`.
   - **Observe Medicine Safety Gate**: Real-time Drug-Drug Interaction (DDI) alert fires, warning of bleeding risk.
   - Acknowledge clinical findings with clinical justification.
6. Click **Save Consultation**:
   - Encounter is committed with AES-256 field encryption.
   - Consultation summary email is dispatched to the patient.
   - **Zero PII in Email**: The notification email contains strictly the capability verification link (`/verify/<TOKEN>`); no diagnostic text, medicines, or patient identifiers are included in the email body.

### Phase 2: Patient Capability Verification, Consultation PDF & Lab Reports
1. Open the verification URL received in the summary email: `https://medisync.chamodtharusha.com.lk/verify/<TOKEN>`.
2. **Observe Public Gate**: The unauthenticated portal displays institutional authenticity (Hospital Name, Doctor Name, Issuance Date) with **zero clinical data and zero patient PII**.
3. Click **Unlock Full Clinical Summary**:
   - A 6-digit single-use OTP is sent to the patient's registered email.
   - Enter the OTP in the verification modal.
   - Portal unlocks the encounter details, prescribed medications, and release timeline.
   - Entering 5 incorrect OTPs triggers lockout (`OTP_LOCKED`, HTTP 429), locking the UI and input.
4. **Inspect Laboratory Tests**:
   - View ordered diagnostic tests linked specifically to this consultation.
   - Tests show ordered date and real-time status (`Ordered`, `Sample Collected`, `In Progress`, `Completed`).
   - For `Completed` tests, click **Download Report** to retrieve the verified laboratory PDF.
5. **Download Consultation Report (PDF)**:
   - Click **Download Consultation Report (PDF)** to export the encounter record.
   - The PDF contains strictly this single encounter: vitals, diagnosis, symptoms, prescribed medicines with release status, prescriber safety acknowledgments, and laboratory tests section.
   - Zero patient history or past encounter data is included in the export.
   - Encrypted with the patient's NIC password. Filename: `MediSync-Consultation-<REF>.pdf`.

### Phase 3: Streamlined Pharmacy Dispensing & Duplicate Block
1. Navigate to `/login` and sign in with `<OWNER_PHARMACIST_EMAIL>`.
2. Open the Pharmacy Dispense interface (`/pharmacy/dashboard/dispense`).
3. View the pending prescription issued in Phase 1.
4. **Prescription Verification & Safety Review**:
   - Dispense modal displays medication name, dosage, frequency, duration, editable quantity dispensed, and interaction summary (decrypted server-side; no `enc:` or ciphertext leak).
   - If warnings exist, check **"I have reviewed the safety information"** (prescriber override respected). If check is incomplete, neutral warning displays (no green checkmark).
   - MediSync operates inventory-free; no stock dropdown or decrement blocking clinical dispensing.
5. Click **Confirm Dispense**:
   - Prescription status transitions to `dispensed` atomically.
   - Single debounced patient notification dispatches.
6. **Duplicate Lock Verification**: Click **Confirm Dispense** again immediately on the same item. Verify rejection with `ALREADY_DISPENSED` ('Prescription is not eligible for dispensing.').

### Phase 4: Administrative Outbreak Detection & Public Observatory
1. Sign out and sign in with `<OWNER_ADMIN_EMAIL>`.
2. Navigate to `/admin/dashboard/outbreak` (Outbreak Monitor).
3. Click **Force System Scan** (`POST /api/admin/outbreak/trigger`):
   - Statistical surveillance evaluates 56-day district baseline and 7-day active window across verified consultations.
   - **Gampaha Dengue**: Triggers Pending Alert ($N=12 \ge 5$, 4 consecutive days $z > 2.0$, Critical Severity).
   - **Kandy Influenza**: Triggers Pending Alert ($N=8 \ge 5$, 4 consecutive days $z > 2.0$, High Severity).
   - **Galle Leptospirosis**: Triggers Pending Alert ($N=9 \ge 5$, Critical Severity).
   - **Ratnapura Typhoid**: Triggers Pending Alert ($N=7 \ge 5$, Critical Severity).
   - **Suppressed Signals Panel**: Inspect the governance gates proving suppression:
     - **Kalutara**: Suppressed by Gate 2 Persistence (`PERSISTENCE_CRITERIA_NOT_MET`, single-day spike of 6 cases).
     - **Matara**: Suppressed by Gate 1 Floor (`CASE_FLOOR_NOT_MET`, cluster of 4 cases < 5).
4. In the **Outbreak Surveillance Logs** table, review the detected signals and click **Approve** on an alert (`PUT /api/admin/outbreak/:id/approve`):
   - Modal allows selecting notification scope:
     - **No Emails (Dashboard Only)**: Activates alert on dashboard and public observatory without dispatching emails.
     - **District Only**: Displays real-time recipient count preview box and dispatches advisories to district opted-in users.
     - **Nationwide**: Requires typing the disease name to confirm before activating nationwide broadcast.
   - Alerts transition from `Pending` to `Active` with `approvedBy` set to the administrator's ID.
5. Navigate to the Public Health Observatory (`/public-health`):
   - The **Active Disease Advisories** section immediately displays the approved alerts.
   - Zero advisories appear for suppressed districts (Kalutara or Matara).

---

## 3. Post-Demo Integrity Checklist
- [ ] No seeded persona attempted login on production.
- [ ] Verification link opened and unlocked via email OTP.
- [ ] Prescription successfully dispensed once; duplicate checkout blocked.
- [ ] Both outbreak alerts approved and visible on `/public-health`.
- [ ] Protected file ledger remains 15/15 byte-exact.
