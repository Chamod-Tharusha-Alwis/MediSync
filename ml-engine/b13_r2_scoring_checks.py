"""Source extraction + synthetic arithmetic only. No app, sklearn, dataset or model imports."""
import ast
import builtins
import collections
import hashlib
import json
import math
import pathlib
import re
import sys
from types import SimpleNamespace

root = pathlib.Path(__file__).resolve().parent.parent
output = pathlib.Path(sys.argv[1])
assert not output.exists()
counters = {'privateFile': 0, 'transportOrProcess': 0, 'unreviewedImport': 0}

def audit(event, args):
    if event == 'open' and isinstance(args[0], (str, bytes)):
        p = pathlib.Path(str(args[0]))
        if p.name.startswith('.env') or p.suffix.lower() in {'.csv', '.pkl', '.pickle', '.joblib', '.db', '.sqlite', '.sqlite3'}:
            counters['privateFile'] += 1
            raise AssertionError('Private input forbidden')
    if event in {'socket.connect', 'socket.bind', 'subprocess.Popen', 'os.system', 'ctypes.dlopen'}:
        counters['transportOrProcess'] += 1
        raise AssertionError('Live/native dispatch forbidden')
sys.addaudithook(audit)
source_bytes = (root / 'ml-engine/app.py').read_bytes()
source = source_bytes.decode('utf-8').replace('\r\n', '\n')
evaluation = (root / 'ml-engine/evaluate_symptom_model.py').read_text(encoding='utf-8')
tree = ast.parse(source)
node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'predict_disease')
extraction = {'file': 'ml-engine/app.py', 'fileSha256': hashlib.sha256(source_bytes).hexdigest(), 'normalizedTextSha256': hashlib.sha256(source.encode()).hexdigest(),
              'startLine': node.lineno, 'endLine': node.end_lineno,
              'functionSource': ast.get_source_segment(source, node),
              'decoratorsNotExecuted': [ast.unparse(d) for d in node.decorator_list],
              'inertDependencies': ['request.json', 'jsonify identity', 'vectorizer.transform recorder', 'cosine_similarity supplied finite synthetic vector', 'specialist label stub'],
              'scope': 'Exact function AST; no module initialization, Flask/parser/auth/TF-IDF integration'}
node.decorator_list = []
code = compile(ast.fix_missing_locations(ast.Module(body=[node], type_ignores=[])), 'actual-predict-disease-extraction', 'exec')
checks, cases = [], []

def equal(a, b):
    assert a == b, (a, b)

def check(name, fn):
    try:
        fn()
        checks.append({'name': name, 'passed': True})
    except Exception as error:
        checks.append({'name': name, 'passed': False, 'error': type(error).__name__, 'detail': str(error)[:240]})

def deny_import(*args, **kwargs):
    counters['unreviewedImport'] += 1
    raise AssertionError('No application/library import from extracted AST')

def profile(label, symptoms):
    return {'disease': label, 'symptoms': symptoms, 'icd_code': 'SYNTHETIC', 'avg_severity': 3}

def run(inputs, references, cosines=None, fallback=False):
    transformed = []
    namespace = {'request': SimpleNamespace(json={'symptoms': inputs}), 'jsonify': lambda value: value,
                 'SKLEARN_AVAILABLE': not fallback,
                 'tfidf_vectorizer': SimpleNamespace(transform=lambda texts: transformed.extend(texts)),
                 'tfidf_matrix': object(),
                 'cosine_similarity': lambda a, b: SimpleNamespace(flatten=lambda: cosines),
                 'get_specialist_for_disease': lambda a, b: 'Synthetic reviewer', 'symptom_data': references,
                 '__builtins__': {**vars(builtins), '__import__': deny_import}}
    exec(code, namespace)
    return namespace['predict_disease']()['predictions'], transformed

def observe(name, inputs, refs, cosines, expected_scores, fallback=False):
    def perform():
        predictions, transformed = run(inputs, refs, cosines, fallback)
        equal([r['confidence'] for r in predictions], expected_scores)
        cases.append({'case': name, 'input': inputs, 'references': refs, 'suppliedCosines': cosines,
                      'method': 'exact intersection' if fallback else 'actual blended AST with inert cosine components',
                      'transformedText': transformed, 'predictions': predictions})
    check('Matrix: ' + name, perform)

one = [profile('SyntheticAlpha', ['tag one'])]
four = ['pain one', 'pain two', 'pain three', 'pain four']
observe('01 no symptoms', [], one, [1], [])
observe('02 one matching symptom', ['tag one'], one, [1], [100.0])
observe('03 one nonmatching symptom', ['absent'], one, [0], [])
observe('04 all symptoms matching', ['tag one', 'tag two'], [profile('SyntheticAlpha', ['tag one', 'tag two'])], [1], [100.0])
observe('05 no overlap but subthreshold similarity', ['absent'], one, [0.05], [])
observe('06 partial overlap', ['tag one', 'absent'], one, [0.4], [43.5])
observe('07 repeated input entries penalize denominator', ['tag one', 'tag one'], one, [1], [82.5])
observe('08 duplicate reference entries deduplicate matches', ['tag one'], [profile('SyntheticAlpha', ['tag one', 'tag one'])], [1], [100.0])
observe('09 similar labels matched by substring', ['tag'], [profile('SyntheticAlpha', ['tag one', 'tag two'])], [0.5], [102.5])
observe('10 missing reference symptoms key', ['tag'], [{'disease': 'SyntheticAlpha'}], [0.5], [32.5])
observe('11 maximum overlap of bounded 12-reference fixture', ['tag'], [profile('SyntheticAlpha', ['tag ' + str(i) for i in range(12)])], [1], [485.0])
observe('12 original 205 reproduction', ['pain'], [profile('SyntheticAlpha', four)], [1], [205.0])
observe('13 zero cosine with nonzero intersection', ['tag one'], one, [0], [35.0])
observe('14 nonzero cosine with zero intersection', ['absent'], one, [0.5], [32.5])
observe('15 exact candidate ties retain reference order', ['tag one'], [profile('SyntheticZulu', ['tag one']), profile('SyntheticAlpha', ['tag one'])], [1, 1], [100.0, 100.0])
observe('16 one high candidate precedes others', ['pain'], [profile('SyntheticHigh', four), profile('SyntheticLow', ['absent'])], [1, 0.5], [205.0, 32.5])
observe('17 multiple lower candidates and top-five truncation', ['absent'], [profile('Synthetic' + str(i), ['tag']) for i in range(7)], [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7], [45.5, 39.0, 32.5, 26.0, 19.5])

def raises(kind, fn):
    try:
        fn()
    except kind:
        return
    raise AssertionError('Expected ' + kind.__name__)

for name, cosines, error in [('missing cosine vector', None, TypeError), ('missing candidate component', [], IndexError), ('null component', [None], TypeError), ('text component', ['bad'], ValueError)]:
    check('18 malformed component: ' + name, lambda v=cosines, e=error: raises(e, lambda: run(['tag one'], one, v)))

check('NaN component silently excludes candidate in current runtime (not a validated input)', lambda: equal(run(['tag one'], one, [math.nan])[0], []))
check('Infinite component can serialize invalid confidence before downstream rejection', lambda: equal(math.isinf(run(['tag one'], one, [math.inf])[0][0]['confidence']), True))
check('Malformed symptom member raises before scoring', lambda: raises(TypeError, lambda: run([None], one, [1])))
check('Null reference symptoms raises (missing key instead defaults empty)', lambda: raises(TypeError, lambda: run(['tag'], [profile('SyntheticAlpha', None)], [1])))
check('Blank reference label matches every nonblank input if manually supplied; dataset aggregator excludes blanks', lambda: equal(run(['tag'], [profile('SyntheticAlpha', [''])], [0])[0][0]['confidence'], 35))
check('Input underscores are not normalized like reference dataset underscores', lambda: equal(run(['tag_one'], one, [0])[0], []))
check('Blended string and list normalize case and trim for matching', lambda: equal(run(' TAG ONE ', one, [1])[0][0]['confidence'], run([' TAG ONE '], one, [1])[0][0]['confidence']))
check('Blank list entries still inflate denominator', lambda: equal(run(['tag one', ''], one, [1])[0][0]['confidence'], 82.5))
check('Comma string denominator counts entries', lambda: equal(run('tag one,absent', one, [0.4])[0][0]['confidence'], 43.5))
check('Intersection fallback is bounded for repeated inputs', lambda: equal(run(['tag one', 'tag one'], one, fallback=True)[0][0]['confidence'], 50))
check('Intersection fallback exact labels do not use substrings', lambda: equal(run(['tag'], one, fallback=True)[0], []))
check('Intersection string branch retains original case, unlike blended matching', lambda: equal(run('TAG ONE', one, fallback=True)[0], []))
check('Intersection list branch lowercases but does not trim', lambda: equal(run([' tag one '], one, fallback=True)[0], []))

# Independent arithmetic oracle, not copied production code or an alternative model.
def independent(inputs, refs, c):
    n = len(inputs)
    matching = {ref.lower() for ref in refs if any(s.strip() and (s.strip().lower() in ref.lower() or ref.lower() in s.strip().lower()) for s in inputs)}
    return 65 * c + 35 * len(matching) / max(1, n)

rounding_observations = []
def exhaustive_bounds():
    tuples = 0
    for n in range(1, 9):
        for m in range(13):
            refs = ['tag ' + str(i) for i in range(m)]
            for c in [0, 0.25, 0.5, 0.75, 1]:
                predicted, _ = run(['tag'] * n, [profile('SyntheticBound', refs)], [c])
                expected = independent(['tag'] * n, refs, c)
                assert 0 <= expected <= 65 + 35 * m / n
                if expected > 5 or c > 0.10:
                    # Compare independent real-number algebra before serialization; then
                    # check source rounding of the actual raw score without reordering it.
                    assert math.isclose(predicted[0]['score'] * 100, expected, rel_tol=1e-12, abs_tol=1e-12)
                    equal(predicted[0]['confidence'], round(predicted[0]['score'] * 100, 2))
                    if predicted[0]['confidence'] != round(expected, 2):
                        assert math.isclose(expected * 100 % 1, 0.5, abs_tol=1e-9)
                        assert abs(predicted[0]['confidence'] - round(expected, 2)) < 0.010000001
                        rounding_observations.append({'n': n, 'm': m, 'cosine': c, 'runtime': predicted[0]['confidence'], 'reorderedAlgebra': round(expected, 2), 'cause': 'floating point at half-cent tie'})
                else:
                    equal(predicted, [])
                tuples += 1
    return tuples
bound_tuple_count = 0
def bound_check():
    global bound_tuple_count
    bound_tuple_count = exhaustive_bounds()
check('Independent oracle verifies per-profile bound for every bounded synthetic tuple', bound_check)

def ranking_difference():
    refs = [profile('SyntheticCosineWinner', ['absent']), profile('SyntheticOverlapWinner', four)]
    result, _ = run(['pain'], refs, [0.9, 0.2])
    equal(result[0]['disease'], 'SyntheticOverlapWinner')
    equal(max(zip([0.9, 0.2], refs), key=lambda pair: pair[0])[1]['disease'], 'SyntheticCosineWinner')
check('Pure cosine evaluator and blended runtime can choose opposite winners', ranking_difference)

# Synthetic feature arithmetic for the source-declared unigram/bigram corpus.
# One synthetic document means smooth IDF is 1 for every observed feature.
# This computes counts and a dot product; no sklearn fitting or artifact loading.
def features(text):
    words = re.findall(r'(?u)\b\w\w+\b', text.lower())
    return collections.Counter(words + [' '.join(words[i:i+2]) for i in range(len(words)-1)])

def single_document_cosine(query, doc):
    corpus = features(doc)
    q = {k: v for k, v in features(query).items() if k in corpus}
    numerator = sum(q.get(k, 0) * v for k, v in corpus.items())
    norm = math.sqrt(sum(v*v for v in q.values()) * sum(v*v for v in corpus.values()))
    return numerator / norm if norm else 0

def source_document(disease, symptoms):
    # Execute only the three actual source assignments, replacing startup/fitting with none.
    block = next(n for n in tree.body if isinstance(n, ast.If) and ast.unparse(n.test) == 'SKLEARN_AVAILABLE and symptom_data')
    loop = next(n for n in block.body if isinstance(n, ast.For))
    assignments = [n for n in loop.body if isinstance(n, ast.Assign)]
    ns = {'d': profile(disease, symptoms)}
    exec(compile(ast.Module(body=assignments, type_ignores=[]), 'actual-corpus-assignments', 'exec'), ns)
    return ns['doc']

geometry = []
def compatible_205():
    refs = ['tag one', 'tag two', 'tag three', 'tag four']
    doc = source_document('SyntheticAlpha', refs)
    c = single_document_cosine(doc, doc)
    equal(c, 1)
    predictions, _ = run([doc], [profile('SyntheticAlpha', refs)], [c])
    equal(predictions[0]['confidence'], 205)
    geometry.append({'case': '205 with mathematically consistent synthetic unigram/bigram vectors', 'document': doc, 'inputEntries': [doc], 'cosine': c, 'matchedReferenceCount': len(predictions[0]['matched_symptoms']), 'confidence': predictions[0]['confidence'], 'sklearnExecuted': False, 'clinicalObservation': False})
check('205 also supported by equal synthetic corpus/query feature geometry, without arbitrary cosine=1', compatible_205)

def broad_label_geometry():
    doc = source_document('SyntheticAlpha', four)
    c = single_document_cosine('pain', doc)
    result, _ = run(['pain'], [profile('SyntheticAlpha', four)], [c])
    assert 0 < c < 1
    assert result[0]['confidence'] > 100
    geometry.append({'case': 'Original broad label with one-document synthetic feature counts', 'document': doc, 'inputEntries': ['pain'], 'cosine': c, 'confidence': result[0]['confidence'], 'sklearnExecuted': False, 'clinicalObservation': False})
check('Original pain fixture with consistent feature geometry still exceeds 100 but not necessarily 205', broad_label_geometry)

def extraction_anchors():
    text = extraction['functionSource']
    for anchor in ['matched = list(dict.fromkeys(matched))', 'len(matched) / max(1, len(input_symptoms_list))', '(0.65 * cos_score) + (0.35 * overlap_ratio)', 'round(float(combined_score * 100), 2)', 'candidates[:5]', "x['confidence'], len(x['matched_symptoms']), x['cosine_sim']"]:
        assert anchor in text
    assert "TfidfVectorizer(ngram_range=(1, 2), min_df=1)" in source
    assert "TfidfVectorizer(ngram_range=(1, 2), stop_words='english')" in evaluation
    assert "top_indices = sims.argsort()[::-1]" in evaluation
check('Exact current runtime/evaluator source anchors are pinned', extraction_anchors)
check('No forbidden file/import/process/network dispatch', lambda: equal(sum(counters.values()), 0))

receipt = {'phase': '5X-MASTER-B13-R2', 'scope': 'Actual-source AST and independent synthetic arithmetic; no clinical/model execution',
           'passed': sum(r['passed'] for r in checks), 'failed': sum(not r['passed'] for r in checks), 'skipped': 0,
           'checks': checks, 'matrix': cases, 'geometry': geometry, 'boundTupleCount': bound_tuple_count,
           'extraction': extraction, 'counters': counters, 'roundingObservations': rounding_observations,
           'bounds': {'n': 'number of input entries, including repeats/blanks', 'm': 'distinct lowercased reference labels matched by substring', 'd': 'number of distinct reference labels', 'c': 'finite nonnegative TF-IDF cosine in [0,1] mathematically', 'score': '0.65*c + 0.35*m/max(1,n)', 'unroundedPercentage': '65*c + 35*m/max(1,n)', 'perProfileUpperBound': '65 + 35*d/max(1,n)', 'universal100Bound': False, 'above100Condition': 'm/max(1,n) > (100 - 65*c)/35', 'intersectionUpperBound': 100, 'floatingPointNote': 'Analytic real-number bounds; source has no finite/range check. Downstream validation remains active.'},
           'modelTrained': False, 'sklearnImported': False, 'appImported': False, 'datasetsRead': False, 'realInferenceRequested': False}
with output.open('x', encoding='utf-8') as handle:
    json.dump(receipt, handle, indent=2, allow_nan=False)
print(json.dumps({'passed': receipt['passed'], 'failed': receipt['failed'], 'matrixRows': len(cases), 'boundTupleCount': bound_tuple_count, 'geometry': geometry}))
sys.exit(1 if receipt['failed'] else 0)
