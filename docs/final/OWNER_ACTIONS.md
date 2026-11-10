# MediSync Owner Actions & Production Review Ledger (docs/final/OWNER_ACTIONS.md)

> **Purpose**: This file logs every item requiring student/owner action or external clinical authority (MongoDB Atlas settings, Render dashboard, physical screenshots, clinical formulary sign-offs, and literature citations).
> **Principle**: The autonomous agent will **NEVER block** on these items. All items are cataloged here with exact instructions for the owner.

---

## 1. High Priority (Viva Voce & Final Submission)

| Item ID | Category | Specific Owner Action Required | Reference / Location | Status |
|:---:|---|---|---|:---:|
| **OA-01** | **Atlas Security** | In MongoDB Atlas Dashboard $\to$ Network Access: Remove `0.0.0.0/0` (allow from anywhere) if present, restricting to Render backend outbound IP addresses or documented operational subnets. | Production Security Hardening | `PENDING_OWNER` |
| **OA-02** | **Atlas Admin User** | In MongoDB Atlas Dashboard $\to$ Database Access: Delete the legacy temporary `atlasAdmin` user account if still active. | Production Security Hardening | `PENDING_OWNER` |
| **OA-03** | **Pre-Viva Backup & Verification** | Execute full read-only database backup using `node scripts/backup_db_readonly.js --db=medisync_prod --out=<safe_path>` (e.g. `C:\Backups\medisync_prod_backup`). **CRITICAL**: The backup path must reside outside the git workspace AND strictly outside OneDrive to prevent accidental cloud sync exposure or git inclusion. Verify backup integrity via `node scripts/backup_db_readonly.js --verify --db=medisync_prod --out=<safe_path>`. | Disaster Recovery (`scripts/backup_db_readonly.js`) | `PENDING_OWNER` |
| **OA-04** | **Mailbox for Verify** | Designate a seeded patient account with an email address the owner controls to demonstrate live OTP delivery during the viva verification walk-through. | Live Verification Test | `PENDING_OWNER` |
| **OA-05** | **Screenshots Capture** | Capture physical high-resolution browser screenshots (1920x1080) following [`SCREENSHOT_CHECKLIST.md`](../report/SCREENSHOT_CHECKLIST.md) for final thesis document insertion. | Thesis Document Assets | `PENDING_OWNER` |
| **OA-06** | **Rotate Redis Credentials** | In Upstash / Redis Dashboard: Rotate Redis connection string credentials before the final viva demonstration. | Production Security Hardening | PENDING_OWNER |
| **OA-07** | **Change Shared Demo Passwords** | Update shared prototype demonstration passwords (SEED_TEST_PASSWORD) to distinct production credentials after viva voce evaluations. | Production Security Hardening | PENDING_OWNER |
| **OA-08** | **UptimeRobot Timeouts (60s)** | Set UptimeRobot monitoring timeouts to 60s for backend (`medisync-wabc.onrender.com/health`) and ML engine (`medisync-ml.onrender.com/health`) to accommodate ~50s Render cold starts. | Observability & Uptime | `PENDING_OWNER` |
| **OA-09** | **Pre-Viva Warm-up Routine** | Execute warm-up curls 3 minutes before the viva demonstration: `curl -s https://medisync-wabc.onrender.com/health` and `curl -s https://medisync-ml.onrender.com/health`. | Demonstration Readiness | `PENDING_OWNER` |
| **OA-10** | **Render ML Engine Log Inspection** | In Render Dashboard $\to$ `medisync-ml` $\to$ Logs: filter by `[ML]` to inspect request telemetry lines (`request_id`, latency, symptoms_count, tier, top_confidence) and `[ML-STARTUP]` for concept counts. | Observability & Telemetry | `PENDING_OWNER` |
| **OA-11** | **Formulary Benchmark Review** | Have formulary committee/pharmacist review the Top 300 benchmark gaps cataloged in `docs/final/data/medicine_coverage_gaps.json` and supply verified dose ceilings / BNF citations for missing high-frequency generics. | Medicine Coverage Audit | `PENDING_OWNER` |
| **OA-12** | **GitHub Branch Protection** | In GitHub Repo $\to$ Settings $\to$ Branches: Enable branch protection on `main`, requiring status checks to pass before merging ("Security Hardening & Trust Governance Tests" and "MediSync Clinical Offline Verification"). | Repository Security & CI | `PENDING_OWNER` |
| **OA-13** | **Vercel Frontend Redeployment** | If the commit served by Vercel differs from latest `main`, trigger manual redeployment in Vercel Dashboard $\to$ Deployments $\to$ Deploy from `main`. | Production Frontend Sync | `PENDING_OWNER` |
| **OA-14** | **Synthetic Patient NIC for Screenshots** | For all final thesis and viva screenshots, use synthetic demonstration patient NICs (e.g. `199012345678`, `200012345678`) rather than real personal identity card numbers to preserve privacy in published documents. | Documentation Privacy | `PENDING_OWNER` |
| **OA-15** | **Apply Viva Seed Data** | Set `SEED_TEST_PASSWORD` and execute `node scripts/seed-viva-data.js --confirm --db=medisync_prod` to populate 917 demonstration records (S-A Gampaha Dengue outbreak, S-D Kandy Influenza outbreak, Demo Patient Chamod Tharusha `200012345678`). Verify via `node scripts/seed-viva-data.js --verify`. Reversible via `--rollback`. | Viva Readiness (`docs/final/SEED_REPORT.md`) | `PENDING_OWNER` |
| **OA-16** | **Burned QR Capability Token Invalidation** | The earlier deterministic demonstration capability token (raw token starting with `8390ba72...`, stored tokenHash `f86a9daf...`) was committed in earlier repository history and is only invalidated when its physical database record is actually deleted. Standard rollback previously left untagged records in production; executing `node scripts/seed-viva-data.js --rollback --legacy --confirm --db=medisync_prod` permanently deletes this token record along with all leftover initial seed documents. Fresh seed executions generate an ephemeral CSPRNG random 32-byte token printed only once to stdout; only its SHA-256 hash is persisted in the database. | Security & Secret Hygiene | `PENDING_OWNER` |
| **OA-17** | **Protected Controller Error Sanitization (F07)** | `server/src/controllers/doctorController.js` is locked under the 15-file cryptographic ledger (`PROTECTED_HASHES.json`). Like several other controllers (`drugController.js`, `prescriptionController.js`, `alertController.js`, `adminController.js`), catch blocks return `error.message`. In `verificationController.js`, all catch blocks were remediated to return fixed public messages (`'Failed to generate clinical encounter PDF'`, `'Failed to process verification OTP request'`). When an authorized ledger change is scheduled, update `doctorController.js` error responses to fixed generic strings and update `PROTECTED_HASHES.json`. | Security Finding F07 / Protected Ledger | `PENDING_OWNER` |

---

## 2. Clinical & Medical Review Items

| Item ID | Target Entity | Clinical Question for Reviewing Medical Practitioner | Reference Location | Status |
|:---:|---|---|---|:---:|
| **CR-01** | **Ibuprofen 800 mg** | Single-dose 800 mg ceiling carries elevated gastric mucosal erosion risk in primary care outpatient clinics. Recommend evaluating reduction to 400 mg or 600 mg. | [`MEDICINE_LIMITS_VERIFICATION.md`](../report/MEDICINE_LIMITS_VERIFICATION.md) | `PENDING_CLINICIAN` |
| **CR-02** | **Paracetamol 7 Days** | Continuous 7-day maximum daily dosing (4 g/day) risks cumulative hepatotoxicity. Recommend capping uncomplicated antipyretic outpatient courses at 3–5 days. | [`MEDICINE_LIMITS_VERIFICATION.md`](../report/MEDICINE_LIMITS_VERIFICATION.md) | `PENDING_CLINICIAN` |
| **CR-03** | **Emergency Red Flags** | Review the deterministic rule-based emergency advisory criteria (e.g. sudden severe headache with meningism, chest pain with radiation) added in Phase 4. | `docs/final/PHASE_4_PLAN.md` | `PENDING_CLINICIAN` |
| **CR-04** | **Safety Severity Mapping & Acknowledgment Wording** | Review finding severity tiers (`critical`, `severe`, `moderate`, `info`) and acknowledgment confirmation text ("I have reviewed these warnings and accept clinical responsibility") before clinical deployment. | `server/src/utils/clinicalSafetyValidator.js` | `PENDING_CLINICIAN` |
| **CR-05** | **Formulary Additions Sign-off** | Pharmacist / clinician sign-off on unverified dosage limits for newly added generics (`Citalopram`, `Penicillin`) prior to live prescription dispensing in production. | `server/src/data/medicine_safety_limits.json` | `PENDING_CLINICIAN` |

---

## 3. Academic Literature & Official Document Citations

| Item ID | Citation Placeholder | Context in Documentation | Source to Retrieve | Status |
|:---:|---|---|---|:---:|
| **CIT-01** | `[OWNER: cite national OPD workload study]` | Chapter 01 (OPD throughput: 40–80 patients/hour, < 90 seconds per patient) | Sri Lanka Ministry of Health / Annual Health Bulletin or primary care workload survey | `PENDING_OWNER` |
| **CIT-02** | `[OWNER: cite MOH Epidemiology Unit notification protocol]` | Chapter 01 & Demo Script (Traditional Form H-544 manual card dispatch) | Ministry of Health Epidemiology Unit Surveillance Manual | `PENDING_OWNER` |
| **CIT-03** | `[OWNER: cite notification delay study]` | Chapter 01 & Demo Script (Multi-week postal aggregation delay) | Published epidemiological reporting delay literature in Sri Lanka | `PENDING_OWNER` |
| **CIT-04** | `[OWNER: Census 2024 citations]` | Chapter 11 (2024 national census district populations) | Department of Census and Statistics Sri Lanka (Census 2024 preliminary report) | `PENDING_OWNER` |

- [ ] **Emergency Red-Flag Rule Review**: Have a licensed medical officer review `server/src/data/emergencyRedFlags.json` (6 conservative heuristic rules: acute meningism, acute cardiorespiratory distress, acute coronary symptoms, altered mental status, suspected anaphylaxis, severe active hemorrhage) to validate trigger keywords and advisory language before clinical deployment.
