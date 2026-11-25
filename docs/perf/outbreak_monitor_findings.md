# Why `/admin/dashboard/outbreak` is slow: findings and fixes

Branch `feat/outbreak-history`, based on `main` = `f5337833`. All times below come from commands run on
**2026-11-19** (Asia/Colombo, UTC+05:30) and are given with their method. Nothing here was run against production
data with a login: I do not sign in to the live site. The admin endpoints were therefore timed **offline** on an
in-memory MongoDB with the synthetic demo seed, and the live site was timed **without** a token.

## 1. What the page requests on load

The outbreak monitor sits inside the admin shell, so both make requests on the same page load.

| # | Client file | Request | Route → controller → service | Runs |
|---|---|---|---|---|
| 1 | `client/src/pages/admin/Dashboard.jsx` (`AdminDashboard`, every admin page) | `GET /admin/stats` | `adminController.getSystemStats` | in parallel with 2 |
| 2 | same | `GET /admin/outbreak/alerts` | `alertController.getActiveAlerts` → `surveillanceService.calculateGrowthMetrics` + `loadCases(70 days)` + `alertProjection72h.computeAlertNumbers` per alert | in parallel with 1 |
| 3 | `client/src/pages/admin/OutbreakMonitor.jsx` | `GET /admin/ml-status` | `adminController.getMLStatus` → calls the Flask ML service (`/health`, timeout 10 s) | started first, never blocks the table |
| 4 | same | `GET /admin/outbreak/alerts` | same as 2 (a second copy of the heaviest request) | in parallel with 5 and 6 |
| 5 | same | `GET /admin/outbreak/growth?window=72h` | `adminController.getOutbreakGrowth` → `calculateGrowthMetrics` → `loadCases(7 days)` | in parallel |
| 6 | same | `GET /admin/outbreak/last-scan` | `adminController.getLastScan` → `OutbreakScan.findOne` | in parallel |
| 7 | `OutbreakMonitor.jsx` (map) | `GET /lk_districts.json` | static file from Vercel | independent |

**Before this change:**
- The requests already ran in parallel, but the table waited for **all three** of 4-6 (`Promise.allSettled`). So
  the slowest of them set the time to first table.
- The page does **not** run a surveillance scan on load. A scan runs only on "Force System Scan", and that
  answers 202 and polls (fix pack 2).
- The page does **not** wait for the ML service to show the table. Only the model-status card waits for request 3.

**Alert list size and paging before this change:**
- `getActiveAlerts` returned **every** Pending or Active alert ever created, with no date limit and no
  pagination.
- It then computed 72-hour numbers for each alert that had no stored snapshot. That loads 70 days of
  consultations and filters them once per alert.

## 2. Timings

### 2a. Live site, no login (`node scripts/perf/liveMonitorTiming.cjs`)

Method:
- one first request, recorded separately: it is the cold start if the instance was asleep;
- then 10 sequential requests per endpoint, giving the median and maximum.

Without a token the admin routes stop at the role check (HTTP 401). So those rows measure the network and
middleware, not the admin queries.

| Endpoint | Run 1, 2026-11-19 15:06 (both instances awake): first / warm median / max (ms) | Run 2, 2026-11-19 15:37 (API asleep): first / warm median / max (ms) |
|---|---|---|
| API `GET /api/health` | 449.5 / 302.1 / 388.3 | **46,582.2** (cold start) / 289.4 / 366.2 |
| ML `GET /health` | 509.4 / 295.7 / 761.8 | 438.8 / 285.8 / 784.8 |
| `GET /api/admin/outbreak/alerts` (no token, 401) | 311.5 / 286.2 / 764.6 | 263.6 / 276.4 / 738.9 |
| `GET /api/admin/outbreak/growth` (no token, 401) | 293.6 / 282.1 / 313.1 | 311.9 / 279.4 / 309.8 |
| `GET /api/public/outbreak-alerts` | 781.7 / 750.4 / 770.5 | 1,075.3 / 752.1 / 1,109.3 |
| `GET /api/public/health-stats` | 1,405.7 / 457.2 / 510.4 | 1,529.0 / 446.2 / 463.9 |
| Client page `/admin/dashboard/outbreak` (HTML) | 363.2 / 80.6 / 149.8 | 570.8 / 63.4 / 84.4 |

On 2026-11-18 at 13:18 the API's first request also took 46.59 s (`report-evidence/01_facts.md`).

**The live numbers above are for the code on `main`, because this branch is not deployed.** The live "after"
can only be measured once you merge and Render/Vercel redeploy. Section 5 says how.

### 2b. Admin endpoints, offline (`node scripts/perf/monitorEndpointsOffline.cjs`; `PERF_FIXTURES=0` for seed only)

Setup:
- in-memory MongoDB 8.3.4 replica set on this PC;
- the synthetic demo seed: 30,008 consultations and the seeded alerts;
- 10 sequential calls per handler, median / max;
- "page load" is the six calls of section 1 started together;
- ML engine unreachable (fails fast).

| Handler | Before (`main`): seed only, run started 15:23 | Before (`main`): seed + 2,000 historical alerts, run started 15:07 | After (`eabf4d4`): seed + 2,000 historical alerts, run started 15:37 |
|---|---|---|---|
| `GET /admin/outbreak/alerts` | 21.2 / 30.8 ms (15 rows) | **62,033.9 / 128,445 ms (1,016 rows)** | **19.3 / 31.7 ms** (15 rows, 1 page) |
| `GET /admin/outbreak/growth` | 19.9 / 32.9 ms | 19.6 / 80.1 ms | 17.9 / 26.0 ms |
| `GET /admin/outbreak/last-scan` | 0.7 / 1.6 ms | 0.8 / 3.3 ms | 0.5 / 1.3 ms |
| `GET /admin/stats` | 11.9 / 15.6 ms | 12.3 / 49.8 ms | 10.9 / 12.7 ms |
| Six calls together | 37.1 ms | **122,454.8 ms** | **23.3 ms** |

The 2,000 historical alerts are synthetic fixtures (half Resolved, half Pending, 20-319 days old) added to the
throwaway in-memory database only. They show what the unbounded query does as alerts accumulate. (An intermediate run at 15:34 used a build that still declared the index later reverted; it is not reported.)

## 3. Mongo queries and indexes (`explain('executionStats')`, offline; before run started 15:07; the after plan comes from `server/scripts/demo/outbreakHistoryProof.cjs`)

| Query | Plan | Docs examined | Returned |
|---|---|---|---|
| Alert list before (policy + real filter + status Pending/Active, sort createdAt) | `SORT <- COLLSCAN` | 2,016 | 1,000 |
| Alert list after (adds `createdAt >= now − 14 days`; proof run with 56 fixture alerts) | collection scan (no index added; see below) | ≤ 56 | exactly the 48 in-window real alerts |
| Consultations for the last 70 days (`createdAt` range) | `COLLSCAN` | 30,008 | 5,347 |

The only indexes are `outbreakalerts {_id}` and `consultations {_id, consultationId, patientNic_bi, nicHash,
patientId}`. Neither collection has an index on `createdAt`.

**Why no index was added:**
1. **`consultations.createdAt`:** `server/src/models/Consultation.js` is **hash-protected** (one of the 15
   ledger files), so an index cannot be declared there. This is the protected-file conflict.
2. **`outbreakalerts`:** I first declared `{surveillancePolicy, status, createdAt}`, and the gate failed
   (`server/tests/productionStorageAdmission.test.js`, "explicit manifest covers every actual model and plugin
   index"). In production, Mongoose runs with **`autoIndex: false`**, and a storage-admission guard checks a
   fixed manifest of required indexes (`server/src/security/productionStorageManifest.json`; the test pins 65
   required indexes). A new index would not build itself on deploy and would mean changing that guarded
   manifest, so I reverted it (commit `eabf4d4`).

**Owner-run option, if you want the indexes.** These are written for `mongosh` against the production
database. They are run by you, not by me, and after a review of the storage manifest.
```
db.outbreakalerts.createIndex({ surveillancePolicy: 1, status: 1, createdAt: -1 })
db.consultations.createIndex({ createdAt: 1 })
```
Both are additive and change no documents. Run them only if you also want to keep the storage manifest in step;
the alert collection is small enough that the change below already removes its cost.

## 4. What was changed (only what the findings support)

| Fix | Where | Effect |
|---|---|---|
| Monitor returns only Pending/Active alerts created in the **last 14 days**, newest first, **paginated (default 20, max 100)**. Only the alerts on the returned page get 72-hour enrichment. | `server/src/controllers/alertController.js`; rule in `server/src/services/outbreakViews.js` | Removes the unbounded cost: 62,033.9 → 19.3 ms median with 2,000 historical alerts. With today's demo data the endpoint was already about 20 ms. |
| The alert table renders as soon as the alert list arrives; the growth table shows a skeleton until its own request finishes | `client/src/pages/admin/OutbreakMonitor.jsx` | The table no longer waits for the slowest of three requests. The same requests, in the same order, are sent. |
| Concurrent identical computations share one in-flight promise: the 72-hour growth (requests 2, 4, 5) and the 70-day case load (2, 4) | `alertController.js` (`coalesce`), `adminController.getOutbreakGrowth` | Removes duplicate work when the shell and the monitor ask at the same moment. Nothing is kept after the promise settles, so no stale data. |
| Wake-up ping when the admin **sign-in page** opens: `GET <API>/health` (public), plus the ML service health only if `REACT_APP_ML_HEALTH_URL` is set in Vercel | `client/src/utils/wakeServices.js`, `client/src/pages/admin/Login.jsx` | The API's ~46.6 s cold start runs while the administrator types the password and OTP. No timer, no keep-alive, no paid hosting. |

**Not done, and why:**
- **Redis cache.** The alert list must show approval changes immediately, and the growth numbers feed the same
  page. A 300 s cache would show stale statuses, and in tests it would leak between suites. The in-flight
  sharing above gives the duplicate-work saving without staleness.
- **Splitting the admin shell's extra alert request.** `client/src/__master_offline__/admin-fixpack.test.jsx:84`
  and `admin-ml-status.test.jsx:20` pin the exact requests and their order, so the requests themselves are
  unchanged.

## 5. What is still slow and cannot be fixed in code

- **Render free-tier cold start:** 46,582 ms measured on 2026-11-19 at 15:37 (46.59 s on 2026-11-18). It
  happens once after about 15 minutes idle, on the first request to each service. Code cannot remove it. The
  wake-up ping only overlaps it with sign-in. If the ML service is asleep too, its own cold start applies to the
  model-status card, which no longer blocks the table.
- **Network round trips to Atlas and Render:** about 280-300 ms per request when warm (table above).
- **Remaining likely cause of "about 90 s":** I could not time the live admin endpoints without signing in. The
  measured parts are one ~46.6 s API cold start, plus the unbounded alert query, whose cost grows with every
  Pending alert ever created (62 s offline with 1,000 stale Pending alerts). If production has accumulated
  Pending alerts, the 14-day rule and pagination remove that part. The cold start remains on the first visit
  after idle.

**How to re-measure after you merge and Render/Vercel redeploy:**
1. Wait at least 15 minutes (so the instance sleeps), then run
   `node scripts/perf/liveMonitorTiming.cjs` for the cold numbers.
2. Sign in as admin in a browser with DevTools → Network open, and note the "alerts" request time and the time
   until the table appears.
3. Repeat once warm.

Last verified: 2026-11-19 at commit eabf4d4.

Update (branch `feat/alert-update-on-scan`, 2026-11-25): the 14-day rule now uses `firstDetectedAt`, with `createdAt` as the fallback, and a scan updates an
active alert instead of adding another. See `docs/perf/alert_update_findings.md`.
