"""Shared helpers for the offline data science study (offline study, not in production).

Code lives in ml-engine/evaluation/study/; outputs go to docs/report/study/ and ml-engine/evaluation/data/.
The scripts in ml-engine/evaluation/ (PR #47) are imported for data loading and for calling the real
application functions; nothing outside the study folder is modified.
"""
import csv
import hashlib
import json
import os
import sys

import numpy as np

STUDY_DIR = os.path.dirname(os.path.abspath(__file__))
EVAL_DIR = os.path.dirname(STUDY_DIR)
ML_DIR = os.path.dirname(EVAL_DIR)
REPO_ROOT = os.path.dirname(ML_DIR)
OUT_DIR = os.path.join(REPO_ROOT, 'docs', 'report', 'study')
DATA_DIR = os.path.join(EVAL_DIR, 'data')
RESULTS_PATH = os.path.join(OUT_DIR, 'study_results.json')
EVALUATION_RESULTS_PATH = os.path.join(EVAL_DIR, 'evaluation_results.json')

SEED = 20261116
N_BOOTSTRAP = 2000
CI_LEVEL_PERCENT = 95
BLOCK_WEEKS = 13
ROUND_DP = 6
STUDY_LABEL = 'offline study, not in production'
CLINICAL_VALIDATION = 'not_established'

for folder in (EVAL_DIR, STUDY_DIR):
    if folder not in sys.path:
        sys.path.insert(0, folder)

from eval_common import environment_info, git_state, read_json, sha256_file, today_utc, write_json  # noqa: E402


def rounded(value):
    if value is None:
        return None
    value = float(value)
    return None if np.isnan(value) else round(value, ROUND_DP)


def ratio(numerator, denominator):
    return rounded(numerator / denominator) if denominator else None


def percentile_interval(samples):
    tail = (100 - CI_LEVEL_PERCENT) / 2
    low, high = np.percentile(samples, [tail, 100 - tail])
    return [rounded(low), rounded(high)]


def bootstrap_mean_ci(values, rng):
    """Plain bootstrap interval for the mean of independent values."""
    values = np.asarray(values, dtype=float)
    if values.size == 0:
        return None
    indices = rng.integers(0, values.size, size=(N_BOOTSTRAP, values.size))
    return percentile_interval(values[indices].mean(axis=1))


def block_bootstrap_mean_ci(values, rng, block=BLOCK_WEEKS):
    """Moving-block bootstrap interval for the mean of a time-ordered series."""
    values = np.asarray(values, dtype=float)
    n = values.size
    if n == 0:
        return None
    block = min(block, n)
    count = -(-n // block)
    means = np.empty(N_BOOTSTRAP)
    for b in range(N_BOOTSTRAP):
        starts = rng.integers(0, n - block + 1, size=count)
        means[b] = np.concatenate([values[s:s + block] for s in starts])[:n].mean()
    return percentile_interval(means)


def write_csv(name, rows, columns):
    """Write rows (dicts) to docs/report/study/<name> with fixed columns and LF line endings."""
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name)
    with open(path, 'w', encoding='utf-8', newline='\n') as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, lineterminator='\n')
        writer.writeheader()
        for row in rows:
            writer.writerow({key: format_cell(row.get(key)) for key in columns})
    return path


def format_cell(value):
    if value is None:
        return ''
    if isinstance(value, float):
        return f'{value:.{ROUND_DP}f}'.rstrip('0').rstrip('.') if value != int(value) else str(int(value))
    if isinstance(value, (list, tuple)):
        return ';'.join(format_cell(v) for v in value)
    return str(value)


def update_study_results(section, payload):
    os.makedirs(OUT_DIR, exist_ok=True)
    results = read_json(RESULTS_PATH) if os.path.exists(RESULTS_PATH) else {}
    results['label'] = STUDY_LABEL
    results['clinicalValidation'] = CLINICAL_VALIDATION
    results['environment'] = {**environment_info(), **extra_versions()}
    results[section] = payload
    write_json(RESULTS_PATH, results)


def extra_versions():
    from importlib.metadata import version
    out = {}
    for package in ('statsmodels', 'prophet', 'cmdstanpy', 'matplotlib'):
        try:
            out[package] = version(package)
        except Exception:
            out[package] = 'not installed'
    return out


def run_record(seed=SEED):
    return {'date': today_utc(), 'git': git_state(), 'seed': seed, 'bootstrapResamples': N_BOOTSTRAP,
            'ciLevelPercent': CI_LEVEL_PERCENT, 'label': STUDY_LABEL}


def sha256_of_outputs(names):
    return {name: sha256_file(os.path.join(OUT_DIR, name)) for name in names if os.path.exists(os.path.join(OUT_DIR, name))}


def save_figure(fig, name):
    import matplotlib.pyplot as plt
    fig.tight_layout()
    fig.savefig(os.path.join(OUT_DIR, name), dpi=200, metadata={'Software': None})
    plt.close(fig)


def json_digest(payload):
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode('utf-8')).hexdigest()
