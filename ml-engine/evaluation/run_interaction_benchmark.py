"""Part B: benchmark of the MediSync medicine interaction checker (offline).

Each reference pair in interaction_reference.json is sent to the real
/api/ml/check-interactions route through Flask's test client, using product
names from the 3,000-entry catalogue. No checker logic is re-implemented.

Every number written to evaluation_results.json is computed below from the
checker's responses. This is an engineering benchmark, not clinical validation.

Usage:  python ml-engine/evaluation/run_interaction_benchmark.py
"""
import json
import os
import sys

import numpy as np

from eval_common import (INTERACTION_REFERENCE_PATH, ML_DIR, REPO_ROOT, CLINICAL_VALIDATION, environment_info, git_state,
                         load_engine, read_json, sha256_file, today_utc, update_results)

SEED = 20261114
N_BOOTSTRAP = 2000
CI_LEVEL_PERCENT = 95
ROUND_DP = 6
CHECK_ROUTE = '/api/ml/check-interactions'
WARNING, NO_WARNING, UNVERIFIED = 'warning', 'no_warning', 'unverified'
CATALOGUE, TYPED = 'catalogue_product', 'typed_name'
INTERACTING, NON_INTERACTING = 'interacting', 'non_interacting'


def rounded(value):
    return None if value is None else round(float(value), ROUND_DP)


def ratio(numerator, denominator):
    return rounded(numerator / denominator) if denominator else None


def bootstrap_ci(flags):
    """95% percentile bootstrap interval for the mean of a 0/1 list."""
    flags = np.asarray(flags, dtype=float)
    if flags.size == 0:
        return None
    indices = np.random.default_rng(SEED).integers(0, flags.size, size=(N_BOOTSTRAP, flags.size))
    tail = (100 - CI_LEVEL_PERCENT) / 2
    low, high = np.percentile(flags[indices].mean(axis=1), [tail, 100 - tail])
    return [rounded(low), rounded(high)]


def catalogue_products(engine):
    """ingredient -> catalogue product names that the checker resolves to exactly that one ingredient."""
    engine._init_ml_interaction_index()
    products, fully_resolved, partly_resolved = {}, 0, 0
    for entry in engine._ml_catalog_drugs:
        parsed = engine._parse_med_entry_ml(entry.get('name'))
        if parsed['resolvedIngredients'] and not parsed['unresolvedIngredients']:
            fully_resolved += 1
            if len(parsed['resolvedIngredients']) == 1:
                products.setdefault(parsed['resolvedIngredients'][0]['canonical'], []).append(entry['name'])
        elif parsed['resolvedIngredients']:
            partly_resolved += 1
    for names in products.values():
        names.sort()
    total = len(engine._ml_catalog_drugs)
    return products, {'catalogueEntries': total, 'entriesFullyResolvedToActiveIngredients': fully_resolved,
                      'fullyResolvedShare': ratio(fully_resolved, total),
                      'entriesPartlyResolved': partly_resolved,
                      'entriesNotResolved': total - fully_resolved - partly_resolved,
                      'distinctSingleIngredientsAvailable': len(products)}


def canonical_name(engine, ingredient):
    key = ingredient.strip().lower()
    if key in engine._ml_canonical_set:
        return key
    return engine.REVIEWED_SYNONYMS_ML.get(key, key)


def classify(response, product_a, product_b):
    hits = [w for w in response.get('warnings', []) if w.get('type') == 'drug_interaction'
            and {w.get('drug1'), w.get('drug2')} == {product_a, product_b}]
    if hits:
        return WARNING, hits[0].get('severity')
    if response.get('verificationIncomplete') or response.get('unresolvedIngredients'):
        return UNVERIFIED, None
    return NO_WARNING, None


def main():
    reference = read_json(INTERACTION_REFERENCE_PATH)
    engine, post = load_engine()
    products, resolution = catalogue_products(engine)

    records = []
    for pair in reference['pairs']:
        chosen, sources = [], []
        for ingredient in (pair['drugA'], pair['drugB']):
            names = products.get(canonical_name(engine, ingredient), [])
            chosen.append(names[0] if names else ingredient)
            sources.append(CATALOGUE if names else TYPED)
        response = post(CHECK_ROUTE, {'drugs': chosen})
        outcome, severity = classify(response, chosen[0], chosen[1])
        reason = response.get('statusMessage') if outcome == UNVERIFIED else None
        records.append({'id': pair['id'], 'drugA': pair['drugA'], 'drugB': pair['drugB'], 'expected': pair['expected'],
                        'addedIn': pair.get('addedIn'), 'inputA': chosen[0], 'inputB': chosen[1], 'inputSourceA': sources[0],
                        'inputSourceB': sources[1], 'checkerOutcome': outcome, 'checkerSeverity': severity,
                        'unresolvedIngredients': response.get('unresolvedIngredients') or [], 'unverifiedReason': reason,
                        'sourceUrl': pair['sourceUrl'], 'sourceSection': pair['sourceSection'], 'basis': pair['basis']})

    subsets = {}
    for name in sorted({r['addedIn'] for r in records}):
        subset = [r for r in records if r['addedIn'] == name]
        counts = {(e, o): sum(1 for r in subset if r['expected'] == e and r['checkerOutcome'] == o)
                  for e in (INTERACTING, NON_INTERACTING) for o in (WARNING, NO_WARNING, UNVERIFIED)}
        pos = sum(v for (e, _), v in counts.items() if e == INTERACTING)
        neg = sum(v for (e, _), v in counts.items() if e == NON_INTERACTING)
        subsets[name] = {'pairs': len(subset), 'interactingPairs': pos, 'nonInteractingPairs': neg,
                         'counts': [[counts[(INTERACTING, o)] for o in (WARNING, NO_WARNING, UNVERIFIED)],
                                    [counts[(NON_INTERACTING, o)] for o in (WARNING, NO_WARNING, UNVERIFIED)]],
                         'sensitivity': ratio(counts[(INTERACTING, WARNING)], pos),
                         'specificity': ratio(counts[(NON_INTERACTING, NO_WARNING)], neg),
                         'unverifiedShare': ratio(sum(1 for r in subset if r['checkerOutcome'] == UNVERIFIED), len(subset))}

    def count(expected, outcome):
        return sum(1 for record in records if record['expected'] == expected and record['checkerOutcome'] == outcome)

    tp, fn, pos_unverified = count(INTERACTING, WARNING), count(INTERACTING, NO_WARNING), count(INTERACTING, UNVERIFIED)
    fp, tn, neg_unverified = count(NON_INTERACTING, WARNING), count(NON_INTERACTING, NO_WARNING), count(NON_INTERACTING, UNVERIFIED)
    positives, negatives = tp + fn + pos_unverified, fp + tn + neg_unverified
    positive_flags = [int(r['checkerOutcome'] == WARNING) for r in records if r['expected'] == INTERACTING]
    negative_clear = [int(r['checkerOutcome'] == NO_WARNING) for r in records if r['expected'] == NON_INTERACTING]
    negative_alarm = [int(r['checkerOutcome'] == WARNING) for r in records if r['expected'] == NON_INTERACTING]
    flagged_correct = [int(r['expected'] == INTERACTING) for r in records if r['checkerOutcome'] == WARNING]

    limits = read_json(os.path.join(ML_DIR, 'data', 'medicine_safety_limits.json'))
    catalogue_manifest = read_json(os.path.join(REPO_ROOT, 'server', 'reference-data', 'manifest.json'))

    update_results('interactionBenchmark', {
        'clinicalValidation': CLINICAL_VALIDATION,
        'run': {'date': today_utc(), 'git': git_state(), 'seed': SEED, 'bootstrapResamples': N_BOOTSTRAP,
                'ciLevelPercent': CI_LEVEL_PERCENT, 'ciMethod': 'percentile bootstrap over reference pairs',
                'route': CHECK_ROUTE,
                'inputFormat': ('For each ingredient: the first catalogue product (alphabetical) that the checker resolves to exactly '
                                'that one ingredient; if there is none, the ingredient name as a prescriber would type it. The two '
                                'names are sent as the "drugs" list. A pair is unverified when the checker reports any unresolved '
                                'ingredient.'),
                'referenceSha256': sha256_file(INTERACTION_REFERENCE_PATH), 'environment': environment_info()},
        'referenceSet': {'pairs': len(records), 'interactingPairs': positives, 'nonInteractingPairs': negatives,
                         'source': reference['source'], 'labelsCited': len(reference['labels']),
                         'retrievedDate': reference['retrievedDate'], 'definitions': reference['definitions']},
        'confusionMatrix': {
            'rows': ['reference: interacting', 'reference: non-interacting'],
            'columns': ['checker: warning', 'checker: no warning', 'checker: unverified'],
            'counts': [[tp, fn, pos_unverified], [fp, tn, neg_unverified]]},
        'metrics': {
            'rule': ('An unverified pair is never counted as a correct negative. In the headline figures it counts against the checker: '
                     'an unverified interacting pair is a missed interaction, and an unverified non-interacting pair is not a correct clearance.'),
            'sensitivity': {'value': ratio(tp, positives), 'ci95': bootstrap_ci(positive_flags), 'numerator': tp, 'denominator': positives},
            'specificity': {'value': ratio(tn, negatives), 'ci95': bootstrap_ci(negative_clear), 'numerator': tn, 'denominator': negatives},
            'precision': {'value': ratio(tp, tp + fp), 'ci95': bootstrap_ci(flagged_correct), 'numerator': tp, 'denominator': tp + fp},
            'falseAlarmRate': {'value': ratio(fp, negatives), 'ci95': bootstrap_ci(negative_alarm), 'numerator': fp, 'denominator': negatives},
            'unverifiedPairs': pos_unverified + neg_unverified,
            'unverifiedInteractingPairs': pos_unverified, 'unverifiedNonInteractingPairs': neg_unverified,
            'unverifiedShare': ratio(pos_unverified + neg_unverified, len(records)),
            'resolvedPairsOnly': {'sensitivity': ratio(tp, tp + fn), 'specificity': ratio(tn, tn + fp),
                                  'falseAlarmRate': ratio(fp, tn + fp), 'pairs': tp + fn + fp + tn}},
        'falseAlarms': [r['id'] for r in records if r['expected'] == NON_INTERACTING and r['checkerOutcome'] == WARNING],
        'missedInteractions': [r['id'] for r in records if r['expected'] == INTERACTING and r['checkerOutcome'] != WARNING],
        'bySubset': subsets,
        'pairsWithATypedName': sum(1 for r in records if TYPED in (r['inputSourceA'], r['inputSourceB'])),
        'catalogueLimits': {
            **resolution,
            'doseLimitIngredients': len(limits['limits']),
            'doseLimitIngredientNames': sorted(item['canonicalIngredient'] for item in limits['limits']),
            'interactionPairsInReferenceDataset': len(engine._ml_pair_map),
            'catalogueLicenceReview': catalogue_manifest.get('licenseReview'),
            'catalogueClinicalValidation': catalogue_manifest.get('clinicalValidation'),
            'catalogueOrigin': ('drugs_clean.json is built by ml-engine/preprocess_datasets.py from a retail pharmacy listing '
                                '(medicines.csv); its licence is not verified.'),
            'selectionBias': ('The V0 pairs use only products the checker fully resolves, which favours the checker. The V3 pairs were '
                              'chosen without regard to resolution and include drugs absent from the checker reference data.')},
        'pairs': records,
    })
    print(json.dumps({'confusion [warning, no warning, unverified]': {'interacting': [tp, fn, pos_unverified],
                                                                    'nonInteracting': [fp, tn, neg_unverified]},
                      'sensitivity': ratio(tp, positives), 'specificity': ratio(tn, negatives),
                      'precision': ratio(tp, tp + fp), 'falseAlarmRate': ratio(fp, negatives),
                      'fullyResolvedShare': resolution['fullyResolvedShare']}, indent=2))


if __name__ == '__main__':
    main()
