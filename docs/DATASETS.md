# Datasets, sources and licences

This page lists every dataset that MediSync's runtime, seeding and evaluation use. For each one it gives the
source, the licence and how it was derived. It was compiled on 2026-11-18 at commit `f5337833` from:
- `ml-engine/evaluation/data/manifest.json`;
- the files' own metadata;
- the generating scripts;
- `git log`.

`UNVERIFIED` means the licence could not be confirmed from the source. Those files are used inside the
project but are **not** redistributed in the dataset package.

## Credits (attribution text for reuse)

- **OpenDengue:** national dengue case counts, release V1.3.1, from the OpenDengue project
  (https://opendengue.org/). Licensed **CC BY 4.0**. Cite as instructed on the OpenDengue site.
- **DDXPlus:** Fansi Tchango et al., NeurIPS 2022 (as recorded in the dataset manifest); data on figshare, DOI 10.6084/m9.figshare.20043374. Licensed **CC BY 4.0**.
- **gretelai/symptom_to_diagnosis:** Gretel.ai, on Hugging Face. Licensed **Apache-2.0**.
- **US FDA prescription drug labels:** retrieved through the openFDA drug label API. The interaction
  reference pairs in `ml-engine/evaluation/interaction_reference.json` are this project's paraphrases, with a
  citation to each label.

Changes made: OpenDengue was filtered to Sri Lanka weekly rows; DDXPlus and gretelai were sampled and
converted for benchmarking. No values were altered.

- **Sizes and row counts** were measured on this machine. SHA-256 values are given as their first 16 hex
  characters.
- **Licences** come from the dataset's own page or file, as recorded in
  `ml-engine/evaluation/data/manifest.json`, or from the file's own metadata. `UNVERIFIED` means the licence could
  not be confirmed from the source.
- **No dataset below contains real personal data:**
  - OpenDengue is aggregate national counts;
  - DDXPlus is synthetic patients;
  - gretelai is LLM-rewritten synthetic text;
  - the census file is district totals;
  - the drug files are product and interaction lists;
  - `medisync.db` holds randomly generated counts.

**About authorship (for your AI declaration):**
- Every commit in this repository has the author name `Security Bot`.
- The commit messages follow the agent-session task style (for example `feat(sub4-d2): …`).
- Git cannot tell whether a person or an AI assistant wrote a given script. Treat every script-generated file
  below as **produced by a script that was written with AI coding assistance**, unless you know otherwise.
- "Hand-curated" below means the file is a small hand-written list, not the output of a script.

## A. Datasets used by the evaluation and study (all git-ignored, re-downloadable)

| Dataset | Path | Size | Rows | Source URL | Licence (evidence) | Used for | Personal data? | Redistribution |
|---|---|---|---|---|---|---|---|---|
| OpenDengue national extract V1.3.1 | `ml-engine/evaluation/data/opendengue/National_extract_V1_3_1.zip` | 330,958 B | 29,540 (455 Sri Lanka weekly rows) | https://raw.githubusercontent.com/OpenDengue/master-repo/main/data/releases/V1.3.1/National_extract_V1_3_1.zip (page https://opendengue.org/) | **CC BY 4.0** (opendengue.org footer; the GitHub repository has no LICENSE file) | Outbreak detector and projection back-test; forecast benchmark; detector sweep | No (aggregate counts) | Yes, with attribution |
| DDXPlus test patients | `ml-engine/evaluation/data/ddxplus/release_test_patients.zip` | 18,986,243 B | 134,529 | https://ndownloader.figshare.com/files/40495565 (DOI 10.6084/m9.figshare.20043374) | **CC BY 4.0** (figshare API licence field) | Second symptom benchmark (2,916-row sample) | No (synthetic) | Yes, with attribution |
| DDXPlus validation patients | `.../ddxplus/release_validate_patients.zip` | 18,706,053 B | 132,448 | https://ndownloader.figshare.com/files/40495571 | **CC BY 4.0** | Study Phase C (hyper-parameters, permutation importance) | No | Yes |
| DDXPlus train patients | `.../ddxplus/release_train_patients.zip` | 140,923,730 B | 1,025,602 | https://ndownloader.figshare.com/files/40495568 | **CC BY 4.0** | Study Phase C shadow-model training sample | No | Yes, but too large for the package: re-download |
| DDXPlus evidence / condition dictionaries | `.../ddxplus/release_evidences.json`, `release_conditions.json` | 198,524 B / 26,793 B | 223 / 49 | figshare files 40495562 / 62657140 | **CC BY 4.0** | Turn codes into English text | No | Yes |
| gretelai/symptom_to_diagnosis (test, train) | `ml-engine/evaluation/data/test.jsonl`, `train.jsonl` | 42,506 B / 170,994 B | 212 / 853 | https://huggingface.co/datasets/gretelai/symptom_to_diagnosis | **Apache-2.0** (Hugging Face `cardData.license`) | Symptom benchmark (test); calibration map (train) | No (LLM-rewritten synthetic text) | Yes (Apache-2.0: keep the licence notice) |
| US FDA drug labels (36 label JSON files) | `ml-engine/evaluation/data/labels/*.json` | 5,431,736 B | 36 labels | openFDA drug label API (the same labels are on DailyMed) | US FDA public data via openFDA. **Terms not re-checked today: UNVERIFIED for redistribution of the raw files** | Source of the 165 reference pairs | No | Not packaged; re-fetchable |
| Interaction reference pairs | `ml-engine/evaluation/interaction_reference.json` (tracked) | 92,107 B | 165 pairs | Written for this project from the FDA labels above; each pair cites its label; the `basis` field is a paraphrase | Project's own work (paraphrases, not quotations) citing public FDA labels | Medicine-checker benchmark | No | Yes (project-authored) |

## B. Runtime and seed data (`ml-engine/data/`, `server/`, `client/`)

| File | Size | Rows | Origin | Licence | Hand / script | Derivation | In Drive package? |
|---|---|---|---|---|---|---|---|
| `ml-engine/data/dataset.csv` | 632,202 B | 4,920 | Repo docs: the "Kaggle Disease Symptom Prediction dataset" (`docs/new/sub4/COVERAGE_REPORT.md:69`). Added in the initial commit `31c900c`, 2026-05-01. | **UNVERIFIED** | Raw input | n/a | No |
| `ml-engine/data/Symptom-severity.csv`, `symptom_Description.csv`, `symptom_precaution.csv` | 2,332 / 11,025 / 3,488 B | 133 / 41 / 41 | Same Kaggle set (`31c900c`) | **UNVERIFIED** | Raw input | n/a | No |
| `ml-engine/data/medicines.csv` (git-ignored, local) | 240,232,659 B | 23,939 | "Retail scrape of an Indian online pharmacy listing" (repo docs) | **UNVERIFIED** | Raw input | n/a | **No** |
| `ml-engine/data/drugs_clean.json` (+ `server/reference-data/` copy) | 999,036 B | 3,000 | from `medicines.csv` | **UNVERIFIED** (inherits) | Script-generated | `ml-engine/preprocess_datasets.py` step 1 (`cd ml-engine && python preprocess_datasets.py`); first commit `31c900c` 2026-05-01. Rebuildable only with the local `medicines.csv`. | No |
| `ml-engine/data/interactions_clean.json` (+ server copy) | 39,310,355 B | 191,541 | from `data/db_drug_interactions.csv`, **which is not in the repository** | **UNVERIFIED** (input origin unknown) | Script-generated | `preprocess_datasets.py` step 2; `31c900c`. **Not rebuildable** (input missing). | No |
| `ml-engine/data/icd10_clean.json` (+ server copy) | 7,428,164 B | 71,704 | from `data/ICD10codes.csv` (not in the repository). Repo docs describe the content as US CDC/CMS ICD-10-CM (a US Government work). | Content stated as public domain; **input file not available to confirm: UNVERIFIED** | Script-generated | `preprocess_datasets.py` step 3; `31c900c`. Not rebuildable (input missing). | No |
| `ml-engine/data_pipeline/raw/symcat_conditions.csv` | 12,660,539 B | 20,576 lines (801 conditions) | SymCAT scraped export via the GitHub mirror `teliov/symcat-to-synthea` (`docs/new/sub4/DATA_SOURCES.md`) | **UNVERIFIED** (upstream SymCAT terms were proprietary) | Raw input | n/a | No |
| `ml-engine/data/disease_symptom_kb.v1.json` | 212,313 B | 174 diseases | `symcat_conditions.csv` + `icd10_clean.json` | **UNVERIFIED** (file says "internal research use, licence unverified") | Script-generated | `ml-engine/data_pipeline/ingest_disease_symptom_kb_v2.py`; `d73e88b` 2026-11-08, updated `d49d2eb` 2026-11-09 | No |
| `ml-engine/data/kb_quarantine.v1.json` | 162,942 B | 136 quarantined | same script (quality filter) | **UNVERIFIED** | Script-generated | `ingest_disease_symptom_kb_v2.py`; `d49d2eb` 2026-11-09 | No |
| `ml-engine/data/unmapped_diseases.v1.json` | 570,575 B | 491 diseases | same script | **UNVERIFIED** | Script-generated | `ingest_disease_symptom_kb.py` / `_v2.py`; `d73e88b` 2026-11-08 | No |
| `ml-engine/data/medicine_safety_limits.json` | 2,956 B | 5 limits | Cites BNF 86 / WHO Model Formulary 2008; every entry has `citationStatus: unverified_owner…` | Values transcribed from formularies; citations unverified | **Hand-curated** (written in `8930ef9` 2026-11-08, edited `d175772` 2026-11-10) | n/a | No |
| `ml-engine/data/srilanka_dengue_weekly.csv` | 86,906 B | 3,432 | **ORIGIN UNKNOWN.** First commit `21726e8` 2026-04-29 ("Initial commit"). No script reads it; it is only named in `.gitignore` and `ml-engine/.dockerignore`. | **UNVERIFIED** | Unknown | ORIGIN UNKNOWN | **No** (as you asked) |
| `server/src/data/districtPopulation2024.json` (+ client copy) | 1,317 B | 25 districts | Department of Census and Statistics, Census of Population and Housing 2012 (file's `source` field: statistics.gov.lk) | File states "DCS Sri Lanka (Open Government Data)"; **not confirmed on the DCS site: UNVERIFIED** | Hand-entered | n/a | No |
| `ml-engine/medisync.db` | 79,306,752 B | 262,971 synthetic `outbreak_tracking` rows; 71,744 ICD rows; 13 feedback rows | `ml-engine/scripts/seed_local_icd10.py` (ICD rows) and `seed_outbreak_data.py` (random counts, `random.uniform`, 90 days) | ICD part inherits **UNVERIFIED**; outbreak rows are synthetic | Script-generated | Scripts above; first commit `31c900c` 2026-05-01 (rebuilt in later commits) | No |
| `docs/demo/SEED_MANIFEST_2026-11-17.json` | 114,653 B | manifest | Synthetic demo seed manifest written by the seed tooling | Project's own (synthetic) | Script-generated | `1a953b1` 2026-11-16 | Optional (not needed for the report) |

## C. Evaluation outputs (project's own work; derived from section A data under its licences)

| File | Size | Generator | Package? |
|---|---|---|---|
| `ml-engine/evaluation/evaluation_results.json` | 3,916,806 B | `ml-engine/evaluation/run_all.py` (`run_outbreak_backtest.py`, `run_symptom_benchmark.py`, `run_ddxplus_benchmark.py`, `run_interaction_benchmark.py`), 2026-11-15 | Yes |
| `docs/report/results_ml_eval.json` | 3,773 B | `scripts/ml_eval/generate_evaluation_package.py`, 2026-11-13 (simulated data) | Yes |
| `docs/report/study/forecast_metrics.csv`, `forecast_predictions.csv`, `detector_sweep.csv` | 1,270 / 104,488 / 2,485 B | `ml-engine/evaluation/study/run_study.py`, 2026-11-16 | Yes |
| `docs/report/study/study_results.json` | 1,082,692 B (< 25 MB) | same | Yes |
| The three report charts | ~0.1 MB each | `report-evidence/scripts/charts.py` (branch `docs/report-evidence`) | Yes |

## Open questions

- **`srilanka_dengue_weekly.csv`:** origin unknown and unused by code. Decide whether to delete it from git or
  document its source.
- **`interactions_clean.json` and `icd10_clean.json`:** their raw inputs (`db_drug_interactions.csv`,
  `ICD10codes.csv`) are not in the repository, so neither can be rebuilt exactly. The ICD content matches the
  repo's description of US ICD-10-CM, but the source file could not be confirmed.
- **Kaggle symptom CSVs:** the exact Kaggle page and licence are not recorded anywhere in the repository.

Last verified: 2026-11-18 at commit f5337833.
