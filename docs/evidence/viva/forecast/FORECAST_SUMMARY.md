# Prophet vs SARIMA: paired tests on the rolling-origin backtest (not McNemar)

- Command: `ml-engine/.venv/Scripts/python.exe ml-engine/evaluation/forecast_paired_tests.py`
- Run: 2026-11-25 11:15:14 +0530, exit 0. Raw output: `forecast_run_console.txt`, `forecast_paired_tests.json`.
- Input: `docs/report/study/forecast_predictions.csv`, the rolling-origin forecasts of the existing study (2026-11-16) on the real
  OpenDengue Sri Lanka weekly series. **The models were not refitted today**: Windows Application Control blocks the SciPy DLLs.
  Only the paired tests are new. The published MAE, RMSE and origin counts (18 rows) and 3 Diebold-Mariano statistics were
  reproduced first.
- **Plain (non-seasonal) ARIMA: not evaluated.** Only SARIMA exists in the study code.

| Horizon (origins) | Error | Last value | Seasonal-naive | SARIMA | ETS | Prophet | Production projection |
|---|---|---|---|---|---|---|---|
| 1 week (125) | MAE / RMSE | 212.1 / 389.5 | 831.3 / 1486.3 | 221.0 / 432.9 | 212.1 / 371.1 | 487.5 / 768.9 | 434.2 / 834.7 |
| 2 weeks (126) | MAE / RMSE | 304.6 / 621.5 | 864.0 / 1540.4 | 305.8 / 656.5 | 309.1 / 606.5 | 591.0 / 1013.1 | 562.5 / 1064.8 |
| 4 weeks (126) | MAE / RMSE | 504.2 / 1056.4 | 862.8 / 1540.3 | 498.2 / 1055.8 | 436.7 / 871.7 | 674.2 / 1202.7 | 790.1 / 1514.1 |

Holm-corrected p over 21 comparisons per test. A positive difference means the first model has the larger error.

| Comparison | Horizon | Mean absolute-error difference | Wilcoxon | Diebold-Mariano |
|---|---|---|---|---|
| Prophet − SARIMA | 1 / 2 / 4 | +266.5 / +285.2 / +176.0 | 1.7e-9 / 1.8e-7 / 0.0056 | 2.3e-7 / 0.0005 / 0.83 |
| Prophet − last value | 1 / 2 / 4 | +275.3 / +286.4 / +170.0 | 1.7e-8 / 1.4e-7 / 0.0056 | 4.0e-7 / 0.0006 / 0.83 |
| Prophet − seasonal-naive | 1 / 2 / 4 | −343.8 / −273.1 / −188.6 | 5.9e-9 / 5.9e-8 / 5.6e-6 | 2.8e-5 / 0.0038 / 0.19 |
| SARIMA − last value | 1 / 2 / 4 | +8.8 / +1.2 / −6.0 | 0.42 / 0.45 / 0.45 | 1 / 1 / 1 |
| SARIMA − seasonal-naive | 1 / 2 / 4 | −610.3 / −558.2 / −364.6 | 1.2e-16 / 8.7e-16 / 5.2e-7 | 8.8e-10 / 9.7e-6 / 0.060 |
| Production projection − last value | 1 / 2 / 4 | +222.1 / +258.0 / +285.9 | 8.1e-8 / 1.8e-7 / 4.2e-8 | 0.0001 / 0.0006 / 0.0083 |
| Production projection − seasonal-naive | 1 / 2 / 4 | −397.1 / −301.5 / −72.7 | 1.9e-5 / 0.0007 / 0.45 | 0.0010 / 0.12 / 1 |

**In plain words.**
- Prophet's error is larger than SARIMA's at 1 and 2 weeks (both tests). At 4 weeks only Wilcoxon finds a difference.
- SARIMA is not detectably different from simply repeating the last value. That is not proof that they are equal.
- Prophet beats seasonal-naive at 1 and 2 weeks in both tests, but is worse than the last value.
- **The production projection is also worse than the last value at every horizon** in this weekly proxy. The live feature is a
  72-hour projection on daily district counts, which this does not test.

**Limits.** Forecast origins overlap and are dependent, so the Wilcoxon p-values are too small. Diebold-Mariano allows only
short-range dependence and assumes a stationary loss difference, which the 2017 epidemic breaks. One disease, one national
series. SciPy could not be loaded, so both tests are implemented in the script; Wilcoxon is cross-checked with 20,000
sign flips (the smallest p-value that check can show is 0.00005). Clinical validation: not established.
