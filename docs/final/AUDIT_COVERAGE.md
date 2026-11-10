# Audit Log Route Coverage Report (docs/final/AUDIT_COVERAGE.md)

Generated: 2026-11-10T04:40:48.950Z

## 1. Summary Metrics

- **Total Registered API Routes:** 162
- **Total Mutating Routes (POST/PUT/PATCH/DELETE):** 90
- **Mutating Routes Audited:** 90 / 90 (**100.0%**)
- **Audit Coverage Requirement Met:** YES (100% compliant)

## 2. Complete Mutating & Sensitive Route Coverage Matrix

| Route | Method | Role Restriction | Handler (File:Line) | Audited | Event Name |
|---|:---:|---|---|:---:|---|
| `/users/toggle` | `PUT` | `admin,super_admin` | `adminRoutes.js:14 (toggleUserStatus)` | YES | `CONTROLLER_AUDIT` |
| `/users/toggle-status` | `PUT` | `admin,super_admin` | `adminRoutes.js:15 (toggleUserStatus)` | YES | `CONTROLLER_AUDIT` |
| `/audit-logs/profile/:userId` | `GET` | `admin,super_admin` | `adminRoutes.js:20 (getUserAuditProfile)` | YES | `CONTROLLER_AUDIT` |
| `/users/:userId/audit-profile` | `GET` | `admin,super_admin` | `adminRoutes.js:21 (getUserAuditProfile)` | YES | `CONTROLLER_AUDIT` |
| `/outbreak/trigger` | `POST` | `admin,super_admin,health_officer` | `adminRoutes.js:24 (triggerMLDetection)` | YES | `TRIGGER_ML_DETECTION` |
| `/outbreak/:id/approve` | `PUT` | `admin,super_admin,health_officer` | `adminRoutes.js:25 (approveAlert)` | YES | `ALERT_APPROVED` |
| `/outbreak/:id/resolve` | `PUT` | `admin,super_admin,health_officer` | `adminRoutes.js:26 (resolveAlert)` | YES | `CONTROLLER_AUDIT` |
| `/ban` | `POST` | `admin,super_admin` | `adminRoutes.js:30 (banUser)` | YES | `BAN_USER` |
| `/bans/:id/lift` | `PUT` | `admin,super_admin` | `adminRoutes.js:31 (liftBan)` | YES | `ADD_ADMIN` |
| `/admins` | `POST` | `admin,super_admin` | `adminRoutes.js:36 (addAdmin)` | YES | `ADD_ADMIN` |
| `/reports/:id/review` | `PUT` | `admin,super_admin` | `adminRoutes.js:40 (reviewReport)` | YES | `ALERT_APPROVED` |
| `/users/:userId/reveal-identifier` | `POST` | `admin,super_admin` | `adminRoutes.js:44 (revealIdentifier)` | YES | `ADMIN_REVEAL_PII` |
| `/users/:id/devices/:deviceId` | `DELETE` | `admin,super_admin` | `adminRoutes.js:46 (removeUserDevice)` | YES | `ADMIN_REMOVE_USER_DEVICE` |
| `/users/:id/recovery` | `POST` | `admin,super_admin` | `adminRoutes.js:48 (generateRecoveryToken)` | YES | `ADMIN_REVEAL_PII` |
| `/surveillance/:id/review` | `PUT` | `admin,super_admin,health_officer` | `adminRoutes.js:55 (reviewSurveillanceConsultation)` | YES | `CONTROLLER_AUDIT` |
| `/seed-outbreak-demo` | `POST` | `admin,super_admin` | `adminRoutes.js:59 (maintenanceDenied)` | YES | `DENIED_DATASET_MAINTENANCE` |
| `/seed-outbreak-demo` | `DELETE` | `admin,super_admin` | `adminRoutes.js:60 (maintenanceDenied)` | YES | `DENIED_DATASET_MAINTENANCE` |
| `/trigger` | `POST` | `public` | `alertRoutes.js:14 (triggerAlert)` | YES | `CONTROLLER_AUDIT` |
| `/broadcast` | `POST` | `admin,super_admin,pharmacist,pharmacy_admin` | `alertRoutes.js:15 (broadcastAlert)` | YES | `CONTROLLER_AUDIT` |
| `/:id/verify` | `PUT` | `admin,super_admin,health_officer,pharmacist,pharmacy_admin` | `alertRoutes.js:19 (verifyAlertStatus)` | YES | `CONTROLLER_AUDIT` |
| `/register` | `POST` | `public` | `authRoutes.js:23 (registerDoctor)` | YES | `REGISTER_DOCTOR` |
| `/register-patient` | `POST` | `public` | `authRoutes.js:24 (registerPatient)` | YES | `REGISTER_PATIENT` |
| `/register-pharmacy` | `POST` | `public` | `authRoutes.js:25 (registerPharmacyStaff)` | YES | `REGISTER_PHARMACY` |
| `/login` | `POST` | `public` | `authRoutes.js:26 (login)` | YES | `CONTROLLER_AUDIT` |
| `/verify-otp` | `POST` | `public` | `authRoutes.js:27 (verifyLoginOTP)` | YES | `VERIFY_OTP` |
| `/send-otp` | `POST` | `public` | `authRoutes.js:28 (sendOTP)` | YES | `CONTROLLER_AUDIT` |
| `/login-type` | `POST` | `doctor` | `authRoutes.js:29 (setLoginType)` | YES | `SET_LOGIN_TYPE` |
| `/change-org-password` | `POST` | `public` | `authRoutes.js:30 (inline)` | YES | `CHANGE_ORG_PASSWORD` |
| `/change-password` | `POST` | `authenticated` | `authRoutes.js:31 (changePassword)` | YES | `CHANGE_PASSWORD` |
| `/forgot-password` | `POST` | `public` | `authRoutes.js:32 (forgotPassword)` | YES | `FORGOT_PASSWORD` |
| `/reset-password` | `POST` | `public` | `authRoutes.js:33 (resetPassword)` | YES | `PASSWORD_RESET_SUCCESS` |
| `/reset-password-recovery` | `POST` | `public` | `authRoutes.js:34 (resetPasswordRecovery)` | YES | `RESET_PASSWORD_RECOVERY` |
| `/enable-2fa` | `POST` | `authenticated` | `authRoutes.js:36 (enable2FA)` | YES | `ENABLE_2FA` |
| `/verify-2fa` | `POST` | `authenticated` | `authRoutes.js:37 (verify2FASetup)` | YES | `VERIFY_2FA` |
| `/2fa` | `PUT` | `authenticated` | `authRoutes.js:38 (toggle2FA)` | YES | `TOGGLE_2FA` |
| `/2fa` | `POST` | `authenticated` | `authRoutes.js:39 (toggle2FA)` | YES | `TOGGLE_2FA` |
| `/logout` | `POST` | `authenticated` | `authRoutes.js:40 (logout)` | YES | `USER_LOGOUT` |
| `/heartbeat` | `POST` | `authenticated` | `authRoutes.js:41 (heartbeat)` | YES | `USER_HEARTBEAT` |
| `/refresh` | `POST` | `public` | `authRoutes.js:42 (refreshToken)` | YES | `REFRESH_TOKEN` |
| `/preferences/language` | `PATCH` | `public` | `authRoutes.js:47 (update)` | YES | `UPDATE_LANGUAGE_PREFERENCE` |
| `/my/:id` | `PUT` | `public` | `deviceRoutes.js:8 (updateMyDeviceLabel)` | YES | `UPDATE_DEVICE_LABEL` |
| `/my/:id/request-trust-otp` | `POST` | `public` | `deviceRoutes.js:9 (requestDeviceTrustOTP)` | YES | `REQUEST_DEVICE_TRUST_OTP` |
| `/my/:id/trust` | `POST` | `public` | `deviceRoutes.js:10 (trustMyDevice)` | YES | `CONTROLLER_AUDIT` |
| `/my/:id` | `DELETE` | `public` | `deviceRoutes.js:11 (revokeMyDevice)` | YES | `REVOKE_DEVICE` |
| `/admin/sessions/:id/force-logout` | `POST` | `admin,super_admin` | `deviceRoutes.js:15 (forceLogout)` | YES | `ADMIN_FORCE_LOGOUT` |
| `/admin/devices/:id/revoke` | `DELETE` | `admin,super_admin` | `deviceRoutes.js:16 (revokeDeviceTrust)` | YES | `ADMIN_REVOKE_DEVICE_TRUST` |
| `/profile` | `GET` | `doctor` | `doctorRoutes.js:8 (getProfile)` | NO | `NONE` |
| `/profile` | `PUT` | `doctor` | `doctorRoutes.js:9 (updateDoctorProfile)` | YES | `DOCTOR_PROFILE_UPDATE` |
| `/consultation` | `POST` | `doctor` | `doctorRoutes.js:11 (createConsultation)` | YES | `CREATE_CONSULTATION` |
| `/predict-disease` | `POST` | `doctor` | `doctorRoutes.js:12 (predictDisease)` | YES | `ML_PREDICT_DISEASE` |
| `/consultations` | `GET` | `doctor` | `doctorRoutes.js:14 (getConsultations)` | NO | `NONE` |
| `/consultation-command/:key` | `GET` | `doctor` | `doctorRoutes.js:15 (inline)` | NO | `NONE` |
| `/consultation/:id/followup` | `PUT` | `doctor` | `doctorRoutes.js:17 (updateFollowUp)` | YES | `CONSULTATION_FOLLOWUP_UPDATE` |
| `/interactions` | `POST` | `doctor,pharmacist,pharmacy_admin` | `drugRoutes.js:14 (checkInteraction)` | YES | `CHECK_DRUG_INTERACTIONS` |
| `/check-interaction` | `POST` | `doctor,pharmacist,pharmacy_admin` | `drugRoutes.js:15 (checkInteraction)` | YES | `CHECK_DRUG_INTERACTIONS` |
| `/recommendations` | `POST` | `doctor` | `drugRoutes.js:18 (recommendDrugs)` | YES | `RECOMMEND_DRUGS` |
| `/recommend` | `POST` | `doctor` | `drugRoutes.js:19 (recommendDrugs)` | YES | `RECOMMEND_DRUGS` |
| `/register` | `POST` | `public` | `hospitalRoutes.js:22 (registerHospital)` | YES | `REGISTER_HOSPITAL` |
| `/login` | `POST` | `public` | `hospitalRoutes.js:23 (loginHospital)` | YES | `HOSPITAL_LOGIN` |
| `/profile` | `GET` | `hospital_admin` | `hospitalRoutes.js:29 (getProfile)` | NO | `NONE` |
| `/settings` | `PUT` | `hospital_admin` | `hospitalRoutes.js:30 (updateSettings)` | YES | `HOSPITAL_UPDATE_SETTINGS` |
| `/doctors/link` | `POST` | `hospital_admin` | `hospitalRoutes.js:33 (addDoctor)` | YES | `HOSPITAL_LINK_DOCTOR` |
| `/doctors/:doctorId/status` | `PUT` | `hospital_admin` | `hospitalRoutes.js:35 (toggleDoctorStatus)` | YES | `HOSPITAL_TOGGLE_DOCTOR` |
| `/patients/:nic/history` | `GET` | `hospital_admin` | `hospitalRoutes.js:38 (getHospitalPatientHistory)` | YES | `HOSPITAL_VIEW_PATIENT_HISTORY` |
| `/patients/update-records` | `PUT` | `hospital_admin` | `hospitalRoutes.js:39 (inline)` | YES | `HOSPITAL_UPDATE_PATIENT_RECORDS` |
| `/read-all` | `PUT` | `notificationRoles` | `notificationRoutes.js:8 (markAllAsRead)` | YES | `MARK_NOTIFICATIONS_READ` |
| `/:id/read` | `PUT` | `notificationRoles` | `notificationRoutes.js:9 (markAsRead)` | YES | `MARK_NOTIFICATION_READ` |
| `/register` | `POST` | `public` | `patientRoutes.js:25 (registerPatient)` | YES | `CONTROLLER_AUDIT` |
| `/login` | `POST` | `public` | `patientRoutes.js:26 (loginPatient)` | YES | `CONTROLLER_AUDIT` |
| `/profile` | `PUT` | `patient` | `patientRoutes.js:30 (updatePatientProfile)` | YES | `PATIENT_PROFILE_UPDATE` |
| `/:nic` | `PUT` | `patient` | `patientRoutes.js:35 (updatePatient)` | YES | `UPDATE_PATIENT_RECORD` |
| `/:nic/prescriptions` | `GET` | `patient,doctor,admin,super_admin` | `patientRoutes.js:37 (getPrescriptions)` | YES | `VIEW_PATIENT_PRESCRIPTIONS` |
| `/consultation/:id/rate` | `POST` | `patient` | `patientRoutes.js:38 (rateConsultation)` | YES | `RATE_CONSULTATION` |
| `/consultation/:id/resend-summary` | `POST` | `patient` | `patientRoutes.js:39 (resendConsultationSummaryEmail)` | YES | `RESEND_CONSULTATION_SUMMARY` |
| `/request-access` | `POST` | `doctor,pharmacist,pharmacy_admin,assistant,hospital_admin` | `patientRoutes.js:42 (requestPatientAccess)` | YES | `REQUEST_PATIENT_ACCESS` |
| `/verify-access` | `POST` | `doctor,pharmacist,pharmacy_admin,assistant,hospital_admin` | `patientRoutes.js:43 (verifyPatientAccess)` | YES | `VERIFY_PATIENT_ACCESS` |
| `/report` | `POST` | `patient` | `patientRoutes.js:46 (reportUser)` | YES | `REPORT_USER` |
| `/register` | `POST` | `public` | `pharmacyRoutes.js:23 (registerPharmacy)` | YES | `REGISTER_PHARMACY` |
| `/login` | `POST` | `public` | `pharmacyRoutes.js:24 (loginPharmacy)` | YES | `PHARMACY_LOGIN` |
| `/change-first-password` | `POST` | `public` | `pharmacyRoutes.js:25 (changeFirstPassword)` | YES | `PHARMACY_CHANGE_FIRST_PASSWORD` |
| `/staff` | `POST` | `pharmacist,pharmacy_admin,assistant` | `pharmacyRoutes.js:35 (addStaff)` | YES | `ADD_PHARMACY_STAFF` |
| `/staff/:id/toggle` | `PUT` | `pharmacist,pharmacy_admin,assistant` | `pharmacyRoutes.js:37 (toggleStaffStatus)` | YES | `TOGGLE_PHARMACY_STAFF` |
| `/prescriptions/pending/:nic` | `GET` | `pharmacist,pharmacy_admin` | `pharmacyRoutes.js:40 (getPendingPrescriptions)` | YES | `VIEW_PENDING_PRESCRIPTIONS` |
| `/dispense` | `POST` | `pharmacist,pharmacy_admin` | `pharmacyRoutes.js:41 (dispense)` | YES | `DISPENSE_PRESCRIPTION` |
| `/dispense-otc` | `POST` | `pharmacist,pharmacy_admin` | `pharmacyRoutes.js:42 (dispenseOTC)` | YES | `DISPENSE_OTC` |
| `/history` | `GET` | `pharmacist,pharmacy_admin,assistant` | `pharmacyRoutes.js:43 (getDispensingHistory)` | NO | `NONE` |
| `/predict-restock` | `POST` | `pharmacist,pharmacy_admin,assistant` | `pharmacyRoutes.js:53 (predictRestock)` | YES | `PREDICT_RESTOCK` |
| `/seed-restock` | `POST` | `pharmacist,pharmacy_admin,assistant` | `pharmacyRoutes.js:56 (maintenanceDenied)` | YES | `DENIED_DATASET_MAINTENANCE` |
| `/seed-restock` | `DELETE` | `pharmacist,pharmacy_admin,assistant` | `pharmacyRoutes.js:57 (maintenanceDenied)` | YES | `DENIED_DATASET_MAINTENANCE` |
| `/check-safety` | `POST` | `doctor,pharmacist,hospital_staff,admin,super_admin` | `prescriptionRoutes.js:8 (checkMedicineSafety)` | YES | `CHECK_MEDICINE_SAFETY` |
| `/issue` | `POST` | `doctor` | `prescriptionRoutes.js:9 (issuePrescription)` | YES | `ISSUE_PRESCRIPTION` |
| `/dispense/:id` | `PUT` | `pharmacist` | `prescriptionRoutes.js:12 (dispense)` | YES | `DISPENSE_PRESCRIPTION` |
| `/consultations/:id/export-pdf` | `GET` | `patient,doctor` | `prescriptionRoutes.js:16 (exportConsultationPdf)` | YES | `EXPORT_CONSULTATION_PDF` |
| `/consultation-activity` | `GET` | `public` | `publicRoutes.js:18 (getConsultationActivity)` | NO | `NONE` |
| `/` | `POST` | `patient` | `reviewRoutes.js:7 (submitReview)` | YES | `SUBMIT_REVIEW` |
| `/ticket` | `POST` | `patient` | `supportRoutes.js:7 (createTicket)` | YES | `CREATE_SUPPORT_TICKET` |
| `/ticket/:id/reply` | `POST` | `admin,super_admin` | `supportRoutes.js:12 (replyTicket)` | YES | `REPLY_SUPPORT_TICKET` |
| `/upload-profile-pic` | `POST` | `authenticated` | `userRoutes.js:7 (uploadProfilePic)` | YES | `UPLOAD_PROFILE_PIC` |
| `/profile` | `PUT` | `authenticated` | `userRoutes.js:8 (updateProfile)` | YES | `UPDATE_USER_PROFILE` |
| `/:token/otp/request` | `POST` | `public` | `verificationRoutes.js:54 (requestVerificationOtp)` | YES | `VERIFY_REQUEST_OTP` |
| `/:token/otp/verify` | `POST` | `public` | `verificationRoutes.js:57 (verifyOtpAndUnlock)` | YES | `VERIFY_UNLOCKED` |
| `/:token/history-pdf` | `POST` | `public` | `verificationRoutes.js:60 (downloadHistoryPdfWithNicGate)` | YES | `VERIFY_DOWNLOAD_HISTORY_PDF` |

## 3. Structured Audit Details & PII Suppression (F06 Remediation)

To satisfy security audit finding F06, `AuditLog` records persist structured operational context without leaking sensitive patient or cryptographic information:

- **Schema Persistence**: `AuditLog.js` defines an optional `details: { type: mongoose.Schema.Types.Mixed, default: undefined }` field.
- **Sanitized Ingestion**: `recordAudit` in `server/src/utils/auditLogger.js` consumes caller metadata, clones the object, and strictly strips any blacklisted or sensitive keys:
  - `nic`, `password`, `token`, `secret`, `email`, `authorization`, `cookie`, `key`, `otp`, `allergies`, `diagnosis`, `symptoms`, `prescription`, `medications`.
- **Allowed Context**: Non-PII operational fields (`tokenId`, `targetId`, `ip`, `outcome`, `remaining`, `status`, `reason`, `scope`, `filter`) are safely retained.
- **Direct Controller Audit Instrumentation**: Public and unauthenticated verification endpoints (`/api/verify/:token`, `otp/request`, `otp/verify`, `revoke`) write structured metadata into `details` with actorRole `anonymous` and zero PII.
- **Verification**: Verified via `server/tests/securityRemediationF01toF09.test.js` and `server/tests/auditCoverage.test.js`.

