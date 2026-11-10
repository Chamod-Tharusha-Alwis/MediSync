# MediSync Viva Voce Demonstration Seed Report

**Batch Tag**: `viva-2026-11`  
**Execution Date**: 2026-11-10  
**Status**: Verified & Ready for Production Confirmation  
**Test Suite Verification**: 22/22 PASS (`server/tests/vivaSeedData.test.js`), 3,617/3,617 overall suite PASS (`scripts/run_offline_tests.js`) across 225 suites  

---

## 1. Executive Summary & Design Principles

The MediSync Viva Voce Demonstration seed dataset was created pursuant to `docs/final/SEED_DATA_PROMPT.md` to provide a realistic, mathematically proven demonstration dataset for the capstone viva examination.

### Guarantees
1. **100% Synthetic & Privacy Compliant**: Zero real patient or practitioner data. All email addresses use `.invalid` RFC 2606 reserved TLDs (`dr.anura.jayasinghe.1@accounts.invalid`, `chamod.demo.patient@accounts.invalid`).
2. **Non-Destructive & Isolated**: All seed documents are tagged with `syntheticSeedBatch: "viva-2026-11"` and `isSynthetic: true`. Consultations use predictable IDs `CON-VIVA-2026-XXXX`. Existing real or test data is untouched.
3. **Fully Reversible**: Atomic rollback via `node scripts/seed-viva-data.js --rollback` removes exactly the 917 seeded documents across 10 collections without cascade risk.
4. **Safety & Zero Disruption**: No notification emails or SMS messages are dispatched during seeding (`EMAIL_PROVIDER=none`). Passwords are deterministically derived from `SEED_TEST_PASSWORD` or `TEMP_ACCOUNT_PASSWORD` using bcrypt (cost 10) and are **never logged or printed**.
5. **Exact Outbreak Scenario Proofs**: Scenarios S-A, S-B, S-C, and S-D strictly comply with the two-stage aberration detection criteria implemented in `surveillanceService.evaluateOutbreakCriteria`.

---

## 2. Seed Collection Census

| Collection | Model Class | Document Count | Description / Role |
|---|---|:---:|---|
| `hospitals` | `Hospital` | 2 | Colombo Apex National Hospital (Tertiary + Lab), Kandy Central General Hospital |
| `pharmacies` | `Pharmacy` | 2 | Asiri Central Care Pharmacy (Colombo), Kandy City Dispensary |
| `doctors` | `Doctor` | 4 | Real SLMC formats (SLMC-24819, SLMC-31204, SLMC-42918, SLMC-51029); 4 distinct clinical specialties |
| `pharmacystaffs` | `PharmacyStaff` | 3 | Licensed dispensing pharmacists (SPMC-reg) |
| `patients` | `Patient` | 30 | Distributed across all 25 administrative districts; 1 primary demo patient |
| `consultations` | `Consultation` | 400 | Encounter history over past 70 days using catalog ICD codes; 385 verified, 15 pending review |
| `prescriptions` | `Prescription` | 283 | Prescription lifecycles (dispensed, partially_dispensed, pending, cancelled) |
| `dispensings` | `Dispensing` | 180 | Pharmacist fulfillment receipts with receipt numbers |
| `labtests` | `LabTest` | 12 | 12 total: 3 `report_ready` with real encrypted PDF payloads, 3 `sample_collected`, 1 `processing`, 2 `Approved`, 3 `pending` |
| `verificationtokens` | `VerificationToken` | 1 | Live QR capability token linked to Demo Patient consultation history |
| **TOTAL** | **10 Collections** | **917** | **Zero schema violations, full encryption compliance** |

---

## 3. Outbreak Scenario Verification (Mathematical Proof)

The surveillance engine evaluates outbreaks using a two-stage gate:
- **Gate 1 (Case Floor)**: 7-day window total $N \ge 5$ cases.
- **Gate 2 (Persistence Criterion)**: At least 2 consecutive days with $z \text{-score} > 2.0$ relative to a 56-day baseline ($z = \frac{x_t - \mu}{\sigma + 10^{-6}}$).

The seeded scenarios evaluate against `surveillanceService.evaluateOutbreakCriteria` as follows:

| Scenario Code | Disease & District | 7-Day Window $N$ | Gate 1 ($N \ge 5$) | Consecutive Days $z > 2.0$ | Gate 2 ($\ge 2$ d) | Max Daily $z$ | Engine Outcome | Expected |
|:---:|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **S-A** | **Dengue (Gampaha)** | **12** | **PASS** ($12 \ge 5$) | **4 days** | **PASS** ($4 \ge 2$) | **7.57** | **Critical Alert** | Critical Alert Triggered |
| **S-B** | **Dengue (Kalutara)** | 6 | PASS ($6 \ge 5$) | 1 day | **FAIL** ($1 < 2$) | 12.00 | **NO Alert** | Suppressed (1-day spike) |
| **S-C** | **Dengue (Matara)** | 4 | **FAIL** ($4 < 5$) | 2 days | N/A (Floor blocked) | 3.50 | **NO Alert** | Suppressed (Small cluster) |
| **S-D** | **Influenza (Kandy)** | **8** | **PASS** ($8 \ge 5$) | **4 days** | **PASS** ($4 \ge 2$) | **3.85** | **High Alert** | High Alert Triggered |

*All 4 scenario assertions PASS in automated unit tests (`server/tests/vivaSeedData.test.js`).*

---

## 4. Public Health Observatory Integration

Evaluation of `aggregatePublicCases` over the seeded consultation set:
- **30-Day Verified Cases**: 177 cases across 23 reporting districts.
- **Pending Clinical Review Queue**: 10 encounters in 30-day window (15 overall across 70 days) for testing the Admin Surveillance Review Queue (`/api/admin/surveillance/pending`).
- **Reporting State**: `"ok"` (HTTP 200 returned; no 503 `PUBLIC_HEALTH_UNAVAILABLE`).
- **Top 3 Diseases (National 30D)**:
  1. Dengue: 31 cases
  2. Acute upper respiratory infection, unspecified: 25 cases
  3. Diarrhoeal disease: 24 cases

---

## 5. Viva Demonstration Personas & Credentials

> [!NOTE]
> Passwords for all demonstration accounts are initialized to the secret provided in `SEED_TEST_PASSWORD` (or `TEMP_ACCOUNT_PASSWORD`). Passwords are not stored in plaintext anywhere in source code or documentation. All seeded personas have `twoFactorEnabled: false` so evaluators can log in directly with password.

### Dynamic Gmail-Style Plus Aliasing (`--owner-email=<address>`)
When the `--owner-email=<address>` option is supplied (e.g. `--owner-email=chamod@gmail.com`), every seeded account is assigned an encrypted plus-aliased address matching the role. This allows the evaluator to receive live verification OTPs directly to a real mailbox:

| Role | Synthetic Default (`.invalid`) | Plus Alias (`--owner-email=user@example.com`) | Identifier / SLMC | Key Demonstration Flow |
|---|---|---|---|---|
| **Demo Patient** | `chamod.demo.patient@accounts.invalid` | `user+patient@example.com` | NIC: 200012345678 | Patient Portal: Medical History, Prescriptions, QR Verification token |
| **Doctor (Lead)** | `dr.anura.jayasinghe.1@accounts.invalid` | `user+doctor1@example.com` | SLMC-24819 | Doctor Portal: New Consultation, Symptom Matching, Safety Engine Warning Override |
| **Doctor (Internal)** | `dr.sivakumar.ramasamy.2@accounts.invalid` | `user+doctor2@example.com` | SLMC-31204 | Doctor Portal: Multi-specialty Consultation History |
| **Pharmacist (Lead)** | `kaveen.bandara.1@accounts.invalid` | `user+pharmacist1@example.com` | SPMC 9841 | Pharmacy Portal: Dispense Screen, Prescriber Safety Override Badge, Duplicate Dispense Block |
| **Pharmacy Admin** | `thushara.perera.3@accounts.invalid` | `user+pharmacyadmin@example.com` | PHARM-001 | Pharmacy Management, Dispenser staff audit |
| **Hospital Admin** | `colombo.apex.hospital@accounts.invalid` | `user+hospitaladmin1@example.com` | HOSP-001 | Hospital Management, Doctor roster, Facility capacity |

Without the `--owner-email` flag, accounts default to safe RFC 2606 `.invalid` domains.

### Primary Demonstration Patient (OA-14 Compliant)
- **Name**: Chamod Tharusha
- **Synthetic NIC**: `200012345678` (Use this NIC for all viva walk-throughs and screenshots)
- **Consultation Records**: 3 historical consultations (Cardiology, General Medicine, Respiratory)
- **Prescription States**: 1 `dispensed`, 1 `partially_dispensed`, 1 `pending`, 1 `cancelled` (with `supersededBy`)
- **Lab Test Records**: 1 `report_ready` (Complete Blood Count with decryptable encrypted PDF payload), 1 `sample_collected` (Dengue NS1)
- **Verification Token**: 90-day capability token (`tokenHash = SHA-256(raw_token)`).
- **QR Verification URL**: Generated at runtime and printed to stdout upon execution: `https://medisync.chamodtharusha.com.lk/verify/<RAW_TOKEN>`. In accordance with security protocols, the raw secret token is never committed to repository documentation.

---

## 6. CLI Execution Runbook (PowerShell & Bash)

### Step 1: Pre-Viva Backup (Mandatory OA-03)
Before executing database modifications, capture a backup of `medisync_prod`:
```powershell
mongodump --uri="<MONGODB_URI>" --db="medisync_prod" --out="./backup_pre_viva"
```

### Step 2: Dry-Run Inspection
Verify counts and scenario mathematics without writing a single byte to MongoDB:
```powershell
node scripts/seed-viva-data.js --dry-run --owner-email="your.email@example.com"
```

### Step 3: Apply Seeding to Database
Set the demonstration password and apply the 917 documents to the target database:

**PowerShell (Windows)**:
```powershell
$env:SEED_TEST_PASSWORD="YourSecureDemoPassword123!"
node scripts/seed-viva-data.js --confirm --db=medisync_prod --owner-email="your.email@example.com"
```

**Bash (Linux / macOS)**:
```bash
SEED_TEST_PASSWORD="YourSecureDemoPassword123!" node scripts/seed-viva-data.js --confirm --db=medisync_prod --owner-email="your.email@example.com"
```

### Step 4: Verify Database State
Verify that the documents exist and evaluate correctly in the live database:
```powershell
node scripts/seed-viva-data.js --verify --db=medisync_prod
```

### Step 5: Post-Viva Rollback (Reversible Reset)
To atomically remove all 917 seeded documents and return the database to its pristine state:
```powershell
node scripts/seed-viva-data.js --rollback --db=medisync_prod
```
