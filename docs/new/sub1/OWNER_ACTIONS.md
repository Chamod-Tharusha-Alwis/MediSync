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

## 2. Phase 4 (Upcoming) — Read-Only Demo Batch Count Check on `medisync_prod`

Per Owner Answer Q5, before any demo batch removal is considered, run the read-only dry-run of `scripts/remove_demo_batch.js` and paste the counts:
```powershell
node scripts/remove_demo_batch.js --dry-run
```

---

## 3. Later Phases (Reference)
- **Phase 2**: Set `PDF_EXPORT_ENABLED=true` on Render when ready to enable PDF downloads and consultation summary PDF attachments (default remains `false` → `503`).
- **Phase 3**: Run `scripts/seed-dispensing-sample.js` (`SEED_2026_11_B`) in `--dry-run` mode first before any `--confirm` run.
- **Phase 5**: If official 2024 Census PDF/table fetch is blocked, provide the DCS 2024 district population table.
- **Phase 7**: Ordered live-test checklist (max 50 OTPs/day, no retries after a failure).
