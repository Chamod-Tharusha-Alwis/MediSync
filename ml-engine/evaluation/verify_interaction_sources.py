"""Optional online check of interaction_reference.json against the cited FDA labels.

For every reference pair, the cited label is fetched from the openFDA drug label API by its set id,
and the script checks that the partner drug is named in the cited label section. It confirms that the
citation points at text about that drug. It cannot judge the meaning of the text; that was read by hand.

Needs internet access. Labels are cached in ml-engine/evaluation/data/labels/ (gitignored).
Usage:  python ml-engine/evaluation/verify_interaction_sources.py
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request

from eval_common import DATA_DIR, INTERACTION_REFERENCE_PATH, read_json, today_utc, update_results

CACHE_DIR = os.path.join(DATA_DIR, 'labels')
EXCERPT_CHARS = 400
API = 'https://api.fda.gov/drug/label.json?limit=1&search='
# Alternative spellings used by the labels.
US_NAMES = {'salbutamol': ['salbutamol', 'albuterol'],
            # The cited digoxin label spells erythromycin as "Erthromycin" in its interaction table.
            'erythromycin': ['erythromycin', 'erthromycin']}


def fetch_label(set_id):
    path = os.path.join(CACHE_DIR, set_id + '.json')
    if not os.path.exists(path):
        url = API + urllib.parse.quote(f'set_id:"{set_id}"')
        with urllib.request.urlopen(url, timeout=60) as response:
            payload = json.load(response)
        with open(path, 'w', encoding='utf-8') as handle:
            json.dump(payload['results'][0], handle)
    return read_json(path)


def label_excerpt(label, sections, names):
    """First sentence in the cited section(s) that names the partner, with markup removed."""
    plain = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', ' '.join(' '.join(label.get(section, [])) for section in sections)))
    for sentence in re.split(r'(?<=[.;])\s+', plain):
        if any(name in sentence.lower() for name in names):
            return sentence.strip()[:EXCERPT_CHARS]
    return None


def main():
    os.makedirs(CACHE_DIR, exist_ok=True)
    reference = read_json(INTERACTION_REFERENCE_PATH)
    checked, failures = [], []
    for pair in reference['pairs']:
        label_info = reference['labels'][pair['sourceLabel']]
        try:
            label = fetch_label(label_info['setId'])
        except Exception as error:
            sys.exit(f'Could not fetch label {label_info["setId"]} ({error}). This check needs internet access.')
        sections = [pair['sourceSection'], pair['sourceSection'] + '_table']
        text = ' '.join(' '.join(label.get(section, [])) for section in sections).lower()
        names = US_NAMES.get(pair['drugB'], [pair['drugB']])
        found = any(name in text for name in names)
        excerpt = label_excerpt(label, sections, names)
        same_version = label.get('effective_time') == label_info['labelEffectiveDate']
        checked.append({'id': pair['id'], 'partnerNamedInCitedSection': found, 'labelVersionUnchanged': same_version,
                        'labelExcerpt': excerpt})
        if not found:
            failures.append(pair['id'])
    update_results('interactionSourceCheck', {
        'date': today_utc(), 'pairsChecked': len(checked), 'pairsWithPartnerNamedInCitedSection': len(checked) - len(failures),
        'pairsNotConfirmed': failures,
        'labelsWithChangedVersion': sorted({pair['sourceLabel'] for pair, row in zip(reference['pairs'], checked) if not row['labelVersionUnchanged']}),
        'meaning': ('Confirms only that the cited label section names the partner drug. Whether the text describes an interaction '
                    'was judged by reading the label.'),
        'excerptNote': ('labelExcerpt is the first sentence of the cited section that names the partner drug, copied from the FDA label '
                        '(public domain, CC0 via openFDA). It may not be the sentence the basis paraphrases.'),
        'pairs': checked,
    })
    print(f'{len(checked) - len(failures)} of {len(checked)} citations confirmed; not confirmed: {failures or "none"}')
    if failures:
        sys.exit(1)


if __name__ == '__main__':
    main()
