import hashlib
import json
import os
import pathlib
import shutil
import tempfile
import unittest
from reference_catalog import REQUIRED, ReferenceDataError, _catalog, reference_status, search_diseases


class TestReferenceDelivery(unittest.TestCase):
    def fixture(self):
        out = pathlib.Path(os.environ['MEDISYNC_OFFLINE_EVIDENCE']).resolve()
        root = pathlib.Path(__file__).resolve().parents[1]
        allowed_roots = [
            pathlib.Path(tempfile.gettempdir()).resolve(),
            pathlib.Path(os.environ.get('MEDISYNC_TEST_TMP', tempfile.gettempdir())).resolve(),
            (root / 'scratch').resolve() if (root / 'scratch').exists() else (root / 'scratch'),
        ]
        self.assertTrue(any(out.is_relative_to(base) for base in allowed_roots))
        base = pathlib.Path(tempfile.mkdtemp(prefix='reference-fixture-', dir=out))
        self.addCleanup(lambda: shutil.rmtree(base, ignore_errors=True))
        data = base / 'data'
        data.mkdir()
        entries = []
        for name in sorted(REQUIRED):
            value = b'input'
            if name == 'icd10_clean.json':
                value = json.dumps([{'code': 'A90', 'description': 'reference'}]).encode()
            (data / name).write_bytes(value)
            entries.append({'file': name, 'bytes': len(value), 'sha256': hashlib.sha256(value).hexdigest()})
        (base / 'reference-manifest.json').write_text(json.dumps({'schemaVersion': 1, 'entries': entries}))
        return data, entries

    def test_actual_delivered_catalog(self):
        self.assertEqual(reference_status()['icd10Concepts'], 71704)
        self.assertTrue(search_diseases('dengue'))
        self.assertLessEqual(len(search_diseases('fever')), 20)

    def test_deterministic_literal_search(self):
        self.assertEqual(search_diseases('DENGUE'), search_diseases('dengue'))
        self.assertEqual(search_diseases('%%'), [])
        self.assertEqual(search_diseases('zz_unknown_disease_zz'), [])

    def test_invalid_query_types(self):
        for query in [None, [], {}, True, 1, 'x' * 121]:
            with self.subTest(query=type(query).__name__), self.assertRaises(ValueError):
                search_diseases(query)

    def test_missing_delivery_fails_closed(self):
        with self.assertRaisesRegex(ReferenceDataError, '^ML_REFERENCE_DATA_UNAVAILABLE$'):
            reference_status('/absent-owned-reference-directory')

    def test_tampered_file_is_not_accepted(self):
        data, _ = self.fixture()
        (data / 'dataset.csv').write_bytes(b'changed')
        with self.assertRaises(ReferenceDataError):
            reference_status(data)

    def test_manifest_traversal_is_rejected(self):
        data, entries = self.fixture()
        entries[0]['file'] = '../outside'
        (data.parent / 'reference-manifest.json').write_text(json.dumps({'schemaVersion': 1, 'entries': entries}))
        with self.assertRaises(ReferenceDataError):
            reference_status(data)

    def test_duplicate_manifest_entry_is_rejected(self):
        data, entries = self.fixture()
        entries.append(dict(entries[0]))
        (data.parent / 'reference-manifest.json').write_text(json.dumps({'schemaVersion': 1, 'entries': entries}))
        with self.assertRaises(ReferenceDataError):
            reference_status(data)

    def test_extra_file_is_not_consulted_and_cache_validates_once(self):
        data, _ = self.fixture()
        (data / 'unlisted.txt').write_text('ignored')
        _catalog.cache_clear()
        self.assertEqual(reference_status(data)['icd10Concepts'], 1)
        self.assertEqual(_catalog.cache_info().hits, 0)
        self.assertEqual(reference_status(data)['icd10Concepts'], 1)
        self.assertEqual(_catalog.cache_info().hits, 1)


if __name__ == '__main__':
    unittest.main()
