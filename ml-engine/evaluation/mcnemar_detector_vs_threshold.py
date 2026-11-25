"""McNemar comparison: MediSync outbreak rule vs fixed 95th-percentile threshold, same 344 OpenDengue weeks.

    ml-engine/.venv/Scripts/python.exe ml-engine/evaluation/mcnemar_detector_vs_threshold.py

Nothing is retrained and no label rule is changed. Data, labels, the detector flags (the REAL evaluateOutbreakCriteria,
called through outbreak_bridge.cjs) and the out-of-sample 95th-percentile threshold all come from the existing
evaluation code (run_outbreak_backtest.py, study/detector_sweep.py). The published figures are reproduced FIRST; on any
difference the script stops and writes nothing.

Caveat built into the output: weekly counts are serially dependent (one long epidemic), so the McNemar p-value, which
assumes independent items, overstates the evidence. A moving-block bootstrap of the accuracy difference is reported too.
"""
import json
import os
import sys
from datetime import datetime, timezone
from fractions import Fraction
from math import comb

HERE = os.path.dirname(os.path.abspath(__file__))
for folder in (HERE, os.path.join(HERE, 'study')):
    if folder not in sys.path:
        sys.path.insert(0, folder)

import numpy as np  # noqa: E402

import detector_sweep as sweep  # noqa: E402
from run_outbreak_backtest import build_segments, load_weeks, reference_labels  # noqa: E402
from study_common import BLOCK_WEEKS, N_BOOTSTRAP, REPO_ROOT, SEED, git_state  # noqa: E402

OUT_DIR = os.path.join(REPO_ROOT, 'docs', 'evidence', 'viva', 'mcnemar')
OUT_PATH = os.path.join(OUT_DIR, 'mcnemar_detector_vs_threshold.json')

# Figures already in the report (strict reference R1). Counts are exact; the script stops if any differs.
REPORTED = {
    'detector': {'tp': 35, 'fn': 15, 'fp': 42, 'tn': 252, 'sensitivityPct': 70.0, 'specificityPct': 85.7, 'precisionPct': 45.5},
    'threshold': {'tp': 49, 'fn': 1, 'fp': 25, 'tn': 269, 'sensitivityPct': 98.0, 'specificityPct': 91.5},
}


def confusion(flags, truth):
    tp, fn = int((truth & flags).sum()), int((truth & ~flags).sum())
    fp, tn = int((~truth & flags).sum()), int((~truth & ~flags).sum())
    pct = lambda a, b: round(100 * a / b, 1)
    return {'tp': tp, 'fn': fn, 'fp': fp, 'tn': tn, 'sensitivityPct': pct(tp, tp + fn), 'specificityPct': pct(tn, tn + fp),
            'precisionPct': pct(tp, tp + fp), 'accuracyPct': pct(tp + tn, truth.size)}


def mismatches(actual, expected):
    return {k: {'reported': v, 'measured': actual[k]} for k, v in expected.items() if actual[k] != v}


def exact_mcnemar_p(b, c):
    """Two-sided exact McNemar p-value: Binomial(b + c, 1/2), p = min(1, 2 * P(X <= min(b, c))), in exact integers.

    Same definition as statsmodels mcnemar(table, exact=True). SciPy/statsmodels could not be loaded on this machine
    (a Windows Application Control policy blocks a SciPy DLL), so the value is computed exactly here and checked
    against an independent dynamic-programming calculation of the same binomial distribution.
    """
    n, k = b + c, min(b, c)
    if n == 0:
        return Fraction(1)
    p = min(Fraction(1), 2 * Fraction(sum(comb(n, i) for i in range(k + 1)), 2 ** n))
    ways = [1]
    for _ in range(n):  # row n of Pascal's triangle, built by addition only
        ways = [1] + [x + y for x, y in zip(ways, ways[1:])] + [1]
    if min(Fraction(1), 2 * Fraction(sum(ways[:k + 1]), sum(ways))) != p:
        raise SystemExit('The two exact calculations disagree; stopping.')
    return p


def paired(detector_ok, threshold_ok):
    """2x2 table of correctness; b = detector right and threshold wrong, c = detector wrong and threshold right."""
    both, b = int((detector_ok & threshold_ok).sum()), int((detector_ok & ~threshold_ok).sum())
    c, neither = int((~detector_ok & threshold_ok).sum()), int((~detector_ok & ~threshold_ok).sum())
    p = float(exact_mcnemar_p(b, c))
    return {'weeks': int(detector_ok.size), 'bothCorrect': both, 'b_detectorCorrect_thresholdWrong': b,
            'c_detectorWrong_thresholdCorrect': c, 'bothWrong': neither, 'discordant': b + c, 'mcnemarExactP': p,
            'detectorCorrect': both + b, 'thresholdCorrect': both + c,
            'differenceInProportionCorrect_detectorMinusThreshold': round((b - c) / detector_ok.size, 6)}


def block_bootstrap_difference(diff, rng, block=BLOCK_WEEKS):
    n, count = diff.size, -(-diff.size // block)
    means = np.empty(N_BOOTSTRAP)
    for i in range(N_BOOTSTRAP):
        starts = rng.integers(0, n - block + 1, size=count)
        means[i] = np.concatenate([diff[s:s + block] for s in starts])[:n].mean()
    low, high = np.percentile(means, [2.5, 97.5])
    return [round(float(low), 6), round(float(high), 6)]


def compare(rule_name, segment, counts, evaluable, detector_all, threshold):
    labels, periods = reference_labels(segment, sweep.REFERENCE_RULES[rule_name])
    weeks = [i for i in evaluable if labels[i] is not None]
    truth = np.array([bool(labels[i]) for i in weeks])
    detector = np.array([bool(detector_all[i]) for i in weeks])
    fixed = np.array([bool(counts[i] > threshold) for i in weeks])
    d_ok, t_ok = detector == truth, fixed == truth
    rng = np.random.default_rng(SEED)
    return {
        'rule': sweep.REFERENCE_RULES[rule_name], 'weeks': len(weeks), 'outbreakWeeks': int(truth.sum()), 'nonOutbreakWeeks': int((~truth).sum()),
        'outbreakPeriods': [{'start': segment[s]['date'].isoformat(), 'end': segment[e]['date'].isoformat()} for s, e in periods],
        'detector': confusion(detector, truth), 'threshold': confusion(fixed, truth),
        'mcnemar': {'allWeeks': paired(d_ok, t_ok), 'outbreakWeeksOnly_sensitivity': paired(d_ok[truth], t_ok[truth]),
                    'nonOutbreakWeeksOnly_specificity': paired(d_ok[~truth], t_ok[~truth])},
        'accuracyDifferenceBlockBootstrapCi95': {'detectorMinusThreshold': round(float(d_ok.mean() - t_ok.mean()), 6),
                                                  'ci95': block_bootstrap_difference(d_ok.astype(float) - t_ok.astype(float), rng),
                                                  'blockWeeks': BLOCK_WEEKS, 'resamples': N_BOOTSTRAP, 'seed': SEED},
        'perWeek': [{'week': segment[i]['date'].isoformat(), 'count': int(counts[i]), 'truth': bool(tr), 'detector': bool(d), 'threshold': bool(f)}
                    for i, tr, d, f in zip(weeks, truth, detector, fixed)],
    }


def main():
    manifest, weeks, _ = load_weeks()
    segment = build_segments(weeks, sweep.MAX_IMPUTED_WEEKS)[0]
    counts = np.array([w['count'] for w in segment], dtype=float)
    first_week = sweep.BASELINE_UNITS + sweep.WINDOW_UNITS - 1
    evaluable = [i for i in range(first_week, len(segment)) if not segment[i]['imputed']]
    detector_all = sweep.production_flags(segment, evaluable)          # the real JavaScript rule
    threshold = float(np.percentile(counts[:first_week], 95))          # weeks before the first evaluated week only

    primary = compare('R1_strict', segment, counts, evaluable, detector_all, threshold)
    difference = {name: d for name in REPORTED if (d := mismatches(primary[name], REPORTED[name]))}
    if primary['weeks'] != 344:
        difference['weeks'] = {'reported': 344, 'measured': primary['weeks']}
    if difference:
        print(json.dumps({'STOPPED': 'Measured figures differ from the report; nothing written.', 'difference': difference}, indent=1))
        raise SystemExit(2)
    print('Report figures reproduced exactly (counts and percentages).')

    out = {
        'title': 'McNemar: MediSync outbreak rule vs fixed 95th-percentile threshold',
        'generatedAtUtc': datetime.now(timezone.utc).isoformat(), 'command': 'ml-engine/.venv/Scripts/python.exe ml-engine/evaluation/mcnemar_detector_vs_threshold.py',
        'git': git_state(), 'environment': {'python': sys.version.split()[0], 'numpy': np.__version__, 'pValueMethod': 'exact binomial in integer arithmetic (SciPy/statsmodels blocked by Windows Application Control on this machine)'},
        'dataset': {'name': manifest['name'], 'sha256': manifest['sha256'], 'note': 'One national weekly count is fed as one detector day: a proxy for the production daily district detector.'},
        'thresholdValue': threshold, 'thresholdSource': f'95th percentile of the {first_week} weeks before the first evaluated week (out of sample)',
        'reportFiguresReproduced': True, 'reportedFigures': REPORTED,
        'primary_R1_strict': primary,
        'secondary_R2_moderate': compare('R2_moderate', segment, counts, evaluable, detector_all, threshold),
        'limits': ['Exact McNemar assumes independent weeks. These weeks are serially dependent and 49 of the 50 strict outbreak weeks belong to one epidemic (2017), so the p-values overstate the evidence.',
                   'One disease, one country, national weekly totals: this tests the rule on a proxy series, not the live platform.',
                   'Non-significance on a subset is not evidence that the two methods are equivalent.', 'clinicalValidation: not_established'],
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT_PATH, 'w', encoding='utf-8', newline='\n') as handle:
        json.dump(out, handle, indent=1)
        handle.write('\n')
    for name in ('primary_R1_strict', 'secondary_R2_moderate'):
        block = out[name]
        print(name, '| detector', block['detector'], '| threshold', block['threshold'])
        for part, r in block['mcnemar'].items():
            print(f"  {part}: n={r['weeks']} b={r['b_detectorCorrect_thresholdWrong']} c={r['c_detectorWrong_thresholdCorrect']} exact p={r['mcnemarExactP']:.6g}")
        print('  accuracy difference (detector - threshold) block bootstrap:', block['accuracyDifferenceBlockBootstrapCi95'])
    print('written', os.path.relpath(OUT_PATH, REPO_ROOT))


if __name__ == '__main__':
    main()
