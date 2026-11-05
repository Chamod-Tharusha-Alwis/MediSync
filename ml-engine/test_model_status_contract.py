"""Actual authenticated status route against this profile's fresh, empty SQLite."""
import hashlib
import hmac
import json
import os
import pathlib
import sqlite3
import unittest
from contextlib import closing
from datetime import datetime, timezone
from unittest.mock import patch
import app as module


class TestEmptyDatabaseModelStatus(unittest.TestCase):
    def headers(self):
        hour = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H')
        token = hmac.new(os.environ['INTERNAL_API_KEY'].encode(), hour.encode(), hashlib.sha256).hexdigest()
        return {'x-internal-key': token}

    def test_a_actual_reply_from_fresh_empty_sqlite(self):
        out = pathlib.Path(os.environ['MEDISYNC_OFFLINE_EVIDENCE']).resolve()
        self.assertEqual(pathlib.Path(module.db_path).resolve(), out / 'owned_ml_test.db')
        def counts():
            with closing(sqlite3.connect(module.db_path)) as db:
                return {table: db.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0]
                        for table in ('outbreak_tracking', 'outbreak_feedback')}
        before = counts()
        self.assertEqual(before, {'outbreak_tracking': 0, 'outbreak_feedback': 0})
        with patch.object(module.sqlite3, 'connect', side_effect=AssertionError('STATUS_ROUTE_MUST_NOT_ACCESS_SQLITE')) as connect:
            with module.app.test_client() as client:
                response = client.get('/model-status', headers=self.headers())
            self.assertEqual(response.status_code, 200)
            connect.assert_not_called()
        self.assertEqual(counts(), before)
        with (out / 'model-status-empty-input.json').open('x', encoding='utf-8') as fixture:
            json.dump({'httpStatus': response.status_code, 'data': response.get_json(),
                       'emptySQLiteCounts': before, 'sqliteCallsDuringRoute': 0}, fixture)

    def test_missing_auth_remains_forbidden_without_sqlite(self):
        with patch.object(module.sqlite3, 'connect', side_effect=AssertionError('NO_SQLITE')) as connect:
            with module.app.test_client() as client:
                self.assertEqual(client.get('/model-status').status_code, 403)
            connect.assert_not_called()

    def test_wrong_auth_remains_forbidden_without_sqlite(self):
        with patch.object(module.sqlite3, 'connect', side_effect=AssertionError('NO_SQLITE')) as connect:
            with module.app.test_client() as client:
                self.assertEqual(client.get('/model-status', headers={'x-internal-key': 'inert-invalid'}).status_code, 403)
            connect.assert_not_called()

    def test_missing_shared_key_is_auth_denial_not_a_schema_success(self):
        headers = self.headers()
        with patch.dict(os.environ, {'INTERNAL_API_KEY': ''}):
            with module.app.test_client() as client:
                self.assertEqual(client.get('/model-status', headers=headers).status_code, 403)
