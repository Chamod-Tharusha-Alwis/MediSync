"""V2: score distributions, accuracy by score band, and a calibration map fitted on a validation split.

The engine returns similarity scores, not probabilities. This script follows calibration_protocol.json,
which was committed before the script first ran:
- distributions of the top-1 score for correct and incorrect answers, on each test set;
- top-1 accuracy by fixed score band, with bootstrap intervals;
- an isotonic calibration map fitted on the gretelai TRAIN split only, then evaluated on the TEST split.

The raw score is never treated as a probability: no ROC-AUC or log loss of the raw score is reported.

Usage:  python ml-engine/evaluation/run_calibration.py   (after both symptom benchmark scripts)
"""
import json
import os

import numpy as np

from eval_common import (CLINICAL_VALIDATION, EVAL_DIR, MAPPING_PATH, RESULTS_PATH, dataset_entry, git_state, load_engine,
                         read_json, require_tfidf_engine, today_utc, update_results)
from run_symptom_benchmark import accepted_names, hits_at, PREDICT_ROUTE

PROTOCOL_PATH = os.path.join(EVAL_DIR, 'calibration_protocol.json')
SEED = 20261116
N_BOOTSTRAP = 2000
CI_LEVEL_PERCENT = 95
ECE_BINS = 10
ROUND_DP = 6
QUARTILE_PERCENTS = (25, 50, 75)


def rounded(value):
    return None if value is None else round(float(value), ROUND_DP)


def score_and_hit(rows):
    pairs = [(row['top5'][0]['confidence'], row['hitTop1']) for row in rows if row['top5']]
    return np.array([p[0] for p in pairs], dtype=float), np.array([p[1] for p in pairs], dtype=float)


def summary(values):
    if values.size == 0:
        return {'count': 0}
    q1, med, q3 = np.percentile(values, QUARTILE_PERCENTS)
    return {'count': int(values.size), 'min': rounded(values.min()), 'q1': rounded(q1), 'median': rounded(med),
            'q3': rounded(q3), 'max': rounded(values.max())}


def band_of(scores, edges):
    return np.clip(np.searchsorted(edges, scores, side='right') - 1, 0, len(edges) - 1)


def bootstrap_mean_ci(flags, rng):
    if flags.size == 0:
        return None
    samples = flags[rng.integers(0, flags.size, size=(N_BOOTSTRAP, flags.size))].mean(axis=1)
    tail = (100 - CI_LEVEL_PERCENT) / 2
    low, high = np.percentile(samples, [tail, 100 - tail])
    return [rounded(low), rounded(high)]


def bands_table(scores, hits, edges, rng):
    band = band_of(scores, edges)
    table = []
    for i, low in enumerate(edges):
        mask = band == i
        label = f'{low}-{edges[i + 1]}' if i + 1 < len(edges) else f'{low}+'
        n = int(mask.sum())
        table.append({'band': label, 'rows': n, 'correct': int(hits[mask].sum()),
                      'accuracy': rounded(hits[mask].mean()) if n else None, 'ci95': bootstrap_mean_ci(hits[mask], rng)})
    return table


def expected_calibration_error(probabilities, hits):
    bins = np.clip((probabilities * ECE_BINS).astype(int), 0, ECE_BINS - 1)
    total = 0.0
    for b in range(ECE_BINS):
        mask = bins == b
        if mask.any():
            total += mask.mean() * abs(probabilities[mask].mean() - hits[mask].mean())
    return total


def score_validation_split(engine, post):
    """Run the engine on the gretelai train split, with the frozen label mapping. Used only to fit the map."""
    accepted = accepted_names(read_json(MAPPING_PATH))
    with open(dataset_entry('gretelai_train')['path'], 'r', encoding='utf-8') as handle:
        rows = [json.loads(line) for line in handle if line.strip()]
    scores, hits = [], []
    for row in rows:
        predictions = post(PREDICT_ROUTE, {'symptoms': row['input_text']}).get('predictions') or []
        if not predictions:
            continue
        scores.append(predictions[0]['confidence'])
        hits.append(hits_at([p['disease'] for p in predictions], accepted[row['output_text']], 1))
    return np.array(scores, dtype=float), np.array(hits, dtype=float), len(rows)


def shared_sentences():
    texts = {}
    for key in ('gretelai_train', 'gretelai_test'):
        with open(dataset_entry(key)['path'], 'r', encoding='utf-8') as handle:
            texts[key] = {json.loads(line)['input_text'] for line in handle if line.strip()}
    return len(texts['gretelai_train'] & texts['gretelai_test'])


def main():
    from sklearn.isotonic import IsotonicRegression
    protocol = read_json(PROTOCOL_PATH)
    edges = np.array(protocol['scoreBandEdges'], dtype=float)
    results = read_json(RESULTS_PATH)
    rng = np.random.default_rng(SEED)

    per_test_set = {}
    for section in ('symptomBenchmark', 'ddxplusBenchmark'):
        scores, hits = score_and_hit(results[section]['rows'])
        per_test_set[section] = {
            'rowsWithAPrediction': int(scores.size),
            'scoreAbove100': int((scores > 100).sum()),
            'correctTop1Scores': summary(scores[hits == 1]),
            'incorrectTop1Scores': summary(scores[hits == 0]),
            'accuracyByScoreBand': bands_table(scores, hits, [int(e) for e in edges], rng),
        }

    engine, post = load_engine()
    require_tfidf_engine(engine)
    val_scores, val_hits, val_rows = score_validation_split(engine, post)
    calibrator = IsotonicRegression(increasing=True, out_of_bounds='clip', y_min=0.0, y_max=1.0).fit(val_scores, val_hits)
    test_scores, test_hits = score_and_hit(results['symptomBenchmark']['rows'])
    calibrated = calibrator.predict(test_scores)
    base_rate = float(val_hits.mean())
    brier = float(np.mean((calibrated - test_hits) ** 2))
    base_brier = float(np.mean((base_rate - test_hits) ** 2))
    reliability = []
    bins = np.clip((calibrated * ECE_BINS).astype(int), 0, ECE_BINS - 1)
    for b in range(ECE_BINS):
        mask = bins == b
        if mask.any():
            reliability.append({'calibratedRange': f'{b / ECE_BINS:.1f}-{(b + 1) / ECE_BINS:.1f}', 'rows': int(mask.sum()),
                                'meanCalibrated': rounded(calibrated[mask].mean()), 'observedAccuracy': rounded(test_hits[mask].mean())})

    update_results('calibration', {
        'clinicalValidation': CLINICAL_VALIDATION,
        'run': {'date': today_utc(), 'git': git_state(), 'seed': SEED, 'bootstrapResamples': N_BOOTSTRAP,
                'ciLevelPercent': CI_LEVEL_PERCENT},
        'protocol': protocol,
        'scoreIsNotAProbability': True,
        'testSets': per_test_set,
        'calibrationMap': {
            'label': 'Isotonic map fitted on the gretelai TRAIN split (validation); evaluated on the gretelai TEST split.',
            'validationRows': val_rows, 'validationRowsWithAPrediction': int(val_scores.size),
            'validationTop1Accuracy': rounded(base_rate),
            'testRows': int(test_scores.size),
            'testBrierScore': rounded(brier), 'testBaseRateBrierScore': rounded(base_brier),
            'brierBetterThanBaseRate': bool(brier < base_brier),
            'testExpectedCalibrationError': rounded(expected_calibration_error(calibrated, test_hits)),
            'eceBins': ECE_BINS,
            'testReliability': reliability,
            'mapSteps': [{'scoreFrom': rounded(x), 'calibratedValue': rounded(y)}
                         for x, y in zip(calibrator.X_thresholds_, calibrator.y_thresholds_)],
            'inputSentencesInBothSplits': shared_sentences(),
            'trainTestOverlapNote': 'Sentences that appear verbatim in both gretelai splits were not removed.',
        },
    })
    for section, block in per_test_set.items():
        print(section, 'correct median', block['correctTop1Scores'].get('median'), 'incorrect median',
              block['incorrectTop1Scores'].get('median'))
    print(f'calibration map: validation accuracy {base_rate:.3f}; test Brier {brier:.4f} vs base rate {base_brier:.4f}')


if __name__ == '__main__':
    main()
