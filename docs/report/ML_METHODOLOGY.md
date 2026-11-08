# MediSync Machine Learning Methodology & Architecture

> **Regulatory Invariant**: All ML components, predictions, and epidemiological projections in MediSync operate under the strict clinical contract:  
> `clinicalValidation: not_established`  
> The system provides clinical reference suggestions and epidemiological pattern recognition to assist registered medical practitioners. It is not an autonomous diagnostic device.

---

## 1. Data Sources & Provenance

The MediSync Machine Learning subsystem incorporates three foundational data sources:

1. **Tier 1 Curated Disease–Symptom Profiles (`dataset.csv`)**:
   - **Scope**: 41 high-priority communicable and general conditions.
   - **Priority Status**: Serves Sri Lankan public health priority conditions: Dengue (`A90`), Malaria (`B54`), Typhoid fever (`A01.0`), Leptospirosis (`A27.9`), Chikungunya (`A92.0`), Tuberculosis (`A15.0`), etc.
   - **Provenance**: Synthetic outpatient benchmark corpus providing multi-symptom co-occurrence vectors.
2. **Tier 2 Sourced Outpatient Knowledge Base (`disease_symptom_kb.v1.json`)**:
   - **Scope**: 174 mapped conditions with empirical outpatient symptom co-occurrence probabilities.
   - **Source**: CDC National Ambulatory Medical Care Survey (NAMCS) / National Hospital Ambulatory Medical Care Survey (NHAMCS) via SymCAT pipeline.
   - **Raw Snapshot**: `ml-engine/data_pipeline/raw/symcat_conditions.csv` (12.66 MB, SHA-256 `66ab3e299a4b7b1f6b4a04bacb65194e9edb861b0c9b759995e3c15af4d066ce`).
   - **Licensing**: CDC survey data is US Government Public Domain (17 U.S.C. § 105); SymCAT pipeline parser is MIT-licensed. Upstream terms audited as "internal research use, licence unverified".
3. **Reference ICD-10 Diagnostic Catalog (`icd10_clean.json`)**:
   - **Scope**: 71,704 validated leaf concepts (US CDC/CMS ICD-10-CM 2024).
   - **Provenance**: Public Domain US Government release. Supported across manual doctor search, patient history, and generic outbreak surveillance.

---

## 2. Ingestion, Quality Filtering & Curation Pipeline

To eliminate noisy survey artifacts and prevent deceptive model outputs, raw survey data underwent a multi-stage quality filter (`ml-engine/data_pipeline/ingest_disease_symptom_kb_v2.py`):

1. **Empirical Probability Preservation**:
   - Every symptom edge preserves its empirical outpatient reporting frequency ($P \in [0\%, 100\%]$).
2. **Decile Distribution & Thresholding**:
   - Analysis of 9,162 raw edges revealed a mean probability of 28.93%.
   - Applied threshold $P \ge 15.0\%$ to prune reporting noise (e.g. cross-eyed, nailbiting) while preserving cardinal clinical features.
3. **Condition Pruning & Quarantine (`kb_quarantine.v1.json`)**:
   - Required a minimum of 3 surviving symptoms per condition.
   - Isolated 14 conditions sharing identical 12-symptom dummy imputation vectors and Jaccard similarity $\ge 0.70$.
   - Quarantined 136 conditions with documented rationale (`dummy_imputation_cluster`, `too_few_surviving_symptoms`, `duplicate_condition_profile`, `sl_priority_disease_shield`).
4. **Mapper v2 & Synonyms**:
   - Auto-accepted only exact normalized catalog title matches and public domain CMS/CDC synonyms (174 conditions).
   - Separated 491 active conditions with proposed ICD-10 matches into `unmapped_diseases.v1.json` marked `needs_owner_review`.

---

## 3. Tiered Matcher V2 Architecture

The inference engine in `ml-engine/app.py` implements a tiered dual-corpus architecture:

```
                  ┌───────────────────────────────┐
                  │ Input Symptoms (Clinician UI) │
                  └──────────────┬────────────────┘
                                 │
                                 ▼
                  ┌───────────────────────────────┐
                  │ Tier 1: Curated Profiles (41) │
                  └──────────────┬────────────────┘
                                 │
                     Confidence >= 40.0%?
                    /                    \
              YES  /                      \  NO
                  ▼                        ▼
        ┌───────────────────┐    ┌───────────────────────────┐
        │  Curated Match    │    │ Tier 2: Sourced KB (174)  │
        │ (dataset.csv)     │    │ (Probability TF-IDF)      │
        └─────────┬─────────┘    └─────────────┬─────────────┘
                  │                            │
                  ▼                            ▼
        ┌────────────────────────────────────────────────────┐
        │ Clinical Guards (Typhoid Step-Ladder Fever Check)  │
        └─────────────────────────┬──────────────────────────┘
                                  │
                                  ▼
        ┌────────────────────────────────────────────────────┐
        │ Final Top-K Ranked List + Provenance Source Tag    │
        │ clinicalValidation: 'not_established'              │
        └────────────────────────────────────────────────────┘
```

1. **Tier 1 Precedence**:
   - When the top match confidence in Tier 1 is $\ge 40.0\%$, Tier 1 wins unconditionally. This guarantees that Sri Lankan priority communicable diseases are matched exclusively against vetted, high-confidence profiles.
2. **Tier 2 Fallback**:
   - When Tier 1 confidence is $< 40.0\%$, the engine queries the Tier 2 sparse TF-IDF matrix with empirical probability term weighting.
3. **Cardinal Symptom Clinical Guards**:
   - **Typhoid Guard**: Enteric fever requires step-ladder fever as a cardinal symptom. Multi-pain queries without fever receive a 0.55x penalty factor, preventing false positive top matches.
   - **At-Least-One Matched Symptom Guard**: Rejects candidates with zero overlapping features.

---

## 4. Production Performance & Resource Profile

- **Process Memory (RSS)**:
  - Interpreter baseline: **20.75 MB**
  - Post Tier 1 + Tier 2 load: **195.91 MB**
  - Sustained load (post 100 queries): **196.82 MB** (38.44% of Render Free 512 MB ceiling)
  - Heap allocation delta during inference: **~0.22 MB** (measured via `tracemalloc`)
- **Inference Latency (200 test queries)**:
  - Median (p50): **0.64 ms**
  - 95th Percentile (p95): **1.24 ms**
  - Mean: **0.77 ms**
- **Cold Start Handling**:
  - The Render Free tier spins down containers after 15 min of inactivity (~50 s cold start).
  - The Node.js Express backend applies a 60-second HTTP timeout and graceful fallback contract (`availability: "unavailable"`).
  - Production recommendation: 5-minute UptimeRobot ping maintains container warmth.

---

## 5. Evaluation Protocol & Limitations

1. **Self-Consistency Protocol**:
   - All evaluation metrics (F01–F14) are computed on synthetic 25% held-out partitions with fixed random seed (`42`).
   - Metrics demonstrate algorithmic self-consistency and retrieval stability under token perturbation.
2. **Explicit Limitations**:
   - Model outputs are **not clinical diagnoses**.
   - No clinical trial or patient cohort validation has been conducted (`clinicalValidation: not_established`).
   - The knowledge base reflects US outpatient ambulatory frequencies (CDC NAMCS) and may not reflect regional disease presentation variations in Sri Lanka.
   - Rare tropical diseases missing from both tiers require manual clinician entry using the 71,704 ICD catalog.
