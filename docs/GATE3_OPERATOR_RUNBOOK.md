# MediSync Gate 3 — operator release runbook

27 October 2026. Synthetic prototype only; real clinical production remains NO-GO. Windows PowerShell only. This document authorizes no Atlas, account, Redis, hosting, merge or deployment operation.

**Review gate:** baseline commit cf4a24cb9ac8d4dea4387b19f7c66b6d698ee65b has historical green CI. Use this seven-file follow-up only after its authorized source commit, fresh-clone verification and exact-head CI pass. The baseline commit alone does not implement all checks below. Source commit/push approval does not authorize database access, merge or deployment.

## 0 — tools, settings, network and recovery

Node **24.x is required for this release procedure**. Repository engines allow >=24, but CI and the production Docker image use 24. The old audit capture used v26.4.0; it is not Node 24 evidence. Install approved Git, Node 24/npm, MongoDB Database Tools (mongodump AND mongorestore) and mongosh. mongosh alone does not install Database Tools.

~~~powershell
$ErrorActionPreference = 'Stop'
node --version
if ($LASTEXITCODE -ne 0) { throw 'NODE_CHECK_FAILED' }
if ((node --version) -notmatch '^v24\.') { throw 'USE_NODE_24_FOR_THIS_RELEASE' }
npm --version
git --version
mongodump --version
mongorestore --version
mongosh --version
$Stamp = Get-Date -Format yyyyMMdd_HHmmss
~~~

expected: Node v24.x; all tool checks exit 0.

If PowerShell reports NativeCommandError for normal Git diagnostic output, run the commands in a normal PowerShell window, not PowerShell ISE. Check the actual Git exit code with $LASTEXITCODE; stderr text alone does not prove command failure. Do not suppress genuine nonzero exits or use a force operation to bypass them.

Existing targets only: GitHub Chamod-Tharusha-Alwis/MediSync; Vercel medi-sync, team chamod-tharusha-s-projects, ID prj_FLv5iD60XwYnLIoUCsjYMo4xPdMR, domain medisync.chamodtharusha.com.lk; Render medisync-ml-service and medisync-wabc. No replacement projects or DNS changes.

For EACH Render service read/report actual **status, live SHA, linked repository, deploy branch, Auto-Deploy mode, Root Directory, Dockerfile path and build context**. Also record build filters, pre-deploy command, health-check path and environment-group NAMES.

| Service | Expected branch | Expected root | Expected Dockerfile/context |
|---|---|---|---|
| ML | expected: main | expected: ml-engine | expected: ./Dockerfile / . relative to root |
| Backend | expected: main | expected: server | expected: ./Dockerfile / . relative to root |

Verify Vercel production branch main, CRA/root client, Node 24, install npm install, build npm run build, output build. Record a real previous known-good PRODUCTION deployment ID/SHA and a separately approved medisync_prod recovery snapshot. Missing settings/rollback candidates remain NOT_VERIFIED.

Both exposed Atlas credentials must be rotated before connections. Verify the application account has ONLY readWrite@medisync_prod; flags are human attestations, not rotation proof. Preserve keys privately and arrange an exclusive write window for separately approved apply operations.

**Atlas networking:** first get each Render service's shared regional outbound CIDRs at service > Connect > Outbound. Separately authorize allowlisting these ranges in Atlas Network Access and test connectivity from the deployed service after approved deployment. Local tools also need the operator's approved egress address. Render publishes regional outbound ranges; do not claim it has none. Use 0.0.0.0/0 only as a separately documented fallback decision with owner, scope, duration, risk acceptance and removal plan; never add it automatically. Source: https://render.com/docs/outbound-ip-addresses .

Operator-reported history, NOT captured Codex output: old health endpoints returned not-found responses; deploy of old main 64abeaa failed with [FATAL] Vault is required in production environments. Restarting old code cannot add /health.

## 1 — CLEAN approved-release clone outside OneDrive

Fresh PowerShell session, no transcription. No copied dependencies or secrets. No actual .env files or MONGO_URI_TEST. Sparse checkout excludes environment files; clone-local attributes preserve committed bytes. Enter the separately approved FINAL SHA, including the reviewed preflight follow-up.

~~~powershell
$ReleaseBranch = 'release/medisync-v1-final-integration'
$ApprovedSha = Read-Host 'Separately approved final release SHA'
if ($ApprovedSha -notmatch '^[a-fA-F0-9]{40}$') { throw 'FULL_APPROVED_SHA_REQUIRED' }
$Clone = Join-Path $env:LOCALAPPDATA "MediSync\gate3-$Stamp"
git -c core.autocrlf=false clone --no-checkout --branch $ReleaseBranch https://github.com/Chamod-Tharusha-Alwis/MediSync.git $Clone
if ($LASTEXITCODE -ne 0) { throw 'CLONE_FAILED' }
Set-Content -LiteralPath (Join-Path $Clone '.git\info\attributes') -Value '** -text' -Encoding ascii
Set-Location $Clone
git sparse-checkout set --no-cone '/*' '!**/.env' '!**/.env.*'
if ($LASTEXITCODE -ne 0) { throw 'SPARSE_CHECKOUT_FAILED' }
git checkout $ReleaseBranch
if ($LASTEXITCODE -ne 0) { throw 'CHECKOUT_FAILED' }
if ((git rev-parse HEAD) -ne $ApprovedSha) { throw 'RELEASE_SHA_MISMATCH' }
if (git status --porcelain) { throw 'CHECKOUT_NOT_CLEAN' }
if (Get-ChildItem -Force -Recurse -File | Where-Object { $_.Name -eq '.env' -or $_.Name -like '.env.*' }) { throw 'ENV_FILE_PRESENT' }
$Forbidden = @('MONGO_URI_TEST','MONGODB_URI_TEST','MONGO_URI_STAGING','SEED_TEST_PASSWORD','JEST_WORKER_ID','SINGLE_INSTANCE_DEV_MODE','MEDISYNC_OFFLINE_ONLY','MEDISYNC_LIVE_BROWSER_APPROVED','MEDISYNC_PUBLIC_DEMO','MEDISYNC_UNIVERSITY_DEMO','ALLOW_SYNTHETIC_DEMO_DIRECTORY','MONGODB_URI','DATABASE_URL')
if (Get-ChildItem Env: | Where-Object { $_.Name -in $Forbidden -or $_.Name -match '^MEDISYNC_(QA_|TEST_|COMBINED_|DEMO_)' }) { throw 'FORBIDDEN_SESSION_VARIABLE_PRESENT' }
Set-Location (Join-Path $Clone 'server')
npm ci
if ($LASTEXITCODE -ne 0) { throw 'NPM_CI_FAILED' }
~~~

Forbidden names must be absent even if empty/false. Runtime quarantine: productionRuntimePolicy.js:5-17; operatorDatabaseMode.js:12 additionally rejects ambiguous URI aliases. All remaining production Node commands run in this clone's server directory. Scripts load server/.env if present; never create one.

## 2 — private session configuration and OFFLINE preflight

No secret files, transcript, screenshots, chat values or secret command-line arguments. Values remain in process memory and the approved secret manager only. Close the session afterward.

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
# Set attestations ONLY after personally verifying their truth:
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

MONGO_URI: exact SRV medisync.p7hjket.mongodb.net / medisync_prod, TLS, admin authentication, SCRAM-SHA-256, primary reads, majority writes. Never test. REDIS_URL for --connect must be authenticated rediss:// with valid certificates. ENCRYPTION_KEYS is an approved 32-byte-key dictionary; ACTIVE_KEY_VERSION selects the version. INTERNAL_API_KEY must match ML. Use distinct strong JWT/session/internal secrets; the length check does not measure entropy.

operatorKeyPolicy.js:68-86 reads MEDISYNC_PROTOTYPE_MODE, MEDISYNC_ALLOW_OPERATOR_KEYS, VAULT_TOKEN, ENCRYPTION_KEYS and ACTIVE_KEY_VERSION. app.js:60-71 uses that dictionary. ENCRYPTION_KEY and ENCRYPTION_KEY_1 are NOT forbidden by productionRuntimePolicy; omit both here. ENCRYPTION_KEY_1 is ignored. Singular ENCRYPTION_KEY is required only in the separate Vault boot path (app.js:85-86), not the operator-key branch. Never use VAULT_TOKEN=bypass.

### Actual variable consumers and key consistency

- ENCRYPTION_KEYS and ACTIVE_KEY_VERSION are required by operatorKeyPolicy.js:80-86. app.js:65-69 validates them, then sets global.ENCRYPTION_KEYS, global.ACTIVE_KEY_VERSION and global.ENCRYPTION_KEY. Bootstrap now calls the SAME policy through loadBootstrapEncryption on every production invocation, replacing stale globals and rejecting missing/known-default keys before connecting. No singular/test/default production fallback is used. Preserve the approved existing dictionary; do not confuse Atlas credential rotation with encryption-key rotation.
- The six model schemas register LAZY constructor defaults: default: () => global.ACTIVE_KEY_VERSION || 1 (Patient:42, Consultation:29, Doctor:41, Prescription:47, LabTest:153, TestOrder:31). Requiring a model creates this function; it does NOT read/capture the version then. versionedEncryption.js:11-20 registers fields and :83-96 methods/hooks without reading keys. On save/encrypt, :23-27 reads global.ENCRYPTION_KEYS and :36 reads global.ACTIVE_KEY_VERSION; NODE_ENV/ENCRYPTION_KEY are only an explicit test fallback. On decrypt, it uses the stored document keyVersion. fieldEncryption.js itself reads no environment/global key values; its legacy delegate has the same lazy key lookup. nicBlindIndex.js reads NO env/global secret; its HMAC keys are explicit arguments.
- Cold isolated-registry tests start with NO key globals, a production environment containing versions 1 and 2, and active version 2, then repeat with active version 1. Actual inert bootstrap saves must use the selected version and decrypt with only its key; substituting the other version's key cannot recover plaintext. All six constructor defaults are checked; TestOrder has an explicitly separate inert save because bootstrap does not create TestOrder. Because the globals are read lazily, a top-level CLI-only key initializer is unnecessary; the function-level reload covers programmatic callers too.
- The current operator-key backend initializes a LEGACY NIC/field runtime (app.js:147-152; securityRuntime.js:19). Legacy NIC lookup uses unkeyed SHA-256 (nicPersistence.js:6-11); there is NO extra NIC blind-index secret in this profile. Do not invent NIC/HMAC environment variables or claim keyed HMAC/GCM has been enabled. Migration profiles need their own separate keys/configuration and approval.
- JWT_SECRET/JWT_REFRESH_SECRET are read by authentication and token refresh (authController.js:454-455,1690-1699). INTERNAL_API_KEY is consumed by the ML service boundary. CLIENT_URL is the actual CORS/origin value (clientOriginPolicy.js:4-7) and is also used in application links.
- SESSION_SECRET is UNUSED by the deployed server runtime: no server/src consumer exists. It remains REQUIRED by the existing preflight length check at preflightProduction.js:91, preserved for compatibility rather than falsely described as active Express-session signing. Do not remove that check without separate review.
- CORS_ORIGIN is UNUSED by server runtime and preflight. The setting above is a compatibility/no-op value; actual CORS uses CLIENT_URL. The older RELEASE_ENV_CONTRACT.md descriptions of SESSION_SECRET/CORS_ORIGIN do not prove consumers. ENCRYPTION_KEY_1 is also unused in this selected profile.
- NODE_ENV, the live-start/rotation and operator-mode flags, MONGO_URI and REDIS_URL are admission inputs. ML_ENGINE_URL and PORT are runtime configuration. No additional encryption or blind-index secret is required for this LEGACY operator profile.

expected: eight [PASS] offline gates.
expected: [PREFLIGHT OFFLINE COMPLETE] All offline policy gates passed.

**Mode selection:** provision/bootstrap default production selects ONLY MONGO_URI, NODE_ENV=production, clinical mode, truthful MEDISYNC_LIVE_START_APPROVED=true and MEDISYNC_ATLAS_ROTATION_CONFIRMED=true. Explicit --qa selects ONLY MONGO_URI_TEST, NODE_ENV=test, MEDISYNC_QA_BOOTSTRAPPED=true and MEDISYNC_QA_CREDENTIALS_ROTATED=true, exact qa-project-medisync.gwprp27.mongodb.net / medisync_automated_test and sole readWrite@medisync_automated_test. QA rejects production attestation names even when false. Mixed URI names fail before credential reads. This production runbook NEVER uses --qa/QA variables. QA credential rotation remains NOT_VERIFIED beyond operator attestation.

## 3 — separately authorized initial read-only preflight and legacy backup

~~~powershell
node scripts/preflightProduction.js --connect
if ($LASTEXITCODE -ne 0) { throw 'INITIAL_CONNECT_PREFLIGHT_FAILED' }
~~~

Revised --connect checks exact target/TLS/role, calls boot's SAME verifyProductionIdentity and verifyProductionStorage, reads only the Admin existence projection with {isActive:true,isSuperAdmin:true}, performs a bounded TLS Redis PING, then disconnects owned clients. No clinical reads, fixtures, DDL, provider calls, HTTP listeners or Redis data writes.

expected: [PASS] Identity verified: db=medisync_prod, users=1, roles=[{"role":"readWrite","db":"medisync_prod"}]
expected: [PASS] Strict runtime storage verified: collections=28, indexes=65, transactionTopologyVerified=true (without optional reminder flags).
expected: [PASS] Active super-admin exists: isActive=true, isSuperAdmin=true
expected: [PASS] TLS Redis PING: PONG (no data commands)
expected: [PREFLIGHT CONNECT COMPLETE] All read-only probes finished successfully.

Missing storage/admin FAILS even this initial check. Stop and record failure. For absent prerequisites, obtain a separate additive-repair authorization before resuming Step 4; that does not confer merge eligibility. The FINAL repeat must pass every check. Never bypass identity/target/credential failures.

Legacy backup needs separate approval: FIRST create a **TEMPORARY Atlas database user** with built-in role **read on database test ONLY**. No readWrite/readAnyDatabase/dbAdmin/admin roles. Delete it immediately after the backup attempt, including failure; record deletion. These are operator instructions, not Codex account operations. Never use compromised/application credentials.

Pre-protect the private backup parent with operator-only NTFS permissions outside OneDrive/Git. Database Tools securely prompts without echo when --username is provided without --password; no password is embedded in URI/arguments.

~~~powershell
$BackupRoot = Join-Path $env:LOCALAPPDATA ("MediSync\private-backups\legacy-test-" + (Get-Date -Format yyyyMMdd_HHmmss))
$BackupUser = Read-Host 'Temporary Atlas read@test-only backup username'
mongodump --uri 'mongodb+srv://medisync.p7hjket.mongodb.net/test?tls=true&authSource=admin' --username $BackupUser --authenticationMechanism SCRAM-SHA-256 --db test --out $BackupRoot
if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $BackupRoot 'test'))) { throw 'LEGACY_BACKUP_FAILED_DELETE_TEMP_USER' }
# Operator: delete the temporary Atlas user now, including after failure.
~~~

Encrypt/verify the backup via the approved recovery system and record location privately. It is NOT a medisync_prod recovery snapshot. Never publish it, restore it into production or alter/delete test.

## 4 — approved provisioning/bootstrap and FINAL pre-merge check

Keep services held and other writers idle. Preserve the approved medisync_prod recovery point. Review exact options/identities before separate apply approval. Provision/bootstrap dry-runs connect but must not write. No migration or blanket cleanup.

~~~powershell
node scripts/provisionProductionStorage.js
if ($LASTEXITCODE -ne 0) { throw 'PROVISION_DRY_RUN_FAILED' }
# STOP: inspect exact additions/options and obtain apply authorization.
node scripts/provisionProductionStorage.js --apply
if ($LASTEXITCODE -ne 0) { throw 'PROVISION_APPLY_FAILED' }
node scripts/provisionProductionStorage.js --verify
if ($LASTEXITCODE -ne 0) { throw 'PROVISION_VERIFY_FAILED' }
foreach ($Name in @('BOOTSTRAP_ADMIN_PASSWORD','BOOTSTRAP_DOCTOR_PASSWORD','BOOTSTRAP_HOSPITAL_PASSWORD','BOOTSTRAP_PHARMACY_PASSWORD','BOOTSTRAP_PATIENT_PASSWORD')) { Read-SessionSecret $Name }
node scripts/bootstrapSyntheticAccounts.js
if ($LASTEXITCODE -ne 0) { throw 'BOOTSTRAP_DRY_RUN_FAILED' }
# STOP: inspect synthetic plan and obtain apply authorization.
node scripts/bootstrapSyntheticAccounts.js --apply
if ($LASTEXITCODE -ne 0) { throw 'BOOTSTRAP_APPLY_FAILED' }
# MANDATORY after BOTH tools and BEFORE merging:
node scripts/preflightProduction.js --connect
if ($LASTEXITCODE -ne 0) { throw 'FINAL_PREMERGE_PREFLIGHT_FAILED' }
~~~

Provisioning is additive: audit capped size 104857600/max 100000, OTP expiresAt TTL 0, strict unique/sparse/compound-order checks. Never drop/recreate/alter incompatible storage. Default requirements: 28 collections/65 indexes; 29/66 only when BOTH MEDISYNC_BACKGROUND_JOBS_APPROVED=true and MEDISYNC_REMINDER_DISPATCH_APPROVED=true are separately approved. This procedure does not set those optional flags.

Bootstrap disables autoCreate/autoIndex before models/connection and creates an active super-admin. In production --apply, ALL FIVE BOOTSTRAP_*_PASSWORD values must have at least 12 characters; use unique strong passwords meeting the existing complexity and bcrypt byte-length policy too. Too-short/missing values fail before connection. Dry-run still permits absent passwords and performs no writes; the separately admitted QA length threshold remains unchanged. Bootstrap validates operator keys before creating documents, even though model registration occurs earlier: key defaults/hooks are lazy, as proved by cold-start versions 2 and 1. It never elevates/reactivates existing accounts or saves/renews/replaces existing prescriptions. Incompatible baseline stops before saves. New records share one transaction. Unknown commit, abort failure or shutdown failure means STOP/investigate, not blind retry. --passwords-from-env does not exist; use documented variables.

expected: [DRY-RUN COMPLETE] No changes were written to the database.
expected: [APPLY COMPLETE] All missing collections and indexes created additively.
expected: [VERIFY PASS] Database storage is 100% compliant with productionStorageManifest.json.
expected: [BOOTSTRAP PROCESS COMPLETED]
expected: final preflight prints EVERY Step 3 PASS line and exits 0. Partial success does not permit merge.

### Empty-database recovery — NEW medisync_prod only

This exception is for a separately authorized operator after provision --apply or --verify failed midway, BEFORE bootstrap, application startup or any document write. It is never a recovery procedure for an established/nonempty database. It never applies to test or QA.

Require a saved read-only BEFORE inventory proving the new medisync_prod was empty, an exclusive provisioning window, and reliable evidence of which collections THIS attempt successfully created. A console line saying Creating collection is printed BEFORE creation and is not success/ownership evidence. If ownership, the empty starting state, or absence of other writers cannot be proved, STOP; do not guess a collection list or delete anything.

Enter ONLY the verified tool-created collection names below. The read-only check pins the host/database before connection, verifies the sole readWrite@medisync_prod role, rejects views, requires the database's COMPLETE collection set to equal that list, and stops on any document or metadata error. It performs no drop/delete/create/index operation. Run from the clean clone's server directory/session, using the private current-session MONGO_URI, under separate read-only authorization.

~~~powershell
$env:MEDISYNC_RECOVERY_CREATED_COLLECTIONS = Read-Host 'Verified tool-created collection names, comma-separated; no guesses'
$RecoveryCheck = @'
let u;try{u=new URL(process.env.MONGO_URI||'');}catch(_){throw Error('STOP_URI_INVALID');}
const requested=u.pathname.slice(1);
print('Database requested: '+(['medisync_prod','test','medisync_automated_test'].includes(requested)?requested:'UNAPPROVED'));
if(u.protocol!=='mongodb+srv:'||u.hostname!=='medisync.p7hjket.mongodb.net'||u.pathname!=='/medisync_prod')throw Error('STOP_TARGET_NOT_MEDISYNC_PROD');
const target=require(process.cwd()+'/scripts/operatorDatabaseMode.js').selectOperatorDatabase(process.env,false);
const names=(process.env.MEDISYNC_RECOVERY_CREATED_COLLECTIONS||'').split(',').map(s=>s.trim()).filter(Boolean).sort();
if(!names.length||names.length>29||new Set(names).size!==names.length||names.some(n=>!/^[_a-zA-Z][_a-zA-Z0-9]{0,119}$/.test(n)))throw Error('STOP_CREATED_COLLECTION_LIST_INVALID');
let d;try{d=connect(target.uri);}catch(_){throw Error('STOP_CONNECTION_FAILED');}
if(d.getName()!=='medisync_prod')throw Error('STOP_CONNECTED_DATABASE_MISMATCH');
const auth=d.runCommand({connectionStatus:1});
if(auth.ok!==1||!Array.isArray(auth.authInfo?.authenticatedUsers)||auth.authInfo.authenticatedUsers.length!==1||!Array.isArray(auth.authInfo?.authenticatedUserRoles)||auth.authInfo.authenticatedUserRoles.length!==1||auth.authInfo.authenticatedUserRoles[0].role!=='readWrite'||auth.authInfo.authenticatedUserRoles[0].db!=='medisync_prod')throw Error('STOP_ROLE_UNVERIFIED');
const rows=d.getCollectionInfos();
if(rows.some(r=>r.type!=='collection')||JSON.stringify(rows.map(r=>r.name).sort())!==JSON.stringify(names))throw Error('STOP_UNEXPECTED_COLLECTION_SET');
for(const n of names){const count=d.getCollection(n).countDocuments({}, {limit:1,maxTimeMS:5000});print('Collection '+n+' documents='+count);if(count!==0)throw Error('STOP_NONEMPTY_COLLECTION');}
print('READ_ONLY_EMPTY_SET_VERIFIED; manual deletion still requires collection-ownership evidence and separate authorization.');
'@
try {
    mongosh --nodb --quiet --eval $RecoveryCheck
    if ($LASTEXITCODE -ne 0) { throw 'EMPTY_DATABASE_RECOVERY_CHECK_FAILED' }
} finally { Remove-Item Env:MEDISYNC_RECOVERY_CREATED_COLLECTIONS -ErrorAction SilentlyContinue }
~~~

expected: Database requested: medisync_prod
expected: Collection <each verified tool-created name> documents=0
expected: READ_ONLY_EMPTY_SET_VERIFIED; manual deletion still requires collection-ownership evidence and separate authorization.

Only after every check passes AND separate recovery authorization: in Atlas Data Explorer select the exact existing cluster/database medisync_prod and delete ONLY the verified, still-empty, tool-created collections individually. Do NOT use dropDatabase, automatic script cleanup, broad selection, or delete anything in test. Keep writers idle and recheck emptiness immediately before manual deletion; the earlier read-only result cannot prevent concurrent writes. If state changes, STOP. Then rerun the provisioning dry-run, inspect its plan, obtain apply authorization, run --apply then --verify, and require the final strict preflight again. Bootstrap additionally requires the reviewed key-consistent release and separate synthetic-write authorization.

### Five synthetic login identifiers and URLs

These are default bootstrap identities ONLY, not proof they exist. BOOTSTRAP_*_EMAIL overrides change the identifiers; use the reviewed actual plan. No passwords are documented. All five default addresses cannot receive mail.

| Role | Default login identifier | Frontend login URL |
|---|---|---|
| Super-admin | admin.synth@medisync.synthetic | https://medisync.chamodtharusha.com.lk/admin/login |
| Doctor (personal login) | doctor.synth@medisync.synthetic | https://medisync.chamodtharusha.com.lk/doctor/login |
| Patient | patient.synth@medisync.synthetic | https://medisync.chamodtharusha.com.lk/patient/login |
| Pharmacist | pharmacist.synth@medisync.synthetic | https://medisync.chamodtharusha.com.lk/pharmacy/login |
| Hospital administrator | hospital.synth@medisync.synthetic | https://medisync.chamodtharusha.com.lk/hospital/login |

The patient API also accepts synthetic NIC 199512345678; doctor ID DOC-SYNTH-001 and hospital registration HOSP-SYNTH-001 are API alternatives. Use the emails above in the browser forms. PHARM-SYNTH-001 identifies the pharmacy organization, not its staff login. App.js routes :142-148 and authController.js:201-254 are source evidence, not executed login receipts.

## 5 — ALL environments saved BEFORE merge; ML first

Operator only after gates. Recheck/report branch, Auto-Deploy, root and Dockerfile/context. If Auto-Deploy is On Commit/After CI Checks Pass, save ALL Render variables BEFORE main merge: ML first, backend second, then Vercel. Check inherited environment-group NAMES without exposing values.

| Target | Names/nonsecret settings |
|---|---|
| ML | INTERNAL_API_KEY matching backend; Render PORT; PYTHONPATH=.; no Atlas/Redis/provider secrets. |
| Backend | NODE_ENV=production; MEDISYNC_DEPLOYMENT_MODE=clinical; MEDISYNC_PROTOTYPE_MODE=true; MEDISYNC_ALLOW_OPERATOR_KEYS=true; truthful MEDISYNC_LIVE_START_APPROVED=true and MEDISYNC_ATLAS_ROTATION_CONFIRMED=true; MONGO_URI; REDIS_URL; ENCRYPTION_KEYS; ACTIVE_KEY_VERSION=1; JWT_SECRET; JWT_REFRESH_SECRET; SESSION_SECRET; INTERNAL_API_KEY; CLIENT_URL; CORS_ORIGIN; ML_ENGINE_URL; Render PORT. |
| Approved optional providers | RESEND_API_KEY/RESEND_FROM_ADDRESS; BREVO_API_KEY/BREVO_FROM_ADDRESS; CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET. Verify sender/upload access separately. |
| Vercel Production | REACT_APP_API_URL=https://medisync-wabc.onrender.com/api; REACT_APP_SERVER_URL=https://medisync-wabc.onrender.com; approved public REACT_APP_CARTO_API_KEY; optional REACT_APP_GA_MEASUREMENT_ID. No backend secrets. |

Prefer Render Save only, followed by approved NEW-commit deployment immediately after merge. Save and deploy/rebuild before main changes redeploys OLD code. If Save only is unavailable, coordinate save and new-code deployment back to back. An old-code restart is not verification. Codex does not resume services.

## 6 — PR base/main and separate merge approval

Only after final preflight/environment gates: operator edits existing PR #5 base to main, confirms the PR page says release/medisync-v1-final-integration INTO main, reviews full diff/exact-head CI and obtains merge approval. Do not assume the original base chore/safe-localhost-development changed. Opening a replacement PR also needs separate approval. Codex has made no PR changes.

Record the actual merged main SHA from GitHub; merge/squash may differ from release head. No direct main push; CI-green alone does not authorize merge.

## 7 — deploy the MERGED SHA, not 64abeaa

Operator checks Vercel Production Source/Build Logs and each Render Events/Deploys entry. Render initial checkout/build log (Checking out commit ... in branch main) and commit link/details MUST identify the approved full NEW main SHA, not 64abeaa / 64abeaac17cf8bd4bab23812ed02268c73b2e8db. Green service status alone is insufficient.

expected: ML, backend and Vercel source/deploy details show the approved NEW merged main SHA.

If Render does not auto-deploy (Off/filters/no qualifying check): existing service > Manual Deploy > Deploy a specific commit > paste NEW merged SHA > Deploy Commit. ML first, verify it, then backend. Deploy latest commit is allowed only when verified main HEAD equals intended SHA. Record Auto-Deploy behavior afterward. Suspended-service resume needs separate operator approval. Restart is not a new-code deploy.

## 8 — source-derived boot diagnostics

All following lines are expected, not captured hosted output. production.js:20 masks exceptions with generic fatal; internal codes may not appear in hosted logs.

| Condition | Expected diagnostic / correction |
|---|---|
| Operator keys | expected: [SECURITY WARNING] MEDISYNC_PROTOTYPE_MODE active: Booting with operator-supplied encryption keys. Vault bypassed for prototype only. (app.js:70). This is not completed boot. |
| Missing secret/key | expected: preflight [FAIL] with OPERATOR_KEY_ERROR or missing secret NAMES. Correct private values/active version; no bypass. |
| Rejected variable | expected: PRODUCTION_RUNTIME_QA_MATERIAL_FORBIDDEN / OPERATOR_DATABASE_MIXED_ENVIRONMENT. Remove conflicting names, including inherited empty/false names. |
| General exception | expected: [FATAL] Production server failed to start. Check admission and dependency configuration. Inspect earlier sanitized diagnostics/preflight. |
| Redis | expected: [Redis] Connected successfully. Failure may give internal SECURITY_STORE_UNAVAILABLE/generic fatal. Preflight REDIS_AUTHENTICATION_REQUIRED / PREFLIGHT_REDIS_TLS_REQUIRED / PREFLIGHT_REDIS_UNAVAILABLE: check TLS/auth/certificate/network, no memory fallback. |
| Atlas target/connection | expected: DB connection failed: PRODUCTION_ATLAS_URI_INVALID / PRODUCTION_EXISTING_CLUSTER_AND_DATABASE_REQUIRED; preflight PREFLIGHT_ATLAS_CONNECTION_UNAVAILABLE. Verify exact target, rotated credentials and approved egress; never redirect to test. |
| Role/storage | expected: DB connection failed: [FATAL][DB-GUARD] Production identity or storage prerequisites were not verified. Inspect exact preflight role/storage code; never weaken admission. |
| Admin | expected: PREFLIGHT_ACTIVE_SUPER_ADMIN_REQUIRED / PREFLIGHT_BOOT_ADMIN_UNVERIFIED; boot internally requires Approved operator account provisioning is required before live startup (app.js:192). Use reviewed bootstrap, never remove predicate. |
| Old Vault path | expected: [FATAL] Vault is required in production environments. Verify NEW SHA and both operator/prototype flags; old 64abeaa cannot validate the new path. |

## 9 — ML health, backend health, then authorized synthetic smoke

Only after NEW deployments finish. No login/clinical writes until separately approved smoke scope.

~~~powershell
$MlHealth = Invoke-WebRequest -Uri 'https://medisync-ml-service.onrender.com/health' -TimeoutSec 30
if ($MlHealth.StatusCode -ne 200 -or ($MlHealth.Content | ConvertFrom-Json).status -ne 'ready') { throw 'ML_NOT_READY' }
Write-Output "captured [$Stamp] ML HTTP $($MlHealth.StatusCode): $($MlHealth.Content)"
$ApiHealth = Invoke-WebRequest -Uri 'https://medisync-wabc.onrender.com/health' -TimeoutSec 30
if ($ApiHealth.StatusCode -ne 200 -or ($ApiHealth.Content | ConvertFrom-Json).status -ne 'ready') { throw 'API_NOT_READY' }
Write-Output "captured [$Stamp] backend HTTP $($ApiHealth.StatusCode): $($ApiHealth.Content)"
~~~

expected: ML HTTP 200 with status ready and clinicalValidation not_established.
expected: Backend HTTP 200 with {"status":"ready","service":"medisync-express"}.
expected: 404 means old/wrong routing; 503 means unavailable dependencies/references/admission. STOP before login/writes.

Follow RELEASE_SMOKE_TEST.md using owned synthetic records only. New accounts default twoFactorEnabled:false, so ordinary login has NO OTP-entry step. If actual device/account state requires an unavailable factor, stop; no bypass. Synthetic addresses cannot receive mail. Real email is needed for invitations, reset/recovery, 2FA, revoked-device verification, consent/report-access OTP, notifications, security alerts and reminders.

**Actual PDF behavior:** prescription SECURITY_HOLD is caught as HTTP 500 {"error":"Failed to generate PDF"} (prescriptionController.js:123-125; pdfGenerator.js:306-307), NOT 503 {"code":"PDF_EXPORT_UNAVAILABLE"}. Patient/doctor lab stored-report routes give 503 {"message":"Stored laboratory report unavailable"} without a path, 503 {"message":"Lab report unavailable. Please try again later."} on download failure, and outer 500 on other errors (labController.js:1052-1075,1264-1287). Authorized stored lab PDFs can be delivered when retrieval succeeds (services/labReportStorage.js:18-29): no uniform PDF_EXPORT_UNAVAILABLE hold exists. Disabled UI is not an API hold. Keep PDF delivery outside this smoke scope pending separate review; no controller/security patch is included here.

## 10 — rollback and close secret-bearing session

Operator re-suspends existing Render backend/ML. Vercel medi-sync > Deployments > recorded known-good PRODUCTION deployment > Rollback/Promote to Production; verify source/domain. No invented ID, automatic Git revert/push or unreviewed preview promotion.

Database recovery needs a separately reviewed medisync_prod snapshot/scope. FIRST print requested DB and refuse anything except medisync_prod, then verify connected DB. This is read-only; it does not restore anything:

~~~powershell
$RollbackGuard = 'const u=process.env.MONGO_URI; if(!u)throw Error("MONGO_URI_REQUIRED"); const n=new URL(u).pathname.slice(1); print("Database requested: "+n); if(n!=="medisync_prod")throw Error("STOP_DATABASE_NOT_MEDISYNC_PROD"); const d=connect(u); print("Database connected: "+d.getName()); if(d.getName()!=="medisync_prod")throw Error("STOP_DATABASE_NOT_MEDISYNC_PROD"); print("No writes performed; separately approved recovery plan required.");'
mongosh --nodb --quiet --eval $RollbackGuard
if ($LASTEXITCODE -ne 0) { throw 'ROLLBACK_DATABASE_GUARD_FAILED' }
~~~

expected: Database requested: medisync_prod
expected: Database connected: medisync_prod
expected: No writes performed; separately approved recovery plan required.

Never drop/recreate/blanket-clean, restore legacy backup into production, or modify/restore/delete test. A test dump cannot roll back medisync_prod. Delete temporary backup user, retain encrypted evidence privately and close the secret-bearing shell.

## Captured evidence and unverified boundaries

Captured run CODEX_GATE3_COMMIT_1793078142937, cf4a24cb9ac8d4dea4387b19f7c66b6d698ee65b, clean clone outside OneDrive, Node v24.22.1, local Python 3.12.14:

captured: three new Gate 3 suites 156 PASS; provisioning/bootstrap 9 PASS; exit 0 each.
captured: full offline profile 1826 PASS: backend 1423, client 305, email/PDF 31, ML scoring 40, Flask 14, root 13; exit 0. Focused counts overlap.
captured: security profile and client production build exit 0; build compiled with warnings. Source frozen; 15 protected expectations intact.
captured: GitHub push runs 40454977840 and 40454977871 SUCCESS; existing PR-triggered runs 40454984900 and 40454984940 SUCCESS for that head. No PR edits. GitHub uses Node 24/Python 3.11; local Python difference is explicit.
captured: Vercel GitHub status SUCCESS, description Deployment has completed. That status alone does not identify Production/Preview; no explicit deployment/settings operation occurred.
captured: additional UNCOMMITTED preflight candidate: 424/424 focused and 1441/1441 broader backend checks PASS, exit 0, using Node 24 with inert transports. These are not results for the already pushed commit. Initial 423 PASS/1 FAIL is preserved; the test fixture was corrected to supply distinct authentication and topology responses without weakening storage assertions.

Both workflows install locked root/server/client dependencies and run node scripts/run_offline_tests.js with MEDISYNC_OFFLINE_CI=true. Security adds MEDISYNC_OFFLINE_PROFILE=security. Full CI creates Python 3.11 venv, installs requirements, runs pip check and the boundary-preloaded client build. Exact workflow bytes, Windows commands/exits and all receipts are under docs/temp/CODEX_GATE3_COMMIT_1793078142937. Workflow names do not imply live E2E.

The earlier delayed-exit warning is Jest's one-second asynchronous-cleanup diagnostic at CODEX_GATE3_FINAL_20261027_011654/CODEX_backend_acceptance.log:264, NOT Docker boot. Fresh-clone full --detectOpenHandles passed 1423/1423, exit 0, openHandles:[], without reproducing it. Its historical exact resource/cause remains NOT_VERIFIED; do not claim a repair. Old dummy-only Docker boot instead logged the operator-key warning, PRODUCTION_ATLAS_URI_INVALID, exit 1 and NO production health response. Separate handler-only HTTP 503 was not successful application boot.

Historical client audit: 54 findings (3 critical,31 high,10 moderate,10 low), exit 1. Historical ML installed-image audit: 59 packages, zero known advisories, 19 tests passed; no new Docker/image audit here. Live Atlas/Redis, hosted settings/health, real transactions/providers/recovery and current-source five-role E2E remain unverified. Historical real backend acceptance remains 2/14; clinical production NO-GO.

STOP before database access, merge or deployment. This runbook grants none of those operations; source commit/push approval is a separate scope.
