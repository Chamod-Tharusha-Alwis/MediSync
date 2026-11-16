"""Add the DDXPlus train and validation splits to ml-engine/evaluation/data/manifest.json.

The files are downloaded to ml-engine/evaluation/data/ddxplus/ (gitignored). Licence, URL, date,
SHA-256 and row count are recorded the same way as fetch_datasets.py records the other datasets.

Usage:  python ml-engine/evaluation/study/fetch_study_data.py [--offline]
"""
import os
import sys

from study_common import DATA_DIR, read_json, sha256_file, today_utc, write_json
from fetch_datasets import count_rows, fetch_bytes, licence

MANIFEST_PATH = os.path.join(DATA_DIR, 'manifest.json')
SPLITS = {
    'ddxplus_train_patients': {
        'name': 'DDXPlus (English release, train patients)', 'page': 'https://doi.org/10.6084/m9.figshare.20043374',
        'url': 'https://ndownloader.figshare.com/files/40495568', 'file': 'ddxplus/release_train_patients.zip',
        'usedFor': 'Study Phase C: training sample for the shadow models (offline study, not in production)',
        'nature': 'Synthetic patients generated from a proprietary medical knowledge base. Not real patient data.'},
    'ddxplus_validate_patients': {
        'name': 'DDXPlus (English release, validation patients)', 'page': 'https://doi.org/10.6084/m9.figshare.20043374',
        'url': 'https://ndownloader.figshare.com/files/40495571', 'file': 'ddxplus/release_validate_patients.zip',
        'usedFor': 'Study Phase C: hyperparameter selection and permutation importance only',
        'nature': 'Synthetic patients generated from a proprietary medical knowledge base. Not real patient data.'},
}


def main():
    offline = '--offline' in sys.argv
    manifest = read_json(MANIFEST_PATH)
    for key, spec in SPLITS.items():
        path = os.path.join(DATA_DIR, spec['file'])
        if not offline and not os.path.exists(path):
            with open(path, 'wb') as handle:
                handle.write(fetch_bytes(spec['url']))
        if not os.path.exists(path):
            sys.exit(f'Missing {path}. Download {spec["url"]} to that path.')
        digest = sha256_file(path)
        previous = manifest['datasets'].get(key)
        if previous and previous['sha256'] == digest:
            continue
        manifest['datasets'][key] = {**spec, 'localPath': f'ml-engine/evaluation/data/{spec["file"]} (gitignored, not committed)',
                                     'sha256': digest, 'bytes': os.path.getsize(path), 'rows': count_rows(path, 'zipcsv'),
                                     'downloadDate': today_utc(), 'licence': licence('figshare')}
    write_json(MANIFEST_PATH, manifest)
    for key in SPLITS:
        entry = manifest['datasets'][key]
        print(f'{key:28} rows={entry["rows"]:>8} licence={entry["licence"]["licence"]} sha256={entry["sha256"][:12]}')


if __name__ == '__main__':
    main()
