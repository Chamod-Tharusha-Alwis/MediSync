"""Write docs/report/AI_EVALUATION.md from evaluation_results.json and data/manifest.json.

No figure is typed by hand: every number in the report is read from those two files and formatted
here. server/tests/aiEvaluationIntegrity.test.js checks that every number in the report appears in them.

Usage:  python ml-engine/evaluation/write_report.py
"""
import os

from eval_common import DATA_MANIFEST_PATH, REPO_ROOT, RESULTS_PATH, read_json

REPORT_PATH = os.path.join(REPO_ROOT, 'docs', 'report', 'AI_EVALUATION.md')
FIGURES = '../../ml-engine/evaluation'
PERCENT = 100
EXCERPT_CHARS = 220
SHA_PREFIX = 12
COMMIT_PREFIX = 7


def pct(value):
    return 'n/a' if value is None else f'{value * PERCENT:.1f}%'


def interval(ci):
    return 'n/a' if not ci else f'{pct(ci[0])} to {pct(ci[1])}'


def dec(value, places=3):
    return 'n/a' if value is None else f'{value:.{places}f}'


def whole(value):
    return 'n/a' if value is None else f'{value:.0f}'


def table(header, rows):
    lines = ['| ' + ' | '.join(header) + ' |', '|' + '|'.join('---' for _ in header) + '|']
    lines += ['| ' + ' | '.join(str(cell).replace('|', '/') for cell in row) + ' |' for row in rows]
    return '\n'.join(lines) + '\n'


def verdict(comparison):
    if comparison['engineBeatsBaseline']:
        return 'Yes' if comparison['ciExcludesZero'] else 'Higher, within sampling error'
    return 'No, lower' if comparison['ciExcludesZero'] else 'No (lower, within sampling error)'


def symptom_section(add, block, name, figure):
    ks = sorted(int(key[3:]) for key in block['allRows'] if key.startswith('top'))
    cov = block['coverage']
    add(table(['Coverage', 'Count'], [
        ['Rows evaluated', cov['testRows']], ['Rows whose diagnosis has a MediSync profile (covered)', cov['coveredRows']],
        ['Rows without a profile (counted as wrong in "all rows")', cov['uncoveredRows']],
        ['Diagnoses in the data', cov['diagnoses']], ['Diagnoses with a profile', cov['coveredDiagnoses']],
        ['Diagnoses covered only by a Tier 2 profile', len(cov['coveredByTier2Only'])]]))
    rows = []
    for label, part in (('All rows', block['allRows']), ('Covered rows only', block['coveredRowsOnly'])):
        rows.append([label, part['rows']] + [f"{pct(part[f'top{k}']['accuracy'])} ({interval(part[f'top{k}']['ci95'])})" for k in ks]
                    + [dec(part['macroPrecision']), dec(part['macroRecall']), dec(part['macroF1']), dec(part['weightedF1'])])
    add(table(['Rows', 'n'] + [f'Top-{k} (95% CI)' for k in ks] + ['Macro precision', 'Macro recall', 'Macro F1', 'Weighted F1'], rows))
    base = [['MediSync engine'] + [pct(block['allRows'][f'top{k}']['accuracy']) for k in ks] + ['']]
    for entry in block['baselines'].values():
        base.append([entry['label']] + [f"{pct(entry[f'top{k}']['accuracy'])} ({interval(entry[f'top{k}']['ci95'])})" for k in ks]
                    + [verdict(entry['top1']['engineComparison'])])
    add(f'Baselines on the same {name} rows (all rows):\n')
    add(table(['System'] + [f'Top-{k}' for k in ks] + ['Engine better at top-1?'], base))
    for entry in block['baselines'].values():
        add(f"- {entry['label']}: {entry['definition']}")
    add('')
    add(f'![{name} accuracy against baselines]({FIGURES}/{figure})\n')
    add(table(['Diagnosis the engine gets most wrong', 'Recall', 'Rows', 'What it ranked first instead (rows)'],
              [[w['diagnosis'], dec(w['recall'], 2), w['support'], '; '.join(f"{e['predictedProfile']} ({e['rows']})" for e in w['top1Errors'][:4])]
               for w in block['fiveMostWrongDiagnoses']]))
    leak = block['leakageCheck']
    exact = sum(v['exactOrContainedMatches'] for v in leak['bySource'].values())
    near = sum(v['nearDuplicatesAboveThreshold'] for v in leak['bySource'].values())
    highest = max(v['maxCosineSimilarity'] for v in leak['bySource'].values())
    add(f"Leakage check against all profile-building text: {exact} exact matches, {near} near-duplicates (cosine above "
        f"{leak['threshold']}); highest similarity {dec(highest)}. Rows overlapping profile data: {leak['overlappingRowCount']}. "
        f"Near-duplicate pairs inside the evaluated rows themselves: {leak['nearDuplicatePairsInsideTestSet']}. "
        f"{leak['sharedLabelVocabulary']['note']}\n")


def main():
    results = read_json(RESULTS_PATH)
    datasets = read_json(DATA_MANIFEST_PATH)['datasets']
    s, d = results['symptomBenchmark'], results['ddxplusBenchmark']
    inv_s, inv_d = results['symptomErrorInvestigation'], results['ddxplusErrorInvestigation']
    cal, ib, src, ob = results['calibration'], results['interactionBenchmark'], results['interactionSourceCheck'], results['outbreakBacktest']
    m = ib['metrics']
    det, proj = ob['detector'], ob['projection']
    run = s['run']
    out = []
    add = out.append

    add('# MediSync AI Evaluation on Public Data (offline)\n')
    add(f"**Clinical validation: {results['clinicalValidation'].replace('_', ' ')}.** Everything below is an engineering benchmark on public, "
        'non-patient data. It measures agreement with dataset labels, FDA label statements and public case counts. It does not show that '
        'MediSync is safe or effective for patient care. See [VALIDATION_LIMITS.md](VALIDATION_LIMITS.md) for what is not established.\n')
    add(f"Generated by `ml-engine/evaluation/write_report.py` from `ml-engine/evaluation/evaluation_results.json` and "
        f"`ml-engine/evaluation/data/manifest.json`. Code at commit `{run['git']['commit'][:COMMIT_PREFIX]}`; run date {run['date']}. "
        'Reproduce everything with `python ml-engine/evaluation/run_all.py`.\n')

    add('## Summary\n')
    ddx_random = d['baselines']['random']['top1']
    add(table(['Component', 'Data', 'Main result (95% CI)', 'Against baselines'], [
        ['Symptom engine', f"gretelai test split, {s['coverage']['testRows']} rows",
         f"top-1 {pct(s['allRows']['top1']['accuracy'])} ({interval(s['allRows']['top1']['ci95'])}); top-5 {pct(s['allRows']['top5']['accuracy'])}",
         f"above random and majority; keyword overlap: {verdict(s['baselines']['keywordOverlap']['top1']['engineComparison']).lower()}"],
        ['Symptom engine', f"DDXPlus sample, {d['coverage']['testRows']} rows ({d['coverage']['coveredRows']} covered)",
         f"all rows top-1 {pct(d['allRows']['top1']['accuracy'])} ({interval(d['allRows']['top1']['ci95'])}); covered rows top-1 "
         f"{pct(d['coveredRowsOnly']['top1']['accuracy'])}",
         f"random guess {pct(ddx_random['accuracy'])}: engine better? {verdict(ddx_random['engineComparison']).lower()}"],
        ['Score calibration', 'gretelai (map fitted on train split)',
         f"test Brier {dec(cal['calibrationMap']['testBrierScore'])} vs base rate {dec(cal['calibrationMap']['testBaseRateBrierScore'])}; "
         f"ECE {dec(cal['calibrationMap']['testExpectedCalibrationError'])}", ''],
        ['Interaction checker', f"{ib['referenceSet']['pairs']} FDA-label pairs",
         f"sensitivity {pct(m['sensitivity']['value'])} ({interval(m['sensitivity']['ci95'])}); specificity {pct(m['specificity']['value'])} "
         f"({interval(m['specificity']['ci95'])})", f"{m['unverifiedPairs']} pairs unverified ({pct(m['unverifiedShare'])})"],
        ['Outbreak detector', f"OpenDengue Sri Lanka, {det['evaluatedWeeks']} weeks",
         f"week sensitivity {pct(det['weekSensitivity']['value'])} ({interval(det['weekSensitivity']['ci95'])}); specificity "
         f"{pct(det['weekSpecificity']['value'])}", f"{det['detectedPeriods']} of {det['evaluablePeriods']} reference period(s) detected; "
         f"{det['falseAlarmEpisodes']} false-alarm episodes"],
        ['Trend projection', 'OpenDengue Sri Lanka, 1-week horizon',
         f"MAE {whole(proj['byHorizon']['h1']['mae']['projection']['value'])} cases; interval coverage {pct(proj['byHorizon']['h1']['intervalCoverage']['value'])}",
         f"last value MAE {whole(proj['byHorizon']['h1']['mae']['lastValue']['value'])}: projection worse"],
    ]))

    add('## Datasets\n')
    add(table(['Dataset', 'Licence (as published)', 'Rows', 'SHA-256 (prefix)', 'Downloaded', 'Nature'],
              [[e['name'], e['licence']['licence'], e['rows'], f"`{e['sha256'][:SHA_PREFIX]}`", e['downloadDate'], e['nature']]
               for e in datasets.values()]))
    add('FDA drug labels (openFDA, CC0 1.0 public domain) are cited per pair in `ml-engine/evaluation/interaction_reference.json`. '
        'All files are gitignored; only the manifest is committed.\n')

    add('## V1. Symptom engine\n')
    add('Each row is sent unchanged to the real `/api/ml/predict-disease` route. Label mappings were frozen in files committed before '
        'the engine was run on each dataset. A diagnosis maps only to a profile naming the same disease.\n')
    add('### gretelai/symptom_to_diagnosis (test split)\n')
    symptom_section(add, s, 'gretelai', 'symptom_accuracy_vs_baselines.png')
    add(f'![Top-1 confusion matrix]({FIGURES}/confusion_matrix_symptoms.png)\n')
    add(f'![Per-diagnosis F1]({FIGURES}/per_class_f1.png)\n')
    add('### DDXPlus (second, independent dataset)\n')
    add(f"Sample: {d['datasetManifest']['sample']['rows']} test patients ({d['datasetManifest']['sample']['perPathology']} per pathology at most, "
        f"seed {d['datasetManifest']['sample']['seed']}) from {d['datasetManifest']['sample']['testSplitRows']} in the test split. "
        f"{d['run']['inputFormat']}\n")
    symptom_section(add, d, 'DDXPlus', 'ddxplus_accuracy_vs_baselines.png')

    add('### Why one profile is ranked first on many wrong answers\n')
    for inv, name in ((inv_s, 'gretelai'), (inv_d, 'DDXPlus')):
        share = inv['shareOfCosineFromStopWordFeatures']
        top_terms = ', '.join(f"\"{t['feature']}\" {pct(t['shareOfCosine'])}" for t in inv['largestSummedTermShares'][:3])
        add(f"- **{name}: {inv['profile']}** is ranked first on {inv['rowsRankedFirstWhenWrong']} wrong rows. Its profile text contains the "
            f"stop words {', '.join(inv['profileStopWords'])}. Median share of its cosine score coming from stop-word features: "
            f"{dec(share['median'], 2)} (at least half on {share['rowsAtOrAboveHalf']} rows). Largest contributors: {top_terms}. "
            f"Overlap ratio above 1 on {inv['overlapRatio']['rowsAboveOne']} rows.")
    add('')
    add(f"**Finding.** {inv_s['finding']} **Is it a bug?** {inv_s['isItABug']} **Status:** {inv_s['fixStatus']}\n")

    add('## V2. Scores and calibration\n')
    add('The engine returns similarity scores (0 to 100, and above 100 when the overlap ratio exceeds 1), not probabilities. '
        'No ROC-AUC or log loss of the raw score is reported.\n')
    for section, name in (('symptomBenchmark', 'gretelai test split'), ('ddxplusBenchmark', 'DDXPlus sample')):
        block = cal['testSets'][section]
        c, w = block['correctTop1Scores'], block['incorrectTop1Scores']
        add(f"**{name}:** median top-1 score {dec(c['median'], 2)} when correct (n {c['count']}) and {dec(w['median'], 2)} when wrong "
            f"(n {w['count']}); scores above 100: {block['scoreAbove100']}.\n")
        add(table(['Score band', 'Rows', 'Correct', 'Top-1 accuracy (95% CI)'],
                  [[b['band'], b['rows'], b['correct'], f"{pct(b['accuracy'])} ({interval(b['ci95'])})"] for b in block['accuracyByScoreBand']]))
    cm = cal['calibrationMap']
    add(f"**Calibration map ({cm['label']})** Validation rows {cm['validationRows']}; validation top-1 accuracy {pct(cm['validationTop1Accuracy'])}. "
        f"On the {cm['testRows']} test rows: Brier score {dec(cm['testBrierScore'])} against {dec(cm['testBaseRateBrierScore'])} for always "
        f"predicting the base rate; expected calibration error {dec(cm['testExpectedCalibrationError'])} ({cm['eceBins']} bins). "
        f"Sentences present in both splits: {cm['inputSentencesInBothSplits']}. The map is not applied to DDXPlus.\n")
    add(f'![Scores and accuracy by band]({FIGURES}/score_by_correctness.png)\n')

    add('## V3. Medicine interaction checker\n')
    add(f"{ib['referenceSet']['pairs']} pairs ({ib['referenceSet']['interactingPairs']} interacting, {ib['referenceSet']['nonInteractingPairs']} "
        f"non-interacting) cited to {ib['referenceSet']['labelsCited']} FDA labels; {src['pairsWithPartnerNamedInCitedSection']} of "
        f"{src['pairsChecked']} citations confirmed by `verify_interaction_sources.py`. {ib['run']['inputFormat']}\n")
    add(table(['', 'Warning', 'No warning', 'Unverified'],
              [['Reference: interacting'] + ib['confusionMatrix']['counts'][0], ['Reference: non-interacting'] + ib['confusionMatrix']['counts'][1]]))
    add(table(['Metric (all pairs; unverified counts against the checker)', 'Value', 'Count', '95% CI'],
              [[name, pct(m[key]['value']), f"{m[key]['numerator']} / {m[key]['denominator']}", interval(m[key]['ci95'])]
               for name, key in (('Sensitivity', 'sensitivity'), ('Specificity', 'specificity'), ('Precision', 'precision'),
                                 ('False-alarm rate', 'falseAlarmRate'))]))
    add(table(['Subset', 'Pairs', 'Sensitivity', 'Specificity', 'Unverified share'],
              [[name, b['pairs'], pct(b['sensitivity']), pct(b['specificity']), pct(b['unverifiedShare'])] for name, b in ib['bySubset'].items()]))
    add('V0 is the original set (only drugs the checker resolves); V3 is the new set chosen without regard to resolution.\n')
    add(f'![Interaction confusion matrix]({FIGURES}/interaction_confusion.png)\n')
    excerpts = {p['id']: p['labelExcerpt'] for p in src['pairs']}
    pairs = {p['id']: p for p in ib['pairs']}

    def listing(ids, title):
        add(f'**{title} ({len(ids)})**\n')
        add(table(['ID', 'Pair', 'Checker', 'Label basis (paraphrase)', 'Label text (excerpt)'],
                  [[i, f"{pairs[i]['drugA']} + {pairs[i]['drugB']}", pairs[i]['checkerOutcome'].replace('_', ' '), pairs[i]['basis'],
                    (excerpts.get(i) or '')[:EXCERPT_CHARS]] for i in ids]))
    listing(ib['missedInteractions'], 'Every missed interaction (no warning or unverified)')
    listing(ib['falseAlarms'], 'Every false alarm')
    add('A false alarm means the checker warned although the cited label reports no interaction or no clinically significant one. '
        "The checker's own reference data may list an interaction that the label judged unimportant.\n")
    lim = ib['catalogueLimits']
    add(f"Catalogue limits: {lim['entriesFullyResolvedToActiveIngredients']} of {lim['catalogueEntries']} entries ({pct(lim['fullyResolvedShare'])}) "
        f"resolve fully to active ingredients; dose limits exist for {lim['doseLimitIngredients']} ingredients "
        f"({', '.join(lim['doseLimitIngredientNames'])}); {lim['catalogueOrigin']}\n")

    add('## V4. Outbreak detector and trend projection (OpenDengue)\n')
    add(f"**{ob['scope']}** Data: {ob['dataset']['name']}, {ob['dataset']['sriLankaWeeklyRows']} Sri Lanka weekly rows. "
        f"{ob['protocol']['detector']['unitSubstitution']}\n")
    add(table(['Segment', 'From', 'To', 'Weeks', 'Imputed weeks', 'Detector-evaluable weeks', 'Reference outbreak periods'],
              [[g['segment'], g['firstWeek'], g['lastWeek'], g['weeks'], g['imputedWeeks'], g['detectorEvaluableWeeks'], g['referenceOutbreakPeriods']]
               for g in ob['segments']]))
    add(f"Reference rule (frozen before running): {ob['protocol']['referenceOutbreakRule']['epidemicWeek']} "
        f"{ob['protocol']['referenceOutbreakRule']['outbreakPeriod']}\n")
    conf = det['confusion']
    add(table(['Detector metric (weekly)', 'Value', '95% block-bootstrap CI'],
              [['Sensitivity', f"{pct(det['weekSensitivity']['value'])} ({conf['truePositive']} / {conf['truePositive'] + conf['falseNegative']})", interval(det['weekSensitivity']['ci95'])],
               ['Specificity', f"{pct(det['weekSpecificity']['value'])} ({conf['trueNegative']} / {conf['trueNegative'] + conf['falsePositive']})", interval(det['weekSpecificity']['ci95'])],
               ['Precision', f"{pct(det['weekPrecision']['value'])} ({conf['truePositive']} / {conf['truePositive'] + conf['falsePositive']})", interval(det['weekPrecision']['ci95'])]]))
    periods = [p for p in det['referencePeriods'] if p['evaluable']]
    add('Reference outbreak periods: ' + '; '.join(f"{p['start']} to {p['end']} ({p['weeks']} weeks, peak {p['peakCount']} cases), "
                                                   f"detected: {p['detected']}, delay {p['delayWeeks']} weeks" for p in periods) + '. '
        f"With {det['evaluablePeriods']} evaluable period(s), no detection rate can be estimated. False-alarm episodes "
        f"({det['falseAlarmEpisodes']}): " + '; '.join(f"from {e['start']} for {e['weeks']} weeks" for e in det['falseAlarmEpisodeList']) + '.\n')
    add(f'![Detector back-test]({FIGURES}/outbreak_detector_backtest.png)\n')
    rows = []
    for h, b in sorted(proj['byHorizon'].items(), key=lambda item: int(item[0][1:])):
        rows.append([f'{h[1:]} week(s)', b['origins'], f"{whole(b['mae']['projection']['value'])} ({whole(b['mae']['projection']['ci95'][0])} to {whole(b['mae']['projection']['ci95'][1])})",
                     whole(b['mae']['lastValue']['value']), whole(b['mae']['seasonalNaive']['value']),
                     f"{pct(b['intervalCoverage']['value'])} ({interval(b['intervalCoverage']['ci95'])})"])
    add(table(['Horizon', 'Origins', 'Projection MAE (95% CI)', 'Last-value MAE', 'Seasonal-naive MAE', 'Interval coverage (nominal 95%)'], rows))
    add('Projection model types chosen by the server function: ' + ', '.join(f'{k} {v}' for k, v in proj['modelTypesUsed'].items()) + '.\n')
    add(f'![Projection back-test]({FIGURES}/projection_backtest.png)\n')

    add('## Weak results, stated plainly\n')
    for line in [
        f"On DDXPlus the engine's top-1 accuracy over all rows ({pct(d['allRows']['top1']['accuracy'])}) is below random guessing over the covered profiles ({pct(ddx_random['accuracy'])}).",
        f"On gretelai the engine does not beat a naive keyword-overlap matcher ({pct(s['baselines']['keywordOverlap']['top1']['accuracy'])} top-1).",
        f"Both datasets expose the same defect: the vectorizer keeps stop words, so \"{inv_s['largestSummedTermShares'][0]['feature']}\" and \"{inv_d['largestSummedTermShares'][0]['feature']}\" drive rankings. It is not fixed (protected file).",
        f"On DDXPlus the score does not track correctness: accuracy in the highest populated band is {pct(next(b['accuracy'] for b in reversed(cal['testSets']['ddxplusBenchmark']['accuracyByScoreBand']) if b['rows']))}.",
        f"The interaction checker raised {m['falseAlarmRate']['numerator']} false alarms among {m['falseAlarmRate']['denominator']} non-interacting pairs and could not resolve {m['unverifiedPairs']} pairs.",
        f"The trend projection is less accurate than simply repeating last week's count at every horizon, and its 95% interval covers only {pct(proj['byHorizon']['h4']['intervalCoverage']['value'])} of targets at 4 weeks.",
        f"The detector raised {det['falseAlarmEpisodes']} false-alarm episodes, and only {det['evaluablePeriods']} reference outbreak period was available, so its detection rate is unknown.",
    ]:
        add(f'- {line}')
    add('')
    add('## Limits\n')
    for line in [
        'No real patients, no clinicians, no outcomes. Clinical validation is not established. See VALIDATION_LIMITS.md.',
        'gretelai text is LLM-rewritten; DDXPlus patients are synthetic; neither is a clinical population.',
        f"Coverage is partial: {d['coverage']['coveredDiagnoses']} of {d['coverage']['diagnoses']} DDXPlus pathologies have a MediSync profile.",
        'DDXPlus input is built from survey-style question text by a fixed rule. The application receives short symptom phrases chosen by a doctor.',
        f"DDXPlus synthetic patients share templates ({d['leakageCheck']['nearDuplicatePairsInsideTestSet']} near-duplicate pairs in the sample), so its intervals are likely too narrow.",
        'The interaction reference uses US labels; "non-interacting" is one label\'s statement, and the pairs are not a random sample of prescriptions.',
        'The outbreak back-test uses national weekly counts with one week fed as one detector day; MediSync runs it on daily district counts.',
        'Nothing was tuned after results were seen. The engine, thresholds, profiles and catalogues are unchanged.',
        f"Library versions for this run: Python {run['environment']['python']}, scikit-learn {run['environment']['scikit-learn']}.",
    ]:
        add(f'- {line}')
    add('')
    with open(REPORT_PATH, 'w', encoding='utf-8', newline='\n') as handle:
        handle.write('\n'.join(out) + '\n')
    print('report written to', REPORT_PATH)


if __name__ == '__main__':
    main()
