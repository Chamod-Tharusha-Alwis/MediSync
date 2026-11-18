# MediSync

MediSync is a trilingual (English, Sinhala, Tamil) healthcare platform for Sri Lanka. Doctors record
consultations and prescriptions, patients see their own records, pharmacies dispense against e-prescriptions,
and hospital and system administrators manage their organisations. Its primary component is an **outbreak
early-warning system**:

1. It counts verified consultation episodes per district and disease.
2. It flags unusual rises with a z-score rule.
3. It attaches a 72-hour projection to each signal.
4. It holds every signal as **Pending** until an administrator approves it.
5. After approval, it shows the alert publicly and can email it.

All data in the deployed system is **synthetic demonstration data**. No component is clinically validated.

## Live system

| Part | URL |
|---|---|
| Web client (React, Vercel) | https://medisync.chamodtharusha.com.lk |
| API health (Express, Render) | https://medisync-wabc.onrender.com/api/health |
| ML service health (Flask, Render) | https://medisync-ml.onrender.com/health |
| Source code | https://github.com/Chamod-Tharusha-Alwis/MediSync |

All three answered HTTP 200 on 2026-11-18. The Render services sleep when idle, so the first request can take
about a minute (46.6 s was measured on 18 Nov).

## Architecture

```
Browser ──> React 19 client (Vercel) ──/api──> Express 5 API (Render) ──> MongoDB Atlas (Mongoose 9)
                                                    │   └────────────> Redis (rate limits, OTP lockouts, short cache)
                                                    └── x-internal-key ──> Flask ML service (Render): symptom matcher,
                                                                           interaction checker, outbreak signal helper
```

- **Client:** `client/`, Create React App, Tailwind, Leaflet maps, Recharts.
- **API:** `server/`, Express 5, Mongoose 9, JWT sessions, Socket.io notifications.
- **ML service:** `ml-engine/app.py`, Flask 3.1, scikit-learn TF-IDF, SQLite reference database `ml-engine/medisync.db`.
- **Database and cache:** MongoDB Atlas; Redis.

## Folder map

| Folder | Contents |
|---|---|
| `client/` | React web app: pages per role in `src/pages/`, translations in `src/i18n/translations/` (en, si, ta), offline UI tests in `src/__master_offline__/` |
| `server/` | Express API: `src/routes` (228 API routes), `src/controllers`, `src/services` (outbreak detector, dispensing, email), `src/models`, `tests/`, reference data in `reference-data/` |
| `ml-engine/` | Flask ML service, reference data (`data/`), data pipeline (`data_pipeline/`), evaluation and offline study (`evaluation/`) |
| `scripts/` | The offline test gate (`run_offline_tests.js`), local-stack launcher, evaluation helpers |
| `docs/` | Documentation. Start at [`docs/INDEX.md`](docs/INDEX.md). Report material is in `docs/report/`; dated history is in `docs/archive/`, `docs/new/` and `docs/final/` |

A file-level guide is in [`docs/FILE_GUIDE.md`](docs/FILE_GUIDE.md).

## Run it locally

Requirements: Node.js 24 or newer (`.nvmrc`), npm, and Python 3 with `ml-engine/.venv` for the ML tests.

```bash
npm ci --prefix server
npm ci --prefix client
```

### 1. The offline test gate (no database, no network)

```bash
MEDISYNC_OFFLINE_CI=true node scripts/run_offline_tests.js
```

On Windows PowerShell:

```powershell
$env:MEDISYNC_OFFLINE_CI="true"; node scripts/run_offline_tests.js
```

Result on 2026-11-18 at commit `f5337833`: `TOTAL passed=3812 failed=0`, protected files 15/15.

### 2. The user interface against a synthetic mock API (no database)

Use two terminals:

```bash
node server/scripts/standaloneMockServer.js
```

```bash
npm --prefix client run start:qa
```

Then open http://127.0.0.1:3100. The mock API listens only on 127.0.0.1:5100 and returns synthetic data.
Verified on 2026-11-18: both the page and a proxied `/api/public/hospitals` call returned 200.

### 3. The full local stack

`npm start` runs `scripts/realLocalStack.cjs`. It starts React (3100), Express (5100) and Flask (5101) against a
**QA** MongoDB. It refuses to start unless all of these are in place:
- an existing Docker container named `medisync-redis`;
- `MONGO_URI_TEST` and `ENCRYPTION_KEY` in the environment;
- `MEDISYNC_LOCAL_ATLAS_APPROVED=true`.

See [`docs/LOCAL_DEVELOPMENT_QUICKSTART.md`](docs/LOCAL_DEVELOPMENT_QUICKSTART.md) and
[`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md).

## Roles

| Role | What the role does |
|---|---|
| `patient` | Own history, prescriptions, lab results; grants doctors and pharmacies access by OTP |
| `doctor` | Consultations, prescriptions, lab orders (with the patient's consent) |
| `pharmacist`, `pharmacy_admin` | Dispense against e-prescriptions; manage pharmacy staff (admin) |
| `assistant` | Pharmacy assistant: can view, cannot dispense |
| `hospital_admin` | Hospital staff and doctors |
| `admin`, `super_admin` | Outbreak monitor, alert approval, platform administration |

Roles are enforced on each route with `protect([...roles])` (`server/src/middleware/auth.js`). Alert approval
also accepts `health_officer` (`server/src/routes/adminRoutes.js:39`).

## Outbreak prediction system

Full description: [`docs/OUTBREAK_DETECTION.md`](docs/OUTBREAK_DETECTION.md).

- **Detector** (`server/src/services/surveillanceService.js:398-520`):
  - Counts only verified, confirmed episodes, one per patient, disease and episode.
  - The window is 7 complete days, and the baseline is the 56 days before it.
  - A district-disease pair needs at least 5 episodes in the window.
  - It needs at least 2 consecutive days with a daily z-score strictly above 2.0.
  - Bands (`alertLevel` / `severity`): Watch / Moderate (z 2-3), Alert / High (z 3-4), Critical / Critical
    (z ≥ 4).
- **72-hour numbers** (`server/src/services/alertProjection72h.js`):
  - The projection repeats the last 72 hours.
  - The range adds the 10th to 90th percentile of past 72-hour changes (an 80% range), given at least 8 past
    windows.
  - It is labelled "projection, not a forecast".
- **Approval:**
  - Every new alert is stored as **Pending** with a deterministic id, so a repeated scan updates it rather than
    duplicating it.
  - Only an administrator can approve it (`PUT /api/admin/outbreak/:id/approve`). Only approved alerts become
    public.
- **Email:**
  - Nothing is sent when `OUTBREAK_EMAIL_DELIVERY_ENABLED=false` (the kill switch).
  - Demonstration alerts go only to addresses on `OUTBREAK_DEMO_EMAIL_ALLOWLIST`.
  - A daily cap applies (default 100).
  - The admin screen shows Sent, Skipped (with the reason) or Failed (with the reason).
- **Schedule:** a daily scan at 02:00 (timezone `MEDISYNC_CRON_TIMEZONE`, default UTC), plus the admin "Force
  System Scan".

## Limitations (honest summary)

- **Data:** synthetic demonstration data only. No real patients, no clinician review, no ethics approval.
- **Validation:** no component is clinically validated. Every model output carries
  `clinicalValidation: not_established`.
- **Offline study on public Sri Lankan dengue counts (OpenDengue)**, from `docs/report/study/RESULTS.md` and
  `ml-engine/evaluation/evaluation_results.json`:
  - The detector found 70% of strict epidemic weeks, with 5 false-alarm episodes.
  - A fixed 95th-percentile threshold did better (F1 0.79 vs 0.55).
  - The product's trend projection did **not** beat simply repeating the last value: 1-week MAE 434 vs 212
    (Phase A), or 346 vs 185 (back-test).
  - Prophet did not beat SARIMA.
- **Symptom matcher:** a TF-IDF retrieval engine; top-1 accuracy 34.0% on 212 test rows.
- **Medicine checker:** sensitivity 82.0%, specificity 56.9% on 165 label-derived pairs.
- **Unused dependency:** `joi` is declared in `server/package.json` but not used. Input validation is
  hand-written.
- **Password expiry:** there is no age-based password expiry.

## Licence and dataset credits

- **Licence:** the repository has no `LICENSE` file. The `package.json` files declare `ISC`. Add a licence
  file before inviting reuse.
- **Datasets:** sources, licences and redistribution status are in [`docs/DATASETS.md`](docs/DATASETS.md).
  Attributions:
  - OpenDengue (CC BY 4.0);
  - DDXPlus, Fansi Tchango et al., NeurIPS 2022 (CC BY 4.0);
  - gretelai/symptom_to_diagnosis (Apache-2.0);
  - US FDA drug labels via openFDA.

  Several runtime reference files have **unverified** licences; that document lists them.

Last verified: 2026-11-18 at commit f5337833.
