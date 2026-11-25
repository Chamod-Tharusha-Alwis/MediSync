# McNemar: MediSync outbreak rule vs fixed 95th-percentile threshold

- Command: `ml-engine/.venv/Scripts/python.exe ml-engine/evaluation/mcnemar_detector_vs_threshold.py`
- Run: 2026-11-25 11:14:07 to 11:14:10 +0530, exit 0, code at `fd71d33`. Nothing retrained, no label rule changed.
- Raw output: `mcnemar_run_console.txt`, `mcnemar_detector_vs_threshold.json` (per-week truth, detector and threshold result for every week).
- Data: the same 344 OpenDengue Sri Lanka weeks and labels as the report. Detector flags come from the real JavaScript rule
  (`evaluateOutbreakCriteria`). Threshold: more than 1,370.3 cases (95th percentile of the 62 weeks before the first evaluated week).

**Step 1, reproduce the report (strict reference): matched exactly.** The script stops if any figure differs.

| | TP | FN | FP | TN | Sensitivity | Specificity | Precision | Accuracy |
|---|---|---|---|---|---|---|---|---|
| MediSync rule | 35 | 15 | 42 | 252 | 70.0 % | 85.7 % | 45.5 % | 83.4 % |
| Fixed threshold | 49 | 1 | 25 | 269 | 98.0 % | 91.5 % | 66.2 % | 92.4 % |

**Step 2, exact McNemar** (b = detector right, threshold wrong; c = detector wrong, threshold right)

| Reference | Weeks | n | b | c | Exact p | Difference in proportion correct (detector − threshold) |
|---|---|---|---|---|---|---|
| Strict | all | 344 | 10 | 41 | 0.0000147 | −9.0 points (block-bootstrap 95 % CI −16.3 to −0.3) |
| Strict | outbreak only (sensitivity) | 50 | 0 | 14 | 0.000122 | −28.0 points |
| Strict | non-outbreak only (specificity) | 294 | 10 | 27 | 0.00763 | −5.8 points |
| Moderate | all | 344 | 6 | 45 | 0.0000000183 | −11.3 points (block-bootstrap 95 % CI −18.0 to −3.8) |
| Moderate | outbreak only | 54 | 0 | 18 | 0.00000763 | −33.3 points |
| Moderate | non-outbreak only | 290 | 6 | 27 | 0.000324 | −7.2 points |

**In plain words.** On these weeks the simple fixed threshold is significantly better than the MediSync rule, both overall and
on outbreak and non-outbreak weeks separately. Of the 51 strict weeks where only one method was right, the threshold was right
in 41 and the rule in 10. The rule never caught an outbreak week that the threshold missed.

**Limits (say these too).**
1. McNemar assumes independent weeks. These are not: 49 of the 50 strict outbreak weeks belong to one 2017 epidemic. The
   p-values therefore overstate the evidence. The block bootstrap (13-week blocks, 2,000 resamples) allows for this; its
   strict interval ends at −0.3 points, so the overall result is only just below zero.
2. One disease and one national weekly series, used as a proxy for a daily district rule. It does not test the live platform.
3. A fixed threshold needs past data for each disease and district and is easy to fool when the normal level changes. That is a
   design argument and was **not** measured here.
4. SciPy and statsmodels cannot load on this PC (Windows Application Control blocks their DLLs), so the p-values use exact
   integer arithmetic, cross-checked by a second binomial calculation in the script. Clinical validation: not established.

**Do not claim** that the MediSync rule beats a threshold, or that the two are equivalent.
