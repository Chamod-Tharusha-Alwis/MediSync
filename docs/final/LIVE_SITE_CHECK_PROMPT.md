# MediSync Live Production Site Verification Prompt (LIVE_SITE_CHECK_PROMPT.md)

**Role**: Production Release Validator & Clinical QA Lead  
**Target Environment**: `https://medisync.chamodtharusha.com.lk` (Production)  
**Database**: `medisync_prod` (MongoDB Atlas M0 Sandbox)  
**Audit Reference**: Viva Live Demonstration Candidate (13 November 2026)  
**Git Branch Baseline**: `release/final-master-nov13`  

---

## 1. Authentication Boundary & Account Roles

> [!IMPORTANT]
> **Production rejects synthetic accounts by design**: All accounts seeded by seeder scripts are flagged with `isSynthetic: true` and `syntheticSeedBatch: "viva-2026-11-outbreaks"`. The production admission policy blocks login attempts for synthetic personas.
> 
> **Live demonstrations strictly use the owner's existing, non-seeded role accounts**. Seeded data is used exclusively for public health epidemiological aggregations and the demo patient record (NIC `200012345678`).

### Owner Demonstration Accounts
Fill in your authorized live credentials before starting the demonstration:

| Role | Email / Username | Password | Purpose in Demonstration |
|---|---|---|---|
| **System Administrator** | `<OWNER_ADMIN_EMAIL>` | `<OWNER_ADMIN_PASSWORD>` | Outbreak detection scan trigger, alert approval, audit log review |
| **Medical Officer (Doctor)** | `<OWNER_DOCTOR_EMAIL>` | `<OWNER_DOCTOR_PASSWORD>` | Patient consent OTP request, safety engine preview, consultation commit |
| **Pharmacist** | `<OWNER_PHARMACIST_EMAIL>` | `<OWNER_PHARMACIST_PASSWORD>` | Direct prescription review, dispense checkout, duplicate lock |
| **Hospital Administrator** | `<OWNER_HOSPITAL_EMAIL>` | `<OWNER_HOSPITAL_PASSWORD>` | Laboratory management, completed diagnostic report download |

---

## 2. End-to-End Walkthrough Sequence

### Phase 1: Doctor Consultation & Patient Consent OTP
1. Navigate to `/login` and sign in with `<OWNER_DOCTOR_EMAIL>`.
2. Click **Start New Consultation** (`/doctor/consultation/new`).
3. Enter Demonstration Patient NIC: `200012345678`.
4. Click **Request Patient Consent**:
   - System dispatches a 6-digit OTP to the patient's registered contact email.
   - Enter the OTP received by the patient to unlock full medical history.
5. Enter clinical encounter details:
   - Chief complaints: `high_fever`, `retro_orbital_pain`, `joint_pain`, `rash`. Click **Analyze Symptoms** (suggests Dengue fever).
   - Primary Diagnosis: Search ICD-10 catalog (71,704 leaf concepts) and select `A90` Dengue fever.
   - Prescribe medications: Select `Warfarin 5mg` and add `Ciprofloxacin 500mg`.
   - **Observe Medicine Safety Gate**: Real-time Drug-Drug Interaction (DDI) alert fires, warning of severe bleeding risk.
   - Acknowledge clinical findings with clinical justification ("Monitored daily with INR checks").
6. Click **Save Consultation**:
   - Encounter is committed with AES-256 field encryption.
   - Consultation summary email is dispatched to the patient (contains only the capability verification link `/verify/<TOKEN>`; zero clinical PII).

### Phase 2: Patient Capability Verification, Consultation PDF & Lab Reports
1. Open the verification URL received in the summary email: `https://medisync.chamodtharusha.com.lk/verify/<TOKEN>`.
2. **Observe Public Gate**: The unauthenticated portal displays institutional authenticity (Hospital Name, Doctor Name, Issuance Date) with **zero clinical data and zero patient PII**.
3. Click **Unlock Full Clinical Summary**:
   - A 6-digit single-use OTP is sent to the patient's registered email.
   - Enter the OTP in the verification modal.
   - Portal unlocks encounter details, prescribed medications, and release timeline.
   - Entering 5 incorrect OTPs triggers lockout (`OTP_LOCKED`, HTTP 429), permanently locking the UI.
4. **Inspect Laboratory Tests & Download Encounter PDF**:
   - View ordered diagnostic tests linked specifically to this consultation.
   - **PDF caveats (read before demonstrating):**
     - The download works only if **both** flags are on: `PDF_EXPORT_ENABLED=true` on Render **and** `REACT_APP_PDF_EXPORT_ENABLED=true` on Vercel, followed by a Vercel rebuild. Both default to off. When off, the server answers HTTP 503 `SECURITY_HOLD` and the button stays disabled.
     - When on, the PDF is encrypted with **RC4-128** (`/V 2 /R 3`), not AES. The password is the patient NIC (or the consultation reference), so it is low-entropy. Describe it as a casual-access deterrent, not confidentiality. If neither value exists, the export is refused. See `PDF_ENCRYPTION_LIMITATION.md`.
     - Recommended: keep both flags off for the viva unless an examiner asks; if shown, use synthetic records only.
   - If enabled, click **Download Consultation Report (PDF)**: the document contains only this single clinical encounter, with no historical records.

### Phase 3: Direct Pharmacy Dispensing & Duplicate Block
1. Navigate to `/login` and sign in with `<OWNER_PHARMACIST_EMAIL>`.
2. Open the Pharmacy Dispense interface (`/pharmacy/dashboard/dispense`).
3. Enter patient NIC `200012345678` and verify consent.
4. View the pending prescription issued in Phase 1:
   - Notice that MediSync operates **inventory-free**: no stock dropdowns, inventory decrements, manual OTC checkout or restock analytics. The pharmacy menu shows Dispense, History, Staff (admin) and Settings only.
   - Pharmacist verifies prescribed medications and reviews prescriber safety override.
   - Check "I have reviewed safety information".
5. Click **Confirm Dispense**:
   - Prescription status transitions to `dispensed` atomically.
   - Dispensing receipt generated.
6. **Duplicate Lock Verification**:
   - Click **Confirm Dispense** again immediately on the same item.
   - Verify atomic rejection with `ALREADY_DISPENSED` (HTTP 409: 'Prescription is not eligible for dispensing.').

### Phase 4: Administrative Outbreak Detection & Public Observatory
1. Sign out and sign in with `<OWNER_ADMIN_EMAIL>`.
2. Navigate to `/admin/dashboard/outbreak` (Outbreak Monitor).
3. **Inspect Top Overall Outbreak Summary Tiles**:
   - Outbreaks detected (Pending + Active).
   - Verified outbreak cases in last 72h across all outbreak diseases island-wide.
   - Previous 72h comparison cases.
   - Overall percentage change (or "new").
   - Highest incidence district.
4. **Inspect Last Scan Status Line**:
   - Displays: *"Last scan: [Timestamp], [N] cases scanned. Scan complete: N outbreaks detected, M signals suppressed."*
5. Click **Run Statistical Detection Scan** (`POST /api/admin/outbreak/trigger`):
   - Statistical surveillance evaluates 56-day district baseline and 7-day active window across verified consultations.
   - **Gampaha Dengue**: Triggers Pending Alert ($N \ge 5$, 4 consecutive days $z > 2.0$, Critical Severity).
   - **Kandy Influenza**: Triggers Pending Alert ($N \ge 5$, 4 consecutive days $z > 2.0$, High Severity).
   - **Kalutara (Negative Control)**: Suppressed by Gate 2 Persistence (`PERSISTENCE_CRITERIA_NOT_MET`, single-day spike of 6 cases).
   - **Matara (Negative Control)**: Suppressed by Gate 1 Floor (`CASE_FLOOR_NOT_MET`, cluster of 3 cases < 5; seeded as 1 case on each of days −3, −2 and −1 in `scripts/seed_viva_outbreaks.js`).
   - Detection is district-level only, so neither negative control can raise a province or island alert.
6. **Inspect Filtered Growth Table**:
   - Displays **only** diseases with an active or pending outbreak alert (Top 10 by last 72h cases).
   - Shows primary 72h metric, previous 72h change, DCS population share (e.g. `0.0005%`, never 0%), and incidence per 100k.
7. **Outbreak Approval & Demonstration Email Workflow**:
   - Review the detected alerts and click **Approve** on an alert (`PUT /api/admin/outbreak/:id/approve`).
   - Modal displays primary 72h metric: *"12 verified cases in the last 72h (previous 72h: 3, +9). 0.0005% of district population, 0.52 per 100,000."*
   - Click **"Preview Recipients"**: displays recipient count breakdown by role.
   - Click **"Send Me a Test Email"**: delivers an instant test email to the administrator.
   - Select Broadcast Scope: **District Only** or **Nationwide**.
   - Notice **Demonstration Data Banner**: an alert built from synthetic seed data (`isDemoData: true`, `syntheticSeedBatch: viva-2026-11-outbreaks`) is restricted to `OUTBREAK_DEMO_EMAIL_ALLOWLIST` (or, if that is empty, only your own reviewer address), with a `[DEMONSTRATION]` subject prefix and a red banner.
   - **Before approving:** run the scan once after deploying the hardening build so that existing viva alerts pick up their demonstration flags. Confirm the preview says demonstration and shows only allowlisted recipients.
   - Real (non-demo) alerts send no email unless `OUTBREAK_EMAIL_DELIVERY_ENABLED=true`. Keep it unset or `false` for the viva.
   - Click **Confirm Approval**: The alert transitions to `Active`.
8. Navigate to the Public Health Observatory (`/public-health`):
   - The **Active Disease Advisories** section displays the approved alerts. Viva alerts carry a red "Demonstration data" label.
   - Zero advisories appear for suppressed districts (Kalutara or Matara).
   - 3 Summary cards display live verified counts, active alert counts, and projection status.
   - The 14-day OLS trend chart with 95% prediction interval renders honestly labeled as statistical trend projection.

---

## 3. Post-Demo Integrity Checklist
- [ ] No seeded persona attempted login on production.
- [ ] Verification link opened and unlocked via email OTP.
- [ ] Prescription successfully dispensed once without inventory requirements; duplicate checkout blocked.
- [ ] Outbreak alerts approved and visible on `/public-health`.
- [ ] Demonstration alert broadcast confined to allowlist.
- [ ] Protected file ledger remains 15/15 byte-exact.
