# Data sheet for the datasets used (offline study, not in production)

Written by `ml-engine/evaluation/study/write_cards.py` from `ml-engine/evaluation/data/manifest.json`. Files are gitignored; only the manifest is committed.

## DDXPlus condition dictionary

| Field | Content |
|---|---|
| Source | https://doi.org/10.6084/m9.figshare.20043374 (https://ndownloader.figshare.com/files/62657140) |
| Licence | CC BY 4.0 (figshare API licence field, article 20043374 (https://creativecommons.org/licenses/by/4.0/)) |
| Size | 49 rows, 26,793 bytes, SHA-256 `960112db15716921…`, downloaded 2026-11-15 |
| Used for | V1: English pathology names |
| Nature | The 49 pathologies with English names and ICD-10 codes. |
| Known biases | Synthetic patients from a proprietary rule-based generator; 49 pathologies, mostly respiratory and cardiovascular; heavy class imbalance (study test sample: smallest class 36 rows, largest 2000); patients share templates, so rows are not independent. |

## DDXPlus evidence dictionary

| Field | Content |
|---|---|
| Source | https://doi.org/10.6084/m9.figshare.20043374 (https://ndownloader.figshare.com/files/40495562) |
| Licence | CC BY 4.0 (figshare API licence field, article 20043374 (https://creativecommons.org/licenses/by/4.0/)) |
| Size | 223 rows, 198,524 bytes, SHA-256 `980f7020ec068b29…`, downloaded 2026-11-15 |
| Used for | V1: turns evidence codes into English text |
| Nature | Questions and answer meanings for each evidence code. |
| Known biases | Synthetic patients from a proprietary rule-based generator; 49 pathologies, mostly respiratory and cardiovascular; heavy class imbalance (study test sample: smallest class 36 rows, largest 2000); patients share templates, so rows are not independent. |

## DDXPlus (English release, test patients)

| Field | Content |
|---|---|
| Source | https://doi.org/10.6084/m9.figshare.20043374 (https://ndownloader.figshare.com/files/40495565) |
| Licence | CC BY 4.0 (figshare API licence field, article 20043374 (https://creativecommons.org/licenses/by/4.0/)) |
| Size | 134,529 rows, 18,986,243 bytes, SHA-256 `ad3bb981f3453fd7…`, downloaded 2026-11-15 |
| Used for | V1 second independent symptom benchmark |
| Nature | Synthetic patients generated from a proprietary medical knowledge base (Fansi Tchango et al., NeurIPS 2022). Not real patient data. |
| Known biases | Synthetic patients from a proprietary rule-based generator; 49 pathologies, mostly respiratory and cardiovascular; heavy class imbalance (study test sample: smallest class 36 rows, largest 2000); patients share templates, so rows are not independent. |

## DDXPlus (English release, train patients)

| Field | Content |
|---|---|
| Source | https://doi.org/10.6084/m9.figshare.20043374 (https://ndownloader.figshare.com/files/40495568) |
| Licence | CC BY 4.0 (figshare API licence field, article 20043374 (https://creativecommons.org/licenses/by/4.0/)) |
| Size | 1,025,602 rows, 140,923,730 bytes, SHA-256 `174ae1d56f36a15b…`, downloaded 2026-11-16 |
| Used for | Study Phase C: training sample for the shadow models (offline study, not in production) |
| Nature | Synthetic patients generated from a proprietary medical knowledge base. Not real patient data. |
| Known biases | Synthetic patients from a proprietary rule-based generator; 49 pathologies, mostly respiratory and cardiovascular; heavy class imbalance (study test sample: smallest class 36 rows, largest 2000); patients share templates, so rows are not independent. |

## DDXPlus (English release, validation patients)

| Field | Content |
|---|---|
| Source | https://doi.org/10.6084/m9.figshare.20043374 (https://ndownloader.figshare.com/files/40495571) |
| Licence | CC BY 4.0 (figshare API licence field, article 20043374 (https://creativecommons.org/licenses/by/4.0/)) |
| Size | 132,448 rows, 18,706,053 bytes, SHA-256 `625a96855becf0ef…`, downloaded 2026-11-16 |
| Used for | Study Phase C: hyperparameter selection and permutation importance only |
| Nature | Synthetic patients generated from a proprietary medical knowledge base. Not real patient data. |
| Known biases | Synthetic patients from a proprietary rule-based generator; 49 pathologies, mostly respiratory and cardiovascular; heavy class imbalance (study test sample: smallest class 36 rows, largest 2000); patients share templates, so rows are not independent. |

## gretelai/symptom_to_diagnosis (test split)

| Field | Content |
|---|---|
| Source | https://huggingface.co/datasets/gretelai/symptom_to_diagnosis (https://huggingface.co/datasets/gretelai/symptom_to_diagnosis/resolve/722cfb0e11f8ae37339c7f573b5e10429b94df49/test.jsonl) |
| Licence | apache-2.0 (Hugging Face API cardData.license for gretelai/symptom_to_diagnosis) |
| Size | 212 rows, 42,506 bytes, SHA-256 `7581c68031d7433f…`, downloaded 2026-11-15 |
| Used for | V1 symptom benchmark (test split) |
| Nature | Adapted from the Symptom2Disease dataset and rewritten with a large language model (dataset page). Synthetic, LLM-rewritten text; not real patient data. |
| Known biases | LLM-rewritten text from the Symptom2Disease dataset; 22 diagnoses, about 10 rows each; same label set as the source of the engine's curated profiles. |

## gretelai/symptom_to_diagnosis (train split)

| Field | Content |
|---|---|
| Source | https://huggingface.co/datasets/gretelai/symptom_to_diagnosis (https://huggingface.co/datasets/gretelai/symptom_to_diagnosis/resolve/722cfb0e11f8ae37339c7f573b5e10429b94df49/train.jsonl) |
| Licence | apache-2.0 (Hugging Face API cardData.license for gretelai/symptom_to_diagnosis) |
| Size | 853 rows, 170,994 bytes, SHA-256 `9b8ff27dab30cdeb…`, downloaded 2026-11-15 |
| Used for | V2 calibration map only (validation split). Never used to score the engine. |
| Nature | Same source and nature as the test split. |
| Known biases | LLM-rewritten text from the Symptom2Disease dataset; 22 diagnoses, about 10 rows each; same label set as the source of the engine's curated profiles. |

## OpenDengue national extract V1.3.1

| Field | Content |
|---|---|
| Source | https://opendengue.org/ (https://raw.githubusercontent.com/OpenDengue/master-repo/main/data/releases/V1.3.1/National_extract_V1_3_1.zip) |
| Licence | CC BY 4.0 (opendengue.org page footer: "Content licensed under ..." (the GitHub repository has no LICENSE file)) |
| Size | 29,540 rows, 330,958 bytes, SHA-256 `c588335f25f2202e…`, downloaded 2026-11-15 |
| Used for | V4 outbreak detector and projection back-test (Sri Lanka rows only) |
| Nature | Public aggregate dengue case counts compiled by the OpenDengue project (LSHTM). Sri Lanka rows come from Ministry of Health reports. These are national counts, not MediSync consultations. |
| Known biases | National totals only for Sri Lanka; reporting completeness varies by year; 2018 missing; week-end gaps interpolated by the study rule. |


Last verified: 2026-11-18 at commit f5337833. Location and internal links only; the content is a dated record and was not re-checked against the code (current documents are listed in docs/INDEX.md).
