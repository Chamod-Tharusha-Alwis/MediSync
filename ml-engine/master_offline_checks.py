"""Extract only reviewed function ASTs. Never import app, dotenv, Flask, model or datasets."""
import ast
import hashlib
import json
import pathlib
import re
import socket
import sys
from werkzeug.exceptions import BadRequest, UnsupportedMediaType
from types import SimpleNamespace

def denied(*args, **kwargs):
    raise AssertionError('Offline checks forbid sockets')
socket.socket = denied
source_path = pathlib.Path(__file__).with_name('app.py')
sys.path.insert(0, str(source_path.parent))
source = source_path.read_text(encoding='utf-8')
tree = ast.parse(source)
names = {'calculate_outbreak_metrics', '_extract_formulation_ml', 'patient_risk'}
functions = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]
for node in functions:
    node.decorator_list = []
namespace = {'get_disease_danger_level': lambda disease: 'Medium',
             'FORMULATION_PATTERNS_ML': [(re.compile(r'\btablet\b', re.I), 'Tablet')],
             'jsonify': lambda value: value, 'request': SimpleNamespace(json={}, get_json=lambda: namespace['request'].json)}
exec(compile(ast.fix_missing_locations(ast.Module(body=functions, type_ignores=[])), str(source_path), 'exec'), namespace)
checks = []
def check(name, action):
    try:
        action()
        checks.append({'name': name, 'passed': True})
    except Exception as error:
        checks.append({'name': name, 'passed': False, 'category': type(error).__name__, 'error': str(error)})
def equal(actual, expected):
    assert actual == expected, (actual, expected)
metrics = namespace['calculate_outbreak_metrics']
for danger, boundary, above in [('Low', 100, 101), ('Medium', 30, 31), ('High', 10, 11)]:
    check(danger + ' boundary does not alert', lambda d=danger, b=boundary: equal(metrics(b, 0, base_danger_level=d)['anomaly'], False))
    check(danger + ' above boundary alerts', lambda d=danger, b=above: equal(metrics(b, 0, base_danger_level=d)['anomaly'], True))
check('Low-danger alert is capped at medium', lambda: equal(metrics(10000, 1, base_danger_level='Low')['severity'], 'medium'))
check('Zero baseline and zero cases remains normal', lambda: equal(metrics(0, 0, base_danger_level='High')['spike_percentage'], 0))
check('High-danger high-risk priority', lambda: equal(metrics(1000, 1, base_danger_level='High')['response_priority'], 'P1-Critical'))
for value in [None, '', 12, [], {}]:
    check('Unknown formulation ' + repr(value), lambda v=value: equal(namespace['_extract_formulation_ml'](v), 'Unspecified'))
check('Synthetic formulation match', lambda: equal(namespace['_extract_formulation_ml']('Synthetic tablet'), 'Tablet'))
def risk(body):
    namespace['request'].json = body
    return namespace['patient_risk']()
check('Missing risk body returns 400', lambda: equal(risk({})[1], 400))
check('Synthetic low risk', lambda: equal(risk({'age': 30})['riskLevel'], 'low'))
check('Synthetic elderly score', lambda: equal(risk({'age': 70})['riskScore'], 30))
check('Synthetic score capped', lambda: equal(risk({'age': 80, 'chronicConditions': ['diabetes']*12, 'consultationCount30days': 8, 'activePrescriptionsCount': 8})['riskScore'], 100))
def raises_type(body):
    try:
        risk(body)
    except (TypeError, AttributeError):
        return
    raise AssertionError('Expected current source type-validation gap')
check('SOURCE defect reproduced: string age raises type error', lambda: raises_type({'age': '70'}))
check('SOURCE defect reproduced: non-string chronic condition raises', lambda: raises_type({'age': 30, 'chronicConditions': [123]}))
check('All Python app source parses without importing app', lambda: equal(isinstance(tree, ast.Module), True))
output = pathlib.Path(sys.argv[1])
receipt = {'databaseFree': True, 'appImported': False, 'flaskStarted': False, 'datasetRead': False,
           'modelTrained': False, 'clinicallyValidated': False, 'sourceSha256': hashlib.sha256(source.encode()).hexdigest(),
           'passed': sum(row['passed'] for row in checks), 'failed': sum(not row['passed'] for row in checks), 'checks': checks}
with output.open('x', encoding='utf-8') as handle:
    json.dump(receipt, handle, indent=2)
print(json.dumps({'passed': receipt['passed'], 'failed': receipt['failed']}))
sys.exit(1 if receipt['failed'] else 0)
