# MediSync — Stage B1 Item U2 Read-Only Investigation

**Date:** 6 November 2026  
**Scope:** Read-only architectural and catalog investigation for Item U2 (Medication safety alert self-comparison, duplicate warning rendering, and soap/non-medicine catalog filtering).  
**Code Changes:** None (investigation only).

---

## 1. Where the Rx Drug Catalog & Safety Checks Are Served and Filtered

### 1.1 Reference Data & MongoDB Seeding
1. **Reference Catalog Source:**
   - `ml-engine/preprocess_datasets.py:13-86` builds `ml-engine/data/drugs_clean.json` (3,000 records) from `ml-engine/data/medicines.csv`, and mirrors it byte-for-byte to `server/reference-data/drugs_clean.json`.
   - `server/src/utils/referenceCatalogs.js:13-22` verifies SHA-256 and exact row count (`3,000`) against `server/reference-data/manifest.json` (`drugs_clean.json` SHA-256: `64bc6ef4d08c54399722d97149a3425606e905e391b9d2576b4810ed7b5a1e9b`).
2. **MongoDB Catalog Seeding:**
   - `server/scripts/importReferenceData.js:207-238` and `server/src/utils/seedDrugs.js:55-128` load `drugs_clean.json` into the `Drug` Mongoose model (`server/src/models/Drug.js:1-43`, fields: `name`, `genericName`, `brand`, `category`, `commonDosages`, `interactions`, `sideEffects`, `icdCodes`).

### 1.2 Server Catalog & Safety Endpoints
1. **`GET /api/drugs/search` (`server/src/routes/drugRoutes.js:6` → `server/src/controllers/drugController.js:79-95`, `searchDrugs`):**
   - Queries `Drug.find({ $or: [{ name: regex }, { genericName: regex }, { brand: regex }] }).limit(10).select('_id name genericName brand category commonDosages')`.
   - Contains **no prescribability filter**; any matching item in the 3,000-row `Drug` collection is returned to the doctor Rx search picker.
2. **`POST /api/drugs/recommend` (`server/src/routes/drugRoutes.js:13` → `server/src/controllers/drugController.js:167-265`, `recommendDrugs`):**
   - Queries `Drug.find(...).limit(5)` at lines 238–252 without filtering out non-medicine / personal-care items.
3. **`POST /api/drugs/interactions` (`server/src/routes/drugRoutes.js:7` → `server/src/controllers/drugController.js:15-61`, `checkInteractions`):**
   - Calls `analyzeMedicationSafety` in `server/src/utils/ingredientResolver.js:376-529` as the primary interaction and duplicate-ingredient engine, and optionally merges warnings from the Python ML `/check-interactions` endpoint (`ml-engine/app.py:1098-1208`).

### 1.3 Client Search & Consultation Rx Entry
1. **`client/src/components/DrugSearchInput.jsx`:**
   - `lines 9-24`: Defines `FALLBACK_DRUGS` (14 essential medications for offline/cold-start fallback).
   - `lines 70-104`: `rankMedicationMatches(drugs, query)` scores and sorts candidate drugs.
   - `lines 185-201`: Calls `GET /drugs/search?q=...` and merges results with `FALLBACK_DRUGS`.
2. **`client/src/pages/doctor/NewConsultation.jsx`:**
   - `lines 443-446` (`addPrescription`): Assigns hardcoded tablet defaults to every selected catalog item:
     ```javascript
     setPrescriptions(prev => [...prev, {
       name: drug.name,
       dosage: '1 tab',
       frequency: 'TDS',
       durationDays: 5,
       instructions: 'After meals'
     }]);
     ```
     Because soaps exist in `Drug` and no `doseForm` or `prescribable` check exists, selecting a soap populates `"1 tab"`, `"TDS"`, `"After meals"`.
   - `lines 297-315`: Combines `prescriptions.map(p => p.name)` and `activePatient.currentMedications.split(',')` into `allDrugs` and sends `{ drugs: allDrugs }` to `POST /drugs/interactions`.
   - `lines 1084-1148`: Renders safety alerts in three separate visual containers (plus the override confirmation modal at `line 1636`):
     1. Red warning box (`lines 1098-1114`): renders `interactionResult.warnings`.
     2. Amber duplicate box (`lines 1116-1129`): renders `interactionResult.duplicateIngredients`.
     3. Slate/amber unresolved box (`lines 1131-1147`): renders `interactionResult.unresolvedDrugs`.
   - **Root cause of duplicate rendering & self-comparison:**
     - In `server/src/utils/ingredientResolver.js:454-455`, every duplicate-ingredient entry (`dupEntry`) is pushed into **both** `duplicateIngredients` (`line 454`) **and** `warnings` (`line 455`). Consequently, `NewConsultation.jsx` renders the exact same warning in both the red `warnings` box (`line 1098`) and the amber `duplicateIngredients` box (`line 1116`), and again in the override modal (`line 1636`).
     - In `server/src/utils/ingredientResolver.js:401, 425-429`, `validMeds` compares all pairs `(i, j)` with `i < j` without checking whether `medA.originalName` and `medB.originalName` are the exact same product (which happens whenever a newly prescribed drug is already in `activePatient.currentMedications`), producing: `Duplicate active ingredient (X) present in both "DrugA" and "DrugA"`.

---

## 2. Existence of `prescribable` or `doseForm` Layer

- **Current State:** **None exists.** Searching `server/`, `client/`, and `ml-engine/` for `prescribable`, `isPrescribable`, or `doseForm` returns **0 matches**.
- **Formulation Parsing:** `server/src/utils/ingredientResolver.js:91-124` (`FORMULATION_PATTERNS`) and `ml-engine/app.py:868-901` (`FORMULATION_PATTERNS_ML`) strip dosage forms (`tablet`, `capsule`, `injection`, `cream`, `gel`, `lotion`, `drops`, `inhaler`, `patch`, `powder`, `suppository`, `syrup`, `ointment`) during ingredient extraction, but do not expose a `doseForm` or `isPrescribable` property and do not include `soap`, `shampoo`, `face wash`, `facewash`, or `bar`.

---

## 3. Target Files and Protected File Ledger Check

Checked against `docs/release/PROTECTED_HASHES.json` (15 protected files) and `server/reference-data/manifest.json`:

| File | Role in U2 | Status in `PROTECTED_HASHES.json` | Other Constraints |
|---|---|:---:|---|
| `ml-engine/app.py` | ML `/check-interactions` | **PROTECTED** (`#3`) | **Must NOT be edited.** |
| `server/src/controllers/doctorController.js` | Consultation save controller | **PROTECTED** (`#2`) | **Must NOT be edited.** |
| `server/src/models/Consultation.js` | Consultation schema | **PROTECTED** (`#13`) | **Must NOT be edited.** |
| `ml-engine/data/drugs_clean.json` & `server/reference-data/drugs_clean.json` | Raw 3,000-drug JSON catalog | Not in `PROTECTED_HASHES.json` | **Pinned by SHA-256 and `length === 3000`** in `server/reference-data/manifest.json`, `server/tests/drugReferenceDataOffline.test.js:16-56`, and `server/tests/websiteReferencePackaging.test.js:13-16`. **Do NOT edit JSON files.** |
| `server/src/controllers/drugController.js` | `searchDrugs` & `recommendDrugs` | **UNPROTECTED** | Safe to edit. |
| `server/src/utils/ingredientResolver.js` | `analyzeMedicationSafety` | **UNPROTECTED** | Safe to edit (must preserve `server/tests/websiteClinicalContracts.test.js:68-157`). |
| `client/src/components/DrugSearchInput.jsx` | Client search & ranking | **UNPROTECTED** | Safe to edit. |
| `client/src/pages/doctor/NewConsultation.jsx` | Rx step UI & warning boxes | **UNPROTECTED** | Safe to edit. |

---

## 4. How Soap and Non-Medicine Products Are Matched & Catalog Counts

### 4.1 Category Breakdown of `drugs_clean.json` (3,000 Records)
- `other`: **2,860** (95.3%)
- `antibiotic`: **97**
- `antifungal`: **24**
- `antidiabetic`: **9**
- `analgesic`: **8**
- `cardiovascular`: **2**

Because 95.3% of records have `category: "other"`, the `category` field alone cannot separate clinical medications from soaps or cleansers.

### 4.2 Exact 13 `"Soap"` Records in `drugs_clean.json` (`/\bsoap\b/i`)
1. `Acnelak Pimple Care Soap` (`brand: "Acnelak Pimple Care Soap 75gm"`, `genericName: "Generic Name  Aloe Vera 0.2 %+Lipase 450 FIP+Tea Tree Oil 0.002+Zinc 0.001"`, `commonDosages: ["75g"]`)
2. `Acnerex Soap` (`brand: "Acnerex Soap 75gm"`, `genericName: "Generic Name  Allantoin 3 %+Aloe Vera 0.01+Tetrahydropiperine 0.05 %"`, `commonDosages: ["75g"]`)
3. `ACSTOP Soap` (`brand: "ACSTOP Soap 75gm"`, `genericName: "Generic Name  Clindamycin 1 %+Niacinamide 0.5 %"`, `commonDosages: ["75g"]`)
4. `Azac Soap` (`brand: "Azac Soap 75gm"`, `genericName: "Generic Name  Azelaic Acid 2.5 %+Wheat Germ Oil 0.5 %"`, `commonDosages: ["75g"]`)
5. `ACNE BRIGHT Soap` (`brand: "ACNE BRIGHT Soap 75gm"`, `genericName: "Generic Name  Allantoin+Tea Tree Oil+Tocopherol+Triclosan+Zinc Oxide"`, `commonDosages: ["75g"]`)
6. `BELLISSA ACNE Soap` (`brand: "BELLISSA ACNE Soap 75gm"`, `genericName: "Generic Name  Aloe barbadensis Leaf Extract+Glycerin+Olive Oil+Salicylic Acid+Tea Tree Oil+Triclosan"`, `commonDosages: ["75g"]`)
7. `KLM Klin Soap` (`brand: "KLM Klin Soap 75gm"`, `genericName: "Generic Name  Triclosan 0.5 %"`, `commonDosages: ["75g"]`)
8. `MISTI ANTI ACNE Soap` (`brand: "MISTI ANTI ACNE Soap 75gm"`, `genericName: "Generic Name  Almond Oil+Aloe Vera Extract+Glycerin+Tea Tree Oil 0.1 %+Wheat Germ Oil"`, `commonDosages: ["75g"]`)
9. `NEVLON ACNE Soap` (`brand: "NEVLON ACNE Soap 75gm"`, `genericName: "Generic Name  Aloe Vera Extract+Glycerin+Olive Oil+Salicylic Acid+Tea Tree Oil+Vitamin E+Zinc"`, `commonDosages: ["75g"]`)
10. `Papulex Soap Free Cleansing Gel` (`brand: "Papulex Soap Free Cleansing Gel 100ml"`, `genericName: "Generic Name  Glycerol+Nicotinamide+Sorbitol"`, `commonDosages: ["100ml"]`)
11. `PERNEX Soap` (`brand: "PERNEX Soap 75gm"`, `genericName: "Generic Name  Benzoyl Peroxide 0.1 mg"`, `commonDosages: ["75g"]`)
12. `Skinshine Soap` (`brand: "Skinshine Soap 75gm"`, `genericName: "Generic Name  Skin Care"`, `commonDosages: ["75g"]`)
13. `Aactaril Soap` (`brand: "Aactaril Soap 75gm"`, `genericName: "Generic Name  Ayurvedic Medicine"`, `commonDosages: ["75g"]`)

### 4.3 Additional Non-Medicine / Wash / Bar / Pack Records (33 Items; 46 Total with Soaps)
- **Shampoo (1):** `LICE CLEAR ANTI LICE Shampoo`
- **Face Wash / Gel Wash / Creamy Wash (`\bwash\b`, 17):** `ACNEJOY Face Wash`, `ACNELEX MEDI ACNE (CLEANSER + MASK) Face Wash`, `ACNEREX Face Wash`, `ACTAME F FOAMING Face Wash`, `AZALEA ACNE FACE WASH`, `ACMED GENTLE PIMPLE CARE FOR OILY & ACNE PRONE SKIN Face Wash`, `BENZONIX Gel Wash`, `BENZONIX XL GEL Wash`, `DS ACNE Face Wash`, `LACNE FOAMING Face Wash`, `MANDISA FOAMING Face Wash`, `PAKNET CREAMY Wash`, `Saliac Face Wash Foam`, `Saliface Face Wash Foam`, `Saslic DS Face Wash Foam`, `Saslic Face Wash Foam`, `ACMED PLUS Face Wash`
- **Facewash (`\bfacewash\b`, 3):** `Clindac A Foaming Facewash`, `NO Scars Facewash`, `SLC Facewash`
- **Bathing / Syndet / Acne Bars (`\bbar\b`, 6):** `Acnoff Anti Acne Bar`, `Aknaybar Bathing Bar`, `Lacne Syndet Bar`, `Perobar Bar`, `Saliac Bar`, `SLC ACNE Bar`
- **Face Pack / Pad Wipes / Scar Serum / Generic `"Skin Care"` (6):** `ACNIN ACNE PRONE SKIN Face Pack`, `Acnin Pimple Care Face Pack`, `ACNEPAD Soft Textured Pad Wipes 50's`, `HEXILAK ACNE + SCAR Serum`, `Glyaha Lotion` (`genericName: "Generic Name  Skin Care"`), `TIVENCA Gel` (`genericName: "Generic Name  Skin Care"`).
- **Important Note on Topical Lotions/Creams/Gels:** Out of 18 `"Lotion"` records in `drugs_clean.json`, 16 are legitimate prescription topical medications (e.g., `Tacrolimus 0.1%`, `Clindamycin 3%`, `Benzoyl Peroxide 2.5%`, `Coal Tar + Salicylic Acid`, `Calamine`). Therefore, `\blotion\b`, `\bcream\b`, and `\bgel\b` must **not** be blanket-excluded; instead, topical dosage forms should default to topical instructions (`"Apply thin layer"`, `"BD"`, `"Topical application"`) rather than `"1 tab"`.

---

## 5. Smallest Proposed Rule (Unprotected Files Only)

### 5.1 Non-Prescribable Filter & Dose-Form Helper
1. Add a shared helper in `server/src/utils/ingredientResolver.js` (and mirror in `client/src/components/DrugSearchInput.jsx`):
   ```javascript
   const NON_PRESCRIBABLE_NAME_RE =
     /\b(soap|shampoo|face\s*wash|facewash|gel\s*wash|creamy\s*wash|body\s*wash|cleansing\s*gel|cleanser|bathing\s*bar|syndet\s*bar|acne\s*bar|face\s*pack|pad\s*wipes|scar\s*serum)\b/i;
   const NON_PRESCRIBABLE_GENERIC_RE = /^generic\s+name\s+skin\s+care$/i;

   function isPrescribableDrug(drug) {
     if (!drug) return false;
     const name = String(drug.name || '');
     const brand = String(drug.brand || '');
     const generic = String(drug.genericName || '').trim();
     if (NON_PRESCRIBABLE_NAME_RE.test(name) || NON_PRESCRIBABLE_NAME_RE.test(brand)) return false;
     if (NON_PRESCRIBABLE_GENERIC_RE.test(generic)) return false;
     return true;
   }
   ```
2. **Server (`server/src/controllers/drugController.js`):**
   - In `searchDrugs` (`lines 82-89`): exclude `NON_PRESCRIBABLE_NAME_RE` on `name` and `brand` and `NON_PRESCRIBABLE_GENERIC_RE` on `genericName` in the Mongo query, and filter with `isPrescribableDrug` before `.slice(0, 10)`.
   - In `recommendDrugs` (`lines 238-252`): filter candidate drugs through `isPrescribableDrug`.
3. **Client (`client/src/components/DrugSearchInput.jsx` & `client/src/pages/doctor/NewConsultation.jsx`):**
   - In `rankMedicationMatches` (`DrugSearchInput.jsx:71`): filter `.filter(isPrescribableDrug)` so cached/fallback results also exclude soaps and washes.
   - In `addPrescription` (`NewConsultation.jsx:443-446`): infer default dosage from formulation (`/\b(cream|ointment|gel|lotion)\b/i.test(drug.name)` → `dosage: 'Apply thin layer'`, `frequency: 'BD'`, `instructions: 'External application'` instead of `'1 tab'`, `'TDS'`).

### 5.2 Self-Comparison Prevention & Consolidated Warning Display
1. **Prevent Self-Comparison (`server/src/utils/ingredientResolver.js:425-430`):**
   - In the pairwise duplicate loop (`for (let i = 0; i < validMeds.length; i++) for (let j = i + 1; j < validMeds.length; j++)`), skip pairs where both entries refer to the same medication name:
     ```javascript
     if (medA.originalName.trim().toLowerCase() === medB.originalName.trim().toLowerCase()) continue;
     if (medA.resolvedBrand && medB.resolvedBrand && medA.resolvedBrand.toLowerCase() === medB.resolvedBrand.toLowerCase()) continue;
     ```
   - This eliminates `"Duplicate active ingredient (X) present in both Y and Y"` when a prescribed medication is also listed in the patient's existing medications, while preserving distinct-brand duplicate detection (`['Panadol', 'Calpol']`) required by `server/tests/websiteClinicalContracts.test.js:126-132`.
2. **Eliminate Triple/Double Rendering (`client/src/pages/doctor/NewConsultation.jsx:1098-1147`):**
   - In the red `warnings` box (`line 1099`), render only drug–drug interactions (`interactionResult.warnings.filter(w => w.type !== 'duplicate_ingredient')`), leaving duplicate active-ingredient alerts exclusively in the amber `duplicateIngredients` box (`line 1116`), and collapse `unresolvedDrugs` (`line 1131`) behind a `<details>` summary toggle.

---

## 6. Proposed Offline Tests

1. **Server (`server/tests/u2DrugCatalogAndSafety.test.js`):**
   - Assert `isPrescribableDrug` rejects all 13 `"Soap"` items and all 33 wash/shampoo/bar/pack/skin-care items (46/3,000 excluded; 2,954/3,000 retained).
   - Assert `searchDrugs` and `recommendDrugs` never return any of the 46 non-prescribable items.
   - Assert `analyzeMedicationSafety(['Panadol', 'Panadol'])` produces `0` self-comparison duplicate warnings, while `analyzeMedicationSafety(['Panadol', 'Calpol'])` still flags the duplicate ingredient (`Paracetamol`).
   - Run existing `server/tests/websiteClinicalContracts.test.js` and `server/tests/drugReferenceDataOffline.test.js` to confirm 0 regressions.
2. **Client (`client/src/__master_offline__/u2-rx-safety-and-filter.test.jsx`):**
   - Assert `rankMedicationMatches` excludes soaps and face washes.
   - Assert `NewConsultation.jsx` renders duplicate-ingredient warnings once (in the amber box, not duplicated in the red interaction box) and collapses unresolved ingredient notes by default.

---

## 7. Risk and Rollback Analysis

- **Protected File Risk:** **Zero.** Neither `ml-engine/app.py`, `server/src/controllers/doctorController.js`, nor `server/reference-data/drugs_clean.json` is modified.
- **Contract Regression Risk:** Low. Keeping `dupEntry` in `server/src/utils/ingredientResolver.js` for distinct products (`Panadol` vs `Calpol`) while skipping identical drug names (`medA.originalName === medB.originalName`) and deduplicating display in `NewConsultation.jsx` preserves all existing backend contract tests in `websiteClinicalContracts.test.js`.
- **Rollback:** Revert edits in `server/src/controllers/drugController.js`, `server/src/utils/ingredientResolver.js`, `client/src/components/DrugSearchInput.jsx`, and `client/src/pages/doctor/NewConsultation.jsx`.
