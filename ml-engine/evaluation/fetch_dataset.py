"""Download the TEST split of gretelai/symptom_to_diagnosis and write manifest.json.

The dataset file goes to ml-engine/evaluation/data/ (gitignored) and is never committed.
Usage:  python ml-engine/evaluation/fetch_dataset.py            download, then write the manifest
        python ml-engine/evaluation/fetch_dataset.py --offline  use the file already in data/
"""
import json
import os
import sys
import urllib.request

from eval_common import DATA_DIR, MANIFEST_PATH, sha256_file, today_utc, write_json

DATASET_NAME = 'gretelai/symptom_to_diagnosis'
DATASET_PAGE = 'https://huggingface.co/datasets/gretelai/symptom_to_diagnosis'
TEST_FILE_URL = 'https://huggingface.co/datasets/gretelai/symptom_to_diagnosis/resolve/main/test.jsonl'
LOCAL_FILE = os.path.join(DATA_DIR, 'test.jsonl')


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    if '--offline' not in sys.argv:
        try:
            with urllib.request.urlopen(TEST_FILE_URL, timeout=60) as response:
                body = response.read()
        except Exception as error:
            sys.exit(f'Download blocked ({error}). Download {TEST_FILE_URL} by hand and save it as {LOCAL_FILE}, '
                     'then run this script with --offline.')
        with open(LOCAL_FILE, 'wb') as handle:
            handle.write(body)
    if not os.path.exists(LOCAL_FILE):
        sys.exit(f'Missing {LOCAL_FILE}. Download {TEST_FILE_URL} and save it there.')

    with open(LOCAL_FILE, 'r', encoding='utf-8') as handle:
        rows = [json.loads(line) for line in handle if line.strip()]
    labels = sorted({row['output_text'] for row in rows})
    write_json(MANIFEST_PATH, {
        'dataset': DATASET_NAME,
        'datasetPage': DATASET_PAGE,
        'fileUrl': TEST_FILE_URL,
        'split': 'test (the train split is not downloaded or used)',
        'licence': 'Apache-2.0 (as stated on the dataset page)',
        'downloadDate': today_utc(),
        'localPath': 'ml-engine/evaluation/data/test.jsonl (gitignored, not committed)',
        'sha256': sha256_file(LOCAL_FILE),
        'bytes': os.path.getsize(LOCAL_FILE),
        'rows': len(rows),
        'distinctDiagnoses': len(labels),
        'diagnoses': labels,
        'fields': {'input_text': 'free-text symptom description', 'output_text': 'diagnosis label'},
        'provenanceNote': ('The dataset page says the text was adapted from the Symptom2Disease dataset and rewritten '
                           'with a large language model. It is synthetic, LLM-rewritten text. It is not real patient '
                           'data and was not collected in a clinical setting.'),
        'clinicalValidation': 'not_established',
    })
    print(f'{len(rows)} rows, {len(labels)} diagnoses; manifest written to {MANIFEST_PATH}')


if __name__ == '__main__':
    main()
