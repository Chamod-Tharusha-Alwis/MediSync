# Synthetic outbreak seed for the viva demonstration: design

**Synthetic demonstration data.** Every record described here is invented. Nothing comes from a real patient,
clinician or facility. The seed demonstrates the **unchanged** outbreak rule on believable data. It is
**not** an accuracy measurement and not real surveillance data. The dengue shape is
"synthetic, shaped from public weekly counts" (Section 3).

This document was committed before any seed code was written and before the detector was run on the
seed. The expected results in Section 5 are fixed here. Phase 3 reports every mismatch against them.

## 1. What already exists and is reused (Phase 0 findings)

| Mechanism | Where | How this seed uses it |
|---|---|---|
| Labelled seed batch `viva-2026-11-outbreaks` | `server/src/services/surveillanceService.js` lines 6-10 (`VIVA_DEMO_SEED_BATCH`, `synthetic()`) | Every record carries `isSynthetic: true` and `syntheticSeedBatch: 'viva-2026-11-outbreaks'`. This is the only synthetic batch the real-mode scan admits. No new flag is invented. |
| Verified-case admission | same file, `selectCases` lines 38-66 | Each consultation carries `surveillanceVerification` with `status: 'verified'`, `diagnosisStatus: 'confirmed'`, `source: 'clinical_review'`, `verifiedBy: 'viva-2026-11-outbreaks'`, `caseDefinitionReference: 'WHO-SL-EPI-2026'` and a unique `episodeId`. These are the same values `scripts/seed_viva_outbreaks.js` writes. |
| Alert provenance | `alertProvenance`, lines 16-27 | Alerts built from these cases are automatically labelled `isDemoData`, `isSynthetic`, with the label "Demonstration alert generated from synthetic seed data. Not an active public health notice." |
| Synthetic identity pattern | `scripts/seed_viva_outbreaks.js` `parentPatients` / `parentDoctors` / `parentHospitals` | The same scheme: numeric synthetic NICs written with `writeNicFields`, "Surveillance Case Subject N" style names, `@qa.medisync.local` addresses, batch-tagged parents. This seed uses its own identifier ranges so it never collides with that seeder (Section 6). |
| District and condition catalogue | `scripts/seedVivaPlan.cjs` `DISTRICTS` (25 districts, outpatient weights summing to 100) and `CONDITIONS` (ICD-10 codes) | Imported directly. Nothing is copied by hand. |
| Clean-up | `scripts/cleanup_viva_outbreaks.js` removes the **whole** batch | The new `cleanDemo` uses the same two-flag invariant (`syntheticSeedBatch` and `isSynthetic` must both match, otherwise abort). It also requires this seed's identifier prefix, so it removes only this seed's records and leaves any `seed_viva_outbreaks.js` records in place. |
| Database selection | `server/scripts/operatorDatabaseMode.js` `selectOperatorDatabase` | `--confirm` connects only through this existing guard. Dry runs never connect. |

The detector rule is used exactly as committed: 7 complete days ending yesterday, at least 5 verified
episodes, a 56-day baseline, and z > 2.0 on two consecutive days (`evaluateOutbreakCriteria`).

The production scan (`runAnalysis`) has a **second path**. It posts weekly counts to the ML engine
`/api/admin/outbreak/trigger`, which applies the heuristic in `ml-engine/app.py` `calculate_outbreak_metrics`.
For a "High" danger disease the heuristic needs more than 10 cases in 7 days and a 150% rise over
`previous_baseline_avg`. That heuristic has no persistence check. The heuristic can add an alert only for
a district and disease that the rule did not already flag. Phase 3 runs the real ML engine locally so
this path is exercised too.

Supported values used here:
- **Districts:** all 25: Ampara, Anuradhapura, Badulla, Batticaloa, Colombo, Galle, Gampaha, Hambantota,
  Jaffna, Kalutara, Kandy, Kegalle, Kilinochchi, Kurunegala, Mannar, Matale, Matara, Monaragala,
  Mullaitivu, Nuwara Eliya, Polonnaruwa, Puttalam, Ratnapura, Trincomalee, Vavuniya.
- **Diseases:**

  | Disease | ICD-10 code |
  |---|---|
  | Dengue | A90 |
  | Influenza | J11.1 |
  | Diarrhoeal disease | A09 |
  | Leptospirosis | A27.9 |
  | Typhoid fever | A01.0 |

## 2. Scale and storage

- **Volume:** about 30,000 bulk consultations over the 365 days ending yesterday (reference day D is
  the seed day). The script aborts if the planned total falls outside 20,000-40,000.
- **Supporting records:** 600 synthetic patients, 25 synthetic clinics (one per district) and 25
  synthetic doctor records, all batch-tagged.
- **Doctor records cannot log in:** they have no password field.
- **Storage limit:** the Atlas free tier (M0) limit is **512 MB**. The bulk batch must add **less than
  120 MB**.
- **Projected size:** measured, not guessed. Phase 3 inserts the plan into the local in-memory MongoDB
  with the Consultation model's indexes. It reads `collStats` (data size plus index size) and records the
  average bytes per consultation. It does this both for documents as written and for the encrypted form,
  then uses the larger figure.
- **What the scripts print:** the projected megabytes. `--confirm` refuses to write if the projection is
  120 MB or more.

## 3. Bulk background shape (fixed seed 20261118)

The expected daily count for district *d*, disease *k* and date *t* is:

`annual_k x share_d x season_k(week of t) x weekday(t) / 365`

The actual count is drawn from a gamma-Poisson distribution with dispersion 10. That means extra-Poisson
noise. The generator is a seeded PRNG keyed on (seed, date, district, disease), so a given date always
gets the same counts.

| Disease | ICD-10 | Annual total | Season |
|---|---|---|---|
| Dengue | A90 | 12,000 | OpenDengue Sri Lanka weekly shape (below) |
| Influenza | J11.1 | 7,500 | 1 + 0.15 cos, peak ISO week 2 |
| Diarrhoeal disease | A09 | 6,000 | 1 + 0.15 cos, peak ISO week 20 |
| Leptospirosis | A27.9 | 3,000 | 1 + 0.15 cos, peak ISO week 44 |
| Typhoid fever | A01.0 | 1,500 | 1 + 0.15 cos, peak ISO week 30 |

- **District shares** are the `seedVivaPlan.cjs` outpatient weights, for example Colombo 12%,
  Kurunegala 7% and Mullaitivu 1%.
- **Weekday pattern:** Mon 1.25, Tue 1.15, Wed 1.10, Thu 1.05, Fri 1.00, Sat 0.85, Sun 0.60. These are
  rescaled so the week averages 1.0.
- **Timing:** consultation times fall between 08:00 and 17:00 Colombo time.
- **Dengue shape:** taken from the public OpenDengue V1.3.1 national extract, recorded in
  `ml-engine/evaluation/data/manifest.json` as `opendengue_national`:
  - URL: https://raw.githubusercontent.com/OpenDengue/master-repo/main/data/releases/V1.3.1/National_extract_V1_3_1.zip
  - SHA-256 `c588335f25f2202e4f87d271381f385c76ffd4dcb68348f40c2a6fcab8889d4e`
  - CC BY 4.0, downloaded 2026-11-15
- **How the shape was derived:** `server/scripts/demo/derive_dengue_shape.py` averages each year's
  week/year-mean ratio over 2010-2017 and 2019. Those are the years with at least 50 reported weeks.
  It writes 52 numbers to `server/scripts/demo/dengue_weekly_shape.json`.
  - The shape runs from 0.49 (week 14) to 1.71 (week 51).
  - Mid-November (weeks 46-47, 1.06-1.19) is about 1.4 times the September-October level (weeks 38-46
    average 0.83).
  - So the bulk data contains a **real seasonal rise** at viva time.
- **Scaling down:** the national shape is reduced to district level by the fixed district shares. It is
  synthetic, shaped from public weekly counts. It is not the real district incidence.

## 4. Scripted scenarios (relative to seed day D; cases added on top of the background)

All scenario districts avoid the seven districts used by `scripts/seed_viva_outbreaks.js`, so the two seeds
never share a district-disease bucket for a scripted signal.

| # | Scenario | District, disease | Added cases | Purpose |
|---|---|---|---|---|
| 1 | Clear outbreak A | Kurunegala, dengue (A90) | D-5: +4, D-4: +6, D-3: +9, D-2: +11, D-1: +12 (42) | Sharp rise the rule should flag |
| 2 | Clear outbreak B | Kegalle, leptospirosis (A27.9) | D-4: +3, D-3: +4, D-2: +5, D-1: +4 (16) | Second disease, another district |
| 3 | Slow rise | Anuradhapura, influenza (J11.1) | Background rate multiplied by 1 + (63 - a)/62 for days a = 63..1 ago (about double by D-1); no extra spike | Gradual increase the rule is expected to miss |
| 4 | Noise spike | Hambantota, typhoid (A01.0) | D-2: +8 on one day only | One noisy day the persistence guard should not flag |

Placing the outbreaks on D-5..D-1 keeps them inside the 7-day window for scans on D, D+1 and D+2. The
baseline then stays background-only. The owner can seed on Tuesday and show the result on Wednesday.

## 5. Expected results (fixed before running the detector)

| # | Rule path (z > 2.0 on 2 consecutive days, at least 5 cases) | ML heuristic path | Expected alert |
|---|---|---|---|
| 1 | Flag. Daily counts about 7-15 against a baseline of about 2/day: z well above 4 on 5 consecutive days, Critical | Not reached (rule already flagged) | **Pending alert, Kurunegala dengue** |
| 2 | Flag. 3-5 a day against about 0.3/day: Critical | Not reached | **Pending alert, Kegalle leptospirosis** |
| 3 | Miss. The baseline rises with the window, so z stays below 2 | Miss. About 11 cases this week against a baseline average of about 20 | **No alert (correct miss)** |
| 4 | Suppressed: floor met (about 9 cases) but only one day above z 2 (`PERSISTENCE_CRITERIA_NOT_MET`) | Miss if the week total stays at 10 or fewer. If background adds 3 or more typhoid cases that week, the heuristic (no persistence) could flag it | **No alert expected**. A heuristic alert, if it occurs, is reported as such |
| Background | No alert intended. The dengue seasonal rise (about 1.4 times) in high-volume districts can push z above 2 by chance; that would be a seasonal false alarm, as in the report's Section 6.3 | Not expected (the baseline average is about 2.4 weeks of cases, so a 150% rise needs about 6 times normal) | **No alert expected**. Any background alert is reported as a false alarm. The seed is not re-rolled to hide it |
| Live demo | Flag (Section 6) | Not reached | **Pending alert, chosen district dengue** |

## 6. Live-demo command

`seedDemoLiveOutbreak` adds 36 verified dengue cases in **one** district over the 5 days ending yesterday:
+4, +6, +8, +9, +9.
- **District:** default Badulla, with a background of about 1.6/day. `--district` must be one of the 25
  districts and must not be one of the scenario districts.
- **Expected result:** one scan then raises a pending alert, because the daily z is above 4 on 5
  consecutive days.
- **Idempotent:** IDs are `viva-2026-11-outbreaks-DEMO-LIVE-<district>-<yyyymmdd>-NN`, so running it twice
  on the same day inserts nothing new.

## 7. Identifiers, flags and clean-up

| Record | Identifier (all also carry the batch tag and `isSynthetic: true`) |
|---|---|
| Bulk and scenario consultations | `consultationId` `viva-2026-11-outbreaks-DEMO-<yyyymmdd of D>-<6 digits>` |
| Live consultations | `viva-2026-11-outbreaks-DEMO-LIVE-...` |
| Patients | NIC `9991` + 8 digits, name "Synthetic Surveillance Subject NNNN", email `viva.demo.patient.NNNN@qa.medisync.local` |
| Doctors | `doctorId` `viva-2026-11-outbreaks-DEMO-DOC-<district code>`, name "Synthetic Demo Doctor <district>", no password |
| Clinics | `regNo` `VIVA-DEMO-CLINIC-<district code>`, name "Synthetic Demo Clinic <district>" |

`cleanDemo` deletes only documents matching **all three**: the batch tag, `isSynthetic: true` and this
seed's identifier prefix. It also deletes outbreak alerts whose batch tag matches and whose source
consultations are **all** this seed's consultations. Before deleting, it aborts if any matched document
lacks either flag. Afterwards it re-counts every collection it touched.
- An alert that mixes this seed's cases with other cases is left in place and reported.
- Scan log entries (`outbreakscans`) are not seeded records and are left in place.

## 8. Modes and safety

- **Dry run is the default.** It never connects to a database. It prints:
  - totals by disease and district;
  - per-scenario case counts, the districts and dates touched;
  - projected storage;
  - the rule's outcome on the plan, using the real `evaluateOutbreakCriteria`.

  It also writes a manifest with counts per district, disease and ISO week.
- **Determinism:** the same seed and reference date give identical numbers. A digest is printed so two
  runs can be compared.
- **Writing:** writing needs `--confirm`, which only the owner uses. It runs a read-only collision check
  first and aborts if any identifier is held by a record outside this seed.
- **Write method:** writes are `bulkWrite` upserts with `$setOnInsert`, in batches of 1,000. There is no
  per-row network call.
- **Production:** no production access, no environment changes and no secrets in this work. The owner
  runs `--confirm` after reading the dry-run output.

## 9. Limits

- Synthetic data only. This is a demonstration of the unchanged rule, not a measure of its accuracy.
- The scenarios were written to show both outcomes. Their results say nothing about real outbreaks.
- District shares are outpatient weights, not dengue incidence.
- The background is gamma-Poisson noise with a weekday pattern. It is not a fitted model.

Last verified: 2026-11-18 at commit f5337833. Location and internal links only; the content is a dated record and was not re-checked against the code (current documents are listed in docs/INDEX.md).
