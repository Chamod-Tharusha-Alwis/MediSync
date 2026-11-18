"""Draws the three outbreak charts for the report from SAVED evaluation outputs (no model is re-run or retrained).

    ml-engine/.venv/Scripts/python.exe report-evidence/scripts/charts.py

Inputs (read-only):
  ml-engine/evaluation/evaluation_results.json   outbreakBacktest.detector.weeks (OpenDengue, 344 evaluated weeks)
  docs/report/study/forecast_metrics.csv          Phase A forecast benchmark (MAE by method and horizon)
  docs/report/study/detector_sweep.csv            Phase B detector sweep (production rule vs fixed thresholds)
Outputs: report-evidence/charts/*.png (1600 x 900 px).
"""
import csv
import json
import os
from datetime import datetime

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402
import matplotlib.dates as mdates  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'report-evidence', 'charts')
os.makedirs(OUT, exist_ok=True)
SIZE = dict(figsize=(16, 9), dpi=100)
plt.rcParams.update({'font.size': 14, 'axes.titlesize': 17, 'axes.labelsize': 15, 'legend.fontsize': 13})


def save(fig, name):
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, name), dpi=100, metadata={'Software': None})
    plt.close(fig)
    print('wrote', name)


# 1. Detector on OpenDengue weekly counts
with open(os.path.join(ROOT, 'ml-engine', 'evaluation', 'evaluation_results.json'), encoding='utf-8') as fh:
    det = json.load(fh)['outbreakBacktest']['detector']
weeks = [w for w in det['weeks'] if w.get('segment', 0) == 0]
dates = [datetime.strptime(w['week'], '%Y-%m-%d') for w in weeks]
counts = [w['count'] for w in weeks]
fig, ax = plt.subplots(**SIZE)
ax.plot(dates, counts, color='#333333', lw=1.6, label='Weekly dengue cases (OpenDengue, Sri Lanka)')
ref = [(d, c) for d, c, w in zip(dates, counts, weeks) if w['reference']]
flag = [(d, c) for d, c, w in zip(dates, counts, weeks) if w['flag']]
if ref:
    ax.scatter([d for d, _ in ref], [c for _, c in ref], s=90, facecolors='none', edgecolors='#1f77b4', lw=1.8,
               label=f'True outbreak (reference) week, n={len(ref)}')
if flag:
    ax.scatter([d for d, _ in flag], [c for _, c in flag], s=28, color='#d62728', marker='^',
               label=f'Detector alert week (z > 2.0 on 2 consecutive units), n={len(flag)}')
ax.set_xlabel('Week')
ax.set_ylabel('Reported dengue cases per week')
ax.set_title(f'MediSync outbreak detector on OpenDengue weekly counts ({det["evaluatedWeeks"]} evaluated weeks)')
ax.xaxis.set_major_locator(mdates.YearLocator())
ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y'))
ax.grid(alpha=0.3)
ax.legend(loc='upper left')
save(fig, 'detector_on_opendengue.png')

# 2. Forecast error by method (MAE, 1/2/4 weeks)
with open(os.path.join(ROOT, 'docs', 'report', 'study', 'forecast_metrics.csv'), encoding='utf-8') as fh:
    rows = list(csv.DictReader(fh))
methods = [('productionProjection', 'Product projection'), ('naive', 'Last value (naive)'), ('seasonalNaive', 'Seasonal naive'),
           ('ets', 'ETS'), ('sarima', 'SARIMA'), ('prophet', 'Prophet')]
horizons = ['1', '2', '4']
colors = ['#d62728', '#7f7f7f', '#bcbd22', '#1f77b4', '#2ca02c', '#9467bd']
fig, ax = plt.subplots(**SIZE)
width = 0.13
for i, (key, label) in enumerate(methods):
    vals = [float(next(r['mae'] for r in rows if r['model'] == key and r['horizon'] == h)) for h in horizons]
    xs = [j + (i - 2.5) * width for j in range(len(horizons))]
    bars = ax.bar(xs, vals, width, label=label, color=colors[i])
    for x, v in zip(xs, vals):
        ax.text(x, v + 8, f'{v:.0f}', ha='center', va='bottom', fontsize=10)
origins = sorted({r['origins'] for r in rows})
ax.set_xticks(range(len(horizons)))
ax.set_xticklabels([f'{h} week ahead' for h in horizons])
ax.set_xlabel('Forecast horizon')
ax.set_ylabel('Mean absolute error (cases per week)')
ax.set_title(f'Forecast error by method, OpenDengue Sri Lanka weekly (rolling origins: {", ".join(origins)})')
ax.grid(axis='y', alpha=0.3)
ax.set_ylim(0, ax.get_ylim()[1] * 1.25)
ax.legend(ncol=6, loc='upper center', fontsize=12)
save(fig, 'forecast_error_by_method.png')

# 3. Detector vs fixed 95th-percentile threshold (sensitivity, specificity, F1)
with open(os.path.join(ROOT, 'docs', 'report', 'study', 'detector_sweep.csv'), encoding='utf-8') as fh:
    sweep = list(csv.DictReader(fh))
pick = {(r['reference'], r['configuration']): r for r in sweep}
groups = [('R1_strict', 'Strict reference'), ('R2_moderate', 'Moderate reference')]
configs = [('z2.0_persist', 'MediSync detector (z 2.0 + 2-day persistence)', '#d62728'), ('fixed_p95', 'Fixed 95th-percentile threshold', '#7f7f7f')]
fig, axes = plt.subplots(1, 2, sharey=True, **SIZE)
for ax, (ref_key, ref_label) in zip(axes, groups):
    metrics = ['Sensitivity', 'Specificity', 'F1']
    for i, (cfg, label, color) in enumerate(configs):
        r = pick[(ref_key, cfg)]
        vals = [float(r['recall']), 1 - float(r['falseAlarmRate']), float(r['f1'])]
        xs = [j + (i - 0.5) * 0.36 for j in range(3)]
        ax.bar(xs, vals, 0.36, label=label, color=color)
        for x, v in zip(xs, vals):
            ax.text(x, v + 0.01, f'{v:.2f}', ha='center', va='bottom', fontsize=12)
    ax.set_xticks(range(3))
    ax.set_xticklabels(metrics)
    ax.set_ylim(0, 1.25)
    ax.set_title(f'{ref_label} (344 weeks)')
    ax.grid(axis='y', alpha=0.3)
axes[0].set_ylabel('Score (0 to 1)')
axes[0].legend(loc='upper left', ncol=2, fontsize=12)
fig.suptitle('Detector vs fixed 95th-percentile threshold on OpenDengue weekly counts', fontsize=17)
save(fig, 'detector_vs_fixed_threshold.png')
