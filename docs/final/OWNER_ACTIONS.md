# MediSync Owner Actions & Production Review Ledger (docs/final/OWNER_ACTIONS.md)

> **Purpose**: This file logs every item requiring student/owner action or external clinical authority (MongoDB Atlas settings, Render dashboard, physical screenshots, clinical formulary sign-offs, and literature citations).
> **Principle**: The autonomous agent will **NEVER block** on these items. All items are cataloged here with exact instructions for the owner.

---

## 1. High Priority (Viva Voce & Final Submission)

| Item ID | Category | Specific Owner Action Required | Reference / Location | Status |
|:---:|---|---|---|:---:|
| **OA-01** | **Atlas Security** | In MongoDB Atlas Dashboard $\to$ Network Access: Remove `0.0.0.0/0` (allow from anywhere) if present, restricting to Render backend outbound IP addresses or documented operational subnets. | Production Security Hardening | `PENDING_OWNER` |
| **OA-02** | **Atlas Admin User** | In MongoDB Atlas Dashboard $\to$ Database Access: Delete the legacy temporary `atlasAdmin` user account if still active. | Production Security Hardening | `PENDING_OWNER` |
| **OA-03** | **Pre-Viva Backup** | Take a manual database dump of `medisync_prod` before the viva voce and store it securely: `mongodump --uri="<MONGODB_URI>" --db="medisync_prod" --out="./backup_pre_viva"`. | Disaster Recovery | `PENDING_OWNER` |
| **OA-04** | **Mailbox for Verify** | Designate a seeded patient account with an email address the owner controls to demonstrate live OTP delivery during the viva verification walk-through. | Live Verification Test | `PENDING_OWNER` |
| **OA-05** | **Screenshots Capture** | Capture physical high-resolution browser screenshots (1920x1080) following [`SCREENSHOT_CHECKLIST.md`](../report/SCREENSHOT_CHECKLIST.md) for final thesis document insertion. | Thesis Document Assets | `PENDING_OWNER` |

---

## 2. Clinical & Medical Review Items

| Item ID | Target Entity | Clinical Question for Reviewing Medical Practitioner | Reference Location | Status |
|:---:|---|---|---|:---:|
| **CR-01** | **Ibuprofen 800 mg** | Single-dose 800 mg ceiling carries elevated gastric mucosal erosion risk in primary care outpatient clinics. Recommend evaluating reduction to 400 mg or 600 mg. | [`MEDICINE_LIMITS_VERIFICATION.md`](../report/MEDICINE_LIMITS_VERIFICATION.md) | `PENDING_CLINICIAN` |
| **CR-02** | **Paracetamol 7 Days** | Continuous 7-day maximum daily dosing (4 g/day) risks cumulative hepatotoxicity. Recommend capping uncomplicated antipyretic outpatient courses at 3–5 days. | [`MEDICINE_LIMITS_VERIFICATION.md`](../report/MEDICINE_LIMITS_VERIFICATION.md) | `PENDING_CLINICIAN` |
| **CR-03** | **Emergency Red Flags** | Review the deterministic rule-based emergency advisory criteria (e.g. sudden severe headache with meningism, chest pain with radiation) added in Phase 4. | `docs/final/PHASE_4_PLAN.md` | `PENDING_CLINICIAN` |

---

## 3. Academic Literature & Official Document Citations

| Item ID | Citation Placeholder | Context in Documentation | Source to Retrieve | Status |
|:---:|---|---|---|:---:|
| **CIT-01** | `[OWNER: cite national OPD workload study]` | Chapter 01 (OPD throughput: 40–80 patients/hour, < 90 seconds per patient) | Sri Lanka Ministry of Health / Annual Health Bulletin or primary care workload survey | `PENDING_OWNER` |
| **CIT-02** | `[OWNER: cite MOH Epidemiology Unit notification protocol]` | Chapter 01 & Demo Script (Traditional Form H-544 manual card dispatch) | Ministry of Health Epidemiology Unit Surveillance Manual | `PENDING_OWNER` |
| **CIT-03** | `[OWNER: cite notification delay study]` | Chapter 01 & Demo Script (Multi-week postal aggregation delay) | Published epidemiological reporting delay literature in Sri Lanka | `PENDING_OWNER` |
| **CIT-04** | `[OWNER: Census 2024 citations]` | Chapter 11 (2024 national census district populations) | Department of Census and Statistics Sri Lanka (Census 2024 preliminary report) | `PENDING_OWNER` |
