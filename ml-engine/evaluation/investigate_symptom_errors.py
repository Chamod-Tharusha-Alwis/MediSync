"""V1 investigation: why does one Tier 1 profile appear first on many wrong answers?

Reads the per-row results of run_symptom_benchmark.py, finds the profile that is most often ranked
first when the answer is wrong, and measures where its score comes from. It uses the engine's own
fitted TF-IDF vectorizer and matrix (read-only) and the fields the /api/ml/predict-disease route returns.
Nothing in the engine is changed.

Score decomposition used by app.py for Tier 1 (read from the code, not re-implemented here):
    confidence = 100 * (0.65 * cosine + 0.35 * overlap_ratio)
The route returns `confidence` and `cosine_sim` (= 100 * cosine), so overlap_ratio is recovered as
(confidence - 0.65 * cosine_sim) / 35, for curated (Tier 1) answers only.

Usage:  python ml-engine/evaluation/investigate_symptom_errors.py   (after run_symptom_benchmark.py)
"""
import json
import os
import sys
from collections import Counter
from statistics import median

import numpy as np

from eval_common import DATA_DIR, CLINICAL_VALIDATION, git_state, load_engine, read_json, require_tfidf_engine, RESULTS_PATH, today_utc, update_results

COSINE_WEIGHT_PERCENT = 65
OVERLAP_WEIGHT_PERCENT = 35
MAJORITY_SHARE = 0.5
ROUND_DP = 4


def rounded(value):
    return round(float(value), ROUND_DP)


def main():
    from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS
    results = read_json(RESULTS_PATH)
    rows = results['symptomBenchmark']['rows']
    with open(os.path.join(DATA_DIR, 'test.jsonl'), 'r', encoding='utf-8') as handle:
        texts = [json.loads(line)['input_text'] for line in handle if line.strip()]

    engine, post = load_engine()
    require_tfidf_engine(engine)
    vectorizer, matrix = engine.tfidf_vectorizer, engine.tfidf_matrix
    features = vectorizer.get_feature_names_out()
    profiles = [item['disease'] for item in engine.symptom_data]

    wrong_first = Counter(row['top5'][0]['profile'] for row in rows if row['top5'] and not row['hitTop1'])
    suspect, suspect_rows = wrong_first.most_common(1)[0]
    target = profiles.index(suspect)
    all_first = [row for row in rows if row['top5'] and row['top5'][0]['profile'] == suspect]
    profile_weights = matrix[target].toarray().ravel()

    def has_stop_token(feature):
        return any(token in ENGLISH_STOP_WORDS for token in feature.split())

    ranked_features = sorted(((profile_weights[j], features[j]) for j in profile_weights.nonzero()[0]), reverse=True)
    stop_shares, overlap_ratios, matched, has_and = [], [], Counter(), 0
    term_totals = Counter()
    for row in all_first:
        text = texts[row['row']]
        query = vectorizer.transform([text.lower()]).toarray().ravel()
        contribution = query * profile_weights
        total = contribution.sum()
        stop_part = sum(contribution[j] for j in contribution.nonzero()[0] if has_stop_token(features[j]))
        stop_shares.append(stop_part / total if total else 0.0)
        for j in contribution.nonzero()[0]:
            term_totals[features[j]] += contribution[j]
        has_and += 'and' in text.lower().split()
        top = post('/api/ml/predict-disease', {'symptoms': text})['predictions'][0]
        if top.get('source') == 'curated':
            overlap_ratios.append((top['confidence'] - COSINE_WEIGHT_PERCENT / 100 * top['cosine_sim']) / OVERLAP_WEIGHT_PERCENT)
        matched.update(top['matched_symptoms'])

    stop_vocabulary = sorted({feature for feature in features if feature in ENGLISH_STOP_WORDS})
    stop_word_profiles = {word: [profiles[i] for i in range(len(profiles)) if word in engine.disease_docs[i].split()] for word in stop_vocabulary}
    total_terms = sum(term_totals.values())
    update_results('symptomErrorInvestigation', {
        'clinicalValidation': CLINICAL_VALIDATION,
        'run': {'date': today_utc(), 'git': git_state()},
        'question': 'Why is one profile ranked first on many rows where the answer is wrong?',
        'profile': suspect,
        'rowsRankedFirstWhenWrong': suspect_rows,
        'rowsRankedFirstInTotal': len(all_first),
        'vectorizer': {'stopWords': str(vectorizer.stop_words), 'ngramRange': list(vectorizer.ngram_range),
                       'stopWordFeaturesInVocabulary': stop_vocabulary,
                       'profilesContainingEachStopWord': stop_word_profiles},
        'profileTopWeightedFeatures': [{'feature': f, 'weight': rounded(w)} for w, f in ranked_features[:8]],
        'rowsContainingTheWordAnd': has_and,
        'testRowsContainingTheWordAnd': sum('and' in text.lower().split() for text in texts),
        'testRows': len(texts),
        'shareOfCosineFromStopWordFeatures': {'median': rounded(median(stop_shares)), 'min': rounded(min(stop_shares)),
                                              'max': rounded(max(stop_shares)),
                                              'rowsAtOrAboveHalf': sum(share >= MAJORITY_SHARE for share in stop_shares)},
        'largestSummedTermShares': [{'feature': f, 'shareOfCosine': rounded(v / total_terms)} for f, v in term_totals.most_common(6)],
        'overlapRatio': {'rowsWithCuratedTop': len(overlap_ratios), 'rowsAboveOne': sum(r > 1 + 1e-9 for r in overlap_ratios),
                         'median': rounded(median(overlap_ratios)) if overlap_ratios else None},
        'matchedSymptomsOnThoseRows': [{'symptom': s, 'rows': n} for s, n in matched.most_common(6)],
        'finding': ('The TF-IDF vectorizer in ml-engine/app.py is built without a stop-word list. Profile documents that contain '
                    'stop words (for example "and" inside multi-word symptom names) gain cosine similarity from any free-text '
                    'input that uses those words, whatever the symptoms are. The overlap ratio in the combined score is not '
                    'capped at 1, which adds to the effect when one input phrase matches several profile symptoms.'),
        'isItABug': ('Yes for free-text input: the ranking depends on function words, not symptoms. In the application, doctors '
                     'send short symptom phrases, where the effect is smaller but not zero.'),
        'fixStatus': ('Not fixed. Both causes are in ml-engine/app.py, which is one of the 15 protected files. Changing it needs '
                      'the owner\'s approval and a new entry in docs/release/PROTECTED_HASHES.json. No AFTER result exists.'),
    })
    print(f'{suspect}: first on {suspect_rows} wrong rows; median share of its cosine from stop-word features '
          f'{median(stop_shares):.2f}; overlap ratio > 1 on {sum(r > 1 + 1e-9 for r in overlap_ratios)} rows')


if __name__ == '__main__':
    sys.exit(main())
