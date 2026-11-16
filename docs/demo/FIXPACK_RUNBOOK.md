# Admin dashboard fix pack: owner runbook

**Synthetic demonstration data.** All dashboard numbers come from records in the database. In production
those records are the labelled synthetic seed (`viva-2026-11-outbreaks`). The registration dates written
by the backfill (step 3) are **synthetic**.

## 1. Merge order

1. Merge this pull request once its checks are green. It needs nothing from other branches.
2. Wait for the Vercel (client) and Render (server) deploys to finish, then do a hard reload
   (Ctrl+Shift+R) on `/admin/dashboard` (see step 6 to check the commit).
3. Optional: run the registration backfill (step 3), after the deploy.

## 2. What changed, and what to say at the viva

| Item | Status | What changed | What to say |
|---|---|---|---|
| 1. Synthetic badge in the alert list | **Not done (stopped by rule)** | Nothing. The existing test `client/src/__master_offline__/alert-72h-badge.test.jsx` lines 39-43 asserts the list badge, and existing tests may not be edited. | The badge marks synthetic alerts; the full statement is in Details, the approval preview, the email and the public map. |
| 2. Audit feed | Done | Each row shows role, a plain action, the target type and a relative time ("Doctor · Signed in × 2 · Target: session · 7 min ago"). Raw IDs and "regarding REDACTED" are gone. Heartbeats, page GETs and polling are hidden behind **Show system events** and grouped ("Heartbeat × 12"). The stored audit log is unchanged; the server only reads 200 events (action, role, time). | "Presentation only. The audit log stays append-only and unchanged." |
| 3. Dashboard map | Done | See "Map changes" below. | "Pending signals are visible but look different from approved ones; nothing is approved automatically." |
| 4. Registration chart | Done (script; you run it) | See step 3. The analytics query is unchanged. | "These registration dates are synthetic, written by a labelled, reversible script." |
| 5. Slow pages | Done (measured) | See "Measurements" below. | "We measured before changing anything; the main delay was waiting on a sleeping ML service." |
| 6. Stale commit label | Investigated, not changed | See step 6. | n/a |

### Map changes (item 3)

**Why the map was empty:**
- The dashboard read alerts from `GET /api/alerts/active`. That route has no authentication middleware,
  so `req.user` is never set, and the handler returns `{data: []}` to anyone who is not a reviewer.
- The map also drew only `status === 'Active'` alerts, and every production alert is still Pending.

**Fix:**
- The dashboard now uses the authenticated `GET /api/admin/outbreak/alerts`.
- Pending alerts are drawn with a dashed outline and a lighter fill (dashboard only; the public map still
  shows approved alerts only).
- Added a legend, a hover tooltip (district · disease · last 72h) and the line "No approved alerts. N
  pending alerts need review in the outbreak monitor".
- Southern districts were outside the 288 px card at zoom 7; the dashboard now uses zoom 6.5.
- The district outline no longer blocks hover and click on the alert circles.

### Measurements (item 5)

**What changed:**
- The outbreak monitor shows alerts without waiting for `/admin/ml-status`. With the ML engine asleep,
  that request alone takes about 20 s.
- Admin pages no longer wait for the overview data. The overview shows skeleton cards while loading and
  an explicit error with **Retry**.
- The stats and alert-list queries now run concurrently. The queries themselves are unchanged.

Offline measurement with `server/scripts/demo/fixpackProof.cjs measure`:
- in-memory MongoDB with the seeded plan (30,032 consultations), 10 alerts and 20,000 audit events;
- median of 5 runs;
- `--rtt=40` adds 40 ms each way, an assumed 80 ms round trip, to imitate Render to Atlas.

| Endpoint | Before, local | After, local | Before, 80 ms RTT | After, 80 ms RTT |
|---|---|---|---|---|
| `/admin/outbreak/alerts` | 21.2 ms | 20.9 ms | 499.7 ms | **222.0 ms** |
| `/admin/outbreak/growth?window=72h` | 17.6 | 19.3 | 203.9 | 215.1 |
| `/admin/outbreak/last-scan` | 0.5 | 0.5 | 94.9 | 94.1 |
| `/admin/ml-status`, ML engine asleep, first call | 20,217 | unchanged | 20,195 | unchanged, but **no longer blocks the page** |
| `/admin/stats` (with audit feed) | 25.1 | 10.8 | 858.8 | **189.8** |
| `/admin/analytics/dashboard` | 17.6 | 12.4 | 485.0 | 486.0 (not changed, to keep the analytics code untouched) |
| `/admin/audit-logs?limit=100` | 16.9 | 9.8 | 311.8 | 283.1 |

**Page effect, worked out from the table:**
- **Outbreak monitor, opened directly.** Before, the page waited first for stats and alerts (about 0.86 s
  at 80 ms), then for all four of its own requests including ML-status, about 21 s in total while the ML
  engine sleeps. Now it waits for alerts, growth and last scan only, about 0.2–0.3 s.
- **N+1 queries.** None found. The alert list costs 5–6 database commands whatever the number of alerts.

**Free-tier cold start, which code cannot fix.** Render's free tier sleeps after inactivity, and the
first request after that waits for the server to start. Open the site about 10 minutes before the viva,
and open the outbreak monitor once so the ML engine wakes too. If your hosting plan allows it, a
scheduled request every 10 minutes during the viva window keeps it awake.

## 3. Registration backfill (you run it; dry run first)

1. Dry run. It makes no connection; it prints the per-day counts and the digest. Use the viva date as the
   reference, so the dates fall within the 6 complete days before the viva:
   ```bash
   node server/scripts/demo/backfillDemoRegistrations.cjs --reference-date=2026-11-18
   ```
   Expected output: 12 Nov 14, 13 Nov 22, 14 Nov 13, 15 Nov 12, 16 Nov 9, 17 Nov 10, total 80; digest
   `45ee081eed3900eef416e5987e176eb969452b6fa9ea245b2967432c4796b03d`.
2. Write. It saves the original values to the manifest file first, then prints the chart counts before
   and after:
   ```bash
   node server/scripts/demo/backfillDemoRegistrations.cjs --reference-date=2026-11-18 --confirm --expect-digest=45ee081eed3900eef416e5987e176eb969452b6fa9ea245b2967432c4796b03d
   ```
   - Keep the manifest file it names: `backfill-registrations-2026-11-18-<digest12>.json` in the current
     folder.
   - It refuses to run if any target patient is missing, or if a backfill was already applied.
3. Revert after the viva. It restores the saved values; patients that had no `createdAt` get it removed
   again:
   ```bash
   node server/scripts/demo/backfillDemoRegistrations.cjs --revert --manifest=backfill-registrations-2026-11-18-45ee081eed39.json --confirm
   ```

**Which patients it touches.** Only patients that have all of the following:
- `syntheticSeedBatch: viva-2026-11-outbreaks`;
- `isSynthetic: true`;
- a NIC of the form `9991xxxxxxxx`;
- an email of the form `viva.demo.patient.NNNN@qa.medisync.local`.

Each changed patient also gets the marker `syntheticRegistrationBackfill: <digest>`.

**Offline proof.** The in-memory run gave:
- chart before: 2, both unflagged control patients;
- after: plus 94 over 6 days;
- after revert: identical to before;
- unflagged patients unchanged, and a second apply was refused.

(That run used the machine's own date, which is why its total is 94 rather than 80.)

## 4. Rollback

- **Code:** revert the merge commit on `main` through a pull request. No data migration is involved.
- **Data:** only the backfill changes data, and step 3.3 reverts it.

## 5. Limits

- **Item 1 not done.** Rule 2 stops it; see the item table.
- **Latency is simulated.** The 80 ms round trip is an assumption, not a production measurement. Real
  Atlas or Render timings and cold starts will differ.
- **Analytics is still sequential.** Its 5 queries still run one after another (about 0.5 s at 80 ms);
  this was left alone so the analytics code stays unchanged.
- **Audit feed depth.** The feed shows the newest 200 events. If all 200 are system events, it says how
  many are hidden; the toggle shows them.
- **Dashboard fetch.** The dashboard now calls the heavier admin alert list (with 72-hour numbers)
  instead of the empty public route.

## 6. Stale commit label (item 6): how to check what is served

**Facts:**
- The footer label is baked in at build time. `client/scripts/buildClinical.cjs` sets
  `REACT_APP_COMMIT_HASH` from `VERCEL_GIT_COMMIT_SHA`, otherwise from `git rev-parse`, and
  `components/common/Sidebar.jsx` prints it.
- `OutbreakMonitor` is imported statically into the same admin bundle, so one build cannot show PR #50's
  alert screen together with PR #49's hash.
- `vercel.json` sends `no-cache` for pages and long-cache for the hashed `/static/` files.

**Most likely explanations:**
- The dashboard tab with `commit 1a79180` was loaded before the PR #50 deployment became current. A
  single-page app keeps its old bundle until you reload.
- Or the two screens came from different URLs (a Vercel preview URL against the production domain).

I can't confirm either without Vercel access.

**Steps to confirm:**
1. Vercel → project → **Deployments**: the row marked **Production / Current** shows the commit. It
   should be `17a9b9f` (or this PR's merge commit). Under **Settings → Domains**, check that
   `medisync.chamodtharusha.com.lk` points to that production deployment.
2. In the browser: open `/admin/dashboard`, press Ctrl+Shift+R, and read the sidebar footer. In DevTools
   → Network, the loaded `main.*.js` should contain the same 7 characters (search for `commit`).
3. Render → service → **Events**: "Deploy live" shows the commit the API is running. The API has no
   visible commit label.
4. Compare with `git log --oneline -3 origin/main`.
