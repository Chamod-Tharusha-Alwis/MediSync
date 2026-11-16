"""Phase C: supervised symptom-to-diagnosis study on DDXPlus (offline study, not in production).

This script needs sklearn.ensemble and sklearn.inspection, which the project venv cannot import on this machine
(a compiled extension is blocked), so run_study.py runs it with an interpreter where they load. Figures are
drawn by draw_symptom_figures.py, which needs matplotlib (project venv).

Follows docs/report/study/PROTOCOL.md, Phase C. Shadow models are research artefacts only; they are not
deployed. DDXPlus is synthetic and rule-generated, so scores reflect its generator, not clinical accuracy.

Usage:  python ml-engine/evaluation/study/symptom_study.py
"""
import ast
import csv
import io
import os
import time
import zipfile
from collections import Counter, defaultdict

import numpy as np
import scipy.sparse as sp

from study_common import (DATA_DIR, EVAL_DIR, SEED, STUDY_LABEL, bootstrap_mean_ci, percentile_interval, ratio, rounded,
                          run_record, save_figure, update_study_results, write_csv, N_BOOTSTRAP)
from eval_common import dataset_entry, load_engine, read_json, require_tfidf_engine
from fetch_datasets import zip_member
from run_ddxplus_benchmark import symptom_items, MAPPING_PATH
from run_symptom_benchmark import accepted_names, hits_at, norm, PREDICT_ROUTE

SAMPLE_PER_CLASS = {'train': 3000, 'validate': 600, 'test': 2000}
SPLIT_KEYS = {'train': 'ddxplus_train_patients', 'validate': 'ddxplus_validate_patients', 'test': 'ddxplus_test_patients'}
TOP_KS = (1, 3, 5)
VALUE_SEPARATOR = '_@_'
MODEL_SEED = 0
GRIDS = {
    'naiveBayes': [{'alpha': a} for a in (0.01, 0.1, 1.0)],
    'logisticRegression': [{'C': c} for c in (0.1, 1.0, 10.0)],
    'linearSvm': [{'C': c} for c in (0.01, 0.1, 1.0)],
    'randomForest': [{'max_depth': d, 'min_samples_leaf': m} for d in (None, 20) for m in (1, 5)],
    'logisticRegressionAllFields': [{'C': c} for c in (0.1, 1.0, 10.0)],
}
FEATURE_SET = {'naiveBayes': 'S', 'logisticRegression': 'S', 'linearSvm': 'S', 'randomForest': 'S', 'logisticRegressionAllFields': 'S+A'}
RF_TREES = 300
LR_MAX_ITER = 2000
SVM_MAX_ITER = 5000
CALIBRATION_BINS = 10
IMPORTANCE_ROWS = 5000
IMPORTANCE_REPEATS = 5
TOP_FEATURES = 15
CONFUSED_PAIRS = 5
PRODUCTION = 'productionEngine'
MAJORITY = 'majorityClass'


# ---------------------------------------------------------------- data
def sample_split(split):
    """Stratified sample of one official split, drawn in file order with the study seed (two passes, streaming)."""
    entry = dataset_entry(SPLIT_KEYS[split])
    with zipfile.ZipFile(entry['path']) as archive:
        with archive.open(zip_member(archive)) as handle:
            pathologies = [row['PATHOLOGY'] for row in csv.DictReader(io.TextIOWrapper(handle, encoding='utf-8'))]
    by_class = defaultdict(list)
    for index, pathology in enumerate(pathologies):
        by_class[pathology].append(index)
    rng = np.random.default_rng(SEED)
    chosen = set()
    for pathology in sorted(by_class):
        indices = by_class[pathology]
        chosen.update(int(i) for i in rng.choice(indices, size=min(SAMPLE_PER_CLASS[split], len(indices)), replace=False))
    rows = []
    with zipfile.ZipFile(entry['path']) as archive:
        with archive.open(zip_member(archive)) as handle:
            for index, row in enumerate(csv.DictReader(io.TextIOWrapper(handle, encoding='utf-8'))):
                if index in chosen:
                    row['_index'] = index
                    row['_evidences'] = ast.literal_eval(row['EVIDENCES'])
                    rows.append(row)
    return rows, len(pathologies), entry


def feature_columns(train_rows, evidences, include_antecedents):
    columns = set()
    for row in train_rows:
        for code in row['_evidences']:
            name = code.partition(VALUE_SEPARATOR)[0]
            if evidences[name]['is_antecedent'] and not include_antecedents:
                continue
            columns.add(code)
    ordered = sorted(columns)
    if include_antecedents:
        ordered += ['AGE', 'SEX_M']
    return ordered


def encode(rows, columns, evidences, include_antecedents, age_mean=None, age_sd=None):
    index = {name: i for i, name in enumerate(columns)}
    data, rows_idx, cols_idx = [], [], []
    for r, row in enumerate(rows):
        seen = set()
        for code in row['_evidences']:
            name = code.partition(VALUE_SEPARATOR)[0]
            if evidences[name]['is_antecedent'] and not include_antecedents:
                continue
            j = index.get(code)
            if j is not None and j not in seen:
                seen.add(j)
                rows_idx.append(r)
                cols_idx.append(j)
                data.append(1.0)
        if include_antecedents:
            age = (float(row['AGE']) - age_mean) / age_sd if age_sd else float(row['AGE'])
            rows_idx += [r, r]
            cols_idx += [index['AGE'], index['SEX_M']]
            data += [age, 1.0 if row['SEX'] == 'M' else 0.0]
    return sp.csr_matrix((data, (rows_idx, cols_idx)), shape=(len(rows), len(columns)))


# ---------------------------------------------------------------- scoring
def rank_hits(scores, y, classes):
    """Top-k hit vectors from a (rows x classes) score matrix."""
    order = np.argsort(-scores, axis=1)[:, :max(TOP_KS)]
    hits = {k: (order[:, :k] == y[:, None]).any(axis=1).astype(int) for k in TOP_KS}
    return hits, order[:, 0]


def macro_f1(y, pred, n_classes):
    tp = np.bincount(y[y == pred], minlength=n_classes).astype(float)
    predicted = np.bincount(pred, minlength=n_classes).astype(float)
    actual = np.bincount(y, minlength=n_classes).astype(float)
    precision = np.divide(tp, predicted, out=np.zeros(n_classes), where=predicted > 0)
    recall = np.divide(tp, actual, out=np.zeros(n_classes), where=actual > 0)
    f1 = np.divide(2 * precision * recall, precision + recall, out=np.zeros(n_classes), where=(precision + recall) > 0)
    return f1.mean(), precision, recall, f1


def bootstrap_macro_f1(y, pred, n_classes, rng):
    n = y.size
    indices = rng.integers(0, n, size=(N_BOOTSTRAP, n))
    values = np.array([macro_f1(y[idx], pred[idx], n_classes)[0] for idx in indices])
    return percentile_interval(values)


def mcnemar_exact(a_correct, b_correct):
    """Exact binomial McNemar test on discordant pairs between two correctness vectors."""
    from scipy.stats import binom
    b = int(((a_correct == 1) & (b_correct == 0)).sum())
    c = int(((a_correct == 0) & (b_correct == 1)).sum())
    n = b + c
    p = min(1.0, 2 * binom.cdf(min(b, c), n, 0.5)) if n else None
    return {'discordantAWrongBRight': c, 'discordantARightBWrong': b, 'pValue': rounded(p)}


def calibration(probabilities, y):
    top = probabilities.max(axis=1)
    pred = probabilities.argmax(axis=1)
    correct = (pred == y).astype(float)
    bins = np.clip((top * CALIBRATION_BINS).astype(int), 0, CALIBRATION_BINS - 1)
    curve, ece = [], 0.0
    for b in range(CALIBRATION_BINS):
        mask = bins == b
        if mask.any():
            ece += mask.mean() * abs(top[mask].mean() - correct[mask].mean())
            curve.append({'bin': f'{b / CALIBRATION_BINS:.1f}-{(b + 1) / CALIBRATION_BINS:.1f}', 'rows': int(mask.sum()),
                          'meanConfidence': rounded(top[mask].mean()), 'accuracy': rounded(correct[mask].mean())})
    onehot = np.zeros_like(probabilities)
    onehot[np.arange(y.size), y] = 1.0
    brier = float(((probabilities - onehot) ** 2).sum(axis=1).mean())
    return {'brierMulticlass': rounded(brier), 'ece': rounded(ece), 'bins': CALIBRATION_BINS, 'reliability': curve}


# ---------------------------------------------------------------- models
def build(model, params, n_features):
    from sklearn.naive_bayes import MultinomialNB
    from sklearn.linear_model import LogisticRegression
    from sklearn.svm import LinearSVC
    from sklearn.ensemble import RandomForestClassifier
    if model == 'naiveBayes':
        return MultinomialNB(**params)
    if model in ('logisticRegression', 'logisticRegressionAllFields'):
        return LogisticRegression(C=params['C'], max_iter=LR_MAX_ITER, random_state=MODEL_SEED)
    if model == 'linearSvm':
        return LinearSVC(C=params['C'], max_iter=SVM_MAX_ITER, random_state=MODEL_SEED)
    if model == 'randomForest':
        return RandomForestClassifier(n_estimators=RF_TREES, random_state=MODEL_SEED, n_jobs=1, **params)
    raise ValueError(model)


def scores_of(estimator, X):
    if hasattr(estimator, 'predict_proba'):
        return estimator.predict_proba(X)
    return estimator.decision_function(X)


def production_engine(rows, evidences, mapping_names, class_index):
    engine, post = load_engine()
    require_tfidf_engine(engine)
    accepted = accepted_names(read_json(MAPPING_PATH))
    name_to_class = {name: diagnosis for diagnosis, names in accepted.items() for name in names}
    hits = {k: [] for k in TOP_KS}
    top1 = []
    for row in rows:
        predictions = post(PREDICT_ROUTE, {'symptoms': symptom_items(row['_evidences'], evidences)}).get('predictions') or []
        ranked = [p['disease'] for p in predictions]
        for k in TOP_KS:
            hits[k].append(hits_at(ranked, accepted[row['PATHOLOGY']], k))
        mapped = name_to_class.get(norm(ranked[0])) if ranked else None
        top1.append(class_index[mapped] if mapped in class_index else -1)
    covered = sum(1 for row in rows if accepted[row['PATHOLOGY']])
    return {k: np.array(v) for k, v in hits.items()}, np.array(top1), covered, len([d for d in accepted if accepted[d]])


# ---------------------------------------------------------------- main
def main():
    started = time.time()
    evidences = read_json(dataset_entry('ddxplus_evidences')['path'])
    conditions = read_json(dataset_entry('ddxplus_conditions')['path'])
    classes = sorted(spec['cond-name-eng'] for spec in conditions.values())
    class_index = {name: i for i, name in enumerate(classes)}
    samples, split_sizes, entries = {}, {}, {}
    for split in ('train', 'validate', 'test'):
        samples[split], split_sizes[split], entries[split] = sample_split(split)
        print(f'{split}: {len(samples[split])} rows sampled from {split_sizes[split]}', flush=True)
    y = {split: np.array([class_index[row['PATHOLOGY']] for row in samples[split]]) for split in samples}

    eda = exploratory(samples, evidences, classes)

    columns = {'S': feature_columns(samples['train'], evidences, False), 'S+A': feature_columns(samples['train'], evidences, True)}
    ages = np.array([float(row['AGE']) for row in samples['train']])
    age_mean, age_sd = float(ages.mean()), float(ages.std())
    X = {name: {split: encode(samples[split], cols, evidences, name == 'S+A', age_mean, age_sd) for split in samples} for name, cols in columns.items()}
    print(f"features: S={len(columns['S'])}, S+A={len(columns['S+A'])}", flush=True)

    rng = np.random.default_rng(SEED)
    n_classes = len(classes)
    y_test = y['test']
    results, fitted, selection = {}, {}, {}

    # Baselines.
    majority = int(np.bincount(y['train'], minlength=n_classes).argmax())
    maj_scores = np.zeros((y_test.size, n_classes))
    maj_scores[:, np.argsort(-np.bincount(y['train'], minlength=n_classes))[:max(TOP_KS)]] = np.arange(max(TOP_KS), 0, -1)
    hits, top1 = rank_hits(maj_scores, y_test, classes)
    results[MAJORITY] = summarise(hits, top1, y_test, n_classes, rng, {'majorityClass': classes[majority]})

    engine_hits, engine_top1, covered_rows, covered_classes = production_engine(samples['test'], evidences, None, class_index)
    results[PRODUCTION] = summarise(engine_hits, engine_top1, y_test, n_classes, rng,
                                    {'coveredRows': covered_rows, 'coveredPathologies': covered_classes, 'rows': int(y_test.size),
                                     'note': 'Rows whose pathology has no MediSync profile count as wrong.'})
    print('production engine done', flush=True)

    # Grid search on the validation sample, then one test scoring per model.
    for model, grid in GRIDS.items():
        feature_set = FEATURE_SET[model]
        best = None
        for params in grid:
            t0 = time.time()
            estimator = build(model, params, len(columns[feature_set])).fit(X[feature_set]['train'], y['train'])
            val_pred = scores_of(estimator, X[feature_set]['validate']).argmax(axis=1)
            score = macro_f1(y['validate'], val_pred, n_classes)[0]
            selection.setdefault(model, []).append({'params': params, 'validationMacroF1': rounded(score), 'fitSeconds': rounded(time.time() - t0)})
            print(f'  {model} {params}: validation macro F1 {score:.4f} ({time.time() - t0:.0f}s)', flush=True)
            if best is None or score > best[0]:
                best = (score, params, estimator)
        fitted[model] = best[2]
        test_scores = scores_of(best[2], X[feature_set]['test'])
        hits, top1 = rank_hits(test_scores, y_test, classes)
        extra = {'featureSet': feature_set, 'features': len(columns[feature_set]), 'chosenParams': best[1], 'validationMacroF1': rounded(best[0])}
        if hasattr(best[2], 'predict_proba'):
            extra['calibration'] = calibration(test_scores, y_test)
        results[model] = summarise(hits, top1, y_test, n_classes, rng, extra)
        print(f'{model}: test top-1 {results[model]["top1"]["accuracy"]:.4f}, macro F1 {results[model]["macroF1"]["value"]:.4f}', flush=True)

    for model in results:
        if model != PRODUCTION:
            results[model]['mcnemarVsProductionEngine'] = mcnemar_exact(results[PRODUCTION]['_top1Correct'], results[model]['_top1Correct'])

    best_model = max((m for m in GRIDS), key=lambda m: results[m]['macroF1']['value'])
    importance = permutation_importance_block(fitted[best_model], FEATURE_SET[best_model], columns, X, y, evidences)
    confused = confusion_pairs(y_test, results[best_model]['_top1'], classes)

    for model in results:
        results[model].pop('_top1Correct')
        results[model].pop('_top1')

    metrics_rows = []
    for model, block in results.items():
        metrics_rows.append({'model': model, 'featureSet': block.get('featureSet', 'text' if model == PRODUCTION else 'none'),
                             'features': block.get('features'), 'rows': int(y_test.size),
                             **{f'top{k}': block[f'top{k}']['accuracy'] for k in TOP_KS},
                             **{f'top{k}Ci95': block[f'top{k}']['ci95'] for k in TOP_KS},
                             'macroF1': block['macroF1']['value'], 'macroF1Ci95': block['macroF1']['ci95'],
                             'brier': (block.get('calibration') or {}).get('brierMulticlass'), 'ece': (block.get('calibration') or {}).get('ece'),
                             'mcnemarP': (block.get('mcnemarVsProductionEngine') or {}).get('pValue'), 'chosenParams': str(block.get('chosenParams', ''))})
    write_csv('symptom_study_metrics.csv', metrics_rows, ['model', 'featureSet', 'features', 'rows', 'top1', 'top3', 'top5', 'top1Ci95', 'top3Ci95',
                                                          'top5Ci95', 'macroF1', 'macroF1Ci95', 'brier', 'ece', 'mcnemarP', 'chosenParams'])
    write_csv('symptom_confusion_pairs.csv', confused, ['rank', 'truePathology', 'predictedPathology', 'rows', 'shareOfTrueClassRows'])

    update_study_results('phaseC', {
        'label': STUDY_LABEL, 'run': run_record(),
        'syntheticDataStatement': ('DDXPlus is synthetic and rule-generated from a proprietary knowledge base. High scores reflect the '
                                   'generator and do not imply accuracy on real patients.'),
        'datasets': {split: {'key': SPLIT_KEYS[split], 'sha256': entries[split]['sha256'], 'splitRows': split_sizes[split],
                             'sampledRows': len(samples[split]), 'perClassCap': SAMPLE_PER_CLASS[split]} for split in samples},
        'classes': n_classes, 'features': {name: len(cols) for name, cols in columns.items()},
        'eda': eda, 'gridSearch': selection, 'models': results, 'bestModelByTestMacroF1': best_model,
        'permutationImportance': importance, 'confusionPairs': confused, 'secondsElapsed': rounded(time.time() - started),
    })
    print(f'phase C done in {time.time() - started:.0f}s; best model {best_model}')


def summarise(hits, top1, y_test, n_classes, rng, extra):
    correct = hits[1]
    pred = np.where(top1 >= 0, top1, n_classes)  # -1 (no mapped prediction) becomes an extra "none" class
    macro, precision, recall, f1 = macro_f1(y_test, np.minimum(pred, n_classes - 1) if False else pred, n_classes + 1)
    f1_true = f1[:n_classes].mean()
    block = {f'top{k}': {'accuracy': rounded(hits[k].mean()), 'ci95': bootstrap_mean_ci(hits[k], rng), 'correct': int(hits[k].sum())} for k in TOP_KS}
    block['macroF1'] = {'value': rounded(f1_true), 'ci95': bootstrap_macro_f1_fixed(y_test, pred, n_classes, rng)}
    block['perClass'] = {'precision': [rounded(v) for v in precision[:n_classes]], 'recall': [rounded(v) for v in recall[:n_classes]],
                         'f1': [rounded(v) for v in f1[:n_classes]]}
    block.update(extra)
    block['_top1Correct'] = correct
    block['_top1'] = pred
    return block


def bootstrap_macro_f1_fixed(y, pred, n_classes, rng):
    n = y.size
    indices = rng.integers(0, n, size=(N_BOOTSTRAP, n))
    values = np.array([macro_f1(y[idx], pred[idx], n_classes + 1)[3][:n_classes].mean() for idx in indices])
    return percentile_interval(values)


def exploratory(samples, evidences, classes):
    rows = []
    for split, data in samples.items():
        counts = Counter(row['PATHOLOGY'] for row in data)
        n_evidence = np.array([len(row['_evidences']) for row in data])
        n_symptoms = np.array([sum(1 for c in row['_evidences'] if not evidences[c.partition(VALUE_SEPARATOR)[0]]['is_antecedent']) for row in data])
        ages = np.array([float(row['AGE']) for row in data])
        rows.append({'split': split, 'rows': len(data), 'classes': len(counts), 'smallestClassRows': min(counts.values()), 'largestClassRows': max(counts.values()),
                     'evidencesPerPatientMean': rounded(n_evidence.mean()), 'evidencesPerPatientMedian': rounded(np.median(n_evidence)),
                     'evidencesPerPatientMin': int(n_evidence.min()), 'evidencesPerPatientMax': int(n_evidence.max()),
                     'symptomsPerPatientMean': rounded(n_symptoms.mean()), 'patientsWithNoSymptomEvidence': int((n_symptoms == 0).sum()),
                     'ageMean': rounded(ages.mean()), 'ageMin': int(ages.min()), 'ageMax': int(ages.max()),
                     'shareMale': rounded(np.mean([row['SEX'] == 'M' for row in data])),
                     'missingAge': sum(1 for row in data if not row['AGE']), 'missingSex': sum(1 for row in data if row['SEX'] not in ('M', 'F')),
                     'missingEvidences': sum(1 for row in data if not row['_evidences'])})
    write_csv('ddxplus_eda.csv', rows, list(rows[0].keys()))
    test_counts = Counter(row['PATHOLOGY'] for row in samples['test'])
    return {'bySplit': rows, 'testClassCounts': dict(sorted(test_counts.items())),
            'testEvidencesPerPatient': [len(row['_evidences']) for row in samples['test']]}


def permutation_importance_block(estimator, feature_set, columns, X, y, evidences):
    from sklearn.inspection import permutation_importance
    rng = np.random.default_rng(SEED)
    val_y = y['validate']
    per_class = max(1, IMPORTANCE_ROWS // len(np.unique(val_y)))
    chosen = []
    for label in np.unique(val_y):
        indices = np.flatnonzero(val_y == label)
        chosen.extend(rng.choice(indices, size=min(per_class, indices.size), replace=False))
    chosen = np.sort(np.array(chosen))
    X_sub = X[feature_set]['validate'][chosen].toarray()
    result = permutation_importance(estimator, X_sub, val_y[chosen], scoring='f1_macro', n_repeats=IMPORTANCE_REPEATS, random_state=MODEL_SEED)
    order = np.argsort(-result.importances_mean)[:TOP_FEATURES]
    top = []
    for j in order:
        name = columns[feature_set][j]
        code, _, value = name.partition(VALUE_SEPARATOR)
        spec = evidences.get(code, {})
        meaning = (spec.get('value_meaning', {}).get(value) or {}).get('en') if value else None
        text = spec.get('question_en', name) + (f' = {meaning}' if meaning else (f' = {value}' if value else ''))
        top.append({'feature': name, 'text': text, 'importanceMean': rounded(result.importances_mean[j]), 'importanceSd': rounded(result.importances_std[j])})
    return {'rowsUsed': int(chosen.size), 'split': 'validate', 'repeats': IMPORTANCE_REPEATS, 'scoring': 'f1_macro', 'top': top}


def confusion_pairs(y_test, pred, classes):
    pairs = Counter((int(t), int(p)) for t, p in zip(y_test, pred) if t != p and p < len(classes))
    class_rows = np.bincount(y_test, minlength=len(classes))
    return [{'rank': i + 1, 'truePathology': classes[t], 'predictedPathology': classes[p], 'rows': n, 'shareOfTrueClassRows': ratio(n, class_rows[t])}
            for i, ((t, p), n) in enumerate(pairs.most_common(CONFUSED_PAIRS))]


if __name__ == '__main__':
    main()
