# MediSync — Outbreak and Public Health Design

Stage A planning document. Created: 2026-11-05 (Antigravity no-network, branch `antigravity/stage-a`)

Covers V3 §8: detection, forecasting, Public Health v2 page, role views, oracle.

## Current review boundary — 5 November 2026

**Design proposals only. No implementation or live execution is authorized.**
Current source is `d611b41`. Uncited claims below are NOT VERIFIED; proposed
routes, fields, thresholds, forecasts, cron jobs and seed actions are not existing
features or approval. The operator permits edits only in `docs/new/`, no pushes
or calls to live services. Preserve public provenance and the current unavailable
states. See `TRACKER_RECONCILIATION.md` and the exact named addendum.

---

## Case definition (D9 — pending operator approval)

The earlier proposal equating a saved diagnosis with confirmation is withdrawn
as an assertion about existing code. The actual contract uses
`surveillanceVerification`, requiring verified status, source `clinical_review`
(or isolated `synthetic_qa` simulation), confirmed diagnosis, reviewer,
verification time, episode and case-definition reference. Repeated visits for
the same patient/disease/episode count once. Evidence:
`server/src/services/surveillanceService.js:16-35` and
`server/src/services/publicHealthStats.js:109-137`.

The proposed `reviewMetadata` object would not satisfy that contract. No field
backfill, clinical-review workflow, diagnosis reclassification or seed is approved.
The clinical appropriateness of a future case definition remains NOT VERIFIED.

---

## Detection: outbreak alert algorithm

**Proposed input:** eligible reviewed episodes from Mongo `Consultation`, using
the existing provenance/confirmation gates above; never raw consultation counts.  
**Aggregation:** per disease × district, daily case count in Asia/Colombo timezone.  
**Baseline:** rolling 8-week window (56 days) ending 7 days before today (to allow
the signal to emerge above the baseline).  
**Method proposal:** daily z-score. This is not the current detector. The path
`server/src/services/outbreakService.js` does not exist in this checkout. Existing
`surveillanceService.js:49-76` buckets last-seven-day counts against a previous
23-day baseline scaled to a week and calls the ML trigger. The ML engineering
heuristics are in `ml-engine/app.py:574-645`: high danger requires >10 cases and
at least 150% rise, medium >30 and at least 300%, low >100 and at least 800%, with
the documented zero-baseline branches. These are not clinical validation.
Neither the proposed z-score method nor N=5 may silently replace or lower them.

### Additional floor and persistence gate — proposed, needs operator approval

Propose **N=5 confirmed cases per disease × district in the detection window**,
AND **at least two consecutive complete calendar days above the daily signal
threshold**. For paper evaluation only, propose a seven-complete-day window
ending yesterday in Asia/Colombo and a daily z-score strictly greater than 2.
Window and statistical method are not yet approved. Let:

- `C(g,d)` be eligible deduplicated confirmed episodes in disease/district group
  `g` on local day `d`, after the existing case/provenance exclusions.
- `N(g,W)` be the number of those distinct episodes across detection window `W`.
- `A(g,d)` mean that day's own count is positive and that day's independently
  evaluated signal is above the statistical threshold, using an eligible baseline.
- A new alert is eligible only when `N(g,W) >= 5` AND there are adjacent complete
  days `d-1,d` in `W` with both `A(g,d-1)` and `A(g,d)` true, AND any independently
  required significance/policy checks pass. This is necessary, not sufficient,
  for a confirmed outbreak or public disclosure.

Do not pool diseases or districts to meet five. Do not use the partial current
day, two repeated executions, or two above-threshold rolling totals. A single
spike remains inside several rolling windows; that formulation would fail S8.
Missing/invalid baseline or undefined variance must yield unavailable/review
required, not an invented infinite score or zero-risk conclusion. Persistence
and the case floor are distinct from the public small-count disclosure policy.

### S1–S8 paper test (hypothetical inputs; no runtime PASS claims)

The source scenarios at `docs/new/SEED_DATA_PLAN.md:130-137` specify shapes but
not daily numeric counts or calibrated baselines. The numbers below are invented
paper examples only, independently per disease/district. Other five days are
zero for the arithmetic. Scores are stipulated, not fitted or clinically
validated. Actual seeded outcomes for all eight remain **NOT VERIFIED**.

This table evaluates the **additional floor/persistence gate only**. Examples
with five or seven cases do not satisfy the current ML high-danger minimum of
more than ten, much less the medium/low minima. They must not be reported as
overall detector PASS or used to lower those rules. Exact per-group volumes,
baselines and full-policy expected results require later review.

| Scenario | Two adjacent complete-day counts; scores | Window count | Paper gate result and limit |
| --- | --- | --- | --- |
| S1 Dengue, each western district | 3,4; z=2.5,3 | 7 | Floor and persistence satisfied; actual rise/severity not verified. |
| S2 Leptospirosis, each target district | Historical peak 4,4; z=3,3. Recent 0,0; z below threshold | 8 at peak, 0 after leaving window | Historical eligibility, no new current alert after decay. A persisted resolved alert requires replay/history and a separate resolve rule; not proved by a current snapshot. |
| S3 Chickenpox, Galle | 2,3; z=2.2,2.5 | 5 | Both satisfied exactly at floor. Ten-day duration alone does not prove the thresholds. |
| S4 Influenza, each district tested separately | 3,3; z=2.2,2.4 | 6 per district | Both satisfied for each stipulated district. National pooling cannot qualify a sparse district or establish which ranks highest. |
| S5 Typhoid or diarrhoeal disease, separately | 2,3; z=2.1,2.3 | 5 for each distinct disease/district | Both satisfied only if each individual group meets them. 2,2 with elevated scores totals 4 and must not alert. |
| S6 Hepatitis A, Matale | 2,3; z=2.2,2.6 | 5 | Both satisfied; actual cluster and severity not verified. |
| S7 Quiet background | 4,4; z=0,0 | 8 | Floor alone passes; daily signal/persistence fails, so no new alert. |
| S8 One-day Ampara dengue spike | 20,0; z=10,0 | 20 | Floor passes, persistence fails. No new alert even while that spike remains in subsequent rolling windows. |

Additional paper negatives: four total cases despite two elevated days fails
the floor; two elevated nonadjacent days fails persistence; replaying one date
does not create a second day; five cross-district or cross-disease cases cannot
qualify either group. S8 assumes no unrelated second elevated day; a second
elevated day would be a different scenario requiring review.

No new test script, detector, alert, ingestion or database operation was used.
Clinical sensitivity/specificity, threshold calibration, exact fixture counts
and actual S1–S8 application results remain NOT VERIFIED.

**Alert levels:**

| z-score | Level | Colour |
|---------|-------|--------|
| < 2 | No alert | — |
| 2–3 | Watch | Amber |
| 3–4 | Alert | Orange |
| > 4 | Critical | Red |

**Proposed persistence (not current schema):** alerts stored with:
`{ disease, districtCode, alertLevel, startDate, lastUpdatedAt, resolvedAt, seedBatchId? }`.  
De-duplicate: one active alert per disease × district; update `lastUpdatedAt` and `alertLevel`
on subsequent detection runs.

Existing model fields instead include `location`, `severity`, `status`,
`approvedAt` and `sourceConsultationIds`, not that proposed field set:
`server/src/models/OutbreakAlert.js:4-36`. Existing analysis writes Pending
statistical signals, not confirmed outbreaks (`surveillanceService.js:69-76`).
Any schema or persistence change needs later review; none is authorized here.

**Resolve rule:** if z-score drops below 1.5 for 3 consecutive days, set `resolvedAt`.

**Proposed future triggers — inactive, not authorized:**
1. On demand via `POST /api/admin/outbreak/detect` (admin only).
2. As a nightly cron job (server-side `node-cron`, 00:30 IST daily).
3. After the seed `--confirm` completes.

**Dependency correction:** current detection does depend on the ML trigger
(`server/src/services/surveillanceService.js:63-65`). The proposed backend-only
detector and forecast fallback below are not implemented or clinically qualified.

---

## Forecasting: 14-day forecast

**Input:** daily case series for each disease × district from Mongo (same aggregation as
detection).  
**Method:** choose one of:
1. **Backend fallback (required):** simple linear or log-linear fit on the last 21 days.
   Compute in-process on the server. Returns point estimate + ±1σ interval band.
2. **ML endpoint (optional):** `POST /api/ml/forecast` to the existing ML service with the
   time series. If the ML service returns 503 (cold start or down), fall back to option 1.

**Show "insufficient data"** instead of a forecast when fewer than 14 days of history exist
for the disease × district combination.

**Statistical caption:** one sentence beside each forecast, e.g.:
"Based on a linear trend from the last 21 days. Confidence bands are ±1 standard deviation.
Forecasts beyond 7 days have higher uncertainty."

**Never fabricate:** if no data exists, return `{ forecast: null, reason: "insufficient_data" }`.

---

## Public Health page v2 (`/public-health`)

### Layout

**Tab 1: Outbreak & Surveillance** (primary)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Summary cards (last 7 / 14 / 30 days with % change)
  Total cases  Active alerts  Districts affected
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 District Map (risk tier by colour)
  [No risk] [Watch] [Alert] [Critical]
  District labels capitalized; <5 cases suppressed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Disease ranking  [Disease selector ▾]
  Dengue          ████████  48 cases  ▲ +12%
  Influenza       ██████    36 cases  ▲ +8%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Trend chart: last 30 days (selected disease)
  With 14-day forecast and confidence bands
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Active alerts list
  🔴 Dengue — Colombo — Critical — since 2026-10-25
  🟠 Influenza — Kandy — Alert — since 2026-10-29
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Data updated: 2026-11-05 at 10:30 AM Sri Lanka time
```

**Tab 2: Consultation Activity** (secondary — existing live-verified view)

The existing "recorded consultation visits" page from Q2. Keep unchanged; just move it to Tab 2.

### Suppression rule
Districts with < 5 confirmed cases for the selected disease are shown as a neutral map
tile (no case count, no tooltip). The existing suppression logic is retained.

### Trilingual
All section titles, card labels, disease names (translated or romanized), alert level names,
and the data-updated label must have EN/SI/TA keys.

### Mobile-first
- 320 px: single-column, stacked cards, map fills viewport width.
- 375 px: same but slightly larger cards.
- 1440 px: two-column layout (map left, ranking right).

### Sri Lanka time
Day buckets in Asia/Colombo. `$dateToString timezone: "Asia/Colombo"` in Mongo aggregations.
"Data updated" timestamp in IST.

---

## Role views

### Admin

- **Overview page:** real health chips for MongoDB, Redis, Email, ML (cached 60 s).
- **Outbreak Monitor:** existing page, now populated with seeded data. Add "Resolve" button
  (admin-only) to mark an alert resolved.
- **Admin map:** district risk tier map, same colour scheme as public page.

### Hospital and Doctor

- **Outbreak banner:** if there is an active alert (Watch or above) in the hospital's or
  patient's district, show a dismissible banner at the top of the lab queue / consultation
  page: "⚠️ Active outbreak alert: {disease} in {District}. See Outbreak Monitor."
- **Dismissed state:** stored in localStorage per session per alert ID; re-shows on new alerts.

### Pharmacy

- **District demand page (U11):** disease burden from seeded Mongo data + most-sold
  medications. No ML service dependency (read Dispensing collection).
- **Notifications (U20):** rewritten text in EN/SI/TA.

### Notifications to admin and hospital (U20)

Triggered when an OutbreakAlert is created or escalated:
- Admin: "⚠️ Outbreak alert: {disease} rising in {District}. {alertLevel} level. View Outbreak Monitor."
- Hospital: "⚠️ Alert in your district: {disease} cases increasing in {District}. Check district dashboard."
No email — notification only (bell icon).

---

## Test oracle (Stage E)

These are proposed desired outcomes, not current results. The numerical floor
and daily-persistence paper analysis above governs interpretation; actual
scenario execution is NOT VERIFIED. Proposed outcomes from `SEED_DATA_PLAN.md`:

| Scenario | Expected result |
|---------|----------------|
| S1 | OutbreakAlert: dengue, Colombo/Gampaha/Kalutara, alertLevel Alert or Critical |
| S2 | OutbreakAlert: leptospirosis, Ratnapura/Kalutara/Galle, then resolvedAt set |
| S3 | OutbreakAlert: chickenpox, Galle, Watch or Alert |
| S4 | OutbreakAlert: influenza, national (or multiple districts), Kandy/NuwaraEliya highest |
| S5 | OutbreakAlert: typhoid/diarrhoeal, Jaffna/Batticaloa, Watch |
| S6 | OutbreakAlert: hepatitis A, Matale, Watch or Alert |
| S7 | No alert for background-only districts |
| S8 | NO alert for Ampara dengue single-day spike |

Future verification would require separately authorized synthetic fixtures and
exact read/write scope. No such execution is authorized now. Current public
code requests recorded visits and renders confirmed cases, outbreaks and
forecasts unavailable (`client/src/pages/public/PublicHealth.jsx:42,81`);
the Tab 1, forecast and role-view changes above are design proposals only.
