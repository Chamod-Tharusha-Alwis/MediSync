# MediSync Viva Voce Demonstration Seed Report

**Batch Tag**: `viva-2026-11`  
**Execution Date**: 2026-11-10  
**Status**: Verified & Ready for Production Confirmation  
**Test Suite Verification**: 10/10 PASS (`server/tests/vivaSeedData.test.js`), 3,605/3,605 overall suite PASS (`scripts/run_offline_tests.js`)  

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
| `doctors` | `Doctor` | 4 | Real SLMC formats (SLMC 48123, 51204, 39811, 44092); 4 distinct clinical specialties |
| `pharmacystaffs` | `PharmacyStaff` | 3 | Licensed dispensing pharmacists (SPMC-reg) |
| `patients` | `Patient` | 30 | Distributed across all 25 administrative districts; 1 primary demo patient |
| `consultations` | `Consultation` | 400 | Encounter history over past 70 days using catalog ICD codes; 385 verified, 15 pending review |
| `prescriptions` | `Prescription` | 283 | Prescription lifecycles (dispensed, partially_dispensed, pending, cancelled) |
| `dispensings` | `Dispensing` | 180 | Pharmacist fulfillment receipts with receipt numbers |
| `labtests` | `LabTest` | 12 | 8 `report_ready` with sample encrypted PDF hashes, 4 `sample_collected` |
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
> Passwords for all demonstration accounts are initialized to the secret provided in `SEED_TEST_PASSWORD` (or `TEMP_ACCOUNT_PASSWORD`). Passwords are not stored in plaintext anywhere in source code or documentation.

| Role | Name | Username / Email | Identifier / SLMC | Key Demonstration Flow |
|---|---|---|---|---|
| **Doctor** | Dr. Anura Jayasinghe | `dr.anura.jayasinghe.1@accounts.invalid` | SLMC 48123 | Doctor Portal: New Consultation, Symptom Matching, Safety Engine Warning Override |
| **Pharmacist** | Kaveen Bandara | `kaveen.bandara.1@accounts.invalid` | SPMC 9841 | Pharmacy Portal: Dispense Screen, Prescriber Safety Override Badge, Duplicate Dispense Block |
| **Lab Tech** | Samantha Wickramasinghe | `samantha.lab@accounts.invalid` | LAB-9012 | Lab Portal: Specimen collection, Report upload & Encrypted verification |
| **Hospital Admin** | Apex Hospital Admin | `colombo.apex.hospital@accounts.invalid` | HOSP-001 | Hospital Management, Doctor roster, Facility capacity |
| **Pharmacy Admin** | Asiri Care Admin | `thushara.perera.3@accounts.invalid` | PHARM-001 | Pharmacy Management, Dispenser staff audit |
| **Demo Patient** | Chamod Tharusha | `chamod.demo.patient@accounts.invalid` | **200012345678** | Patient Portal: Medical History, Prescriptions, QR Verification token |

### Primary Demonstration Patient (OA-14 Compliant)
- **Name**: Chamod Tharusha
- **Synthetic NIC**: `200012345678` (Use this NIC for all viva walk-throughs and screenshots)
- **Consultation Records**: 3 historical consultations (Cardiology, General Medicine, Respiratory)
- **Prescription States**: 1 `dispensed`, 1 `partially_dispensed`, 1 `pending`, 1 `cancelled` (with `supersededBy`)
- **Lab Test Records**: 1 `report_ready` (Lipid Profile with encrypted PDF metadata), 1 `sample_collected` (Complete Blood Count)
- **Verification Token**: Active 24-hour capability token with SHA-256 hash `8390ba7221eb2f542e9013fcb866b7c7e3a1930809177f84aed264cc887ed1c4`
- **QR Verification URL**: `https://medisync.chamodtharusha.com.lk/verify/8390ba7221eb2f542e9013fcb866b7c7e3a1930809177f84aed264cc887ed1c4`

---

## 6. CLI Execution Runbook

### Step 1: Pre-Viva Backup (Mandatory OA-03)
Before executing database modifications, capture a backup of `medisync_prod`:
```bash
mongodump --uri="<MONGODB_URI>" --db="medisync_prod" --out="./backup_pre_viva"
```

### Step 2: Dry-Run Inspection
Verify counts and scenario mathematics without writing a single byte to MongoDB:
```bash
node scripts/seed-viva-data.js --dry-run
```

### Step 3: Apply Seeding to Database
Set the demonstration password and apply the 917 documents to the target database:
```bash
SEED_TEST_PASSWORD="YourSecureDemoPassword123!" node scripts/seed-viva-data.js --confirm --db=medisync_prod
```

### Step 4: Verify Database State
Verify that the documents exist and evaluate correctly in the live database:
```bash
node scripts/seed-viva-data.js --verify --db=medisync_prod
```

### Step 5: Post-Viva Rollback (Reversible Reset)
To atomically remove all 917 seeded documents and return the database to its pristine state:
```bash
node scripts/seed-viva-data.js --rollback --db=medisync_prod
```
