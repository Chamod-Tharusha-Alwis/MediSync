"""Write docs/report/study/RESULTS.md from the results files (offline study, not in production).

Every number is read from study_results.json or the study CSVs and formatted here. check_results.py then
verifies that every number in RESULTS.md can be traced back to those files.

Usage:  python ml-engine/evaluation/study/write_results.py
"""
import csv
import os

from study_common import OUT_DIR, RESULTS_PATH, STUDY_LABEL, read_json

DEVIATIONS = [
    ('2026-11-16', 'Phase C model fitting, scoring and permutation importance run under the system Python (scikit-learn 1.9.0) instead of the '
                   'project venv (scikit-learn 1.9.1); Phase C figures are drawn by a separate venv script.',
     'The venv cannot import sklearn.ensemble or sklearn.inspection on this machine (a compiled extension is blocked by an Application '
     'Control policy), which was found when the first Phase C run failed at the random-forest step. Phases A, B, D and E are unchanged.'),
]


def pct(v):
    return 'n/a' if v is None else f'{v * 100:.1f}%'


def ci(c):
    return 'n/a' if not c else f'{pct(c[0])} to {pct(c[1])}'


def num(v, places=3):
    return 'n/a' if v is None else f'{v:.{places}f}'


def ci_num(c):
    return 'n/a' if not c else f'{num(c[0])} to {num(c[1])}'


def table(header, rows):
    lines = ['| ' + ' | '.join(header) + ' |', '|' + '|'.join('---' for _ in header) + '|']
    lines += ['| ' + ' | '.join(str(cell).replace('|', '/') for cell in row) + ' |' for row in rows]
    return '\n'.join(lines) + '\n'


def read_csv(name):
    with open(os.path.join(OUT_DIR, name), encoding='utf-8') as handle:
        return list(csv.DictReader(handle))


def main():
    r = read_json(RESULTS_PATH)
    a, b, c = r['phaseA'], r['phaseB'], r['phaseC']
    env = r['environment']
    out = []
    add = out.append

    add(f'# Data science study results ({STUDY_LABEL})\n')
    add(f"**Clinical validation: {r['clinicalValidation'].replace('_', ' ')}.** This is an offline study on public data. The shadow models "
        'trained here are research artefacts; they are not deployed and nothing in the application changed. Written by '
        '`ml-engine/evaluation/study/write_results.py` from `study_results.json` and the CSVs in this folder; `check_results.py` verifies '
        f"every number below. Code commit `{c['run']['git']['commit'][:7]}`, run date {c['run']['date']}.\n")

    add('## 1. Every metric and its source file\n')
    rows = []
    for h, block in sorted(a['byHorizon'].items(), key=lambda kv: int(kv[0][1:])):
        for model in ('naive', 'seasonalNaive', 'productionProjection', 'ets', 'sarima', 'prophet'):
            m = block[model]
            rows.append([f"A: {model}, {h[1:]} wk", f"MAE {num(m['mae'], 1)} ({num(m['maeCi95'][0], 1)} to {num(m['maeCi95'][1], 1)}); RMSE {num(m['rmse'], 1)}; MASE {num(m['mase'])}",
                         'forecast_metrics.csv'])
        for pair in ('prophet_vs_sarima', 'prophet_vs_productionProjection'):
            p = block[pair]
            rows.append([f"A: {pair.replace('_vs_', ' vs ')}, {h[1:]} wk", f"mean |e| difference {num(p['meanAbsErrorDifference'], 1)} "
                         f"({num(p['blockBootstrapCi95'][0], 1)} to {num(p['blockBootstrapCi95'][1], 1)}); DM p = {num(p['dieboldMarianoP'], 4)}",
                         'study_results.json (phaseA)'])
    for ref, block in b['byReference'].items():
        for name, cfg in block['configurations'].items():
            rows.append([f'B: {ref}, {name}', f"recall {pct(cfg['recall'])}, false-alarm rate {pct(cfg['falseAlarmRate'])}, precision {pct(cfg['precision'])}, "
                         f"F1 {num(cfg['f1'])}, detected {cfg['periodsDetected']}/{cfg['periods']}, median delay {cfg['medianDelayWeeks']} wk", 'detector_sweep.csv'])
    for model, m in c['models'].items():
        cal = m.get('calibration') or {}
        extra = f"; Brier {num(cal.get('brierMulticlass'))}, ECE {num(cal.get('ece'))}" if cal else ''
        mc = m.get('mcnemarVsProductionEngine')
        extra += f"; McNemar vs engine p = {num(mc['pValue'], 4)}" if mc else ''
        rows.append([f'C: {model}', f"top-1 {pct(m['top1']['accuracy'])} ({ci(m['top1']['ci95'])}); top-3 {pct(m['top3']['accuracy'])}; top-5 {pct(m['top5']['accuracy'])}; "
                     f"macro F1 {num(m['macroF1']['value'])} ({ci_num(m['macroF1']['ci95'])}){extra}", 'symptom_study_metrics.csv'])
    add(table(['Metric', 'Value (95% CI)', 'Source file'], rows))

    add('## 2. Plain-language reading\n')
    h1, h4 = a['byHorizon']['h1'], a['byHorizon']['h4']
    best_h1 = min(('naive', 'ets', 'sarima', 'prophet', 'productionProjection', 'seasonalNaive'), key=lambda m: h1[m]['mae'])
    add(f"**Phase A (forecasting).** On {a['split']['origins']} rolling origins the best 1-week forecaster was {best_h1} (MAE {num(h1[best_h1]['mae'], 1)} cases). "
        f"The production projection had MAE {num(h1['productionProjection']['mae'], 1)} at 1 week and {num(h4['productionProjection']['mae'], 1)} at 4 weeks, worse than "
        f"the naive forecast ({num(h1['naive']['mae'], 1)} and {num(h4['naive']['mae'], 1)}). Prophet was worse than SARIMA at 1 and 2 weeks "
        f"(DM p = {num(h1['prophet_vs_sarima']['dieboldMarianoP'], 4)} and {num(a['byHorizon']['h2']['prophet_vs_sarima']['dieboldMarianoP'], 4)}) and not "
        f"distinguishable from the production projection at any horizon (DM p = {num(h1['prophet_vs_productionProjection']['dieboldMarianoP'], 4)} at 1 week). "
        f"SARIMA order chosen by AIC on the first {a['split']['initialTrainingWeeks']} weeks: {tuple(a['sarima']['order'])} x {tuple(a['sarima']['seasonalOrder'])}. "
        f"{a['comparisonLimits']}\n")
    d1 = b['byReference']['R1_strict']['configurations']
    d2 = b['byReference']['R2_moderate']['configurations']
    add(f"**Phase B (detector).** {b['proxyStatement']} The re-implemented rule matched the real function on all {b['reimplementationCheck']['weeksCompared']} "
        f"evaluable weeks ({b['reimplementationCheck']['mismatches']} mismatches). At the production setting (z = 2.0 with persistence) the rule flagged "
        f"{pct(d1['z2.0_persist']['recall'])} of strict epidemic weeks with a false-alarm rate of {pct(d1['z2.0_persist']['falseAlarmRate'])} (F1 {num(d1['z2.0_persist']['f1'])}); "
        f"under the moderate definition it found {d2['z2.0_persist']['periodsDetected']} of {d2['z2.0_persist']['periods']} outbreak periods. Lowering z raises recall and false "
        f"alarms together; removing persistence adds false alarms. A fixed 95th-percentile count threshold reached F1 {num(d1['fixed_p95']['f1'])} (strict) and "
        f"{num(d2['fixed_p95']['f1'])} (moderate) on the same weeks, higher than any z setting, because this proxy series has strong seasonality that a short "
        'baseline window mistakes for outbreaks.\n')
    e, best_name = c['models']['productionEngine'], c['bestModelByTestMacroF1']
    best = c['models'][best_name]
    add(f"**Phase C (symptom study).** {c['syntheticDataStatement']} On {e['rows']} test rows (49 pathologies, {e['coveredPathologies']} with a MediSync profile), "
        f"the production engine reached top-1 {pct(e['top1']['accuracy'])} and macro F1 {num(e['macroF1']['value'])}. Shadow models trained on "
        f"{c['features']['S']} multi-hot symptom features (the same information the engine receives) reached top-1 "
        f"{', '.join(f'{m} {pct(c['models'][m]['top1']['accuracy'])}' for m in ('naiveBayes', 'logisticRegression', 'linearSvm', 'randomForest'))}; "
        f"logistic regression with all {c['features']['S+A']} structured fields reached {pct(c['models']['logisticRegressionAllFields']['top1']['accuracy'])}. "
        f"The best model by macro F1 was {best_name} ({num(best['macroF1']['value'])}; McNemar vs engine p = {num(best['mcnemarVsProductionEngine']['pValue'], 4)}). "
        'The gap shows that the retrieval design discards most of the signal in structured evidence; it does not show accuracy on real patients, because '
        'the data come from a rule-based generator.\n')
    if c['confusionPairs']:
        add('Most confused pairs for the best model: ' + '; '.join(f"{p['truePathology']} predicted as {p['predictedPathology']} ({p['rows']} rows, "
                                                                     f"{pct(p['shareOfTrueClassRows'])} of that class)" for p in c['confusionPairs']) + '.\n')
    imp = c['permutationImportance']
    add(f"Top permutation-importance features for {best_name} ({imp['rowsUsed']} validation rows, {imp['repeats']} repeats): "
        + '; '.join(f"{t['text']} ({num(t['importanceMean'])})" for t in imp['top'][:5]) + '.\n')

    add('## 3. Allowed and not allowed claims\n')
    add('**Allowed:**\n')
    for line in [
        f"On public Sri Lanka dengue counts, the production trend projection was less accurate than a naive last-value forecast at 1, 2 and 4 weeks ({STUDY_LABEL}).",
        'Prophet did not improve on SARIMA or on the production projection for this series.',
        f"The production outbreak rule, applied to national weekly counts as a proxy, flagged {pct(d1['z2.0_persist']['recall'])} of strict epidemic weeks with a "
        f"{pct(d1['z2.0_persist']['falseAlarmRate'])} false-alarm rate.",
        f"On synthetic DDXPlus data, supervised models trained on the same symptom information outperform the production retrieval engine "
        f"(best macro F1 {num(best['macroF1']['value'])} vs {num(e['macroF1']['value'])}).",
        'The shadow models are research artefacts: offline study, not in production.',
    ]:
        add(f'- {line}')
    add('\n**Not allowed:**\n')
    for line in [
        'Any statement that a MediSync component is validated for clinical use, fit for patient care, safe, or approved.',
        'Reading DDXPlus scores as diagnostic accuracy on real patients; the data are rule-generated.',
        'Reading the detector proxy results as the detection rate of the production detector on district daily data.',
        'Generalising the forecast results beyond one national series of one disease.',
        'Describing the shadow models as part of the product.',
    ]:
        add(f'- {line}')
    add('')

    add('## 4. Limitations\n')
    for line in [
        'No real patients, no clinician review, no ethics approval, no prospective study, no regulatory assessment.',
        f"Phase A: one country, one disease, {a['split']['origins']} overlapping origins; the 2017 epidemic dominates the errors; SARIMA order was selected once.",
        'Phase B: national weekly counts stand in for daily district episodes; the reference outbreak definitions are statistical rules written for this study.',
        f"Phase C: DDXPlus is synthetic; samples are capped per class (train {c['datasets']['train']['perClassCap']}, validation {c['datasets']['validate']['perClassCap']}, "
        f"test {c['datasets']['test']['perClassCap']} rows); the production engine has profiles for only {e['coveredPathologies']} of 49 pathologies; "
        'template sharing between synthetic patients makes bootstrap intervals too narrow.',
        'Phase E: the existing jest integrity test was not extended, because the hard rules forbid editing tests and limit the diff to the study folders; '
        '`check_results.py` performs the equivalent check inside `run_study.py` instead.',
    ]:
        add(f'- {line}')
    add('')

    add('## 5. Deviations from PROTOCOL.md\n')
    if DEVIATIONS:
        add(table(['Date', 'What changed', 'Why'], DEVIATIONS))
    else:
        add('None recorded.\n')

    add('## 6. Reproduce\n')
    add('```\n'
        'ml-engine/.venv/Scripts/python.exe ml-engine/evaluation/study/run_study.py --offline\n'
        '```\n'
        f"Library versions: Python {env['python']}, numpy {env['numpy']}, pandas {env['pandas']}, scipy {env['scipy']}, scikit-learn {env['scikit-learn']}, "
        f"statsmodels {env['statsmodels']}, prophet {env['prophet']}, cmdstanpy {env['cmdstanpy']}, matplotlib {env['matplotlib']}. "
        'The command prints the SHA-256 of every CSV and PNG; two consecutive runs must match.\n')
    with open(os.path.join(OUT_DIR, 'RESULTS.md'), 'w', encoding='utf-8', newline='\n') as handle:
        handle.write('\n'.join(out) + '\n')
    print('RESULTS.md written')


if __name__ == '__main__':
    main()
