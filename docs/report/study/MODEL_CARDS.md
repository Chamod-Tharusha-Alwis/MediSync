# MediSync model cards (offline study, not in production)

Written by `ml-engine/evaluation/study/write_cards.py` from the results files. Clinical validation: not established for every component. Run date 2026-11-16, code commit `8a836cb`.

## 1. Symptom suggestion engine (production: TF-IDF cosine retrieval, 41 curated + 174 knowledge-base profiles)

| Field | Content |
|---|---|
| Intended use | Suggest candidate conditions from symptom phrases entered by a clinician, for the clinician to accept or reject. |
| Evaluation data | gretelai/symptom_to_diagnosis test split (212 LLM-rewritten rows); DDXPlus test sample (85801 synthetic rows, 11 of 49 pathologies have a profile). |
| Metrics | gretelai: top-1 34.0% (27.8% to 40.6%), top-5 56.1%. DDXPlus: top-1 0.3% (0.3% to 0.4%), top-5 5.9%, macro F1 0.006 (0.6% to 0.7%). |
| Comparison | Best shadow model in this study (logisticRegressionAllFields, 507 multi-hot features, offline study, not in production): DDXPlus top-1 99.6% (99.6% to 99.7%), macro F1 0.997; McNemar vs engine p = 0.0000. |
| Known failures | The vectorizer keeps stop words, so function words drive rankings (Hypoglycemia first on 37 wrong gretelai rows). Similarity scores are not probabilities. |
| Limits | Synthetic or LLM-rewritten benchmark text; partial profile coverage; no real patients; the application sends short phrases, not sentences. |
| Must not be used for | diagnosis, triage decisions, or any use with real patients without clinical validation, ethics approval and regulatory assessment, none of which exists |

## 2. Medicine interaction checker (production: pair lookup in a 191k-pair reference list)

| Field | Content |
|---|---|
| Intended use | Warn a pharmacist or doctor when two entered medicines appear as an interacting pair in the reference list, or when an ingredient cannot be resolved. |
| Evaluation data | 165 drug pairs cited to 36 US FDA labels (PR #47); not re-evaluated in this study. |
| Metrics | sensitivity 82.0% (75.0% to 89.0%), specificity 56.9% (44.6% to 69.2%), precision 80.4%, false-alarm rate 30.8%; 20 pairs unverified. |
| Known failures | 18 missed interactions and 20 false alarms are listed in docs/report/AI_EVALUATION.md. Only 69.0% of catalogue entries resolve to active ingredients; dose limits exist for 5 ingredients. |
| Limits | US labels as the reference; one label's statement defines "non-interacting"; catalogue licence not verified. |
| Must not be used for | diagnosis, triage decisions, or any use with real patients without clinical validation, ethics approval and regulatory assessment, none of which exists; it is not a complete interaction database. |

## 3. Outbreak detector (production: 56-day baseline z-score, 7-day window, 2-day persistence, z > 2.0)

| Field | Content |
|---|---|
| Intended use | Flag a district and disease for public-health review when daily consultation episodes rise above the recent baseline. |
| Evaluation data | OpenDengue Sri Lanka national weekly counts (344 evaluable weeks), one week fed as one detector day: a proxy, not the platform's daily district episodes. |
| Metrics | At the production setting, reference R1: recall 70.0%, false-alarm rate 14.3%, F1 0.551, 1 of 1 outbreak period(s) detected, median delay 0.0 weeks; reference R2: recall 64.8%, false-alarm rate 14.5%, 1 of 2 detected. |
| Comparison | A fixed 95th-percentile threshold on the same proxy reaches F1 0.790 (R1). |
| Known failures | Flags recurring seasonal rises as outbreaks; the detection rate on real outbreaks is unknown (one or two reference periods). |
| Limits | National weekly proxy; reference outbreak definitions are statistical, not epidemiological declarations. |
| Must not be used for | diagnosis, triage decisions, or any use with real patients without clinical validation, ethics approval and regulatory assessment, none of which exists; not a substitute for public-health surveillance. |

## 4. Trend projection (production: least-squares line on the last 14 points, 95% prediction band)

| Field | Content |
|---|---|
| Intended use | Show a descriptive short-range trend line on the surveillance dashboard, labelled as not a validated forecast. |
| Evaluation data | OpenDengue Sri Lanka weekly counts, 130 rolling origins, horizons 1, 2, 4 weeks (one week fed as one day). |
| Metrics | MAE at 1 week 434.2 cases (MASE 1.210) against naive 212.1, ETS 212.1, SARIMA 221.0, Prophet 487.5. At 4 weeks: projection 790.1, naive 504.2, ETS 436.7. |
| Known failures | Worse than repeating the last value at every horizon; the earlier V4 check found its 95% band covered only 52.3% of targets at 4 weeks. |
| Limits | Single national series; a linear trend cannot represent seasonality or epidemic growth. |
| Must not be used for | diagnosis, triage decisions, or any use with real patients without clinical validation, ethics approval and regulatory assessment, none of which exists; not a forecast for planning or resource allocation. |

