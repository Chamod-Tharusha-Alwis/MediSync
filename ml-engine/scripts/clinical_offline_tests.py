"""Actual Flask tests, with network, child processes and unowned SQLite denied."""
import json
import os
import pathlib
import sys
import unittest

root = pathlib.Path(__file__).resolve().parents[2]
out = pathlib.Path(os.environ['MEDISYNC_OFFLINE_EVIDENCE']).resolve()
metadata_probes = []
if not out.is_relative_to(root / 'scratch'):
    raise RuntimeError('INVALID_OFFLINE_EVIDENCE_PATH')


def audit(event, args):
    if event == 'subprocess.Popen':
        command = tuple(args[1]) if isinstance(args[1], (list, tuple)) else (args[1],)
        cmd_name = pathlib.Path(str(command[0])).name if command else ''
        norm_cmd = (cmd_name,) + tuple(str(x) for x in command[1:])
        allowed = {
            ('uname', '-p'),
            ('fc-list', '--help'),
            ('fc-list', '--format=%{file}\n'),
            ('fc-list', '--format=%{file}\\n'),
        }
        if (norm_cmd in allowed or command in allowed) and command not in metadata_probes:
            metadata_probes.append(command)
            return
    if event == 'open' and isinstance(args[0], (str, bytes)) and pathlib.Path(str(args[0])).name.startswith('.env'):
        raise RuntimeError('OFFLINE_ENV_VALUE_READ_DENIED')
    if event in {'socket.connect', 'socket.bind', 'socket.getaddrinfo', 'subprocess.Popen', 'os.system'}:
        raise RuntimeError('OFFLINE_NETWORK_OR_CHILD_DENIED')
    if event == 'sqlite3.connect' and pathlib.Path(str(args[0])).resolve() != out / 'owned_ml_test.db':
        raise RuntimeError('OFFLINE_UNOWNED_SQLITE_DENIED')


sys.addaudithook(audit)
import dotenv
dotenv.load_dotenv = lambda *args, **kwargs: False
sys.path.insert(0, str(root / 'ml-engine'))
import test_medication_safety
import test_reference_catalog

suite = unittest.defaultTestLoader.loadTestsFromModule(test_medication_safety)
suite.addTests(unittest.defaultTestLoader.loadTestsFromModule(test_reference_catalog))
result = unittest.TextTestRunner(verbosity=2).run(suite)
(out / 'ml-flask-results.json').write_text(json.dumps({
    'run': result.testsRun, 'failures': len(result.failures), 'errors': len(result.errors),
    'skipped': len(result.skipped), 'success': result.wasSuccessful(),
    'boundedMetadataProbes': metadata_probes,
    'method': 'Real Flask test_client and reference tables; dotenv inert; network and unowned SQLite denied',
}))
sys.exit(0 if result.wasSuccessful() else 1)
