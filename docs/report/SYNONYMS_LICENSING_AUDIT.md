# MediSync Clinical Synonyms Licensing & Verifiable Source Audit

> **Objective**: Audit the 32 clinical synonyms defined in `ml-engine/data_pipeline/build_icd10_synonyms.py` against licensing restrictions and offline verification criteria.
> **Offline Verification Limitation**: Because all verification was conducted strictly offline, the live CMS/CDC 2024 Alphabetic Index website was **NOT ACCESSIBLE**. Only the local existence of ICD-10-CM codes and official descriptions in `server/reference-data/icd10_clean.json` is verified. All external CMS index entries are marked **NOT VERIFIED / `owner_must_check`**.

---

## 1. Regulatory & Licensing Analysis

1. **UMLS Metathesaurus Licensing Context**:
   - The Unified Medical Language System (UMLS) is produced by the US National Library of Medicine (NLM) under the UMLS Metathesaurus License Agreement.
   - To avoid license restrictions or proprietary encumbrance in the MediSync codebase, clinical synonym mappings should ideally trace to an unencumbered, public domain reference source.
2. **CMS / CDC ICD-10-CM Public Domain Source**:
   - The official US Department of Health and Human Services (HHS) CMS and CDC publish the **ICD-10-CM Tabular List and Alphabetic Index**, which is a work of the United States Government (17 U.S.C. § 105).
3. **Session Verification Status**:
   - **Local ICD Catalog**: **VERIFIED OFFLINE**. All 32 codes and descriptions exist in `server/reference-data/icd10_clean.json`.
   - **CMS Alphabetic Index**: **NOT VERIFIED** (Offline execution precluded fetching the official live index).
   - **JSON Status**: Updated to `"status": "owner_must_check"` in `icd10_synonyms.v1.json`.
   - **Action for Owner**: Owner must review the candidate headings against the official CMS Alphabetic Index prior to production deployment.

---

## 2. Complete Synonyms Audit Ledger (32 Entries)

| Term / Synonym | ICD-10-CM Code | Target Description in Local Catalog (VERIFIED) | CMS / CDC Alphabetic Index Entry (NOT VERIFIED - owner_must_check) | UMLS CUI (Reference) | Status | Active KB Impact |
|---|:---:|---|---|:---:|:---:|---|
| **diabetes** | `E11.9` | Type 2 diabetes mellitus without complications | Diabetes, diabetic -> type 2 -> without complications (`E11.9`) | `C0011860` | `owner_must_check` | Unmapped pool |
| **uti** | `N39.0` | Urinary tract infection, site not specified | Infection -> urinary (tract) -> specified NEC (`N39.0`) | `C0042029` | `owner_must_check` | Unmapped pool |
| **hiv** | `B20` | Human immunodeficiency virus [HIV] disease | Human immunodeficiency virus (HIV) disease (`B20`) | `C0019693` | `owner_must_check` | Unmapped pool |
| **chlamydia** | `A74.9` | Chlamydial infection, unspecified | Chlamydia, chlamydial -> infection NEC (`A74.9`) | `C0008035` | `owner_must_check` | Active KB mapped |
| **crohn disease** | `K50.90` | Crohn's disease, unspecified, without complications | Crohn's disease -> unspecified -> without complications (`K50.90`) | `C0010346` | `owner_must_check` | Active KB mapped |
| **cellulitis** | `L03.90` | Cellulitis, unspecified | Cellulitis -> site not specified (`L03.90`) | `C0007642` | `owner_must_check` | Unmapped pool |
| **colorectal cancer** | `C18.9` | Malignant neoplasm of colon, unspecified | Neoplasm -> colon -> malignant primary (`C18.9`) | `C0009402` | `owner_must_check` | Unmapped pool |
| **adhd** | `F90.9` | Attention-deficit hyperactivity disorder, unspecified type | Attention -> deficit disorder -> with hyperactivity -> unspecified (`F90.9`) | `C1263846` | `owner_must_check` | Unmapped pool |
| **bell palsy** | `G51.0` | Bell's palsy | Bell's palsy (`G51.0`) | `C0015469` | `owner_must_check` | Active KB mapped |
| **alzheimer disease** | `G30.9` | Alzheimer's disease, unspecified | Alzheimer's disease -> unspecified (`G30.9`) | `C0002395` | `owner_must_check` | Active KB mapped |
| **parkinson disease** | `G20` | Parkinson's disease | Parkinson's disease (`G20`) | `C0030567` | `owner_must_check` | Active KB mapped |
| **huntington disease** | `G10` | Huntington's disease | Huntington's chorea / disease (`G10`) | `C0020179` | `owner_must_check` | Active KB mapped |
| **gerd** | `K21.9` | Gastro-esophageal reflux disease without esophagitis | Reflux -> gastroesophageal -> without esophagitis (`K21.9`) | `C0017168` | `owner_must_check` | Tier 1 Curated |
| **copd** | `J44.9` | Chronic obstructive pulmonary disease, unspecified | Disease -> lung -> obstructive -> chronic -> unspecified (`J44.9`) | `C0024117` | `owner_must_check` | Unmapped pool |
| **bph** | `N40.0` | Benign prostatic hyperplasia without lower urinry tract symp | Hyperplasia -> prostate -> benign -> without LUTS (`N40.0`) | `C0033570` | `owner_must_check` | Unmapped pool |
| **pcos** | `E28.2` | Polycystic ovarian syndrome | Syndrome -> polycystic ovary (`E28.2`) | `C0032460` | `owner_must_check` | Unmapped pool |
| **dvt** | `I82.409` | Acute embolism and thombos unsp deep vn unsp lower extremity | Embolism / thrombosis -> vein -> deep -> lower extremity -> unspecified (`I82.409`) | `C0149871` | `owner_must_check` | Unmapped pool |
| **flu** | `J11.1` | Flu due to unidentified influenza virus w oth resp manifest | Influenza -> with other respiratory manifestations (`J11.1`) | `C0021400` | `owner_must_check` | Unmapped pool |
| **kidney stone** | `N20.0` | Calculus of kidney | Calculus, calculi -> kidney (`N20.0`) | `C0022650` | `owner_must_check` | Active KB mapped |
| **heart attack** | `I21.9` | Acute myocardial infarction, unspecified | Infarction -> myocardium -> acute -> unspecified (`I21.9`) | `C0027051` | `owner_must_check` | Active KB mapped |
| **stroke** | `I63.9` | Cerebral infarction, unspecified | Infarction -> cerebral (stroke) -> unspecified (`I63.9`) | `C0038454` | `owner_must_check` | Active KB mapped |
| **hives** | `L50.9` | Urticaria, unspecified | Hives (see also Urticaria) (`L50.9`) | `C0042109` | `owner_must_check` | Unmapped pool |
| **ringworm** | `B35.4` | Tinea corporis | Ringworm (see also Tinea -> corporis) (`B35.4`) | `C0040247` | `owner_must_check` | Unmapped pool |
| **athlete's foot** | `B35.3` | Tinea pedis | Athlete's foot (see also Tinea -> pedis) (`B35.3`) | `C0040251` | `owner_must_check` | Active KB mapped |
| **shingles** | `B02.9` | Zoster without complications | Shingles (see also Zoster -> without complications) (`B02.9`) | `C0019360` | `owner_must_check` | Unmapped pool |
| **chickenpox** | `B01.9` | Varicella without complication | Chickenpox (see also Varicella) (`B01.9`) | `C0008049` | `owner_must_check` | Active KB mapped |
| **measles** | `B05.9` | Measles without complication | Measles (`B05.9`) | `C0025007` | `owner_must_check` | Active KB mapped |
| **mumps** | `B26.9` | Mumps without complication | Mumps (`B26.9`) | `C0026780` | `owner_must_check` | Active KB mapped |
| **rubella** | `B06.9` | Rubella without complication | Rubella (`B06.9`) | `C0035920` | `owner_must_check` | Active KB mapped |
| **whooping cough** | `A37.90` | Whooping cough, unspecified species without pneumonia | Pertussis (see also Whooping cough) (`A37.90`) | `C0043166` | `owner_must_check` | Active KB mapped |
| **scarlet fever** | `A38.9` | Scarlet fever, uncomplicated | Scarlet fever (`A38.9`) | `C0036324` | `owner_must_check` | Active KB mapped |
| **tetanus** | `A35` | Other tetanus | Tetanus (`A35`) | `C0039614` | `owner_must_check` | Active KB mapped |
