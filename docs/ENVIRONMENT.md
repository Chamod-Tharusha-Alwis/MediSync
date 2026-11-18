# Environment variables

**Names only.** No value is written here; never commit `.env` files.

This list was generated on 2026-11-18 at commit `f5337833` by scanning the runtime code (`server/src`,
`client/src`, `client/scripts`, `ml-engine/*.py`) for `process.env.X`, `env.X` and `os.environ` reads. It is
merged with the "Required" column of [`RELEASE_ENV_CONTRACT.md`](RELEASE_ENV_CONTRACT.md), which also
describes the production checks for each variable in more detail.

- **Default:** the literal fallback written in code, if any. For secret-like names the value is never shown.
- **Required:** from the release contract where listed. Otherwise "Optional" (the code has a fallback or
  skips the feature), or "Tests / QA / seeding only".

| Name | Used by | What it does | Default in code | Required | Read in |
|---|---|---|---|---|---|
| `ACTIVE_KEY_VERSION` | server | Which key version in ENCRYPTION_KEYS encrypts new data | - | Yes | `server/src/security/operatorKeyPolicy.js` |
| `ADMIN_PASSWORD` | server | See the files listed | - | Tests / QA / seeding only | `server/src/utils/seedAdmin.js` |
| `ALLOW_SYNTHETIC_DEMO_DIRECTORY` | server | See the files listed | - | Optional | `server/src/controllers/publicController.js` |
| `APP_URL` | server | Public app URL used in some links | - | Optional | `server/src/utils/emailService.js` |
| `BABEL_ENV` | client | See the files listed | - | Tests / QA / seeding only | `client/scripts/buildClinical.cjs` |
| `BOOTSTRAP_ADMIN_PASSWORD` | contract only | Described in RELEASE_ENV_CONTRACT.md | - | Yes (at setup) |  |
| `BOOTSTRAP_DOCTOR_PASSWORD` | contract only | Described in RELEASE_ENV_CONTRACT.md | - | Yes (at setup) |  |
| `BOOTSTRAP_HOSPITAL_PASSWORD` | contract only | Described in RELEASE_ENV_CONTRACT.md | - | Yes (at setup) |  |
| `BOOTSTRAP_PATIENT_PASSWORD` | contract only | Described in RELEASE_ENV_CONTRACT.md | - | Yes (at setup) |  |
| `BOOTSTRAP_PHARMACY_PASSWORD` | contract only | Described in RELEASE_ENV_CONTRACT.md | - | Yes (at setup) |  |
| `BREVO_API_KEY` | server | Brevo provider key (backup email) | a literal default exists in code (not shown) | Optional | `server/src/controllers/adminController.js`, `server/src/utils/emailService.js` |
| `BREVO_DAILY_FREE_LIMIT` | server | Brevo free-tier daily limit | `300` | Optional | `server/src/utils/emailService.js` |
| `BREVO_FROM_ADDRESS` | server | Sender for Brevo | a sender address (not shown) | Optional | `server/src/utils/emailService.js` |
| `CLIENT_URL` | ml-engine, server | Exact origin of the web client (CORS) | `'http://localhost:3000'` / `'https://medisync.chamodtharusha.com.lk'` | Yes | `ml-engine/app.py`, `server/src/controllers/adminController.js`, `server/src/controllers/authController.js`, `server/src/controllers/hospitalController.js` +6 |
| `CLOUDINARY_API_KEY` | server | Cloudinary key | - | Optional | `server/src/controllers/labController.js`, `server/src/utils/cloudinary.js` |
| `CLOUDINARY_API_SECRET` | server | Cloudinary secret | - | Optional | `server/src/controllers/labController.js`, `server/src/utils/cloudinary.js` |
| `CLOUDINARY_CLOUD_NAME` | server | Cloudinary account (profile images) | - | Optional | `server/src/controllers/labController.js`, `server/src/utils/cloudinary.js` |
| `COOKIE_DOMAIN` | contract only | Described in RELEASE_ENV_CONTRACT.md | - | Optional |  |
| `CORS_ORIGIN` | contract only | Described in RELEASE_ENV_CONTRACT.md | - | No — unused |  |
| `DAILY_EMAIL_CAP` | server | Daily outbreak email cap (default 100) | - | Optional | `server/src/services/alertReminderService.js`, `server/src/services/outbreakDetailedDelivery.js`, `server/src/utils/emailService.js` |
| `DISPENSE_EMAIL_MEDICINE_NAMES` | server | `false` hides medicine names in patient medication emails | - | Optional | `server/src/services/medicationUpdateEmail.js` |
| `EMAIL_BACKUP_PROVIDER` | server | Backup email provider name | `'brevo'` | Optional | `server/src/utils/emailService.js` |
| `EMAIL_DAILY_CAP` | server | Alias of DAILY_EMAIL_CAP | - | Optional | `server/src/services/alertReminderService.js`, `server/src/services/outbreakDetailedDelivery.js`, `server/src/utils/emailService.js` |
| `EMAIL_SERVICE_LIVE_TEST` | server | See the files listed | - | Tests / QA / seeding only | `server/src/utils/emailService.js` |
| `ENCRYPTION_KEY` | server | Single key used by the Vault/test fallback paths and the local stack | a literal default exists in code (not shown) | Optional | `server/src/app.js`, `server/src/controllers/authController.js`, `server/src/security/legacyFieldEncryption.js`, `server/src/services/labReportStorage.js` +6 |
| `ENCRYPTION_KEYS` | server | JSON map of field-encryption key versions (operator-key mode) | - | Yes | `server/src/security/operatorKeyPolicy.js` |
| `ENFORCE_OTP_THROTTLE` | server | Force OTP throttling in tests | - | Optional | `server/src/config/redis.js` |
| `ENFORCE_STRICT_AUDIT` | server | See the files listed | - | Optional | `server/src/services/clinicalAuditService.js` |
| `FLASK_DEBUG` | ml-engine | ML: Flask debug mode (must be false in production) | `'false'` | Optional | `ml-engine/app.py` |
| `FLASK_ENV` | contract only | Described in RELEASE_ENV_CONTRACT.md | - | Optional |  |
| `FRONTEND_URL` | server | Client URL used in email links | `'https://medisync.chamodtharusha.com.lk'` | Optional | `server/src/services/alertReminderService.js`, `server/src/services/outbreakDetailedEmail.js`, `server/src/services/outbreakEmailBuilder.js`, `server/src/utils/emailService.js` |
| `HOST` | client, server | See the files listed | - | Optional | `client/src/setupProxy.js`, `server/src/security/publicDemoIsolation.js` |
| `INTERNAL_API_KEY` | ml-engine, server | Shared key for API → ML service calls (`x-internal-key`) | a literal default exists in code (not shown) | Yes | `ml-engine/app.py`, `ml-engine/evaluation/eval_common.py`, `ml-engine/test_medication_safety.py`, `ml-engine/test_model_status_contract.py` +4 |
| `JEST_WORKER_ID` | server | See the files listed | - | Tests / QA / seeding only | `server/src/config/dbGuard.js` |
| `JWT_REFRESH_SECRET` | server | Signs 7-day refresh tokens | - | Yes | `server/src/app.js`, `server/src/controllers/authController.js`, `server/src/controllers/pharmacyController.js` |
| `JWT_SECRET` | server | Signs 15-minute access tokens | a literal default exists in code (not shown) | Yes | `server/src/app.js`, `server/src/controllers/authController.js`, `server/src/controllers/patientController.js`, `server/src/controllers/pharmacyController.js` +5 |
| `MEDISYNC_ALLOW_OPERATOR_KEYS` | server | Allows operator-held keys instead of Vault | - | Yes | `server/src/app.js`, `server/src/security/operatorKeyPolicy.js` |
| `MEDISYNC_ATLAS_ROTATION_CONFIRMED` | contract only | Operator attestation that database credentials were rotated | - | Yes |  |
| `MEDISYNC_BACKGROUND_JOBS_APPROVED` | server | Enables background jobs | - | Optional | `server/src/utils/cronJobs.js` |
| `MEDISYNC_CLINICAL_OUTBOX_APPROVED` | server | See the files listed | - | Optional | `server/src/utils/cronJobs.js` |
| `MEDISYNC_CRON_TIMEZONE` | server | Timezone for scheduled jobs (daily scan 02:00) | `'UTC'` | Optional | `server/src/utils/cronJobs.js` |
| `MEDISYNC_DEMO_ATLAS_URI` | server | See the files listed | - | Optional | `server/src/demo/universityRuntime.js` |
| `MEDISYNC_DEMO_CLIENT_ORIGIN` | server | See the files listed | - | Optional | `server/src/demo/universityRuntime.js` |
| `MEDISYNC_DEMO_CREDENTIALS_ROTATED` | server | See the files listed | - | Optional | `server/src/demo/universityRuntime.js` |
| `MEDISYNC_DEMO_MANIFEST_PATH` | server | See the files listed | - | Optional | `server/src/university.js` |
| `MEDISYNC_DEMO_MANIFEST_SHA256` | server | See the files listed | - | Optional | `server/src/demo/universityRuntime.js` |
| `MEDISYNC_DEMO_SIGNING_KEY` | server | See the files listed | - | Optional | `server/src/demo/universityRuntime.js` |
| `MEDISYNC_DEPLOYMENT_MODE` | client, server | See the files listed | - | Optional | `client/scripts/clinicalBuildPolicy.cjs`, `client/src/config/productionClientPolicy.js`, `server/scripts/preflightProduction.js`, `server/src/demo/universityRuntime.js` +2 |
| `MEDISYNC_LIVE_START_APPROVED` | contract only | Operator confirmation required before a production start | - | Yes |  |
| `MEDISYNC_LOCAL_REAL_STACK` | server | See the files listed | - | Tests / QA / seeding only | `server/src/app.js`, `server/src/config/redis.js` |
| `MEDISYNC_ML_ALLOWED_ORIGIN` | server | See the files listed | - | Optional | `server/src/security/publicDto.js` |
| `MEDISYNC_ML_ALLOW_REMOTE_BIND` | ml-engine | See the files listed | - | Optional | `ml-engine/app.py` |
| `MEDISYNC_ML_DB_PATH` | ml-engine | ML: path of the SQLite reference database | - | Optional | `ml-engine/app.py`, `ml-engine/evaluation/eval_common.py`, `ml-engine/test_phase5w_runtime.py`, `ml-engine/test_tiered_matcher.py` |
| `MEDISYNC_ML_QA` | ml-engine | See the files listed | - | Optional | `ml-engine/app.py` |
| `MEDISYNC_OFFLINE_EVIDENCE` | ml-engine | See the files listed | - | Tests / QA / seeding only | `ml-engine/scripts/clinical_offline_tests.py`, `ml-engine/test_model_status_contract.py`, `ml-engine/test_outbreak_ingestion.py`, `ml-engine/test_reference_catalog.py` |
| `MEDISYNC_PROTOTYPE_MODE` | server | Marks the deployment as a synthetic-data prototype | - | Yes | `server/src/app.js`, `server/src/security/operatorKeyPolicy.js` |
| `MEDISYNC_PUBLIC_DEMO` | client, server | See the files listed | - | Optional | `client/scripts/clinicalBuildPolicy.cjs`, `server/src/security/clinicalEntryPolicy.js`, `server/src/security/publicDemoIsolation.js` |
| `MEDISYNC_QA_ATTEMPT_ID` | server | See the files listed | `'5X-E1-R3'` | Tests / QA / seeding only | `server/src/app.js`, `server/src/routes/qaRoutes.js` |
| `MEDISYNC_QA_BOOTSTRAPPED` | server | See the files listed | - | Tests / QA / seeding only | `server/src/app.js`, `server/src/security/qaConnectionAdmission.js` |
| `MEDISYNC_QA_BROWSER_OWNER` | server | See the files listed | - | Tests / QA / seeding only | `server/src/app.js` |
| `MEDISYNC_QA_BROWSER_RUN` | server | See the files listed | - | Tests / QA / seeding only | `server/src/app.js` |
| `MEDISYNC_QA_CREDENTIALS_ROTATED` | server | See the files listed | - | Tests / QA / seeding only | `server/src/security/qaConnectionAdmission.js` |
| `MEDISYNC_QA_MODE` | server | See the files listed | - | Tests / QA / seeding only | `server/src/security/clientOriginPolicy.js` |
| `MEDISYNC_QA_OWNER` | server | See the files listed | `'qa_e1_operator'` | Tests / QA / seeding only | `server/src/routes/qaRoutes.js` |
| `MEDISYNC_REMINDER_DISPATCH_APPROVED` | server | `true` enables the 08:00 follow-up reminder job | - | Optional | `server/src/utils/cronJobs.js` |
| `MEDISYNC_STAGING_MODE` | server | See the files listed | - | Optional | `server/src/config/dbGuard.js` |
| `MEDISYNC_TEST_DISABLE_PDF_LOCK` | server | See the files listed | - | Tests / QA / seeding only | `server/src/utils/pdfSecurity.js` |
| `MEDISYNC_TEST_MODE` | server | `true` captures email instead of sending (tests) | `''` | Tests / QA / seeding only | `server/src/app.js`, `server/src/config/dbGuard.js`, `server/src/controllers/dispensingController.js`, `server/src/security/clientOriginPolicy.js` +1 |
| `MEDISYNC_TEST_TMP` | ml-engine | See the files listed | - | Tests / QA / seeding only | `ml-engine/app.py`, `ml-engine/scripts/clinical_offline_tests.py`, `ml-engine/scripts/seed_platform_contract.py`, `ml-engine/test_reference_catalog.py` |
| `MEDISYNC_UNIVERSITY_DEMO` | server | See the files listed | - | Optional | `server/src/security/clinicalEntryPolicy.js`, `server/src/security/universityDemoPolicy.js` |
| `ML_ENGINE_TIMEOUT_MS` | server | Timeout for ML calls | - | Optional | `server/src/services/mlPredictionService.js` |
| `ML_ENGINE_URL` | server | Base URL of the Flask ML service | `'http://127.0.0.1:5001'` | Yes | `server/src/app.js`, `server/src/controllers/adminController.js`, `server/src/controllers/doctorController.js`, `server/src/controllers/labController.js` +3 |
| `ML_HEALTH_TIMEOUT_MS` | server | Timeout for the ML health check | - | Optional | `server/src/services/mlPredictionService.js` |
| `ML_OUTBREAK_TIMEOUT_MS` | server | Timeout for the scan's ML call (default 60000) | - | Optional | `server/src/services/surveillanceService.js` |
| `ML_RETRY_DELAY_MS` | server | Delay between ML retries | - | Optional | `server/src/services/mlPredictionService.js` |
| `ML_TIMEOUT_MS` | server | Timeout for ML calls | - | Optional | `server/src/services/mlPredictionService.js` |
| `MONGO_URI` | ml-engine, server | MongoDB connection string (production) | - | Yes | `ml-engine/scripts/seed_outbreak_test_scenarios.py`, `server/scripts/preflightProduction.js`, `server/src/app.js`, `server/src/config/db.js` +3 |
| `MONGO_URI_STAGING` | server | See the files listed | - | Tests / QA / seeding only | `server/src/config/dbGuard.js` |
| `MONGO_URI_TEST` | ml-engine, server | MongoDB connection string for QA / local real stack | - | Tests / QA / seeding only | `ml-engine/scripts/seed_outbreak_test_scenarios.py`, `server/src/config/dbGuard.js`, `server/src/security/qaConnectionAdmission.js`, `server/src/utils/seedUniversityDemoDataset.js` |
| `NODE_ENV` | client, server | Runtime mode; production must be `production` | `''` | Yes | `client/scripts/buildClinical.cjs`, `client/src/UniversityApp.jsx`, `client/src/api/axiosInstance.js`, `client/src/config/productionClientPolicy.js` +25 |
| `OUTBREAK_DEMO_EMAIL_ALLOWLIST` | server | Comma-separated addresses allowed to receive demonstration-alert emails | `''` | Optional | `server/src/services/alertReminderService.js`, `server/src/services/outbreakDetailedDelivery.js`, `server/src/services/outbreakNotificationDelivery.js` |
| `OUTBREAK_EMAIL_DELIVERY_ENABLED` | server | Kill switch: `false` blocks every outbreak email | - | Optional | `server/src/services/alertReminderService.js`, `server/src/services/outbreakDetailedDelivery.js`, `server/src/services/outbreakNotificationDelivery.js` |
| `OUTBREAK_MAX_EMAIL_RECIPIENTS` | server | Upper bound on recipients per outbreak email | - | Optional | `server/src/controllers/adminController.js` |
| `PDF_EXPORT_ENABLED` | server | Enables PDF export | - | Optional | `server/src/controllers/labController.js`, `server/src/controllers/prescriptionController.js`, `server/src/utils/pdfGenerator.js` |
| `PORT` | client, ml-engine, server | Port to listen on (Render sets it) | `5001` / `5000` | Yes | `client/src/setupProxy.js`, `ml-engine/app.py`, `server/src/app.js`, `server/src/security/publicDemoIsolation.js` +1 |
| `PYTHONPATH` | contract only | Described in RELEASE_ENV_CONTRACT.md | - | Yes |  |
| `REACT_APP_API_URL` | client | Client: API base path (default `/api`) | `'/api'` | Yes | `client/scripts/clinicalBuildPolicy.cjs`, `client/src/api/axiosInstance.js` |
| `REACT_APP_COMMIT_HASH` | client | See the files listed | - | Optional | `client/scripts/buildClinical.cjs`, `client/src/components/common/Sidebar.jsx`, `client/src/pages/Home.jsx` |
| `REACT_APP_ENVIRONMENT` | contract only | Described in RELEASE_ENV_CONTRACT.md | - | Yes |  |
| `REACT_APP_MEDISYNC_QA` | client | Client: QA mode (local mock) | - | Optional | `client/scripts/clinicalBuildPolicy.cjs`, `client/scripts/universityReleaseContract.cjs`, `client/src/api/axiosInstance.js`, `client/src/config/productionClientPolicy.js` +1 |
| `REACT_APP_PDF_EXPORT_ENABLED` | client | See the files listed | - | Optional | `client/src/utils/pdfDownload.js` |
| `REACT_APP_PROXY_TARGET` | client | Client: proxy target in QA mode | - | Optional | `client/src/setupProxy.js` |
| `REACT_APP_SERVER_URL` | client | Client: server URL for development proxy | `'http://127.0.0.1:5000'` | Optional | `client/scripts/clinicalBuildPolicy.cjs`, `client/src/api/axiosInstance.js`, `client/src/setupProxy.js` |
| `REACT_APP_UNIVERSITY_RUNTIME` | client | See the files listed | - | Optional | `client/src/UniversityApp.jsx`, `client/src/api/axiosInstance.js`, `client/src/components/common/IdleTimer.jsx`, `client/src/components/common/UniversityRuntimeBoundary.jsx` +3 |
| `REDIS_URL` | server | Redis connection (rate limits, OTP lockouts, cache); `rediss://` with a password for remote hosts | - | Yes | `server/src/security/redisConnectionPolicy.js` |
| `RENDER_GIT_COMMIT` | server | See the files listed | - | Optional | `server/src/security/runtimeHealth.js` |
| `RESEND_APIKEY` | server | See the files listed | a literal default exists in code (not shown) | Optional | `server/src/utils/emailService.js` |
| `RESEND_API_KEY` | server | Resend provider key (primary email) | - | Optional | `server/src/controllers/adminController.js`, `server/src/utils/emailService.js` |
| `RESEND_FROM_ADDRESS` | server | Sender for Resend; must be a verified domain (the sandbox default only reaches the account owner) | a sender address (not shown) | Optional | `server/src/utils/emailService.js` |
| `RESEND_KEY` | server | See the files listed | - | Optional | `server/src/utils/emailService.js` |
| `RESEND_SMTP_PASS` | server | See the files listed | a literal default exists in code (not shown) | Optional | `server/src/controllers/adminController.js`, `server/src/utils/emailService.js` |
| `SEED_PATIENT_NIC` | server | See the files listed | - | Tests / QA / seeding only | `server/src/utils/seedUsers.js` |
| `SEED_TEST_PASSWORD` | server | Seeder only: password for synthetic seed accounts (set it; do not rely on the code default) | a literal default exists in code (not shown) | Tests / QA / seeding only | `server/src/utils/seedUniversityDemoDataset.js`, `server/src/utils/seedUsers.js` |
| `SESSION_SECRET` | contract only | Checked by the production preflight script only; unused at runtime | - | Preflight only |  |
| `SINGLE_INSTANCE_DEV_MODE` | server | See the files listed | - | Tests / QA / seeding only | `server/src/config/redis.js` |
| `SKIP_LOGIN_NOTIFICATION` | server | See the files listed | - | Tests / QA / seeding only | `server/src/controllers/authController.js`, `server/src/controllers/pharmacyController.js` |
| `STAGING_PINNED_HOST` | server | See the files listed | - | Tests / QA / seeding only | `server/src/config/dbGuard.js` |
| `STUDY_SKLEARN_PYTHON` | ml-engine | See the files listed | - | Tests / QA / seeding only | `ml-engine/evaluation/study/run_study.py` |
| `VAULT_TOKEN` | server | Vault token (Vault mode) | - | Optional | `server/src/app.js`, `server/src/security/operatorKeyPolicy.js` |
| `VAULT_URL` | server | HashiCorp Vault URL (Vault mode) | `'http://127.0.0.1:8200'` | Optional | `server/src/app.js` |
| `VERCEL_GIT_COMMIT_SHA` | client | See the files listed | - | Optional | `client/scripts/buildClinical.cjs` |
| `VERIFY_OTP_MAX_ATTEMPTS` | server | OTP verification attempts | - | Optional | `server/src/controllers/verificationController.js` |
| `WHO_ICD11_CLIENT_ID` | server | WHO ICD-11 API client id | - | Optional | `server/src/services/whoIcd11Service.js` |
| `WHO_ICD11_CLIENT_SECRET` | server | WHO ICD-11 API secret | - | Optional | `server/src/services/whoIcd11Service.js` |

**Security notes:**
- `SEED_TEST_PASSWORD` has a hard-coded fallback in `server/src/utils/seedUniversityDemoDataset.js:92`.
  Always set it when seeding, and rotate any demo account that was seeded with the fallback.
- The device-trust HMAC in `server/src/controllers/authController.js:33` falls back to a literal only when
  both `JWT_SECRET` and `ENCRYPTION_KEY` are unset. Production requires `JWT_SECRET`.

Last verified: 2026-11-18 at commit f5337833.
