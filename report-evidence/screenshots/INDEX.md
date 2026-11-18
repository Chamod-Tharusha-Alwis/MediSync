# Screenshot index

## Code screenshots (`code/`)

`S1.png` … `S10.png` were rendered on 18 Nov 2026 by `node report-evidence/scripts/snippets.cjs`:

- Playwright Chromium from `client/node_modules/playwright` (nothing was installed);
- 1400 px viewport, `deviceScaleFactor: 2`, cropped to the code card;
- highlight.js 11.11.1 with the GitHub light theme, 14 px monospace, line numbers, and the file path and line
  range in the caption bar.

The source HTML is in `code/html/`. What each snippet shows is listed in `../snippets/INDEX.md`.

## Live screenshots (`live/`)

Site: **https://medisync.chamodtharusha.com.lk** (the origin the live API's CORS header allows). Viewport
1440 × 900, `deviceScaleFactor: 2`, taken with `node report-evidence/scripts/live_screenshots.cjs`. Only
public pages were opened: no login, nothing typed, no form submitted.

| File | Date / time (UTC) | Page | What it shows | Defect ID |
|---|---|---|---|---|
| `L1_login.png` | 2026-11-18 07:56:24 (13:26 +0530) | `/doctor/login` | The practitioner sign-in page as served: empty fields with placeholder text only, no email address or password | *fill in* |
| `L6_district_drilldown.png` | 2026-11-18 07:56:54 (13:26 +0530) | `/public-health?tab=visits`, district "Colombo" clicked | Viewport: the top-5 disease panel open **inline, directly under the Colombo row** | *fill in* |
| `L6_district_drilldown_table.png` | same | same | The whole district table: Colombo expanded with five diseases each shown as "<5", and other districts with their counts or "Not disclosed (<5)" | *fill in* |

**Defect IDs:** I could not find your defect list (D3-D19, D23) in the repository. The only D-numbers there
are task IDs in `docs/new/00_START_HERE_NEXT_PROMPT_TASKS_AND_PROGRESS.md`, which is a different scheme. Fill
in the column yourself.

## NOT CAPTURED

| Requested | Reason |
|---|---|
| `L2_patient_home.png` | Needs a patient login on the live site. `DEMO_PASSWORDS_FILE` was not set, and I do not type passwords into a production site. Patient login also needs an email OTP. |
| `L3_doctor_dashboard.png` | Needs a doctor login (password) on the live site; same reason. |
| `L4_pharmacist_dispense.png` | Needs a pharmacist login and a patient's OTP consent before any medicine is visible. Also note: after fix pack 3 (PR #55, merged), medicines released together share **one** receipt, so "one receipt per medicine" no longer describes the live behaviour. The offline screenshots of the current screen are in `docs/demo/fixpack3/pharmacy_dispense_after.png` and `pharmacy_history_after.png`. |
| `L5_admin_outbreak_dashboard.png` | Needs an admin login (password plus OTP) on the live site. |
| `L7_alert_detail.png` | Needs an admin login; alert details are not public. |

**To capture these yourself:**

1. Sign in on https://medisync.chamodtharusha.com.lk in a normal browser window at 1440 × 900.
2. Take each screenshot. Before saving, crop out the header or profile area that shows your email address.
