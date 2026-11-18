# Fix pack 3 (small): owner runbook

Branch `fix/final-d-small`. Merge only if the checks are green before Tue 17 Nov 20:00 Asia/Colombo. All data
is synthetic demonstration data.

- No protected file was changed (15/15).
- No existing test was changed.
- No new API route was added (the count stays 228).
- No database migration: the new receipt fields are optional.

## Merge

1. Open the pull request, check that every check is green, then use **Merge pull request** (merge commit).
2. Render redeploys the API and Vercel redeploys the client from `main`. Do not change any environment
   variable.

## Redeploy check (about 2 minutes)

1. **Public Health** → **Recorded Consultation Visits** → click a district name in the district table.
   - The top 5 diseases open directly under that row.
   - Click again to close it.
   - Open another district: the first one closes.
2. **Pharmacy** → Dispense → retrieve a patient that has 2 or more pending medicines in one consultation.
   - Every medicine has a checkbox.
   - The consultation header has **Dispense selected (n)**.

## What to click in the viva

1. **Public Health, inline drill-down:**
   - Click **Colombo**: the disease rows appear inside the table, with "<5" for small counts.
   - Click a district with few verified cases: "Not disclosed (<5)".
   - Use Tab, then Enter or Space on a district name: it opens and closes the same way.
2. **Pharmacy, one receipt per release:**
   - Tick two medicines → **Dispense selected (2)** → tick "I have reviewed the safety information" →
     **Confirm Dispense**.
   - The message names ONE receipt number.
   - Dispense the remaining medicine with its own **Dispense Medication** button (or at another pharmacy).
     It gets a DIFFERENT receipt number.
   - **Dispensation History** shows one row per receipt; the joint release lists both medicines in one row.
   - The patient receives one email per receipt. It lists the medicines released together and what is
     still pending or not available. Medicine names follow the existing `DISPENSE_EMAIL_MEDICINE_NAMES`
     setting.
   - **"Mark not available"** never creates a receipt. Afterwards the medicine's checkbox is disabled at that
     pharmacy.

## Evidence

- **Offline gate:** `TOTAL passed=3812 failed=0`, protected hashes 15/15.
- **New tests** (new files only):

  | File | Tests | Covers |
  |---|---|---|
  | `client/src/__master_offline__/fixpack3-drilldown.test.jsx` | 3 | expand and collapse, one district open at a time, suppression, keyboard |
  | `client/src/__master_offline__/fixpack3-receipt.test.jsx` | 3 | checkboxes, one request with one idempotency key, refused selection |
  | `server/tests/fixpack3Receipt.test.js` | 10 | input checks, plus a child-process proof on an in-memory replica set (`server/scripts/demo/fixpack3ReceiptProof.cjs`) |

  The server proof shows:
  - two medicines released together get 1 receipt, and a retry replays the same receipt;
  - a separate release gets a different receipt;
  - a repeat-course block refuses the whole selection and writes nothing;
  - parallel requests give exactly 1 receipt per item, for selection against selection and for selection
    against a single dispense;
  - history has 1 row per receipt;
  - there is 1 email per receipt.
- **Screenshots** (`docs/demo/fixpack3/`):
  - drill-down, before and after: `drilldown_colombo_{before,after}.png` (numbers),
    `drilldown_badulla_{before,after}.png` (suppressed);
  - drill-down at phone width: `drilldown_*_after_phone.png`;
  - pharmacy: `pharmacy_dispense_{before,after}.png`, `pharmacy_dispense_selected_modal_after.png`;
  - history: `pharmacy_history_after.png`.

## Rollback

Revert the merge commit through a pull request. Receipts already written with `prescriptionIds` remain valid
for the old code: history still shows their items, and `prescriptionId` points at the first medicine.

## Limits

- **Below the table:** the "<District>: N Visits" card stays below the district table, because
  `client/src/__master_offline__/public-health-suppression.test.jsx` lines 36–50 pin it. The separate
  "Top diseases" panel is removed from this tab.
- **Surveillance tab:** the "Clinical surveillance" drill-down under the map (map selection) is unchanged.
  Only the consultation-visits table was in scope.
- **Different counts:** the visits column counts recorded visits, but the drill-down counts distinct verified
  cases (one per patient, disease and episode). So a district can show "6" visits and "Not disclosed (<5)"
  diseases.
- **Drill-down screenshots** use the fixture values of the new client test. The in-memory demo seed does not
  feed `/public/health-stats` (every district returned 0 offline). Pharmacy screenshots use records written
  by the real services in the in-memory proof.
- **Joint release rules:**
  - It needs 2 to 20 medicines of ONE consultation and an idempotency key (the screen generates one per
    opened checkout).
  - With one medicine ticked, the button opens the normal single-medicine dispense.
  - Substitutions ("brand substitute") are recorded only with the single-medicine button.
  - Partial quantities are not part of a joint release.
- **Not-available marks:** selectability uses the marks of the signed-in pharmacy (`unavailableHere` in the
  pending listing). The server does not refuse a medicine that was marked not available, so a pharmacy that
  later gets stock can still dispense it with the single button.
- **Translations:** the new pharmacy labels ("Dispense selected (n)", "Select …") are English, like the rest of
  the pharmacy screen. The drill-down reuses the existing `drilldown.*` EN/SI/TA labels. The SI and TA texts
  still need native-speaker review.
- **Repeat-course rule:** it is checked per item against earlier dispensed courses. Two medicines with the
  same ingredient inside ONE selection are not compared with each other.
- **Unrelated failing test:** `server/tests/pharmacyInventoryRemediation.test.js` (the retired stock feature)
  fails to load on `main` as well. It is not in the gate.

Last verified: 2026-11-18 at commit f5337833. Location and internal links only; the content is a dated record and was not re-checked against the code (current documents are listed in docs/INDEX.md).
