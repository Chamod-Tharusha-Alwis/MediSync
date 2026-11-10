# MediSync Medicine Catalog Coverage Audit

> **Honest Clinical Standard**: MediSync does not and cannot claim coverage of "all medicines in the world". The platform catalog contains a finite, structured subset of approved pharmaceuticals, branded formulations, and regional essentials.

---

## 1. Executive Summary & Verification Metrics

| Metric | Measured Value | Verification Source |
|---|:---:|---|
| **Total Catalog Drug Formulations** | **3000** | `server/reference-data/drugs_clean.json` |
| **Unique Brand & Trade Names** | **4615** | `server/reference-data/drugs_clean.json` |
| **Catalog Cleanly Resolved Rate** | **69%** (2070/3000) | `ingredientResolver.parseMedicationEntry()` |
| **Unique Active Ingredients in Interaction DB** | **1701** | `server/reference-data/interactions_clean.json` |
| **Verified Safety Limits on File** | **5** (Paracetamol, Amoxicillin, Ibuprofen, Citalopram*, Penicillin*) | `server/src/data/medicine_safety_limits.json` |
| **Top 300 Benchmark Generics Resolved** | **75%** (225/300) | Top 300 common generic formulations audit |
| **Benchmark Gaps Identified** | **75** | `docs/final/data/medicine_coverage_gaps.json` |

*Note: Citalopram and Penicillin resolve to active ingredients in the interaction engine; numeric dose ceilings remain unverified by external formulary review (`citationStatus: "unverified_owner_must_check"`).*

---

## 2. Benchmark Definition: Internal Top 300 Common Generics
Because full offline access to the proprietary WHO Model List of Essential Medicines (EML 23rd list) requires paid subscription or offline PDF parsing, MediSync benchmarks against an **Internal Top 300 Common Generics Benchmark** extracted from the 3,000 regional formulations in the platform database.
- **Resolved**: 225 formulations (75%)
- **Unresolved / Gaps**: 75 formulations (25.00%)

Action logged in `OWNER_ACTIONS.md` (OA-11): Clinical formulary committee to review identified gaps and supply verified BNF/WHO monographs for missing high-frequency generics.

---

## 3. High-Frequency Benchmark Gaps (Top 10)

| Rank | Generic Formulation | Catalog Occurrences | Unresolved Ingredient(s) | Partial Match |
|:---:|---|:---:|---|---|
| 1 | `Bilastine 20 mg+Montelukast 10 mg` | 47 | `bilastine` | montelukast |
| 2 | `Bilastine 20 mg` | 44 | `bilastine` | None |
| 3 | `Acebrophylline 100 mg+N-Acetylcysteine 600 mg` | 25 | `acebrophylline, n-acetylcysteine` | None |
| 4 | `Acebrophylline 100 mg` | 24 | `acebrophylline` | None |
| 5 | `Ambroxol 30 mg+Guaiphenesin 50 mg+Levosalbutamol 1 mg` | 24 | `guaiphenesin` | ambroxol, levosalbutamol |
| 6 | `Citicoline 500 mg` | 20 | `citicoline` | None |
| 7 | `Clindamycin 1 %+Niacinamide 4 %` | 18 | `niacinamide` | clindamycin |
| 8 | `Acebrophylline 200 mg` | 18 | `acebrophylline` | None |
| 9 | `Fluticasone 250 mcg+Formoterol 6 mcg` | 18 | `fluticasone` | formoterol |
| 10 | `Diacerein 50 mg+Glucosamine 750 mg+Methyl Sulfonyl Methane 250 mg` | 16 | `methyl sulfonyl methane` | diacerein, glucosamine |

---

## 4. Prefix & Fuzzy Typing Safeguards
- **Prefix Resolution**: Autocomplete input uses substring and prefix matching (`starts_with` priority), allowing stems like `Citalopr` to immediately recommend `Citalopram` without silent auto-substitution.
- **Clinician Override**: Free-text medication entry is permitted under the Doctor Override flow (Task A). When an unresolved generic is prescribed, MediSync explicitly surfaces:
  > *"Automated interaction checking is incomplete for \"<drug>\" (unresolved ingredient(s): <list>). Clinical assessment required."*
