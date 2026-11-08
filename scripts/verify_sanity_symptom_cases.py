#!/usr/bin/env python3
"""
Verify 15 additional clinical symptom combinations against the MediSync ML Engine.
Validates output shape, response contract (clinicalValidation: not_established),
checks for non-crashing behavior, and outputs detailed results for ML_DESIGN_PARAMETERS.md.
"""

import os
import sys
import json
import hmac
import hashlib
from datetime import datetime, timezone
from pathlib import Path

repo_root = Path(__file__).resolve().parent.parent
ml_engine_dir = repo_root / "ml-engine"
sys.path.insert(0, str(ml_engine_dir))

if not os.environ.get('INTERNAL_API_KEY'):
    os.environ['INTERNAL_API_KEY'] = 'dev-internal-secret-key-medisync-2026'

from app import app

client = app.test_client()
secret = os.environ['INTERNAL_API_KEY']
hour = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H')
token = hmac.new(secret.encode(), hour.encode(), hashlib.sha256).hexdigest()
headers = {'x-internal-key': token}

test_cases = [
    {
        "id": "SC-01",
        "description": "Upper respiratory presentation with anosmia",
        "symptoms": ["dry cough", "fatigue", "loss of taste"]
    },
    {
        "id": "SC-02",
        "description": "Gastroesophageal reflux clinical presentation",
        "symptoms": ["heartburn", "acid reflux", "chest tightness"]
    },
    {
        "id": "SC-03",
        "description": "Dependent edema with exertional breathlessness",
        "symptoms": ["swollen ankles", "weight gain", "shortness of breath on exertion"]
    },
    {
        "id": "SC-04",
        "description": "Allergic rhinoconjunctivitis presentation",
        "symptoms": ["sneezing", "itchy eyes", "watery eyes", "clear rhinorrhea"]
    },
    {
        "id": "SC-05",
        "description": "Resting tremor and extrapyramidal signs",
        "symptoms": ["tremor", "bradykinesia", "muscle rigidity"]
    },
    {
        "id": "SC-06",
        "description": "Podagra / acute monoarthritis presentation",
        "symptoms": ["pain in big toe", "joint redness", "swelling in toe"]
    },
    {
        "id": "SC-07",
        "description": "Otitis media clinical presentation",
        "symptoms": ["ear pain", "impaired hearing", "fluid draining from ear"]
    },
    {
        "id": "SC-08",
        "description": "Endocrine polyuria/polydipsia triad",
        "symptoms": ["frequent urination", "excessive thirst", "unexplained weight loss"]
    },
    {
        "id": "SC-09",
        "description": "Meningism / intracranial acute headache",
        "symptoms": ["sudden severe headache", "stiff neck", "photophobia"]
    },
    {
        "id": "SC-10",
        "description": "Autoimmune malar rash presentation",
        "symptoms": ["skin rash on face", "malar butterfly rash", "joint stiffness"]
    },
    {
        "id": "SC-11",
        "description": "Irritable bowel functional triad",
        "symptoms": ["abdominal bloating", "cramping", "alternating constipation and diarrhea"]
    },
    {
        "id": "SC-12",
        "description": "B-symptom constitutional lymphadenopathy query",
        "symptoms": ["intermittent fever", "night sweats", "swollen lymph nodes in neck"]
    },
    {
        "id": "SC-13",
        "description": "Laryngeal hoarseness and dysphagia",
        "symptoms": ["hoarseness of voice", "chronic dry cough", "difficulty swallowing"]
    },
    {
        "id": "SC-14",
        "description": "Postprandial retrosternal burning",
        "symptoms": ["burning sensation in chest after eating", "sour taste in mouth"]
    },
    {
        "id": "SC-15",
        "description": "Inflammatory axial back stiffness presentation",
        "symptoms": ["lower back stiffness in morning", "hip stiffness improving with exercise"]
    }
]

results = []
all_passed = True

for case in test_cases:
    res = client.post('/api/ml/predict-disease', headers=headers, json={'symptoms': case['symptoms']})
    if res.status_code != 200:
        all_passed = False
        print(f"FAILED {case['id']}: status code {res.status_code}")
        continue
    data = res.get_json()
    preds = data.get('predictions', [])
    disclaimer = data.get('clinicalValidation')
    
    # Contract assertions
    has_disclaimer = (disclaimer == "not_established")
    valid_shape = isinstance(preds, list)
    if preds:
        top = preds[0]
        top_disease = top.get('disease')
        top_confidence = top.get('confidence')
        top_source = top.get('source', 'curated')
        top_urgent = top.get('urgent', False)
    else:
        top_disease = "No confident prediction"
        top_confidence = 0.0
        top_source = "none"
        top_urgent = False

    passed = has_disclaimer and valid_shape
    if not passed:
        all_passed = False

    results.append({
        "id": case["id"],
        "description": case["description"],
        "inputSymptoms": case["symptoms"],
        "httpStatus": res.status_code,
        "disclaimerVerified": has_disclaimer,
        "validShape": valid_shape,
        "predictionCount": len(preds),
        "topDisease": top_disease,
        "topConfidence": top_confidence,
        "topSource": top_source,
        "topUrgent": top_urgent,
        "status": "PASS" if passed else "FAIL"
    })

print(f"Executed {len(results)} sanity queries. All contracts passed: {all_passed}")

output_json = repo_root / "docs" / "report" / "data" / "sanity_symptom_results.json"
output_json.parent.mkdir(parents=True, exist_ok=True)
with open(output_json, "w", encoding="utf-8") as f:
    json.dump({"testCases": results, "allPassed": all_passed}, f, indent=2)

print(f"Results saved to: {output_json}")
