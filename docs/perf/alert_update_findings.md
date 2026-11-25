# Outbreak scan: how alerts are saved, and what changes

Branch `feat/alert-update-on-scan`, from `main` = `f52570c`. Read on 2026-11-25. Section 1 to 4 describe the code **before** the change.
No production data was read.

## 1. Where the scan creates alerts

| Step | Where |
|---|---|
| "Force System Scan" | `POST /admin/outbreak/trigger` → `adminController.triggerMLDetection` → `surveillanceService.runAnalysis`, then `alertReminderService.remindPendingAlerts` |
| Nightly scan (02:00, only if background jobs are approved) | `utils/cronJobs.js` → the same `runAnalysis`, then the same reminder |
| ML engine callback | `alertController.triggerAlert` → `runAnalysis` |
| Saving | `runAnalysis`, two places: (1) signals of the statistical rule, (2) ML anomalies that the rule did not flag. Both used `OutbreakAlert.updateOne({ _id }, …, { upsert: true })` |

**What made an alert "the same" before:** its `_id` was a SHA-256 hash of policy, mode, district, disease **and every source consultation ID in the
63-day bucket**. One new case, or one old case leaving the window, changed the hash. So the next scan created a second Pending alert,
and the first kept its old counts. A rescan with exactly the same rows hit the same `_id`; it also rewrote counts on an alert
that was already resolved or dismissed, without changing its status.

## 2. Schema, indexes, statuses
- Model `server/src/models/OutbreakAlert.js`. Statuses: `Pending`, `Active` (= approved by an administrator), `Resolved`, `Dismissed`. "Confirmed" is
  `feedbackStatus`, not a status. A false-positive feedback sets the status to `Resolved`.
- **Active for this change = `Pending` or `Active`.**
- Disease and district are stored in `disease` and `location`. `district`, `caseCount`, `alertLevel`, `maxZ`, `consecutiveDays` and `dailyCounts` were in the update
  but are **not in the schema**, so Mongoose strict mode dropped them. The stored case count is `affectedCount`.
- `projection72h` and `projection72hOutcome` are written once through the raw collection (`alertProjection72h.js`).
- Index: `_id` only. Production runs with `autoIndex: false`, and `server/src/security/productionStorageManifest.json` (checked by
  `productionStorageAdmission.test.js`) allows no other index on this collection.

## 3. Who is notified, and where

| Event | Recipients | Code |
|---|---|---|
| Alert created by a scan | In-app: all active doctors, hospitals, administrators; socket event to administrators | `notificationService.notifyOutbreakAlert`. It skips users who already have a notification with the same `referenceId` (the alert ID) |
| After a scan | Administrators: one review reminder (bell and email) per pending High or Critical alert, once (`reminderSentAt`) | `alertReminderService` |
| Approval | In-app again, and the detailed email to the chosen scope | `adminController.approveAlert` → `outbreakDetailedDelivery` |
| Alert saved as a document (resolve, dismiss, feedback) | In-app through the `post('save')` hook (same skip rule) | `OutbreakAlert.js` |

Before this change every rescan called `notifyOutbreakAlert` for every signal. Stored notifications were skipped, but the socket event was sent again.

## 4. The 14-day rule
`server/src/services/outbreakViews.js`: Monitor = `Pending` or `Active` **and** `createdAt >= now − 14 days`; History = everything else (`$nor`). One helper.

## 5. What changes

| Topic | New behaviour |
|---|---|
| Identity | `disease` + `location`, within the same policy and mode (real or simulation). Detector, severity cut-offs and projection maths are not touched. |
| Active alert exists | Updated in place. The newest one is used if old duplicates exist; **old duplicates are left as they are** until an administrator resolves them. |
| No active alert | A new alert. `firstDetectedAt`, `lastUpdatedAt` and `createdAt` are the same instant. |
| Same data | Nothing is written: no history, no alert, no notification. |
| Closed alert (resolved or dismissed) | Never changed. If every current source case was already part of a closed alert, **no new alert** is made (unchanged data). One new case makes a new alert. |
| Lower window result | The displayed count (`affectedCount`) is not lowered. The history entry records the true lower number and the note `WINDOW_RESULT_LOWER`. The 72-hour figures are stored as measured, with their dates. |
| Atomic update | `findOneAndUpdate` on `_id` + identity + active status + the expected `updateCount`. If another scan won, it re-reads and compares again. |
| Atomic create | The new `_id` is a hash of the identity and the IDs of its closed alerts. Two scans at the same moment compute the same `_id`, so the built-in unique `_id` index allows only one. |
| 72-hour figures | The first snapshot (`projection72h`) stays write-once, so its later outcome check stays valid. Newer figures go to `latest72h`, with the same unchanged maths. |
| Notification on update | Only when severity rises, once, through the same in-app function with a separate reference key. |
| Audit | `ALERT_UPDATED_BY_SCAN` through `recordAudit` for every update. |

**Partial unique index: not created.** (a) Existing duplicates are likely, because the old scan produced them, and would break the build.
(b) Production has `autoIndex: false` and a fixed storage manifest, so it would not be built anyway. The atomic operations above are used instead.

**Pinned test and the 14-day rule.** `server/tests/outbreakHistory.test.js:29` pins `monitorCondition(now)` to `createdAt`, and existing tests may not change.
The same helper therefore takes `{ detectedAt: true }`, which uses `firstDetectedAt` and falls back to `createdAt`. The Monitor and
History requests use that form; there is still one cut-off.

## 6. Opinion: `firstDetectedAt` or `lastUpdatedAt` for the Monitor?
I implemented `firstDetectedAt`, as asked. **I think `lastUpdatedAt` is safer for real use.** An outbreak that is still growing after 14 days leaves the
Monitor, and because its alert is still active, later scans update that hidden alert instead of creating a visible one. It would then be
seen only in History. A middle way is to keep a still-updating active alert on the Monitor. Not switched; your decision.

## 7. Points that need your decision
1. **Approval email numbers. Decided by the owner on 2026-11-25: use the newest.** `outbreakDetailedDelivery.numbersForAlert` now uses `latest72h` and its date for an updated alert, so
   the email and the Monitor agree. An alert that was never updated is unchanged. The "Alert date" line is still the first detection. Who receives an email, and when, is unchanged.
2. **Review reminder.** The existing reminder is separate from the scan. A pending alert that rises from Moderate to High gets its first review reminder (bell
   and email to administrators) after the scan, **in addition to** the one escalation notification. A pending High alert that never had a reminder can
   also get it after a same-severity scan. Both are existing behaviour; not changed.
3. **Approved alerts.** An `Active` alert is public. A later scan changes its severity and count on the public list without a new approval, because you asked for
   confirmed alerts to be updated.
4. **Mixed provenance.** A bucket with any synthetic case still labels the alert as demonstration data (existing rule). With one alert per outbreak, seeding synthetic cases
   into a district and disease that has a real active alert would label that real alert as demonstration data.

## 8. Result
`node server/scripts/demo/alertUpdateProof.cjs` (in-memory MongoDB, real scan; console output in `docs/evidence/alert-update/`): 5 scans at the same moment gave 1 alert and then 1 update;
identical data wrote nothing; a severity rise sent 4 notifications to 4 recipients and a repeat sent 0; 8 updates gave 8 audit entries; 0 emails.
