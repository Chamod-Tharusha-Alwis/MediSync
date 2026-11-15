"""Download every public dataset used by the evaluation and record it in data/manifest.json.

Datasets are saved under ml-engine/evaluation/data/ (gitignored). Only data/manifest.json is committed.
For each dataset the manifest records name, URL, licence (read from the source where it publishes one),
download date, SHA-256 and row count. No dataset with an unclear licence is used.

Usage:  python ml-engine/evaluation/fetch_datasets.py              download all, then write the manifest
        python ml-engine/evaluation/fetch_datasets.py --offline    use files already in data/
"""
import csv
import io
import json
import os
import re
import sys
import urllib.request
import zipfile

from eval_common import DATA_DIR, DATA_MANIFEST_PATH, read_json, sha256_file, today_utc, write_json

TIMEOUT_SECONDS = 120
HF_DATASET = 'gretelai/symptom_to_diagnosis'
HF_REVISION = '722cfb0e11f8ae37339c7f573b5e10429b94df49'
FIGSHARE_DDXPLUS = 20043374
OPENDENGUE_VERSION = 'V1.3.1'

DATASETS = {
    'gretelai_test': {
        'name': f'{HF_DATASET} (test split)',
        'page': f'https://huggingface.co/datasets/{HF_DATASET}',
        'url': f'https://huggingface.co/datasets/{HF_DATASET}/resolve/{HF_REVISION}/test.jsonl',
        'file': 'test.jsonl', 'kind': 'jsonl', 'licenceSource': 'huggingface',
        'usedFor': 'V1 symptom benchmark (test split)',
        'nature': ('Adapted from the Symptom2Disease dataset and rewritten with a large language model (dataset page). '
                   'Synthetic, LLM-rewritten text; not real patient data.'),
    },
    'gretelai_train': {
        'name': f'{HF_DATASET} (train split)',
        'page': f'https://huggingface.co/datasets/{HF_DATASET}',
        'url': f'https://huggingface.co/datasets/{HF_DATASET}/resolve/{HF_REVISION}/train.jsonl',
        'file': 'train.jsonl', 'kind': 'jsonl', 'licenceSource': 'huggingface',
        'usedFor': 'V2 calibration map only (validation split). Never used to score the engine.',
        'nature': 'Same source and nature as the test split.',
    },
    'ddxplus_test_patients': {
        'name': 'DDXPlus (English release, test patients)',
        'page': 'https://doi.org/10.6084/m9.figshare.20043374',
        'url': 'https://ndownloader.figshare.com/files/40495565',
        'file': 'ddxplus/release_test_patients.zip', 'kind': 'zipcsv', 'licenceSource': 'figshare',
        'usedFor': 'V1 second independent symptom benchmark',
        'nature': ('Synthetic patients generated from a proprietary medical knowledge base (Fansi Tchango et al., NeurIPS 2022). '
                   'Not real patient data.'),
    },
    'ddxplus_evidences': {
        'name': 'DDXPlus evidence dictionary', 'page': 'https://doi.org/10.6084/m9.figshare.20043374',
        'url': 'https://ndownloader.figshare.com/files/40495562', 'file': 'ddxplus/release_evidences.json',
        'kind': 'jsonobject', 'licenceSource': 'figshare', 'usedFor': 'V1: turns evidence codes into English text',
        'nature': 'Questions and answer meanings for each evidence code.',
    },
    'ddxplus_conditions': {
        'name': 'DDXPlus condition dictionary', 'page': 'https://doi.org/10.6084/m9.figshare.20043374',
        'url': 'https://ndownloader.figshare.com/files/62657140', 'file': 'ddxplus/release_conditions.json',
        'kind': 'jsonobject', 'licenceSource': 'figshare', 'usedFor': 'V1: English pathology names',
        'nature': 'The 49 pathologies with English names and ICD-10 codes.',
    },
    'opendengue_national': {
        'name': f'OpenDengue national extract {OPENDENGUE_VERSION}',
        'page': 'https://opendengue.org/',
        'url': f'https://raw.githubusercontent.com/OpenDengue/master-repo/main/data/releases/{OPENDENGUE_VERSION}/National_extract_{OPENDENGUE_VERSION.replace(".", "_")}.zip',
        'file': f'opendengue/National_extract_{OPENDENGUE_VERSION.replace(".", "_")}.zip', 'kind': 'zipcsv', 'licenceSource': 'opendengue',
        'usedFor': 'V4 outbreak detector and projection back-test (Sri Lanka rows only)',
        'nature': ('Public aggregate dengue case counts compiled by the OpenDengue project (LSHTM). Sri Lanka rows come from '
                   'Ministry of Health reports. These are national counts, not MediSync consultations.'),
    },
}


def fetch_bytes(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'medisync-offline-evaluation'})
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        return response.read()


def licence(source):
    """Read the licence statement from the publisher, so it is not typed by hand."""
    if source == 'huggingface':
        card = json.loads(fetch_bytes(f'https://huggingface.co/api/datasets/{HF_DATASET}')).get('cardData', {})
        return {'licence': card.get('license'), 'evidence': f'Hugging Face API cardData.license for {HF_DATASET}'}
    if source == 'figshare':
        meta = json.loads(fetch_bytes(f'https://api.figshare.com/v2/articles/{FIGSHARE_DDXPLUS}'))
        return {'licence': meta['license']['name'], 'evidence': f'figshare API licence field, article {FIGSHARE_DDXPLUS} ({meta["license"]["url"]})'}
    if source == 'opendengue':
        page = re.sub(r'<[^>]+>', ' ', fetch_bytes('https://opendengue.org/').decode('utf-8', 'replace'))
        match = re.search(r'Content licensed under\s+(CC BY \d\.\d)', page)
        return {'licence': match.group(1) if match else None,
                'evidence': 'opendengue.org page footer: "Content licensed under ..." (the GitHub repository has no LICENSE file)'}
    raise ValueError(source)


def zip_member(archive):
    """The single data file inside a dataset zip (the DDXPlus member has no file extension)."""
    names = [n for n in archive.namelist() if not n.endswith('/')]
    csvs = [n for n in names if n.endswith('.csv')]
    return (csvs or names)[0]


def count_rows(path, kind):
    if kind == 'jsonl':
        with open(path, 'r', encoding='utf-8') as handle:
            return sum(1 for line in handle if line.strip())
    if kind == 'jsonobject':
        return len(read_json(path))
    with zipfile.ZipFile(path) as archive:
        name = zip_member(archive)
        with archive.open(name) as handle:
            return sum(1 for _ in csv.reader(io.TextIOWrapper(handle, encoding='utf-8'))) - 1


def main():
    offline = '--offline' in sys.argv
    previous = read_json(DATA_MANIFEST_PATH)['datasets'] if os.path.exists(DATA_MANIFEST_PATH) else {}
    manifest = {}
    for key, spec in DATASETS.items():
        path = os.path.join(DATA_DIR, spec['file'])
        os.makedirs(os.path.dirname(path), exist_ok=True)
        if not offline:
            try:
                body = fetch_bytes(spec['url'])
            except Exception as error:
                sys.exit(f'Download blocked for {key} ({error}). Download {spec["url"]} by hand to {path}, then rerun with --offline.')
            with open(path, 'wb') as handle:
                handle.write(body)
        if not os.path.exists(path):
            sys.exit(f'Missing {path}. Download {spec["url"]} to that path.')
        entry = {k: v for k, v in spec.items() if k not in ('licenceSource', 'kind')}
        entry['localPath'] = f'ml-engine/evaluation/data/{spec["file"]} (gitignored, not committed)'
        entry['sha256'] = sha256_file(path)
        entry['bytes'] = os.path.getsize(path)
        entry['rows'] = count_rows(path, spec['kind'])
        if offline and key in previous and previous[key]['sha256'] == entry['sha256']:
            entry['downloadDate'] = previous[key]['downloadDate']
            entry['licence'] = previous[key]['licence']
        else:
            entry['downloadDate'] = today_utc()
            entry['licence'] = licence(spec['licenceSource'])
        if not entry['licence']['licence']:
            sys.exit(f'Licence for {key} could not be confirmed from its source. Not using it.')
        manifest[key] = entry
    write_json(DATA_MANIFEST_PATH, {'clinicalValidation': 'not_established',
                                    'note': 'Public, non-patient datasets only. Files are gitignored; this manifest is committed.',
                                    'datasets': manifest})
    for key, entry in manifest.items():
        print(f'{key:24} rows={entry["rows"]:>7} licence={entry["licence"]["licence"]:<10} sha256={entry["sha256"][:12]}')


if __name__ == '__main__':
    main()
