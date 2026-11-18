# 04 Optimization inventory

Commit `f5337833` (main). Each row gives the file and line. "Not implemented" items are candidates for future
work.

## What is in the code

| Area | What exists | Evidence |
|---|---|---|
| **Database indexes (compound / TTL)** | 7 schema-level indexes: `BanRecord {targetId, isActive}` and `{isActive, expiresAt}`; `OutbreakScan {mode, scannedAt:-1}`; `TestOrder {patientNic, orderedAt:-1}`; `TrustedDevice {userId, deviceFingerprint}` unique; TTL auto-delete on `OTPSession.expiresAt` and `VerificationToken.expiresAt` (`expireAfterSeconds: 0`) | `server/src/models/BanRecord.js:25-26`, `OutbreakScan.js:16`, `TestOrder.js:35`, `TrustedDevice.js:20`, `OTPSession.js:52`, `VerificationToken.js:67` |
| **Database indexes (field level)** | 35 `index: true` / `unique: true` field declarations across 16 models, e.g. Consultation 4, Prescription 4, LabTest 7, Patient 2 | `grep -nE "(index\|unique): *true" server/src/models/*.js` |
| **Pagination** | Admin lists use `limit` capped at 100 (default 50 or 25) with `skip`. Pharmacy dispensing history uses `page`/`limit`, default 20. | `server/src/controllers/adminController.js:137, 282`; `server/src/controllers/pharmacyController.js` (`getDispensingHistory`) |
| **Pagination gap** | `pharmacyController.getDispensingHistory` and `adminController.js:802` read `limit` without an upper cap | same files: **future work** (cap at 100) |
| **Caching** | Redis `SETEX` cache with an in-memory fallback when Redis is unavailable. 300 s TTL on the public health statistics, the consultation-activity aggregate and disease search. Cache keys include the date and filters; demo or synthetic payloads are never served from cache. | `server/src/config/redis.js:98, 112`; `server/src/controllers/publicController.js:32, 77, 352`; `server/src/controllers/publicConsultationActivityController.js:21, 41` |
| **Response compression** | **Not implemented**: no `compression` middleware in `server/src/app.js` and no `compression` dependency in `server/package.json`. Static client files are served by the hosting CDN. | `grep -n compression server/package.json server/src/app.js` (no match) |
| **Timeouts** | MongoDB `serverSelectionTimeoutMS` 10000 and `socketTimeoutMS` 10000; ML outbreak call 60000 ms (`ML_OUTBREAK_TIMEOUT_MS`); ML health 10000 ms; other ML calls 2500-3000 ms; lab PDF service 10000 ms; transaction commit `maxCommitTimeMS` 5000; password-attempt store 2000 ms | `server/src/config/dbGuard.js:281`; `server/src/services/surveillanceService.js:102`; `server/src/security/mlHealthMonitor.js:7`; `server/src/controllers/hospitalController.js:32`, `pharmacyController.js:288`, `publicController.js:348`; `labController.js:757, 819`; `dispensingService.js:44`; `passwordAttemptPolicy.js:2` |
| **Retries** | Dispensing transaction: up to 3 attempts on transient errors, with back-off (150 ms × attempt + jitter), and up to 3 commit retries on an unknown commit result (100 ms × attempt), within a 25 s deadline. No retry on other errors. | `server/src/services/dispensingService.js:34-77` |
| **Long scan off the request path** | The admin scan trigger can answer 202 at once and run the scan in-process; the page polls every 2 s (fix pack 2, C1) | `server/src/services/scanJobs.js`; `client/src/pages/admin/OutbreakMonitor.jsx` (`SCAN_POLL_MS`) |
| **Client code splitting** | 27 pages loaded with `React.lazy` (one chunk per page) | `client/src/App.js` (`grep -c React.lazy` = 27) |
| **Rate limiting** | 16 `express-rate-limit` instances: auth (production 10 per 15 min, `app.js:304-306`), public API (60 per minute, `publicRoutes.js:7-9`), and per-area limiters in admin, alert, auth, hospital, lab, patient, pharmacy and verification routes | `grep -rn "rateLimit({" server/src` |
| **Security headers** | `helmet()` | `server/src/app.js:233` |
| **Real-time instead of polling** | Socket.io pushes alerts and notifications to connected clients | `server/package.json` (`socket.io`), `client/package.json` (`socket.io-client`) |

## Live response times

- **Measured:** Wed 18 Nov 2026, 07:48:27-07:48:56 UTC (13:18:27-13:18:56 Asia/Colombo).
- **Method:** sequential HTTPS GET requests from this machine (Sri Lanka) with
  `node report-evidence/scripts/measure_live.cjs 10`. One warm-up request per endpoint is excluded, because
  Render free instances sleep.
- **Raw values:** `report-evidence/live_timings.json`.

| Endpoint | n | HTTP | Median (ms) | Max (ms) |
|---|---|---|---|---|
| API health `GET /api/health` | 10 | 200 | 289.8 | 424.7 |
| ML health `GET /health` (Flask) | 10 | 200 | 287.5 | 751.2 |
| Public list `GET /api/public/hospitals` | 10 | 200 | 520.2 | 1012.4 |
| Public outbreak dashboard `GET /api/public/outbreak-alerts` | 10 | 200 | 747.3 | 765.1 |
| Public dashboard data `GET /api/public/health-stats` (cached 300 s) | 10 | 200 | 449.4 | 467.9 |

**Not measured:** the admin outbreak dashboard endpoint (`GET /api/admin/outbreak/alerts`). It needs an admin
login, which I did not perform on the live site. The public outbreak endpoint above is the closest
unauthenticated equivalent.

**Cold start:** the first request of the day to `/health` took **46.59 s** (13:18, 18 Nov). That is a sleeping
free-tier instance waking up, not request processing time.

## Not implemented (future work)

- HTTP response compression (gzip/brotli) on the API.
- An upper cap on `limit` in two list endpoints (see above).
- Server-side caching of authenticated dashboards (only public aggregates are cached).
- Keeping the Render instances warm, or a paid tier (cold start 46.6 s measured).
- Explicit database indexes on `OutbreakAlert` for `{status, severity}` and on `Dispensing` for
  `{pharmacyId, createdAt}`. The code queries these combinations, but no compound index is declared. Please
  confirm against Atlas before claiming either way; I did not read the production database.
