# MediSync Sub-Project 4: Knowledge Base Quality & Curation Report

**Document Version**: 1.0.0  
**Phase**: D2b (Knowledge Base Quality Filtering, Edge Weighting & Mapper v2)  
**Status**: VERIFIED & REPRODUCIBLE  
**Clinical Disclaimer**: Academic simulation knowledge base only. `clinicalValidation: not_established`.

---

## 1. Measured Symptom Probability Distribution

In the raw SymCAT outpatient condition dataset (`ml-engine/data_pipeline/raw/symcat_conditions.csv`), exactly **9,162 symptom-disease edges** exist across the 801 conditions. The probability represents the empirical outpatient presentation frequency $P(\text{symptom} \mid \text{condition})$ expressed as a percentage ($1.0\% \le p \le 100.0\%$).

### 1.1 Empirical Distribution Summary
- **Total Edges**: 9,162
- **Minimum Probability**: 1.0%
- **Maximum Probability**: 100.0%
- **Mean Probability**: 28.93%
- **Median**: ~23.0%

### 1.2 Histogram (Deciles)

| Probability Range | Edge Count | Percentage of Edges | Clinical Characteristic | Action |
|---|:---:|:---:|---|---|
| **0.0% – 9.9%** | 2,018 | 22.03% | Incidental / low-evidence survey noise (e.g. nailbiting 4%, cross-eyed 4%, itchy eyelid 4%) | **DROPPED BY FILTER** |
| **10.0% – 19.9%** | 1,751 | 19.11% | Minor secondary complaints (e.g. fatigue in non-fatigue disorders) | Filter boundary ($P \ge 15.0\%$) |
| **20.0% – 29.9%** | 1,693 | 18.48% | Common secondary presenting complaints | Retained |
| **30.0% – 39.9%** | 1,276 | 13.93% | Typical presenting symptoms | Retained |
| **40.0% – 49.9%** | 865 | 9.44% | Highly characteristic symptoms | Retained |
| **50.0% – 59.9%** | 495 | 5.40% | Cardinal presentation symptoms | Retained |
| **60.0% – 69.9%** | 362 | 3.95% | Major diagnostic indicators | Retained |
| **70.0% – 79.9%** | 270 | 2.95% | Pathognomonic / primary presentation | Retained |
| **80.0% – 89.9%** | 196 | 2.14% | Hallmark clinical presentation | Retained |
| **90.0% – 100.0%** | 236 | 2.58% | Definitive presenting symptom (e.g. fever in flu, rash in chickenpox) | Retained |

---

## 2. Quality Filter Design Choices

### 2.1 Edge Probability Threshold ($P \ge 15.0\%$)
- **Rationale**: 22.03% of all edges in the raw dataset fall below 10%, representing spurious, incidental outpatient survey co-occurrences (e.g., AFLP listing `nailbiting: 4%`, `wrist weakness: 4%`, `cross-eyed: 4%`).
- At $P \ge 15.0\%$, clinically spurious noise edges are filtered out while preserving cardinal and typical presenting complaints (e.g. for AFLP: `sharp abdominal pain: 51%`, `itching of skin: 51%`, `pain during pregnancy: 51%`).
- Symptom edges surviving the filter retain their explicit `probability` value ($15.0 \le p \le 100.0$).

### 2.2 Minimum Surviving Symptoms ($N_{\text{surviving}} \ge 3$)
- Diseases must possess at least **3 surviving symptoms** after applying the 15% probability threshold.
- Conditions with fewer than 3 high-confidence symptoms lack sufficient discriminatory power for vector retrieval and are excluded to quarantine with reason `insufficient_surviving_symptoms`.

### 2.3 Dummy Imputation Cluster Identification & Exclusion
Investigation of the raw SymCAT data revealed an imputation artifact: conditions with low survey sample counts were populated with an identical 12-symptom fallback set:
$$\text{Dummy Set} = \{\text{ankle pain, excessive anger, excessive urination at night, facial pain, fatigue, joint stiffness, knee lump, pregnancy pain, eye pain, breast soreness, shoulder cramps, wrist pain}\}$$

Diseases sharing $\text{Jaccard} \ge 0.70$ with this dummy set (including rare infections and tropical diseases like Blastomycosis, Chancroid, Leishmaniasis, Leptospirosis, Rabies, Typhoid, and Dengue in SymCAT) contain medical noise and are **strictly excluded to quarantine** with reason `dummy_imputation_cluster`.

### 2.4 Near-Identical Profile Exclusion
Any condition sharing pairwise $\text{Jaccard} \ge 0.85$ with another active condition is flagged as an undifferentiated duplicate profile and excluded to quarantine with reason `near_identical_profile`.

### 2.5 Quarantine Ledger (`ml-engine/data/kb_quarantine.v1.json`)
- **Total Quarantined**: 136 conditions.
- Zero rows are deleted silently. Every excluded disease is preserved in the quarantine ledger with its full raw symptoms, surviving symptoms count, and clinical rejection reason.

---

## 3. Mapper v2 Architecture

### 3.1 Design Principles
1. **Zero Codes From Memory**: All ICD-10 codes are derived exclusively by querying `server/reference-data/icd10_clean.json` (71,704 concepts).
2. **Versioned Synonym Catalog**: Common acronyms and clinical phrases are mapped via `ml-engine/data_pipeline/icd10_synonyms.v1.json`, with every synonym verified against the catalog and citing its authoritative source (e.g. `CMS ICD-10-CM Tabular Index 2024 / NLM UMLS`).
3. **Auto-Acceptance Gate**: ONLY exact normalized matches (`exact_normalized`), where the normalized disease name, canonical unspecified term, or sourced synonym matches the catalog description verbatim, are auto-accepted.
4. **Owner Review Audit**: All other conditions have top candidates generated via token-overlap scoring and are marked `needs_owner_review` in `ml-engine/data_pipeline/mapping_review.csv`. In the active KB, unaccepted conditions retain `icd10: null`.

---

## 4. Sri Lankan Priority Diseases Policy

The following 11 priority conditions are designated national surveillance priorities in Sri Lanka:
1. **Dengue**
2. **Leptospirosis**
3. **Typhoid**
4. **Chikungunya**
5. **Influenza**
6. **Cholera**
7. **Dysentery**
8. **Measles**
9. **Tuberculosis**
10. **Hepatitis** (A, B, C, D, E)
11. **Malaria**

### 4.1 Tier 1 Exclusivity
- Where present in Tier 1 (`ml-engine/data/dataset.csv`), these conditions are served **exclusively by Tier 1 curated profiles** (Dengue, Malaria, Typhoid, Tuberculosis, Hepatitis A/B/C/D/E).
- They are excluded from Tier 2 KB so that empirical outpatient survey noise cannot override or dilute curated epidemiology profiles.

### 4.2 Missing Conditions -> `pending_owner_data`
- For priority conditions not covered by Tier 1 or filtered KB (Leptospirosis, Chikungunya, Cholera, Dysentery, Measles), they are recorded in `docs/new/sub4/OWNER_ACTIONS_SUB4.md` as `pending_owner_data`.
- Recommended sources: Ministry of Health Sri Lanka, Epidemiology Unit case definitions, WHO Surveillance Standards. No symptoms or codes are invented.
