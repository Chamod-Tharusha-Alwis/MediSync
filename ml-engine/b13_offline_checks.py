"""Actual function ASTs and pure synthetic helpers only; never import app/evaluation startup."""
import ast
import builtins
import hashlib
import json
import pathlib
import runpy
import socket
import sys
from types import SimpleNamespace

root = pathlib.Path(__file__).resolve().parent.parent
output, mode = pathlib.Path(sys.argv[1]), sys.argv[2]
assert not output.exists()
originals = json.loads((root / 'scratch/phase5x-evidence/b13-r1-originals-20261016.json').read_text(encoding='utf-8'))
source = originals['ml-engine/app.py']['source'] if mode == 'original' else (root / 'ml-engine/app.py').read_text(encoding='utf-8')
evaluation = originals['ml-engine/evaluate_symptom_model.py']['source'] if mode == 'original' else (root / 'ml-engine/evaluate_symptom_model.py').read_text(encoding='utf-8')
counters = {'forbiddenFile': 0, 'transport': 0, 'applicationImport': 0}
def audit(event, args):
    if event == 'open' and isinstance(args[0], (str, bytes)):
        name = pathlib.Path(str(args[0]))
        if name.name.startswith('.env') or name.suffix in {'.csv', '.pkl', '.joblib', '.db', '.sqlite'}:
            counters['forbiddenFile'] += 1
            raise AssertionError('Private data/env/model access forbidden')
    if event in {'socket.connect', 'socket.bind', 'subprocess.Popen', 'os.system'}:
        counters['transport'] += 1
        raise AssertionError('Transport/process forbidden')
sys.addaudithook(audit)
class BadRequest(Exception):
    pass
class UnsupportedMediaType(Exception):
    pass
class Request:
    body = None
    error = None
    @property
    def json(self):
        return self.get_json()
    def get_json(self, **kwargs):
        if self.error:
            raise self.error
        return self.body
request = Request()
helpers = None if mode == 'original' else runpy.run_path(str(root / 'ml-engine/risk_input.py'))
def imports(name, *args, **kwargs):
    if name == 'risk_input' and helpers:
        return SimpleNamespace(**helpers)
    if name == 'werkzeug.exceptions':
        return SimpleNamespace(BadRequest=BadRequest, UnsupportedMediaType=UnsupportedMediaType)
    counters['applicationImport'] += 1
    raise AssertionError('Unreviewed AST import')
def extracted(text):
    tree = ast.parse(text)
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'patient_risk')
    node.decorator_list = []
    namespace = {'request': request, 'jsonify': lambda value: value, '__builtins__': {**vars(builtins), '__import__': imports}}
    exec(compile(ast.fix_missing_locations(ast.Module(body=[node], type_ignores=[])), 'actual-patient-risk-ast', 'exec'), namespace)
    return namespace
ns = extracted(source)
original_ns = extracted(originals['ml-engine/app.py']['source'])
checks = []
def check(name, fn):
    try:
        fn()
        checks.append({'name': name, 'passed': True})
    except Exception as error:
        checks.append({'name': name, 'passed': False, 'category': type(error).__name__})
def equal(actual, expected):
    assert actual == expected
def call(body, namespace=ns, error=None):
    request.body, request.error = body, error
    return namespace['patient_risk']()
def rejected(body):
    result = call(body)
    assert isinstance(result, tuple) and result[1] == 400
    assert set(result[0]) == {'error'}
    assert not any(text in json.dumps(result) for text in ['TypeError', 'AttributeError', 'INERT_PRIVATE'])
invalid = [
    ('string age', {'age': '70'}), ('null age', {'age': None}), ('negative age', {'age': -1}),
    ('NaN age', {'age': float('nan')}), ('infinite age', {'age': float('inf')}), ('boolean age', {'age': True}),
    ('nested age', {'age': {'value': 30}}), ('numeric conditions', {'age': 30, 'chronicConditions': 1}),
    ('string conditions', {'age': 30, 'chronicConditions': 'diabetes'}), ('null conditions', {'age': 30, 'chronicConditions': None}),
    ('numeric member', {'age': 30, 'chronicConditions': [123]}), ('null member', {'age': 30, 'chronicConditions': [None]}),
    ('nested member', {'age': 30, 'chronicConditions': [{}]}), ('blank member', {'age': 30, 'chronicConditions': [' ']}),
    ('string count', {'age': 30, 'consultationCount30days': '1'}), ('negative count', {'age': 30, 'activePrescriptionsCount': -1}),
    ('boolean count', {'age': 30, 'activePrescriptionsCount': False}), ('infinite count', {'age': 30, 'consultationCount30days': float('inf')}),
    ('nested body', {'unexpected': {'age': 30}}), ('array body', [30]), ('string body', 'INERT_PRIVATE')]
for name, body in invalid:
    check('Risk rejects ' + name, lambda b=body: rejected(b))
check('Empty body remains client error', lambda: equal(call({})[1], 400))
check('Missing age retains established optional default', lambda: equal(call({'chronicConditions': []})['factors']['age'], 30))
for name, error in [('malformed JSON', BadRequest('INERT_PRIVATE')), ('wrong content type', UnsupportedMediaType('INERT_PRIVATE'))]:
    check('Sanitized ' + name, lambda e=error: equal(call(None, error=e), ({'error': 'Invalid risk request'}, 400)))
def internal_failure():
    try:
        call({'age': 30}, error=RuntimeError('synthetic internal failure'))
    except RuntimeError:
        return
    raise AssertionError('Internal failure was incorrectly mapped to 400')
check('Unexpected internal error remains a server failure', internal_failure)
for age in [0, 4, 5, 30, 49, 50, 59, 60, 69, 70, 30.5]:
    body = {'age': age, 'chronicConditions': ['diabetes', 'unknown condition'], 'consultationCount30days': 3, 'activePrescriptionsCount': 3}
    check('Existing numeric calculation preserved age ' + str(age), lambda b=body: equal(call(b), call(b, original_ns)))
for name, body in [('empty conditions', {'age': 30, 'chronicConditions': []}), ('duplicates', {'age': 30, 'chronicConditions': ['diabetes', 'diabetes']}), ('long condition', {'age': 30, 'chronicConditions': ['x' * 100000]}), ('missing counts', {'age': 30}), ('valid lists', {'age': 70, 'chronicConditions': ['Diabetes', 'unknown']}), ('fractional count', {'age': 30, 'consultationCount30days': 1.5})]:
    check('Established valid behavior preserved: ' + name, lambda b=body: equal(call(b), call(b, original_ns)))
check('Evaluation explicitly labels resubstitution', lambda: equal('RESUBSTITUTION' in ast.get_docstring(ast.parse(evaluation)), True))
check('Evaluation declares held-out performance unestablished', lambda: equal('"held_out_performance": "NOT ESTABLISHED"' in evaluation, True))
check('Historical metric output is not overwritten', lambda: equal('with open("research/symptom_model_metrics.json", "w")' not in evaluation, True))
if mode != 'original':
    partition = runpy.run_path(str(root / 'ml-engine/evaluation_partition.py'))['check_synthetic_partition']
    records = [{'case_id': 'synthetic-a', 'group_id': 'synthetic-one', 'symptoms': ['symptom one']}, {'case_id': 'synthetic-b', 'group_id': 'synthetic-two', 'symptoms': ['symptom two']}]
    check('Synthetic group-disjoint split never claims independence', lambda: equal(partition(records, ['synthetic-a'], ['synthetic-b'])['independentValidationEstablished'], False))
    def fails(records, train, heldout):
        try:
            partition(records, train, heldout)
        except ValueError:
            return
        raise AssertionError('Leakage escaped guard')
    check('Shared case ID rejected', lambda: fails(records, ['synthetic-a'], ['synthetic-a']))
    check('Related groups rejected', lambda: fails([records[0], {**records[1], 'group_id': 'synthetic-one'}], ['synthetic-a'], ['synthetic-b']))
    check('Equivalent symptom profile rejected across folds', lambda: fails([records[0], {**records[1], 'symptoms': [' SYMPTOM_ONE ']}], ['synthetic-a'], ['synthetic-b']))
    check('Missing grouping provenance rejected', lambda: fails([{**records[0], 'group_id': None}, records[1]], ['synthetic-a'], ['synthetic-b']))
    check('Unknown partition case rejected', lambda: fails(records, ['missing'], ['synthetic-b']))
check('AST route decorators/authentication unchanged', lambda: equal(ast.dump(next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == 'patient_risk').decorator_list[1]), ast.dump(next(n for n in ast.parse(originals['ml-engine/app.py']['source']).body if isinstance(n, ast.FunctionDef) and n.name == 'patient_risk').decorator_list[1])) )
def synthetic_prediction(sklearn, symptoms, inputs):
    node = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == 'predict_disease')
    node.decorator_list = []
    request.body, request.error = {'symptoms': inputs}, None
    namespace = {'request': request, 'jsonify': lambda value: value, 'SKLEARN_AVAILABLE': sklearn,
                 'tfidf_vectorizer': SimpleNamespace(transform=lambda text: []), 'tfidf_matrix': object(),
                 'cosine_similarity': lambda a, b: SimpleNamespace(flatten=lambda: [1.0]),
                 'get_specialist_for_disease': lambda a, b: 'Synthetic reviewer',
                 'symptom_data': [{'disease': 'Synthetic condition', 'symptoms': symptoms, 'avg_severity': 3}]}
    exec(compile(ast.fix_missing_locations(ast.Module(body=[node], type_ignores=[])), 'actual-inference-ast-synthetic', 'exec'), namespace)
    return namespace['predict_disease']()['predictions']
check('Actual intersection fallback calculates matching scores, not preset diagnoses', lambda: equal(synthetic_prediction(False, ['synthetic symptom'], ['synthetic symptom'])[0]['confidence'], 100.0))
check('Actual blended formula can exceed percent domain; boundary must reject rather than clamp', lambda: equal(synthetic_prediction(True, ['pain one', 'pain two', 'pain three', 'pain four'], ['pain'])[0]['confidence'], 205.0))
check('No data/env/model/network/app import', lambda: equal(sum(counters.values()), 0))
receipt = {'phase': '5X-MASTER-B13-R1', 'mode': mode, 'databaseFree': True, 'appImported': False, 'routeRegistrationTested': False, 'flaskStarted': False, 'datasetRead': False, 'modelTrained': False, 'sourceSha256': hashlib.sha256(source.encode()).hexdigest(), 'passed': sum(r['passed'] for r in checks), 'failed': sum(not r['passed'] for r in checks), 'skipped': 0, 'checks': checks, 'counters': counters}
with output.open('x', encoding='utf-8') as handle:
    json.dump(receipt, handle, indent=2)
print(json.dumps({'passed': receipt['passed'], 'failed': receipt['failed']}))
sys.exit(1 if receipt['failed'] else 0)
