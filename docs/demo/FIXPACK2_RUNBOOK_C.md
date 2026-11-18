# Fix pack 2, PR C: extras (owner runbook)

Merge after PR A and PR B, and only if the checks are green before Tue 17 Nov 20:00 Asia/Colombo. All
data is synthetic demonstration data. The detector rule, the thresholds and the ML engine are unchanged.
No new API routes were added: `server/tests/testMatrixInventory.test.js:46` fixes the API route count at
228.

## C1: scan trigger CORS failure

**Evidence**

- `adminController.triggerMLDetection` held the browser request for the whole scan, and
  `surveillanceService.runAnalysis` waits up to 60 s for the ML engine (`ML_OUTBREAK_TIMEOUT_MS`, default
  60000).
- Measured offline (`node server/scripts/demo/fixpack2ExtrasProof.cjs scan`, 30,032 seeded
  consultations):

  | Case | Time |
  |---|---|
  | ML engine unreachable | 181 ms median of 5 (177.6, 183.0, 180.8, 181.0, 192.8) |
  | ML engine asleep (accepts, never answers) | 60,195 ms |
  | New async trigger | 202 in 1.6 ms; the job finished on the server in 60,223 ms with 4 results |

- `server/src/app.js` registered the "Service shutting down" 503 **before** `cors()`, so a request that
  arrived during a restart or redeploy got a response with no `Access-Control-Allow-Origin` header. The
  browser reports that as a CORS error with `net::ERR_FAILED`.
- A response that the hosting proxy itself sends (502/504 while the instance restarts, sleeps or times out)
  never carries the app's CORS headers. I could not confirm which case happened in production without the
  Render logs.

**Fix**

- CORS now runs first.
- The monitor sends `{ async: true }`. The server answers 202 with a job id at once and runs the same scan
  in-process. The page polls `GET /api/admin/outbreak/last-scan?jobId=…` every 2 s, for up to 3 minutes.
- Without the flag, the old synchronous behaviour is unchanged.

**Could a failed trigger still have completed?** Yes. Node does not stop a scan when the browser gives up,
so a trigger that showed the CORS error may still have created or updated alerts. Check the alert list
and "Last scan" before triggering again. Re-running is safe: alert ids are deterministic, so a repeat scan
updates the same alerts.

## C2: test email accepted but not received

**Code path, in order**

1. Kill switch: `OUTBREAK_EMAIL_DELIVERY_ENABLED='false'` (`outbreakDetailedDelivery.js`).
2. Allowlist: `OUTBREAK_DEMO_EMAIL_ALLOWLIST` for demonstration alerts; the admin's own address is allowed
   for the test email.
3. Daily cap: `DAILY_EMAIL_CAP` / `EMAIL_DAILY_CAP`, default 100.
4. `emailService.sendMail`. In test mode (`MEDISYNC_TEST_MODE=true`), or when every recipient ends in
   `.local`, the message is **captured in memory and reported as accepted**, so nothing leaves the
   server. The test email goes to the signed-in admin's own address, so a `…@qa.medisync.local` admin
   account never receives it.
5. Provider:
   - Resend is first. The default sender is `onboarding@resend.dev` when `RESEND_FROM_ADDRESS` is not
     set; that is Resend's sandbox address, which delivers only to the Resend account owner.
   - Brevo is the backup, and it requires a verified sender.
6. The API used to report "sent successfully" when the provider **accepted** the message. Acceptance is not
   delivery.

**Fix**

- The test-email and approval responses now report one of three outcomes:
  - Sent, with the provider message id;
  - Skipped, with the reason (kill switch, not allowlisted, daily cap, or captured by the test transport);
  - Failed, with the reason code.
- The admin UI shows that result.
- Logs keep only the subject and the message id.

**Owner checklist, in the provider dashboards**

1. Resend → Domains: the sending domain is **Verified** (SPF and DKIM records added in DNS).
2. Render → Environment: `RESEND_FROM_ADDRESS` uses that verified domain, not `onboarding@resend.dev`. Only
   you can view or change this.
3. Resend → Emails / Logs: find the message id shown in the UI and check its status (delivered, bounced or
   suppressed).
4. Brevo → Senders: the backup sender address is verified.
5. Make sure the recipient is a real mailbox, not `.local`, and is on `OUTBREAK_DEMO_EMAIL_ALLOWLIST` for
   demonstration alerts.
6. Check the spam or junk folder.

## C3: reminders for pending High/Critical alerts

- After each scan (manual trigger or the existing daily scan), every new pending High/Critical alert is
  reminded **once** (`reminderSentAt` is claimed with a conditional update). The reminder is:
  - an in-app bell notification for each active administrator;
  - **one** email to the administrators, "N alerts need review", listing disease, district, severity and a
    link. Repeated signals are grouped.
- The kill switch, allowlist and cap apply.
- "Send reminder now" on the outbreak monitor sends the current list again.
- No scheduler or service was added.
- **First deploy:** the first scan after the merge reminds all currently pending High/Critical alerts (the
  10 seeded ones) once.

## C4: district drill-down on the public page

- Clicking a district on the map, or in the district table, opens a panel with the top 5 diseases of the
  last 30 days and the number of people for each.
- "People" means distinct verified cases: one per patient, disease and episode.
- Small-cell rule:
  - a count below 5 shows "<5";
  - a district with fewer than 5 verified cases shows "Not disclosed (<5)".
- The data comes from the existing cached `/public/health-stats` aggregation.
- EN, SI and TA labels; **SI and TA need native-speaker review** (`drilldown.*` in the translation files).
- **Limit:** `/public/health-stats` already returns raw per-disease counts, including counts below 5.
  The page shows "<5" for them, but the JSON response is unchanged existing behaviour, and changing the DTO
  was outside this item.

## What to click in the viva

1. Admin → Outbreak monitor → **Force System Scan**. The page stays responsive and shows the result when the
   job ends.
2. Click **Send reminder now** → a message says how many alerts and notifications, and whether the email was
   sent, skipped or failed.
3. Open an alert → Approve → **Send test email** → the result says Sent (id), Skipped (reason) or Failed
   (reason).
4. Public Health page → click **Kurunegala** on the map → the drill-down panel.

## Evidence

- `server/tests/fixpack2Extras.test.js`: 11 tests, including two in-memory proofs run as child processes.
- `client/src/__master_offline__/fixpack2-extras.test.jsx`: 4 tests.

## Rollback

Revert the merge commit through a pull request. `reminderSentAt` values that were already written are
ignored by the old code.

Last verified: 2026-11-18 at commit f5337833. Location and internal links only; the content is a dated record and was not re-checked against the code (current documents are listed in docs/INDEX.md).
