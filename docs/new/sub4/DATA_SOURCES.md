# MediSync Sub-Project 4: Knowledge Base Data Sources Evaluation

**Document Version**: 2.0.0 (Phase D2b Revision)  
**Phase**: D2b (Knowledge Base Quality Filtering, Edge Weighting & Mapper v2)  
**Status**: INTERNAL RESEARCH USE (LICENCE UNVERIFIED)  
**Medical Disclaimer**: Academic simulation knowledge base only. `clinicalValidation: not_established`.

---

## 1. Candidate Sources Evaluation Matrix

| Source | Domain / Scope | Coverage | License | ICD-10 Linkage | Fit for MediSync Outpatient Simulator | Decision |
|---|---|---|---|---|---|---|
| **SymCAT (CDC NAMCS / NHAMCS via Ahead Research, Inc.)** | Common outpatient conditions & emergency visits | 801 diseases, 474 presenting symptoms with conditional probabilities | **Internal research use, licence unverified** (Upstream website terms proprietary; CDC survey data public domain) | Direct clinical mapping to ICD-10-CM concepts | Directly reflects clinical outpatient presentations (cough, fever, headache, abdominal pain, hypertension, asthma, diabetes). | **SELECTED FOR TIER 2 (FILTERED & QUARANTINED)** |
| **HPO (Human Phenotype Ontology)** | Rare diseases & genetic syndromes | ~10,000 diseases, 200,000+ annotations (`phenotype.hpoa`) | CC0 1.0 Universal (core) / OMIM-Orphanet terms | Mapped via OMIM / Orphanet / MONDO cross-refs | **Skewed**: >95% rare monogenic syndromes (e.g. dysmorphic features, microcephaly) which do not represent standard general practice presentations. | Evaluated; supplementary reference |
| **Orphanet / ORPHAcodes** | Rare diseases | ~6,000 clinical entities | CC-BY 4.0 | Cross-referenced to ICD-10 (tabular alignment available) | **Specialized**: Focuses on rare congenital/pediatric conditions. | Evaluated; rare disease reference |
| **MONDO Disease Ontology** | Global disease taxonomy & ontological reconciliation | ~25,000 disease concepts | CC-BY 4.0 | Extensive cross-references to ICD-10, MeSH, OMIM | **Taxonomic only**: Hierarchy and equivalence maps, does not supply presenting symptom co-occurrence probabilities. | Evaluated; ontology reference |
| **MedlinePlus Health Topics (NLM / NIH)** | Consumer health & patient education | ~1,000 consumer health topics (XML) | US Government Public Domain | MeSH terms & ICD-10 cross-links | **Unstructured**: Rich consumer prose but requires heuristic NLP symptom extraction; high risk of extraction noise. | Evaluated; prose reference |

---

## 2. Selected Source: SymCAT Data Audit & License Findings

### 2.1 Provenance and Original Source Audit
- **Creator**: Developed by Craig Monsen and David Do (Ahead Research, Inc., Baltimore, MD).
- **Underlying Data**: Aggregate public health survey statistics from the U.S. Centers for Disease Control and Prevention (CDC) National Ambulatory Medical Care Survey (NAMCS) and National Hospital Ambulatory Medical Care Survey (NHAMCS).
- **Upstream Web Platform**: Originally published on `www.symcat.com`.
- **License Investigation Result**:
  - While raw CDC NAMCS public-use microdata files are works of the U.S. Government (17 U.S.C. § 105), SymCAT was an independent commercial/consumer symptom triage application operated by Ahead Research, Inc.
  - The SymCAT website operated under proprietary Terms of Service and disclaimers.
  - The GitHub mirror (`teliov/symcat-to-synthea`) parsed scraped CSV exports under an MIT repository license, but Ahead Research, Inc. never executed an unencumbered public domain or open source grant for the derivative database.
- **Formal Status**: Marked **`internal research use, licence unverified`**.
  - Permissible exclusively for offline university prototype simulation and educational benchmarking.
  - **Exclusion Rule**: Kept out of any redistributed external production release artifact.

### 2.2 Sourced Statistics & Verified Probability Columns
- **File**: `ml-engine/data_pipeline/raw/symcat_conditions.csv` (12,660,539 bytes, SHA-256 `66ab3e299a4b7b1f6b4a04bacb65194e9edb861b0c9b759995e3c15af4d066ce`).
- **Total conditions**: 801 distinct disease profiles.
- **Total symptom edges**: 9,162 edges.
- **Probability Column Verification**: Verified present across repeating table offsets (columns 7, 32, 58, 83, 107, 132, 157) representing $P(\text{symptom} \mid \text{condition})$ in percent ($1.0\% \le p \le 100.0\%$).
- **Distribution**: Mean $28.93\%$, with $22.03\%$ of edges falling into the $<10\%$ noise band.
- **Curation Threshold**: Filtered at $P \ge 15.0\%$, requiring $N_{\text{surviving}} \ge 3$ symptoms per condition (see [KB_QUALITY.md](file:///c:/Users/chamo/OneDrive/Desktop/Final%20project/medisync/docs/new/sub4/KB_QUALITY.md)).

---

## 3. Ingestion & Quality Architecture

```
ml-engine/data_pipeline/raw/symcat_conditions.csv (801 conditions, 9,162 edges)
                        │
                        ▼
       [ingest_disease_symptom_kb_v2.py]
          │                     │
          ├─ Edge Filter        ├─ Cluster Detector (Jaccard >= 0.70 dummy, >= 0.85 pair)
          │  (P >= 15.0%)       ├─ Sri Lankan Priority Shield
          │                     ▼
          │         [kb_quarantine.v1.json] (136 excluded conditions)
          │
          ├─ Mapper v2 (icd10_clean.json + icd10_synonyms.v1.json)
          │  ├─ exact_normalized -> auto_accepted
          │  └─ candidate        -> needs_owner_review
          ▼
ml-engine/data/disease_symptom_kb.v1.json (Active filtered KB)
ml-engine/data/unmapped_diseases.v1.json (Separated unmapped conditions)
ml-engine/data_pipeline/mapping_review.csv (Audit ledger of all 801 decisions)
```
