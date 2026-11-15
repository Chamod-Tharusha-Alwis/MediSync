"""V4: back-test of the MediSync outbreak detector and projection on OpenDengue Sri Lanka weekly counts.

Follows outbreak_backtest_protocol.json, committed before this script first ran. The detector
(evaluateOutbreakCriteria) and projection (calculate14DayForecast) are the real server functions,
called unchanged through outbreak_bridge.cjs.

These are public aggregate national counts, not MediSync consultations: this tests the algorithms,
not the platform.

Usage:  python ml-engine/evaluation/run_outbreak_backtest.py
"""
import csv
import datetime as dt
import io
import json
import os
import subprocess
import zipfile

import numpy as np

from eval_common import CLINICAL_VALIDATION, EVAL_DIR, dataset_entry, git_state, read_json, today_utc, update_results
from fetch_datasets import zip_member

PROTOCOL_PATH = os.path.join(EVAL_DIR, 'outbreak_backtest_protocol.json')
BRIDGE_PATH = os.path.join(EVAL_DIR, 'outbreak_bridge.cjs')
COUNTRY = 'SRI LANKA'
SEED = 20261117
N_BOOTSTRAP = 2000
CI_LEVEL_PERCENT = 95
ROUND_DP = 6
WEEK = dt.timedelta(days=7)
DETECTOR_SPAN_WEEKS = 63
WEEKS_PER_YEAR = 52


def rounded(value):
    return None if value is None else round(float(value), ROUND_DP)


# ---------------------------------------------------------------- data
def load_weeks():
    entry = dataset_entry('opendengue_national')
    with zipfile.ZipFile(entry['path']) as archive:
        with archive.open(zip_member(archive)) as handle:
            rows = [r for r in csv.DictReader(io.TextIOWrapper(handle, encoding='utf-8'))
                    if r['adm_0_name'] == COUNTRY and r['T_res'] == 'Week' and r['S_res'] == 'Admin0']
    weeks = {dt.date.fromisoformat(r['calendar_start_date']): int(round(float(r['dengue_total']))) for r in rows}
    return {k: v for k, v in entry.items() if k != 'path'}, weeks, len(rows)


def build_segments(weeks, max_imputed):
    """Weekly grid split at long gaps; short gaps filled by linear interpolation and marked imputed."""
    dates = sorted(weeks)
    segments, current = [], [{'date': dates[0], 'count': weeks[dates[0]], 'imputed': False}]
    for previous, date in zip(dates, dates[1:]):
        missing = (date - previous).days // 7 - 1
        if missing > max_imputed:
            segments.append(current)
            current = []
        else:
            for k in range(1, missing + 1):
                share = k / (missing + 1)
                current.append({'date': previous + k * WEEK, 'imputed': True,
                                'count': int(round(weeks[previous] + share * (weeks[date] - weeks[previous])))})
        current.append({'date': date, 'count': weeks[date], 'imputed': False})
    segments.append(current)
    return segments


# ---------------------------------------------------------------- reference outbreak periods
def week_of_year(date):
    return (date + dt.timedelta(days=1)).isocalendar()[1]


def circular_distance(a, b):
    d = abs(a - b) % WEEKS_PER_YEAR
    return min(d, WEEKS_PER_YEAR - d)


def reference_labels(segment, rule):
    labels = [None] * len(segment)
    for i, week in enumerate(segment):
        if week['imputed']:
            continue
        woy, year = week_of_year(week['date']), week['date'].year
        others = [w['count'] for w in segment if not w['imputed'] and w['date'].year != year
                  and circular_distance(week_of_year(w['date']), woy) <= rule['seasonalWindowWeeks']]
        if len(others) < 2:
            continue
        threshold = np.mean(others) + rule['thresholdSd'] * np.std(others, ddof=1)
        labels[i] = bool(week['count'] > threshold)
    periods, start = [], None
    for i in range(len(segment) + 1):
        epidemic = i < len(segment) and labels[i] is True
        if epidemic and start is None:
            start = i
        if not epidemic and start is not None:
            if i - start >= rule['minConsecutiveWeeks']:
                periods.append((start, i - 1))
            start = None
    return labels, periods


# ---------------------------------------------------------------- statistics
def block_bootstrap_ci(values, rng, block):
    values = np.asarray(values, dtype=float)
    n = values.size
    if n == 0:
        return None
    block = min(block, n)
    blocks = -(-n // block)
    means = np.empty(N_BOOTSTRAP)
    for b in range(N_BOOTSTRAP):
        starts = rng.integers(0, n - block + 1, size=blocks)
        means[b] = np.concatenate([values[s:s + block] for s in starts])[:n].mean()
    tail = (100 - CI_LEVEL_PERCENT) / 2
    low, high = np.percentile(means, [tail, 100 - tail])
    return [rounded(low), rounded(high)]


def ratio(a, b):
    return rounded(a / b) if b else None


def bridge(series, detector_weeks, origins, training, horizon):
    task = {'series': [{'date': w['date'].isoformat(), 'count': w['count']} for w in series],
            'detectorWeeks': detector_weeks,
            'projection': {'origins': origins, 'trainingWeeks': training, 'forecastWeeks': horizon}}
    done = subprocess.run(['node', BRIDGE_PATH], input=json.dumps(task), capture_output=True, text=True, check=True)
    return json.loads(done.stdout)


# ---------------------------------------------------------------- main
def main():
    protocol = read_json(PROTOCOL_PATH)
    rule, det_rule, proj = protocol['referenceOutbreakRule'], protocol['detector'], protocol['projection']
    manifest, weeks, source_rows = load_weeks()
    segments = build_segments(weeks, protocol['gaps']['maxImputedWeeks'])
    rng = np.random.default_rng(SEED)
    block = proj['blockWeeks']
    horizons = proj['horizonsWeeks']
    max_h = max(horizons)

    week_rows, periods_all, detector_records, projection_errors = [], [], [], {h: [] for h in horizons}
    segment_summaries = []
    model_types = {}
    for s_index, segment in enumerate(segments):
        labels, periods = reference_labels(segment, rule)
        detector_weeks = [i for i in range(DETECTOR_SPAN_WEEKS - 1, len(segment)) if not segment[i]['imputed']]
        origins = [t for t in range(proj['trainingWeeks'] - 1, len(segment) - 1)]
        out = bridge(segment, detector_weeks, origins, proj['trainingWeeks'], max_h) if (detector_weeks or origins) else {'detector': [], 'projection': []}
        flags = {row['index']: row for row in out['detector']}
        segment_summaries.append({'segment': s_index, 'firstWeek': segment[0]['date'].isoformat(), 'lastWeek': segment[-1]['date'].isoformat(),
                                  'weeks': len(segment), 'imputedWeeks': sum(w['imputed'] for w in segment),
                                  'detectorEvaluableWeeks': len(detector_weeks), 'referenceOutbreakPeriods': len(periods)})

        evaluable = sorted(flags)
        first_evaluable = evaluable[0] if evaluable else None
        for i in evaluable:
            if labels[i] is None:
                continue
            week_rows.append({'segment': s_index, 'week': segment[i]['date'].isoformat(), 'count': segment[i]['count'],
                              'reference': labels[i], 'flag': flags[i]['triggered'], 'maxZ': flags[i]['maxZ']})
        early = det_rule['earlyWeeks']
        for start, end in periods:
            in_range = first_evaluable is not None and start - early >= first_evaluable
            flagged = [i for i in range(start - early, end + 1) if i in flags and flags[i]['triggered']]
            periods_all.append({'segment': s_index, 'start': segment[start]['date'].isoformat(), 'end': segment[end]['date'].isoformat(),
                                'weeks': end - start + 1, 'peakCount': max(segment[i]['count'] for i in range(start, end + 1)),
                                'evaluable': in_range, 'detected': bool(flagged) if in_range else None,
                                'delayWeeks': (flagged[0] - start) if (in_range and flagged) else None})
        covered = set()
        for start, end in periods:
            covered.update(range(start - early, end + 1))
        run = []
        for i in evaluable + [None]:
            if i is not None and flags[i]['triggered'] and (not run or i == run[-1] + 1):
                run.append(i)
                continue
            if run:
                detector_records.append({'segment': s_index, 'start': segment[run[0]]['date'].isoformat(), 'weeks': len(run),
                                         'overlapsReferencePeriod': any(j in covered for j in run)})
            run = [i] if (i is not None and flags[i]['triggered']) else []

        for row in out['projection']:
            t = row['index']
            model_types[row['modelType']] = model_types.get(row['modelType'], 0) + 1
            for h in horizons:
                target, seasonal = t + h, t + h - WEEKS_PER_YEAR
                if target >= len(segment) or segment[target]['imputed'] or seasonal < 0:
                    continue
                f = row['forecast'][h - 1]
                actual = segment[target]['count']
                projection_errors[h].append({'segment': s_index, 'origin': segment[t]['date'].isoformat(), 'actual': actual,
                                             'projection': f['predicted'], 'lower': f['lower'], 'upper': f['upper'],
                                             'lastValue': segment[t]['count'], 'seasonalNaive': segment[seasonal]['count']})

    ref = np.array([r['reference'] for r in week_rows], dtype=bool)
    flag = np.array([r['flag'] for r in week_rows], dtype=bool)
    tp, fn, fp, tn = int((ref & flag).sum()), int((ref & ~flag).sum()), int((~ref & flag).sum()), int((~ref & ~flag).sum())
    detected = [p for p in periods_all if p['evaluable']]
    delays = [p['delayWeeks'] for p in detected if p['detected']]
    false_episodes = [e for e in detector_records if not e['overlapsReferencePeriod']]

    projection_summary = {}
    for h in horizons:
        rows = projection_errors[h]
        errors = {m: np.array([abs(r[m] - r['actual']) for r in rows], dtype=float) for m in ('projection', 'lastValue', 'seasonalNaive')}
        inside = np.array([r['lower'] <= r['actual'] <= r['upper'] for r in rows], dtype=float)
        projection_summary[f'h{h}'] = {
            'origins': len(rows),
            'mae': {m: {'value': rounded(v.mean()) if v.size else None, 'ci95': block_bootstrap_ci(v, rng, block)} for m, v in errors.items()},
            'projectionMinusBaselineMae': {b: {'value': rounded((errors['projection'] - errors[b]).mean()) if rows else None,
                                               'ci95': block_bootstrap_ci(errors['projection'] - errors[b], rng, block)}
                                           for b in ('lastValue', 'seasonalNaive')},
            'intervalCoverage': {'value': rounded(inside.mean()) if inside.size else None, 'ci95': block_bootstrap_ci(inside, rng, block),
                                 'nominalPercent': CI_LEVEL_PERCENT},
        }

    update_results('outbreakBacktest', {
        'clinicalValidation': CLINICAL_VALIDATION,
        'scope': protocol['whatThisTests'],
        'run': {'date': today_utc(), 'git': git_state(), 'seed': SEED, 'bootstrapResamples': N_BOOTSTRAP,
                'ciLevelPercent': CI_LEVEL_PERCENT, 'ciMethod': f'moving-block bootstrap, block {block} weeks'},
        'protocol': protocol,
        'dataset': {**manifest, 'sriLankaWeeklyRows': source_rows},
        'segments': segment_summaries,
        'detector': {
            'evaluatedWeeks': len(week_rows),
            'referenceEpidemicWeeks': int(ref.sum()),
            'confusion': {'truePositive': tp, 'falseNegative': fn, 'falsePositive': fp, 'trueNegative': tn},
            'weekSensitivity': {'value': ratio(tp, tp + fn), 'ci95': block_bootstrap_ci(flag[ref].astype(float), rng, block)},
            'weekSpecificity': {'value': ratio(tn, tn + fp), 'ci95': block_bootstrap_ci((~flag[~ref]).astype(float), rng, block)},
            'weekPrecision': {'value': ratio(tp, tp + fp), 'ci95': block_bootstrap_ci(ref[flag].astype(float), rng, block)},
            'referencePeriods': periods_all,
            'evaluablePeriods': len(detected),
            'detectedPeriods': sum(1 for p in detected if p['detected']),
            'detectionDelayWeeks': {'values': delays, 'median': rounded(np.median(delays)) if delays else None},
            'flagEpisodes': len(detector_records),
            'falseAlarmEpisodes': len(false_episodes),
            'falseAlarmEpisodeList': false_episodes,
            'weeks': week_rows,
        },
        'projection': {'modelTypesUsed': model_types, 'byHorizon': projection_summary,
                       'errors': {f'h{h}': projection_errors[h] for h in horizons}},
    })
    print(json.dumps({'detector': {'weeks': len(week_rows), 'tp': tp, 'fn': fn, 'fp': fp, 'tn': tn,
                                   'periods': len(detected), 'detected': sum(1 for p in detected if p['detected']),
                                   'falseAlarmEpisodes': len(false_episodes)},
                      'projection': {h: {m: v['value'] for m, v in s['mae'].items()} | {'coverage': s['intervalCoverage']['value'], 'n': s['origins']}
                                     for h, s in projection_summary.items()}}, indent=1))


if __name__ == '__main__':
    main()
