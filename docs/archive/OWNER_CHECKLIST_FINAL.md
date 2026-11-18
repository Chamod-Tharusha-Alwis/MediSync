# MediSync Master Owner Operational Checklist (Final Submission Pack)

> **Audience**: MediSync System Owner / Administrator.  
> **Authority**: This document is the single authoritative source of production operations. All earlier operational documents (`docs/new/sub1/OWNER_ACTIONS.md`, `docs/new/sub2/OWNER_ACTIONS_SUB2.md`, `docs/new/sub3/OWNER_ACTIONS_SUB3.md`, and `docs/new/sub4/OWNER_ACTIONS_SUB4.md`) are hereby superseded.

---

## Pre-Flight Safety Policy
- **NEVER** run commands without inspecting dry-run output first.
- **NEVER** run database deletions without creating a timestamped backup with `mongodump`.
- **NEVER** paste secrets, passwords, or production connection strings into git-tracked files or chat logs.

---

## 1. Cloud & Hosting Configuration (Render & Vercel)

- [ ] **1.1 Remove Storage Auto-Provisioning on Render Backend**
  - In Render Dashboard $\rightarrow$ MediSync Web Service (`medisync-wabc`) $\rightarrow$ **Environment**:
  - Delete or unset the variable `MEDISYNC_AUTO_PROVISION_STORAGE`.
  - *Rationale*: Allows file storage guards to fail closed in production rather than silently masking missing persistent storage mounts.
- [ ] **1.2 Remove Test OTP Bypass Variables on Render Backend**
  - In Render Dashboard $\rightarrow$ MediSync Web Service $\rightarrow$ **Environment**:
  - Verify `TEST_OTP_ENABLED` and `TEST_OTP_CODE` are **completely deleted** or unset.
  - *Rationale*: `server/src/security/clinicalEntryPolicy.js` actively halts boot with a critical security error if either variable is detected when `NODE_ENV === 'production'`.
- [ ] **1.3 Verify Production PDF Export Gate**
  - Verify `PDF_EXPORT_ENABLED="true"` in the Render backend environment.
  - *Rationale*: When set to `false` or omitted, PDF download endpoints fail closed with HTTP 503 `SECURITY_HOLD`.
- [ ] **1.4 Configure UptimeRobot Keep-Alive for ML Engine**
  - Open UptimeRobot Dashboard $\rightarrow$ Monitor `https://medisync-ml.onrender.com/health`.
  - Set **Monitoring Interval** to **5 minutes** (down from 10 minutes).
  - *Rationale*: Render Free tier spins down containers after 15 minutes of inactivity. Pinging every 5 minutes prevents container sleep and eliminates the ~50 s cold start timeout.

---

## 2. Database Backup (MongoDB Atlas)

- [ ] **2.1 Whitelist Current IP on MongoDB Atlas**
  - Open MongoDB Atlas $\rightarrow$ Network Access $\rightarrow$ Add IP Address (add current IP with 6-hour expiration).
- [ ] **2.2 Create Timestamped Database Backup**
  - Run the following in your local terminal:
  ```powershell
  mongodump --uri="<YOUR_MEDISYNC_PROD_MONGODB_URI>" --out="./backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
  ```
  - Verify backup directory contains `.bson` files for all collections (`Consultation`, `Prescription`, `Dispensing`, `OutbreakAlert`, etc.).

---

## 3. Seed Dispensing Sample Data (Owner Execution)

> **Purpose**: Seeds realistic synthetic dispensing transactions for the Colombo General Hospital pharmacy so dashboard charts display realistic operational metrics.

- [ ] **3.1 Run Seeder Dry-Run Inspection (Read-Only)**
  ```powershell
  node scripts/seed-dispensing-sample.js --db medisync_prod --dry-run
  ```
  - Inspect output: confirms connected database, counts target prescriptions, and displays dry-run summary without writing.
- [ ] **3.2 Apply Seeder with Explicit Operator Approval**
  ```powershell
  $env:MEDISYNC_SEED_RUN_APPROVAL="SEED RUN APPROVED"
  node scripts/seed-dispensing-sample.js --db medisync_prod --confirm
  ```
  - Confirm success output: displays number of dispensing records created and confirms tagged synthetic batch metadata (`syntheticSeedBatch: 'SEED_2026_11_A'`).

---

## 4. Remove Demo Outbreak Batch (Owner Execution)

> **Purpose**: Safely removes the legacy hardcoded demonstration outbreak batch (`DEMO_OUTBREAK_2026_V1`) without affecting genuine or subsequent clinical surveillance alerts.

- [ ] **4.1 Run Demo Removal Dry-Run (Read-Only)**
  ```powershell
  node scripts/remove_demo_batch.js --db medisync_prod --dry-run
  ```
  - Verify output shows the count of demo records matching `DEMO_OUTBREAK_2026_V1` and confirms zero writes.
- [ ] **4.2 Apply Guarded Demo Batch Removal**
  ```powershell
  $env:APPROVE_DEMO_OUTBREAK_REMOVAL="true"
  node scripts/remove_demo_batch.js --db medisync_prod --confirm-demo-removal DEMO_OUTBREAK_2026_V1
  ```
  - Verify output confirms exact record count removed and audit log event created.

---

## 5. Live Functional & Regulatory Verification

- [ ] **5.1 Doctor Portal & PDF Summary Verification**
  - Log in to `https://medisync.chamodtharusha.com.lk` as Doctor.
  - Open New Consultation $\rightarrow$ select symptoms $\rightarrow$ verify diagnostic coverage badge:
    `"41 reference symptom profiles curated; 71,704 ICD-10 conditions available for manual diagnosis."`
  - Enter diagnosis $\rightarrow$ build prescription $\rightarrow$ save consultation.
  - Click "Download Summary PDF" $\rightarrow$ confirm PDF generates with valid embedded QR code and WinAnsi font transliteration.
- [ ] **5.2 Public QR Verification & Patient History Gate**
  - Scan QR code or navigate to `https://medisync.chamodtharusha.com.lk/verify/<TOKEN>`.
  - Confirm public card loads displaying doctor name, hospital, and timestamp with **zero patient PII**.
  - Enter patient NIC in download prompt $\rightarrow$ confirm cumulative patient history PDF downloads securely.
- [ ] **5.3 Five-Role Portal Smoke Check**
  - [ ] **Patient**: View timeline, view prescription history, change language preference.
  - [ ] **Doctor**: Issue prescription with duration limits, review interaction warnings.
  - [ ] **Pharmacy Staff**: View pending orders, perform brand substitution with justification note, record dispensing.
  - [ ] **Hospital Admin**: View hospital staff roster, review facility activity metrics.
  - [ ] **Super Admin**: View Outbreak Monitor, review system audit logs, toggle user active status.
- [ ] **5.4 Mobile Responsive Viewport Audit**
  - Open Chrome DevTools $\rightarrow$ toggle Device Toolbar:
  - Check **320px** (iPhone SE compact): verify no text clipping, table horizontal scroll, minimum 12px body text.
  - Check **375px** (standard mobile): verify navigation drawer, bottom sheet modals, and card padding.
  - Check **1440px** (desktop): verify grid layout, sidebar navigation, and table readability.

---

## 6. Official Census 2024 Population Data Integration

- [ ] **6.1 Obtain Official DCS Table 2 Census Counts**
  - Visit the Sri Lanka Department of Census and Statistics (`statistics.gov.lk`).
  - Retrieve official 2024 preliminary enumeration population figures for all 25 districts.
- [ ] **6.2 Populate District Population Files**
  - Open `server/src/data/districtPopulation2024.json` and `client/src/data/districtPopulation2024.json`.
  - Update `population` count for each district, set `source` to `"Department of Census and Statistics Sri Lanka, Census of Population and Housing 2024, Table 2"`, set `status` to `"verified"`, and update `retrievedAt`.
  - Commit and deploy: the public health map will automatically calculate real population-normalized incidence per 100k.
