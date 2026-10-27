"""Read-only delivery/integrity checks for existing reference files, not clinical validation."""
import functools
import hashlib
import json
import pathlib
import sys

REQUIRED = frozenset({
    'dataset.csv', 'symptom_Description.csv', 'symptom_precaution.csv',
    'Symptom-severity.csv', 'drugs_clean.json', 'interactions_clean.json', 'icd10_clean.json',
})


class ReferenceDataError(RuntimeError):
    pass


@functools.lru_cache(maxsize=1)
def _catalog(directory):
    try:
        root = pathlib.Path(directory)
        if root.is_symlink():
            raise ValueError()
        manifest_file = root.parent / 'reference-manifest.json'
        if manifest_file.is_symlink():
            raise ValueError()
        manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
        entries = manifest['entries']
        if manifest.get('schemaVersion') != 1 or len(entries) != len(REQUIRED):
            raise ValueError()
        if {entry['file'] for entry in entries} != REQUIRED:
            raise ValueError()
        icd = None
        for entry in entries:
            if type(entry.get('bytes')) is not int or entry['bytes'] <= 0:
                raise ValueError()
            digest = entry.get('sha256')
            if not isinstance(digest, str) or len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest):
                raise ValueError()
            file = root / entry['file']
            if file.is_symlink() or not file.is_file():
                raise ValueError()
            data = file.read_bytes()
            if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
                raise ValueError()
            if entry['file'] == 'icd10_clean.json':
                icd = json.loads(data)
        if not isinstance(icd, list) or not icd or any(
                not isinstance(row, dict) or not isinstance(row.get('code'), str)
                or not isinstance(row.get('description'), str) for row in icd):
            raise ValueError()
        return icd
    except (OSError, ValueError, TypeError, KeyError):
        raise ReferenceDataError('ML_REFERENCE_DATA_UNAVAILABLE') from None


def reference_status(directory=None):
    directory = directory or pathlib.Path(__file__).parent / 'data'
    rows = _catalog(str(pathlib.Path(directory).absolute()))
    return {'files': len(REQUIRED), 'icd10Concepts': len(rows), 'clinicalValidation': 'not_established'}


def search_diseases(query, directory=None):
    if not isinstance(query, str) or len(query) > 120:
        raise ValueError('INVALID_DISEASE_QUERY')
    term = query.strip().casefold()
    if len(term) < 2:
        return []
    directory = directory or pathlib.Path(__file__).parent / 'data'
    rows = _catalog(str(pathlib.Path(directory).absolute()))
    names = {row['description'] for row in rows if term in row['description'].casefold()}
    return sorted(names, key=lambda name: (not name.casefold().startswith(term), name.casefold(), name))[:20]


if __name__ == '__main__':
    if sys.argv[1:] != ['--verify']:
        raise SystemExit('EXPLICIT_REFERENCE_VERIFICATION_REQUIRED')
    try:
        print(json.dumps({'status': 'PASS', **reference_status()}))
    except ReferenceDataError:
        raise SystemExit('ML_REFERENCE_DATA_UNAVAILABLE')
