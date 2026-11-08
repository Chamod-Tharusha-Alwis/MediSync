# MediSync Sub-Project 4: Knowledge Base Data Sources Evaluation

**Document Version**: 1.0.0  
**Phase**: D2 (Sourced Disease-Symptom Knowledge Base)  
**Status**: APPROVED FOR INGESTION  
**Medical Disclaimer**: Academic simulation knowledge base only. `clinicalValidation: not_established`.

---

## 1. Candidate Sources Evaluation Matrix

| Source | Domain / Scope | Coverage | License | ICD-10 Linkage | Fit for MediSync Outpatient Simulator | Decision |
|---|---|---|---|---|---|---|
| **SymCAT (CDC NAMCS / NHAMCS)** | Common outpatient conditions & emergency visits | 801 diseases, 474 presenting symptoms with conditional probabilities | Public Domain (CDC data) / MIT (parser repository) | Direct clinical mapping to ICD-10-CM concepts | **Optimal**: Directly reflects clinical outpatient presentations (cough, fever, headache, abdominal pain, hypertension, asthma, diabetes). | **SELECTED FOR TIER 2** |
| **HPO (Human Phenotype Ontology)** | Rare diseases & genetic syndromes | ~10,000 diseases, 200,000+ annotations (`phenotype.hpoa`) | CC0 1.0 Universal (core) / OMIM-Orphanet terms | Mapped via OMIM / Orphanet / MONDO cross-refs | **Skewed**: >95% rare monogenic syndromes (e.g. dysmorphic features, microcephaly) which do not represent standard general practice presentations. | Evaluated; supplementary reference |
| **Orphanet / ORPHAcodes** | Rare diseases | ~6,000 clinical entities | CC-BY 4.0 | Cross-referenced to ICD-10 (tabular alignment available) | **Specialized**: Focuses on rare congenital/pediatric conditions. | Evaluated; rare disease reference |
| **MONDO Disease Ontology** | Global disease taxonomy & ontological reconciliation | ~25,000 disease concepts | CC-BY 4.0 | Extensive cross-references to ICD-10, MeSH, OMIM | **Taxonomic only**: Hierarchy and equivalence maps, does not supply presenting symptom co-occurrence probabilities. | Evaluated; ontology reference |
| **MedlinePlus Health Topics (NLM / NIH)** | Consumer health & patient education | ~1,000 consumer health topics (XML) | US Government Public Domain | MeSH terms & ICD-10 cross-links | **Unstructured**: Rich consumer prose but requires heuristic NLP symptom extraction; high risk of extraction noise. | Evaluated; prose reference |

---

## 2. Selected Source: SymCAT (CDC NAMCS Outpatient Survey Data)

### 2.1 Provenance and Origin
- **Primary Data Origin**: U.S. Centers for Disease Control and Prevention (CDC), National Center for Health Statistics (NCHS).
  - Survey: National Ambulatory Medical Care Survey (NAMCS) and National Hospital Ambulatory Medical Care Survey (NHAMCS).
  - Scope: Multi-year representative sample of patient visits to outpatient physicians and emergency departments.
- **Derived Schema**: Probabilistic association between presenting complaints (symptoms) and verified clinician discharge diagnoses.
- **Repository Snapshot**: `teliov/symcat-to-synthea` (MIT License).
- **Download URL**: `https://raw.githubusercontent.com/teliov/symcat-to-synthea/master/symcat/symcat-801-diseases.csv`
- **Retrieved At**: `2026-11-08T14:40:19Z`
- **File**: `ml-engine/data_pipeline/raw/symcat_conditions.csv`
- **Bytes**: 12,660,539 bytes
- **SHA-256**: `66ab3e299a4b7b1f6b4a04bacb65194e9edb861b0c9b759995e3c15af4d066ce`

### 2.2 Sourced Statistics
- **Total conditions**: 801 distinct outpatient disease profiles.
- **Total presenting symptoms**: 474 standardized symptoms (from `symcat-474-symptoms.csv`).
- **Symptom frequency per condition**: Min 2, Max 12, Average 11.44 symptoms per disease.
- **Symptom probability**: Empirical frequency percentage ($0 < p \le 100$) reflecting real patient presentations.

### 2.3 Licensing & Freedom of Use
- CDC data is a work of the United States Government and is in the **Public Domain** worldwide (17 U.S.C. § 105).
- Derived parsing code is distributed under the permissive **MIT License**.
- Zero commercial encumbrance, fully compliant with academic prototype requirements.

---

## 3. Ingestion & Mapping Architecture

```
ml-engine/data_pipeline/raw/symcat_conditions.csv (801 conditions, 12.6MB)
                        │
                        ▼
       [ingest_disease_symptom_kb.py]
          │                     │
          ├─ Clinical Tokenizer │
          ├─ ICD-10 Mapper      │
          │                     ▼
          │         [Separation Rule]
          │         Unmapped conditions -> unmapped_diseases.v1.json
          ▼
ml-engine/data/disease_symptom_kb.v1.json (Normalized KB)
```

### 3.1 Mapping Confidence Classification
1. **`exact`**: The condition name exactly matches the ICD-10-CM concept description (case-insensitive, punctuation-stripped).
2. **`broader`**: The condition maps cleanly to a standard ICD-10-CM clinical concept (e.g. "Asthma" -> `J45.909`, "Hypertension" -> `I10`, "Acute bronchitis" -> `J20.9`).
3. **`none`**: Conditions that cannot be unambiguously mapped to an ICD-10 concept are assigned `icd10: null` and `mappingConfidence: "none"`.
4. **Strict Non-Fabrication Rule**:
   - Zero hallucinated symptoms. Every symptom string is sourced from the CDC dataset.
   - Unmapped ICD codes are NEVER populated with artificial symptoms. They remain selectable in the doctor search and surveillance, but have no symptom profile.
