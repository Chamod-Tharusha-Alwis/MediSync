"""Phase B: outbreak detector threshold sweep on OpenDengue Sri Lanka weekly counts (offline study, not in production).

Follows docs/report/study/PROTOCOL.md, Phase B. The production rule (evaluateOutbreakCriteria) is re-implemented here
so the z threshold can vary; at z = 2.0 with persistence it must reproduce the real function's flags exactly, or the
run stops. National weekly counts are a proxy for the production daily, district, episode-based detector.

Usage:  python ml-engine/evaluation/study/detector_sweep.py
"""
import json
import os
import subprocess

import numpy as np

from study_common import EVAL_DIR, STUDY_LABEL, ratio, rounded, run_record, save_figure, update_study_results, write_csv
from run_outbreak_backtest import build_segments, load_weeks, reference_labels

BRIDGE_PATH = os.path.join(EVAL_DIR, 'outbreak_bridge.cjs')
MAX_IMPUTED_WEEKS = 3
BASELINE_UNITS = 56
WINDOW_UNITS = 7
CASE_FLOOR = 5
MIN_SD = 0.5
ZERO_MEAN_SUBSTITUTE = 0.1
Z_THRESHOLDS = (1.5, 2.0, 2.5, 3.0)
PRODUCTION_Z = 2.0
FIXED_PERCENTILES = (75, 90, 95)
EARLY_WEEKS = 2
REFERENCE_RULES = {
    'R1_strict': {'thresholdSd': 2, 'seasonalWindowWeeks': 2, 'minConsecutiveWeeks': 2},
    'R2_moderate': {'thresholdSd': 1, 'seasonalWindowWeeks': 2, 'minConsecutiveWeeks': 2},
}


def production_flags(segment, weeks):
    task = {'series': [{'date': w['date'].isoformat(), 'count': w['count']} for w in segment], 'detectorWeeks': weeks, 'projection': {'origins': []}}
    done = subprocess.run(['node', BRIDGE_PATH], input=json.dumps(task), capture_output=True, text=True, check=True)
    return {row['index']: row['triggered'] for row in json.loads(done.stdout)['detector']}


def window_z(counts, week):
    """Daily z-scores of the 7-unit window ending at `week`, with the production regularisation rule."""
    window = counts[week - WINDOW_UNITS + 1:week + 1]
    baseline = counts[week - WINDOW_UNITS + 1 - BASELINE_UNITS:week - WINDOW_UNITS + 1]
    mean = baseline.mean()
    sd = baseline.std(ddof=1)
    if sd < MIN_SD:
        sd = max(MIN_SD, np.sqrt(mean))
        if mean == 0:
            mean, sd = ZERO_MEAN_SUBSTITUTE, MIN_SD
    return window, (window - mean) / sd


def detector_flag(counts, week, threshold, persistence):
    window, z = window_z(counts, week)
    if window.sum() < CASE_FLOOR:
        return False
    elevated = (z > threshold) & (window > 0)
    if not persistence:
        return bool(elevated.any())
    run = best = 0
    for flag in elevated:
        run = run + 1 if flag else 0
        best = max(best, run)
    return best >= 2


def score(flags, labels, periods, evaluated):
    ref = np.array([labels[i] for i in evaluated], dtype=bool)
    flag = np.array([flags[i] for i in evaluated], dtype=bool)
    tp, fn, fp, tn = int((ref & flag).sum()), int((ref & ~flag).sum()), int((~ref & flag).sum()), int((~ref & ~flag).sum())
    precision, recall = ratio(tp, tp + fp), ratio(tp, tp + fn)
    delays = []
    for start, end in periods:
        hit = [i for i in range(start - EARLY_WEEKS, end + 1) if flags.get(i)]
        delays.append(hit[0] - start if hit else None)
    detected = [d for d in delays if d is not None]
    return {'tp': tp, 'fn': fn, 'fp': fp, 'tn': tn, 'precision': precision, 'recall': recall,
            'f1': rounded(2 * precision * recall / (precision + recall)) if precision and recall else 0.0,
            'falseAlarmRate': ratio(fp, fp + tn), 'periods': len(periods), 'periodsDetected': len(detected),
            'delaysWeeks': delays, 'medianDelayWeeks': rounded(np.median(detected)) if detected else None}


def main():
    manifest, weeks, _ = load_weeks()
    segment = build_segments(weeks, MAX_IMPUTED_WEEKS)[0]
    counts = np.array([w['count'] for w in segment], dtype=float)
    first_week = BASELINE_UNITS + WINDOW_UNITS - 1
    evaluable = [i for i in range(first_week, len(segment)) if not segment[i]['imputed']]

    # Check the re-implementation against the real function at the production setting.
    real = production_flags(segment, evaluable)
    mine = {i: detector_flag(counts, i, PRODUCTION_Z, True) for i in evaluable}
    mismatches = [i for i in evaluable if real[i] != mine[i]]
    if mismatches:
        raise SystemExit(f'Re-implementation differs from evaluateOutbreakCriteria on {len(mismatches)} weeks; stopping.')

    fixed_thresholds = {p: float(np.percentile(counts[:first_week], p)) for p in FIXED_PERCENTILES}
    configurations = [(f'z{z}_{"persist" if persist else "single"}', 'production_rule', {'z': z, 'persistence': persist},
                       {i: detector_flag(counts, i, z, persist) for i in evaluable})
                      for z in Z_THRESHOLDS for persist in (True, False)]
    configurations += [(f'fixed_p{p}', 'fixed_threshold', {'threshold': rounded(t)}, {i: bool(counts[i] > t) for i in evaluable})
                       for p, t in fixed_thresholds.items()]

    rows, by_rule = [], {}
    for rule_name, rule in REFERENCE_RULES.items():
        labels, periods = reference_labels(segment, rule)
        evaluated = [i for i in evaluable if labels[i] is not None]
        by_rule[rule_name] = {'rule': rule, 'evaluatedWeeks': len(evaluated), 'epidemicWeeks': int(sum(bool(labels[i]) for i in evaluated)),
                              'periods': [{'start': segment[s]['date'].isoformat(), 'end': segment[e]['date'].isoformat(), 'weeks': e - s + 1} for s, e in periods],
                              'configurations': {}}
        for name, family, settings, flags in configurations:
            result = score(flags, labels, periods, evaluated)
            by_rule[rule_name]['configurations'][name] = {'family': family, **settings, **result}
            rows.append({'reference': rule_name, 'configuration': name, 'family': family, 'z': settings.get('z'),
                         'persistence': settings.get('persistence'), 'fixedThreshold': settings.get('threshold'),
                         'flaggedWeeks': int(sum(flags.values())), **result})
    write_csv('detector_sweep.csv', rows, ['reference', 'configuration', 'family', 'z', 'persistence', 'fixedThreshold', 'flaggedWeeks',
                                           'tp', 'fn', 'fp', 'tn', 'precision', 'recall', 'f1', 'falseAlarmRate', 'periods',
                                           'periodsDetected', 'delaysWeeks', 'medianDelayWeeks'])
    draw(rows)
    update_study_results('phaseB', {
        'label': STUDY_LABEL, 'run': run_record(),
        'proxyStatement': ('National weekly counts, one week fed as one detector day, are a proxy for the production detector, '
                           'which runs on daily consultation episodes per district. This tests the rule, not the platform.'),
        'dataset': {'name': manifest['name'], 'sha256': manifest['sha256']},
        'segment': {'weeks': len(segment), 'evaluableWeeks': len(evaluable), 'firstEvaluatedWeek': segment[first_week]['date'].isoformat()},
        'reimplementationCheck': {'weeksCompared': len(evaluable), 'mismatches': len(mismatches), 'productionZ': PRODUCTION_Z},
        'fixedThresholds': {f'p{p}': rounded(t) for p, t in fixed_thresholds.items()},
        'byReference': by_rule,
    })
    for row in rows:
        print(f"{row['reference']:12} {row['configuration']:16} recall={row['recall']} FAR={row['falseAlarmRate']} F1={row['f1']} "
              f"detected={row['periodsDetected']}/{row['periods']} delay={row['medianDelayWeeks']}")


def draw(rows):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, 2, figsize=(8.2, 3.8), sharey=True)
    for ax, rule in zip(axes, REFERENCE_RULES):
        for row in rows:
            if row['reference'] != rule:
                continue
            marker = {'production_rule': 'o', 'fixed_threshold': 's'}[row['family']]
            colour = 'tab:blue' if row.get('persistence') else ('tab:orange' if row['family'] == 'production_rule' else 'tab:gray')
            ax.scatter(row['falseAlarmRate'] or 0, row['recall'] or 0, marker=marker, color=colour, s=30)
            ax.annotate(row['configuration'], (row['falseAlarmRate'] or 0, row['recall'] or 0), fontsize=6, xytext=(3, 3), textcoords='offset points')
        ax.set_xlabel('False-alarm rate (FP / (FP + TN))')
        ax.set_title(f'Reference {rule}', fontsize=9)
        ax.set_xlim(-0.02, 1.02)
        ax.set_ylim(-0.02, 1.02)
    axes[0].set_ylabel('Recall (epidemic weeks flagged)')
    fig.suptitle(f'Detector sweep on OpenDengue Sri Lanka weekly counts ({STUDY_LABEL}; blue = persistence on, orange = off, grey = fixed threshold)', fontsize=8)
    save_figure(fig, 'detector_tradeoff.png')


if __name__ == '__main__':
    main()
