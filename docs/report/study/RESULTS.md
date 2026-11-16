# Data science study results (offline study, not in production)

**Clinical validation: not established.** This is an offline study on public data. The shadow models trained here are research artefacts; they are not deployed and nothing in the application changed. Written by `ml-engine/evaluation/study/write_results.py` from `study_results.json` and the CSVs in this folder; `check_results.py` verifies every number below. Code commit `8a836cb`, run date 2026-11-16.

## 1. Every metric and its source file

| Metric | Value (95% CI) | Source file |
|---|---|---|
| A: naive, 1 wk | MAE 212.1 (122.3 to 323.5); RMSE 389.5; MASE 0.591 | forecast_metrics.csv |
| A: seasonalNaive, 1 wk | MAE 831.3 (407.3 to 1514.7); RMSE 1486.3; MASE 2.317 | forecast_metrics.csv |
| A: productionProjection, 1 wk | MAE 434.2 (203.2 to 668.7); RMSE 834.7; MASE 1.210 | forecast_metrics.csv |
| A: ets, 1 wk | MAE 212.1 (120.0 to 311.5); RMSE 371.1; MASE 0.591 | forecast_metrics.csv |
| A: sarima, 1 wk | MAE 221.0 (119.1 to 361.8); RMSE 432.9; MASE 0.616 | forecast_metrics.csv |
| A: prophet, 1 wk | MAE 487.5 (271.6 to 790.4); RMSE 768.9; MASE 1.359 | forecast_metrics.csv |
| A: prophet vs sarima, 1 wk | mean /e/ difference 266.5 (131.7 to 455.6); DM p = 0.0000 | study_results.json (phaseA) |
| A: prophet vs productionProjection, 1 wk | mean /e/ difference 53.2 (-90.6 to 281.2); DM p = 0.4715 | study_results.json (phaseA) |
| A: naive, 2 wk | MAE 304.6 (132.8 to 546.2); RMSE 621.5; MASE 0.849 | forecast_metrics.csv |
| A: seasonalNaive, 2 wk | MAE 864.0 (424.9 to 1510.5); RMSE 1540.4; MASE 2.408 | forecast_metrics.csv |
| A: productionProjection, 2 wk | MAE 562.5 (230.7 to 921.2); RMSE 1064.8; MASE 1.568 | forecast_metrics.csv |
| A: ets, 2 wk | MAE 309.1 (138.9 to 557.6); RMSE 606.5; MASE 0.862 | forecast_metrics.csv |
| A: sarima, 2 wk | MAE 305.8 (129.5 to 560.1); RMSE 656.5; MASE 0.852 | forecast_metrics.csv |
| A: prophet, 2 wk | MAE 591.0 (297.4 to 981.5); RMSE 1013.1; MASE 1.647 | forecast_metrics.csv |
| A: prophet vs sarima, 2 wk | mean /e/ difference 285.2 (128.0 to 478.0); DM p = 0.0000 | study_results.json (phaseA) |
| A: prophet vs productionProjection, 2 wk | mean /e/ difference 28.4 (-150.7 to 298.5); DM p = 0.7843 | study_results.json (phaseA) |
| A: naive, 4 wk | MAE 504.2 (218.6 to 974.0); RMSE 1056.4; MASE 1.405 | forecast_metrics.csv |
| A: seasonalNaive, 4 wk | MAE 862.8 (430.5 to 1569.0); RMSE 1540.3; MASE 2.405 | forecast_metrics.csv |
| A: productionProjection, 4 wk | MAE 790.1 (358.8 to 1328.7); RMSE 1514.1; MASE 2.202 | forecast_metrics.csv |
| A: ets, 4 wk | MAE 436.7 (202.7 to 779.1); RMSE 871.7; MASE 1.217 | forecast_metrics.csv |
| A: sarima, 4 wk | MAE 498.2 (222.5 to 912.6); RMSE 1055.8; MASE 1.389 | forecast_metrics.csv |
| A: prophet, 4 wk | MAE 674.2 (317.2 to 1168.1); RMSE 1202.7; MASE 1.879 | forecast_metrics.csv |
| A: prophet vs sarima, 4 wk | mean /e/ difference 176.0 (-19.1 to 389.9); DM p = 0.1378 | study_results.json (phaseA) |
| A: prophet vs productionProjection, 4 wk | mean /e/ difference -115.9 (-380.6 to 185.1); DM p = 0.4979 | study_results.json (phaseA) |
| B: R1_strict, fixed_p75 | recall 100.0%, false-alarm rate 26.2%, precision 39.4%, F1 0.565, detected 1/1, median delay 0.0 wk | detector_sweep.csv |
| B: R1_strict, fixed_p90 | recall 100.0%, false-alarm rate 10.5%, precision 61.7%, F1 0.763, detected 1/1, median delay 0.0 wk | detector_sweep.csv |
| B: R1_strict, fixed_p95 | recall 98.0%, false-alarm rate 8.5%, precision 66.2%, F1 0.790, detected 1/1, median delay 0.0 wk | detector_sweep.csv |
| B: R1_strict, z1.5_persist | recall 70.0%, false-alarm rate 21.8%, precision 35.4%, F1 0.470, detected 1/1, median delay 0.0 wk | detector_sweep.csv |
| B: R1_strict, z1.5_single | recall 72.0%, false-alarm rate 29.9%, precision 29.0%, F1 0.414, detected 1/1, median delay 0.0 wk | detector_sweep.csv |
| B: R1_strict, z2.0_persist | recall 70.0%, false-alarm rate 14.3%, precision 45.5%, F1 0.551, detected 1/1, median delay 0.0 wk | detector_sweep.csv |
| B: R1_strict, z2.0_single | recall 72.0%, false-alarm rate 19.0%, precision 39.1%, F1 0.507, detected 1/1, median delay 0.0 wk | detector_sweep.csv |
| B: R1_strict, z2.5_persist | recall 58.0%, false-alarm rate 8.8%, precision 52.7%, F1 0.552, detected 1/1, median delay 1.0 wk | detector_sweep.csv |
| B: R1_strict, z2.5_single | recall 68.0%, false-alarm rate 13.3%, precision 46.6%, F1 0.553, detected 1/1, median delay 0.0 wk | detector_sweep.csv |
| B: R1_strict, z3.0_persist | recall 42.0%, false-alarm rate 6.5%, precision 52.5%, F1 0.467, detected 1/1, median delay 2.0 wk | detector_sweep.csv |
| B: R1_strict, z3.0_single | recall 56.0%, false-alarm rate 10.2%, precision 48.3%, F1 0.519, detected 1/1, median delay 1.0 wk | detector_sweep.csv |
| B: R2_moderate, fixed_p75 | recall 100.0%, false-alarm rate 25.2%, precision 42.5%, F1 0.597, detected 2/2, median delay -1.0 wk | detector_sweep.csv |
| B: R2_moderate, fixed_p90 | recall 100.0%, false-alarm rate 9.3%, precision 66.7%, F1 0.800, detected 2/2, median delay 0.0 wk | detector_sweep.csv |
| B: R2_moderate, fixed_p95 | recall 98.1%, false-alarm rate 7.2%, precision 71.6%, F1 0.828, detected 2/2, median delay 0.0 wk | detector_sweep.csv |
| B: R2_moderate, z1.5_persist | recall 70.4%, false-alarm rate 21.0%, precision 38.4%, F1 0.497, detected 2/2, median delay 0.5 wk | detector_sweep.csv |
| B: R2_moderate, z1.5_single | recall 74.1%, false-alarm rate 29.0%, precision 32.3%, F1 0.449, detected 2/2, median delay 0.0 wk | detector_sweep.csv |
| B: R2_moderate, z2.0_persist | recall 64.8%, false-alarm rate 14.5%, precision 45.5%, F1 0.534, detected 1/2, median delay 0.0 wk | detector_sweep.csv |
| B: R2_moderate, z2.0_single | recall 66.7%, false-alarm rate 19.3%, precision 39.1%, F1 0.493, detected 1/2, median delay 0.0 wk | detector_sweep.csv |
| B: R2_moderate, z2.5_persist | recall 53.7%, false-alarm rate 9.0%, precision 52.7%, F1 0.532, detected 1/2, median delay 1.0 wk | detector_sweep.csv |
| B: R2_moderate, z2.5_single | recall 63.0%, false-alarm rate 13.4%, precision 46.6%, F1 0.535, detected 1/2, median delay 0.0 wk | detector_sweep.csv |
| B: R2_moderate, z3.0_persist | recall 38.9%, false-alarm rate 6.6%, precision 52.5%, F1 0.447, detected 1/2, median delay 2.0 wk | detector_sweep.csv |
| B: R2_moderate, z3.0_single | recall 51.9%, false-alarm rate 10.3%, precision 48.3%, F1 0.500, detected 1/2, median delay 1.0 wk | detector_sweep.csv |
| C: linearSvm | top-1 98.1% (98.0% to 98.2%); top-3 100.0%; top-5 100.0%; macro F1 0.983 (98.2% to 98.4%); McNemar vs engine p = 0.0000 | symptom_study_metrics.csv |
| C: logisticRegression | top-1 98.1% (98.0% to 98.2%); top-3 100.0%; top-5 100.0%; macro F1 0.983 (98.2% to 98.3%); Brier 0.027, ECE 0.004; McNemar vs engine p = 0.0000 | symptom_study_metrics.csv |
| C: logisticRegressionAllFields | top-1 99.6% (99.6% to 99.7%); top-3 100.0%; top-5 100.0%; macro F1 0.997 (99.6% to 99.7%); Brier 0.006, ECE 0.001; McNemar vs engine p = 0.0000 | symptom_study_metrics.csv |
| C: majorityClass | top-1 2.3% (2.2% to 2.4%); top-3 7.0%; top-5 11.7%; macro F1 0.001 (0.1% to 0.1%); McNemar vs engine p = 0.0000 | symptom_study_metrics.csv |
| C: naiveBayes | top-1 98.0% (97.9% to 98.1%); top-3 100.0%; top-5 100.0%; macro F1 0.982 (98.1% to 98.2%); Brier 0.033, ECE 0.013; McNemar vs engine p = 0.0000 | symptom_study_metrics.csv |
| C: productionEngine | top-1 0.3% (0.3% to 0.4%); top-3 4.2%; top-5 5.9%; macro F1 0.006 (0.6% to 0.7%) | symptom_study_metrics.csv |
| C: randomForest | top-1 98.0% (97.9% to 98.1%); top-3 100.0%; top-5 100.0%; macro F1 0.982 (98.1% to 98.3%); Brier 0.033, ECE 0.018; McNemar vs engine p = 0.0000 | symptom_study_metrics.csv |

## 2. Plain-language reading

**Phase A (forecasting).** On 130 rolling origins the best 1-week forecaster was ets (MAE 212.1 cases). The production projection had MAE 434.2 at 1 week and 790.1 at 4 weeks, worse than the naive forecast (212.1 and 504.2). Prophet was worse than SARIMA at 1 and 2 weeks (DM p = 0.0000 and 0.0000) and not distinguishable from the production projection at any horizon (DM p = 0.4715 at 1 week). SARIMA order chosen by AIC on the first 156 weeks: (1, 1, 2) x (1, 0, 0, 52). Multi-step forecasts from overlapping windows are serially dependent; about 130 origins; absolute errors are heavy-tailed; a single national series. The Diebold-Mariano test assumes a stationary loss differential, which the 2017 epidemic breaks. Treat both the test and the block-bootstrap interval as rough.

**Phase B (detector).** National weekly counts, one week fed as one detector day, are a proxy for the production detector, which runs on daily consultation episodes per district. This tests the rule, not the platform. The re-implemented rule matched the real function on all 344 evaluable weeks (0 mismatches). At the production setting (z = 2.0 with persistence) the rule flagged 70.0% of strict epidemic weeks with a false-alarm rate of 14.3% (F1 0.551); under the moderate definition it found 1 of 2 outbreak periods. Lowering z raises recall and false alarms together; removing persistence adds false alarms. A fixed 95th-percentile count threshold reached F1 0.790 (strict) and 0.828 (moderate) on the same weeks, higher than any z setting, because this proxy series has strong seasonality that a short baseline window mistakes for outbreaks.

**Phase C (symptom study).** DDXPlus is synthetic and rule-generated from a proprietary knowledge base. High scores reflect the generator and do not imply accuracy on real patients. On 85801 test rows (49 pathologies, 11 with a MediSync profile), the production engine reached top-1 0.3% and macro F1 0.006. Shadow models trained on 382 multi-hot symptom features (the same information the engine receives) reached top-1 naiveBayes 98.0%, logisticRegression 98.1%, linearSvm 98.1%, randomForest 98.0%; logistic regression with all 507 structured fields reached 99.6%. The best model by macro F1 was logisticRegressionAllFields (0.997; McNemar vs engine p = 0.0000). The gap shows that the retrieval design discards most of the signal in structured evidence; it does not show accuracy on real patients, because the data come from a rule-based generator.

Most confused pairs for the best model: Acute rhinosinusitis predicted as Chronic rhinosinusitis (248 rows, 13.6% of that class); Unstable angina predicted as Stable angina (30 rows, 1.5% of that class); Chronic rhinosinusitis predicted as Acute rhinosinusitis (19 rows, 0.9% of that class); Viral pharyngitis predicted as Acute laryngitis (7 rows, 0.4% of that class); Acute laryngitis predicted as Viral pharyngitis (1 rows, 0.1% of that class).

Top permutation-importance features for logisticRegressionAllFields (4912 validation rows, 5 repeats): AGE (0.006); Do you have a fever (either felt or measured with a thermometer)? (0.004); Are your vaccinations up to date? (0.003); Are you feeling nauseous or do you feel like vomiting? (0.003); Have you had significantly increased sweating? (0.003).

## 3. Allowed and not allowed claims

**Allowed:**

- On public Sri Lanka dengue counts, the production trend projection was less accurate than a naive last-value forecast at 1, 2 and 4 weeks (offline study, not in production).
- Prophet did not improve on SARIMA or on the production projection for this series.
- The production outbreak rule, applied to national weekly counts as a proxy, flagged 70.0% of strict epidemic weeks with a 14.3% false-alarm rate.
- On synthetic DDXPlus data, supervised models trained on the same symptom information outperform the production retrieval engine (best macro F1 0.997 vs 0.006).
- The shadow models are research artefacts: offline study, not in production.

**Not allowed:**

- Any statement that a MediSync component is validated for clinical use, fit for patient care, safe, or approved.
- Reading DDXPlus scores as diagnostic accuracy on real patients; the data are rule-generated.
- Reading the detector proxy results as the detection rate of the production detector on district daily data.
- Generalising the forecast results beyond one national series of one disease.
- Describing the shadow models as part of the product.

## 4. Limitations

- No real patients, no clinician review, no ethics approval, no prospective study, no regulatory assessment.
- Phase A: one country, one disease, 130 overlapping origins; the 2017 epidemic dominates the errors; SARIMA order was selected once.
- Phase B: national weekly counts stand in for daily district episodes; the reference outbreak definitions are statistical rules written for this study.
- Phase C: DDXPlus is synthetic; samples are capped per class (train 3000, validation 600, test 2000 rows); the production engine has profiles for only 11 of 49 pathologies; template sharing between synthetic patients makes bootstrap intervals too narrow.
- Phase E: the existing jest integrity test was not extended, because the hard rules forbid editing tests and limit the diff to the study folders; `check_results.py` performs the equivalent check inside `run_study.py` instead.

## 5. Deviations from PROTOCOL.md

| Date | What changed | Why |
|---|---|---|
| 2026-11-16 | Phase C model fitting, scoring and permutation importance run under the system Python (scikit-learn 1.9.0) instead of the project venv (scikit-learn 1.9.1); Phase C figures are drawn by a separate venv script. | The venv cannot import sklearn.ensemble or sklearn.inspection on this machine (a compiled extension is blocked by an Application Control policy), which was found when the first Phase C run failed at the random-forest step. Phases A, B, D and E are unchanged. |

## 6. Reproduce

```
ml-engine/.venv/Scripts/python.exe ml-engine/evaluation/study/run_study.py --offline
```
Library versions: Python 3.14.6, numpy 2.5.1, pandas 3.0.3, scipy 1.18.0, scikit-learn 1.9.0, statsmodels not installed, prophet not installed, cmdstanpy not installed, matplotlib not installed. The command prints the SHA-256 of every CSV and PNG; two consecutive runs must match.

