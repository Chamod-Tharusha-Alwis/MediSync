# Scheduled demo-data seeding: guide

**Status on 2026-11-25: NO seeding run has been made on any real database.** Only the in-memory proof was run
(`seeding_proof_console.txt`, `seeding_proof_result.json`). `RUN_<n>.md` will be written after each run you approve.

## Decision needed before Run 1 (conflict in the requirements)
The detector and the public statistics read cases **only** from the `consultations` collection. There is no separate
case-count collection. So "do not touch consultations" and "the Monitor shows planted outbreaks" cannot both hold.
- The tool never changes or deletes an existing consultation. It would **insert new, labelled synthetic** rows.
- It refuses to write unless `--allow-synthetic-consultations` is given. If you do not accept this, do not run it.
- The new rows contain no name, NIC, diagnosis text, notes, doctor, hospital or encrypted field.

## What you must know
1. **The public statistics and activity pages will not change.** `publicHealthStats.js` and `publicConsultationActivity.js` exclude synthetic
   rows by design (the proof confirmed the output was identical). On the public page, only an alert that an administrator
   **approves** appears, labelled as a demonstration. So there is nothing to refresh for those pages; `--flush-cache` exists anyway.
2. *(True for the code deployed on 2026-11-25. Once `feat/alert-update-on-scan` is merged and deployed, a later scan updates the active alert
   instead; duplicates made before that stay until you resolve them.)* **Every run can add new Pending alerts for the same outbreak.** The alert ID is a hash of all source rows in the 63-day
   bucket, so after new cases arrive the next scan creates a new alert and the old one stays Pending. Earlier notes that say
   "a repeated scan updates the same alert" are true only when no new case arrived. Resolve the older ones before the viva.
3. **A real scan notifies users in the app.** The tool does not scan. It prints a read-only preview with the real rule. To create
   alerts, use "Force System Scan" as administrator. If `MEDISYNC_BACKGROUND_JOBS_APPROVED` is on, scheduled jobs may also run.
4. **Background noise also triggers the rule.** In the proof, 2 to 4 signals per run were not planted. Do not present them as planted.
5. The tool cannot confirm what production holds. Read the dry run first: if the older demo seed is missing there, the
   dry run will show thousands of rows instead of hundreds.

## Planted episodes (at most three, labelled `plantedEpisode`)
Start = 4 days before the first run (21 November if Run 1 is on 25 November). Later runs extend the same episodes.

| ID | Disease | District | Result in the proof |
|---|---|---|---|
| TOPUP-1 | dengue | Matara | Critical |
| TOPUP-2 | leptospirosis | Polonnaruwa | Alert (High) |
| TOPUP-3 | diarrhoeal disease | Jaffna | Critical |

Three closed example alerts (Trincomalee, Kalutara, Batticaloa; 21 to 47 days old) fill the History page. Their message says they were
**not produced by a detector scan**.

## Set up once per PowerShell window (you, not me)
Run these in the repository folder. `Read-Host` keeps the address out of the command history.
```powershell
$env:SEED_DEMO_URI = Read-Host "MongoDB address including the database name"
```
```powershell
$env:SEED_DEMO_ALLOWED_HOSTS = Read-Host "Cluster host name exactly as in the address"
```
For a local test database, set `SEED_DEMO_URI` to it and leave out `--confirm-production`.

## Commands (wait for your own approval before each write)

| Run | When | Dry run | Write (only after you approve) |
|---|---|---|---|
| 1 | Wed 25 Nov | `npm run seed:demo -- --batch=run1 --confirm-production` | `npm run seed:demo -- --batch=run1 --confirm-production --allow-synthetic-consultations --write` |
| 2 | Thu 26 Nov | `npm run seed:demo -- --batch=run2 --confirm-production` | `npm run seed:demo -- --batch=run2 --confirm-production --allow-synthetic-consultations --write` |
| 3 | Fri 27 Nov | `npm run seed:demo -- --batch=run3 --confirm-production` | `npm run seed:demo -- --batch=run3 --confirm-production --allow-synthetic-consultations --write` |
| 4 | Sat 28 Nov, early | `npm run seed:demo -- --batch=run5 --confirm-production` (dry run only) | none |
| 5 | Sat 28 Nov, before 10:00 | none | `npm run seed:demo -- --batch=run5 --confirm-production --allow-synthetic-consultations --write` |

Nothing after 10:00 on Saturday. After Run 3, check the Monitor, History, the public map and the email yourself.

## Rollback (any run)
```powershell
npm run seed:demo -- --batch=run1 --rollback --confirm-production
```
```powershell
npm run seed:demo -- --batch=run1 --rollback --confirm-production --write
```
It removes only rows that carry this `seedBatch` **and** the synthetic labels. It lists, but does not delete, alerts that a scan made from them:
resolve or dismiss those in the admin page. If a run fails, do not retry: roll back that batch and send the error.

## Safety built in
- Dry run is the default (you asked for `--dry-run`; that also works). Writing needs `--write`.
- Reads `db.stats()` first; refuses if data plus indexes would pass 300 MB.
- `mongodump` of the whole target database to `%USERPROFILE%\medisync-backups\` before every write or delete. No backup means no write.
- `--backup-dir` inside the repository is refused. The proof restored a backup and counted the same 30,033 rows.
- Inserts only (`$setOnInsert`). A (disease, district, date) combination that exists from any other source is skipped.
- Remote hosts need `--confirm-production` **and** an exact match in `SEED_DEMO_ALLOWED_HOSTS`. No `.env` file is read.

The backup archive contains encrypted patient data. Keep it private and delete it after the viva.

**Reporting rule:** seeded rows are synthetic. Never mix them into, or use them to change, any figure in the evaluation chapters.
