# MediSync Data Science Study: Protocol

**Offline study, not in production.** Nothing here changes the deployed application. Shadow models trained in this study are research artefacts only. Clinical validation of any MediSync component is not established and is not claimed.

Written and committed on 2026-11-16 **before any model was run on test data**. Any later change is recorded in the "Deviations" section of `RESULTS.md` with a date and a reason.

## 0. Common rules

- Code: `ml-engine/evaluation/study/` only. Outputs: `docs/report/study/` and `ml-engine/evaluation/data/` only.
- One command reruns everything: `python ml-engine/evaluation/study/run_study.py` (project venv Python, Node on PATH).
- Seeds: every random choice uses `numpy.random.default_rng(SEED)` with `SEED = 20261116`, plus the per-model seeds listed below.
- Confidence intervals: 95% percentile bootstrap, 2,000 resamples. Independent rows (DDXPlus) use the plain bootstrap; time-ordered rows (OpenDengue) use the moving-block bootstrap with block length 13 weeks.
- Rounding: results files keep 6 decimal places; reports show 1 decimal place for percentages and 3 for scores.
- Library versions (project venv): Python 3.14.6, numpy 2.5.4, pandas 3.0.6, scipy 1.18.1, scikit-learn 1.9.1, statsmodels 0.15.0, prophet 1.5.0, cmdstanpy 1.3.0, matplotlib 3.11.2, Flask 3.1.3; Node v26.4.0 for the production projection and detector bridge. `statsmodels.tsa.holtwinters` cannot be imported on this machine (a compiled extension is blocked), so ETS uses `statsmodels.tsa.exponential_smoothing.ets.ETSModel`.
- Datasets: public only, recorded in `ml-engine/evaluation/data/manifest.json` (name, URL, licence read from the publisher, download date, SHA-256, rows). DDXPlus train and validation splits are downloaded by `study/fetch_study_data.py` and added to the same manifest; they were not part of PR #47.

## Phase A: forecast benchmark (OpenDengue, Sri Lanka)

**Series.** OpenDengue V1.3.1 national extract, rows with `adm_0_name = SRI LANKA`, `T_res = Week`, `S_res = Admin0`: weekly dengue case totals, weeks starting Sunday, 2010-01-03 to 2019-12-22 (455 reported weeks). Gap rule (same as the V4 evaluation): a run of at most 3 missing weeks is filled by linear interpolation and marked imputed; a longer gap splits the series. This gives segment 0 (2010-01-03 to 2017-12-31, 418 weeks, 13 imputed) and segment 1 (2019, 51 weeks). **Only segment 0 is used**; segment 1 is too short for a 52-week seasonal model. Imputed weeks may be model inputs but are never forecast targets.

**Split.** Time-ordered, no shuffling. The first 156 weeks (3 years) are the initial training window. Forecast origins are weeks `t = 155, 157, 159, ...` (every second week, expanding window) up to the last origin for which `t + 4` exists. At every origin each model is fitted on weeks `0..t` only and forecasts weeks `t+1`, `t+2`, `t+4`. A (origin, horizon) pair is scored only when the target week is observed (not imputed).

**Models** (all fitted at every origin on the training window only):
1. Naive: forecast = count at week `t`.
2. Seasonal naive: forecast = count at week `t + h - 52`.
3. Production projection: `calculate14DayForecast` from `server/src/utils/outbreakForecasting.js`, called unchanged through `ml-engine/evaluation/outbreak_bridge.cjs` on the last 14 training weeks with `forecastDays = 4` (one week fed as one "day", as in V4).
4. ETS: `ETSModel(log1p(y), error='add', trend='add', damped_trend=True, seasonal='add', seasonal_periods=52)`; forecast = `expm1(point forecast)`, floored at 0.
5. SARIMA: `SARIMAX(log1p(y), order=(p,d,q), seasonal_order=(P,D,Q,52))`. **Order selection:** once, by lowest AIC on the initial 156-week training window only, over the grid `p ∈ {0,1,2}, d ∈ {0,1}, q ∈ {0,1,2}, (P,D,Q) ∈ {(0,0,0),(1,0,0),(0,1,0),(0,1,1)}` (72 fits). The chosen order is then fixed and the model is refitted at every origin. Forecast = `expm1(point forecast)`, floored at 0.
6. Prophet: `Prophet(growth='linear', yearly_seasonality=True, weekly_seasonality=False, daily_seasonality=False, seasonality_mode='multiplicative', changepoint_prior_scale=0.05, interval_width=0.95)` on raw counts with `ds` = week start; forecasts floored at 0. cmdstan is deterministic given the data; `uncertainty_samples` is not used for point forecasts.

**Metrics** per horizon: MAE, RMSE, and MASE = MAE / scale, where scale = mean absolute 52-week seasonal difference over the weeks before the first origin (weeks 52..155), fixed once. Block-bootstrap 95% CI on MAE.

**Paired comparisons:** Prophet vs SARIMA and Prophet vs the production projection, per horizon, on the absolute-error differential: (a) Diebold-Mariano statistic with Newey-West (HAC) variance using lag `h - 1`; (b) moving-block bootstrap CI on the mean differential. Limits to be stated: overlapping multi-step forecasts, about 130 origins, non-normal errors, one country.

**Outputs:** `docs/report/study/forecast_metrics.csv`, `forecast_predictions.csv` (one row per origin, horizon, model), `forecast_vs_actual.png` (horizon 1 and 4).

## Phase B: outbreak detector sweep

**Proxy statement.** The production detector runs on daily consultation episodes per district. This phase feeds national weekly counts, one week as one detector "day", with a 56-week baseline and a 7-week window. It is a proxy for the algorithm's behaviour, not a test of the platform.

**Reference outbreak weeks** (defined here, before running): for each observed week in segment 0, compare its count with the counts of the same ISO week ± 2 weeks in every *other* year of the segment. Two definitions are scored:
- R1 (strict): count > mean + 2 SD of those counts; an outbreak period is a run of at least 2 consecutive epidemic weeks.
- R2 (moderate): count > mean + 1 SD; period = at least 2 consecutive weeks.
Weeks with fewer than 2 comparison values are not scored.

**Detector logic.** The production rule from `evaluateOutbreakCriteria` (56-unit baseline mean and sample SD; if SD < 0.5 then SD = max(0.5, sqrt(mean)), and if mean = 0 then mean = 0.1 and SD = 0.5; floor of 5 cases in the 7-unit window; daily z = (count - mean) / SD; persistence = at least 2 consecutive window units with z > threshold and count > 0) is re-implemented in `study/detector_sweep.py` so that the threshold can vary. **Check:** at z = 2.0 with persistence, the re-implementation must reproduce the flags of the real function (through the bridge) on every evaluated week; the run stops otherwise.

**Sweep:** z ∈ {1.5, 2.0, 2.5, 3.0} × persistence {on, off} (off = any window unit with z > threshold and count > 0 flags the week). Fixed-threshold baselines: flag the week when its count exceeds the 75th, 90th or 95th percentile of the counts in weeks 0..62 (the first baseline+window span, before any week is evaluated).

**Scoring** on evaluated weeks (62..417, observed, scored by the reference): confusion counts, precision, recall, F1, false-alarm rate = FP / (FP + TN), and detection delay in weeks for each reference period = first flagged week within [start - 2, end] minus start (reported per period and as a median). Flags on weeks 60 and 61 are allowed as early detections.

**Outputs:** `detector_sweep.csv` (one row per configuration × reference definition), `detector_tradeoff.png` (recall vs false-alarm rate).

## Phase C: supervised symptom-to-diagnosis study (DDXPlus)

**Data.** DDXPlus English release (figshare 10.6084/m9.figshare.20043374, CC BY 4.0), official splits: `release_train_patients` (1,025,602 rows), `release_validate_patients` (132,448), `release_test_patients` (134,529), 49 pathologies. **DDXPlus is synthetic and rule-generated** from a proprietary knowledge base; scores reflect that generator and do not indicate accuracy on real patients.

**Samples** (stratified by pathology, `default_rng(SEED)`, in file order, drawn once): train up to 3,000 rows per pathology; validation up to 600 per pathology; test up to 2,000 per pathology. The test sample is scored once per final model.

**Features.** Two sets, both multi-hot:
- S (symptoms only, the information the production engine receives): one binary column per symptom evidence (`is_antecedent = false`); for categorical and multi-choice evidences, one column per (evidence, value) pair present in the training sample.
- S+A (all structured fields): S plus one column per antecedent evidence and (evidence, value) pair, plus AGE (integer, standardised for the linear models) and SEX (binary).
Columns are defined on the training sample only; values unseen in training are ignored. Feature counts are recorded.

**Models.**
1. Majority class (train sample).
2. Production engine: `/api/ml/predict-disease` called unchanged, input built by the V1 rule (`ddxplus_protocol.json`: English symptom phrases, antecedents excluded), top-5 ranked profiles mapped with the frozen `ddxplus_label_mapping.json`. Scored on all rows; a row whose pathology has no MediSync profile counts as wrong (coverage is reported separately).
3. Multinomial Naive Bayes, feature set S. Grid: `alpha ∈ {0.01, 0.1, 1.0}`.
4. Logistic regression (multinomial, `lbfgs`, `max_iter = 2000`, `random_state = 0`), feature set S. Grid: `C ∈ {0.1, 1.0, 10.0}`.
5. Linear SVM (`LinearSVC`, `random_state = 0`, `max_iter = 5000`), feature set S. Grid: `C ∈ {0.01, 0.1, 1.0}`. Ranking by decision function; no probabilities.
6. Random forest (`n_estimators = 300`, `random_state = 0`, `n_jobs = 1`), feature set S. Grid: `max_depth ∈ {None, 20}`, `min_samples_leaf ∈ {1, 5}`.
7. Logistic regression, feature set S+A, same grid, to show the value of the fields the production engine does not use.

**Selection:** every grid point is fitted on the train sample and scored on the validation sample; the point with the highest macro F1 is chosen. The test sample is then scored once with that point. Trained models predict all 49 pathologies.

**Metrics on the test sample:** top-1, top-3, top-5 accuracy, macro F1, per-class precision and recall; 95% bootstrap CIs (2,000 resamples, `default_rng(SEED)`). McNemar test (exact binomial on the discordant pairs) of each model's top-1 correctness against the production engine's, on the same rows.

**Calibration** (models with `predict_proba`: NB, both LR, RF): reliability curve of the top-1 probability in 10 equal-width bins, multiclass Brier score (mean over rows of the sum of squared differences between the probability vector and the one-hot label), ECE on the top-1 probability.

**Explainability:** permutation importance (`sklearn.inspection.permutation_importance`, `scoring = macro F1`, 5 repeats, `random_state = 0`) for the best model by test macro F1, computed on a 5,000-row stratified subsample of the **validation** sample (the test sample is not reused). Top 15 features reported by evidence question text. Error analysis: the five most frequent (true, predicted) pairs with true ≠ predicted for the best model on the test sample.

**Outputs:** `ddxplus_eda.csv` and `ddxplus_eda.png` (class balance, evidences per patient, missing values); `symptom_study_metrics.csv`; `symptom_model_comparison.png`; `symptom_calibration.png`; `symptom_feature_importance.png`; `symptom_confusion_pairs.csv`.

## Phase D: model cards and data sheet

`MODEL_CARDS.md` (symptom engine, medicine checker, outbreak detector, trend projection) and `DATA_SHEET.md` are written by `study/write_cards.py` from `study_results.json` (this study) and `ml-engine/evaluation/evaluation_results.json` (PR #47, for the medicine checker and the gretelai figures). No number is typed by hand.

## Phase E: reproducibility and integrity

`run_study.py` runs fetch, A, B, C, D, `RESULTS.md` and `check_results.py`. Two consecutive runs must give byte-identical CSVs (SHA-256 printed). `check_results.py` fails the run if any number in `RESULTS.md` is absent from the results files, or if a forbidden phrase appears in any study output. The existing jest integrity test is **not** edited, because the hard rules forbid editing tests and limit the diff to the study folders; this is reported as a limitation.
