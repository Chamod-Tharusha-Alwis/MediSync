# MediSync REST API & Endpoint Reference Manual

> **Base URL (Backend)**: `https://medisync-wabc.onrender.com` (Production) / `http://localhost:5000` (Local)  
> **Base URL (ML Engine)**: `https://medisync-ml.onrender.com` (Production) / `http://localhost:5001` (Local)  
> **Authentication**: JSON Web Token (JWT) Bearer header (`Authorization: Bearer <token>`) with role-based claims.  
> **Internal Service Authentication**: HMAC-SHA256 signature (`x-internal-key`).  
> **Total Active Endpoints**: 191 (187 Express.js API gateway + 4 ML Engine endpoints).

---

## 1. Authentication & Security Endpoints (`/api/auth`, `/api/devices`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register new user (Patient, Doctor, Pharmacy Staff). Enforces password strength rules. |
| `POST` | `/api/auth/login` | Public | Authenticate with credentials. Rate limited (5 failed attempts $\rightarrow$ lockout). |
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

## 2. Doctor Portal Endpoints (`/api/doctors`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `GET` | `/api/doctors/dashboard` | Doctor | Retrieve summary stats: pending consultations, today's appointments, facility status. |
| `POST` | `/api/doctors/consultations` | Doctor | **Create Clinical Consultation**: Persists encounter, validates duration limits, evaluates drug interactions, encrypts clinical notes via AES-256-GCM. |
| `GET` | `/api/doctors/consultations` | Doctor | List historical consultations authored by authenticated clinician. |
| `GET` | `/api/doctors/consultations/:id` | Doctor | Retrieve consultation details (requires clinician affiliation or active patient consent). |
| `PUT` | `/api/doctors/consultations/:id/follow-up` | Doctor | Update follow-up review schedule and notes. |
| `POST` | `/api/doctors/predict-disease` | Doctor | Query ML Engine for symptom-to-disease suggestions. 60 s timeout for cold starts. |
| `GET` | `/api/doctors/patients` | Doctor | Search patient directory by NIC blind index (`patientNic_bi`) with consent check. |
| `GET` | `/api/doctors/profile` | Doctor | Retrieve doctor medical registration number, specialization, and hospital affiliations. |
| `PUT` | `/api/doctors/profile` | Doctor | Update professional profile and contact details. |

---

## 3. Patient Portal Endpoints (`/api/patients`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `GET` | `/api/patients/profile` | Patient | Retrieve decrypted patient demographic and clinical profile. |
| `PUT` | `/api/patients/profile` | Patient | Update contact details, emergency contacts, or language preference (`en`, `si`, `ta`). |
| `GET` | `/api/patients/timeline` | Patient | Retrieve patient chronological medical history (consultations, lab tests, prescriptions). |
| `GET` | `/api/patients/prescriptions` | Patient | List issued, pending, and dispensed prescriptions. |
| `GET` | `/api/patients/consultations/:id/pdf` | Patient / Doctor | **Download Consultation Summary PDF**: Generates WinAnsi-safe document buffer with embedded QR code. Gated by `PDF_EXPORT_ENABLED === 'true'`. |
| `POST` | `/api/patients/consent/grant` | Patient | Grant temporary consultation review access token to attending clinician. |
| `POST` | `/api/patients/consent/revoke`| Patient | Immediately revoke clinician record access token. |
| `POST` | `/api/patients/ratings` | Patient | Submit rating and feedback for a completed doctor consultation. |

---

## 4. Pharmacy & Dispensing Endpoints (`/api/pharmacies`, `/api/prescriptions`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `GET` | `/api/pharmacies/dashboard` | Pharmacy | Retrieve inventory stock levels, low-stock warnings, and today's dispensing volume. |
| `GET` | `/api/pharmacies/inventory` | Pharmacy | List pharmaceutical stock inventory with batch numbers, quantities, and expiry dates. |
| `POST` | `/api/pharmacies/inventory` | Pharmacy | Add new pharmaceutical inventory batch. |
| `PUT` | `/api/pharmacies/inventory/:id` | Pharmacy | Adjust stock count or record batch write-off. |
| `GET` | `/api/prescriptions/search` | Pharmacy | Search pending prescriptions by `prescriptionId` or patient NIC blind index. |
| `POST` | `/api/prescriptions/dispense`| Pharmacy | **Dispense Medication**: Atomically decrements stock, verifies interactions, records alternative brand substitution justification if applicable, writes `Dispensing` record. |
| `POST` | `/api/prescriptions/otc` | Pharmacy | Record direct over-the-counter pharmacy dispensing without prior consultation. |

---

## 5. Epidemiological Surveillance & Public Health (`/api/alerts`, `/api/public`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `GET` | `/api/alerts/active` | Public | Return active and confirmed outbreak alerts for public banner display. |
| `GET` | `/api/alerts/district/:id` | Public | Return district-specific outbreak status and public guidance. |
| `GET` | `/api/public/health-summary` | Public | Island-wide communicable disease summary: 25 districts, rolling 7-day counts, Gate 1–3 evaluation. |
| `GET` | `/api/public/health-map` | Public | GeoJSON-compatible district case densities and outbreak polygon coordinates. |
| `GET` | `/api/public/stats` | Public | Anonymized platform health metrics (participating hospitals, verified consultations). |

---

## 6. Public QR Authenticity & History Verification (`/api/verify`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `GET` | `/api/verify/:token` | Public | **Public QR Authenticity Check**: Verifies SHA-256 capability token against `VerificationToken` model (90-day TTL). Returns hospital, doctor name, and timestamp with **zero patient PII**. |
| `POST` | `/api/verify/:token/history-pdf` | Public / Rate-Limited | **Constant-Time NIC Gate**: Accepts patient NIC input; performs constant-time comparison against `patientNicHash`. Returns full cumulative medical history PDF. Gated by `PDF_EXPORT_ENABLED`. |

---

## 7. Formularies, Drug Catalog & Safety Rules (`/api/drugs`)

| Method | Path | Auth / Role | Description & Gates |
|---|---|---|---|
| `GET` | `/api/drugs/search` | Doctor / Pharmacy | Search drug formulary by brand name or generic active ingredient. |
| `GET` | `/api/drugs/symptoms` | Doctor | Return list of ML-canonical symptom tokens indexed for auto-complete. |
| `GET` | `/api/drugs/icd/search` | Doctor | **ICD-10 Search**: Search the 71,704 validated leaf concepts catalog by code or description. |
| `POST` | `/api/drugs/check-interactions` | Doctor / Pharmacy | Evaluate pairwise drug interactions across candidate prescriptions against `interactions_clean.json`. |
| `POST` | `/api/drugs/check-safety` | Doctor / Pharmacy | Check dosage ceilings and course duration limits against `medicine_safety_limits.json`. |

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
| `POST` | `/api/admin/users/:id/reveal-identifier` | Super Admin | Audit-logged temporary unmasking of patient identification for regulatory compliance. |

---

## 9. Machine Learning Microservice Endpoints (`ml-engine`)

| Method | Path | Auth / Role | Description & Performance |
|---|---|---|---|
| `GET` | `/health` | Public | Health probe: returns status `ready`, file counts, and concept count (`71704`). Response time $< 5$ ms warm. |
| `POST` | `/api/ml/predict-disease` | Internal HMAC | **Tiered Matcher V2**: Evaluates input symptom tokens. Tier 1 wins at $\ge 40\%$ confidence; Tier 2 queries probability-weighted sparse TF-IDF KB. Enforces Typhoid step-ladder fever check. Response: p50 = 0.64 ms, p95 = 1.24 ms. |
| `POST` | `/api/ml/predict-outbreak` | Internal HMAC | Statistical surveillance evaluator: checks Gates 1 ($N \ge 5$), Gate 2 (2 consecutive days), and Gate 3 ($z > 2.0$). |
| `POST` | `/api/ml/predict-district-demand` | Internal HMAC | Time-series demand projection for pharmaceutical restocking. |
