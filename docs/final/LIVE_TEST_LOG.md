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
| 2026-11-09 12:33:50 | Backend API Gateway | `https://medisync-wabc.onrender.com/health` | `200 OK` | `f3d767db...` (updating to `16a1d36`) | 115 ms | **PASS** |
| 2026-11-09 12:33:50 | Python ML Microservice | `https://medisync-ml.onrender.com/health` | `200 OK` | References: 7 files, 71,704 concepts | 224 ms | **PASS** |
| 2026-11-09 12:34:04 | Vercel Client Web App | `https://medisync.chamodtharusha.com.lk` | `200 OK` | Vercel Edge (`bom1`) | 150 ms | **PASS** |

---

## 3. Live Functional Test Execution Matrix

| Test ID | Date/Time | Role / Context | Target URL / Flow | Steps Executed | Expected Outcome | Actual Outcome | Result | Evidence File |
|:---:|:---:|:---:|---|---|---|---|:---:|---|
| **LT-01** | 2026-11-09 | Public Citizen | `https://medisync.chamodtharusha.com.lk/` | Load landing page, verify trilingual headers | HTTP 200, clean HTML, no console errors | Loads clean HTML shell, headers intact | **PASS** | `lt01_public_landing.txt` |
| **LT-02** | 2026-11-09 | Public Citizen | `https://medisync-wabc.onrender.com/api/public/health-summary` | Fetch national communicable disease summary | HTTP 200, 25 districts, disease counts | HTTP 200, 25 districts returned | **PASS** | `lt02_health_summary.json` |
| **LT-03** | 2026-11-09 | Public Citizen | `https://medisync-wabc.onrender.com/api/alerts/active` | Fetch active outbreak alerts | HTTP 200, alert list with severity/district | HTTP 200, active alerts returned | **PASS** | `lt03_active_alerts.json` |
| **LT-04** | 2026-11-09 | Public Verification | `https://medisync-wabc.onrender.com/api/verify/test-invalid-token` | Probe verification endpoint with non-existent token | HTTP 404 / error JSON with generic message | HTTP 404 with generic error shape | **PASS** | `lt04_verify_invalid.json` |
