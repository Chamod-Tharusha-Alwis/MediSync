"""Phase D: model cards and data sheet, written from the results files (offline study, not in production).

Every number comes from docs/report/study/study_results.json, ml-engine/evaluation/evaluation_results.json
or ml-engine/evaluation/data/manifest.json. Nothing is typed by hand.

Usage:  python ml-engine/evaluation/study/write_cards.py
"""
import os

from study_common import DATA_DIR, EVALUATION_RESULTS_PATH, OUT_DIR, RESULTS_PATH, STUDY_LABEL, read_json

NOT_FOR = ('diagnosis, triage decisions, or any use with real patients without clinical validation, ethics approval and regulatory assessment, '
           'none of which exists')


def pct(v):
    return 'n/a' if v is None else f'{v * 100:.1f}%'


def ci(c):
    return 'n/a' if not c else f'{pct(c[0])} to {pct(c[1])}'


def num(v, places=3):
    return 'n/a' if v is None else f'{v:.{places}f}'


def ci_num(c):
    return 'n/a' if not c else f'{num(c[0])} to {num(c[1])}'


def card(title, rows):
    out = [f'## {title}\n', '| Field | Content |', '|---|---|']
    out += [f'| {k} | {v} |' for k, v in rows]
    return '\n'.join(out) + '\n'


def main():
    study = read_json(RESULTS_PATH)
    prior = read_json(EVALUATION_RESULTS_PATH)
    manifest = read_json(os.path.join(DATA_DIR, 'manifest.json'))['datasets']
    a, b, c = study['phaseA'], study['phaseB'], study['phaseC']
    s = prior['symptomBenchmark']
    ib = prior['interactionBenchmark']
    engine = c['models']['productionEngine']
    best_name = c['bestModelByTestMacroF1']
    best = c['models'][best_name]
    det = b['byReference']['R1_strict']['configurations']['z2.0_persist']
    det2 = b['byReference']['R2_moderate']['configurations']['z2.0_persist']
    h1 = a['byHorizon']['h1']
    h4 = a['byHorizon']['h4']

    cards = [f'# MediSync model cards ({STUDY_LABEL})\n',
             f"Written by `ml-engine/evaluation/study/write_cards.py` from the results files. Clinical validation: "
             f"{study['clinicalValidation'].replace('_', ' ')} for every component. Run date {c['run']['date']}, code commit `{c['run']['git']['commit'][:7]}`.\n"]

    cards.append(card('1. Symptom suggestion engine (production: TF-IDF cosine retrieval, 41 curated + 174 knowledge-base profiles)', [
        ('Intended use', 'Suggest candidate conditions from symptom phrases entered by a clinician, for the clinician to accept or reject.'),
        ('Evaluation data', f"gretelai/symptom_to_diagnosis test split ({s['coverage']['testRows']} LLM-rewritten rows); DDXPlus test sample "
                            f"({engine['rows']} synthetic rows, {engine['coveredPathologies']} of {c['classes']} pathologies have a profile)."),
        ('Metrics', f"gretelai: top-1 {pct(s['allRows']['top1']['accuracy'])} ({ci(s['allRows']['top1']['ci95'])}), top-5 {pct(s['allRows']['top5']['accuracy'])}. "
                    f"DDXPlus: top-1 {pct(engine['top1']['accuracy'])} ({ci(engine['top1']['ci95'])}), top-5 {pct(engine['top5']['accuracy'])}, "
                    f"macro F1 {num(engine['macroF1']['value'])} ({ci_num(engine['macroF1']['ci95'])})."),
        ('Comparison', f"Best shadow model in this study ({best_name}, {best['features']} multi-hot features, {STUDY_LABEL}): DDXPlus top-1 "
                       f"{pct(best['top1']['accuracy'])} ({ci(best['top1']['ci95'])}), macro F1 {num(best['macroF1']['value'])}; "
                       f"McNemar vs engine p = {num(best['mcnemarVsProductionEngine']['pValue'], 4)}."),
        ('Known failures', f"The vectorizer keeps stop words, so function words drive rankings ({prior['symptomErrorInvestigation']['profile']} first on "
                           f"{prior['symptomErrorInvestigation']['rowsRankedFirstWhenWrong']} wrong gretelai rows). Similarity scores are not probabilities."),
        ('Limits', 'Synthetic or LLM-rewritten benchmark text; partial profile coverage; no real patients; the application sends short phrases, not sentences.'),
        ('Must not be used for', NOT_FOR),
    ]))

    cards.append(card('2. Medicine interaction checker (production: pair lookup in a 191k-pair reference list)', [
        ('Intended use', 'Warn a pharmacist or doctor when two entered medicines appear as an interacting pair in the reference list, or when an ingredient cannot be resolved.'),
        ('Evaluation data', f"{ib['referenceSet']['pairs']} drug pairs cited to {ib['referenceSet']['labelsCited']} US FDA labels (PR #47); not re-evaluated in this study."),
        ('Metrics', f"sensitivity {pct(ib['metrics']['sensitivity']['value'])} ({ci(ib['metrics']['sensitivity']['ci95'])}), specificity "
                    f"{pct(ib['metrics']['specificity']['value'])} ({ci(ib['metrics']['specificity']['ci95'])}), precision {pct(ib['metrics']['precision']['value'])}, "
                    f"false-alarm rate {pct(ib['metrics']['falseAlarmRate']['value'])}; {ib['metrics']['unverifiedPairs']} pairs unverified."),
        ('Known failures', f"{len(ib['missedInteractions'])} missed interactions and {len(ib['falseAlarms'])} false alarms are listed in docs/report/AI_EVALUATION.md. "
                           f"Only {pct(ib['catalogueLimits']['fullyResolvedShare'])} of catalogue entries resolve to active ingredients; dose limits exist for "
                           f"{ib['catalogueLimits']['doseLimitIngredients']} ingredients."),
        ('Limits', 'US labels as the reference; one label\'s statement defines "non-interacting"; catalogue licence not verified.'),
        ('Must not be used for', NOT_FOR + '; it is not a complete interaction database.'),
    ]))

    cards.append(card('3. Outbreak detector (production: 56-day baseline z-score, 7-day window, 2-day persistence, z > 2.0)', [
        ('Intended use', 'Flag a district and disease for public-health review when daily consultation episodes rise above the recent baseline.'),
        ('Evaluation data', f"OpenDengue Sri Lanka national weekly counts ({b['segment']['evaluableWeeks']} evaluable weeks), one week fed as one detector day: a proxy, not the platform's daily district episodes."),
        ('Metrics', f"At the production setting, reference R1: recall {pct(det['recall'])}, false-alarm rate {pct(det['falseAlarmRate'])}, F1 {num(det['f1'])}, "
                    f"{det['periodsDetected']} of {det['periods']} outbreak period(s) detected, median delay {det['medianDelayWeeks']} weeks; reference R2: recall "
                    f"{pct(det2['recall'])}, false-alarm rate {pct(det2['falseAlarmRate'])}, {det2['periodsDetected']} of {det2['periods']} detected."),
        ('Comparison', f"A fixed 95th-percentile threshold on the same proxy reaches F1 {num(b['byReference']['R1_strict']['configurations']['fixed_p95']['f1'])} (R1)."),
        ('Known failures', 'Flags recurring seasonal rises as outbreaks; the detection rate on real outbreaks is unknown (one or two reference periods).'),
        ('Limits', 'National weekly proxy; reference outbreak definitions are statistical, not epidemiological declarations.'),
        ('Must not be used for', NOT_FOR + '; not a substitute for public-health surveillance.'),
    ]))

    cards.append(card('4. Trend projection (production: least-squares line on the last 14 points, 95% prediction band)', [
        ('Intended use', 'Show a descriptive short-range trend line on the surveillance dashboard, labelled as not a validated forecast.'),
        ('Evaluation data', f"OpenDengue Sri Lanka weekly counts, {a['split']['origins']} rolling origins, horizons {', '.join(str(h) for h in a['split']['horizons'])} weeks (one week fed as one day)."),
        ('Metrics', f"MAE at 1 week {num(h1['productionProjection']['mae'], 1)} cases (MASE {num(h1['productionProjection']['mase'])}) against naive "
                    f"{num(h1['naive']['mae'], 1)}, ETS {num(h1['ets']['mae'], 1)}, SARIMA {num(h1['sarima']['mae'], 1)}, Prophet {num(h1['prophet']['mae'], 1)}. "
                    f"At 4 weeks: projection {num(h4['productionProjection']['mae'], 1)}, naive {num(h4['naive']['mae'], 1)}, ETS {num(h4['ets']['mae'], 1)}."),
        ('Known failures', 'Worse than repeating the last value at every horizon; the earlier V4 check found its 95% band covered only '
                           f"{pct(prior['outbreakBacktest']['projection']['byHorizon']['h4']['intervalCoverage']['value'])} of targets at 4 weeks."),
        ('Limits', 'Single national series; a linear trend cannot represent seasonality or epidemic growth.'),
        ('Must not be used for', NOT_FOR + '; not a forecast for planning or resource allocation.'),
    ]))
    with open(os.path.join(OUT_DIR, 'MODEL_CARDS.md'), 'w', encoding='utf-8', newline='\n') as handle:
        handle.write('\n'.join(cards) + '\n')

    sheet = [f'# Data sheet for the datasets used ({STUDY_LABEL})\n',
             'Written by `ml-engine/evaluation/study/write_cards.py` from `ml-engine/evaluation/data/manifest.json`. Files are gitignored; only the manifest is committed.\n']
    biases = {
        'gretelai': 'LLM-rewritten text from the Symptom2Disease dataset; 22 diagnoses, about 10 rows each; same label set as the source of the engine\'s curated profiles.',
        'ddxplus': 'Synthetic patients from a proprietary rule-based generator; 49 pathologies, mostly respiratory and cardiovascular; heavy class imbalance '
                   f"(study test sample: smallest class {min(c['eda']['testClassCounts'].values())} rows, largest {max(c['eda']['testClassCounts'].values())}); "
                   'patients share templates, so rows are not independent.',
        'opendengue': 'National totals only for Sri Lanka; reporting completeness varies by year; 2018 missing; week-end gaps interpolated by the study rule.',
    }
    for key, entry in sorted(manifest.items()):
        family = 'gretelai' if key.startswith('gretelai') else ('ddxplus' if key.startswith('ddxplus') else 'opendengue')
        sheet.append(card(entry['name'], [
            ('Source', f"{entry['page']} ({entry['url']})"), ('Licence', f"{entry['licence']['licence']} ({entry['licence']['evidence']})"),
            ('Size', f"{entry['rows']:,} rows, {entry['bytes']:,} bytes, SHA-256 `{entry['sha256'][:16]}…`, downloaded {entry['downloadDate']}"),
            ('Used for', entry['usedFor']), ('Nature', entry['nature']), ('Known biases', biases[family]),
        ]))
    with open(os.path.join(OUT_DIR, 'DATA_SHEET.md'), 'w', encoding='utf-8', newline='\n') as handle:
        handle.write('\n'.join(sheet) + '\n')
    print('MODEL_CARDS.md and DATA_SHEET.md written')


if __name__ == '__main__':
    main()
