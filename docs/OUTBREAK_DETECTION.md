# Outbreak detection, projection and alerting

This document describes the code at commit `f5337833`. Every rule below cites the line that implements it.
Two sections cover different scopes:
- `docs/report/OUTBREAK_DETECTION.md` keeps the scalability benchmark and the coverage proof;
- `docs/report/study/RESULTS.md` keeps the offline study results.

## 1. Which consultations count

`selectCases` in `server/src/services/surveillanceService.js:39-66`.

A consultation becomes a surveillance case only if **all** of these hold:

| Condition | Code |
|---|---|
| Reviewed: `surveillanceVerification.status = 'verified'`, source `clinical_review` (or `synthetic_qa` in simulation mode), a reviewer and a case-definition reference | line 47 |
| Diagnosis confirmed: `diagnosisStatus = 'confirmed'` | line 48 |
| Inside the look-back window (63 days for a scan) and not in the future | lines 49-50, 82 |
| Has an ICD-10 or ICD-11 code, a patient, a known district and an episode id | lines 29-35, 52 |
| **One case per patient, disease and episode**: repeat visits for the same episode count once | lines 53-55 |

Synthetic demonstration cases are kept, but their provenance travels with them, so any alert they produce is
labelled as demonstration data (lines 58-62).

## 2. The detector rule

`evaluateOutbreakCriteria`, `surveillanceService.js:398-520`. It runs per (district, disease); the same
function can also group by province or island.

| Parameter | Value | Code |
|---|---|---|
| Window W | the 7 complete calendar days ending at Colombo midnight today (today's partial day is excluded) | lines 400-402 |
| Baseline | the 56 complete days before W | lines 398, 403 |
| Gate 1, floor | at least **5** episodes in W, otherwise `CASE_FLOOR_NOT_MET` | line 440 |
| Baseline mean and SD | mean of the 56 daily counts; sample SD (divisor 55) | lines 466-468 |
| Regularisation | if SD < 0.5, use max(0.5, √mean); if the mean is 0, use mean 0.1 and SD 0.5 | lines 470-476 |
| Daily z-score | z_k = (count_k − mean) / SD for each of the 7 days | line 478 |
| Gate 2, persistence | at least **2 consecutive days** with z **strictly greater than 2.0** and count > 0 | lines 482-491 |
| Bands (`alertLevel` / `severity`) | Watch / Moderate: 2.0 ≤ max z < 3.0; Alert / High: 3.0 to 4.0; Critical: ≥ 4.0 | lines 387-396 |

The parameters are constants in code. They are not read from the environment.

## 3. Turning a signal into an alert

`runAnalysis`, `surveillanceService.js:80-200`.

1. **Deterministic id.** Each triggered result is upserted into `OutbreakAlert`. The id is the SHA-256 of
   (policy, mode, district, disease, sorted source consultation ids), so a repeated scan updates the same
   alert instead of creating another (lines 113-114, 132-159).
2. **Pending status.** New alerts are stored with status **Pending** and the message "Unreviewed statistical
   signal … Requires administrator approval." (lines 123-127, 135-136).
3. **Secondary ML signal.** The scan also sends 7-day aggregates (no patient fields) to the Flask service,
   `POST /api/admin/outbreak/trigger` (lines 99-103, timeout `ML_OUTBREAK_TIMEOUT_MS`, default 60000 ms).
   That service applies a case-count and spike-percentage threshold per disease danger level
   (`calculate_outbreak_metrics` in `ml-engine/app.py`). A group it flags, which the z-score rule did not
   already alert, also becomes a **Pending** alert marked "Not a confirmed outbreak." (from line 215).
4. **Notification.** An in-app notification is sent to administrators (line 197-199).

## 4. The 72-hour numbers on every alert

`server/src/services/alertProjection72h.js`. E is Colombo midnight of the reference day.

| Number | Definition | Code |
|---|---|---|
| Previous 72 h | verified episodes in [E − 144 h, E − 72 h) | line 77 |
| Actual last 72 h | verified episodes in [E − 72 h, E) | line 78 |
| Change and % change | actual − previous; "new" when previous is 0 | lines 87-91 |
| Projection, next 72 h [E, E + 72 h) | **repeat the actual last 72 h** (naive last value) | lines 48-53 |
| Range | projection + the **10th and 90th percentiles** of past 72 h → next 72 h changes, i.e. an **80% range**. Needs at least **8** past windows; otherwise no range is shown. Only data before E is used. | lines 23-24, 54-57, 79-85 |
| Label | "projection, not a forecast" | line 27 |

## 5. Trend projection on the dashboards (client)

`client/src/utils/outbreakForecasting.js:239-400`.
- It is a hand-written **ordinary least squares** line in JavaScript.
- Its 95% prediction interval uses Student-t critical values (`se × √(1 + 1/n + (x − x̄)² / Sxx)`).
- There are gated log-linear and quadratic alternatives, chosen by a 7-day hold-out.
- statsmodels is **not** used by the product. It is used only in the offline study
  (`ml-engine/evaluation/study/forecast_benchmark.py`: SARIMA, ETS).

## 6. Approval, public display and email

| Step | Rule | Code |
|---|---|---|
| Approve | `PUT /api/admin/outbreak/:id/approve`, roles `admin`, `super_admin`, `health_officer` | `server/src/routes/adminRoutes.js:39`; `adminController.approveAlert` (line 1007) |
| Public display | Only approved alerts (status `Active`, with `approvedBy` and `approvedAt`) are returned by `GET /api/public/outbreak-alerts` | `server/src/controllers/alertController.js:84-86` (`getPublicApprovedAlerts`) |
| Kill switch | When `OUTBREAK_EMAIL_DELIVERY_ENABLED` is `'false'`, no outbreak email is sent (`OUTBREAK_EMAIL_DELIVERY_DISABLED`) | `server/src/services/outbreakDetailedDelivery.js:66-69` |
| Allowlist | Demonstration alerts are emailed only to addresses on `OUTBREAK_DEMO_EMAIL_ALLOWLIST`; the approving admin's own address is allowed for the test email (`NOT_ON_ALLOWLIST`) | lines 70-79 |
| Daily cap | `DAILY_EMAIL_CAP` / `EMAIL_DAILY_CAP`, default 100 (`DAILY_EMAIL_CAP_REACHED`) | lines 14, 17-19, 80-85 |
| Result shown to the admin | Sent (provider id), Skipped (reason) or Failed (reason) | `server/src/services/emailOutcome.js` |
| Reminder | Each pending High/Critical alert is reminded once (bell notification plus one grouped email), after every scan | `server/src/services/alertReminderService.js`; `server/src/utils/cronJobs.js:226-227` |

## 7. Schedule

- **Daily scan:** 02:00 in the timezone `MEDISYNC_CRON_TIMEZONE` (default `UTC`) (`cronJobs.js:13, 223-225`).
- **Manual scan:** "Force System Scan" on the admin outbreak monitor runs the same `runAnalysis`. It can
  answer 202 at once and poll for the result.

## 8. What the offline evaluation found

Details are in `docs/report/study/RESULTS.md` and `ml-engine/evaluation/evaluation_results.json`.

- On 344 weeks of OpenDengue Sri Lanka counts (one week fed as one detector day), the rule flagged 70.0% of
  strict epidemic weeks with specificity 85.7%, precision 45.5% and 5 false-alarm episodes.
- A fixed 95th-percentile threshold scored higher (F1 0.79 vs 0.55).
- The trend projection was less accurate than repeating the last value at 1, 2 and 4 weeks.
- These are tests of the rules on a proxy series, not of the live platform. No clinical validation has
  been done.

Last verified: 2026-11-18 at commit f5337833.
