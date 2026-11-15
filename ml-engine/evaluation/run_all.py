"""Run the whole public-data evaluation (V1 to V4) and write the results, figures and report.

    python ml-engine/evaluation/run_all.py              download datasets, then run everything
    python ml-engine/evaluation/run_all.py --offline    reuse datasets already in ml-engine/evaluation/data/

Use the ml-engine virtual environment's Python (it has scikit-learn and matplotlib). Node must be on PATH
for the outbreak back-test. FDA labels are fetched once by verify_interaction_sources.py and cached.

Outputs: ml-engine/evaluation/evaluation_results.json, ml-engine/evaluation/*.png and docs/report/AI_EVALUATION.md.
"""
import os
import subprocess
import sys

from eval_common import EVAL_DIR, RESULTS_PATH

STEPS = [
    ('fetch_datasets.py', 'datasets and manifest'),
    ('run_symptom_benchmark.py', 'V1 symptom engine, gretelai'),
    ('run_ddxplus_benchmark.py', 'V1 symptom engine, DDXPlus'),
    ('investigate_symptom_errors.py', 'V1 most frequent wrong profile'),
    ('run_calibration.py', 'V2 scores and calibration'),
    ('verify_interaction_sources.py', 'V3 label citations'),
    ('run_interaction_benchmark.py', 'V3 interaction checker'),
    ('run_outbreak_backtest.py', 'V4 detector and projection'),
    ('make_figures.py', 'figures'),
    ('write_report.py', 'docs/report/AI_EVALUATION.md'),
]


def main():
    offline = '--offline' in sys.argv
    if os.path.exists(RESULTS_PATH):
        os.remove(RESULTS_PATH)
    env = {**os.environ, 'PYTHONDONTWRITEBYTECODE': '1', 'MPLBACKEND': 'Agg'}
    for script, label in STEPS:
        args = [sys.executable, os.path.join(EVAL_DIR, script)] + (['--offline'] if offline and script == 'fetch_datasets.py' else [])
        print(f'== {label} ({script})', flush=True)
        done = subprocess.run(args, env=env)
        if done.returncode != 0:
            sys.exit(f'{script} failed with exit code {done.returncode}; stopping.')
    print('done: evaluation_results.json, figures and AI_EVALUATION.md written')


if __name__ == '__main__':
    main()
