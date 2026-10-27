"""Actual local Flask inference, not HTTP mocks or clinical accuracy validation."""
import os
import unittest
import hmac
import hashlib
from datetime import datetime, timezone

if not os.environ.get('MEDISYNC_ML_DB_PATH'):
    raise RuntimeError('Set MEDISYNC_ML_DB_PATH to an isolated QA SQLite file')
from app import app, SKLEARN_AVAILABLE, symptom_data, calculate_outbreak_metrics


class RuntimeInference(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        secret = os.environ['INTERNAL_API_KEY']
        hour = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H')
        self.headers = {'x-internal-key': hmac.new(secret.encode(), hour.encode(), hashlib.sha256).hexdigest()}

    def test_actual_tfidf_inference(self):
        self.assertTrue(SKLEARN_AVAILABLE, 'Fallback overlap scoring is not a TF-IDF test')
        self.assertEqual(len(symptom_data), 41)
        response = self.client.post('/api/ml/predict-disease', headers=self.headers,
                                    json={'symptoms': ['high fever', 'headache', 'joint pain']})
        self.assertEqual(response.status_code, 200)
        predictions = response.get_json()['predictions']
        self.assertGreater(len(predictions), 0)
        self.assertLessEqual(len(predictions), 5)

    def test_auth_is_required(self):
        self.assertEqual(self.client.post('/api/ml/predict-disease', json={'symptoms':['fever']}).status_code,403)

    def test_normalized_icd_keeps_existing_risk_rules(self):
        for code, name in [('ICD10:A90','Dengue'),('ICD10:J00','Common Cold')]:
            self.assertEqual(calculate_outbreak_metrics(15,5,disease=code),calculate_outbreak_metrics(15,5,disease=name))

    def test_empty_symptoms(self):
        response=self.client.post('/api/ml/predict-disease',headers=self.headers,json={'symptoms':[]})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.get_json()['predictions'],[])

    def test_actual_aggregate_endpoint(self):
        response=self.client.post('/api/admin/outbreak/trigger',headers=self.headers,json=[
            {'district':'Colombo','disease':'Dengue','last_7_days_count':15,'previous_baseline_avg':5}])
        self.assertEqual(response.status_code,200)
        self.assertTrue(response.get_json()['results'][0]['anomaly'])

if __name__ == '__main__':
    unittest.main()
