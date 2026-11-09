# MediSync Live Production Test Execution Log (docs/final/LIVE_TEST_LOG.md)

> **Protocol**: All live tests executed against production infrastructure (`https://medisync.chamodtharusha.com.lk`, `https://medisync-wabc.onrender.com`, `https://medisync-ml.onrender.com`) are recorded here.
> **Zero Secrets / Zero PII**: Never record plaintext passwords, tokens, full National Identity Card numbers, or personal patient data.
> **Daily Email Budget**: Maximum 60 emails per day across all tests. Running count maintained below.

---

## 1. Daily Live Email Dispatch Counter

- **Date**: 2026-11-09
- **Emails Dispatched Today**: `0 / 60`
- **Budget Remaining**: `60`

---

## 2. Production Service Health Telemetry

| Timestamp (UTC) | Service Component | Target Endpoint URL | HTTP Status | Deployed Git Commit | Latency | Result |
|---|---|---|:---:|---|:---:|:---:|
| 2026-11-09 14:43:23 | Backend API Gateway | `https://medisync-wabc.onrender.com/health` | `200 OK` | `639fa608a5619f18048e5b3a6792245ff5e92e2e` (Phase 4 & 5 deployed) | 453.9 ms | **PASS** |
| 2026-11-09 14:43:23 | Python ML Microservice | `https://medisync-ml.onrender.com/health` | `200 OK` | References: 7 files, 71,704 concepts | 404.9 ms | **PASS** |
| 2026-11-09 14:43:23 | Vercel Client Web App | `https://medisync.chamodtharusha.com.lk` | `200 OK` | Vercel Edge (`bom1`) | 587.3 ms | **PASS** |

---

## 3. Live Functional Test Execution Matrix (Phase 7 Audit)

| Test ID | Role / Context | Target URL / Flow | Method | HTTP Status | Duration | Expected Outcome | Actual Outcome | Result | Evidence File |
|:---:|---|---|:---:|:---:|:---:|---|---|:---:|---|
| **LT-01** | Platform Operations | `https://medisync-wabc.onrender.com/health` | GET | `200 OK` | 453.9 ms | Service status `ready`, commit hash reported | Returns ready, commit `639fa60` | **PASS** | `lt-01_backend_health_check.json` |
| **LT-02** | Machine Learning | `https://medisync-ml.onrender.com/health` | GET | `200 OK` | 404.9 ms | Service ready, 7 references, 71,704 concepts | Status ready, `clinicalValidation: not_established` | **PASS** | `lt-02_ml_health_check.json` |
| **LT-03** | Public Citizen | `https://medisync.chamodtharusha.com.lk/` | GET | `200 OK` | 587.3 ms | Production HTML shell loaded from Vercel Edge | Clean HTML shell returned (659 B) | **PASS** | `lt-03_vercel_web_shell.json` |
| **LT-04** | Public Surveillance | `https://medisync-wabc.onrender.com/api/public/health-stats` | GET | `503 Service Unavailable` | 890.3 ms | Fail-closed policy: unverified production consultations return `PUBLIC_HEALTH_UNAVAILABLE` | Returns `PUBLIC_HEALTH_UNAVAILABLE` (fail-closed clinical policy) | **PASS** | `lt-04_public_health_stats_fail-closed.json` |
| **LT-05** | Public / Auth Guard | `https://medisync-wabc.onrender.com/api/alerts/active` | GET | `401 Unauthorized` | 356.5 ms | Protected route rejects unauthenticated request | Rejects unauthenticated request cleanly | **PASS** | `lt-05_active_outbreak_alerts_auth_guard_401.json` |
| **LT-06** | Public Citizen | `https://medisync-wabc.onrender.com/api/public/consultation-activity` | GET | `200 OK` | 560.0 ms | Returns district consultation volume activity | Returns district activity records | **PASS** | `lt-06_public_consultation_activity.json` |
| **LT-07** | Public Directory | `https://medisync-wabc.onrender.com/api/public/doctors` | GET | `200 OK` | 1325.9 ms | Public doctor directory listing (sanitized) | Sanitized doctor profiles returned | **PASS** | `lt-07_public_directory_doctors.json` |
| **LT-08** | Public Directory | `https://medisync-wabc.onrender.com/api/public/hospitals` | GET | `200 OK` | 633.6 ms | Public hospital directory listing | Public hospital list returned | **PASS** | `lt-08_public_directory_hospitals.json` |
| **LT-09** | Public Directory | `https://medisync-wabc.onrender.com/api/public/pharmacies` | GET | `200 OK` | 1060.3 ms | Public pharmacy directory listing | Public pharmacy list returned | **PASS** | `lt-09_public_directory_pharmacies.json` |
| **LT-10** | Public QR Verify | `https://medisync-wabc.onrender.com/api/verify/non-existent-token-12345` | GET | `404 Not Found` | 396.8 ms | Non-existent token cleanly rejected | Returns `TOKEN_NOT_FOUND` | **PASS** | `lt-10_verify_non-existent_token.json` |
| **LT-11** | Public QR Verify | `https://medisync-wabc.onrender.com/api/verify/request-otp` | POST | `404 Not Found` | 399.9 ms | Requesting OTP without token rejected | Rejects missing token | **PASS** | `lt-11_verify_otp_request_missing_token.json` |
| **LT-12** | Public QR Verify | `https://medisync-wabc.onrender.com/api/verify/unlock` | POST | `404 Not Found` | 399.2 ms | Unlocking without valid token rejected | Rejects missing token | **PASS** | `lt-12_verify_otp_unlock_missing_token.json` |
| **LT-13** | Operations Guard | `https://medisync-wabc.onrender.com/api/admin/seed-outbreak-demo` | POST | `401 Unauthorized` | 399.6 ms | Seed endpoints rejected over HTTP | Rejects unauthenticated request | **PASS** | `lt-13_maintenance_seed_denied_http_403.json` |
| **LT-14** | Injection Defense | `https://medisync-wabc.onrender.com/api/auth/login` | POST | `400 Bad Request` | 385.8 ms | Malformed/non-JSON payload rejected cleanly | Returns invalid format error | **PASS** | `lt-14_invalid_json_format_defense.json` |
| **LT-15** | Doctor Role Guard | `https://medisync-wabc.onrender.com/api/doctor/consultations` | GET | `401 Unauthorized` | 444.7 ms | Unauthenticated clinical access blocked | Returns 401 Unauthorized | **PASS** | `lt-15_unauthenticated_doctor_route_401.json` |
| **LT-16** | Patient Role Guard | `https://medisync-wabc.onrender.com/api/patient/consultations` | GET | `401 Unauthorized` | 402.2 ms | Unauthenticated patient access blocked | Returns 401 Unauthorized | **PASS** | `lt-16_unauthenticated_patient_route_401.json` |
| **LT-17** | Pharmacy Role Guard| `https://medisync-wabc.onrender.com/api/pharmacy/history` | GET | `401 Unauthorized` | 409.8 ms | Unauthenticated pharmacy access blocked | Returns 401 Unauthorized | **PASS** | `lt-17_unauthenticated_pharmacy_route_401.json` |
| **LT-18** | Hospital Role Guard| `https://medisync-wabc.onrender.com/api/hospital/doctors` | GET | `401 Unauthorized` | 391.3 ms | Unauthenticated hospital access blocked | Returns 401 Unauthorized | **PASS** | `lt-18_unauthenticated_hospital_route_401.json` |
| **LT-19** | Admin Role Guard | `https://medisync-wabc.onrender.com/api/admin/system-health` | GET | `401 Unauthorized` | 781.7 ms | Unauthenticated admin access blocked | Returns 401 Unauthorized | **PASS** | `lt-19_unauthenticated_admin_route_401.json` |
| **LT-20** | Endpoint Routing | `https://medisync-wabc.onrender.com/api/non-existent-probe-route` | GET | `404 Not Found` | 403.1 ms | Unknown routes return generic 404 | Returns 404 Endpoint not found | **PASS** | `lt-20_non-existent_api_route_404.json` |

---

## 4. Summary & Verification Verdict

- **Total Live Tests Executed**: 20
- **Passed**: 20 (100%)
- **Failed**: 0 (0%)
- **Live Email Budget Used**: 0 / 60
- **Evidence Files Stored**: 20 files in `docs/final/evidence/`
