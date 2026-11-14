"""Shared helpers for the offline AI evaluation scripts.

Evaluation code only. Nothing here changes engine logic, thresholds, profiles or
catalogues. The engine is imported from ml-engine/app.py and called through its
own Flask routes, exactly as the API does.
"""
import contextlib
import hashlib
import hmac
import io
import json
import os
import secrets
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

EVAL_DIR = os.path.dirname(os.path.abspath(__file__))
ML_DIR = os.path.dirname(EVAL_DIR)
REPO_ROOT = os.path.dirname(ML_DIR)
DATA_DIR = os.path.join(EVAL_DIR, 'data')
MANIFEST_PATH = os.path.join(EVAL_DIR, 'manifest.json')
MAPPING_PATH = os.path.join(EVAL_DIR, 'label_mapping.json')
INTERACTION_REFERENCE_PATH = os.path.join(EVAL_DIR, 'interaction_reference.json')
RESULTS_PATH = os.path.join(EVAL_DIR, 'evaluation_results.json')

CLINICAL_VALIDATION = 'not_established'


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def sha256_text(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def read_json(path):
    with open(path, 'r', encoding='utf-8') as handle:
        return json.load(handle)


def write_json(path, payload):
    with open(path, 'w', encoding='utf-8', newline='\n') as handle:
        json.dump(payload, handle, indent=2, sort_keys=True, ensure_ascii=False)
        handle.write('\n')


def git_state():
    """Commit hash of HEAD and whether tracked files differ from it."""
    def run(*args):
        return subprocess.run(['git', *args], cwd=REPO_ROOT, capture_output=True, text=True, check=True).stdout.strip()
    return {
        'commit': run('rev-parse', 'HEAD'),
        'branch': run('rev-parse', '--abbrev-ref', 'HEAD'),
        'trackedFilesModified': bool(run('status', '--porcelain', '--untracked-files=no')),
    }


def today_utc():
    return datetime.now(timezone.utc).strftime('%Y-%m-%d')


def load_engine():
    """Import ml-engine/app.py for offline use and return (module, authorised post function).

    - No .env file is read: dotenv.load_dotenv is replaced with a no-op before the import.
    - The SQLite path points at a fresh temporary file, so the tracked medisync.db is untouched.
    - The internal API key is a random value that lives only in this process.
    """
    import dotenv
    dotenv.load_dotenv = lambda *args, **kwargs: False
    os.environ['MEDISYNC_ML_DB_PATH'] = os.path.join(tempfile.mkdtemp(prefix='medisync_eval_'), 'eval_ml.db')
    os.environ['INTERNAL_API_KEY'] = secrets.token_hex(32)
    os.environ.pop('MEDISYNC_ML_QA', None)
    if ML_DIR not in sys.path:
        sys.path.insert(0, ML_DIR)
    with contextlib.redirect_stdout(io.StringIO()):
        import app as engine
    client = engine.app.test_client()

    def post(route, payload):
        hour = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H')
        token = hmac.new(os.environ['INTERNAL_API_KEY'].encode(), hour.encode(), hashlib.sha256).hexdigest()
        with contextlib.redirect_stdout(io.StringIO()):
            response = client.post(route, headers={'x-internal-key': token}, json=payload)
        if response.status_code != 200:
            raise RuntimeError(f'{route} returned HTTP {response.status_code}')
        return response.get_json()

    return engine, post


def require_tfidf_engine(engine):
    """Abort unless the engine's TF-IDF path is active.

    app.py silently falls back to a plain word-intersection matcher when scikit-learn
    cannot be imported. Benchmarking that fallback would not measure the deployed engine.
    """
    if not (engine.SKLEARN_AVAILABLE and engine.tfidf_vectorizer is not None and engine.tfidf_matrix is not None):
        sys.exit('scikit-learn could not be loaded, so app.py is running its fallback matcher, not the TF-IDF engine. '
                 'Refusing to benchmark. Use a Python environment where "from sklearn.feature_extraction.text import '
                 'TfidfVectorizer" works.')


def environment_info():
    """Library versions used for this run (the production lock file may pin different versions)."""
    from importlib.metadata import version
    info = {'python': '.'.join(str(part) for part in sys.version_info[:3])}
    for package in ('scikit-learn', 'numpy', 'scipy', 'pandas', 'Flask'):
        try:
            info[package] = version(package)
        except Exception:
            info[package] = 'not installed'
    return info


def update_results(section, payload):
    """Write one section of evaluation_results.json, keeping the other sections."""
    results = read_json(RESULTS_PATH) if os.path.exists(RESULTS_PATH) else {}
    results['clinicalValidation'] = CLINICAL_VALIDATION
    results['scope'] = ('Offline engineering benchmark on public, non-patient data. '
                        'It measures agreement with dataset labels only.')
    results[section] = payload
    write_json(RESULTS_PATH, results)
