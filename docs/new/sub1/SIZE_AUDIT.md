# MediSync Size Audit & Cleanup Report (Phase 1)

- **Branch**: `feat/phase2-polish-and-cleanup`
- **Audit Timestamp**: `2026-11-07T19:27:28+05:30`
- **Measurement Script**: `scripts/size_report.ps1` (read-only PowerShell walker)
- **Total Workspace Size**: **43.81 GB** (`47,040,624,304` bytes)
- **All `node_modules` Size**: **810.61 MB** (`849,981,534` bytes: `client/node_modules` 510.10 MB, `server/node_modules` 209.13 MB, root `node_modules` 91.38 MB)
- **Workspace Excl. `node_modules` (Before Cleanup)**: **43.02 GB** (`46,190,642,770` bytes)
- **Projected Workspace Excl. `node_modules` (After Owner Cleanup)**: **~1.02 GB** keeping `ml-engine/.venv` (or **~510 MB** if `ml-engine/.venv` is also regenerated on demand) — **meets the `< 2 GB` target with > 97% size reduction**.

---

## 1. Top-Level Directory & File Audit

| # | Item | Type | Size | Files | Subfolders | Last Modified | Git Tracked (`git ls-files`) | Description (from names/extensions/samples) | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `scratch/` | Directory | **41.18 GB** | 469,312 | 3,136 | 2026-11-07 | `0` (Untracked) | Ephemeral offline test receipts, `mongodb-memory-server` WiredTiger journal folders (`seed-memory-*`), and historical Codex candidate clones (`CODEX_*`). | `GITIGNORE` + `OWNER-DELETE` |
| 2 | `ml-engine/` | Directory | **865.19 MB** | 18,880 | 4 | 2026-11-07 | `31` files tracked (`medisync.db`, 5 CSVs, 3 clean JSONs, Python code) | Python Flask ML service (`ml-engine/.venv` 513.88 MB untracked; `ml-engine/data/medicines.csv` 229.10 MB untracked; `ml-engine/medisync.db` 75.63 MB tracked runtime SQLite DB). | `KEEP` (code & `medisync.db`) / `GITIGNORE` (`.venv`, `medicines.csv`) |
| 3 | `.venv/` | Directory | **593.68 MB** | 23,447 | 4 | 2026-08-05 | `0` (Untracked) | Duplicate root Python virtual environment (`Lib/site-packages` 586.88 MB). Unreferenced by any test runner or script (all scripts use `ml-engine/.venv`). | `GITIGNORE` + `OWNER-DELETE` |
| 4 | `client/` | Directory | **543.79 MB** | 68,380 | 8 | 2026-11-07 | `229` files tracked | React frontend (`client/node_modules` 510.10 MB; `client/scratch` 19.25 MB untracked; `client/build` 11.53 MB untracked; `client/src` 1.86 MB tracked). | `KEEP` (`src`, `public`, `tests`) / `GITIGNORE` (`node_modules`, `build`, `scratch`) / `OWNER-DELETE` (`client/scratch`) |
| 5 | `server/` | Directory | **258.60 MB** | 15,916 | 6 | 2026-11-07 | `522` files tracked | Express API backend (`server/node_modules` 209.13 MB; `server/reference-data` 45.53 MB tracked runtime JSONs; `server/tests` 1.52 MB; `server/src` 1.20 MB). | `KEEP` (`src`, `tests`, `scripts`, `reference-data`) / `GITIGNORE` (`node_modules`, `uploads`) |
| 6 | `Python/` | Directory | **136.24 MB** | 2,330 | 3 | 2026-10-20 | `0` (Untracked) | Portable Windows `pythoncore-3.15-64` distribution copy (`129.47 MB` + `bin/` `6.77 MB`). Unreferenced by `run_offline_tests.js` or CI. | `GITIGNORE` + `OWNER-DELETE` |
| 7 | `.git/` | Directory | **101.42 MB** | 3,623 | 6 | 2026-11-07 | N/A (Git repo metadata) | Git object database (`85.94 MiB` packed across 3 packs + `15.12 MiB` loose objects). | `KEEP` (can run `git gc --prune=now` optionally) |
| 8 | `node_modules/` | Directory | **91.38 MB** | 3,940 | 72 | 2026-10-28 | `0` (Untracked) | Root npm dependencies (Playwright / test helpers). | `GITIGNORE` + `REGENERABLE` |
| 9 | `docs/` | Directory | **74.33 MB** | 2,355 | 9 | 2026-11-07 | `228` files tracked | Project documentation, release pins (`docs/release/PROTECTED_HASHES.json`), plus `docs/temp/` (`60.53 MB` across 2,193 files, mostly untracked QA dumps) and `docs/new.zip` (`115 KB` untracked). | `KEEP` (`docs/release`, `docs/new`, `docs/security`) / `GITIGNORE` + `OWNER-DELETE` (`docs/temp` untracked files, `docs/new.zip`) |
| 10 | `_audit_report/` | Directory | **19.41 MB** | 6 | 0 | 2026-10-20 | `0` (Untracked) | Historical file-listing CSV dumps (`FILES_compact.csv` 6.03 MB, `FILES_compact2.csv` 4.67 MB, `FILES.csv` 4.35 MB, `FILES_compact3.csv` 4.35 MB). | `GITIGNORE` + `OWNER-DELETE` |
| 11 | `.agents/` | Directory | **4.47 MB** | 991 | 1 | 2026-11-07 | `0` (Untracked) | Subagent teamwork logs and scratch state (`.agents/teamwork/`). | `GITIGNORE` + `OWNER-DELETE` |
| 12 | `scripts/` | Directory | **2.67 MB** | 248 | 1 | 2026-11-07 | `46` files tracked (`202` untracked one-off `tmp_*`/`check_*` scripts) | Offline test runner (`run_offline_tests.js`), seeders, and verification scripts, plus ~200 untracked one-off diagnostic scripts. | `KEEP` (tracked scripts) / `OWNER-DELETE` (untracked `scripts/tmp_*`) |
| 13 | `%SystemDrive%` | Directory | **966.00 KB** | 4 | 1 | 2026-10-23 | `0` (Untracked) | Stray literal `%SystemDrive%\ProgramData\Microsoft\Windows\Caches\...` folder created when a process ran on Windows without `%SystemDrive%` expanded in its clean environment. | `GITIGNORE` + `OWNER-DELETE` |
| 14 | `research/` | Directory | **385.18 KB** | 12 | 1 | 2026-10-13 | `0` (Untracked) | Research notes and 4 small figures (`research/figures/`, 329 KB). | `KEEP` (tiny, 385 KB) |
| 15 | `medisync-qa-evidence/` | Directory | **28.78 KB** | 2 | 1 | 2026-10-19 | `0` (Untracked) | Old QA release review JSON receipts (`final-release-review/`). Per Owner Q2 decision: ignore entirely in `.gitignore`. | `GITIGNORE` + `OWNER-DELETE` |
| 16 | `"e candidate sourcegit commit -m chore complete release candidate source"` | File | **16.08 KB** | 1 | 0 | 2026-10-26 | `0` (Untracked) | Stray root file created by a mangled git command in an earlier session (contains Private Use Area Unicode characters `\uF022` and `\uF03A` in filename). | `OWNER-DELETE` |

---

## 2. What `scratch/` Is (Evidence-Backed Root-Cause Analysis)

`scratch/` consumes **41.18 GB** (**94.0%** of the entire 43.81 GB workspace) across **469,312 files** and **3,136 subfolders**, and is **100% untracked by git** (`git ls-files scratch/` returns `0` files).

### Why `scratch/` Exists and Why It Grew to 41.18 GB
1. **Offline Regression Receipts (`scripts/run_offline_tests.js:50-51`)**:
   - Every run of `node scripts/run_offline_tests.js` executes `fs.mkdtempSync(path.join(root, 'scratch/clinical-offline-'))` and retains `before.json`, `after.json`, `summary.json`, and console/JSON test outputs (`423` folders).
2. **In-Memory MongoDB Replica Set Proofs (`scripts/realLocalStack.test.cjs:12` & `scripts/seedPlatformMemoryProof.cjs:40`)**:
   - Every local run of `run_offline_tests.js` invokes `realLocalStack.test.cjs`, which creates `scratch/seed-memory-XXXXXX/owned-mongo` and starts a `MongoMemoryReplSet` instance (`83` folders at **~215.48 MB each** = **~17.9 GB**, plus additional nested runs totaling **~39.6 GB**).
   - Each WiredTiger storage engine instance pre-allocates two **100.00 MB** journal files (`WiredTigerLog.0000000001` = 100 MB and `WiredTigerPreplog.0000000001` = 100 MB).
   - **Why cleanup failed (`seedPlatformMemoryProof.cjs:145`)**: Although `seedPlatformMemoryProof.cjs` calls `fs.rmSync(dbPath, { recursive: true, force: true })` in its `finally` block, the repository is inside **OneDrive** (`C:\Users\chamo\OneDrive\Desktop\Final project\medisync`). OneDrive's cloud filter driver (`cldflt.sys`) immediately opens file handles on newly written WiredTiger journal files to index/sync them, causing `fs.rmSync` on Windows to fail with `EBUSY`/`EPERM` (silently swallowed by `catch (_) {}`) and leaving 215.5 MB behind on every test run.
3. **Reference Packaging Negative Tests (`server/tests/websiteReferencePackaging.test.js:7,18`)**:
   - Creates `scratch/reference-negative-*` (`2,219` folders) and `scratch/reference-layout-*` (`317` folders) without removing them after test completion.
4. **Historical Codex Candidate Worktrees (`scratch/CODEX_*`)**:
   - `177` folders created during earlier agent verification runs, including full workspace copies with their own `node_modules` (`scratch/CODEX_password_policy_integration_1793887632124` at **1.01 GB** / 84,282 files, and `scratch/CODEX_NOTIFICATION_POPOVER_CANDIDATE_L05ibr` at **512.10 MB** / 67,759 files).

### `scratch/` Subfolder Prefix Breakdown (3,136 Items)

| Prefix Pattern | Count | Origin |
|---|---|---|
| `reference-negative-*` | 2,219 | `server/tests/websiteReferencePackaging.test.js:7` |
| `clinical-offline-*` | 423 | `scripts/run_offline_tests.js:51` |
| `reference-layout-*` | 317 | `server/tests/websiteReferencePackaging.test.js:18` |
| `CODEX_*` | 177 | Historical agent candidate sandboxes & receipts |
| `seed-memory-*` | 83 | `scripts/realLocalStack.test.cjs:12` (~215.5 MB each) |
| Other (`r5-vercel-*`, `codex-takeover-*`, `master-readiness-*`, etc.) | 27 | Historical one-off verification runs |

---

## 3. Second-Level Folder Sizes (Non-Scratch & Top Overall)

| Path | Size | Files | Last Modified | Git Tracked | Verdict |
|---|---|---|---|---|---|
| `scratch/CODEX_password_policy_integration_1793887632124` | 1.01 GB | 84,282 | 2026-11-07 | No | `OWNER-DELETE` |
| `.venv/Lib` | 586.88 MB | 23,412 | 2026-08-05 | No | `OWNER-DELETE` (duplicate root venv) |
| `ml-engine/.venv` | 513.88 MB | 18,828 | 2026-10-13 | No | `GITIGNORE` + `KEEP` / `REGENERABLE` (used by `run_offline_tests.js:75`) |
| `scratch/CODEX_NOTIFICATION_POPOVER_CANDIDATE_L05ibr` | 512.10 MB | 67,759 | 2026-11-07 | No | `OWNER-DELETE` |
| `client/node_modules` | 510.10 MB | 67,534 | 2026-11-07 | No | `GITIGNORE` + `REGENERABLE` |
| `ml-engine/data` | 275.33 MB | 9 | 2026-10-28 | Partial (8 of 9) | `KEEP` tracked datasets; `OWNER-DELETE` untracked `medicines.csv` (229.10 MB) |
| `scratch/seed-memory-*` (×83 folders) | 215.48 MB each | 103 each | 2026-11-07 | No | `OWNER-DELETE` |
| `server/node_modules` | 209.13 MB | 15,672 | 2026-11-07 | No | `GITIGNORE` + `REGENERABLE` |
| `Python/pythoncore-3.15-64` | 129.47 MB | 2,303 | 2026-10-20 | No | `OWNER-DELETE` |
| `.git/objects` | 101.16 MB | 3,550 | 2026-11-07 | N/A | `KEEP` |
| `docs/temp` | 60.53 MB | 2,193 | 2026-11-06 | Partial (125 tracked, 2,068 untracked) | `GITIGNORE` + `OWNER-DELETE` untracked dumps (`docs/temp/_audit_report`, `docs/temp/CODEX_GATE3_*`) |
| `server/reference-data` | 45.53 MB | 5 | 2026-10-28 | Yes (5 files) | `KEEP` (required by `websiteReferencePackaging.test.js` & server runtime) |
| `client/scratch` | 19.25 MB | 474 | 2026-10-24 | No | `GITIGNORE` + `OWNER-DELETE` |
| `client/build` | 11.53 MB | 122 | 2026-11-07 | No | `GITIGNORE` + `REGENERABLE` |
| `Python/bin` | 6.77 MB | 26 | 2026-10-20 | No | `OWNER-DELETE` |
| `.venv/share` | 4.62 MB | 8 | 2026-07-03 | No | `OWNER-DELETE` |
| `.agents/teamwork` | 4.47 MB | 991 | 2026-11-07 | No | `GITIGNORE` + `OWNER-DELETE` |
| `docs/brand` | 2.70 MB | 22 | 2026-10-25 | Yes | `KEEP` |
| `.venv/Scripts` | 2.18 MB | 25 | 2026-07-03 | No | `OWNER-DELETE` |
| `docs/screenshots` | 1.99 MB | 8 | 2026-11-03 | Yes | `KEEP` |
| `client/src` | 1.86 MB | 214 | 2026-11-07 | Yes | `KEEP` |
| `server/tests` | 1.52 MB | 206 | 2026-11-07 | Yes | `KEEP` |
| `server/src` | 1.20 MB | 198 | 2026-11-07 | Yes | `KEEP` |
| `%SystemDrive%/ProgramData` | 966.00 KB | 4 | 2026-10-23 | No | `GITIGNORE` + `OWNER-DELETE` |

---

## 4. Top 30 Largest Files

### 4A. Top 30 Largest Files Across Entire Workspace
1. `ml-engine/data/medicines.csv` — **229.10 MB** (`.csv`, Untracked) → `GITIGNORE` + `OWNER-DELETE`
2–30. `scratch/seed-memory-*/owned-mongo/journal/WiredTigerLog.0000000001` and `WiredTigerPreplog.0000000001` (166 files at **100.00 MB** each inside `scratch/seed-memory-*`, Untracked) → `GITIGNORE` + `OWNER-DELETE`

### 4B. Top 30 Largest Files (Excl. `scratch/`, `node_modules/`, `.venv/`, `Python/`, `.git/`)

| # | Relative Path | Size | Tracked | Verdict & Reason |
|---|---|---|---|---|
| 1 | `ml-engine/data/medicines.csv` | 229.10 MB | No | `GITIGNORE` + `OWNER-DELETE` (raw external drug CSV; runtime uses `drugs_clean.json`) |
| 2 | `ml-engine/medisync.db` | 75.63 MB | Yes | `KEEP` (runtime SQLite DB with 71,704 ICD-10 concepts) |
| 3 | `server/reference-data/interactions_clean.json` | 37.49 MB | Yes | `KEEP` (runtime drug-interaction catalog; verified by `websiteReferencePackaging.test.js`) |
| 4 | `ml-engine/data/interactions_clean.json` | 37.49 MB | Yes | `KEEP` (ML drug-interaction catalog; shares git blob `e667ab29eb` with server copy) |
| 5 | `server/reference-data/icd10_clean.json` | 7.08 MB | Yes | `KEEP` (runtime ICD-10 catalog; shares git blob `51f58718ce`) |
| 6 | `ml-engine/data/icd10_clean.json` | 7.08 MB | Yes | `KEEP` (ML ICD-10 catalog; shares git blob `51f58718ce`) |
| 7 | `_audit_report/FILES_compact.csv` | 6.03 MB | No | `GITIGNORE` + `OWNER-DELETE` |
| 8 | `docs/disease_rankings_full.csv` | 5.06 MB | Yes | `KEEP` (used by `ml-engine/scripts/seed_outbreak_data.py`) |
| 9 | `_audit_report/FILES_compact2.csv` | 4.67 MB | No | `GITIGNORE` + `OWNER-DELETE` |
| 10 | `_audit_report/FILES.csv` | 4.35 MB | No | `GITIGNORE` + `OWNER-DELETE` |
| 11 | `docs/temp/_audit_report/FILES.csv` | 4.35 MB | No | `GITIGNORE` + `OWNER-DELETE` |
| 12 | `_audit_report/FILES_compact3.csv` | 4.35 MB | No | `GITIGNORE` + `OWNER-DELETE` |
| 13 | `client/build/static/js/main.66090ae7.js.map` | 2.66 MB | No | `GITIGNORE` + `REGENERABLE` |
| 14 | `client/build/static/js/663.9e92b3d2.chunk.js.map` | 2.41 MB | No | `GITIGNORE` + `REGENERABLE` |
| 15 | `docs/brand/brand-book.pdf` | 2.15 MB | Yes | `KEEP` |
| 16 | `docs/temp/AGENT_B_GATEKEEPER_FROZEN_EVIDENCE_20261020.json` | 986.25 KB | No | `GITIGNORE` + `OWNER-DELETE` |
| 17 | `server/reference-data/drugs_clean.json` | 975.62 KB | Yes | `KEEP` (runtime drug catalog) |
| 18 | `ml-engine/data/drugs_clean.json` | 975.62 KB | Yes | `KEEP` (ML drug catalog) |
| 19 | `docs/temp/AGENT_B_FINAL_MASTER_EVIDENCE_20261020.json` | 964.40 KB | No | `GITIGNORE` + `OWNER-DELETE` |
| 20 | `docs/temp/AGENT_B_GATEKEEPER_EVIDENCE_20261020.json` | 875.12 KB | No | `GITIGNORE` + `OWNER-DELETE` |
| 21 | `docs/temp/AGENT_B_FINAL_FROZEN_EVIDENCE_20261020.json` | 842.19 KB | No | `GITIGNORE` + `OWNER-DELETE` |
| 22 | `docs/temp/AGENT_B_FINAL_SECURITY_EVIDENCE_20261020.json` | 831.05 KB | No | `GITIGNORE` + `OWNER-DELETE` |
| 23 | `docs/temp/AGENT_B_LANGUAGE_FROZEN_EVIDENCE_20261020.json` | 814.88 KB | No | `GITIGNORE` + `OWNER-DELETE` |
| 24 | `docs/temp/AGENT_B_MASTER_READINESS_EVIDENCE_20261020.json` | 802.31 KB | No | `GITIGNORE` + `OWNER-DELETE` |
| 25 | `client/build/static/js/main.66090ae7.js` | 785.44 KB | No | `GITIGNORE` + `REGENERABLE` |
| 26 | `client/package-lock.json` | 686.41 KB | Yes | `KEEP` |
| 27 | `%SystemDrive%/ProgramData/Microsoft/Windows/Caches/{DDF571F2-BE98-426D-8288-1A9A39C3FDA2}.2.ver0x0000000000000001.db` | 640.00 KB | No | `GITIGNORE` + `OWNER-DELETE` |
| 28 | `ml-engine/data/dataset.csv` | 617.38 KB | Yes | `KEEP` (runtime symptom-disease matrix) |
| 29 | `docs/temp/AGENT_B_PROFILE_LANGUAGE_EVIDENCE_20261020.json` | 614.20 KB | No | `GITIGNORE` + `OWNER-DELETE` |
| 30 | `docs/temp/CODEX_GATE3_APPROVAL2_1793080690862/proposed/clinical-offline-mA2jjn/backend-results.json` | 611.85 KB | No | `GITIGNORE` + `OWNER-DELETE` |

---

## 5. Git Object History Audit (Task 1.2 — Report Only)

### `git count-objects -vH` Output
```text
count: 3532
size: 15.12 MiB
in-pack: 7833
packs: 3
size-pack: 85.94 MiB
prune-packable: 0
garbage: 3
size-garbage: 41.64 KiB
```

### Largest Tracked Blobs in Repository History (`HEAD`)
| SHA-1 (Prefix) | Size (MB) | Size (Bytes) | Path(s) | Notes |
|---|---|---|---|---|
| `0ec88d5a28` | **75.63 MB** | `79,306,752` | `ml-engine/medisync.db` | Runtime SQLite DB (71,704 ICD-10 concepts). Required in CI & production container. |
| `e667ab29eb` | **37.49 MB** | `39,310,355` | `server/reference-data/interactions_clean.json`, `ml-engine/data/interactions_clean.json` | Stored once in `.git/objects` (identical SHA-1 across both paths). |
| `51f58718ce` | **7.08 MB** | `7,428,164` | `server/reference-data/icd10_clean.json`, `ml-engine/data/icd10_clean.json` | Stored once in `.git/objects` (identical SHA-1 across both paths). |
| `13ad4c3b0c` | **5.06 MB** | `5,302,169` | `docs/disease_rankings_full.csv` | Full ICD-10 ranking export. |
| `2166fa3bfb` | **0.95 MB** | `999,032` | `server/reference-data/drugs_clean.json`, `ml-engine/data/drugs_clean.json` | Stored once in `.git/objects`. |
| `ef943becea` | **0.67 MB** | `702,880` | `client/package-lock.json` | Locked frontend dependency tree. |
| `364ce35959` | **0.60 MB** | `632,202` | `ml-engine/data/dataset.csv` | Symptom-disease dataset. |
| `475cbf7148` | **0.54 MB** | `570,449` | `docs/temp/CODEX_TEST_MATRIX_20261105T132349Z.json` | Historical test matrix receipt (+ 5 earlier snapshots at 0.54 MB each). |

- **Conclusion**: `.git` is only **101.42 MB** total (`85.94 MiB` packed), dominated by legitimate runtime reference data (`medisync.db` + `interactions_clean.json` + `icd10_clean.json`, compressed in packfile). **No history rewrite (`git filter-repo` / `BFG`) or force-push is needed or recommended.**

---

## 6. Dead Code & Unused Files Audit (Task 1.4)

### 6A. Verified Unreferenced Tracked Source Files Removed in Phase 1
All 412 tracked source files under `server/src/` and `client/src/` were scanned against all tracked files in `server/`, `client/`, `scripts/`, and `ml-engine/`:

| File | Size | Proof (`git grep`) | Action Taken |
|---|---|---|---|
| `server/src/demo/universityProvisionPlan.js` | 1.84 KB | Zero imports in `server/`, `client/`, `scripts/`, `ml-engine/`. Explicitly marked `REMOVE` in `docs/PROJECT_AUDIT.md:377` (superseded by `liveDemoSeedPlan.js`). | **Removed (`git rm`)** |
| `server/src/middleware/requireOTP.js` | 2.19 KB | Zero imports in `server/`, `client/`, `scripts/`, `ml-engine/`. Superseded by `server/src/middleware/patientConsent.js`. | **Removed (`git rm`)** |
| `server/src/middleware/validateRequest.js` | 334 B | Zero imports in `server/`, `client/`, `scripts/`, `ml-engine/`. Validation is handled in route/security policies. | **Removed (`git rm`)** |
| `docs/b6_live_verification_execution.log` | 12.10 KB | Tracked `.log` file matching `.gitignore` (`*.log`). Zero test references. | **Untracked (`git rm --cached`, working file kept)** |

### 6B. Candidates Kept & Listed for Owner Review
| Candidate | Proof / Status | Why Kept (Listed for Owner) |
|---|---|---|
| `server/src/services/outbreakDetector.js` | Re-exports `surveillanceService.js`; referenced in `ARCHITECTURE.md:89` as the Milestone 3 WP4 Stage D entry module. | **KEEP** — intentional public module facade for outbreak detection. |
| `server/src/security/phase4QaPolicy.js` | Zero runtime imports (superseded by `qaConnectionAdmission.js`). | **KEEP** — lives in `server/src/security/`; retained per hard rule against removing security policy modules without owner sign-off. |
| `client/src/` ESLint unused imports (`Home.jsx:5` `Activity`, `hospital/Register.jsx:5` `CheckCircle`, `patient/Register.jsx:5` `CheckCircle`, `pharmacy/Register.jsx:5` `CheckCircle`, `patient/Profile.jsx:103` `setUploadingPic`/`setUploadProgress`) | Reported by `npm --prefix client run build` ESLint check. | Listed for owner (harmless icon/state imports in existing pages). |
| Untracked diagnostic scripts in `scripts/` (~202 files: `scripts/tmp_*.js`, `scripts/check_*.js`, `scripts/audit_*.js`, `scripts/test_*.js`) and `server/scripts/` (~55 untracked files) | `git status --ignored -s scripts/ server/scripts/` shows 257 untracked one-off scripts (`~1.8 MB` total). | Listed in `OWNER_ACTIONS.md` with a single PowerShell `git clean` dry-run/execute command so the owner can purge untracked scripts safely. |
| Stray root file `"e candidate sourcegit commit -m chore complete release candidate source"` (`16.08 KB`) and untracked root JSON/MD files (`AGENT_B_BACKEND_SECURITY_COMPLETION.md`, `medisync_final_browser_test_results.json`, `medisync_browser_corrected_execution_results.json`, `agent_config.json`) | Untracked in git (`git ls-files` = 0). | Listed in `OWNER_ACTIONS.md` with exact copy-paste PowerShell delete commands. |
