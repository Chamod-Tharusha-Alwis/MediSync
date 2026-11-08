# MediSync Tracked File Inventory & Architectural Guide

> **Total Tracked Files**: 1,129  
> **Protected Ledger Files**: 15 (pinned via SHA-256 in `docs/release/PROTECTED_HASHES.json`)  
> **Classification Criteria**: Runtime production code, dev-only tooling, automated test suites, reference data catalogs, and one-off phase receipts.

---

## Root Directory (12 files)

| Path | LOC | Type | Role | Protected? | Purpose & Key Responsibilities |
|---|:---:|:---:|:---:|:---:|---|
| `.env.example` | 61 | `.example` | runtime | No | ============================================================== |
| `.gitattributes` | 24 | `[none]` | runtime | No | Verbatim byte-level preservation for the 15 cryptographically verified files |
| `.gitignore` | 81 | `[none]` | runtime | No | Node dependency directories |
| `.node-version` | 1 | `[none]` | runtime | No | Application component module |
| `.nvmrc` | 1 | `[none]` | runtime | No | Application component module |
| `ARCHITECTURE.md` | 137 | `.md` | runtime | No | MediSync — System Architecture & Technical Design |
| `CHANGELOG.md` | 31 | `.md` | runtime | No | Changelog |
| `README.md` | 33 | `.md` | runtime | No | MediSync |
| `agent_config.json` | 7 | `.json` | data | No | Configuration / reference data payload for agent_config.json |
| `docker-compose.yml` | 50 | `.yml` | dev-only | No | Application component module |
| `package-lock.json` | 900 | `.json` | data | No | Configuration / reference data payload for package-lock.json |
| `package.json` | 38 | `.json` | data | No | Configuration / reference data payload for package.json |


## Server Architecture (`server/src/`) (204 files)

| Path | LOC | Type | Role | Protected? | Purpose & Key Responsibilities |
|---|:---:|:---:|:---:|:---:|---|
| `server/src/app.js` | 408 | `.js` | runtime | No | ONLY third-party / Node built-ins at the top level. |
| `server/src/config/db.js` | 35 | `.js` | dev-only | No | Application component module |
| `server/src/config/dbGuard.js` | 532 | `.js` | dev-only | YES (PINNED) | Application component module |
| `server/src/config/redis.js` | 685 | `.js` | dev-only | No | Redis OTP Store — Enterprise-grade OTP persistence & throttling |
| `server/src/controllers/accountLanguageController.js` | 14 | `.js` | runtime | No | HTTP controller handling accountLanguage business logic |
| `server/src/controllers/adminController.js` | 1203 | `.js` | runtime | No | HTTP controller handling admin business logic |
| `server/src/controllers/alertController.js` | 95 | `.js` | runtime | No | Legacy push endpoints cannot bypass provenance or administrator review. |
| `server/src/controllers/analyticsController.js` | 133 | `.js` | runtime | No | 1. Patient Registration Growth (last 7 days) |
| `server/src/controllers/authController.js` | 1924 | `.js` | runtime | No | HTTP controller handling auth business logic |
| `server/src/controllers/clinicalCommandController.js` | 30 | `.js` | runtime | No | HTTP controller handling clinicalCommand business logic |
| `server/src/controllers/clinicalReconciliationController.js` | 19 | `.js` | runtime | No | HTTP controller handling clinicalReconciliation business logic |
| `server/src/controllers/deviceController.js` | 472 | `.js` | runtime | No | HTTP controller handling device business logic |
| `server/src/controllers/dispensingController.js` | 65 | `.js` | runtime | No | HTTP controller handling dispensing business logic |
| `server/src/controllers/doctorController.js` | 231 | `.js` | runtime | YES (PINNED) | HTTP controller handling doctor business logic |
| `server/src/controllers/drugController.js` | 271 | `.js` | runtime | No | HTTP controller handling drug business logic |
| `server/src/controllers/hospitalController.js` | 407 | `.js` | runtime | No | HTTP controller handling hospital business logic |
| `server/src/controllers/labController.js` | 1470 | `.js` | runtime | No | server/src/controllers/labController.js |
| `server/src/controllers/mlPredictionController.js` | 39 | `.js` | runtime | No | HTTP controller handling mlPrediction business logic |
| `server/src/controllers/notificationController.js` | 60 | `.js` | runtime | No | Helper function to create notification internally |
| `server/src/controllers/organizationPasswordController.js` | 28 | `.js` | runtime | No | HTTP controller handling organizationPassword business logic |
| `server/src/controllers/patientController.js` | 834 | `.js` | runtime | No | HTTP controller handling patient business logic |
| `server/src/controllers/pharmacyController.js` | 957 | `.js` | runtime | No | HTTP controller handling pharmacy business logic |
| `server/src/controllers/prescriptionController.js` | 392 | `.js` | runtime | No | HTTP controller handling prescription business logic |
| `server/src/controllers/publicConsultationActivityController.js` | 48 | `.js` | runtime | No | HTTP controller handling publicConsultationActivity business logic |
| `server/src/controllers/publicController.js` | 346 | `.js` | runtime | No | HTTP controller handling public business logic |
| `server/src/controllers/reviewController.js` | 12 | `.js` | runtime | No | HTTP controller handling review business logic |
| `server/src/controllers/supportController.js` | 134 | `.js` | runtime | No | HTTP controller handling support business logic |
| `server/src/controllers/testController.js` | 216 | `.js` | test | No | Test suite for testController.js |
| `server/src/controllers/userController.js` | 85 | `.js` | runtime | No | HTTP controller handling user business logic |
| `server/src/controllers/verificationController.js` | 255 | `.js` | runtime | No | Public Verification Endpoint: GET /api/verify/:token |
| `server/src/data/districtPopulation2024.json` | 36 | `.json` | data | No | Configuration / reference data payload for districtPopulation2024.json |
| `server/src/data/medicine_safety_limits.json` | 48 | `.json` | data | No | Configuration / reference data payload for medicine_safety_limits.json |
| `server/src/demo/publicDemoServer.js` | 49 | `.js` | runtime | No | Deliberately independent of Express and every clinical/backend adapter. |
| `server/src/demo/universityRuntime.js` | 104 | `.js` | runtime | No | Dedicated real Express entry. Never imports the clinical app, its default |
| `server/src/demo/universityStore.js` | 64 | `.js` | runtime | No | Application component module |
| `server/src/middleware/auth.js` | 114 | `.js` | runtime | YES (PINNED) | Application component module |
| `server/src/middleware/clinicalWriteAuthorization.js` | 60 | `.js` | runtime | No | Application component module |
| `server/src/middleware/patientConsent.js` | 9 | `.js` | runtime | No | Application component module |
| `server/src/middleware/patientRouteIdentity.js` | 30 | `.js` | runtime | No | Legacy patient URLs use a NIC; newer login responses use a stable account id. |
| `server/src/middleware/profileImageAdmission.js` | 6 | `.js` | runtime | No | Application component module |
| `server/src/middleware/trustedCookieOrigin.js` | 11 | `.js` | runtime | No | Application component module |
| `server/src/middleware/verifiedAuth.js` | 25 | `.js` | runtime | No | Supplement the immutable canonical auth middleware; do not replace its session/ban/RBAC checks. |
| `server/src/models/AccountInvitation.js` | 12 | `.js` | runtime | No | Retain consumed reservations; deleting them would weaken cross-role duplicate prevention. |
| `server/src/models/AccountSecurityEvent.js` | 8 | `.js` | runtime | No | Mongoose schema and data model for AccountSecurityEvent |
| `server/src/models/Admin.js` | 17 | `.js` | runtime | No | Mongoose schema and data model for Admin |
| `server/src/models/AuditLog.js` | 28 | `.js` | runtime | No | Capping bounds retention; it does not prevent all MongoDB updates and is not |
| `server/src/models/BanRecord.js` | 28 | `.js` | runtime | No | Mongoose schema and data model for BanRecord |
| `server/src/models/BroadcastMessage.js` | 35 | `.js` | runtime | No | Mongoose schema and data model for BroadcastMessage |
| `server/src/models/ClinicalCommand.js` | 17 | `.js` | runtime | No | Only opaque identifiers and counts; never persist the raw clinical request here. |
| `server/src/models/Consultation.js` | 36 | `.js` | runtime | YES (PINNED) | Unencrypted ObjectId — use this for queries instead of the encrypted patientNic |
| `server/src/models/ConsultationRating.js` | 34 | `.js` | runtime | No | Mongoose schema and data model for ConsultationRating |
| `server/src/models/Dispensing.js` | 70 | `.js` | runtime | No | Mongoose schema and data model for Dispensing |
| `server/src/models/Doctor.js` | 50 | `.js` | runtime | No | Mongoose schema and data model for Doctor |
| `server/src/models/Drug.js` | 42 | `.js` | runtime | No | Mongoose schema and data model for Drug |
| `server/src/models/Hospital.js` | 29 | `.js` | runtime | No | Mongoose schema and data model for Hospital |
| `server/src/models/ICDCode.js` | 8 | `.js` | runtime | No | Mongoose schema and data model for ICDCode |
| `server/src/models/LabTest.js` | 168 | `.js` | runtime | No | server/src/models/LabTest.js |
| `server/src/models/Notification.js` | 46 | `.js` | runtime | No | Mongoose schema and data model for Notification |
| `server/src/models/OTPSession.js` | 54 | `.js` | runtime | No | Mongoose schema and data model for OTPSession |
| `server/src/models/OutbreakAlert.js` | 96 | `.js` | runtime | No | Mongoose schema and data model for OutbreakAlert |
| `server/src/models/Patient.js` | 52 | `.js` | runtime | YES (PINNED) | Mongoose schema and data model for Patient |
| `server/src/models/Pharmacy.js` | 58 | `.js` | runtime | No | Mongoose schema and data model for Pharmacy |
| `server/src/models/PharmacyStaff.js` | 58 | `.js` | runtime | No | Mongoose schema and data model for PharmacyStaff |
| `server/src/models/Prescription.js` | 66 | `.js` | runtime | No | Optional — not set for OTC dispensings |
| `server/src/models/RecoveryToken.js` | 45 | `.js` | runtime | No | Mongoose schema and data model for RecoveryToken |
| `server/src/models/Review.js` | 41 | `.js` | runtime | No | Mongoose schema and data model for Review |
| `server/src/models/SessionToken.js` | 54 | `.js` | runtime | No | Mongoose schema and data model for SessionToken |
| `server/src/models/SupportTicket.js` | 33 | `.js` | runtime | No | Mongoose schema and data model for SupportTicket |
| `server/src/models/TestOrder.js` | 42 | `.js` | runtime | No | Mongoose schema and data model for TestOrder |
| `server/src/models/TrustedDevice.js` | 20 | `.js` | runtime | No | Mongoose schema and data model for TrustedDevice |
| `server/src/models/VerificationToken.js` | 69 | `.js` | runtime | No | Mongoose schema and data model for VerificationToken |
| `server/src/production.js` | 36 | `.js` | runtime | No | Before app/model imports: schemas must not provision collections/indexes. |
| `server/src/routes/adminRoutes.js` | 59 | `.js` | runtime | No | ─── Analytics ─────────────────────────────────────────────────────────────── |
| `server/src/routes/alertRoutes.js` | 13 | `.js` | runtime | No | Express route definitions for alert |
| `server/src/routes/authRoutes.js` | 49 | `.js` | runtime | No | Express route definitions for auth |
| `server/src/routes/deviceRoutes.js` | 18 | `.js` | runtime | No | User routes (any authenticated user) |
| `server/src/routes/doctorRoutes.js` | 19 | `.js` | runtime | No | Express route definitions for doctor |
| `server/src/routes/drugRoutes.js` | 27 | `.js` | runtime | No | ICD routes — both canonical and alias paths |
| `server/src/routes/hospitalRoutes.js` | 41 | `.js` | runtime | No | Express route definitions for hospital |
| `server/src/routes/labRoutes.js` | 103 | `.js` | runtime | No | server/src/routes/labRoutes.js |
| `server/src/routes/notificationRoutes.js` | 11 | `.js` | runtime | No | Express route definitions for notification |
| `server/src/routes/patientRoutes.js` | 48 | `.js` | runtime | No | Express route definitions for patient |
| `server/src/routes/pharmacyRoutes.js` | 59 | `.js` | runtime | No | Public routes |
| `server/src/routes/prescriptionRoutes.js` | 18 | `.js` | runtime | No | Patient and Staff access: download E-Prescription PDF |
| `server/src/routes/publicRoutes.js` | 21 | `.js` | runtime | No | Express route definitions for public |
| `server/src/routes/qaRoutes.js` | 74 | `.js` | runtime | No | Middleware: Verify QA owner header |
| `server/src/routes/reviewRoutes.js` | 17 | `.js` | runtime | No | Express route definitions for review |
| `server/src/routes/supportRoutes.js` | 14 | `.js` | runtime | No | Patient routes |
| `server/src/routes/testRoutes.js` | 31 | `.js` | test | No | Order a test (doctor only) |
| `server/src/routes/userRoutes.js` | 10 | `.js` | runtime | No | Express route definitions for user |
| `server/src/routes/verificationRoutes.js` | 37 | `.js` | runtime | No | Rate limit history downloads to 5 attempts per 15 minutes per IP |
| `server/src/security/accountState.js` | 25 | `.js` | runtime | No | Application component module |
| `server/src/security/apiErrorHandler.js` | 13 | `.js` | runtime | No | Application component module |
| `server/src/security/applicationShutdown.js` | 39 | `.js` | runtime | No | Own only the resources registered by this startup. Never kill other processes. |
| `server/src/security/atomicOtpStore.js` | 52 | `.js` | runtime | No | Redis executes this compare-and-delete as one operation across server processes. |
| `server/src/security/authenticatedFields.js` | 56 | `.js` | runtime | No | Candidate codec only: no globals, environment lookup, mongoose hooks or database access. |
| `server/src/security/clientOriginPolicy.js` | 9 | `.js` | runtime | No | Application component module |
| `server/src/security/clinicalEntryPolicy.js` | 13 | `.js` | runtime | No | Application component module |
| `server/src/security/fieldEncryption.js` | 20 | `.js` | runtime | No | Register the index hook first, while its identifier is still plaintext. |
| `server/src/security/identitySnapshotReview.js` | 66 | `.js` | runtime | No | Offline snapshot reconciliation only. This neither creates an index nor reserves |
| `server/src/security/keyringDiagnostic.js` | 36 | `.js` | runtime | No | Logging only: this neither selects keys nor alters admission/encryption mode. |
| `server/src/security/labReportEnvelope.js` | 33 | `.js` | runtime | No | Application component module |
| `server/src/security/legacyFieldEncryption.js` | 99 | `.js` | runtime | No | Custom Mongoose Plugin: Versioned Encryption |
| `server/src/security/listenReady.js` | 11 | `.js` | runtime | No | Application component module |
| `server/src/security/loginIdentifier.js` | 12 | `.js` | runtime | No | Application component module |
| `server/src/security/loginRequest.js` | 15 | `.js` | runtime | No | Login is not password creation: preserve legacy short passwords and exact |
| `server/src/security/maintenanceAdmission.js` | 5 | `.js` | runtime | No | Application component module |
| `server/src/security/mlHealthMonitor.js` | 15 | `.js` | runtime | No | Application component module |
| `server/src/security/modelMigrationPlan.js` | 149 | `.js` | runtime | No | Offline-only raw BSON planning. No models, environment, database or transport. |
| `server/src/security/nicBlindIndex.js` | 55 | `.js` | runtime | No | Application component module |
| `server/src/security/nicIndexRuntimeCandidate.js` | 13 | `.js` | runtime | No | Not bootstrapped by the application. Dedicated secret-manager integration requires approval. |
| `server/src/security/nicPersistence.js` | 46 | `.js` | runtime | No | Application component module |
| `server/src/security/operatorKeyPolicy.js` | 131 | `.js` | runtime | No | operatorKeyPolicy.js |
| `server/src/security/organizationLoginDto.js` | 8 | `.js` | runtime | No | Application component module |
| `server/src/security/passwordAttemptPolicy.js` | 28 | `.js` | runtime | No | Application component module |
| `server/src/security/patientProfileUpdate.js` | 61 | `.js` | runtime | No | Shared validation for the two existing self-service profile update routes. |
| `server/src/security/phase4QaPolicy.js` | 51 | `.js` | runtime | No | Pure admission policy. Importing this module cannot read a secret or connect. |
| `server/src/security/preferredLanguage.js` | 21 | `.js` | runtime | No | Historical invalid/missing values are read as English without rewriting records. |
| `server/src/security/productionAtlasPolicy.js` | 43 | `.js` | runtime | No | Application component module |
| `server/src/security/productionRuntimePolicy.js` | 22 | `.js` | runtime | No | Pure admission before dotenv, application, provider or database imports. |
| `server/src/security/productionStorageAdmission.js` | 146 | `.js` | runtime | No | Application component module |
| `server/src/security/productionStorageManifest.json` | 924 | `.json` | data | No | Configuration / reference data payload for productionStorageManifest.json |
| `server/src/security/provisioningPlan.js` | 36 | `.js` | runtime | No | Application component module |
| `server/src/security/publicDemoArtifact.js` | 91 | `.js` | runtime | No | Artifact review only. No application, environment-file or provider imports. |
| `server/src/security/publicDemoIsolation.js` | 37 | `.js` | runtime | No | This guard is deliberately called before dotenv and all clinical imports. |
| `server/src/security/publicDto.js` | 56 | `.js` | runtime | No | Construct response objects; query projection alone is not a privacy boundary. |
| `server/src/security/qaConnectionAdmission.js` | 57 | `.js` | runtime | No | Application component module |
| `server/src/security/redisConnectionPolicy.js` | 15 | `.js` | runtime | No | URL-only validation; never resolves DNS or exposes credential values. |
| `server/src/security/runtimeHealth.js` | 19 | `.js` | runtime | No | Render supplies a public source revision at runtime; never echo arbitrary env data. |
| `server/src/security/safeFailureDiagnostic.js` | 79 | `.js` | runtime | No | Only fixed categories leave this boundary. Never copy exception text, stack, |
| `server/src/security/securityMigrationPlan.js` | 63 | `.js` | runtime | No | Application component module |
| `server/src/security/securityRuntime.js` | 63 | `.js` | runtime | No | Application component module |
| `server/src/security/socketAuthorization.js` | 93 | `.js` | runtime | No | Application component module |
| `server/src/security/universityDemoPolicy.js` | 167 | `.js` | runtime | No | Pure restriction layer for a future separately qualified real-application demo |
| `server/src/security/versionedFieldPluginCandidate.js` | 48 | `.js` | runtime | No | GCM implementation selected only by the reviewed runtime encryption mode. |
| `server/src/services/accountLanguageService.js` | 42 | `.js` | runtime | No | Domain service handling accountLanguage operations |
| `server/src/services/accountStatusService.js` | 32 | `.js` | runtime | No | Domain service handling accountStatus operations |
| `server/src/services/adminMlStatusService.js` | 190 | `.js` | runtime | No | Dependency availability is a status resource, not a clinical-data assertion. |
| `server/src/services/clinicalAuditService.js` | 282 | `.js` | runtime | No | MediSync Service-Level Clinical Audit Service |
| `server/src/services/clinicalCommandService.js` | 56 | `.js` | runtime | No | Domain service handling clinicalCommand operations |
| `server/src/services/clinicalCommandStorage.js` | 16 | `.js` | runtime | No | Metadata only: never create a missing recovery journal implicitly in a write. |
| `server/src/services/clinicalCommitGuard.js` | 43 | `.js` | runtime | No | Domain service handling clinicalCommitGuard.js operations |
| `server/src/services/clinicalErrors.js` | 5 | `.js` | runtime | No | Domain service handling clinicalErrors.js operations |
| `server/src/services/clinicalOutboxWorker.js` | 20 | `.js` | runtime | No | Domain service handling clinicalOutboxWorker.js operations |
| `server/src/services/clinicalRecordDto.js` | 12 | `.js` | runtime | No | Domain service handling clinicalRecordDto.js operations |
| `server/src/services/consultationCommandService.js` | 67 | `.js` | runtime | No | Domain service handling consultationCommand operations |
| `server/src/services/consultationSummaryEmailService.js` | 583 | `.js` | runtime | No | Domain service handling consultationSummaryEmail operations |
| `server/src/services/currentMedicationSafety.js` | 31 | `.js` | runtime | No | Domain service handling currentMedicationSafety.js operations |
| `server/src/services/dispensingService.js` | 189 | `.js` | runtime | No | Domain service handling dispensing operations |
| `server/src/services/existingCollections.js` | 14 | `.js` | runtime | No | Domain service handling existingCollections.js operations |
| `server/src/services/facilityProfileService.js` | 20 | `.js` | runtime | No | Domain service handling facilityProfile operations |
| `server/src/services/incidenceService.js` | 64 | `.js` | runtime | No | Domain service handling incidence operations |
| `server/src/services/invitationWorkflow.js` | 64 | `.js` | runtime | No | No HTTP registration and no default live adapter. The operator dry-run CLI |
| `server/src/services/labCommitService.js` | 45 | `.js` | runtime | No | Domain service handling labCommit operations |
| `server/src/services/labReportStorage.js` | 31 | `.js` | runtime | No | Legacy key wrapping retained for existing encrypted reports; GCM authenticates the file before retur |
| `server/src/services/mlPredictionService.js` | 157 | `.js` | runtime | No | Domain service handling mlPrediction operations |
| `server/src/services/notificationService.js` | 176 | `.js` | runtime | No | sendNotification |
| `server/src/services/outbreakDetector.js` | 26 | `.js` | runtime | No | server/src/services/outbreakDetector.js |
| `server/src/services/passwordChangeService.js` | 25 | `.js` | runtime | No | Domain service handling passwordChange operations |
| `server/src/services/patientConsentService.js` | 25 | `.js` | runtime | No | Domain service handling patientConsent operations |
| `server/src/services/pharmacyCommitGuard.js` | 20 | `.js` | runtime | No | Domain service handling pharmacyCommitGuard.js operations |
| `server/src/services/publicConsultationActivity.js` | 150 | `.js` | runtime | No | Saved consultation activity is not confirmed-case surveillance. Only native |
| `server/src/services/publicHealthStats.js` | 183 | `.js` | runtime | No | Public reporting shares surveillance's reviewed-episode definition, but uses |
| `server/src/services/recipientLanguageService.js` | 73 | `.js` | runtime | No | For records already selected by an authorized server operation (including |
| `server/src/services/reminderDispatchService.js` | 59 | `.js` | runtime | No | Domain service handling reminderDispatch operations |
| `server/src/services/reviewService.js` | 42 | `.js` | runtime | No | Domain service handling review operations |
| `server/src/services/surveillanceService.js` | 315 | `.js` | runtime | No | No invented disease-specific episode interval. A trusted, reviewed episode ID |
| `server/src/services/verificationTokenService.js` | 125 | `.js` | runtime | No | Issue a cryptographically random 256-bit verification token. |
| `server/src/services/whoIcd11Service.js` | 271 | `.js` | runtime | No | WHO ICD-11 MMS Integration Service |
| `server/src/university.js` | 24 | `.js` | runtime | No | Explicit alternative executable, never selected by ordinary npm start. |
| `server/src/utils/cleanTestOutbreaks.js` | 82 | `.js` | runtime | No | Application component module |
| `server/src/utils/cloudinary.js` | 102 | `.js` | runtime | No | Cloudinary configuration for MediSync test result uploads. |
| `server/src/utils/cronJobs.js` | 250 | `.js` | runtime | No | initCronJobs() |
| `server/src/utils/deviceParser.js` | 157 | `.js` | runtime | No | Model codes dictionary for accurate hardware translation |
| `server/src/utils/doctorName.js` | 37 | `.js` | runtime | No | server/src/utils/doctorName.js |
| `server/src/utils/email.js` | 6 | `.js` | runtime | No | server/src/utils/email.js |
| `server/src/utils/emailService.js` | 2457 | `.js` | runtime | No | Domain service handling email operations |
| `server/src/utils/generateReceiptNumber.js` | 10 | `.js` | runtime | No | Application component module |
| `server/src/utils/inferenceResponse.js` | 38 | `.js` | runtime | No | The existing ML endpoint emits a percentage-valued similarity score, not calibrated probability. |
| `server/src/utils/ingredientResolver.js` | 715 | `.js` | runtime | No | Reviewed, explicit 1-to-1 chemical-identity synonym mappings (BAN/BP <-> INN/USAN). |
| `server/src/utils/internalAuth.js` | 67 | `.js` | runtime | No | Helper to get time strings for the current and previous hour. |
| `server/src/utils/ipLookup.js` | 62 | `.js` | runtime | No | Simple in-memory cache: { '192.168.1.1': { networkInfo: {...}, expiresAt: 123456789 } } |
| `server/src/utils/loadDatasets.js` | 3 | `.js` | runtime | No | The server Docker root cannot load a sibling ml-engine checkout. |
| `server/src/utils/loginAlertIdentifier.js` | 22 | `.js` | runtime | No | Display only: never use this result for addressing, authentication or storage. |
| `server/src/utils/medicationName.js` | 14 | `.js` | runtime | No | Creation contract only. Alias equality does not imply clinical equivalence. |
| `server/src/utils/medicineSafetyEngine.js` | 318 | `.js` | runtime | No | Application component module |
| `server/src/utils/outbreakForecasting.js` | 440 | `.js` | runtime | No | Two-tailed Student's t critical values for alpha = 0.05 (95% CI) and alpha = 0.01 (99% CI) |
| `server/src/utils/passwordUtils.js` | 57 | `.js` | runtime | No | Ensure at least one uppercase, one lowercase, one number |
| `server/src/utils/patientProfilePolicy.js` | 25 | `.js` | runtime | No | Explicit response projections. No authentication/session/encryption internals. |
| `server/src/utils/pdfGenerator.js` | 1378 | `.js` | runtime | No | Application component module |
| `server/src/utils/prescriptionDuration.js` | 21 | `.js` | runtime | No | Calendar-independent expiry: N exact 24-hour periods after issuedAt, in UTC. |
| `server/src/utils/referenceCatalogs.js` | 26 | `.js` | runtime | No | Application component module |
| `server/src/utils/seedAdmin.js` | 74 | `.js` | runtime | No | Application component module |
| `server/src/utils/seedData.js` | 118 | `.js` | runtime | No | Application component module |
| `server/src/utils/seedDrugs.js` | 161 | `.js` | runtime | No | Application component module |
| `server/src/utils/seedOutbreakDemo.js` | 145 | `.js` | runtime | No | Application component module |
| `server/src/utils/seedPharmacyMLData.js` | 129 | `.js` | runtime | No | Application component module |
| `server/src/utils/seedRestockData.js` | 154 | `.js` | runtime | No | Application component module |
| `server/src/utils/seedUniversityDemoDataset.js` | 1055 | `.js` | runtime | No | Application component module |
| `server/src/utils/seedUsers.js` | 226 | `.js` | runtime | No | Ensure global encryption keys are available for Mongoose versionedEncryption plugin |
| `server/src/utils/sriLankaTime.js` | 35 | `.js` | runtime | No | Presentation only: never changes a stored Date, UTC wire value or process TZ. |
| `server/src/utils/versionedEncryption.js` | 99 | `.js` | runtime | YES (PINNED) | Custom Mongoose Plugin: Versioned Encryption |
| `server/src/utils/wipeOutbreakDemo.js` | 63 | `.js` | runtime | No | Application component module |
| `server/src/utils/wipeSeedRestockData.js` | 81 | `.js` | runtime | No | Application component module |


## Server Reference Data & Scripts (`server/reference-data/`, `server/scripts/`) (37 files)

| Path | LOC | Type | Role | Protected? | Purpose & Key Responsibilities |
|---|:---:|:---:|:---:|:---:|---|
| `server/reference-data/drugs_clean.json` | 36948 | `.json` | data | No | Configuration / reference data payload for drugs_clean.json |
| `server/reference-data/icd10_clean.json` | 286818 | `.json` | data | No | Configuration / reference data payload for icd10_clean.json |
| `server/reference-data/interactions_clean.json` | 1149248 | `.json` | data | No | Configuration / reference data payload for interactions_clean.json |
| `server/reference-data/manifest.json` | 40 | `.json` | data | No | Configuration / reference data payload for manifest.json |
| `server/reference-data/symptoms.json` | 133 | `.json` | data | No | Configuration / reference data payload for symptoms.json |
| `server/scripts/bootstrapSuperAdmin.js` | 86 | `.js` | runtime | No | bootstrapSuperAdmin.js — Idempotent super-admin seed for medisync_prod. |
| `server/scripts/bootstrapSyntheticAccounts.js` | 501 | `.js` | runtime | No | bootstrapSyntheticAccounts.js |
| `server/scripts/checkPatientDB.js` | 23 | `.js` | runtime | No | Application component module |
| `server/scripts/checkPatientRaw.js` | 27 | `.js` | runtime | No | Find patient by NIC |
| `server/scripts/closureQaReadOnly.cjs` | 103 | `.cjs` | runtime | No | Prepared for a separately approved read-only Atlas attempt. Never loads dotenv, |
| `server/scripts/createSpecificPatient.js` | 45 | `.js` | runtime | No | node server/scripts/createSpecificPatient.js |
| `server/scripts/createTestAccounts.js` | 149 | `.js` | runtime | No | Legacy account creation requires a separately approved owned-fixture procedure. |
| `server/scripts/diagnoseProductionAtlas.js` | 97 | `.js` | runtime | No | Offline-only companion diagnostic. No driver, dotenv, filesystem or network |
| `server/scripts/generate_codebase_documentation.js` | 332 | `.js` | runtime | No | Application component module |
| `server/scripts/importReferenceData.js` | 308 | `.js` | runtime | No | usr/bin/env node |
| `server/scripts/inject_outbreak.js` | 73 | `.js` | runtime | No | node scripts/inject_outbreak.js |
| `server/scripts/localRealPolicy.cjs` | 6 | `.cjs` | runtime | No | Application component module |
| `server/scripts/makeAdmin.js` | 49 | `.js` | runtime | No | Load environment variables from server/.env |
| `server/scripts/operatorDatabaseMode.js` | 47 | `.js` | runtime | No | Reject mixed names before reading any credential, including empty aliases. |
| `server/scripts/phase5xMasterClinicalChecks.js` | 35 | `.js` | runtime | No | Application component module |
| `server/scripts/preflightProduction.js` | 219 | `.js` | runtime | No | preflightProduction.js |
| `server/scripts/prepareReferenceBundle.cjs` | 29 | `.cjs` | runtime | No | Local, deterministic file delivery only. No database, HTTP or provider imports. |
| `server/scripts/previewSyntheticOutbreakScenarios.js` | 169 | `.js` | runtime | No | MediSync — 6-Scenario Catalog-Validated Synthetic Outbreak Surveillance Preview Tool |
| `server/scripts/provisionProductionStorage.js` | 322 | `.js` | runtime | No | provisionProductionStorage.js |
| `server/scripts/qaReadOnlyAdmissionDiagnostics.cjs` | 27 | `.cjs` | runtime | No | Never serialize Error objects, URI text, environment values or stack traces. |
| `server/scripts/resetAdmin.js` | 30 | `.js` | runtime | No | This looks for ANY document where role is 'admin' |
| `server/scripts/reviewClinicalRuntime.cjs` | 103 | `.cjs` | runtime | No | Offline source-copy review only. Never runs Docker, npm, application or provider code. |
| `server/scripts/rotateKeys.js` | 148 | `.js` | runtime | No | Models |
| `server/scripts/runBackendE2E.js` | 256 | `.js` | runtime | No | Color formatting utilities for console |
| `server/scripts/runE2ETests.js` | 132 | `.js` | runtime | No | Test Data |
| `server/scripts/setupAdmin.js` | 64 | `.js` | runtime | No | setupAdmin.js — Creates or updates an admin account in the database. |
| `server/scripts/standaloneMockServer.js` | 719 | `.js` | runtime | No | MediSync Standalone In-Memory Mock API Server |
| `server/scripts/test-email.js` | 18 | `.js` | test | No | Test suite for test-email.js |
| `server/scripts/testMLEngine.js` | 202 | `.js` | test | No | Color formatting utilities for console |
| `server/scripts/test_idle_session_real.js` | 57 | `.js` | test | No | 1. Create a dummy session token that is exactly 16 minutes old |
| `server/scripts/test_security.sh` | 102 | `.sh` | test | No | bin/bash |
| `server/scripts/test_smtp.js` | 12 | `.js` | test | No | Test suite for test_smtp.js |


## Server Test Suites (`server/tests/`) (214 files)

| Path | LOC | Type | Role | Protected? | Purpose & Key Responsibilities |
|---|:---:|:---:|:---:|:---:|---|
| `server/tests/adminMlStatusOffline.test.js` | 243 | `.js` | test | No | Test suite for adminMlStatusOffline |
| `server/tests/adversarialOutbreakSeedVerification.test.js` | 749 | `.js` | test | No | server/tests/adversarialOutbreakSeedVerification.test.js |
| `server/tests/agentBAccountSecurity.test.js` | 36 | `.js` | test | No | Test suite for agentBAccountSecurity |
| `server/tests/agentBAtomicOtp.test.js` | 95 | `.js` | test | No | Test suite for agentBAtomicOtp |
| `server/tests/agentBAuthSocket.test.js` | 142 | `.js` | test | No | Test suite for agentBAuthSocket |
| `server/tests/agentBClinicalHandlers.test.js` | 536 | `.js` | test | No | Test suite for agentBClinicalHandlers |
| `server/tests/agentBClinicalTransactions.test.js` | 61 | `.js` | test | No | Test suite for agentBClinicalTransactions |
| `server/tests/agentBCommandCommit.test.js` | 163 | `.js` | test | No | Test suite for agentBCommandCommit |
| `server/tests/agentBCrypto.test.js` | 71 | `.js` | test | No | Test suite for agentBCrypto |
| `server/tests/agentBEndpointAdmission.test.js` | 133 | `.js` | test | No | Test suite for agentBEndpointAdmission |
| `server/tests/agentBFieldPlugin.test.js` | 25 | `.js` | test | No | Test suite for agentBFieldPlugin |
| `server/tests/agentBFieldQuerySafety.test.js` | 18 | `.js` | test | No | Test suite for agentBFieldQuerySafety |
| `server/tests/agentBIdentitySnapshot.test.js` | 60 | `.js` | test | No | Test suite for agentBIdentitySnapshot |
| `server/tests/agentBIntegrationCrypto.test.js` | 79 | `.js` | test | No | Test suite for agentBIntegrationCrypto |
| `server/tests/agentBLabEnvelopeCommit.test.js` | 72 | `.js` | test | No | Test suite for agentBLabEnvelopeCommit |
| `server/tests/agentBMigrationAndInvitations.test.js` | 109 | `.js` | test | No | Test suite for agentBMigrationAndInvitations |
| `server/tests/agentBModelCompatibility.test.js` | 44 | `.js` | test | No | Test suite for agentBModelCompatibility |
| `server/tests/agentBModelMigration.test.js` | 151 | `.js` | test | No | Test suite for agentBModelMigration |
| `server/tests/agentBOperations.test.js` | 83 | `.js` | test | No | Test suite for agentBOperations |
| `server/tests/agentBOutboxRecovery.test.js` | 28 | `.js` | test | No | Test suite for agentBOutboxRecovery |
| `server/tests/agentBProfileLanguage.test.js` | 274 | `.js` | test | No | Test suite for agentBProfileLanguage |
| `server/tests/agentBProviderOutbreak.test.js` | 60 | `.js` | test | No | Test suite for agentBProviderOutbreak |
| `server/tests/agentBPublicDemoIsolation.test.js` | 332 | `.js` | test | No | Test suite for agentBPublicDemoIsolation |
| `server/tests/aiResilience.test.js` | 97 | `.js` | test | No | Test suite for aiResilience |
| `server/tests/antigravityPublicHealthPrivacy.test.js` | 40 | `.js` | test | No | Test suite for antigravityPublicHealthPrivacy |
| `server/tests/approvedClinicalPatchBinding.test.js` | 15 | `.js` | test | No | Test suite for approvedClinicalPatchBinding |
| `server/tests/auditAppendOnlyHardening.test.js` | 16 | `.js` | test | No | Test suite for auditAppendOnlyHardening |
| `server/tests/authLimiterSkipS3.test.js` | 46 | `.js` | test | No | Test suite for authLimiterSkipS3 |
| `server/tests/authenticatedSessionBrowser.test.js` | 197 | `.js` | test | No | Test suite for authenticatedSessionBrowser |
| `server/tests/authenticatedSessionPolicy.test.js` | 80 | `.js` | test | No | Test suite for authenticatedSessionPolicy |
| `server/tests/bootstrapSyntheticAccounts.test.js` | 73 | `.js` | test | No | Approved production Option B with exact cluster host |
| `server/tests/brevoFallback429Offline.test.js` | 123 | `.js` | test | No | Actual dispatch/classification code; inert transports and quota adapter only. |
| `server/tests/c4VerifierTruthfulness.test.js` | 95 | `.js` | test | No | Test suite for c4VerifierTruthfulness |
| `server/tests/clinicalAuditSafety.test.js` | 338 | `.js` | test | No | Clinical Audit Safety & Durability Specification Test Suite |
| `server/tests/clinicalAuditService.test.js` | 102 | `.js` | test | No | Test suite for clinicalAuditService |
| `server/tests/clinicalHttpWorkflow.test.js` | 145 | `.js` | test | No | MediSync Clinical HTTP Integration & Negative Security Control Tests |
| `server/tests/clinicalPdfExportPhase7.test.js` | 582 | `.js` | test | No | Phase 7 Unit Tests: Clinical PDF Export behind PDF_EXPORT_ENABLED flag (Milestone 4 WP5) |
| `server/tests/clinicalProductionEntry.test.js` | 34 | `.js` | test | No | Test suite for clinicalProductionEntry |
| `server/tests/closureQaPreservationBaseline.local.test.js` | 6 | `.js` | test | No | This exact historical snapshot remains local and is never published to CI. |
| `server/tests/closureQaReadOnly.test.js` | 13 | `.js` | test | No | Test suite for closureQaReadOnly |
| `server/tests/cloudinaryCompatibility.test.js` | 236 | `.js` | test | No | Cloudinary 2.11 & Multer-Storage-Cloudinary 4 Compatibility Test Suite |
| `server/tests/consultation409Offline.test.js` | 578 | `.js` | test | No | Phase 3 Backend Consultation 409 & Idempotency Offline Unit/Integration Suite |
| `server/tests/dbGuard.test.js` | 159 | `.js` | test | No | Test suite for dbGuard |
| `server/tests/dispensingTransaction.test.js` | 34 | `.js` | test | No | Test suite for dispensingTransaction |
| `server/tests/doctorAiWorkflow.test.js` | 142 | `.js` | test | No | Test suite for doctorAiWorkflow |
| `server/tests/doctorNameOffline.test.js` | 62 | `.js` | test | No | Test suite for doctorNameOffline |
| `server/tests/drugReferenceDataOffline.test.js` | 105 | `.js` | test | No | Backend Reference Data & Search Offline Unit Tests |
| `server/tests/e1ZeroMutationPreflight.test.js` | 63 | `.js` | test | No | E1 Zero-Mutation Preflight Offline Test |
| `server/tests/emailTemplatesPhase6.test.js` | 497 | `.js` | test | No | MediSync Stage 4 Email Templates & Dispatch Security Test Suite |
| `server/tests/gate3BootstrapRepair.test.js` | 193 | `.js` | test | No | Test suite for gate3BootstrapRepair |
| `server/tests/gate3DatabaseMode.test.js` | 135 | `.js` | test | No | Test suite for gate3DatabaseMode |
| `server/tests/gate3StorageRepair.test.js` | 140 | `.js` | test | No | Test suite for gate3StorageRepair |
| `server/tests/hardeningHospitalErrors.test.js` | 18 | `.js` | test | No | Test suite for hardeningHospitalErrors |
| `server/tests/helpers/agentBOfflineBoundary.cjs` | 27 | `.cjs` | test | No | Defense in depth: the parent also supplies an allowlisted environment. |
| `server/tests/helpers/b11AuthInertHarness.js` | 31 | `.js` | test | No | Evaluate the actual auth middleware; no real JWT library, model, environment or application import. |
| `server/tests/helpers/browserCleanupProof.js` | 31 | `.js` | test | No | Pure final receipt check. No filesystem, process signals or database access. |
| `server/tests/helpers/browserExpressGraph.js` | 75 | `.js` | test | No | QA-only Express 5 graph sealing. Layer params/path/keys stay writable for routing. |
| `server/tests/helpers/browserInertProof.js` | 15 | `.js` | test | No | Test data only; never persisted as an execution approval or startup config. |
| `server/tests/helpers/browserLifecycle.js` | 130 | `.js` | test | No | QA-only producer lifecycle; OS-observed process exit is a separate cleanup gate. |
| `server/tests/helpers/browserOutboundGuard.js` | 8 | `.js` | test | No | Incoming Express HTTP and MongoDB driver TLS are separate from outbound HTTP. |
| `server/tests/helpers/browserOwnedListener.js` | 31 | `.js` | test | No | Owns only the supplied HTTP server and sockets; never manages foreign PIDs. |
| `server/tests/helpers/browserProcessObservation.js` | 12 | `.js` | test | No | The trusted parent must bind child.pid and the startup identity before exit. |
| `server/tests/helpers/browserProviders.js` | 29 | `.js` | test | No | Pure/counted seams. No SDK, transport, environment or clinical imports. |
| `server/tests/helpers/browserQaControls.js` | 28 | `.js` | test | No | Registered before final graph sealing; every control handler is instrumented. |
| `server/tests/helpers/browserRunConfig.js` | 35 | `.js` | test | No | Test suite for browserRunConfig.js |
| `server/tests/helpers/browserSourceProof.js` | 19 | `.js` | test | No | Test suite for browserSourceProof.js |
| `server/tests/helpers/doctorPublicationCases.js` | 59 | `.js` | test | No | Shared pure assertions; called by quarantined IR cases and standalone D3 checks. |
| `server/tests/helpers/doctorPublicationMemoryHarness.js` | 37 | `.js` | test | No | Load the actual controller into a VM with read-only in-memory dependencies. |
| `server/tests/helpers/e1AttemptIdentity.js` | 13 | `.js` | test | No | Protocol identity is stable; only the specifically reviewed R3 attempt is admitted. |
| `server/tests/helpers/e1ParentIo.js` | 88 | `.js` | test | No | Trusted-parent adapter. Import is inert; methods are called only after admission. |
| `server/tests/helpers/e1TrustedParent.js` | 99 | `.js` | test | No | Pure, dependency-injected orchestration. Importing this module has no I/O. |
| `server/tests/helpers/e1WindowsInventory.js` | 156 | `.js` | test | No | Pure classification unless collectWindowsInventory is explicitly called. |
| `server/tests/helpers/gate3OperatorEnvironment.js` | 5 | `.js` | test | No | Test suite for gate3OperatorEnvironment.js |
| `server/tests/helpers/gate3StorageFixture.js` | 34 | `.js` | test | No | Metadata and write recorder only. No MongoClient, transport or document store. |
| `server/tests/helpers/ir04FixtureSafety.js` | 85 | `.js` | test | No | IR-04 test preparation only. No environment, model, transport or DB imports. |
| `server/tests/helpers/ir04IsolationReceipt.js` | 155 | `.js` | test | No | Test-only Express handler tracking. Detached work needs separate lifecycle proof. |
| `server/tests/helpers/legacyPdfProof.js` | 124 | `.js` | test | No | Isolated Synthetic PDF Legacy Cryptographic Proof Helper |
| `server/tests/helpers/loginRequestHarness.js` | 24 | `.js` | test | No | Executes the real controller with only inert repository/provider boundaries. |
| `server/tests/helpers/loopbackListenerGuard.js` | 18 | `.js` | test | No | Test-only native listener guard; no database/environment imports. |
| `server/tests/helpers/masterInertConnectionBoundary.js` | 26 | `.js` | test | No | Synthetic observation interface only. No driver/prototype, callbacks, DNS or I/O. |
| `server/tests/helpers/masterInertTrust.js` | 42 | `.js` | test | No | Capability-based SIGNER DOUBLE. Not cryptography, attestation, persistent storage or a live adapter. |
| `server/tests/helpers/masterWindowsPlan.js` | 26 | `.js` | test | No | Pure proposed initialization/observation models. Never invokes an OS API or native compiler. |
| `server/tests/helpers/ownedFixtures.js` | 199 | `.js` | test | No | Phase 5X harness: intercept native driver writes, record IDs BEFORE writes, |
| `server/tests/helpers/ownedHttpServer.js` | 60 | `.js` | test | No | Suite-owned loopback listener. No database, routes or environment imports. |
| `server/tests/helpers/patientRouteIdentityHarness.js` | 153 | `.js` | test | No | Real application modules, router, JWT and bcrypt; only persistence/provider |
| `server/tests/helpers/phase5xD2Environment.js` | 13 | `.js` | test | No | Stop subsequent cases before their fixture hooks after the first failure. |
| `server/tests/helpers/phase5xD5InertHarness.js` | 48 | `.js` | test | No | Execute actual controllers using inert models. No model, config, env or transport imports. |
| `server/tests/helpers/qaEncryptionBootstrap.js` | 191 | `.js` | test | No | Test suite for qaEncryptionBootstrap.js |
| `server/tests/helpers/qaEnvironment.js` | 65 | `.js` | test | No | Child bootstrap. Full env-file parsing belongs exclusively to the parent. |
| `server/tests/helpers/qaEnvironmentContract.js` | 30 | `.js` | test | No | Pure child contract: no fs, dotenv, provider initialization or connection. |
| `server/tests/helpers/qaIsolatedConnectionPolicy.js` | 37 | `.js` | test | No | Inert-only entry adapter. No MongoDB/Mongoose imports or actual native installation. |
| `server/tests/helpers/qaIsolatedParentContract.js` | 125 | `.js` | test | No | ENV5: pure validation and explicitly inert capabilities. No live authority issuer. |
| `server/tests/helpers/qaIsolatedParentEnvironment.js` | 36 | `.js` | test | No | No fs, dotenv, ambient environment, random generation, network or provider callback. |
| `server/tests/helpers/qaNativeDriverPolicy.js` | 311 | `.js` | test | No | The SOLE approved QA database name under the accepted environment contract |
| `server/tests/helpers/qaParentEnvironment.js` | 23 | `.js` | test | No | Trusted launcher only. Never import this module from a Jest suite/bootstrap. |
| `server/tests/helpers/qaProcessOrchestration.js` | 163 | `.js` | test | No | Test suite for qaProcessOrchestration.js |
| `server/tests/helpers/qaSecretReadGuard.js` | 16 | `.js` | test | No | Defense in depth for known fs APIs in a QA child, not an OS permission boundary. |
| `server/tests/helpers/qaTrustLedger.js` | 265 | `.js` | test | No | Test suite for qaTrustLedger.js |
| `server/tests/helpers/realIntegrationTransport.js` | 61 | `.js` | test | No | Preparation only: no dotenv, fixture bootstrap, database client or automatic run. |
| `server/tests/helpers/renderEnvironmentStartupProbe.cjs` | 79 | `.cjs` | test | No | Test-only execution of unchanged startup modules. All I/O boundaries are inert. |
| `server/tests/helpers/seedPlatformMemoryCases.cjs` | 162 | `.cjs` | test | No | Executed ONLY by the native local lifecycle profile, outside the backend |
| `server/tests/helpers/strictIr04Axios.js` | 35 | `.js` | test | No | Pure IR-04 transport seam. Never delegates to Axios or a network transport. |
| `server/tests/helpers/strictMlFetch.js` | 26 | `.js` | test | No | Expected ML ingestion is a pure test response. Fallback remains the network guard. |
| `server/tests/helpers/targetedClinicalHarness.js` | 96 | `.js` | test | No | Future approved execution only; importing suites must encounter their quarantine first. |
| `server/tests/i18nSourceAudit.test.js` | 56 | `.js` | test | No | Test suite for i18nSourceAudit |
| `server/tests/icdReference.test.js` | 90 | `.js` | test | No | Test suite for icdReference |
| `server/tests/ir04BackendIntegration.test.js` | 1572 | `.js` | test | YES (PINNED) | MEDISYNC — IR-04: Isolated Backend Application & Integration Test Suite |
| `server/tests/jwt-patient-nic-removal-s1.test.js` | 406 | `.js` | test | No | Test suite for jwt-patient-nic-removal-s1 |
| `server/tests/keyringValidationDiagnostics.test.js` | 120 | `.js` | test | No | Test suite for keyringValidationDiagnostics |
| `server/tests/lab.test.js` | 928 | `.js` | test | YES (PINNED) | server/tests/lab.test.js |
| `server/tests/labEncryptionStorageAdapter.test.js` | 159 | `.js` | test | No | MediSync Laboratory Report Authenticated Envelope Encryption & Storage Adapter Test |
| `server/tests/liveVerificationReadOnly.test.js` | 69 | `.js` | test | No | Test suite for liveVerificationReadOnly |
| `server/tests/localStartupAndDirectory.test.js` | 68 | `.js` | test | No | Test suite for localStartupAndDirectory |
| `server/tests/loginAlertIdentifierMasking.test.js` | 48 | `.js` | test | No | Synthetic identifiers only. No credential, account lookup or external transport. |
| `server/tests/loginNotificationLoggingS4.test.js` | 72 | `.js` | test | No | Neither login nor verifyLoginOTP should use console.log or console.error for login notifications |
| `server/tests/loginRateLimitOffline.test.js` | 28 | `.js` | test | No | Test suite for loginRateLimitOffline |
| `server/tests/loginRequestValidation.test.js` | 18 | `.js` | test | No | Test suite for loginRequestValidation |
| `server/tests/masterAuthRedaction.test.js` | 22 | `.js` | test | No | Test suite for masterAuthRedaction |
| `server/tests/masterClinicalStorage.test.js` | 21 | `.js` | test | No | Test suite for masterClinicalStorage |
| `server/tests/masterExistingStorage.test.js` | 8 | `.js` | test | No | Test suite for masterExistingStorage |
| `server/tests/masterLoginAdmission.test.js` | 20 | `.js` | test | No | Test suite for masterLoginAdmission |
| `server/tests/masterOrganizationPassword.test.js` | 10 | `.js` | test | No | Test suite for masterOrganizationPassword |
| `server/tests/masterQaAdmissionDiagnostics.test.js` | 36 | `.js` | test | No | Test suite for masterQaAdmissionDiagnostics |
| `server/tests/masterReconciliation.test.js` | 9 | `.js` | test | No | Test suite for masterReconciliation |
| `server/tests/masterReleaseBoundary.test.js` | 12 | `.js` | test | No | Test suite for masterReleaseBoundary |
| `server/tests/masterReviewSafety.test.js` | 19 | `.js` | test | No | Test suite for masterReviewSafety |
| `server/tests/masterSupportSafety.test.js` | 31 | `.js` | test | No | Test suite for masterSupportSafety |
| `server/tests/medicationNameSubdocument.test.js` | 101 | `.js` | test | No | Test suite for medicationNameSubdocument |
| `server/tests/medicationSafety.test.js` | 218 | `.js` | test | No | Test suite for medicationSafety |
| `server/tests/medicationSafetyWorkflow.test.js` | 351 | `.js` | test | No | Test suite for medicationSafetyWorkflow |
| `server/tests/mlStatusContract.test.js` | 156 | `.js` | test | No | Test suite for mlStatusContract |
| `server/tests/multiDiseaseOutbreakWorkflow.test.js` | 248 | `.js` | test | No | Test suite for multiDiseaseOutbreakWorkflow |
| `server/tests/notificationTransportOffline.test.js` | 94 | `.js` | test | No | Test suite for notificationTransportOffline |
| `server/tests/operatorKeyPolicy.test.js` | 118 | `.js` | test | No | Test suite for operatorKeyPolicy |
| `server/tests/outbreakAlertLifecycle.test.js` | 366 | `.js` | test | No | Test suite for outbreakAlertLifecycle |
| `server/tests/outbreakForecasting.test.js` | 308 | `.js` | test | No | Test suite for outbreakForecasting |
| `server/tests/outbreakNotificationPipeline.test.js` | 210 | `.js` | test | No | Mock models |
| `server/tests/passwordAttemptPolicy.test.js` | 97 | `.js` | test | No | Load the existing inert controller harness, substituting candidate source and |
| `server/tests/passwordRecoveryAuthOffline.test.js` | 396 | `.js` | test | No | Phase 5 (AUTH) Password UX & Cryptographic Forgot-Password Flow Offline Test Suite |
| `server/tests/patientProfileOwnedIntegration.test.js` | 35 | `.js` | test | YES (PINNED) | Test suite for patientProfileOwnedIntegration |
| `server/tests/patientRouteIdentityHotfix.test.js` | 76 | `.js` | test | No | Test suite for patientRouteIdentityHotfix |
| `server/tests/pdfGeneratorPhase6.test.js` | 396 | `.js` | test | No | MediSync Stage 7 PDF Generation Engine Unit & Regression Suite |
| `server/tests/permissionsPolicyHeaderS11.test.js` | 52 | `.js` | test | No | Extract the Client Hints / Permissions-Policy middleware block from app.js |
| `server/tests/pharmacyInventoryRemediation.test.js` | 2 | `.js` | test | No | Phase 5W: isolated, owned fixtures and transaction failure/concurrency coverage. |
| `server/tests/phase0LoginDiagnostics.test.js` | 208 | `.js` | test | No | Execute the current controller with actual crypto libraries and inert repositories. |
| `server/tests/phase0SafeDiagnostics.test.js` | 115 | `.js` | test | No | Test suite for phase0SafeDiagnostics |
| `server/tests/phase1DoctorAiColdStart.test.js` | 265 | `.js` | test | No | Test suite for phase1DoctorAiColdStart |
| `server/tests/phase1MedicineSafetyRules.test.js` | 140 | `.js` | test | No | Test suite for phase1MedicineSafetyRules |
| `server/tests/phase2ConsultationEmailAndPdf.test.js` | 367 | `.js` | test | No | Test suite for phase2ConsultationEmailAndPdf |
| `server/tests/phase2VerificationTokenAndHistoryGate.test.js` | 330 | `.js` | test | No | Test suite for phase2VerificationTokenAndHistoryGate |
| `server/tests/phase3GroupingAndDispensingSeeder.test.js` | 308 | `.js` | test | No | Test suite for phase3GroupingAndDispensingSeeder |
| `server/tests/phase4AdminOutbreakMlAndSessions.test.js` | 403 | `.js` | test | No | Test suite for phase4AdminOutbreakMlAndSessions |
| `server/tests/phase5PopulationIncidence.test.js` | 96 | `.js` | test | No | Test suite for phase5PopulationIncidence |
| `server/tests/phase5wPharmacy.cases.js` | 132 | `.js` | test | No | Real restricted Atlas transactions; all mutable fixtures belong to this run. |
| `server/tests/phase6OutbreakScenariosOffline.test.js` | 84 | `.js` | test | No | Phase 6 Synthetic Outbreak Scenarios Offline Verification Suite |
| `server/tests/phaseD2DiseaseSymptomKbOffline.test.js` | 114 | `.js` | test | No | Phase D2b Offline Regression Test: Sourced Disease-Symptom Knowledge Base |
| `server/tests/phaseD4NonProfiledConsultationOffline.test.js` | 95 | `.js` | test | No | Phase D4 Offline Regression Test: Doctor/Patient UX for "Any Disease" |
| `server/tests/phaseD5GenericSurveillanceOffline.test.js` | 136 | `.js` | test | No | Phase D5 Generic Surveillance for Any ICD Code Offline Regression Suite |
| `server/tests/postR2LocalReadiness.test.js` | 85 | `.js` | test | No | Test suite for postR2LocalReadiness |
| `server/tests/preflightProduction.test.js` | 322 | `.js` | test | No | Test suite for preflightProduction |
| `server/tests/prescriptionDurationOwnedIntegration.test.js` | 32 | `.js` | test | YES (PINNED) | Test suite for prescriptionDurationOwnedIntegration |
| `server/tests/prescriptionPdfHoldResponse.test.js` | 122 | `.js` | test | No | Run the actual controller and PDF hold with inert repositories and delivery boundaries. |
| `server/tests/productionAccountAndProfile.test.js` | 24 | `.js` | test | No | Test suite for productionAccountAndProfile |
| `server/tests/productionArtifactPins.test.js` | 14 | `.js` | test | No | Test suite for productionArtifactPins |
| `server/tests/productionAtlasAdmission.test.js` | 67 | `.js` | test | No | Test suite for productionAtlasAdmission |
| `server/tests/productionAtlasDiagnostic.test.js` | 92 | `.js` | test | No | Test suite for productionAtlasDiagnostic |
| `server/tests/productionPublicIsolation.test.js` | 8 | `.js` | test | No | Test suite for productionPublicIsolation |
| `server/tests/productionStorageAdmission.test.js` | 275 | `.js` | test | No | Test suite for productionStorageAdmission |
| `server/tests/provisionProductionStorage.test.js` | 41 | `.js` | test | No | Test suite for provisionProductionStorage |
| `server/tests/publicActivityLiveVerification.test.js` | 20 | `.js` | test | No | Test suite for publicActivityLiveVerification |
| `server/tests/publicBootstrapPublication.test.js` | 50 | `.js` | test | No | Test suite for publicBootstrapPublication |
| `server/tests/publicCachePrefixPatch.test.js` | 47 | `.js` | test | No | server/tests/publicCachePrefixPatch.test.js |
| `server/tests/publicConsultationActivity.test.js` | 119 | `.js` | test | No | Test suite for publicConsultationActivity |
| `server/tests/publicHealthMongo.test.js` | 256 | `.js` | test | No | Test suite for publicHealthMongo |
| `server/tests/publicLabStatusRateLimitS6.test.js` | 77 | `.js` | test | No | Test suite for publicLabStatusRateLimitS6 |
| `server/tests/publicListingRateLimitS5.test.js` | 91 | `.js` | test | No | Test suite for publicListingRateLimitS5 |
| `server/tests/qaAdmissionNegative.test.js` | 62 | `.js` | test | No | Test suite for qaAdmissionNegative |
| `server/tests/qaEncryptionBootstrap.test.js` | 152 | `.js` | test | No | Test suite for qaEncryptionBootstrap |
| `server/tests/qaNativeDriverPolicy.test.js` | 214 | `.js` | test | No | Test suite for qaNativeDriverPolicy |
| `server/tests/qaProcessOrchestration.test.js` | 154 | `.js` | test | No | Test suite for qaProcessOrchestration |
| `server/tests/qaTrustLedger.test.js` | 232 | `.js` | test | No | Test suite for qaTrustLedger |
| `server/tests/realIntegrationTransport.test.js` | 38 | `.js` | test | No | Test suite for realIntegrationTransport |
| `server/tests/registrationRateLimitS2.test.js` | 98 | `.js` | test | No | Test suite for registrationRateLimitS2 |
| `server/tests/reminderDispatchSafety.test.js` | 29 | `.js` | test | No | Test suite for reminderDispatchSafety |
| `server/tests/removeDemoBatchOffline.test.js` | 204 | `.js` | test | No | Test suite for removeDemoBatchOffline |
| `server/tests/runtimeHealthRevision.test.js` | 25 | `.js` | test | No | Test suite for runtimeHealthRevision |
| `server/tests/seedDemoOutbreakOffline.test.js` | 432 | `.js` | test | No | server/tests/seedDemoOutbreakOffline.test.js |
| `server/tests/seedPlatformData.test.js` | 163 | `.js` | test | No | Test suite for seedPlatformData |
| `server/tests/seedPlatformPlan.test.js` | 209 | `.js` | test | No | Test suite for seedPlatformPlan |
| `server/tests/seedSnapshotIdempotency.test.js` | 90 | `.js` | test | No | Test suite for seedSnapshotIdempotency |
| `server/tests/sriLankaTime.test.js` | 50 | `.js` | test | No | Test suite for sriLankaTime |
| `server/tests/stagingDbGuardAdversarial.test.js` | 189 | `.js` | test | No | MediSync — Staging Database Guard Adversarial Test Suite |
| `server/tests/stagingSocketAndAnalyticsIntegration.test.js` | 328 | `.js` | test | No | MediSync Staging Integration Test Suite (Stage 3 & Stage 4) |
| `server/tests/surveillanceOutbreakDetector.test.js` | 321 | `.js` | test | No | server/tests/surveillanceOutbreakDetector.test.js |
| `server/tests/surveillancePolicy.test.js` | 28 | `.js` | test | No | Test suite for surveillancePolicy |
| `server/tests/surveillanceWorkflow.test.js` | 54 | `.js` | test | No | Test suite for surveillanceWorkflow |
| `server/tests/tempDirsOutsideRepo.test.js` | 72 | `.js` | test | No | Test suite for tempDirsOutsideRepo |
| `server/tests/test-registration.http` | 90 | `.http` | test | No | MediSync Backend Registration API Tests |
| `server/tests/testMatrixInventory.test.js` | 55 | `.js` | test | No | Test suite for testMatrixInventory |
| `server/tests/testOtpRemovalOffline.test.js` | 276 | `.js` | test | No | Verification Test Suite: Complete Removal of Test OTP Harness and Bypass Logic |
| `server/tests/test_api.js` | 404 | `.js` | test | No | test_api.js — node test_api.js |
| `server/tests/test_lab_fetch.js` | 18 | `.js` | test | No | Test suite for test_lab_fetch.js |
| `server/tests/test_ml.js` | [binary] | `.js` | test | No | Test suite for test_ml.js |
| `server/tests/test_overlap_fix.js` | 57 | `.js` | test | No | Initialize master key in global for versioned encryption |
| `server/tests/test_rate_limit.js` | 40 | `.js` | test | No | Test suite for test_rate_limit.js |
| `server/tests/u2DrugCatalogAndSafety.test.js` | 73 | `.js` | test | No | Test suite for u2DrugCatalogAndSafety |
| `server/tests/universityDemoSeedVerify.test.js` | 280 | `.js` | test | YES (PINNED) | Test suite for universityDemoSeedVerify |
| `server/tests/universityPatientProfile.test.js` | 86 | `.js` | test | No | Test suite for universityPatientProfile |
| `server/tests/universityPublicPrivacy.test.js` | 31 | `.js` | test | No | Test suite for universityPublicPrivacy |
| `server/tests/verifyCrossDomainCoverage.js` | 32 | `.js` | test | No | Test suite for verifyCrossDomainCoverage.js |
| `server/tests/websiteClinicalContracts.test.js` | 9 | `.js` | test | No | Test suite for websiteClinicalContracts |
| `server/tests/websiteHospitalDoctorLink.test.js` | 15 | `.js` | test | No | Test suite for websiteHospitalDoctorLink |
| `server/tests/websiteNotifications.test.js` | 9 | `.js` | test | No | Test suite for websiteNotifications |
| `server/tests/websiteReferencePackaging.test.js` | 53 | `.js` | test | No | Test suite for websiteReferencePackaging |


## Client Application (`client/src/`) (140 files)

| Path | LOC | Type | Role | Protected? | Purpose & Key Responsibilities |
|---|:---:|:---:|:---:|:---:|---|
| `client/src/App.js` | 258 | `.js` | runtime | No | ─── Lazy-loaded route components ────────────────────────────────────────── |
| `client/src/UniversityApp.jsx` | 240 | `.jsx` | runtime | No | Application component module |
| `client/src/api/axiosInstance.js` | 248 | `.js` | runtime | No | Application component module |
| `client/src/api/usePublicDirectory.js` | 28 | `.js` | runtime | No | Application component module |
| `client/src/components/BanNotice.jsx` | 110 | `.jsx` | runtime | No | BanNotice — Full-screen ban overlay |
| `client/src/components/DiseaseCombobox.jsx` | 177 | `.jsx` | runtime | No | Application component module |
| `client/src/components/DrugSearchInput.jsx` | 533 | `.jsx` | runtime | No | Curated offline fallback catalog with name, genericName, brand, category, commonDosages, and triling |
| `client/src/components/Modal.jsx` | 59 | `.jsx` | runtime | No | Application component module |
| `client/src/components/PatientAccessModal.jsx` | 254 | `.jsx` | runtime | No | PatientAccessModal — OTP verification for accessing patient records |
| `client/src/components/SymptomTagInput.jsx` | 200 | `.jsx` | runtime | YES (PINNED) | SymptomTagInput |
| `client/src/components/TrustedDevices.jsx` | 484 | `.jsx` | runtime | No | Application component module |
| `client/src/components/auth/PrivateRoute.jsx` | 33 | `.jsx` | runtime | No | Case-insensitive role check |
| `client/src/components/common/ActiveOutbreakBanner.jsx` | 119 | `.jsx` | runtime | No | ActiveOutbreakBanner |
| `client/src/components/common/AnimatedBackground.jsx` | 55 | `.jsx` | runtime | No | Application component module |
| `client/src/components/common/ChangePasswordCard.jsx` | 158 | `.jsx` | runtime | No | Application component module |
| `client/src/components/common/DirectoryLoadError.jsx` | 12 | `.jsx` | runtime | No | Application component module |
| `client/src/components/common/GeographicMap.jsx` | 184 | `.jsx` | runtime | No | Fix for default marker icons in React Leaflet |
| `client/src/components/common/GlassButton.jsx` | 51 | `.jsx` | runtime | No | Application component module |
| `client/src/components/common/GlassCard.jsx` | 32 | `.jsx` | runtime | No | Application component module |
| `client/src/components/common/GlassInput.jsx` | 33 | `.jsx` | runtime | No | Application component module |
| `client/src/components/common/HistoryErrorBoundary.jsx` | 83 | `.jsx` | runtime | No | HistoryErrorBoundary |
| `client/src/components/common/IdleTimer.jsx` | 68 | `.jsx` | runtime | No | Application component module |
| `client/src/components/common/LabDetailModal.jsx` | 124 | `.jsx` | runtime | No | Application component module |
| `client/src/components/common/LabReportDownloadButton.jsx` | 64 | `.jsx` | runtime | No | 1. Zero Tests: Hide button completely |
| `client/src/components/common/LanguagePreferenceCard.jsx` | 294 | `.jsx` | runtime | No | LanguagePreferenceCard — Enterprise trilingual preference selector |
| `client/src/components/common/LanguageSwitcher.jsx` | 56 | `.jsx` | runtime | No | Application component module |
| `client/src/components/common/LoginOtpStep.jsx` | 217 | `.jsx` | runtime | No | Application component module |
| `client/src/components/common/LoginShell.jsx` | 109 | `.jsx` | runtime | No | Application component module |
| `client/src/components/common/MedicalTimeline.jsx` | 407 | `.jsx` | runtime | No | Application component module |
| `client/src/components/common/MedicineSafetyPanel.jsx` | 182 | `.jsx` | runtime | No | Application component module |
| `client/src/components/common/NotificationBell.jsx` | 296 | `.jsx` | runtime | No | Application component module |
| `client/src/components/common/NotificationToast.jsx` | 24 | `.jsx` | runtime | No | Application component module |
| `client/src/components/common/PageTransition.jsx` | 18 | `.jsx` | runtime | No | Application component module |
| `client/src/components/common/PasswordCriteriaTips.jsx` | 109 | `.jsx` | runtime | No | PasswordCriteriaTips |
| `client/src/components/common/PasswordField.jsx` | 64 | `.jsx` | runtime | No | PasswordField |
| `client/src/components/common/PasswordInput.jsx` | 128 | `.jsx` | runtime | No | PasswordInput |
| `client/src/components/common/PasswordStrengthMeter.jsx` | 77 | `.jsx` | runtime | No | PasswordStrengthMeter |
| `client/src/components/common/PublicNavbar.jsx` | 98 | `.jsx` | runtime | No | Application component module |
| `client/src/components/common/Sidebar.jsx` | 285 | `.jsx` | runtime | No | Sidebar — Premium glassmorphic navigation rail (components/common/Sidebar) |
| `client/src/components/common/StatCard.jsx` | 132 | `.jsx` | runtime | No | StatCard — Premium glassmorphic KPI tile  (common/StatCard) |
| `client/src/components/common/UniversityRuntimeBoundary.jsx` | 17 | `.jsx` | runtime | No | Application component module |
| `client/src/components/ui/AppShell.jsx` | 88 | `.jsx` | runtime | No | Map role to Sidebar's themePrefix and titles |
| `client/src/components/ui/EmptyState.jsx` | 35 | `.jsx` | runtime | No | Application component module |
| `client/src/components/ui/Modal.jsx` | 65 | `.jsx` | runtime | No | Application component module |
| `client/src/components/ui/OtpInput.jsx` | 159 | `.jsx` | runtime | No | Application component module |
| `client/src/components/ui/Skeleton.jsx` | 44 | `.jsx` | runtime | No | Application component module |
| `client/src/components/ui/StatusBadge.jsx` | 88 | `.jsx` | runtime | No | Application component module |
| `client/src/components/ui/Toast.jsx` | 57 | `.jsx` | runtime | No | Application component module |
| `client/src/config/clinicalEndpoints.js` | 23 | `.js` | dev-only | No | Public build configuration only. Never include credentials in browser URLs. |
| `client/src/config/productionClientPolicy.js` | 6 | `.js` | dev-only | No | Application component module |
| `client/src/context/PatientAccessContext.jsx` | 65 | `.jsx` | runtime | No | Shared in-memory state: { nic: string, patientName: string, token: string, expiresAt: number } | nul |
| `client/src/data/districtPopulation2024.json` | 36 | `.json` | data | No | Configuration / reference data payload for districtPopulation2024.json |
| `client/src/hooks/useModalFocus.js` | 45 | `.js` | runtime | No | Shared across both modal variants: only the top dialog handles keyboard input. |
| `client/src/hooks/usePatientConsent.js` | 59 | `.js` | runtime | No | JWT expiry is a UI timer only. Every read still requires server authorization. |
| `client/src/hooks/useSubmissionLock.js` | 15 | `.js` | runtime | No | Loading state renders feedback; a synchronous lock also covers two events |
| `client/src/i18n/LanguageContext.jsx` | 104 | `.jsx` | runtime | No | Application component module |
| `client/src/i18n/translations/en.js` | 860 | `.js` | runtime | No | English UI Dictionary (en) |
| `client/src/i18n/translations/si.js` | 860 | `.js` | runtime | No | Sinhala UI Dictionary (si) |
| `client/src/i18n/translations/ta.js` | 860 | `.js` | runtime | No | Tamil UI Dictionary (ta) |
| `client/src/index.css` | 402 | `.css` | runtime | No | ─── Fonts ───────────────────────────────────────────────────────────────── */ |
| `client/src/index.js` | 33 | `.js` | runtime | No | Application component module |
| `client/src/pages/Home.jsx` | 233 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/Login.jsx` | 82 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/SelectRole.jsx` | 136 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/admin/AnalyticsDashboard.jsx` | 256 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/admin/BanManagement.jsx` | 364 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/admin/Broadcast.jsx` | 312 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/admin/Dashboard.jsx` | 942 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/admin/Login.jsx` | 199 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/admin/ManageAdmins.jsx` | 192 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/admin/OutbreakMonitor.jsx` | 824 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/admin/SessionMonitor.jsx` | 546 | `.jsx` | runtime | No | Helpers --- |
| `client/src/pages/admin/SupportTicketsRoster.jsx` | 210 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/admin/UserAuditProfile.jsx` | 493 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/admin/UserManagement.jsx` | 236 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/auth/Register.jsx` | 320 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/auth/RegistrationEntry.jsx` | 15 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/common/ResetPassword.jsx` | 3 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/common/UniversityWorkspace.jsx` | 44 | `.jsx` | runtime | No | Restricted view in the real application; no clinical write/upload controls. |
| `client/src/pages/dev/StyleGuide.jsx` | 240 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/doctor/ChangeOrgPassword.jsx` | 213 | `.jsx` | runtime | No | ChangeOrgPassword — Change hospital org login password on first login |
| `client/src/pages/doctor/Dashboard.jsx` | 199 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/doctor/DoctorRoleSelection.jsx` | 120 | `.jsx` | runtime | No | DoctorRoleSelection — Step 1 of doctor login flow |
| `client/src/pages/doctor/Login.jsx` | 238 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/doctor/NewConsultation.jsx` | 1737 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/doctor/PatientDetail.jsx` | 481 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/doctor/Profile.jsx` | 497 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/doctor/Register.jsx` | 279 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/hospital/Dashboard.jsx` | 503 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/hospital/LabManagement.jsx` | 882 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/hospital/Login.jsx` | 185 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/hospital/Register.jsx` | 290 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/patient/Dashboard.jsx` | 489 | `.jsx` | runtime | No | Calendar kept for the Follow-up card below |
| `client/src/pages/patient/History.jsx` | 944 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/patient/Login.jsx` | 190 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/patient/Prescriptions.jsx` | 372 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/patient/Profile.jsx` | 645 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/patient/RateConsultationModal.jsx` | 293 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/patient/Register.jsx` | 333 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/patient/Support.jsx` | 208 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/pharmacy/Dashboard.jsx` | 1798 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/pharmacy/Login.jsx` | 182 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/pharmacy/Register.jsx` | 290 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/public/DoctorDirectory.jsx` | 171 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/public/DoctorProfileModal.jsx` | 268 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/public/ForgotPassword.jsx` | 202 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/public/HospitalDirectory.jsx` | 177 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/public/HospitalProfileModal.jsx` | 282 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/public/NotFound.jsx` | 31 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/public/PharmacyDirectory.jsx` | 172 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/public/PharmacyProfileModal.jsx` | 266 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/public/PublicHealth.jsx` | 1027 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/public/ResetPassword.jsx` | 217 | `.jsx` | runtime | No | Application component module |
| `client/src/pages/public/VerifyConsultation.jsx` | 304 | `.jsx` | runtime | No | Application component module |
| `client/src/setupProxy.js` | 32 | `.js` | runtime | No | Application component module |
| `client/src/setupTests.js` | 50 | `.js` | runtime | No | Application component module |
| `client/src/universityIndex.jsx` | 30 | `.jsx` | runtime | No | Application component module |
| `client/src/utils/analytics.js` | 4 | `.js` | runtime | No | External page telemetry is disabled for the clinical application. Loading GA |
| `client/src/utils/clinicalSaveOutcome.js` | 6 | `.js` | runtime | No | A failed write response is not proof that the server rolled back. Preserve |
| `client/src/utils/cn.js` | 6 | `.js` | runtime | No | Application component module |
| `client/src/utils/consultationActivity.js` | 56 | `.js` | runtime | No | Project only the public activity contract. Never turn legacy case DTOs or |
| `client/src/utils/deviceFingerprint.js` | 117 | `.js` | runtime | No | Common Android model codes lookup table |
| `client/src/utils/districtAdjacency.js` | 224 | `.js` | runtime | No | 25-District Adjacency Topology, Name Normalization, and Spatial Clustering |
| `client/src/utils/districtClustering.js` | 306 | `.js` | runtime | No | 25 Administrative Districts of Sri Lanka grouped into 9 Provincial Clusters. |
| `client/src/utils/doctorName.js` | 50 | `.js` | runtime | No | client/src/utils/doctorName.js |
| `client/src/utils/doctorWorkspace.js` | 7 | `.js` | runtime | No | Application component module |
| `client/src/utils/inferenceResponse.js` | 35 | `.js` | runtime | No | Validate the existing ML percentage-valued similarity contract before display. Never coerce/clamp. |
| `client/src/utils/labTestFormatter.js` | 271 | `.js` | runtime | No | client/src/utils/labTestFormatter.js |
| `client/src/utils/medicationSafetyResponse.js` | 19 | `.js` | runtime | No | Validate the existing ingredientResolver DTO; never infer clinical safety |
| `client/src/utils/outbreakForecasting.js` | 429 | `.js` | runtime | No | Two-tailed Student's t critical values for alpha = 0.05 (95% CI) and alpha = 0.01 (99% CI) |
| `client/src/utils/passwordPolicy.js` | 137 | `.js` | runtime | No | passwordPolicy.js |
| `client/src/utils/patientPrescriptionStatus.js` | 162 | `.js` | runtime | No | Match the server's dispensable states. This is a display filter, not authority |
| `client/src/utils/pdfDownload.js` | 68 | `.js` | runtime | No | Application component module |
| `client/src/utils/pendingClinicalAttempt.js` | 26 | `.js` | runtime | No | Persist only an opaque operation reference, never a patient, token or draft. |
| `client/src/utils/populationIncidence.js` | 56 | `.js` | runtime | No | Application component module |
| `client/src/utils/prescriptionDuration.js` | 11 | `.js` | runtime | No | Serialize only the canonical numeric day count; keep each medicine independent. |
| `client/src/utils/safeSocketDisconnect.js` | 48 | `.js` | runtime | No | Safely disconnects a Socket.IO client instance without triggering |
| `client/src/utils/sessionCleanup.js` | 8 | `.js` | runtime | No | In-memory generation prevents an old refresh response restoring a logged-out session. |
| `client/src/utils/sriLankaTime.js` | 33 | `.js` | runtime | No | Presentation only: never changes a stored Date, UTC wire value or browser TZ. |
| `client/src/utils/trustedMapEmbed.js` | 7 | `.js` | runtime | No | Application component module |


## Client Master Offline Tests (`client/src/__master_offline__/`, `client/tests/`) (89 files)

| Path | LOC | Type | Role | Protected? | Purpose & Key Responsibilities |
|---|:---:|:---:|:---:|:---:|---|
| `client/src/__master_offline__/activityFixture.js` | 13 | `.js` | runtime | No | Application component module |
| `client/src/__master_offline__/admin-dashboard-socket.test.jsx` | 198 | `.jsx` | test | No | Test suite for admin-dashboard-socketx |
| `client/src/__master_offline__/admin-ml-status.test.jsx` | 39 | `.jsx` | test | No | Test suite for admin-ml-statusx |
| `client/src/__master_offline__/analytics-dashboard.test.jsx` | 152 | `.jsx` | test | No | Mock recharts to avoid SVG/DOM layout size warnings in jsdom |
| `client/src/__master_offline__/analytics.test.jsx` | 16 | `.jsx` | test | No | Test suite for analyticsx |
| `client/src/__master_offline__/app-recovery-states.test.jsx` | 61 | `.jsx` | test | No | Test suite for app-recovery-statesx |
| `client/src/__master_offline__/b1-ml-503-resilience.test.jsx` | 115 | `.jsx` | test | No | Test suite for b1-ml-503-resiliencex |
| `client/src/__master_offline__/b13-inference.test.jsx` | 26 | `.jsx` | test | No | Test suite for b13-inferencex |
| `client/src/__master_offline__/b2-drug-suggestions-trilingual.test.jsx` | 115 | `.jsx` | test | No | Test suite for b2-drug-suggestions-trilingualx |
| `client/src/__master_offline__/c4-ai-resilience.test.jsx` | 73 | `.jsx` | test | No | Test suite for c4-ai-resiliencex |
| `client/src/__master_offline__/chunk-reload-resilience.test.jsx` | 109 | `.jsx` | test | No | Test suite for chunk-reload-resiliencex |
| `client/src/__master_offline__/clinical-release.test.jsx` | 20 | `.jsx` | test | No | Test suite for clinical-releasex |
| `client/src/__master_offline__/consent.test.jsx` | 56 | `.jsx` | test | No | Test suite for consentx |
| `client/src/__master_offline__/consolidated-notifications.test.jsx` | 223 | `.jsx` | test | No | Test suite for consolidated-notificationsx |
| `client/src/__master_offline__/consultation-409-resilience.test.jsx` | 300 | `.jsx` | test | No | Test suite for consultation-409-resiliencex |
| `client/src/__master_offline__/d4-any-disease-coverage.test.jsx` | 46 | `.jsx` | test | No | Test suite for d4-any-disease-coveragex |
| `client/src/__master_offline__/dashboards.test.jsx` | 41 | `.jsx` | test | No | Test suite for dashboardsx |
| `client/src/__master_offline__/directory-availability.test.jsx` | 22 | `.jsx` | test | No | Test suite for directory-availabilityx |
| `client/src/__master_offline__/directory-keyboard.test.jsx` | 39 | `.jsx` | test | No | Test suite for directory-keyboardx |
| `client/src/__master_offline__/district-display-format.test.jsx` | 111 | `.jsx` | test | No | Test suite for district-display-formatx |
| `client/src/__master_offline__/districtClustering.test.js` | 119 | `.js` | test | No | Test suite for districtClustering |
| `client/src/__master_offline__/drug-safety-response.test.jsx` | 46 | `.jsx` | test | No | Test suite for drug-safety-responsex |
| `client/src/__master_offline__/drug-search-dropdown-u1.test.jsx` | 164 | `.jsx` | test | No | Test suite for drug-search-dropdown-u1x |
| `client/src/__master_offline__/drug-search-input.test.jsx` | 171 | `.jsx` | test | No | Test suite for drug-search-inputx |
| `client/src/__master_offline__/drug-search-stress.test.jsx` | 242 | `.jsx` | test | No | Test suite for drug-search-stressx |
| `client/src/__master_offline__/gate3-socket-parser.test.js` | 21 | `.js` | test | No | Test suite for gate3-socket-parser |
| `client/src/__master_offline__/history-recovery-privacy.test.jsx` | 27 | `.jsx` | test | No | Test suite for history-recovery-privacyx |
| `client/src/__master_offline__/hospital-lab-otp-u6.test.jsx` | 256 | `.jsx` | test | No | Mock API instance |
| `client/src/__master_offline__/icd-and-lab-autocomplete.test.jsx` | 169 | `.jsx` | test | No | Test suite for icd-and-lab-autocompletex |
| `client/src/__master_offline__/lab-button-i18n.test.jsx` | 149 | `.jsx` | test | No | Mock API instance |
| `client/src/__master_offline__/lab-test-rendering-regression.test.jsx` | 739 | `.jsx` | test | No | Test suite for lab-test-rendering-regressionx |
| `client/src/__master_offline__/language-preference.test.jsx` | 215 | `.jsx` | test | No | Test suite for language-preferencex |
| `client/src/__master_offline__/login-submit-lock.test.jsx` | 51 | `.jsx` | test | No | This inert OTP boundary exposes callbacks; the real page owns the lock. |
| `client/src/__master_offline__/map-record-provenance.test.jsx` | 26 | `.jsx` | test | No | Test suite for map-record-provenancex |
| `client/src/__master_offline__/master-public-contracts.test.jsx` | 45 | `.jsx` | test | No | Test suite for master-public-contractsx |
| `client/src/__master_offline__/min-font-size.test.js` | 174 | `.js` | test | No | Master Offline Suite: Item U22 - Tiny Text Font Size Minimums (WCAG 1.4.4 Compliance) |
| `client/src/__master_offline__/modal-and-roles.test.jsx` | 25 | `.jsx` | test | No | Test suite for modal-and-rolesx |
| `client/src/__master_offline__/motion.js` | 4 | `.js` | runtime | No | Application component module |
| `client/src/__master_offline__/new-consultation-stress.test.jsx` | 294 | `.jsx` | test | No | Test suite for new-consultation-stressx |
| `client/src/__master_offline__/not-found.test.jsx` | 76 | `.jsx` | test | No | Test suite for not-foundx |
| `client/src/__master_offline__/notice-removal.test.jsx` | 34 | `.jsx` | test | No | Test suite for notice-removalx |
| `client/src/__master_offline__/notification-bell-responsive.test.jsx` | 283 | `.jsx` | test | No | Test suite for notification-bell-responsivex |
| `client/src/__master_offline__/notification-bell-sidebar.test.jsx` | 374 | `.jsx` | test | No | Test suite for notification-bell-sidebarx |
| `client/src/__master_offline__/optional-client-diagnostics.test.jsx` | 62 | `.jsx` | test | No | Test suite for optional-client-diagnosticsx |
| `client/src/__master_offline__/otp-input.test.jsx` | 5 | `.jsx` | test | No | Test suite for otp-inputx |
| `client/src/__master_offline__/outbreak-alert-actions.test.jsx` | 135 | `.jsx` | test | No | Test suite for outbreak-alert-actionsx |
| `client/src/__master_offline__/outbreak-forecast.test.jsx` | 14 | `.jsx` | test | No | Test suite for outbreak-forecastx |
| `client/src/__master_offline__/outbreak-map-clustering.test.jsx` | 144 | `.jsx` | test | No | Test suite for outbreak-map-clusteringx |
| `client/src/__master_offline__/password-strength-fill.test.jsx` | 205 | `.jsx` | test | No | Mock axios instance for ChangeOrgPassword |
| `client/src/__master_offline__/password-ux-recovery.test.jsx` | 336 | `.jsx` | test | No | Test suite for password-ux-recoveryx |
| `client/src/__master_offline__/patient-login-identity.test.jsx` | 71 | `.jsx` | test | No | The real page owns session completion; only the OTP transport control is inert. |
| `client/src/__master_offline__/patient-prescription-status.test.jsx` | 26 | `.jsx` | test | No | Test suite for patient-prescription-statusx |
| `client/src/__master_offline__/pdf-disabled-state.test.jsx` | 80 | `.jsx` | test | No | Test suite for pdf-disabled-statex |
| `client/src/__master_offline__/pdf-hold-label-locales.test.jsx` | 15 | `.jsx` | test | No | Test suite for pdf-hold-label-localesx |
| `client/src/__master_offline__/pending-clinical-attempt.test.jsx` | 9 | `.jsx` | test | No | Test suite for pending-clinical-attemptx |
| `client/src/__master_offline__/pharmacy-consent-flow.test.jsx` | 144 | `.jsx` | test | No | Test suite for pharmacy-consent-flowx |
| `client/src/__master_offline__/pharmacy-consent-u7.test.jsx` | 102 | `.jsx` | test | No | Test suite for pharmacy-consent-u7x |
| `client/src/__master_offline__/pharmacy-profile-modal-accessibility.test.jsx` | 37 | `.jsx` | test | No | Test suite for pharmacy-profile-modal-accessibilityx |
| `client/src/__master_offline__/pharmacy-settings-integrations.test.jsx` | 48 | `.jsx` | test | No | Test suite for pharmacy-settings-integrationsx |
| `client/src/__master_offline__/phase0-login-banner.test.jsx` | 34 | `.jsx` | test | No | Test suite for phase0-login-bannerx |
| `client/src/__master_offline__/phase1-cold-start-resilience.test.jsx` | 156 | `.jsx` | test | No | Test suite for phase1-cold-start-resiliencex |
| `client/src/__master_offline__/phase3-acceptance.test.jsx` | 221 | `.jsx` | test | No | Test suite for phase3-acceptancex |
| `client/src/__master_offline__/phase4-ui-polish.test.jsx` | 171 | `.jsx` | test | No | Test suite for phase4-ui-polishx |
| `client/src/__master_offline__/phase7-form-accessibility.test.jsx` | 100 | `.jsx` | test | No | Test suite for phase7-form-accessibilityx |
| `client/src/__master_offline__/public-consultation-activity.test.jsx` | 95 | `.jsx` | test | No | Test suite for public-consultation-activityx |
| `client/src/__master_offline__/public-health-retry.test.jsx` | 88 | `.jsx` | test | No | Test suite for public-health-retryx |
| `client/src/__master_offline__/public-health-suppression.test.jsx` | 56 | `.jsx` | test | No | Leaflet's layer event interface is inert; the actual MapController handlers, |
| `client/src/__master_offline__/route-error-locale.test.jsx` | 47 | `.jsx` | test | No | Test suite for route-error-localex |
| `client/src/__master_offline__/router-integration.test.jsx` | 294 | `.jsx` | test | No | Use the genuine installed routing library implementation (react-router) |
| `client/src/__master_offline__/router.js` | 10 | `.js` | runtime | No | Express route definitions for router.js |
| `client/src/__master_offline__/safe-socket-disconnect.test.js` | 102 | `.js` | test | No | Test suite for safe-socket-disconnect |
| `client/src/__master_offline__/sensitive-logging.test.jsx` | 263 | `.jsx` | test | No | Test suite for sensitive-loggingx |
| `client/src/__master_offline__/session-races.test.jsx` | 122 | `.jsx` | test | No | Test suite for session-racesx |
| `client/src/__master_offline__/setup.js` | 5 | `.js` | runtime | No | Application component module |
| `client/src/__master_offline__/sri-lanka-time.test.jsx` | 36 | `.jsx` | test | No | Test suite for sri-lanka-timex |
| `client/src/__master_offline__/symptom-tag-input.test.jsx` | 114 | `.jsx` | test | No | Test suite for symptom-tag-inputx |
| `client/src/__master_offline__/tailwind-undefined-classes.test.js` | 231 | `.js` | test | No | Master Offline Suite: Item U23 - Undefined Tailwind Classes & Design System Tokens |
| `client/src/__master_offline__/takeover-privacy-and-roles.test.jsx` | 32 | `.jsx` | test | No | Test suite for takeover-privacy-and-rolesx |
| `client/src/__master_offline__/university-runtime-boundary.test.jsx` | 10 | `.jsx` | test | No | Test suite for university-runtime-boundaryx |
| `client/src/__master_offline__/university-workspace.test.jsx` | 18 | `.jsx` | test | No | Test suite for university-workspacex |
| `client/src/__master_offline__/website-hospital-link.test.jsx` | 21 | `.jsx` | test | No | Test suite for website-hospital-linkx |
| `client/src/__master_offline__/website-notifications.test.jsx` | 72 | `.jsx` | test | No | Test suite for website-notificationsx |
| `client/tests/e2-five-role-master.spec.js` | 146 | `.js` | test | No | MEDISYNC — Master Five-Role E2 Browser Verification Suite |
| `client/tests/ir04-isolated-five-role-e2e.spec.js` | 448 | `.js` | test | YES (PINNED) | MEDISYNC — IR-04 Phase 4: Isolated 5-Role Playwright E2E Suite |
| `client/tests/medisync-e2e-walkthrough.spec.js` | 602 | `.js` | test | No | MediSync Full E2E Walkthrough Test Suite |
| `client/tests/medisync-live.spec.js` | 1165 | `.js` | test | No | npx playwright test --headed |
| `client/tests/medisync-med-suggestions.spec.js` | 160 | `.js` | test | No | MediSync E2E Test Suite — AI Medication Suggestions & Safety Checks |
| `client/tests/phase5xD3UiCoveragePlan.js` | 21 | `.js` | test | No | Source-audited future coverage contract. Data only; never drives a browser. |
| `client/tests/phase5xD7AUiCoveragePlan.js` | 36 | `.js` | test | No | Data-only preparation. No Playwright import, hooks, actors, network or database. |


## Client Public & Build Scripts (`client/public/`, `client/scripts/`, `client/*`) (28 files)

| Path | LOC | Type | Role | Protected? | Purpose & Key Responsibilities |
|---|:---:|:---:|:---:|:---:|---|
| `client/.dockerignore` | 7 | `[none]` | runtime | No | Application component module |
| `client/.env.example` | 8 | `.example` | runtime | No | ============================================================== |
| `client/.env.production` | 4 | `.production` | runtime | No | Application component module |
| `client/.gitignore` | 23 | `[none]` | runtime | No | See https://help.github.com/articles/ignoring-files/ for more about ignoring files. |
| `client/Dockerfile` | 11 | `[none]` | runtime | No | Application component module |
| `client/README.md` | 17 | `.md` | runtime | No | MediSync - Client (Frontend) |
| `client/master.offline.jest.cjs` | 2 | `.cjs` | runtime | No | Direct Jest only: CRA scripts/config/paths (which load dotenv) are deliberately excluded. |
| `client/package-lock.json` | 18643 | `.json` | data | No | Configuration / reference data payload for package-lock.json |
| `client/package.json` | 73 | `.json` | data | No | Configuration / reference data payload for package.json |
| `client/playwright.master.config.js` | 38 | `.js` | dev-only | No | Playwright Master Configuration for MediSync Five-Role E2 Verification |
| `client/playwright.qa.config.js` | 9 | `.js` | dev-only | No | Prepared only; the selected spec still stops at its approval quarantine. |
| `client/postcss.config.js` | 6 | `.js` | dev-only | No | Application component module |
| `client/proxy_server.js` | 20 | `.js` | runtime | No | Proxy API requests |
| `client/public/favicon.ico` | [binary] | `.ico` | runtime | No | Application component module |
| `client/public/index.html` | 43 | `.html` | runtime | No | Application component module |
| `client/public/lk_districts.json` | 1 | `.json` | data | No | Configuration / reference data payload for lk_districts.json |
| `client/public/logo192.png` | [binary] | `.png` | runtime | No | Application component module |
| `client/public/logo512.png` | [binary] | `.png` | runtime | No | Application component module |
| `client/public/manifest.json` | 25 | `.json` | data | No | Configuration / reference data payload for manifest.json |
| `client/public/robots.txt` | 3 | `.txt` | runtime | No | https://www.robotstxt.org/robotstxt.html |
| `client/scripts/buildClinical.cjs` | 10 | `.cjs` | runtime | No | Use CRA's normal production env resolution before validating public endpoints. |
| `client/scripts/clinicalBuildPolicy.cjs` | 43 | `.cjs` | runtime | No | Application component module |
| `client/scripts/localQaPublicEnvironment.cjs` | 5 | `.cjs` | runtime | No | Application component module |
| `client/scripts/phase5xPublicSmoke.js` | 40 | `.js` | runtime | No | Non-mutating page-load verification only. Never run logins or API workflows here. |
| `client/scripts/startQa.js` | 14 | `.js` | runtime | No | React QA is bound to loopback and proxies only to the isolated Express server. |
| `client/scripts/universityReleaseContract.cjs` | 11 | `.cjs` | runtime | No | Application component module |
| `client/tailwind.config.js` | 75 | `.js` | dev-only | No | Application component module |
| `client/vercel.json` | 30 | `.json` | data | No | Configuration / reference data payload for vercel.json |


## Machine Learning Engine (`ml-engine/`) (56 files)

| Path | LOC | Type | Role | Protected? | Purpose & Key Responsibilities |
|---|:---:|:---:|:---:|:---:|---|
| `ml-engine/.dockerignore` | 19 | `[none]` | runtime | No | Application component module |
| `ml-engine/.env.example` | 3 | `.example` | runtime | No | Application component module |
| `ml-engine/Dockerfile` | 17 | `[none]` | runtime | No | Reviewed wheel set targets CPython 3.11 / Linux amd64. No floating apt or |
| `ml-engine/README.md` | 18 | `.md` | runtime | No | MediSync - ML Engine |
| `ml-engine/app.py` | 1777 | `.py` | runtime | YES (PINNED) | Load environment variables from .env file BEFORE doing anything else |
| `ml-engine/b13_offline_checks.py` | 143 | `.py` | runtime | No | Actual function ASTs and pure synthetic helpers only; never import app/evaluation startup.""" |
| `ml-engine/b13_r2_scoring_checks.py` | 229 | `.py` | runtime | No | Source extraction + synthetic arithmetic only. No app, sklearn, dataset or model imports.""" |
| `ml-engine/data/Symptom-severity.csv` | 134 | `.csv` | data | No | Application component module |
| `ml-engine/data/dataset.csv` | 4921 | `.csv` | data | No | Application component module |
| `ml-engine/data/disease_symptom_kb.v1.json` | 8240 | `.json` | data | No | Configuration / reference data payload for disease_symptom_kb.v1.json |
| `ml-engine/data/drugs_clean.json` | 36948 | `.json` | data | No | Configuration / reference data payload for drugs_clean.json |
| `ml-engine/data/icd10_clean.json` | 286818 | `.json` | data | No | Configuration / reference data payload for icd10_clean.json |
| `ml-engine/data/interactions_clean.json` | 1149248 | `.json` | data | No | Configuration / reference data payload for interactions_clean.json |
| `ml-engine/data/kb_quarantine.v1.json` | 6640 | `.json` | data | No | Configuration / reference data payload for kb_quarantine.v1.json |
| `ml-engine/data/medicine_safety_limits.json` | 48 | `.json` | data | No | Configuration / reference data payload for medicine_safety_limits.json |
| `ml-engine/data/srilanka_dengue_weekly.csv` | 3433 | `.csv` | data | No | Application component module |
| `ml-engine/data/symptom_Description.csv` | 42 | `.csv` | data | No | Application component module |
| `ml-engine/data/symptom_precaution.csv` | 42 | `.csv` | data | No | Application component module |
| `ml-engine/data/unmapped_diseases.v1.json` | 22155 | `.json` | data | No | Configuration / reference data payload for unmapped_diseases.v1.json |
| `ml-engine/data_pipeline/build_icd10_synonyms.py` | 352 | `.py` | runtime | No | Application component module |
| `ml-engine/data_pipeline/icd10_synonyms.v1.json` | 328 | `.json` | data | No | Configuration / reference data payload for icd10_synonyms.v1.json |
| `ml-engine/data_pipeline/ingest_disease_symptom_kb.py` | 517 | `.py` | runtime | No | Application component module |
| `ml-engine/data_pipeline/ingest_disease_symptom_kb_v2.py` | 412 | `.py` | runtime | No | Application component module |
| `ml-engine/data_pipeline/mapping_review.csv` | 666 | `.csv` | data | No | Application component module |
| `ml-engine/data_pipeline/raw/symcat_conditions.csv` | 20577 | `.csv` | data | No | Application component module |
| `ml-engine/evaluate_symptom_model.py` | 152 | `.py` | runtime | YES (PINNED) | Mongoose schema and data model for evaluate_symptom_model.py |
| `ml-engine/evaluation/generate_evaluation_charts.py` | 600 | `.py` | runtime | No | Application component module |
| `ml-engine/evaluation_partition.py` | 24 | `.py` | runtime | No | Synthetic split admission only. No real data access, training, randomness or independence claim.""" |
| `ml-engine/master_offline_checks.py` | 69 | `.py` | runtime | No | Extract only reviewed function ASTs. Never import app, dotenv, Flask, model or datasets.""" |
| `ml-engine/medisync.db` | [binary] | `.db` | data | No | Application component module |
| `ml-engine/preprocess_datasets.py` | 330 | `.py` | runtime | No | ───────────────────────────────────────────────────── |
| `ml-engine/reference-manifest.json` | 42 | `.json` | data | No | Configuration / reference data payload for reference-manifest.json |
| `ml-engine/reference_catalog.py` | 81 | `.py` | runtime | No | Read-only delivery/integrity checks for existing reference files, not clinical validation.""" |
| `ml-engine/requirements-artifacts.json` | 474 | `.json` | data | No | Configuration / reference data payload for requirements-artifacts.json |
| `ml-engine/requirements-tooling.lock` | 2 | `.lock` | runtime | No | Application component module |
| `ml-engine/requirements.lock` | 56 | `.lock` | runtime | No | Application component module |
| `ml-engine/requirements.txt` | 56 | `.txt` | runtime | No | Application component module |
| `ml-engine/risk_input.py` | 22 | `.py` | runtime | No | Pure validation for the existing four optional patient-risk fields; no clinical scoring changes.""" |
| `ml-engine/scripts/clinical_offline_tests.py` | 69 | `.py` | test | No | Actual Flask tests, with network, child processes and unowned SQLite denied.""" |
| `ml-engine/scripts/export_disease_rankings.py` | 96 | `.py` | runtime | No | 1. Load symptom_map.json (all 41 diseases) |
| `ml-engine/scripts/export_full_icd10_rankings.py` | 98 | `.py` | runtime | No | If base_dir is ml-engine, then project root is one level up |
| `ml-engine/scripts/find_geojson.py` | 16 | `.py` | runtime | No | We'll just look for standard paths like 'raw.githubusercontent.com/.../districts.geojson' |
| `ml-engine/scripts/seed_local_icd10.py` | 198 | `.py` | runtime | No | Explicit danger level mapping for MediSync's core 41 diseases |
| `ml-engine/scripts/seed_outbreak_data.py` | 137 | `.py` | runtime | No | Config |
| `ml-engine/scripts/seed_outbreak_test_scenarios.py` | 107 | `.py` | test | No | Load env from server directory |
| `ml-engine/scripts/seed_platform_contract.py` | 57 | `.py` | runtime | No | Owned offline adapter for the ACTUAL ML outbreak engineering heuristics. |
| `ml-engine/scripts/test_idx.py` | 10 | `.py` | test | No | Test suite for test_idx.py |
| `ml-engine/scripts/test_outbreak.py` | 51 | `.py` | test | No | Deprecated before imports or any network/storage operation. Historical code below |
| `ml-engine/scripts/test_outbreak_logic.py` | 173 | `.py` | test | No | Ensure app can be imported from ml-engine directory |
| `ml-engine/test_disease_symptom_kb.py` | 126 | `.py` | test | No | Test suite for test_disease_symptom_kb.py |
| `ml-engine/test_medication_safety.py` | 64 | `.py` | test | No | Test suite for test_medication_safety.py |
| `ml-engine/test_model_status_contract.py` | 56 | `.py` | test | No | Actual authenticated status route against this profile's fresh, empty SQLite.""" |
| `ml-engine/test_outbreak_ingestion.py` | 144 | `.py` | test | No | Real Flask/HMAC and owned SQLite tests; never imports production credentials.""" |
| `ml-engine/test_phase5w_runtime.py` | 49 | `.py` | test | No | Actual local Flask inference, not HTTP mocks or clinical accuracy validation.""" |
| `ml-engine/test_reference_catalog.py` | 85 | `.py` | test | No | Test suite for test_reference_catalog.py |
| `ml-engine/test_tiered_matcher.py` | 134 | `.py` | test | No | Test suite for test_tiered_matcher.py |


## Repository Scripts (`scripts/`) (56 files)

| Path | LOC | Type | Role | Protected? | Purpose & Key Responsibilities |
|---|:---:|:---:|:---:|:---:|---|
| `scripts/README.md` | 37 | `.md` | dev / script | No | MediSync — Operator Tooling & Automation Scripts |
| `scripts/adminSocketCleanupOffline.test.cjs` | 155 | `.cjs` | test | No | Explicit local browser qualification, not a production or clinical E2E test. |
| `scripts/agent_b_combined_boundary.cjs` | 39 | `.cjs` | dev / script | No | Verification-only preload. Never imported by the application. |
| `scripts/agent_b_combined_child.cjs` | 50 | `.cjs` | dev / script | No | Application component module |
| `scripts/agent_b_combined_test_boundary.cjs` | 16 | `.cjs` | test | No | Jest's module registry is separate from the preload registry. |
| `scripts/agent_b_pdf_stream_proof.cjs` | 86 | `.cjs` | dev / script | No | Verification-only synthetic artifact. Does not import the encryptor's key or |
| `scripts/agent_b_source_scope.cjs` | 7 | `.cjs` | dev / script | No | Shared pure snapshot classification. No filesystem/environment access. |
| `scripts/audit_ui_translations.js` | 124 | `.js` | dev / script | No | Static, privacy-safe inventory. Never execute locale modules or emit literal values. |
| `scripts/authenticatedSessionBrowser.cjs` | 131 | `.cjs` | dev / script | No | Browser test boundary, not application authorization. Never logs request data. |
| `scripts/authenticatedSessionPolicy.cjs` | 79 | `.cjs` | dev / script | No | Proposed browser-QA boundary only. No transport, credentials, environment |
| `scripts/backtest_c2_forecast.cjs` | 259 | `.cjs` | test | No | usr/bin/env node |
| `scripts/benchmark_ml_resources.py` | 122 | `.py` | dev / script | No | usr/bin/env python3 |
| `scripts/buildTestMatrix.cjs` | 184 | `.cjs` | dev / script | No | Source inventory only. Never imports application modules or opens a browser. |
| `scripts/checkRenderEnvironmentNames.cjs` | 69 | `.cjs` | dev / script | No | Names-only metadata linter. Never reads process.env, credential files or a URL. |
| `scripts/checkRenderEnvironmentNames.test.cjs` | 109 | `.cjs` | test | No | Test suite for checkRenderEnvironmentNames.test.cjs |
| `scripts/clinicalOfflineChild.cjs` | 26 | `.cjs` | dev / script | No | Application component module |
| `scripts/fixtures/adminSocketEffectBeforeSessionCleanup.cjs` | 9 | `.cjs` | dev / script | No | Frozen pre-fix production effect; offline synthetic transport replay only. |
| `scripts/generate_project_inventory.js` | 233 | `.js` | dev / script | No | usr/bin/env node |
| `scripts/liveVerificationReadOnly.cjs` | 120 | `.cjs` | dev / script | No | Read-only live verification policy. Never accepts an enable-write flag. |
| `scripts/notificationTransportPolicy.cjs` | 27 | `.cjs` | dev / script | No | Test transport boundary only; actual Socket.IO authorization remains server-side. |
| `scripts/qualifyOfflineUi.cjs` | 56 | `.cjs` | dev / script | No | Application component module |
| `scripts/realLocalStack.cjs` | 116 | `.cjs` | dev / script | No | No dotenv, application, provider or database imports before authorization. |
| `scripts/realLocalStack.test.cjs` | 105 | `.cjs` | test | No | Enroll names-only reconciliation/startup negatives in the existing CI root profile. |
| `scripts/refuseUnsafeRootStart.js` | 3 | `.js` | dev / script | No | Application component module |
| `scripts/remove_demo_batch.js` | 261 | `.js` | dev / script | No | scripts/remove_demo_batch.js |
| `scripts/run_e3_r2_http.js` | 761 | `.js` | dev / script | No | MediSync Phase 5X — Master Stage E3-R2 Live HTTP Clinical Integration Runner |
| `scripts/run_expanded_browser_tests.js` | 662 | `.js` | test | No | Expanded Playwright Mock Browser Automation & Interaction Suite |
| `scripts/run_offline_tests.js` | 156 | `.js` | test | No | Current clinical regression only. Each invocation retains its own receipts. |
| `scripts/run_strengthened_qa_evidence.js` | 295 | `.js` | dev / script | No | run_strengthened_qa_evidence.js |
| `scripts/seed-demo-outbreak.js` | 1082 | `.js` | dev / script | No | usr/bin/env node |
| `scripts/seed-dispensing-sample.js` | 362 | `.js` | dev / script | No | scripts/seed-dispensing-sample.js |
| `scripts/seed-platform-data.js` | 145 | `.js` | dev / script | No | Operator tool, never an application startup import or public endpoint. |
| `scripts/seedPlatformMemoryProof.cjs` | 9 | `.cjs` | dev / script | No | Application component module |
| `scripts/seedPlatformPlan.cjs` | 257 | `.cjs` | dev / script | No | Deterministic data only: no models, environment files, connections or writes. |
| `scripts/seedPlatformStore.cjs` | 211 | `.cjs` | dev / script | No | Only the reviewed operator CLI may construct a live adapter. These pure |
| `scripts/size_report.ps1` | 236 | `.ps1` | dev / script | No | Application component module |
| `scripts/startLocalDev.js` | 2 | `.js` | dev / script | No | Application component module |
| `scripts/stress_test_c2_forecasting.cjs` | 431 | `.cjs` | test | No | scripts/stress_test_c2_forecasting.cjs |
| `scripts/test_live_localhost.js` | 138 | `.js` | test | No | Verify Mock API endpoint |
| `scripts/test_localhost_suite.js` | 568 | `.js` | test | No | MediSync Full Localhost UI & Five-Role Automation Suite |
| `scripts/test_production_boot_harness.js` | 97 | `.js` | test | No | Mock environment for Render |
| `scripts/verifyMlStatusContractOffline.cjs` | 33 | `.cjs` | dev / script | No | Consumes the actual Flask reply produced by the owned, network-fenced profile. |
| `scripts/verify_b6_flow_live.cjs` | 1340 | `.cjs` | dev / script | No | ============================================================================ |
| `scripts/verify_c1_flow_live.cjs` | 808 | `.cjs` | dev / script | No | verify_c1_flow_live.cjs |
| `scripts/verify_c2_flow_live.cjs` | 264 | `.cjs` | dev / script | No | MediSync Live Verification Suite — Feature C2 |
| `scripts/verify_c3_map_live.cjs` | 344 | `.cjs` | dev / script | No | Playwright Live Browser Verification for MediSync Multi-Disease Outbreak Map (Feature C3) |
| `scripts/verify_c4_ai_resilience_live.cjs` | 125 | `.cjs` | dev / script | No | This verifies read-only health and local contracts. It cannot accept clinical |
| `scripts/verify_five_role_sessions_live.cjs` | 260 | `.cjs` | dev / script | No | Explicit one-role-at-a-time live runner. Never execute without a fresh operator |
| `scripts/verify_live_public_health_browser.js` | 190 | `.js` | dev / script | No | Playwright Live Browser Verification for MediSync Public Health Dashboard |
| `scripts/verify_m2_step23_live.cjs` | 502 | `.cjs` | dev / script | No | ============================================================================ |
| `scripts/verify_phase1_ml.js` | 220 | `.js` | dev / script | No | Phase 1 ML Service Verification & Cold-Start Diagnostic Probe |
| `scripts/verify_phase2_reference_data.js` | 285 | `.js` | dev / script | No | Phase 2 Reference Data & Autocomplete Live Verification Script |
| `scripts/verify_phase3_consultation_409.js` | 257 | `.js` | dev / script | No | Phase 3 Live Consultation 409 & Multi-Role Visibility Verification Probe |
| `scripts/verify_public_activity_live.cjs` | 93 | `.cjs` | dev / script | No | Application component module |
| `scripts/verify_public_health_live.cjs` | 361 | `.cjs` | dev / script | No | ============================================================================ |
| `scripts/verify_sanity_symptom_cases.py` | 163 | `.py` | dev / script | No | usr/bin/env python3 |


## Documentation Core (`docs/`, `docs/report/`, `docs/release/`, etc.) (158 files)

| Path | LOC | Type | Role | Protected? | Purpose & Key Responsibilities |
|---|:---:|:---:|:---:|:---:|---|
| `docs/BOOT_REQUIREMENTS.md` | 136 | `.md` | documentation | No | MediSync Production Boot Admission & Storage Requirements |
| `docs/BUGS.md` | 26 | `.md` | documentation | No | MediSync Bugs Register |
| `docs/BUG_REPORT.md` | 87 | `.md` | documentation | No | MediSync Security & Performance Bug Report |
| `docs/CHANGELOG_PHASES.md` | 101 | `.md` | documentation | No | MediSync Phase Changelog |
| `docs/CODEBASE.md` | 526 | `.md` | documentation | No | MediSync — Technical Codebase Documentation |
| `docs/FUTURE_FEATURES.md` | 16 | `.md` | documentation | No | MediSync Future Features & Deferred Items |
| `docs/Feature_Breakdown.md` | 123 | `.md` | documentation | No | MediSync Healthcare Platform — Comprehensive Feature Breakdown |
| `docs/GATE3_OPERATOR_RUNBOOK.md` | 467 | `.md` | documentation | No | MediSync Gate 3 — operator release runbook |
| `docs/ICD10_Integration_Guide.md` | 149 | `.md` | documentation | No | ICD-10 Global Disease Integration & Weighted Anomaly System Guide |
| `docs/LIVE_QA_REPORT.md` | 147 | `.md` | documentation | No | MediSync Live Platform QA Report (v1.0.2) |
| `docs/LOCAL_DEVELOPMENT_QUICKSTART.md` | 58 | `.md` | documentation | No | MediSync — Safe Localhost Development Guide |
| `docs/MASTER_STATE.md` | 338 | `.md` | documentation | No | MediSync Master State |
| `docs/OUTBREAK_SEED_PLAN.md` | 75 | `.md` | documentation | No | MediSync Phase 6 — Synthetic Outbreak Surveillance Seed Plan |
| `docs/OWNER_CHECKLIST_FINAL.md` | 118 | `.md` | documentation | No | MediSync Master Owner Operational Checklist (Final Submission Pack) |
| `docs/POST_RELEASE_BACKLOG.md` | 112 | `.md` | documentation | No | MediSync Post-Release Backlog & Requirements for Real Patient Clearance |
| `docs/POST_SEED_REPORT.md` | 218 | `.md` | documentation | No | MediSync Production Post-Seed Verification Report (Milestone 0 / R1) |
| `docs/PROJECT_AUDIT.md` | 678 | `.md` | documentation | No | MediSync Comprehensive Project & Architecture Audit |
| `docs/PROJECT_REVIEW.md` | 553 | `.md` | documentation | No | MediSync — Project Review |
| `docs/Project_File_Directory.md` | 363 | `.md` | documentation | No | MediSync Project Architecture — Complete File Directory |
| `docs/RELEASE_ENV_CONTRACT.md` | 110 | `.md` | documentation | No | MediSync Production Release Environment Contract (Names Only) |
| `docs/RELEASE_SMOKE_TEST.md` | 52 | `.md` | documentation | No | MediSync synthetic-only release smoke test |
| `docs/SEED_RUN_MORNING.md` | 144 | `.md` | documentation | No | MediSync Production Seed Execution Runbook (Morning Run) |
| `docs/TEMP_TEST_HARNESS.md` | 42 | `.md` | documentation | No | Temporary Test Harness Documentation |
| `docs/TEST_CASES.md` | 259 | `.md` | documentation | No | MediSync — Comprehensive Test Case Matrix |
| `docs/TEST_LOG.md` | 194 | `.md` | documentation | No | MediSync Test Log |
| `docs/WORK_TRACKING.md` | 138 | `.md` | documentation | No | MediSync Work Tracking |
| `docs/agent-work/AGENT_LOG_A.md` | 36 | `.md` | documentation | No | Agent A append-only work log |
| `docs/agent-work/AGENT_LOG_B.md` | 61 | `.md` | documentation | No | Agent B append-only work log |
| `docs/agent-work/AGENT_LOG_C.md` | 140 | `.md` | documentation | No | Agent C append-only work log |
| `docs/agent-work/AGENT_LOG_D.md` | 41 | `.md` | documentation | No | Agent D append-only work log |
| `docs/agent-work/AGENT_LOG_E.md` | 118 | `.md` | documentation | No | Agent E append-only work log |
| `docs/agent-work/AGENT_LOG_F.md` | 137 | `.md` | documentation | No | Agent F append-only work log |
| `docs/agent-work/AGENT_LOG_G.md` | 11 | `.md` | documentation | No | Agent G append-only work log |
| `docs/agent-work/BLOCKERS.md` | 61 | `.md` | documentation | No | Blockers and unverified boundaries |
| `docs/agent-work/DECISIONS.md` | 32 | `.md` | documentation | No | Decisions (append-only) |
| `docs/agent-work/LIVE_VERIFICATION_LOG.md` | 100 | `.md` | documentation | No | Live verification log (append-only) |
| `docs/agent-work/MASTER_TRACKER.md` | 209 | `.md` | documentation | No | MediSync completion tracker |
| `docs/agent-work/OPERATOR_ACTIONS.md` | 56 | `.md` | documentation | No | Operator-only actions |
| `docs/agent-work/TEST_DATA_CREATED.md` | 21 | `.md` | documentation | No | V2 controlled test-data register |
| `docs/agent-work/TEST_MATRIX.md` | 867 | `.md` | documentation | No | MediSync page and function test matrix |
| `docs/c3_map_clusters_desktop_en.png` | [binary] | `.png` | documentation | No | Application component module |
| `docs/c3_map_clusters_desktop_si.png` | [binary] | `.png` | documentation | No | Application component module |
| `docs/c3_map_clusters_desktop_ta.png` | [binary] | `.png` | documentation | No | Application component module |
| `docs/c3_map_clusters_mobile_375.png` | [binary] | `.png` | documentation | No | Application component module |
| `docs/c3_map_table_view.png` | [binary] | `.png` | documentation | No | Application component module |
| `docs/disease_rankings.csv` | 42 | `.csv` | documentation | No | Application component module |
| `docs/disease_rankings_full.csv` | 71745 | `.csv` | documentation | No | Application component module |
| `docs/live_b6_verification_log.json` | 41 | `.json` | documentation | No | Configuration / reference data payload for live_b6_verification_log.json |
| `docs/live_c1_verification_log.json` | 17 | `.json` | documentation | No | Configuration / reference data payload for live_c1_verification_log.json |
| `docs/live_c2_verification_log.json` | 104 | `.json` | documentation | No | Configuration / reference data payload for live_c2_verification_log.json |
| `docs/live_c4_ai_resilience_log.json` | 14 | `.json` | documentation | No | Configuration / reference data payload for live_c4_ai_resilience_log.json |
| `docs/live_playwright_c3_map_log.json` | 48 | `.json` | documentation | No | Configuration / reference data payload for live_playwright_c3_map_log.json |
| `docs/live_playwright_public_health_log.json` | 20 | `.json` | documentation | No | Configuration / reference data payload for live_playwright_public_health_log.json |
| `docs/ml-evaluation/01_symptom_confusion_matrix.png` | [binary] | `.png` | documentation | No | Application component module |
| `docs/ml-evaluation/02_symptom_precision_recall_f1.png` | [binary] | `.png` | documentation | No | "p}<l~؛xx}߸          _3           @,            	t            |
| `docs/ml-evaluation/03_symptom_roc_pr_curve.png` | [binary] | `.png` | documentation | No | Application component module |
| `docs/ml-evaluation/04_detector_roc_pr_curves.png` | [binary] | `.png` | documentation | No | Application component module |
| `docs/ml-evaluation/05_detector_threshold_tradeoff.png` | [binary] | `.png` | documentation | No | Application component module |
| `docs/ml-evaluation/06_forecast_s1_dengue.png` | [binary] | `.png` | documentation | No | Application component module |
| `docs/ml-evaluation/07_forecast_s4_influenza.png` | [binary] | `.png` | documentation | No | Application component module |
| `docs/ml-evaluation/08_colmozzie_real_world_backtest.png` | [binary] | `.png` | test | No | Test suite for 08_colmozzie_real_world_backtest.png |
| `docs/ml-evaluation/REPORT.md` | 85 | `.md` | documentation | No | MediSync ML Engine & Surveillance Evaluation Report |
| `docs/new/00_START_HERE_NEXT_PROMPT_TASKS_AND_PROGRESS.md` | 402 | `.md` | documentation | No | MediSync — Stage A Master Task List |
| `docs/new/B1_BATCH2_REPORT.md` | 277 | `.md` | documentation | No | MediSync — Stage B1 Batch 2 Implementation & Verification Report |
| `docs/new/B1_BATCH3_REPORT.md` | 178 | `.md` | documentation | No | MediSync — Stage B1 Batch 3 Execution & Verification Report |
| `docs/new/B1_BATCH4_REPORT.md` | 281 | `.md` | documentation | No | MediSync — Stage B1 Batch 4 Execution & Verification Report |
| `docs/new/B1_BATCH5_INVESTIGATIONS.md` | 175 | `.md` | documentation | No | B1 Batch 5 Read-Only Investigations |
| `docs/new/B1_BATCH5_REPORT.md` | 81 | `.md` | documentation | No | MediSync Stage B1 Batch 5 Execution Report |
| `docs/new/B1_BATCH6_REPORT.md` | 99 | `.md` | documentation | No | MediSync Stage B1 Batch 6 Execution Report |
| `docs/new/B1_INVENTORY_REMOVAL_PLAN.md` | 196 | `.md` | documentation | No | MediSync Stage B2 — Inventory Removal & Admin Redesign Plan (U9–U16) |
| `docs/new/B1_INVESTIGATION_REPORT.md` | 647 | `.md` | documentation | No | MediSync Stage B1 Phase 1 — Comprehensive Investigation Report |
| `docs/new/B1_U2_INVESTIGATION.md` | 172 | `.md` | documentation | No | MediSync — Stage B1 Item U2 Read-Only Investigation |
| `docs/new/C5_COVERAGE.md` | 89 | `.md` | documentation | No | MediSync — C5 Disease and Drug Coverage (U26) |
| `docs/new/CLEANUP_AND_COMMENTING_PLAN.md` | 179 | `.md` | documentation | No | MediSync — Cleanup and Commenting Plan |
| `docs/new/CODEX_HOTFIX_PATIENT_AUTH_OFFLINE_20261106.json` | 218 | `.json` | documentation | No | Configuration / reference data payload for CODEX_HOTFIX_PATIENT_AUTH_OFFLINE_20261106.json |
| `docs/new/CODEX_RECONCILIATION_FINAL_SCOPE_20261105.json` | 49 | `.json` | documentation | No | Configuration / reference data payload for CODEX_RECONCILIATION_FINAL_SCOPE_20261105.json |
| `docs/new/CODEX_RECONCILIATION_LOCAL_CHECKS_20261105.json` | 64 | `.json` | documentation | No | Configuration / reference data payload for CODEX_RECONCILIATION_LOCAL_CHECKS_20261105.json |
| `docs/new/DECISIONS.md` | 87 | `.md` | documentation | No | Architecture and Security Decisions (DEC) |
| `docs/new/DEMO_BATCH_REMOVAL_RUNBOOK.md` | 196 | `.md` | documentation | No | MediSync — Legacy Demo Outbreak Batch Removal Runbook |
| `docs/new/DEMO_DATA_REMOVAL_PLAN.md` | 183 | `.md` | documentation | No | MediSync — Demo Data Removal Plan |
| `docs/new/FINAL_ACCEPTANCE_MATRIX.md` | 136 | `.md` | documentation | No | MediSync — Final Acceptance Verification Matrix |
| `docs/new/HANDOVER_REPORT.md` | 143 | `.md` | documentation | No | MediSync — Production Readiness Final Handover Report |
| `docs/new/HOTFIX_PATIENT_AUTH_REPORT.md` | 144 | `.md` | documentation | No | Patient authorization hotfix — 6 November 2026 |
| `docs/new/HOTFIX_SIDEBAR_DROPDOWN_REPORT.md` | 151 | `.md` | documentation | No | Hotfix Report: Sidebar Notification Dropdown Viewport Bounds |
| `docs/new/MASTER_PROMPT_V3.md` | 253 | `.md` | documentation | No | MediSync — Master Prompt V3: Fix, Redesign, Seed, Outbreak, Online Test, Clean |
| `docs/new/MEDISYNC_MASTER_PROMPT_V3_ADDENDUM_ANTIGRAVITY.md` | 97 | `.md` | documentation | No | MediSync — Master Prompt V3 Addendum (Antigravity reconciliation) |
| `docs/new/ONLINE_TEST_PLAN.md` | 261 | `.md` | documentation | No | MediSync — Online Test Plan |
| `docs/new/ONLINE_TEST_RUNBOOK.md` | 110 | `.md` | documentation | No | MediSync — Online Production Test Runbook |
| `docs/new/OTP_WORKFLOW_AUDIT.md` | 163 | `.md` | documentation | No | MediSync — OTP Workflow Audit |
| `docs/new/OUTBREAK_AND_PUBLIC_HEALTH_DESIGN.md` | 269 | `.md` | documentation | No | MediSync — Outbreak and Public Health Design |
| `docs/new/PAGE_CHANGE_PROPOSALS.md` | 584 | `.md` | documentation | No | MediSync — Page Change Proposals |
| `docs/new/PDF_EXPORT_DESIGN.md` | 181 | `.md` | documentation | No | MediSync — PDF Export Design |
| `docs/new/PROGRESS_TRACKER.md` | 81 | `.md` | documentation | No | MediSync Final Run: Progress Tracker |
| `docs/new/SECURITY_AUDIT_STATIC.md` | 142 | `.md` | documentation | No | MediSync — Static Security Audit (U25) |
| `docs/new/SEED_DATA_PLAN.md` | 212 | `.md` | documentation | No | MediSync — Seed Data Plan |
| `docs/new/TRACKER_RECONCILIATION.md` | 181 | `.md` | documentation | No | MediSync — Tracker Reconciliation |
| `docs/new/UX_ENGAGEMENT_REVIEW.md` | 196 | `.md` | documentation | No | MediSync — UX Engagement Review |
| `docs/new/sub1/00_MASTER_PLAN.md` | 139 | `.md` | documentation | No | MediSync Sub-Project 1: Phase 2 Polish and Cleanup — Master Plan |
| `docs/new/sub1/DECISIONS.md` | 132 | `.md` | documentation | No | Sub-Project 1 — Decisions |
| `docs/new/sub1/OWNER_ACTIONS.md` | 236 | `.md` | documentation | No | Sub-Project 1 — Owner Actions |
| `docs/new/sub1/PROGRESS_TRACKER.md` | 51 | `.md` | documentation | No | Sub-Project 1 — Progress Tracker |
| `docs/new/sub1/SIZE_AUDIT.md` | 188 | `.md` | documentation | No | MediSync Size Audit & Cleanup Report (Phase 1) |
| `docs/new/sub1/TASK_BOARD.md` | 58 | `.md` | documentation | No | Sub-Project 1 — Task Board |
| `docs/new/sub1/TEST_LOG.md` | 27 | `.md` | documentation | No | Sub-Project 1 — Test Log |
| `docs/new/sub2/FINAL_REPORT.md` | 133 | `.md` | documentation | No | MediSync — Sub-Project 2 Post-Merge Fix Final Report |
| `docs/new/sub2/FINDINGS.md` | 180 | `.md` | documentation | No | Sub-Project 2 — Root Cause Findings & Architecture Review |
| `docs/new/sub2/OWNER_ACTIONS_SUB2.md` | 100 | `.md` | documentation | No | MediSync Sub-Project 2 — Owner Operational Actions & Infrastructure Runbook |
| `docs/new/sub2/PLAN.md` | 32 | `.md` | documentation | No | Sub-Project 2 — Post-Merge Polish and Fix Plan |
| `docs/new/sub2/PROGRESS.md` | 23 | `.md` | documentation | No | Sub-Project 2 — Progress Tracker |
| `docs/new/sub3/DECISIONS.md` | 45 | `.md` | documentation | No | MediSync Sub-Project 3 — Append-Only Decisions Log |
| `docs/new/sub3/FINAL_REPORT.md` | 87 | `.md` | documentation | No | MediSync — Sub-Project 3 Final Delivery Report |
| `docs/new/sub3/MEDICINE_SAFETY_RULES.md` | 65 | `.md` | documentation | No | MediSync — Medicine Safety Rules & Clinical Safeguards Ledger |
| `docs/new/sub3/OWNER_ACTIONS_SUB3.md` | 145 | `.md` | documentation | No | MediSync — Owner Production Actions & Runbook (Sub-Project 3) |
| `docs/new/sub3/PHASE_STATUS.md` | 112 | `.md` | documentation | No | MediSync Platform Master Plan Phase Status (Items 5A through 5H) |
| `docs/new/sub3/PLAN_p0.md` | 36 | `.md` | documentation | No | MediSync Sub-Project 3 — Phase P0 Plan: Stability Fixes & Docs Reconcile |
| `docs/new/sub3/PLAN_p1.md` | 23 | `.md` | documentation | No | MediSync Sub-Project 3 — Phase P1 Plan: Medicine Safety Rules |
| `docs/new/sub3/PLAN_p2.md` | 86 | `.md` | documentation | No | Sub-Project 3 Phase 2 Implementation Plan: QR-Verified Consultation PDF + Email + NIC History Gate |
| `docs/new/sub3/PLAN_p4.md` | 53 | `.md` | documentation | No | Sub-Project 3 Phase 4 Implementation Plan: Final Hardening, Acceptance Matrix, & Release Readiness |
| `docs/new/sub3/PROGRESS.md` | 126 | `.md` | documentation | No | MediSync Sub-Project 3 Progress Tracker |
| `docs/new/sub4/COVERAGE_REPORT.md` | 145 | `.md` | documentation | No | MediSync — Sub-Project 4 Coverage Audit & Disease Architecture Report |
| `docs/new/sub4/DATA_SOURCES.md` | 66 | `.md` | documentation | No | MediSync Sub-Project 4: Knowledge Base Data Sources Evaluation |
| `docs/new/sub4/FINAL_ACCEPTANCE_MATRIX.md` | 49 | `.md` | documentation | No | MediSync Sub-Project 4: Final Acceptance Matrix |
| `docs/new/sub4/FINAL_REPORT.md` | 129 | `.md` | documentation | No | MediSync Sub-Project 4: Final Implementation & Verification Report |
| `docs/new/sub4/KB_QUALITY.md` | 95 | `.md` | documentation | No | MediSync Sub-Project 4: Knowledge Base Quality & Curation Report |
| `docs/new/sub4/OWNER_ACTIONS_SUB4.md` | 99 | `.md` | documentation | No | MediSync — Owner Production Actions & Runbook (Sub-Project 4) |
| `docs/new/sub4/PLAN_D3.md` | 34 | `.md` | documentation | No | Phase D3 Implementation Plan: Matcher V2 (Tiered Sparse Retrieval) |
| `docs/new/sub4/PLAN_d0.md` | 34 | `.md` | documentation | No | Sub-Project 4 Phase D0 Implementation Plan: Truth Pass |
| `docs/new/sub4/PROGRESS.md` | 246 | `.md` | documentation | No | MediSync Sub-Project 4 Progress Tracker: Truth Pass + All-Disease Coverage |
| `docs/performance_audit.md` | 122 | `.md` | documentation | No | MediSync — Performance Audit Report |
| `docs/public_health_live_desktop_en.png` | [binary] | `.png` | documentation | No | Application component module |
| `docs/public_health_live_desktop_si.png` | [binary] | `.png` | documentation | No | ޜauqwFr>H[ZJtܞ( dw{bA2Ԝ66ڒN/3@-gP86yU5aE:H +PgL"AitMoG |
| `docs/public_health_live_desktop_ta.png` | [binary] | `.png` | documentation | No | Application component module |
| `docs/public_health_live_mobile_375.png` | [binary] | `.png` | documentation | No | Application component module |
| `docs/release/PROTECTED_HASHES.json` | 98 | `.json` | documentation | No | Configuration / reference data payload for PROTECTED_HASHES.json |
| `docs/release/c2_backtest_receipt.json` | 349 | `.json` | test | No | Test suite for c2_backtest_receipt.json |
| `docs/report/CLAIMS_AUDIT.md` | 37 | `.md` | documentation | No | MediSync Platform Claims & Verification Audit |
| `docs/report/DECISIONS_SUB5.md` | 16 | `.md` | documentation | No | Sub-Project 5: Autonomous Decisions Ledger |
| `docs/report/MEDICINE_LIMITS_VERIFICATION.md` | 25 | `.md` | documentation | No | MediSync Medicine Safety Limits Verification Audit |
| `docs/report/ML_DESIGN_PARAMETERS.md` | 51 | `.md` | documentation | No | MediSync ML Engine: Heuristics & Design Parameters Inventory |
| `docs/report/PROGRESS_SUB5.md` | 65 | `.md` | documentation | No | Sub-Project 5: Progress Tracker |
| `docs/report/QUALITY_SCAN.md` | 110 | `.md` | documentation | No | MediSync Comprehensive Quality & Security Scan Report |
| `docs/report/SYNONYMS_LICENSING_AUDIT.md` | 57 | `.md` | documentation | No | MediSync Clinical Synonyms Licensing & Verifiable Source Audit |
| `docs/report/data/ml_resource_measurements.json` | 30 | `.json` | documentation | No | Configuration / reference data payload for ml_resource_measurements.json |
| `docs/report/data/project_inventory.json` | 2316 | `.json` | documentation | No | Configuration / reference data payload for project_inventory.json |
| `docs/report/data/sanity_symptom_results.json` | 274 | `.json` | documentation | No | Configuration / reference data payload for sanity_symptom_results.json |
| `docs/screenshots/live_c3_map_dengue_desktop.png` | [binary] | `.png` | documentation | No | Application component module |
| `docs/screenshots/live_c3_map_desktop.png` | [binary] | `.png` | documentation | No | Application component module |
| `docs/screenshots/live_c3_map_leptospirosis_desktop.png` | [binary] | `.png` | documentation | No | Application component module |
| `docs/screenshots/live_c3_map_mobile_375px.png` | [binary] | `.png` | documentation | No | Application component module |
| `docs/screenshots/live_c3_map_sinhala.png` | [binary] | `.png` | documentation | No | Application component module |
| `docs/screenshots/live_c3_map_tamil.png` | [binary] | `.png` | documentation | No | Application component module |
| `docs/screenshots/live_public_health_desktop.png` | [binary] | `.png` | documentation | No | Application component module |
| `docs/screenshots/live_public_health_mobile_375px.png` | [binary] | `.png` | documentation | No | h, h.@5CF.O4G=qWNL"#&	X4W[2  X`\a,I*_!\N[o8ABu	 h@:l(#E4w |
| `docs/security.md` | 73 | `.md` | documentation | No | MediSync Security Hardening Report |
| `docs/security/BLIND_INDEX_HMAC_SECURITY_SPECIFICATION.md` | 112 | `.md` | documentation | No | MediSync Security Specification: Keyed Blind-Index Migration |
| `docs/security/SECURITY_RISK_REGISTER_AND_REMEDIATION_PLAN.md` | 76 | `.md` | documentation | No | MediSync Production Security Risk Register & Cryptographic Remediation Plan |
| `docs/security_audit.md` | 178 | `.md` | documentation | No | MediSync — Security Audit Report |
| `docs/ui_design.md` | 124 | `.md` | documentation | No | MediSync — Frontend UI/UX Design & Layout Reference |


## Historical Verification Receipts (`docs/temp/`) (125 files)

*Compact summary of historical test execution receipts and ephemeral run logs:*

| Directory / Pattern | File Count | Type | Purpose | Role |
|---|:---:|:---:|---|:---:|
| `docs/temp/*.json`, `*.cjs` | 125 | JSON / CJS | Historical offline test receipts, gate execution runs, and patch logs | one-off / receipt |
