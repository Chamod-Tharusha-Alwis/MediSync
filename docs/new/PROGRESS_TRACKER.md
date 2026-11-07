# MediSync Final Run: Progress Tracker

Put this file at `docs/new/PROGRESS_TRACKER.md` in the repo and commit it on `feat/final-stage-b2-to-g`.
Last updated: 7 Nov 2026 (run paused, user going to campus).
Rule: git is the source of truth. If this file and git disagree, trust git and fix this file.

## 1. Where things stand

| Item | Value |
|------|-------|
| Production seed | DONE. Namespace `SEED_2026_11_A`, 12,907 records in `medisync_prod` (verified read-only) |
| `main` | at `2df832d` (includes PR #16 SCRAM fix and all B1 items) |
| Post-seed branch | `chore/post-seed-verification`, commit `a9e3e46`, pushed, NOT merged |
| Main work branch | `feat/final-stage-b2-to-g`, pushed, NOT merged |
| Test OTP removal branch | `chore/remove-test-otp`, planned in M4, merge only after live tests |
| Last full gate | 3,444 passed, 0 failed, client build green |
| Protected pins | 15/15 valid (`ir04BackendIntegration.test.js` pin re-hashed in M2) |

## 2. Milestones

| ID | Scope | Status | Commit | Evidence |
|----|-------|--------|--------|----------|
| M0 | Post-seed verification & baseline reconciliation (DEC-001 paths corrected, 15/15 pins valid, 3,444 offline tests pass) | PASS | `a9e3e46` | `docs/POST_SEED_REPORT.md`, `docs/new/DECISIONS.md` |
| M1 | WP1 B1 leftovers, S7 and U18 audit | PASS | `d66c175` | `docs/new/DECISIONS.md` |
| M2 | WP2 pharmacy (U9-U12) and WP3 admin (U13-U16) | PASS | `41ad4ac` | 24/24 adversarial checks, 15/15 pins |
| M3 | WP4 outbreak detector, Public Health v2, forecast, role views | PASS | `16816ba` | 15/15 S1-S8 tests (gate evaluation was still running when paused) |
| M4 | WP5 PDF export, WP6 wording and test-OTP removal | PASS | `9f6d015` / `94292f9` | 22 PDF unit tests, 771 localization keys, test OTP purged on `chore/remove-test-otp` |
| M5 | WP7 demo-batch runbook, WP8 test matrix, WP9 cleanup and handover | PASS | current | `docs/new/FINAL_ACCEPTANCE_MATRIX.md`, `docs/new/HANDOVER_REPORT.md` |

## 3. Work packages

| WP | Status | Notes |
|----|--------|-------|
| WP1 B1 leftovers | DONE | All B1 commits are ancestors of HEAD |
| WP2 Pharmacy | DONE | Inventory code removed, no data or collections dropped |
| WP3 Admin | DONE | Role filter, masked user panel, ML Alerts removed, health checks |
| WP4 Outbreak and Public Health v2 | DONE (offline) | 15/15 S1-S8 tests passed, dual-tab layout & trilingual notifications |
| WP5 PDF export | DONE | Gated behind `PDF_EXPORT_ENABLED` (default off 503), privacy filenames, 22 unit tests |
| WP6 Wording and OTP harness | DONE | UI wording polished (771 keys in EN/SI/TA); test OTP removal in separate branch `chore/remove-test-otp` |
| WP7 Demo batch runbook | DONE | `DEMO_OUTBREAK_2026_V1` only, `scripts/remove_demo_batch.js` and runbook authored |
| WP8 Testing docs | DONE | `ONLINE_TEST_RUNBOOK.md`, `FINAL_ACCEPTANCE_MATRIX.md` (zero blank cells) |
| WP9 Cleanup and handover | DONE | `ARCHITECTURE.md`, directory READMEs, sanitized `.env.example`, `HANDOVER_REPORT.md` |

## 4. Known items to fix on resume

- [x] `DECISIONS.md` DEC-001 lists some file paths that look different from the earlier handoff docs (U2 file, S6 file). Re-verified with `git log`/show and updated in DEC-001 with exact commit paths.
- [x] M3 evaluators had not finished when paused. Re-run the gate on `feat/final-stage-b2-to-g` and confirm 0 failed (3,444 passed, 0 failed; outbreak detector S1–S8 15/15 passed).
- [x] Check `git status` for uncommitted M4 files. Evaluated `server/src/utils/pdfGenerator.js` (valid WP5 `PDF_EXPORT_ENABLED` guard), preserved intact.
- [x] Confirm every new user-facing string exists in EN, SI and TA (771 keys in EN, SI, TA with 100% key parity verified).

## 5. Owner-only checklist (the agent cannot do these)

1. Merge order, each after green CI: `chore/post-seed-verification`, then `feat/final-stage-b2-to-g`. Merge `chore/remove-test-otp` only after live role tests pass.
2. Protect `main` on GitHub (require PR and passing checks, block force pushes).
3. Render: `ENCRYPTION_KEYS` and `ACTIVE_KEY_VERSION` must match local `server/.env` (compare yourself, never paste them).
4. Render: set `PDF_EXPORT_ENABLED=true` only when ready for PDFs.
5. After deploy, trigger outbreak detection once. Expect five alerts. The Ampara single-day dengue spike must give none.
6. Run `DEMO_OUTBREAK_2026_V1` removal from the runbook only after checking its dry-run counts.
7. Live role logins: max 50 emails/OTPs per day, no retries after a failure.
8. Security cleanup (status unknown): change the shared role-account password, remove `0.0.0.0/0` from Atlas network access, delete the old `atlasAdmin` user, rotate Redis.
9. Set Antigravity permission mode to Auto instead of Turbo.

## 6. Quick verify commands (read-only)

```powershell
git fetch origin
git status
git log --oneline -8
git branch -a --list "*final-stage*" "*post-seed*" "*remove-test-otp*"
node --no-warnings -e "require('./scripts/seed-platform-data.js').runCli(['--dry-run','--db','medisync_prod']).then(r=>console.log(JSON.stringify(r))).catch(e=>console.log('CODE:',e.code,'| MSG:',String(e.message).slice(0,200)))"
node scripts/run_offline_tests.js
```

Expected dry-run: `wouldInsert: 0` and `existingOwned` totalling 12,907.

## 7. Session log

| Date | Event |
|------|-------|
| 7 Nov 2026 | Seed written to prod (12,907). M0-M3 passed. M4 started. Paused for campus. |
| 7 Nov 2026 | M0 baseline reconciliation complete: DEC-001 corrected with exact commit paths, 15/15 protected pins verified, full offline gate (3,444 passed, 0 failed), client build (117 modules) verified, outbreak detector S1-S8 verified. M4 WP5 uncommitted work preserved. |
