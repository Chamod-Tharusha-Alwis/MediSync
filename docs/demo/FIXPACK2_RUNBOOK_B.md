# Fix pack 2, PR B: pharmacy workflow (owner runbook)

Merge after PR A, and only if the checks are green before Tue 17 Nov 20:00 Asia/Colombo. All data is
synthetic demonstration data. No data migration: the only schema change is a new optional list
`unavailableAt` on prescriptions. Existing prescriptions keep working unchanged.

## What changed

| Item | Change |
|---|---|
| B1 One medicine at a time | The "Dispense Consultation Order" button is gone. Each medicine has "Dispense Medication" and "Mark not available" (reason: out of stock, not stocked here, or other with a note). A not-available medicine stays **pending**, so another pharmacy can dispense it. Each consultation shows "N of M dispensed". Safety codes read as one sentence, for example "Prescriber acknowledged: drug interaction; duplicate active therapy; no dose limit on file". |
| B1 Atomic and idempotent | Unchanged code path, now proven: dispensing claims the prescription with a conditional update inside a transaction, and the receipt id is derived from the prescription. In the in-memory proof, two pharmacies dispensing the same medicine at the same moment produced exactly one receipt, and the other got `ALREADY_DISPENSED`. |
| B2 Repeat block | Enforced on the server (409 `REPEAT_COURSE_ACTIVE`), with no override. Example: "Warfarin was dispensed on 17 Nov at Ayu Arana Care Pharmacy for 5 days. Available again on 22 Nov." |
| B3 Patient email | "Your medication update" after every dispense or not-available action. It lists released medicines (name, quantity, Sri Lanka date and time), medicines not yet released or not available at this pharmacy, the pharmacy and pharmacist names, the consultation reference, and "Items not available here can be collected at another pharmacy." EN, SI and TA. No dosage strengths and no diagnosis. |

## How the ingredient match works, and its limits

- It uses the prescription's stored `resolvedIngredients`, written at prescribing time from the formulary
  (`ingredientResolver`). If those are missing, it uses `parseMedicationEntry()` on the medicine name, and
  failing that the normalised name.
- Only earlier **dispensed doctor prescriptions** are compared. OTC sales are not compared, and
  not-available items (still pending) never count.
- Course end = `dispensedAt + durationDays`. When the duration is missing, a **7-day default** is used and
  the message says so.
- Limits:
  - A brand name unknown to the formulary falls back to a name match, so a different brand of the same
    ingredient may not be caught.
  - Combination products match on any shared ingredient.
  - The check runs only with a live database connection (the same rule `prescriptionController` uses).

## Privacy note (owner decision)

The earlier dispense email deliberately hid drug names. The new email lists medicine names only while
`DISPENSE_EMAIL_MEDICINE_NAMES` is not `false`, and the code default is **on** for this deployment. Set it
to `false` on Render to show "Medicine 1, Medicine 2…" instead. That is an environment change only you can
make. The email is sent only in production (not in test mode), through the existing kill switch,
allowlist and daily cap.

## What to click in the viva

1. Pharmacist → Dispense → patient NIC → consent.
2. On one medicine, click **Mark not available** → "Out of stock" → Confirm. The medicine stays listed,
   with "Not available at: <pharmacy>".
3. Dispense another medicine. The counter changes to "N of M dispensed".
4. Try to dispense the same medicine again for a new prescription. The refusal names the date it becomes
   available.

## Evidence

- `server/tests/fixpack2Pharmacy.test.js`: 13 tests, including the in-memory proof run as a child
  process.
- `client/src/__master_offline__/fixpack2-pharmacy.test.jsx`: 4 tests.
- Proof script: `node server/scripts/demo/fixpack2PharmacyProof.cjs`. It runs only on the in-memory
  database and stubs the consent claim.

## Rollback

Revert the merge commit through a pull request. `unavailableAt` entries already written are ignored by the
old code and can stay.

Last verified: 2026-11-18 at commit f5337833. Location and internal links only; the content is a dated record and was not re-checked against the code (current documents are listed in docs/INDEX.md).
