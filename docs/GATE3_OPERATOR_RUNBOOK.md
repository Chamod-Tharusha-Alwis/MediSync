# MediSync Gate 3 — operator release runbook

Synthetic capstone prototype only. Real clinical production remains NO-GO. This runbook grants no database, merge, production-deploy or service-resume authorization. Codex may push ONLY release/medisync-v1-final-integration for CI and Vercel Preview. All commands below are Windows PowerShell. Every illustrative output line is labeled **expected**; captured results cite their run.

## Step 0 — operator preparation and STOP conditions

Existing targets: GitHub Chamod-Tharusha-Alwis/MediSync; Vercel medi-sync (prj_FLv5iD60XwYnLIoUCsjYMo4xPdMR), team chamod-tharusha-s-projects, domain medisync.chamodtharusha.com.lk; Render medisync-ml-service and medisync-wabc. No replacement project.

**STOP before apply or merge: two current source defects need reviewed repairs.**

- server/scripts/provisionProductionStorage.js:196 creates collections without manifest capped options; :206–209 omits TTL options. Its comparator (:54–95) ignores option compatibility and compound-index order. Audit storage requires capped size 104857600/max 100000; OTP expiresAt needs TTL 0. Do not trust its existing VERIFY PASS alone.
- server/scripts/bootstrapSyntheticAccounts.js:175–182 omits isSuperAdmin:true; server/src/models/Admin.js:10 defaults false; server/src/app.js:192 requires an active super-admin. Do not bypass startup or manually mutate an account to compensate.

Captured offline run, source 6fac964464deff6a46a3500c54a6c0ef927e8e4b: [source-probe log](../scratch/gate3-source-probes-20261026/result.log) (actual path from repository root: scratch/gate3-source-probes-20261026/result.log). Actual provisioning against an inert adapter produced metadata its comparator accepted but strict admission rejected with PRODUCTION_STORAGE_PREREQUISITES_NOT_VERIFIED. Actual bootstrap instantiated isSuperAdmin:false. No Atlas operation occurred.

Install Git, Node 24/npm, MongoDB **Database Tools** (mongodump, mongorestore) and **mongosh** using official Windows installers. mongosh alone does not install Database Tools.

~~~powershell
git --version
node --version
npm --version
mongodump --version
mongorestore --version
mongosh --version
~~~

Privately verify compromised Atlas credentials were rotated, the intended account has ONLY readWrite@medisync_prod, remote Redis has authentication/TLS, and the separate legacy-backup account has read-only access to test. Record approved network access; do not automatically add a world-open Atlas rule. Preserve existing encryption keys in the approved secret manager/password manager.

Read and report the following **actual** Render settings per service before changing anything. Missing settings remain NOT VERIFIED.

| Service | Status / live SHA | Linked repo / branch | Auto-Deploy | Root Directory | Dockerfile path / context |
|---|---|---|---|---|---|
| medisync-ml-service | operator records actual values | expected: existing repo / main | operator records On Commit, After CI Checks Pass, or Off | expected: ml-engine | expected: ./Dockerfile / . relative to root |
| medisync-wabc | operator records actual values | expected: existing repo / main | operator records actual value | expected: server | expected: ./Dockerfile / . relative to root |

Also record build filters, pre-deploy command (no automatic migration/seed), health-check path, and linked environment-group NAMES. Vercel: verify production branch main, CRA, root client, Node 24, install npm install, build npm run build, output build. Record the previous known-good **production** deployment ID/SHA for rollback; never invent one.

Operator-reported findings, NOT captured by Codex: old ML /health returned "Not Found"; old backend /health returned {"error":"Endpoint not found"}. Manual deploy of old main 64abeaa failed with "[FATAL] Vault is required in production environments". A restart/resume of OLD CODE cannot add /health.

## Step 1 — CLEAN release clone outside OneDrive, no environment files

Use a fresh PowerShell session without transcription; do not copy the existing working tree, dependencies or secrets. Sparse checkout excludes tracked client/.env.production. Templates ending .env.example are allowed, but no actual .env or .env.production is loaded. Clone-local attributes preserve committed bytes despite existing CRLF/LF inconsistencies; repository source is unchanged.

~~~powershell
$ErrorActionPreference = 'Stop'
$ReleaseBranch = 'release/medisync-v1-final-integration'
$Stamp = Get-Date -Format yyyyMMdd_HHmmss
$Clone = Join-Path $env:LOCALAPPDATA "MediSync\gate3-$Stamp"
git -c core.autocrlf=false clone --no-checkout --branch $ReleaseBranch https://github.com/Chamod-Tharusha-Alwis/MediSync.git $Clone
if ($LASTEXITCODE -ne 0) { throw 'CLONE_FAILED' }
Set-Content -LiteralPath (Join-Path $Clone '.git\info\attributes') -Value '** -text' -Encoding ascii
Set-Location $Clone
git sparse-checkout init --cone
git sparse-checkout set server scripts docs
git checkout $ReleaseBranch
if ($LASTEXITCODE -ne 0) { throw 'CHECKOUT_FAILED' }
if (git status --porcelain) { throw 'CHECKOUT_NOT_CLEAN' }
$ReleaseSha = git rev-parse HEAD
$ReleaseSha
if (Get-ChildItem -Force -Recurse -File | Where-Object { $_.Name -eq '.env' -or ($_.Name -like '.env.*' -and $_.Name -ne '.env.example') }) { throw 'ENV_FILE_PRESENT' }
$Forbidden = @('MONGO_URI_TEST','MONGODB_URI_TEST','MONGO_URI_STAGING','SEED_TEST_PASSWORD','JEST_WORKER_ID','SINGLE_INSTANCE_DEV_MODE','MEDISYNC_OFFLINE_ONLY','MEDISYNC_LIVE_BROWSER_APPROVED','MEDISYNC_PUBLIC_DEMO','MEDISYNC_UNIVERSITY_DEMO','ALLOW_SYNTHETIC_DEMO_DIRECTORY')
if (Get-ChildItem Env: | Where-Object { $_.Name -in $Forbidden -or $_.Name -match '^MEDISYNC_(QA_|TEST_|COMBINED_|DEMO_)' }) { throw 'FORBIDDEN_SESSION_VARIABLE_PRESENT' }
Set-Location (Join-Path $Clone 'server')
npm ci
if ($LASTEXITCODE -ne 0) { throw 'NPM_CI_FAILED' }
~~~

Do not continue with dirty Git, any .env, or MONGO_URI_TEST in the session. Forbidden variable names must be absent even if false/empty. All remaining Node commands run from this clone's **server** directory. The three operator scripts explicitly load server/.env; its absence matters.

## Step 2 — private current-session configuration; offline preflight

Never print environment contents, save a URI/password/key file, use a transcript, or place credentials in command arguments. Environment strings necessarily exist in process memory. Close the shell afterwards.

~~~powershell
function Read-SessionSecret([string]$Name) {
    $Secure = Read-Host "Enter $Name privately" -AsSecureString
    $Ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try { [Environment]::SetEnvironmentVariable($Name, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Ptr), 'Process') }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Ptr); $Secure.Dispose() }
}
$env:NODE_ENV = 'production'
$env:MEDISYNC_DEPLOYMENT_MODE = 'clinical'
$env:MEDISYNC_PROTOTYPE_MODE = 'true'
$env:MEDISYNC_ALLOW_OPERATOR_KEYS = 'true'
# Set these attestations ONLY after personally verifying their truth:
$env:MEDISYNC_LIVE_START_APPROVED = 'true'
$env:MEDISYNC_ATLAS_ROTATION_CONFIRMED = 'true'
$env:ACTIVE_KEY_VERSION = '1'
$env:CLIENT_URL = 'https://medisync.chamodtharusha.com.lk'
$env:CORS_ORIGIN = $env:CLIENT_URL
$env:ML_ENGINE_URL = 'https://medisync-ml-service.onrender.com'
foreach ($Name in @('MONGO_URI','REDIS_URL','ENCRYPTION_KEYS','JWT_SECRET','JWT_REFRESH_SECRET','SESSION_SECRET','INTERNAL_API_KEY')) { Read-SessionSecret $Name }
node scripts/preflightProduction.js
if ($LASTEXITCODE -ne 0) { throw 'OFFLINE_PREFLIGHT_FAILED' }
~~~

MONGO_URI must select exact host medisync.p7hjket.mongodb.net, database **medisync_prod**, TLS, majority writes, primary reads, admin authentication, SCRAM-SHA-256. Never select test. ENCRYPTION_KEYS is a JSON object mapping "1" to the approved 32-byte key; ACTIVE_KEY_VERSION selects it. Use distinct high-entropy JWT/session/internal secrets; length checks alone do not prove entropy. INTERNAL_API_KEY must match ML. Never set VAULT_TOKEN=bypass.

~~~text
expected: [PASS] ... for every offline gate; inspect every actual gate.
expected: [PREFLIGHT OFFLINE COMPLETE] All offline policy gates passed.
~~~

**Exact encryption-variable contract:** server/src/security/operatorKeyPolicy.js:68–86 reads ONLY MEDISYNC_PROTOTYPE_MODE, MEDISYNC_ALLOW_OPERATOR_KEYS, VAULT_TOKEN, ENCRYPTION_KEYS, ACTIVE_KEY_VERSION. app.js:60–71 uses that dictionary. ENCRYPTION_KEY and ENCRYPTION_KEY_1 are **not rejected** by productionRuntimePolicy.js:5–17; both are ignored in the operator branch and should be omitted to avoid ambiguity. The separate Vault path requires singular ENCRYPTION_KEY at app.js:85–86. ENCRYPTION_KEY_1 is not a replacement for ENCRYPTION_KEYS.

The actual forbidden-name policy is the $Forbidden list above plus /^MEDISYNC_(QA_|TEST_|COMBINED_|DEMO_)/, case-insensitively (productionRuntimePolicy.js:5–17). Inspect inherited environment groups too. Do not call singular encryption names forbidden.

## Step 3 — separately authorized read-only connection, then legacy backup

~~~powershell
node scripts/preflightProduction.js --connect
if ($LASTEXITCODE -ne 0) { throw 'CONNECT_PREFLIGHT_FAILED' }
~~~

~~~text
expected: [PASS] Identity verified: db=medisync_prod, users=1, roles=[{"role":"readWrite","db":"medisync_prod"}]
expected: [STORAGE AUDIT] Compliant collections: <actual>/<required>, Compliant indexes: <actual>/<required>
expected: [PREFLIGHT CONNECT COMPLETE] All read-only probes finished successfully.
~~~

This reads Atlas identity and collection/index metadata, **not Redis connectivity**, despite the script's misleading footer. Connection success alone is not storage readiness. Stop on admission failure. Do not start Express.

Back up legacy **test read-only**, with a separately approved read-only backup account. Database Tools uses its own non-echoing password prompt when --username is supplied without --password; this is its secure-input equivalent of Read-Host -AsSecureString. No password goes in a URI, file or process argument.

~~~powershell
$BackupRoot = Join-Path $env:LOCALAPPDATA ("MediSync\private-backups\legacy-test-" + (Get-Date -Format yyyyMMdd_HHmmss))
$BackupUser = Read-Host 'Approved read-only legacy backup username'
mongodump --uri 'mongodb+srv://medisync.p7hjket.mongodb.net/test?tls=true&authSource=admin' --username $BackupUser --authenticationMechanism SCRAM-SHA-256 --db test --out $BackupRoot
if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $BackupRoot 'test'))) { throw 'LEGACY_BACKUP_FAILED' }
~~~

Pre-protect the private backup root with operator-only NTFS permissions, keep it outside OneDrive/Git, encrypt the backup via the approved recovery system and record its location privately. This is NOT a medisync_prod recovery snapshot. Never publish its contents, restore it into production, or restore/alter/delete test.

## Step 4 — provisioning then bootstrap (CURRENTLY BLOCKED)

Do not execute the current broken provision/bootstrap tools, including their dry-runs. Bootstrap imports Mongoose models without disabling automatic DDL before connecting (bootstrapSyntheticAccounts.js:19–55, :147–151), so its dry-run is not yet proven free of implicit schema writes. After reviewed repairs also disable automatic model DDL for that tool, obtain separate DDL/synthetic-write authorization, preserve an approved medisync_prod recovery point, and ensure other writers are idle. Provision/bootstrap dry-runs connect, unlike offline preflight. The commands below describe the repaired sequence; they are blocked on current source.

~~~powershell
node scripts/provisionProductionStorage.js
if ($LASTEXITCODE -ne 0) { throw 'PROVISION_DRY_RUN_FAILED' }
# STOP: inspect actual collection/index OPTIONS; separately authorize apply.
node scripts/provisionProductionStorage.js --apply
if ($LASTEXITCODE -ne 0) { throw 'PROVISION_APPLY_FAILED' }
node scripts/provisionProductionStorage.js --verify
if ($LASTEXITCODE -ne 0) { throw 'PROVISION_VERIFY_FAILED' }
foreach ($Name in @('BOOTSTRAP_ADMIN_PASSWORD','BOOTSTRAP_DOCTOR_PASSWORD','BOOTSTRAP_HOSPITAL_PASSWORD','BOOTSTRAP_PHARMACY_PASSWORD','BOOTSTRAP_PATIENT_PASSWORD')) { Read-SessionSecret $Name }
node scripts/bootstrapSyntheticAccounts.js
if ($LASTEXITCODE -ne 0) { throw 'BOOTSTRAP_DRY_RUN_FAILED' }
# STOP: review synthetic identities/records; separately authorize apply.
node scripts/bootstrapSyntheticAccounts.js --apply
if ($LASTEXITCODE -ne 0) { throw 'BOOTSTRAP_APPLY_FAILED' }
~~~

Use unique strong bootstrap passwords. The script already reads these names; --passwords-from-env is unimplemented. No seed utilities or --qa. Current manifest: 29 collections/66 indexes total, 28/65 nonoptional. Optional reminder storage must follow the separately approved flags. Require strict runtime capped/TTL/unique/sparse/compound-order verification and an active isSuperAdmin:true account; the old comparator's green output is insufficient. Do not blindly retry a partially failed apply.

~~~text
expected: [DRY-RUN COMPLETE] No changes were written to the database.
expected: [APPLY COMPLETE] All missing collections and indexes created additively.
expected: [VERIFY PASS] Database storage is 100% compliant with productionStorageManifest.json.
expected: [BOOTSTRAP PROCESS COMPLETED]
~~~

## Step 5 — save ALL environments BEFORE merge; ML first, backend second

Operator only, after preceding gates pass. With Auto-Deploy On Commit/After CI Checks Pass, **ALL Render variables must already be saved BEFORE merging main**. Configure ML first, then backend, then Vercel.

Editing env with Save and deploy redeploys the running service's **OLD build**. Save, rebuild, and deploy still uses the old branch commit until main changes. Prefer **Save only**, then the new-commit deploy immediately after the approved merge. If Save only is unavailable, coordinate env changes and the new-code deployment back to back; never accept an old-code restart as validation. [Render environment save options](https://render.com/docs/configure-environment-variables).

| Target | Exact names / nonsecret settings |
|---|---|
| ML | INTERNAL_API_KEY (same as backend), PORT (Render assigned), PYTHONPATH=.; Docker uses Gunicorn. No Atlas/Redis/provider secrets |
| Backend | NODE_ENV=production; MEDISYNC_DEPLOYMENT_MODE=clinical; MEDISYNC_PROTOTYPE_MODE=true; MEDISYNC_ALLOW_OPERATOR_KEYS=true; truthful MEDISYNC_LIVE_START_APPROVED=true and MEDISYNC_ATLAS_ROTATION_CONFIRMED=true; MONGO_URI; REDIS_URL; ENCRYPTION_KEYS; ACTIVE_KEY_VERSION=1; JWT_SECRET; JWT_REFRESH_SECRET; SESSION_SECRET; INTERNAL_API_KEY; CLIENT_URL; CORS_ORIGIN; ML_ENGINE_URL; Render PORT |
| Backend providers, if enabled | RESEND_API_KEY, RESEND_FROM_ADDRESS; approved Brevo fallback BREVO_API_KEY, BREVO_FROM_ADDRESS; uploads CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET. Verify sender/domain before testing delivery |
| Vercel Production | REACT_APP_API_URL=https://medisync-wabc.onrender.com/api; REACT_APP_SERVER_URL=https://medisync-wabc.onrender.com; approved public REACT_APP_CARTO_API_KEY; optional REACT_APP_GA_MEASUREMENT_ID. Never database/key/provider secrets |

Enter secrets privately in service dashboards/password manager, not files or screenshots. Check inherited groups for forbidden/conflicting names. CRA embeds public values at build time; keep existing clinical CRA project settings unchanged.

## Step 6 — operator verifies PR base MAIN, then separately merges

Only AFTER Steps 0–5 pass: existing PR #5 → Edit → base **main** → confirm comparison → inspect the PR page explicitly says release/medisync-v1-final-integration **into main**. If no PR exists, the operator may open exactly that head/base under separate authorization. Codex must not open, retarget or merge it in this assignment.

Captured read-only [PR #5 API](https://github.com/Chamod-Tharusha-Alwis/MediSync/pull/5), 26 October: base was chore/safe-localhost-development, head 6fac964..., state open. This is not evidence retargeting occurred. Recheck final diff and exact-head CI after changing the base. Operator separately approves merge and records the resulting **main SHA** from GitHub's merged PR/commit page; merge/squash SHA can differ from release head.

## Step 7 — deploy the MERGED commit, not 64abeaa

Watch Vercel medi-sync → Production deployment → Source and Build Logs: main and the exact merged SHA. Render EACH service → Events/Deploys → selected deploy → initial Git checkout/build-log section: inspect the checked-out commit and branch (normally a line containing "Checking out commit ... in branch main"). Open the commit link/details to match the full SHA, not just a short message or green service status.

~~~text
expected: Render deploy details / checkout identify <NEW_MERGED_MAIN_SHA>, branch main.
expected: Vercel Production Source identifies the same <NEW_MERGED_MAIN_SHA>.
~~~

STOP for old 64abeaa / 64abeaac17cf8bd4bab23812ed02268c73b2e8db, any other unexpected SHA/branch, or failed build. Old Vault failure does not diagnose the new operator-key path.

If no Render auto-deploy occurs (Off, build filters, or no qualifying checks): existing service → **Manual Deploy → Deploy a specific commit** → paste the NEW merged SHA → **Deploy Commit**. ML first, confirm it, then backend. Alternatively Deploy latest commit only after verifying linked main's latest SHA is exactly intended. Dashboard specific-commit deployment disables Auto-Deploy; record that afterwards. Never use Restart service as a substitute. A suspended service needs separately approved operator resume as part of the new-commit deploy; Codex does not resume it. [Render deployment behavior](https://render.com/docs/deploys), [root-relative Dockerfile settings](https://render.com/docs/monorepo-support).

## Step 8 — expected boot logs and fixes

These are **expected**, source-derived diagnostics, not captured hosted output. Docker production.js:18–21 masks thrown errors with the generic fatal below; do not expect every internal exception code in hosted logs.

| Condition | Expected line / diagnostic | Fix |
|---|---|---|
| Operator keys selected | expected: [SECURITY WARNING] MEDISYNC_PROTOTYPE_MODE active: Booting with operator-supplied encryption keys. Vault bypassed for prototype only. (app.js:70) | Confirms key branch, NOT completed boot |
| Redis connected | expected: [Redis] Connected successfully. (redis.js:54) | Still require readiness |
| Missing key / secrets | expected: preflight [FAIL] ... OPERATOR_KEY_ERROR: ENCRYPTION_KEYS environment variable is missing. / PREFLIGHT_ERROR: Missing or insufficient entropy for secrets: <names> | Correct private values/active version; no QA fallback |
| Rejected variable | expected: preflight PRODUCTION_RUNTIME_QA_MATERIAL_FORBIDDEN | Remove forbidden NAMES including inherited groups; false/empty still rejected |
| General thrown boot error | expected: [FATAL] Production server failed to start. Check admission and dependency configuration. (production.js:20) | Use offline preflight and earlier sanitized logs; not enough detail to infer cause |
| Redis failure | expected: generic fatal; internal SECURITY_STORE_UNAVAILABLE (redis.js:62). Preflight may show REDIS_PRODUCTION_CONFIGURATION_REQUIRED / REDIS_AUTHENTICATION_REQUIRED / REDIS_REMOTE_TLS_REQUIRED | Correct managed Redis auth/TLS/network; no production memory fallback. Offline PASS does not prove connection |
| Atlas invalid target | expected: DB connection failed: PRODUCTION_ATLAS_URI_INVALID / PRODUCTION_EXISTING_CLUSTER_AND_DATABASE_REQUIRED | Correct exact host/medisync_prod/TLS/rotated credentials, never redirect to test |
| Atlas role/storage admission | expected: DB connection failed: [FATAL][DB-GUARD] Production identity or storage prerequisites were not verified. (dbGuard.js:289) | Check sole role/network/strict storage with separately approved tools; never weaken admission |
| Old Vault path | expected: [FATAL] Vault is required in production environments. | Verify NEW SHA and both operator/prototype flags first; old 64abeaa lacks new path |
| Missing boot admin | expected: generic fatal; internal Approved operator account provisioning is required before live startup (app.js:192) | Stop for reviewed bootstrap fix, never remove check |

## Step 9 — health ML, THEN backend, THEN synthetic smoke

Only after both deployments show the NEW SHA:

~~~powershell
$MlHealth = Invoke-WebRequest -Uri 'https://medisync-ml-service.onrender.com/health' -TimeoutSec 30
if ($MlHealth.StatusCode -ne 200 -or ($MlHealth.Content | ConvertFrom-Json).status -ne 'ready') { throw 'ML_NOT_READY' }
$MlHealth.StatusCode
$MlHealth.Content
$ApiHealth = Invoke-WebRequest -Uri 'https://medisync-wabc.onrender.com/health' -TimeoutSec 30
if ($ApiHealth.StatusCode -ne 200 -or ($ApiHealth.Content | ConvertFrom-Json).status -ne 'ready') { throw 'API_NOT_READY' }
$ApiHealth.StatusCode
$ApiHealth.Content
~~~

~~~text
expected: ML HTTP 200, {"references":{"clinicalValidation":"not_established","files":7,"icd10Concepts":71704},"status":"ready"} (key order immaterial).
expected: Backend HTTP 200, {"status":"ready","service":"medisync-express"}.
~~~

ML 503 Reference data unavailable means missing/incompatible references. Backend 503 unavailable means dependency/admission/shutdown readiness failed. A 404 means stale code/wrong routing. Stop before login or writes.

Then follow [RELEASE_SMOKE_TEST.md](RELEASE_SMOKE_TEST.md), synthetic only, with separate clinical-write authorization. Default @medisync.synthetic accounts **cannot receive mail**. New accounts default twoFactorEnabled:false, so ordinary fresh-account login has **no OTP prompt step**. Existing/revoked-device state can still demand OTP: stop, do not bypass it. Real email is needed for invitations, recovery/password reset, 2FA enrollment/use, revoked-device verification, consent/report-access OTPs, email notifications and reminders. Synthetic login or health does not verify those features.

## Step 10 — rollback: re-suspend, previous Vercel production, guarded recovery

Operator re-suspends backend and ML in existing Render Settings. Vercel medi-sync → Deployments → previous recorded known-good **production** deployment → Rollback/Promote to Production; verify source/domain. No automatic main revert/push, invented deployment ID, assumed recovery timing or unreviewed preview promotion. [Vercel rollback](https://vercel.com/docs/instant-rollback).

Database recovery requires a separately reviewed medisync_prod snapshot, exact namespace/record scope and explicit authorization. First this read-only guard prints the requested database and refuses any name except medisync_prod, then verifies/prints the connected name. URI comes only from current-session memory; no restore/delete/drop occurs:

~~~powershell
$RollbackGuard = @'
const u=process.env.MONGO_URI;
if(!u) throw new Error('MONGO_URI_REQUIRED');
const n=new URL(u).pathname.slice(1);
print('Database requested: '+n);
if(n!=='medisync_prod') throw new Error('STOP_DATABASE_NOT_MEDISYNC_PROD');
const d=connect(u);
print('Database connected: '+d.getName());
if(d.getName()!=='medisync_prod') throw new Error('STOP_DATABASE_NOT_MEDISYNC_PROD');
print('No writes performed; separately approved recovery plan required.');
'@
mongosh --nodb --quiet --eval $RollbackGuard
if ($LASTEXITCODE -ne 0) { throw 'ROLLBACK_DATABASE_GUARD_FAILED' }
~~~

~~~text
expected: Database requested: medisync_prod
expected: Database connected: medisync_prod
expected: No writes performed; separately approved recovery plan required.
~~~

Never dropDatabase, blanket-clean, restore legacy backup into production, or restore/modify/delete test. If only the legacy test dump exists, suspend services and preserve evidence; it cannot roll back medisync_prod. Close the secret-bearing session.

## Captured local verification (NOT hosted production acceptance)

Source 6fac964... plus the targeted ML dependency changes accompanying this runbook:

- Backend fresh clone outside OneDrive: C:\Users\chamo\AppData\Local\MediSync\gate3-backend-20261026_234147\source. Clean no-cache Docker build exit 0. Run scratch/gate3-backend-20261026_234147/container.log captured the operator-key warning, then DB connection failed: PRODUCTION_ATLAS_URI_INVALID; process exit 1; **NO HTTP /health RESPONSE**. Dummy-only environment, network disabled, no Atlas/Redis/provider operation. This is fail-closed evidence, not ready/200. A separate throwaway diagnostic container invoked the actual runtimeHealth handler with unavailable dependency predicates: actual HTTP 503, {"status":"unavailable","service":"medisync-express"}, captured in diagnostic-health-http.txt in that run directory. It did not run production bootstrap or prove database connectivity.
- ML fresh-clone build with only reviewed dependency delta: scratch/gate3-ml-verification-20261026_234200. Actual local HTTP 200 at 127.0.0.1:55184/health: {"references":{"clinicalValidation":"not_established","files":7,"icd10Concepts":71704},"status":"ready"}. See minimal-bumps-fresh-container-health.json/.log. Throwaway container removed.
- Same ML image: installed-package audit exit 0, **59 packages / 0 known advisories**; pip check passed; **19 ML tests PASS**. Captures minimal-bumps-installed-pip-audit.json/.stderr.txt and minimal-bumps-ml-tests.log. Earlier 143 advisory entries/11 packages retained as historical failure, not current result.
- Client lock audit: **55 findings (3 critical, 32 high, 10 moderate, 10 low)**, exit 1, run scratch/gate3-client-audit-20261026_233854/client-npm-audit.json. Not all flagged packages are proven build-only; see [POST_RELEASE_BACKLOG.md](POST_RELEASE_BACKLOG.md).
- Docker-start inventory contained existing medisync-redis on 127.0.0.1:6379. It was only listed; never changed. Only newly created verification containers were removed.
- Historical source 6fac964... CI: [offline push run](https://github.com/Chamod-Tharusha-Alwis/MediSync/actions/runs/40349021944) and [security push run](https://github.com/Chamod-Tharusha-Alwis/MediSync/actions/runs/40349022308) completed success. These do not prove the new commit's CI, Atlas readiness, hosted health or clinical safety.
