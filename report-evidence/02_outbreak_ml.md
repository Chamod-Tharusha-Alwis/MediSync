# 02 Outbreak prediction system: evidence

Scope: the outbreak detector, the 72-hour projection and the trend projection come first. The symptom
matcher and the medicine checker are sub-modules and are covered in section 6.

**Method:** no model was retrained or changed. Every number below is read from the saved outputs that the
repository's own evaluation scripts wrote. I did not re-run those scripts, because re-running writes into
tracked files (`ml-engine/evaluation/evaluation_results.json`, `docs/report/study/*`), and this task is
read-only outside `report-evidence/`. The chart script, `report-evidence/scripts/charts.py`, only reads those
files. Section 7 has the re-run commands if you want fresh copies.

**Clinical validation:** every saved output carries `"clinicalValidation": "not_established"`.

## 1. Experiments in the repository

| # | Experiment | Script | Dataset | Size | Date range of data | Run date / commit (from the output file) |
|---|---|---|---|---|---|---|
| E1 | Detector on simulated outbreaks, with an ablation of each gate | `scripts/ml_eval/evaluate_outbreak_detector.py` (driven by `scripts/ml_eval/generate_evaluation_package.py`) | Synthetic daily series, seed 42 | 1,200 series × 60 days (600 with an injected outbreak, 600 without) | simulated | 2026-11-13, commit `ead70e5` → `docs/report/results_ml_eval.json` |
| E2 | Trend projection (OLS) vs naive, simulated | `scripts/ml_eval/backtest_projection.py` | Synthetic daily series, seed 42 | 200 series × 60 days | simulated | 2026-11-13, commit `ead70e5` → `docs/report/results_ml_eval.json` (`projection_backtest`) |
| E3 | Detector and 72-hour-style projection back-test on real public counts | `ml-engine/evaluation/run_outbreak_backtest.py` (protocol frozen before the first run: `outbreak_backtest_protocol.json`) | OpenDengue national extract V1.3.1, Sri Lanka weekly rows (455 rows; CC BY 4.0) | segment 0: 418 weeks (344 evaluable for the detector); segment 1: 51 weeks; projection: 354 origins | 2010-01-03 to 2017-12-31, and 2019-01-06 to 2019-12-22 | 2026-11-15, commit `6508b18` → `ml-engine/evaluation/evaluation_results.json` (`outbreakBacktest`) |
| E4 | Forecast benchmark: product projection vs naive, seasonal naive, ETS, SARIMA, Prophet (Phase A) | `ml-engine/evaluation/study/forecast_benchmark.py` | OpenDengue, the same Sri Lanka weekly series | 125 origins (1 week), 126 (2 and 4 weeks) | same as E3 | 2026-11-16, commit `1ba1850` → `docs/report/study/forecast_metrics.csv` |
| E5 | Detector sweep: z thresholds, persistence on/off, fixed 75/90/95th-percentile thresholds (Phase B) | `ml-engine/evaluation/study/detector_sweep.py` | OpenDengue, same series | 344 evaluable weeks | same as E3 | 2026-11-16, commit `1ba1850` → `docs/report/study/detector_sweep.csv` |

E3 runs the real detector function (`evaluateOutbreakCriteria`, snippet S1) through
`ml-engine/evaluation/outbreak_bridge.cjs`. One weekly count is fed as one detector "day": a change of time
scale, so it tests the rule, not the platform.

## 2. Detector performance

### 2a. Simulated set (E1, 1,200 series)

Source: `docs/report/results_ml_eval.json` → `outbreak_detector_simulation`.

| Detector | TP | FP | TN | FN | Sensitivity | Specificity | Precision | F1 | False alarms / year |
|---|---|---|---|---|---|---|---|---|---|
| **MediSync (floor N≥5 + 2-day persistence)** | 359 | 91 | 509 | 241 | **59.8%** (95% CI 55.5-63.6) | **84.8%** (81.8-87.5) | 79.8% | 0.684 | 0.92 |
| Ablation: raw EARS C2 | 600 | 598 | 2 | 0 | 100% | 0.3% | 50.1% | 0.667 | 6.06 |
| Ablation: floor only | 600 | 594 | 6 | 0 | 100% | 1.0% | 50.3% | 0.669 | 6.02 |
| Ablation: persistence only | 367 | 106 | 494 | 233 | 61.2% | 82.3% | 77.6% | 0.684 | 1.07 |

Also from the same output: median detection delay 1.0 day (IQR 1-1), ROC AUC 0.588.

**There is no fixed 95th-percentile baseline for the simulated set.** E1 compares only against the ablations
above (DISCREPANCY D-2).

### 2b. OpenDengue weekly national series (E3 and E5, 344 evaluated weeks)

- MediSync detector row: from `ml-engine/evaluation/evaluation_results.json` → `outbreakBacktest.detector`.
- Fixed-threshold rows: from `docs/report/study/detector_sweep.csv`.
- The fixed threshold is the percentile of the weeks **before** the first evaluated week (out of sample;
  `detector_sweep.py:98`), i.e. 1,370.3 cases for p95.
- Specificity = 1 - false-alarm rate.

| Reference definition | Detector | TP | FP | TN | FN | Sensitivity | Specificity | Precision | F1 | Outbreak periods detected | False-alarm episodes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Strict (R1, ≥2 SD, 50 epidemic weeks) | **MediSync z>2.0 + persistence** | 35 | 42 | 252 | 15 | **70.0%** (95% CI 36.0-100) | **85.7%** (74.5-93.9) | **45.5%** (9.1-81.8) | 0.551 | 1 / 1 (delay 0 weeks) | **5** (2012-01-15, 2012-06-17, 2014-05-25, 2016-01-31, 2016-07-03) |
| Strict (R1) | Fixed 95th percentile | 49 | 25 | 269 | 1 | 98.0% | 91.5% | 66.2% | 0.790 | 1 / 1 | not computed for fixed thresholds |
| Moderate (R2) | MediSync z>2.0 + persistence | 35 | 42 | 248 | 19 | 64.8% | 85.5% | 45.5% | 0.534 | 1 / 2 | not computed |
| Moderate (R2) | Fixed 95th percentile | 53 | 21 | 269 | 1 | 98.1% | 92.8% | 71.6% | 0.828 | 2 / 2 | not computed |

The re-implemented rule in E5 matched the real function on all 344 weeks (0 mismatches;
`docs/report/study/RESULTS.md`, Phase B).

## 3. Forecast error (MAE, cases per week), OpenDengue

### 3a. All methods on the same origins (E4, Phase A)

Source: `docs/report/study/forecast_metrics.csv`; the 95% CIs are in the same file.

| Method | 1 week (125 origins) | 2 weeks (126) | 4 weeks (126) |
|---|---|---|---|
| **Product projection** | **434.2** | **562.5** | **790.1** |
| Last value (naive) | 212.1 | 304.6 | 504.2 |
| Seasonal naive | 831.3 | 864.0 | 862.8 |
| ETS | 212.1 | 309.1 | 436.7 |
| SARIMA (1,1,2)×(1,0,0,52) | 221.0 | 305.8 | 498.2 |
| Prophet (offline only) | 487.5 | 591.0 | 674.2 |

### 3b. 72-hour-style projection vs last value (E3; a different and larger origin set)

Source: `evaluation_results.json` → `outbreakBacktest.projection.byHorizon`; 354 origins.

| Method | 1 week | 2 weeks | 4 weeks |
|---|---|---|---|
| **Projection** | **346.2** (95% CI 202.0-549.0) | **449.1** (263.1-683.7) | **675.9** (399.0-1073.3) |
| Last value | 184.8 (119.4-273.8) | 253.5 (153.1-404.2) | 408.9 (232.7-688.6) |
| Seasonal naive | 704.4 | 704.4 | 704.4 |
| Interval coverage (nominal 95%) | 83.6% | 72.0% | 52.3% |

E3 and E4 give **different projection MAEs** for the same horizon (346 vs 434 at 1 week). They use different
origin sets (354 vs 125), so quote the experiment with each number (D-5).

## 4. Charts (`report-evidence/charts/`, 1600 × 900, drawn by `scripts/charts.py`)

**`detector_on_opendengue.png`**
- **What it shows:** Sri Lanka's weekly dengue counts for 2011-2017 (black line). Blue circles are the 50 weeks
  the reference rule calls epidemic; red triangles are the 77 weeks the MediSync rule flagged.
- **What it means:** the rule catches the 2017 epidemic from its first week and flags 35 of the 50 epidemic
  weeks (70%). It also fires on five smaller seasonal rises in 2012, 2014 and 2016 that the reference does not
  count as outbreaks.
- **Limit:** this is a national weekly series fed as if each week were one day, so it tests the rule's logic,
  not how the live system behaves on daily district data.

**`forecast_error_by_method.png`**
- **What it shows:** mean absolute error of six forecasting methods at 1, 2 and 4 weeks ahead, on the same
  125-126 rolling origins.
- **What it means:** the simple "repeat the last value" forecast, ETS and SARIMA are the most accurate. The
  product projection has roughly double their error, and Prophet does not beat SARIMA. This is why the product
  presents its numbers as a projection, not a forecast.
- **Limit:** one disease in one country, with errors dominated by the 2017 epidemic, and overlapping origins,
  so the intervals are rough.

**`detector_vs_fixed_threshold.png`**
- **What it shows:** sensitivity, specificity and F1 of the MediSync rule next to a fixed 95th-percentile count
  threshold, under the strict and moderate outbreak definitions.
- **What it means:** on this strongly seasonal national series, the fixed threshold scores higher on all three
  measures (F1 0.79 vs 0.55 strict). That is because the detector's short 56-unit baseline mistakes seasonal
  rises for outbreaks.
- **Limit:** a fixed threshold needs a long history of the same series and cannot adapt to a district with
  little data, which is the case the z-score rule was designed for. Both are tested here only on a proxy series.

## 5. DISCREPANCIES against the report values

| # | Report value | Measured / saved value | Source | Status |
|---|---|---|---|---|
| D-1 | Sensitivity 59.8%, specificity 84.8% (simulated) | 0.5983 and 0.8483 | `docs/report/results_ml_eval.json` | **Matches** |
| D-2 | "Against the fixed 95th-percentile baseline" for the simulated set | E1 has **no** fixed-threshold baseline; it compares only with raw EARS C2, floor only and persistence only | same file | **Not available**: the report should not claim a p95 comparison on the simulated set |
| D-3 | OpenDengue: 70% / 85.7% / precision 45.5% / 5 false-alarm episodes | 0.70 / 0.857143 / 0.454545 / 5 | `evaluation_results.json` | **Matches** |
| D-4 | Projection MAE 346 / 449 / 676 vs last value 185 / 253 / 409 | 346.2 / 449.1 / 675.9 vs 184.8 / 253.5 / 408.9 | `evaluation_results.json` (E3, 354 origins) | **Matches** (rounded) |
| D-5 | One-week MAE: naive 212, ETS 212, SARIMA 221, projection 434, Prophet 487 | 212.1, 212.1, 221.0, 434.2, 487.5 | `forecast_metrics.csv` (E4, 125 origins) | **Matches**. But the report quotes **two different 1-week projection MAEs (346 and 434)** from two experiments with different origin sets. Say which experiment each comes from. |
| D-6 | "Trend projection with prediction interval (statsmodels OLS)" | The product trend projection is a hand-written OLS in JavaScript (`client/src/utils/outbreakForecasting.js:301-397`); statsmodels appears only in the offline study (SARIMA/ETS) | code search | **Mismatch in wording**: do not say the product uses statsmodels |
| D-7 | n/a | `docs/report/study/RESULTS.md` says "130 rolling origins", but `forecast_metrics.csv` lists 125 (1 week) and 126 (2 and 4 weeks) | both files | **Internal inconsistency** in the study write-up; use 125/126 |
| D-8 | n/a | `RESULTS.md` section 6 says "statsmodels not installed, prophet not installed, matplotlib not installed" for the recorded environment, yet the Phase A table contains SARIMA, ETS and Prophet results | `RESULTS.md` | **Internal inconsistency**: the library list was probably recorded from the system Python used for Phase C, not the venv used for Phase A. Check before quoting the versions. |

## 6. Sub-module numbers

These are **sub-modules**, separate from the outbreak system. From `evaluation_results.json`, run 2026-11-15.

| Sub-module | Dataset | Rows / pairs | Metric | Value (95% CI) |
|---|---|---|---|---|
| Symptom matcher (TF-IDF + cosine) | gretelai/symptom_to_diagnosis test split | 212 | Top-1 accuracy | 34.0% (27.8-40.6) |
| Symptom matcher | same | 212 | Top-3 accuracy | 47.6% |
| Symptom matcher | DDXPlus test sample (synthetic) | 2,916 | Top-1 accuracy, all rows | 1.1% (0.7-1.5) |
| Symptom matcher | DDXPlus, rows with a MediSync profile | 636 | Top-1 accuracy | 4.9% (3.3-6.6) |
| Medicine (interaction) checker | Reference pairs from cited drug labels (V0 + V3) | 165 pairs (100 interacting, 65 not) | Sensitivity | 82.0% (75.0-89.0) |
| Medicine checker | same | 165 | Specificity | 56.9% (44.6-69.2) |
| Medicine checker | same | 165 | Precision | 80.4% (72.5-88.2) |

Unverified pairs count against the checker (`interactionBenchmark.metrics.rule`). On resolved pairs only, the
values are sensitivity 93.2% and specificity 64.9%.

## 7. Re-run commands

```
ml-engine/.venv/Scripts/python.exe scripts/ml_eval/generate_evaluation_package.py         # E1, E2 (writes docs/report/results_ml_eval.json)
ml-engine/.venv/Scripts/python.exe ml-engine/evaluation/run_outbreak_backtest.py          # E3 (writes ml-engine/evaluation/evaluation_results.json)
ml-engine/.venv/Scripts/python.exe ml-engine/evaluation/study/run_study.py --offline      # E4, E5 (writes docs/report/study/)
ml-engine/.venv/Scripts/python.exe report-evidence/scripts/charts.py                     # charts only (read-only on inputs)
```

The first three overwrite tracked files, so run them on a scratch branch and compare with `git diff`.
