"""Owned offline adapter for the ACTUAL ML outbreak engineering heuristics.

No HTTP server, dotenv credentials, production SQLite or external service.
Input contains only synthetic disease/district aggregate counts.
"""
import contextlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
sys.dont_write_bytecode = True

root = Path(__file__).resolve().parents[2]
out = Path(sys.argv[1]).resolve()
allowed_roots = [
    Path(tempfile.gettempdir()).resolve(),
    Path(os.environ.get('MEDISYNC_TEST_TMP', tempfile.gettempdir())).resolve(),
    (root / 'scratch').resolve() if (root / 'scratch').exists() else (root / 'scratch'),
]
if not any(out.is_relative_to(base) for base in allowed_roots) or not out.is_dir():
    raise RuntimeError('SEED_CONTRACT_EVIDENCE_REJECTED')


def audit(event, args):
    if event in ('socket.connect', 'socket.bind', 'subprocess.Popen'):
        raise RuntimeError('SEED_CONTRACT_EXTERNAL_OPERATION_DENIED')
    if event == 'sqlite3.connect' and args and str(args[0]) != ':memory:':
        if not Path(args[0]).resolve().is_relative_to(out):
            raise RuntimeError('SEED_CONTRACT_SQLITE_TARGET_DENIED')
    if event == 'open' and args and isinstance(args[0], (str, bytes, os.PathLike)):
        target = Path(os.fsdecode(args[0]))
        if target.name == '.env' or target.name.startswith('.env.'):
            raise RuntimeError('SEED_CONTRACT_PRIVATE_ENV_DENIED')
        if target.suffix == '.db' and not target.resolve().is_relative_to(out):
            raise RuntimeError('SEED_CONTRACT_SQLITE_TARGET_DENIED')


sys.addaudithook(audit)
import dotenv
dotenv.load_dotenv = lambda *args, **kwargs: False
os.environ.update({
    'MEDISYNC_ML_QA': 'true',
    'MEDISYNC_ML_DB_PATH': str(out / 'seed_contract.db'),
    'INTERNAL_API_KEY': 'synthetic-contract-only-not-for-live-use',
    'MPLBACKEND': 'Agg',
})
sys.path.insert(0, str(root / 'ml-engine'))
payload = json.load(sys.stdin)
with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
    import app as ml
    results = []
    for row in payload:
        metrics = ml.calculate_outbreak_metrics(row['last_7_days_count'], row['previous_baseline_avg'], disease=row['disease'])
        results.append({'district': row['district'], 'disease': row['disease'], **metrics})
sys.stdout.write(json.dumps({'results': results, 'method': 'actual app.calculate_outbreak_metrics; owned SQLite; no network'}))
