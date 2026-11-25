# Alert upgrade runbook (72-hour view, projection, detailed email)

**Synthetic demonstration data.** The alerts in the live demo come from the labelled seed batch
`viva-2026-11-outbreaks`. This runbook is for the owner. It covers checking the upgraded alert screen
after merge and redeploy, approving one alert so that the email goes only to you, what to say at the
viva, and how to roll back. No step here changes environment variables, seeds data or uses `--confirm`.

## What changed

| Area | Change | Files |
|---|---|---|
| Alert list | The long sentence is replaced by a one-line **SYNTHETIC DEMO DATA** badge, shown only when the alert's source consultations carry a synthetic seed batch tag. A **Details** link opens a row with the full sentence and the three numbers. The approval window now also shows the full sentence. | `client/src/components/admin/AlertNumbers72h.jsx`, `client/src/pages/admin/OutbreakMonitor.jsx` |
| 72-hour numbers | **Previous 72 hours**, **Actual last 72 hours** (the window ending at the last complete day, Colombo midnight) and **Projected next 72 hours** with a range and the caveat "projection, not a forecast". A help icon explains the method. Once a later scan has covered the next 72 hours, the same alert also shows **Actual next 72 hours** and the absolute error. The existing growth %, per-100,000 and island lines are kept. | `server/src/services/alertProjection72h.js`, `server/src/controllers/alertController.js` |
| Projection snapshot | At scan time the projection is stored once on the alert (`projection72h`) and never overwritten. The later actual value is added beside it (`projection72hOutcome`). When a later scan updates the alert, the newest figures are stored in `latest72h` and shown; the first snapshot is kept and appears in the update history. The approval email uses the newest figures too. | `server/src/services/surveillanceService.js` (a 9-line call at the end of the scan; the detector rule is unchanged) |
| Email | The approval email and the "Send me a test email" email are now the detailed disease notification. It contains the summary, numbers computed from records, a sourced fact sheet, what the alert means and does not mean, and links. It is written in EN, SI or TA according to the recipient's stored language, falling back to English. The SI and TA strings need native-speaker review. | `server/src/services/outbreakDetailedEmail.js`, `outbreakDetailedDelivery.js`, `server/src/content/diseaseFactSheets.json` |

## 1. Check the new screen after merge and redeploy

1. Log in as administrator and open **Admin → Outbreak monitor** (`/admin/dashboard/outbreak`).
2. In **Outbreak Surveillance Logs**, check the following:
   - **Badge:** demo alerts (for example Kurunegala dengue) show the small amber **SYNTHETIC DEMO DATA**
     badge under the disease, and the long sentence is gone from the row. A real alert would show no
     badge.
   - **Numbers:** the "Verified Cases (72h)" column starts with three lines: Previous 72 hours, Actual
     last 72 hours, and Projected next 72 hours (range a–b), with "projection, not a forecast" under
     them. Hover the small (i) to see how the projection was made.
   - **Details:** click **Details**. The full sentence "Demonstration alert generated from synthetic seed
     data. Not an active public health notice." is shown, with three boxes and their time windows.
3. **Alerts from before the upgrade** have no stored snapshot. Their numbers are computed live as of
   the alert's creation time, and the detail line says "computed live (alert predates snapshots)". The
   next scan stores snapshots for the alerts it raises.
4. **Two 72-hour figures will differ.** The existing line "N cases (last 72h)" uses a rolling window
   ending at the scan time. The new "Actual last 72 hours" ends at the last complete day. Both are
   computed from records, so they can differ. In the offline proof they were 41 and 38.

Reference screenshots (offline, synthetic data):
- `docs/demo/alert72h/01_alert_list_badge.png`
- `docs/demo/alert72h/02_alert_detail_72h.png`
- `docs/demo/alert72h/03_email_preview_en.png`

The two screen shots were rendered from a test database holding Kurunegala dengue only (island-wide 41).
The email used the whole seed plan (island-wide 138).

## 2. Approve one alert with the test email going only to you

The controls that already exist stay in force:

| Setting | Effect |
|---|---|
| `OUTBREAK_EMAIL_DELIVERY_ENABLED` | Kill switch. `false` blocks every outbreak email, including the test email. Real alerts also need `true`. |
| `OUTBREAK_DEMO_EMAIL_ALLOWLIST` | Synthetic alerts go only to these addresses, or to your own address if the list is empty. |
| `DAILY_EMAIL_CAP` | The detailed email stops when today's count reaches the cap (default 100). |

1. Click **Approve** on one demo alert.
   - The window shows the recipient preview. For a synthetic alert this is the allowlist only.
   - It also shows the full synthetic sentence.
2. Click **Send me a test email** first.
   - It goes only to the address of the account you are signed in with.
   - Its subject starts with `[TEST] [MediSync] Critical: Dengue alert for Kurunegala` (severity and
     district vary).
3. Read the email. Check:
   - the amber synthetic banner;
   - the numbers match the screen;
   - the fact sheet shows sources with "accessed 2026-11-16";
   - the opt-out line is present.
4. Only then choose **District** scope and approve. For a synthetic alert the subject starts with `[DEMONSTRATION] [MediSync] ...`, which is the existing demonstration convention.
   - For a synthetic alert, the recipients are the allowlist only.
   - Leave the scope at **None** if you want no email at all.
5. The server log shows only `[OUTBREAK EMAIL] subject="..." messageIds=... accepted=n/m`. It never shows the body
   or the addresses.

## 3. What to say at the viva

- **The numbers are computed.** Every number on the screen and in the email is counted from verified
  consultations in the database. They are lower bounds, because only consultations recorded in MediSync
  count. Nothing is typed in by hand.
- **The projection is a baseline.**
  - The projected value is the last 72 hours repeated.
  - The range is the 10th to 90th percentile of past 72-hour changes for that district and disease. It
    needs at least 8 past windows; otherwise it shows "not enough history".
  - It has not been shown to beat repeating the last value. The back-test
    (`docs/report/alert72h_backtest.md`) gives the coverage:

    | Series | Range coverage | Target |
    |---|---|---|
    | Synthetic series | 87.7% | 80% |
    | OpenDengue Sri Lanka weekly counts | 67.6% | 80% |

    Shifting the value by past changes did not lower the error: the range midpoint's MAE was 1.46 vs
    1.44 (synthetic) and 206 vs 183 (OpenDengue).
- **The snapshot is honest.** It is stored at scan time and never changed. Three days later the real
  count is shown beside it with the absolute error, so the screen proves how good or bad the projection
  was.
- **The email is a statistical signal for human review.** It is not a medical finding about any person
  and not a confirmed outbreak. It contains no patient data.
- **The disease facts are sourced.**
  - They are short paraphrases of WHO fact sheets (dengue, typhoid, diarrhoeal disease, seasonal
    influenza) and the CDC leptospirosis page, each with its URL and accessed date.
  - Sri Lankan notification rules are not stated, because the Epidemiology Unit site could not be
    opened (HTTP 500).

## 4. Rollback

1. Revert the merge commit of this pull request on `main` and redeploy. This uses the normal
   pull-request flow, so there is no history rewrite.
2. **Leave the kill switch as it is now.** Do not enable delivery during a rollback. With
   `OUTBREAK_EMAIL_DELIVERY_ENABLED=false`, no outbreak email can leave the system.
3. The stored `projection72h` and `projection72hOutcome` fields on alerts are harmless after a revert:
   the old screen ignores them. They need no clean-up.
4. If a wrong email was sent:
   - set `OUTBREAK_EMAIL_DELIVERY_ENABLED=false` on the server (a change you make yourself, not part of
     this PR);
   - then check the audit log entries `ALERT_APPROVED` and `TEST_EMAIL_SENT`.

## Limits

- **Synthetic data.** Everything shown in the demo is synthetic demonstration data. The alerts are not
  real outbreaks.
- **The projection does not beat repeating the last value.** The OpenDengue check uses national weekly
  counts, not MediSync district 72-hour counts.
- **Look-back is limited.** Projection history uses at most 63 days before the alert date (20 past
  windows). For alerts from before the upgrade, history is limited to what is still within the scan's
  70-day look-back.
- **Translations are unreviewed.**
  - The SI and TA interface strings in the email have not been reviewed by native speakers.
  - Disease facts stay in English in SI and TA emails, with a note, until a reviewed translation exists.
- **The fact sheets are general public-health information,** not individual medical advice. Facts that
  could not be verified are listed in `diseaseFactSheets.json` under `notVerifiedLeftOut`.
- **The daily cap is enforced only for the detailed email.** Elsewhere, `emailService` only logs the cap.
- **The public map is unchanged.** It keeps its own existing synthetic label ("SIMULATION SCENARIO —
  DEMO ONLY").
- **The new server tests are not yet in the offline gate.** The gate runs a fixed list of server test
  files, and adding them would mean editing a gate config file. They are run separately; the client
  test is picked up by the gate automatically.
