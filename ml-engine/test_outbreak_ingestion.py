"""Real Flask/HMAC and owned SQLite tests; never imports production credentials."""
import hashlib
import hmac
import os
import pathlib
import sqlite3
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import datetime, timezone
from unittest.mock import patch
import app as module


class TestOutbreakSnapshots(unittest.TestCase):
    def setUp(self):
        self.path = pathlib.Path(module.db_path).resolve()
        self.assertEqual(self.path, pathlib.Path(os.environ['MEDISYNC_OFFLINE_EVIDENCE']).resolve() / 'owned_ml_test.db')
        with closing(sqlite3.connect(str(self.path))) as db:
            if 'demoBatchId' not in {r[1] for r in db.execute('PRAGMA table_info(outbreak_tracking)')}:
                db.execute('ALTER TABLE outbreak_tracking ADD COLUMN demoBatchId TEXT')
            db.execute('DELETE FROM outbreak_tracking')
            db.commit()
        hour = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H')
        self.headers = {'x-internal-key': hmac.new(os.environ['INTERNAL_API_KEY'].encode(), hour.encode(), hashlib.sha256).hexdigest()}
        self.body = {'district': 'Colombo', 'disease': 'Dengue', 'date': '2026-11-03', 'demoBatchId': 'DEMO_OUTBREAK_2026_V1', 'count': 7, 'icd_code': 'A90'}

    def send(self, body=None, headers=None):
        with module.app.test_client() as client:
            return client.post('/ingest', json=self.body if body is None else body, headers=self.headers if headers is None else headers)

    def rows(self):
        with closing(sqlite3.connect(str(self.path))) as db:
            return db.execute('SELECT date,district,disease,demoBatchId,count FROM outbreak_tracking ORDER BY id').fetchall()

    def test_real_auth_rejects_missing_and_invalid_credentials_before_sqlite(self):
        for headers in ({}, {'x-internal-key': 'offline-invalid'}):
            with self.subTest(kind=bool(headers)), patch.object(module.sqlite3, 'connect', side_effect=AssertionError('DB_MUST_NOT_OPEN')):
                self.assertEqual(self.send(headers=headers).status_code, 403)

    def test_replay_replaces_snapshot_without_growing_rows_or_count(self):
        self.assertEqual(self.send().status_code, 201)
        self.assertEqual(self.send().status_code, 200)
        self.assertEqual(len(self.rows()), 1)
        self.assertEqual(self.rows()[0][-1], 7)
        self.assertEqual(self.send({**self.body, 'count': 9}).status_code, 200)
        self.assertEqual(self.rows()[0][-1], 9)

    def test_batches_and_key_dimensions_remain_separate(self):
        for changes in ({}, {'demoBatchId': 'OTHER_BATCH'}, {'district': 'Galle'}, {'disease': 'Influenza'}, {'date': '2026-11-02'}):
            self.assertEqual(self.send({**self.body, **changes}).status_code, 201)
        self.assertEqual(len(self.rows()), 5)

    def test_concurrent_same_key_has_one_insert_and_one_snapshot_update(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            statuses = list(pool.map(lambda _: self.send().status_code, range(2)))
        self.assertEqual(sorted(statuses), [200, 201])
        self.assertEqual(len(self.rows()), 1)
        self.assertEqual(self.rows()[0][-1], 7)

    def test_unclassified_legacy_row_is_preserved_and_blocks_ambiguous_replay(self):
        with closing(sqlite3.connect(str(self.path))) as db:
            db.execute('INSERT INTO outbreak_tracking(date,district,disease,count) VALUES(?,?,?,?)', ('2026-11-03', 'Colombo', 'Dengue', 8))
            db.commit()
        before = self.rows()
        response = self.send()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json, {'error': 'TRACKING_PROVENANCE_UNVERIFIED'})
        self.assertEqual(self.rows(), before)

    def test_duplicate_existing_keys_are_not_merged_deleted_or_updated(self):
        self.send()
        with closing(sqlite3.connect(str(self.path))) as db:
            db.execute('INSERT INTO outbreak_tracking(date,district,disease,demoBatchId,count) VALUES(?,?,?,?,?)', ('2026-11-03', 'Colombo', 'Dengue', 'DEMO_OUTBREAK_2026_V1', 7))
            db.commit()
        before = self.rows()
        self.assertEqual(self.send().status_code, 503)
        self.assertEqual(self.rows(), before)

    def test_missing_batch_column_is_not_created_by_route(self):
        with closing(sqlite3.connect(str(self.path))) as db:
            db.execute('ALTER TABLE outbreak_tracking RENAME COLUMN demoBatchId TO fixture_batch')
        try:
            self.assertEqual(self.send().json, {'error': 'TRACKING_STORAGE_PREREQUISITES_UNVERIFIED'})
            with closing(sqlite3.connect(str(self.path))) as db:
                self.assertNotIn('demoBatchId', {r[1] for r in db.execute('PRAGMA table_info(outbreak_tracking)')})
        finally:
            with closing(sqlite3.connect(str(self.path))) as db:
                db.execute('ALTER TABLE outbreak_tracking RENAME COLUMN fixture_batch TO demoBatchId')

    def test_missing_batch_is_rejected_without_opening_database(self):
        body = {k: v for k, v in self.body.items() if k != 'demoBatchId'}
        with patch.object(module.sqlite3, 'connect', side_effect=AssertionError('DB_MUST_NOT_OPEN')):
            self.assertEqual(self.send(body).status_code, 400)

    def test_invalid_scalar_and_field_shapes_fail_without_writes(self):
        for changes in ({'count': True}, {'count': -1}, {'count': 1.5}, {'count': 2147483648}, {'date': '2026-02-30'}, {'demoBatchId': '../bad'}, {'district': []}, {'icd_code': {}}):
            with self.subTest(field=next(iter(changes))):
                self.assertEqual(self.send({**self.body, **changes}).status_code, 400)
        self.assertEqual(self.rows(), [])

    def test_malformed_json_and_non_object_input_are_rejected(self):
        with module.app.test_client() as client:
            for payload in ('{', '[]', 'null'):
                self.assertEqual(client.post('/ingest', data=payload, content_type='application/json', headers=self.headers).status_code, 400)

    def test_database_failure_has_fixed_sanitized_response(self):
        with patch.object(module.sqlite3, 'connect', side_effect=sqlite3.OperationalError('PRIVATE_DATABASE_FIXTURE')):
            response = self.send()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json, {'error': 'TRACKING_STORAGE_UNAVAILABLE'})

    def test_connection_is_closed_after_success_and_failure(self):
        original = sqlite3.connect
        captured = []
        def connect(*args, **kwargs):
            db = original(*args, **kwargs)
            captured.append(db)
            return db
        with patch.object(module.sqlite3, 'connect', side_effect=connect):
            self.assertEqual(self.send().status_code, 201)
        with closing(original(str(self.path))) as db:
            db.execute('INSERT INTO outbreak_tracking(date,district,disease,demoBatchId,count) VALUES(?,?,?,?,?)', ('2026-11-03', 'Colombo', 'Dengue', 'DEMO_OUTBREAK_2026_V1', 7))
            db.commit()
        with patch.object(module.sqlite3, 'connect', side_effect=connect):
            self.assertEqual(self.send().status_code, 503)
        for db in captured:
            with self.assertRaises(sqlite3.ProgrammingError):
                db.execute('SELECT 1')
