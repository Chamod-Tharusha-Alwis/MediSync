# 01 Facts pack

All values below were taken on **Wed 18 Nov 2026** (Asia/Colombo, UTC+05:30) from this machine. Each row gives
the source command or file.

## Repository

| Fact | Value | Source |
|---|---|---|
| Repository | https://github.com/Chamod-Tharusha-Alwis/MediSync | `git remote get-url origin` |
| `main` commit | `f5337833cf1bc79c0a4d0f06b3ea01cc292e086f` (merge of PR #55, 17 Nov 2026 15:22 +0530) | `git log -1 origin/main` |
| Commit deployed on the live API | `f5337833cf1bc79c0a4d0f06b3ea01cc292e086f` (same as `main`) | `GET https://medisync-wabc.onrender.com/api/health` response field `commit`, 18 Nov 13:18 |
| Evidence branch | `docs/report-evidence`, branched from that commit | `git checkout -b docs/report-evidence origin/main` |

## Test gate (run once on `main`, 18 Nov 2026, finished 13:15:01 +0530)

Command: `MEDISYNC_OFFLINE_CI=true node scripts/run_offline_tests.js`

```
backend              passed=2952 failed=0 PASS
client               passed=711 failed=0 PASS
email-pdf            passed=31 failed=0 PASS
ml-scoring           passed=40 failed=0 PASS
ml-flask             passed=31 failed=0 PASS
root                 passed=40 failed=0 PASS
ml-status-contract   passed=7 failed=0 PASS
TOTAL passed=3812 failed=0 sourceFrozen=true protectedAccountedFor=15 success=true profile=ci-offline
```

## Live URLs (checked 18 Nov 2026, 13:18 and 13:25 +0530, with `curl -w "%{http_code} %{time_total}"`)

| Service | URL | HTTP | Response time | Body (excerpt) |
|---|---|---|---|---|
| Client (React, Vercel) | https://medisync.chamodtharusha.com.lk/ | 200 | 0.60 s | `<title>MediSync</title>` |
| API health (Express, Render) | https://medisync-wabc.onrender.com/api/health | 200 | 0.40 s | `{"status":"ready","service":"medisync-express","commit":"f533783…"}` |
| API health, first request of the day | https://medisync-wabc.onrender.com/health | 200 | **46.59 s** | same body. The instance was asleep: this is the free-tier cold start, not normal latency. |
| ML service health (Flask, Render) | https://medisync-ml.onrender.com/health | 200 | 0.49 s | `{"references":{"clinicalValidation":"not_established","files":7,"icd10Concepts":71704},"status":"ready"}` |

The API sends `access-control-allow-origin: https://medisync.chamodtharusha.com.lk`, so that is the client
origin the live API accepts. See DISCREPANCY F-1 about `medi-sync.vercel.app`.

Repeated timings (10 requests per endpoint) are in `04_optimization.md` and `live_timings.json`.

## Roles in the code

| Role string | Where it is enforced (examples) |
|---|---|
| `admin`, `super_admin` | `server/src/routes/adminRoutes.js` (`protect([...])`) |
| `doctor` | `server/src/routes/doctorRoutes.js:11` and others |
| `patient` | `server/src/routes/patientRoutes.js` |
| `hospital_admin` | `server/src/routes/hospitalRoutes.js` (`hospAuth`) |
| `pharmacist`, `pharmacy_admin`, `assistant` | `server/src/routes/pharmacyRoutes.js:28-29` (`pharmacyAuth`, `dispensingAuth`) |

These are counted from the `protect([...])` arrays in `server/src/middleware` and `server/src/routes`. The
invitation model lists the account types `admin, doctor, patient, hospital_admin, pharmacist`
(`server/src/models/AccountInvitation.js:4`).

## Demo accounts (usernames only)

- **Live site:** the repository does not list the live demo usernames. The seed design only gives the
  synthetic patient pattern `viva.demo.patient.NNNN@<redacted-domain>` (`docs/demo/SEED_DESIGN.md:144`). Use
  your own list for the viva.
- **Local mock server:** `docs/LOCAL_DEVELOPMENT_QUICKSTART.md:45-51` lists five usernames. These work only
  against the local mock server (any password), not the live site, so they are not repeated here.
- **Passwords:** `DEMO_PASSWORDS_FILE` was **not set** in this environment. No password was read, typed,
  stored or committed.

## Tech stack versions

Versions are declared in the manifests; "installed" means the version resolved in this checkout's
`node_modules` or the ML virtual environment on 18 Nov.

| Layer | Package | Declared | Installed |
|---|---|---|---|
| Runtime | Node.js | `>=24.0.0` (`engines`) | v26.4.0 |
| Server | express | ^5.2.1 | 5.3.0 |
| Server | mongoose | ^9.6.0 (root ^9.9.1) | 9.11.2 |
| Server | jsonwebtoken | ^9.0.3 | 9.0.3 |
| Server | bcryptjs | ^3.0.3 | 3.0.3 |
| Server | helmet | ^8.1.0 | 8.3.0 |
| Server | express-rate-limit | ^8.4.1 | 8.7.1 |
| Server | redis | ^6.0.0 | 6.3.0 |
| Server | socket.io | ^4.8.3 | 4.8.4 |
| Server | mongodb (driver) | ^7.2.0 | n/a |
| Server | joi | ^18.1.2 | declared but **not imported anywhere in `server/src`** |
| Client | react / react-dom | ^19.2.5 | 19.2.5 |
| Client | react-router-dom | ^7.14.2 | 7.18.4 |
| Client | react-scripts (CRA) | 5.0.1 | 5.0.1 |
| Client | recharts | ^3.8.1 | 3.8.1 |
| Client | leaflet / react-leaflet | ^1.9.4 / ^5.0.0 | 1.9.4 |
| Client | @tanstack/react-query | ^5.100.6 | n/a |
| ML | Python | n/a | 3.14.6 (`ml-engine/.venv`) |
| ML | Flask | ==3.1.3 | 3.1.3 |
| ML | flask-cors | ==6.0.2 | n/a |
| ML | scikit-learn | ==1.8.0 | **1.9.1** in the local venv |
| ML | numpy | ==2.4.4 | **2.5.4** in the local venv |
| ML | pandas | ==3.0.2 | **3.0.6** in the local venv |
| ML | scipy | ==1.17.1 | n/a |
| ML | statsmodels | ==0.14.6 | n/a |
| ML | prophet | ==1.3.0 | n/a |
| ML | gunicorn | ==22.0.0 | n/a |

Sources: `package.json`, `server/package.json`, `client/package.json`, `ml-engine/requirements.txt`; the
installed versions come from `require('<pkg>/package.json').version` and `python -c "import sklearn…"`. The
venv differences from `requirements.txt` are DISCREPANCY F-2.

## DISCREPANCIES found in this section

- **F-1:** `medi-sync.vercel.app` is named as the client in `docs/PROJECT_AUDIT.md:292`. On 18 Nov it served a
  different application ("Doctor Appointment Management System", and its `/public-health` page rendered
  nothing). `medisync-production.vercel.app` (`docs/RELEASE_ENV_CONTRACT.md:43`) returned 404. The live
  MediSync client is `https://medisync.chamodtharusha.com.lk`.
- **F-2:** the local ML venv has scikit-learn 1.9.1, numpy 2.5.4 and pandas 3.0.6, but `requirements.txt` pins
  1.8.0, 2.4.4 and 3.0.2. Render installs from `requirements.txt`, so production may differ from the
  environment the evaluations ran in.
- **F-3:** `joi` is a declared dependency but is not used (see `03_validation.md`). If the report says "Joi
  schemas", that is not what the code does.
