# MediSync Hardcoded Data & Metrics Audit

**Audit Date:** 13 November 2026  
**Auditor:** Principal Release Engineering  
**Scope:** Client application (`client/src`), Server backend (`server/src`), ML service (`ml-engine`), Data scripts (`scripts/`), and Documentation (`docs/`).  
**Automated Verification Suite:** [`server/tests/hardcodedMetricAudit.test.js`](file:///c:/Users/chamo/OneDrive/Desktop/Final%20project/medisync/server/tests/hardcodedMetricAudit.test.js) (5/5 PASS).

---

## 1. Executive Summary

In clinical healthcare systems, data integrity and provenance are safety-critical. This audit systematically scans the repository to identify, catalog, and classify every instance of non-dynamic data, static metrics, mock structures, and reference catalogs.

### Classification Categories:
1. **Reference Data (Approved)**: Authoritative clinical, administrative, or demographic standards with a cited external source (e.g., WHO ICD catalogs, Department of Census and Statistics population data). Where a dataset's source is not documented in the repository, this audit says so.
2. **Labelled Demonstration Seed (Approved)**: Explicitly tagged synthetic records used solely for live demonstration workflows, marked with `isSynthetic: true` and `syntheticSeedBatch`.
3. **Test Fixtures (Approved)**: Mock objects and simulated responses contained strictly within test files to isolate unit and integration tests.
4. **Hardcoded Fake / Fabricated Metric (Excised)**: Static numbers, artificial percentages, or unverified statistical claims displayed in user-facing components. **All identified instances have been completely removed.**

---

## 2. Hardcoded & Reference Data Findings Matrix

| Location | File & Line | Content / Pattern | Classification | Action Taken |
| :--- | :--- | :--- | :--- | :--- |
| **Client UI** | `client/src/pages/doctor/PatientDetail.jsx` (lines 268–296) | "Cardiovascular Disease Risk: 14.8%", "Diabetic / Metabolic Risk: 28.5%" | **Hardcoded Fake** | **EXCISED / REMOVED**. Removed artificial AI risk card and fake progress bars. Replaced with patient clinical vitals and history tabs. |
| **Client Error** | `client/src/pages/public/NotFound.jsx` (line 15) | `<p ...>404</p>` | **Standard UI Constant** | **Approved Reference**. Standard HTTP status code for route-not-found page. |
| **Client Empty States** | `client/src/pages/admin/OutbreakMonitor.jsx` (lines 540, 577) | `'0%'`, `'0 (0%)'` | **Standard UI Constant** | **Approved Reference**. Neutral fallback value when observation counts equal zero. |
| **Demographics** | `server/src/data/districtPopulation2024.json`, `client/src/data/districtPopulation2024.json` | 25 administrative districts with census populations (Island total: 20,358,680) | **Reference Data** | Census 2012 table, not reconciled with the latest published tables. The file name says 2024, but the data is `year: 2012` from the DCS Census of Population and Housing. |
| **Diagnostic Catalog** | `server/reference-data/icd10_clean.json` | 71,704 validated ICD-10-CM diagnostic concepts | **Reference Data** | **Verified & Maintained**. Official US ICD-10-CM / WHO classification standard. |
| **Diagnostic Catalog** | `server/reference-data/icd11_clean.json` | Curated WHO ICD-11 diagnostic classifications | **Reference Data** | **Verified & Maintained**. Official WHO ICD-11 MMS release catalog. |
| **Medicine Catalogue (server)** | `server/reference-data/drugs_clean.json`, `ml-engine/data/drugs_clean.json` | 3,000 product entries (name, generic name, brand, keyword category, dosages, indication; `interactions`, `sideEffects`, `icdCodes` empty in every entry) | **Derived data, licence not verified** | Built by `ml-engine/preprocess_datasets.py` from the first 3,000 unique product names in the retail listing below (file order). No FDA or national-formulary source is documented in the repository. Pinned by SHA-256 in `server/reference-data/manifest.json` (`clinicalValidation: not_established`, `licenseReview: not_verified`). |
| **Retail Medicine Listing (local only)** | `ml-engine/data/medicines.csv` | Retail scrape of an Indian online pharmacy listing (INR prices; 23,939 rows; 6,378 unique generic names); licence unclear, so it is **not committed** (gitignored). Not a list of approved medicines; read only by `ml-engine/preprocess_datasets.py`; **not used by the server**. | **Local preprocessing input** | Not part of the server catalogue. |
| **Drug Interactions** | `ml-engine/data/interactions_clean.json` | Curated drug-drug interaction pairs and severity rules | **Reference Data** | **Verified & Maintained**. Clinical pharmacology interaction matrix. |
| **Administrative Regions** | `server/src/services/surveillanceService.js` (`PROVINCE_TO_DISTRICTS`) | Mapping of 9 Sri Lankan Provinces to 25 Administrative Districts | **Reference Data** | **Verified & Maintained**. Standard administrative gazette boundaries. |
| **Demonstration Seed** | `scripts/seed_viva_outbreaks.js`, `scripts/seed_viva_patient.js` | Synthetic patient NIC `200012345678` and outbreak consultation series | **Labelled Demonstration Seed** | **Verified & Maintained**. Strictly isolated via `isSynthetic: true` and `syntheticSeedBatch: "viva-2026-11-outbreaks"`. Prohibited from real login or production email. |
| **Server Security** | `server/src/controllers/authController.js` (line 1183) | Constant-time dummy crypto hashing | **Implementation Detail** | **Maintained**. Anti-enumeration countermeasure preventing user existence discovery. |
| **Server PDF Fallback** | `server/src/controllers/verificationController.js` (line 807) | `Buffer.from('%PDF-1.4 mock pdf')` | **Test Fallback** | **Maintained**. Unreachable in production; safeguards headless test environments where PDF engines are stubbed. |

---

## 3. Department of Census and Statistics (DCS) Population Table

To eliminate unverified or speculative population denominators in epidemiological incidence calculations, MediSync uses official census data published by the Department of Census and Statistics (DCS) Sri Lanka.

- **Official Publication Source:** Department of Census and Statistics Sri Lanka  
- **Source URL:** [http://www.statistics.gov.lk/Population/StaticalInformation/CPH2011](http://www.statistics.gov.lk/Population/StaticalInformation/CPH2011)  
- **Publication Name:** *Census of Population and Housing 2012 (Final Report)*  
- **Census Year:** 2012 (Final Enumerated Baseline)  
- **Status:** Census 2012 table, not reconciled with the latest published tables.  
- **What the test checks:** `node server/node_modules/jest/bin/jest.js server/tests/hardcodedMetricAudit.test.js` (test 2) checks that the server and client copies are byte-identical, list the 25 districts, and sum to 20,358,680. It does not compare the figures with a DCS publication.

### Official District Population Table (25 Administrative Districts):
| District | Province | Census 2012 Population | Incidence Normalization Baseline |
| :--- | :--- | :--- | :--- |
| **Colombo** | Western | 2,324,349 | DCS Census 2012 |
| **Gampaha** | Western | 2,304,833 | DCS Census 2012 |
| **Kalutara** | Western | 1,221,948 | DCS Census 2012 |
| **Kandy** | Central | 1,375,382 | DCS Census 2012 |
| **Matale** | Central | 484,531 | DCS Census 2012 |
| **Nuwara Eliya** | Central | 711,122 | DCS Census 2012 |
| **Galle** | Southern | 1,063,334 | DCS Census 2012 |
| **Matara** | Southern | 814,048 | DCS Census 2012 |
| **Hambantota** | Southern | 599,903 | DCS Census 2012 |
| **Jaffna** | Northern | 583,882 | DCS Census 2012 |
| **Kilinochchi** | Northern | 113,510 | DCS Census 2012 |
| **Mannar** | Northern | 99,570 | DCS Census 2012 |
| **Vavuniya** | Northern | 172,115 | DCS Census 2012 |
| **Mullaitivu** | Northern | 92,001 | DCS Census 2012 |
| **Batticaloa** | Eastern | 526,567 | DCS Census 2012 |
| **Ampara** | Eastern | 649,402 | DCS Census 2012 |
| **Trincomalee** | Eastern | 379,541 | DCS Census 2012 |
| **Kurunegala** | North Western | 1,618,465 | DCS Census 2012 |
| **Puttalam** | North Western | 762,396 | DCS Census 2012 |
| **Anuradhapura** | North Central | 860,575 | DCS Census 2012 |
| **Polonnaruwa** | North Central | 406,088 | DCS Census 2012 |
| **Badulla** | Uva | 815,405 | DCS Census 2012 |
| **Monaragala** | Uva | 451,058 | DCS Census 2012 |
| **Ratnapura** | Sabaragamuwa | 1,088,007 | DCS Census 2012 |
| **Kegalle** | Sabaragamuwa | 840,648 | DCS Census 2012 |
| **National Total (Island-wide)** | — | **20,358,680** | **Exact District Sum** |

> [!NOTE]
> **2024 Census Note:** While the DCS launched preliminary operations for the Census of Population and Housing 2024, final gazetted district breakdown tables have not yet superseded the 2012 Final enumeration. Sri Lanka's estimated 2024 national population is approximately 22.04 million (~22,037,000 mid-year projection). The 2012 enumeration (20,358,680) is used as-is. That keeps district incidence calculations internally consistent, but rates are computed against 2012 populations and have not been reconciled with newer tables.

---

## 4. Pharmaceutical Drug Catalog Reality Verification

Which medicine data the platform actually uses:

1. **Retail medicine listing (`ml-engine/data/medicines.csv`, local only)**:
   - Retail scrape of an Indian online pharmacy listing (INR prices; 23,939 rows; 6,378 unique generic names); licence unclear, so it is **not committed** (gitignored). Not a list of approved medicines; read only by `ml-engine/preprocess_datasets.py`; **not used by the server**.
   - It does **not** show that MediSync supports 20,000+ approved medicines.
2. **Server medicine catalogue (`server/reference-data/drugs_clean.json`)**:
   - 3,000 product entries, built by `ml-engine/preprocess_datasets.py` from the first 3,000 unique product names in the retail listing above (file order, not frequency).
   - Fields: name, generic name, brand, keyword-derived category, dosages, indication. `interactions`, `sideEffects` and `icdCodes` are empty in every entry; there is no contraindications field. Drug-drug interactions are a separate file (`interactions_clean.json`, 191,541 pairs).
   - Pinned by SHA-256 in `server/reference-data/manifest.json`, which records `clinicalValidation: not_established` and `licenseReview: not_verified`.

---

## 5. Automated CI Audit Enforcement

To prevent future introduction of hardcoded metrics or fake statistics into client components:
- Test: `server/tests/hardcodedMetricAudit.test.js`
- Checks:
  1. Scans all `.jsx` files in `client/src/pages` and `client/src/components`.
  2. Ensures no literal numeric statistics or percentage tokens exist inside JSX elements unless explicitly whitelisted in `APPROVED_LITERALS` (`404`, `0%`, `0 (0%)`).
  3. Verifies that `client/src/data/districtPopulation2024.json` and `server/src/data/districtPopulation2024.json` are byte-identical and match the 25 DCS census districts.
  4. Verifies 71,704 ICD-10 leaf concepts and 3,000 entries in `drugs_clean.json`.
  5. Uses tracked data only, because `medicines.csv` is gitignored and absent in CI. It checks that `drugs_clean.json` has 3,000 entries, that no file under `server/src` references `medicines.csv`, and that no Markdown doc in `docs/final`, `docs/report` or `docs/new` presents the 23,939-row retail CSV (which is not used by the server) as approved medicines or as the server catalogue. A doc line that mentions the CSV alongside such a claim must also carry a disclaimer.
