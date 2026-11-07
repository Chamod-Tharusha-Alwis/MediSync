# Sub-Project 1 — Decisions

Format: ID — decision — alternatives — reason.

## D-001 — Separate tracking folder `docs/new/sub1/`
- Decision: keep this sub-project's plan and tracking in `docs/new/sub1/`, leaving `docs/new/PROGRESS_TRACKER.md` and `docs/new/DECISIONS.md` as the record of M0–M5.
- Alternatives: append to the existing files.
- Reason: brief requires the new folder; keeps history readable.

## D-002 — "Outbreak 3 levels" confirmed as geographic aggregation (Owner Q1: YES)
- Decision: District (25), Province (9), and Island-wide (1), each evaluated using unchanged rules (N >= 5, 2 consecutive days, z > 2) and existing tiers (Watch / Alert / Critical).
- Alternatives: interpret as the three severity tiers only (already implemented).
- Reason: confirmed by owner; tiers already exist, spatial hierarchy provides regional and national epidemiological visibility.

## D-003 — Ignore `medisync-qa-evidence/` in git (Owner Q2: YES)
- Decision: add `medisync-qa-evidence/` to `.gitignore` and do not track bulk evidence artifacts (optionally small curated PNGs in `docs/evidence/` later).
- Alternatives: commit full QA evidence directory.
- Reason: confirmed by owner; prevents bloating git history.

## D-004 — PDF attachment respects `PDF_EXPORT_ENABLED` (Owner Q3: YES)
- Decision: attach `consultation_<id>.pdf` to consultation summary email only when `PDF_EXPORT_ENABLED === 'true'`; otherwise send the prescription list email without PDF attachment.
- Alternatives: always attach PDF regardless of flag.
- Reason: confirmed by owner; preserves existing security hold without bypassing `PDF_EXPORT_ENABLED`.

## D-005 — Remove "Predictive Restock Warnings" sidebar item (Owner Q4: YES)
- Decision: remove the "Predictive Restock Warnings" navigation item from the Pharmacy sidebar.
- Alternatives: repurpose as link to district health burden.
- Reason: confirmed by owner; inventory subsystem was removed in M2, and district health burden is already surfaced on the Pharmacy dashboard.

## D-006 — Read-only aggregate/count queries allowed on `medisync_prod` for 6-vs-5 alert check (Owner Q5: YES)
- Decision: read-only `countDocuments` / `aggregate` queries on `medisync_prod` are permitted to diagnose the 6-vs-5 active alert count; never print document contents or PII, zero writes. Owner runs `remove_demo_batch` dry-run first.
- Alternatives: offline simulation only.
- Reason: confirmed by owner; allows exact diagnosis of production alert state while upholding strict read-only and zero-PII invariants.

## D-007 — Official 9 Provinces / 25 Districts mapping with bijection test (Owner Q6: YES)
- Decision: use the official Sri Lankan administrative division of 9 provinces and 25 districts, enforced by a unit test verifying every district maps to irritably/exactly one province (25 districts total, 9 provinces).
- Alternatives: custom regional clustering.
- Reason: confirmed by owner; matches official Sri Lankan public health administration.

## D-008 — Agent deletes no large folders
- Decision: Phase 1 produces `SIZE_AUDIT.md`, `scripts/size_report.ps1`, `.gitignore` updates, and copy-paste owner deletion commands in `OWNER_ACTIONS.md`; agent only uses `git rm --cached` and removes small, proven-unused code.
- Alternatives: agent deletes `scratch/`, `Python/`, `.venv/` directly.
- Reason: brief rule; prevents irreversible data loss.

## D-009 — Step 0 Backup Restore Sync and Git Stash Preservation
- Decision: After the working directory was restored from a pre-Phase-1 backup without `.git/`, re-initialized git, attached `origin` (`https://github.com/Chamod-Tharusha-Alwis/MediSync.git`), fetched all branches, aligned `HEAD` to `origin/feat/phase2-polish-and-cleanup` (`ef1b30c`), and preserved the pre-Phase-1 backup differences in `stash@{0}` (`restored-backup`, containing 332 untracked pre-Phase-1 backup files such as `research/`, `docs/brand/`, `server/scripts/phase5x*`, and 4 untracked local recovery test files) and `stash@{1}` (`restored-backup-tracked`, containing 14 tracked files from the pre-PR-#18 / pre-Phase-1 snapshot).
- Alternatives: overwrite working directory destructively.
- Reason: strictly obeys the no-destructive-commands rule (`git stash push` preserves every byte of the restored backup while keeping the branch clean and matched to `origin/feat/phase2-polish-and-cleanup`).

## D-010 — Task 1.7 Test Temp Directories Moved Outside Repo (`os.tmpdir()`)
- Decision: Updated `scripts/run_offline_tests.js`, `scripts/clinicalOfflineChild.cjs`, `scripts/seedPlatformMemoryProof.cjs`, `server/tests/helpers/seedPlatformMemoryCases.cjs`, `scripts/realLocalStack.cjs`, `scripts/realLocalStack.test.cjs`, `scripts/verifyMlStatusContractOffline.cjs`, `server/tests/websiteReferencePackaging.test.js`, `ml-engine/scripts/clinical_offline_tests.py`, `ml-engine/scripts/seed_platform_contract.py`, `ml-engine/test_reference_catalog.py`, and `ml-engine/app.py` to allocate all offline test/MongoMemoryReplSet/SQLite temp directories under `process.env.MEDISYNC_TEST_TMP || path.join(os.tmpdir(), 'medisync-test-tmp')` with non-fatal `bestEffortCleanup` (`EBUSY`/`EPERM`/`ENOTEMPTY` ignored so Windows file locks never fail the gate). Re-pinned `ml-engine/app.py` in `docs/release/PROTECTED_HASHES.json` (`220581f4e4...` -> `5a73ed87b1...`).
- Alternatives: keep writing to `<repo>/scratch` and delete after each run.
- Reason: prevents `scratch/` from ever being recreated inside the repo (or synced by OneDrive) and satisfies Task 1.7 verified by `server/tests/tempDirsOutsideRepo.test.js`.
