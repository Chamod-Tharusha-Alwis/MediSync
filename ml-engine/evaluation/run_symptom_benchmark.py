"""Symptom engine benchmark (offline): shared routine plus the gretelai/symptom_to_diagnosis run.

Each row is sent to the real /api/ml/predict-disease route through Flask's test client, so the
code path is the one the API uses. No engine logic is re-implemented or changed here.
run_ddxplus_benchmark.py reuses run_benchmark() for the second dataset.

Every number written to evaluation_results.json is computed below from the engine's responses.
This is an engineering benchmark on public, non-patient data, not clinical validation.

Usage:  python ml-engine/evaluation/run_symptom_benchmark.py
"""
import csv
import json
import os
import re
import sys
from collections import Counter

import numpy as np

from eval_common import (MAPPING_PATH, ML_DIR, CLINICAL_VALIDATION, dataset_entry, environment_info,
                         git_state, load_engine, read_json, require_tfidf_engine, sha256_file, sha256_text,
                         today_utc, update_results)

SEED = 20261114
N_BOOTSTRAP = 2000
CI_LEVEL_PERCENT = 95
TOP_KS = (1, 3, 5)
NEAR_DUPLICATE_COSINE = 0.9
ROUND_DP = 6
MIN_SOURCE_TEXT_CHARS = 20
PREDICT_ROUTE = '/api/ml/predict-disease'
DATASET_KEY = 'gretelai_test'
OTHER_PROFILE = '(another profile)'
NO_PREDICTION = '(no prediction)'


def norm(name):
    return re.sub(r'\s+', ' ', str(name)).strip().lower()


def rounded(value):
    return round(float(value), ROUND_DP)


# ---------------------------------------------------------------- data
def load_jsonl(dataset_key):
    entry = dataset_entry(dataset_key)
    with open(entry['path'], 'r', encoding='utf-8') as handle:
        rows = [json.loads(line) for line in handle if line.strip()]
    return {k: v for k, v in entry.items() if k != 'path'}, rows


def accepted_names(mapping):
    """diagnosis -> set of normalised profile names that count as correct (empty set when not covered)."""
    accepted = {}
    for diagnosis, entry in mapping['mapping'].items():
        if entry is None or not entry.get('tier1_profile') and not entry.get('tier2_profiles'):
            accepted[diagnosis] = set()
            continue
        names = [entry.get('tier1_profile')] + list(entry.get('tier2_profiles') or [])
        accepted[diagnosis] = {norm(name) for name in names if name}
    return accepted


# ---------------------------------------------------------------- statistics
def percentile_interval(samples):
    tail = (100 - CI_LEVEL_PERCENT) / 2
    low, high = np.percentile(samples, [tail, 100 - tail])
    return [rounded(low), rounded(high)]


def bootstrap_indices(n_rows, seed):
    return np.random.default_rng(seed).integers(0, n_rows, size=(N_BOOTSTRAP, n_rows))


def accuracy_with_ci(hits, indices):
    hits = np.asarray(hits, dtype=float)
    if hits.size == 0:
        return {'accuracy': None, 'ci95': None, 'correct': 0, 'n': 0}
    return {'accuracy': rounded(hits.mean()), 'ci95': percentile_interval(hits[indices].mean(axis=1)),
            'correct': int(hits.sum()), 'n': int(hits.size)}


def paired_difference(engine_hits, baseline_hits, indices):
    diff = np.asarray(engine_hits, dtype=float) - np.asarray(baseline_hits, dtype=float)
    interval = percentile_interval(diff[indices].mean(axis=1))
    return {'engineMinusBaseline': rounded(diff.mean()), 'ci95': interval,
            'engineBeatsBaseline': bool(diff.mean() > 0), 'ciExcludesZero': bool(interval[0] > 0 or interval[1] < 0)}


def per_class_report(gold, predicted, classes):
    report = {}
    for label in classes:
        tp = sum(1 for g, p in zip(gold, predicted) if g == label and p == label)
        fp = sum(1 for g, p in zip(gold, predicted) if g != label and p == label)
        fn = sum(1 for g, p in zip(gold, predicted) if g == label and p != label)
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        report[label] = {'precision': rounded(precision), 'recall': rounded(recall), 'f1': rounded(f1),
                         'support': tp + fn, 'truePositives': tp, 'falsePositives': fp, 'falseNegatives': fn,
                         'precisionUndefined': tp + fp == 0}
    supports = [report[label]['support'] for label in classes]
    total = sum(supports)

    def macro(key):
        return rounded(sum(report[label][key] for label in classes) / len(classes)) if classes else 0.0

    weighted = sum(report[label]['f1'] * s for label, s in zip(classes, supports)) / total if total else 0.0
    return report, {'macroPrecision': macro('precision'), 'macroRecall': macro('recall'), 'macroF1': macro('f1'),
                    'weightedF1': rounded(weighted)}


# ---------------------------------------------------------------- baselines
def tokens(text):
    return set(re.findall(r'[a-z]+', str(text).lower()))


def keyword_overlap_ranking(text, profiles):
    """Naive matcher: rank profiles by the number of distinct words shared with the input. No TF-IDF, no weights."""
    words = tokens(text)
    scored = [(len(words & profile['words']), profile['name']) for profile in profiles]
    scored.sort(key=lambda item: (-item[0], item[1]))
    return [name for _, name in scored]


def hits_at(ranked_names, accepted, k):
    return int(any(norm(name) in accepted for name in ranked_names[:k]))


# ---------------------------------------------------------------- leakage
def leakage_corpora(engine):
    """Text used to build the 41 curated profiles and the Tier 2 knowledge base, grouped by source file."""
    data_dir = os.path.join(ML_DIR, 'data')
    corpora = {}

    with open(os.path.join(data_dir, 'dataset.csv'), 'r', encoding='utf-8') as handle:
        reader = csv.reader(handle)
        next(reader)
        corpora['ml-engine/data/dataset.csv (rows: disease + symptom tokens)'] = sorted({
            ' '.join(cell.replace('_', ' ').strip() for cell in row if cell.strip()) for row in reader})

    for filename in ('symptom_Description.csv', 'symptom_precaution.csv'):
        with open(os.path.join(data_dir, filename), 'r', encoding='utf-8') as handle:
            reader = csv.reader(handle)
            next(reader)
            corpora[f'ml-engine/data/{filename}'] = sorted({' '.join(cell.strip() for cell in row if cell.strip()) for row in reader})

    corpora['Tier 1 profile documents built by app.py (41 curated profiles)'] = list(engine.disease_docs)
    corpora['Tier 2 profile documents built by app.py (active knowledge-base profiles)'] = [
        f"{item['disease']} {' '.join(item['symptoms'])}" for item in engine.kb_disease_data]

    kb = read_json(os.path.join(data_dir, 'disease_symptom_kb.v1.json'))
    corpora['ml-engine/data/disease_symptom_kb.v1.json (all entries)'] = [
        f"{item.get('name', '')} {' '.join(s.get('name', '') for s in item.get('symptoms', []))}" for item in kb['diseases']]

    raw_path = os.path.join(ML_DIR, 'data_pipeline', 'raw', 'symcat_conditions.csv')
    raw_text = set()
    with open(raw_path, 'r', encoding='utf-8', errors='replace') as handle:
        for row in csv.DictReader(handle):
            for column, value in row.items():
                # The scrape repeats the same fields under many nested column prefixes.
                if column and column.endswith(('_description', '_symptoms_summary')) and value and len(value.strip()) > MIN_SOURCE_TEXT_CHARS:
                    raw_text.add(value.strip())
    corpora['ml-engine/data_pipeline/raw/symcat_conditions.csv (descriptions and symptom summaries)'] = sorted(raw_text)
    return corpora, kb.get('licenseStatus')


def squash(text):
    return re.sub(r'[^a-z0-9]+', ' ', text.lower()).strip()


def leakage_check(test_texts, engine):
    from sklearn.feature_extraction.text import TfidfVectorizer
    corpora, kb_licence_field = leakage_corpora(engine)
    all_docs = [doc for docs in corpora.values() for doc in docs]
    vectorizer = TfidfVectorizer(lowercase=True).fit(list(test_texts) + all_docs)
    test_matrix = vectorizer.transform(test_texts)
    squashed_tests = [squash(text) for text in test_texts]

    overlapping_rows = set()
    by_source = {}
    for source, docs in corpora.items():
        similarity = (test_matrix @ vectorizer.transform(docs).T).toarray() if docs else np.zeros((len(test_texts), 1))
        row_max = similarity.max(axis=1)
        near = [int(i) for i in np.flatnonzero(row_max > NEAR_DUPLICATE_COSINE)]
        squashed_docs = [squash(doc) for doc in docs]
        exact = [i for i, text in enumerate(squashed_tests) if text and any(text in doc for doc in squashed_docs)]
        overlapping_rows.update(near)
        overlapping_rows.update(exact)
        by_source[source] = {'documents': len(docs), 'exactOrContainedMatches': len(exact),
                             'nearDuplicatesAboveThreshold': len(near),
                             'maxCosineSimilarity': rounded(row_max.max()),
                             'meanOfRowMaxCosineSimilarity': rounded(row_max.mean())}

    within = (test_matrix @ test_matrix.T).toarray()
    np.fill_diagonal(within, 0)
    duplicate_pairs = int((np.triu(within) > NEAR_DUPLICATE_COSINE).sum())
    return {
        'method': ('TF-IDF word vectors (scikit-learn defaults) fitted on the test sentences plus all profile-building text; '
                   f'a near-duplicate is cosine similarity above {NEAR_DUPLICATE_COSINE}. Exact check: the test sentence, '
                   'lower-cased with punctuation removed, equals or is contained in a source document.'),
        'threshold': NEAR_DUPLICATE_COSINE,
        'bySource': by_source,
        'overlappingRowIndices': sorted(overlapping_rows),
        'overlappingRowCount': len(overlapping_rows),
        'nearDuplicatePairsInsideTestSet': duplicate_pairs,
        'trainSplitChecked': False,
        'symcatLicenceStatus': 'not verified',
        'symcatLicenceFieldInKnowledgeBaseFile': kb_licence_field,
        'curatedProfileSourceLicenceStatus': 'not verified (no licence for ml-engine/data/dataset.csv is documented in the repository)',
    }, sorted(overlapping_rows)


# ---------------------------------------------------------------- main
def evaluate_subset(name, row_ids, engine_hits, gold, predicted_class, classes):
    indices = bootstrap_indices(len(row_ids), SEED)
    block = {'description': name, 'rows': len(row_ids)}
    for k in TOP_KS:
        block[f'top{k}'] = accuracy_with_ci([engine_hits[k][i] for i in row_ids], indices)
    report, averages = per_class_report([gold[i] for i in row_ids], [predicted_class[i] for i in row_ids], classes)
    block.update({'perDiagnosis': report, **averages,
                  'averagingNote': 'Macro averages give each diagnosis equal weight; a never-predicted diagnosis counts as precision 0.'})
    return block, indices


def run_benchmark(section, manifest, inputs, texts, gold, mapping_path, keyword_pool, notes, row_ids=None):
    """Run the engine on every row and write one results section.

    inputs: what is sent as "symptoms" (a string or a list of strings, unchanged).
    texts: one string per row, used for the keyword baseline and the leakage check.
    keyword_pool: 'tier1' (41 curated profiles) or 'all' (Tier 1 and Tier 2 profiles).
    """
    mapping = read_json(mapping_path)
    accepted = accepted_names(mapping)
    missing = sorted(set(gold) - set(accepted))
    if missing:
        sys.exit(f'{os.path.basename(mapping_path)} has no entry for: {missing}')

    engine, post = load_engine()
    require_tfidf_engine(engine)
    tier1_names = {norm(item['disease']) for item in engine.symptom_data}
    tier2_names = {norm(item['disease']) for item in engine.kb_disease_data}
    for diagnosis, entry in mapping['mapping'].items():
        if entry and entry.get('tier1_profile') and norm(entry['tier1_profile']) not in tier1_names:
            sys.exit(f'Mapping error: Tier 1 profile "{entry["tier1_profile"]}" is not loaded by the engine.')
        for name in (entry or {}).get('tier2_profiles') or []:
            if norm(name) not in tier2_names:
                sys.exit(f'Mapping error: Tier 2 profile "{name}" is not loaded by the engine.')

    classes = sorted(accepted)
    name_to_class = {name: diagnosis for diagnosis, names in accepted.items() for name in names}
    rows = list(range(len(gold)))
    covered = [bool(accepted[label]) for label in gold]
    covered_classes = sorted(label for label in classes if accepted[label])

    # A4: run the real route once per row.
    engine_hits = {k: [] for k in TOP_KS}
    predicted_class, row_records, tiers = [], [], Counter()
    for index, (payload, text, label) in enumerate(zip(inputs, texts, gold)):
        response = post(PREDICT_ROUTE, {'symptoms': payload})
        predictions = response.get('predictions') or []
        ranked = [item['disease'] for item in predictions]
        for k in TOP_KS:
            engine_hits[k].append(hits_at(ranked, accepted[label], k))
        top = norm(ranked[0]) if ranked else None
        predicted_class.append(NO_PREDICTION if top is None else name_to_class.get(top, OTHER_PROFILE))
        tiers[str(response.get('tier'))] += 1
        row_records.append({
            'row': index if row_ids is None else row_ids[index], 'inputSha256': sha256_text(text),
            'referenceDiagnosis': label, 'covered': covered[index],
            'tier': response.get('tier'),
            'top5': [{'profile': item['disease'], 'confidence': item['confidence'], 'source': item.get('source')} for item in predictions],
            'predictedClass': predicted_class[-1],
            **{f'hitTop{k}': engine_hits[k][-1] for k in TOP_KS},
        })

    all_ids = list(range(len(rows)))
    covered_ids = [i for i in all_ids if covered[i]]

    # A5: metrics on both row sets.
    all_block, all_indices = evaluate_subset('All rows; a row whose diagnosis has no MediSync profile counts as wrong.',
                                             all_ids, engine_hits, gold, predicted_class, classes)
    covered_block, _ = evaluate_subset('Covered rows only: rows whose diagnosis maps to a MediSync profile.',
                                       covered_ids, engine_hits, gold, predicted_class, covered_classes)

    columns = classes + [OTHER_PROFILE, NO_PREDICTION]
    matrix = np.zeros((len(classes), len(columns)), dtype=int)
    for g, p in zip(gold, predicted_class):
        matrix[classes.index(g), columns.index(p)] += 1
    other_profiles = Counter(record['top5'][0]['profile'] for record in row_records
                             if record['predictedClass'] == OTHER_PROFILE)
    worst = sorted(classes, key=lambda label: (all_block['perDiagnosis'][label]['recall'], -all_block['perDiagnosis'][label]['support'], label))
    worst_five = []
    for label in worst[:5]:
        wrong = Counter(('no prediction' if not record['top5'] else record['top5'][0]['profile'])
                        for record in row_records if record['referenceDiagnosis'] == label and not record['hitTop1'])
        worst_five.append({'diagnosis': label, **{key: all_block['perDiagnosis'][label][key] for key in ('recall', 'precision', 'f1', 'support')},
                           'top1Errors': [{'predictedProfile': name, 'rows': count} for name, count in sorted(wrong.items(), key=lambda item: (-item[1], item[0]))]})

    # A6: baselines on exactly the same rows.
    def representative(label):
        entry = mapping['mapping'][label]
        return entry.get('tier1_profile') or (entry.get('tier2_profiles') or [label])[0]

    covered_tier1 = sorted({representative(label) for label in covered_classes})
    random_rng = np.random.default_rng(SEED + 1)
    pool = list(engine.symptom_data) + (list(engine.kb_disease_data) if keyword_pool == 'all' else [])
    profiles = [{'name': item['disease'], 'words': tokens(item['disease']) | tokens(' '.join(item.get('symptoms', [])))}
                for item in pool]
    class_counts = Counter(gold)
    majority_order = [representative(label) if accepted[label] else label
                      for label, _ in sorted(class_counts.items(), key=lambda item: (-item[1], item[0]))]
    baseline_rankings = {
        'random': ('Random guess over covered profiles', lambda text: list(random_rng.permutation(covered_tier1))),
        'majority': ('Majority class', lambda text: majority_order),
        'keywordOverlap': ('Keyword overlap (shared-word count)', lambda text: keyword_overlap_ranking(text, profiles)),
    }
    baselines = {}
    for key, (label, rank) in baseline_rankings.items():
        hits = {k: [] for k in TOP_KS}
        for text, reference in zip(texts, gold):
            ranked = rank(text)
            for k in TOP_KS:
                hits[k].append(hits_at(ranked, accepted[reference], k))
        entry = {'label': label, 'rows': len(rows)}
        for k in TOP_KS:
            entry[f'top{k}'] = accuracy_with_ci(hits[k], all_indices)
            entry[f'top{k}']['engineComparison'] = paired_difference(engine_hits[k], hits[k], all_indices)
        baselines[key] = entry
    baselines['random']['definition'] = (f'For each row, a uniformly random ordering of {len(covered_tier1)} profiles, one per covered '
                                         f'diagnosis (seed {SEED + 1}).')
    baselines['random']['analyticExpectation'] = {f'top{k}': rounded(min(k, len(covered_tier1)) / len(covered_tier1)) for k in TOP_KS}
    baselines['majority']['definition'] = ('Always predict the most frequent diagnoses of the evaluated rows (ties broken alphabetically). '
                                           'It uses the evaluated label counts, which favours this baseline.')
    baselines['majority']['predictedOrder'] = majority_order[:max(TOP_KS)]
    pool_name = 'Tier 1 and Tier 2' if keyword_pool == 'all' else 'Tier 1'
    baselines['keywordOverlap']['definition'] = (f'Rank {len(profiles)} profiles ({pool_name}) by the number of distinct words the input '
                                                 'shares with the profile name and symptom list. No TF-IDF, no weights; ties broken alphabetically.')

    # A7: leakage.
    leakage, overlapping = leakage_check(texts, engine)
    if overlapping:
        kept = [i for i in all_ids if i not in set(overlapping)]
        without_block, _ = evaluate_subset('All test rows except rows that overlap profile-building data.',
                                           kept, engine_hits, gold, predicted_class, classes)
        leakage['resultsWithoutOverlappingRows'] = {key: without_block[key] for key in ['rows', 'macroF1', 'weightedF1'] + [f'top{k}' for k in TOP_KS]}
    else:
        leakage['resultsWithoutOverlappingRows'] = None
    leakage['trainSplitChecked'] = notes.get('trainSplitChecked', False)
    leakage['sharedLabelVocabulary'] = {
        'datasetDiagnosesWithAProfile': len(covered_classes),
        'datasetDiagnoses': len(classes),
        'note': notes['labelVocabulary'],
    }

    update_results(section, {
        'clinicalValidation': CLINICAL_VALIDATION,
        'run': {'date': today_utc(), 'git': git_state(), 'seed': SEED, 'randomBaselineSeed': SEED + 1,
                'bootstrapResamples': N_BOOTSTRAP, 'ciLevelPercent': CI_LEVEL_PERCENT, 'ciMethod': 'percentile bootstrap over test rows',
                'route': PREDICT_ROUTE, 'inputFormat': notes['inputFormat'],
                'labelMapping': os.path.basename(mapping_path), 'labelMappingSha256': sha256_file(mapping_path),
                'environment': environment_info()},
        'datasetManifest': manifest,
        'engine': {'tier1Profiles': len(engine.symptom_data), 'tier2Profiles': len(engine.kb_disease_data),
                   'rowsAnsweredByTier': dict(sorted(tiers.items())),
                   'rowsWithNoPrediction': sum(1 for record in row_records if not record['top5'])},
        'coverage': {'testRows': len(rows), 'coveredRows': len(covered_ids), 'uncoveredRows': len(rows) - len(covered_ids),
                     'diagnoses': len(classes), 'coveredDiagnoses': len(covered_classes),
                     'uncoveredDiagnoses': sorted(set(classes) - set(covered_classes)),
                     'coveredByTier2AsWell': sorted(label for label in covered_classes if mapping['mapping'][label].get('tier2_profiles')),
                     'coveredByTier2Only': sorted(label for label in covered_classes if not mapping['mapping'][label].get('tier1_profile'))},
        'allRows': all_block,
        'coveredRowsOnly': covered_block,
        'confusionMatrixTop1': {'rowsAreReferenceDiagnoses': classes, 'columnsArePredictions': columns, 'counts': matrix.tolist(),
                                'otherProfilesPredicted': [{'profile': name, 'rows': count} for name, count in sorted(other_profiles.items(), key=lambda item: (-item[1], item[0]))]},
        'fiveMostWrongDiagnoses': worst_five,
        'baselines': baselines,
        'leakageCheck': leakage,
        'rows': row_records,
    })
    print(json.dumps({'rows': len(rows), 'coveredRows': len(covered_ids),
                      **{f'top{k}': all_block[f'top{k}'] for k in TOP_KS},
                      'macroF1': all_block['macroF1'], 'weightedF1': all_block['weightedF1'],
                      'overlappingRows': len(overlapping)}, indent=2))


def main():
    manifest, rows = load_jsonl(DATASET_KEY)
    texts = [row['input_text'] for row in rows]
    run_benchmark('symptomBenchmark', manifest, texts, texts, [row['output_text'] for row in rows], MAPPING_PATH, 'tier1', {
        'inputFormat': 'The raw input_text sentence is sent unchanged as the "symptoms" string. No pre-processing.',
        'labelVocabulary': ('The benchmark text is different from the profile data, but the dataset uses the same disease label set as '
                            'the source of the Tier 1 profiles (ml-engine/data/dataset.csv). Whether Symptom2Disease was itself written '
                            'from that symptom list is not verified. If it was, this benchmark is easier than data from an unrelated '
                            'source would be.'),
    })



if __name__ == '__main__':
    main()
