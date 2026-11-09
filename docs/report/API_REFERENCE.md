# MediSync REST API & Endpoint Reference Manual

> **Base URL (Backend)**: `https://medisync-wabc.onrender.com` (Production) / `http://localhost:5000` (Local)  
> **Base URL (ML Engine)**: `https://medisync-ml.onrender.com` (Production) / `http://localhost:5001` (Local)  
> **Authentication**: JSON Web Token (JWT) Bearer header (`Authorization: Bearer <token>`) with role-based claims.  
> **Patient Consent Header**: `x-patient-access` containing OTP-derived consent token for medical record and dispensing access.  
> **Internal Service Authentication**: HMAC-SHA256 signature (`x-internal-key`).  

---

## 1. Authentication & Security Endpoints (`/api/auth`, `/api/devices`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register new user (Patient, Doctor, Pharmacy Staff). Enforces password strength rules. |
| `POST` | `/api/auth/login` | Public | Authenticate with credentials. Rate limited (5 failed attempts $\to$ lockout). |
| `POST` | `/api/auth/verify-otp` | Public | Verify 6-digit OTP code against `OTPSession` (300 s TTL). Fails closed in production. |
| `POST` | `/api/auth/resend-otp` | Public | Request new OTP token. Rate-limited cooldown. |
| `POST` | `/api/auth/refresh-token`| Public / Bearer | Refresh expired access JWT using secure session token. |
| `POST` | `/api/auth/logout` | Bearer (Any) | Invalidate active session token. |
| `POST` | `/api/auth/forgot-password` | Public | Issue recovery token to registered email (900 s TTL). |
| `POST` | `/api/auth/reset-password` | Public | Set new password using verified recovery token. |
| `GET` | `/api/auth/me` | Bearer (Any) | Retrieve authenticated user profile with role permissions. |
| `POST` | `/api/devices/register` | Bearer (Any) | Register trusted browser or mobile device fingerprint. |
| `GET` | `/api/devices` | Bearer (Any) | List all registered devices for the current account. |
| `DELETE`| `/api/devices/:id` | Bearer (Any) | Revoke trust for a previously registered device. |

---

## 2. Doctor Portal Endpoints (`/api/doctor`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `GET` | `/api/doctor/stats` | Doctor | Retrieve summary stats: today's consultations, total encounters, facility status. |
| `GET` | `/api/doctor/profile` | Doctor | Retrieve doctor medical registration number (SLMC), specialization, and affiliations. |
| `PUT` | `/api/doctor/profile` | Doctor | Update professional profile and contact details. |
| `POST` | `/api/doctor/consultation` | Doctor | **Create Clinical Consultation**: Persists encounter, validates duration limits, evaluates drug interactions, encrypts clinical notes via AES-256-GCM. |
| `GET` | `/api/doctor/consultations` | Doctor | List historical consultations authored by authenticated clinician. |
| `GET` | `/api/doctor/consultation-command/:key` | Doctor | Retrieve status of idempotent clinical command execution. |
| `PUT` | `/api/doctor/consultation/:id/followup` | Doctor | Update follow-up review schedule and clinical follow-up notes. |
| `POST` | `/api/doctor/predict-disease` | Doctor | Query ML Engine for symptom-to-disease suggestions. 60 s timeout for cold starts. |
| `GET` | `/api/doctor/predict-disease/health` | Doctor | Check connectivity and cold start status of the Python ML engine. |
| `GET` | `/api/doctor/patients-directory` | Doctor | Search patient directory by NIC blind index (`patientNic_bi`). |

---

## 3. Patient Portal Endpoints (`/api/patient`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `POST` | `/api/patient/register` | Public | Self-registration for citizens. Generates encrypted record with blind indexing. |
| `POST` | `/api/patient/login` | Public | Patient authentication via NIC/email and password with OTP challenge. |
| `PUT` | `/api/patient/profile` | Patient | Update contact details, emergency contacts, or language preference (`en`, `si`, `ta`). |
| `GET` | `/api/patient/:nic` | Patient / Doctor / Admin | Retrieve decrypted demographic profile. Requires patient identity or active consent token. |
| `PUT` | `/api/patient/:nic` | Patient | Update personal medical preferences and demographic details. |
| `GET` | `/api/patient/:nic/timeline` | Patient / Doctor | Retrieve chronological medical history (consultations, lab tests, prescriptions). |
| `GET` | `/api/patient/:nic/prescriptions` | Patient / Doctor | List issued, pending, and dispensed prescriptions for the patient. |
| `POST` | `/api/patient/consultation/:id/rate` | Patient | Submit rating and feedback for a completed doctor consultation. |
| `POST` | `/api/patient/consultation/:id/resend-summary` | Patient | Request resend of encrypted consultation summary email. |
| `POST` | `/api/patient/request-access` | Doctor / Pharmacist | Request OTP consent token sent to patient's registered contact. |
| `POST` | `/api/patient/verify-access` | Doctor / Pharmacist | Verify patient OTP and issue temporary `x-patient-access` token. |
| `POST` | `/api/patient/report` | Patient | Report clinical concern or privacy violation. |

---

## 4. Pharmacy & Dispensing Endpoints (`/api/pharmacy`, `/api/prescriptions`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `GET` | `/api/pharmacy/stats` | Pharmacy Staff | Retrieve today's and this month's total dispensing transaction volume. |
| `GET` | `/api/pharmacy/prescriptions/pending/:nic` | Pharmacist | Fetch active, non-dispensed e-prescriptions for a patient. Gated by `x-patient-access` token. |
| `POST` | `/api/pharmacy/dispense` | Pharmacist | **Dispense Medication**: Atomically validates prescription status, checks patient allergies, updates status to `dispensed`, and records receipt. Rejects duplicates with `ALREADY_DISPENSED`. |
| `POST` | `/api/pharmacy/dispense-otc` | Pharmacist | Record direct over-the-counter pharmacy dispensing with allergy and dosage checks. |
| `GET` | `/api/pharmacy/history` | Pharmacy Staff | View historical dispensing log with receipt numbers, timestamps, and dispensed drugs. |
| `GET` | `/api/pharmacy/receipt/:receiptNo` | Pharmacy Staff | Retrieve individual dispensing receipt details. |
| `GET` | `/api/pharmacy/district-demand` | Pharmacy Staff | Retrieve epidemiological district disease burdens and top dispensed pharmaceuticals. |
| `GET` | `/api/pharmacy/analytics/dispensing` | Pharmacy Staff | Dispensing volume trends over the preceding 30-day window. |
| `GET` | `/api/pharmacy/staff` | Pharmacy Admin | Manage pharmacy staff accounts (pharmacists, assistants). |
| `POST` | `/api/prescriptions/check-safety` | Doctor / Pharmacist | Evaluate dosage ceilings and duration limits against `medicine_safety_limits.json`. |
| `GET` | `/api/prescriptions/download/:refId` | Patient | Download digital prescription slip. Gated by `PDF_EXPORT_ENABLED`. |
| `GET` | `/api/prescriptions/consultations/:id/export-pdf` | Patient / Doctor | **Download Consultation Summary PDF**: Generates WinAnsi-safe document buffer with embedded QR code. Gated by `PDF_EXPORT_ENABLED`. |

---

## 5. Epidemiological Surveillance & Public Health (`/api/alerts`, `/api/public`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `GET` | `/api/alerts/active` | Public | Return active and confirmed outbreak alerts for public banner display. |
| `GET` | `/api/alerts/district/:id` | Public | Return district-specific outbreak status and public guidance. |
| `GET` | `/api/public/health-summary` | Public | Island-wide communicable disease summary: 25 districts, rolling 7-day counts, Gate 1–2 evaluation. |
| `GET` | `/api/public/health-map` | Public | GeoJSON-compatible district case densities and outbreak coordinates. |
| `GET` | `/api/public/stats` | Public | Anonymized platform health metrics (participating facilities, verified consultations). |

---

## 6. Public QR Authenticity & History Verification (`/api/verify`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `GET` | `/api/verify/:token` | Public | **Public QR Authenticity Check**: Verifies SHA-256 capability token against `VerificationToken` model (90-day TTL). Returns hospital, doctor name, and timestamp with **zero patient PII**. |
| `POST` | `/api/verify/:token/history-pdf` | Public / Rate-Limited | **Constant-Time NIC Gate**: Accepts patient NIC input; performs constant-time comparison against decrypted patient record. Returns full cumulative medical history PDF. Gated by `PDF_EXPORT_ENABLED`. |
| `POST` | `/api/verify/:token/revoke` | Authorized / Admin | Explicitly revoke a compromised or erroneous verification token capability. |

---

## 7. Formularies, Drug Catalog & Clinical Catalogs (`/api/drugs`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `GET` | `/api/drugs/search` | Doctor / Pharmacy | Search drug formulary by brand name or generic active ingredient. |
| `GET` | `/api/drugs/symptoms` | Doctor | Return list of ML-canonical symptom tokens indexed for auto-complete. |
| `GET` | `/api/drugs/icd/search` | Doctor | **US ICD-10-CM Search**: Search the 71,704 validated leaf concepts catalog by code or description. |
| `GET` | `/api/drugs/icd/status` | Doctor / Admin | Check catalog version, leaf concept count, and readiness status. |
| `POST` | `/api/drugs/interactions` | Doctor / Pharmacy | Evaluate pairwise drug interactions across candidate prescriptions against `interactions_clean.json`. |
| `POST` | `/api/drugs/recommendations` | Doctor | Retrieve evidence-based pharmaceutical recommendations for confirmed diagnoses. |
| `GET` | `/api/drugs/suggestions` | Doctor | Contextual medication suggestions based on active clinical diagnosis. |

---

## 8. Super Admin Management & Audit Logs (`/api/admin`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `GET` | `/api/admin/analytics/dashboard` | Super Admin | System-wide operational dashboard: total users, active outbreaks, consultation trends. |
| `GET` | `/api/admin/system-health` | Super Admin | Database, Redis cache, and ML service connectivity telemetry. |
| `GET` | `/api/admin/users` | Super Admin | List all registered platform accounts with status and roles. |
| `PUT` | `/api/admin/users/toggle-status` | Super Admin | Suspend or activate user account standing. |
| `GET` | `/api/admin/audit-logs` | Super Admin | Paginated immutable audit trail; filters by actor, action type, and date range. |
| `POST` | `/api/admin/outbreak/trigger` | Super Admin | Manually trigger full epidemiological scan across all 25 districts. |
| `PUT` | `/api/admin/outbreak/:id/approve` | Super Admin | Confirm a pending outbreak alert. Promotes to active public broadcast. |
| `PUT` | `/api/admin/outbreak/:id/resolve` | Super Admin | Resolve confirmed outbreak alert. Requires mandatory justification note ($\ge 5$ chars). |
| `GET` | `/api/admin/ml-status` | Super Admin | Inspect ML engine deployment status, cold start health, and catalog concept count. |

---

## 9. Machine Learning Microservice (`ml-engine/app.py`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `POST` | `/predict_disease` | Internal / Doctor | **Dual-Tier Symptom Matching**: Accepts array of symptoms. Returns Tier 1 match (41 profiles) if confidence $\ge 40.0\%$, else Tier 2 sparse retrieval (174 KB profiles). Disclaimed with `clinicalValidation: not_established`. |
| `GET` | `/health` | Public | Returns service status (`ready`), reference dataset count (7 files), and ICD-10 concept count (71,704). |
| `GET` | `/metrics` | Public | Returns uptime, total processed inference queries, and memory RSS telemetry. |
| `POST` | `/evaluate` | Internal / Admin | Batch evaluation runner for synthetic test suites and consistency scoring. |
