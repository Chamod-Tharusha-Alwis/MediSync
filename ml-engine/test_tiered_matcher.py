"""
Phase D3 Tiered Matcher V2 Tests:
- Tier 1 precedence for curated/Sri Lankan priority diseases (Dengue, Malaria, etc.)
- Tier 2 sparse KB lookup for long-tail conditions with empirical edge probabilities
- Required negative test cases (a), (b), (c)
- Edge cases (empty, garbage, conflicting)
- Peak RSS memory verification (< 200 MB)
"""
import os
import sys
import unittest
import tempfile
import hmac
import hashlib
import tracemalloc
from datetime import datetime, timezone

if not os.environ.get('MEDISYNC_ML_DB_PATH'):
    os.environ['MEDISYNC_ML_DB_PATH'] = os.path.join(tempfile.gettempdir(), 'test_ml_d3.db')
if not os.environ.get('INTERNAL_API_KEY'):
    os.environ['INTERNAL_API_KEY'] = 'dev-internal-secret-key-medisync-2026'

from app import app, SKLEARN_AVAILABLE, symptom_data, kb_disease_data


class TestTieredMatcherV2(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        secret = os.environ['INTERNAL_API_KEY']
        hour = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H')
        self.headers = {'x-internal-key': hmac.new(secret.encode(), hour.encode(), hashlib.sha256).hexdigest()}

    def test_tier_counts_and_availability(self):
        """Verify 41 Tier 1 profiles and active Tier 2 KB profiles loaded."""
        self.assertTrue(SKLEARN_AVAILABLE)
        self.assertEqual(len(symptom_data), 41)
        self.assertGreaterEqual(len(kb_disease_data), 170)

    def test_negative_case_a_multi_pain_not_typhoid(self):
        """Negative Test (a): ['back pain', 'belly pain', 'chest pain', 'abdominal pain']
        must NOT return Typhoid as urgent or top match."""
        res = self.client.post('/api/ml/predict-disease', headers=self.headers,
                               json={'symptoms': ['back pain', 'belly pain', 'chest pain', 'abdominal pain']})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        preds = data.get('predictions', [])
        self.assertGreater(len(preds), 0)
        top = preds[0]
        # Must NOT be Typhoid as top match
        self.assertNotIn('typhoid', top['disease'].lower(),
                         f"Typhoid must not be top match for multi-pain query, got {top['disease']}")
        # Any Typhoid match in list must NOT be urgent
        for p in preds:
            if 'typhoid' in p['disease'].lower():
                self.assertFalse(p.get('urgent'), "Typhoid must not be marked urgent for multi-pain without fever")

    def test_negative_case_b_wrist_ankle_pain_not_dengue_or_lepto(self):
        """Negative Test (b): ['wrist pain', 'ankle pain']
        must NOT return Dengue or Leptospirosis in top 5."""
        res = self.client.post('/api/ml/predict-disease', headers=self.headers,
                               json={'symptoms': ['wrist pain', 'ankle pain']})
        self.assertEqual(res.status_code, 200)
        preds = res.get_json().get('predictions', [])
        top_diseases = [p['disease'].lower() for p in preds[:5]]
        for dis in top_diseases:
            self.assertNotIn('dengue', dis, f"Dengue must not be in top 5 for wrist/ankle pain: {top_diseases}")
            self.assertNotIn('leptospirosis', dis, f"Leptospirosis must not be in top 5 for wrist/ankle pain: {top_diseases}")

    def test_positive_case_c_classic_dengue_tier1_wins(self):
        """Positive Test (c): Classic dengue presentation must return Dengue from Tier 1."""
        queries = [
            ['fever', 'headache', 'joint pain', 'skin rash'],
            ['chills', 'high fever', 'headache', 'muscle pain', 'back pain']
        ]
        for q in queries:
            res = self.client.post('/api/ml/predict-disease', headers=self.headers, json={'symptoms': q})
            self.assertEqual(res.status_code, 200)
            preds = res.get_json().get('predictions', [])
            self.assertGreater(len(preds), 0)
            top = preds[0]
            self.assertEqual(top['disease'].lower(), 'dengue')
            self.assertEqual(top['icd_code'], 'A90')
            self.assertEqual(top.get('source'), 'curated')
            self.assertGreaterEqual(top['confidence'], 40.0)

    def test_tier2_long_tail_lookup(self):
        """Verify non-Tier 1 diseases match via Tier 2 KB with correct provenance."""
        # Carpal tunnel syndrome is not in the 41 Tier 1 diseases
        res = self.client.post('/api/ml/predict-disease', headers=self.headers,
                               json={'symptoms': ['numbness in hand', 'wrist pain', 'hand tingling']})
        self.assertEqual(res.status_code, 200)
        preds = res.get_json().get('predictions', [])
        self.assertGreater(len(preds), 0)
        top = preds[0]
        self.assertIn('carpal tunnel', top['disease'].lower())
        self.assertEqual(top['icd_code'], 'G56.00')
        self.assertEqual(top.get('source'), 'knowledge_base')
        self.assertEqual(top.get('clinicalValidation'), 'not_established')

    def test_graceful_degradation_empty_and_garbage(self):
        """Empty or garbage inputs must degrade gracefully without 500 error."""
        cases = [
            {'symptoms': []},
            {'symptoms': ''},
            {'symptoms': ['zyxwvutsrqp999', 'nonexistentmedicalterm888']}
        ]
        for payload in cases:
            res = self.client.post('/api/ml/predict-disease', headers=self.headers, json=payload)
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertIn('predictions', data)
            self.assertEqual(data.get('clinicalValidation'), 'not_established')

    def test_peak_memory_under_ceiling(self):
        """Verify ML engine peak memory usage stays well under the 200 MB target."""
        tracemalloc.start()
        # Exercise multiple tiered predictions
        queries = [
            ['fever', 'headache', 'joint pain'],
            ['wrist pain', 'ankle pain'],
            ['back pain', 'leg pain', 'numbness'],
            ['sharp chest pain', 'shortness of breath']
        ]
        for q in queries:
            self.client.post('/api/ml/predict-disease', headers=self.headers, json={'symptoms': q})
        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        peak_mb = peak / (1024 * 1024)
        print(f"\n[D3 Benchmark] Peak traced memory during tiered inference: {peak_mb:.2f} MB")
        self.assertLess(peak_mb, 50.0, f"Inference memory exceeded expected ceiling: {peak_mb:.2f} MB")


if __name__ == '__main__':
    unittest.main()
