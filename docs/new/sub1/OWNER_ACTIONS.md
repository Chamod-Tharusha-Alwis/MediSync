# Sub-Project 1 — Owner Actions

Only the owner performs these actions. The agent never executes destructive local cleanups, production mutations, or Render environment changes.

---

## 1. Phase 1 — Disk Space Cleanup (~42.20 GB Reclaimable)

### Why Moving Out of OneDrive Is Strongly Recommended First
The repository currently lives inside OneDrive (`C:\Users\chamo\OneDrive\Desktop\Final project\medisync`).
- Every local offline test run (`node scripts/run_offline_tests.js`) spawns an in-memory MongoDB replica set (`MongoMemoryReplSet` in `scratch/seed-memory-*`), which allocates two **100 MB** WiredTiger journal files (`~215.5 MB` per run).
- When the test finishes and calls `fs.rmSync`, OneDrive's cloud sync filter driver (`cldflt.sys`) holds open file locks on the newly created journal files, causing directory deletion to fail with `EBUSY`/`EPERM` and leaving `215.5 MB` behind on every run (`41.18 GB` across 3,136 folders in `scratch/`).
- OneDrive also attempts to hash and sync hundreds of thousands of ephemeral files in `scratch/` and `node_modules/`.

#### Recommended Move Procedure (Run in PowerShell outside VS Code / Antigravity)
```powershell
# 1. Close IDE / terminals holding handles in the repo, then create a non-OneDrive dev folder:
New-Item -ItemType Directory -Force -Path "C:\dev" | Out-Null

# 2. After running the Phase 1 delete commands below (so moving takes seconds instead of hours):
Move-Item -LiteralPath "C:\Users\chamo\OneDrive\Desktop\Final project\medisync" -Destination "C:\dev\medisync"
```

---

### Copy-Paste PowerShell Delete Commands (Approved Untracked Bloat)

Run from the repository root (`C:\Users\chamo\OneDrive\Desktop\Final project\medisync`):

```powershell
Set-Location "C:\Users\chamo\OneDrive\Desktop\Final project\medisync"

# 1. Delete scratch/ (41.18 GB - 469,312 untracked test receipt & WiredTiger journal files)
if (Test-Path -LiteralPath ".\scratch") {
    cmd /c "rmdir /s /q scratch"
}

# 2. Delete duplicate root .venv/ (593.68 MB - unused; all scripts use ml-engine/.venv)
if (Test-Path -LiteralPath ".\.venv") {
    cmd /c "rmdir /s /q .venv"
}

# 3. Delete portable root Python/ copy (136.24 MB - unused)
if (Test-Path -LiteralPath ".\Python") {
    cmd /c "rmdir /s /q Python"
}

# 4. Delete untracked raw external drug CSV (229.10 MB - runtime uses drugs_clean.json)
Remove-Item -LiteralPath ".\ml-engine\data\medicines.csv" -Force -ErrorAction SilentlyContinue

# 5. Delete untracked audit CSV dumps, client scratch, subagent logs, QA evidence, and stray %SystemDrive% folder (~44.1 MB total)
foreach ($dir in @("_audit_report", "client\scratch", ".agents", "medisync-qa-evidence", "%SystemDrive%")) {
    if (Test-Path -LiteralPath ".\$dir") {
        Remove-Item -LiteralPath ".\$dir" -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# 6. Delete stray mangled-filename file in repo root and untracked root JSON/MD scratch files
Get-ChildItem -LiteralPath "." -File | Where-Object {
    $_.Name -like "e candidate source*" -or
    $_.Name -in @(
        "AGENT_B_BACKEND_SECURITY_COMPLETION.md",
        "medisync_final_browser_test_results.json",
        "medisync_browser_corrected_execution_results.json",
        "agent_config.json"
    )
} | Remove-Item -Force

# 7. Delete untracked zip archive and untracked files inside docs/temp/ (~55.5 MB)
Remove-Item -LiteralPath ".\docs\new.zip" -Force -ErrorAction SilentlyContinue
git clean -fdX docs/temp/

# 8. (Optional) Preview and clean ~257 untracked one-off tmp/check scripts in scripts/ and server/scripts/
git clean -nd scripts/ server/scripts/
# If the list looks good, run:
# git clean -fd scripts/ server/scripts/

# 9. Verify new workspace size (target: < 2 GB excluding node_modules; expected: ~1.02 GB)
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\size_report.ps1 -FastSummary
```

> **Note on `ml-engine/.venv` (`513.88 MB`)**: `scripts/run_offline_tests.js` invokes `ml-engine/.venv/Scripts/python.exe` to run the offline ML test suites (`ml-scoring` and `ml-flask`). Keeping `ml-engine/.venv` leaves the workspace at **~1.02 GB** (already well below the 2 GB target) while keeping offline tests ready to run immediately.
>
> **Note on Git History (`101.42 MB` in `.git/`)**: `git count-objects -vH` shows `85.94 MiB` packed across 3 packs (dominated by the required runtime `ml-engine/medisync.db` SQLite database and deduplicated `interactions_clean.json` / `icd10_clean.json` reference catalogs). **No git history rewrite or force-push is recommended.**

---

## 2. Phase 4 — Read-Only Demo Batch & Active Alert Count Check on `medisync_prod`

Per Owner Answer Q5, before any demo batch removal is considered, run the read-only dry-run of `scripts/remove_demo_batch.js` and paste the counts:
```powershell
node scripts/remove_demo_batch.js --dry-run
```

To verify the active alert counts in production without modifying any documents or printing PII, run:
```powershell
# Read-only count of active alerts by batch and status
node -e "
const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
(async () => {
  const conn = await mongoose.connect(process.env.MONGODB_URI);
  const col = conn.connection.collection('outbreakalerts');
  const activeCount = await col.countDocuments({ status: 'Active' });
  const byBatch = await col.aggregate([
    { \$group: { _id: { batch: '\$syntheticSeedBatch', status: '\$status' }, count: { \$sum: 1 } } }
  ]).toArray();
  console.log('Active alerts count:', activeCount);
  console.log('Alert counts by batch and status:', JSON.stringify(byBatch, null, 2));
  await mongoose.disconnect();
})();
"
```

---

## 3. Phase 3 — 30-Day Dispensing Sample Seeder (`SEED_2026_11_B`)

`scripts/seed-dispensing-sample.js` seeds 60 additive, idempotent multi-medication dispensing receipts spanning the last 30 days under namespace `SEED_2026_11_B`. It never deletes or alters `SEED_2026_11_A` or genuine clinical records.

### Step 1: Run Dry-Run First (Zero Writes)
```powershell
node scripts/seed-dispensing-sample.js --db medisync_prod --dry-run
```

### Step 2: Apply Only After Reviewing Dry-Run Output
```powershell
$env:MEDISYNC_SEED_RUN_APPROVAL = "SEED RUN APPROVED"
node scripts/seed-dispensing-sample.js --db medisync_prod --confirm
Remove-Item Env:\MEDISYNC_SEED_RUN_APPROVAL -ErrorAction SilentlyContinue
```

---

## 4. Phase 5 — Census 2024 Population Table Owner Verification (Task 5.1 BLOCKED)

Per the strict safety invariant (**NEVER type numbers from memory**), `server/src/data/districtPopulation2024.json` and `client/src/data/districtPopulation2024.json` were created with neutral `null` values for all 25 districts, and all UI/API consumers display `"population data pending"`.

To unblock Task 5.1 and activate live incidence per 100,000:
1. Download the official **Table 2: Population by District (Census of Population and Housing 2024)** from the Department of Census and Statistics portal: [statistics.gov.lk](https://www.statistics.gov.lk).
2. Open `server/src/data/districtPopulation2024.json` (and `client/src/data/districtPopulation2024.json`) and replace the `null` values with the exact official counts from DCS Table 2.
3. Update `"status": "verified"` in both files and re-run `node scripts/run_offline_tests.js`.

---

## 5. Render Configuration (Environment Variables)

Add or verify these environment variables on the Render Backend Web Service (`https://dashboard.render.com`):

| Variable | Recommended Value | Purpose / Notes |
|---|---|---|
| `PDF_EXPORT_ENABLED` | `false` (default) -> `true` when ready | Gates consultation & lab report PDF downloads and consultation summary email attachments. When `false` or omitted, endpoints return HTTP 503 `SECURITY_HOLD`. Set to `true` only when the owner wishes to activate production PDF exports. |
| `MEDISYNC_PROTOTYPE_MODE` | `true` | Enables prototype release operational mode (`server/src/app.js:60-70`). |
| `MEDISYNC_ALLOW_OPERATOR_KEYS` | `true` | Bypasses external HashiCorp Vault for prototype release, loading validated AES-256-GCM encryption keys directly from environment. |
| `BREVO_DAILY_FREE_LIMIT` | `300` | Safety ceiling for transactional emails to prevent account exhaustion. |
| `ML_ENGINE_URL` | `https://medisync-ml.onrender.com` | Internal or public URL of the Python Flask ML service. |

---

## 6. Phase 7 — Ordered Live Production Verification Checklist

Follow this checklist strictly in order after merging `feat/phase2-polish-and-cleanup` into `main` and deploying to Render.

### Safety Rules During Live Testing
- **Hard OTP Cap**: Maximum **50 OTPs per day** across all live tests combined.
- **Fail-Stop Rule**: If ANY login, OTP verification, or endpoint fails: **STOP IMMEDIATELY**. Do NOT retry in a loop. Open Render logs (`https://dashboard.render.com`) to inspect the error stack.

### Step-by-Step Order of Operations

#### Step 6.1: Public Read-Only Verification (Zero Authentication, Zero Side-Effects)
Open an Incognito / Private browser window and visit:
1. `GET https://medisync.chamodtharusha.com.lk/`
   - [ ] Page renders without errors. Header, footer, navigation work.
2. `GET https://medisync.chamodtharusha.com.lk/public-health`
   - [ ] Epidemiological surveillance dashboard loads.
   - [ ] Scope selector toggles between: **District (25)**, **Province (9)**, and **Island-wide (1)**.
   - [ ] Map tooltips and cards render the mandatory badge: `clinicalValidation: not_established`.
   - [ ] Incidence metric displays `"population data pending"` (due to neutral 2024 census nulls).
   - [ ] In Province view, any province with $< 5$ cases shows `<5 (suppressed)`.
3. `GET https://medisync.chamodtharusha.com.lk/doctors`
   - [ ] Doctor directory loads with non-diagnostic advisory notice.
4. `GET https://medisync.chamodtharusha.com.lk/hospitals`
   - [ ] Hospital directory loads with institutional directory notice.
5. `GET https://medisync.chamodtharusha.com.lk/pharmacies`
   - [ ] Pharmacy directory loads with licensing notice.

#### Step 6.2: Single-Login Authenticated Role Checks (1 Login / Role Only)
1. **Patient Role**:
   - [ ] Login as a test patient account.
   - [ ] Dashboard `/patient/dashboard`: **Active Prescriptions** are grouped by consultation (`CON-...`).
   - [ ] Prescriptions `/patient/prescriptions`: verify status badges and grouped medicines.
   - [ ] Medical History `/patient/history`: consultation history renders.
2. **Doctor Role**:
   - [ ] Login as a test doctor account.
   - [ ] Consultation Form `/doctor/consultations/new`:
     - [ ] Enter symptoms; verify TF-IDF analysis button is debounced (1.5s delay to prevent request spam).
     - [ ] Verify `clinicalValidation: not_established` badge is rendered next to ML recommendations.
     - [ ] Search and select ICD-10 diagnostic code from dropdown; verify zero crashes.
3. **Pharmacy Role**:
   - [ ] Login as a pharmacy staff account.
   - [ ] Dashboard `/pharmacy/dashboard`:
     - [ ] Active Prescriptions are grouped by consultation ID.
     - [ ] Dispensation History is grouped by unique receipt ID.
     - [ ] Verify sidebar does **NOT** contain "Predictive Restock Warnings" (removed per Owner Q4).
     - [ ] Dispensing Volume Analytics chart renders (if `SEED_2026_11_B` was seeded per §3).
4. **Admin Role**:
   - [ ] Login as an administrator account.
   - [ ] User Directory `/admin/users`:
     - [ ] Filter by role (`doctor`, `patient`, `pharmacy_staff`, `hospital`).
     - [ ] Search by name or email. Verify user identifiers are partially masked.
     - [ ] Open a user detail drawer and click the Eye icon to reveal identifier. Check that `ADMIN_REVEAL_PII` audit log is created.
   - [ ] Outbreak Monitor `/admin/outbreak-monitor`:
     - [ ] Verify 3 levels (District, Province, Island-wide).
     - [ ] Verify active alerts match strict $z > 2.0$ detector criteria.

#### Step 6.3: Consultation Summary Email Test (1 Transactional Email)
1. In the Patient portal (`/patient/history`), click the **"Resend Email"** button on a completed consultation.
2. Verify rate-limiting: clicking again within 60 seconds displays a cooldown notice.
3. Check recipient inbox:
   - [ ] Email arrives with consultation diagnosis and prescription list.
   - [ ] Subject and body contain **zero National Identity Card (NIC) numbers** or sensitive PII.
   - [ ] If `PDF_EXPORT_ENABLED=false` on Render: email contains the prescription text list only (no PDF attachment).
   - [ ] If `PDF_EXPORT_ENABLED=true` on Render: email contains attached PDF named `consultation_CON-XXXXX.pdf`.

#### Step 6.4: PDF Download Test (After Setting `PDF_EXPORT_ENABLED=true` on Render)
1. Set `PDF_EXPORT_ENABLED=true` on Render backend service and wait for deployment to complete.
2. As Patient, click **"Download PDF"** on a consultation.
   - [ ] PDF downloads without HTTP 503 error.
   - [ ] Filename is sanitized (e.g., `consultation_CON-12345.pdf`), strictly omitting patient NIC.
   - [ ] Header, medications table, and trilingual labels render clearly without WinAnsi font crashes.
3. As Patient, click **"Download Lab PDF"** on a lab report.
   - [ ] Filename is sanitized (e.g., `lab_report_LAB-12345.pdf`).
   - [ ] Results and reference ranges render clearly.
