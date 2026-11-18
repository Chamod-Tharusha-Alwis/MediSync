# Local development quick start

Every command on this page was run on 2026-11-18 at commit `f5337833` on Windows 11 with Node.js v26.4.0. The
result is noted under each one. Nothing here connects to production.

## 0. Install

```bash
npm ci --prefix server
npm ci --prefix client
```

For the ML tests, the gate expects a Python virtual environment at `ml-engine/.venv` with
`ml-engine/requirements.txt` installed.

## 1. Offline test gate (no database, no network)

```bash
MEDISYNC_OFFLINE_CI=true node scripts/run_offline_tests.js
```

On Windows PowerShell:

```powershell
$env:MEDISYNC_OFFLINE_CI="true"; node scripts/run_offline_tests.js
```

- **Result on 18 Nov:** `TOTAL passed=3812 failed=0 sourceFrozen=true protectedAccountedFor=15 success=true`.
- **What it checks before and after the run:** that the 15 files in `docs/release/PROTECTED_HASHES.json` still
  match their SHA-256 values, and that no tracked file changed while the tests ran.
- **Summary of each run:** written to the temporary folder it prints.

`npm run test:offline` runs the same script without the CI profile.

## 2. UI only, against the synthetic mock API (recommended for demos without a database)

Terminal 1, the mock API on 127.0.0.1:5100 (synthetic in-memory responses, no database):

```bash
node server/scripts/standaloneMockServer.js
```

Terminal 2, the React client on 127.0.0.1:3100, proxying `/api` to the mock:

```bash
npm --prefix client run start:qa
```

Open http://127.0.0.1:3100.

- **Checked on 18 Nov:** the mock printed `[MEDISYNC_MOCK_READY] loopback=http://127.0.0.1:5100 | database=NONE`.
  The client page returned 200 after about 10 s, and `GET http://127.0.0.1:3100/api/public/hospitals`
  returned 200 through the proxy.
- **Stop:** press Ctrl+C in both terminals.

The mock returns fixed synthetic data. It does not run the real detector, consent checks or dispensing
rules; use the offline tests for those.

## 3. Full local stack against a QA database (`npm start`)

`npm start` runs `scripts/realLocalStack.cjs`: React on 3100, Express on 5100, Flask on 5101, Redis on 6379.
It deliberately refuses to start until **all** of these hold:

| Requirement | Error when missing |
|---|---|
| `MEDISYNC_LOCAL_ATLAS_APPROVED=true` (separate approval for using the QA database) | `ATLAS_AUTHORIZATION_REQUIRED` |
| `MONGO_URI_TEST` (a **QA** database, never production) and `ENCRYPTION_KEY` | `LOCAL_QA_CONFIGURATION_REQUIRED` |
| No production material in the shell (`MONGO_URI`, `MONGODB_URI`, `VAULT_TOKEN`, `RESEND_API_KEY`, `BREVO_API_KEY` must be unset) | `LOCAL_PARENT_PRODUCTION_MATERIAL_FORBIDDEN` |
| An existing Docker container named `medisync-redis`, published on loopback only (the script never creates one) | `EXISTING_REDIS_CONTAINER_UNAVAILABLE` |
| `ml-engine/.venv`, `server/node_modules`, `client/node_modules` | startup refuses |

- `npm run start:check` performs the checks only. On 18 Nov it stopped at the Redis check (no container on
  this machine), as designed.
- Environment variable names are listed in [`ENVIRONMENT.md`](ENVIRONMENT.md).

## 4. Demo accounts

The mock API (section 2) accepts the synthetic accounts defined inside `server/scripts/standaloneMockServer.js`.
Passwords for the live demonstration accounts are **not** stored in the repository; they are provided to the
supervisor separately.

## 5. What not to do

- Do not run `docker-compose up` as a quick start. `docker-compose.yml` loads `server/.env` and
  `ml-engine/.env`, which point at real services.
- Do not run seeders against any database other than a QA one.

Last verified: 2026-11-18 at commit f5337833.
