# MediSync — C5 Disease and Drug Coverage (U26)

Stage A planning document. Created: 2026-11-05 (Antigravity, no-network mode).

**Plain statement:** these are counts of records in reference files. They are **not** clinical validation. `ml-engine/reference-manifest.json` itself declares `"clinicalValidation": "not_established"` and `"licenseReview": "not_verified"`.

All counts below were computed offline in this session from the files in `ml-engine/data/` (stale copy `192e1d4`). Live service counts were not observed (no network). The deployed ML service may load a different build; compare with `GET /health` on a networked machine.

---

## 1. Catalog counts

| Catalog | File | Records | Fields |
|---------|------|---------|--------|
| Drugs (products) | `drugs_clean.json` | **3,000** | name, genericName, brand, category, commonDosages, interactions, sideEffects, icdCodes |
| Drug–drug interactions | `interactions_clean.json` | **191,541** pairs | drug1, drug2, description, severity |
| Distinct ingredient names in interaction table | (derived) | **1,701** | — |
| ICD-10 codes | `icd10_clean.json` | **71,704** | code, description |
| Symptom-model disease labels | `dataset.csv` | **41** diseases, 4,920 rows | disease + symptoms |
| Disease descriptions | `symptom_Description.csv` | 41 | — |
| Symptom severity weights | `Symptom-severity.csv` | 133 symptoms | — |
| Raw medicines source | `medicines.csv` | 240 MB (not loaded in this pass) | — |

Interaction severity split: **moderate 189,339**, **high 2,202**. No "low/minor" class exists, so every flagged pair is at least moderate — one reason the doctor UI shows many warnings.

Drug categories (8): other 1,535 · respiratory 654 · antibiotic 482 · antihypertensive 167 · analgesic 126 · antidepressant 33 · anticoagulant 2 · antiviral 1. Over half the catalog is "other", so category cannot be used alone to decide prescribability.

---

## 2. Resolved vs unresolved ingredients

Heuristic used here (offline, for planning only): strip the `"Generic Name "` prefix, split combination products on `+`/`,`, drop strengths and brackets, and look up each ingredient (lower-case) in the 1,701 interaction-table names.

| Result | Products | Share |
|--------|----------|-------|
| All ingredients resolvable | 1,923 | 64% |
| Some resolvable | 571 | 19% |
| None resolvable | 506 | 17% |

Implications:
- For ~36% of products the safety check is incomplete. The UI must say so once, briefly (U2 "collapse unresolved note"), not hide it.
- `genericName` carries a literal `"Generic Name  "` prefix in every record — a data-cleaning defect. Normalise at load time in the catalog layer (not in the protected data file unless approved).
- `icdCodes` is empty for **all 3,000** drugs, so diagnosis→drug matching (and the seed's "medicines matched to diagnoses") cannot come from this field. The seed plan must use an explicit small mapping table (diagnosis → generic list) instead.

---

## 3. Prescribability rule (proposal for U2)

Problem seen live: a soap was offered as "1 tab TDS".

Offline evidence: **13** product names contain "soap"; **287** contain one of soap/shampoo/lotion/cream/wash/gel/oil/powder (that wider list includes legitimate topical medicines, so it cannot be a blanket ban).

Proposed rule, applied in the catalog layer (server), returning `prescribable: true|false` and `doseForm`:
1. **Exclude** when the name or form matches a non-medicine list: soap, shampoo, body wash, face wash, cosmetic, moisturiser, sunscreen, toothpaste, mouthwash (non-medicated), baby powder, hair oil.
2. **Allow but set dose form** for topical medicines (cream/ointment/gel/lotion with a resolvable active ingredient) — the dose picker must then offer "apply" frequencies, never "1 tab".
3. **Unresolved + no form** → allowed with a visible "ingredient not checked" chip.
4. Keep a reviewed override list (`catalogOverrides.json`) for edge cases; every override has a one-line reason.

Acceptance: soap products absent from Rx suggestions; topical products never get tablet dosing; the 13 soap names are covered by a regression test.

---

## 4. Seed-plan ICD check

Codes proposed in V3 §7 checked against `icd10_clean.json` (this file uses ICD-10-CM style codes without dots):

| Proposed | Present? | Use instead |
|----------|----------|-------------|
| A90, A91, A27.9, J11.1, B01.9, B26.9, A09, B15.9, A92.0, B08.4, J06.9, I10, E11.9, M54.5, N39.0 | Yes | as proposed |
| A01.0 (typhoid) | No | **A01.00** (typhoid fever, unspecified) |
| U07.1 (COVID-19) | No — no U07 codes at all | Omit COVID-19 from the seed, or add U07.1 to the catalog with operator approval |
| J45.9 (asthma) | No | **J45.909** (unspecified asthma, uncomplicated) |
| K29.7 (gastritis) | No | **K29.70** (gastritis, unspecified, without bleeding) |
| G43.9 (migraine) | No | **G43.909** (migraine, unspecified, not intractable) |

Copy this table into `SEED_DATA_PLAN.md` decisions when approved.

---

## 5. Live checks still needed (network)

| Check | Status |
|-------|--------|
| ML `/health` reports the same counts | NOT VERIFIED |
| Doctor UI drug search returns catalog items for EN/SI/TA input | NOT VERIFIED |
| Interaction warning shown for a known high-severity pair | NOT VERIFIED |
| Soap excluded after U2 fix | NOT VERIFIED (fix not implemented) |

Earlier reports (MASTER_STATE, 4 Nov) quoted the same local numbers (3,000 / 191,541 / 71,704 / 41) and one live `/health` showing 71,704 ICD concepts; that live observation is historical and was not repeated here.
