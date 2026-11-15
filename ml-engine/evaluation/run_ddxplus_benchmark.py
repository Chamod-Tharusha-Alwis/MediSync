"""V1: second independent symptom benchmark on DDXPlus (synthetic patients, CC BY 4.0).

The sample, the input rule and the label mapping are fixed in ddxplus_protocol.json and
ddxplus_label_mapping.json, which were committed before this script first ran the engine.
Rows are sent to the real /api/ml/predict-disease route by run_benchmark() in run_symptom_benchmark.py.

Usage:  python ml-engine/evaluation/run_ddxplus_benchmark.py
"""
import ast
import csv
import io
import os
import zipfile
from collections import defaultdict

import numpy as np

from eval_common import EVAL_DIR, dataset_entry, read_json
from fetch_datasets import zip_member
from run_symptom_benchmark import run_benchmark

PROTOCOL_PATH = os.path.join(EVAL_DIR, 'ddxplus_protocol.json')
MAPPING_PATH = os.path.join(EVAL_DIR, 'ddxplus_label_mapping.json')
VALUE_SEPARATOR = '_@_'
MISSING_MEANING = 'NA'


def load_patients(path):
    with zipfile.ZipFile(path) as archive:
        with archive.open(zip_member(archive)) as handle:
            return list(csv.DictReader(io.TextIOWrapper(handle, encoding='utf-8')))


def draw_sample(patients, per_pathology, seed):
    """Stratified sample, fixed by the protocol: up to per_pathology rows of each pathology, in file order."""
    by_pathology = defaultdict(list)
    for index, patient in enumerate(patients):
        by_pathology[patient['PATHOLOGY']].append(index)
    rng = np.random.default_rng(seed)
    chosen = []
    for pathology in sorted(by_pathology):
        indices = by_pathology[pathology]
        take = min(per_pathology, len(indices))
        chosen.extend(sorted(int(i) for i in rng.choice(indices, size=take, replace=False)))
    return chosen


def symptom_items(evidence_codes, evidences):
    """Turn one patient's evidence codes into the list of English symptom phrases defined by the protocol."""
    grouped = {}
    for code in evidence_codes:
        name, _, value = code.partition(VALUE_SEPARATOR)
        spec = evidences[name]
        if spec['is_antecedent']:
            continue
        meanings = grouped.setdefault(name, [])
        if value:
            meaning = (spec.get('value_meaning', {}).get(value) or {}).get('en')
            if meaning and meaning != MISSING_MEANING and meaning not in meanings:
                meanings.append(meaning)
    items = []
    for name, meanings in grouped.items():
        question = evidences[name]['question_en'].strip()
        items.append(' '.join([question] + meanings))
    return items


def main():
    protocol = read_json(PROTOCOL_PATH)
    patients_entry = dataset_entry(protocol['dataset'])
    evidences = read_json(dataset_entry('ddxplus_evidences')['path'])
    conditions = read_json(dataset_entry('ddxplus_conditions')['path'])
    english_names = {spec['cond-name-eng'] for spec in conditions.values()}

    patients = load_patients(patients_entry['path'])
    unknown = sorted({p['PATHOLOGY'] for p in patients} - english_names)
    if unknown:
        raise SystemExit(f'Pathology names not in release_conditions.json: {unknown}')
    sample = draw_sample(patients, protocol['sample']['perPathology'], protocol['sample']['seed'])

    inputs, texts, gold = [], [], []
    for index in sample:
        items = symptom_items(ast.literal_eval(patients[index]['EVIDENCES']), evidences)
        inputs.append(items)
        texts.append(', '.join(items))
        gold.append(patients[index]['PATHOLOGY'])

    manifest = {k: v for k, v in patients_entry.items() if k != 'path'}
    manifest['sample'] = {**protocol['sample'], 'rows': len(sample), 'pathologies': len(set(gold)),
                          'testSplitRows': len(patients)}
    run_benchmark('ddxplusBenchmark', manifest, inputs, texts, gold, MAPPING_PATH, 'all', {
        'inputFormat': ('A list of English symptom phrases, one per DDXPlus symptom evidence (antecedents excluded), built by the '
                        'rule in ddxplus_protocol.json and sent unchanged as the "symptoms" list.'),
        'labelVocabulary': ('DDXPlus was generated from a proprietary knowledge base unrelated to the MediSync profile sources, and its '
                            'label set differs: only some of its pathologies have a MediSync profile.'),
    }, row_ids=sample)


if __name__ == '__main__':
    main()
