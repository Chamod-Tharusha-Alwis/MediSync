# MediSync ML Engine: Heuristics & Design Parameters Inventory

> **Mandatory Disclaimer**: All parameters, thresholds, and rules documented herein represent **engineering design choices and prototype heuristics**, NOT validated clinical criteria (`clinicalValidation: not_established`). No claim of clinical accuracy or medical endorsement is made.

---

## 1. Inventory of Hand-Set Heuristics & Parameters

| Parameter / Heuristic | Value | Code Location | Engineering Rationale | Status |
|---|:---:|---|---|:---:|
| **Tier 1 vs. Tier 2 Confidence Threshold** | `40.0%` | `ml-engine/app.py:126` | When top match confidence in Tier 1 curated profiles is $\ge 40\%$, Tier 1 wins unconditionally. Reserves Sri Lankan priority diseases (Dengue, Malaria, Typhoid) strictly to vetted profiles. | `design_choice` |
| **Typhoid Cardinal Symptom Guard** | Step-ladder fever check | `ml-engine/app.py:141-155` | Enteric fever requires fever as cardinal symptom. Multi-pain queries without fever receive a penalty factor to prevent false positive top matches. | `needs_clinician_review` |
| **Typhoid Non-Fever Penalty Factor** | `0.55x` | `ml-engine/app.py:151` | Multiplicative discount applied to Typhoid confidence score when localized pain exists without systemic fever. | `design_choice` |
| **Minimum Matched Symptom Guard** | `matched_count >= 1` | `ml-engine/app.py:112` | Predictions require at least one nonzero overlapping feature token with input symptoms; zero-overlap candidates rejected. | `design_choice` |
| **KB Symptom Edge Probability Cutoff** | `P >= 15.0%` | `ml-engine/data_pipeline/ingest_disease_symptom_kb.py:28` | Prunes outpatient survey noise (e.g. cross-eyed, nailbiting) from CDC NAMCS dataset while retaining salient clinical presentation features. | `design_choice` |
| **Minimum Surviving Symptoms Per KB Condition** | `3` symptoms | `ml-engine/data_pipeline/ingest_disease_symptom_kb.py:115` | Conditions retaining fewer than 3 symptoms above the probability cutoff are excluded to avoid single-symptom overmatching. | `design_choice` |
| **Dummy Imputation Cluster Jaccard Threshold** | `Jaccard >= 0.70` | `ml-engine/data_pipeline/ingest_disease_symptom_kb.py:75` | Identifies and quarantines artificial imputation clusters sharing identical fallback symptom sets in raw survey data. | `design_choice` |
| **Outbreak Gate 1: Episode Count Floor** | `N >= 5` cases | `server/src/services/surveillanceService.js:136-140` | Suppresses alert storms caused by small isolated case numbers ($N < 5$) in low-population districts. | `design_choice` |
| **Outbreak Gate 2: Temporal Persistence** | `2` consecutive days | `server/src/services/surveillanceService.js:136-140` | Requires elevated z-score across 2 consecutive evaluation calendar days to eliminate single-day reporting artifacts. | `design_choice` |
| **Outbreak Gate 3: Statistical Deviation** | `z > 2.0` | `server/src/services/surveillanceService.js:136-140` | Triggers alert only when rolling 7-day incidence exceeds $2.0$ standard deviations over the 56-day district historical baseline ($\sigma \ge 0.5$). | `design_choice` |
| **Emergency Red-Flag Advisory Screen** | 6 conservative presentation rules | `server/src/utils/emergencyAdvisory.js` | Evaluates deterministic emergency presentations (meningism, chest pain, anaphylaxis, severe hemorrhage) to surface informational advisory without modifying ML rankings. | `needs_clinician_review` |
| **Urgency Classification Heuristic** | High confidence or severe condition list | `ml-engine/app.py` | Automatically flags predictions as urgent for emergency triage routing. | `needs_clinician_review` |

---

## 2. Sanity Test Suite: 15 Additional Clinical Symptom Combinations

To evaluate JSON schema compliance and contract execution across diverse symptom presentations, 15 independent symptom combinations (distinct from unit test suites) were evaluated via `scripts/verify_sanity_symptom_cases.py`:

| ID | Clinical Scenario / Description | Input Symptoms | Top Prediction | Conf. (%) | Source | Urgent | Format Check |
|:---:|---|---|---|:---:|:---:|:---:|:---:|
| **SC-01** | Upper respiratory with anosmia | `["dry cough", "fatigue", "loss of taste"]` | Tuberculosis | 39.88% | curated | No | PASS |
| **SC-02** | Gastroesophageal reflux presentation | `["heartburn", "acid reflux", "chest tightness"]` | Esophagitis | 42.77% | knowledge_base | No | PASS |
| **SC-03** | Dependent edema with exertional breathlessness | `["swollen ankles", "weight gain", "shortness of breath on exertion"]` | Acanthosis nigricans | 45.33% | knowledge_base | No | PASS |
| **SC-04** | Allergic rhinoconjunctivitis presentation | `["sneezing", "itchy eyes", "watery eyes", "clear rhinorrhea"]` | Allergy | 27.49% | curated | No | PASS |
| **SC-05** | Resting tremor and extrapyramidal signs | `["tremor", "bradykinesia", "muscle rigidity"]` | Malaria | 13.07% | curated | No | PASS |
| **SC-06** | Podagra / acute monoarthritis presentation | `["pain in big toe", "joint redness", "swelling in toe"]` | Gout | 46.85% | knowledge_base | No | PASS |
| **SC-07** | Otitis media clinical presentation | `["ear pain", "impaired hearing", "fluid draining from ear"]` | Otitis media | 51.20% | knowledge_base | No | PASS |
| **SC-08** | Endocrine polyuria/polydipsia triad | `["frequent urination", "excessive thirst", "unexplained weight loss"]` | Diabetes | 48.12% | curated | No | PASS |
| **SC-09** | Meningism / acute severe headache | `["sudden severe headache", "stiff neck", "photophobia"]` | Migraine | 36.40% | curated | No | PASS |
| **SC-10** | Autoimmune malar rash presentation | `["skin rash on face", "malar butterfly rash", "joint stiffness"]` | Fungal infection | 31.25% | curated | No | PASS |
| **SC-11** | Irritable bowel functional triad | `["abdominal bloating", "cramping", "alternating constipation and diarrhea"]` | Peptic ulcer disease | 34.18% | curated | No | PASS |
| **SC-12** | Constitutional B-symptoms query | `["intermittent fever", "night sweats", "swollen lymph nodes in neck"]` | Tuberculosis | 44.20% | curated | No | PASS |
| **SC-13** | Laryngeal hoarseness and dysphagia | `["hoarseness of voice", "chronic dry cough", "difficulty swallowing"]` | GERD | 38.60% | curated | No | PASS |
| **SC-14** | Postprandial retrosternal burning | `["burning sensation in chest after eating", "sour taste in mouth"]` | Esophagitis | 44.90% | knowledge_base | No | PASS |
| **SC-15** | Inflammatory axial back stiffness | `["lower back stiffness in morning", "hip stiffness improving with exercise"]` | Osteoarthritis | 33.70% | curated | No | PASS |

### Contract & Format Verification Summary
- **HTTP 200 OK**: 15 / 15 queries returned successfully with zero internal server crashes.
- **`clinicalValidation: not_established`**: 15 / 15 responses included mandatory regulatory disclaimer.
- **Valid Shape**: 15 / 15 returned well-formed prediction lists with `confidence`, `disease`, and `source`.
- **Format Check**: 15 / 15 passed JSON structure validation.

---

## 3. Clinical Plausibility & Architectural Limitations (Owner Review)

> [!WARNING]
> **Honest Clinical Assessment**: The 15 sanity cases evaluate schema format compliance and crash-free execution; they **do NOT establish clinical diagnostic validity or algorithmic quality**. Several prediction outputs demonstrate severe clinical weaknesses when evaluated against real-world medical practice:
> - **SC-03** (*Dependent edema + exertional breathlessness*, typical congestive heart failure): Top prediction is *Acanthosis nigricans* (45.33%) due to superficial non-specific co-occurrence in ambulatory survey data.
> - **SC-05** (*Resting tremor + bradykinesia + muscle rigidity*, classic Parkinsonism): Top prediction is *Malaria* (13.07%) because the curated catalog lacks chronic neurodegenerative profiles and defaults to low-confidence fever entities.
> - **SC-09** (*Sudden severe headache + stiff neck + photophobia*, cardinal red flags for acute meningitis or subarachnoid hemorrhage): Top prediction is *Migraine* (36.40%) without emergency escalation.
> - **SC-10** (*Malar butterfly rash + joint stiffness*, classic Systemic Lupus Erythematosus): Top prediction is *Fungal infection* (31.25%).
>
> **Critical System Limitations**:
> 1. **Advisory Red-Flag Screen Present (Unvalidated Heuristic)**: MediSync implements an informational, deterministic red-flag advisory screen (`server/src/utils/emergencyAdvisory.js`, `server/src/data/emergencyRedFlags.json`) evaluated alongside ML suggestions. It flags critical patterns (acute meningism, acute cardiorespiratory distress, acute coronary symptoms, altered mental status, suspected anaphylaxis, severe hemorrhage) as an advisory banner. It does NOT auto-diagnose, triage, or alter statistical rankings, and remains an unvalidated heuristic (`clinicalValidation: not_established`) requiring clinician review.
> 2. **Lexical Similarity Reference Only**: The dual-tier pipeline computes unweighted lexical n-gram token overlap and TF-IDF similarity. It does not model clinical pathophysiological relationships, disease timelines, or physical examination findings.
> 3. **Non-Diagnostic Prototype**: Under no circumstances should the system's differential suggestions be presented as diagnostic opinions or used in patient triage without independent human physician review.
