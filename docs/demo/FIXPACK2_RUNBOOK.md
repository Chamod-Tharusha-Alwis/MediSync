# Fix pack 2: owner runbook

All production data is synthetic demonstration data. Nothing in this fix pack changes production data, the
outbreak detector, the ML engine, or the OTP rules (5 attempts, 15 min lock, 60 s cooldown).

## 1. Merge order and freeze

1. **PR A** `fix/final-a-display` (display and messages), then **PR B** `fix/final-b-pharmacy`, then
   **PR C** `fix/final-c-extras`.
2. Merge a PR only if its checks are green **before Tue 17 Nov 20:00 Asia/Colombo**. A PR that is not
   green by then stays unmerged.
3. PR B and PR C have their own sections: `docs/demo/FIXPACK2_RUNBOOK_B.md` and
   `docs/demo/FIXPACK2_RUNBOOK_C.md`, which arrive with those PRs.

## 2. Redeploy checks after each merge

1. Wait for Vercel (client) and Render (server) to show the merge commit as live.
2. Hard-reload the site (Ctrl+Shift+R). The sidebar footer should show the merge commit's first
   7 characters.
3. Render free tier: open the site about 10 minutes before the viva so the server is awake.

## 3. PR A: what changed and what to click in the viva

| Item | What changed | What to click |
|---|---|---|
| A1 Consultation PDF | Medicines print as a table (Medicine, Dose, Frequency, Duration, Status) instead of encrypted strings; doctor and facility come from stored records; all times are Sri Lanka time with the label; labs print as a table with "Unavailable until the laboratory uploads the result". NIC masking and the NIC password are unchanged. | Patient portal → History → a consultation → Download PDF (open with the NIC). Or scan the QR and unlock. |
| A2 History titles | Each past consultation shows "diagnosis (ICD code)" as its title, then date and doctor. | Doctor → New consultation → patient → Past Consultations & Labs. |
| A3 Lab results | No download button until the laboratory uploads the result; the card says "Lab result unavailable. It will appear after the laboratory uploads the result." The server returns 409 with the same sentence. | Patient → History → a consultation with a pending lab. |
| A4 Labels | No badge in the admin alert list. The detail view and approval preview show the disclosure as small muted text. The public page has no red per-advisory banner; the chart is titled "Trend projection (14 days)"; one muted footer line says "Demo environment. Sample data used for academic demonstration." (EN, SI, TA). | Admin → Outbreak monitor; Public Health page (scroll to the bottom). |
| A5 OTP | On a lock, the dialog shows the server message and "Try again in N minutes", and Retry stays disabled. Reopening the dialog does not send another request. "Verifying & Unlocking" stops after 20 s with a message. Trusted devices show the 5 most recent with "Show older devices". | Doctor → My Profile → Trusted devices. |

**Needs native-speaker review:** the Sinhala and Tamil strings added in this PR (`demoEnvironmentFooter`,
`trendProjectionHeading`, `trendProjectionMethod` and `labResultUnavailable` in
`client/src/i18n/translations/si.js` and `ta.js`).

## 4. PR A limits (owner decisions needed)

- **Approval email banner (A4): not changed.** Existing tests pin the current email wording, and only one
  test edit was authorised:
  - `server/tests/alert72hEmail.test.js` lines 24, 32 and 33 (the "SYNTHETIC DEMONSTRATION ALERT" line,
    the `[DEMONSTRATION]` subject and `data-demo-banner`);
  - `server/tests/outbreakEmailPart2.test.js` lines 200 and 201;
  - `server/tests/alert72hScanMemory.test.js` lines 42 and 43.
- **Detail view and approval-preview wording (A4): restyled, wording unchanged.** These are now quiet
  (small, muted, no box, no capitals), but the sentence still reads "Demonstration alert generated from
  synthetic seed data...", because `client/src/__master_offline__/alert-72h-badge.test.jsx` lines 64 and 81
  assert it.
- **Other places that say "synthetic" were not touched,** because tests pin their text and they are outside
  this item's list: the public doctor, hospital and pharmacy directories, the university workspace, and the
  public map's popup.
- **"Dispensation summary" PDF (A1):** there is no such PDF in the code base. Dispensing produces a
  receipt and an email (PR B covers the email).
- **Screenshots** come from the real pages bundled offline, with response bodies computed by the real
  handlers from the in-memory synthetic seed (`server/scripts/demo/fixpack2Proof.cjs fixtures`). For the
  public-page picture, one alert was approved inside that throwaway in-memory database.

## 5. Rollback

Revert the merge commit on `main` through a pull request. No data migration is involved, so nothing in
the database needs undoing for PR A.
