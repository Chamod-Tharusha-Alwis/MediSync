"""Run the whole offline data science study, Phases A to E (offline study, not in production).

    python ml-engine/evaluation/study/run_study.py              fetch missing DDXPlus splits, then run everything
    python ml-engine/evaluation/study/run_study.py --offline    reuse the files already in ml-engine/evaluation/data/

Use the ml-engine virtual environment's Python (statsmodels, prophet, scikit-learn, matplotlib). Node must be on PATH.
Outputs: docs/report/study/ (CSVs, PNGs, study_results.json, MODEL_CARDS.md, DATA_SHEET.md, RESULTS.md).
"""
import hashlib
import os
import shutil
import subprocess
import sys

from study_common import OUT_DIR, RESULTS_PATH, STUDY_DIR

STEPS = [('fetch_study_data.py', 'DDXPlus train and validation splits in the manifest'),
         ('forecast_benchmark.py', 'Phase A forecast benchmark'),
         ('detector_sweep.py', 'Phase B detector sweep'),
         ('symptom_study.py', 'Phase C DDXPlus supervised study (interpreter with sklearn.ensemble)'),
         ('draw_symptom_figures.py', 'Phase C figures'),
         ('write_cards.py', 'Phase D model cards and data sheet'),
         ('write_results.py', 'RESULTS.md'),
         ('check_results.py', 'integrity check')]


def sklearn_interpreter():
    """An interpreter that can import sklearn.ensemble: the current one if possible, else STUDY_SKLEARN_PYTHON or `python` on PATH."""
    candidates = [sys.executable, os.environ.get('STUDY_SKLEARN_PYTHON'), shutil.which('python')]
    for candidate in [c for c in candidates if c]:
        if subprocess.run([candidate, '-c', 'import sklearn.ensemble, sklearn.inspection, flask'], capture_output=True).returncode == 0:
            return candidate
    sys.exit('No interpreter can import sklearn.ensemble; set STUDY_SKLEARN_PYTHON.')


def main():
    offline = '--offline' in sys.argv
    if os.path.exists(RESULTS_PATH):
        os.remove(RESULTS_PATH)
    env = {**os.environ, 'PYTHONDONTWRITEBYTECODE': '1', 'MPLBACKEND': 'Agg', 'PYTHONWARNINGS': 'ignore'}
    for script, label in STEPS:
        interpreter = sklearn_interpreter() if script == 'symptom_study.py' else sys.executable
        args = [interpreter, '-u', os.path.join(STUDY_DIR, script)] + (['--offline'] if offline and script == 'fetch_study_data.py' else [])
        print(f'== {label} ({script}) with {interpreter}', flush=True)
        if subprocess.run(args, env=env).returncode != 0:
            sys.exit(f'{script} failed; stopping.')
    print('== SHA-256 of every CSV and PNG')
    for name in sorted(os.listdir(OUT_DIR)):
        if name.endswith(('.csv', '.png')):
            with open(os.path.join(OUT_DIR, name), 'rb') as handle:
                print(f'{hashlib.sha256(handle.read()).hexdigest()}  {name}')


if __name__ == '__main__':
    main()
