"""Paired tests on the SAVED rolling-origin forecasts (docs/report/study/forecast_predictions.csv).

    ml-engine/.venv/Scripts/python.exe ml-engine/evaluation/forecast_paired_tests.py

McNemar is not valid for numeric forecast errors, so absolute errors are compared with the Wilcoxon signed-rank test
and the Diebold-Mariano test. No model is refitted: the forecasts were produced by study/forecast_benchmark.py on
2026-11-16 (real OpenDengue Sri Lanka weekly counts). The published MAE/RMSE are reproduced FIRST; on a difference the
script stops. SciPy cannot be loaded on this machine (Windows Application Control), so the tests are implemented here
with NumPy and the standard library, and the Wilcoxon p-value is cross-checked by a sign-flip randomisation test.
"""
import csv
import hashlib
import json
import math
import os
import sys
from datetime import datetime, timezone

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
STUDY = os.path.join(ROOT, 'docs', 'report', 'study')
OUT = os.path.join(ROOT, 'docs', 'evidence', 'viva', 'forecast', 'forecast_paired_tests.json')
MODELS = ('naive', 'seasonalNaive', 'productionProjection', 'ets', 'sarima', 'prophet')
# naive = last value. Prophet vs SARIMA is the question asked; the rest are the baseline comparisons.
PAIRS = (('prophet', 'sarima'), ('prophet', 'naive'), ('prophet', 'seasonalNaive'), ('sarima', 'naive'), ('sarima', 'seasonalNaive'),
         ('productionProjection', 'naive'), ('productionProjection', 'seasonalNaive'))
SEED, FLIPS = 20261125, 20000


def normal_two_sided(z):
    return math.erfc(abs(z) / math.sqrt(2))


def wilcoxon(diff, rng):
    """Signed-rank test: zero differences dropped, average ranks, tie-corrected normal approximation; plus sign flips."""
    d = diff[diff != 0]
    n = d.size
    a = np.abs(d)
    _, inverse, counts = np.unique(a, return_inverse=True, return_counts=True)
    ends = np.cumsum(counts)
    ranks = ((ends - counts + 1 + ends) / 2)[inverse]
    w = float(ranks[d > 0].sum())
    mean = n * (n + 1) / 4
    var = n * (n + 1) * (2 * n + 1) / 24 - float((counts.astype(float) ** 3 - counts).sum()) / 48
    z = (w - mean) / math.sqrt(var)
    flips = (rng.integers(0, 2, size=(FLIPS, n)) * ranks).sum(axis=1)
    p_flip = (1 + int((np.abs(flips - mean) >= abs(w - mean) - 1e-9).sum())) / (FLIPS + 1)
    return {'nNonZero': int(n), 'zeroDifferences': int(diff.size - n), 'wPlus': w, 'z': round(z, 4),
            'p': normal_two_sided(z), 'pSignFlip': p_flip}


def diebold_mariano(diff, horizon):
    """Same definition as study/forecast_benchmark.py (Newey-West, lag h-1, normal p-value)."""
    n, mean = diff.size, diff.mean()
    c = diff - mean
    var = c @ c / n
    for lag in range(1, horizon):
        var += 2 * (1 - lag / horizon) * (c[lag:] @ c[:-lag]) / n
    if var <= 0:
        return {'statistic': None, 'p': None}
    s = float(mean / math.sqrt(var / n))
    return {'statistic': round(s, 4), 'p': normal_two_sided(s)}


def holm(pvalues):
    order, out, running = sorted(range(len(pvalues)), key=lambda i: pvalues[i]), [0.0] * len(pvalues), 0.0
    for k, i in enumerate(order):
        running = max(running, min(1.0, (len(pvalues) - k) * pvalues[i]))
        out[i] = running
    return out


def main():
    path = os.path.join(STUDY, 'forecast_predictions.csv')
    with open(path, encoding='utf-8') as handle:
        rows = list(csv.DictReader(handle))
    with open(os.path.join(STUDY, 'forecast_metrics.csv'), encoding='utf-8') as handle:
        published = {(int(r['horizon']), r['model']): r for r in csv.DictReader(handle)}
    with open(os.path.join(STUDY, 'study_results.json'), encoding='utf-8') as handle:
        study_dm = json.load(handle)['phaseA']['byHorizon']
    errors, origins = {}, {}
    for h in (1, 2, 4):
        for m in MODELS:
            sel = [r for r in rows if int(r['horizon']) == h and r['model'] == m]
            origins[h, m] = [r['origin'] for r in sel]
            errors[h, m] = np.array([abs(float(r['forecast']) - float(r['actual'])) for r in sel])
        if any(origins[h, m] != origins[h, 'naive'] for m in MODELS):
            raise SystemExit(f'Origins are not paired at horizon {h}; stopping.')
    table, bad = {}, []
    for (h, m), e in errors.items():
        mae, rmse = float(e.mean()), float(np.sqrt((e ** 2).mean()))
        p = published[h, m]
        if abs(mae - float(p['mae'])) > 1e-3 or abs(rmse - float(p['rmse'])) > 1e-3 or e.size != int(p['origins']):
            bad.append((h, m, mae, p['mae'], rmse, p['rmse']))
        table.setdefault(f'h{h}', {})[m] = {'origins': int(e.size), 'mae': round(mae, 1), 'rmse': round(rmse, 1)}
    for h in (1, 2, 4):  # the Diebold-Mariano code must match the published study statistic
        mine = diebold_mariano(errors[h, 'prophet'] - errors[h, 'sarima'], h)['statistic']
        theirs = study_dm[f'h{h}']['prophet_vs_sarima']['dieboldMarianoStatistic']
        if abs(mine - theirs) > 1e-3:
            bad.append((h, 'DM prophet_vs_sarima', mine, theirs))
    if bad:
        print('STOPPED: saved predictions do not reproduce the published figures:', bad)
        raise SystemExit(2)
    print('Published MAE, RMSE and origin counts (18 rows) and the 3 published Diebold-Mariano statistics reproduced.')

    rng, comparisons = np.random.default_rng(SEED), []
    for h in (1, 2, 4):
        for a, b in PAIRS:
            diff = errors[h, a] - errors[h, b]
            comparisons.append({
                'horizonWeeks': h, 'first': a, 'second': b, 'n': int(diff.size),
                'meanAbsErrorDifference_firstMinusSecond': round(float(diff.mean()), 2), 'medianAbsErrorDifference': round(float(np.median(diff)), 2),
                'firstBetterOrigins': int((diff < 0).sum()), 'secondBetterOrigins': int((diff > 0).sum()),
                'wilcoxon': wilcoxon(diff, rng), 'dieboldMariano': diebold_mariano(diff, h)})
    for key in ('wilcoxon', 'dieboldMariano'):
        for c, p in zip(comparisons, holm([c[key]['p'] for c in comparisons])):
            c[key]['pHolm21'] = p
    with open(path, 'rb') as handle:
        digest = hashlib.sha256(handle.read()).hexdigest()
    out = {
        'title': 'Paired tests on saved rolling-origin forecasts (real OpenDengue Sri Lanka weekly counts)',
        'generatedAtUtc': datetime.now(timezone.utc).isoformat(),
        'command': 'ml-engine/.venv/Scripts/python.exe ml-engine/evaluation/forecast_paired_tests.py',
        'python': sys.version.split()[0], 'numpy': np.__version__,
        'input': {'file': 'docs/report/study/forecast_predictions.csv', 'sha256': digest,
                  'producedBy': 'ml-engine/evaluation/study/forecast_benchmark.py, 2026-11-16; not refitted today'},
        'publishedMetricsReproduced': True, 'signFlips': FLIPS, 'seed': SEED, 'errors': table, 'comparisons': comparisons,
        'limits': ['Overlapping forecast origins are serially dependent: the Wilcoxon test assumes independent pairs, so its p-values are too small. Diebold-Mariano allows only for short (h-1) dependence and assumes a stationary loss difference, which the 2017 epidemic breaks.',
                   'Wilcoxon compares ranked paired differences, Diebold-Mariano the mean difference; they can disagree.',
                   'One disease, one national series. Only SARIMA was evaluated; a plain non-seasonal ARIMA was not a separate model.',
                   'Holm correction is over all 21 comparisons per test.', 'clinicalValidation: not_established'],
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8', newline='\n') as handle:
        json.dump(out, handle, indent=1)
        handle.write('\n')
    for h, r in table.items():
        print(h, 'n =', r['naive']['origins'], '(MAE, RMSE):', {m: (v['mae'], v['rmse']) for m, v in r.items()})
    for c in comparisons:
        w, d = c['wilcoxon'], c['dieboldMariano']
        print(f"h{c['horizonWeeks']} {c['first']} vs {c['second']}: mean diff {c['meanAbsErrorDifference_firstMinusSecond']}, "
              f"origins better {c['firstBetterOrigins']} vs {c['secondBetterOrigins']} | Wilcoxon p={w['p']:.3g} (Holm {w['pHolm21']:.3g}, sign-flip {w['pSignFlip']:.3g}) "
              f"| DM p={d['p']:.3g} (Holm {d['pHolm21']:.3g})")
    print('written docs/evidence/viva/forecast/forecast_paired_tests.json')


if __name__ == '__main__':
    main()
